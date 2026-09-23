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

// ============================================================
// AUTH / SECURITY LAYER
// ============================================================
const AUTH = {
    SALT: 'disc_v1_salt_2026',
    getSession() { return DB.get('auth_session', null); },
    getUsers() { return DB.get('auth_users', {}); },
    setSession(user) { DB.set('auth_session', { username: user.username, email: user.email, ts: Date.now() }); },
    clearSession() { DB.remove('auth_session'); },
    isLoggedIn() { return !!this.getSession(); },
};

function hashPassword(password, salt) {
    const data = new TextEncoder().encode(salt + password);
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
        const char = data[i];
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(36) + hash.toString(16);
}

function authLogin() {
    const username = document.getElementById('auth-login-username').value.trim();
    const password = document.getElementById('auth-login-password').value;
    const remember = document.getElementById('auth-remember').checked;
    const errorEl = document.getElementById('auth-login-error');

    if (!username || !password) {
        errorEl.textContent = 'Please enter username and password.';
        errorEl.style.display = 'block';
        return;
    }

    const users = AUTH.getUsers();
    const storedHash = users[username]?.hash;
    const inputHash = hashPassword(password, AUTH.SALT + username.toLowerCase());

    if (!storedHash || storedHash !== inputHash) {
        errorEl.textContent = 'Invalid username or password.';
        errorEl.style.display = 'block';
        return;
    }

    AUTH.setSession({ username, email: users[username].email });
    if (remember) {
        localStorage.setItem('disc_remember', username);
    } else {
        localStorage.removeItem('disc_remember');
    }
    showApp();
    showToast('Welcome back, ' + username + '! 👋');
}

function authSignup() {
    const username = document.getElementById('auth-signup-username').value.trim();
    const email = document.getElementById('auth-signup-email').value.trim();
    const password = document.getElementById('auth-signup-password').value;
    const confirm = document.getElementById('auth-signup-confirm').value;
    const errorEl = document.getElementById('auth-signup-error');

    if (!username || !email || !password || !confirm) {
        errorEl.textContent = 'All fields are required.';
        errorEl.style.display = 'block';
        return;
    }
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
        errorEl.textContent = 'Username must be 3–30 characters (letters, numbers, underscore only).';
        errorEl.style.display = 'block';
        return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errorEl.textContent = 'Please enter a valid email address.';
        errorEl.style.display = 'block';
        return;
    }
    if (password.length < 8) {
        errorEl.textContent = 'Password must be at least 8 characters.';
        errorEl.style.display = 'block';
        return;
    }
    if (password !== confirm) {
        errorEl.textContent = 'Passwords do not match.';
        errorEl.style.display = 'block';
        return;
    }

    const users = AUTH.getUsers();
    const key = username.toLowerCase();
    if (users[key]) {
        errorEl.textContent = 'Username already taken. Please choose another.';
        errorEl.style.display = 'block';
        return;
    }

    const hash = hashPassword(password, AUTH.SALT + key);
    users[key] = { username, email, hash, created: todayStr() };
    DB.set('auth_users', users);
    AUTH.setSession({ username, email });

    showApp();
    showToast('Account created! Welcome, ' + username + ' 🎉');
}

function authLogout() {
    AUTH.clearSession();
    showAuthScreen();
    showToast('Signed out successfully.');
}

function showAuthLogin() {
    document.getElementById('auth-login-form').style.display = 'block';
    document.getElementById('auth-signup-form').style.display = 'none';
    document.getElementById('auth-login-error').style.display = 'none';
    document.getElementById('auth-signup-error').style.display = 'none';
}

function showAuthSignup() {
    document.getElementById('auth-login-form').style.display = 'none';
    document.getElementById('auth-signup-form').style.display = 'block';
    document.getElementById('auth-login-error').style.display = 'none';
    document.getElementById('auth-signup-error').style.display = 'none';
}

function showAuthScreen() {
    document.getElementById('auth-screen').style.display = 'flex';
    document.querySelector('.sidebar').style.display = 'none';
    document.querySelector('.main').style.display = 'none';
    document.querySelector('.mobile-menu').style.display = 'none';
}

function showApp() {
    document.getElementById('auth-screen').style.display = 'none';
    document.querySelector('.sidebar').style.display = '';
    document.querySelector('.main').style.display = '';
    document.querySelector('.mobile-menu').style.display = '';
    renderDashboard();
    updateSidebarUser();
}

function toggleAuthPasswordView(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = '🙈';
    } else {
        input.type = 'password';
        btn.textContent = '👁️';
    }
}

function updatePwdStrength() {
    const pwd = document.getElementById('auth-signup-password').value;
    const bars = [1,2,3,4].map(i => document.getElementById('pwd-bar-' + i));
    const label = document.getElementById('pwd-strength-label');

    let score = 0;
    if (pwd.length >= 8) score++;
    if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
    if (/\d/.test(pwd)) score++;
    if (/[^a-zA-Z0-9]/.test(pwd)) score++;

    const colors = ['var(--danger)', '#fb923c', '#c8a96e', 'var(--success)'];
    const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
    bars.forEach((bar, i) => {
        if (bar) {
            bar.style.background = i < score ? colors[score - 1] : 'var(--surface2)';
        }
    });
    if (label) label.textContent = pwd ? labels[score] : '';
}

function updateSidebarUser() {
    const session = AUTH.getSession();
    if (!session) return;
    const userEl = document.getElementById('sidebar-user-info');
    if (!userEl) return;
    const firstLetter = session.username ? session.username.charAt(0).toUpperCase() : '?';
    userEl.innerHTML = `<div style="display:flex; align-items:center; gap:8px;">
        <div style="width:28px;height:28px;border-radius:50%;background:rgba(200,169,110,0.15);border:1px solid rgba(200,169,110,0.3);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--accent);">${firstLetter}</div>
        <div style="flex:1;min-width:0;">
            <div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(session.username)}</div>
            <div style="font-size:10px;color:var(--muted);cursor:pointer;" onclick="authLogout()">Sign out</div>
        </div>
    </div>`;
}

// Wire up password strength on input
document.getElementById('auth-signup-password')?.addEventListener('input', updatePwdStrength);

let currentLogDate = todayStr();
let calViewDate = new Date();
let calSelectedDate = null;
let editingEventId = null;
let editingDiaryId = null;
let mealFoodItems = [];
let nutritionTab = 'today';
let moneyViewDate = new Date();
let editingExpenseId = null;

// ============================================================
// FIX: Use local date, NOT UTC — avoids timezone date shift
// ============================================================
function todayStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function fmtDate(str) {
    if (!str) return '';
    const d = new Date(str + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtDateShort(str) {
    if (!str) return '';
    const d = new Date(str + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function getWeekDates(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const mon = new Date(d.setDate(diff));
    return Array.from({ length: 7 }, (_, i) => {
        const dd = new Date(mon);
        dd.setDate(mon.getDate() + i);
        const y = dd.getFullYear();
        const mo = String(dd.getMonth() + 1).padStart(2, '0');
        const da = String(dd.getDate()).padStart(2, '0');
        return `${y}-${mo}-${da}`;
    });
}
function getLast7Days() {
    return Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - 6 + i);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const da = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${da}`;
    });
}

// ============================================================
// NAVIGATION
// ============================================================
function showPage(name) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('page-' + name).classList.add('active');
    document.getElementById('nav-' + name).classList.add('active');
    document.getElementById('sidebar').classList.remove('open');
    refreshPage(name);
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
}

function refreshPage(name) {
    switch (name) {
        case 'dashboard': renderDashboard(); break;
        case 'roadmap': renderRoadmap(); break;
        case 'crm': renderCrmPage(); break;
        case 'kpi': renderKpiPage(); break;
        case 'contenthub': renderContentHub(); break;
        case 'log': renderLog(); break;
        case 'gym': renderGym(); break;
        case 'prayers': renderPrayers(); break;
        case 'study':
            renderStudy();
            { const di = document.getElementById('acad-date-input'); if (di && !di.value) di.value = todayStr(); }
            break;
        case 'nutrition': renderNutrition(); break;
        case 'screentime': renderScreenTime(); break;
        case 'calendar': renderCalendar(); break;
        case 'diary': renderDiary(); break;
        case 'analytics': renderAnalytics(); break;
        case 'money': renderMoneyPage(); renderMoneyAveragesAndHistory(); break;
        case 'tasks': renderTasks(); break;
        case 'routine': renderRoutinePage(); break;
        case 'settings': loadSettings(); renderThemeGrid(); break;
    }
    updateRoadmapBadges();
}

// ============================================================
// DASHBOARD
// ============================================================
let dashPeriod = 'today';

function switchDashPeriod(p) {
    dashPeriod = p;
    ['today', 'week', 'month'].forEach(x => {
        document.getElementById('dash-panel-' + x).style.display = x === p ? 'block' : 'none';
    });
    document.querySelectorAll('#dash-period-toggle .toggle-btn').forEach((b, i) => {
        b.classList.toggle('active', ['today', 'week', 'month'][i] === p);
    });
    if (p === 'week') renderDashWeek();
    if (p === 'month') renderDashMonth();
}

function toggleWkDetail() {
    const s = document.getElementById('wk-detail-section');
    const b = document.getElementById('wk-detail-btn');
    const open = s.style.display !== 'none';
    s.style.display = open ? 'none' : 'block';
    b.textContent = open ? '▾ View Detailed Breakdown' : '▴ Hide Details';
    if (!open) renderDashWeekDetail();
}

function toggleMoDetail() {
    const s = document.getElementById('mo-detail-section');
    const b = document.getElementById('mo-detail-btn');
    const open = s.style.display !== 'none';
    s.style.display = open ? 'none' : 'block';
    b.textContent = open ? '▾ View Detailed Breakdown' : '▴ Hide Details';
    if (!open) renderDashMonthDetail();
}

function renderDashboard() {
    const now = new Date();
    const h = now.getHours();
    const greeting = h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';
    document.getElementById('dash-greeting').textContent = greeting + ' 👋';
    document.getElementById('dash-date-full').textContent = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    document.getElementById('sidebar-date').textContent = fmtDateShort(todayStr());
    document.getElementById('dash-streak').textContent = '🔥 ' + calcStreak() + ' day streak';
    
    // Add Roadmap Hero Widget to Dashboard
    renderRoadmapHeroWidget();
    
    renderDashToday();
    // Re-render active panel if not today
    if (dashPeriod === 'week') renderDashWeek();
    if (dashPeriod === 'month') renderDashMonth();
}

function renderDashToday() {
    const day = DB.getDay(todayStr());
    const prayers = day.prayers || [];
    const study = day.studySessions || [];
    const studyHrs = getTotalStudyHrs(todayStr());
    const weekDates = getWeekDates(todayStr());
    const gymDays = weekDates.filter(d => DB.getDay(d).gym === true).length;
    const sleepLogs = DB.get('sleep_logs', []);
    const sleepToday = sleepLogs.find(l => l.date === todayStr());
    const meals = day.meals || [];
    const sc = day.screen || {};
    const hadithToday = DB.get('hadith_log', []).filter(e => e.date === todayStr());
    const quranToday = DB.get('quran_log', []).filter(e => e.date === todayStr());
    const appToday = DB.get('app_usage_log', []).filter(e => e.date === todayStr());
    const monthStr = todayStr().slice(0, 7);
    const todayExp = DB.get('money_expenses', []).filter(e => e.date === todayStr());

    // ---- Gym schedule ----
    const gymSchedule = getGymSchedule();
    const gymGoal = gymSchedule.days && gymSchedule.days.length ? gymSchedule.days.length : 4;

    // ---- Top stats ----
    document.getElementById('dash-prayer-count').textContent = prayers.length + '/5';
    document.getElementById('dash-prayer-bar').style.width = (prayers.length / 5 * 100) + '%';
    document.getElementById('dash-study-hrs').textContent = studyHrs + 'h';
    document.getElementById('dash-study-status').textContent = study.length ? study.length + ' session(s)' : 'None logged';
    document.getElementById('dash-gym-week').textContent = gymDays + '/' + gymGoal;
    document.getElementById('dash-gym-bar').style.width = Math.min(gymDays / gymGoal * 100, 100) + '%';
    document.getElementById('dash-sleep-today').textContent = sleepToday ? sleepToday.hours + 'h' : '—';
    const qualityMap = { 1: 'Poor', 2: 'Okay', 3: 'Good', 4: 'Great' };
    document.getElementById('dash-sleep-quality').textContent = sleepToday?.quality ? qualityMap[sleepToday.quality] : (sleepToday ? 'Logged' : 'Not logged');

    // ---- Gym banner ----
    const bannerEl = document.getElementById('dash-gym-banner');
    const todayDow = new Date().getDay();
    if (gymSchedule.days && gymSchedule.days.length) {
        const isWorkoutDay = gymSchedule.days.includes(todayDow);
        const assign = gymSchedule.assignments[todayDow] || null;
        const logged = day.gym;
        if (isWorkoutDay) {
            if (logged === true) {
                bannerEl.innerHTML = `<div class="gym-banner workout-day">
          <div style="font-size:26px;">🏆</div>
          <div>
            <div style="font-size:14px; font-weight:600; color:#a78ef0;">Workout done for today!</div>
            <div style="font-size:12px; color:var(--muted); margin-top:3px;">${day.gymType ? day.gymType : assign || 'Session logged'}${day.gymDuration ? ' · ' + day.gymDuration + ' min' : ''} — great work, keep it up.</div>
          </div>
        </div>`;
            } else if (day.gymSkipped) {
                bannerEl.innerHTML = `<div class="gym-banner" style="background:rgba(248,113,113,0.08);border:1px solid rgba(248,113,113,0.25);">
          <div style="font-size:26px;">😬</div>
          <div style="flex:1;">
            <div style="font-size:14px; font-weight:600; color:var(--danger);">Skipped today.</div>
            <div style="font-size:12px; color:var(--muted); margin-top:3px;">It happens — don't let it become a habit. Show up tomorrow strong.</div>
          </div>
        </div>`;
            } else {
                bannerEl.innerHTML = `<div class="gym-banner workout-day">
          <div style="font-size:26px;">🏋️</div>
          <div style="flex:1;">
            <div style="font-size:14px; font-weight:600; color:#a78ef0;">It's a workout day!</div>
            <div style="font-size:12px; color:var(--muted); margin-top:3px;">${assign ? 'Scheduled: <b style="color:#a78ef0;">' + assign + '</b>' : 'You\'ve got a session scheduled today.'} Don't skip — you've got this.</div>
          </div>
          <button class="btn" style="background:var(--accent2);color:#fff;padding:8px 14px;font-size:12px;flex-shrink:0;" onclick="showPage('gym')">Log it →</button>
        </div>`;
            }
        } else {
            if (logged === false || logged === undefined) {
                bannerEl.innerHTML = `<div class="gym-banner rest-day">
          <div style="font-size:26px;">😴</div>
          <div>
            <div style="font-size:14px; font-weight:600; color:var(--success);">Rest day — recover well.</div>
            <div style="font-size:12px; color:var(--muted); margin-top:3px;">No gym scheduled today. Sleep, eat well, and come back strong.</div>
          </div>
        </div>`;
            } else {
                bannerEl.innerHTML = `<div class="gym-banner rest-day">
          <div style="font-size:26px;">💪</div>
          <div>
            <div style="font-size:14px; font-weight:600; color:var(--success);">Bonus session logged!</div>
            <div style="font-size:12px; color:var(--muted); margin-top:3px;">Today was a rest day but you trained anyway — respect.</div>
          </div>
        </div>`;
            }
        }
    } else {
        bannerEl.innerHTML = '';
    }

    // ---- Completion ring ----
    const tasks = [
        prayers.length === 5,
        day.gym !== undefined,
        study.length > 0,
        !!sleepToday,
        meals.length > 0,
        hadithToday.length > 0 || quranToday.length > 0,
        (sc.total || 0) > 0 || appToday.length > 0,
    ];
    const done = tasks.filter(Boolean).length;
    const pct = Math.round(done / tasks.length * 100);
    const circ = 2 * Math.PI * 36;
    document.getElementById('dash-ring-arc').style.strokeDashoffset = circ - (circ * pct / 100);
    document.getElementById('dash-ring-pct').textContent = pct + '%';
    document.getElementById('dash-ring-label').textContent = done + ' of ' + tasks.length + ' tasks';

    // ---- Prayers detail ----
    const pDone = prayers.length;
    document.getElementById('dash-prayer-pill').textContent = pDone + '/5';
    document.getElementById('dash-prayer-pill').className = 'pill ' + (pDone === 5 ? 'pill-green' : pDone >= 3 ? 'pill-yellow' : 'pill-red');
    document.getElementById('dash-prayers-detail').innerHTML = PRAYERS.map(p => `
    <span style="padding:5px 10px; border-radius:6px; font-size:12px; font-weight:500;
      background:${prayers.includes(p) ? 'rgba(74,222,128,0.12)' : 'var(--surface2)'};
      color:${prayers.includes(p) ? 'var(--success)' : 'var(--muted)'};
      border:1px solid ${prayers.includes(p) ? 'rgba(74,222,128,0.25)' : 'var(--border)'};
    ">${prayers.includes(p) ? '✓' : '○'} ${p}</span>
  `).join('');

    // ---- Gym detail ----
    const gPill = document.getElementById('dash-gym-pill');
    if (day.gym === true) { gPill.textContent = '✓ Done'; gPill.className = 'pill pill-green'; }
    else if (day.gymSkipped) { gPill.textContent = '✕ Skipped'; gPill.className = 'pill pill-red'; }
    else if (day.gym === false) { gPill.textContent = '😴 Rest'; gPill.className = 'pill pill-yellow'; }
    else {
        const isWDay = gymSchedule.days && gymSchedule.days.includes(todayDow);
        gPill.textContent = isWDay ? '📅 Scheduled' : 'Not logged';
        gPill.className = isWDay ? 'pill pill-purple' : 'pill pill-yellow';
    }
    const scheduledType = gymSchedule.assignments && gymSchedule.assignments[todayDow];
    document.getElementById('dash-gym-detail').innerHTML = day.gym === true
        ? `<div style="font-size:12px; color:var(--muted);">${day.gymType || ''}${day.gymDuration ? ' · ' + day.gymDuration + ' min' : ''}${day.gymNotes ? '<br>' + day.gymNotes : ''}</div><div style="font-size:11px; color:var(--muted); margin-top:4px;">Week: ${gymDays}/${gymGoal} sessions</div>`
        : day.gymSkipped ? '<div style="font-size:12px; color:var(--danger);">Session skipped — get back on track tomorrow.</div>'
            : day.gym === false ? '<div style="font-size:12px; color:var(--muted);">Rest day — recovering well.</div>'
                : scheduledType ? `<div style="font-size:12px; color:var(--accent2);">Today: ${scheduledType}</div><div style="font-size:11px; color:var(--muted); margin-top:3px;">Not logged yet</div>`
                    : '<div style="font-size:12px; color:var(--muted);">Not logged today</div>';

    // ---- Study detail ----
    const sPill = document.getElementById('dash-study-pill');
    sPill.textContent = studyHrs + 'h';
    const studyGoals = getStudyGoals();
    const studyMin = studyGoals.overall?.min || 0;
    const studyMax = studyGoals.overall?.max || 0;
    sPill.className = 'pill ' + (studyHrs >= 2 ? 'pill-green' : studyHrs > 0 ? 'pill-yellow' : 'pill-red');
    let studyDetailHtml = study.length
        ? study.map(s => `<div style="font-size:12px; padding:4px 0; border-bottom:1px solid var(--border); display:flex; justify-content:space-between;"><span>${esc(s.topic)}</span><span style="color:var(--muted);">${s.hrs}h</span></div>`).join('')
        : '<div style="font-size:12px; color:var(--muted);">No study sessions today</div>';
    if (studyMin || studyMax) {
        const target = studyMin || studyMax;
        const pct = target > 0 ? Math.min(studyHrs / target * 100, 100) : 0;
        const over = studyMax > 0 && studyHrs > studyMax;
        const met = studyMin > 0 && studyHrs >= studyMin;
        const barColor = over ? 'var(--danger)' : met ? 'var(--success)' : 'var(--accent2)';
        const goalLabel = studyMin && studyMax ? `${studyMin}–${studyMax}h goal` : studyMin ? `min ${studyMin}h` : `max ${studyMax}h`;
        studyDetailHtml += `<div style="margin-top:8px;">
      <div style="font-size:10px; color:var(--muted); margin-bottom:3px; display:flex; justify-content:space-between;">
        <span>${goalLabel}</span>
        <span style="color:${over ? 'var(--danger)' : met ? 'var(--success)' : 'var(--muted)'};">${over ? 'Over max' : met ? '✓ Met' : '' + studyHrs + 'h done'}</span>
      </div>
      <div class="progress-bar" style="height:5px;">
        <div class="progress-fill" style="width:${pct.toFixed(1)}%; background:${barColor}; height:5px;"></div>
      </div>
    </div>`;
    }
    document.getElementById('dash-study-detail').innerHTML = studyDetailHtml;

    // ---- Sleep detail ----
    const slPill = document.getElementById('dash-sleep-pill');
    const sleepGoal = getSleepGoal();
    if (sleepToday) {
        const q = sleepToday.quality ? qualityMap[sleepToday.quality] : '';
        const goalMet = sleepGoal.hrs && sleepToday.hours >= sleepGoal.hrs;
        const goalOver = sleepGoal.hrs && sleepToday.hours > sleepGoal.hrs + 1;
        const pilClass = goalMet ? 'pill-green' : sleepToday.hours >= 7 ? 'pill-green' : sleepToday.hours >= 5 ? 'pill-yellow' : 'pill-red';
        slPill.textContent = sleepToday.hours + 'h' + (q ? ' · ' + q : '');
        slPill.className = 'pill ' + pilClass;
        let sleepDetailHtml = `<div style="font-size:12px; color:var(--muted);">${sleepToday.bedtime} → ${sleepToday.waketime}</div>
      ${sleepToday.notes ? `<div style="font-size:11px; color:var(--muted); margin-top:3px;">${sleepToday.notes}</div>` : ''}`;
        if (sleepGoal.hrs) {
            const pct = Math.min(sleepToday.hours / sleepGoal.hrs * 100, 100);
            const col = goalOver ? 'var(--accent)' : goalMet ? 'var(--success)' : 'var(--danger)';
            const lbl = goalOver ? 'Overslept a bit' : goalMet ? '✓ Goal met' : `${(sleepGoal.hrs - sleepToday.hours).toFixed(1)}h short of ${sleepGoal.hrs}h goal`;
            sleepDetailHtml += `<div style="margin-top:8px;">
        <div class="progress-bar" style="height:5px;">
          <div class="progress-fill" style="height:5px; width:${pct.toFixed(1)}%; background:${col};"></div>
        </div>
        <div style="font-size:10px; color:${col}; margin-top:2px;">${lbl}</div>
      </div>`;
        }
        document.getElementById('dash-sleep-detail').innerHTML = sleepDetailHtml;
    } else {
        slPill.textContent = 'Not logged'; slPill.className = 'pill pill-yellow';
        const goalLine = sleepGoal.hrs ? `<div style="font-size:11px; color:var(--muted); margin-top:3px;">Goal: ${sleepGoal.hrs}h</div>` : '';
        document.getElementById('dash-sleep-detail').innerHTML = `<div style="font-size:12px; color:var(--muted);">No sleep logged</div>${goalLine}`;
    }

    // ---- Nutrition detail ----
    let totCal = 0, totProt = 0, totCarbs = 0;
    meals.forEach(m => { (m.items || []).forEach(i => { totCal += i.cal || 0; totProt += i.protein || 0; totCarbs += i.carbs || 0; }); });
    const nPill = document.getElementById('dash-nutr-pill');
    nPill.textContent = Math.round(totCal) + ' kcal';
    nPill.className = 'pill ' + (meals.length > 0 ? 'pill-green' : 'pill-yellow');
    document.getElementById('dash-nutr-detail').innerHTML = meals.length
        ? `<div style="display:flex; gap:12px; flex-wrap:wrap; font-size:12px;">
        <span><b>${Math.round(totCal)}</b> <span style="color:var(--muted);">kcal</span></span>
        <span><b>${Math.round(totProt)}g</b> <span style="color:var(--muted);">protein</span></span>
        <span><b>${Math.round(totCarbs)}g</b> <span style="color:var(--muted);">carbs</span></span>
        <span><b>${meals.length}</b> <span style="color:var(--muted);">meals</span></span>
       </div>`
        : '<div style="font-size:12px; color:var(--muted);">No meals logged</div>';

    // ---- Deen (Hadith + Quran) detail ----
    const hadithCount = hadithToday.reduce((a, e) => a + (e.count || 1), 0);
    const quranPages = quranToday.reduce((a, e) => a + (e.pages || 0), 0);
    const deenPill = document.getElementById('dash-deen-pill');
    const deenDone = hadithCount > 0 || quranToday.length > 0;
    deenPill.textContent = deenDone ? (hadithCount > 0 ? hadithCount + ' hadith' : '') + (hadithCount > 0 && quranToday.length > 0 ? ' · ' : '') + (quranToday.length > 0 ? quranPages + ' pg Quran' : '') : 'Not logged';
    deenPill.className = 'pill ' + (deenDone ? 'pill-green' : 'pill-yellow');
    document.getElementById('dash-deen-detail').innerHTML = deenDone ? `
    ${hadithCount > 0 ? `<div style="font-size:12px; margin-bottom:3px;">📖 ${hadithCount} hadith from: ${hadithToday.map(e => e.book).join(', ')}</div>` : ''}
    ${quranToday.length > 0 ? `<div style="font-size:12px;">🕌 ${quranPages} pages — ${quranToday.map(e => e.surah + (e.ayah ? ' (' + e.ayah + ')' : '')).join(', ')}</div>` : ''}
  ` : '<div style="font-size:12px; color:var(--muted);">No Hadith or Quran logged</div>';

    // ---- Screen + Apps detail ----
    const totalAppMins = appToday.reduce((a, e) => a + (e.mins || 0), 0);
    const screenHrs = sc.total || (totalAppMins > 0 ? +(totalAppMins / 60).toFixed(1) : 0);
    const scPill = document.getElementById('dash-screen-pill');
    scPill.textContent = screenHrs > 0 ? screenHrs + 'h' : '0h';
    scPill.className = 'pill ' + (screenHrs <= 3 ? 'pill-green' : screenHrs <= 5 ? 'pill-yellow' : 'pill-red');
    const topApp = appToday.sort((a, b) => b.mins - a.mins)[0];
    document.getElementById('dash-screen-detail').innerHTML = screenHrs > 0
        ? `<div style="font-size:12px; color:var(--muted);">${screenHrs}h total${sc.productive ? ' · ' + sc.productive + 'h productive' : ''}</div>
       ${topApp ? `<div style="font-size:11px; color:var(--muted); margin-top:3px;">Top app: ${topApp.name} (${topApp.mins} min)</div>` : ''}`
        : '<div style="font-size:12px; color:var(--muted);">Not logged</div>';

    // ---- Money detail ----
    const todaySpent = todayExp.reduce((a, e) => a + (e.amount || 0), 0);
    const mPill = document.getElementById('dash-money-pill');
    mPill.textContent = todayExp.length ? getCurrency() + ' ' + todaySpent.toFixed(2) : 'None today';
    mPill.className = 'pill ' + (todayExp.length ? 'pill-yellow' : 'pill-green');
    document.getElementById('dash-money-detail').innerHTML = todayExp.length
        ? todayExp.slice(0, 3).map(e => `<div style="font-size:12px; display:flex; justify-content:space-between;"><span>${esc(e.desc)}</span><span style="color:var(--danger);">-${getCurrency()}${e.amount.toFixed(2)}</span></div>`).join('')
        + (todayExp.length > 3 ? `<div style="font-size:11px; color:var(--muted); margin-top:3px;">+${todayExp.length - 3} more</div>` : '')
        : '<div style="font-size:12px; color:var(--muted);">No expenses today</div>';

    // ---- Events ----
    const events = DB.get('events', []);
    const today2 = todayStr();
    const upcoming = events.filter(e => e.start >= today2).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 4);
    document.getElementById('dash-events-preview').innerHTML = upcoming.length ? upcoming.map(e => `
    <div style="display:flex; align-items:center; gap:8px; padding:7px 0; border-bottom:1px solid var(--border);">
      <div style="width:7px; height:7px; border-radius:50%; background:${e.color || 'var(--accent2)'}; flex-shrink:0;"></div>
      <div><div style="font-size:13px; font-weight:500;">${esc(e.title)}</div>
      <div style="font-size:11px; color:var(--muted);">${fmtDateShort(e.start)}${e.end ? ' → ' + fmtDateShort(e.end) : ''}</div></div>
    </div>`).join('')
        : '<div style="font-size:13px; color:var(--muted);">No upcoming events</div>';

}


function renderDashWeek() {
    const weekDates = getWeekDates(todayStr());
    const allDays = weekDates.map(d => DB.getDay(d));

    const prayerAvg = (weekDates.reduce((a, d) => a + (DB.getDay(d).prayers || []).length, 0) / 7).toFixed(1);
    const gymCount = weekDates.filter(d => DB.getDay(d).gym === true).length;
    const studyHrs = weekDates.reduce((a, d) => a + getTotalStudyHrs(d), 0);
    const sleepLogs = DB.get('sleep_logs', []).filter(l => weekDates.includes(l.date));
    const sleepAvg = sleepLogs.length ? (sleepLogs.reduce((a, l) => a + l.hours, 0) / sleepLogs.length).toFixed(1) : null;
    const screenAvg = (weekDates.reduce((a, d) => a + (DB.getDay(d).screen?.total || 0), 0) / 7).toFixed(1);
    const weekExp = DB.get('money_expenses', []).filter(e => weekDates.includes(e.date));
    const weekSpent = weekExp.reduce((a, e) => a + (e.amount || 0), 0);

    document.getElementById('wk-prayers').textContent = prayerAvg + '/5';
    document.getElementById('wk-gym').textContent = gymCount + '/7';
    document.getElementById('wk-study').textContent = studyHrs.toFixed(1) + 'h';
    document.getElementById('wk-sleep').textContent = sleepAvg ? sleepAvg + 'h' : '—';
    document.getElementById('wk-screen').textContent = screenAvg + 'h';
    document.getElementById('wk-money').textContent = getCurrency() + ' ' + weekSpent.toFixed(0);
}

function renderDashWeekDetail() {
    const weekDates = getWeekDates(todayStr());
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    // Prayers per day
    document.getElementById('wk-prayers-detail').innerHTML = weekDates.map((d, i) => {
        const cnt = (DB.getDay(d).prayers || []).length;
        const w = cnt / 5 * 100;
        return `<div style="margin-bottom:6px;">
      <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--muted); margin-bottom:2px;"><span>${dayNames[i]}</span><span>${cnt}/5</span></div>
      <div style="height:4px; background:var(--surface2); border-radius:2px;"><div style="height:4px; width:${w}%; background:${cnt === 5 ? 'var(--success)' : cnt >= 3 ? 'var(--accent)' : 'var(--danger)'}; border-radius:2px;"></div></div>
    </div>`;
    }).join('');

    // Study sessions
    const allStudy = [];
    weekDates.forEach(d => (DB.getDay(d).studySessions || []).forEach(s => allStudy.push({ ...s, date: d })));
    weekDates.forEach(d => DB.get('acad_study_log', []).filter(e => e.date === d).forEach(e => allStudy.push({ hrs: e.hrs, topic: e.subject + ' (' + e.type + ')', date: d })));
    weekDates.forEach(d => DB.get('book_log', []).filter(e => e.date === d).forEach(e => allStudy.push({ hrs: +(e.mins / 60).toFixed(1), topic: e.title + ' (Book)', date: d })));
    weekDates.forEach(d => DB.get('skill_log', []).filter(e => e.date === d).forEach(e => allStudy.push({ hrs: +(e.mins / 60).toFixed(1), topic: e.name + ' (Skill)', date: d })));
    document.getElementById('wk-study-detail').innerHTML = allStudy.length
        ? allStudy.map(s => `<div style="font-size:12px; display:flex; justify-content:space-between; padding:3px 0; border-bottom:1px solid var(--border);"><span>${esc(s.topic)}</span><span style="color:var(--muted);">${s.hrs}h · ${fmtDateShort(s.date)}</span></div>`).join('')
        : '<div style="font-size:12px; color:var(--muted);">No sessions this week</div>';

    // Sleep
    const sleepLogs = DB.get('sleep_logs', []).filter(l => weekDates.includes(l.date)).sort((a, b) => a.date.localeCompare(b.date));
    document.getElementById('wk-sleep-detail').innerHTML = sleepLogs.length
        ? sleepLogs.map(l => `<div style="font-size:12px; display:flex; justify-content:space-between; padding:3px 0; border-bottom:1px solid var(--border);"><span>${fmtDateShort(l.date)}</span><span style="color:var(--muted);">${l.hours}h${l.quality ? ' · ' + ['', 'Poor', 'Okay', 'Good', 'Great'][l.quality] : ''}</span></div>`).join('')
        : '<div style="font-size:12px; color:var(--muted);">No sleep logs this week</div>';

    // Top apps
    const appLogs = DB.get('app_usage_log', []).filter(e => weekDates.includes(e.date));
    const appTotals = {};
    appLogs.forEach(e => { appTotals[e.name] = (appTotals[e.name] || 0) + e.mins; });
    const sorted = Object.entries(appTotals).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const maxM = sorted[0]?.[1] || 1;
    document.getElementById('wk-apps-detail').innerHTML = sorted.length
        ? sorted.map(([name, mins]) => `<div style="margin-bottom:7px;">
        <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:2px;"><span>${esc(name)}</span><span style="color:var(--muted);">${mins}m</span></div>
        <div style="height:4px; background:var(--surface2); border-radius:2px;"><div style="height:4px; width:${Math.round(mins / maxM * 100)}%; background:var(--accent2); border-radius:2px;"></div></div>
      </div>`).join('')
        : '<div style="font-size:12px; color:var(--muted);">No app usage logged</div>';
}

function renderDashMonth() {
    const monthStr = todayStr().slice(0, 7);
    const allDays = DB.getDays().filter(d => d.startsWith(monthStr));
    const allStudyDates = getAllStudyDates().filter(d => d.startsWith(monthStr));

    const perfectPrayers = allDays.filter(d => (DB.getDay(d).prayers || []).length === 5).length;
    const gymCount = allDays.filter(d => DB.getDay(d).gym === true).length;
    const studyHrs = allStudyDates.reduce((a, d) => a + getTotalStudyHrs(d), 0);
    const sleepLogs = DB.get('sleep_logs', []).filter(l => l.date.startsWith(monthStr));
    const sleepAvg = sleepLogs.length ? (sleepLogs.reduce((a, l) => a + l.hours, 0) / sleepLogs.length).toFixed(1) : null;
    const monthExp = DB.get('money_expenses', []).filter(e => e.date?.startsWith(monthStr));
    const monthSpent = monthExp.reduce((a, e) => a + (e.amount || 0), 0);
    const hadithCount = DB.get('hadith_log', []).filter(e => e.date?.startsWith(monthStr)).reduce((a, e) => a + (e.count || 1), 0);

    document.getElementById('mo-prayers').textContent = perfectPrayers + ' days';
    document.getElementById('mo-gym').textContent = gymCount;
    document.getElementById('mo-study').textContent = studyHrs.toFixed(1) + 'h';
    document.getElementById('mo-sleep').textContent = sleepAvg ? sleepAvg + 'h' : '—';
    document.getElementById('mo-money').textContent = getCurrency() + ' ' + monthSpent.toFixed(0);
    document.getElementById('mo-hadith').textContent = hadithCount;
}

function renderDashMonthDetail() {
    const monthStr = todayStr().slice(0, 7);
    const allDays = DB.getDays().filter(d => d.startsWith(monthStr));
    const allStudyDatesMo = getAllStudyDates().filter(d => d.startsWith(monthStr));

    // Gym by week
    const weeks = [];
    for (let i = 0; i < allDays.length; i += 7) weeks.push(allDays.slice(i, i + 7));
    document.getElementById('mo-gym-detail').innerHTML = weeks.map((wk, i) => {
        const cnt = wk.filter(d => DB.getDay(d).gym === true).length;
        return `<div style="margin-bottom:6px;">
      <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--muted); margin-bottom:2px;"><span>Week ${i + 1}</span><span>${cnt} sessions</span></div>
      <div style="height:4px; background:var(--surface2); border-radius:2px;"><div style="height:4px; width:${Math.round(cnt / 4 * 100)}%; background:var(--accent2); border-radius:2px;"></div></div>
    </div>`;
    }).join('') || '<div style="font-size:12px; color:var(--muted);">No data</div>';

    // Study by subject — scan all separate logs
    const subjectMap = {};
    allStudyDatesMo.forEach(d => {
        (DB.getDay(d).studySessions || []).forEach(s => { subjectMap[s.topic] = (subjectMap[s.topic] || 0) + s.hrs; });
        DB.get('acad_study_log', []).filter(e => e.date === d).forEach(e => { subjectMap[e.subject] = (subjectMap[e.subject] || 0) + e.hrs; });
        DB.get('book_log', []).filter(e => e.date === d).forEach(e => { const k = e.title + ' (Book)'; subjectMap[k] = (subjectMap[k] || 0) + e.mins / 60; });
        DB.get('skill_log', []).filter(e => e.date === d).forEach(e => { const k = e.name + ' (Skill)'; subjectMap[k] = (subjectMap[k] || 0) + e.mins / 60; });
        DB.get('quran_log', []).filter(e => e.date === d).forEach(e => { subjectMap['Quran'] = (subjectMap['Quran'] || 0) + (e.mins || (e.pages || 0)) / 60; });
        DB.get('hadith_log', []).filter(e => e.date === d).forEach(e => { subjectMap['Hadith'] = (subjectMap['Hadith'] || 0) + ((e.count || 1) * 5) / 60; });
    });
    const sortedSub = Object.entries(subjectMap).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const maxSub = sortedSub[0]?.[1] || 1;
    document.getElementById('mo-study-detail').innerHTML = sortedSub.length
        ? sortedSub.map(([t, h]) => `<div style="margin-bottom:6px;">
        <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:2px;"><span>${t}</span><span style="color:var(--muted);">${h}h</span></div>
        <div style="height:4px; background:var(--surface2); border-radius:2px;"><div style="height:4px; width:${Math.round(h / maxSub * 100)}%; background:var(--accent); border-radius:2px;"></div></div>
      </div>`).join('')
        : '<div style="font-size:12px; color:var(--muted);">No study data</div>';

    // Expense categories
    const monthExp = DB.get('money_expenses', []).filter(e => e.date?.startsWith(monthStr));
    const catMap = {};
    monthExp.forEach(e => { catMap[e.category] = (catMap[e.category] || 0) + (e.amount || 0); });
    const sortedCat = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const maxCat = sortedCat[0]?.[1] || 1;
    document.getElementById('mo-money-detail').innerHTML = sortedCat.length
        ? sortedCat.map(([cat, amt]) => `<div style="margin-bottom:6px;">
        <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:2px;"><span>${esc(cat)}</span><span style="color:var(--danger);">${getCurrency()}${amt.toFixed(0)}</span></div>
        <div style="height:4px; background:var(--surface2); border-radius:2px;"><div style="height:4px; width:${Math.round(amt / maxCat * 100)}%; background:var(--danger); border-radius:2px; opacity:0.7;"></div></div>
      </div>`).join('')
        : '<div style="font-size:12px; color:var(--muted);">No expenses this month</div>';

    // Quran surahs
    const quranMonth = DB.get('quran_log', []).filter(e => e.date?.startsWith(monthStr));
    const surahMap = {};
    quranMonth.forEach(e => { surahMap[e.surah || 'Unknown'] = (surahMap[e.surah || 'Unknown'] || 0) + (e.pages || 0); });
    document.getElementById('mo-quran-detail').innerHTML = Object.keys(surahMap).length
        ? Object.entries(surahMap).sort((a, b) => b[1] - a[1]).map(([s, p]) => `
        <div style="font-size:12px; display:flex; justify-content:space-between; padding:3px 0; border-bottom:1px solid var(--border);"><span>${s}</span><span style="color:var(--muted);">${p}pg</span></div>`).join('')
        : '<div style="font-size:12px; color:var(--muted);">No Quran logged this month</div>';
}

function calcStreak() {
    let streak = 0;
    const d = new Date();
    while (true) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const da = String(d.getDate()).padStart(2, '0');
        const str = `${y}-${m}-${da}`;
        const day = DB.getDay(str);
        const hasActivity = (day.prayers || []).length > 0 || day.gym !== undefined || getTotalStudyHrs(str) > 0;
        if (!hasActivity) break;
        streak++;
        d.setDate(d.getDate() - 1);
    }
    return streak;
}

// ============================================================
// DAILY LOG
// ============================================================
function loadToday() {
    currentLogDate = todayStr();
    document.getElementById('log-date-select').value = currentLogDate;
    renderLog();
}

function loadLogForDate() {
    currentLogDate = document.getElementById('log-date-select').value || todayStr();
    renderLog();
}

// ============================================================
// DAILY LOG — SMART CHECKLIST
// ============================================================
function renderLog() {
    document.getElementById('log-date-select').value = currentLogDate;
    const day = DB.getDay(currentLogDate);
    const prayers = day.prayers || [];
    const study = day.studySessions || [];
    const totalStudyHrs = getTotalStudyHrs(currentLogDate);
    const meals = day.meals || [];
    const sc = day.screen || {};
    const sleepLogs = DB.get('sleep_logs', []);
    const sleepEntry = sleepLogs.find(l => l.date === currentLogDate);
    const hadithLog = DB.get('hadith_log', []).filter(e => e.date === currentLogDate);
    const quranLog = DB.get('quran_log', []).filter(e => e.date === currentLogDate);
    const appLog = DB.get('app_usage_log', []).filter(e => e.date === currentLogDate);

    const checks = [
        {
            icon: '📿', label: 'Prayers',
            done: prayers.length === 5,
            summary: prayers.length === 5
                ? 'All 5 prayers completed ✓'
                : prayers.length > 0
                    ? `${prayers.length}/5 — missing: ${['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'].filter(p => !prayers.includes(p)).join(', ')}`
                    : 'Not logged yet',
            link: 'prayers'
        },
        {
            icon: '💪', label: 'Gym / Rest Day',
            done: day.gym !== undefined || day.gymSkipped,
            summary: day.gym === true
                ? `Gym ✓${day.gymType ? ' — ' + day.gymType : ''}${day.gymDuration ? ' · ' + day.gymDuration + ' min' : ''}${day.gymNotes ? ' · ' + day.gymNotes : ''}`
                : day.gymSkipped ? '❌ Skipped'
                    : day.gym === false ? 'Rest day logged' : 'Not logged yet',
            link: 'gym'
        },
        {
            icon: '😴', label: 'Sleep',
            done: !!sleepEntry,
            summary: sleepEntry ? `${sleepEntry.hours}h · ${sleepEntry.bedtime} → ${sleepEntry.waketime}${sleepEntry.quality ? ' · ' + ['', 'Poor', 'Okay', 'Good', 'Great'][sleepEntry.quality] : ''}` : 'Not logged yet',
            link: 'gym'
        },
        {
            icon: '📚', label: 'Study',
            done: totalStudyHrs > 0,
            summary: totalStudyHrs > 0 ? `${totalStudyHrs}h total (academic, books, skills, Quran & Hadith)` : 'Not logged yet',
            link: 'study'
        },
        {
            icon: '🥗', label: 'Nutrition',
            done: meals.length > 0,
            summary: (() => { let c = 0, p = 0; meals.forEach(m => (m.items || []).forEach(i => { c += i.cal || 0; p += i.protein || 0; })); return meals.length > 0 ? `${meals.length} meals · ${Math.round(c)} kcal · ${Math.round(p)}g protein` : 'Not logged yet'; })(),
            link: 'nutrition'
        },
        {
            icon: '📖', label: 'Hadith & Quran',
            done: hadithLog.length > 0 || quranLog.length > 0,
            summary: [
                hadithLog.length > 0 ? `${hadithLog.reduce((a, e) => a + (e.count || 1), 0)} hadiths` : '',
                quranLog.length > 0 ? `${quranLog.reduce((a, e) => a + (e.pages || 0), 0)} pages Quran` : ''
            ].filter(Boolean).join(' · ') || 'Not logged yet',
            link: 'prayers'
        },
        {
            icon: '📱', label: 'Screen Time',
            done: appLog.length > 0 || (sc.total || 0) > 0,
            summary: appLog.length > 0 ? `${calcTotalScreenHrs(appLog)}h · ${appLog.length} app(s)` : (sc.total || 0) > 0 ? `${sc.total}h total` : 'Not logged yet',
            link: 'screentime'
        },
    ];

    const doneCount = checks.filter(c => c.done).length;
    document.getElementById('log-completion-badge').innerHTML =
        `<span class="streak-badge" style="font-size:12px;">${doneCount}/${checks.length} logged</span>`;

    document.getElementById('log-checklist-items').innerHTML = checks.map(c => {
        const statusColor = c.done ? 'var(--success)' : 'var(--accent)';
        const statusIcon = c.done
            ? `<div style="width:28px;height:28px;border-radius:50%;background:rgba(74,222,128,0.15);border:2px solid var(--success);display:flex;align-items:center;justify-content:center;flex-shrink:0;"><svg width="11" height="9" viewBox="0 0 11 9" fill="none"><path d="M1 4.5L4.5 8L10 1" stroke="var(--success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`
            : `<div style="width:28px;height:28px;border-radius:50%;background:rgba(200,169,110,0.08);border:2px solid var(--border);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:13px;color:var(--muted);">○</div>`;
        return `
    <div style="border:1px solid ${c.done ? 'rgba(74,222,128,0.2)' : 'var(--border)'}; border-radius:12px; background:var(--surface); padding:14px 16px; display:flex; align-items:center; gap:12px;">
      ${statusIcon}
      <div style="flex:1; min-width:0;">
        <div style="font-size:14px; font-weight:600;">${c.icon} ${c.label}</div>
        <div style="font-size:12px; color:${c.done ? 'var(--success)' : 'var(--muted)'}; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${c.summary}</div>
      </div>
      ${!c.done ? `<button class="btn btn-secondary" onclick="showPage('${c.link}')" style="font-size:12px; padding:6px 14px; flex-shrink:0;">Log →</button>` : ''}
    </div>`;
    }).join('');
}

function buildCheckCard(s) {
    const borderColor = s.done ? 'var(--success)' : 'var(--accent)';
    const icon = s.done
        ? `<div style="width:26px;height:26px;border-radius:50%;background:rgba(74,222,128,0.15);border:2px solid var(--success);display:flex;align-items:center;justify-content:center;flex-shrink:0;"><svg width="11" height="9" viewBox="0 0 11 9" fill="none"><path d="M1 4.5L4.5 8L10 1" stroke="var(--success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`
        : `<div style="width:26px;height:26px;border-radius:50%;background:rgba(200,169,110,0.1);border:2px solid var(--accent);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:13px;">○</div>`;

    return `
  <div style="border:1px solid ${s.done ? 'rgba(74,222,128,0.2)' : 'var(--border)'}; border-radius:12px; background:var(--surface); overflow:hidden;">
    <div style="display:flex; align-items:center; gap:12px; padding:14px 16px; cursor:pointer; user-select:none;"
         onclick="toggleLogCard('${s.id}')">
      ${icon}
      <div style="flex:1; min-width:0;">
        <div style="font-size:14px; font-weight:600;">${s.icon} ${s.label}</div>
        ${s.summary ? `<div style="font-size:12px; color:${s.done ? 'var(--success)' : 'var(--muted)'}; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${s.summary}</div>` : (!s.done ? `<div style="font-size:12px; color:var(--accent);">Tap to log →</div>` : '')}
      </div>
      <span style="font-size:12px; color:var(--muted); transform:rotate(${s.done ? '0' : '0'}deg);" id="${s.id}-arrow">▾</span>
    </div>
    <div id="${s.id}-body" style="display:${s.done ? 'none' : 'block'}; padding:0 16px 16px; border-top:1px solid var(--border);">
      <div style="height:14px;"></div>
      ${s.body}
    </div>
  </div>`;
}

function toggleLogCard(id) {
    const body = document.getElementById(id + '-body');
    const arrow = document.getElementById(id + '-arrow');
    const open = body.style.display !== 'none';
    body.style.display = open ? 'none' : 'block';
    arrow.textContent = open ? '▾' : '▴';
}

// ---- Log helpers (inline saves) ----
let logSleepQuality = null;
function setLogSleepQuality(v) {
    logSleepQuality = v;
    [1, 2, 3, 4].forEach(i => {
        const b = document.getElementById('lcsq-' + i);
        if (b) b.className = 'prayer-btn' + (i === v ? ' done' : '');
    });
}

function saveLogSleep() {
    const bed = document.getElementById('lc-sleep-bed').value;
    const wake = document.getElementById('lc-sleep-wake').value;
    const notes = document.getElementById('lc-sleep-notes').value.trim();
    if (!bed || !wake) return void showToast('Set both times.');
    const hours = calcSleepHours(bed, wake);
    if (!hours || hours <= 0) return void showToast('Wake time must be after bedtime.');
    const logs = DB.get('sleep_logs', []);
    const idx = logs.findIndex(l => l.date === currentLogDate);
    const entry = { date: currentLogDate, bedtime: bed, waketime: wake, hours, quality: logSleepQuality, notes };
    if (idx >= 0) logs[idx] = entry; else logs.push(entry);
    DB.set('sleep_logs', logs);
    showToast('Sleep saved!');
    renderLog();
}

// ---- Total study hours across ALL sources for a given date ----
function getTotalStudyHrs(dateStr) {
    const day = DB.getDay(dateStr);
    const acad = DB.get('acad_study_log', []).filter(e => e.date === dateStr);
    const books = DB.get('book_log', []).filter(e => e.date === dateStr);
    const skills = DB.get('skill_log', []).filter(e => e.date === dateStr);
    const quran = DB.get('quran_log', []).filter(e => e.date === dateStr);
    const hadith = DB.get('hadith_log', []).filter(e => e.date === dateStr);
    const oldStudy = (day.studySessions || []).reduce((a, s) => a + (s.hrs || 0), 0);
    const acadHrs = acad.reduce((a, e) => a + (e.hrs || 0), 0);
    const bookHrs = books.reduce((a, e) => a + ((e.mins || 0) / 60), 0);
    const skillHrs = skills.reduce((a, e) => a + ((e.mins || 0) / 60), 0);
    const quranHrs = quran.reduce((a, e) => a + ((e.mins || (e.pages ? e.pages * 1 : 0)) / 60), 0);
    const hadithHrs = hadith.reduce((a, e) => a + (((e.count || 1) * 5) / 60), 0);
    return +(oldStudy + acadHrs + bookHrs + skillHrs + quranHrs + hadithHrs).toFixed(1);
}

// ---- Auto-calculated screen time helpers ----
function calcTotalScreenHrs(appLog) {
    const totalMins = appLog.reduce((a, e) => a + (e.mins || 0), 0);
    return +(totalMins / 60).toFixed(1);
}

function calcProductiveHrs(dateStr) {
    // All learning/study time already included in getTotalStudyHrs
    const studyHrs = getTotalStudyHrs(dateStr);
    // Productive/Education apps (screen time)
    const appLog = DB.get('app_usage_log', []).filter(e => e.date === dateStr);
    const appProdMins = appLog.filter(e => e.category === 'Productivity' || e.category === 'Education')
        .reduce((a, e) => a + (e.mins || 0), 0);
    return +(studyHrs + appProdMins / 60).toFixed(1);
}

function saveLogScreen() {
    const day = DB.getDay(currentLogDate);
    const appLog = DB.get('app_usage_log', []).filter(e => e.date === currentLogDate);
    const tot = calcTotalScreenHrs(appLog);
    const prod = calcProductiveHrs(currentLogDate);
    day.screen = { total: tot, productive: prod };
    DB.setDay(currentLogDate, day);
    DB.registerDay(currentLogDate);
    document.getElementById('screen-hrs-input').value = tot;
    document.getElementById('screen-productive-input').value = prod;
}

function saveGymNotes() {
    const day = DB.getDay(currentLogDate);
    day.gymNotes = document.getElementById('gym-notes-input') ? document.getElementById('gym-notes-input').value : '';
    DB.setDay(currentLogDate, day);
}

// ---- Gym Page: log form ----
function setGymLog(val) {
    // val = 'yes' | 'rest' | 'skipped'
    const day = DB.getDay(todayStr());
    day.gym = val === 'yes' ? true : false;
    day.gymSkipped = val === 'skipped';
    DB.setDay(todayStr(), day);
    DB.registerDay(todayStr());

    const yBtn = document.getElementById('gym-log-yes');
    const rBtn = document.getElementById('gym-log-rest');
    const sBtn = document.getElementById('gym-log-skipped');
    const details = document.getElementById('gym-session-details');
    const restMsg = document.getElementById('gym-rest-msg');
    const skipMsg = document.getElementById('gym-skipped-msg');

    yBtn.classList.toggle('done', val === 'yes');
    rBtn.classList.toggle('done', val === 'rest');
    sBtn.classList.toggle('done', val === 'skipped');
    details.style.display = val === 'yes' ? 'block' : 'none';
    restMsg.style.display = val === 'rest' ? 'block' : 'none';
    skipMsg.style.display = val === 'skipped' ? 'block' : 'none';

    if (val === 'yes') document.getElementById('gym-type-input').focus();
    else if (val === 'rest') showToast('Rest day logged 😴');
    else if (val === 'skipped') showToast('Skipped logged — bounce back tomorrow 💪');
    renderGym();
}

function saveGymSession() {
    const type = document.getElementById('gym-type-input').value;
    const duration = parseInt(document.getElementById('gym-duration-input').value) || null;
    const notes = document.getElementById('gym-notes-input').value.trim();
    const day = DB.getDay(todayStr());
    day.gym = true;
    if (type) day.gymType = type;
    if (duration) day.gymDuration = duration;
    if (notes) day.gymNotes = notes;
    DB.setDay(todayStr(), day);
    DB.registerDay(todayStr());
    const msg = document.getElementById('gym-save-msg');
    msg.style.display = 'inline';
    setTimeout(() => msg.style.display = 'none', 2000);
    showToast('Gym session saved! 💪');
    renderGym();
}

// ---- Water Tracker ----
function getWaterToday() {
    return DB.getDay(todayStr()).waterMl || 0;
}
function adjustWater(ml) {
    const day = DB.getDay(todayStr());
    day.waterMl = Math.max(0, (day.waterMl || 0) + ml);
    DB.setDay(todayStr(), day);
    renderWaterTracker();
}
function resetWater() {
    const day = DB.getDay(todayStr());
    day.waterMl = 0;
    DB.setDay(todayStr(), day);
    renderWaterTracker();
}
function renderWaterTracker() {
    const current = getWaterToday();
    const goals = getNutritionGoals();
    const goalMl = goals.water || 2500;
    const pct = Math.min(Math.round(current / goalMl * 100), 100);
    const remaining = Math.max(goalMl - current, 0);

    const amtEl = document.getElementById('water-today-amount');
    const mlEl = document.getElementById('water-ml-label');
    const pctEl = document.getElementById('water-pct-label');
    const barEl = document.getElementById('water-progress-bar');
    const remEl = document.getElementById('water-remaining-label');
    const goalLblEl = document.getElementById('water-goal-label');
    const recNoteEl = document.getElementById('water-recommendation-note');

    if (!amtEl) return;
    amtEl.textContent = current;
    mlEl.textContent = (current / 1000).toFixed(2) + ' L';
    pctEl.textContent = pct + '%';
    barEl.style.width = pct + '%';
    barEl.style.background = pct >= 100 ? 'var(--success)' : pct >= 60 ? '#3b9eff' : '#f87171';
    goalLblEl.textContent = 'Goal: ' + (goalMl / 1000).toFixed(1) + ' L';
    remEl.textContent = pct >= 100 ? '✓ Daily goal reached!' : `${remaining} ml remaining`;
    remEl.style.color = pct >= 100 ? 'var(--success)' : 'var(--muted)';

    // Show recommendation note from calc state
    const s = DB.get('calc_state', null);
    if (s && s.weight) {
        let note = `Based on ${s.weight}kg body weight`;
        if (s.creatine || s.preworkout) note += ' + supplements';
        recNoteEl.textContent = note;
    } else {
        recNoteEl.textContent = 'Set your goals in Nutrition → Goals for a personalized recommendation';
    }
}

function addHadithFromLog() {
    const book = document.getElementById('lc-hadith-book').value.trim();
    const num = document.getElementById('lc-hadith-num').value.trim();
    const count = parseInt(document.getElementById('lc-hadith-count').value) || 1;
    const note = document.getElementById('lc-hadith-note').value.trim();
    if (!book) return void showToast('Enter a book name.');
    const logs = DB.get('hadith_log', []);
    logs.push({ id: genId(), date: currentLogDate, book, number: num, count, note });
    DB.set('hadith_log', logs);
    saveLogScreen();
    showToast('Hadith logged!');
    renderLog();
}

function addQuranFromLog() {
    const sel = document.getElementById('lc-quran-surah');
    const n = parseInt(sel.value);
    const surah = SURAHS.find(s => s.n === n);
    const from = parseInt(document.getElementById('lc-quran-from').value) || null;
    const to = parseInt(document.getElementById('lc-quran-to').value) || null;
    const pages = parseInt(document.getElementById('lc-quran-pages').value) || 0;
    const note = document.getElementById('lc-quran-note').value.trim();
    if (!surah) return void showToast('Select a Surah.');
    const ayah = (from && to) ? `${from}–${to}` : from ? `${from}` : '';
    const logs = DB.get('quran_log', []);
    logs.push({ id: genId(), date: currentLogDate, surahN: n, surah: surah.name, ayah, pages, note });
    DB.set('quran_log', logs);
    saveLogScreen();
    showToast('Quran session logged!');
    renderLog();
}

function onLogSurahChange() {
    const n = parseInt(document.getElementById('lc-quran-surah').value);
    const s = SURAHS.find(x => x.n === n);
    if (!s) return;
    const f = document.getElementById('lc-quran-from');
    const t = document.getElementById('lc-quran-to');
    f.max = s.ayahs; t.max = s.ayahs; t.placeholder = String(s.ayahs);
}

function addAppFromLog() {
    const name = document.getElementById('lc-app-name').value.trim();
    const cat = document.getElementById('lc-app-cat').value;
    const mins = parseInt(document.getElementById('lc-app-mins').value) || 0;
    const limit = parseInt(document.getElementById('lc-app-limit').value) || 0;
    if (!name || !mins) return void showToast('Enter app name and minutes.');
    const logs = DB.get('app_usage_log', []);
    const idx = logs.findIndex(e => e.date === currentLogDate && e.name.toLowerCase() === name.toLowerCase());
    if (idx >= 0) { logs[idx].mins += mins; if (limit) logs[idx].limit = limit; }
    else logs.push({ id: genId(), date: currentLogDate, name, category: cat, mins, limit });
    DB.set('app_usage_log', logs);
    // Auto-recalculate and save screen totals
    saveLogScreen();
    showToast('App logged!');
    renderLog();
}

function renderStudySessionsHtml(sessions) {
    return sessions.length ? sessions.map(s => `
    <div class="food-item" style="margin-bottom:6px;">
      <div><div style="font-size:13px; font-weight:500;">${esc(s.topic)}</div><div style="font-size:11px; color:var(--muted);">${s.hrs}h${s.time ? ' · ' + s.time : ''}</div></div>
      <button class="btn btn-ghost" onclick="removeStudySession(${s.id})" style="font-size:16px; padding:4px 8px;">✕</button>
    </div>`).join('') : '';
}

function togglePrayer(name) {
    const day = DB.getDay(currentLogDate);
    day.prayers = day.prayers || [];
    if (day.prayers.includes(name)) day.prayers = day.prayers.filter(p => p !== name);
    else day.prayers.push(name);
    DB.setDay(currentLogDate, day);
    DB.registerDay(currentLogDate);
    renderLog();
}

function setGym(val) {
    const day = DB.getDay(currentLogDate);
    day.gym = val;
    DB.setDay(currentLogDate, day);
    DB.registerDay(currentLogDate);
    renderLog();
}

function addStudySession() {
    const hrs = parseFloat(document.getElementById('study-hrs-input').value);
    const topic = document.getElementById('study-topic-input').value.trim();
    if (!hrs || hrs <= 0) return void showToast('Please enter valid hours');
    const day = DB.getDay(currentLogDate);
    day.studySessions = day.studySessions || [];
    day.studySessions.push({ id: Date.now(), hrs, topic: topic || 'General Study', time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) });
    DB.setDay(currentLogDate, day);
    DB.registerDay(currentLogDate);
    saveLogScreen();
    renderLog();
}

function renderStudySessions(sessions) {
    const el = document.getElementById('study-sessions-list');
    if (el) el.innerHTML = renderStudySessionsHtml(sessions);
}

function removeStudySession(id) {
    const day = DB.getDay(currentLogDate);
    day.studySessions = (day.studySessions || []).filter(s => s.id !== id);
    DB.setDay(currentLogDate, day);
    saveLogScreen();
    renderLog();
}

function renderLogMeals(meals) {
    const el = document.getElementById('log-meals-list');
    if (!meals.length) { el.innerHTML = '<div style="color:var(--muted); font-size:13px; text-align:center; padding:20px;">No meals logged yet</div>'; updateNutritionTotals([]); return; }
    el.innerHTML = meals.map((m, i) => `
    <div class="food-item" style="flex-direction:column; align-items:flex-start; margin-bottom:10px;">
      <div style="display:flex; align-items:center; justify-content:space-between; width:100%; margin-bottom:6px;">
        <div style="font-size:13px; font-weight:600;">${esc(m.name)}</div>
        <button class="btn btn-ghost" onclick="removeMeal(${i})" style="font-size:14px; padding:2px 6px;">✕</button>
      </div>
      <div style="display:flex; flex-wrap:wrap; gap:8px;">
        ${m.items.map(it => `<span class="tag">${esc(it.name)} · ${it.cal}cal · ${it.protein}g P · ${it.carbs}g C</span>`).join('')}
      </div>
    </div>
  `).join('');
    updateNutritionTotals(meals);
}

function updateNutritionTotals(meals) {
    let cal = 0, protein = 0, carbs = 0;
    meals.forEach(m => m.items.forEach(i => { cal += i.cal || 0; protein += i.protein || 0; carbs += i.carbs || 0; }));
    document.getElementById('tot-cal').textContent = Math.round(cal);
    document.getElementById('tot-protein').textContent = Math.round(protein) + 'g';
    document.getElementById('tot-carbs').textContent = Math.round(carbs) + 'g';
    document.getElementById('tot-meals').textContent = meals.length;
}

function removeMeal(idx) {
    const day = DB.getDay(currentLogDate);
    day.meals = day.meals || [];
    day.meals.splice(idx, 1);
    DB.setDay(currentLogDate, day);
    renderLogMeals(day.meals);
}

function saveAllLog() {
    const day = DB.getDay(currentLogDate);
    const gymNotesEl = document.getElementById('gym-notes-input');
    if (gymNotesEl) day.gymNotes = gymNotesEl.value;
    DB.setDay(currentLogDate, day);
    DB.registerDay(currentLogDate);
    saveLogScreen();
    showToast('Log saved!');
}

// ============================================================
// GYM SCHEDULE
// ============================================================
const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WORKOUT_TYPES_SHORT = [
    '', 'Leg Day', 'Push', 'Pull', 'Upper Body', 'Lower Body',
    'Full Body', 'Cardio', 'Chest Day', 'Back Day', 'Shoulder Day', 'Arm Day', 'Core / Abs', 'HIIT', 'Other'
];

function getGymSchedule() {
    // Returns { days: [0,1,2...] (0=Sun), assignments: { '1': 'Push', '3': 'Pull', ... } }
    return DB.get('gym_schedule', { days: [], assignments: {} });
}
function setGymSchedule(s) { DB.set('gym_schedule', s); }

let _scheduleEditDays = [];
let _scheduleEditAssign = {};

function toggleScheduleEdit() {
    const editEl = document.getElementById('schedule-edit');
    const viewEl = document.getElementById('schedule-view');
    const btnEl = document.getElementById('schedule-edit-btn');
    const open = editEl.style.display !== 'none';
    if (open) {
        editEl.style.display = 'none';
        viewEl.style.display = 'flex';
        btnEl.textContent = 'Edit';
    } else {
        const s = getGymSchedule();
        _scheduleEditDays = [...(s.days || [])];
        _scheduleEditAssign = Object.assign({}, s.assignments || {});
        renderScheduleToggles();
        renderScheduleAssignments();
        editEl.style.display = 'block';
        viewEl.style.display = 'none';
        btnEl.textContent = 'Cancel';
    }
}

function renderScheduleToggles() {
    const todayDow = new Date().getDay(); // 0=Sun
    document.getElementById('schedule-day-toggles').innerHTML = DAYS_OF_WEEK.map((d, i) => {
        const active = _scheduleEditDays.includes(i) ? 'active' : '';
        const todayMark = i === todayDow ? 'today-mark' : '';
        return `<div class="day-pill ${active} ${todayMark}" id="spill-${i}" onclick="toggleScheduleDay(${i})" title="${i === todayDow ? 'Today' : ''}">${d}</div>`;
    }).join('');
}

function toggleScheduleDay(i) {
    const idx = _scheduleEditDays.indexOf(i);
    if (idx >= 0) {
        _scheduleEditDays.splice(idx, 1);
        delete _scheduleEditAssign[i];
    } else {
        _scheduleEditDays.push(i);
    }
    _scheduleEditDays.sort((a, b) => a - b);
    renderScheduleToggles();
    renderScheduleAssignments();
}

function renderScheduleAssignments() {
    const el = document.getElementById('schedule-day-assignments');
    if (!_scheduleEditDays.length) { el.innerHTML = ''; return; }
    el.innerHTML = `
    <div style="font-size:12px; color:var(--muted); margin-bottom:8px; font-weight:600; text-transform:uppercase; letter-spacing:0.05em;">Assign workout types (optional)</div>
    ${_scheduleEditDays.map(i => `
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
        <div class="day-pill active" style="cursor:default;">${DAYS_OF_WEEK[i]}</div>
        <select class="input" id="sassign-${i}" style="flex:1; font-size:13px; padding:7px 10px;" onchange="updateScheduleAssign(${i})">
          <option value="">— Any workout —</option>
          ${WORKOUT_TYPES_SHORT.filter(t => t).map(t =>
        `<option value="${t}" ${_scheduleEditAssign[i] === t ? 'selected' : ''}>${t}</option>`
    ).join('')}
        </select>
      </div>
    `).join('')}`;
}

function updateScheduleAssign(i) {
    const val = document.getElementById('sassign-' + i).value;
    if (val) _scheduleEditAssign[i] = val;
    else delete _scheduleEditAssign[i];
}

function saveGymSchedule() {
    setGymSchedule({ days: _scheduleEditDays, assignments: _scheduleEditAssign });
    const editEl = document.getElementById('schedule-edit');
    const viewEl = document.getElementById('schedule-view');
    const btnEl = document.getElementById('schedule-edit-btn');
    editEl.style.display = 'none';
    viewEl.style.display = 'flex';
    btnEl.textContent = 'Edit';
    renderGymScheduleView();
    renderGym();
    renderDashboard();
    showToast('Schedule saved! 📅');
}

async function clearGymSchedule() {
    if (!await showConfirm('Clear your workout schedule?', 'Clear', true)) return;
    setGymSchedule({ days: [], assignments: {} });
    _scheduleEditDays = []; _scheduleEditAssign = {};
    renderScheduleToggles();
    renderScheduleAssignments();
}

function renderGymScheduleView() {
    const s = getGymSchedule();
    const viewEl = document.getElementById('schedule-view');
    const emptyEl = document.getElementById('schedule-empty-hint');
    if (!s.days || !s.days.length) {
        viewEl.innerHTML = '<div style="font-size:12px; color:var(--muted); font-style:italic;" id="schedule-empty-hint">No schedule set yet — click Edit to set your training days.</div>';
        return;
    }
    const todayDow = new Date().getDay();
    viewEl.innerHTML = DAYS_OF_WEEK.map((d, i) => {
        const isGym = s.days.includes(i);
        const isToday = i === todayDow;
        const assign = s.assignments[i] || '';
        const pillCls = isGym ? 'active' : '';
        const todayCls = isToday ? 'today-mark' : '';
        const tooltip = isGym ? (assign || 'Workout day') : 'Rest day';
        return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
      <div class="day-pill ${pillCls} ${todayCls}" style="cursor:default;" title="${tooltip}">${d}</div>
      ${assign ? `<div style="font-size:9px;color:var(--accent2);max-width:38px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${assign}">${assign}</div>` : (isGym ? `<div style="font-size:9px;color:var(--muted);">Gym</div>` : `<div style="font-size:9px;color:var(--muted);">Rest</div>`)}
    </div>`;
    }).join('');
    // Add a summary line
    const gymCount = s.days.length;
    viewEl.insertAdjacentHTML('beforeend', `<div style="font-size:12px;color:var(--muted);margin-left:4px;align-self:center;">${gymCount}x/week</div>`);
}

function getGymBannerData() {
    const s = getGymSchedule();
    if (!s.days || !s.days.length) return null;
    const todayDow = new Date().getDay();
    const isWorkout = s.days.includes(todayDow);
    const assign = s.assignments[todayDow] || null;
    const todayLogged = DB.getDay(todayStr()).gym;
    return { isWorkout, assign, todayLogged };
}

// ============================================================
// GYM PAGE
// ============================================================
function renderGym() {
    const s = getGymSchedule();
    const goalCount = s.days && s.days.length ? s.days.length : 4;

    const weekDates = getWeekDates(todayStr());
    const gymDays = weekDates.filter(d => DB.getDay(d).gym === true).length;
    document.getElementById('gym-this-week').textContent = gymDays + '/' + goalCount;
    document.getElementById('gym-week-bar').style.width = Math.min(gymDays / goalCount * 100, 100) + '%';

    const allDays = DB.getDays();
    const monthStr = todayStr().slice(0, 7);
    const monthGym = allDays.filter(d => d.startsWith(monthStr) && DB.getDay(d).gym === true).length;
    document.getElementById('gym-this-month').textContent = monthGym;

    const totalGym = allDays.filter(d => DB.getDay(d).gym === true).length;
    const totalWeeks = Math.max(1, Math.ceil(allDays.length / 7));
    document.getElementById('gym-rate').textContent = Math.round(totalGym / (totalWeeks * goalCount) * 100) + '%';

    renderGymScheduleView();

    // Populate today's log form
    const today = DB.getDay(todayStr());
    const gymState = today.gym === true ? 'yes' : today.gymSkipped ? 'skipped' : today.gym === false ? 'rest' : null;
    const yBtn = document.getElementById('gym-log-yes');
    const rBtn = document.getElementById('gym-log-rest');
    const sBtn = document.getElementById('gym-log-skipped');
    const details = document.getElementById('gym-session-details');
    const restMsg = document.getElementById('gym-rest-msg');
    const skipMsg = document.getElementById('gym-skipped-msg');
    yBtn.classList.toggle('done', gymState === 'yes');
    rBtn.classList.toggle('done', gymState === 'rest');
    sBtn.classList.toggle('done', gymState === 'skipped');
    details.style.display = gymState === 'yes' ? 'block' : 'none';
    restMsg.style.display = gymState === 'rest' ? 'block' : 'none';
    skipMsg.style.display = gymState === 'skipped' ? 'block' : 'none';
    if (gymState === 'yes') {
        document.getElementById('gym-type-input').value = today.gymType || '';
        document.getElementById('gym-duration-input').value = today.gymDuration || '';
        document.getElementById('gym-notes-input').value = today.gymNotes || '';
    }

    // Session list — show gym, rest, and skipped
    const allRelevant = allDays
        .filter(d => DB.getDay(d).gym !== undefined || DB.getDay(d).gymSkipped)
        .sort((a, b) => b.localeCompare(a)).slice(0, 25);
    document.getElementById('gym-sessions-list').innerHTML = allRelevant.length ? allRelevant.map(d => {
        const day = DB.getDay(d);
        if (day.gym === true) {
            const typeTag = day.gymType ? `<span class="pill pill-purple" style="font-size:11px;padding:2px 8px;">${day.gymType}</span>` : '';
            const durTag = day.gymDuration ? `<span style="font-size:11px;color:var(--muted);">⏱ ${day.gymDuration} min</span>` : '';
            const notes = day.gymNotes ? `<span style="font-size:11px; color:var(--muted);">${day.gymNotes}</span>` : '';
            return `<div class="log-row" style="flex-wrap:wrap; gap:6px;">
        <span class="pill pill-green" style="flex-shrink:0;">✓ Done</span>
        <span style="font-size:13px; font-weight:500; flex-shrink:0;">${fmtDate(d)}</span>
        ${typeTag}${durTag}${notes}
      </div>`;
        } else if (day.gymSkipped) {
            return `<div class="log-row" style="flex-wrap:wrap; gap:6px;">
        <span class="pill pill-red" style="flex-shrink:0;">✕ Skipped</span>
        <span style="font-size:13px; color:var(--muted); flex-shrink:0;">${fmtDate(d)}</span>
      </div>`;
        } else {
            return `<div class="log-row" style="flex-wrap:wrap; gap:6px;">
        <span class="pill pill-yellow" style="flex-shrink:0;">😴 Rest</span>
        <span style="font-size:13px; color:var(--muted); flex-shrink:0;">${fmtDate(d)}</span>
      </div>`;
        }
    }).join('') : '<div style="color:var(--muted); font-size:13px;">No sessions logged yet</div>';

    renderSleepSection();
}

// ============================================================
// SLEEP TRACKING
// ============================================================
let selectedSleepQuality = null;

function setSleepQuality(val) {
    selectedSleepQuality = val;
    [1, 2, 3, 4].forEach(i => {
        const btn = document.getElementById('sq-' + i);
        if (btn) btn.className = 'prayer-btn' + (i === val ? ' done' : '');
    });
}

function calcSleepHours(bedtime, waketime) {
    if (!bedtime || !waketime) return null;
    const [bh, bm] = bedtime.split(':').map(Number);
    const [wh, wm] = waketime.split(':').map(Number);
    let minutes = (wh * 60 + wm) - (bh * 60 + bm);
    if (minutes < 0) minutes += 24 * 60;
    return +(minutes / 60).toFixed(1);
}

function saveSleepLog() {
    const bedtime = document.getElementById('sleep-bedtime').value;
    const waketime = document.getElementById('sleep-waketime').value;
    const notes = document.getElementById('sleep-notes-input').value.trim();
    const quality = selectedSleepQuality;
    const hours = calcSleepHours(bedtime, waketime);

    if (!bedtime || !waketime) return void showToast('Please set both bedtime and wake-up time.');
    if (hours === null || hours <= 0) return void showToast('Wake-up time must be after bedtime.');

    const logs = DB.get('sleep_logs', []);
    const today = todayStr();
    const existing = logs.findIndex(l => l.date === today);
    const entry = { date: today, bedtime, waketime, hours, quality: quality || null, notes };

    if (existing >= 0) logs[existing] = entry;
    else logs.push(entry);
    DB.set('sleep_logs', logs);

    const msg = document.getElementById('sleep-save-msg');
    msg.style.display = 'inline';
    setTimeout(() => { msg.style.display = 'none'; }, 2000);

    renderSleepSection();
}

// ============================================================
// SLEEP GOAL + RECOMMENDATION CALCULATOR
// ============================================================
function getSleepGoal() { return DB.get('sleep_goal', { hrs: 0 }); }
function setSleepGoalData(g) { DB.set('sleep_goal', g); }

let _sleepCalcGym = false;

function setSleepCalcGym(val) {
    _sleepCalcGym = val;
    document.getElementById('slc-gym-yes').classList.toggle('done', val === true);
    document.getElementById('slc-gym-no').classList.toggle('done', val === false);
    calcSleepRec();
}

function toggleSleepGoalEdit() {
    const editEl = document.getElementById('sleep-goal-edit');
    const btnEl = document.getElementById('sleep-goal-edit-btn');
    const open = editEl.style.display !== 'none';
    if (open) {
        editEl.style.display = 'none';
        btnEl.textContent = 'Edit Goal';
    } else {
        const g = getSleepGoal();
        if (g.hrs) document.getElementById('sleep-goal-input').value = g.hrs;
        // Restore calc state if any
        const cs = DB.get('sleep_calc_state', null);
        if (cs) {
            if (cs.age) document.getElementById('slc-age').value = cs.age;
            if (cs.activity) document.getElementById('slc-activity').value = cs.activity;
            if (cs.stress) document.getElementById('slc-stress').value = cs.stress;
            if (cs.screen) document.getElementById('slc-screen').value = cs.screen;
            _sleepCalcGym = !!cs.gym;
            document.getElementById('slc-gym-yes').classList.toggle('done', _sleepCalcGym);
            document.getElementById('slc-gym-no').classList.toggle('done', !_sleepCalcGym);
            calcSleepRec();
        }
        editEl.style.display = 'block';
        btnEl.textContent = 'Cancel';
    }
}

function calcSleepRec() {
    const age = parseInt(document.getElementById('slc-age').value) || null;
    const activity = document.getElementById('slc-activity').value;
    const stress = document.getElementById('slc-stress').value;
    const screen = document.getElementById('slc-screen').value;
    const gym = _sleepCalcGym;

    // Save calc state
    DB.set('sleep_calc_state', { age, activity, stress, screen, gym });

    const resEl = document.getElementById('slc-result');
    if (!age) { resEl.style.display = 'none'; return; }

    // Base recommendation by age (NSF guidelines)
    let baseMin, baseMax;
    if (age <= 5) { baseMin = 10; baseMax = 14; }
    else if (age <= 12) { baseMin = 9; baseMax = 11; }
    else if (age <= 17) { baseMin = 8; baseMax = 10; }
    else if (age <= 25) { baseMin = 7; baseMax = 9; }
    else if (age <= 64) { baseMin = 7; baseMax = 9; }
    else { baseMin = 7; baseMax = 8; }

    // Adjustments
    let notes = [];

    // Activity — athletes need more
    if (activity === 'high' || gym) {
        baseMin = Math.min(baseMin + 0.5, baseMax);
        notes.push('Active lifestyle needs more recovery');
    }

    // Stress — high stress raises need
    if (stress === 'high') {
        baseMin = Math.min(baseMin + 0.5, 10);
        notes.push('High stress increases sleep need');
    } else if (stress === 'low') {
        notes.push('Low stress — standard range applies');
    }

    // Screen — heavy screen use reduces quality, so suggest upper end
    let qualityNote = '';
    if (screen === 'heavy') {
        qualityNote = '⚠️ Heavy screen use before bed reduces sleep quality — aim for the upper range or cut screens 1h before bed.';
        baseMin = Math.min(baseMin + 0.5, baseMax);
    } else if (screen === 'none') {
        qualityNote = '✓ Good screen hygiene — your sleep quality will be better.';
    }

    const rec = baseMin + 0.5; // sweet spot
    const recLabel = `${baseMin}–${baseMax}h`;

    document.getElementById('slc-rec-hrs').textContent = rec + 'h recommended';
    document.getElementById('slc-rec-note').innerHTML =
        `Age ${age}: optimal range is <b>${recLabel}</b>.<br>` +
        (notes.length ? notes.map(n => `• ${n}`).join('<br>') + '<br>' : '') +
        (qualityNote ? `<span style="color:${screen === 'heavy' ? 'var(--danger)' : 'var(--success)'}; margin-top:4px; display:inline-block;">${qualityNote}</span>` : '');

    resEl.style.display = 'block';
    // Pre-fill goal input
    document.getElementById('sleep-goal-input').value = rec;
}

function applySleepRec() {
    const hrs = parseFloat(document.getElementById('sleep-goal-input').value);
    if (!hrs) return;
    saveSleepGoal();
}

function saveSleepGoal() {
    const hrs = parseFloat(document.getElementById('sleep-goal-input').value) || 0;
    if (!hrs) return void showToast('Please enter a sleep goal.');
    setSleepGoalData({ hrs });
    document.getElementById('sleep-goal-edit').style.display = 'none';
    document.getElementById('sleep-goal-edit-btn').textContent = 'Edit Goal';
    showToast('Sleep goal saved! 😴');
    renderSleepSection();
}

function renderSleepGoalView() {
    const el = document.getElementById('sleep-goal-view');
    if (!el) return;
    const g = getSleepGoal();
    if (!g.hrs) {
        el.innerHTML = '<div style="font-size:12px; color:var(--muted); font-style:italic;">No sleep goal set — click Edit Goal to configure.</div>';
        // Clear last night bar too
        const barEl = document.getElementById('sleep-last-night-bar');
        if (barEl) barEl.innerHTML = '';
        return;
    }

    const logs = DB.get('sleep_logs', []).sort((a, b) => b.date.localeCompare(a.date));
    const lastLog = logs[0];
    const lastHrs = lastLog ? lastLog.hours : null;
    const pct = lastHrs ? Math.min(lastHrs / g.hrs * 100, 100) : 0;
    const over = lastHrs && lastHrs > g.hrs + 1;
    const met = lastHrs && lastHrs >= g.hrs;
    const barColor = over ? 'var(--accent)' : met ? 'var(--success)' : lastHrs ? 'var(--danger)' : 'var(--muted)';
    const status = !lastHrs ? 'No log yet' : over ? 'Overslept a bit' : met ? '✓ Goal met' : `${(g.hrs - lastHrs).toFixed(1)}h short`;

    el.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:8px;">
      <div style="font-size:22px; font-family:'DM Serif Display',serif; font-weight:700;">
        <span style="color:var(--accent2);">🎯 ${g.hrs}h</span>
        <span style="font-size:12px; color:var(--muted); font-family:inherit; font-weight:400; margin-left:6px;">per night</span>
      </div>
      <span style="font-size:12px; color:${met && !over ? 'var(--success)' : !lastHrs ? 'var(--muted)' : over ? 'var(--accent)' : 'var(--danger)'}; font-weight:500;">${status}</span>
    </div>
    <div class="progress-bar" style="height:8px;">
      <div class="progress-fill" style="height:8px; width:${pct.toFixed(1)}%; background:${barColor};"></div>
    </div>
    <div style="display:flex; justify-content:space-between; font-size:10px; color:var(--muted); margin-top:3px;">
      <span>Last night: ${lastHrs ? lastHrs + 'h' : '—'}</span>
      <span>Goal: ${g.hrs}h</span>
    </div>`;

    // Also update the stat card bar
    const barEl = document.getElementById('sleep-last-night-bar');
    if (barEl && lastHrs) {
        barEl.innerHTML = `
      <div class="progress-bar" style="height:5px; margin-top:4px;">
        <div class="progress-fill" style="height:5px; width:${pct.toFixed(1)}%; background:${barColor};"></div>
      </div>
      <div style="font-size:10px; color:${met ? 'var(--success)' : over ? 'var(--accent)' : 'var(--danger)'}; margin-top:2px;">${status}</div>`;
    } else if (barEl) {
        barEl.innerHTML = `<div style="font-size:10px; color:var(--muted); margin-top:4px;">Goal: ${g.hrs}h</div>`;
    }
}

function renderSleepSection() {
    renderSleepGoalView();
    const logs = DB.get('sleep_logs', []).sort((a, b) => b.date.localeCompare(a.date));
    const today = todayStr();

    const todayLog = logs.find(l => l.date === today);
    if (todayLog) {
        document.getElementById('sleep-bedtime').value = todayLog.bedtime || '23:00';
        document.getElementById('sleep-waketime').value = todayLog.waketime || '07:00';
        document.getElementById('sleep-notes-input').value = todayLog.notes || '';
        if (todayLog.quality) setSleepQuality(todayLog.quality);
    }

    const lastLog = logs[0];
    document.getElementById('sleep-last-night').textContent = lastLog ? lastLog.hours + 'h' : '—';

    const weekDates = getWeekDates(today);
    const weekLogs = logs.filter(l => weekDates.includes(l.date));
    if (weekLogs.length) {
        const avgH = (weekLogs.reduce((a, l) => a + l.hours, 0) / weekLogs.length).toFixed(1);
        document.getElementById('sleep-week-avg').textContent = avgH + 'h';
        const qLogs = weekLogs.filter(l => l.quality);
        const avgQ = qLogs.length ? (qLogs.reduce((a, l) => a + l.quality, 0) / qLogs.length).toFixed(1) : '—';
        document.getElementById('sleep-quality-avg').textContent = avgQ !== '—' ? avgQ + '/4' : '—';
    } else {
        document.getElementById('sleep-week-avg').textContent = '—';
        document.getElementById('sleep-quality-avg').textContent = '—';
    }

    const qualityLabel = { 1: '😫 Poor', 2: '😐 Okay', 3: '😊 Good', 4: '🌟 Great' };
    const qualityPill = { 1: 'pill-red', 2: 'pill-yellow', 3: 'pill-green', 4: 'pill-purple' };
    const recent = logs.slice(0, 10);
    document.getElementById('sleep-logs-list').innerHTML = recent.length ? recent.map(l => `
    <div class="log-row" style="gap:10px; flex-wrap:wrap;">
      <span style="font-size:13px; min-width:100px;">${fmtDate(l.date)}</span>
      <span class="pill pill-purple" style="font-size:11px;">${l.hours}h</span>
      ${l.quality ? `<span class="pill ${qualityPill[l.quality]}" style="font-size:11px;">${qualityLabel[l.quality]}</span>` : ''}
      ${l.bedtime && l.waketime ? `<span style="font-size:11px; color:var(--muted);">${l.bedtime} → ${l.waketime}</span>` : ''}
      ${l.notes ? `<span style="font-size:11px; color:var(--muted);">${esc(l.notes)}</span>` : ''}
    </div>
  `).join('') : '<div style="color:var(--muted); font-size:13px;">No sleep logs yet. Start tracking tonight!</div>';
}

// ============================================================
// PRAYERS PAGE
// ============================================================
function renderPrayers() {
    initSurahDropdown();
    const today = DB.getDay(todayStr());
    const prayers = today.prayers || [];
    document.getElementById('prayer-today-count').textContent = prayers.length + '/5';
    document.getElementById('prayer-today-label').textContent = fmtDate(todayStr());

    document.getElementById('prayer-today-btns').innerHTML = PRAYERS.map(p => `
    <button class="prayer-btn ${prayers.includes(p) ? 'done' : ''}" onclick="togglePrayerPage('${p}')">${p}</button>
  `).join('');

    const allDays = DB.getDays();
    const weekDates = getWeekDates(todayStr());
    const weekAvg = weekDates.reduce((a, d) => a + (DB.getDay(d).prayers || []).length, 0) / 7;
    document.getElementById('prayer-week-avg').textContent = Math.round(weekAvg) + '/5';

    const monthStr = todayStr().slice(0, 7);
    const monthDays = allDays.filter(d => d.startsWith(monthStr));
    const perfectDays = monthDays.filter(d => (DB.getDay(d).prayers || []).length === 5).length;
    document.getElementById('prayer-perfect-days').textContent = perfectDays;

    const last30 = Array.from({ length: 30 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - 29 + i);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const da = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${da}`;
    });
    document.getElementById('prayer-history-grid').innerHTML = last30.map(d => {
        const cnt = (DB.getDay(d).prayers || []).length;
        const bg = cnt === 5 ? 'var(--success)' : cnt >= 3 ? 'var(--accent)' : cnt >= 1 ? 'var(--danger)' : 'var(--surface2)';
        return `<div title="${fmtDateShort(d)}: ${cnt}/5 prayers" style="width:20px;height:20px;border-radius:3px;background:${bg};cursor:pointer;"></div>`;
    }).join('');

    renderHadithSection();
    renderQuranSection();
}

function togglePrayerPage(name) {
    const day = DB.getDay(todayStr());
    day.prayers = day.prayers || [];
    if (day.prayers.includes(name)) day.prayers = day.prayers.filter(p => p !== name);
    else day.prayers.push(name);
    DB.setDay(todayStr(), day);
    DB.registerDay(todayStr());
    renderPrayers();
}

// ============================================================
// HADITH TRACKER
// ============================================================
function addHadithEntry() {
    const book = document.getElementById('hadith-book-input').value.trim();
    const number = document.getElementById('hadith-number-input').value.trim();
    const count = parseInt(document.getElementById('hadith-count-input').value) || 1;
    const note = document.getElementById('hadith-note-input').value.trim();
    if (!book) return void showToast('Please enter a book / collection name.');
    const entries = DB.get('hadith_log', []);
    entries.push({ id: genId(), date: todayStr(), book, number, count, note });
    DB.set('hadith_log', entries);
    document.getElementById('hadith-book-input').value = '';
    document.getElementById('hadith-number-input').value = '';
    document.getElementById('hadith-count-input').value = '';
    document.getElementById('hadith-note-input').value = '';
    renderHadithSection();
    showToast('Hadith logged!');
}

function removeHadithEntry(id) {
    const entries = DB.get('hadith_log', []).filter(e => e.id !== id);
    DB.set('hadith_log', entries);
    renderHadithSection();
}

function renderHadithSection() {
    const all = DB.get('hadith_log', []);
    const today = todayStr();
    const todayE = all.filter(e => e.date === today);
    const weekD = getWeekDates(today);
    const weekE = all.filter(e => weekD.includes(e.date));

    document.getElementById('hadith-today-count').textContent = todayE.reduce((a, e) => a + (e.count || 1), 0);
    document.getElementById('hadith-week-count').textContent = weekE.reduce((a, e) => a + (e.count || 1), 0);

    document.getElementById('hadith-today-list').innerHTML = todayE.length ? todayE.map(e => `
    <div style="background:var(--surface2); border-radius:10px; padding:12px 14px; margin-bottom:8px; border-left:3px solid var(--accent);">
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <div>
          <div style="font-size:13px; font-weight:600;">${esc(e.book)}${e.number ? ' — ' + e.number : ''}</div>
          <div style="font-size:11px; color:var(--muted); margin-top:2px;">${e.count} hadith${e.count > 1 ? 's' : ''} read</div>
          ${e.note ? `<div style="font-size:12px; color:var(--text); margin-top:6px; line-height:1.5; border-top:1px solid var(--border); padding-top:6px;">💡 ${esc(e.note)}</div>` : ''}
        </div>
        <button class="btn btn-ghost" onclick="removeHadithEntry('${e.id}')" style="font-size:14px; padding:2px 8px;">✕</button>
      </div>
    </div>
  `).join('') : '<div style="color:var(--muted); font-size:13px;">No hadiths logged today yet.</div>';
}

// ============================================================
// QURAN TRACKER
// ============================================================
// ============================================================
// QURAN TRACKER — SURAH DATA + HELPERS
// ============================================================
const SURAHS = [
    { n: 1, name: "Al-Fatihah", ayahs: 7 }, { n: 2, name: "Al-Baqarah", ayahs: 286 }, { n: 3, name: "Ali 'Imran", ayahs: 200 },
    { n: 4, name: "An-Nisa", ayahs: 176 }, { n: 5, name: "Al-Ma'idah", ayahs: 120 }, { n: 6, name: "Al-An'am", ayahs: 165 },
    { n: 7, name: "Al-A'raf", ayahs: 206 }, { n: 8, name: "Al-Anfal", ayahs: 75 }, { n: 9, name: "At-Tawbah", ayahs: 129 },
    { n: 10, name: "Yunus", ayahs: 109 }, { n: 11, name: "Hud", ayahs: 123 }, { n: 12, name: "Yusuf", ayahs: 111 },
    { n: 13, name: "Ar-Ra'd", ayahs: 43 }, { n: 14, name: "Ibrahim", ayahs: 52 }, { n: 15, name: "Al-Hijr", ayahs: 99 },
    { n: 16, name: "An-Nahl", ayahs: 128 }, { n: 17, name: "Al-Isra", ayahs: 111 }, { n: 18, name: "Al-Kahf", ayahs: 110 },
    { n: 19, name: "Maryam", ayahs: 98 }, { n: 20, name: "Ta-Ha", ayahs: 135 }, { n: 21, name: "Al-Anbiya", ayahs: 112 },
    { n: 22, name: "Al-Hajj", ayahs: 78 }, { n: 23, name: "Al-Mu'minun", ayahs: 118 }, { n: 24, name: "An-Nur", ayahs: 64 },
    { n: 25, name: "Al-Furqan", ayahs: 77 }, { n: 26, name: "Ash-Shu'ara", ayahs: 227 }, { n: 27, name: "An-Naml", ayahs: 93 },
    { n: 28, name: "Al-Qasas", ayahs: 88 }, { n: 29, name: "Al-'Ankabut", ayahs: 69 }, { n: 30, name: "Ar-Rum", ayahs: 60 },
    { n: 31, name: "Luqman", ayahs: 34 }, { n: 32, name: "As-Sajdah", ayahs: 30 }, { n: 33, name: "Al-Ahzab", ayahs: 73 },
    { n: 34, name: "Saba", ayahs: 54 }, { n: 35, name: "Fatir", ayahs: 45 }, { n: 36, name: "Ya-Sin", ayahs: 83 },
    { n: 37, name: "As-Saffat", ayahs: 182 }, { n: 38, name: "Sad", ayahs: 88 }, { n: 39, name: "Az-Zumar", ayahs: 75 },
    { n: 40, name: "Ghafir", ayahs: 85 }, { n: 41, name: "Fussilat", ayahs: 54 }, { n: 42, name: "Ash-Shura", ayahs: 53 },
    { n: 43, name: "Az-Zukhruf", ayahs: 89 }, { n: 44, name: "Ad-Dukhan", ayahs: 59 }, { n: 45, name: "Al-Jathiyah", ayahs: 37 },
    { n: 46, name: "Al-Ahqaf", ayahs: 35 }, { n: 47, name: "Muhammad", ayahs: 38 }, { n: 48, name: "Al-Fath", ayahs: 29 },
    { n: 49, name: "Al-Hujurat", ayahs: 18 }, { n: 50, name: "Qaf", ayahs: 45 }, { n: 51, name: "Adh-Dhariyat", ayahs: 60 },
    { n: 52, name: "At-Tur", ayahs: 49 }, { n: 53, name: "An-Najm", ayahs: 62 }, { n: 54, name: "Al-Qamar", ayahs: 55 },
    { n: 55, name: "Ar-Rahman", ayahs: 78 }, { n: 56, name: "Al-Waqi'ah", ayahs: 96 }, { n: 57, name: "Al-Hadid", ayahs: 29 },
    { n: 58, name: "Al-Mujadila", ayahs: 22 }, { n: 59, name: "Al-Hashr", ayahs: 24 }, { n: 60, name: "Al-Mumtahanah", ayahs: 13 },
    { n: 61, name: "As-Saf", ayahs: 14 }, { n: 62, name: "Al-Jumu'ah", ayahs: 11 }, { n: 63, name: "Al-Munafiqun", ayahs: 11 },
    { n: 64, name: "At-Taghabun", ayahs: 18 }, { n: 65, name: "At-Talaq", ayahs: 12 }, { n: 66, name: "At-Tahrim", ayahs: 12 },
    { n: 67, name: "Al-Mulk", ayahs: 30 }, { n: 68, name: "Al-Qalam", ayahs: 52 }, { n: 69, name: "Al-Haqqah", ayahs: 52 },
    { n: 70, name: "Al-Ma'arij", ayahs: 44 }, { n: 71, name: "Nuh", ayahs: 28 }, { n: 72, name: "Al-Jinn", ayahs: 28 },
    { n: 73, name: "Al-Muzzammil", ayahs: 20 }, { n: 74, name: "Al-Muddaththir", ayahs: 56 }, { n: 75, name: "Al-Qiyamah", ayahs: 40 },
    { n: 76, name: "Al-Insan", ayahs: 31 }, { n: 77, name: "Al-Mursalat", ayahs: 50 }, { n: 78, name: "An-Naba", ayahs: 40 },
    { n: 79, name: "An-Nazi'at", ayahs: 46 }, { n: 80, name: "Abasa", ayahs: 42 }, { n: 81, name: "At-Takwir", ayahs: 29 },
    { n: 82, name: "Al-Infitar", ayahs: 19 }, { n: 83, name: "Al-Mutaffifin", ayahs: 36 }, { n: 84, name: "Al-Inshiqaq", ayahs: 25 },
    { n: 85, name: "Al-Buruj", ayahs: 22 }, { n: 86, name: "At-Tariq", ayahs: 17 }, { n: 87, name: "Al-A'la", ayahs: 19 },
    { n: 88, name: "Al-Ghashiyah", ayahs: 26 }, { n: 89, name: "Al-Fajr", ayahs: 30 }, { n: 90, name: "Al-Balad", ayahs: 20 },
    { n: 91, name: "Ash-Shams", ayahs: 15 }, { n: 92, name: "Al-Layl", ayahs: 21 }, { n: 93, name: "Ad-Duha", ayahs: 11 },
    { n: 94, name: "Ash-Sharh", ayahs: 8 }, { n: 95, name: "At-Tin", ayahs: 8 }, { n: 96, name: "Al-Alaq", ayahs: 19 },
    { n: 97, name: "Al-Qadr", ayahs: 5 }, { n: 98, name: "Al-Bayyinah", ayahs: 8 }, { n: 99, name: "Az-Zalzalah", ayahs: 8 },
    { n: 100, name: "Al-Adiyat", ayahs: 11 }, { n: 101, name: "Al-Qari'ah", ayahs: 11 }, { n: 102, name: "At-Takathur", ayahs: 8 },
    { n: 103, name: "Al-Asr", ayahs: 3 }, { n: 104, name: "Al-Humazah", ayahs: 9 }, { n: 105, name: "Al-Fil", ayahs: 5 },
    { n: 106, name: "Quraysh", ayahs: 4 }, { n: 107, name: "Al-Ma'un", ayahs: 7 }, { n: 108, name: "Al-Kawthar", ayahs: 3 },
    { n: 109, name: "Al-Kafirun", ayahs: 6 }, { n: 110, name: "An-Nasr", ayahs: 3 }, { n: 111, name: "Al-Masad", ayahs: 5 },
    { n: 112, name: "Al-Ikhlas", ayahs: 4 }, { n: 113, name: "Al-Falaq", ayahs: 5 }, { n: 114, name: "An-Nas", ayahs: 6 }
];

function initSurahDropdown() {
    const sel = document.getElementById('quran-surah-input');
    if (!sel || sel.options.length > 1) return;
    SURAHS.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.n;
        opt.textContent = `${s.n}. ${esc(s.name)} (${s.ayahs} ayahs)`;
        sel.appendChild(opt);
    });
}

function onSurahChange() {
    const sel = document.getElementById('quran-surah-input');
    const n = parseInt(sel.value);
    const surah = SURAHS.find(s => s.n === n);
    const fromEl = document.getElementById('quran-ayah-from');
    const toEl = document.getElementById('quran-ayah-to');
    const meta = document.getElementById('quran-surah-meta');
    if (!surah) {
        fromEl.max = ''; toEl.max = '';
        fromEl.placeholder = '1'; toEl.placeholder = '10';
        meta.textContent = '';
        return;
    }
    fromEl.max = surah.ayahs; fromEl.placeholder = '1';
    toEl.max = surah.ayahs; toEl.placeholder = String(surah.ayahs);
    meta.textContent = `${surah.name} has ${surah.ayahs} ayahs`;
    // Clamp existing values
    if (parseInt(fromEl.value) > surah.ayahs) fromEl.value = 1;
    if (parseInt(toEl.value) > surah.ayahs) toEl.value = surah.ayahs;
}

function addQuranEntry() {
    const selEl = document.getElementById('quran-surah-input');
    const n = parseInt(selEl.value);
    const surah = SURAHS.find(s => s.n === n);
    const ayahFrom = parseInt(document.getElementById('quran-ayah-from').value) || null;
    const ayahTo = parseInt(document.getElementById('quran-ayah-to').value) || null;
    const pages = parseInt(document.getElementById('quran-pages-input').value) || 0;
    const note = document.getElementById('quran-note-input').value.trim();
    if (!surah) return void showToast('Please select a Surah.');
    if (ayahFrom && ayahTo && ayahFrom > ayahTo) return void showToast('Ayah "From" cannot be greater than "To".');
    if (ayahTo && surah && ayahTo > surah.ayahs) return void showToast(`Surah ${surah.name} only has ${surah.ayahs} ayahs.`);
    const ayah = (ayahFrom && ayahTo) ? `${ayahFrom}–${ayahTo}` : ayahFrom ? `${ayahFrom}` : '';
    const entries = DB.get('quran_log', []);
    entries.push({ id: genId(), date: todayStr(), surahN: n, surah: surah.name, ayah, pages, note });
    DB.set('quran_log', entries);
    selEl.value = '';
    document.getElementById('quran-ayah-from').value = '';
    document.getElementById('quran-ayah-to').value = '';
    document.getElementById('quran-pages-input').value = '';
    document.getElementById('quran-note-input').value = '';
    document.getElementById('quran-surah-meta').textContent = '';
    renderQuranSection();
    showToast('Quran session logged!');
}

function removeQuranEntry(id) {
    const entries = DB.get('quran_log', []).filter(e => e.id !== id);
    DB.set('quran_log', entries);
    renderQuranSection();
}

function renderQuranSection() {
    initSurahDropdown();
    const all = DB.get('quran_log', []);
    const today = todayStr();
    const todayE = all.filter(e => e.date === today);
    const weekD = getWeekDates(today);
    const weekE = all.filter(e => weekD.includes(e.date));
    const monthStr = today.slice(0, 7);
    const monthE = all.filter(e => e.date.startsWith(monthStr));

    document.getElementById('quran-pages-today').textContent = todayE.reduce((a, e) => a + (e.pages || 0), 0);
    document.getElementById('quran-pages-week').textContent = weekE.reduce((a, e) => a + (e.pages || 0), 0);
    document.getElementById('quran-sessions-month').textContent = monthE.length;

    document.getElementById('quran-today-list').innerHTML = todayE.length ? todayE.map(e => `
    <div style="background:var(--surface2); border-radius:10px; padding:12px 14px; margin-bottom:8px; border-left:3px solid var(--accent2);">
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <div>
          <div style="font-size:13px; font-weight:600;">${e.surahN ? e.surahN + '. ' : ''}${e.surah || 'Quran'}${e.ayah ? ' · Ayah ' + e.ayah : ''}</div>
          <div style="font-size:11px; color:var(--muted); margin-top:2px;">${e.pages ? e.pages + ' page' + (e.pages > 1 ? 's' : '') : 'Session logged'}</div>
          ${e.note ? `<div style="font-size:12px; color:var(--text); margin-top:6px; line-height:1.5; border-top:1px solid var(--border); padding-top:6px;">💡 ${esc(e.note)}</div>` : ''}
        </div>
        <button class="btn btn-ghost" onclick="removeQuranEntry('${e.id}')" style="font-size:14px; padding:2px 8px;">✕</button>
      </div>
    </div>
  `).join('') : '<div style="color:var(--muted); font-size:13px;">No Quran sessions logged today yet.</div>';
}

// ============================================================
// STUDY PAGE
// ============================================================
function getAllStudyDates() {
    // Returns a deduplicated sorted array of all dates that have ANY study activity
    const dates = new Set();
    DB.getDays().forEach(d => dates.add(d));
    DB.get('acad_study_log', []).forEach(e => e.date && dates.add(e.date));
    DB.get('book_log', []).forEach(e => e.date && dates.add(e.date));
    DB.get('skill_log', []).forEach(e => e.date && dates.add(e.date));
    DB.get('quran_log', []).forEach(e => e.date && dates.add(e.date));
    DB.get('hadith_log', []).forEach(e => e.date && dates.add(e.date));
    return Array.from(dates).sort();
}

// ============================================================
// STUDY GOALS
// ============================================================
function getStudyGoals() {
    return DB.get('study_goals', {
        overall: { min: 0, max: 0 },
        acad: { min: 0, max: 0 },
        books: { min: 0, max: 0 },
        skills: { min: 0, max: 0 },
    });
}
function setStudyGoals(g) { DB.set('study_goals', g); }

function toggleStudyGoalsEdit() {
    const editEl = document.getElementById('study-goals-edit');
    const btnEl = document.getElementById('study-goals-edit-btn');
    const open = editEl.style.display !== 'none';
    if (open) {
        editEl.style.display = 'none';
        btnEl.textContent = 'Edit Goals';
    } else {
        const g = getStudyGoals();
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
        set('sg-overall-min', g.overall?.min); set('sg-overall-max', g.overall?.max);
        set('sg-acad-min', g.acad?.min); set('sg-acad-max', g.acad?.max);
        set('sg-books-min', g.books?.min); set('sg-books-max', g.books?.max);
        set('sg-skills-min', g.skills?.min); set('sg-skills-max', g.skills?.max);
        editEl.style.display = 'block';
        btnEl.textContent = 'Cancel';
    }
}

function saveStudyGoals() {
    const num = id => parseFloat(document.getElementById(id)?.value) || 0;
    setStudyGoals({
        overall: { min: num('sg-overall-min'), max: num('sg-overall-max') },
        acad: { min: num('sg-acad-min'), max: num('sg-acad-max') },
        books: { min: num('sg-books-min'), max: num('sg-books-max') },
        skills: { min: num('sg-skills-min'), max: num('sg-skills-max') },
    });
    document.getElementById('study-goals-edit').style.display = 'none';
    document.getElementById('study-goals-edit-btn').textContent = 'Edit Goals';
    showToast('Study goals saved! 🎯');
    renderStudy();
}

// Build a compact goal progress bar HTML for a stat card
// actual = hrs (float), goal = { min, max }, color
function buildStudyGoalBar(actual, goal, color) {
    if (!goal || (!goal.min && !goal.max)) return '';
    const min = goal.min || 0;
    const max = goal.max || 0;
    const target = min || max; // use min as primary target, fallback to max
    const pct = target > 0 ? Math.min(actual / target * 100, 100) : 0;
    const over = max > 0 && actual > max;
    const met = min > 0 && actual >= min;
    const barColor = over ? 'var(--danger)' : met ? 'var(--success)' : color;
    const label = over
        ? `Over max (${max}h)`
        : met
            ? `✓ Min met${max ? ' · cap: ' + max + 'h' : ''}`
            : min
                ? `${(min - actual).toFixed(1)}h to min`
                : `${actual.toFixed(1)} / ${max}h max`;
    return `
    <div class="progress-bar" style="margin-top:4px;">
      <div class="progress-fill" style="width:${pct.toFixed(1)}%; background:${barColor};"></div>
    </div>
    <div style="font-size:10px; color:${met && !over ? 'var(--success)' : over ? 'var(--danger)' : 'var(--muted)'}; margin-top:3px;">${label}</div>`;
}

// Build the big goals summary view (shown when not editing)
function renderStudyGoalsView() {
    const el = document.getElementById('study-goals-view');
    if (!el) return;
    const g = getStudyGoals();
    const hasAny = (g.overall?.min || g.overall?.max || g.acad?.min || g.acad?.max ||
        g.books?.min || g.books?.max || g.skills?.min || g.skills?.max);
    if (!hasAny) {
        el.innerHTML = '<div style="font-size:12px; color:var(--muted); font-style:italic;">No goals set yet — click Edit Goals to configure.</div>';
        return;
    }

    const today = todayStr();
    const acadHrs = getAcadLog().filter(e => e.date === today).reduce((a, e) => a + e.hrs, 0);
    const bookMins = DB.get('book_log', []).filter(e => e.date === today).reduce((a, e) => a + (e.mins || 0), 0);
    const bookHrs = bookMins / 60;
    const skillMins = DB.get('skill_log', []).filter(e => e.date === today).reduce((a, e) => a + (e.mins || 0), 0);
    const skillHrs = skillMins / 60;
    const totalHrs = getTotalStudyHrs(today);

    const rows = [
        { label: '📚 Overall', actual: totalHrs, goal: g.overall, color: 'var(--accent2)' },
        { label: '🎓 Academic', actual: acadHrs, goal: g.acad, color: 'var(--accent2)' },
        { label: '📖 Books', actual: bookHrs, goal: g.books, color: 'var(--success)' },
        { label: '🏆 Skills', actual: skillHrs, goal: g.skills, color: '#fb923c' },
    ].filter(r => r.goal?.min || r.goal?.max);

    el.innerHTML = rows.map(r => {
        const min = r.goal.min || 0, max = r.goal.max || 0;
        const target = min || max;
        const pct = target > 0 ? Math.min(r.actual / target * 100, 100) : 0;
        const over = max > 0 && r.actual > max;
        const met = min > 0 && r.actual >= min;
        const barColor = over ? 'var(--danger)' : met ? 'var(--success)' : r.color;
        const statusText = over
            ? `<span style="color:var(--danger); font-weight:600;">Over max</span>`
            : met
                ? `<span style="color:var(--success); font-weight:600;">✓ Done</span>`
                : min
                    ? `<span style="color:var(--muted);">${(min - r.actual).toFixed(2).replace(/\.?0+$/, '')}h to go</span>`
                    : `<span style="color:var(--muted);">No min set</span>`;
        const goalRange = min && max ? `${min}–${max}h` : min ? `min ${min}h` : `max ${max}h`;
        return `
    <div style="margin-bottom:14px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px; flex-wrap:wrap; gap:6px;">
        <div style="font-size:13px; font-weight:600;">${r.label}</div>
        <div style="display:flex; align-items:center; gap:10px; font-size:12px;">
          <span style="color:var(--text); font-weight:700;">${r.actual.toFixed(2).replace(/\.?0+$/, '') || '0'}h</span>
          <span style="color:var(--muted);">/ ${goalRange}</span>
          ${statusText}
        </div>
      </div>
      <div class="progress-bar" style="height:8px;">
        <div class="progress-fill" style="width:${pct.toFixed(1)}%; background:${barColor}; height:8px;"></div>
      </div>
      ${max > 0 && min > 0 ? `<div style="position:relative; height:6px; margin-top:2px;">
        <div style="position:absolute; left:${(min / max * 100).toFixed(1)}%; top:0; width:2px; height:6px; background:var(--accent); border-radius:1px;" title="Min goal: ${min}h"></div>
      </div>` : ''}
    </div>`;
    }).join('');
}

function renderStudy() {
    const goals = getStudyGoals();
    const todayHrs = getTotalStudyHrs(todayStr());
    document.getElementById('study-today-hrs').textContent = todayHrs + 'h';

    // Overall today goal bar
    const todayBarEl = document.getElementById('study-today-goal-bar');
    if (todayBarEl) todayBarEl.innerHTML = buildStudyGoalBar(todayHrs, goals.overall, 'var(--accent2)');

    renderStudyGoalsView();

    const weekDates = getWeekDates(todayStr());
    const weekHrs = weekDates.reduce((a, d) => a + getTotalStudyHrs(d), 0);
    document.getElementById('study-week-hrs').textContent = weekHrs.toFixed(1) + 'h';

    const monthStr = todayStr().slice(0, 7);
    const allStudyDates = getAllStudyDates();
    const monthHrs = allStudyDates.filter(d => d.startsWith(monthStr)).reduce((a, d) => a + getTotalStudyHrs(d), 0);
    document.getElementById('study-month-hrs').textContent = monthHrs.toFixed(1) + 'h';

    // ---- SVG Line Chart (last 7 days) ----
    const last7 = getLast7Days();
    const vals = last7.map(d => getTotalStudyHrs(d));
    const maxVal = Math.max(...vals, 1);

    const chartW = 480, chartH = 130, padL = 30, padR = 12, padT = 14, padB = 28;
    const innerW = chartW - padL - padR;
    const innerH = chartH - padT - padB;
    const xPos = i => padL + (i / (last7.length - 1)) * innerW;
    const yPos = v => padT + innerH - (v / maxVal) * innerH;

    const pathD = vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${xPos(i).toFixed(1)},${yPos(v).toFixed(1)}`).join(' ');
    const areaD = pathD + ` L${xPos(last7.length - 1).toFixed(1)},${(padT + innerH).toFixed(1)} L${padL},${(padT + innerH).toFixed(1)} Z`;

    const gridLines = [0, 0.25, 0.5, 0.75, 1].map(r => {
        const y = (padT + innerH - r * innerH).toFixed(1);
        const label = (maxVal * r).toFixed(1).replace(/\.0$/, '');
        return `<line x1="${padL}" y1="${y}" x2="${chartW - padR}" y2="${y}" stroke="var(--border)" stroke-width="1"/>
            <text x="${padL - 4}" y="${y}" text-anchor="end" dominant-baseline="middle" font-size="9" fill="var(--muted)" font-family="DM Sans,sans-serif">${label}</text>`;
    }).join('');

    const dots = last7.map((d, i) => {
        const label = new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' });
        const x = xPos(i).toFixed(1), y = yPos(vals[i]).toFixed(1);
        return `<text x="${x}" y="${chartH - 4}" text-anchor="middle" font-size="9" fill="var(--muted)" font-family="DM Sans,sans-serif">${label}</text>
            <circle cx="${x}" cy="${y}" r="3.5" fill="var(--accent2)" stroke="var(--surface)" stroke-width="1.5"/>`;
    }).join('');

    const svgChart = `<svg viewBox="0 0 ${chartW} ${chartH}" style="width:100%;height:auto;display:block;" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="studyGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--accent2)" stop-opacity="0.2"/>
        <stop offset="100%" stop-color="var(--accent2)" stop-opacity="0"/>
      </linearGradient>
    </defs>
    ${gridLines}
    <path d="${areaD}" fill="url(#studyGrad)"/>
    <path d="${pathD}" fill="none" stroke="var(--accent2)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}
  </svg>`;

    const barContainer = document.getElementById('study-week-chart');
    const labelContainer = document.getElementById('study-week-labels');
    barContainer.style.cssText = 'display:block;';
    barContainer.innerHTML = svgChart;
    labelContainer.style.display = 'none';
    labelContainer.innerHTML = '';

    renderBookSection();
    renderSkillsSection();
    renderAcadSessions();
}

// ============================================================
// ACADEMIC STUDY TRACKER
// ============================================================
function getAcadLog() { return DB.get('acad_study_log', []); }
function setAcadLog(d) { DB.set('acad_study_log', d); }

function addAcadSession() {
    const subject = document.getElementById('acad-subject-input').value.trim();
    const type = document.getElementById('acad-type-input').value;
    const hrs = parseFloat(document.getElementById('acad-hrs-input').value);
    const date = document.getElementById('acad-date-input').value || todayStr();
    const note = document.getElementById('acad-note-input').value.trim();
    if (!subject) return void showToast('Please enter a subject.');
    if (!hrs || hrs <= 0) return void showToast('Please enter a valid duration.');
    const log = getAcadLog();
    log.push({ id: genId(), date, subject, type, hrs, note });
    setAcadLog(log);
    document.getElementById('acad-subject-input').value = '';
    document.getElementById('acad-hrs-input').value = '';
    document.getElementById('acad-note-input').value = '';
    renderAcadSessions();
    showToast('Academic session logged!');
}

function removeAcadSession(id) {
    setAcadLog(getAcadLog().filter(e => e.id !== id));
    renderAcadSessions();
}

const ACAD_TYPE_COLOR = {
    'Revision': 'var(--accent2)',
    'Lecture': 'var(--accent)',
    'Assignment': '#fb923c',
    'Past Papers': '#f87171',
    'Research': '#38bdf8',
    'Lab': '#34d399',
    'Group Study': '#f472b6',
    'Other': 'var(--muted)'
};

function renderAcadSessions() {
    const all = getAcadLog();
    const today = todayStr();
    const weekD = getWeekDates(today);
    const monthStr = today.slice(0, 7);
    const allDays = DB.getDays();
    const filter = (document.getElementById('acad-filter-input')?.value || '').toLowerCase();

    // Stats
    const todayHrs = all.filter(e => e.date === today)
        .reduce((a, e) => a + e.hrs, 0);
    const weekHrs = all.filter(e => weekD.includes(e.date))
        .reduce((a, e) => a + e.hrs, 0);
    const monthHrs = all.filter(e => e.date.startsWith(monthStr))
        .reduce((a, e) => a + e.hrs, 0);

    document.getElementById('acad-today-hrs').textContent = todayHrs + 'h';
    document.getElementById('acad-week-hrs').textContent = weekHrs.toFixed(1) + 'h';
    document.getElementById('acad-month-hrs').textContent = monthHrs.toFixed(1) + 'h';

    // Goal bar
    const acadBarEl = document.getElementById('acad-today-goal-bar');
    if (acadBarEl) acadBarEl.innerHTML = buildStudyGoalBar(todayHrs, getStudyGoals().acad, 'var(--accent2)');

    // Recent sessions list
    const filtered = all
        .filter(e => !filter || e.subject.toLowerCase().includes(filter) || e.type.toLowerCase().includes(filter))
        .slice().sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
        .slice(0, 30);

    const listEl = document.getElementById('acad-log-list');
    listEl.innerHTML = filtered.length ? filtered.map(e => {
        const col = ACAD_TYPE_COLOR[e.type] || 'var(--muted)';
        return `
    <div style="background:var(--surface2); border-radius:10px; padding:12px 14px; margin-bottom:8px; border-left:3px solid ${col};">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
        <div style="flex:1; min-width:0;">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:2px;">
            <span style="font-size:13px; font-weight:600;">${esc(e.subject)}</span>
            <span style="font-size:11px; padding:2px 7px; border-radius:4px; background:rgba(255,255,255,0.06); color:${col};">${e.type}</span>
            <span style="font-size:12px; font-weight:600; color:var(--accent);">${e.hrs}h</span>
          </div>
          <div style="font-size:11px; color:var(--muted);">${fmtDateShort(e.date)}</div>
          ${e.note ? `<div style="font-size:12px; color:var(--text); margin-top:6px; line-height:1.5; border-top:1px solid var(--border); padding-top:6px; opacity:0.8;">${esc(e.note)}</div>` : ''}
        </div>
        <button class="btn btn-ghost" onclick="removeAcadSession('${e.id}')" style="font-size:14px; padding:2px 8px; flex-shrink:0;">✕</button>
      </div>
    </div>`;
    }).join('') : `<div style="color:var(--muted); font-size:13px; padding:8px 0;">${filter ? 'No sessions match your filter.' : 'No academic sessions logged yet.'}</div>`;

    // Weekly subject breakdown
    const weekEntries = all.filter(e => weekD.includes(e.date));
    const subjectMap = {};
    weekEntries.forEach(e => {
        if (!subjectMap[e.subject]) subjectMap[e.subject] = { hrs: 0, types: {} };
        subjectMap[e.subject].hrs += e.hrs;
        subjectMap[e.subject].types[e.type] = (subjectMap[e.subject].types[e.type] || 0) + e.hrs;
    });
    const sorted = Object.entries(subjectMap).sort((a, b) => b[1].hrs - a[1].hrs);
    const maxH = sorted.length ? sorted[0][1].hrs : 1;
    const breakdownEl = document.getElementById('acad-week-breakdown');
    breakdownEl.innerHTML = sorted.length ? sorted.map(([subj, data]) => {
        const pct = Math.round(data.hrs / maxH * 100);
        const topType = Object.entries(data.types).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
        const col = ACAD_TYPE_COLOR[topType] || 'var(--accent2)';
        return `
    <div style="margin-bottom:12px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
        <span style="font-size:13px; font-weight:500;">${esc(subj)}</span>
        <span style="font-size:12px; color:var(--muted);">${data.hrs.toFixed(1)}h</span>
      </div>
      <div style="height:6px; background:var(--surface2); border-radius:3px; overflow:hidden;">
        <div style="height:6px; width:${pct}%; background:${col}; border-radius:3px; transition:width 0.3s;"></div>
      </div>
    </div>`;
    }).join('') : '<div style="color:var(--muted); font-size:13px;">No academic sessions this week.</div>';
}

// ============================================================
// BOOK READING TRACKER
// ============================================================
function addBookEntry() {
    const title = document.getElementById('book-title-input').value.trim();
    const author = document.getElementById('book-author-input').value.trim();
    const pages = parseInt(document.getElementById('book-pages-input').value) || 0;
    const mins = parseInt(document.getElementById('book-time-input').value) || 0;
    const range = document.getElementById('book-range-input').value.trim();
    const note = document.getElementById('book-note-input').value.trim();
    if (!title) return void showToast('Please enter a book title.');
    if (!pages && !mins) return void showToast('Please enter pages read or time spent.');
    const logs = DB.get('book_log', []);
    logs.push({ id: genId(), date: todayStr(), title, author, pages, mins, range, note });
    DB.set('book_log', logs);
    document.getElementById('book-title-input').value = '';
    document.getElementById('book-author-input').value = '';
    document.getElementById('book-pages-input').value = '';
    document.getElementById('book-time-input').value = '';
    document.getElementById('book-range-input').value = '';
    document.getElementById('book-note-input').value = '';
    renderBookSection();
    saveLogScreen();
    showToast('Reading session logged!');
}

function removeBookEntry(id) {
    DB.set('book_log', DB.get('book_log', []).filter(e => e.id !== id));
    saveLogScreen();
    renderBookSection();
}

function renderBookSection() {
    const all = DB.get('book_log', []);
    const today = todayStr();
    const weekD = getWeekDates(today);
    const todayE = all.filter(e => e.date === today);
    const weekE = all.filter(e => weekD.includes(e.date));
    const titles = [...new Set(all.map(e => e.title))];

    document.getElementById('books-pages-today').textContent = todayE.reduce((a, e) => a + (e.pages || 0), 0);
    const bookMinsToday = todayE.reduce((a, e) => a + (e.mins || 0), 0);
    const bookHrsToday = bookMinsToday / 60;
    const bookTimeTodayEl = document.getElementById('books-time-today');
    if (bookTimeTodayEl) bookTimeTodayEl.textContent = bookMinsToday >= 60 ? (bookHrsToday).toFixed(1) + 'h' : bookMinsToday + 'm';
    document.getElementById('books-unique-count').textContent = titles.length;

    // Goal bar
    const booksBarEl = document.getElementById('books-today-goal-bar');
    if (booksBarEl) booksBarEl.innerHTML = buildStudyGoalBar(bookHrsToday, getStudyGoals().books, 'var(--success)');

    const recent = all.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
    document.getElementById('book-log-list').innerHTML = recent.length ? recent.map(e => `
    <div style="background:var(--surface2); border-radius:10px; padding:12px 14px; margin-bottom:8px; border-left:3px solid var(--success);">
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <div style="flex:1;">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span style="font-size:13px; font-weight:600;">${esc(e.title)}</span>
            ${e.author ? `<span style="font-size:11px; color:var(--muted);">by ${esc(e.author)}</span>` : ''}
            <span style="font-size:11px; color:var(--muted); margin-left:auto;">${fmtDateShort(e.date)}</span>
          </div>
          <div style="display:flex; gap:10px; margin-top:4px; flex-wrap:wrap;">
            ${e.pages ? `<span class="pill pill-green" style="font-size:10px;">${e.pages} pages</span>` : ''}
            ${e.mins ? `<span class="pill pill-yellow" style="font-size:10px;">${e.mins} min</span>` : ''}
            ${e.range ? `<span class="tag">pp. ${esc(e.range)}</span>` : ''}
          </div>
          ${e.note ? `<div style="font-size:12px; color:var(--text); margin-top:8px; line-height:1.5; border-top:1px solid var(--border); padding-top:6px;">💡 ${esc(e.note)}</div>` : ''}
        </div>
        <button class="btn btn-ghost" onclick="removeBookEntry('${e.id}')" style="font-size:14px; padding:2px 8px; margin-left:8px;">✕</button>
      </div>
    </div>
  `).join('') : '<div style="color:var(--muted); font-size:13px;">No reading sessions logged yet.</div>';
}

// ============================================================
// SKILLS TRACKER
// ============================================================
function addSkillEntry() {
    const name = document.getElementById('skill-name-input').value.trim();
    const category = document.getElementById('skill-category-input').value;
    const mins = parseInt(document.getElementById('skill-time-input').value) || 0;
    const note = document.getElementById('skill-note-input').value.trim();
    if (!name) return void showToast('Please enter a skill name.');
    if (!mins || mins <= 0) return void showToast('Please enter time invested.');
    const logs = DB.get('skill_log', []);
    logs.push({ id: genId(), date: todayStr(), name, category, mins, note });
    DB.set('skill_log', logs);
    document.getElementById('skill-name-input').value = '';
    document.getElementById('skill-time-input').value = '';
    document.getElementById('skill-note-input').value = '';
    renderSkillsSection();
    showToast('Skill practice logged!');
}

function removeSkillEntry(id) {
    DB.set('skill_log', DB.get('skill_log', []).filter(e => e.id !== id));
    renderSkillsSection();
}

const SKILL_CAT_COLORS = {
    Technical: 'var(--accent2)', Language: 'var(--accent)', Creative: '#f472b6',
    Physical: 'var(--success)', Social: '#fb923c', Business: '#facc15',
    Academic: '#38bdf8)', Religious: '#a3e635', Other: 'var(--muted)'
};

function renderSkillsSection() {
    const all = DB.get('skill_log', []);
    const today = todayStr();
    const weekD = getWeekDates(today);
    const todayE = all.filter(e => e.date === today);
    const weekE = all.filter(e => weekD.includes(e.date));

    const todayMins = todayE.reduce((a, e) => a + (e.mins || 0), 0);
    const todayHrsSkills = todayMins / 60;
    const skillTodayEl = document.getElementById('skills-today-count');
    if (skillTodayEl) skillTodayEl.textContent = todayMins >= 60 ? (todayHrsSkills).toFixed(1) + 'h' : todayMins + 'm';
    const weekMins = weekE.reduce((a, e) => a + (e.mins || 0), 0);
    document.getElementById('skills-week-hrs').textContent = (weekMins / 60).toFixed(1) + 'h';

    // Goal bar
    const skillsBarEl = document.getElementById('skills-today-goal-bar');
    if (skillsBarEl) skillsBarEl.innerHTML = buildStudyGoalBar(todayHrsSkills, getStudyGoals().skills, '#fb923c');

    // Today log
    document.getElementById('skill-today-list').innerHTML = todayE.length ? todayE.map(e => {
        const col = SKILL_CAT_COLORS[e.category] || 'var(--muted)';
        return `
    <div style="background:var(--surface2); border-radius:10px; padding:12px 14px; margin-bottom:8px; border-left:3px solid ${col};">
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <div>
          <div style="font-size:13px; font-weight:600;">${esc(e.name)} <span style="font-size:11px; color:var(--muted); font-weight:400;">[${esc(e.category)}]</span></div>
          <div style="font-size:11px; color:var(--muted); margin-top:2px;">${e.mins} min${e.mins >= 60 ? ' (' + (e.mins / 60).toFixed(1) + 'h)' : ''}</div>
          ${e.note ? `<div style="font-size:12px; color:var(--text); margin-top:6px; line-height:1.5; border-top:1px solid var(--border); padding-top:6px;">💡 ${esc(e.note)}</div>` : ''}
        </div>
        <button class="btn btn-ghost" onclick="removeSkillEntry('${e.id}')" style="font-size:14px; padding:2px 8px;">✕</button>
      </div>
    </div>`;
    }).join('') : '<div style="color:var(--muted); font-size:13px;">No skill practice logged today.</div>';

    // Weekly breakdown by skill
    const skillTotals = {};
    weekE.forEach(e => {
        if (!skillTotals[e.name]) skillTotals[e.name] = { mins: 0, category: e.category };
        skillTotals[e.name].mins += e.mins;
    });
    const sorted = Object.entries(skillTotals).sort((a, b) => b[1].mins - a[1].mins);
    const maxMins = sorted.length ? sorted[0][1].mins : 1;
    document.getElementById('skill-week-breakdown').innerHTML = sorted.length ? sorted.map(([name, data]) => {
        const col = SKILL_CAT_COLORS[data.category] || 'var(--muted)';
        const pct = Math.round(data.mins / maxMins * 100);
        const hrs = (data.mins / 60).toFixed(1);
        return `
    <div style="margin-bottom:12px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
        <div style="font-size:13px; font-weight:500;">${esc(name)} <span style="font-size:11px; color:var(--muted);">[${data.category}]</span></div>
        <div style="font-size:12px; color:var(--muted);">${data.mins}m · ${hrs}h</div>
      </div>
      <div style="height:6px; background:var(--surface2); border-radius:3px;">
        <div style="height:6px; width:${pct}%; background:${col}; border-radius:3px; transition:width 0.3s;"></div>
      </div>
    </div>`;
    }).join('') : '<div style="color:var(--muted); font-size:13px;">No skill practice logged this week.</div>';
}

// ============================================================
// NUTRITION PAGE
// ============================================================
function getNutritionGoals() {
    return DB.get('nutrition_goals', { cal: 0, protein: 0, carbs: 0, water: 0 });
}

function saveNutritionGoals() {
    const goals = {
        cal: parseFloat(document.getElementById('goal-cal').value) || 0,
        protein: parseFloat(document.getElementById('goal-protein').value) || 0,
        carbs: parseFloat(document.getElementById('goal-carbs').value) || 0,
        water: parseFloat(document.getElementById('goal-water').value) || 0,
    };
    DB.set('nutrition_goals', goals);
    showToast('Goals saved!');
    renderNutritionToday();
    renderNutritionAnalytics();
}

function loadNutritionGoalsForm() {
    const g = getNutritionGoals();
    if (g.cal) document.getElementById('goal-cal').value = g.cal;
    if (g.protein) document.getElementById('goal-protein').value = g.protein;
    if (g.carbs) document.getElementById('goal-carbs').value = g.carbs;
    if (g.water) document.getElementById('goal-water').value = g.water;
    // Restore saved calculator state if any
    const s = DB.get('calc_state', null);
    if (s) {
        if (s.sex) setCalcSex(s.sex, false);
        if (s.age) document.getElementById('calc-age').value = s.age;
        if (s.weight) document.getElementById('calc-weight').value = s.weight;
        if (s.height) document.getElementById('calc-height').value = s.height;
        if (s.activity) document.getElementById('calc-activity').value = s.activity;
        if (s.obj) setGoalObj(s.obj, false);
        if (s.intensity) document.getElementById('calc-gym-intensity').value = s.intensity;
        if (s.creatine) document.getElementById('calc-creatine').checked = s.creatine;
        if (s.preworkout) document.getElementById('calc-preworkout').checked = s.preworkout;
        if (s.proteinPowder) document.getElementById('calc-protein-powder').checked = s.proteinPowder;
        liveCalc();
    }
}

// ── Calculator state ──────────────────────────────────────────
let calcSex = 'male';
let calcObj = 'maintain';

function setCalcSex(sex, recalc = true) {
    calcSex = sex;
    document.getElementById('calc-sex-male').style.cssText = sex === 'male'
        ? 'flex:1;padding:9px;border-radius:8px;border:1px solid var(--accent);background:rgba(200,169,110,0.1);color:var(--accent);cursor:pointer;font-family:inherit;font-size:13px;transition:all 0.2s;font-weight:600;'
        : 'flex:1;padding:9px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--muted);cursor:pointer;font-family:inherit;font-size:13px;transition:all 0.2s;';
    document.getElementById('calc-sex-female').style.cssText = sex === 'female'
        ? 'flex:1;padding:9px;border-radius:8px;border:1px solid var(--accent);background:rgba(200,169,110,0.1);color:var(--accent);cursor:pointer;font-family:inherit;font-size:13px;transition:all 0.2s;font-weight:600;'
        : 'flex:1;padding:9px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--muted);cursor:pointer;font-family:inherit;font-size:13px;transition:all 0.2s;';
    if (recalc) liveCalc();
}

function setGoalObj(obj, recalc = true) {
    calcObj = obj;
    const btns = { cut: 'gobj-cut', maintain: 'gobj-maintain', bulk: 'gobj-bulk' };
    Object.entries(btns).forEach(([key, id]) => {
        const active = key === obj;
        const colors = { cut: 'var(--danger)', maintain: 'var(--accent)', bulk: 'var(--success)' };
        const bgs = { cut: 'rgba(248,113,113,0.1)', maintain: 'rgba(200,169,110,0.08)', bulk: 'rgba(74,222,128,0.1)' };
        document.getElementById(id).style.cssText = active
            ? `padding:10px 6px;border-radius:8px;border:1px solid ${colors[key]};background:${bgs[key]};color:${colors[key]};cursor:pointer;font-family:inherit;font-size:12px;text-align:center;transition:all 0.2s;line-height:1.4;font-weight:600;`
            : 'padding:10px 6px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--muted);cursor:pointer;font-family:inherit;font-size:12px;text-align:center;transition:all 0.2s;line-height:1.4;';
    });
    if (recalc) liveCalc();
}

function liveCalc() {
    const age = parseFloat(document.getElementById('calc-age').value);
    const weight = parseFloat(document.getElementById('calc-weight').value);
    const height = parseFloat(document.getElementById('calc-height').value);
    const activity = parseFloat(document.getElementById('calc-activity').value);
    const intensity = document.getElementById('calc-gym-intensity').value;
    const creatine = document.getElementById('calc-creatine').checked;
    const preworkout = document.getElementById('calc-preworkout').checked;
    const proteinPow = document.getElementById('calc-protein-powder').checked;

    // Save state
    DB.set('calc_state', { sex: calcSex, age, weight, height, activity, obj: calcObj, intensity, creatine, preworkout, proteinPowder: proteinPow });

    if (!age || !weight || !height || isNaN(activity)) {
        document.getElementById('calc-results').style.display = 'none';
        document.getElementById('calc-results-placeholder').style.display = 'block';
        return;
    }

    // Mifflin-St Jeor BMR
    let bmr;
    if (calcSex === 'male') {
        bmr = 10 * weight + 6.25 * height - 5 * age + 5;
    } else {
        bmr = 10 * weight + 6.25 * height - 5 * age - 161;
    }
    const tdee = Math.round(bmr * activity);
    bmr = Math.round(bmr);

    // Calorie adjustment based on goal
    const adjMap = { cut: -500, maintain: 0, bulk: 300 };
    // Tighten cut/bulk based on gym intensity
    const intensityFactor = { low: 0.8, med: 1.0, high: 1.15 };
    const factor = intensityFactor[intensity] || 1;
    const adj = Math.round((adjMap[calcObj] || 0) * factor);
    const targetCal = tdee + adj;

    // Protein: based on goal + gym intensity
    const proteinMultiplier = {
        cut: { low: 1.8, med: 2.0, high: 2.2 },
        maintain: { low: 1.6, med: 1.8, high: 2.0 },
        bulk: { low: 1.8, med: 2.0, high: 2.2 },
    };
    let pm = proteinMultiplier[calcObj]?.[intensity] || 1.8;
    // Protein powder: slightly lower need since supplement fills the gap
    if (proteinPow) pm = Math.max(pm - 0.1, 1.6);
    const protein = Math.round(weight * pm);
    const proteinCal = protein * 4;

    // Fat: 25–30% of calories
    const fatPct = calcObj === 'cut' ? 0.25 : 0.28;
    const fat = Math.round((targetCal * fatPct) / 9);
    const fatCal = fat * 9;

    // Carbs: remainder
    const carbs = Math.round((targetCal - proteinCal - fatCal) / 4);
    const carbsCal = carbs * 4;

    // Macro % for split bar
    const protPct = Math.round(proteinCal / targetCal * 100);
    const carbPct = Math.round(carbsCal / targetCal * 100);
    const fatPctDisplay = 100 - protPct - carbPct;

    // ── WATER CALCULATION ──────────────────────────────────────
    // Base: 35ml per kg body weight
    let baseWaterMl = Math.round(weight * 35);
    // Activity factor bump
    const activityWaterMap = { '1.2': 0, '1.375': 200, '1.55': 350, '1.725': 500, '1.9': 700 };
    baseWaterMl += activityWaterMap[String(activity)] || 300;
    // Goal bump
    if (calcObj === 'bulk') baseWaterMl += 200;
    if (calcObj === 'cut') baseWaterMl += 100;
    // Supplements bump
    let suppWaterMl = 0;
    const suppNotes = [];
    if (creatine) { suppWaterMl += 400; suppNotes.push('+400ml for creatine'); }
    if (preworkout) { suppWaterMl += 200; suppNotes.push('+200ml for pre-workout'); }
    const totalWaterMl = baseWaterMl + suppWaterMl;
    const totalWaterL = (totalWaterMl / 1000).toFixed(1);

    // Render results
    const adjLabel = adj === 0 ? 'No adjustment (maintenance)' : (adj > 0 ? `+${adj} kcal (surplus)` : `${adj} kcal (deficit)`);
    const goalLabels = { cut: 'Fat loss — caloric deficit', maintain: 'Maintenance calories', bulk: 'Muscle gain — caloric surplus' };

    document.getElementById('res-cal').textContent = targetCal + ' kcal';
    document.getElementById('res-cal-note').textContent = goalLabels[calcObj];
    document.getElementById('res-protein').textContent = protein + 'g';
    document.getElementById('res-protein-note').textContent = `${pm.toFixed(1)}g × ${weight}kg${proteinPow ? ' (with powder)' : ''}`;
    document.getElementById('res-carbs').textContent = carbs + 'g';
    document.getElementById('res-carbs-note').textContent = `~${carbPct}% of calories`;
    document.getElementById('res-bmr').textContent = bmr + ' kcal';
    document.getElementById('res-tdee').textContent = tdee + ' kcal';
    document.getElementById('res-adj').textContent = adjLabel;

    document.getElementById('res-split-bar').innerHTML =
        `<div style="width:${protPct}%;background:var(--accent2);height:100%;"></div>` +
        `<div style="width:${carbPct}%;background:var(--success);height:100%;"></div>` +
        `<div style="width:${fatPctDisplay}%;background:var(--accent);height:100%;"></div>`;
    document.getElementById('res-split-labels').innerHTML =
        `<span style="color:var(--accent2);">■ Protein ${protPct}%</span>` +
        `<span style="color:var(--success);">■ Carbs ${carbPct}%</span>` +
        `<span style="color:var(--accent);">■ Fat ${fatPctDisplay}%</span>`;

    // Water result
    document.getElementById('res-water').textContent = totalWaterL + ' L  (' + totalWaterMl + ' ml)';
    document.getElementById('res-water-note').textContent = `Base: ${(baseWaterMl / 1000).toFixed(1)}L (${weight}kg × 35ml + activity)`;
    const suppNoteEl = document.getElementById('res-supp-note');
    if (suppNotes.length) {
        suppNoteEl.textContent = '+ Supplements: ' + suppNotes.join(', ');
        suppNoteEl.style.display = 'block';
    } else {
        suppNoteEl.style.display = 'none';
    }

    // Store for apply button
    window._calcResult = { cal: targetCal, protein, carbs, water: totalWaterMl };

    document.getElementById('calc-results').style.display = 'block';
    document.getElementById('calc-results-placeholder').style.display = 'none';
}

function applyCalculatedGoals() {
    if (!window._calcResult) return;
    document.getElementById('goal-cal').value = window._calcResult.cal;
    document.getElementById('goal-protein').value = window._calcResult.protein;
    document.getElementById('goal-carbs').value = window._calcResult.carbs;
    if (window._calcResult.water) document.getElementById('goal-water').value = window._calcResult.water;
    saveNutritionGoals();
    showToast('Calculated targets applied! ✓');
}

function getDayMacros(dateStr) {
    const meals = DB.getDay(dateStr).meals || [];
    let cal = 0, protein = 0, carbs = 0;
    meals.forEach(m => m.items.forEach(i => {
        cal += i.cal || 0;
        protein += i.protein || 0;
        carbs += i.carbs || 0;
    }));
    return { cal: Math.round(cal), protein: Math.round(protein), carbs: Math.round(carbs) };
}

function switchNutritionTab(tab) {
    nutritionTab = tab;
    const tabs = ['today', 'analytics', 'goals', 'library'];
    document.querySelectorAll('#nutrition-toggle .toggle-btn').forEach((b, i) => {
        b.classList.toggle('active', tabs[i] === tab);
    });
    tabs.forEach(t => {
        const el = document.getElementById('nutr-tab-' + t);
        if (el) el.style.display = t === tab ? 'block' : 'none';
    });
    if (tab === 'today') renderNutritionToday();
    else if (tab === 'analytics') renderNutritionAnalytics();
    else if (tab === 'goals') loadNutritionGoalsForm();
    else if (tab === 'library') renderFoodLibrary();
}

function renderNutrition() {
    if (nutritionTab === 'today') renderNutritionToday();
    else if (nutritionTab === 'analytics') renderNutritionAnalytics();
    else if (nutritionTab === 'goals') loadNutritionGoalsForm();
    else if (nutritionTab === 'library') renderFoodLibrary();
}

function renderNutritionToday() {
    const macros = getDayMacros(todayStr());
    const goals = getNutritionGoals();

    // Macro ring cards
    function ringCard(label, val, target, color, unit) {
        const pct = target > 0 ? Math.min(val / target * 100, 100) : 0;
        const r = 28, circ = +(2 * Math.PI * r).toFixed(2);
        const dash = +(pct / 100 * circ).toFixed(2);
        const statusColor = target > 0 ? (pct >= 100 ? 'var(--success)' : 'var(--muted)') : 'var(--muted)';
        const statusText = target > 0
            ? (pct >= 100 ? '✓ Goal met!' : `${Math.round(target - val)}${unit} to go`)
            : 'No target set';
        return `
      <div class="card card-sm" style="display:flex;align-items:center;gap:14px;">
        <div style="position:relative;flex-shrink:0;width:72px;height:72px;">
          <svg width="72" height="72" style="transform:rotate(-90deg);">
            <circle cx="36" cy="36" r="${r}" fill="none" stroke="var(--surface2)" stroke-width="6"/>
            <circle cx="36" cy="36" r="${r}" fill="none" stroke="${color}" stroke-width="6"
              stroke-dasharray="${dash} ${circ}" stroke-linecap="round"/>
          </svg>
          <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;">${Math.round(pct)}%</div>
        </div>
        <div>
          <div class="label" style="margin-bottom:3px;">${label}</div>
          <div style="font-size:24px;font-weight:700;font-family:'DM Serif Display',serif;">${val}${unit === 'kcal' ? '' : unit}</div>
          ${target > 0 ? `<div style="font-size:11px;color:var(--muted);">of ${target}${unit}</div>` : ''}
          <div style="font-size:11px;color:${statusColor};margin-top:2px;">${statusText}</div>
        </div>
      </div>`;
    }

    document.getElementById('nutr-macros-today').innerHTML =
        `<div class="grid-3">
      ${ringCard('Calories', macros.cal, goals.cal, 'var(--accent)', 'kcal')}
      ${ringCard('Protein', macros.protein, goals.protein, 'var(--accent2)', 'g')}
      ${ringCard('Carbs', macros.carbs, goals.carbs, 'var(--success)', 'g')}
    </div>`;

    // Target vs actual bars
    const el = document.getElementById('nutr-target-chart');
    if (el) {
        const items = [
            { label: 'Calories', val: macros.cal, target: goals.cal, color: 'var(--accent)', unit: 'kcal' },
            { label: 'Protein', val: macros.protein, target: goals.protein, color: 'var(--accent2)', unit: 'g' },
            { label: 'Carbs', val: macros.carbs, target: goals.carbs, color: 'var(--success)', unit: 'g' },
        ];
        el.innerHTML = items.map(item => {
            const hasTarget = item.target > 0;
            const pct = hasTarget ? Math.min(item.val / item.target * 100, 110) : 0;
            const over = hasTarget && item.val > item.target;
            const barColor = over ? 'var(--danger)' : item.color;
            return `
        <div style="margin-bottom:18px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <div style="font-size:13px;font-weight:500;">${item.label}</div>
            <div style="font-size:13px;color:var(--muted);">
              <span style="color:var(--text);font-weight:600;">${item.val}${item.unit}</span>
              ${hasTarget ? ` / ${item.target}${item.unit}` : ' <span style="font-size:11px;">(no target set)</span>'}
              ${over ? ' <span style="color:var(--danger);font-size:11px;">▲ over</span>' : ''}
            </div>
          </div>
          <div style="height:10px;background:var(--surface2);border-radius:5px;overflow:hidden;">
            <div style="height:100%;width:${pct.toFixed(1)}%;background:${barColor};border-radius:5px;transition:width 0.6s ease;"></div>
          </div>
          ${hasTarget ? `<div style="display:flex;justify-content:space-between;margin-top:3px;"><span style="font-size:10px;color:var(--muted);">0</span><span style="font-size:10px;color:var(--muted);">Target: ${item.target}${item.unit}</span></div>` : ''}
        </div>`;
        }).join('');
    }

    // Meals list
    const meals = DB.getDay(todayStr()).meals || [];
    document.getElementById('nutr-meals-today').innerHTML = meals.length ? meals.map((m, i) => `
    <div class="food-item" style="flex-direction:column;align-items:flex-start;margin-bottom:10px;">
      <div style="display:flex;align-items:center;justify-content:space-between;width:100%;margin-bottom:6px;">
        <div style="font-size:14px;font-weight:600;">${esc(m.name)} <span style="color:var(--muted);font-weight:400;font-size:12px;">(${m.items.length} item${m.items.length !== 1 ? 's' : ''})</span></div>
        <button class="btn btn-ghost" onclick="removeMealNutr(${i})" style="font-size:14px;padding:2px 6px;">✕</button>
      </div>
      ${m.items.map(it => `<div class="tag" style="margin:2px;">${esc(it.name)} · <b>${it.cal}</b> kcal · <b>${it.protein}g</b> P · <b>${it.carbs}g</b> C</div>`).join('')}
    </div>
  `).join('') : '<div style="color:var(--muted);font-size:13px;text-align:center;padding:30px;">No meals today. Add one!</div>';

    renderWaterTracker();
}

function renderNutritionAnalytics() {
    const last7 = getLast7Days();
    const goals = getNutritionGoals();

    // 7-day averages
    const sums = last7.reduce((a, d) => {
        const m = getDayMacros(d);
        a.cal += m.cal; a.protein += m.protein; a.carbs += m.carbs;
        return a;
    }, { cal: 0, protein: 0, carbs: 0 });
    const avg = { cal: Math.round(sums.cal / 7), protein: Math.round(sums.protein / 7), carbs: Math.round(sums.carbs / 7) };

    function statCard(label, avgVal, target, unit, color) {
        const pct = target > 0 ? Math.round(avgVal / target * 100) : null;
        const pillBg = pct == null ? 'var(--surface2)' : pct >= 90 && pct <= 115 ? 'rgba(74,222,128,0.15)' : pct < 90 ? 'rgba(124,110,240,0.15)' : 'rgba(248,113,113,0.15)';
        const pillCol = pct == null ? 'var(--muted)' : pct >= 90 && pct <= 115 ? 'var(--success)' : pct < 90 ? 'var(--accent2)' : 'var(--danger)';
        const pillTxt = pct == null ? 'No goal set' : `${pct}% of goal`;
        return `
      <div class="card card-sm">
        <div class="label">${label} <span style="font-size:10px;">(7-day avg)</span></div>
        <div style="font-size:30px;font-family:'DM Serif Display',serif;margin:6px 0;">${avgVal}${unit}</div>
        ${target ? `<div style="font-size:11px;color:var(--muted);margin-bottom:6px;">Target: ${target}${unit}/day</div>` : '<div style="font-size:11px;color:var(--muted);margin-bottom:6px;">No target set</div>'}
        <span style="font-size:11px;padding:3px 9px;border-radius:20px;background:${pillBg};color:${pillCol};font-weight:600;">${pillTxt}</span>
      </div>`;
    }

    document.getElementById('nutr-analytics-stats').innerHTML =
        statCard('Calories', avg.cal, goals.cal, ' kcal', 'var(--accent)') +
        statCard('Protein', avg.protein, goals.protein, 'g', 'var(--accent2)') +
        statCard('Carbs', avg.carbs, goals.carbs, 'g', 'var(--success)');

    // 7-day line chart
    const el = document.getElementById('nutr-trend-chart');
    if (el) {
        const data = last7.map(d => getDayMacros(d));
        const labels = last7.map(d => { const dt = new Date(d + 'T00:00:00'); return dt.toLocaleDateString('en-US', { weekday: 'short' }) + ' ' + dt.getDate(); });
        const n = last7.length;
        const calScale = 10;
        const calVals = data.map(d => d.cal / calScale);
        const protVals = data.map(d => d.protein);
        const carbVals = data.map(d => d.carbs);
        const allVals = [...calVals, ...protVals, ...carbVals,
        goals.cal ? goals.cal / calScale : 0, goals.protein || 0, goals.carbs || 0];
        const maxVal = Math.max(...allVals, 10);
        const W = 680, H = 200, pL = 34, pR = 14, pT = 16, pB = 40;
        const cW = W - pL - pR, cH = H - pT - pB;
        const xOf = i => pL + (n > 1 ? (i / (n - 1)) * cW : cW / 2);
        const yOf = v => pT + cH - (Math.max(v, 0) / maxVal) * cH;

        function curve(vals) {
            if (n === 1) return `M${xOf(0)},${yOf(vals[0])}`;
            let d = `M${xOf(0)},${yOf(vals[0])}`;
            for (let i = 0; i < n - 1; i++) {
                const cpx = (xOf(i) + xOf(i + 1)) / 2;
                d += ` C${cpx},${yOf(vals[i])} ${cpx},${yOf(vals[i + 1])} ${xOf(i + 1)},${yOf(vals[i + 1])}`;
            }
            return d;
        }
        function area(vals) {
            const bot = pT + cH;
            return `${curve(vals)} L${xOf(n - 1)},${bot} L${xOf(0)},${bot} Z`;
        }
        function dotRow(vals, col) {
            return vals.map((v, i) => v > 0
                ? `<circle cx="${xOf(i).toFixed(1)}" cy="${yOf(v).toFixed(1)}" r="3.5" fill="${col}" stroke="var(--surface)" stroke-width="1.5"/>`
                : '').join('');
        }
        function dashed(yVal) {
            const y = yOf(yVal).toFixed(1);
            return `<line x1="${pL}" y1="${y}" x2="${W - pR}" y2="${y}" stroke="var(--border)" stroke-width="1.5" stroke-dasharray="5,4"/>`;
        }
        const gridLines = [0.25, 0.5, 0.75, 1].map(f => {
            const y = (pT + cH * (1 - f)).toFixed(1);
            return `<line x1="${pL}" y1="${y}" x2="${W - pR}" y2="${y}" stroke="var(--border)" stroke-width="0.5"/>
        <text x="${pL - 4}" y="${+y + 4}" text-anchor="end" font-size="9" fill="var(--muted)" font-family="DM Sans,sans-serif">${Math.round(maxVal * f)}</text>`;
        }).join('');
        const xLabels = labels.map((l, i) =>
            `<text x="${xOf(i).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="10" fill="var(--muted)" font-family="DM Sans,sans-serif">${l}</text>`
        ).join('');
        const pCal = curve(calVals), pProt = curve(protVals), pCarb = curve(carbVals);
        el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block;">
      ${gridLines}
      ${goals.cal ? dashed(goals.cal / calScale) : ''}
      ${goals.protein ? dashed(goals.protein) : ''}
      ${goals.carbs ? dashed(goals.carbs) : ''}
      <path d="${area(carbVals)}"  fill="#4ade80" opacity="0.07"/>
      <path d="${area(protVals)}"  fill="#7c6ef0" opacity="0.07"/>
      <path d="${area(calVals)}"   fill="#c8a96e" opacity="0.07"/>
      <path d="${pCarb}" fill="none" stroke="#4ade80" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="${pProt}" fill="none" stroke="#7c6ef0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="${pCal}"  fill="none" stroke="#c8a96e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      ${dotRow(carbVals, '#4ade80')}${dotRow(protVals, '#7c6ef0')}${dotRow(calVals, '#c8a96e')}
      ${xLabels}
      <text x="${W - pR}" y="${pT - 3}" text-anchor="end" font-size="9" fill="var(--muted)" font-family="DM Sans,sans-serif">*Calories ÷10</text>
    </svg>`;
    }

    // Adherence heatmap
    const adEl = document.getElementById('nutr-adherence-grid');
    if (adEl) {
        const rows = [
            { key: 'cal', label: 'Calories', unit: 'kcal', target: goals.cal, color: '#c8a96e' },
            { key: 'protein', label: 'Protein', unit: 'g', target: goals.protein, color: '#7c6ef0' },
            { key: 'carbs', label: 'Carbs', unit: 'g', target: goals.carbs, color: '#4ade80' },
        ].filter(r => r.target > 0);

        if (!rows.length) {
            adEl.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:12px 0;">Set your goals first (Goals tab) to see adherence tracking.</div>';
            return;
        }

        adEl.innerHTML = rows.map(row => {
            const cells = last7.map(d => {
                const val = getDayMacros(d)[row.key];
                const hasMeals = (DB.getDay(d).meals || []).length > 0;
                const pct = row.target > 0 ? val / row.target : 0;
                const bg = !hasMeals ? 'var(--surface2)' : pct >= 0.9 && pct <= 1.15 ? row.color : pct < 0.9 ? 'rgba(248,113,113,0.35)' : 'rgba(248,113,113,0.8)';
                const tip = !hasMeals ? 'No data' : `${val}${row.unit} (${Math.round(pct * 100)}%)`;
                const dayLbl = new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' });
                return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;">
          <div style="width:100%;height:32px;border-radius:6px;background:${bg};" title="${tip}"></div>
          <div style="font-size:10px;color:var(--muted);">${dayLbl}</div>
          <div style="font-size:10px;color:var(--muted);">${hasMeals ? val : '—'}</div>
        </div>`;
            }).join('');
            const metCount = last7.filter(d => {
                const val = getDayMacros(d)[row.key];
                if (!(DB.getDay(d).meals || []).length) return false;
                const p = val / row.target;
                return p >= 0.9 && p <= 1.15;
            }).length;
            return `
        <div style="margin-bottom:22px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <div style="font-size:13px;font-weight:600;">${row.label} <span style="font-size:11px;color:var(--muted);font-weight:400;">· target ${row.target}${row.unit}/day</span></div>
            <span style="font-size:11px;padding:3px 10px;border-radius:20px;background:${row.color}22;color:${row.color};font-weight:600;">${metCount}/7 on target</span>
          </div>
          <div style="display:flex;gap:6px;">${cells}</div>
          <div style="display:flex;gap:14px;margin-top:8px;font-size:11px;color:var(--muted);">
            <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${row.color};margin-right:4px;vertical-align:middle;"></span>On target (90–115%)</span>
            <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:rgba(248,113,113,0.35);margin-right:4px;vertical-align:middle;"></span>Under</span>
            <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:rgba(248,113,113,0.8);margin-right:4px;vertical-align:middle;"></span>Over</span>
          </div>
        </div>`;
        }).join('');
    }
}

function removeMealNutr(idx) {
    const day = DB.getDay(todayStr());
    day.meals = day.meals || [];
    day.meals.splice(idx, 1);
    DB.setDay(todayStr(), day);
    renderNutritionToday();
}

function renderFoodLibrary() {
    const lib = DB.get('food_library', []);
    const q = (document.getElementById('food-search')?.value || '').toLowerCase();
    const filtered = q ? lib.filter(f => f.name.toLowerCase().includes(q)) : lib;
    document.getElementById('food-library-list').innerHTML = filtered.length ? filtered.map((f, i) => `
    <div class="food-item" style="margin-bottom:8px;">
      <div>
        <div style="font-size:13px;font-weight:600;">${esc(f.name)}</div>
        <div style="font-size:11px;color:var(--muted);">${f.cal} cal · ${f.protein}g protein · ${f.carbs}g carbs / 100g</div>
      </div>
      <div style="display:flex;gap:6px;">
        <button class="btn btn-ghost" onclick="deleteFoodFromLibrary(${i})" style="padding:4px 8px;font-size:13px;">🗑</button>
      </div>
    </div>
  `).join('') : '<div style="color:var(--muted);font-size:13px;">No foods in library. Add some!</div>';
}

// ============================================================
// SCREEN TIME PAGE
// ============================================================
function getScreenGoal() { return DB.get('screen_daily_goal_mins', 0); }

function saveScreenGoal() {
    const val = parseInt(document.getElementById('screen-goal-input').value) || 0;
    DB.set('screen_daily_goal_mins', val);
    renderScreenGoal();
    showToast(val > 0 ? `Goal set: ${val} min/day` : 'Goal cleared.');
}

function renderScreenGoal() {
    const goal = getScreenGoal();
    const input = document.getElementById('screen-goal-input');
    if (input && !input.value && goal > 0) input.value = goal;

    const appLogToday = DB.get('app_usage_log', []).filter(e => e.date === todayStr());
    const usedMins = appLogToday.reduce((a, e) => a + (e.mins || 0), 0);

    const wrap = document.getElementById('screen-goal-progress-wrap');
    const empty = document.getElementById('screen-goal-empty');
    const bar = document.getElementById('screen-goal-bar');
    const label = document.getElementById('screen-goal-label');
    const pctEl = document.getElementById('screen-goal-pct');
    const remEl = document.getElementById('screen-goal-remaining');

    if (!goal) {
        if (wrap) wrap.style.display = 'none';
        if (empty) empty.style.display = 'block';
        return;
    }
    if (wrap) wrap.style.display = 'block';
    if (empty) empty.style.display = 'none';

    const pct = Math.min(Math.round(usedMins / goal * 100), 100);
    const over = usedMins > goal;
    const overMins = usedMins - goal;
    const remMins = goal - usedMins;

    if (bar) {
        bar.style.width = pct + '%';
        bar.style.background = over ? 'var(--danger)' : pct >= 80 ? '#fb923c' : 'var(--success)';
    }
    if (label) label.textContent = `${usedMins} / ${goal} min used`;
    if (pctEl) {
        pctEl.textContent = pct + '%';
        pctEl.style.color = over ? 'var(--danger)' : pct >= 80 ? '#fb923c' : 'var(--success)';
    }
    if (remEl) {
        if (over) {
            remEl.textContent = `⚠ ${overMins} min over your daily goal`;
            remEl.style.color = 'var(--danger)';
        } else {
            remEl.textContent = `${remMins} min remaining today`;
            remEl.style.color = 'var(--muted)';
        }
    }

    // Inject overall goal alert into danger alerts if exceeded
    const alertEl = document.getElementById('screen-danger-alerts');
    if (alertEl && over) {
        const existing = alertEl.querySelector('.goal-exceeded-alert');
        if (!existing) {
            const div = document.createElement('div');
            div.className = 'goal-exceeded-alert';
            div.style.cssText = 'padding:12px 16px;border-radius:10px;margin-bottom:8px;font-size:13px;line-height:1.5;background:rgba(248,113,113,0.12);border:1px solid rgba(248,113,113,0.35);color:var(--danger);';
            div.innerHTML = `🚫 <strong>Daily goal exceeded!</strong> You've used ${usedMins} min — ${overMins} min over your ${goal}-min limit.`;
            alertEl.prepend(div);
        }
    }
}

function getScreenTotalHrsForDate(dateStr) {
    const appLog = DB.get('app_usage_log', []).filter(e => e.date === dateStr);
    return calcTotalScreenHrs(appLog);
}

function renderScreenTime() {
    const todayD = todayStr();
    const appLogToday = DB.get('app_usage_log', []).filter(e => e.date === todayD);
    const totalHrs = calcTotalScreenHrs(appLogToday);
    const prodHrs = calcProductiveHrs(todayD);

    // Keep day.screen in sync for dashboard
    const today = DB.getDay(todayD);
    today.screen = { total: totalHrs, productive: prodHrs };
    DB.setDay(todayD, today);

    document.getElementById('screen-today').textContent = totalHrs + 'h';
    document.getElementById('screen-productive-today').textContent = prodHrs + 'h';

    // Week avg — computed live from app_usage_log
    const last7 = getLast7Days();
    const weekVals = last7.map(d => getScreenTotalHrsForDate(d));
    const prodVals = last7.map(d => {
        const studyHrs = getTotalStudyHrs(d);
        const appLog = DB.get('app_usage_log', []).filter(e => e.date === d);
        const appProdMins = appLog.filter(e => e.category === 'Productivity' || e.category === 'Education')
            .reduce((a, e) => a + (e.mins || 0), 0);
        return +(studyHrs + appProdMins / 60).toFixed(1);
    });
    const avg = weekVals.reduce((a, v) => a + v, 0) / 7;
    document.getElementById('screen-week-avg').textContent = avg.toFixed(1) + 'h';

    // ---- SVG Line Chart ----
    const chartW = 480, chartH = 130, padL = 30, padR = 12, padT = 14, padB = 28;
    const innerW = chartW - padL - padR;
    const innerH = chartH - padT - padB;
    const maxVal = Math.max(...weekVals, ...prodVals, 1);

    const xPos = i => padL + (i / (last7.length - 1)) * innerW;
    const yPos = v => padT + innerH - (v / maxVal) * innerH;

    const makePath = vals => {
        return vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${xPos(i).toFixed(1)},${yPos(v).toFixed(1)}`).join(' ');
    };

    const makeArea = vals => {
        const top = vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${xPos(i).toFixed(1)},${yPos(v).toFixed(1)}`).join(' ');
        const bottom = `L${xPos(last7.length - 1).toFixed(1)},${(padT + innerH).toFixed(1)} L${padL.toFixed(1)},${(padT + innerH).toFixed(1)} Z`;
        return top + ' ' + bottom;
    };

    // Y-axis gridlines
    const gridLines = [0, 0.25, 0.5, 0.75, 1].map(r => {
        const y = (padT + innerH - r * innerH).toFixed(1);
        const label = (maxVal * r).toFixed(1).replace(/\.0$/, '');
        return `<line x1="${padL}" y1="${y}" x2="${chartW - padR}" y2="${y}" stroke="var(--border)" stroke-width="1"/>
            <text x="${(padL - 4)}" y="${y}" text-anchor="end" dominant-baseline="middle" font-size="9" fill="var(--muted)" font-family="DM Sans,sans-serif">${label}</text>`;
    }).join('');

    // X-axis labels + dots
    const xLabels = last7.map((d, i) => {
        const x = xPos(i).toFixed(1);
        const label = new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' });
        const tot = weekVals[i], prod = prodVals[i];
        return `<text x="${x}" y="${(chartH - 4)}" text-anchor="middle" font-size="9" fill="var(--muted)" font-family="DM Sans,sans-serif">${label}</text>
            <circle cx="${x}" cy="${yPos(tot).toFixed(1)}" r="3.5" fill="var(--danger)" stroke="var(--surface)" stroke-width="1.5"/>
            <circle cx="${x}" cy="${yPos(prod).toFixed(1)}" r="3.5" fill="var(--success)" stroke="var(--surface)" stroke-width="1.5"/>`;
    }).join('');

    const svgChart = `<svg viewBox="0 0 ${chartW} ${chartH}" style="width:100%;height:auto;display:block;" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="scGradTotal" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--danger)" stop-opacity="0.18"/>
        <stop offset="100%" stop-color="var(--danger)" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="scGradProd" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--success)" stop-opacity="0.15"/>
        <stop offset="100%" stop-color="var(--success)" stop-opacity="0"/>
      </linearGradient>
    </defs>
    ${gridLines}
    <path d="${makeArea(weekVals)}" fill="url(#scGradTotal)"/>
    <path d="${makeArea(prodVals)}" fill="url(#scGradProd)"/>
    <path d="${makePath(weekVals)}" fill="none" stroke="var(--danger)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="${makePath(prodVals)}" fill="none" stroke="var(--success)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${xLabels}
  </svg>`;

    const bc = document.getElementById('screen-week-chart');
    const lc = document.getElementById('screen-week-labels');
    bc.style.cssText = 'display:block;';
    bc.innerHTML = svgChart;
    lc.style.display = 'none';
    lc.innerHTML = '';

    // Legend (remove old one first)
    const oldLegend = document.getElementById('screen-chart-legend');
    if (oldLegend) oldLegend.remove();
    bc.insertAdjacentHTML('afterend', `
    <div id="screen-chart-legend" style="display:flex;gap:16px;margin-top:10px;flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted);">
        <div style="width:20px;height:2px;background:var(--danger);border-radius:1px;"></div> Total Screen Time
      </div>
      <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted);">
        <div style="width:20px;height:2px;background:var(--success);border-radius:1px;"></div> Productive (Study + Quran + Books + Skills)
      </div>
    </div>`);

    renderAppUsage();
    renderScreenGoal();
}

// ============================================================
// APP USAGE TRACKER
// ============================================================
const APP_CAT_DANGER = {
    'Social Media': { soft: 60, hard: 120, label: 'social media' },
    'Entertainment': { soft: 90, hard: 180, label: 'entertainment' },
    'Gaming': { soft: 60, hard: 120, label: 'gaming' },
    'News': { soft: 30, hard: 60, label: 'news browsing' },
    'Shopping': { soft: 30, hard: 60, label: 'shopping' },
    'Productivity': { soft: 240, hard: 480, label: 'productivity' },
    'Education': { soft: 240, hard: 480, label: 'education' },
    'Communication': { soft: 60, hard: 120, label: 'messaging' },
    'Health & Fitness': { soft: 60, hard: 120, label: 'health & fitness' },
    'Other': { soft: 120, hard: 240, label: 'other apps' }
};

const APP_CAT_COLORS = {
    'Social Media': '#f87171', 'Entertainment': '#fb923c', 'Gaming': '#f472b6',
    'Productivity': 'var(--success)', 'Education': 'var(--accent2)', 'Communication': 'var(--accent)',
    'News': '#facc15', 'Shopping': '#a78bfa', 'Health & Fitness': '#34d399', 'Other': 'var(--muted)'
};

function addAppUsage() {
    const name = document.getElementById('app-name-input').value.trim();
    const category = document.getElementById('app-category-input').value;
    const mins = parseInt(document.getElementById('app-mins-input').value) || 0;
    const limit = parseInt(document.getElementById('app-limit-input').value) || 0;
    if (!name) return void showToast('Please enter an app name.');
    if (!mins || mins <= 0) return void showToast('Please enter time spent.');
    const logs = DB.get('app_usage_log', []);
    // Merge with existing entry for same app today
    const todayStr_ = todayStr();
    const existing = logs.findIndex(e => e.date === todayStr_ && e.name.toLowerCase() === name.toLowerCase());
    if (existing >= 0) {
        logs[existing].mins += mins;
        if (limit) logs[existing].limit = limit;
    } else {
        logs.push({ id: genId(), date: todayStr_, name, category, mins, limit });
    }
    DB.set('app_usage_log', logs);
    document.getElementById('app-name-input').value = '';
    document.getElementById('app-mins-input').value = '';
    document.getElementById('app-limit-input').value = '';
    renderAppUsage();
    showToast('App usage logged!');
}

function removeAppEntry(id) {
    DB.set('app_usage_log', DB.get('app_usage_log', []).filter(e => e.id !== id));
    renderAppUsage();
}

function renderAppUsage() {
    const all = DB.get('app_usage_log', []);
    const today = todayStr();
    const weekD = getWeekDates(today);
    const todayE = all.filter(e => e.date === today).sort((a, b) => b.mins - a.mins);
    const weekE = all.filter(e => weekD.includes(e.date));

    // ---- Danger alerts ----
    const alerts = [];
    // Per-app limit alerts (today)
    todayE.forEach(e => {
        if (e.limit && e.mins >= e.limit) {
            const pct = Math.round(e.mins / e.limit * 100);
            const lvl = pct >= 150 ? 'critical' : 'warning';
            alerts.push({ lvl, msg: `<strong>${esc(e.name)}</strong>: ${e.mins} min used — ${pct}% of your ${e.limit}-min daily limit.` });
        }
    });
    // Per-category threshold alerts (today)
    const catTotals = {};
    todayE.forEach(e => { catTotals[e.category] = (catTotals[e.category] || 0) + e.mins; });
    Object.entries(catTotals).forEach(([cat, mins]) => {
        const thres = APP_CAT_DANGER[cat];
        if (!thres) return;
        if (mins >= thres.hard) {
            alerts.push({ lvl: 'critical', msg: `🚨 <strong>${mins} min</strong> on ${thres.label} today — this is dangerously high. Consider a digital detox.` });
        } else if (mins >= thres.soft) {
            alerts.push({ lvl: 'warning', msg: `⚠️ <strong>${mins} min</strong> on ${thres.label} today — approaching excessive use.` });
        }
    });
    // Total screen time vs productive ratio
    const totalMins = todayE.reduce((a, e) => a + e.mins, 0);
    const wasteCats = ['Social Media', 'Entertainment', 'Gaming', 'Shopping', 'News'];
    const wasteMins = todayE.filter(e => wasteCats.includes(e.category)).reduce((a, e) => a + e.mins, 0);
    if (totalMins > 0 && wasteMins / totalMins > 0.6 && totalMins >= 60) {
        alerts.push({ lvl: 'warning', msg: `📊 Over 60% of your logged screen time today is unproductive (${wasteMins}/${totalMins} min).` });
    }

    const alertEl = document.getElementById('screen-danger-alerts');
    if (alerts.length) {
        alertEl.innerHTML = alerts.map(a => `
      <div style="
        padding:12px 16px; border-radius:10px; margin-bottom:8px; font-size:13px; line-height:1.5;
        background:${a.lvl === 'critical' ? 'rgba(248,113,113,0.12)' : 'rgba(251,146,60,0.12)'};
        border:1px solid ${a.lvl === 'critical' ? 'rgba(248,113,113,0.35)' : 'rgba(251,146,60,0.35)'};
        color:${a.lvl === 'critical' ? 'var(--danger)' : '#fb923c'};
      ">${a.msg}</div>
    `).join('');
    } else {
        alertEl.innerHTML = totalMins > 0
            ? `<div style="padding:10px 14px; border-radius:10px; font-size:13px; background:rgba(74,222,128,0.08); border:1px solid rgba(74,222,128,0.2); color:var(--success);">✓ Your screen time looks healthy today. Keep it up!</div>`
            : '';
    }

    // ---- Today's app list ----
    document.getElementById('app-today-list').innerHTML = todayE.length ? todayE.map(e => {
        const col = APP_CAT_COLORS[e.category] || 'var(--muted)';
        const pct = e.limit ? Math.min(Math.round(e.mins / e.limit * 100), 100) : 0;
        const over = e.limit && e.mins >= e.limit;
        return `
    <div style="background:var(--surface2); border-radius:10px; padding:12px 14px; margin-bottom:8px; border-left:3px solid ${col};">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:${e.limit ? '8px' : '0'};">
        <div>
          <span style="font-size:13px; font-weight:600;">${esc(e.name)}</span>
          <span style="font-size:11px; color:var(--muted); margin-left:8px;">${esc(e.category)}</span>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="font-size:13px; font-weight:600; color:${over ? 'var(--danger)' : 'var(--text)'};">${e.mins} min${e.mins >= 60 ? ' (' + (e.mins / 60).toFixed(1) + 'h)' : ''}</span>
          <button class="btn btn-ghost" onclick="removeAppEntry('${e.id}')" style="font-size:13px; padding:2px 6px;">✕</button>
        </div>
      </div>
      ${e.limit ? `
        <div style="height:5px; background:var(--border); border-radius:3px; overflow:hidden;">
          <div style="height:5px; width:${pct}%; background:${over ? 'var(--danger)' : col}; border-radius:3px; transition:width 0.3s;"></div>
        </div>
        <div style="font-size:10px; color:var(--muted); margin-top:3px;">${e.mins}/${e.limit} min limit${over ? ' — limit exceeded!' : ''}</div>
      ` : ''}
    </div>`;
    }).join('') : '<div style="color:var(--muted); font-size:13px;">No app usage logged today.</div>';

    // ---- Weekly breakdown ----
    const weekTotals = {};
    weekE.forEach(e => {
        if (!weekTotals[e.name]) weekTotals[e.name] = { mins: 0, category: e.category };
        weekTotals[e.name].mins += e.mins;
    });
    const sorted = Object.entries(weekTotals).sort((a, b) => b[1].mins - a[1].mins).slice(0, 10);
    const maxM = sorted.length ? sorted[0][1].mins : 1;
    document.getElementById('app-week-breakdown').innerHTML = sorted.length ? sorted.map(([name, data]) => {
        const col = APP_CAT_COLORS[data.category] || 'var(--muted)';
        const pct = Math.round(data.mins / maxM * 100);
        const hrs = (data.mins / 60).toFixed(1);
        return `
    <div style="margin-bottom:12px;">
      <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
        <span style="font-size:13px; font-weight:500;">${esc(name)} <span style="font-size:11px; color:var(--muted); font-weight:400;">[${data.category}]</span></span>
        <span style="font-size:12px; color:var(--muted);">${data.mins}m · ${hrs}h</span>
      </div>
      <div style="height:6px; background:var(--surface2); border-radius:3px;">
        <div style="height:6px; width:${pct}%; background:${col}; border-radius:3px; transition:width 0.3s;"></div>
      </div>
    </div>`;
    }).join('') : '<div style="color:var(--muted); font-size:13px;">No app usage logged this week.</div>';

    renderScreenGoal();
}

// ============================================================
// CALENDAR
// ============================================================
function renderCalendar() {
    const d = calViewDate;
    const year = d.getFullYear(), month = d.getMonth();
    document.getElementById('cal-month-label').textContent = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    document.getElementById('cal-header').innerHTML = days.map(d => `<div class="cal-header-day">${d}</div>`).join('');

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const offset = firstDay === 0 ? 6 : firstDay - 1;

    const events = DB.get('events', []);
    const todayRef = todayStr();

    function getEventsOnDate(dateStr) {
        return events.filter(e => {
            if (e.ongoing) return e.start <= dateStr && dateStr <= todayRef;
            if (e.end) return e.start <= dateStr && e.end >= dateStr;
            return e.start === dateStr;
        });
    }

    let html = '';
    for (let i = 0; i < offset; i++) {
        const prevDate = new Date(year, month, 1 - offset + i);
        html += `<div class="cal-day other-month"><span>${prevDate.getDate()}</span></div>`;
    }
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const isToday = dateStr === todayRef;
        const isSelected = dateStr === calSelectedDate;
        const dayEvents = getEventsOnDate(dateStr);

        let strips = '';
        if (dayEvents.length) {
            const shown = dayEvents.slice(0, 4);
            const extra = dayEvents.length - shown.length;
            strips = `<div class="cal-event-strips">
        ${shown.map(e => `<span style="background:${e.color || '#7c6ef0'};"></span>`).join('')}
        ${extra > 0 ? `<span style="background:var(--muted);"></span>` : ''}
      </div>`;
        }

        html += `<div class="cal-day ${isToday ? 'today' : ''} ${isSelected && !isToday ? 'selected-day' : ''}" onclick="selectCalDate('${dateStr}')">
      <span>${day}</span>
      ${strips}
    </div>`;
    }
    document.getElementById('cal-grid').innerHTML = html;
    renderCalEvents();
}

function changeMonth(dir) {
    calViewDate = new Date(calViewDate.getFullYear(), calViewDate.getMonth() + dir, 1);
    renderCalendar();
}

function selectCalDate(dateStr) {
    if (calSelectedDate === dateStr) {
        calSelectedDate = null;
        document.getElementById('cal-selected-label').textContent = 'All Events';
    } else {
        calSelectedDate = dateStr;
        document.getElementById('cal-selected-label').textContent = 'Events — ' + fmtDate(dateStr);
    }
    renderCalEvents();
    renderCalendar();
}

function renderCalEvents() {
    const events = DB.get('events', []);
    const todayRef = todayStr();
    let filtered = events;
    if (calSelectedDate) {
        filtered = events.filter(e => {
            if (e.ongoing) return e.start <= calSelectedDate && calSelectedDate <= todayRef;
            if (e.end) return e.start <= calSelectedDate && e.end >= calSelectedDate;
            return e.start === calSelectedDate;
        });
    }
    filtered.sort((a, b) => a.start.localeCompare(b.start));
    document.getElementById('cal-events-list').innerHTML = filtered.length ? filtered.map(e => {
        // Calculate duration display
        let durationTag = '';
        const today = todayStr();
        if (e.ongoing) {
            const startD = new Date(e.start + 'T00:00:00');
            const todayD = new Date(today + 'T00:00:00');
            const days = Math.round((todayD - startD) / 86400000);
            if (days >= 3) {
                durationTag = `<span style="display:inline-flex;align-items:center;gap:3px;font-size:10px;padding:2px 7px;border-radius:10px;background:rgba(124,110,240,0.15);color:var(--accent2);margin-left:6px;">⏳ ${days} day${days !== 1 ? 's' : ''}</span>`;
            }
        } else if (e.end && e.end !== e.start) {
            const startD = new Date(e.start + 'T00:00:00');
            const endD = new Date(e.end + 'T00:00:00');
            const days = Math.round((endD - startD) / 86400000);
            if (days >= 3) {
                durationTag = `<span style="display:inline-flex;align-items:center;gap:3px;font-size:10px;padding:2px 7px;border-radius:10px;background:rgba(200,169,110,0.15);color:var(--accent);margin-left:6px;">${days} day${days !== 1 ? 's' : ''}</span>`;
            }
        }
        return `
    <div class="event-card" style="border-left-color:${e.color || 'var(--accent2)'}; cursor:pointer;" onclick="openEditEventModal('${e.id}')">
      <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px;margin-bottom:4px;">
        <div style="font-size:14px;font-weight:600;">${esc(e.title)}</div>
        ${durationTag}
      </div>
      <div style="font-size:11px;color:var(--muted);">${fmtDateShort(e.start)}${e.end ? ' → ' + fmtDateShort(e.end) : e.ongoing ? ' · Ongoing' : ''}</div>
      ${e.details ? `<div style="font-size:12px;color:var(--muted);margin-top:6px;">${esc(e.details)}</div>` : ''}
    </div>
  `}).join('') : `<div style="color:var(--muted);font-size:13px;padding:20px 0;">${calSelectedDate ? 'No events on this day.' : 'Click a day to see its events, or view all.'}</div>`;
}

function openAddEventModal() {
    editingEventId = null;
    document.getElementById('event-modal-title').textContent = 'Add Event';
    document.getElementById('ev-title').value = '';
    document.getElementById('ev-start').value = calSelectedDate || todayStr();
    document.getElementById('ev-end').value = '';
    document.getElementById('ev-ongoing').checked = false;
    document.getElementById('ev-details').value = '';
    document.getElementById('ev-end-row').style.display = 'block';
    document.getElementById('ev-delete-btn').style.display = 'none';
    renderEventColors();
    openModal('modal-event');
}

function openEditEventModal(id) {
    const events = DB.get('events', []);
    const ev = events.find(e => e.id === id);
    if (!ev) return;
    editingEventId = id;
    document.getElementById('event-modal-title').textContent = 'Edit Event';
    document.getElementById('ev-title').value = ev.title;
    document.getElementById('ev-start').value = ev.start;
    document.getElementById('ev-end').value = ev.end || '';
    document.getElementById('ev-ongoing').checked = !!ev.ongoing;
    document.getElementById('ev-details').value = ev.details || '';
    document.getElementById('ev-end-row').style.display = ev.ongoing ? 'none' : 'block';
    document.getElementById('ev-delete-btn').style.display = 'inline-flex';
    renderEventColors(ev.color);
    openModal('modal-event');
}

let selectedEventColor = EVENT_COLORS[0];
function renderEventColors(selected) {
    if (selected) selectedEventColor = selected;
    document.getElementById('ev-colors').innerHTML = EVENT_COLORS.map(c => `
    <div onclick="selectEventColor('${c}')" style="width:24px;height:24px;border-radius:50%;background:${c};cursor:pointer;border:2px solid ${selectedEventColor === c ? 'white' : 'transparent'};transition:border-color 0.2s;"></div>
  `).join('');
}
function selectEventColor(c) { selectedEventColor = c; renderEventColors(); }

function toggleOngoing() {
    document.getElementById('ev-end-row').style.display = document.getElementById('ev-ongoing').checked ? 'none' : 'block';
}

function saveEvent() {
    const title = document.getElementById('ev-title').value.trim();
    const start = document.getElementById('ev-start').value;
    if (!title || !start) return void showToast('Please enter a title and start date');
    const events = DB.get('events', []);
    const ev = {
        id: editingEventId || genId(),
        title: title.slice(0, 200), start,
        end: document.getElementById('ev-ongoing').checked ? null : (document.getElementById('ev-end').value || null),
        ongoing: document.getElementById('ev-ongoing').checked,
        color: selectedEventColor,
        details: document.getElementById('ev-details').value.trim().slice(0, 1000)
    };
    if (editingEventId) {
        const idx = events.findIndex(e => e.id === editingEventId);
        events[idx] = ev;
    } else {
        events.push(ev);
    }
    DB.set('events', events);
    closeModal('modal-event');
    renderCalendar();
}

function deleteEvent() {
    if (!editingEventId) return;
    let events = DB.get('events', []);
    events = events.filter(e => e.id !== editingEventId);
    DB.set('events', events);
    closeModal('modal-event');
    renderCalendar();
}

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

// ============================================================
// ANALYTICS
// ============================================================
let analyticsPeriod = 'week';

function switchAnalyticsPeriod(p) {
    analyticsPeriod = p;
    document.querySelectorAll('#analytics-period-toggle .toggle-btn').forEach((b, i) => {
        b.classList.toggle('active', ['week', 'month', 'all'][i] === p);
    });
    renderAnalytics();
}

function renderAnalytics() {
    const allDays = DB.getDays().sort();
    const today = todayStr();
    const currency = getCurrency();

    // Build date range based on period
    let dates = [];
    if (analyticsPeriod === 'week') {
        dates = getLast7Days();
    } else if (analyticsPeriod === 'month') {
        dates = Array.from({ length: 30 }, (_, i) => {
            const d = new Date(); d.setDate(d.getDate() - (29 - i));
            return d.toISOString().slice(0, 10);
        });
    } else {
        dates = allDays;
    }
    if (!dates.length) dates = getLast7Days();

    // ---- Pull all data for the period ----
    const sleepLogs = DB.get('sleep_logs', []).filter(e => dates.includes(e.date));
    const appLogs = DB.get('app_usage_log', []).filter(e => dates.includes(e.date));
    const expenses = DB.get('money_expenses', []).filter(e => dates.includes(e.date));
    const quranLogs = DB.get('quran_log', []).filter(e => dates.includes(e.date));
    const hadithLogs = DB.get('hadith_log', []).filter(e => dates.includes(e.date));

    // ---- KPIs ----
    const gymCount = dates.filter(d => DB.getDay(d).gym === true).length;
    const studyHrs = dates.reduce((a, d) => a + getTotalStudyHrs(d), 0);
    const prayerTotal = dates.reduce((a, d) => a + (DB.getDay(d).prayers || []).length, 0);
    const prayerCons = dates.length ? Math.round(prayerTotal / (dates.length * 5) * 100) : 0;
    const sleepAvg = sleepLogs.length ? (sleepLogs.reduce((a, l) => a + l.hours, 0) / sleepLogs.length).toFixed(1) : null;
    const screenAvg = dates.length ? (appLogs.reduce((a, e) => a + e.mins, 0) / 60 / dates.length).toFixed(1) : 0;
    const totalSpent = expenses.reduce((a, e) => a + (e.amount || 0), 0);
    const quranPgs = quranLogs.reduce((a, e) => a + (e.pages || 0), 0);
    const hadithCnt = hadithLogs.reduce((a, e) => a + (e.count || 1), 0);
    const perfectDays = dates.filter(d => (DB.getDay(d).prayers || []).length === 5).length;

    document.getElementById('ana-kpi-row').innerHTML = [
        { label: 'Gym Sessions', val: gymCount, icon: '💪', color: 'var(--success)' },
        { label: 'Study Hours', val: studyHrs.toFixed(1) + 'h', icon: '📚', color: 'var(--accent2)' },
        { label: 'Prayer Rate', val: prayerCons + '%', icon: '📿', color: 'var(--accent)' },
        { label: 'Perfect Prayer Days', val: perfectDays, icon: '⭐', color: '#facc15' },
        { label: 'Avg Sleep', val: sleepAvg ? sleepAvg + 'h' : '—', icon: '😴', color: '#a78bfa' },
        { label: 'Avg Screen/Day', val: screenAvg + 'h', icon: '📱', color: '#fb923c' },
        { label: 'Total Spent', val: currency + ' ' + totalSpent.toFixed(0), icon: '💰', color: '#34d399' },
        { label: 'Quran Pages', val: quranPgs, icon: '📖', color: 'var(--accent)' },
        { label: 'Hadiths Read', val: hadithCnt, icon: '🕌', color: 'var(--accent)' },
    ].map(k => `
    <div class="card card-sm" style="padding:14px;">
      <div style="font-size:18px; margin-bottom:4px;">${k.icon}</div>
      <div style="font-size:22px; font-weight:700; font-family:'DM Serif Display',serif; color:${k.color};">${k.val}</div>
      <div style="font-size:11px; color:var(--muted); margin-top:2px;">${k.label}</div>
    </div>`).join('');

    // ---- Chart helper ----
    function makeChart(containerId, labelId, values, labels, color, suffix = '', goalLine = null) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const max = Math.max(...values, 0.01);
        const N = values.length;
        const step = N <= 7 ? 1 : N <= 14 ? 2 : N <= 30 ? 4 : Math.ceil(N / 8);
        container.innerHTML = values.map((v, i) => {
            const h = Math.max(v / max * 84, v > 0 ? 3 : 0);
            const barColor = (goalLine && v > goalLine) ? 'var(--danger)' : color;
            const tipLabel = labels[i].replace('\n', ' ');
            return `<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;height:90px;" title="${tipLabel}: ${v}${suffix}">
        <div style="width:100%;border-radius:3px 3px 0 0;height:${h}px;background:${barColor};opacity:0.82;transition:opacity .15s;"
             onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.82"></div>
      </div>`;
        }).join('');
        const labelsEl = document.getElementById(containerId + '-labels');
        if (labelsEl) labelsEl.innerHTML = values.map((_, i) => {
            if (i % step !== 0) return `<div style="flex:1;"></div>`;
            const parts = labels[i].split('\n');
            return `<div style="flex:1;text-align:center;font-size:9px;color:var(--muted);line-height:1.3;">
        ${parts.map(p => `<div>${p}</div>`).join('')}
      </div>`;
        }).join('');
    }

    // Label helpers
    function dayLabel(dateStr) {
        // e.g. "Feb 15" or for week view "Sat 15"
        const d = new Date(dateStr + 'T00:00:00');
        if (analyticsPeriod === 'week') {
            return d.toLocaleDateString('en-US', { weekday: 'short' }) + '\n' +
                d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    function weekLabel(dateStr) {
        const d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    // Group daily data into weeks helper
    function groupByWeek(dateFn) {
        const weeks = {};
        const order = [];
        dates.forEach(d => {
            const wd = getWeekDates(d)[0];
            if (!weeks[wd]) { weeks[wd] = 0; order.push(wd); }
            weeks[wd] += dateFn(d);
        });
        const keys = [...new Set(order)].sort();
        return { keys, vals: keys.map(k => weeks[k]) };
    }

    // ---- Gym chart ----
    if (analyticsPeriod === 'week') {
        document.getElementById('ana-gym-chart-label').textContent = 'sessions per day';
        const vals = dates.map(d => DB.getDay(d).gym === true ? 1 : 0);
        const labels = dates.map(d => dayLabel(d));
        makeChart('ana-gym-chart', 'ana-gym-chart-label', vals, labels, 'var(--success)');
    } else {
        document.getElementById('ana-gym-chart-label').textContent = 'sessions per week';
        const { keys, vals } = groupByWeek(d => DB.getDay(d).gym === true ? 1 : 0);
        makeChart('ana-gym-chart', 'ana-gym-chart-label', vals, keys.map(weekLabel), 'var(--success)');
    }

    // ---- Study chart ----
    document.getElementById('ana-study-chart-label').textContent = 'hours per day';
    {
        const vals = dates.map(d => getTotalStudyHrs(d));
        const labels = dates.map(d => dayLabel(d));
        makeChart('ana-study-chart', 'ana-study-chart-label', vals, labels, 'var(--accent2)', 'h');
    }

    // ---- Prayer chart ----
    document.getElementById('ana-prayer-chart-label').textContent = 'prayers per day (out of 5)';
    {
        const vals = dates.map(d => (DB.getDay(d).prayers || []).length);
        const labels = dates.map(d => dayLabel(d));
        makeChart('ana-prayer-chart', 'ana-prayer-chart-label', vals, labels, 'var(--accent)', ' / 5', 4.9);
    }

    // ---- Screen chart ----
    document.getElementById('ana-screen-chart-label').textContent = 'total hours per day';
    {
        const vals = dates.map(d => {
            const mins = appLogs.filter(e => e.date === d).reduce((a, e) => a + e.mins, 0);
            return +(mins / 60).toFixed(1);
        });
        const labels = dates.map(d => dayLabel(d));
        const goal = getScreenGoal() > 0 ? getScreenGoal() / 60 : null;
        makeChart('ana-screen-chart', 'ana-screen-chart-label', vals, labels, '#fb923c', 'h', goal);
    }

    // ---- Sleep chart ----
    document.getElementById('ana-sleep-chart-label').textContent = 'hours per night (7–9h is ideal)';
    {
        const vals = dates.map(d => {
            const e = sleepLogs.find(l => l.date === d);
            return e ? +e.hours.toFixed(1) : 0;
        });
        const labels = dates.map(d => dayLabel(d));
        makeChart('ana-sleep-chart', 'ana-sleep-chart-label', vals, labels, '#a78bfa', 'h');
    }

    // ---- Money chart ----
    document.getElementById('ana-money-chart-label').textContent = `spending per day (${currency})`;
    {
        const vals = dates.map(d =>
            +expenses.filter(e => e.date === d).reduce((a, e) => a + (e.amount || 0), 0).toFixed(0)
        );
        const labels = dates.map(d => dayLabel(d));
        makeChart('ana-money-chart', 'ana-money-chart-label', vals, labels, '#34d399', currency);
    }

    // ---- Streaks ----
    function calcStreak(fn) {
        let streak = 0, best = 0, cur = 0;
        const sorted = allDays.slice().sort();
        for (let i = 0; i < sorted.length; i++) {
            if (fn(sorted[i])) { cur++; best = Math.max(best, cur); }
            else { cur = 0; }
        }
        // current streak = from today backwards
        const rev = allDays.slice().sort().reverse();
        for (const d of rev) {
            if (fn(d)) streak++; else break;
        }
        return { current: streak, best };
    }
    const gymStreak = calcStreak(d => DB.getDay(d).gym === true);
    const prayerStreak = calcStreak(d => (DB.getDay(d).prayers || []).length === 5);
    const studyStreak = calcStreak(d => getTotalStudyHrs(d) > 0);
    const logStreak = calcStreak(d => DB.getDay(d).prayers || DB.getDay(d).gym !== undefined || getTotalStudyHrs(d) > 0);

    document.getElementById('ana-streaks').innerHTML = [
        { label: 'Gym Sessions', icon: '💪', color: 'var(--success)', ...gymStreak },
        { label: 'Perfect Prayers', icon: '📿', color: 'var(--accent)', ...prayerStreak },
        { label: 'Study Days', icon: '📚', color: 'var(--accent2)', ...studyStreak },
        { label: 'Any Activity', icon: '🔥', color: '#fb923c', ...logStreak },
    ].map(s => `
    <div style="background:var(--surface2); border-radius:10px; padding:14px;">
      <div style="font-size:16px; margin-bottom:6px;">${s.icon}</div>
      <div style="font-size:12px; color:var(--muted); margin-bottom:8px;">${s.label}</div>
      <div style="display:flex; gap:16px; align-items:flex-end;">
        <div>
          <div style="font-size:22px; font-weight:700; font-family:'DM Serif Display',serif; color:${s.color};">${s.current}</div>
          <div style="font-size:10px; color:var(--muted);">current</div>
        </div>
        <div>
          <div style="font-size:16px; font-weight:600; color:var(--muted);">${s.best}</div>
          <div style="font-size:10px; color:var(--muted);">best</div>
        </div>
      </div>
    </div>`).join('');

    // ---- Daily log table ----
    const tableRows = dates.slice().reverse().slice(0, 60).map(d => {
        const day = DB.getDay(d);
        const gym = day.gym;
        const prayers = (day.prayers || []).length;
        const studyH = getTotalStudyHrs(d);
        const sleep = sleepLogs.find(l => l.date === d);
        const screenM = appLogs.filter(e => e.date === d).reduce((a, e) => a + e.mins, 0);
        const spent = expenses.filter(e => e.date === d).reduce((a, e) => a + (e.amount || 0), 0);
        // Discipline score: simple weighted sum out of 100
        let score = 0;
        score += prayers === 5 ? 30 : Math.round(prayers / 5 * 25);
        score += gym === true ? 20 : 0;
        score += Math.min(studyH, 4) / 4 * 20;
        score += sleep && sleep.hours >= 6 && sleep.hours <= 9 ? 15 : (sleep ? 8 : 0);
        score += screenM <= 120 ? 15 : screenM <= 240 ? 8 : 0;
        score = Math.round(score);
        const scoreColor = score >= 80 ? 'var(--success)' : score >= 50 ? 'var(--accent)' : 'var(--danger)';

        return `<tr style="border-bottom:1px solid var(--border);">
      <td style="padding:8px 10px 8px 0; white-space:nowrap; font-size:12px; color:var(--muted);">${fmtDateShort(d)}</td>
      <td style="padding:8px 10px; text-align:center; font-size:12px;">
        ${gym === true ? '<span style="color:var(--success);">✓</span>' : gym === false ? '<span style="color:var(--danger);">✗</span>' : '<span style="color:var(--border);">—</span>'}
      </td>
      <td style="padding:8px 10px; text-align:center; font-size:12px;">
        <span style="color:${prayers === 5 ? 'var(--success)' : prayers >= 3 ? 'var(--accent)' : 'var(--danger)'};">${prayers}/5</span>
      </td>
      <td style="padding:8px 10px; text-align:center; font-size:12px;">
        ${studyH > 0 ? `<span style="color:var(--accent2);">${studyH.toFixed(1)}h</span>` : '<span style="color:var(--border);">—</span>'}
      </td>
      <td style="padding:8px 10px; text-align:center; font-size:12px;">
        ${sleep ? `<span style="color:${sleep.hours >= 7 && sleep.hours <= 9 ? 'var(--success)' : 'var(--accent)'};">${sleep.hours}h</span>` : '<span style="color:var(--border);">—</span>'}
      </td>
      <td style="padding:8px 10px; text-align:center; font-size:12px;">
        ${screenM > 0 ? `<span style="color:${screenM <= 120 ? 'var(--success)' : screenM <= 240 ? '#fb923c' : 'var(--danger)'};">${(screenM / 60).toFixed(1)}h</span>` : '<span style="color:var(--border);">—</span>'}
      </td>
      <td style="padding:8px 10px; text-align:center; font-size:12px;">
        ${spent > 0 ? `<span style="color:var(--muted);">${currency}${spent.toFixed(0)}</span>` : '<span style="color:var(--border);">—</span>'}
      </td>
      <td style="padding:8px 10px; text-align:center;">
        <span style="font-size:12px; font-weight:700; color:${scoreColor};">${score}</span>
      </td>
    </tr>`;
    }).join('');

    document.getElementById('ana-log-tbody').innerHTML = tableRows ||
        `<tr><td colspan="8" style="padding:20px 0; text-align:center; color:var(--muted); font-size:13px;">No data yet for this period. Start logging!</td></tr>`;
}

// ============================================================
// MEAL MODAL
// ============================================================
function openAddMealModal() {
    mealFoodItems = [];
    document.getElementById('meal-name-input').value = '';
    document.getElementById('fi-name').value = '';
    document.getElementById('fi-qty').value = '';
    document.getElementById('fi-cal').value = '';
    document.getElementById('fi-protein').value = '';
    document.getElementById('fi-carbs').value = '';
    renderMealFoodItems();
    const lib = DB.get('food_library', []);
    document.getElementById('meal-food-select').innerHTML = '<option value="">— Select from library —</option>' + lib.map((f, i) => `<option value="${i}">${esc(f.name)}</option>`).join('');
    openModal('modal-meal');
}

function prefillFoodFromLibrary() {
    const idx = document.getElementById('meal-food-select').value;
    if (idx === '') return;
    const lib = DB.get('food_library', []);
    const food = lib[parseInt(idx)];
    if (!food) return;
    document.getElementById('fi-name').value = food.name;
    document.getElementById('fi-qty').value = 100;
    document.getElementById('fi-cal').value = food.cal;
    document.getElementById('fi-protein').value = food.protein;
    document.getElementById('fi-carbs').value = food.carbs;
}

function addFoodItemToMeal() {
    const name = document.getElementById('fi-name').value.trim();
    if (!name) return void showToast('Enter food name');
    const qty = parseFloat(document.getElementById('fi-qty').value) || 100;
    const baseCal = parseFloat(document.getElementById('fi-cal').value) || 0;
    const baseProtein = parseFloat(document.getElementById('fi-protein').value) || 0;
    const baseCarbs = parseFloat(document.getElementById('fi-carbs').value) || 0;
    const factor = qty / 100;
    mealFoodItems.push({ name, qty, cal: Math.round(baseCal * factor), protein: Math.round(baseProtein * factor), carbs: Math.round(baseCarbs * factor) });
    renderMealFoodItems();
    document.getElementById('fi-name').value = '';
    document.getElementById('fi-qty').value = '';
    document.getElementById('fi-cal').value = '';
    document.getElementById('fi-protein').value = '';
    document.getElementById('fi-carbs').value = '';
    document.getElementById('meal-food-select').value = '';
}

function renderMealFoodItems() {
    document.getElementById('meal-food-items-list').innerHTML = mealFoodItems.map((it, i) => `
    <div class="food-item" style="margin-bottom:6px;">
      <div style="font-size:13px;">${esc(it.name)} <span style="color:var(--muted);">(${it.qty}g) · ${it.cal}cal · ${it.protein}g P · ${it.carbs}g C</span></div>
      <button class="btn btn-ghost" onclick="removeMealItem(${i})" style="padding:2px 6px;font-size:13px;">✕</button>
    </div>
  `).join('');
}

function removeMealItem(i) { mealFoodItems.splice(i, 1); renderMealFoodItems(); }

function saveMeal() {
    const name = document.getElementById('meal-name-input').value.trim() || 'Meal';
    if (!mealFoodItems.length) return void showToast('Add at least one food item');
    const day = DB.getDay(currentLogDate);
    day.meals = day.meals || [];
    day.meals.push({ name, items: [...mealFoodItems] });
    DB.setDay(currentLogDate, day);
    DB.registerDay(currentLogDate);
    closeModal('modal-meal');
    renderLogMeals(day.meals);
    if (nutritionTab === 'today') renderNutritionToday();
}

// ============================================================
// FOOD LIBRARY MODAL
// ============================================================
function openAddFoodModal() {
    document.getElementById('food-lib-name').value = '';
    document.getElementById('food-lib-cal').value = '';
    document.getElementById('food-lib-protein').value = '';
    document.getElementById('food-lib-carbs').value = '';
    document.getElementById('food-lib-notes').value = '';
    openModal('modal-food');
}

function saveFoodToLibrary() {
    const name = document.getElementById('food-lib-name').value.trim();
    if (!name) return void showToast('Enter food name');
    const lib = DB.get('food_library', []);
    lib.push({
        name,
        cal: parseFloat(document.getElementById('food-lib-cal').value) || 0,
        protein: parseFloat(document.getElementById('food-lib-protein').value) || 0,
        carbs: parseFloat(document.getElementById('food-lib-carbs').value) || 0,
        notes: document.getElementById('food-lib-notes').value.trim()
    });
    DB.set('food_library', lib);
    closeModal('modal-food');
    renderFoodLibrary();
    showToast('Food saved to library!');
}

function deleteFoodFromLibrary(idx) {
    const lib = DB.get('food_library', []);
    lib.splice(idx, 1);
    DB.set('food_library', lib);
    renderFoodLibrary();
}

// ============================================================
// MODAL HELPERS
// ============================================================
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

document.querySelectorAll('.modal-bg').forEach(mb => {
    mb.addEventListener('click', e => { if (e.target === mb) mb.classList.remove('open'); });
});

// ============================================================
// TOAST
// ============================================================
function showToast(msg, duration = 2500) {
    // Safe: use textContent, never innerHTML
    const t = document.createElement('div');
    t.style.cssText = `position:fixed;bottom:24px;right:24px;background:var(--accent);color:#1a1200;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;z-index:9999;animation:fadeUp 0.3s ease;max-width:320px;word-break:break-word;`;
    t.textContent = String(msg);
    document.body.appendChild(t);
    const tid = setTimeout(() => t.remove(), Math.max(1500, Math.min(duration, 10000)));
    t.addEventListener('click', () => { clearTimeout(tid); t.remove(); });
}

// Non-blocking confirm dialog — returns a Promise<boolean>
function showConfirm(message, confirmLabel = 'Confirm', dangerMode = false) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:10000;display:flex;align-items:center;justify-content:center;padding:24px;';
        const box = document.createElement('div');
        box.style.cssText = 'background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:24px;max-width:340px;width:100%;';
        const msg = document.createElement('p');
        msg.style.cssText = 'font-size:14px;line-height:1.6;margin:0 0 20px;color:var(--text);';
        msg.textContent = message;
        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;';
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn btn-secondary';
        cancelBtn.textContent = 'Cancel';
        const confirmBtn = document.createElement('button');
        confirmBtn.className = dangerMode ? 'btn btn-danger' : 'btn btn-primary';
        confirmBtn.textContent = confirmLabel;
        cancelBtn.onclick = () => { overlay.remove(); resolve(false); };
        confirmBtn.onclick = () => { overlay.remove(); resolve(true); };
        overlay.onclick = e => { if (e.target === overlay) { overlay.remove(); resolve(false); } };
        btnRow.append(cancelBtn, confirmBtn);
        box.append(msg, btnRow);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        confirmBtn.focus();
    });
}

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

// ============================================================
// MONEY TRACKER
// ============================================================
const EXPENSE_CATEGORIES = [
    'Rent', 'Utilities', 'Groceries', 'Transport', 'Health',
    'Loans', 'Food & Drinks', 'Shopping', 'Entertainment',
    'Personal', 'Bills & Utilities', 'Education', 'Gym & Fitness', 'Other'
];
const CAT_ICONS = {
    'Rent': '🏠', 'Utilities': '💡', 'Groceries': '🛒', 'Transport': '🚗', 'Health': '💊',
    'Loans': '🏦', 'Food & Drinks': '🍜', 'Shopping': '🛍', 'Entertainment': '🎮',
    'Personal': '🧴', 'Bills & Utilities': '📋', 'Education': '📚', 'Gym & Fitness': '💪', 'Other': '📦'
};

function getMoneyMonthStr(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function changeMoneyMonth(dir) {
    moneyViewDate = new Date(moneyViewDate.getFullYear(), moneyViewDate.getMonth() + dir, 1);
    renderMoneyPage();
}

function renderMoneyDailyChart() {
    const monthStr = getMoneyMonthStr(moneyViewDate);
    const expenses = getMonthExpenses(monthStr);
    const year = moneyViewDate.getFullYear();
    const month = moneyViewDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cur = getCurrency();

    const daily = {};
    for (let i = 1; i <= daysInMonth; i++) {
        daily[`${monthStr}-${String(i).padStart(2, '0')}`] = 0;
    }
    expenses.forEach(e => { if (daily[e.date] !== undefined) daily[e.date] += e.amount || 0; });

    const vals = Object.values(daily);
    const dates = Object.keys(daily);
    const maxVal = Math.max(...vals, 1);
    const n = dates.length;

    const W = 600, H = 140, padL = 8, padR = 8, padT = 16, padB = 28;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;

    const xOf = i => padL + (i / (n - 1 || 1)) * chartW;
    const yOf = v => padT + chartH - (v / maxVal) * chartH;

    function buildPath(vs) {
        if (n === 1) return `M${xOf(0)},${yOf(vs[0])}`;
        let d = `M${xOf(0)},${yOf(vs[0])}`;
        for (let i = 0; i < n - 1; i++) {
            const x0 = i > 0 ? xOf(i - 1) : xOf(0);
            const y0 = i > 0 ? yOf(vs[i - 1]) : yOf(vs[0]);
            const x1 = xOf(i), y1 = yOf(vs[i]);
            const x2 = xOf(i + 1), y2 = yOf(vs[i + 1]);
            const x3 = i < n - 2 ? xOf(i + 2) : xOf(n - 1);
            const y3 = i < n - 2 ? yOf(vs[i + 2]) : yOf(vs[n - 1]);
            const cp1x = x1 + (x2 - x0) / 6;
            const cp1y = y1 + (y2 - y0) / 6;
            const cp2x = x2 - (x3 - x1) / 6;
            const cp2y = y2 - (y3 - y1) / 6;
            d += ` C${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${x2.toFixed(2)},${y2.toFixed(2)}`;
        }
        return d;
    }

    const linePath = buildPath(vals);
    const areaPath = `${linePath} L${xOf(n - 1)},${padT + chartH} L${xOf(0)},${padT + chartH} Z`;

    const labels = dates.map((d, i) => {
        if ((i + 1) % 5 !== 1 && i !== n - 1) return '';
        const day = parseInt(d.split('-')[2]);
        return `<text x="${xOf(i)}" y="${H - 6}" text-anchor="middle" font-size="9" fill="var(--muted)" font-family="DM Sans,sans-serif">${day}</text>`;
    }).join('');

    const dots = dates.map((d, i) => {
        if (!vals[i]) return '';
        return `<circle cx="${xOf(i).toFixed(2)}" cy="${yOf(vals[i]).toFixed(2)}" r="3"
      fill="#7c6ef0" stroke="var(--surface)" stroke-width="1.5" style="cursor:pointer;">
      <title>${fmtDateShort(d)}: ${cur} ${vals[i].toFixed(2)}</title>
    </circle>`;
    }).join('');

    const gridLines = [0.25, 0.5, 0.75].map(f => {
        const y = padT + chartH * (1 - f);
        const lv = (maxVal * f).toFixed(0);
        return `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}"
      stroke="var(--border)" stroke-width="0.5" stroke-dasharray="3,3"/>
      <text x="${padL + 2}" y="${y - 3}" font-size="8" fill="var(--muted)" font-family="DM Sans,sans-serif">${lv}</text>`;
    }).join('');

    const gradId = 'moneyGrad';
    const svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block;">
    <defs>
      <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stop-color="#7c6ef0" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="#7c6ef0" stop-opacity="0.02"/>
      </linearGradient>
    </defs>
    ${gridLines}
    <path d="${areaPath}" fill="url(#${gradId})"/>
    <path d="${linePath}" fill="none" stroke="#7c6ef0" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}
    ${labels}
  </svg>`;

    document.getElementById('money-daily-chart').innerHTML = svg;
}

function renderMoneyExpenseList() {
    const monthStr = getMoneyMonthStr(moneyViewDate);
    let expenses = getMonthExpenses(monthStr);
    const filterCat = document.getElementById('money-filter-cat').value;
    if (filterCat) expenses = expenses.filter(e => e.category === filterCat);
    expenses = expenses.slice().sort((a, b) => b.date.localeCompare(a.date));

    if (!expenses.length) {
        document.getElementById('money-expense-list').innerHTML = '<div style="color:var(--muted);font-size:13px;padding:20px 0;">No expenses found. Add one!</div>';
        return;
    }

    const grouped = {};
    expenses.forEach(e => { if (!grouped[e.date]) grouped[e.date] = []; grouped[e.date].push(e); });

    document.getElementById('money-expense-list').innerHTML = Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0])).map(([date, exps]) => {
        const dayTotal = exps.reduce((a, e) => a + (e.amount || 0), 0);
        return `
      <div style="margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div style="font-size:12px;color:var(--muted);font-weight:600;letter-spacing:0.05em;">${fmtDate(date)}</div>
          <div style="font-size:12px;color:var(--muted);">${getCurrency()} ${dayTotal.toFixed(2)}</div>
        </div>
        ${exps.map(e => `
          <div class="food-item" style="margin-bottom:6px;cursor:pointer;" onclick="openEditExpenseModal('${e.id}')">
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="font-size:18px;">${CAT_ICONS[e.category] || '📦'}</div>
              <div>
                <div style="font-size:13px;font-weight:500;">${esc(e.desc)}</div>
                <div style="font-size:11px;color:var(--muted);">${esc(e.category)}${e.notes ? ' · ' + e.notes : ''}</div>
              </div>
            </div>
            <div style="font-size:14px;font-weight:600;color:var(--danger);">−${getCurrency()} ${(e.amount || 0).toFixed(2)}</div>
          </div>
        `).join('')}
      </div>
    `;
    }).join('');
}

function openAddExpenseModal() {
    editingExpenseId = null;
    document.getElementById('expense-modal-title').textContent = 'Add Expense';
    document.getElementById('exp-desc').value = '';
    document.getElementById('exp-amount').value = '';
    document.getElementById('exp-date').value = todayStr();
    document.getElementById('exp-category').value = 'Food & Drinks';
    document.getElementById('exp-notes').value = '';
    document.getElementById('exp-delete-btn').style.display = 'none';
    openModal('modal-expense');
}

function openEditExpenseModal(id) {
    const all = DB.get('money_expenses', []);
    const exp = all.find(e => e.id === id);
    if (!exp) return;
    editingExpenseId = id;
    document.getElementById('expense-modal-title').textContent = 'Edit Expense';
    document.getElementById('exp-desc').value = exp.desc || '';
    document.getElementById('exp-amount').value = exp.amount || '';
    document.getElementById('exp-date').value = exp.date || todayStr();
    document.getElementById('exp-category').value = exp.category || 'Other';
    document.getElementById('exp-notes').value = exp.notes || '';
    document.getElementById('exp-delete-btn').style.display = 'inline-flex';
    openModal('modal-expense');
}

function saveExpense() {
    const desc = document.getElementById('exp-desc').value.trim().slice(0, 200);
    const amount = safeNum(document.getElementById('exp-amount').value, 0.01, 9999999, 0);
    const date = document.getElementById('exp-date').value;
    if (!desc) return void showToast('Please enter a description.');
    if (amount <= 0) return void showToast('Please enter a valid amount.');
    if (!date) return void showToast('Please select a date.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return void showToast('Invalid date format.');

    const all = DB.get('money_expenses', []);
    const exp = {
        id: editingExpenseId || genId(),
        desc, amount, date,
        category: document.getElementById('exp-category').value,
        notes: document.getElementById('exp-notes').value.trim().slice(0, 500)
    };

    if (editingExpenseId) {
        const idx = all.findIndex(e => e.id === editingExpenseId);
        all[idx] = exp;
    } else {
        all.push(exp);
    }
    DB.set('money_expenses', all);
    closeModal('modal-expense');
    renderMoneyPage();
    showToast(editingExpenseId ? 'Expense updated!' : 'Expense added!');
}

async function deleteExpense() {
    if (!editingExpenseId) return;
    if (!await showConfirm('Delete this expense?', 'Delete', true)) return;
    let all = DB.get('money_expenses', []);
    all = all.filter(e => e.id !== editingExpenseId);
    DB.set('money_expenses', all);
    closeModal('modal-expense');
    renderMoneyPage();
    showToast('Expense deleted');
}

// ============================================================
// TASKS SYSTEM
// ============================================================
let editingTaskId = null;
let editingFolderId = null;
let selectedFolderColor = '#7c6ef0';
let tasksView = 'all';
const TASK_PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const TASK_PRIORITY_LABEL = { critical: '🚨 Critical', high: '🔴 High', medium: '🟡 Medium', low: '🟢 Low' };
const TASK_PRIORITY_COLOR = { critical: '#f87171', high: '#fb923c', medium: '#facc15', low: '#4ade80' };

// ---- helpers ----
function getTasks() { return DB.get('tasks_list', []); }
function setTasks(t) { DB.set('tasks_list', t); }
function getFolders() { return DB.get('task_folders', []); }
function setFolders(f) { DB.set('task_folders', f); }
function getTaskAlertDefault() { return DB.get('task_alert_default_hrs', 3); }

function taskMinsUntilDeadline(task) {
    if (!task.deadline) return Infinity;
    return (new Date(task.deadline) - new Date()) / 60000;
}

function taskDeadlineStr(task) {
    if (!task.deadline) return '';
    const d = new Date(task.deadline);
    const now = new Date();
    const diffMs = d - now;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMs < 0) return `<span style="color:var(--danger); font-weight:600;">Overdue by ${formatDuration(-diffMin)}</span>`;
    if (diffMin < 60) return `<span style="color:var(--danger);">Due in ${diffMin}m</span>`;
    if (diffMin < 1440) return `<span style="color:#fb923c;">Due in ${Math.floor(diffMin / 60)}h ${diffMin % 60}m</span>`;
    const days = Math.floor(diffMin / 1440);
    if (days <= 7) return `<span style="color:var(--accent);">Due in ${days}d</span>`;
    return `<span style="color:var(--muted);">${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })}</span>`;
}

function formatDuration(mins) {
    if (mins < 60) return mins + 'm';
    const h = Math.floor(mins / 60), m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function switchTasksView(v) {
    tasksView = v;
    document.querySelectorAll('#tasks-filter-toggle .toggle-btn').forEach((b, i) => {
        b.classList.toggle('active', ['all', 'open', 'done', 'projects'][i] === v);
    });
    renderTasks();
}

// ---- render ----
function renderTasks() {
    const tasks = getTasks();
    const folders = getFolders();
    const sort = document.getElementById('tasks-sort-select')?.value || 'deadline';

    // Stats
    const open = tasks.filter(t => !t.done);
    const done = tasks.filter(t => t.done);
    const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate() + 7);
    const dueWeek = open.filter(t => t.deadline && new Date(t.deadline) <= weekEnd);
    const overdue = open.filter(t => taskMinsUntilDeadline(t) < 0);

    document.getElementById('tasks-stat-open').textContent = open.length;
    document.getElementById('tasks-stat-week').textContent = dueWeek.length;
    document.getElementById('tasks-stat-done').textContent = done.length;

    // Sub-labels
    const openSubEl = document.getElementById('tasks-stat-open-sub');
    const overdueSubEl = document.getElementById('tasks-stat-overdue-sub');
    const doneSubEl = document.getElementById('tasks-stat-done-sub');
    if (openSubEl) openSubEl.textContent = open.length === 0 ? 'All clear ✓' : open.length === 1 ? '1 remaining' : `${open.length} remaining`;
    if (overdueSubEl) overdueSubEl.textContent = overdue.length > 0 ? `${overdue.length} overdue` : dueWeek.length > 0 ? 'on track' : '—';
    if (doneSubEl) doneSubEl.textContent = tasks.length > 0 ? `of ${tasks.length} total` : 'nothing yet';

    // Completion ring
    const pct = tasks.length > 0 ? Math.round(done.length / tasks.length * 100) : 0;
    const circle = document.getElementById('tasks-ring-circle');
    const pctLabel = document.getElementById('tasks-ring-pct');
    if (circle) {
        const circumference = 201;
        circle.style.strokeDashoffset = circumference - (circumference * pct / 100);
        circle.style.stroke = pct === 100 ? 'var(--success)' : pct >= 60 ? 'var(--accent)' : 'var(--accent2)';
    }
    if (pctLabel) {
        pctLabel.textContent = pct + '%';
        pctLabel.style.color = pct === 100 ? 'var(--success)' : 'var(--text)';
    }

    // Urgent banner
    const alertDefault = getTaskAlertDefault() * 60;
    const urgent = open.filter(t => {
        const m = taskMinsUntilDeadline(t);
        const threshold = t.alertMins !== undefined ? t.alertMins : alertDefault;
        return m >= 0 && m <= threshold;
    });
    const bannerEl = document.getElementById('tasks-urgent-banner');
    const bannerItems = [];
    if (overdue.length) bannerItems.push(`<span style="color:var(--danger); font-weight:600;">🚨 ${overdue.length} overdue task${overdue.length > 1 ? 's' : ''}</span>`);
    urgent.forEach(t => {
        const m = Math.floor(taskMinsUntilDeadline(t));
        bannerItems.push(`⚡ <b>${esc(t.name)}</b> due in ${formatDuration(m)}`);
    });
    bannerEl.innerHTML = bannerItems.length
        ? `<div style="padding:12px 16px; border-radius:10px; background:rgba(248,113,113,0.1); border:1px solid rgba(248,113,113,0.3); font-size:13px; line-height:1.8;">${bannerItems.join('<br>')}</div>`
        : '';

    // Nav badge
    const badge = document.getElementById('nav-tasks-badge');
    if (overdue.length + urgent.length > 0) {
        badge.textContent = overdue.length + urgent.length;
        badge.style.display = 'inline';
    } else { badge.style.display = 'none'; }

    const container = document.getElementById('tasks-main-list');
    if (!container) return;

    // Projects view
    if (tasksView === 'projects') {
        if (!folders.length) {
            container.innerHTML = `<div class="card" style="text-align:center; padding:40px 20px; color:var(--muted);">No projects yet.<br><button class="btn btn-primary" style="margin-top:14px;" onclick="openFolderModal()">📁 Create First Project</button></div>`;
            return;
        }
        container.innerHTML = folders.map(f => renderFolderCard(f, tasks)).join('');
        return;
    }

    // Flat task views
    let list = tasks.filter(t => {
        if (tasksView === 'open') return !t.done;
        if (tasksView === 'done') return t.done;
        return true;
    });

    // Sort
    list = list.slice().sort((a, b) => {
        if (sort === 'priority') return (TASK_PRIORITY_ORDER[a.priority] || 2) - (TASK_PRIORITY_ORDER[b.priority] || 2);
        if (sort === 'created') return b.id - a.id;
        if (sort === 'alpha') return a.name.localeCompare(b.name);
        // deadline: no deadline goes last
        if (!a.deadline && !b.deadline) return 0;
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return new Date(a.deadline) - new Date(b.deadline);
    });

    if (!list.length) {
        container.innerHTML = `<div class="card" style="text-align:center; padding:40px 20px; color:var(--muted);">${tasksView === 'done' ? 'No completed tasks yet.' : 'All clear — no tasks here.'}</div>`;
        return;
    }

    // Group by project if view=all or open
    if (tasksView !== 'done') {
        const grouped = {};
        const noFolder = [];
        list.forEach(t => {
            if (t.folderId) { if (!grouped[t.folderId]) grouped[t.folderId] = []; grouped[t.folderId].push(t); }
            else noFolder.push(t);
        });
        let html = '';
        // Loose tasks first
        if (noFolder.length) {
            html += `<div style="font-size:11px; color:var(--muted); font-weight:600; letter-spacing:0.08em; text-transform:uppercase; margin-bottom:8px; margin-top:4px;">Standalone</div>`;
            html += noFolder.map(t => renderTaskRow(t)).join('');
        }
        // Grouped by folder
        Object.entries(grouped).forEach(([fid, ftasks]) => {
            const folder = folders.find(f => f.id === fid);
            if (!folder) { html += ftasks.map(t => renderTaskRow(t)).join(''); return; }
            html += `<div style="font-size:11px; color:${folder.color || 'var(--accent2)'}; font-weight:600; letter-spacing:0.08em; text-transform:uppercase; margin-bottom:8px; margin-top:16px;">
        <span style="border-bottom:2px solid ${folder.color || 'var(--accent2)'}; padding-bottom:2px;">📁 ${folder.name}</span>
      </div>`;
            html += ftasks.map(t => renderTaskRow(t)).join('');
        });
        container.innerHTML = html;
    } else {
        // Done: simple flat
        container.innerHTML = list.map(t => renderTaskRow(t)).join('');
    }
}

function renderTaskRow(t) {
    const prioColor = TASK_PRIORITY_COLOR[t.priority] || '#facc15';
    const prioBg = { critical: 'rgba(248,113,113,0.1)', high: 'rgba(251,146,60,0.1)', medium: 'rgba(250,204,21,0.1)', low: 'rgba(74,222,128,0.1)' }[t.priority] || 'rgba(250,204,21,0.1)';
    const steps = t.steps ? t.steps.filter(s => s.text) : [];
    const stepsDone = steps.filter(s => s.done).length;
    const hasSteps = steps.length > 0;
    const overdue = !t.done && t.deadline && new Date(t.deadline) < new Date();
    const stepPct = hasSteps ? Math.round(stepsDone / steps.length * 100) : 0;

    return `
  <div style="
    background:var(--surface);
    border:1px solid ${overdue ? 'rgba(248,113,113,0.4)' : t.done ? 'var(--border)' : 'var(--border)'};
    border-radius:12px; margin-bottom:10px;
    overflow:hidden;
    opacity:${t.done ? '0.55' : '1'};
    transition: opacity 0.2s, border-color 0.2s;
  " id="task-row-${t.id}">
    <!-- Top accent line -->
    <div style="height:3px; background:${t.done ? 'var(--border)' : prioColor}; opacity:${t.done ? '0.3' : '0.8'};"></div>

    <div style="padding:12px 14px;">
      <div style="display:flex; align-items:flex-start; gap:12px;">

        <!-- Checkbox -->
        <button onclick="toggleTaskDone('${t.id}')" title="${t.done ? 'Mark incomplete' : 'Mark complete'}"
          style="
            width:22px; height:22px; border-radius:6px; flex-shrink:0; margin-top:1px; cursor:pointer;
            background:${t.done ? 'var(--success)' : 'transparent'};
            border:2px solid ${t.done ? 'var(--success)' : 'var(--border)'};
            display:flex; align-items:center; justify-content:center;
            transition: all 0.15s; padding:0;
          ">
          ${t.done ? `<svg width="11" height="9" viewBox="0 0 11 9" fill="none"><path d="M1 4.5L4.2 7.5L10 1" stroke="var(--bg)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ''}
        </button>

        <!-- Body -->
        <div style="flex:1; min-width:0;">
          <!-- Title row -->
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:4px;">
            <span style="font-size:14px; font-weight:600; line-height:1.3; ${t.done ? 'text-decoration:line-through; color:var(--muted);' : ''}">${esc(t.name)}</span>
            <span style="font-size:10px; font-weight:600; padding:2px 7px; border-radius:20px; background:${prioBg}; color:${prioColor}; letter-spacing:0.03em;">${TASK_PRIORITY_LABEL[t.priority] || ''}</span>
            ${t.tag ? `<span style="font-size:10px; padding:2px 7px; border-radius:20px; background:rgba(124,110,240,0.12); color:var(--accent2); border:1px solid rgba(124,110,240,0.2);">${esc(t.tag)}</span>` : ''}
            ${overdue ? `<span style="font-size:10px; font-weight:600; padding:2px 7px; border-radius:20px; background:rgba(248,113,113,0.12); color:var(--danger);">OVERDUE</span>` : ''}
          </div>

          ${t.desc ? `<div style="font-size:12px; color:var(--muted); margin-bottom:6px; line-height:1.5;">${esc(t.desc)}</div>` : ''}

          <!-- Meta row -->
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            ${t.deadline ? `<span style="font-size:11px; color:${overdue ? 'var(--danger)' : 'var(--muted)'}; display:flex; align-items:center; gap:4px;">${overdue ? '🔥' : '🕐'} ${taskDeadlineStr(t)}</span>` : ''}
            ${hasSteps && !t.done ? (() => {
            const isOpen = DB.get('steps_open_' + t.id, false);
            return `
              <button onclick="toggleStepsPanel('${t.id}')" style="
                display:inline-flex; align-items:center; gap:6px;
                background:var(--surface2); border:1px solid var(--border);
                border-radius:20px; padding:3px 9px 3px 7px;
                cursor:pointer; font-family:inherit; transition:all 0.15s;
              " id="steps-toggle-btn-${t.id}"
                onmouseenter="this.style.borderColor='var(--muted)'"
                onmouseleave="this.style.borderColor='var(--border)'">
                <!-- mini ring -->
                <svg width="18" height="18" viewBox="0 0 18 18" style="transform:rotate(-90deg); flex-shrink:0;">
                  <circle cx="9" cy="9" r="6" fill="none" stroke="var(--border)" stroke-width="2.5"/>
                  <circle cx="9" cy="9" r="6" fill="none" stroke="${stepPct === 100 ? 'var(--success)' : 'var(--accent)'}" stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-dasharray="37.7"
                    stroke-dashoffset="${37.7 - (37.7 * stepPct / 100)}"/>
                </svg>
                <span style="font-size:11px; color:var(--muted); font-weight:500;">${stepsDone}/${steps.length}</span>
                <span style="font-size:9px; color:var(--muted); opacity:0.7; margin-left:1px;" id="steps-toggle-arrow-${t.id}">${isOpen ? '▴' : '▾'}</span>
              </button>`;
        })() : ''}
            ${t.completedAt && t.done ? `<span style="font-size:11px; color:var(--muted);">✓ ${fmtDateShort(t.completedAt.slice(0, 10))}</span>` : ''}
          </div>

          <!-- Checklist steps (collapsible) -->
          ${hasSteps && !t.done ? (() => {
            const isOpen = DB.get('steps_open_' + t.id, false);
            return `
            <div id="steps-panel-${t.id}" style="
              display:grid; grid-template-rows:${isOpen ? '1fr' : '0fr'};
              transition: grid-template-rows 0.25s cubic-bezier(0.4,0,0.2,1);
              margin-top:0;
            ">
              <div style="overflow:hidden;">
                <div style="margin-top:8px; display:flex; flex-direction:column; gap:1px; background:var(--surface2); border-radius:8px; overflow:hidden; border:1px solid var(--border);" id="steps-${t.id}">
                  ${steps.map((s, i) => `
                    <div onclick="toggleTaskStep('${t.id}', ${i})" style="
                      display:flex; align-items:center; gap:10px; padding:8px 12px; cursor:pointer;
                      background:${s.done ? 'rgba(74,222,128,0.04)' : 'transparent'};
                      border-bottom:1px solid ${i < steps.length - 1 ? 'var(--border)' : 'transparent'};
                      transition: background 0.15s;
                    " onmouseenter="this.style.background='${s.done ? 'rgba(74,222,128,0.08)' : 'rgba(255,255,255,0.03)'}'" onmouseleave="this.style.background='${s.done ? 'rgba(74,222,128,0.04)' : 'transparent'}'">
                      <div style="
                        width:16px; height:16px; border-radius:4px; flex-shrink:0;
                        background:${s.done ? 'var(--success)' : 'transparent'};
                        border:1.5px solid ${s.done ? 'var(--success)' : 'var(--muted)'};
                        display:flex; align-items:center; justify-content:center;
                        transition: all 0.15s;
                      ">
                        ${s.done ? `<svg width="8" height="7" viewBox="0 0 8 7" fill="none"><path d="M1 3.5L3 5.5L7 1" stroke="var(--bg)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ''}
                      </div>
                      <span style="font-size:12px; flex:1; ${s.done ? 'text-decoration:line-through; color:var(--muted);' : 'color:var(--text);'} transition:color 0.15s; user-select:none;">${esc(s.text)}</span>
                      ${s.done ? `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" style="flex-shrink:0;"><circle cx="6" cy="6" r="5" fill="rgba(74,222,128,0.2)"/><path d="M3.5 6L5 7.5L8.5 4" stroke="var(--success)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ''}
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>`;
        })() : ''}
        </div>

        <!-- Edit button -->
        <button onclick="openTaskModal('${t.id}')"
          style="color:var(--muted); background:var(--surface2); border:1px solid var(--border); border-radius:6px; cursor:pointer; font-size:13px; padding:4px 8px; flex-shrink:0; line-height:1; transition:all 0.15s;"
          onmouseenter="this.style.color='var(--text)'; this.style.borderColor='var(--muted)'"
          onmouseleave="this.style.color='var(--muted)'; this.style.borderColor='var(--border)'"
          title="Edit task">✎</button>
      </div>
    </div>
  </div>`;
}

function renderFolderCard(f, allTasks) {
    const tasks = allTasks.filter(t => t.folderId === f.id);
    const open = tasks.filter(t => !t.done);
    const done = tasks.filter(t => t.done);
    const pct = tasks.length ? Math.round(done.length / tasks.length * 100) : 0;
    const expanded = DB.get('folder_expanded_' + f.id, true);
    const fcolor = f.color || 'var(--accent2)';
    const circumference = 138;
    const offset = circumference - (circumference * pct / 100);
    const overdueCt = open.filter(t => t.deadline && new Date(t.deadline) < new Date()).length;

    return `
  <div style="background:var(--surface); border:1px solid var(--border); border-radius:14px; margin-bottom:16px; overflow:hidden;">
    <div style="height:3px; background:${fcolor};"></div>
    <div style="display:flex; align-items:center; gap:14px; padding:14px 16px; cursor:pointer;"
         onclick="toggleFolderExpand('${f.id}')">
      <div style="position:relative; width:44px; height:44px; flex-shrink:0;">
        <svg width="44" height="44" viewBox="0 0 44 44" style="transform:rotate(-90deg);">
          <circle cx="22" cy="22" r="17" fill="none" stroke="var(--surface2)" stroke-width="4"/>
          <circle cx="22" cy="22" r="17" fill="none" stroke="${fcolor}" stroke-width="4"
            stroke-linecap="round"
            stroke-dasharray="${circumference}"
            stroke-dashoffset="${offset}"
            style="transition:stroke-dashoffset 0.5s ease;"/>
        </svg>
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">
          <span style="font-size:10px; font-weight:700; color:${fcolor};">${pct}%</span>
        </div>
      </div>
      <div style="flex:1; min-width:0;">
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:3px;">
          <span style="font-size:15px; font-weight:700;">📁 ${esc(f.name)}</span>
          ${overdueCt > 0 ? `<span style="font-size:10px; font-weight:600; padding:2px 7px; border-radius:20px; background:rgba(248,113,113,0.12); color:var(--danger);">${overdueCt} overdue</span>` : ""}
          ${f.due ? `<span style="font-size:11px; color:var(--accent);">📅 Due ${fmtDate(f.due)}</span>` : ""}
        </div>
        ${f.desc ? `<div style="font-size:12px; color:var(--muted); margin-bottom:4px;">${esc(f.desc)}</div>` : ""}
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:11px; color:var(--muted);">${open.length} open</span>
          <span style="font-size:11px; color:var(--muted);">·</span>
          <span style="font-size:11px; color:${done.length > 0 ? "var(--success)" : "var(--muted)"};">${done.length} done</span>
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
        <button onclick="event.stopPropagation(); openTaskModal(null,'${f.id}')"
          class="btn btn-secondary" style="font-size:11px; padding:4px 10px;">＋ Task</button>
        <button onclick="event.stopPropagation(); openFolderModal('${f.id}')"
          style="color:var(--muted); background:var(--surface2); border:1px solid var(--border); border-radius:6px; cursor:pointer; font-size:13px; padding:4px 8px; transition:all 0.15s;"
          onmouseenter="this.style.color='var(--text)'" onmouseleave="this.style.color='var(--muted)'"
          title="Edit project">✎</button>
        <span style="color:var(--muted); font-size:13px; padding:0 2px; user-select:none;">${expanded ? "▴" : "▾"}</span>
      </div>
    </div>
    <div style="height:2px; background:var(--surface2); margin:0 16px;">
      <div style="height:2px; width:${pct}%; background:${fcolor}; border-radius:1px; transition:width 0.3s;"></div>
    </div>
    <div id="folder-body-${f.id}" style="display:${expanded ? "block" : "none"}; padding:10px 12px 12px;">
      ${tasks.length
            ? tasks.slice().sort((a, b) => {
                if (a.done !== b.done) return a.done ? 1 : -1;
                if (!a.deadline && !b.deadline) return 0;
                if (!a.deadline) return 1; if (!b.deadline) return -1;
                return new Date(a.deadline) - new Date(b.deadline);
            }).map(t => renderTaskRow(t)).join("")
            : `<div style="font-size:13px; color:var(--muted); padding:16px 4px; text-align:center;">No tasks yet. <button class="btn btn-ghost" style="font-size:12px;" onclick="openTaskModal(null,'${f.id}')">＋ Add first task</button></div>`
        }
    </div>
  </div>`;
}
function toggleFolderExpand(fid) {
    const cur = DB.get('folder_expanded_' + fid, true);
    DB.set('folder_expanded_' + fid, !cur);
    renderTasks();
}

// ---- CRUD: Tasks ----
function openTaskModal(taskId = null, presetFolderId = null) {
    editingTaskId = taskId;
    const folders = getFolders();

    // Populate folder dropdown
    const sel = document.getElementById('task-folder-input');
    sel.innerHTML = '<option value="">— None —</option>' +
        folders.map(f => `<option value="${f.id}">${esc(f.name)}</option>`).join('');

    if (taskId) {
        const t = getTasks().find(x => x.id === taskId);
        if (!t) return;
        document.getElementById('task-modal-title').textContent = 'Edit Task';
        document.getElementById('task-name-input').value = t.name || '';
        document.getElementById('task-desc-input').value = t.desc || '';
        document.getElementById('task-deadline-input').value = t.deadline ? t.deadline.slice(0, 16) : '';
        document.getElementById('task-priority-input').value = t.priority || 'medium';
        document.getElementById('task-folder-input').value = t.folderId || '';
        document.getElementById('task-tag-input').value = t.tag || '';
        const alertMins = t.alertMins !== undefined ? t.alertMins : '';
        document.getElementById('task-alert-hrs').value = alertMins !== '' ? Math.floor(alertMins / 60) : '';
        document.getElementById('task-alert-mins').value = alertMins !== '' ? alertMins % 60 : '';
        document.getElementById('task-steps-input').value = (t.steps || []).map(s => s.text).join('\n');
        document.getElementById('task-delete-btn').style.display = 'inline-flex';
        // Deadline toggle
        const hasDeadlineCb = document.getElementById('task-has-deadline');
        if (hasDeadlineCb) { hasDeadlineCb.checked = !!t.deadline; toggleTaskDeadline(); }
    } else {
        document.getElementById('task-modal-title').textContent = 'New Task';
        document.getElementById('task-name-input').value = '';
        document.getElementById('task-desc-input').value = '';
        document.getElementById('task-deadline-input').value = '';
        document.getElementById('task-priority-input').value = 'medium';
        document.getElementById('task-folder-input').value = presetFolderId || '';
        document.getElementById('task-tag-input').value = '';
        document.getElementById('task-alert-hrs').value = '';
        document.getElementById('task-alert-mins').value = '';
        document.getElementById('task-steps-input').value = '';
        document.getElementById('task-delete-btn').style.display = 'none';
        // Reset deadline toggle to ON for new tasks
        const hasDeadlineCb = document.getElementById('task-has-deadline');
        if (hasDeadlineCb) { hasDeadlineCb.checked = true; toggleTaskDeadline(); }
    }
    openModal('modal-task');
}

function saveTask() {
    const name = document.getElementById('task-name-input').value.trim().slice(0, 200);
    if (!name) return void showToast('Please enter a task name.');
    const hasDeadlineCb = document.getElementById('task-has-deadline');
    const hasDeadline = !hasDeadlineCb || hasDeadlineCb.checked;
    const deadlineRaw = hasDeadline ? document.getElementById('task-deadline-input').value : '';
    const alertHrs = document.getElementById('task-alert-hrs').value;
    const alertMins_ = document.getElementById('task-alert-mins').value;
    const alertMins = (alertHrs !== '' || alertMins_ !== '')
        ? (parseInt(alertHrs) || 0) * 60 + (parseInt(alertMins_) || 0)
        : undefined;
    const stepsRaw = document.getElementById('task-steps-input').value.trim();
    const tasks = getTasks();

    if (editingTaskId) {
        const idx = tasks.findIndex(t => t.id === editingTaskId);
        if (idx < 0) return;
        const existing = tasks[idx];
        // Preserve existing step done states by matching text
        const oldSteps = existing.steps || [];
        const newSteps = stepsRaw ? stepsRaw.split('\n').filter(s => s.trim()).map(s => {
            const old = oldSteps.find(o => o.text === s.trim());
            return { text: s.trim(), done: old ? old.done : false };
        }) : [];
        tasks[idx] = {
            ...existing,
            name, desc: document.getElementById('task-desc-input').value.trim(),
            deadline: deadlineRaw || null,
            priority: document.getElementById('task-priority-input').value,
            folderId: document.getElementById('task-folder-input').value || null,
            tag: document.getElementById('task-tag-input').value.trim(),
            alertMins, steps: newSteps
        };
    } else {
        const steps = stepsRaw ? stepsRaw.split('\n').filter(s => s.trim()).map(s => ({ text: s.trim(), done: false })) : [];
        tasks.push({
            id: genId(), createdAt: new Date().toISOString(),
            name, desc: document.getElementById('task-desc-input').value.trim(),
            deadline: deadlineRaw || null,
            priority: document.getElementById('task-priority-input').value,
            folderId: document.getElementById('task-folder-input').value || null,
            tag: document.getElementById('task-tag-input').value.trim(),
            alertMins, steps, done: false
        });
    }
    setTasks(tasks);
    closeModal('modal-task');
    renderTasks();
    showToast(editingTaskId ? 'Task updated!' : 'Task created!');
}

async function deleteTask() {
    if (!editingTaskId) return;
    if (!await showConfirm('Delete this task?', 'Delete', true)) return;
    setTasks(getTasks().filter(t => t.id !== editingTaskId));
    closeModal('modal-task');
    renderTasks();
    showToast('Task deleted.');
}

function toggleTaskDone(id) {
    const tasks = getTasks();
    const idx = tasks.findIndex(t => t.id === id);
    if (idx < 0) return;
    tasks[idx].done = !tasks[idx].done;
    tasks[idx].completedAt = tasks[idx].done ? new Date().toISOString() : null;
    setTasks(tasks);
    renderTasks();
    if (tasks[idx].done) showToast('Task completed! ✓');
}

function toggleTaskStep(taskId, stepIdx) {
    const tasks = getTasks();
    const task = tasks.find(t => t.id === taskId);
    if (!task || !task.steps[stepIdx]) return;
    // Remember panel open state before re-render
    const panelOpen = DB.get('steps_open_' + taskId, false);
    task.steps[stepIdx].done = !task.steps[stepIdx].done;
    // Auto-complete task if all steps done
    if (task.steps.length > 0 && task.steps.every(s => s.done)) {
        task.done = true; task.completedAt = new Date().toISOString();
        showToast('All steps done — task completed! 🎉');
    }
    setTasks(tasks);
    renderTasks();
    // Restore panel state after re-render
    if (panelOpen) {
        const panel = document.getElementById('steps-panel-' + taskId);
        const arrow = document.getElementById('steps-toggle-arrow-' + taskId);
        if (panel) panel.style.gridTemplateRows = '1fr';
        if (arrow) arrow.textContent = '▴';
    }
}

function toggleStepsPanel(taskId) {
    const panel = document.getElementById('steps-panel-' + taskId);
    const arrow = document.getElementById('steps-toggle-arrow-' + taskId);
    if (!panel) return;
    const isOpen = panel.style.gridTemplateRows === '1fr';
    panel.style.gridTemplateRows = isOpen ? '0fr' : '1fr';
    if (arrow) arrow.textContent = isOpen ? '▾' : '▴';
    DB.set('steps_open_' + taskId, !isOpen);
}

// ---- CRUD: Folders ----
function openFolderModal(folderId = null) {
    editingFolderId = folderId;
    selectedFolderColor = '#7c6ef0';
    if (folderId) {
        const f = getFolders().find(x => x.id === folderId);
        if (!f) return;
        document.getElementById('folder-modal-title').textContent = 'Edit Project';
        document.getElementById('folder-name-input').value = f.name || '';
        document.getElementById('folder-desc-input').value = f.desc || '';
        document.getElementById('folder-due-input').value = f.due || '';
        selectedFolderColor = f.color || '#7c6ef0';
        document.getElementById('folder-delete-btn').style.display = 'inline-flex';
    } else {
        document.getElementById('folder-modal-title').textContent = 'New Project';
        document.getElementById('folder-name-input').value = '';
        document.getElementById('folder-desc-input').value = '';
        document.getElementById('folder-due-input').value = '';
        document.getElementById('folder-delete-btn').style.display = 'none';
    }
    // Highlight selected color
    document.querySelectorAll('.fcol-opt').forEach(el => {
        el.style.border = el.dataset.color === selectedFolderColor ? '2px solid white' : '2px solid transparent';
    });
    openModal('modal-folder');
}

function selectFolderColor(c) {
    selectedFolderColor = c;
    document.querySelectorAll('.fcol-opt').forEach(el => {
        el.style.border = el.dataset.color === c ? '2px solid white' : '2px solid transparent';
    });
}

function saveFolder() {
    const name = document.getElementById('folder-name-input').value.trim().slice(0, 100);
    if (!name) return void showToast('Please enter a project name.');
    const folders = getFolders();
    const data = {
        name, desc: document.getElementById('folder-desc-input').value.trim(),
        due: document.getElementById('folder-due-input').value || null,
        color: selectedFolderColor
    };
    if (editingFolderId) {
        const idx = folders.findIndex(f => f.id === editingFolderId);
        if (idx >= 0) folders[idx] = { ...folders[idx], ...data };
    } else {
        folders.push({ id: genId(), createdAt: new Date().toISOString(), ...data });
    }
    setFolders(folders);
    closeModal('modal-folder');
    renderTasks();
    showToast(editingFolderId ? 'Project updated!' : 'Project created!');
}

async function deleteFolder() {
    if (!editingFolderId) return;
    if (!await showConfirm('Delete this project? Tasks inside will become standalone.', 'Delete', true)) return;
    // Unlink tasks from folder
    const tasks = getTasks().map(t => t.folderId === editingFolderId ? { ...t, folderId: null } : t);
    setTasks(tasks);
    setFolders(getFolders().filter(f => f.id !== editingFolderId));
    closeModal('modal-folder');
    renderTasks();
    showToast('Project deleted. Tasks kept.');
}

// ---- Dashboard task alerts (called from renderDashToday) ----
function getDashTaskAlerts() {
    const tasks = getTasks();
    const alertDefault = getTaskAlertDefault() * 60;
    const open = tasks.filter(t => !t.done);
    const overdue = open.filter(t => taskMinsUntilDeadline(t) < 0);
    const urgent = open.filter(t => {
        const m = taskMinsUntilDeadline(t);
        const threshold = t.alertMins !== undefined ? t.alertMins : alertDefault;
        return m >= 0 && m <= threshold;
    }).sort((a, b) => taskMinsUntilDeadline(a) - taskMinsUntilDeadline(b));
    return { overdue, urgent };
}

// ============================================================
// BUDGET CONSULTANT — full rebuild
// ============================================================

let consultantStep = 0;
let consultantData = {};

const CONSULTANT_STEPS = [
    { id: 'income', title: '💰 Your Income', label: 'Step 1 of 5' },
    { id: 'household', title: '🏠 Your Household', label: 'Step 2 of 5' },
    { id: 'fixed', title: '📋 Fixed Expenses', label: 'Step 3 of 5' },
    { id: 'lifestyle', title: '🎯 Goals & Lifestyle', label: 'Step 4 of 5' },
    { id: 'finetune', title: '🎚️ Fine-Tune Your Budget', label: 'Step 5 of 5' },
];

function openBudgetConsultant() {
    consultantStep = 0;
    consultantData = DB.get('consultant_data', {});
    renderConsultantStep();
    document.getElementById('consultant-next-btn').style.display = 'inline-flex';
    openModal('modal-budget-consultant');
}

function renderConsultantStep() {
    const step = CONSULTANT_STEPS[consultantStep];
    document.getElementById('consultant-modal-title').textContent = step.title;
    document.getElementById('consultant-step-label').textContent = step.label;
    document.getElementById('consultant-back-btn').style.display = consultantStep > 0 ? 'inline-flex' : 'none';
    const isLast = consultantStep === CONSULTANT_STEPS.length - 1;
    document.getElementById('consultant-next-btn').textContent = isLast ? '✅ Apply My Plan' : consultantStep === CONSULTANT_STEPS.length - 2 ? 'Next →' : 'Next →';
    const cur = getCurrency();
    const d = consultantData;

    let steps = {
        income: `
      <div style="padding:12px;background:rgba(200,169,110,0.08);border-radius:10px;border:1px solid rgba(200,169,110,0.2);margin-bottom:16px;font-size:13px;color:var(--muted);line-height:1.6;">
        Hey! Let's build your personal money plan. I'll crunch the numbers and tell you exactly where every ringgit should go. 💡
      </div>
      <div style="margin-bottom:12px;">
        <label class="label">What's your total monthly income? (${cur})</label>
        <input type="number" class="input" id="ci-income" placeholder="e.g. 3500" min="0" value="${d.income || ''}" max="9999999">
        <div style="font-size:11px;color:var(--muted);margin-top:4px;">Your take-home pay after tax</div>
      </div>
      <div style="margin-bottom:12px;">
        <label class="label">Income type</label>
        <select class="input" id="ci-income-type">
          <option value="salary"   ${d.incomeType === 'salary' ? 'selected' : ''}>💼 Regular salary (fixed monthly)</option>
          <option value="freelance"${d.incomeType === 'freelance' ? 'selected' : ''}>🔄 Freelance / variable income</option>
          <option value="business" ${d.incomeType === 'business' ? 'selected' : ''}>🏢 Business owner</option>
          <option value="student"  ${d.incomeType === 'student' ? 'selected' : ''}>🎓 Student / allowance</option>
        </select>
      </div>
      <div>
        <label class="label">Any extra income this month? (${cur}, optional)</label>
        <input type="number" class="input" id="ci-side-income" placeholder="Side hustle, rental, bonus..." value="${d.sideIncome || ''}" max="9999999">
      </div>`,

        household: `
      <div style="margin-bottom:12px;">
        <label class="label">What do you do?</label>
        <select class="input" id="ci-occupation">
          <option value="employed"    ${d.occupation === 'employed' ? 'selected' : ''}>💼 Employed full-time</option>
          <option value="selfemployed"${d.occupation === 'selfemployed' ? 'selected' : ''}>🧑‍💼 Self-employed / Freelancer</option>
          <option value="student"     ${d.occupation === 'student' ? 'selected' : ''}>🎓 Student</option>
          <option value="business"    ${d.occupation === 'business' ? 'selected' : ''}>🏢 Business owner</option>
          <option value="other"       ${d.occupation === 'other' ? 'selected' : ''}>📋 Other</option>
        </select>
      </div>
      <div style="margin-bottom:12px;">
        <label class="label">How many people are you financially responsible for? (incl. yourself)</label>
        <select class="input" id="ci-dependents">
          <option value="1" ${d.dependents === '1' ? 'selected' : ''}>1 — Just me</option>
          <option value="2" ${d.dependents === '2' ? 'selected' : ''}>2 — Me + partner / 1 kid</option>
          <option value="3" ${d.dependents === '3' ? 'selected' : ''}>3 — Small family</option>
          <option value="4" ${d.dependents === '4' ? 'selected' : ''}>4 people</option>
          <option value="5" ${d.dependents === '5' ? 'selected' : ''}>5+ people</option>
        </select>
      </div>
      <div>
        <label class="label">Living situation</label>
        <select class="input" id="ci-living">
          <option value="own"      ${d.living === 'own' ? 'selected' : ''}>🏠 Own home (no rent/mortgage)</option>
          <option value="mortgage" ${d.living === 'mortgage' ? 'selected' : ''}>🏦 Paying mortgage</option>
          <option value="rent"     ${d.living === 'rent' ? 'selected' : ''}>🔑 Renting</option>
          <option value="family"   ${d.living === 'family' ? 'selected' : ''}>👨‍👩‍👦 Living with family / parents</option>
        </select>
      </div>`,

        fixed: `
      <div style="font-size:13px;color:var(--muted);margin-bottom:12px;">These are your non-negotiables. Be honest — this is what I'll ring-fence first. Enter 0 if it doesn't apply.</div>
      <div class="grid-2" style="gap:10px;margin-bottom:10px;">
        <div><label class="label">Rent / Mortgage (${cur})</label><input type="number" class="input" id="ci-rent" placeholder="0" min="0" value="${d.rent || ''}"></div>
        <div><label class="label">Utilities / Bills (${cur})</label><input type="number" class="input" id="ci-utilities" placeholder="0" min="0" value="${d.utilities || ''}"></div>
      </div>
      <div class="grid-2" style="gap:10px;margin-bottom:10px;">
        <div><label class="label">Groceries / Food (${cur})</label><input type="number" class="input" id="ci-food" placeholder="0" min="0" value="${d.food || ''}"></div>
        <div><label class="label">Transport / Petrol (${cur})</label><input type="number" class="input" id="ci-transport" placeholder="0" min="0" value="${d.transport || ''}"></div>
      </div>
      <div class="grid-2" style="gap:10px;margin-bottom:10px;">
        <div><label class="label">Insurance / Health (${cur})</label><input type="number" class="input" id="ci-insurance" placeholder="0" min="0" value="${d.insurance || ''}"></div>
        <div><label class="label">Loan repayments (${cur})</label><input type="number" class="input" id="ci-loans" placeholder="0" min="0" value="${d.loans || ''}"></div>
      </div>
      <div><label class="label">Other fixed costs — phone plan, subscriptions (${cur})</label><input type="number" class="input" id="ci-other-fixed" placeholder="0" min="0" value="${d.otherFixed || ''}"></div>`,

        lifestyle: `
      <div style="margin-bottom:12px;">
        <label class="label">What's your main money goal right now?</label>
        <select class="input" id="ci-goal">
          <option value="save_more"${d.goal === 'save_more' ? 'selected' : ''}>💰 Save as much as possible</option>
          <option value="balance"  ${d.goal === 'balance' ? 'selected' : ''}>⚖️ Balance saving and enjoying life</option>
          <option value="debt"     ${d.goal === 'debt' ? 'selected' : ''}>📉 Pay off debt faster</option>
          <option value="invest"   ${d.goal === 'invest' ? 'selected' : ''}>📈 Start investing</option>
          <option value="emergency"${d.goal === 'emergency' ? 'selected' : ''}>🛡️ Build emergency fund</option>
        </select>
      </div>
      <div style="margin-bottom:12px;">
        <label class="label">How would you describe your lifestyle?</label>
        <select class="input" id="ci-lifestyle-style">
          <option value="frugal"  ${d.lifestyle === 'frugal' ? 'selected' : ''}>🧘 Frugal — I keep it minimal</option>
          <option value="moderate"${d.lifestyle === 'moderate' ? 'selected' : ''}>😊 Moderate — occasional treats</option>
          <option value="comfort" ${d.lifestyle === 'comfort' ? 'selected' : ''}>✨ Comfortable — I like nice things</option>
          <option value="lavish"  ${d.lifestyle === 'lavish' ? 'selected' : ''}>💎 Lavish — I enjoy life fully</option>
        </select>
      </div>
      <div>
        <label class="label">Emergency fund status</label>
        <select class="input" id="ci-emergency">
          <option value="none"   ${d.emergency === 'none' ? 'selected' : ''}>❌ No emergency fund yet</option>
          <option value="partial"${d.emergency === 'partial' ? 'selected' : ''}>⚠️ Some — less than 3 months expenses</option>
          <option value="good"   ${d.emergency === 'good' ? 'selected' : ''}>✅ Good — 3-6 months covered</option>
          <option value="solid"  ${d.emergency === 'solid' ? 'selected' : ''}>🛡️ Solid — 6+ months covered</option>
        </select>
      </div>`,
        finetune: '',
    };
    // Build finetune step dynamically from draft plan
    if (step.id === 'finetune') {
        const plan = consultantData._draftPlan || buildMoneyPlan(consultantData);
        if (!consultantData._draftPlan) { consultantData._draftPlan = plan; }
        const cur = getCurrency();
        const income = plan.totalIncome;

        const fixedEnvs = plan.envelopes.filter(e => e.fixed);
        const lifestyleEnvs = plan.envelopes.filter(e => !e.fixed);
        const totalSpending = plan.envelopes.reduce((a, e) => a + e.amount, 0);
        const initSavings = income - totalSpending;
        const initOverBudget = totalSpending > income;

        function sliderRow(env) {
            const pct = income > 0 ? Math.round((env.amount / income) * 100) : 0;
            const rcmdAmt = env.amount;
            const max = Math.round(Math.min(income, Math.max(env.amount * 4, 1000)) / 10) * 10;
            // track fill position for gradient
            const fillPct = max > 0 ? Math.round((env.amount / max) * 100) : 0;
            return `
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:8px;transition:border-color 0.2s;" id="ft-card-${env.key}">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:18px;line-height:1;">${env.icon}</span>
              <div>
                <div style="font-size:13px;font-weight:600;">${env.label}</div>
                <div style="font-size:10px;color:var(--muted);margin-top:1px;">Recommended: <span style="color:var(--accent2);">${cur} ${rcmdAmt.toLocaleString()}</span></div>
              </div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:16px;font-weight:700;color:var(--accent);font-variant-numeric:tabular-nums;" id="ft-val-${env.key}">${cur} ${env.amount.toLocaleString()}</div>
              <div style="font-size:10px;color:var(--muted);margin-top:1px;" id="ft-pct-${env.key}">${pct}% of income</div>
            </div>
          </div>
          <div style="position:relative;padding:4px 0;">
            <div style="position:relative;height:6px;background:rgba(255,255,255,0.06);border-radius:99px;overflow:visible;margin-bottom:6px;">
              <div id="ft-track-fill-${env.key}" style="position:absolute;left:0;top:0;height:100%;width:${fillPct}%;background:${env.color || 'var(--accent)'};border-radius:99px;transition:width 0.05s;opacity:0.7;pointer-events:none;"></div>
              <!-- rcmd marker -->
              <div style="position:absolute;top:-3px;width:2px;height:12px;background:var(--accent2);border-radius:1px;opacity:0.7;left:${income > 0 ? Math.round((rcmdAmt / max) * 100) : 0}%;" title="Recommended"></div>
            </div>
            <input type="range" id="ft-slider-${env.key}"
              min="0" max="${max}" step="10" value="${env.amount}"
              data-rcmd="${rcmdAmt}" data-max="${max}" data-color="${env.color || 'var(--accent)'}"
              oninput="ftUpdate('${env.key}', this.value, ${income})"
              style="position:absolute;top:0;left:0;width:100%;height:14px;opacity:0;cursor:pointer;margin:0;padding:0;">
          </div>
          <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--muted);margin-top:2px;">
            <span>${cur} 0</span>
            <button onclick="ftReset('${env.key}', ${rcmdAmt}, ${income})" style="background:none;border:none;cursor:pointer;font-size:10px;color:var(--accent2);padding:0;font-family:inherit;opacity:0.8;" title="Reset to recommended">↺ Reset</button>
            <span>${cur} ${max.toLocaleString()}</span>
          </div>
        </div>`;
        }

        steps.finetune = `
      <style>
        #ft-summary-bar { transition: background 0.3s, border-color 0.3s; }
        .ft-warn { animation: ft-pulse 0.4s ease; }
        @keyframes ft-pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.02)} }
      </style>

      <!-- Sticky summary bar -->
      <div id="ft-summary-bar" style="position:sticky;top:0;z-index:10;margin:-20px -24px 16px;padding:14px 24px;background:var(--surface);border-bottom:1px solid var(--border);backdrop-filter:blur(8px);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span style="font-size:11px;font-weight:600;color:var(--muted);letter-spacing:0.06em;text-transform:uppercase;">Monthly Income</span>
          <span style="font-size:14px;font-weight:700;color:var(--success);">${cur} ${income.toLocaleString()}</span>
        </div>
        <!-- Progress bar: total spending vs income -->
        <div style="position:relative;height:8px;background:rgba(255,255,255,0.06);border-radius:99px;overflow:hidden;margin-bottom:8px;">
          <div id="ft-budget-bar" style="height:100%;border-radius:99px;transition:width 0.15s,background 0.2s;width:${income > 0 ? Math.min(100, Math.round((totalSpending / income) * 100)) : 0}%;background:${initOverBudget ? 'var(--danger)' : 'var(--accent)'};"></div>
        </div>
        <div style="display:flex;justify-content:space-between;gap:8px;">
          <div style="flex:1;background:rgba(255,255,255,0.04);border-radius:8px;padding:8px 10px;text-align:center;">
            <div style="font-size:10px;color:var(--muted);margin-bottom:2px;">TOTAL SPENDING</div>
            <div style="font-size:14px;font-weight:700;font-variant-numeric:tabular-nums;" id="ft-total-val">${cur} ${totalSpending.toLocaleString()}</div>
          </div>
          <div style="flex:1;border-radius:8px;padding:8px 10px;text-align:center;border:1px solid ${initOverBudget ? 'rgba(248,113,113,0.35)' : 'rgba(74,222,128,0.2)'};background:${initOverBudget ? 'rgba(248,113,113,0.08)' : 'rgba(74,222,128,0.06)'};" id="ft-savings-card">
            <div style="font-size:10px;color:var(--muted);margin-bottom:2px;" id="ft-savings-label">${initOverBudget ? '⚠️ OVER BUDGET' : '💰 SAVINGS'}</div>
            <div style="font-size:14px;font-weight:700;font-variant-numeric:tabular-nums;color:${initOverBudget ? 'var(--danger)' : 'var(--success)'};" id="ft-savings-val">${initOverBudget ? '−' : ''}${cur} ${Math.abs(initSavings).toLocaleString()}</div>
          </div>
        </div>
        <!-- Error/warning message -->
        <div id="ft-error-msg" style="display:${initOverBudget ? 'flex' : 'none'};align-items:center;gap:8px;margin-top:10px;padding:9px 12px;background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.3);border-radius:8px;font-size:12px;color:var(--danger);">
          <span style="font-size:16px;">🚨</span>
          <span id="ft-error-text">Your spending exceeds your income. Reduce some envelopes to continue.</span>
        </div>
      </div>

      <div style="padding:4px 0 2px;font-size:11px;font-weight:600;color:var(--muted);letter-spacing:0.07em;text-transform:uppercase;margin-bottom:8px;">📋 Fixed Expenses</div>
      ${fixedEnvs.map(sliderRow).join('')}

      <div style="padding:12px 0 2px;font-size:11px;font-weight:600;color:var(--muted);letter-spacing:0.07em;text-transform:uppercase;margin-bottom:8px;">🎯 Lifestyle & Discretionary</div>
      ${lifestyleEnvs.map(sliderRow).join('')}

      <div style="margin-top:4px;padding:8px 12px;background:rgba(255,255,255,0.03);border-radius:8px;font-size:11px;color:var(--muted);text-align:center;line-height:1.6;">
        🔵 The <span style="color:var(--accent2);">blue marker</span> on each slider shows the recommended amount. Drag to adjust freely.
      </div>`;
    }

    document.getElementById('consultant-modal-body').innerHTML = steps[step.id];
}

function consultantNext() {
    const d = consultantData;
    const step = CONSULTANT_STEPS[consultantStep];
    if (step.id === 'income') {
        const inc = parseFloat(document.getElementById('ci-income').value);
        if (!inc || inc <= 0) { showToast('Please enter your monthly income.'); return; }
        d.income = safeNum(inc, 1, 9999999);
        const incomeTypeEl = document.getElementById('ci-income-type');
        const VALID_INCOME_TYPES = ['salary', 'freelance', 'business', 'student'];
        d.incomeType = VALID_INCOME_TYPES.includes(incomeTypeEl?.value) ? incomeTypeEl.value : 'salary';
        d.sideIncome = safeNum(document.getElementById('ci-side-income').value, 0, 9999999, 0);
    } else if (step.id === 'household') {
        const VALID_OCCUPATIONS = ['employed', 'selfemployed', 'student', 'business', 'other'];
        const VALID_DEPENDENTS = ['1', '2', '3', '4', '5'];
        const VALID_LIVING = ['own', 'mortgage', 'rent', 'family'];
        const occ = document.getElementById('ci-occupation').value;
        const dep = document.getElementById('ci-dependents').value;
        const liv = document.getElementById('ci-living').value;
        d.occupation = VALID_OCCUPATIONS.includes(occ) ? occ : 'employed';
        d.dependents = VALID_DEPENDENTS.includes(dep) ? dep : '1';
        d.living = VALID_LIVING.includes(liv) ? liv : 'rent';
    } else if (step.id === 'fixed') {
        const maxFixed = d.income || 9999999;
        d.rent = safeNum(document.getElementById('ci-rent').value, 0, maxFixed, 0);
        d.utilities = safeNum(document.getElementById('ci-utilities').value, 0, maxFixed, 0);
        d.food = safeNum(document.getElementById('ci-food').value, 0, maxFixed, 0);
        d.transport = safeNum(document.getElementById('ci-transport').value, 0, maxFixed, 0);
        d.insurance = safeNum(document.getElementById('ci-insurance').value, 0, maxFixed, 0);
        d.loans = safeNum(document.getElementById('ci-loans').value, 0, maxFixed, 0);
        d.otherFixed = safeNum(document.getElementById('ci-other-fixed').value, 0, maxFixed, 0);
    } else if (step.id === 'lifestyle') {
        const VALID_GOALS = ['save_more', 'balance', 'debt', 'invest', 'emergency'];
        const VALID_LIFESTYLES = ['frugal', 'moderate', 'comfort', 'lavish'];
        const VALID_EMERGENCY = ['none', 'partial', 'good', 'solid'];
        const goal = document.getElementById('ci-goal').value;
        const ls = document.getElementById('ci-lifestyle-style').value;
        const em = document.getElementById('ci-emergency').value;
        d.goal = VALID_GOALS.includes(goal) ? goal : 'balance';
        d.lifestyle = VALID_LIFESTYLES.includes(ls) ? ls : 'moderate';
        d.emergency = VALID_EMERGENCY.includes(em) ? em : 'none';
        consultantData = d;
        DB.set('consultant_data', d);
        // Build draft plan to populate the finetune sliders
        const draftPlan = buildMoneyPlan(d);
        d._draftPlan = draftPlan;
        consultantData = d;
    } else if (step.id === 'finetune') {
        // Collect slider values and apply overrides to the plan
        const d2 = consultantData;
        const plan = d2._draftPlan || buildMoneyPlan(d2);

        // Safety check: block if over budget
        let totalCheck = 0;
        plan.envelopes.forEach(env => {
            const el = document.getElementById('ft-slider-' + env.key);
            totalCheck += el ? (parseInt(el.value) || 0) : env.amount;
        });
        if (totalCheck > plan.totalIncome) {
            showToast('⚠️ Spending exceeds income. Adjust your sliders first.');
            return;
        }

        plan.envelopes = plan.envelopes.map(env => {
            const el = document.getElementById('ft-slider-' + env.key);
            if (el) env.amount = parseInt(el.value) || env.amount;
            return env;
        });
        // Recalculate savings from remainder
        const totalSpending = plan.envelopes.reduce((a, e) => a + e.amount, 0);
        plan.savingsAmt = Math.max(plan.totalIncome - totalSpending, 0);
        delete d2._draftPlan;
        DB.set('consultant_data', d2);
        DB.set('money_plan', plan);
        const monthStr = getMoneyMonthStr(moneyViewDate);
        const budgets = DB.get('money_budgets', {});
        budgets[monthStr] = plan.totalIncome;
        DB.set('money_budgets', budgets);
        closeModal('modal-budget-consultant');
        renderMoneyPage();
        showToast('Your money plan is ready! 🎯');
        return;
    }
    consultantData = d;
    consultantStep++;
    renderConsultantStep();
}

function consultantBack() {
    if (consultantStep > 0) { consultantStep--; renderConsultantStep(); }
}

function ftUpdate(key, val, income) {
    const cur = getCurrency();
    const num = parseInt(val) || 0;
    const slider = document.getElementById('ft-slider-' + key);
    const maxVal = slider ? parseInt(slider.dataset.max) : num;

    // Update individual card display
    const valEl = document.getElementById('ft-val-' + key);
    const pctEl = document.getElementById('ft-pct-' + key);
    const fillEl = document.getElementById('ft-track-fill-' + key);
    const cardEl = document.getElementById('ft-card-' + key);
    if (valEl) valEl.textContent = cur + ' ' + num.toLocaleString();
    if (pctEl) pctEl.textContent = income > 0 ? Math.round((num / income) * 100) + '% of income' : '0%';
    if (fillEl) {
        const fillPct = maxVal > 0 ? Math.min(100, Math.round((num / maxVal) * 100)) : 0;
        fillEl.style.width = fillPct + '%';
        // colour the fill: green if at/below rcmd, amber if above
        const rcmd = slider ? parseInt(slider.dataset.rcmd) : num;
        const color = slider ? slider.dataset.color : 'var(--accent)';
        fillEl.style.background = num > rcmd * 1.2 ? 'var(--danger)' : color;
        if (cardEl) cardEl.style.borderColor = num > rcmd * 1.2 ? 'rgba(248,113,113,0.4)' : 'var(--border)';
    }

    // Recalculate totals
    const plan = consultantData._draftPlan;
    if (!plan) return;
    let total = 0;
    plan.envelopes.forEach(env => {
        const el = document.getElementById('ft-slider-' + env.key);
        total += el ? (parseInt(el.value) || 0) : env.amount;
    });
    const savings = income - total;
    const overBudget = total > income;
    const overAmt = total - income;

    // Update summary bar
    const barEl = document.getElementById('ft-budget-bar');
    const totalValEl = document.getElementById('ft-total-val');
    const savingsValEl = document.getElementById('ft-savings-val');
    const savingsLabelEl = document.getElementById('ft-savings-label');
    const savingsCard = document.getElementById('ft-savings-card');
    const errorMsg = document.getElementById('ft-error-msg');
    const errorText = document.getElementById('ft-error-text');
    const nextBtn = document.getElementById('consultant-next-btn');
    const summaryBar = document.getElementById('ft-summary-bar');

    if (barEl) {
        const barPct = income > 0 ? Math.min(120, Math.round((total / income) * 100)) : 0;
        barEl.style.width = Math.min(barPct, 100) + '%';
        barEl.style.background = overBudget ? 'var(--danger)' : total > income * 0.9 ? 'var(--accent)' : 'var(--success)';
    }
    if (totalValEl) {
        totalValEl.textContent = cur + ' ' + total.toLocaleString();
        totalValEl.style.color = overBudget ? 'var(--danger)' : 'var(--text)';
    }
    if (savingsValEl) {
        savingsValEl.textContent = (overBudget ? '−' : '') + cur + ' ' + Math.abs(savings).toLocaleString();
        savingsValEl.style.color = overBudget ? 'var(--danger)' : 'var(--success)';
    }
    if (savingsLabelEl) savingsLabelEl.textContent = overBudget ? '🚨 OVER BUDGET' : '💰 SAVINGS';
    if (savingsCard) {
        savingsCard.style.borderColor = overBudget ? 'rgba(248,113,113,0.35)' : 'rgba(74,222,128,0.2)';
        savingsCard.style.background = overBudget ? 'rgba(248,113,113,0.08)' : 'rgba(74,222,128,0.06)';
    }
    if (summaryBar) summaryBar.style.borderBottomColor = overBudget ? 'rgba(248,113,113,0.3)' : 'var(--border)';

    // Error message
    if (errorMsg) {
        if (overBudget) {
            errorMsg.style.display = 'flex';
            if (errorText) errorText.textContent = `You're ${cur} ${overAmt.toLocaleString()} over budget. Reduce some envelopes to apply your plan.`;
        } else if (savings < income * 0.05 && savings >= 0) {
            // Warning: very little savings
            errorMsg.style.display = 'flex';
            errorMsg.style.background = 'rgba(200,169,110,0.1)';
            errorMsg.style.borderColor = 'rgba(200,169,110,0.3)';
            if (errorText) { errorText.textContent = `⚠️ Less than 5% savings (${cur} ${savings.toLocaleString()}). Consider trimming discretionary spend.`; errorText.style.color = 'var(--accent)'; }
        } else {
            errorMsg.style.display = 'none';
        }
    }

    // Block the Apply button if over budget
    if (nextBtn) {
        nextBtn.disabled = overBudget;
        nextBtn.style.opacity = overBudget ? '0.4' : '1';
        nextBtn.style.cursor = overBudget ? 'not-allowed' : 'pointer';
        nextBtn.title = overBudget ? 'Reduce spending to apply plan' : '';
    }
}

function ftReset(key, rcmdAmt, income) {
    const slider = document.getElementById('ft-slider-' + key);
    if (slider) {
        slider.value = rcmdAmt;
        ftUpdate(key, rcmdAmt, income);
    }
}

function buildMoneyPlan(d) {
    const totalIncome = (d.income || 0) + (d.sideIncome || 0);
    const fixedTotal = (d.rent || 0) + (d.utilities || 0) + (d.food || 0) + (d.transport || 0) + (d.insurance || 0) + (d.loans || 0) + (d.otherFixed || 0);
    const afterFixed = totalIncome - fixedTotal;

    const savingsRates = {
        save_more: { frugal: .35, moderate: .30, comfort: .25, lavish: .20 },
        balance: { frugal: .25, moderate: .20, comfort: .18, lavish: .15 },
        debt: { frugal: .40, moderate: .35, comfort: .30, lavish: .25 },
        invest: { frugal: .30, moderate: .25, comfort: .22, lavish: .18 },
        emergency: { frugal: .30, moderate: .25, comfort: .22, lavish: .18 },
    };
    const rate = (savingsRates[d.goal] || savingsRates.balance)[d.lifestyle] || 0.20;
    const savingsAmt = Math.round(Math.max(afterFixed * rate, 0));
    const discretionary = Math.max(afterFixed - savingsAmt, 0);

    // ALL envelopes: fixed first (tracked manually), then lifestyle
    const envelopes = [];

    // Fixed envelopes - budgets you track by logging actual spend
    const fixedDefs = [
        { key: 'rent', label: 'Rent / Mortgage', icon: '🏠', amount: d.rent || 0, color: '#f87171', cat: 'Rent', fixed: true },
        { key: 'utilities', label: 'Utilities & Bills', icon: '💡', amount: d.utilities || 0, color: '#fb923c', cat: 'Utilities', fixed: true },
        { key: 'groceries', label: 'Groceries', icon: '🛒', amount: d.food || 0, color: '#4ade80', cat: 'Groceries', fixed: true },
        { key: 'transport', label: 'Transport', icon: '🚗', amount: d.transport || 0, color: '#60a5fa', cat: 'Transport', fixed: true },
        { key: 'insurance', label: 'Insurance & Health', icon: '💊', amount: d.insurance || 0, color: '#f472b6', cat: 'Health', fixed: true },
        { key: 'loans', label: 'Loan Repayments', icon: '🏦', amount: d.loans || 0, color: '#a78bfa', cat: 'Loans', fixed: true },
        { key: 'otherfixed', label: 'Other Fixed', icon: '📌', amount: d.otherFixed || 0, color: '#94a3b8', cat: 'Bills & Utilities', fixed: true },
    ].filter(e => e.amount > 0);
    envelopes.push(...fixedDefs);

    // Lifestyle envelopes - discretionary
    const lm = { frugal: .7, moderate: 1, comfort: 1.2, lavish: 1.5 }[d.lifestyle] || 1;
    const rawEnt = discretionary * 0.25 * lm;
    const rawDine = discretionary * 0.20 * lm;
    const rawShop = discretionary * 0.20 * lm;
    const rawPersonal = discretionary * 0.15;
    const rawEdu = discretionary * 0.10;
    const rawGym = discretionary * 0.10;
    const envSum = rawEnt + rawDine + rawShop + rawPersonal + rawEdu + rawGym;
    const scale = envSum > discretionary ? (discretionary / envSum) : 1;
    const lifestyleDefs = [
        { key: 'entertainment', label: 'Entertainment', icon: '🎮', amount: Math.round(rawEnt * scale), color: '#a78bfa', cat: 'Entertainment', fixed: false },
        { key: 'dining', label: 'Dining Out', icon: '🍽️', amount: Math.round(rawDine * scale), color: 'var(--accent2)', cat: 'Food & Drinks', fixed: false },
        { key: 'shopping', label: 'Shopping', icon: '🛍️', amount: Math.round(rawShop * scale), color: '#34d399', cat: 'Shopping', fixed: false },
        { key: 'personal', label: 'Personal Care', icon: '🧴', amount: Math.round(rawPersonal * scale), color: 'var(--accent)', cat: 'Personal', fixed: false },
        { key: 'education', label: 'Education', icon: '📚', amount: Math.round(rawEdu * scale), color: '#38bdf8', cat: 'Education', fixed: false },
        { key: 'gym', label: 'Gym & Fitness', icon: '💪', amount: Math.round(rawGym * scale), color: '#facc15', cat: 'Gym & Fitness', fixed: false },
    ].filter(e => e.amount > 0);
    envelopes.push(...lifestyleDefs);

    // Buffer = leftover after everything
    const totalAllocated = envelopes.reduce((a, e) => a + e.amount, 0);
    const buffer = Math.max(totalIncome - savingsAmt - totalAllocated, 0);
    if (buffer > 0) envelopes.push({ key: 'buffer', label: 'Buffer / Misc', icon: '🔧', amount: buffer, color: 'var(--muted)', cat: '', fixed: false });

    return {
        totalIncome, fixedTotal, afterFixed, savingsAmt, discretionary,
        envelopes,
        goal: d.goal, lifestyle: d.lifestyle, emergency: d.emergency,
        tips: generateConsultantTips(d, totalIncome, fixedTotal, savingsAmt, getCurrency()),
    };
}

function generateConsultantTips(d, income, fixed, savings, cur) {
    const tips = [];
    const fixedRatio = income > 0 ? fixed / income : 0;
    if (fixedRatio > 0.70) tips.push(`⚠️ Your fixed expenses are ${Math.round(fixedRatio * 100)}% of income — that's very tight. Look for anything you can cut.`);
    if (d.emergency === 'none') tips.push(`🚨 No emergency fund! Prioritise saving ${cur} ${Math.round(fixed * 3).toLocaleString()} (3 months of fixed costs) before anything else.`);
    if (d.loans > 0) tips.push(`📉 You have loans. Even ${cur} 50-100 extra per month on repayments can save you significant interest.`);
    if (d.goal === 'invest') tips.push(`📈 Once your emergency fund is solid, put 10-15% of income into low-cost index funds consistently.`);
    if (d.incomeType === 'freelance') tips.push(`🔄 Variable income? Save aggressively in good months. Set a floor: never let savings drop below 3 months of expenses.`);
    if (parseInt(d.dependents) >= 3) tips.push(`👨‍👩‍👦 Supporting ${d.dependents} people — make sure your grocery and utilities envelopes reflect the real cost for everyone.`);
    if (d.lifestyle === 'lavish') tips.push(`💎 You like the good life — and that's fine. Just "pay yourself first": move savings to a separate account on payday before you spend anything.`);
    if (tips.length === 0) tips.push(`✨ Your finances look well-structured. Stay consistent and review every 3 months.`);
    return tips;
}

// ============================================================
// MONEY PAGE — main render with plan integration
// ============================================================

function isValidPlan(plan) {
    return !!(plan && plan.totalIncome > 0 && Array.isArray(plan.envelopes) && plan.envelopes.length > 0);
}

function renderMoneyPage() {
    const monthStr = getMoneyMonthStr(moneyViewDate);
    const monthLabel = moneyViewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    document.getElementById('money-month-label').textContent = monthLabel;
    document.getElementById('money-list-month-label').textContent = monthLabel;
    const _sub = document.getElementById('money-month-sub');
    if (_sub) _sub.textContent = monthLabel;

    const plan = DB.get('money_plan', null);
    const hasPlan = isValidPlan(plan);
    // If plan exists but is old format, clear it so user re-runs consultant
    // Don't auto-wipe — show banner instead so user can re-run consultant

    document.getElementById('money-no-plan-banner').style.display = hasPlan ? 'none' : 'block';
    document.getElementById('money-plan-section').style.display = hasPlan ? 'block' : 'none';

    if (hasPlan) {
        renderMoneyWaterfall(plan, monthStr);
        renderMoneyEnvelopes(plan, monthStr);
        renderSavingsGoals(plan);
        renderMoneyCategoryBreakdown(monthStr);
        renderMoneyDailyChart();
    }

    renderMoneyStats(); // keeps compat with dashboard
    renderMoneyExpenseList();
    renderMoneyAveragesAndHistory();

    const filterSel = document.getElementById('money-filter-cat');
    const currentFilter = filterSel.value;
    filterSel.innerHTML = '<option value="">All Categories</option>' +
        EXPENSE_CATEGORIES.map(c => `<option value="${c}" ${currentFilter === c ? 'selected' : ''}>${CAT_ICONS[c] || ''} ${c}</option>`).join('');
}

function getMonthExpenses(monthStr) {
    return DB.get('money_expenses', []).filter(e => e.date && e.date.startsWith(monthStr));
}

function renderMoneyWaterfall(plan, monthStr) {
    const cur = getCurrency();
    const expenses = getMonthExpenses(monthStr);

    // How much has been contributed to goals THIS month
    const monthContribs = getGoalContribThisMonth(monthStr);
    const totalGoalContrib = Object.values(monthContribs).reduce((a, v) => a + v, 0);

    // Plan values
    const totalIncome = plan.totalIncome || 0;
    const savingsAmt = plan.savingsAmt || 0;
    const totalAllocated = (plan.envelopes || []).reduce((a, e) => a + e.amount, 0);

    // Goal contributions eat savings first, then overflow into spending
    const goalFromSavings = Math.min(totalGoalContrib, savingsAmt);
    const goalFromSpending = Math.max(totalGoalContrib - goalFromSavings, 0);

    // What's left after goals took their cut
    const savingsLeft = savingsAmt - goalFromSavings;        // remaining savings this month
    const spendingLeft = totalAllocated - goalFromSpending;   // reduced spending envelope

    // Actual expenses logged reduce spending further
    const totalSpent = expenses.reduce((a, e) => a + (e.amount || 0), 0);
    const availableLeft = Math.max(spendingLeft - totalSpent, 0);
    const isOver = totalSpent > spendingLeft;
    const spentPct = spendingLeft > 0 ? Math.min(totalSpent / spendingLeft * 100, 100) : 0;

    // ── Build rows ────────────────────────────────────────────
    // Each row: label, value shown on right, sublabel, color, indent
    const rows = [];

    rows.push({
        label: '💰 Total Income',
        value: `${cur} ${totalIncome.toLocaleString()}`,
        color: 'var(--success)',
        bold: true,
    });

    // Savings row — shows how much is left after goals took from it
    if (savingsAmt > 0) {
        const savingsColor = savingsLeft === 0 ? '#a78bfa' : 'var(--accent)';
        const savingsSub = goalFromSavings > 0
            ? (savingsLeft === 0
                ? `All ${cur} ${savingsAmt.toLocaleString()} used by goals`
                : `${cur} ${goalFromSavings.toLocaleString(undefined, { maximumFractionDigits: 0 })} to goals — ${cur} ${savingsLeft.toLocaleString(undefined, { maximumFractionDigits: 0 })} still banked`)
            : null;
        rows.push({
            label: '💰 Savings Set-Aside',
            value: savingsLeft > 0
                ? `- ${cur} ${savingsLeft.toLocaleString()}`
                : `- ${cur} 0`,
            valueFull: `- ${cur} ${savingsAmt.toLocaleString()}`,
            sub: savingsSub,
            color: savingsColor,
            strikeOriginal: savingsLeft < savingsAmt,
            originalVal: `- ${cur} ${savingsAmt.toLocaleString()}`,
        });
    }

    // Goal overflow row — only if goals exceeded savings
    if (goalFromSpending > 0) {
        rows.push({
            label: '🎯 Goals (from spending)',
            value: `- ${cur} ${goalFromSpending.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
            sub: 'Savings ran out — taken from spending',
            color: '#a78bfa',
        });
    }

    // Spending envelopes row — reduced by goal overflow
    rows.push({
        label: '📦 Spending Envelopes',
        value: goalFromSpending > 0
            ? `- ${cur} ${spendingLeft.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
            : `- ${cur} ${totalAllocated.toLocaleString()}`,
        sub: goalFromSpending > 0 ? `Original ${cur} ${totalAllocated.toLocaleString()} − ${cur} ${goalFromSpending.toLocaleString(undefined, { maximumFractionDigits: 0 })} goals` : null,
        color: 'var(--muted)',
    });

    // Status bar at bottom
    const statusColor = isOver ? 'var(--danger)' : spentPct >= 80 ? 'var(--accent)' : 'var(--success)';

    // ── Render ────────────────────────────────────────────────
    const rowsHTML = rows.map(r => `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;padding:7px 12px;border-radius:8px;margin-bottom:2px;background:${r.bold ? 'rgba(74,222,128,0.05)' : 'transparent'};">
      <div style="min-width:0;">
        <div style="font-size:13px;font-weight:${r.bold ? '600' : '400'};color:${r.bold ? 'var(--text)' : 'var(--muted)'};">${r.label}</div>
        ${r.sub ? `<div style="font-size:11px;color:var(--muted);margin-top:2px;">${r.sub}</div>` : ''}
      </div>
      <div style="text-align:right;flex-shrink:0;margin-left:16px;">
        ${r.strikeOriginal ? `<div style="font-size:11px;color:var(--muted);text-decoration:line-through;">${r.originalVal}</div>` : ''}
        <div style="font-size:${r.bold ? '15px' : '13px'};font-weight:700;color:${r.color};">${r.value}</div>
      </div>
    </div>
  `).join('');

    const statusHTML = `
    <div style="height:1px;background:var(--border);margin:10px 0;"></div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;padding:0 4px;">
      <span style="font-size:12px;color:var(--muted);">
        Spent <strong style="color:var(--text);">${cur} ${totalSpent.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>
        of <strong style="color:var(--text);">${cur} ${spendingLeft.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong> available
      </span>
      <span style="font-size:13px;font-weight:700;color:${statusColor};">
        ${isOver
            ? `🚨 Over by ${cur} ${(totalSpent - spendingLeft).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
            : `${cur} ${availableLeft.toLocaleString(undefined, { maximumFractionDigits: 0 })} left`}
      </span>
    </div>
    <div style="background:var(--surface2);border-radius:6px;height:8px;overflow:hidden;">
      <div style="height:8px;border-radius:6px;width:${spentPct.toFixed(1)}%;background:${statusColor};transition:width 0.4s ease;"></div>
    </div>
  `;

    document.getElementById('money-waterfall').innerHTML = rowsHTML + statusHTML;
}





function renderMoneyEnvelopes(plan, monthStr) {
    const cur = getCurrency();
    const expenses = getMonthExpenses(monthStr);
    const el = document.getElementById('money-envelopes');
    if (!el) return;

    // Canonical key → expense categories mapping (source of truth, never rely on stored plan.cat)
    const ENV_CATS = {
        rent: ['Rent'],
        utilities: ['Utilities'],
        groceries: ['Groceries'],
        transport: ['Transport'],
        insurance: ['Health'],
        loans: ['Loans'],
        otherfixed: ['Bills & Utilities'],
        entertainment: ['Entertainment'],
        dining: ['Food & Drinks'],
        shopping: ['Shopping'],
        personal: ['Personal'],
        education: ['Education'],
        gym: ['Gym & Fitness'],
        buffer: [],
    };

    // Separate fixed from lifestyle
    const fixedEnvs = (plan.envelopes || []).filter(e => e.fixed);
    const lifestyleEnvs = (plan.envelopes || []).filter(e => !e.fixed);

    function envCard(env) {
        const matchCats = ENV_CATS[env.key] || (env.cat ? env.cat.split(',').map(c => c.trim()) : []);
        const spent = matchCats.length
            ? expenses.filter(e => matchCats.includes(e.category)).reduce((a, e) => a + (e.amount || 0), 0)
            : 0;
        const alloc = env.amount;
        const pct = alloc > 0 ? Math.min(spent / alloc * 100, 100) : 0;
        const left = alloc - spent;
        const over = spent > alloc;

        // Status colour
        const barColor = over ? 'var(--danger)' : pct >= 90 ? 'var(--accent)' : env.color;
        const borderColor = over ? 'rgba(248,113,113,0.35)' : (env.fixed && left > 0) ? 'rgba(74,222,128,0.2)' : 'var(--border)';

        return `
      <div style="padding:14px 16px;background:var(--surface2);border-radius:12px;border:1px solid ${borderColor};display:flex;flex-direction:column;gap:10px;">

        <!-- Row 1: icon + label -->
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:20px;line-height:1;flex-shrink:0;">${env.icon}</span>
          <div style="min-width:0;">
            <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${env.label}</div>
            <div style="font-size:10px;color:var(--muted);margin-top:1px;">${env.fixed ? 'Fixed budget' : 'Spending money'}</div>
          </div>
        </div>

        <!-- Row 2: big number + status badge -->
        <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:8px;">
          <div>
            <div style="font-size:11px;color:var(--muted);margin-bottom:2px;">Spent</div>
            <div style="font-size:18px;font-weight:700;font-family:'DM Serif Display',serif;color:${over ? 'var(--danger)' : 'var(--text)'};">${cur} ${spent.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
            <div style="font-size:11px;color:var(--muted);">of ${cur} ${alloc.toLocaleString()}</div>
          </div>
          <div style="text-align:right;flex-shrink:0;">
            ${over
                ? `<div style="font-size:11px;font-weight:700;color:var(--danger);">Over!</div><div style="font-size:13px;font-weight:700;color:var(--danger);">${cur} ${Math.abs(left).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>`
                : `<div style="font-size:11px;color:var(--muted);">${env.fixed ? 'Saved' : 'Left'}</div><div style="font-size:14px;font-weight:700;color:${left > 0 ? (env.fixed ? 'var(--success)' : 'var(--accent)') : 'var(--muted)'};">${cur} ${Math.max(left, 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>`
            }
          </div>
        </div>

        <!-- Row 3: progress bar -->
        <div class="progress-bar" style="height:5px;">
          <div style="height:5px;border-radius:3px;width:${pct.toFixed(1)}%;background:${barColor};transition:width 0.4s ease;"></div>
        </div>

      </div>
    `;
    }

    let html = '';
    if (fixedEnvs.length) {
        html += `<div style="font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;margin-top:4px;">📋 Fixed — Log your actual spend</div>`;
        html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;margin-bottom:20px;">`;
        html += fixedEnvs.map(envCard).join('');
        html += `</div>`;
    }
    if (lifestyleEnvs.length) {
        html += `<div style="font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">✨ Lifestyle — Your spending money</div>`;
        html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;">`;
        html += lifestyleEnvs.map(envCard).join('');
        html += `</div>`;
    }
    el.innerHTML = html;
}



function renderMoneyStats() {
    // Keep dashboard compat — compat elements are hidden but still need values
    const monthStr = getMoneyMonthStr(moneyViewDate);
    const expenses = getMonthExpenses(monthStr);
    const spent = expenses.reduce((a, e) => a + (e.amount || 0), 0);
    const plan = DB.get('money_plan', null);
    const budget = plan ? plan.totalIncome : (DB.get('money_budgets', {})[monthStr] || 0);
    const saved = Math.max(budget - spent, 0);
    const cur = getCurrency();
    // compat hidden spans
    const sm = document.getElementById('money-spent-month');
    const bl = document.getElementById('money-budget-label');
    const sv = document.getElementById('money-saved-month');
    if (sm) sm.textContent = `${cur} ${spent.toFixed(2)}`;
    if (bl) bl.textContent = budget ? `of ${cur} ${budget.toFixed(2)} budget` : 'No budget set';
    if (sv) sv.textContent = `${cur} ${saved.toFixed(2)}`;
    // Update budget input hidden value for compat
    const bi = document.getElementById('money-budget-input');
    if (bi) bi.value = budget || '';
}

function saveBudget() { /* no-op — plan sets the budget now */ }

// ============================================================
// SAVINGS GOALS
// ============================================================

let editingSavingsGoalId = null;
function getSavingsGoals() { return DB.get('savings_goals', []); }
function setSavingsGoals(g) { DB.set('savings_goals', g); }

function openSavingsGoalModal(id = null) {
    editingSavingsGoalId = id;
    if (id) {
        const g = getSavingsGoals().find(x => x.id === id);
        if (!g) return;
        document.getElementById('savings-goal-modal-title').textContent = 'Edit Savings Goal';
        document.getElementById('sg-name').value = g.name || '';
        document.getElementById('sg-target').value = g.target || '';
        document.getElementById('sg-saved').value = g.saved || '';
        document.getElementById('sg-monthly').value = g.monthly || '';
        document.getElementById('sg-date').value = g.date || '';
        document.getElementById('sg-emoji').value = g.emoji || '';
        document.getElementById('sg-delete-btn').style.display = 'inline-flex';
    } else {
        document.getElementById('savings-goal-modal-title').textContent = 'Add Savings Goal';
        ['sg-name', 'sg-saved', 'sg-monthly', 'sg-date', 'sg-emoji'].forEach(id => { document.getElementById(id).value = ''; });
        document.getElementById('sg-target').value = '';
        document.getElementById('sg-delete-btn').style.display = 'none';
    }
    openModal('modal-savings-goal');
}

function saveSavingsGoal() {
    const name = document.getElementById('sg-name').value.trim();
    const target = parseFloat(document.getElementById('sg-target').value);
    if (!name) { showToast('Please enter a goal name.'); return; }
    if (!target || target <= 0) { showToast('Please enter a target amount.'); return; }
    const goals = getSavingsGoals();
    const data = {
        name, target,
        saved: parseFloat(document.getElementById('sg-saved').value) || 0,
        monthly: parseFloat(document.getElementById('sg-monthly').value) || 0,
        date: document.getElementById('sg-date').value || null,
        emoji: document.getElementById('sg-emoji').value.trim() || '🎯',
        updatedAt: new Date().toISOString(),
    };
    if (editingSavingsGoalId) {
        const idx = goals.findIndex(g => g.id === editingSavingsGoalId);
        if (idx >= 0) goals[idx] = { ...goals[idx], ...data };
    } else {
        goals.push({ id: genId(), createdAt: new Date().toISOString(), ...data });
    }
    setSavingsGoals(goals);
    closeModal('modal-savings-goal');
    renderMoneyPage();
    showToast(editingSavingsGoalId ? 'Goal updated! 🎯' : 'Goal added! 🎉');
}

async function deleteSavingsGoal() {
    if (!editingSavingsGoalId) return;
    if (!await showConfirm('Delete this savings goal?', 'Delete', true)) return;
    setSavingsGoals(getSavingsGoals().filter(g => g.id !== editingSavingsGoalId));
    closeModal('modal-savings-goal');
    renderMoneyPage();
    showToast('Goal deleted.');
}

// goal_contributions: { 'YYYY-MM': { goalId: amount, ... }, ... }
function getGoalContributions() { return DB.get('goal_contributions', {}); }
function setGoalContributions(c) { DB.set('goal_contributions', c); }

function getGoalContribThisMonth(monthStr) {
    const all = getGoalContributions();
    return all[monthStr] || {};
}

function getTotalGoalContribThisMonth(monthStr) {
    const byGoal = getGoalContribThisMonth(monthStr);
    return Object.values(byGoal).reduce((a, v) => a + v, 0);
}

function addToSavingsGoal(id, amount) {
    const goals = getSavingsGoals();
    const g = goals.find(x => x.id === id);
    if (!g) return;

    const monthStr = getMoneyMonthStr(moneyViewDate);
    const plan = DB.get('money_plan', null);
    const savingsAmt = plan ? (plan.savingsAmt || 0) : 0;

    // How much of savings set-aside has already been used by goals this month
    const allContribs = getGoalContributions();
    const monthContribs = allContribs[monthStr] || {};
    const alreadyFromSavings = Object.values(monthContribs).reduce((a, v) => a + v, 0);

    // How much savings headroom is left
    const savingsLeft = Math.max(savingsAmt - alreadyFromSavings, 0);
    const fromSavings = Math.min(amount, savingsLeft);
    const fromSpending = amount - fromSavings;

    // Store contribution
    monthContribs[id] = (monthContribs[id] || 0) + amount;
    allContribs[monthStr] = monthContribs;
    setGoalContributions(allContribs);

    // Update total saved on goal
    g.saved = Math.min((g.saved || 0) + amount, g.target);
    g.updatedAt = new Date().toISOString();
    setSavingsGoals(goals);

    renderMoneyPage();
    const cur = getCurrency();
    let msg = `+${cur} ${amount} saved for "${esc(g.name)}" 💪`;
    if (fromSpending > 0 && fromSavings > 0) msg += ` (${cur} ${fromSavings.toFixed(0)} from savings, ${cur} ${fromSpending.toFixed(0)} from spending)`;
    else if (fromSpending > 0) msg += ` — taken from spending budget`;
    showToast(msg);
}

function promptAddToGoal(id) {
    const g = getSavingsGoals().find(x => x.id === id);
    if (!g) return;
    const amt = prompt(`How much are you adding to "${esc(g.name)}"? (${getCurrency()})`);
    const n = parseFloat(amt);
    if (!n || n <= 0) return;
    addToSavingsGoal(id, n);
}

function withdrawFromGoal(id) {
    const g = getSavingsGoals().find(x => x.id === id);
    if (!g) return;
    const cur = getCurrency();
    const maxWithdraw = g.saved || 0;
    if (maxWithdraw <= 0) { showToast('Nothing saved yet to withdraw.'); return; }
    const amt = prompt(`How much to take back from "${esc(g.name)}"? (max ${cur} ${maxWithdraw.toLocaleString()})`);
    const n = parseFloat(amt);
    if (!n || n <= 0) return;
    const actual = Math.min(n, maxWithdraw);

    // Update goal saved amount
    const goals = getSavingsGoals();
    const gRef = goals.find(x => x.id === id);
    if (!gRef) return;
    gRef.saved = Math.max((gRef.saved || 0) - actual, 0);
    gRef.updatedAt = new Date().toISOString();
    setSavingsGoals(goals);

    // Reverse the contribution record for this month so waterfall restores correctly
    const monthStr = getMoneyMonthStr(moneyViewDate);
    const allContribs = getGoalContributions();
    const monthContribs = allContribs[monthStr] || {};
    const existingContrib = monthContribs[id] || 0;
    // Reduce this month's contribution by up to the actual withdrawn amount
    const reduceBy = Math.min(actual, existingContrib);
    if (reduceBy > 0) {
        monthContribs[id] = existingContrib - reduceBy;
        if (monthContribs[id] <= 0) delete monthContribs[id];
        allContribs[monthStr] = monthContribs;
        setGoalContributions(allContribs);
    }

    renderMoneyPage();
    showToast(`${cur} ${actual.toLocaleString(undefined, { maximumFractionDigits: 0 })} returned from "${gRef.name}" 💸`);
}

function renderSavingsGoals(plan) {
    const goals = getSavingsGoals();
    const cur = getCurrency();
    const el = document.getElementById('savings-goals-list');
    if (!el) return;

    // Total monthly contribution from goals
    const totalMonthly = goals.reduce((a, g) => a + (g.monthly || 0), 0);
    const sub = document.getElementById('money-goals-sub');
    if (sub && plan && totalMonthly > 0) {
        sub.textContent = `${cur} ${totalMonthly.toLocaleString()} deducted from your monthly income`;
    } else if (sub) {
        sub.textContent = 'Deducted from your monthly income';
    }

    if (!goals.length) {
        el.innerHTML = '<div style="color:var(--muted);font-size:13px;text-align:center;padding:16px 0;">No savings goals yet. Add something you\'re saving for!</div>';
        return;
    }

    const monthStr = getMoneyMonthStr(moneyViewDate);
    const planData = DB.get('money_plan', null) || plan;
    const savingsAmt = planData ? (planData.savingsAmt || 0) : 0;
    const monthContribs = getGoalContribThisMonth(monthStr);
    const totalContribsThisMonth = Object.values(monthContribs).reduce((a, v) => a + v, 0);
    // Savings remaining after all goal contributions
    const savingsUsed = Math.min(totalContribsThisMonth, savingsAmt);
    const savingsLeftGlobal = Math.max(savingsAmt - savingsUsed, 0);

    el.innerHTML = goals.map(g => {
        const pct = g.target > 0 ? Math.min((g.saved || 0) / g.target * 100, 100) : 0;
        const remaining = Math.max(g.target - (g.saved || 0), 0);
        const contribThisMonth = monthContribs[g.id] || 0;

        let timeLabel = '';
        if (g.monthly > 0 && remaining > 0) {
            const months = Math.ceil(remaining / g.monthly);
            timeLabel = `~${months} month${months !== 1 ? 's' : ''} to go`;
        } else if (g.date) {
            const daysLeft = Math.ceil((new Date(g.date) - new Date()) / 86400000);
            timeLabel = daysLeft > 0 ? `${daysLeft} days left` : `<span style="color:var(--danger);">Deadline passed</span>`;
        }
        const done = pct >= 100;

        // Work out where this goal's contribution came from
        let sourceTag = '';
        if (contribThisMonth > 0) {
            // Rough per-goal source: contributions are taken from savings first globally
            // We show a tag indicating the source
            const fromSav = Math.min(contribThisMonth, savingsAmt);
            const fromSpend = contribThisMonth - fromSav;
            if (fromSpend > 0 && fromSav > 0) {
                sourceTag = `<span style="font-size:10px;padding:2px 7px;border-radius:10px;background:rgba(167,139,250,0.15);color:#a78bfa;margin-left:4px;">💰+💸 ${cur} ${contribThisMonth.toLocaleString(undefined, { maximumFractionDigits: 0 })} this month</span>`;
            } else if (fromSpend > 0) {
                sourceTag = `<span style="font-size:10px;padding:2px 7px;border-radius:10px;background:rgba(248,113,113,0.15);color:var(--danger);margin-left:4px;">💸 ${cur} ${contribThisMonth.toLocaleString(undefined, { maximumFractionDigits: 0 })} from spending</span>`;
            } else {
                sourceTag = `<span style="font-size:10px;padding:2px 7px;border-radius:10px;background:rgba(200,169,110,0.15);color:var(--accent);margin-left:4px;">💰 ${cur} ${contribThisMonth.toLocaleString(undefined, { maximumFractionDigits: 0 })} from savings</span>`;
            }
        }

        return `
      <div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border);">
        <span style="font-size:24px;flex-shrink:0;">${g.emoji || '🎯'}</span>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px;margin-bottom:4px;">
            <div style="font-size:14px;font-weight:600;">${esc(g.name)}</div>
            ${sourceTag}
          </div>
          <div class="progress-bar" style="margin-bottom:5px;">
            <div class="progress-fill ${done ? 'green' : ''}" style="width:${pct.toFixed(1)}%;${done ? 'background:var(--success);' : ''}"></div>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:4px;">
            <div style="font-size:12px;color:var(--muted);">
              ${done ? '🎉 Goal Reached!' : `${cur} ${(g.saved || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} / ${cur} ${g.target.toLocaleString()} · ${timeLabel || Math.round(pct) + '% saved'}`}
            </div>
            <div style="display:flex;gap:6px;align-items:center;">
              ${done ? '' : ` <button class="btn btn-secondary" style="font-size:11px;padding:3px 10px;" onclick="promptAddToGoal('${g.id}')">+ Add</button>
              <button class="btn btn-ghost" style="font-size:11px;padding:3px 10px;color:var(--danger);" onclick="withdrawFromGoal('${g.id}')">− Withdraw</button>`}
              ${g.monthly ? `<span style="font-size:11px;color:var(--accent);padding:2px 7px;background:rgba(200,169,110,0.1);border-radius:6px;">${cur} ${g.monthly}/mo</span>` : ''}
              <button class="btn btn-ghost" style="font-size:11px;padding:3px 8px;" onclick="openSavingsGoalModal('${g.id}')">Edit</button>
            </div>
          </div>
        </div>
      </div>
    `;
    }).join('');
}

function renderMoneyCategoryBreakdown(monthStr) {
    if (!monthStr) monthStr = getMoneyMonthStr(moneyViewDate);
    const expenses = getMonthExpenses(monthStr);
    const total = expenses.reduce((a, e) => a + (e.amount || 0), 0);
    const bycat = {};
    expenses.forEach(e => { bycat[e.category] = (bycat[e.category] || 0) + (e.amount || 0); });
    const sorted = Object.entries(bycat).sort((a, b) => b[1] - a[1]);
    const el = document.getElementById('money-category-breakdown');
    if (!el) return;
    if (!sorted.length) {
        el.innerHTML = '<div style="color:var(--muted);font-size:13px;">No expenses this month</div>';
        return;
    }
    el.innerHTML = sorted.map(([cat, amt]) => {
        const pct = total > 0 ? (amt / total * 100).toFixed(0) : 0;
        return `
      <div style="margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <span style="font-size:13px;">${CAT_ICONS[cat] || ''} ${esc(cat)}</span>
          <span style="font-size:13px;font-weight:600;">${getCurrency()} ${amt.toFixed(2)} <span style="color:var(--muted);font-weight:400;">(${pct}%)</span></span>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:var(--accent2);"></div></div>
      </div>`;
    }).join('');
}




// ============================================================
// TASK DEADLINE TOGGLE
// ============================================================
function toggleTaskDeadline() {
    const hasDeadline = document.getElementById('task-has-deadline').checked;
    const deadlineInput = document.getElementById('task-deadline-input');
    deadlineInput.style.display = hasDeadline ? 'block' : 'none';
    deadlineInput.style.opacity = hasDeadline ? '1' : '0.4';
    if (!hasDeadline) deadlineInput.value = '';
}

// ============================================================
// MONEY AVERAGES + MONTHLY HISTORY
// ============================================================
function renderMoneyAveragesAndHistory() {
    const cur = getCurrency();
    const allExpenses = DB.get('money_expenses', []);

    // Get all months with data
    const monthsMap = {};
    allExpenses.forEach(e => {
        if (!e.date) return;
        const ms = e.date.slice(0, 7);
        monthsMap[ms] = (monthsMap[ms] || 0) + (e.amount || 0);
    });
    const sortedMonths = Object.keys(monthsMap).sort();

    // Avg per day for current month
    const currentMonthStr = getMoneyMonthStr(moneyViewDate);
    const currentMonthExpenses = allExpenses.filter(e => e.date && e.date.startsWith(currentMonthStr));
    const currentTotal = currentMonthExpenses.reduce((a, e) => a + (e.amount || 0), 0);
    const today = new Date();
    const isCurrentMonth = (today.getFullYear() === moneyViewDate.getFullYear() && today.getMonth() === moneyViewDate.getMonth());
    const daysElapsed = isCurrentMonth ? today.getDate() : new Date(moneyViewDate.getFullYear(), moneyViewDate.getMonth() + 1, 0).getDate();
    const avgDay = daysElapsed > 0 ? currentTotal / daysElapsed : 0;
    const weeksElapsed = Math.max(daysElapsed / 7, 1);
    const avgWeek = currentTotal / weeksElapsed;

    // Avg per month (last 3 months of data)
    const last3 = sortedMonths.slice(-3);
    const avgMonth = last3.length > 0 ? last3.reduce((a, ms) => a + (monthsMap[ms] || 0), 0) / last3.length : 0;

    const avgDayEl = document.getElementById('money-avg-day');
    const avgWeekEl = document.getElementById('money-avg-week');
    const avgMonthEl = document.getElementById('money-avg-month');
    if (avgDayEl) avgDayEl.textContent = `${cur} ${avgDay.toFixed(0)}`;
    if (avgWeekEl) avgWeekEl.textContent = `${cur} ${avgWeek.toFixed(0)}`;
    if (avgMonthEl) avgMonthEl.textContent = `${cur} ${avgMonth.toFixed(0)}`;

    // Monthly history table
    const histEl = document.getElementById('money-monthly-history');
    if (!histEl) return;
    if (!sortedMonths.length) {
        histEl.innerHTML = '<div style="color:var(--muted);font-size:13px;">No expense history yet.</div>';
        return;
    }
    const maxAmt = Math.max(...Object.values(monthsMap), 1);
    histEl.innerHTML = sortedMonths.slice().reverse().map(ms => {
        const amt = monthsMap[ms] || 0;
        const pct = (amt / maxAmt * 100).toFixed(1);
        const d = new Date(ms + '-01T00:00:00');
        const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        const isCurrent = ms === currentMonthStr;
        return `
      <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);">
        <div style="min-width:120px;font-size:13px;font-weight:${isCurrent ? '700' : '400'};color:${isCurrent ? 'var(--accent)' : 'var(--text)'};">${label}${isCurrent ? ' ✦' : ''}</div>
        <div style="flex:1;">
          <div style="height:6px;background:var(--surface2);border-radius:3px;overflow:hidden;">
            <div style="height:6px;width:${pct}%;background:${isCurrent ? 'var(--accent)' : 'var(--accent2)'};border-radius:3px;transition:width 0.4s;"></div>
          </div>
        </div>
        <div style="min-width:90px;text-align:right;font-size:13px;font-weight:600;">${cur} ${amt.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
      </div>`;
    }).join('');
}

// ============================================================
// ROUTINE SYSTEM
// ============================================================
function getRoutines() { return DB.get('routines', []); }
function setRoutines(v) { DB.set('routines', v); }

let editingRoutineId = null;
let routineSteps = [];

const ROUTINE_DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function openRoutineModal(id) {
    editingRoutineId = id || null;
    routineSteps = [];
    document.getElementById('routine-modal-title').textContent = id ? 'Edit Routine' : 'New Routine';
    document.getElementById('routine-delete-btn').style.display = id ? 'inline-flex' : 'none';
    document.getElementById('routine-name-input').value = '';

    document.querySelectorAll('.routine-day-pill').forEach(el => {
        el.style.background = 'var(--surface2)';
        el.style.color = 'var(--muted)';
        el.style.borderColor = 'var(--border)';
    });

    if (id) {
        const r = getRoutines().find(x => x.id === id);
        if (r) {
            document.getElementById('routine-name-input').value = r.name || '';
            routineSteps = (r.steps || []).map(s => ({
                ...s,
                subs: (s.subs || []).map(sub => ({ ...sub }))
            }));
            (r.days || []).forEach(dayIdx => {
                const pill = document.querySelector(`.routine-day-pill[data-day="${dayIdx}"]`);
                if (pill) {
                    pill.style.background = 'rgba(124,110,240,0.2)';
                    pill.style.color = 'var(--accent2)';
                    pill.style.borderColor = 'var(--accent2)';
                }
            });
        }
    }
    renderRoutineStepsEditor();
    openModal('modal-routine');
}

function toggleRoutineDay(el) {
    const active = el.style.background.includes('rgba(124');
    if (active) {
        el.style.background = 'var(--surface2)';
        el.style.color = 'var(--muted)';
        el.style.borderColor = 'var(--border)';
    } else {
        el.style.background = 'rgba(124,110,240,0.2)';
        el.style.color = 'var(--accent2)';
        el.style.borderColor = 'var(--accent2)';
    }
}

function addRoutineStep() {
    routineSteps.push({ id: genId(), text: '', timeFrom: '', timeTo: '', subs: [] });
    renderRoutineStepsEditor();
}

function removeRoutineStep(sid) {
    routineSteps = routineSteps.filter(s => s.id !== sid);
    renderRoutineStepsEditor();
}

function addRoutineSub(stepId) {
    const step = routineSteps.find(s => s.id === stepId);
    if (step) {
        if (!step.subs) step.subs = [];
        step.subs.push({ id: genId(), text: '', timeFrom: '', timeTo: '' });
        renderRoutineStepsEditor();
    }
}

function removeRoutineSub(stepId, subId) {
    const step = routineSteps.find(s => s.id === stepId);
    if (step) {
        step.subs = (step.subs || []).filter(sub => sub.id !== subId);
        renderRoutineStepsEditor();
    }
}

function renderRoutineStepsEditor() {
    const el = document.getElementById('routine-steps-list');
    if (!el) return;
    if (!routineSteps.length) {
        el.innerHTML = '<div style="font-size:12px;color:var(--muted);font-style:italic;padding:8px 0;">No blocks yet — click + Add Block</div>';
        return;
    }
    el.innerHTML = routineSteps.map((s, i) => {
        const subsHtml = (s.subs || []).map((sub, si) =>
            `<div style="display:grid;grid-template-columns:78px 78px 1fr auto;gap:5px;align-items:center;margin-top:5px;padding:6px 8px;background:var(--bg);border-radius:6px;border:1px solid var(--border);">` +
            `<input type="time" class="input" value="${sub.timeFrom || ''}" style="font-size:11px;padding:4px 5px;" oninput="routineSteps[${i}].subs[${si}].timeFrom=this.value">` +
            `<input type="time" class="input" value="${sub.timeTo || ''}" style="font-size:11px;padding:4px 5px;" oninput="routineSteps[${i}].subs[${si}].timeTo=this.value">` +
            `<input type="text" class="input" value="${esc(sub.text)}" placeholder="Sub-activity…" style="font-size:12px;" oninput="routineSteps[${i}].subs[${si}].text=this.value" maxlength="200">` +
            `<button class="btn btn-ghost" onclick="removeRoutineSub('${s.id}','${sub.id}')" style="font-size:12px;padding:2px 5px;color:var(--danger);">✕</button>` +
            `</div>`
        ).join('');

        return (
            `<div style="background:var(--surface2);border-radius:10px;padding:10px;border:1px solid var(--border);">` +
            `<div style="display:grid;grid-template-columns:78px 78px 1fr auto auto;gap:6px;align-items:center;">` +
            `<input type="time" class="input" value="${s.timeFrom || ''}" style="font-size:12px;padding:6px 8px;" oninput="routineSteps[${i}].timeFrom=this.value">` +
            `<input type="time" class="input" value="${s.timeTo || ''}" style="font-size:12px;padding:6px 8px;" oninput="routineSteps[${i}].timeTo=this.value">` +
            `<input type="text" class="input" value="${esc(s.text)}" placeholder="e.g. Wake Up, Study, Gym…" style="font-size:13px;font-weight:600;" oninput="routineSteps[${i}].text=this.value" maxlength="200">` +
            `<button class="btn btn-ghost" onclick="addRoutineSub('${s.id}')" style="font-size:11px;padding:3px 7px;border:1px solid var(--border);color:var(--accent2);white-space:nowrap;">+ Sub</button>` +
            `<button class="btn btn-ghost" onclick="removeRoutineStep('${s.id}')" style="font-size:13px;padding:2px 6px;color:var(--danger);">✕</button>` +
            `</div>` +
            (subsHtml ? `<div style="padding-left:4px;">${subsHtml}</div>` : '') +
            `</div>`
        );
    }).join('');
}

function saveRoutine() {
    const name = document.getElementById('routine-name-input').value.trim();
    if (!name) return showToast('Please enter a routine name.');

    const days = [];
    document.querySelectorAll('.routine-day-pill').forEach(el => {
        if (el.style.background.includes('rgba(124')) days.push(parseInt(el.dataset.day));
    });

    const routine = {
        id: editingRoutineId || genId(),
        name,
        days,
        steps: routineSteps.filter(s => s.text.trim()).map(s => ({
            ...s,
            subs: (s.subs || []).filter(sub => sub.text.trim())
        })),
        createdAt: editingRoutineId
            ? (getRoutines().find(r => r.id === editingRoutineId) || {}).createdAt || new Date().toISOString()
            : new Date().toISOString(),
    };

    const routines = getRoutines();
    if (editingRoutineId) {
        const idx = routines.findIndex(r => r.id === editingRoutineId);
        if (idx >= 0) routines[idx] = routine;
    } else {
        routines.push(routine);
    }
    setRoutines(routines);
    closeModal('modal-routine');
    renderRoutinePage();
    showToast(editingRoutineId ? 'Routine updated!' : 'Routine created! 🔁');
}

async function deleteRoutine() {
    if (!editingRoutineId) return;
    if (!await showConfirm('Delete this routine?', 'Delete', true)) return;
    setRoutines(getRoutines().filter(r => r.id !== editingRoutineId));
    closeModal('modal-routine');
    renderRoutinePage();
    showToast('Routine deleted.');
}

function fmt12(t) {
    if (!t) return '';
    const parts = t.split(':');
    let h = parseInt(parts[0]), m = parseInt(parts[1]);
    const ampm = h >= 12 ? 'pm' : 'am';
    if (h > 12) h -= 12;
    if (h === 0) h = 12;
    return m === 0 ? `${h}${ampm}` : `${h}:${parts[1]}${ampm}`;
}

function fmtRange(from, to) {
    if (!from && !to) return '';
    if (from && to) return `${fmt12(from)} – ${fmt12(to)}`;
    return fmt12(from || to);
}

function parseMinutes(t) {
    if (!t) return null;
    const p = t.split(':').map(Number);
    return p[0] * 60 + p[1];
}

function renderRoutinePage() {
    const routines = getRoutines();
    const todayDow = new Date().getDay();
    const todayIdx = todayDow === 0 ? 6 : todayDow - 1;

    const bannerEl = document.getElementById('routine-today-banner');
    if (bannerEl) bannerEl.innerHTML = '';

    const listEl = document.getElementById('routine-profiles-list');
    if (!listEl) return;

    if (!routines.length) {
        listEl.innerHTML = `<div style="text-align:center;padding:60px 20px;color:var(--muted);"><div style="font-size:40px;margin-bottom:12px;opacity:0.4;">🔁</div><div style="font-size:15px;font-weight:600;margin-bottom:6px;">No routines yet</div><div style="font-size:13px;opacity:0.7;">Create your first routine to build better habits</div></div>`;
        return;
    }

    const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    // Each routine gets its own profile card with its own table
    const profileCards = routines.map(r => {
        const activeDays = (r.days && r.days.length) ? r.days : [0, 1, 2, 3, 4, 5, 6];
        const dayLabels = activeDays.map(i => DAYS[i]).join(', ');
        const steps = (r.steps || []).filter(s => s.text.trim())
            .sort((a, b) => (parseMinutes(a.timeFrom) ?? 9999) - (parseMinutes(b.timeFrom) ?? 9999));

        // Left column = time range, day columns = activity text
        const thCols = DAYS.map((d, di) => {
            const isT = di === todayIdx;
            const isActive = activeDays.includes(di);
            const dot = isT ? '<span style="display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--accent);vertical-align:middle;margin-left:3px;margin-bottom:1px;"></span>' : '';
            return `<th style="padding:10px 10px;text-align:center;font-size:11px;font-weight:700;letter-spacing:0.05em;width:12%;border-left:1px solid var(--border);${isT ? 'color:var(--accent);background:rgba(200,169,110,0.07);' : isActive ? 'color:var(--text);' : 'color:var(--muted);opacity:0.4;'}">${d}${dot}</th>`;
        }).join('');

        const trows = steps.map(s => {
            const timeRange = fmtRange(s.timeFrom, s.timeTo);
            const subs = (s.subs || []).filter(sub => sub.text.trim())
                .sort((a, b) => (parseMinutes(a.timeFrom) ?? 9999) - (parseMinutes(b.timeFrom) ?? 9999));

            // Left cell: parent time + indented sub-times
            const subTimesHtml = subs.map(sub => {
                const subRange = fmtRange(sub.timeFrom, sub.timeTo);
                return `<div style="margin-top:4px;padding-left:14px;display:flex;align-items:center;gap:5px;">` +
                    `<span style="display:inline-block;width:6px;height:1px;background:var(--muted);flex-shrink:0;margin-top:1px;opacity:0.5;"></span>` +
                    `<div style="font-size:10px;color:var(--muted);">${subRange || esc(sub.text)}</div>` +
                    `</div>`;
            }).join('');

            const leftCell =
                `<td style="padding:12px 14px;vertical-align:top;white-space:nowrap;width:130px;min-width:130px;border-right:1px solid var(--border);">` +
                (timeRange
                    ? `<div style="font-size:11px;font-weight:700;color:var(--accent);">${timeRange}</div>`
                    : `<div style="font-size:11px;color:var(--muted);font-style:italic;">—</div>`) +
                subTimesHtml +
                `</td>`;

            // Day cells: parent activity text + indented sub-activity names
            const dayCells = DAYS.map((d, di) => {
                const isT = di === todayIdx;
                const isActive = activeDays.includes(di);
                const bg = isT ? 'background:rgba(200,169,110,0.04);' : '';
                const border = 'border-left:1px solid var(--border);';
                if (!isActive) {
                    return `<td style="padding:12px 10px;text-align:center;vertical-align:middle;width:12%;${border}${bg}"><span style="color:var(--border);font-size:13px;">—</span></td>`;
                }
                const subActivitiesHtml = subs.map(sub => {
                    return `<div style="margin-top:4px;padding-left:14px;display:flex;align-items:flex-start;gap:5px;">` +
                        `<span style="display:inline-block;width:6px;height:1px;background:var(--muted);flex-shrink:0;margin-top:7px;opacity:0.5;"></span>` +
                        `<div style="font-size:11px;color:var(--muted);word-break:break-word;line-height:1.4;">${esc(sub.text)}</div>` +
                        `</div>`;
                }).join('');
                return `<td style="padding:10px 10px;vertical-align:top;width:12%;${border}${bg}">` +
                    `<div style="font-size:13px;font-weight:600;color:var(--text);word-break:break-word;line-height:1.4;">${esc(s.text)}</div>` +
                    subActivitiesHtml +
                    `</td>`;
            }).join('');

            return `<tr style="border-bottom:1px solid var(--border);">${leftCell}${dayCells}</tr>`;
        }).join('');

        const tableHtml = steps.length
            ? `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;table-layout:fixed;"><thead><tr style="border-bottom:2px solid var(--border);"><th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:var(--muted);letter-spacing:0.05em;white-space:nowrap;width:130px;border-right:1px solid var(--border);">TIME</th>${thCols}</tr></thead><tbody>${trows}</tbody></table></div>`
            : `<div style="font-size:12px;color:var(--muted);font-style:italic;padding:16px 20px;">No schedule blocks — click Edit to add some.</div>`;

        return (
            `<div class="card" style="margin-bottom:20px;padding:0;overflow:hidden;">` +
            `<div style="padding:14px 18px 12px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">` +
            `<div>` +
            `<div style="font-size:15px;font-weight:700;">${esc(r.name)}</div>` +
            `<div style="font-size:12px;color:var(--muted);margin-top:2px;">${dayLabels || 'Every day'}</div>` +
            `</div>` +
            `<button class="btn btn-ghost" onclick="openRoutineModal('${r.id}')" style="font-size:12px;padding:5px 12px;border:1px solid var(--border);">Edit</button>` +
            `</div>` +
            tableHtml +
            `</div>`
        );
    }).join('');

    listEl.innerHTML = profileCards;
}

// ============================================================
// ROADMAP, CRM, KPI AND CONTENT HUB
// ============================================================
// Embedded from roadmap_days.json so the tracker also works when opened offline.
const ROADMAP_DAYS = {"1":{"day":1,"date":"Sep 22","bd":"Audit GitHub (irfanzahoor): list repos to clean, archive or delete.","tech":"Study DocTypes fundamentals in the Frappe framework docs — take structured notes.","content":"Study scripting: read/watch one solid resource and take notes.","islamic":"Study routine: 15–20 min from an authentic source (Qur'an tafsir or a recognized Hadith collection).","asset":"Research digital asset formats relevant to ERPNext consulting (checklists, templates, mini-courses)."},"2":{"day":2,"date":"Sep 23","bd":"Rewrite GitHub profile README + pin best repos around ERPNext Customization & Integration Specialist positioning.","tech":"Build one small, working example using DocTypes in a test/dev site.","content":"Study hooks: read/watch one solid resource and take notes.","islamic":"Source verification practice: check the narrator chain / cross-reference the translation used for today's topic.","asset":"Research digital asset formats relevant to ERPNext consulting (checklists, templates, mini-courses)."},"3":{"day":3,"date":"Sep 24","bd":"Draft LinkedIn headline + About section around the same positioning.","tech":"Document the DocTypes example (screenshot + short write-up) as portfolio/GitHub proof.","content":"Study storytelling structure: read/watch one solid resource and take notes.","islamic":"Write short personal notes summarizing today's lesson — start of your Islamic content idea log.","asset":"Research digital asset formats relevant to ERPNext consulting (checklists, templates, mini-courses)."},"4":{"day":4,"date":"Sep 25","bd":"List every past ERPNext project as raw case-study material (client type, problem, what you built).","tech":"Study Client Scripts fundamentals in the Frappe framework docs — take structured notes.","content":"Study TTS/voice-over tools: read/watch one solid resource and take notes.","islamic":"Study routine: 15–20 min from an authentic source (Qur'an tafsir or a recognized Hadith collection).","asset":"Research digital asset formats relevant to ERPNext consulting (checklists, templates, mini-courses)."},"5":{"day":5,"date":"Sep 26","bd":"Pick the strongest past project; outline it as Case Study #1 (problem → approach → result).","tech":"Build one small, working example using Client Scripts in a test/dev site.","content":"Study basic video editing: read/watch one solid resource and take notes.","islamic":"Source verification practice: check the narrator chain / cross-reference the translation used for today's topic.","asset":"Research digital asset formats relevant to ERPNext consulting (checklists, templates, mini-courses)."},"6":{"day":6,"date":"Sep 27","bd":"Define the pharmacy / SME retail-wholesale niche: list 10 target business types you can credibly serve.","tech":"Document the Client Scripts example (screenshot + short write-up) as portfolio/GitHub proof.","content":"Study thumbnail design: read/watch one solid resource and take notes.","islamic":"Write short personal notes summarizing today's lesson — start of your Islamic content idea log.","asset":"Research digital asset formats relevant to ERPNext consulting (checklists, templates, mini-courses)."},"7":{"day":7,"date":"Sep 28","bd":"Week review: finalize a one-line positioning statement combining niche + specialization.","tech":"Study Server-side Python (Controllers) fundamentals in the Frappe framework docs — take structured notes.","content":"Study title writing: read/watch one solid resource and take notes.","islamic":"Study routine: 15–20 min from an authentic source (Qur'an tafsir or a recognized Hadith collection).","asset":"Research digital asset formats relevant to ERPNext consulting (checklists, templates, mini-courses)."},"8":{"day":8,"date":"Sep 29","bd":"Draft Offer 1 — ERPNext Health Check & Quick-Win Report: scope, what's included, what client receives.","tech":"Build one small, working example using Server-side Python (Controllers) in a test/dev site.","content":"Study retention techniques: read/watch one solid resource and take notes.","islamic":"Source verification practice: check the narrator chain / cross-reference the translation used for today's topic.","asset":"Research digital asset formats relevant to ERPNext consulting (checklists, templates, mini-courses)."},"9":{"day":9,"date":"Sep 30","bd":"Draft Offer 2 — ERPNext Customization & Workflow Build: scope and typical inclusions.","tech":"Document the Server-side Python (Controllers) example (screenshot + short write-up) as portfolio/GitHub proof.","content":"Study building a content idea database: read/watch one solid resource and take notes.","islamic":"Write short personal notes summarizing today's lesson — start of your Islamic content idea log.","asset":"Research digital asset formats relevant to ERPNext consulting (checklists, templates, mini-courses)."},"10":{"day":10,"date":"Oct 01","bd":"Draft Offer 3 — ERPNext Care Plan: scope and retainer structure (support/maintenance cadence).","tech":"Study Workflows fundamentals in the Frappe framework docs — take structured notes.","content":"Practice scripting with a real draft (not theory only).","islamic":"Study routine: 15–20 min from an authentic source (Qur'an tafsir or a recognized Hadith collection).","asset":"Research digital asset formats relevant to ERPNext consulting (checklists, templates, mini-courses)."},"11":{"day":11,"date":"Oct 02","bd":"Draft 1-page portfolio: positioning + 3 offers + Case Study #1 in one layout.","tech":"Build one small, working example using Workflows in a test/dev site.","content":"Practice hooks with a real draft (not theory only).","islamic":"Source verification practice: check the narrator chain / cross-reference the translation used for today's topic.","asset":"Identify one realistic first asset (e.g. ERPNext Health Check template, discovery questionnaire) and outline it."},"12":{"day":12,"date":"Oct 03","bd":"Design pass on the 1-page portfolio (visual formatting, not just text).","tech":"Document the Workflows example (screenshot + short write-up) as portfolio/GitHub proof.","content":"Practice storytelling structure with a real draft (not theory only).","islamic":"Write short personal notes summarizing today's lesson — start of your Islamic content idea log.","asset":"Identify one realistic first asset (e.g. ERPNext Health Check template, discovery questionnaire) and outline it."},"13":{"day":13,"date":"Oct 04","bd":"Share portfolio draft with one trusted contact for feedback; note changes needed.","tech":"Study Permissions fundamentals in the Frappe framework docs — take structured notes.","content":"Practice TTS/voice-over Study tools with a real draft (not m theory only). s a c","islamic":"routine: 15–20 in from an authentic ource (Qur'an tafsir or recognized Hadith ollection).","asset":"Identify one realistic first asset (e.g. ERPNext Health Check template, discovery questionnaire) and outline it."},"14":{"day":14,"date":"Oct 05","bd":"Finalize 1-page portfolio v1 Bui based on feedback. exa Per sit","tech":"ld one small, working mple using missions in a test/dev e.","content":"Practice basic video editing with a real draft (not theory only).","islamic":"Source verification practice: check the narrator chain / cross-reference the translation used for today's topic.","asset":"Identify one realistic first asset (e.g. ERPNext Health Check template, discovery questionnaire) and outline it."},"15":{"day":15,"date":"Oct 06","bd":"Build prospect tracker (spreadsheet or Frappe CRM) with columns: lead, channel, BANT status, next follow-up.","tech":"Document the Permissions example (screenshot + short write-up) as portfolio/GitHub proof.","content":"Practice thumbnail design with a real draft (not theory only).","islamic":"Write short personal notes summarizing today's lesson — start of your Islamic content idea log.","asset":"Identify one realistic first asset (e.g. ERPNext Health Check template, discovery questionnaire) and outline it."},"16":{"day":16,"date":"Oct 07","bd":"Research and add 15 pharmacy-niche prospects to the tracker.","tech":"Study Reports (Query & Script Report) fundamentals in the Frappe framework docs — take structured notes.","content":"Practice title writing with a real draft (not theory only).","islamic":"Study routine: 15–20 min from an authentic source (Qur'an tafsir or a recognized Hadith collection).","asset":"Identify one realistic first asset (e.g. ERPNext Health Check template, discovery questionnaire) and outline it."},"17":{"day":17,"date":"Oct 08","bd":"Research and add 15 SME Build on retail/wholesale prospects examp to the tracker. (Quer a tes","tech":"e small, working le using Reports y & Script Report) in t/dev site.","content":"Practice retention techniques with a real draft (not theory only).","islamic":"Source verification practice: check the narrator chain / cross-reference the translation used for today's topic.","asset":"Identify one realistic first asset (e.g. ERPNext Health Check template, discovery questionnaire) and outline it."},"18":{"day":18,"date":"Oct 09","bd":"Draft 3 LinkedIn connection-note templates (under 300 characters, personalized variable).","tech":"Document the Reports (Query & Script Report) example (screenshot + short write-up) as portfolio/GitHub proof.","content":"Practice building a content idea database with a real draft (not theory only).","islamic":"Write short personal notes summarizing today's lesson — start of your Islamic content idea log.","asset":"Identify one realistic first asset (e.g. ERPNext Health Check template, discovery questionnaire) and outline it."},"19":{"day":19,"date":"Oct 10","bd":"Draft 2 cold email templates referencing a specific business detail, not generic pitch.","tech":"Study Print Formats fundamentals in the Frappe framework docs — take structured notes.","content":"Apply scripting to one ERPNext-related content idea.","islamic":"Study routine: 15–20 min from an authentic source (Qur'an tafsir or a recognized Hadith collection).","asset":"Identify one realistic first asset (e.g. ERPNext Health Check template, discovery questionnaire) and outline it."},"20":{"day":20,"date":"Oct 11","bd":"Set up/refresh Upwork profile aligned to the 3 productized offers.","tech":"Build one small, working example using Print Formats in a test/dev site.","content":"Apply hooks to one ERPNext-related content idea.","islamic":"Source verification practice: check the narrator chain / cross-reference the translation used for today's topic.","asset":"Identify one realistic first asset (e.g. ERPNext Health Check template, discovery questionnaire) and outline it."},"21":{"day":21,"date":"Oct 12","bd":"Week review: refine templates based on any early reactions or re-reads.","tech":"Document the Print Formats example (screenshot + short write-up) as portfolio/GitHub proof.","content":"Apply storytelling structure to one ERPNext-related content idea.","islamic":"Write short personal Bu notes summarizing fi today's lesson — start of on your Islamic content idea log.","asset":"ild one section of the rst small asset (based Day 21 outline)."},"22":{"day":22,"date":"Oct 13","bd":"Study the discovery-call/BANT structure (from the earlier BD research report, Section 6).","tech":"Study REST APIs fundamentals in the Frappe framework docs — take structured notes.","content":"Apply TTS/voice-over tools to one ERPNext-related content idea.","islamic":"Study routine: 15–20 min from an authentic source (Qur'an tafsir or a recognized Hadith collection).","asset":"Build one section of the first small asset (based on Day 21 outline)."},"23":{"day":23,"date":"Oct 14","bd":"Write your own discovery-call script for an ERPNext prospect using that structure.","tech":"Build one small, working example using REST APIs in a test/dev site.","content":"Apply basic video editing to one ERPNext-related content idea.","islamic":"Source verification practice: check the narrator chain / cross-reference the translation used for today's topic.","asset":"Build one section of the first small asset (based on Day 21 outline)."},"24":{"day":24,"date":"Oct 15","bd":"Start outreach: send 15–20 personalized LinkedIn connection requests from the tracker list.","tech":"Document the REST APIs example (screenshot + short write-up) as portfolio/GitHub proof.","content":"Apply thumbnail design to one ERPNext-related content idea.","islamic":"Write short personal B notes summarizing f today's lesson — start of o your Islamic content idea log.","asset":"uild one section of the irst small asset (based n Day 21 outline)."},"25":{"day":25,"date":"Oct 16","bd":"Continue outreach: 15–20 more connection requests + send 5 cold emails.","tech":"Study Webhooks fundamentals in the Frappe framework docs — take structured notes.","content":"Apply title writing to one ERPNext-related content idea.","islamic":"Study routine: 15–20 min from an authentic source (Qur'an tafsir or a recognized Hadith collection).","asset":"Build one section of the first small asset (based on Day 21 outline)."},"26":{"day":26,"date":"Oct 17","bd":"Follow up on any replies from Days 24–25; log status changes in the tracker.","tech":"Build one small, working example using Webhooks in a test/dev site.","content":"Apply retention techniques to one ERPNext-related content idea.","islamic":"Source verification practice: check the narrator chain / cross-reference the translation used for today's topic.","asset":"Build one section of the first small asset (based on Day 21 outline)."},"27":{"day":27,"date":"Oct 18","bd":"Continue outreach (15–20 Docume requests) + respond to new exam replies same day. shor port","tech":"nt the Webhooks ple (screenshot + t write-up) as folio/GitHub proof.","content":"Apply building a content idea database to one ERPNext-related content idea.","islamic":"Write short personal B notes summarizing f today's lesson — start of o your Islamic content idea log.","asset":"uild one section of the irst small asset (based n Day 21 outline)."},"28":{"day":28,"date":"Oct 19","bd":"Week review: outreach results so far (sent / accepted / replied), adjust templates if reply rate is low.","tech":"Study Background Jobs fundamentals in the Frappe framework docs — take structured notes.","content":"Study scripting: read/watch one solid resource and take notes.","islamic":"Study routine: 15–20 min from an authentic source (Qur'an tafsir or a recognized Hadith collection).","asset":"Build one section of the first small asset (based on Day 21 outline)."},"29":{"day":29,"date":"Oct 20","bd":"Consolidate Phase 1 assets: portfolio, 3 offers, prospect tracker, Case Study #1 — final review pass.","tech":"Build one small, working St example using Background on Jobs in a test/dev site. ta","content":"udy hooks: read/watch e solid resource and ke notes.","islamic":"Source verification practice: check the narrator chain / cross-reference the translation used for today's topic.","asset":"Build one section of the first small asset (based on Day 21 outline)."},"30":{"day":30,"date":"Oct 21","bd":"Phase 1 retrospective: what worked, what didn't, what changes going into Phase 2 outreach.","tech":"Document the Background Jobs example (screenshot + short write-up) as portfolio/GitHub proof.","content":"Study storytelling structure: read/watch one solid resource and take notes.","islamic":"Write short personal B notes summarizing f today's lesson — start of o your Islamic content idea log.","asset":"uild one section of the irst small asset (based n Day 21 outline)."},"31":{"day":31,"date":"Oct 22","bd":"Re-launch outreach for Phase 2: refresh tracker, re-send templates to non-responders from Phase 1.","tech":"Study ERPNext REST/API consumption — read documentation and take notes.","content":"Long-form: outline this week's YouTube video (business-problem-first, ERPNext angle).","islamic":"Source → Verify: pick this week's topic from an authentic source; verify references.","asset":"Build one more section of the first asset (checkli st/questionnaire/propos al template/Health Check template)."},"32":{"day":32,"date":"Oct 23","bd":"Send 5–10 cold emails; follow up on any open threads in the tracker.","tech":"Study Third-party integrations (general pattern) — read documentation and take notes.","content":"Long-form: script + record this week's YouTube video.","islamic":"Understand: study the topic in depth; expand personal notes.","asset":"Review and tighten the asset's content for clarity."},"33":{"day":33,"date":"Oct 24","bd":"Discovery call slot (if booked) or discovery-script rehearsal if none booked yet.","tech":"Study Automation (scheduled jobs / server scripts) — read documentation and take notes.","content":"Long-form: edit + publish this week's YouTube video.","islamic":"Script: turn notes into a short-form script (Qur'an /Hadith/Seerah/akhlaq, clearly labeled by type).","asset":"Design/format pass on the asset (make it presentable, not just functional)."},"34":{"day":34,"date":"Oct 25","bd":"Proposal/scope work: draft or refine a proposal for an active conversation using the SOW structure.","tech":"Build a small working example using ERPNext REST/API consumption.","content":"Shorts: cut and publish Pu Short #1 from this week's pu long-form video. Is","islamic":"blish: record and blish this week's lamic content piece.","asset":"Test the asset yourself on a real or sample ERPNext scenario."},"35":{"day":35,"date":"Oct 26","bd":"Client communication practice: refine how you explain scope/pricing in plain language.","tech":"Build a small working example using Third-party integrations (general pattern).","content":"Shorts: cut and publish Re Short #2 from this week's pu long-form video. so mo","islamic":"view: check the blished piece against urce material once re for accuracy.","asset":"Prepare a simple way to share the asset (a page, a LinkedIn post, or a lead-magnet link)."},"36":{"day":36,"date":"Oct 27","bd":"Follow-up day: nudge every open lead that's gone quiet (2nd follow-up, per the LinkedIn benchmark data).","tech":"Build a small working example using Automation (scheduled jobs / server scripts).","content":"Shorts: cut and publish St Short #3 from this week's pu long-form video. co le","islamic":"udy routine (no blishing today): ntinue personal arning uninterrupted.","asset":"Get feedback on the asset from one contact; note revisions."},"37":{"day":37,"date":"Oct 28","bd":"Week review: update KPI dashboard (Section 18) — leads, replies, calls, proposals.","tech":"Document/refine the ERPNext REST/API consumption example for your portfolio.","content":"LinkedIn: write and publish 2 posts repurposing this week's video idea; review basic metrics.","islamic":"Week review: note consistency and source quality; plan next week's topic.","asset":"Week review: is the asset ready to publish as free/low-ticket? If yes, plan the publish date."},"38":{"day":38,"date":"Oct 29","bd":"Send 15–20 LinkedIn connection requests + check Upwork for new relevant postings.","tech":"Document/refine the Third-party integrations (general pattern) example for your portfolio.","content":"Long-form: outline this week's YouTube video (business-problem-first, ERPNext angle).","islamic":"Source → Verify: pick this week's topic from an authentic source; verify references.","asset":"Build one more section of the first asset (checkli st/questionnaire/propos al template/Health Check template)."},"39":{"day":39,"date":"Oct 30","bd":"Send 5–10 cold emails; follow up on any open threads in the tracker.","tech":"Document/refine the Automation (scheduled jobs / server scripts) example for your portfolio.","content":"Long-form: script + record this week's YouTube video.","islamic":"Understand: study the topic in depth; expand personal notes.","asset":"Review and tighten the asset's content for clarity."},"40":{"day":40,"date":"Oct 31","bd":"Discovery call slot (if booked) or discovery-script rehearsal if none booked yet.","tech":"Study ERPNext REST/API consumption — read documentation and take notes.","content":"Long-form: edit + publish this week's YouTube video.","islamic":"Script: turn notes into a short-form script (Qur'an /Hadith/Seerah/akhlaq, clearly labeled by type).","asset":"Design/format pass on the asset (make it presentable, not just functional)."},"41":{"day":41,"date":"Nov 01","bd":"Proposal/scope work: draft or refine a proposal for an active conversation using the SOW structure.","tech":"Study Third-party integrations (general pattern) — read documentation and take notes.","content":"Shorts: cut and publish Pu Short #1 from this week's pu long-form video. Is","islamic":"blish: record and blish this week's lamic content piece.","asset":"Test the asset yourself on a real or sample ERPNext scenario."},"42":{"day":42,"date":"Nov 02","bd":"Client communication practice: refine how you explain scope/pricing in plain language.","tech":"Study Automation (scheduled jobs / server scripts) — read documentation and take notes.","content":"Shorts: cut and publish Re Short #2 from this week's pu long-form video. so mo","islamic":"view: check the blished piece against urce material once re for accuracy.","asset":"Prepare a simple way to share the asset (a page, a LinkedIn post, or a lead-magnet link)."},"43":{"day":43,"date":"Nov 03","bd":"Follow-up day: nudge every open lead that's gone quiet (2nd follow-up, per the LinkedIn benchmark data).","tech":"paymob_integration: read/review the integration's existing code and document how it works end-to-end.","content":"Shorts: cut and publish Short #3 from this week's long-form video.","islamic":"Study routine (no publishing today): continue personal learning uninterrupted.","asset":"Get feedback on the asset from one contact; note revisions."},"44":{"day":44,"date":"Nov 04","bd":"Week review: update KPI dashboard (Section 18) — leads, replies, calls, proposals.","tech":"paymob_integration: identify one improvement or edge case to handle; implement it.","content":"LinkedIn: write and publish 2 posts repurposing this week's video idea; review basic metrics.","islamic":"Week review: note consistency and source quality; plan next week's topic.","asset":"Week review: is the asset ready to publish as free/low-ticket? If yes, plan the publish date."},"45":{"day":45,"date":"Nov 05","bd":"Mid-phase checkpoint: review pipeline; if no proposal sent yet, prioritize the warmest 3 leads this week.","tech":"paymob_integration: test the improvement in a dev/sandbox environment.","content":"Long-form: outline this week's YouTube video (business-problem-first, ERPNext angle).","islamic":"Source → Verify: pick this week's topic from an authentic source; verify references.","asset":"Build one more section of the first asset (checkli st/questionnaire/propos al template/Health Check template)."},"46":{"day":46,"date":"Nov 06","bd":"Send 5–10 cold emails; follow up on any open threads in the tracker.","tech":"paymob_integration: write a short technical case-study draft (problem → approach → result).","content":"Long-form: script + record this week's YouTube video.","islamic":"Understand: study the topic in depth; expand personal notes.","asset":"Review and tighten the asset's content for clarity."},"47":{"day":47,"date":"Nov 07","bd":"Discovery call slot (if paym booked) or discovery-script up c rehearsal if none booked case yet.","tech":"ob_integration: clean ode/comments for the -study repo.","content":"Long-form: edit + publish this week's YouTube video.","islamic":"Script: turn notes into a short-form script (Qur'an /Hadith/Seerah/akhlaq, clearly labeled by type).","asset":"Design/format pass on the asset (make it presentable, not just functional)."},"48":{"day":48,"date":"Nov 08","bd":"Proposal/scope work: draft or refine a proposal for an active conversation using the SOW structure.","tech":"paymob_integration: publish the cleaned-up version to GitHub with a clear README.","content":"Shorts: cut and publish Pu Short #1 from this week's pu long-form video. Is","islamic":"blish: record and blish this week's lamic content piece.","asset":"Test the asset yourself on a real or sample ERPNext scenario."},"49":{"day":49,"date":"Nov 09","bd":"Client communication practice: refine how you explain scope/pricing in plain language.","tech":"paymob_integration: review the case study for use as a content piece (see Content track).","content":"Shorts: cut and publish Re Short #2 from this week's pu long-form video. so mo","islamic":"view: check the blished piece against urce material once re for accuracy.","asset":"Prepare a simple way to share the asset (a page, a LinkedIn post, or a lead-magnet link)."},"50":{"day":50,"date":"Nov 10","bd":"Follow-up day: nudge every open lead that's gone quiet (2nd follow-up, per the LinkedIn benchmark data).","tech":"Build a small working example using ERPNext REST/API consumption.","content":"Shorts: cut and publish St Short #3 from this week's pu long-form video. co le","islamic":"udy routine (no blishing today): ntinue personal arning uninterrupted.","asset":"Get feedback on the asset from one contact; note revisions."},"51":{"day":51,"date":"Nov 11","bd":"Week review: update KPI dashboard (Section 18) — leads, replies, calls, proposals.","tech":"Build a small working example using Third-party integrations (general pattern).","content":"LinkedIn: write and publish 2 posts repurposing this week's video idea; review basic metrics.","islamic":"Week review: note consistency and source quality; plan next week's topic.","asset":"Week review: is the asset ready to publish as free/low-ticket? If yes, plan the publish date."},"52":{"day":52,"date":"Nov 12","bd":"Send 15–20 LinkedIn connection requests + check Upwork for new relevant postings.","tech":"Build a small working example using Automation (scheduled jobs / server scripts).","content":"Long-form: outline this week's YouTube video (business-problem-first, ERPNext angle).","islamic":"Source → Verify: pick this week's topic from an authentic source; verify references.","asset":"Build one more section of the first asset (checkli st/questionnaire/propos al template/Health Check template)."},"53":{"day":53,"date":"Nov 13","bd":"Send 5–10 cold emails; follow up on any open threads in the tracker.","tech":"Document/refine the ERPNext REST/API consumption example for your portfolio.","content":"Long-form: script + record this week's YouTube video.","islamic":"Understand: study the topic in depth; expand personal notes.","asset":"Review and tighten the asset's content for clarity."},"54":{"day":54,"date":"Nov 14","bd":"Discovery call slot (if booked) or discovery-script rehearsal if none booked yet.","tech":"Document/refine the Third-party integrations (general pattern) example for your portfolio.","content":"Long-form: edit + publish this week's YouTube video.","islamic":"Script: turn notes into a short-form script (Qur'an /Hadith/Seerah/akhlaq, clearly labeled by type).","asset":"Design/format pass on the asset (make it presentable, not just functional)."},"55":{"day":55,"date":"Nov 15","bd":"Proposal/scope work: draft or refine a proposal for an active conversation using the SOW structure.","tech":"Document/refine the Automation (scheduled jobs / server scripts) example for your portfolio.","content":"Shorts: cut and publish P Short #1 from this week's p long-form video. I","islamic":"ublish: record and ublish this week's slamic content piece.","asset":"Test the asset yourself on a real or sample ERPNext scenario."},"56":{"day":56,"date":"Nov 16","bd":"Client communication practice: refine how you explain scope/pricing in plain language.","tech":"Study ERPNext REST/API consumption — read documentation and take notes.","content":"Shorts: cut and publish R Short #2 from this week's p long-form video. s m","islamic":"eview: check the ublished piece against ource material once ore for accuracy.","asset":"Prepare a simple way to share the asset (a page, a LinkedIn post, or a lead-magnet link)."},"57":{"day":57,"date":"Nov 17","bd":"Follow-up day: nudge every open lead that's gone quiet (2nd follow-up, per the LinkedIn benchmark data).","tech":"Study Third-party integrations (general pattern) — read documentation and take notes.","content":"Shorts: cut and publish S Short #3 from this week's p long-form video. c l","islamic":"tudy routine (no ublishing today): ontinue personal earning uninterrupted.","asset":"Get feedback on the asset from one contact; note revisions."},"58":{"day":58,"date":"Nov 18","bd":"Week review: update KPI dashboard (Section 18) — leads, replies, calls, proposals.","tech":"Study Automation (scheduled jobs / server scripts) — read documentation and take notes.","content":"LinkedIn: write and publish 2 posts repurposing this week's video idea; review basic metrics.","islamic":"Week review: note consistency and source quality; plan next week's topic.","asset":"Week review: is the asset ready to publish as free/low-ticket? If yes, plan the publish date."},"59":{"day":59,"date":"Nov 19","bd":"Send 15–20 LinkedIn connection requests + check Upwork for new relevant postings.","tech":"Build a small working example using ERPNext REST/API consumption.","content":"Long-form: outline this week's YouTube video (business-problem-first, ERPNext angle).","islamic":"Source → Verify: pick this week's topic from an authentic source; verify references.","asset":"Build one more section of the first asset (checkli st/questionnaire/propos al template/Health Check template)."},"60":{"day":60,"date":"Nov 20","bd":"Phase 2 wrap: target is at least one active proposal or first paid project in motion — review status honestly.","tech":"Build a small working example using Third-party integrations (general pattern).","content":"Long-form: script + record this week's YouTube video.","islamic":"Understand: study the topic in depth; expand personal notes.","asset":"Review and tighten the asset's content for clarity."},"61":{"day":61,"date":"Nov 21","bd":"Active client delivery block (if a project is live) OR continued outreach if pipeline needs rebuilding.","tech":"Advanced integrations: study a new integration pattern relevant to a real or prospective client need.","content":"Business-problem content: outline a piece on an ERPNext/payment -integration problem you've actually solved.","islamic":"Continue this week's content series topic: source → verify → understand.","asset":"Expand the published asset (add a section, update based on user feedback)."},"62":{"day":62,"date":"Nov 22","bd":"Proposal refinement: apply lessons from closed/lost deals so far to improve the template.","tech":"Automation: build/refine one automation (scheduled job, server script, or webhook chain).","content":"Business-problem content: outline a piece on an inventory or implementation-mistake problem.","islamic":"Script this week's piece; keep Qur'an / authentic Hadith / interpretation / personal reflection clearly labeled.","asset":"Test one monetization path for the asset (e.g. YouTube eligibility check, a relevant affiliate fit) — no guarantees, just testing."},"63":{"day":63,"date":"Nov 23","bd":"Client communication: status update / check-in with any active client.","tech":"API architecture: review and document how your integrations fit together as a reusable pattern.","content":"Script + record this week's long-form video.","islamic":"Record and publish this week's Islamic content piece.","asset":"Draft/refine a simple email or contact-capture step tied to the asset."},"64":{"day":64,"date":"Nov 24","bd":"Referral ask: reach out to one past or current client for an introduction.","tech":"Practical AI/LLM integration: explore one way an LLM API could automate a real ERPNext workflow task.","content":"Edit + publish this week's long-form video; cut 2–3 fo Shorts from it.","islamic":"Review published piece r accuracy once more; note any correction needed.","asset":"Review asset traffic/downloads/leads so far (if any) and note honestly."},"65":{"day":65,"date":"Nov 25","bd":"Care Plan pitch: identify one completed project to offer an ongoing Care Plan retainer to.","tech":"Business automation: identify one manual process (yours or a client's) and prototype automating it.","content":"Publish Shorts + 2 LinkedIn posts repurposing the same core idea.","islamic":"Study routine (no publishing): protect consistency even on lighter weeks.","asset":"Explore one more digital-product idea for 2027 without committing time to build it yet."},"66":{"day":66,"date":"Nov 26","bd":"Testimonial/case-study request: ask a satisfied client for a short testimonial or permission to write it up.","tech":"Consolidate technical proof: update GitHub/portfolio with this week's strongest technical work.","content":"Analyze last week's metrics: CTR, retention, watch time, returning viewers, subscribers, leads generated.","islamic":"Engage respectfully with any audience questions/comments on published content.","asset":"Consolidate: update the digital asset ladder (Section 22) with real status, not projections."},"67":{"day":67,"date":"Nov 27","bd":"Week review: update KPI dashboard; assess whether the sales funnel (Section 18) needs adjustment.","tech":"Week review: is your specialization narrative (ERPNext + APIs + Automation + AI) getting sharper?","content":"Week review: adjust next week's topic based on what the metrics show performed best.","islamic":"Week review: series consistency + source quality check.","asset":"Week review: what actually moved on the passive-income ladder this week, if anything."},"68":{"day":68,"date":"Nov 28","bd":"Active client delivery block (if a project is live) OR continued outreach if pipeline needs rebuilding.","tech":"Advanced integrations: study a new integration pattern relevant to a real or prospective client need.","content":"Business-problem content: outline a piece on an ERPNext/payment -integration problem you've actually solved.","islamic":"Continue this week's content series topic: source → verify → understand.","asset":"Expand the published asset (add a section, update based on user feedback)."},"69":{"day":69,"date":"Nov 29","bd":"Proposal refinement: apply lessons from closed/lost deals so far to improve the template.","tech":"Automation: build/refine one automation (scheduled job, server script, or webhook chain).","content":"Business-problem content: outline a piece on an inventory or implementation-mistake problem.","islamic":"Script this week's piece; keep Qur'an / authentic Hadith / interpretation / personal reflection clearly labeled.","asset":"Test one monetization path for the asset (e.g. YouTube eligibility check, a relevant affiliate fit) — no guarantees, just testing."},"70":{"day":70,"date":"Nov 30","bd":"Client communication: status update / check-in with any active client.","tech":"API architecture: review and document how your integrations fit together as a reusable pattern.","content":"Script + record this week's long-form video.","islamic":"Record and publish this week's Islamic content piece.","asset":"Draft/refine a simple email or contact-capture step tied to the asset."},"71":{"day":71,"date":"Dec 01","bd":"Referral ask: reach out to one past or current client for an introduction.","tech":"Practical AI/LLM integration: explore one way an LLM API could automate a real ERPNext workflow task.","content":"Edit + publish this week's long-form video; cut 2–3 fo Shorts from it.","islamic":"Review published piece r accuracy once more; note any correction needed.","asset":"Review asset traffic/downloads/leads so far (if any) and note honestly."},"72":{"day":72,"date":"Dec 02","bd":"Care Plan pitch: identify one completed project to offer an ongoing Care Plan retainer to.","tech":"Business automation: identify one manual process (yours or a client's) and prototype automating it.","content":"Publish Shorts + 2 LinkedIn posts repurposing the same core idea.","islamic":"Study routine (no publishing): protect consistency even on lighter weeks.","asset":"Explore one more digital-product idea for 2027 without committing time to build it yet."},"73":{"day":73,"date":"Dec 03","bd":"Testimonial/case-study request: ask a satisfied client for a short testimonial or permission to write it up.","tech":"Consolidate technical proof: update GitHub/portfolio with this week's strongest technical work.","content":"Analyze last week's metrics: CTR, retention, watch time, returning viewers, subscribers, leads generated.","islamic":"Engage respectfully with any audience questions/comments on published content.","asset":"Consolidate: update the digital asset ladder (Section 22) with real status, not projections."},"74":{"day":74,"date":"Dec 04","bd":"Week review: update KPI dashboard; assess whether the sales funnel (Section 18) needs adjustment.","tech":"Week review: is your specialization narrative (ERPNext + APIs + Automation + AI) getting sharper?","content":"Week review: adjust next week's topic based on what the metrics show performed best.","islamic":"Week review: series consistency + source quality check.","asset":"Week review: what actually moved on the passive-income ladder this week, if anything."},"75":{"day":75,"date":"Dec 05","bd":"Active client delivery block (if a project is live) OR continued outreach if pipeline needs rebuilding.","tech":"Advanced integrations: study a new integration pattern relevant to a real or prospective client need.","content":"Business-problem content: outline a piece on an ERPNext/payment -integration problem you've actually solved.","islamic":"Continue this week's content series topic: source → verify → understand.","asset":"Expand the published asset (add a section, update based on user feedback)."},"76":{"day":76,"date":"Dec 06","bd":"Proposal refinement: apply lessons from closed/lost deals so far to improve the template.","tech":"Automation: build/refine one automation (scheduled job, server script, or webhook chain).","content":"Business-problem content: outline a piece on an inventory or implementation-mistake problem.","islamic":"Script this week's piece; keep Qur'an / authentic Hadith / interpretation / personal reflection clearly labeled.","asset":"Test one monetization path for the asset (e.g. YouTube eligibility check, a relevant affiliate fit) — no guarantees, just testing."},"77":{"day":77,"date":"Dec 07","bd":"Client communication: status update / check-in with any active client.","tech":"API architecture: review and document how your integrations fit together as a reusable pattern.","content":"Script + record this week's long-form video.","islamic":"Record and publish this week's Islamic content piece.","asset":"Draft/refine a simple email or contact-capture step tied to the asset."},"78":{"day":78,"date":"Dec 08","bd":"Referral ask: reach out to one past or current client for an introduction.","tech":"Practical AI/LLM integration: explore one way an LLM API could automate a real ERPNext workflow task.","content":"Edit + publish this week's long-form video; cut 2–3 fo Shorts from it.","islamic":"Review published piece r accuracy once more; note any correction needed.","asset":"Review asset traffic/downloads/leads so far (if any) and note honestly."},"79":{"day":79,"date":"Dec 09","bd":"Care Plan pitch: identify one completed project to offer an ongoing Care Plan retainer to.","tech":"Business automation: identify one manual process (yours or a client's) and prototype automating it.","content":"Publish Shorts + 2 LinkedIn posts repurposing the same core idea.","islamic":"Study routine (no publishing): protect consistency even on lighter weeks.","asset":"Explore one more digital-product idea for 2027 without committing time to build it yet."},"80":{"day":80,"date":"Dec 10","bd":"Testimonial/case-study request: ask a satisfied client for a short testimonial or permission to write it up.","tech":"Consolidate technical proof: update GitHub/portfolio with this week's strongest technical work.","content":"Analyze last week's metrics: CTR, retention, watch time, returning viewers, subscribers, leads generated.","islamic":"Engage respectfully with any audience questions/comments on published content.","asset":"Consolidate: update the digital asset ladder (Section 22) with real status, not projections."},"81":{"day":81,"date":"Dec 11","bd":"Week review: update KPI dashboard; assess whether the sales funnel (Section 18) needs adjustment.","tech":"Week review: is your specialization narrative (ERPNext + APIs + Automation + AI) getting sharper?","content":"Week review: adjust next week's topic based on what the metrics show performed best.","islamic":"Week review: series consistency + source quality check.","asset":"Week review: what actually moved on the passive-income ladder this week, if anything."},"82":{"day":82,"date":"Dec 12","bd":"Active client delivery block (if a project is live) OR continued outreach if pipeline needs rebuilding.","tech":"Advanced integrations: study a new integration pattern relevant to a real or prospective client need.","content":"Business-problem content: outline a piece on an ERPNext/payment -integration problem you've actually solved.","islamic":"Continue this week's content series topic: source → verify → understand.","asset":"Expand the published asset (add a section, update based on user feedback)."},"83":{"day":83,"date":"Dec 13","bd":"Proposal refinement: apply lessons from closed/lost deals so far to improve the template.","tech":"Automation: build/refine one automation (scheduled job, server script, or webhook chain).","content":"Business-problem content: outline a piece on an inventory or implementation-mistake problem.","islamic":"Script this week's piece; keep Qur'an / authentic Hadith / interpretation / personal reflection clearly labeled.","asset":"Test one monetization path for the asset (e.g. YouTube eligibility check, a relevant affiliate fit) — no guarantees, just testing."},"84":{"day":84,"date":"Dec 14","bd":"Client communication: status update / check-in with any active client.","tech":"API architecture: review and document how your integrations fit together as a reusable pattern.","content":"Script + record this week's long-form video.","islamic":"Record and publish this week's Islamic content piece.","asset":"Draft/refine a simple email or contact-capture step tied to the asset."},"85":{"day":85,"date":"Dec 15","bd":"Referral ask: reach out to one past or current client for an introduction.","tech":"Practical AI/LLM integration: explore one way an LLM API could automate a real ERPNext workflow task.","content":"Edit + publish this week's long-form video; cut 2–3 fo Shorts from it.","islamic":"Review published piece r accuracy once more; note any correction needed.","asset":"Review asset traffic/downloads/leads so far (if any) and note honestly."},"86":{"day":86,"date":"Dec 16","bd":"Care Plan pitch: identify one completed project to offer an ongoing Care Plan retainer to.","tech":"Business automation: identify one manual process (yours or a client's) and prototype automating it.","content":"Publish Shorts + 2 LinkedIn posts repurposing the same core idea.","islamic":"Study routine (no publishing): protect consistency even on lighter weeks.","asset":"Explore one more digital-product idea for 2027 without committing time to build it yet."},"87":{"day":87,"date":"Dec 17","bd":"Testimonial/case-study request: ask a satisfied client for a short testimonial or permission to write it up.","tech":"Consolidate technical proof: update GitHub/portfolio with this week's strongest technical work.","content":"Analyze last week's metrics: CTR, retention, watch time, returning viewers, subscribers, leads generated.","islamic":"Engage respectfully with any audience questions/comments on published content.","asset":"Consolidate: update the digital asset ladder (Section 22) with real status, not projections."},"88":{"day":88,"date":"Dec 18","bd":"Week review: update KPI dashboard; assess whether the sales funnel (Section 18) needs adjustment.","tech":"Week review: is your specialization narrative (ERPNext + APIs + Automation + AI) getting sharper?","content":"Week review: adjust next week's topic based on what the metrics show performed best.","islamic":"Week review: series consistency + source quality check.","asset":"Week review: what actually moved on the passive-income ladder this week, if anything."},"89":{"day":89,"date":"Dec 19","bd":"Active client delivery block (if a project is live) OR continued outreach if pipeline needs rebuilding.","tech":"Advanced integrations: study a new integration pattern relevant to a real or prospective client need.","content":"Business-problem content: outline a piece on an ERPNext/payment -integration problem you've actually solved.","islamic":"Continue this week's content series topic: source → verify → understand.","asset":"Expand the published asset (add a section, update based on user feedback)."},"90":{"day":90,"date":"Dec 20","bd":"Proposal refinement: apply lessons from closed/lost deals so far to improve the template.","tech":"Automation: build/refine one automation (scheduled job, server script, or webhook chain).","content":"Business-problem content: outline a piece on an inventory or implementation-mistake problem.","islamic":"Script this week's piece; keep Qur'an / authentic Hadith / interpretation / personal reflection clearly labeled.","asset":"Test one monetization path for the asset (e.g. YouTube eligibility check, a relevant affiliate fit) — no guarantees, just testing."},"91":{"day":91,"date":"Dec 21","bd":"Client communication: status update / check-in with any active client.","tech":"API architecture: review and document how your integrations fit together as a reusable pattern.","content":"Script + record this week's long-form video.","islamic":"Record and publish this week's Islamic content piece.","asset":"Draft/refine a simple email or contact-capture step tied to the asset."},"92":{"day":92,"date":"Dec 22","bd":"Referral ask: reach out to one past or current client for an introduction.","tech":"Practical AI/LLM integration: explore one way an LLM API could automate a real ERPNext workflow task.","content":"Edit + publish this week's long-form video; cut 2–3 fo Shorts from it.","islamic":"Review published piece r accuracy once more; note any correction needed.","asset":"Review asset traffic/downloads/leads so far (if any) and note honestly."},"93":{"day":93,"date":"Dec 23","bd":"Care Plan pitch: identify one completed project to offer an ongoing Care Plan retainer to.","tech":"Business automation: identify one manual process (yours or a client's) and prototype automating it.","content":"Publish Shorts + 2 LinkedIn posts repurposing the same core idea.","islamic":"Study routine (no publishing): protect consistency even on lighter weeks.","asset":"Explore one more digital-product idea for 2027 without committing time to build it yet."},"94":{"day":94,"date":"Dec 24","bd":"Testimonial/case-study request: ask a satisfied client for a short testimonial or permission to write it up.","tech":"Consolidate technical proof: update GitHub/portfolio with this week's strongest technical work.","content":"Analyze last week's metrics: CTR, retention, watch time, returning viewers, subscribers, leads generated.","islamic":"Engage respectfully with any audience questions/comments on published content.","asset":"Consolidate: update the digital asset ladder (Section 22) with real status, not projections."},"95":{"day":95,"date":"Dec 25","bd":"Week review: update KPI dashboard; assess whether the sales funnel (Section 18) needs adjustment.","tech":"Week review: is your specialization narrative (ERPNext + APIs + Automation + AI) getting sharper?","content":"Week review: adjust next week's topic based on what the metrics show performed best.","islamic":"Week review: series consistency + source quality check.","asset":"Week review: what actually moved on the passive-income ladder this week, if anything."},"96":{"day":96,"date":"Dec 26","bd":"Active client delivery block (if a project is live) OR continued outreach if pipeline needs rebuilding.","tech":"Advanced integrations: study a new integration pattern relevant to a real or prospective client need.","content":"Business-problem content: outline a piece on an ERPNext/payment -integration problem you've actually solved.","islamic":"Continue this week's content series topic: source → verify → understand.","asset":"Expand the published asset (add a section, update based on user feedback)."},"97":{"day":97,"date":"Dec 27","bd":"Proposal refinement: apply lessons from closed/lost deals so far to improve the template.","tech":"Automation: build/refine one automation (scheduled job, server script, or webhook chain).","content":"Business-problem content: outline a piece on an inventory or implementation-mistake problem.","islamic":"Script this week's piece; keep Qur'an / authentic Hadith / interpretation / personal reflection clearly labeled.","asset":"Test one monetization path for the asset (e.g. YouTube eligibility check, a relevant affiliate fit) — no guarantees, just testing."},"98":{"day":98,"date":"Dec 28","bd":"Client communication: status update / check-in with any active client.","tech":"API architecture: review and document how your integrations fit together as a reusable pattern.","content":"Script + record this week's long-form video.","islamic":"Record and publish this week's Islamic content piece.","asset":"Draft/refine a simple email or contact-capture step tied to the asset."},"99":{"day":99,"date":"Dec 29","bd":"Referral ask: reach out to one past or current client for an introduction.","tech":"Practical AI/LLM integration: explore one way an LLM API could automate a real ERPNext workflow task.","content":"Edit + publish this week's long-form video; cut 2–3 fo Shorts from it.","islamic":"Review published piece r accuracy once more; note any correction needed.","asset":"Review asset traffic/downloads/leads so far (if any) and note honestly."},"100":{"day":100,"date":"Dec 30","bd":"Care Plan pitch: identify one completed project to offer an ongoing Care Plan retainer to.","tech":"Business automation: identify one manual process (yours or a client's) and prototype automating it.","content":"Publish Shorts + 2 LinkedIn posts repurposing the same core idea.","islamic":"Study routine (no publishing): protect consistency even on lighter weeks.","asset":"Explore one more digital-product idea for 2027 without committing time to build it yet."},"101":{"day":101,"date":"Dec 31","bd":"Testimonial/case-study request: ask a satisfied client for a short testimonial or permission to write it up.","tech":"Consolidate technical proof: update GitHub/portfolio with this week's strongest technical work.","content":"Analyze last week's metrics: CTR, retention, watch time, returning viewers, subscribers, leads generated.","islamic":"Engage respectfully with any audience questions/comments on published content.","asset":"Consolidate: update the digital asset ladder (Section 22) with real status, not projections."}};
const ROADMAP_TRACKS = { bd: 'Business Development', tech: 'Technical Skill', content: 'Tech Content', islamic: 'Islamic Knowledge', asset: 'Digital Assets' };
let roadmapPhase = 'all';
let roadmapSelectedDay = Math.max(1, Math.min(101, roadmapTodayNumber()));
function roadmapTodayNumber() {
    return Math.floor((Date.parse(todayStr() + 'T00:00:00Z') - Date.UTC(2026, 8, 22)) / 86400000) + 1;
}
function roadmapDone(day, progress) { return Object.keys(ROADMAP_TRACKS).every(t => progress[day]?.[t]); }
function renderRoadmapHeroWidget() {
    const todayNum = roadmapTodayNumber();
    const progress = DB.get('roadmap_progress', {});

    const phaseColors = ['#c8a96e', '#7c6ef0', '#4ade80', '#c8a96e'];
    const phaseLabels = ['Phase 1: Foundation', 'Phase 2: First Revenue', 'Phase 3: Systemization', 'Overall'];
    const phaseRanges = [[1, 30], [31, 60], [61, 101], [1, 101]];

    const trackLabels = { bd: 'Business Development', tech: 'Technical Skill', content: 'Tech Content', islamic: 'Islamic Knowledge', asset: 'Digital Assets' };
    const trackColors = { bd: '#c8a96e', tech: '#7c6ef0', content: '#38bdf8', islamic: '#4ade80', asset: '#fb923c' };
    const trackIcons = { bd: '💼', tech: '💻', content: '🎥', islamic: '🕌', asset: '📦' };

    const phaseStatBars = phaseRanges.map(([first, last], i) => {
        let done = 0;
        for (let d = first; d <= last; d++) if (roadmapDone(d, progress)) done++;
        const total = last - first + 1;
        const pct = Math.round(done / total * 100);
        return `<div style="margin-bottom:10px;">
            <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:4px;">
                <span style="color:${phaseColors[i]}; font-weight:600;">${phaseLabels[i]} (${first}–${last})</span>
                <span style="color:var(--muted);">${done}/${total} days · ${pct}%</span>
            </div>
            <div style="height:6px; background:var(--surface2); border-radius:3px; overflow:hidden;">
                <div style="height:6px; width:${pct}%; background:${phaseColors[i]}; border-radius:3px;"></div>
            </div>
        </div>`;
    }).join('');

    const trackTaskRows = Object.entries(trackLabels).map(([track, label]) => {
        const dayData = ROADMAP_DAYS[todayNum];
        const isDone = progress[todayNum]?.[track] || false;
        const taskText = dayData ? dayData[track] : '—';
        const color = trackColors[track];
        const icon = trackIcons[track];
        return `<div style="display:flex; align-items:flex-start; gap:10px; padding:9px 0; border-bottom:1px solid var(--border);${!isDone ? '' : ' opacity:0.6;'}">
            <input type="checkbox" ${isDone ? 'checked' : ''}
                onchange="toggleRoadmapTrack(${todayNum}, '${track}', this.checked)"
                style="margin-top:3px; accent-color:${color}; width:15px; height:15px; cursor:pointer; flex-shrink:0;">
            <div style="flex:1; min-width:0;">
                <div style="display:flex; align-items:center; gap:6px; margin-bottom:2px;">
                    <span style="font-size:12px;">${icon}</span>
                    <span style="font-size:11px; font-weight:600; color:${color};">${label}</span>
                    ${isDone ? '<span style="font-size:10px; color:var(--success);">✓ Done</span>' : ''}
                </div>
                <div style="font-size:12px; color:${isDone ? 'var(--muted)' : 'var(--text)'}; ${isDone ? 'text-decoration:line-through;' : ''} line-height:1.4;">${esc(taskText)}</div>
            </div>
        </div>`;
    }).join('');

    const overallDone = Object.keys(ROADMAP_DAYS).filter(d => roadmapDone(d, progress)).length;
    const totalDays = Object.keys(ROADMAP_DAYS).length;
    const overallPct = Math.round(overallDone / totalDays * 100);
    const currentPhase = todayNum <= 30 ? 1 : todayNum <= 60 ? 2 : 3;
    const daysRemaining = Math.max(0, 101 - todayNum);
    const currentPhaseLabel = ['Foundation', 'First Revenue', 'Systemization'][currentPhase - 1];
    const todayTasksDone = Object.keys(ROADMAP_TRACKS).filter(t => progress[todayNum]?.[t]).length;
    const todayTasksTotal = Object.keys(ROADMAP_TRACKS).length;
    const todayPct = Math.round(todayTasksDone / todayTasksTotal * 100);

    document.getElementById('dash-roadmap-hero').innerHTML = `
        <div style="background:linear-gradient(135deg, rgba(200,169,110,0.08) 0%, rgba(124,110,240,0.05) 100%); border:1px solid rgba(200,169,110,0.2); border-radius:14px; padding:20px;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; flex-wrap:wrap; gap:10px;">
                <div style="display:flex; align-items:center; gap:10px;">
                    <span style="font-size:22px;">🎯</span>
                    <div>
                        <div style="font-size:15px; font-weight:700; color:var(--accent); font-family:'DM Serif Display',serif;">100-Day Master Roadmap</div>
                        <div style="font-size:11px; color:var(--muted);">Day ${todayNum < 1 || todayNum > 101 ? '—' : todayNum + ' · Phase ' + currentPhase + ': ' + currentPhaseLabel}</div>
                    </div>
                </div>
                <div style="display:flex; gap:20px; flex-wrap:wrap;">
                    <div style="text-align:center;">
                        <div style="font-size:20px; font-weight:700; color:var(--accent);">${overallDone}</div>
                        <div style="font-size:10px; color:var(--muted);">days done</div>
                    </div>
                    <div style="text-align:center;">
                        <div style="font-size:20px; font-weight:700; color:var(--accent2);">${overallPct}%</div>
                        <div style="font-size:10px; color:var(--muted);">complete</div>
                    </div>
                    <div style="text-align:center;">
                        <div style="font-size:20px; font-weight:700; color:var(--success);">${todayTasksDone}/${todayTasksTotal}</div>
                        <div style="font-size:10px; color:var(--muted);">today</div>
                    </div>
                    <div style="text-align:center;">
                        <div style="font-size:20px; font-weight:700; color:var(--muted);">${daysRemaining}</div>
                        <div style="font-size:10px; color:var(--muted);">left</div>
                    </div>
                </div>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
                <div>
                    <div style="font-size:12px; font-weight:600; color:var(--muted); margin-bottom:10px; letter-spacing:0.05em; text-transform:uppercase;">Phase Progress</div>
                    ${phaseStatBars}
                </div>
                <div>
                    <div style="font-size:12px; font-weight:600; color:var(--muted); margin-bottom:6px; letter-spacing:0.05em; text-transform:uppercase;">Today's Tasks (Day ${todayNum < 1 || todayNum > 101 ? '—' : todayNum})</div>
                    <div style="background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:6px 12px; max-height:200px; overflow-y:auto;">
                        ${todayNum >= 1 && todayNum <= 101 ? trackTaskRows : '<div style="font-size:12px; color:var(--muted); padding:8px 0;">No tasks for today.</div>'}
                    </div>
                    ${todayNum >= 1 && todayNum <= 101 && todayTasksDone === todayTasksTotal ? '<div style="font-size:11px; color:var(--success); margin-top:6px;">✓ All tracks done for today!</div>' : ''}
                    <button class="btn btn-secondary" onclick="showPage('roadmap')" style="margin-top:10px; width:100%; font-size:12px; padding:8px;">📋 Full Roadmap →</button>
                </div>
            </div>
        </div>`;

    updateRoadmapBadges();
}
function updateRoadmapBadges() {
    const el = document.getElementById('nav-roadmap-badge');
    if (el) el.textContent = Math.max(1, Math.min(101, roadmapTodayNumber())) + '/101';
}
function renderRoadmap() {
    const progress = DB.get('roadmap_progress', {});

    // --- Phase stat bars (stats only — progress bars removed, donut handles visuals) ---
    for (const [key, first, last] of [['overall', 1, 101], ['p1', 1, 30], ['p2', 31, 60], ['p3', 61, 101]]) {
        let done = 0;
        for (let d = first; d <= last; d++) if (roadmapDone(d, progress)) done++;
        const pct = Math.round(done / (last - first + 1) * 100);
        const statEl = document.getElementById('rm-stat-' + key);
        if (statEl) statEl.textContent = `${done}/${last - first + 1}`;
        if (key === 'overall') {
            const pctEl = document.getElementById('rm-pct-overall');
            if (pctEl) pctEl.textContent = pct + '% complete';
        }
    }

    // --- SVG donut ring for overall ---
    const overallDone = Object.keys(ROADMAP_DAYS).filter(d => roadmapDone(d, progress)).length;
    const overallPct = Math.round(overallDone / 101 * 100);
    const circ = 2 * Math.PI * 36;
    const donutArc = document.getElementById('rm-donut-arc');
    if (donutArc) donutArc.style.strokeDashoffset = circ - (circ * overallPct / 100);
    const donutPct = document.getElementById('rm-donut-pct');
    if (donutPct) donutPct.textContent = overallPct + '%';

    const days = Object.values(ROADMAP_DAYS).filter(d => roadmapPhase === 'all' || (d.day <= 30 ? 1 : d.day <= 60 ? 2 : 3) === roadmapPhase);
    if (!days.some(d => d.day === roadmapSelectedDay)) roadmapSelectedDay = days[0].day;
    document.getElementById('rm-day-select').innerHTML = days.map(d => `<option value="${d.day}">Day ${d.day} · ${esc(d.date)}</option>`).join('');
    document.getElementById('rm-day-select').value = roadmapSelectedDay;
    document.getElementById('rm-101-grid').innerHTML = days.map(d => `<button class="btn btn-secondary" id="rm-day-${d.day}" onclick="selectRoadmapDay(${d.day})" aria-pressed="${d.day === roadmapSelectedDay}" style="padding:6px;${roadmapDone(d.day, progress) ? 'background:var(--success);color:#000;' : d.day === roadmapTodayNumber() ? 'background:var(--accent);color:#000;' : ''}${d.day === roadmapSelectedDay ? 'outline:2px solid var(--accent2);' : ''}">${d.day}</button>`).join('');
    document.querySelectorAll('#rm-phase-filters .toggle-btn').forEach(b => b.classList.toggle('active', b.id === 'rm-filter-' + (roadmapPhase === 'all' ? 'all' : 'p' + roadmapPhase)));

    renderRoadmapDayDetail();
    renderRoadmapUpNext();
    renderRoadmapWeeklySummary();
}
function renderRoadmapUpNext() {
    const todayNum = roadmapTodayNumber();
    const progress = DB.get('roadmap_progress', {});
    const trackColors = { bd: '#c8a96e', tech: '#7c6ef0', content: '#38bdf8', islamic: '#4ade80', asset: '#fb923c' };
    const trackIcons = { bd: '💼', tech: '💻', content: '🎥', islamic: '🕌', asset: '📦' };
    const trackLabels = { bd: 'BD', tech: 'Tech', content: 'Content', islamic: 'Islamic', asset: 'Asset' };

    const upNextDays = [1, 2, 3].map(offset => {
        const dayNum = todayNum + offset;
        if (dayNum < 1 || dayNum > 101) return null;
        const dayData = ROADMAP_DAYS[dayNum];
        if (!dayData) return null;
        const isDone = roadmapDone(dayNum, progress);
        const tracksDone = Object.keys(ROADMAP_TRACKS).filter(t => progress[dayNum]?.[t]).length;
        const totalTracks = Object.keys(ROADMAP_TRACKS).length;
        const phase = dayNum <= 30 ? 1 : dayNum <= 60 ? 2 : 3;
        const phaseColors = { 1: '#c8a96e', 2: '#7c6ef0', 3: '#4ade80' };
        const trackDots = Object.keys(ROADMAP_TRACKS).map(t =>
            `<span style="width:7px;height:7px;border-radius:50%;background:${progress[dayNum]?.[t] ? trackColors[t] : 'var(--border)'}; display:inline-block;"></span>`
        ).join('');

        return `<div style="background:var(--surface2); border-radius:10px; padding:12px 14px; border:1px solid var(--border);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <span style="font-size:13px; font-weight:600;">Day ${dayNum} · ${esc(dayData.date)}</span>
                <span style="font-size:10px; font-weight:600; color:${phaseColors[phase]}; background:${phaseColors[phase]}22; padding:2px 8px; border-radius:8px;">Phase ${phase}</span>
            </div>
            <div style="font-size:11px; color:var(--muted); margin-bottom:8px;">BD: ${esc(dayData.bd.slice(0, 60))}${dayData.bd.length > 60 ? '…' : ''}</div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; gap:4px;">${trackDots}</div>
                <span style="font-size:11px; color:${tracksDone === totalTracks ? 'var(--success)' : 'var(--muted)'};">${tracksDone}/${totalTracks} tracks</span>
            </div>
        </div>`;
    }).filter(Boolean);

    document.getElementById('rm-up-next').innerHTML = upNextDays.length
        ? upNextDays.join('')
        : '<div style="font-size:12px; color:var(--muted);">No upcoming days within roadmap range.</div>';
}
function renderRoadmapWeeklySummary() {
    const todayNum = roadmapTodayNumber();
    const progress = DB.get('roadmap_progress', {});
    const trackColors = { bd: '#c8a96e', tech: '#7c6ef0', content: '#38bdf8', islamic: '#4ade80', asset: '#fb923c' };
    const trackLabels = { bd: 'BD', tech: 'Tech', content: 'Content', islamic: 'Islamic', asset: 'Asset' };

    // Calculate roadmap day number from calendar date string (e.g. "2026-09-22" => 1)
    function calDateToRoadmapDay(dateStr) {
        const start = new Date('2026-09-22T00:00:00');
        const d = new Date(dateStr + 'T00:00:00');
        const diffMs = d - start;
        if (isNaN(diffMs)) return null;
        const diffDays = Math.floor(diffMs / 86400000) + 1;
        return diffDays;
    }

    // --- 7-day heatmap ---
    const weekDates = getWeekDates(todayStr());
    const doneThisWeek = weekDates.reduce((count, ds) => {
        const rd = calDateToRoadmapDay(ds);
        if (rd !== null && rd >= 1 && rd <= 101 && roadmapDone(String(rd), progress)) return count + 1;
        return count;
    }, 0);
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    // Calculate streak
    let streak = 0;
    for (let i = todayNum; i >= 1; i--) {
        if (roadmapDone(String(i), progress)) streak++;
        else break;
    }

    document.getElementById('rm-week-done').textContent = doneThisWeek;
    document.getElementById('rm-week-streak').textContent = streak;

    document.getElementById('rm-week-heatmap').innerHTML = weekDates.map((ds, i) => {
        const rd = calDateToRoadmapDay(ds);
        if (rd === null || rd < 1 || rd > 101) {
            return `<div style="text-align:center; width:28px;" title="${ds}: Outside roadmap">
                <div style="width:20px;height:20px;border-radius:4px;background:var(--surface2);opacity:0.3;margin:0 auto;"></div>
                <div style="font-size:9px;color:var(--muted);margin-top:2px;">${dayNames[i]}</div>
            </div>`;
        }
        const done = roadmapDone(String(rd), progress);
        const doneCount = Object.keys(ROADMAP_TRACKS).filter(t => progress[rd]?.[t]).length;
        const bg = done ? 'var(--success)' : doneCount > 0 ? 'var(--accent)' : 'var(--surface2)';
        const isToday = ds === todayStr();
        return `<div style="text-align:center; width:28px;" title="${ds} Day ${rd}: ${doneCount}/5 tracks">
            <div style="width:20px;height:20px;border-radius:4px;background:${bg};margin:0 auto;${isToday ? 'outline:2px solid var(--accent);outline-offset:1px;' : ''}border:${isToday ? '' : '1px solid var(--border)'};"></div>
            <div style="font-size:9px;color:${isToday ? 'var(--accent)' : 'var(--muted)'};margin-top:2px;">${dayNames[i]}</div>
        </div>`;
    }).join('');

    // --- Track completion for this week ---
    const trackCounts = { bd: 0, tech: 0, content: 0, islamic: 0, asset: 0 };
    let validDays = 0;
    weekDates.forEach(ds => {
        const rd = calDateToRoadmapDay(ds);
        if (rd === null || rd < 1 || rd > 101) return;
        validDays++;
        Object.keys(ROADMAP_TRACKS).forEach(t => { if (progress[rd]?.[t]) trackCounts[t]++; });
    });

    document.getElementById('rm-week-tracks').innerHTML = Object.entries(trackCounts).map(([track, cnt]) => {
        const pct = validDays > 0 ? Math.round(cnt / validDays * 100) : 0;
        return `<div>
            <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:3px;">
                <span style="color:${trackColors[track]};">${trackLabels[track]}</span>
                <span style="color:var(--muted);">${cnt}/${validDays}</span>
            </div>
            <div style="height:5px; background:var(--surface2); border-radius:3px;">
                <div style="height:5px; width:${pct}%; background:${trackColors[track]}; border-radius:3px;"></div>
            </div>
        </div>`;
    }).join('');
}

// --- Roadmap data validation ---
function validateRoadmapData() {
    const errors = [];
    const totalDays = Object.keys(ROADMAP_DAYS).length;
    if (totalDays < 101) errors.push(`Only ${totalDays} days in roadmap, expected 101.`);
    Object.entries(ROADMAP_DAYS).forEach(([dayNum, dayData]) => {
        const d = parseInt(dayNum);
        if (d < 1 || d > 101) errors.push(`Day ${dayNum} is out of range.`);
        ['bd', 'tech', 'content', 'islamic', 'asset'].forEach(track => {
            if (!dayData[track]) errors.push(`Day ${dayNum} missing "${track}" task.`);
        });
    });
    return errors;
}

// --- Roadmap streak ---
function getRoadmapStreak() {
    const progress = DB.get('roadmap_progress', {});
    let streak = 0;
    for (let i = roadmapTodayNumber(); i >= 1; i--) {
        if (roadmapDone(String(i), progress)) streak++;
        else break;
    }
    return streak;
}
function renderRoadmapDayDetail() {
    const day = ROADMAP_DAYS[roadmapSelectedDay];
    if (!day) return;
    const progress = DB.get('roadmap_progress', {})[day.day] || {};
    const trackColors = { bd: '#c8a96e', tech: '#7c6ef0', content: '#38bdf8', islamic: '#4ade80', asset: '#fb923c' };
    const trackIcons = { bd: '💼', tech: '💻', content: '🎥', islamic: '🕌', asset: '📦' };

    const dayPhase = day.day <= 30 ? 1 : day.day <= 60 ? 2 : 3;
    const phaseColors = { 1: '#c8a96e', 2: '#7c6ef0', 3: '#4ade80' };
    const phaseLabels = { 1: 'Foundation (1–30)', 2: 'First Revenue (31–60)', 3: 'Systemization (61–101)' };

    const tracksHtml = Object.entries(ROADMAP_TRACKS).map(([track, label]) => {
        const isDone = progress[track] || false;
        const color = trackColors[track];
        const icon = trackIcons[track];
        const task = day[track] || '—';
        return `<label style="display:flex; align-items:flex-start; gap:12px; padding:12px 0; border-bottom:1px solid var(--border); cursor:pointer; transition:opacity 0.2s; ${isDone ? 'opacity:0.55;' : ''}">
            <input type="checkbox" ${isDone ? 'checked' : ''}
                onchange="toggleRoadmapTrack(${day.day}, '${track}', this.checked)"
                style="margin-top:4px; accent-color:${color}; width:16px; height:16px; cursor:pointer; flex-shrink:0;">
            <div style="flex:1; min-width:0;">
                <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
                    <span style="font-size:14px;">${icon}</span>
                    <span style="font-size:12px; font-weight:600; color:${color};">${esc(label)}</span>
                    ${isDone ? '<span style="font-size:10px; font-weight:600; color:var(--success); background:rgba(74,222,128,0.1); padding:1px 7px; border-radius:8px;">✓ Complete</span>' : ''}
                </div>
                <div style="font-size:12px; color:var(--text); line-height:1.5; ${isDone ? 'text-decoration:line-through; color:var(--muted);' : ''}">${esc(task)}</div>
            </div>
        </label>`;
    }).join('');

    const tracksDone = Object.keys(ROADMAP_TRACKS).filter(t => progress[t]).length;
    const allDone = tracksDone === Object.keys(ROADMAP_TRACKS).length;

    document.getElementById('rm-day-detail-card').innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
            <div>
                <h3 style="font-family:'DM Serif Display',serif; font-size:18px; margin-bottom:2px;">Day ${day.day} · ${esc(day.date)}, 2026</h3>
                <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                    <span style="font-size:11px; color:${phaseColors[dayPhase]}; background:${phaseColors[dayPhase]}18; padding:2px 8px; border-radius:6px;">${phaseLabels[dayPhase]}</span>
                    <span style="font-size:11px; color:var(--muted);">${tracksDone}/${Object.keys(ROADMAP_TRACKS).length} tracks</span>
                </div>
            </div>
            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                <div style="display:flex; align-items:center; gap:6px; font-size:12px; color:${allDone ? 'var(--success)' : 'var(--muted)'};">
                    ${allDone ? '✓ All Done' : `${tracksDone} of ${Object.keys(ROADMAP_TRACKS).length} complete`}
                </div>
                ${day.day === roadmapTodayNumber() && !allDone
                    ? `<button class="btn btn-primary" onclick="markAllRoadmapDoneToday()" style="font-size:12px; padding:7px 14px;">✓ Mark Today Complete</button>`
                    : ''}
            </div>
        </div>
        <div style="margin-top:8px;">${tracksHtml}</div>`;
}
function selectRoadmapDay(day) { roadmapSelectedDay = safeInt(day, 1, 101, 1); renderRoadmap(); }
function filterRoadmapPhase(phase) { roadmapPhase = [1, 2, 3].includes(Number(phase)) ? Number(phase) : 'all'; renderRoadmap(); }
function jumpToRoadmapToday() {
    roadmapPhase = 'all'; selectRoadmapDay(Math.max(1, Math.min(101, roadmapTodayNumber())));
    document.getElementById('rm-day-' + roadmapSelectedDay)?.scrollIntoView({ block: 'nearest' });
}
function toggleRoadmapTrack(day, track, checked) {
    if (!ROADMAP_DAYS[day] || !Object.hasOwn(ROADMAP_TRACKS, track)) return;
    const progress = DB.get('roadmap_progress', {});
    progress[day] = { ...progress[day], [track]: checked };
    if (DB.set('roadmap_progress', progress)) { renderRoadmap(); renderRoadmapHeroWidget(); }
}
function markAllRoadmapDoneToday() {
    const day = roadmapTodayNumber();
    if (!ROADMAP_DAYS[day]) return showToast('Today is outside the roadmap dates. Select a day to update its tasks.');
    const progress = DB.get('roadmap_progress', {});
    progress[day] = Object.fromEntries(Object.keys(ROADMAP_TRACKS).map(t => [t, true]));
    if (DB.set('roadmap_progress', progress)) { jumpToRoadmapToday(); renderRoadmapHeroWidget(); showToast('Today completed ✓'); }
}

// Each editor uses the existing modal fields and the same local storage layer.
const HUB_EDITORS = {
    prospect: { key: 'crm_prospects', modal: 'modal-prospect', prefix: 'crm-p-', title: 'prospect-modal-title', label: 'Prospect', required: 'name', fields: ['name', 'company', 'niche', 'channel', 'stage', 'offer', 'value', 'followup', 'b', 'a', 'n', 't', 'link', 'notes'], defaults: { niche: 'Pharmacy', channel: 'LinkedIn', stage: 'prospect', offer: 'Health Check' } },
    tech: { key: 'tech_content', modal: 'modal-content-tech', prefix: 'tcont-', title: 'tech-content-modal-title', label: 'Tech Content Piece', required: 'title', fields: ['title', 'problem', 'status', 'date', 'long-link', 'short1', 'short2', 'short3', 'li1', 'li2'], defaults: { status: 'Idea' } },
    islamic: { key: 'islamic_content', modal: 'modal-content-islamic', prefix: 'icont-', title: 'isl-content-modal-title', label: 'Islamic Content Piece', required: 'title', fields: ['title', 'cat', 'date', 'source', 'v1', 'v2', 'v3', 'v4', 'v5', 'notes', 'link'], defaults: { cat: 'Quran Lesson' } },
    idea: { key: 'content_ideas', modal: 'modal-content-idea', prefix: 'idea-', title: 'idea-modal-title', label: 'Content / Asset Idea', required: 'title', fields: ['title', 'type', 'priority', 'notes'], defaults: { type: 'tech', priority: 'medium' } }
};
const hubEditingIds = {};
function openHubEditor(kind, id = null) {
    const config = HUB_EDITORS[kind];
    const item = id === null ? {} : DB.get(config.key, []).find(p => p.id === id);
    if (!item) return showToast('This item no longer exists.');
    hubEditingIds[kind] = id;
    config.fields.forEach(field => {
        const el = document.getElementById(config.prefix + field);
        if (el.type === 'checkbox') el.checked = !!item[field];
        else el.value = item[field] ?? config.defaults[field] ?? (field === 'date' ? todayStr() : '');
    });
    document.getElementById(config.title).textContent = (id === null ? 'New ' : 'Edit ') + config.label;
    document.getElementById(config.prefix + 'delete-btn').style.display = id === null ? 'none' : 'inline-block';
    openModal(config.modal);
}
function saveHubEditor(kind) {
    const config = HUB_EDITORS[kind];
    const items = DB.get(config.key, []);
    const id = hubEditingIds[kind];
    const item = { ...(items.find(p => p.id === id) || {}), id: id ?? genId() };
    config.fields.forEach(field => {
        const el = document.getElementById(config.prefix + field);
        item[field] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? safeNum(el.value) : el.value.trim();
    });
    if (!item[config.required]) return showToast('Please enter a ' + config.required + '.');
    if (kind === 'islamic' && item.link && (!item.source || !['v1', 'v2', 'v3', 'v4', 'v5'].every(f => item[f]))) return showToast('Complete the source and all five verification steps before adding a published link.');
    const index = items.findIndex(p => p.id === item.id);
    if (index < 0) items.push(item); else items[index] = item;
    if (!DB.set(config.key, items)) return;
    closeModal(config.modal);
    if (kind === 'prospect') renderCrmPage(); else { switchContentTab(kind === 'idea' ? 'ideas' : kind); }
    showToast(config.label + ' saved ✓');
}
function deleteHubItem(kind) {
    const config = HUB_EDITORS[kind];
    const id = hubEditingIds[kind];
    if (id == null || !confirm('Delete this ' + config.label.toLowerCase() + '?')) return;
    if (!DB.set(config.key, DB.get(config.key, []).filter(p => p.id !== id))) return;
    closeModal(config.modal);
    if (kind === 'prospect') renderCrmPage(); else renderContentHub();
}
function openProspectModal(id = null) { openHubEditor('prospect', id); }
function saveProspect() { saveHubEditor('prospect'); }
function deleteCurrentProspect() { deleteHubItem('prospect'); }
function openTechContentModal(id = null) { openHubEditor('tech', id); }
function saveTechContent() { saveHubEditor('tech'); }
function deleteCurrentTechContent() { deleteHubItem('tech'); }
function openIslamicContentModal(id = null) { openHubEditor('islamic', id); }
function saveIslamicContent() { saveHubEditor('islamic'); }
function deleteCurrentIslamicContent() { deleteHubItem('islamic'); }
function openIdeaModal(id = null) { openHubEditor('idea', id); }
function saveIdea() { saveHubEditor('idea'); }
function deleteCurrentIdea() { deleteHubItem('idea'); }
function switchHubTabs(prefix, toggle, tabs, selected) {
    if (!tabs.includes(selected)) return;
    tabs.forEach(tab => document.getElementById(prefix + tab).style.display = tab === selected ? 'block' : 'none');
    document.querySelectorAll('#' + toggle + ' .toggle-btn').forEach((b, i) => b.classList.toggle('active', tabs[i] === selected));
}
function switchCrmTab(tab) { switchHubTabs('crm-tab-', 'crm-view-toggle', ['pipeline', 'table', 'offers', 'scripts'], tab); renderCrmPage(); }
function hubEditButton(kind, id) {
    return `<button class="btn btn-secondary" data-kind="${kind}" data-id="${esc(id)}" onclick="openHubEditor(this.dataset.kind, this.dataset.id)">Edit</button>`;
}
function renderCrmPage() {
    const items = DB.get('crm_prospects', []);
    const stages = Array.from(document.getElementById('crm-p-stage').options);
    const metrics = { total: items.length, qualified: items.filter(p => p.stage === 'qualified' || ['b', 'a', 'n', 't'].every(f => p[f])).length, calls: items.filter(p => p.stage === 'discovery').length, proposals: items.filter(p => p.stage === 'proposal').length, closed: items.filter(p => ['closed_won', 'care_plan'].includes(p.stage)).length, val: items.filter(p => !['closed_lost', 'closed_won', 'care_plan'].includes(p.stage)).reduce((sum, p) => sum + safeNum(p.value), 0) };
    Object.entries(metrics).forEach(([key, value]) => document.getElementById('crm-stat-' + key).textContent = key === 'val' ? value.toLocaleString() : value);
    document.getElementById('crm-kanban-board').innerHTML = stages.map(stage => `<section class="card"><h3>${esc(stage.textContent)}</h3>${items.filter(p => p.stage === stage.value).map(p => `<div style="margin-top:12px;"><b>${esc(p.name)}</b><p>${esc(p.company)} · ${safeNum(p.value).toLocaleString()}</p><p>Follow-up: ${esc(p.followup || 'Not set')}</p>${hubEditButton('prospect', p.id)}</div>`).join('') || '<p>No prospects</p>'}</section>`).join('');
    document.getElementById('crm-table-container').innerHTML = `<table style="width:100%;"><thead><tr><th>Name</th><th>Company</th><th>Stage</th><th>Value</th><th>Action</th></tr></thead><tbody>${items.map(p => `<tr><td>${esc(p.name)}</td><td>${esc(p.company)}</td><td>${esc(stages.find(s => s.value === p.stage)?.textContent || p.stage)}</td><td>${safeNum(p.value).toLocaleString()}</td><td>${hubEditButton('prospect', p.id)}</td></tr>`).join('') || '<tr><td colspan="5">No prospects yet. Add your first prospect.</td></tr>'}</tbody></table>`;
}
function switchContentTab(tab) { switchHubTabs('content-tab-', 'content-tab-toggle', ['tech', 'islamic', 'ideas'], tab); renderContentHub(); }
function renderContentHub() {
    for (const [kind, container] of [['tech', 'tech-content-list'], ['islamic', 'islamic-content-list'], ['idea', 'idea-bank-list']]) {
        const items = DB.get(HUB_EDITORS[kind].key, []);
        document.getElementById(container).innerHTML = items.map(item => {
            const detail = kind === 'tech' ? `${item.status} · ${['long-link', 'short1', 'short2', 'short3', 'li1', 'li2'].filter(f => item[f]).length}/6 repurposing items` : kind === 'islamic' ? `${['v1', 'v2', 'v3', 'v4', 'v5'].filter(f => item[f]).length}/5 verification steps · ${item.link ? 'Published' : 'Draft'}` : `${item.type} · ${item.priority} priority`;
            return `<div class="card"><h3>${esc(item.title)}</h3><p>${esc(detail)}</p><p>${esc(item.problem || item.notes || '')}</p>${hubEditButton(kind, item.id)}</div>`;
        }).join('') || '<div class="card">No items yet. Use the buttons above to add one.</div>';
    }
}
function renderKpiPage() {
    const select = document.getElementById('kpi-week-select');
    const week = select.value || Math.max(1, Math.min(15, Math.ceil(roadmapTodayNumber() / 7)));
    select.innerHTML = Array.from({ length: 15 }, (_, i) => `<option value="${i + 1}">Week ${i + 1}</option>`).join('');
    loadKpiForWeek(week);
    document.querySelectorAll('#page-kpi input[id^="sc-"]').forEach(el => el.checked = !!DB.get('scorecard_' + el.id.split('-')[1], {})[el.id]);
}
function loadKpiForWeek(week) {
    week = safeInt(week, 1, 15, 1);
    document.getElementById('kpi-week-select').value = week;
    document.getElementById('kpi-week-label').textContent = 'Week ' + week;
    const saved = DB.get('kpi_week_' + week, {});
    document.querySelectorAll('#page-kpi input[id^="kpi-"], #kpi-isl-verified').forEach(el => el.value = saved[el.id] ?? (el.id === 'kpi-isl-verified' ? 'yes' : 0));
}
function saveCurrentWeekKpi() {
    const data = {};
    document.querySelectorAll('#page-kpi input[id^="kpi-"], #kpi-isl-verified').forEach(el => data[el.id] = el.type === 'number' ? safeNum(el.value, 0, el.id === 'kpi-cont-ctr' ? 100 : 1e9) : el.value);
    const week = safeInt(document.getElementById('kpi-week-select').value, 1, 15, 1);
    if (DB.set('kpi_week_' + week, data)) showToast('Weekly KPIs saved ✓');
}
function saveScorecard(month) {
    if (!['sep', 'oct', 'nov', 'dec'].includes(month)) return;
    const data = {};
    document.querySelectorAll('#page-kpi input[id^="sc-' + month + '-"]').forEach(el => data[el.id] = el.checked);
    DB.set('scorecard_' + month, data);
}

// ============================================================
// INIT
// ============================================================
window.addEventListener('load', () => {
    initApp();
});

async function initApp() {
    // Auth gate
    if (!AUTH.isLoggedIn()) {
        showAuthScreen();
        const users = AUTH.getUsers();
        if (Object.keys(users).length === 0) {
            showAuthSignup();
        }
        return;
    }
    // Logged in — boot the app
    showApp();
    applyTheme(getActiveThemeId());
    loadToday();
    renderDashboard();
    renderCalendar();
    renderDiary();
    renderEventColors();
    loadSettings();
    runAutoBackupIfDue();
    runAutoDeleteIfDue();
    checkFirstTimeUser();
    updateBackupLabels();
    renderTasks();
    renderSavingsGoals();
    renderRoutinePage();
}

document.getElementById('log-date-select').value = todayStr();
const _acadDateInit = document.getElementById('acad-date-input');
if (_acadDateInit) _acadDateInit.value = todayStr();