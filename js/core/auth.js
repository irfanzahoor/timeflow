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

