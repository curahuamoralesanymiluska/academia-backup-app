const API = '/api';

let state = {
  dbOnline: true,
  alumnos: [],
  cursos: [],
  matriculas: [],
  currentTab: 'alumnos',
  isRestoring: false
};

// ── RELOJ EN TIEMPO REAL ──
function updateClock() {
  const now = new Date();
  const el = document.getElementById('live-clock');
  if (el) el.textContent = now.toLocaleTimeString('es-PE', { hour12: false });
}
setInterval(updateClock, 1000);
updateClock();

// ── TERMINAL / CONSOLA ──
function addLog(message, type = 'info') {
  const container = document.getElementById('terminal-logs');
  if (!container) return;
  const time = new Date().toLocaleTimeString('es-PE', { hour12: false });
  const div = document.createElement('div');
  div.className = `log-entry log-entry--${type}`;
  div.textContent = `[${time}] ${message}`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function clearLogs() {
  const container = document.getElementById('terminal-logs');
  if (container) {
    container.innerHTML = '<div class="log-entry log-entry--info">[Sistema] Consola limpiada por el usuario.</div>';
  }
}

// ── TOAST NOTIFICATIONS ──
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast toast--${type} show`;
  setTimeout(() => {
    toast.className = 'toast';
  }, 3500);
}

// ── CAMBIO DE PESTAÑAS ──
function switchTab(tabId) {
  state.currentTab = tabId;
  document.querySelectorAll('.tab-btn').forEach((btn, index) => {
    const tabs = ['alumnos', 'cursos', 'matriculas', 'jobs'];
    if (tabs[index] === tabId) {
      btn.classList.add('tab-btn--active');
    } else {
      btn.classList.remove('tab-btn--active');
    }
  });

  document.querySelectorAll('.tab-content').forEach(content => {
    if (content.id === `tab-${tabId}`) {
      content.classList.add('tab-content--active');
    } else {
      content.classList.remove('tab-content--active');
    }
  });

  if (tabId === 'cursos') loadCursos();
  if (tabId === 'matriculas') loadMatriculas();
  if (tabId === 'jobs') loadHistory();
}

// ── 1. ESTADO DE LA BASE DE DATOS Y JOBS ──
async function loadStatus() {
  try {
    const res = await fetch(`${API}/status`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const pill = document.getElementById('global-status-pill');
    const pillText = document.getElementById('global-status-text');
    const alertBox = document.getElementById('recovery-alert');
    const cardDbBadge = document.getElementById('card-db-badge');
    const cardDbStatus = document.getElementById('card-db-status');
    const cardDbName = document.getElementById('card-db-name');

    state.dbOnline = data.online;

    if (data.online) {
      // Base de datos Online
      pill.className = 'status-pill status-pill--online';
      pillText.textContent = 'BD_Academica ONLINE';
      alertBox.style.display = 'none';

      cardDbBadge.className = 'metric-badge metric-badge--success';
      cardDbBadge.textContent = 'ONLINE';
      cardDbName.textContent = data.database?.name || 'BD_Academica';
      cardDbStatus.textContent = `Estado: ${data.database?.estado} · ${data.database?.modeloRecuperacion}`;

      // Métricas de conteo
      document.getElementById('count-alumnos').textContent = data.counts.alumnos;
      document.getElementById('tab-count-alumnos').textContent = data.counts.alumnos;
      document.getElementById('count-cursos').textContent = `${data.counts.cursos} / ${data.counts.docentes}`;

      if (state.isRestoring) {
        state.isRestoring = false;
        addLog(' ¡Base de datos BD_Academica RECUPERADA EXITOSAMENTE con todos los datos intactos!', 'success');
        showToast(' Base de datos recuperada y en línea', 'success');
        loadAllData();
      }
    } else {
      // Base de datos Eliminada
      pill.className = 'status-pill status-pill--offline';
      pillText.textContent = '¡BD_Academica ELIMINADA!';
      alertBox.style.display = 'flex';

      cardDbBadge.className = 'metric-badge metric-badge--danger';
      cardDbBadge.textContent = 'OFFLINE / DROP';
      cardDbName.textContent = 'BD_Academica (Eliminada)';
      cardDbStatus.textContent = 'Esperando Auto-Restauración...';

      document.getElementById('count-alumnos').textContent = '0';
      document.getElementById('tab-count-alumnos').textContent = '0';
      document.getElementById('count-cursos').textContent = '0 / 0';

      state.isRestoring = true;
    }

    // Información de Backup .BAK
    if (data.backupFile && data.backupFile.existe) {
      document.getElementById('card-backup-size').textContent = data.backupFile.tamaño;
      document.getElementById('card-backup-file').textContent = data.backupFile.nombre;
    }

    // Jobs
    const backupJob = data.jobs?.find(j => j.nombre === 'BackupDiario');
    const restoreJob = data.jobs?.find(j => j.nombre === 'AutoRestaurarBD_Academica');

    if (backupJob) {
      document.getElementById('job-backup-badge').textContent = backupJob.ultimoEstado;
      document.getElementById('job-backup-badge').className = backupJob.ultimoEstado === 'Exitoso' ? 'badge badge--success' : 'badge badge--error';
      document.getElementById('job-backup-info').textContent = `Frecuencia: ${backupJob.frecuencia} | Estado: ${backupJob.ultimoEstado}`;
    }

    if (restoreJob) {
      document.getElementById('job-restore-badge').textContent = restoreJob.ultimoEstado;
      document.getElementById('job-restore-badge').className = restoreJob.ultimoEstado === 'Exitoso' ? 'badge badge--success' : 'badge badge--error';
      document.getElementById('job-restore-info').textContent = `Frecuencia: ${restoreJob.frecuencia} | Estado: ${restoreJob.ultimoEstado}`;
    }

  } catch (err) {
    addLog(`Error al sincronizar estado: ${err.message}`, 'error');
  }
}

// ── 2. CARGAR ALUMNOS ──
async function loadAlumnos() {
  try {
    const res = await fetch(`${API}/academic/alumnos`);
    const data = await res.json();
    state.alumnos = data.alumnos || [];
    renderAlumnos(state.alumnos);
  } catch (err) {
    const tbody = document.getElementById('tbody-alumnos');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty-state"> Base de datos inaccesible (${err.message})</td></tr>`;
    }
  }
}

function renderAlumnos(lista) {
  const tbody = document.getElementById('tbody-alumnos');
  if (!tbody) return;

  if (lista.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state">No se encontraron estudiantes registrados.</td></tr>`;
    return;
  }

  tbody.innerHTML = lista.map(a => `
    <tr>
      <td><span class="code-badge">${a.codigo}</span></td>
      <td><strong>${a.nombre} ${a.apellido}</strong></td>
      <td>${a.dni}</td>
      <td style="color:var(--text-secondary);font-size:0.82rem;">${a.email}</td>
      <td>${a.carrera}</td>
      <td><span class="status-tag status-tag--ok">${a.ciclo}</span></td>
      <td><span class="status-tag status-tag--ok">${a.estado}</span></td>
      <td>
        <button class="btn--danger-sm" onclick="eliminarAlumno(${a.id_alumno}, '${a.nombre} ${a.apellido}')">
          Eliminar
        </button>
      </td>
    </tr>
  `).join('');
}

function filterAlumnos() {
  const query = document.getElementById('search-alumno').value.toLowerCase().trim();
  if (!query) {
    renderAlumnos(state.alumnos);
    return;
  }
  const filtrados = state.alumnos.filter(a =>
    a.nombre.toLowerCase().includes(query) ||
    a.apellido.toLowerCase().includes(query) ||
    a.codigo.toLowerCase().includes(query) ||
    a.dni.includes(query) ||
    a.carrera.toLowerCase().includes(query)
  );
  renderAlumnos(filtrados);
}

// ── 3. CARGAR CURSOS ──
async function loadCursos() {
  try {
    const res = await fetch(`${API}/academic/cursos`);
    const data = await res.json();
    state.cursos = data.cursos || [];
    const tbody = document.getElementById('tbody-cursos');
    if (!tbody) return;

    if (state.cursos.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No hay cursos registrados.</td></tr>`;
      return;
    }

    tbody.innerHTML = state.cursos.map(c => `
      <tr>
        <td><span class="code-badge">${c.codigo}</span></td>
        <td><strong>${c.curso}</strong></td>
        <td>${c.creditos} Créditos</td>
        <td>${c.horas_semanales} hrs/sem</td>
        <td><strong style="color:#a5b4fc;">${c.docente}</strong></td>
        <td>${c.especialidad}</td>
        <td style="color:var(--text-secondary);font-size:0.82rem;">${c.docente_email}</td>
      </tr>
    `).join('');
  } catch (err) {
    const tbody = document.getElementById('tbody-cursos');
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Error al cargar cursos</td></tr>`;
  }
}

// ── 4. CARGAR MATRÍCULAS ──
async function loadMatriculas() {
  try {
    const res = await fetch(`${API}/academic/matriculas`);
    const data = await res.json();
    state.matriculas = data.matriculas || [];
    const tbody = document.getElementById('tbody-matriculas');
    if (!tbody) return;

    if (state.matriculas.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty-state">No hay matrículas registradas.</td></tr>`;
      return;
    }

    tbody.innerHTML = state.matriculas.map(m => {
      const prom = parseFloat(m.promedio) || 0;
      const esAprobado = prom >= 11;
      return `
        <tr>
          <td><strong>${m.alumno}</strong> <span class="code-badge" style="font-size:0.7rem;">${m.codigo_alumno}</span></td>
          <td>${m.curso}</td>
          <td>${m.periodo}</td>
          <td>${m.nota1}</td>
          <td>${m.nota2}</td>
          <td>${m.examen_final}</td>
          <td><strong style="font-size:0.95rem;color:${esAprobado ? '#34d399' : '#fb7185'}">${m.promedio}</strong></td>
          <td>
            <span class="status-tag ${esAprobado ? 'status-tag--ok' : 'status-tag--fail'}">
              ${m.estado}
            </span>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    const tbody = document.getElementById('tbody-matriculas');
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Error al cargar matrículas</td></tr>`;
  }
}

// ── 5. CARGAR HISTORIAL DE JOBS ──
async function loadHistory() {
  try {
    const res = await fetch(`${API}/history`);
    const data = await res.json();
    const container = document.getElementById('history-container');
    if (!container) return;

    const list = data.historial || [];
    if (list.length === 0) {
      container.innerHTML = `<div class="empty-state">Sin historial reciente de ejecuciones.</div>`;
      return;
    }

    container.innerHTML = list.map(h => {
      const raw = String(h.fecha || '');
      const t = String(h.hora || '').padStart(6, '0');
      const fecha = raw.length === 8 ? `${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)} ${t.slice(0,2)}:${t.slice(2,4)}` : 'Reciente';
      const esOk = h.estado === 'Exitoso';
      return `
        <div class="history-item">
          <div class="history-item-left">
            <div class="dot-indicator ${esOk ? 'dot--ok' : 'dot--err'}"></div>
            <div>
              <div class="history-job-name">${h.trabajo} · <span style="font-size:0.75rem;color:var(--text-muted);">${h.paso}</span></div>
              <div class="history-time">${fecha} — ${h.mensaje.slice(0, 70)}</div>
            </div>
          </div>
          <span class="badge ${esOk ? 'badge--success' : 'badge--error'}">${h.estado}</span>
        </div>
      `;
    }).join('');
  } catch (err) {
    const container = document.getElementById('history-container');
    if (container) container.innerHTML = `<div class="empty-state">Error al cargar historial</div>`;
  }
}

// ── 6. ACCIONES DE DESASTRE Y RECUPERACIÓN ──

// Simular Desastre: Eliminar la Base de Datos
async function confirmDropDatabase() {
  const confirmacion = confirm(
    " ¡ATENCIÓN! PRUEBA DE DESASTRE\n\n" +
    "¿Está seguro de ELIMINAR COMPLETAMENTE la base de datos [BD_Academica]?\n\n" +
    "El sistema simulará la pérdida total del servicio. En segundos, el Job de Auto-Restauración la recuperará automáticamente con todos sus datos intactos."
  );
  if (!confirmacion) return;

  addLog(' EJECUTANDO PRUEBA DE DESASTRE: DROP DATABASE [BD_Academica]...', 'error');
  showToast(' Eliminando base de datos BD_Academica...', 'error');

  try {
    const res = await fetch(`${API}/disaster/drop-db`, { method: 'POST' });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    addLog(data.mensaje, 'warn');
    showToast('Base de datos eliminada. Auto-restauración activada.', 'warn');
    loadAllData();
  } catch (err) {
    addLog(`Error al simular desastre: ${err.message}`, 'error');
    showToast(`Error: ${err.message}`, 'error');
  }
}

// Forzar Restauración Inmediata
async function triggerRestoreNow() {
  addLog(' Iniciando restauración inmediata desde BD_Academica_backup.bak...', 'info');
  showToast('Restaurando base de datos...', 'info');

  try {
    const res = await fetch(`${API}/disaster/restore-now`, { method: 'POST' });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    addLog(data.mensaje, 'success');
    showToast(' Base de datos restaurada correctamente', 'success');
    loadAllData();
  } catch (err) {
    addLog(`Error en restauración: ${err.message}`, 'error');
    showToast(`Error: ${err.message}`, 'error');
  }
}

// Crear Backup Manual
async function triggerBackupNow() {
  addLog(' Ejecutando creación de backup manual...', 'info');
  showToast('Generando copia de seguridad...', 'info');

  try {
    const res = await fetch(`${API}/backup/run`, { method: 'POST' });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    addLog(data.mensaje, 'success');
    showToast(' Backup generado con éxito', 'success');
    loadStatus();
  } catch (err) {
    addLog(`Error en backup: ${err.message}`, 'error');
    showToast(`Error: ${err.message}`, 'error');
  }
}

// Restablecer Datos de Fábrica
async function triggerResetData() {
  if (!confirm('¿Restablecer datos de fábrica de la BD Académica?')) return;
  addLog(' Restableciendo datos demo y regenerando backup inicial...', 'info');
  showToast('Restableciendo datos demo...', 'info');

  try {
    const res = await fetch(`${API}/academic/reset-data`, { method: 'POST' });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    addLog(data.mensaje, 'success');
    showToast(' Datos de demostración restablecidos', 'success');
    loadAllData();
  } catch (err) {
    addLog(`Error al restablecer: ${err.message}`, 'error');
  }
}

// ── 7. GESTIÓN DE ALUMNOS (FORMULARIO Y MODAL) ──
function openModalNuevoAlumno() {
  document.getElementById('modal-nuevo-alumno').classList.add('show');
}

function closeModalNuevoAlumno() {
  document.getElementById('modal-nuevo-alumno').classList.remove('show');
  document.getElementById('form-nuevo-alumno').reset();
}

async function handleGuardarAlumno(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-submit-alumno');
  btn.disabled = true;
  btn.textContent = 'Guardando...';

  const body = {
    nombre: document.getElementById('input-nombre').value.trim(),
    apellido: document.getElementById('input-apellido').value.trim(),
    dni: document.getElementById('input-dni').value.trim(),
    carrera: document.getElementById('select-carrera').value,
    ciclo: document.getElementById('select-ciclo').value,
    email: document.getElementById('input-email').value.trim() || undefined
  };

  try {
    const res = await fetch(`${API}/academic/alumnos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    addLog(` Estudiante registrado: ${body.nombre} ${body.apellido} (${data.codigo})`, 'success');
    showToast(' Estudiante registrado con éxito', 'success');
    closeModalNuevoAlumno();
    loadAllData();
  } catch (err) {
    addLog(`Error al registrar alumno: ${err.message}`, 'error');
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Guardar Alumno';
  }
}

async function eliminarAlumno(id, nombre) {
  if (!confirm(`¿Eliminar al estudiante ${nombre}?`)) return;
  try {
    const res = await fetch(`${API}/academic/alumnos/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    addLog(` Estudiante eliminado: ${nombre}`, 'info');
    showToast(`Estudiante eliminado`, 'info');
    loadAllData();
  } catch (err) {
    addLog(`Error al eliminar alumno: ${err.message}`, 'error');
  }
}

// ── CARGA INICIAL Y MONITOREO CONTINUO ──
async function loadAllData() {
  await loadStatus();
  if (state.dbOnline) {
    await Promise.all([loadAlumnos(), loadCursos(), loadMatriculas(), loadHistory(), loadCloudBackups()]);
  } else {
    // Si la BD fue eliminada, vaciamos vistas para mostrar el impacto
    renderAlumnos([]);
  }
}

// ── 8. BACKUPS EN LA NUBE (CLOUDINARY) ──
async function loadCloudBackups() {
  try {
    const res = await fetch(`${API}/backups/cloud`);
    const data = await res.json();
    const container = document.getElementById('cloud-backups-container');
    if (!container) return;

    if (!data.backups || data.backups.length === 0) {
      container.innerHTML = `<div class="empty-state">No se encontraron backups en la nube.</div>`;
      return;
    }

    container.innerHTML = data.backups.map(b => {
      const fecha = new Date(b.fechaCreacion).toLocaleString('es-PE');
      return `
        <div class="history-item">
          <div class="history-item-left">
            <i class="bi bi-cloud-arrow-down" style="font-size:18px; color:var(--cyan)"></i>
            <div>
              <div class="history-job-name">${b.nombre}</div>
              <div class="history-time">Subido el ${fecha} — Tamaño: ${b.tamaño}</div>
            </div>
          </div>
          <button class="btn--primary btn--sm" onclick="restoreFromCloud('${b.url}')">
            <i class="bi bi-arrow-counterclockwise"></i> Restaurar
          </button>
        </div>
      `;
    }).join('');
  } catch (err) {
    const container = document.getElementById('cloud-backups-container');
    if (container) container.innerHTML = `<div class="empty-state">Error cargando backups de nube: ${err.message}</div>`;
  }
}

async function restoreFromCloud(url) {
  if (!confirm(' ¿Estás seguro de que quieres restaurar la base de datos desde este backup en la nube? Esto reemplazará los datos actuales.')) return;
  
  addLog(' Iniciando descarga y restauración desde la NUBE...', 'info');
  showToast('Restaurando desde la nube...', 'info');

  try {
    const res = await fetch(`${API}/disaster/restore-cloud`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    addLog(data.mensaje, 'success');
    showToast(' Base de datos restaurada correctamente desde la Nube', 'success');
    loadAllData();
  } catch (err) {
    addLog(`Error en restauración Cloud: ${err.message}`, 'error');
    showToast(`Error: ${err.message}`, 'error');
  }
}

// Iniciar aplicación
addLog(' Sistema Académico con Auto-Restauración iniciado.', 'success');
addLog(' Conexión establecida con Neon PostgreSQL (Nube).', 'info');
loadAllData();

// Polling continuo cada 4 segundos para detectar caída y auto-restauración en tiempo real
setInterval(() => {
  loadStatus();
  if (state.currentTab === 'alumnos' && state.dbOnline) {
    // Opcional: no recargar si el usuario está buscando
    const searchVal = document.getElementById('search-alumno')?.value;
    if (!searchVal) loadAlumnos();
  }
}, 4000);
