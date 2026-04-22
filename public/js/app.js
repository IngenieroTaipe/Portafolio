// public/js/app.js
// Módulo principal — Firebase + Quill + Upload

import { initializeApp }   from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getDatabase, ref, set, get, remove, onValue, push, child }
                            from "https://www.gstatic.com/firebasejs/12.12.0/firebase-database.js";

// ══════════════════════════════════════════════
//  1. FIREBASE — Config desde el servidor Express
// ══════════════════════════════════════════════
async function initFirebase() {
  // El servidor expone la config en /api/config (las claves viven en .env)
  const res    = await fetch('/api/config');
  const config = await res.json();
  const app    = initializeApp(config);
  return getDatabase(app);
}

// ══════════════════════════════════════════════
//  2. ESTADO GLOBAL
// ══════════════════════════════════════════════
let db           = null;
let projects     = {};
let courses      = {};
let allEntries   = {};
let contactData  = { github:'', email:'', linkedin:'' };
let activeCourse = null;   // { id, name, code, color }

// Estado del editor de apuntes
let quill          = null;
let editingEntryId = null;   // null = nuevo, string = editar
let pendingAttachments = [];  // [{ type, url, name, isPdf }]

/* ════════════════════════════════════════════════════════════
   3. NAVEGACIÓN Y GESTIÓN DE ESTADOS (PASO 3)
   ════════════════════════════════════════════════════════════ */

// IA: Generar scroll básico → Corrección manual: Implementación de setTimeout(10ms) 
// para sincronizar el reflow del DOM con el motor de scroll del navegador.
window.showSection = function(id) {
  // 3.1. Limpieza de estados previos (Arquitectura limpia)
  const sections = document.querySelectorAll('.section');
  const navLinks = document.querySelectorAll('.nav__item');
  
  sections.forEach(s => s.classList.remove('active'));
  navLinks.forEach(l => l.classList.remove('active'));

  // 3.2. Activación de la sección objetivo
  const targetSection = document.getElementById(id);
  
  if (targetSection) {
    targetSection.classList.add('active');
    
    // IA: Sugerir window.scrollTo(0) → Corrección manual: Uso de scrollIntoView 
    // con 'block: start' para alineación precisa con el header fijo.
    setTimeout(() => {
      targetSection.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start' 
      });
    }, 10); 
  }

  // 3.3. Feedback visual en el menú (Sin usar 'onclick' inyectado)
  // Buscamos el link que corresponde a esta sección mediante el atributo data-section
  const activeLink = document.querySelector(`.nav__item[data-section="${id}"]`);
  if (activeLink) activeLink.classList.add('active');

  // 3.4. Cerrar menú móvil y resetear ARIA para accesibilidad
  const navMenu = document.getElementById('nav');
  const burgerBtn = document.getElementById('burger');
  
  if (navMenu?.classList.contains('open')) {
    navMenu.classList.remove('open');
    burgerBtn?.setAttribute('aria-expanded', 'false');
  }
};

/* ════════════════════════════════════════════════════════════
   GESTIÓN DEL MENÚ BURGER (Accesibilidad Paso 36)
   ════════════════════════════════════════════════════════════ */
document.getElementById('burger')?.addEventListener('click', function() {
  const nav = document.getElementById('nav');
  const isOpen = nav?.classList.toggle('open');
  
  // IA: Toggle básico → Corrección manual: Actualización dinámica de aria-expanded 
  // para cumplir con la navegación por lectores de pantalla.
  this.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
});
// ══════════════════════════════════════════════
//  4. TOAST
// ══════════════════════════════════════════════
function toast(msg = '✓ Guardado', isError = false) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.style.background = isError ? 'var(--danger)' : 'var(--accent)';
  t.style.color = isError ? '#fff' : '#000';
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

// ══════════════════════════════════════════════
//  5. PROYECTOS
// ══════════════════════════════════════════════
function renderProjects() {
  const grid = document.getElementById('projects-grid');
  if (!grid) return;
  const list = Object.entries(projects);
  if (!list.length) {
    grid.innerHTML = '<p style="color:var(--text-dim);font-size:.85rem">Sin proyectos aún. Agrega el primero →</p>';
    return;
  }
  grid.innerHTML = list.map(([id,p],i) => `
    <article class="project-card">
      <p class="project-card__num">Proyecto ${String(i+1).padStart(2,'0')}</p>
      <h3>${esc(p.title)}</h3>
      <p>${esc(p.desc)}</p>
      <div class="project-card__tech">
        ${(p.tech||'').split(',').map(t=>`<span class="tag">${esc(t.trim())}</span>`).join('')}
      </div>
      ${p.link ? `<a class="project-card__link" href="${esc(p.link)}" target="_blank">→ Ver proyecto</a>` : ''}
      <button class="project-card__delete" onclick="deleteProject('${id}')">✕</button>
    </article>`).join('');
}

window.openAddProject = () => openModal('modal-project');

window.saveProject = async () => {
  const title = val('proj-title'), tech = val('proj-tech'),
        desc  = val('proj-desc'), link = val('proj-link');
  if (!title) { toast('El nombre es requerido', true); return; }
  const r = push(ref(db,'projects'));
  await set(r, { title, tech, desc, link, createdAt: Date.now() });
  toast('✓ Proyecto guardado en Firebase');
  closeModal('modal-project');
  clearFields(['proj-title','proj-tech','proj-desc','proj-link']);
};

window.deleteProject = async id => {
  if (!confirm('¿Eliminar este proyecto?')) return;
  await remove(ref(db,`projects/${id}`));
  toast('🗑 Proyecto eliminado');
};

// ══════════════════════════════════════════════
//  6. CURSOS / CUADERNOS
// ══════════════════════════════════════════════
function renderCourses() {
  const list = document.getElementById('courses-list');
  if (!list) return;
  const entries = Object.entries(courses);
  if (!entries.length) {
    list.innerHTML = '<p style="color:var(--text-dim);font-size:.78rem;padding:.5rem">Sin cursos aún</p>';
    return;
  }
  list.innerHTML = entries.map(([id,c]) => `
    <div class="course-item ${activeCourse?.id===id?'selected':''}" onclick="selectCourse('${id}')">
      <span class="course-dot" style="background:${c.color||'#00ff88'}"></span>
      <div>
        <span class="course-name">${esc(c.name)}</span>
        <span class="course-code">${esc(c.code||'')}</span>
      </div>
    </div>`).join('');
}

window.selectCourse = id => {
  activeCourse = courses[id] ? { id, ...courses[id] } : null;
  renderCourses();

  const empty   = document.getElementById('nb-empty');
  const content = document.getElementById('nb-content');
  const nameEl  = document.getElementById('nb-course-name');

  if (!activeCourse) {
    empty.style.display   = 'flex';
    content.style.display = 'none';
    return;
  }
  empty.style.display   = 'none';
  content.style.display = 'block';
  if (nameEl) nameEl.innerHTML =
    `<span style="color:${activeCourse.color}">${esc(activeCourse.name)}</span>
     <small style="color:var(--text-dim);font-size:.72rem;margin-left:.5rem">${esc(activeCourse.code||'')}</small>`;
  renderEntries();
};

window.deleteCourse = async () => {
  if (!activeCourse) return;
  if (!confirm(`¿Eliminar el cuaderno "${activeCourse.name}" y todos sus apuntes?`)) return;

  // Eliminar todas las entradas del curso
  const toDelete = Object.entries(allEntries)
    .filter(([,e]) => e.courseId === activeCourse.id)
    .map(([id]) => id);
  for (const id of toDelete) await remove(ref(db,`entries/${id}`));
  await remove(ref(db,`courses/${activeCourse.id}`));

  activeCourse = null;
  document.getElementById('nb-empty').style.display   = 'flex';
  document.getElementById('nb-content').style.display = 'none';
  toast('🗑 Cuaderno eliminado');
};

window.openAddCourse  = () => openModal('modal-course');

window.saveCourse = async () => {
  const name  = val('course-name'), code = val('course-code');
  const color = document.getElementById('course-color')?.value || '#00ff88';
  if (!name) { toast('El nombre es requerido', true); return; }
  const r = push(ref(db,'courses'));
  await set(r, { name, code, color, createdAt: Date.now() });
  toast('✓ Cuaderno creado');
  closeModal('modal-course');
  clearFields(['course-name','course-code']);
};

// ══════════════════════════════════════════════
//  7. APUNTES (ENTRIES) — CRUD
// ══════════════════════════════════════════════
function renderEntries() {
  const container = document.getElementById('entries-list');
  if (!container || !activeCourse) return;
  const entries = Object.entries(allEntries)
    .filter(([,e]) => e.courseId === activeCourse.id)
    .sort(([,a],[,b]) => b.createdAt - a.createdAt);

  if (!entries.length) {
    container.innerHTML = '<div class="entries-empty">Sin apuntes aún. Clic en "+ Nuevo apunte" para comenzar.</div>';
    return;
  }
  container.innerHTML = entries.map(([id,e]) => {
    const attaches = e.attachments || [];
    const imgs  = attaches.filter(a=>a.type==='image').length;
    const pdfs  = attaches.filter(a=>a.type==='pdf').length;
    const links = attaches.filter(a=>a.type==='link').length;
    const textPreview = e.content ? stripHtml(e.content).slice(0,100) : '';
    return `
    <div class="entry-card" onclick="viewEntry('${id}')">
      <div class="entry-card__week">${esc(e.week||'')}</div>
      <div class="entry-card__topic">${esc(e.topic)}</div>
      ${textPreview ? `<div class="entry-card__preview">${esc(textPreview)}</div>` : ''}
      <div class="entry-card__meta">
        <span class="entry-card__date">${fmtDate(e.createdAt)}</span>
        <div class="entry-card__badges">
          ${imgs  ? `<span class="attach-badge attach-badge--img">🖼 ${imgs}</span>` : ''}
          ${pdfs  ? `<span class="attach-badge attach-badge--pdf">📄 ${pdfs}</span>` : ''}
          ${links ? `<span class="attach-badge attach-badge--link">🔗 ${links}</span>` : ''}
        </div>
      </div>
      <div class="entry-card__actions" onclick="event.stopPropagation()">
        <button class="entry-card__btn" onclick="openEditEntry('${id}')">✏️</button>
        <button class="entry-card__btn entry-card__btn--del" onclick="deleteEntry('${id}')">✕</button>
      </div>
    </div>`;
  }).join('');
}

// Abrir modal nuevo apunte
window.openAddEntry = () => {
  if (!activeCourse) return;
  editingEntryId     = null;
  pendingAttachments = [];
  document.getElementById('entry-modal-title').textContent = 'Nuevo Apunte';
  clearFields(['entry-week','entry-topic']);
  if (quill) quill.setContents([]);
  renderAttachmentsPreview();
  openModal('modal-entry');
};

// Abrir modal editar apunte existente
window.openEditEntry = id => {
  const e = allEntries[id];
  if (!e) return;
  editingEntryId     = id;
  pendingAttachments = e.attachments ? [...e.attachments] : [];
  document.getElementById('entry-modal-title').textContent = 'Editar Apunte';
  setVal('entry-week',  e.week  || '');
  setVal('entry-topic', e.topic || '');
  if (quill && e.content) quill.root.innerHTML = e.content;
  else if (quill)         quill.setContents([]);
  renderAttachmentsPreview();
  openModal('modal-entry');
};

// Ver apunte (modo lectura)
window.viewEntry = id => {
  const e = allEntries[id];
  if (!e) return;
  document.getElementById('view-week').textContent  = e.week  || '';
  document.getElementById('view-topic').textContent = e.topic || '';
  document.getElementById('view-body').innerHTML    = e.content || '<p style="color:var(--text-dim)">Sin contenido</p>';
  renderViewAttachments(e.attachments || []);
  // Guardar id para poder editar desde la vista
  document.getElementById('modal-view').dataset.entryId = id;
  openModal('modal-view');
};

window.editEntry = () => {
  const id = document.getElementById('modal-view').dataset.entryId;
  closeModal('modal-view');
  openEditEntry(id);
};

// Guardar apunte (nuevo o editar)
window.saveEntry = async () => {
  if (!activeCourse) return;
  const week  = val('entry-week');
  const topic = val('entry-topic');
  const content = quill ? quill.root.innerHTML : '';
  if (!topic) { toast('El tema de la clase es requerido', true); return; }

  const data = {
    courseId:    activeCourse.id,
    week, topic, content,
    attachments: pendingAttachments,
    createdAt:   editingEntryId ? (allEntries[editingEntryId]?.createdAt || Date.now()) : Date.now(),
    updatedAt:   Date.now(),
  };

  if (editingEntryId) {
    await set(ref(db,`entries/${editingEntryId}`), data);
    toast('✓ Apunte actualizado');
  } else {
    const r = push(ref(db,'entries'));
    await set(r, data);
    toast('✓ Apunte guardado en Firebase');
  }
  closeModal('modal-entry');
  editingEntryId     = null;
  pendingAttachments = [];
};

window.deleteEntry = async id => {
  if (!confirm('¿Eliminar este apunte?')) return;
  // Eliminar archivos subidos del servidor
  const e = allEntries[id];
  if (e?.attachments) {
    for (const a of e.attachments) {
      if (a.type !== 'link' && a.url.startsWith('/uploads/')) {
        const filename = a.url.split('/').pop();
        await fetch(`/api/upload/${filename}`, { method:'DELETE' }).catch(()=>{});
      }
    }
  }
  await remove(ref(db,`entries/${id}`));
  toast('🗑 Apunte eliminado');
};

// ══════════════════════════════════════════════
//  8. ADJUNTOS — Upload + Links
// ══════════════════════════════════════════════

// Subir imagen o PDF al servidor Express
window.handleFileUpload = async (input, type) => {
  const file = input.files[0];
  if (!file) return;

  // Mostrar progreso
  const preview = document.getElementById('attachments-preview');
  const tempId  = `uploading-${Date.now()}`;
  const progEl  = document.createElement('div');
  progEl.id = tempId;
  progEl.className = 'attach-upload-progress';
  progEl.textContent = `⏳ Subiendo ${file.name}...`;
  preview.appendChild(progEl);

  try {
    const formData = new FormData();
    formData.append('file', file);
    const res  = await fetch('/api/upload', { method:'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error de subida');

    pendingAttachments.push({
      type:  data.isPdf ? 'pdf' : 'image',
      url:   data.url,
      name:  data.name,
      isPdf: data.isPdf,
    });
    toast(`✓ ${file.name} subido`);
  } catch (err) {
    toast(`✗ ${err.message}`, true);
  } finally {
    document.getElementById(tempId)?.remove();
    input.value = '';
    renderAttachmentsPreview();
  }
};

// Modal para agregar link externo
window.openLinkModal = () => openModal('modal-link');

window.confirmAddLink = () => {
  const url   = val('link-url');
  const label = val('link-label') || url;
  if (!url) { toast('La URL es requerida', true); return; }
  pendingAttachments.push({ type:'link', url, name: label });
  toast('✓ Enlace agregado');
  closeModal('modal-link');
  clearFields(['link-url','link-label']);
  renderAttachmentsPreview();
};

window.removeAttachment = idx => {
  const a = pendingAttachments[idx];
  // Si es un archivo local, eliminarlo del servidor
  if (a && a.type !== 'link' && a.url.startsWith('/uploads/')) {
    const filename = a.url.split('/').pop();
    fetch(`/api/upload/${filename}`, { method:'DELETE' }).catch(()=>{});
  }
  pendingAttachments.splice(idx, 1);
  renderAttachmentsPreview();
};

function renderAttachmentsPreview() {
  const wrap = document.getElementById('attachments-preview');
  if (!wrap) return;
  if (!pendingAttachments.length) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = pendingAttachments.map((a,i) => {
    if (a.type === 'image') return `
      <div class="attach-item attach-item--img">
        <img src="${esc(a.url)}" alt="${esc(a.name)}" />
        <span class="attach-item__name">🖼 ${esc(a.name)}</span>
        <button class="attach-item__remove" onclick="removeAttachment(${i})">✕</button>
      </div>`;
    if (a.type === 'pdf') return `
      <div class="attach-item">
        <span>📄</span>
        <a href="${esc(a.url)}" target="_blank" class="attach-item__name">${esc(a.name)}</a>
        <button class="attach-item__remove" onclick="removeAttachment(${i})">✕</button>
      </div>`;
    // link
    return `
      <div class="attach-item">
        <span>🔗</span>
        <a href="${esc(a.url)}" target="_blank" class="attach-item__name">${esc(a.name)}</a>
        <button class="attach-item__remove" onclick="removeAttachment(${i})">✕</button>
      </div>`;
  }).join('');
}

function renderViewAttachments(attachments) {
  const wrap = document.getElementById('view-attachments');
  if (!wrap) return;
  if (!attachments.length) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = `
    <div style="border-top:1px solid var(--border);margin-top:1rem;padding-top:1rem">
      <p style="font-size:.75rem;color:var(--text-dim);margin-bottom:.6rem;text-transform:uppercase;letter-spacing:1px">📎 Adjuntos</p>
      <div class="attachments-preview">
        ${attachments.map(a => {
          if (a.type === 'image') return `
            <div class="attach-item attach-item--img">
              <img src="${esc(a.url)}" alt="${esc(a.name)}" style="cursor:pointer" onclick="window.open('${esc(a.url)}','_blank')" />
              <span class="attach-item__name">🖼 ${esc(a.name)}</span>
            </div>`;
          if (a.type === 'pdf') return `
            <div class="attach-item">
              <span>📄</span>
              <a href="${esc(a.url)}" target="_blank" class="attach-item__name">${esc(a.name)}</a>
            </div>`;
          return `
            <div class="attach-item">
              <span>🔗</span>
              <a href="${esc(a.url)}" target="_blank" class="attach-item__name">${esc(a.name)}</a>
            </div>`;
        }).join('')}
      </div>
    </div>`;
}

// ══════════════════════════════════════════════
//  9. QUILL EDITOR — Inicializar
// ══════════════════════════════════════════════
function initQuill() {
  quill = new Quill('#quill-editor', {
    theme: 'snow',
    placeholder: 'Escribe tus apuntes aquí... (soporta formato rico)',
    modules: {
      toolbar: [
        [{ header: [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ color:[] }, { background:[] }],
        [{ list:'ordered' }, { list:'bullet' }],
        [{ indent:'-1' }, { indent:'+1' }],
        ['blockquote', 'code-block'],
        ['link', 'image'],
        [{ align:[] }],
        ['clean']
      ]
    }
  });
}

// ══════════════════════════════════════════════
//  10. CONTACTO
// ══════════════════════════════════════════════
function applyContact() {
  const { github, email, linkedin } = contactData;
  if (github) {
    document.getElementById('github-link').href = `https://github.com/${github}`;
    document.getElementById('github-label').textContent = `github.com/${github}`;
  }
  if (email) {
    document.getElementById('email-link').href = `mailto:${email}`;
    document.getElementById('email-label').textContent = email;
  }
  if (linkedin) {
    document.getElementById('linkedin-link').href = `https://linkedin.com/in/${linkedin}`;
    document.getElementById('linkedin-label').textContent = `linkedin.com/in/${linkedin}`;
  }
}

window.openEditContact = () => {
  setVal('c-github',   contactData.github   || '');
  setVal('c-email',    contactData.email    || '');
  setVal('c-linkedin', contactData.linkedin || '');
  openModal('modal-contact');
};

window.saveContact = async () => {
  contactData = { github: val('c-github'), email: val('c-email'), linkedin: val('c-linkedin') };
  await set(ref(db,'contact'), contactData);
  applyContact();
  toast('✓ Contacto guardado');
  closeModal('modal-contact');
};

// ══════════════════════════════════════════════
//  11. LISTENERS FIREBASE (tiempo real)
// ══════════════════════════════════════════════
function initListeners() {
  onValue(ref(db,'projects'), s => { projects = s.val() || {}; renderProjects(); });
  onValue(ref(db,'courses'),  s => { courses  = s.val() || {}; renderCourses(); });
  onValue(ref(db,'entries'),  s => { allEntries = s.val() || {}; renderEntries(); });
  onValue(ref(db,'contact'),  s => {
    if (s.val()) { contactData = s.val(); applyContact(); }
  });
}

// ══════════════════════════════════════════════
//  12. DATOS INICIALES (seed)
// ══════════════════════════════════════════════
async function seedIfEmpty() {
  const snap = await get(child(ref(db),'projects'));
  if (!snap.exists()) {
    const p1 = push(ref(db,'projects'));
    await set(p1, { title:'Portafolio Personal', tech:'HTML, CSS, JS, Node.js, Firebase', desc:'Portafolio con cuadernos de clase y base de datos en la nube.', link:'', createdAt:Date.now() });
    const p2 = push(ref(db,'projects'));
    await set(p2, { title:'Migración Contasis', tech:'PostgreSQL, Python', desc:'Migración de Visual FoxPro a PostgreSQL.', link:'', createdAt:Date.now() });
    const c1 = push(ref(db,'courses'));
    await set(c1, { name:'Desarrollo de Aplicaciones Web', code:'IS093A', color:'#00ff88', createdAt:Date.now() });
  }
}

// ══════════════════════════════════════════════
//  13. MODALES
// ══════════════════════════════════════════════
window.openModal  = id => document.getElementById(id)?.classList.add('open');
window.closeModal = id => document.getElementById(id)?.classList.remove('open');

document.addEventListener('click', e => {
  if (e.target.classList.contains('modal')) e.target.classList.remove('open');
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
});

// ══════════════════════════════════════════════
//  14. UTILIDADES
// ══════════════════════════════════════════════
const val    = id => document.getElementById(id)?.value.trim() || '';
const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
const clearFields = ids => ids.forEach(id => setVal(id,''));
const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmtDate = ts => new Date(ts).toLocaleDateString('es-PE',{day:'2-digit',month:'short',year:'numeric'});
const stripHtml = html => {
  const d = document.createElement('div'); d.innerHTML = html; return d.textContent || '';
};

// ══════════════════════════════════════════════
//  ARRANQUE
// ══════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  db = await initFirebase();
  initQuill();
  await seedIfEmpty();
  initListeners();
  showSection('hero');
});