// ============================================================
// ROUTINE SYSTEM
// ============================================================
function getRoutines() { return DB.get('routines', []); }
function setRoutines(v) { DB.set('routines', v); }

let editingRoutineId = null;
let routineSteps = [];

const ROUTINE_DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function openRoutineModal(id) {
    editingRoutineId = id || null;
    routineSteps = [];
    document.getElementById('routine-modal-title').textContent = id ? 'Edit Routine' : 'New Routine';
    document.getElementById('routine-delete-btn').style.display = id ? 'inline-flex' : 'none';
    document.getElementById('routine-name-input').value = '';

    document.querySelectorAll('.routine-day-pill').forEach(el => {
        el.style.background = 'var(--surface2)';
        el.style.color = 'var(--muted)';
        el.style.borderColor = 'var(--border)';
    });

    if (id) {
        const r = getRoutines().find(x => x.id === id);
        if (r) {
            document.getElementById('routine-name-input').value = r.name || '';
            routineSteps = (r.steps || []).map(s => ({
                ...s,
                subs: (s.subs || []).map(sub => ({ ...sub }))
            }));
            (r.days || []).forEach(dayIdx => {
                const pill = document.querySelector(`.routine-day-pill[data-day="${dayIdx}"]`);
                if (pill) {
                    pill.style.background = 'rgba(124,110,240,0.2)';
                    pill.style.color = 'var(--accent2)';
                    pill.style.borderColor = 'var(--accent2)';
                }
            });
        }
    }
    renderRoutineStepsEditor();
    openModal('modal-routine');
}

function toggleRoutineDay(el) {
    const active = el.style.background.includes('rgba(124');
    if (active) {
        el.style.background = 'var(--surface2)';
        el.style.color = 'var(--muted)';
        el.style.borderColor = 'var(--border)';
    } else {
        el.style.background = 'rgba(124,110,240,0.2)';
        el.style.color = 'var(--accent2)';
        el.style.borderColor = 'var(--accent2)';
    }
}

function addRoutineStep() {
    routineSteps.push({ id: genId(), text: '', timeFrom: '', timeTo: '', subs: [] });
    renderRoutineStepsEditor();
}

function removeRoutineStep(sid) {
    routineSteps = routineSteps.filter(s => s.id !== sid);
    renderRoutineStepsEditor();
}

function addRoutineSub(stepId) {
    const step = routineSteps.find(s => s.id === stepId);
    if (step) {
        if (!step.subs) step.subs = [];
        step.subs.push({ id: genId(), text: '', timeFrom: '', timeTo: '' });
        renderRoutineStepsEditor();
    }
}

function removeRoutineSub(stepId, subId) {
    const step = routineSteps.find(s => s.id === stepId);
    if (step) {
        step.subs = (step.subs || []).filter(sub => sub.id !== subId);
        renderRoutineStepsEditor();
    }
}

function renderRoutineStepsEditor() {
    const el = document.getElementById('routine-steps-list');
    if (!el) return;
    if (!routineSteps.length) {
        el.innerHTML = '<div style="font-size:12px;color:var(--muted);font-style:italic;padding:8px 0;">No blocks yet — click + Add Block</div>';
        return;
    }
    el.innerHTML = routineSteps.map((s, i) => {
        const subsHtml = (s.subs || []).map((sub, si) =>
            `<div style="display:grid;grid-template-columns:78px 78px 1fr auto;gap:5px;align-items:center;margin-top:5px;padding:6px 8px;background:var(--bg);border-radius:6px;border:1px solid var(--border);">` +
            `<input type="time" class="input" value="${sub.timeFrom || ''}" style="font-size:11px;padding:4px 5px;" oninput="routineSteps[${i}].subs[${si}].timeFrom=this.value">` +
            `<input type="time" class="input" value="${sub.timeTo || ''}" style="font-size:11px;padding:4px 5px;" oninput="routineSteps[${i}].subs[${si}].timeTo=this.value">` +
            `<input type="text" class="input" value="${esc(sub.text)}" placeholder="Sub-activity…" style="font-size:12px;" oninput="routineSteps[${i}].subs[${si}].text=this.value" maxlength="200">` +
            `<button class="btn btn-ghost" onclick="removeRoutineSub('${s.id}','${sub.id}')" style="font-size:12px;padding:2px 5px;color:var(--danger);">✕</button>` +
            `</div>`
        ).join('');

        return (
            `<div style="background:var(--surface2);border-radius:10px;padding:10px;border:1px solid var(--border);">` +
            `<div style="display:grid;grid-template-columns:78px 78px 1fr auto auto;gap:6px;align-items:center;">` +
            `<input type="time" class="input" value="${s.timeFrom || ''}" style="font-size:12px;padding:6px 8px;" oninput="routineSteps[${i}].timeFrom=this.value">` +
            `<input type="time" class="input" value="${s.timeTo || ''}" style="font-size:12px;padding:6px 8px;" oninput="routineSteps[${i}].timeTo=this.value">` +
            `<input type="text" class="input" value="${esc(s.text)}" placeholder="e.g. Wake Up, Study, Gym…" style="font-size:13px;font-weight:600;" oninput="routineSteps[${i}].text=this.value" maxlength="200">` +
            `<button class="btn btn-ghost" onclick="addRoutineSub('${s.id}')" style="font-size:11px;padding:3px 7px;border:1px solid var(--border);color:var(--accent2);white-space:nowrap;">+ Sub</button>` +
            `<button class="btn btn-ghost" onclick="removeRoutineStep('${s.id}')" style="font-size:13px;padding:2px 6px;color:var(--danger);">✕</button>` +
            `</div>` +
            (subsHtml ? `<div style="padding-left:4px;">${subsHtml}</div>` : '') +
            `</div>`
        );
    }).join('');
}

function saveRoutine() {
    const name = document.getElementById('routine-name-input').value.trim();
    if (!name) return showToast('Please enter a routine name.');

    const days = [];
    document.querySelectorAll('.routine-day-pill').forEach(el => {
        if (el.style.background.includes('rgba(124')) days.push(parseInt(el.dataset.day));
    });

    const routine = {
        id: editingRoutineId || genId(),
        name,
        days,
        steps: routineSteps.filter(s => s.text.trim()).map(s => ({
            ...s,
            subs: (s.subs || []).filter(sub => sub.text.trim())
        })),
        createdAt: editingRoutineId
            ? (getRoutines().find(r => r.id === editingRoutineId) || {}).createdAt || new Date().toISOString()
            : new Date().toISOString(),
    };

    const routines = getRoutines();
    if (editingRoutineId) {
        const idx = routines.findIndex(r => r.id === editingRoutineId);
        if (idx >= 0) routines[idx] = routine;
    } else {
        routines.push(routine);
    }
    setRoutines(routines);
    closeModal('modal-routine');
    renderRoutinePage();
    showToast(editingRoutineId ? 'Routine updated!' : 'Routine created! 🔁');
}

async function deleteRoutine() {
    if (!editingRoutineId) return;
    if (!await showConfirm('Delete this routine?', 'Delete', true)) return;
    setRoutines(getRoutines().filter(r => r.id !== editingRoutineId));
    closeModal('modal-routine');
    renderRoutinePage();
    showToast('Routine deleted.');
}

function fmt12(t) {
    if (!t) return '';
    const parts = t.split(':');
    let h = parseInt(parts[0]), m = parseInt(parts[1]);
    const ampm = h >= 12 ? 'pm' : 'am';
    if (h > 12) h -= 12;
    if (h === 0) h = 12;
    return m === 0 ? `${h}${ampm}` : `${h}:${parts[1]}${ampm}`;
}

function fmtRange(from, to) {
    if (!from && !to) return '';
    if (from && to) return `${fmt12(from)} – ${fmt12(to)}`;
    return fmt12(from || to);
}

function parseMinutes(t) {
    if (!t) return null;
    const p = t.split(':').map(Number);
    return p[0] * 60 + p[1];
}

function renderRoutinePage() {
    const routines = getRoutines();
    const todayDow = new Date().getDay();
    const todayIdx = todayDow === 0 ? 6 : todayDow - 1;

    const bannerEl = document.getElementById('routine-today-banner');
    if (bannerEl) bannerEl.innerHTML = '';

    const listEl = document.getElementById('routine-profiles-list');
    if (!listEl) return;

    if (!routines.length) {
        listEl.innerHTML = `<div style="text-align:center;padding:60px 20px;color:var(--muted);"><div style="font-size:40px;margin-bottom:12px;opacity:0.4;">🔁</div><div style="font-size:15px;font-weight:600;margin-bottom:6px;">No routines yet</div><div style="font-size:13px;opacity:0.7;">Create your first routine to build better habits</div></div>`;
        return;
    }

    const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    // Each routine gets its own profile card with its own table
    const profileCards = routines.map(r => {
        const activeDays = (r.days && r.days.length) ? r.days : [0, 1, 2, 3, 4, 5, 6];
        const dayLabels = activeDays.map(i => DAYS[i]).join(', ');
        const steps = (r.steps || []).filter(s => s.text.trim())
            .sort((a, b) => (parseMinutes(a.timeFrom) ?? 9999) - (parseMinutes(b.timeFrom) ?? 9999));

        // Left column = time range, day columns = activity text
        const thCols = DAYS.map((d, di) => {
            const isT = di === todayIdx;
            const isActive = activeDays.includes(di);
            const dot = isT ? '<span style="display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--accent);vertical-align:middle;margin-left:3px;margin-bottom:1px;"></span>' : '';
            return `<th style="padding:10px 10px;text-align:center;font-size:11px;font-weight:700;letter-spacing:0.05em;width:12%;border-left:1px solid var(--border);${isT ? 'color:var(--accent);background:rgba(200,169,110,0.07);' : isActive ? 'color:var(--text);' : 'color:var(--muted);opacity:0.4;'}">${d}${dot}</th>`;
        }).join('');

        const trows = steps.map(s => {
            const timeRange = fmtRange(s.timeFrom, s.timeTo);
            const subs = (s.subs || []).filter(sub => sub.text.trim())
                .sort((a, b) => (parseMinutes(a.timeFrom) ?? 9999) - (parseMinutes(b.timeFrom) ?? 9999));

            // Left cell: parent time + indented sub-times
            const subTimesHtml = subs.map(sub => {
                const subRange = fmtRange(sub.timeFrom, sub.timeTo);
                return `<div style="margin-top:4px;padding-left:14px;display:flex;align-items:center;gap:5px;">` +
                    `<span style="display:inline-block;width:6px;height:1px;background:var(--muted);flex-shrink:0;margin-top:1px;opacity:0.5;"></span>` +
                    `<div style="font-size:10px;color:var(--muted);">${subRange || esc(sub.text)}</div>` +
                    `</div>`;
            }).join('');

            const leftCell =
                `<td style="padding:12px 14px;vertical-align:top;white-space:nowrap;width:130px;min-width:130px;border-right:1px solid var(--border);">` +
                (timeRange
                    ? `<div style="font-size:11px;font-weight:700;color:var(--accent);">${timeRange}</div>`
                    : `<div style="font-size:11px;color:var(--muted);font-style:italic;">—</div>`) +
                subTimesHtml +
                `</td>`;

            // Day cells: parent activity text + indented sub-activity names
            const dayCells = DAYS.map((d, di) => {
                const isT = di === todayIdx;
                const isActive = activeDays.includes(di);
                const bg = isT ? 'background:rgba(200,169,110,0.04);' : '';
                const border = 'border-left:1px solid var(--border);';
                if (!isActive) {
                    return `<td style="padding:12px 10px;text-align:center;vertical-align:middle;width:12%;${border}${bg}"><span style="color:var(--border);font-size:13px;">—</span></td>`;
                }
                const subActivitiesHtml = subs.map(sub => {
                    return `<div style="margin-top:4px;padding-left:14px;display:flex;align-items:flex-start;gap:5px;">` +
                        `<span style="display:inline-block;width:6px;height:1px;background:var(--muted);flex-shrink:0;margin-top:7px;opacity:0.5;"></span>` +
                        `<div style="font-size:11px;color:var(--muted);word-break:break-word;line-height:1.4;">${esc(sub.text)}</div>` +
                        `</div>`;
                }).join('');
                return `<td style="padding:10px 10px;vertical-align:top;width:12%;${border}${bg}">` +
                    `<div style="font-size:13px;font-weight:600;color:var(--text);word-break:break-word;line-height:1.4;">${esc(s.text)}</div>` +
                    subActivitiesHtml +
                    `</td>`;
            }).join('');

            return `<tr style="border-bottom:1px solid var(--border);">${leftCell}${dayCells}</tr>`;
        }).join('');

        const tableHtml = steps.length
            ? `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;table-layout:fixed;"><thead><tr style="border-bottom:2px solid var(--border);"><th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:var(--muted);letter-spacing:0.05em;white-space:nowrap;width:130px;border-right:1px solid var(--border);">TIME</th>${thCols}</tr></thead><tbody>${trows}</tbody></table></div>`
            : `<div style="font-size:12px;color:var(--muted);font-style:italic;padding:16px 20px;">No schedule blocks — click Edit to add some.</div>`;

        return (
            `<div class="card" style="margin-bottom:20px;padding:0;overflow:hidden;">` +
            `<div style="padding:14px 18px 12px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">` +
            `<div>` +
            `<div style="font-size:15px;font-weight:700;">${esc(r.name)}</div>` +
            `<div style="font-size:12px;color:var(--muted);margin-top:2px;">${dayLabels || 'Every day'}</div>` +
            `</div>` +
            `<button class="btn btn-ghost" onclick="openRoutineModal('${r.id}')" style="font-size:12px;padding:5px 12px;border:1px solid var(--border);">Edit</button>` +
            `</div>` +
            tableHtml +
            `</div>`
        );
    }).join('');

    listEl.innerHTML = profileCards;
}

