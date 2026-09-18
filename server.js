require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const https = require('https');
const cloudinary = require('cloudinary').v2;
const cron = require('node-cron');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configuración de Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'ed9la89p',
  api_key: process.env.CLOUDINARY_API_KEY || '865795455727769',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'p7HVXILcLhf8-bxFpE5WEoL7VcY'
});

// Configuración de PostgreSQL (Neon)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Requerido para Neon
});

const BACKUP_DIR = path.join(__dirname, 'backups');
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);

// Helper para ejecutar queries en Postgres
async function runQuery(text, params = []) {
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return res.rows;
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────
// 0. INICIALIZACIÓN DE BASE DE DATOS
// ─────────────────────────────────────────────────────────────
async function initDB() {
  const initSql = `
    CREATE TABLE IF NOT EXISTS Alumnos (
      id_alumno SERIAL PRIMARY KEY,
      codigo VARCHAR(20) UNIQUE NOT NULL,
      nombre VARCHAR(100) NOT NULL,
      apellido VARCHAR(100) NOT NULL,
      dni VARCHAR(20) UNIQUE NOT NULL,
      email VARCHAR(100),
      carrera VARCHAR(100),
      ciclo VARCHAR(20),
      estado VARCHAR(20),
      fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS Docentes (
      id_docente SERIAL PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL,
      apellido VARCHAR(100) NOT NULL,
      especialidad VARCHAR(100),
      email VARCHAR(100)
    );
    CREATE TABLE IF NOT EXISTS Cursos (
      id_curso SERIAL PRIMARY KEY,
      codigo VARCHAR(20) UNIQUE NOT NULL,
      nombre VARCHAR(100) NOT NULL,
      creditos INT,
      horas_semanales INT,
      id_docente INT REFERENCES Docentes(id_docente) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS Matriculas (
      id_matricula SERIAL PRIMARY KEY,
      id_alumno INT REFERENCES Alumnos(id_alumno) ON DELETE CASCADE,
      id_curso INT REFERENCES Cursos(id_curso) ON DELETE CASCADE,
      periodo VARCHAR(20),
      nota1 DECIMAL(5,2),
      nota2 DECIMAL(5,2),
      examen_final DECIMAL(5,2),
      promedio DECIMAL(5,2),
      estado VARCHAR(20)
    );
  `;
  await runQuery(initSql);
}

// ─────────────────────────────────────────────────────────────
// 1. ESTADO GENERAL
// ─────────────────────────────────────────────────────────────
app.get('/api/status', async (req, res) => {
  try {
    let online = false;
    let counts = { alumnos: 0, cursos: 0, docentes: 0, matriculas: 0 };
    
    try {
      const dbCheck = await runQuery("SELECT current_database() as name");
      if (dbCheck.length > 0) {
        online = true;
        const countQuery = await runQuery(`
          SELECT 
            (SELECT COUNT(*) FROM Alumnos) as alumnos,
            (SELECT COUNT(*) FROM Cursos) as cursos,
            (SELECT COUNT(*) FROM Docentes) as docentes,
            (SELECT COUNT(*) FROM Matriculas) as matriculas
        `);
        counts = {
          alumnos: parseInt(countQuery[0].alumnos),
          cursos: parseInt(countQuery[0].cursos),
          docentes: parseInt(countQuery[0].docentes),
          matriculas: parseInt(countQuery[0].matriculas)
        };
      }
    } catch (e) {
      online = false;
    }

    const backupFile = path.join(BACKUP_DIR, 'BD_Academica_backup.json');
    let backupFileStats = null;
    if (fs.existsSync(backupFile)) {
      const st = fs.statSync(backupFile);
      backupFileStats = {
        existe: true,
        nombre: 'BD_Academica_backup.json',
        tamaño: (st.size / 1024 / 1024).toFixed(2) + ' MB',
        fechaModificacion: st.mtime.toISOString()
      };
    } else {
      backupFileStats = { existe: false, nombre: 'BD_Academica_backup.json' };
    }

    // Simulamos jobs para mantener compatibilidad con el front
    const jobs = [
      { nombre: 'BackupDiario', habilitado: true, ultimoEstado: 'Exitoso', frecuencia: 'node-cron (1 hora)' },
      { nombre: 'AutoRestaurarBD_Academica', habilitado: true, ultimoEstado: 'Exitoso', frecuencia: 'Monitor Web' }
    ];

    res.json({
      online,
      database: { name: 'Neon Postgres', estado: online ? 'ONLINE' : 'OFFLINE', modeloRecuperacion: 'Cloud Native' },
      counts,
      jobs,
      backupFile: backupFileStats,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// 2. ENDPOINTS ACADÉMICOS
// ─────────────────────────────────────────────────────────────
app.get('/api/academic/alumnos', async (req, res) => {
  try {
    const alumnos = await runQuery(`SELECT *, TO_CHAR(fecha_registro, 'YYYY-MM-DD HH24:MI:SS') as fecha_registro_str FROM Alumnos ORDER BY id_alumno DESC`);
    res.json({ alumnos: alumnos.map(a => ({...a, fecha_registro: a.fecha_registro_str})) });
  } catch (err) {
    res.status(500).json({ error: err.message, alumnos: [] });
  }
});

app.post('/api/academic/alumnos', async (req, res) => {
  try {
    const { nombre, apellido, dni, email, carrera, ciclo } = req.body;
    const codigo = 'ALU-' + Math.floor(100000 + Math.random() * 900000);
    const userEmail = email || `${nombre.toLowerCase().replace(/\s+/g, '')}.${apellido.toLowerCase().replace(/\s+/g, '')}@academia.edu.pe`;
    
    await runQuery(`
      INSERT INTO Alumnos (codigo, nombre, apellido, dni, email, carrera, ciclo, estado) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'Activo')
    `, [codigo, nombre, apellido, dni, userEmail, carrera, ciclo || 'VI']);
    
    res.json({ mensaje: 'Alumno registrado con éxito', codigo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/academic/alumnos/:id', async (req, res) => {
  try {
    await runQuery(`DELETE FROM Alumnos WHERE id_alumno = $1`, [parseInt(req.params.id)]);
    res.json({ mensaje: 'Alumno eliminado correctamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/academic/cursos', async (req, res) => {
  try {
    const cursos = await runQuery(`
      SELECT c.*, COALESCE(d.nombre || ' ' || d.apellido, 'Sin asignar') as docente,
             COALESCE(d.especialidad, 'N/A') as especialidad, COALESCE(d.email, '') as docente_email
      FROM Cursos c LEFT JOIN Docentes d ON c.id_docente = d.id_docente ORDER BY c.id_curso
    `);
    res.json({ cursos });
  } catch (err) {
    res.status(500).json({ error: err.message, cursos: [] });
  }
});

app.get('/api/academic/matriculas', async (req, res) => {
  try {
    const matriculas = await runQuery(`
      SELECT m.*, a.codigo as codigo_alumno, a.nombre || ' ' || a.apellido as alumno, c.nombre as curso
      FROM Matriculas m 
      INNER JOIN Alumnos a ON m.id_alumno = a.id_alumno 
      INNER JOIN Cursos c ON m.id_curso = c.id_curso ORDER BY m.id_matricula DESC
    `);
    res.json({ matriculas });
  } catch (err) {
    res.status(500).json({ error: err.message, matriculas: [] });
  }
});

// ─────────────────────────────────────────────────────────────
// 3. BACKUPS EN LA NUBE (JSON EXPORT/IMPORT)
// ─────────────────────────────────────────────────────────────
async function generateJSONBackup() {
  const alumnos = await runQuery('SELECT * FROM Alumnos');
  const docentes = await runQuery('SELECT * FROM Docentes');
  const cursos = await runQuery('SELECT * FROM Cursos');
  const matriculas = await runQuery('SELECT * FROM Matriculas');
  
  const backupData = { alumnos, docentes, cursos, matriculas };
  const backupFile = path.join(BACKUP_DIR, 'BD_Academica_backup.json');
  fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
  return backupFile;
}

async function uploadToCloudinary(filePath) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const result = await cloudinary.uploader.upload(filePath, {
    resource_type: 'raw',
    folder: 'backups_pg',
    public_id: `backup_pg_${timestamp}.json`
  });
  return result;
}

async function runCloudBackup() {
  const file = await generateJSONBackup();
  await uploadToCloudinary(file);
}

// Cron jobs
cron.schedule('*/5 * * * *', () => {
  runCloudBackup().catch(console.error);
});
cron.schedule('0 * * * *', () => {
  runCloudBackup().catch(console.error);
});
cron.schedule('0 6 * * *', () => {
  runCloudBackup().catch(console.error);
});

app.post('/api/backup/run', async (req, res) => {
  try {
    await runCloudBackup();
    res.json({ mensaje: 'Backup JSON generado y subido a Cloudinary exitosamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/backups/cloud', async (req, res) => {
  try {
    const result = await cloudinary.search
      .expression('folder:backups_pg')
      .sort_by('created_at', 'desc')
      .execute();
    
    const backups = result.resources.map(r => ({
      nombre: r.filename,
      url: r.secure_url,
      tamaño: (r.bytes / 1024 / 1024).toFixed(2) + ' MB',
      fechaCreacion: r.created_at
    }));
    res.json({ backups, total: backups.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// 4. DESASTRE Y RECUPERACIÓN
// ─────────────────────────────────────────────────────────────
app.post('/api/disaster/drop-db', async (req, res) => {
  try {
    // Simulamos la caída eliminando las tablas
    await runQuery(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`);
    res.json({ mensaje: 'Esquema eliminado (Simulación de caída de base de datos).' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/disaster/restore-cloud', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL requerida' });

  const tempFile = path.join(BACKUP_DIR, 'temp_restore.json');
  const file = fs.createWriteStream(tempFile);

  https.get(url, (response) => {
    response.pipe(file);
    file.on('finish', async () => {
      file.close();
      try {
        const data = JSON.parse(fs.readFileSync(tempFile, 'utf8'));
        
        // Limpiamos e inicializamos tablas
        await runQuery(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`);
        await initDB();

        // Insertar datos
        if (data.alumnos) {
          for (let a of data.alumnos) {
            await runQuery(`INSERT INTO Alumnos (id_alumno, codigo, nombre, apellido, dni, email, carrera, ciclo, estado, fecha_registro) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`, 
            [a.id_alumno, a.codigo, a.nombre, a.apellido, a.dni, a.email, a.carrera, a.ciclo, a.estado, a.fecha_registro]);
          }
        }
        if (data.docentes) {
          for (let d of data.docentes) {
            await runQuery(`INSERT INTO Docentes (id_docente, nombre, apellido, especialidad, email) VALUES ($1, $2, $3, $4, $5)`, 
            [d.id_docente, d.nombre, d.apellido, d.especialidad, d.email]);
          }
        }
        if (data.cursos) {
          for (let c of data.cursos) {
            await runQuery(`INSERT INTO Cursos (id_curso, codigo, nombre, creditos, horas_semanales, id_docente) VALUES ($1, $2, $3, $4, $5, $6)`, 
            [c.id_curso, c.codigo, c.nombre, c.creditos, c.horas_semanales, c.id_docente]);
          }
        }
        if (data.matriculas) {
          for (let m of data.matriculas) {
            await runQuery(`INSERT INTO Matriculas (id_matricula, id_alumno, id_curso, periodo, nota1, nota2, examen_final, promedio, estado) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, 
            [m.id_matricula, m.id_alumno, m.id_curso, m.periodo, m.nota1, m.nota2, m.examen_final, m.promedio, m.estado]);
          }
        }
        
        // Ajustar secuencias seriales
        await runQuery(`SELECT setval('alumnos_id_alumno_seq', (SELECT MAX(id_alumno) FROM Alumnos))`);
        await runQuery(`SELECT setval('docentes_id_docente_seq', (SELECT MAX(id_docente) FROM Docentes))`);
        await runQuery(`SELECT setval('cursos_id_curso_seq', (SELECT MAX(id_curso) FROM Cursos))`);
        await runQuery(`SELECT setval('matriculas_id_matricula_seq', (SELECT MAX(id_matricula) FROM Matriculas))`);

        res.json({ mensaje: 'Base de datos restaurada exitosamente desde Cloudinary.' });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });
  });
});

app.post('/api/academic/reset-data', async (req, res) => {
  try {
    await runQuery(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`);
    await initDB();
    // Poblar con datos demo
    const docQuery = `INSERT INTO Docentes (nombre, apellido, especialidad, email) VALUES ('Juan', 'Perez', 'Sistemas', 'jperez@edu.pe') RETURNING id_docente`;
    const resDoc = await runQuery(docQuery);
    const idDoc = resDoc[0].id_docente;

    const aluQuery = `INSERT INTO Alumnos (codigo, nombre, apellido, dni, carrera, ciclo, estado) VALUES ('ALU-123456', 'Maria', 'Gomez', '12345678', 'Ing. Sistemas', 'VI', 'Activo') RETURNING id_alumno`;
    const resAlu = await runQuery(aluQuery);
    const idAlu = resAlu[0].id_alumno;

    const curQuery = `INSERT INTO Cursos (codigo, nombre, creditos, horas_semanales, id_docente) VALUES ('CUR-001', 'Base de Datos', 4, 6, $1) RETURNING id_curso`;
    const resCur = await runQuery(curQuery, [idDoc]);
    const idCur = resCur[0].id_curso;

    await runQuery(`INSERT INTO Matriculas (id_alumno, id_curso, periodo, estado) VALUES ($1, $2, '2026-I', 'Matriculado')`, [idAlu, idCur]);

    await runCloudBackup();
    res.json({ mensaje: 'Datos demo generados e insertados en Neon.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fallbacks de historial
app.get('/api/history', (req, res) => {
  res.json({ historial: [] });
});

// ─────────────────────────────────────────────────────────────
// 5. AUTO-RESTAURADOR DAEMON
// ─────────────────────────────────────────────────────────────
setInterval(async () => {
  try {
    const res = await runQuery(`SELECT count(*) as total FROM information_schema.tables WHERE table_schema='public' AND table_name='alumnos'`);
    if (parseInt(res[0].total) === 0) {
      console.log('Detectada caída de BD. Iniciando auto-restauración desde Cloudinary...');
      // Buscar ultimo backup
      const result = await cloudinary.search.expression('folder:backups_pg').sort_by('created_at', 'desc').max_results(1).execute();
      if (result.resources && result.resources.length > 0) {
        const url = result.resources[0].secure_url;
        const tempFile = path.join(BACKUP_DIR, 'temp_autorestore.json');
        const file = fs.createWriteStream(tempFile);
        https.get(url, (response) => {
          response.pipe(file);
          file.on('finish', async () => {
            file.close();
            const data = JSON.parse(fs.readFileSync(tempFile, 'utf8'));
            await initDB();
            if (data.alumnos) {
              for (let a of data.alumnos) {
                await runQuery(`INSERT INTO Alumnos (id_alumno, codigo, nombre, apellido, dni, email, carrera, ciclo, estado, fecha_registro) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`, [a.id_alumno, a.codigo, a.nombre, a.apellido, a.dni, a.email, a.carrera, a.ciclo, a.estado, a.fecha_registro]);
              }
            }
            if (data.docentes) {
              for (let d of data.docentes) {
                await runQuery(`INSERT INTO Docentes (id_docente, nombre, apellido, especialidad, email) VALUES ($1, $2, $3, $4, $5)`, [d.id_docente, d.nombre, d.apellido, d.especialidad, d.email]);
              }
            }
            if (data.cursos) {
              for (let c of data.cursos) {
                await runQuery(`INSERT INTO Cursos (id_curso, codigo, nombre, creditos, horas_semanales, id_docente) VALUES ($1, $2, $3, $4, $5, $6)`, [c.id_curso, c.codigo, c.nombre, c.creditos, c.horas_semanales, c.id_docente]);
              }
            }
            if (data.matriculas) {
              for (let m of data.matriculas) {
                await runQuery(`INSERT INTO Matriculas (id_matricula, id_alumno, id_curso, periodo, nota1, nota2, examen_final, promedio, estado) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [m.id_matricula, m.id_alumno, m.id_curso, m.periodo, m.nota1, m.nota2, m.examen_final, m.promedio, m.estado]);
              }
            }
            await runQuery(`SELECT setval('alumnos_id_alumno_seq', COALESCE((SELECT MAX(id_alumno) FROM Alumnos), 1))`);
            await runQuery(`SELECT setval('docentes_id_docente_seq', COALESCE((SELECT MAX(id_docente) FROM Docentes), 1))`);
            await runQuery(`SELECT setval('cursos_id_curso_seq', COALESCE((SELECT MAX(id_curso) FROM Cursos), 1))`);
            await runQuery(`SELECT setval('matriculas_id_matricula_seq', COALESCE((SELECT MAX(id_matricula) FROM Matriculas), 1))`);
            console.log('Auto-restauración completada con éxito.');
          });
        });
      }
    }
  } catch (e) {
    // Ignorar si aún no hay conexión
  }
}, 10000);

// Inicializar e Iniciar servidor
const PORT = process.env.PORT || 3000;
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Servidor iniciado en puerto ${PORT}`);
  });
}).catch(err => {
  console.error("Error al conectar con Neon DB:", err);
  app.listen(PORT, () => {
    console.log(`Servidor iniciado (Sin DB activa) en puerto ${PORT}`);
  });
});
