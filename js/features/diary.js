// ============================================================
// DIARY — iPhone Notes style
// ============================================================
let currentMood = null;
let currentNotebookId = null;
let editingNotebookId = null;
let selectedNotebookIcon = '📔';

const NOTEBOOK_ICONS = ['📔', '📒', '📓', '📕', '📗', '📘', '📙', '🗒️', '✏️', '💭', '🌙', '⭐', '🌿', '🔥', '💡', '🎯', '💪', '📖', '🧠', '❤️'];

// ── Notebook helpers ──
function getNotebooks() { return DB.get('diary_notebooks', []); }
function setNotebooks(v) { DB.set('diary_notebooks', v); }
function getNotes() { return DB.get('diary_entries', []); }
function setNotes(v) { DB.set('diary_entries', v); }

// ── View switching ──
function diaryGoFolders() {
    document.getElementById('diary-view-folders').classList.add('active');
    document.getElementById('diary-view-notes').classList.remove('active');
    currentNotebookId = null;
    editingDiaryId = null;
    renderDiary();
}

function diaryOpenNotebook(id) {
    currentNotebookId = id;
    editingDiaryId = null;
    document.getElementById('diary-view-folders').classList.remove('active');
    document.getElementById('diary-view-notes').classList.add('active');
    document.getElementById('diary-editor').style.display = 'none';
    document.getElementById('diary-empty-state').style.display = 'flex';
    renderDiaryNotesList();
}

// ── Main render ──
function renderDiary() {
    renderDiaryFolders();
}

function renderDiaryFolders() {
    const notebooks = getNotebooks();
    const notes = getNotes();
    const el = document.getElementById('diary-folders-list');
    if (!el) return;

    if (!notebooks.length) {
        el.innerHTML = `
      <div style="text-align:center;padding:60px 20px;color:var(--muted);">
        <div style="font-size:48px;opacity:0.3;margin-bottom:16px;">📔</div>
        <div style="font-size:15px;margin-bottom:6px;">No notebooks yet</div>
        <div style="font-size:12px;opacity:0.6;">Create a notebook to start writing</div>
      </div>`;
        return;
    }

    let html = '';
    notebooks.forEach(nb => {
        const count = notes.filter(n => n.notebookId === nb.id).length;
        const lastNote = notes.filter(n => n.notebookId === nb.id).sort((a, b) => (b.updated || '').localeCompare(a.updated || ''))[0];
        const preview = lastNote ? ((lastNote.content || '').replace(/\n/g, ' ').slice(0, 60) || lastNote.title || '') : 'No notes yet';
        html += `<div class="notes-folder-card" onclick="diaryOpenNotebook('${nb.id}')">
      <div class="notes-folder-icon" style="background:${nb.color || 'rgba(200,169,110,0.15)'};">${nb.icon || '📔'}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:14px;font-weight:600;margin-bottom:2px;">${esc(nb.name)}</div>
        <div style="font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${preview}</div>
      </div>
      <div style="font-size:13px;color:var(--muted);flex-shrink:0;">${count}</div>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style="color:var(--muted);flex-shrink:0;"><path d="M5 1l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </div>`;
    });
    el.innerHTML = html;
}

function renderDiaryNotesList() {
    const nb = getNotebooks().find(n => n.id === currentNotebookId);
    if (!nb) return;
    document.getElementById('diary-notebook-title').textContent = (nb.icon || '') + ' ' + nb.name;

    const notes = getNotes().filter(n => n.notebookId === currentNotebookId)
        .sort((a, b) => (b.updated || b.date || '').localeCompare(a.updated || a.date || ''));

    document.getElementById('diary-notebook-count').textContent = notes.length + (notes.length === 1 ? ' note' : ' notes');

    const el = document.getElementById('diary-notes-list');
    if (!notes.length) {
        el.innerHTML = `<div style="color:var(--muted);font-size:12px;padding:8px 4px;text-align:center;padding-top:30px;">No notes yet.<br>Tap + to write one.</div>`;
        return;
    }

    let html = '';
    notes.forEach(e => {
        const preview = (e.content || '').replace(/\n/g, ' ').slice(0, 60);
        const d = new Date((e.updated || e.date + 'T00:00:00'));
        const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        html += `<div class="notes-note-item ${editingDiaryId === e.id ? 'active' : ''}" onclick="loadDiaryEntry('${e.id}')">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;">
        <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;">${esc(e.title) || 'Untitled'}</div>
        <div style="font-size:10px;color:var(--muted);flex-shrink:0;">${dateStr}</div>
      </div>
      <div style="font-size:11px;color:var(--muted);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${preview || 'No additional text'}</div>
      ${e.mood ? `<div style="font-size:11px;margin-top:4px;">${e.mood.split(' ')[0]}</div>` : ''}
    </div>`;
    });
    el.innerHTML = html;
}

// ── Notebook modal ──
function openNewNotebookModal() {
    editingNotebookId = null;
    selectedNotebookIcon = '📔';
    document.getElementById('notebook-modal-title').textContent = 'New Notebook';
    document.getElementById('notebook-name-input').value = '';
    document.getElementById('notebook-delete-btn').style.display = 'none';
    renderNotebookIconPicker();
    openModal('modal-notebook');
}

function editCurrentNotebook() {
    const nb = getNotebooks().find(n => n.id === currentNotebookId);
    if (!nb) return;
    editingNotebookId = currentNotebookId;
    selectedNotebookIcon = nb.icon || '📔';
    document.getElementById('notebook-modal-title').textContent = 'Edit Notebook';
    document.getElementById('notebook-name-input').value = nb.name || '';
    document.getElementById('notebook-delete-btn').style.display = 'inline-flex';
    renderNotebookIconPicker();
    openModal('modal-notebook');
}

function renderNotebookIconPicker() {
    document.getElementById('notebook-icon-picker').innerHTML = NOTEBOOK_ICONS.map(ic => `
    <div onclick="selectNotebookIcon('${ic}')" style="width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:18px;
      background:${selectedNotebookIcon === ic ? 'rgba(200,169,110,0.25)' : 'var(--surface2)'};
      border:2px solid ${selectedNotebookIcon === ic ? 'var(--accent)' : 'transparent'};transition:all 0.15s;">${ic}</div>
  `).join('');
}

function selectNotebookIcon(ic) {
    selectedNotebookIcon = ic;
    renderNotebookIconPicker();
}

function saveNotebook() {
    const name = document.getElementById('notebook-name-input').value.trim();
    if (!name) return void showToast('Please enter a notebook name.');
    const notebooks = getNotebooks();
    const colors = ['rgba(200,169,110,0.15)', 'rgba(124,110,240,0.15)', 'rgba(74,222,128,0.1)', 'rgba(248,113,113,0.1)', 'rgba(56,189,248,0.12)'];
    const data = { name, icon: selectedNotebookIcon, color: colors[notebooks.length % colors.length] };
    if (editingNotebookId) {
        const idx = notebooks.findIndex(n => n.id === editingNotebookId);
        if (idx >= 0) notebooks[idx] = { ...notebooks[idx], ...data };
    } else {
        notebooks.push({ id: genId(), createdAt: new Date().toISOString(), ...data });
    }
    setNotebooks(notebooks);
    closeModal('modal-notebook');
    if (editingNotebookId && currentNotebookId === editingNotebookId) {
        renderDiaryNotesList();
    } else {
        renderDiaryFolders();
    }
    showToast(editingNotebookId ? 'Notebook updated!' : 'Notebook created!');
}

async function deleteCurrentNotebook() {
    if (!editingNotebookId) return;
    if (!await showConfirm('Delete this notebook and all its notes?', 'Delete', true)) return;
    setNotebooks(getNotebooks().filter(n => n.id !== editingNotebookId));
    setNotes(getNotes().filter(n => n.notebookId !== editingNotebookId));
    closeModal('modal-notebook');
    diaryGoFolders();
    showToast('Notebook deleted.');
}

// ── Note CRUD ──
function openNewNote() {
    if (!currentNotebookId) return;
    editingDiaryId = null;
    currentMood = null;
    document.getElementById('diary-editor').style.display = 'block';
    document.getElementById('diary-empty-state').style.display = 'none';
    document.getElementById('diary-title-input').value = '';
    document.getElementById('diary-content-input').value = '';
    document.getElementById('diary-word-count').textContent = '0 words';
    document.getElementById('diary-mood-display').textContent = '';
    const now = new Date();
    document.getElementById('diary-entry-date').textContent =
        now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase();
    renderDiaryMoodBtns();
    document.getElementById('diary-title-input').focus();
    attachDiaryWordCount();
}

function renderDiaryMoodBtns() {
    const el = document.getElementById('diary-mood-btns');
    if (!el) return;
    el.innerHTML = MOODS.map(m => `
    <button class="diary-mood-btn ${currentMood === m ? 'active' : ''}"
      onclick="selectMood('${m}')"
      style="padding:5px 11px;border-radius:20px;border:1px solid var(--border);background:${currentMood === m ? 'rgba(200,169,110,0.15)' : 'var(--surface2)'};
             color:${currentMood === m ? 'var(--accent)' : 'var(--muted)'};cursor:pointer;font-size:13px;font-family:inherit;transition:all 0.2s;">
      ${m}
    </button>
  `).join('');
}

function attachDiaryWordCount() {
    const ta = document.getElementById('diary-content-input');
    ta.oninput = () => {
        const words = ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0;
        document.getElementById('diary-word-count').textContent = words + (words === 1 ? ' word' : ' words');
    };
}

function selectMood(mood) {
    currentMood = currentMood === mood ? null : mood;
    document.getElementById('diary-mood-display').textContent = currentMood ? currentMood.split(' ')[0] : '';
    renderDiaryMoodBtns();
}

function loadDiaryEntry(id) {
    const entries = getNotes();
    const entry = entries.find(e => e.id === id);
    if (!entry) return;
    editingDiaryId = id;
    document.getElementById('diary-editor').style.display = 'block';
    document.getElementById('diary-empty-state').style.display = 'none';
    document.getElementById('diary-title-input').value = entry.title || '';
    document.getElementById('diary-content-input').value = entry.content || '';
    currentMood = entry.mood || null;
    const words = (entry.content || '').trim() ? (entry.content || '').trim().split(/\s+/).length : 0;
    document.getElementById('diary-word-count').textContent = words + (words === 1 ? ' word' : ' words');
    document.getElementById('diary-mood-display').textContent = currentMood ? currentMood.split(' ')[0] : '';
    const d = new Date(entry.date + 'T00:00:00');
    document.getElementById('diary-entry-date').textContent =
        d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase();
    renderDiaryMoodBtns();
    renderDiaryNotesList();
    attachDiaryWordCount();
}

function saveDiaryEntry() {
    if (!currentNotebookId) return;
    const entries = getNotes();
    const entry = {
        id: editingDiaryId || genId(),
        notebookId: currentNotebookId,
        title: document.getElementById('diary-title-input').value.trim() || 'Untitled',
        content: document.getElementById('diary-content-input').value,
        mood: currentMood,
        date: todayStr(),
        updated: new Date().toISOString()
    };
    if (editingDiaryId) {
        const idx = entries.findIndex(e => e.id === editingDiaryId);
        entry.date = entries[idx].date;
        entries[idx] = entry;
    } else {
        entries.push(entry);
        editingDiaryId = entry.id;
    }
    setNotes(entries);
    renderDiaryNotesList();
    showToast('Note saved!');
}

async function deleteDiaryEntry() {
    if (!editingDiaryId) return;
    if (!await showConfirm('Delete this note?', 'Delete', true)) return;
    setNotes(getNotes().filter(e => e.id !== editingDiaryId));
    editingDiaryId = null;
    document.getElementById('diary-editor').style.display = 'none';
    document.getElementById('diary-empty-state').style.display = 'flex';
    renderDiaryNotesList();
}

// Legacy alias so any old code calling openNewDiaryEntry still works
function openNewDiaryEntry() { openNewNote(); }

