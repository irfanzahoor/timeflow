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