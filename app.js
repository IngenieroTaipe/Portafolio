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
let projects            = {};   // objeto { id: {...} }
let courses             = {};
let allEntries          = {};
let contactData         = { github: '', email: '', linkedin: '' };
let activeCourse        = null; // objeto del curso seleccionado
let activeWeek          = null; // semana activa seleccionada
let selectedImageBase64 = null; // almacenamiento base64 de la imagen seleccionada
let editingEntryId      = null; // ID de la bitácora siendo editada

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
function getWeeksForActiveCourse() {
  if (!activeCourse) return [];
  
  let weeks = [];
  if (activeCourse.weeks) {
    if (Array.isArray(activeCourse.weeks)) {
      weeks = [...activeCourse.weeks];
    } else if (typeof activeCourse.weeks === 'object') {
      weeks = Object.values(activeCourse.weeks);
    }
  }
  
  // Agregar también semanas que provengan de las entradas existentes
  Object.values(allEntries).forEach(e => {
    if (e.courseId === activeCourse.id && e.week) {
      const w = e.week.trim();
      if (!weeks.includes(w)) {
        weeks.push(w);
      }
    }
  });

  if (weeks.length === 0) {
    weeks = ['Semana 01'];
  }

  // Ordenamiento natural (ej. "Semana 2" antes de "Semana 10")
  weeks.sort((a, b) => {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  });

  return weeks;
}

function updateWeekDropdown() {
  const dropdown = document.getElementById('week-select-dropdown');
  if (!dropdown || !activeCourse) return;

  const weeks = getWeeksForActiveCourse();
  dropdown.innerHTML = weeks.map(w => `
    <option value="${escHtml(w)}" ${w === activeWeek ? 'selected' : ''}>${escHtml(w)}</option>
  `).join('');

  const prevBtn = document.getElementById('btn-prev-week');
  const nextBtn = document.getElementById('btn-next-week');

  if (prevBtn) {
    const idx = weeks.indexOf(activeWeek);
    prevBtn.disabled = (idx <= 0);
  }
  if (nextBtn) {
    const idx = weeks.indexOf(activeWeek);
    nextBtn.disabled = (idx < 0 || idx >= weeks.length - 1);
  }
}

window.navigateWeek = function(direction) {
  if (!activeCourse) return;
  const weeks = getWeeksForActiveCourse();
  const idx = weeks.indexOf(activeWeek);
  if (idx === -1) return;

  const newIdx = idx + direction;
  if (newIdx >= 0 && newIdx < weeks.length) {
    activeWeek = weeks[newIdx];
    cancelEdit();
    updateWeekDropdown();
    renderEntries();
  }
};

window.onWeekDropdownChange = function(val) {
  activeWeek = val;
  cancelEdit();
  updateWeekDropdown();
  renderEntries();
};

window.promptAddWeek = async function() {
  if (!activeCourse) return;
  const currentWeeks = getWeeksForActiveCourse();
  
  let nextNum = 1;
  const numRegex = /(\d+)/;
  if (currentWeeks.length > 0) {
    const lastWeek = currentWeeks[currentWeeks.length - 1];
    const match = lastWeek.match(numRegex);
    if (match) {
      nextNum = parseInt(match[1]) + 1;
    }
  }
  const defaultWeekName = `Semana ${String(nextNum).padStart(2, '0')}`;
  const weekName = prompt("Ingrese el nombre de la nueva semana:", defaultWeekName);
  if (!weekName) return;

  const trimmed = weekName.trim();
  if (!trimmed) return;

  if (currentWeeks.includes(trimmed)) {
    alert("Esta semana ya existe en el cuaderno.");
    return;
  }

  const updatedWeeks = [...currentWeeks, trimmed];
  updatedWeeks.sort((a, b) => {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  });

  try {
    await set(ref(db, `courses/${activeCourse.id}/weeks`), updatedWeeks);
    activeWeek = trimmed;
    cancelEdit();
    showToast(`✓ ${trimmed} agregada`);
  } catch (err) {
    console.error("Error al guardar la semana:", err);
    alert("Hubo un error al agregar la semana.");
  }
};

// Compresión de imágenes usando canvas
function compressImage(file, maxWidth = 800, maxHeight = 800, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = function(event) {
      const img = new Image();
      img.src = event.target.result;
      img.onload = function() {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
}

window.handleImageSelect = async function(event) {
  const file = event.target.files[0];
  if (!file) return;

  const labelText = document.getElementById('file-upload-text');
  if (labelText) labelText.textContent = "Procesando...";

  try {
    selectedImageBase64 = await compressImage(file);
    
    const preview = document.getElementById('image-preview');
    const container = document.getElementById('image-preview-container');
    if (preview && container) {
      preview.src = selectedImageBase64;
      container.style.display = 'block';
    }
    if (labelText) labelText.textContent = "Imagen cargada ✓";
  } catch (err) {
    console.error("Error al procesar la imagen:", err);
    alert("No se pudo procesar la imagen");
    clearSelectedImage();
  }
};

window.clearSelectedImage = function() {
  selectedImageBase64 = null;
  const fileInput = document.getElementById('entry-image');
  if (fileInput) fileInput.value = '';
  
  const preview = document.getElementById('image-preview');
  const container = document.getElementById('image-preview-container');
  if (preview && container) {
    preview.src = '';
    container.style.display = 'none';
  }
  
  const labelText = document.getElementById('file-upload-text');
  if (labelText) labelText.textContent = "Agregar Imagen / Captura (Opcional)";
};

window.openImageModal = function(src) {
  const img = document.getElementById('lightbox-img');
  if (img) img.src = src;
  openModal('modal-image-lightbox');
};

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
  
  if (activeCourse) {
    const weeks = getWeeksForActiveCourse();
    if (weeks.length > 0) {
      if (!activeWeek || !weeks.includes(activeWeek)) {
        activeWeek = weeks[0];
      }
    } else {
      activeWeek = 'Semana 01';
    }
  } else {
    activeWeek = null;
  }

  renderCourses();
  updateWeekDropdown();
  cancelEdit();
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
  
  const weekNavArea = document.getElementById('week-navigation-area');
  if (weekNavArea) {
    weekNavArea.style.display = activeCourse ? 'flex' : 'none';
  }
};

function renderEntries() {
  const container = document.getElementById('notebook-entries');
  if (!container || !activeCourse) return;

  const weekEntry = Object.entries(allEntries).find(([id, e]) => 
    e.courseId === activeCourse.id && e.week === activeWeek
  );

  const addBtn = document.getElementById('show-add-entry');

  if (!weekEntry) {
    container.innerHTML = `
      <div class="empty-msg" style="padding: 2rem 0;">
        <p>Aún no hay apuntes registrados para la <strong>${escHtml(activeWeek)}</strong>.</p>
        <p style="font-size: 0.75rem; color: var(--text-dim); margin-top: 0.5rem;">Haz clic en el botón de abajo para llenar la bitácora semanal.</p>
      </div>
    `;
    if (addBtn) {
      addBtn.style.display = 'inline-flex';
      addBtn.textContent = '+ Llenar Bitácora';
    }
    return;
  }

  const [id, e] = weekEntry;
  
  // Renderizar secciones en Markdown. En caso de notas anteriores usar fallback gracioso.
  const learnedHtml = e.learned ? marked.parse(e.learned) : (e.notes ? marked.parse(e.notes) : '<p class="empty-msg">Sin contenido</p>');
  const labsHtml = e.labs ? marked.parse(e.labs) : (e.topic ? `<p><strong>Tema:</strong> ${escHtml(e.topic)}</p>` : '<p class="empty-msg">Sin contenido</p>');
  const metacognitionHtml = e.metacognition ? marked.parse(e.metacognition) : '<p class="empty-msg">Sin contenido</p>';

  container.innerHTML = `
    <div class="weekly-log-card">
      <div class="weekly-log-card__header">
        <div class="weekly-log-card__week">${escHtml(e.week)}</div>
        <div class="weekly-log-card__actions">
          <button class="weekly-log-card__btn weekly-log-card__btn--edit" onclick="editEntry('${id}')">✏️ Editar</button>
          <button class="weekly-log-card__btn weekly-log-card__btn--delete" onclick="deleteEntry('${id}')">✕ Eliminar</button>
        </div>
      </div>

      <div class="log-section">
        <div class="log-section-title">
          <span>📝</span> Temas Aprendidos
        </div>
        <div class="log-section-content">
          ${learnedHtml}
        </div>
      </div>

      <div class="log-section">
        <div class="log-section-title">
          <span>💻</span> Ejercicios de Laboratorio
        </div>
        <div class="log-section-content">
          ${labsHtml}
          ${e.image ? `
            <div class="entry-card__image-container" onclick="openImageModal('${e.image}')" title="Haga clic para ampliar">
              <img src="${e.image}" alt="Evidencia de laboratorio" style="width:100%; display:block;" />
            </div>
          ` : ''}
        </div>
      </div>

      <div class="log-section">
        <div class="log-section-title">
          <span>🧠</span> Reflexión / Metacognición
        </div>
        <div class="log-section-content">
          ${metacognitionHtml}
        </div>
      </div>

      <div class="weekly-log-card__date">
        Guardado el ${new Date(e.createdAt).toLocaleDateString('es-PE', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}
      </div>
    </div>
  `;

  if (addBtn) addBtn.style.display = 'none';
}

window.toggleAddEntry = function() {
  const area = document.getElementById('add-entry-area');
  if (!area) return;
  
  editingEntryId = null;
  clearInputs(['entry-learned', 'entry-labs', 'entry-metacognition']);
  clearSelectedImage();
  
  document.getElementById('editor-mode-title').textContent = `Nueva Bitácora - ${activeWeek}`;
  
  area.style.display = 'flex';
  document.getElementById('show-add-entry').style.display = 'none';
  document.getElementById('notebook-entries').style.display = 'none';

  // Resetear alturas de textareas
  const ids = ['entry-learned', 'entry-labs', 'entry-metacognition'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.height = 'auto';
  });
};

window.editEntry = function(id) {
  const e = allEntries[id];
  if (!e) return;

  editingEntryId = id;
  
  document.getElementById('entry-learned').value = e.learned || e.notes || '';
  document.getElementById('entry-labs').value = e.labs || '';
  document.getElementById('entry-metacognition').value = e.metacognition || '';
  
  clearSelectedImage();
  if (e.image) {
    selectedImageBase64 = e.image;
    const preview = document.getElementById('image-preview');
    const container = document.getElementById('image-preview-container');
    if (preview && container) {
      preview.src = e.image;
      container.style.display = 'block';
    }
    const labelText = document.getElementById('file-upload-text');
    if (labelText) labelText.textContent = "Imagen cargada ✓";
  }

  document.getElementById('editor-mode-title').textContent = `Editar Bitácora - ${e.week}`;
  
  document.getElementById('add-entry-area').style.display = 'flex';
  document.getElementById('show-add-entry').style.display = 'none';
  document.getElementById('notebook-entries').style.display = 'none';

  // Recalcular alturas ya que ahora son visibles
  const ids = ['entry-learned', 'entry-labs', 'entry-metacognition'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) autoExpandTextarea(el);
  });
};

window.cancelEdit = function() {
  document.getElementById('add-entry-area').style.display = 'none';
  document.getElementById('notebook-entries').style.display = 'block';
  
  const weekEntry = Object.entries(allEntries).find(([id, e]) => 
    e.courseId === activeCourse.id && e.week === activeWeek
  );
  const addBtn = document.getElementById('show-add-entry');
  if (addBtn) {
    addBtn.style.display = weekEntry ? 'none' : 'inline-flex';
  }
};

window.saveEntry = async function() {
  if (!activeCourse || !activeWeek) return;
  
  const learned = document.getElementById('entry-learned').value.trim();
  const labs = document.getElementById('entry-labs').value.trim();
  const metacognition = document.getElementById('entry-metacognition').value.trim();
  
  if (!learned && !labs && !metacognition) {
    alert('Debes completar al menos una sección de la bitácora.');
    return;
  }

  const entryData = {
    courseId: activeCourse.id,
    week: activeWeek,
    learned,
    labs,
    metacognition,
    createdAt: Date.now()
  };

  if (selectedImageBase64) {
    entryData.image = selectedImageBase64;
  }

  try {
    if (editingEntryId) {
      await set(ref(db, `entries/${editingEntryId}`), entryData);
      showToast('✓ Bitácora actualizada en Firebase');
    } else {
      const newRef = push(ref(db, 'entries'));
      await set(newRef, entryData);
      showToast('✓ Bitácora guardada en Firebase');
    }
    
    cancelEdit();
  } catch (err) {
    console.error("Error al guardar la bitácora:", err);
    alert("Hubo un error al guardar.");
  }
};

window.deleteEntry = async function(id) {
  if (!confirm('¿Eliminar esta bitácora semanal?')) return;
  await remove(ref(db, `entries/${id}`));
  showToast('🗑 Bitácora eliminada');
};

window.openAddCourse = () => openModal('modal-course');

window.saveCourse = async function() {
  const name  = document.getElementById('course-name').value.trim();
  const code  = document.getElementById('course-code').value.trim();
  const color = document.getElementById('course-color').value;
  if (!name) { alert('El nombre del curso es requerido'); return; }

  const newRef = push(ref(db, 'courses'));
  await set(newRef, { name, code, color, createdAt: Date.now(), weeks: ['Semana 01'] });

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
    if (activeCourse && courses[activeCourse.id]) {
      activeCourse = { id: activeCourse.id, ...courses[activeCourse.id] };
    }
    renderCourses();
    updateWeekDropdown();
    if (activeCourse) renderEntries();
  });

  // Entradas
  onValue(ref(db, 'entries'), snap => {
    allEntries = snap.val() || {};
    updateWeekDropdown();
    if (activeCourse) renderEntries();
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

// ── 10.1. HERRAMIENTAS DE EDICIÓN (Autoexpandir, shortcuts, pegado) ──
function autoExpandTextarea(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = textarea.scrollHeight + 'px';
}

function setupAutoExpand() {
  const ids = ['entry-learned', 'entry-labs', 'entry-metacognition'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', function() {
        autoExpandTextarea(this);
      });
    }
  });
}

window.insertFormat = function(textareaId, syntax) {
  const textarea = document.getElementById(textareaId);
  if (!textarea) return;

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  const selectedText = text.substring(start, end);
  
  const replacement = syntax + selectedText + syntax;
  
  textarea.value = text.substring(0, start) + replacement + text.substring(end);
  
  textarea.focus();
  if (selectedText.length > 0) {
    textarea.setSelectionRange(start + syntax.length, start + syntax.length + selectedText.length);
  } else {
    textarea.setSelectionRange(start + syntax.length, start + syntax.length);
  }
  
  autoExpandTextarea(textarea);
};

function setupTextareaShortcuts() {
  const ids = ['entry-learned', 'entry-labs', 'entry-metacognition'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
          e.preventDefault();
          insertFormat(id, '**');
        }
      });
    }
  });
}

function setupClipboardPaste() {
  document.addEventListener('paste', async function(e) {
    const editor = document.getElementById('add-entry-area');
    if (!editor || editor.style.display === 'none') return;

    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        const labelText = document.getElementById('file-upload-text');
        if (labelText) labelText.textContent = "Procesando imagen pegada...";
        try {
          selectedImageBase64 = await compressImage(file);
          const preview = document.getElementById('image-preview');
          const container = document.getElementById('image-preview-container');
          if (preview && container) {
            preview.src = selectedImageBase64;
            container.style.display = 'block';
          }
          if (labelText) labelText.textContent = "Imagen pegada ✓";
          showToast("✓ Imagen pegada del portapapeles");
        } catch (err) {
          console.error("Error al procesar imagen pegada:", err);
          alert("No se pudo procesar la imagen pegada");
          clearSelectedImage();
        }
        break;
      }
    }
  });
}

// ── 11. ARRANQUE ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Configurar marked para respetar enter y saltos de línea individuales
  if (window.marked) {
    marked.use({ breaks: true });
  }

  await seedIfEmpty();   // carga datos de ejemplo si la BD está vacía
  initListeners();       // escucha cambios en tiempo real
  
  // Configurar herramientas de edición
  setupAutoExpand();
  setupTextareaShortcuts();
  setupClipboardPaste();

  showSection('hero');
});