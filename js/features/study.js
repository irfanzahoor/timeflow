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

