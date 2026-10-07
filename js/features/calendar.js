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

