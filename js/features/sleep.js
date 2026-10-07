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

