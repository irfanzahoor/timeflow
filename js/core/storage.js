// ============================================================
// DATA LAYER
// ============================================================
// ── Utility: HTML-escape user strings before injecting into innerHTML ──
function esc(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ── Utility: generate a collision-resistant ID ──
function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ── Utility: clamp & validate numbers ──
function safeNum(val, min = 0, max = 1e9, fallback = 0) {
    const n = parseFloat(val);
    if (!isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}
function safeInt(val, min = 0, max = 1e9, fallback = 0) {
    return Math.round(safeNum(val, min, max, fallback));
}

// ── Storage availability check ──
const _storageAvailable = (() => {
    try { localStorage.setItem('__test__', '1'); localStorage.removeItem('__test__'); return true; }
    catch { return false; }
})();

const DB = {
    _prefix: 'disc_',
    // Allowed key characters: alphanumeric, underscore, hyphen, dot
    _safeKey(key) {
        return this._prefix + String(key).replace(/[^a-zA-Z0-9_\-.]/g, '_');
    },
    get(key, def = null) {
        if (!_storageAvailable) return def;
        try {
            const v = localStorage.getItem(this._safeKey(key));
            if (v === null) return def;
            const parsed = JSON.parse(v);
            return parsed ?? def;
        } catch { return def; }
    },
    set(key, val) {
        if (!_storageAvailable) { console.warn('localStorage unavailable'); return false; }
        try {
            localStorage.setItem(this._safeKey(key), JSON.stringify(val));
            return true;
        } catch (e) {
            if (e instanceof DOMException && (
                e.code === 22 || e.code === 1014 ||
                e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED'
            )) {
                showToast('⚠️ Storage full — consider exporting & clearing old data in Settings.', 5000);
            } else {
                console.error('DB.set error:', e);
            }
            return false;
        }
    },
    remove(key) {
        if (!_storageAvailable) return;
        try { localStorage.removeItem(this._safeKey(key)); } catch { }
    },
    getDay(dateStr) { return this.get('day_' + dateStr, {}); },
    setDay(dateStr, data) { this.set('day_' + dateStr, data); },
    getDays() { return this.get('days_index', []); },
    registerDay(dateStr) {
        const days = this.getDays();
        if (!days.includes(dateStr)) { days.push(dateStr); this.set('days_index', days); }
    },
};

const PRAYERS = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
const MOODS = ['😊 Great', '😐 Okay', '😔 Rough', '💪 Productive', '😴 Tired', '🎯 Focused'];
const EVENT_COLORS = ['#7c6ef0', '#c8a96e', '#4ade80', '#f87171', '#38bdf8', '#fb923c'];

