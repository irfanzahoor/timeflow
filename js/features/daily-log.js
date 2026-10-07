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

