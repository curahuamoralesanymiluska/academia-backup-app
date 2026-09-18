require('dotenv').config({ path: '.env' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function seed() {
  console.log('Iniciando poblamiento de la base de datos...');
  const client = await pool.connect();
  try {
    // Limpiar
    await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    
    // Crear tablas
    await client.query(`
      CREATE TABLE IF NOT EXISTS Alumnos (
        id_alumno SERIAL PRIMARY KEY, codigo VARCHAR(20) UNIQUE NOT NULL, nombre VARCHAR(100) NOT NULL, apellido VARCHAR(100) NOT NULL, dni VARCHAR(20) UNIQUE NOT NULL, email VARCHAR(100), carrera VARCHAR(100), ciclo VARCHAR(20), estado VARCHAR(20), fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS Docentes (
        id_docente SERIAL PRIMARY KEY, nombre VARCHAR(100) NOT NULL, apellido VARCHAR(100) NOT NULL, especialidad VARCHAR(100), email VARCHAR(100)
      );
      CREATE TABLE IF NOT EXISTS Cursos (
        id_curso SERIAL PRIMARY KEY, codigo VARCHAR(20) UNIQUE NOT NULL, nombre VARCHAR(100) NOT NULL, creditos INT, horas_semanales INT, id_docente INT REFERENCES Docentes(id_docente) ON DELETE SET NULL
      );
      CREATE TABLE IF NOT EXISTS Matriculas (
        id_matricula SERIAL PRIMARY KEY, id_alumno INT REFERENCES Alumnos(id_alumno) ON DELETE CASCADE, id_curso INT REFERENCES Cursos(id_curso) ON DELETE CASCADE, periodo VARCHAR(20), nota1 DECIMAL(5,2), nota2 DECIMAL(5,2), examen_final DECIMAL(5,2), promedio DECIMAL(5,2), estado VARCHAR(20)
      );
    `);

    // Insertar Docentes
    const d1 = await client.query(`INSERT INTO Docentes (nombre, apellido, especialidad, email) VALUES ('Carlos', 'Mendoza', 'Ingeniería de Software', 'cmendoza@uni.edu.pe') RETURNING id_docente`);
    const d2 = await client.query(`INSERT INTO Docentes (nombre, apellido, especialidad, email) VALUES ('Ana', 'Vargas', 'Base de Datos', 'avargas@uni.edu.pe') RETURNING id_docente`);
    const d3 = await client.query(`INSERT INTO Docentes (nombre, apellido, especialidad, email) VALUES ('Luis', 'Torres', 'Redes', 'ltorres@uni.edu.pe') RETURNING id_docente`);
    
    // Insertar Cursos
    const c1 = await client.query(`INSERT INTO Cursos (codigo, nombre, creditos, horas_semanales, id_docente) VALUES ('CS-101', 'Algoritmos', 4, 6, $1) RETURNING id_curso`, [d1.rows[0].id_docente]);
    const c2 = await client.query(`INSERT INTO Cursos (codigo, nombre, creditos, horas_semanales, id_docente) VALUES ('CS-201', 'Bases de Datos Avanzadas', 4, 5, $1) RETURNING id_curso`, [d2.rows[0].id_docente]);
    const c3 = await client.query(`INSERT INTO Cursos (codigo, nombre, creditos, horas_semanales, id_docente) VALUES ('CS-301', 'Redes y Comunicaciones', 3, 4, $1) RETURNING id_curso`, [d3.rows[0].id_docente]);

    // Insertar Alumnos
    const alumnos = [
      ['ALU-001', 'Javier', 'Silva', '71234567', 'jsilva@uni.edu.pe', 'Ingeniería de Sistemas', 'VI', 'Activo'],
      ['ALU-002', 'Maria', 'Gomez', '71234568', 'mgomez@uni.edu.pe', 'Ingeniería de Software', 'VI', 'Activo'],
      ['ALU-003', 'Pedro', 'Paulet', '71234569', 'ppaulet@uni.edu.pe', 'Ciencias de la Computación', 'VII', 'Activo'],
      ['ALU-004', 'Lucia', 'Fernandez', '71234570', 'lfernandez@uni.edu.pe', 'Ingeniería de Sistemas', 'V', 'Inactivo'],
      ['ALU-005', 'Diego', 'Marcos', '71234571', 'dmarcos@uni.edu.pe', 'Ingeniería de Software', 'VIII', 'Activo']
    ];

    const alIds = [];
    for (const a of alumnos) {
      const res = await client.query(`INSERT INTO Alumnos (codigo, nombre, apellido, dni, email, carrera, ciclo, estado) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id_alumno`, a);
      alIds.push(res.rows[0].id_alumno);
    }

    // Insertar Matriculas
    await client.query(`INSERT INTO Matriculas (id_alumno, id_curso, periodo, nota1, nota2, examen_final, promedio, estado) VALUES ($1, $2, '2026-I', 14, 15, 16, 15, 'Aprobado')`, [alIds[0], c1.rows[0].id_curso]);
    await client.query(`INSERT INTO Matriculas (id_alumno, id_curso, periodo, nota1, nota2, examen_final, promedio, estado) VALUES ($1, $2, '2026-I', 12, 11, 10, 11, 'Desaprobado')`, [alIds[1], c2.rows[0].id_curso]);
    await client.query(`INSERT INTO Matriculas (id_alumno, id_curso, periodo, estado) VALUES ($1, $2, '2026-II', 'Matriculado')`, [alIds[2], c3.rows[0].id_curso]);
    await client.query(`INSERT INTO Matriculas (id_alumno, id_curso, periodo, estado) VALUES ($1, $2, '2026-II', 'Matriculado')`, [alIds[0], c2.rows[0].id_curso]);

    console.log('✅ Base de datos poblada exitosamente con Docentes, Cursos, Alumnos y Matrículas.');
  } catch (err) {
    console.error('Error poblando BD:', err);
  } finally {
    client.release();
    process.exit(0);
  }
}

seed();
