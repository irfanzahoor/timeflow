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

