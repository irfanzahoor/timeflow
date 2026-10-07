// ============================================================
// SETTINGS
// ============================================================
const CURRENCIES = {
    MY: 'RM', US: '$', GB: '£', EU: '€', SG: 'S$', AU: 'A$',
    JP: '¥', AE: 'د.إ', SA: 'ر.س', IN: '₹', ID: 'Rp', PH: '₱',
    TH: '฿', CN: '¥', KR: '₩', TR: '₺', BR: 'R$', CA: 'CA$',
    NG: '₦', ZA: 'R', BD: '৳' , PK: '₨', VN: '₫', RU: '₽', EG: 'ج.م', IL: '₪', AR: '$',
};

function getCurrency() {
    const s = DB.get('settings', {});
    return CURRENCIES[s.region || 'MY'] || 'RM';
}

function saveSettings() {
    const region = document.getElementById('settings-region')?.value || 'MY';
    const autoBackup = document.getElementById('pref-auto-backup')?.checked || false;
    const autoDelete = document.getElementById('pref-auto-delete')?.checked || false;
    const s = {
        region,
        weekMonday: document.getElementById('pref-week-monday')?.checked ?? true,
        showStreak: document.getElementById('pref-show-streak')?.checked ?? true,
        autoBackup,
        backupDays: parseInt(document.getElementById('pref-backup-days')?.value) || 3,
        autoDelete,
        deleteDays: parseInt(document.getElementById('pref-delete-days')?.value) || 30,
        themeId: DB.get('settings', {}).themeId || 'midnight-gold',
    };
    DB.set('settings', s);
    const cp = document.getElementById('settings-currency-preview');
    if (cp) cp.textContent = CURRENCIES[region] || region;
    const backupRow = document.getElementById('auto-backup-interval-row');
    if (backupRow) backupRow.style.display = autoBackup ? 'block' : 'none';
    const deleteRow = document.getElementById('auto-delete-row');
    if (deleteRow) deleteRow.style.display = autoDelete ? 'block' : 'none';
    updateBackupLabels();
    updateFolderDisplay();
    const moneyPage = document.getElementById('page-money');
    if (moneyPage && moneyPage.classList.contains('active')) renderMoneyPage();
}

function loadSettings() {
    const s = DB.get('settings', { region: 'MY', weekMonday: true, showStreak: true });
    const v = (id, def) => { const el = document.getElementById(id); if (el) el.value = def; };
    const c = (id, val) => { const el = document.getElementById(id); if (el) el.checked = val; };
    v('settings-region', s.region || 'MY');
    c('pref-week-monday', s.weekMonday !== false);
    c('pref-show-streak', s.showStreak !== false);
    c('pref-auto-backup', !!s.autoBackup);
    c('pref-auto-delete', !!s.autoDelete);
    v('pref-backup-days', s.backupDays || 3);
    v('pref-delete-days', s.deleteDays || 30);
    const cp = document.getElementById('settings-currency-preview');
    if (cp) cp.textContent = CURRENCIES[s.region || 'MY'] || 'RM';
    const backupRow = document.getElementById('auto-backup-interval-row');
    if (backupRow) backupRow.style.display = s.autoBackup ? 'block' : 'none';
    const deleteRow = document.getElementById('auto-delete-row');
    if (deleteRow) deleteRow.style.display = s.autoDelete ? 'block' : 'none';
    updateBackupLabels();
    updateFolderDisplay();
    renderSettingsAccount();
}

function renderSettingsAccount() {
    const session = AUTH.getSession();
    if (!session) return;
    const usernameEl = document.getElementById('acc-username');
    const emailEl = document.getElementById('acc-email');
    const avatarEl = document.getElementById('acc-avatar');
    if (usernameEl) usernameEl.textContent = session.username || '—';
    if (emailEl) emailEl.textContent = session.email || '—';
    if (avatarEl) avatarEl.textContent = (session.username || '?').charAt(0).toUpperCase();
    document.getElementById('acc-current-pwd').value = '';
    document.getElementById('acc-new-pwd').value = '';
    document.getElementById('acc-confirm-pwd').value = '';
    const msg = document.getElementById('acc-pwd-msg');
    if (msg) { msg.style.display = 'none'; }
    const delMsg = document.getElementById('acc-delete-msg');
    if (delMsg) { delMsg.style.display = 'none'; }
}

function accChangePassword() {
    const session = AUTH.getSession();
    if (!session) return;
    const current = document.getElementById('acc-current-pwd').value;
    const newPwd = document.getElementById('acc-new-pwd').value;
    const confirm = document.getElementById('acc-confirm-pwd').value;
    const msgEl = document.getElementById('acc-pwd-msg');
    const key = session.username.toLowerCase();
    const users = AUTH.getUsers();
    const storedHash = users[key]?.hash;
    const inputHash = hashPassword(current, AUTH.SALT + key);
    if (!storedHash || storedHash !== inputHash) {
        msgEl.textContent = 'Incorrect current password.';
        msgEl.style.display = 'block';
        msgEl.style.color = 'var(--danger)';
        return;
    }
    if (newPwd.length < 8) {
        msgEl.textContent = 'New password must be at least 8 characters.';
        msgEl.style.display = 'block';
        msgEl.style.color = 'var(--danger)';
        return;
    }
    if (newPwd !== confirm) {
        msgEl.textContent = 'New passwords do not match.';
        msgEl.style.display = 'block';
        msgEl.style.color = 'var(--danger)';
        return;
    }
    const newHash = hashPassword(newPwd, AUTH.SALT + key);
    users[key] = { ...users[key], hash: newHash };
    DB.set('auth_users', users);
    document.getElementById('acc-current-pwd').value = '';
    document.getElementById('acc-new-pwd').value = '';
    document.getElementById('acc-confirm-pwd').value = '';
    msgEl.textContent = 'Password updated successfully! ✓';
    msgEl.style.display = 'block';
    msgEl.style.color = 'var(--success)';
}

function accDeleteAccount() {
    const session = AUTH.getSession();
    if (!session) return;
    if (!confirm('Are you sure? This will delete your account and ALL data permanently. This cannot be undone.')) return;
    const key = session.username.toLowerCase();
    const users = AUTH.getUsers();
    delete users[key];
    DB.set('auth_users', users);
    AUTH.clearSession();
    showAuthScreen();
    showToast('Account deleted.');
    setTimeout(() => location.reload(), 500);
}

let _backupDirHandle = null;

async function pickBackupFolder() {
    if (!window.showDirectoryPicker) {
        document.getElementById('folder-api-warning').style.display = 'block';
        return;
    }
    try {
        _backupDirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        DB.set('backup_folder_name', _backupDirHandle.name);
        updateFolderDisplay();
        showToast('Folder set: ' + _backupDirHandle.name);
    } catch (e) {
        if (e.name !== 'AbortError') showToast('Could not access folder');
    }
}

function updateFolderDisplay() {
    const el = document.getElementById('backup-folder-display');
    if (!el) return;
    const saved = DB.get('backup_folder_name', null);
    if (_backupDirHandle) {
        el.textContent = '📁 ' + _backupDirHandle.name;
        el.style.color = 'var(--accent)';
    } else if (saved) {
        el.textContent = '📁 ' + saved + '  (re-pick to reconnect)';
        el.style.color = 'var(--muted)';
    } else {
        el.textContent = 'No folder selected';
        el.style.color = 'var(--muted)';
    }
}

function buildBackupData() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k.startsWith('disc_')) data[k] = localStorage.getItem(k);
    }
    return JSON.stringify(data, null, 2);
}

async function writeToFolder(json, filename) {
    const fileHandle = await _backupDirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(json);
    await writable.close();
}

async function resetAllData() {
    if (!await showConfirm('Delete ALL data permanently? This cannot be undone.\nExport a backup first if needed.', 'Delete Everything', true)) return;
    if (!await showConfirm('Last chance — wipe everything and start fresh?', 'Yes, Delete Everything', true)) return;
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('disc_')) keysToRemove.push(key);
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    showToast('All data wiped. Reloading...');
    setTimeout(() => location.reload(), 1000);
}

async function exportData(silent) {
    const json = buildBackupData();
    const filename = 'discipline-backup-' + todayStr() + '.json';
    if (_backupDirHandle) {
        try {
            await writeToFolder(json, filename);
            DB.set('last_backup', todayStr());
            if (!silent) showToast('Backup saved to ' + _backupDirHandle.name + '!');
            updateBackupLabels();
            return;
        } catch (e) {
            _backupDirHandle = null;
            updateFolderDisplay();
        }
    }
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    DB.set('last_backup', todayStr());
    if (!silent) showToast('Backup downloaded!');
    updateBackupLabels();
}

function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    // Reject suspiciously large files (>10 MB)
    if (file.size > 10 * 1024 * 1024) {
        showToast('⚠️ File too large. Max backup size is 10 MB.'); return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
        try {
            const data = JSON.parse(ev.target.result);
            if (typeof data !== 'object' || Array.isArray(data) || data === null)
                throw new Error('invalid structure');
            // Only write keys that start with our prefix; block prototype pollution
            const BLOCKED = ['__proto__', 'constructor', 'prototype'];
            let count = 0;
            Object.entries(data).forEach(([k, v]) => {
                if (BLOCKED.includes(k)) return;
                if (typeof k !== 'string') return;
                // Accept keys that start with 'disc_' (our prefix) only
                if (!k.startsWith('disc_')) return;
                if (typeof v !== 'string') return; // values must be JSON strings
                try { JSON.parse(v); } catch { return; } // ensure valid JSON
                localStorage.setItem(k, v);
                count++;
            });
            if (count === 0) throw new Error('no valid keys');
            showToast(`Data imported (${count} records)! Reloading…`);
            setTimeout(() => location.reload(), 1200);
        } catch { showToast('⚠️ Invalid backup file — make sure it is a Discipline export.'); }
    };
    reader.readAsText(file);
}
function exportRoadmapProgress() {
    const progress = DB.get('roadmap_progress', {});
    const data = { roadmap_progress: progress, exported: todayStr(), day: roadmapTodayNumber() };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'roadmap-progress-' + todayStr() + '.json';
    a.click();
    const el = document.getElementById('rm-export-status');
    if (el) el.textContent = `Exported ${Object.keys(progress).length} days · ${Object.keys(progress).filter(d => roadmapDone(d, progress)).length} complete`;
}
function importRoadmapProgress(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 1 * 1024 * 1024) { showToast('⚠️ File too large. Max 1 MB.'); return; }
    const reader = new FileReader();
    reader.onload = ev => {
        try {
            const data = JSON.parse(ev.target.result);
            if (!data.roadmap_progress || typeof data.roadmap_progress !== 'object')
                throw new Error('Invalid roadmap file format');
            const progress = data.roadmap_progress;
            const BLOCKED = ['__proto__', 'constructor', 'prototype'];
            Object.entries(progress).forEach(([k]) => { if (BLOCKED.includes(k)) delete progress[k]; });
            DB.set('roadmap_progress', progress);
            const daysCount = Object.keys(progress).length;
            const doneCount = Object.keys(progress).filter(d => roadmapDone(d, progress)).length;
            const el = document.getElementById('rm-export-status');
            if (el) el.textContent = `Imported ${daysCount} days · ${doneCount} complete`;
            showToast(`Roadmap imported (${daysCount} days, ${doneCount} complete)!`);
            renderRoadmap();
            renderRoadmapHeroWidget();
        } catch { showToast('⚠️ Invalid roadmap file.'); }
    };
    reader.readAsText(file);
}

function triggerImportFromFirstTime() {
    closeFirstTimeModal();
    setTimeout(() => document.getElementById('import-file').click(), 200);
}

function closeFirstTimeModal() {
    document.getElementById('modal-firsttime').classList.remove('open');
    DB.set('seen_welcome', true);
}

function checkFirstTimeUser() {
    const hasSeen = DB.get('seen_welcome', false);
    if (hasSeen) return;
    const days = DB.getDays();
    const hasDiary = (DB.get('diary_entries', [])).length > 0;
    const hasExpenses = (DB.get('money_expenses', [])).length > 0;
    const hasData = days.length > 0 || hasDiary || hasExpenses;
    if (!hasData) {
        setTimeout(() => { document.getElementById('modal-firsttime').classList.add('open'); }, 600);
    } else {
        DB.set('seen_welcome', true);
    }
}

function updateBackupLabels() {
    const lastBackup = DB.get('last_backup', null);
    const lbl = document.getElementById('last-backup-label');
    if (lbl) lbl.textContent = lastBackup ? 'Last backup: ' + fmtDate(lastBackup) : 'Last backup: Never';

    const s = DB.get('settings', {});
    const nextLbl = document.getElementById('next-backup-label');
    if (nextLbl && s.autoBackup && lastBackup) {
        const next = new Date(lastBackup + 'T00:00:00');
        next.setDate(next.getDate() + (s.backupDays || 3));
        const y = next.getFullYear();
        const m = String(next.getMonth() + 1).padStart(2, '0');
        const da = String(next.getDate()).padStart(2, '0');
        nextLbl.textContent = fmtDate(`${y}-${m}-${da}`);
    } else if (nextLbl) {
        nextLbl.textContent = '—';
    }
}

async function runAutoBackupIfDue() {
    const s = DB.get('settings', {});
    if (!s.autoBackup) return;
    const lastBackup = DB.get('last_backup', null);
    const intervalDays = s.backupDays || 3;
    const isDue = !lastBackup || (() => {
        const last = new Date(lastBackup + 'T00:00:00');
        const today = new Date(todayStr() + 'T00:00:00');
        return Math.floor((today - last) / 86400000) >= intervalDays;
    })();
    if (!isDue) return;
    await exportData(true);
}

function runAutoDeleteIfDue() {
    const s = DB.get('settings', {});
    if (!s.autoDelete) return;
    const days = DB.getDays();
    if (!days.length) return;
    const lastActive = days.slice().sort().reverse()[0];
    const last = new Date(lastActive + 'T00:00:00');
    const today = new Date(todayStr() + 'T00:00:00');
    const diffDays = Math.floor((today - last) / 86400000);
    const deleteDays = s.deleteDays || 30;
    if (diffDays >= deleteDays) {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k.startsWith('disc_')) keys.push(k);
        }
        keys.forEach(k => localStorage.removeItem(k));
        showToast('Auto-delete: local data cleared after ' + deleteDays + ' days of inactivity');
        setTimeout(() => location.reload(), 1500);
    }
}

