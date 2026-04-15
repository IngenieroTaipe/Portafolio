/* ============================================================
   app.js — Portafolio Benjamin | Lógica principal
   ============================================================ */

// ──────────────────────────────────────────
// ESTADO: localStorage para persistir datos
// ──────────────────────────────────────────
const STORAGE = {
  get: (key, fallback = []) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  },
  set: (key, value) => localStorage.setItem(key, JSON.stringify(value))
};

// ──────────────────────────────────────────
// NAVEGACIÓN POR SECCIONES
// ──────────────────────────────────────────
function showSection(id) {
  // 1. Limpiar estados activos previos
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav__item').forEach(b => b.classList.remove('active'));

  const sec = document.getElementById(id);
  if (sec) {
    // 2. Activar la nueva sección
    sec.classList.add('active');
    
    // 3. AÑADIDO: Scroll automático al inicio de la sección seleccionada
    // Esto asegura que la pantalla se mueva exactamente a donde empieza el bloque
    sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // 4. Marcar nav activo en la interfaz
  document.querySelectorAll('.nav__item').forEach(b => {
    if (b.getAttribute('onclick')?.includes(id)) b.classList.add('active');
  });

  // 5. Cerrar menú mobile si estuviera abierto
  document.querySelector('.nav')?.classList.remove('open');
}

// Burger menu para dispositivos móviles
document.getElementById('burger')?.addEventListener('click', () => {
  document.querySelector('.nav')?.classList.toggle('open');
});

// ──────────────────────────────────────────
// PROYECTOS
// ──────────────────────────────────────────
let projects = STORAGE.get('portfolio_projects', [
  { id: 1, title: 'Portafolio Personal', tech: 'HTML, CSS, JS', desc: 'Este mismo portafolio, construido como práctica del curso IS093A.', link: '' },
  { id: 2, title: 'Migración Contasis', tech: 'PostgreSQL, Python', desc: 'Migración de base de datos de Visual FoxPro a PostgreSQL para sistema de contabilidad.', link: '' }
]);

function renderProjects() {
  const grid = document.getElementById('projects-grid');
  if (!grid) return;
  grid.innerHTML = projects.map((p, i) => `
    <article class="project-card">
      <p class="project-card__num">Proyecto ${String(i + 1).padStart(2, '0')}</p>
      <h3>${escapeHtml(p.title)}</h3>
      <p>${escapeHtml(p.desc)}</p>
      <div class="project-card__tech">
        ${p.tech.split(',').map(t => `<span class="tag">${escapeHtml(t.trim())}</span>`).join('')}
      </div>
      ${p.link ? `<a class="project-card__link" href="${escapeHtml(p.link)}" target="_blank">→ Ver proyecto</a>` : ''}
      <button class="project-card__delete" onclick="deleteProject(${p.id})" title="Eliminar">✕</button>
    </article>
  `).join('');
}

function openAddProject() { openModal('modal-project'); }

function saveProject() {
  const title = document.getElementById('proj-title').value.trim();
  const tech  = document.getElementById('proj-tech').value.trim(); // Asegúrate de tener este ID en tu HTML si lo usas
  const desc  = document.getElementById('proj-desc').value.trim();
  const link  = document.getElementById('proj-link')?.value.trim() || ''; 
  
  if (!title) { alert('El nombre del proyecto es requerido'); return; }
  
  projects.push({ id: Date.now(), title, tech, desc, link });
  STORAGE.set('portfolio_projects', projects);
  renderProjects();
  closeModal('modal-project');
  clearInputs(['proj-title', 'proj-desc']);
}

function deleteProject(id) {
  if (!confirm('¿Eliminar este proyecto?')) return;
  projects = projects.filter(p => p.id !== id);
  STORAGE.set('portfolio_projects', projects);
  renderProjects();
}

// ──────────────────────────────────────────
// CUADERNOS
// ──────────────────────────────────────────
let courses = STORAGE.get('portfolio_courses', [
  { id: 1, name: 'Desarrollo de Aplicaciones Web', code: 'IS093A', color: '#00ff88' }
]);
let allEntries = STORAGE.get('portfolio_entries', []);
let activeCourse = null;

function renderCourses() {
  const list = document.getElementById('courses-list');
  if (!list) return;
  list.innerHTML = courses.map(c => `
    <div class="course-item ${activeCourse?.id === c.id ? 'selected' : ''}" onclick="selectCourse(${c.id})">
      <span class="course-dot" style="background:${c.color}"></span>
      <div>
        <div class="course-name">${escapeHtml(c.name)}</div>
        <div class="course-code">${escapeHtml(c.code)}</div>
      </div>
    </div>
  `).join('') || '<p class="empty-msg">Sin cursos aún</p>';
}

function selectCourse(id) {
  activeCourse = courses.find(c => c.id === id) || null;
  renderCourses();
  renderEntries();

  const title = document.getElementById('notebook-title');
  if (title) title.innerHTML = activeCourse
    ? `<span style="color:${activeCourse.color}">${escapeHtml(activeCourse.name)}</span> <small style="color:var(--text-dim);font-size:0.7rem">${escapeHtml(activeCourse.code)}</small>`
    : '<span>Selecciona un curso</span>';

  const addArea = document.getElementById('add-entry-area');
  const addBtn  = document.getElementById('show-add-entry');
  if (addArea) addArea.style.display = 'none';
  if (addBtn)  addBtn.style.display  = activeCourse ? 'inline-flex' : 'none';
}

function renderEntries() {
  const container = document.getElementById('notebook-entries');
  if (!container || !activeCourse) return;
  const entries = allEntries.filter(e => e.courseId === activeCourse.id)
    .sort((a, b) => b.createdAt - a.createdAt);
  if (entries.length === 0) {
    container.innerHTML = '<p class="empty-msg">Sin apuntes aún. Agrega el primero ↓</p>';
    return;
  }
  container.innerHTML = entries.map(e => `
    <div class="entry-card">
      <div class="entry-card__week">${escapeHtml(e.week)}</div>
      <div class="entry-card__topic">${escapeHtml(e.topic)}</div>
      <div class="entry-card__notes">${escapeHtml(e.notes)}</div>
      <div class="entry-card__date">${new Date(e.createdAt).toLocaleDateString('es-PE', { day:'2-digit', month:'short', year:'numeric' })}</div>
      <button class="entry-card__delete" onclick="deleteEntry(${e.id})" title="Eliminar">✕</button>
    </div>
  `).join('');
}

function toggleAddEntry() {
  const area = document.getElementById('add-entry-area');
  if (!area) return;
  area.style.display = area.style.display === 'none' ? 'flex' : 'none';
}

function saveEntry() {
  if (!activeCourse) return;
  const week  = document.getElementById('entry-week').value.trim();
  const topic = document.getElementById('entry-topic').value.trim();
  const notes = document.getElementById('entry-notes').value.trim();
  if (!topic) { alert('El tema de la clase es requerido'); return; }
  allEntries.push({ id: Date.now(), courseId: activeCourse.id, week, topic, notes, createdAt: Date.now() });
  STORAGE.set('portfolio_entries', allEntries);
  renderEntries();
  clearInputs(['entry-week','entry-topic','entry-notes']);
  document.getElementById('add-entry-area').style.display = 'none';
}

function deleteEntry(id) {
  if (!confirm('¿Eliminar este apunte?')) return;
  allEntries = allEntries.filter(e => e.id !== id);
  STORAGE.set('portfolio_entries', allEntries);
  renderEntries();
}

function openAddCourse() { openModal('modal-course'); }

function saveCourse() {
  const name  = document.getElementById('course-name').value.trim();
  const code  = document.getElementById('course-code').value.trim();
  const color = document.getElementById('course-color').value;
  if (!name) { alert('El nombre del curso es requerido'); return; }
  courses.push({ id: Date.now(), name, code, color });
  STORAGE.set('portfolio_courses', courses);
  renderCourses();
  closeModal('modal-course');
  clearInputs(['course-name','course-code']);
}

// ──────────────────────────────────────────
// CONTACTO
// ──────────────────────────────────────────
let contactData = STORAGE.get('portfolio_contact', { github: '', email: '', linkedin: '' });

function applyContact() {
  const { github, email, linkedin } = contactData;
  const ghLink = document.getElementById('github-link');
  const emLink = document.getElementById('email-link');
  const liLink = document.getElementById('linkedin-link');
  if (ghLink && github) ghLink.href = `https://github.com/${github}`;
  if (emLink && email)  emLink.href = `mailto:${email}`;
  if (liLink && linkedin) liLink.href = `https://linkedin.com/in/${linkedin}`;
}

function openEditContact() {
  const ghInput = document.getElementById('c-github');
  const emInput = document.getElementById('c-email');
  const liInput = document.getElementById('c-linkedin');
  if(ghInput) ghInput.value = contactData.github || '';
  if(emInput) emInput.value = contactData.email || '';
  if(liInput) liInput.value = contactData.linkedin || '';
  openModal('modal-contact');
}

function saveContact() {
  contactData.github   = document.getElementById('c-github').value.trim();
  contactData.email    = document.getElementById('c-email').value.trim();
  contactData.linkedin = document.getElementById('c-linkedin').value.trim();
  STORAGE.set('portfolio_contact', contactData);
  applyContact();
  closeModal('modal-contact');
}

// ──────────────────────────────────────────
// UTILIDADES
// ──────────────────────────────────────────
function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

document.addEventListener('click', e => {
  if (e.target.classList.contains('modal')) e.target.classList.remove('open');
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
});

function clearInputs(ids) { ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; }); }

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ──────────────────────────────────────────
// INIT
// ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  renderProjects();
  renderCourses();
  applyContact();
  showSection('hero'); 
});