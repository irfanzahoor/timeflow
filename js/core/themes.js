// ============================================================
// THEME ENGINE
// ============================================================
const PRESET_THEMES = [
    { id: 'midnight-gold', name: 'Midnight Gold', preset: true, bg: '#0a0a0f', surface: '#111118', surface2: '#18181f', border: '#24242e', text: '#e8e8f0', muted: '#6b6b80', accent: '#c8a96e', accent2: '#7c6ef0' },
    { id: 'deep-ocean', name: 'Deep Ocean', preset: true, bg: '#040d1a', surface: '#071428', surface2: '#0b1d38', border: '#112240', text: '#ccd6f6', muted: '#8892b0', accent: '#64ffda', accent2: '#0ff' },
    { id: 'obsidian-rose', name: 'Obsidian Rose', preset: true, bg: '#0d0a0e', surface: '#160f18', surface2: '#1e1423', border: '#2d1f33', text: '#f0e6f4', muted: '#8a7390', accent: '#e879a0', accent2: '#b06af0' },
    { id: 'forest-dusk', name: 'Forest Dusk', preset: true, bg: '#090e0a', surface: '#101810', surface2: '#162016', border: '#1f2e20', text: '#d8f0d8', muted: '#6b8870', accent: '#6fcf77', accent2: '#f0c060' },
    { id: 'slate-ember', name: 'Slate Ember', preset: true, bg: '#0e0b09', surface: '#181310', surface2: '#221a16', border: '#2e2220', text: '#f0e8e4', muted: '#80706a', accent: '#f07040', accent2: '#e0a030' },
    { id: 'arctic', name: 'Arctic', preset: true, bg: '#08090f', surface: '#10121e', surface2: '#181b2e', border: '#22263c', text: '#e4eaff', muted: '#6070a0', accent: '#60aaff', accent2: '#a060ff' },
    { id: 'carbon', name: 'Carbon', preset: true, bg: '#0a0a0a', surface: '#111111', surface2: '#1a1a1a', border: '#262626', text: '#f0f0f0', muted: '#666', accent: '#fff', accent2: '#aaa' },
    { id: 'sakura', name: 'Sakura', preset: true, bg: '#0f0a0d', surface: '#1a1018', surface2: '#231522', border: '#2e1f2c', text: '#f5e6f0', muted: '#907080', accent: '#f0a0c8', accent2: '#c070e0' },
];

function getActiveThemeId() {
    const s = DB.get('settings', {});
    return s.themeId || 'midnight-gold';
}

function getAllThemes() {
    const custom = DB.get('custom_themes', []);
    return [...PRESET_THEMES, ...custom];
}

function applyTheme(themeId) {
    const all = getAllThemes();
    const t = all.find(x => x.id === themeId) || PRESET_THEMES[0];
    const r = document.documentElement.style;
    r.setProperty('--bg', t.bg);
    r.setProperty('--surface', t.surface);
    r.setProperty('--surface2', t.surface2);
    r.setProperty('--border', t.border);
    r.setProperty('--text', t.text);
    r.setProperty('--muted', t.muted);
    r.setProperty('--accent', t.accent);
    r.setProperty('--accent2', t.accent2);
    const s = DB.get('settings', {});
    s.themeId = themeId;
    DB.set('settings', s);
    renderThemeGrid();
}

function renderThemeGrid() {
    const activeId = getActiveThemeId();
    const custom = DB.get('custom_themes', []);

    const makeCard = (t) => `
    <div class="theme-card ${t.id === activeId ? 'active-theme' : ''}"
      style="background:${t.surface}; border-color:${t.id === activeId ? t.accent : t.border};"
      onclick="applyTheme('${t.id}')">
      <div class="tc-active-badge">✓</div>
      <div class="tc-swatches">
        <div class="tc-dot" style="background:${t.bg};border:1px solid ${t.border};"></div>
        <div class="tc-dot" style="background:${t.accent};"></div>
        <div class="tc-dot" style="background:${t.accent2};"></div>
        <div class="tc-dot" style="background:${t.text}; opacity:0.6;"></div>
      </div>
      <div class="tc-name" style="color:${t.text};">${esc(t.name)}</div>
    </div>`;

    const presetGrid = document.getElementById('theme-preset-grid');
    if (presetGrid) presetGrid.innerHTML = PRESET_THEMES.map(makeCard).join('');

    const customGrid = document.getElementById('custom-themes-grid');
    if (customGrid) {
        if (!custom.length) {
            customGrid.innerHTML = '<div style="font-size:12px;color:var(--muted);grid-column:1/-1;padding:4px 0;">No custom themes yet</div>';
        } else {
            customGrid.innerHTML = custom.map(t => `
        <div class="theme-card ${t.id === activeId ? 'active-theme' : ''}"
          style="background:${t.surface}; border-color:${t.id === activeId ? t.accent : t.border}; position:relative;"
          onclick="applyTheme('${t.id}')">
          <div class="tc-active-badge">✓</div>
          <div class="tc-swatches">
            <div class="tc-dot" style="background:${t.bg};border:1px solid ${t.border};"></div>
            <div class="tc-dot" style="background:${t.accent};"></div>
            <div class="tc-dot" style="background:${t.accent2};"></div>
            <div class="tc-dot" style="background:${t.text};opacity:0.6;"></div>
          </div>
          <div class="tc-name" style="color:${t.text};">${esc(t.name)}</div>
          <button onclick="event.stopPropagation(); openThemeBuilder('${t.id}')"
            style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,0.4);border:none;
                   color:${t.muted};border-radius:4px;width:18px;height:18px;cursor:pointer;
                   font-size:10px;display:flex;align-items:center;justify-content:center;">✎</button>
        </div>
      `).join('');
        }
    }
}

let editingThemeId = null;

function openThemeBuilder(themeId) {
    editingThemeId = themeId || null;
    const custom = DB.get('custom_themes', []);
    const t = themeId ? custom.find(x => x.id === themeId) : null;

    document.getElementById('theme-modal-title').textContent = t ? 'Edit Theme' : 'Create Theme';
    document.getElementById('tb-delete-btn').style.display = t ? 'inline-flex' : 'none';

    const base = t || PRESET_THEMES[0];
    document.getElementById('tb-name').value = t ? t.name : '';
    setTbColor('tb-bg', base.bg);
    setTbColor('tb-surface', base.surface);
    setTbColor('tb-surface2', base.surface2);
    setTbColor('tb-border', base.border);
    setTbColor('tb-text', base.text);
    setTbColor('tb-muted', base.muted);
    setTbColor('tb-accent', base.accent);
    setTbColor('tb-accent2', base.accent2);
    updateThemePreview();
    openModal('modal-theme');
}

function setTbColor(id, hex) {
    const picker = document.getElementById(id);
    const hexEl = document.getElementById(id + '-hex');
    if (picker) picker.value = hex;
    if (hexEl) hexEl.value = hex;
}

function getTbValues() {
    return {
        bg: document.getElementById('tb-bg').value,
        surface: document.getElementById('tb-surface').value,
        surface2: document.getElementById('tb-surface2').value,
        border: document.getElementById('tb-border').value,
        text: document.getElementById('tb-text').value,
        muted: document.getElementById('tb-muted').value,
        accent: document.getElementById('tb-accent').value,
        accent2: document.getElementById('tb-accent2').value,
    };
}

function syncColorPicker(pickerId, hexId) {
    const hexEl = document.getElementById(hexId);
    const val = hexEl.value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
        document.getElementById(pickerId).value = val;
    }
    updateThemePreview();
}

function updateThemePreview() {
    const v = getTbValues();
    const bar = document.getElementById('theme-preview-bar');
    if (!bar) return;
    bar.style.background = v.surface;
    bar.style.border = `1px solid ${v.border}`;
    document.getElementById('tp-title').style.color = v.text;
    document.getElementById('tp-sub').style.color = v.muted;
    document.getElementById('tp-pill').style.background = v.accent + '28';
    document.getElementById('tp-pill').style.color = v.accent;
    document.getElementById('tp-pill2').style.background = v.accent2 + '28';
    document.getElementById('tp-pill2').style.color = v.accent2;
    const fields = ['bg', 'surface', 'surface2', 'border', 'text', 'muted', 'accent', 'accent2'];
    fields.forEach(f => {
        const picker = document.getElementById('tb-' + f);
        const hexEl = document.getElementById('tb-' + f + '-hex');
        if (picker && hexEl && document.activeElement !== hexEl) hexEl.value = picker.value;
    });
}

function saveCustomTheme() {
    const name = document.getElementById('tb-name').value.trim();
    if (!name) return void showToast('Give your theme a name');
    const vals = getTbValues();
    const custom = DB.get('custom_themes', []);
    if (editingThemeId) {
        const idx = custom.findIndex(t => t.id === editingThemeId);
        if (idx >= 0) { custom[idx] = { id: editingThemeId, name, preset: false, ...vals }; }
    } else {
        custom.push({ id: 'custom-' + Date.now(), name, preset: false, ...vals });
    }
    DB.set('custom_themes', custom);
    closeModal('modal-theme');
    const allNow = getAllThemes();
    const saved = editingThemeId ? allNow.find(t => t.id === editingThemeId) : allNow[allNow.length - 1];
    if (saved) applyTheme(saved.id);
    showToast(editingThemeId ? 'Theme updated!' : 'Theme created & applied!');
}

async function deleteCustomTheme() {
    if (!editingThemeId) return;
    if (!await showConfirm('Delete this theme?', 'Delete', true)) return;
    let custom = DB.get('custom_themes', []);
    custom = custom.filter(t => t.id !== editingThemeId);
    DB.set('custom_themes', custom);
    if (getActiveThemeId() === editingThemeId) applyTheme('midnight-gold');
    closeModal('modal-theme');
    renderThemeGrid();
    showToast('Theme deleted');
}

