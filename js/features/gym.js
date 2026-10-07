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

