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

