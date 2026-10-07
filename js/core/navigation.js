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

