// ============================================================
//  app.js — Portafolio Benjamin | Firebase Realtime Database
// ============================================================

// ── 1. FIREBASE CONFIG & INIT ────────────────────────────────
import { initializeApp }                        from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getDatabase, ref, set, get, remove, onValue, push, child }
                                                from "https://www.gstatic.com/firebasejs/12.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey:            "AIzaSyAoctKYqrX3Sj2jLJe_rQLgvJ27N-T86AI",
  authDomain:        "portafolio-a515e.firebaseapp.com",
  projectId:         "portafolio-a515e",
  storageBucket:     "portafolio-a515e.firebasestorage.app",
  messagingSenderId: "825601906338",
  appId:             "1:825601906338:web:d5ec9ea53cb94646ff29fb",
  databaseURL:       "https://portafolio-a515e-default-rtdb.firebaseio.com"
};

const firebaseApp = initializeApp(firebaseConfig);
const db          = getDatabase(firebaseApp);

// Rutas en la base de datos
// /projects/{id}  →  proyectos
// /courses/{id}   →  cuadernos / cursos
// /entries/{id}   →  apuntes por curso
// /contact        →  datos de contacto

// ── 2. ESTADO LOCAL ──────────────────────────────────────────
let projects     = {};   // objeto { id: {...} }
let courses      = {};
let allEntries   = {};
let contactData  = { github: '', email: '', linkedin: '' };
let activeCourse = null; // objeto del curso seleccionado

// ── 3. NAVEGACIÓN ────────────────────────────────────────────
window.showSection = function(id) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav__item').forEach(b => b.classList.remove('active'));
  const sec = document.getElementById(id);
  if (sec) {
    sec.classList.add('active');
    sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  document.querySelectorAll('.nav__item').forEach(b => {
    if (b.getAttribute('onclick')?.includes(id)) b.classList.add('active');
  });
  document.querySelector('.nav')?.classList.remove('open');
  //window.scrollTo({ top: 0, behavior: 'smooth' });
};

document.getElementById('burger')?.addEventListener('click', () => {
  document.querySelector('.nav')?.classList.toggle('open');
});

// ── 4. TOAST ─────────────────────────────────────────────────
function showToast(msg = '✓ Guardado en la nube') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ── 5. PROYECTOS ─────────────────────────────────────────────
function renderProjects() {
  const grid = document.getElementById('projects-grid');
  if (!grid) return;
  const list = Object.entries(projects);
  if (list.length === 0) {
    grid.innerHTML = '<p class="empty-msg">Sin proyectos aún. Agrega el primero →</p>';
    return;
  }
  grid.innerHTML = list.map(([id, p], i) => `
    <article class="project-card">
      <p class="project-card__num">Proyecto ${String(i + 1).padStart(2, '0')}</p>
      <h3>${escHtml(p.title)}</h3>
      <p>${escHtml(p.desc)}</p>
      <div class="project-card__tech">
        ${(p.tech || '').split(',').map(t => `<span class="tag">${escHtml(t.trim())}</span>`).join('')}
      </div>
      ${p.link ? `<a class="project-card__link" href="${escHtml(p.link)}" target="_blank">→ Ver proyecto</a>` : ''}
      <button class="project-card__delete" onclick="deleteProject('${id}')" title="Eliminar">✕</button>
    </article>
  `).join('');
}

window.openAddProject = () => openModal('modal-project');

window.saveProject = async function() {
  const title = document.getElementById('proj-title').value.trim();
  const tech  = document.getElementById('proj-tech').value.trim();
  const desc  = document.getElementById('proj-desc').value.trim();
  const link  = document.getElementById('proj-link').value.trim();
  if (!title) { alert('El nombre del proyecto es requerido'); return; }

  const newRef = push(ref(db, 'projects'));       // genera ID único en Firebase
  await set(newRef, { title, tech, desc, link, createdAt: Date.now() });

  showToast('✓ Proyecto guardado en Firebase');
  closeModal('modal-project');
  clearInputs(['proj-title','proj-tech','proj-desc','proj-link']);
  // onValue se encarga de actualizar la UI automáticamente
};

window.deleteProject = async function(id) {
  if (!confirm('¿Eliminar este proyecto?')) return;
  await remove(ref(db, `projects/${id}`));
  showToast('🗑 Proyecto eliminado');
};

// ── 6. CURSOS / CUADERNOS ────────────────────────────────────
function renderCourses() {
  const list = document.getElementById('courses-list');
  if (!list) return;
  const entries = Object.entries(courses);
  if (entries.length === 0) {
    list.innerHTML = '<p class="empty-msg" style="font-size:0.78rem">Sin cursos aún</p>';
    return;
  }
  list.innerHTML = entries.map(([id, c]) => `
    <div class="course-item ${activeCourse?.id === id ? 'selected' : ''}" onclick="selectCourse('${id}')">
      <span class="course-dot" style="background:${c.color || '#00ff88'}"></span>
      <div>
        <div class="course-name">${escHtml(c.name)}</div>
        <div class="course-code">${escHtml(c.code || '')}</div>
      </div>
    </div>
  `).join('');
}

window.selectCourse = function(id) {
  activeCourse = courses[id] ? { id, ...courses[id] } : null;
  renderCourses();
  renderEntries();

  const titleEl = document.getElementById('notebook-title');
  if (titleEl && activeCourse) {
    titleEl.innerHTML = `<span style="color:${activeCourse.color}">${escHtml(activeCourse.name)}</span>
      <small style="color:var(--text-dim);font-size:0.7rem;margin-left:0.5rem">${escHtml(activeCourse.code || '')}</small>`;
  }

  const addArea = document.getElementById('add-entry-area');
  const addBtn  = document.getElementById('show-add-entry');
  if (addArea) addArea.style.display = 'none';
  if (addBtn)  addBtn.style.display  = activeCourse ? 'inline-flex' : 'none';
};

function renderEntries() {
  const container = document.getElementById('notebook-entries');
  if (!container || !activeCourse) return;

  const entries = Object.entries(allEntries)
    .filter(([, e]) => e.courseId === activeCourse.id)
    .sort(([, a], [, b]) => b.createdAt - a.createdAt);

  if (entries.length === 0) {
    container.innerHTML = '<p class="empty-msg">Sin apuntes aún. Agrega el primero ↓</p>';
    return;
  }
  container.innerHTML = entries.map(([id, e]) => `
    <div class="entry-card">
      <div class="entry-card__week">${escHtml(e.week || '')}</div>
      <div class="entry-card__topic">${escHtml(e.topic)}</div>
      <div class="entry-card__notes">${escHtml(e.notes || '')}</div>
      <div class="entry-card__date">${new Date(e.createdAt).toLocaleDateString('es-PE', {day:'2-digit',month:'short',year:'numeric'})}</div>
      <button class="entry-card__delete" onclick="deleteEntry('${id}')" title="Eliminar">✕</button>
    </div>
  `).join('');
}

window.toggleAddEntry = function() {
  const area = document.getElementById('add-entry-area');
  if (!area) return;
  area.style.display = area.style.display === 'none' ? 'flex' : 'none';
};

window.saveEntry = async function() {
  if (!activeCourse) return;
  const week  = document.getElementById('entry-week').value.trim();
  const topic = document.getElementById('entry-topic').value.trim();
  const notes = document.getElementById('entry-notes').value.trim();
  if (!topic) { alert('El tema de la clase es requerido'); return; }

  const newRef = push(ref(db, 'entries'));
  await set(newRef, { courseId: activeCourse.id, week, topic, notes, createdAt: Date.now() });

  showToast('✓ Apunte guardado en Firebase');
  clearInputs(['entry-week','entry-topic','entry-notes']);
  document.getElementById('add-entry-area').style.display = 'none';
};

window.deleteEntry = async function(id) {
  if (!confirm('¿Eliminar este apunte?')) return;
  await remove(ref(db, `entries/${id}`));
  showToast('🗑 Apunte eliminado');
};

window.openAddCourse = () => openModal('modal-course');

window.saveCourse = async function() {
  const name  = document.getElementById('course-name').value.trim();
  const code  = document.getElementById('course-code').value.trim();
  const color = document.getElementById('course-color').value;
  if (!name) { alert('El nombre del curso es requerido'); return; }

  const newRef = push(ref(db, 'courses'));
  await set(newRef, { name, code, color, createdAt: Date.now() });

  showToast('✓ Cuaderno creado en Firebase');
  closeModal('modal-course');
  clearInputs(['course-name','course-code']);
};

// ── 7. CONTACTO ──────────────────────────────────────────────
function applyContact() {
  const { github, email, linkedin } = contactData;
  const ghLink  = document.getElementById('github-link');
  const ghLabel = document.getElementById('github-label');
  const emLink  = document.getElementById('email-link');
  const emLabel = document.getElementById('email-label');
  const liLink  = document.getElementById('linkedin-link');
  const liLabel = document.getElementById('linkedin-label');

  if (github) {
    if (ghLink)  ghLink.href = `https://github.com/${github}`;
    if (ghLabel) ghLabel.textContent = `github.com/${github}`;
  }
  if (email) {
    if (emLink)  emLink.href = `mailto:${email}`;
    if (emLabel) emLabel.textContent = email;
  }
  if (linkedin) {
    if (liLink)  liLink.href = `https://linkedin.com/in/${linkedin}`;
    if (liLabel) liLabel.textContent = `linkedin.com/in/${linkedin}`;
  }
}

window.openEditContact = function() {
  document.getElementById('c-github').value   = contactData.github   || '';
  document.getElementById('c-email').value    = contactData.email    || '';
  document.getElementById('c-linkedin').value = contactData.linkedin || '';
  openModal('modal-contact');
};

window.saveContact = async function() {
  contactData.github   = document.getElementById('c-github').value.trim();
  contactData.email    = document.getElementById('c-email').value.trim();
  contactData.linkedin = document.getElementById('c-linkedin').value.trim();
  await set(ref(db, 'contact'), contactData);
  applyContact();
  showToast('✓ Contacto guardado en Firebase');
  closeModal('modal-contact');
};

// ── 8. LISTENERS EN TIEMPO REAL (onValue) ────────────────────
// Firebase llama a estas funciones cada vez que los datos cambian
// en la nube — sin necesidad de recargar la página.

function initListeners() {
  // Proyectos
  onValue(ref(db, 'projects'), snap => {
    projects = snap.val() || {};
    renderProjects();
  });

  // Cursos
  onValue(ref(db, 'courses'), snap => {
    courses = snap.val() || {};
    renderCourses();
    // Si había un curso activo, mantenerlo seleccionado
    if (activeCourse) renderEntries();
  });

  // Entradas
  onValue(ref(db, 'entries'), snap => {
    allEntries = snap.val() || {};
    renderEntries();
  });

  // Contacto
  onValue(ref(db, 'contact'), snap => {
    if (snap.val()) {
      contactData = snap.val();
      applyContact();
    }
  });
}

// ── 9. DATOS INICIALES (solo si la BD está vacía) ────────────
async function seedIfEmpty() {
  const snap = await get(child(ref(db), 'projects'));
  if (!snap.exists()) {
    // Carga proyectos de ejemplo la primera vez
    const projRef = ref(db, 'projects');
    const p1 = push(projRef);
    await set(p1, { title: 'Portafolio Personal', tech: 'HTML, CSS, JS, Firebase', desc: 'Portafolio construido como práctica IS093A con base de datos en la nube.', link: '', createdAt: Date.now() });
    const p2 = push(projRef);
    await set(p2, { title: 'Migración Contasis', tech: 'PostgreSQL, Python', desc: 'Migración de base de datos de Visual FoxPro a PostgreSQL para sistema de contabilidad.', link: '', createdAt: Date.now() });

    // Curso de ejemplo
    const cRef = push(ref(db, 'courses'));
    await set(cRef, { name: 'Desarrollo de Aplicaciones Web', code: 'IS093A', color: '#00ff88', createdAt: Date.now() });
  }
}

// ── 10. UTILIDADES ───────────────────────────────────────────
window.openModal  = id => document.getElementById(id)?.classList.add('open');
window.closeModal = id => document.getElementById(id)?.classList.remove('open');

document.addEventListener('click', e => {
  if (e.target.classList.contains('modal')) e.target.classList.remove('open');
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
});

function clearInputs(ids) {
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
}

function escHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── 11. ARRANQUE ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await seedIfEmpty();   // carga datos de ejemplo si la BD está vacía
  initListeners();       // escucha cambios en tiempo real
  showSection('hero');
});