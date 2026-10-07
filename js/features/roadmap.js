// ============================================================
// ROADMAP, CRM, KPI AND CONTENT HUB
// ============================================================
const ROADMAP_TRACKS = { bd: 'Business Development', tech: 'Technical Skill', content: 'Tech Content', islamic: 'Islamic Knowledge', asset: 'Digital Assets' };
let roadmapPhase = 'all';
let roadmapSelectedDay = Math.max(1, Math.min(101, roadmapTodayNumber()));
function roadmapTodayNumber() {
    return Math.floor((Date.parse(todayStr() + 'T00:00:00Z') - Date.UTC(2026, 8, 22)) / 86400000) + 1;
}
function roadmapDone(day, progress) { return Object.keys(ROADMAP_TRACKS).every(t => progress[day]?.[t]); }
function renderRoadmapHeroWidget() {
    const todayNum = roadmapTodayNumber();
    const progress = DB.get('roadmap_progress', {});

    const phaseColors = ['#c8a96e', '#7c6ef0', '#4ade80', '#c8a96e'];
    const phaseLabels = ['Phase 1: Foundation', 'Phase 2: First Revenue', 'Phase 3: Systemization', 'Overall'];
    const phaseRanges = [[1, 30], [31, 60], [61, 101], [1, 101]];

    const trackLabels = { bd: 'Business Development', tech: 'Technical Skill', content: 'Tech Content', islamic: 'Islamic Knowledge', asset: 'Digital Assets' };
    const trackColors = { bd: '#c8a96e', tech: '#7c6ef0', content: '#38bdf8', islamic: '#4ade80', asset: '#fb923c' };
    const trackIcons = { bd: '💼', tech: '💻', content: '🎥', islamic: '🕌', asset: '📦' };

    const phaseStatBars = phaseRanges.map(([first, last], i) => {
        let done = 0;
        for (let d = first; d <= last; d++) if (roadmapDone(d, progress)) done++;
        const total = last - first + 1;
        const pct = Math.round(done / total * 100);
        return `<div style="margin-bottom:10px;">
            <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:4px;">
                <span style="color:${phaseColors[i]}; font-weight:600;">${phaseLabels[i]} (${first}–${last})</span>
                <span style="color:var(--muted);">${done}/${total} days · ${pct}%</span>
            </div>
            <div style="height:6px; background:var(--surface2); border-radius:3px; overflow:hidden;">
                <div style="height:6px; width:${pct}%; background:${phaseColors[i]}; border-radius:3px;"></div>
            </div>
        </div>`;
    }).join('');

    const trackTaskRows = Object.entries(trackLabels).map(([track, label]) => {
        const dayData = ROADMAP_DAYS[todayNum];
        const isDone = progress[todayNum]?.[track] || false;
        const taskText = dayData ? dayData[track] : '—';
        const color = trackColors[track];
        const icon = trackIcons[track];
        return `<div style="display:flex; align-items:flex-start; gap:10px; padding:9px 0; border-bottom:1px solid var(--border);${!isDone ? '' : ' opacity:0.6;'}">
            <input type="checkbox" ${isDone ? 'checked' : ''}
                onchange="toggleRoadmapTrack(${todayNum}, '${track}', this.checked)"
                style="margin-top:3px; accent-color:${color}; width:15px; height:15px; cursor:pointer; flex-shrink:0;">
            <div style="flex:1; min-width:0;">
                <div style="display:flex; align-items:center; gap:6px; margin-bottom:2px;">
                    <span style="font-size:12px;">${icon}</span>
                    <span style="font-size:11px; font-weight:600; color:${color};">${label}</span>
                    ${isDone ? '<span style="font-size:10px; color:var(--success);">✓ Done</span>' : ''}
                </div>
                <div style="font-size:12px; color:${isDone ? 'var(--muted)' : 'var(--text)'}; ${isDone ? 'text-decoration:line-through;' : ''} line-height:1.4;">${esc(taskText)}</div>
            </div>
        </div>`;
    }).join('');

    const overallDone = Object.keys(ROADMAP_DAYS).filter(d => roadmapDone(d, progress)).length;
    const totalDays = Object.keys(ROADMAP_DAYS).length;
    const overallPct = Math.round(overallDone / totalDays * 100);
    const currentPhase = todayNum <= 30 ? 1 : todayNum <= 60 ? 2 : 3;
    const daysRemaining = Math.max(0, 101 - todayNum);
    const currentPhaseLabel = ['Foundation', 'First Revenue', 'Systemization'][currentPhase - 1];
    const todayTasksDone = Object.keys(ROADMAP_TRACKS).filter(t => progress[todayNum]?.[t]).length;
    const todayTasksTotal = Object.keys(ROADMAP_TRACKS).length;
    const todayPct = Math.round(todayTasksDone / todayTasksTotal * 100);

    document.getElementById('dash-roadmap-hero').innerHTML = `
        <div style="background:linear-gradient(135deg, rgba(200,169,110,0.08) 0%, rgba(124,110,240,0.05) 100%); border:1px solid rgba(200,169,110,0.2); border-radius:14px; padding:20px;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; flex-wrap:wrap; gap:10px;">
                <div style="display:flex; align-items:center; gap:10px;">
                    <span style="font-size:22px;">🎯</span>
                    <div>
                        <div style="font-size:15px; font-weight:700; color:var(--accent); font-family:'DM Serif Display',serif;">100-Day Master Roadmap</div>
                        <div style="font-size:11px; color:var(--muted);">Day ${todayNum < 1 || todayNum > 101 ? '—' : todayNum + ' · Phase ' + currentPhase + ': ' + currentPhaseLabel}</div>
                    </div>
                </div>
                <div style="display:flex; gap:20px; flex-wrap:wrap;">
                    <div style="text-align:center;">
                        <div style="font-size:20px; font-weight:700; color:var(--accent);">${overallDone}</div>
                        <div style="font-size:10px; color:var(--muted);">days done</div>
                    </div>
                    <div style="text-align:center;">
                        <div style="font-size:20px; font-weight:700; color:var(--accent2);">${overallPct}%</div>
                        <div style="font-size:10px; color:var(--muted);">complete</div>
                    </div>
                    <div style="text-align:center;">
                        <div style="font-size:20px; font-weight:700; color:var(--success);">${todayTasksDone}/${todayTasksTotal}</div>
                        <div style="font-size:10px; color:var(--muted);">today</div>
                    </div>
                    <div style="text-align:center;">
                        <div style="font-size:20px; font-weight:700; color:var(--muted);">${daysRemaining}</div>
                        <div style="font-size:10px; color:var(--muted);">left</div>
                    </div>
                </div>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
                <div>
                    <div style="font-size:12px; font-weight:600; color:var(--muted); margin-bottom:10px; letter-spacing:0.05em; text-transform:uppercase;">Phase Progress</div>
                    ${phaseStatBars}
                </div>
                <div>
                    <div style="font-size:12px; font-weight:600; color:var(--muted); margin-bottom:6px; letter-spacing:0.05em; text-transform:uppercase;">Today's Tasks (Day ${todayNum < 1 || todayNum > 101 ? '—' : todayNum})</div>
                    <div style="background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:6px 12px; max-height:200px; overflow-y:auto;">
                        ${todayNum >= 1 && todayNum <= 101 ? trackTaskRows : '<div style="font-size:12px; color:var(--muted); padding:8px 0;">No tasks for today.</div>'}
                    </div>
                    ${todayNum >= 1 && todayNum <= 101 && todayTasksDone === todayTasksTotal ? '<div style="font-size:11px; color:var(--success); margin-top:6px;">✓ All tracks done for today!</div>' : ''}
                    <button class="btn btn-secondary" onclick="showPage('roadmap')" style="margin-top:10px; width:100%; font-size:12px; padding:8px;">📋 Full Roadmap →</button>
                </div>
            </div>
        </div>`;

    updateRoadmapBadges();
}
function updateRoadmapBadges() {
    const el = document.getElementById('nav-roadmap-badge');
    if (el) el.textContent = Math.max(1, Math.min(101, roadmapTodayNumber())) + '/101';
}
function renderRoadmap() {
    const progress = DB.get('roadmap_progress', {});

    // --- Phase stat bars (stats only — progress bars removed, donut handles visuals) ---
    for (const [key, first, last] of [['overall', 1, 101], ['p1', 1, 30], ['p2', 31, 60], ['p3', 61, 101]]) {
        let done = 0;
        for (let d = first; d <= last; d++) if (roadmapDone(d, progress)) done++;
        const pct = Math.round(done / (last - first + 1) * 100);
        const statEl = document.getElementById('rm-stat-' + key);
        if (statEl) statEl.textContent = `${done}/${last - first + 1}`;
        if (key === 'overall') {
            const pctEl = document.getElementById('rm-pct-overall');
            if (pctEl) pctEl.textContent = pct + '% complete';
        }
    }

    // --- SVG donut ring for overall ---
    const overallDone = Object.keys(ROADMAP_DAYS).filter(d => roadmapDone(d, progress)).length;
    const overallPct = Math.round(overallDone / 101 * 100);
    const circ = 2 * Math.PI * 36;
    const donutArc = document.getElementById('rm-donut-arc');
    if (donutArc) donutArc.style.strokeDashoffset = circ - (circ * overallPct / 100);
    const donutPct = document.getElementById('rm-donut-pct');
    if (donutPct) donutPct.textContent = overallPct + '%';

    const days = Object.values(ROADMAP_DAYS).filter(d => roadmapPhase === 'all' || (d.day <= 30 ? 1 : d.day <= 60 ? 2 : 3) === roadmapPhase);
    if (!days.some(d => d.day === roadmapSelectedDay)) roadmapSelectedDay = days[0].day;
    document.getElementById('rm-day-select').innerHTML = days.map(d => `<option value="${d.day}">Day ${d.day} · ${esc(d.date)}</option>`).join('');
    document.getElementById('rm-day-select').value = roadmapSelectedDay;
    document.getElementById('rm-101-grid').innerHTML = days.map(d => `<button class="btn btn-secondary" id="rm-day-${d.day}" onclick="selectRoadmapDay(${d.day})" aria-pressed="${d.day === roadmapSelectedDay}" style="padding:6px;${roadmapDone(d.day, progress) ? 'background:var(--success);color:#000;' : d.day === roadmapTodayNumber() ? 'background:var(--accent);color:#000;' : ''}${d.day === roadmapSelectedDay ? 'outline:2px solid var(--accent2);' : ''}">${d.day}</button>`).join('');
    document.querySelectorAll('#rm-phase-filters .toggle-btn').forEach(b => b.classList.toggle('active', b.id === 'rm-filter-' + (roadmapPhase === 'all' ? 'all' : 'p' + roadmapPhase)));

    renderRoadmapDayDetail();
    renderRoadmapUpNext();
    renderRoadmapWeeklySummary();
}
function renderRoadmapUpNext() {
    const todayNum = roadmapTodayNumber();
    const progress = DB.get('roadmap_progress', {});
    const trackColors = { bd: '#c8a96e', tech: '#7c6ef0', content: '#38bdf8', islamic: '#4ade80', asset: '#fb923c' };
    const trackIcons = { bd: '💼', tech: '💻', content: '🎥', islamic: '🕌', asset: '📦' };
    const trackLabels = { bd: 'BD', tech: 'Tech', content: 'Content', islamic: 'Islamic', asset: 'Asset' };

    const upNextDays = [1, 2, 3].map(offset => {
        const dayNum = todayNum + offset;
        if (dayNum < 1 || dayNum > 101) return null;
        const dayData = ROADMAP_DAYS[dayNum];
        if (!dayData) return null;
        const isDone = roadmapDone(dayNum, progress);
        const tracksDone = Object.keys(ROADMAP_TRACKS).filter(t => progress[dayNum]?.[t]).length;
        const totalTracks = Object.keys(ROADMAP_TRACKS).length;
        const phase = dayNum <= 30 ? 1 : dayNum <= 60 ? 2 : 3;
        const phaseColors = { 1: '#c8a96e', 2: '#7c6ef0', 3: '#4ade80' };
        const trackDots = Object.keys(ROADMAP_TRACKS).map(t =>
            `<span style="width:7px;height:7px;border-radius:50%;background:${progress[dayNum]?.[t] ? trackColors[t] : 'var(--border)'}; display:inline-block;"></span>`
        ).join('');

        return `<div style="background:var(--surface2); border-radius:10px; padding:12px 14px; border:1px solid var(--border);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <span style="font-size:13px; font-weight:600;">Day ${dayNum} · ${esc(dayData.date)}</span>
                <span style="font-size:10px; font-weight:600; color:${phaseColors[phase]}; background:${phaseColors[phase]}22; padding:2px 8px; border-radius:8px;">Phase ${phase}</span>
            </div>
            <div style="font-size:11px; color:var(--muted); margin-bottom:8px;">BD: ${esc(dayData.bd.slice(0, 60))}${dayData.bd.length > 60 ? '…' : ''}</div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; gap:4px;">${trackDots}</div>
                <span style="font-size:11px; color:${tracksDone === totalTracks ? 'var(--success)' : 'var(--muted)'};">${tracksDone}/${totalTracks} tracks</span>
            </div>
        </div>`;
    }).filter(Boolean);

    document.getElementById('rm-up-next').innerHTML = upNextDays.length
        ? upNextDays.join('')
        : '<div style="font-size:12px; color:var(--muted);">No upcoming days within roadmap range.</div>';
}
function renderRoadmapWeeklySummary() {
    const todayNum = roadmapTodayNumber();
    const progress = DB.get('roadmap_progress', {});
    const trackColors = { bd: '#c8a96e', tech: '#7c6ef0', content: '#38bdf8', islamic: '#4ade80', asset: '#fb923c' };
    const trackLabels = { bd: 'BD', tech: 'Tech', content: 'Content', islamic: 'Islamic', asset: 'Asset' };

    // Calculate roadmap day number from calendar date string (e.g. "2026-09-22" => 1)
    function calDateToRoadmapDay(dateStr) {
        const start = new Date('2026-09-22T00:00:00');
        const d = new Date(dateStr + 'T00:00:00');
        const diffMs = d - start;
        if (isNaN(diffMs)) return null;
        const diffDays = Math.floor(diffMs / 86400000) + 1;
        return diffDays;
    }

    // --- 7-day heatmap ---
    const weekDates = getWeekDates(todayStr());
    const doneThisWeek = weekDates.reduce((count, ds) => {
        const rd = calDateToRoadmapDay(ds);
        if (rd !== null && rd >= 1 && rd <= 101 && roadmapDone(String(rd), progress)) return count + 1;
        return count;
    }, 0);
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    // Calculate streak
    let streak = 0;
    for (let i = todayNum; i >= 1; i--) {
        if (roadmapDone(String(i), progress)) streak++;
        else break;
    }

    document.getElementById('rm-week-done').textContent = doneThisWeek;
    document.getElementById('rm-week-streak').textContent = streak;

    document.getElementById('rm-week-heatmap').innerHTML = weekDates.map((ds, i) => {
        const rd = calDateToRoadmapDay(ds);
        if (rd === null || rd < 1 || rd > 101) {
            return `<div style="text-align:center; width:28px;" title="${ds}: Outside roadmap">
                <div style="width:20px;height:20px;border-radius:4px;background:var(--surface2);opacity:0.3;margin:0 auto;"></div>
                <div style="font-size:9px;color:var(--muted);margin-top:2px;">${dayNames[i]}</div>
            </div>`;
        }
        const done = roadmapDone(String(rd), progress);
        const doneCount = Object.keys(ROADMAP_TRACKS).filter(t => progress[rd]?.[t]).length;
        const bg = done ? 'var(--success)' : doneCount > 0 ? 'var(--accent)' : 'var(--surface2)';
        const isToday = ds === todayStr();
        return `<div style="text-align:center; width:28px;" title="${ds} Day ${rd}: ${doneCount}/5 tracks">
            <div style="width:20px;height:20px;border-radius:4px;background:${bg};margin:0 auto;${isToday ? 'outline:2px solid var(--accent);outline-offset:1px;' : ''}border:${isToday ? '' : '1px solid var(--border)'};"></div>
            <div style="font-size:9px;color:${isToday ? 'var(--accent)' : 'var(--muted)'};margin-top:2px;">${dayNames[i]}</div>
        </div>`;
    }).join('');

    // --- Track completion for this week ---
    const trackCounts = { bd: 0, tech: 0, content: 0, islamic: 0, asset: 0 };
    let validDays = 0;
    weekDates.forEach(ds => {
        const rd = calDateToRoadmapDay(ds);
        if (rd === null || rd < 1 || rd > 101) return;
        validDays++;
        Object.keys(ROADMAP_TRACKS).forEach(t => { if (progress[rd]?.[t]) trackCounts[t]++; });
    });

    document.getElementById('rm-week-tracks').innerHTML = Object.entries(trackCounts).map(([track, cnt]) => {
        const pct = validDays > 0 ? Math.round(cnt / validDays * 100) : 0;
        return `<div>
            <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:3px;">
                <span style="color:${trackColors[track]};">${trackLabels[track]}</span>
                <span style="color:var(--muted);">${cnt}/${validDays}</span>
            </div>
            <div style="height:5px; background:var(--surface2); border-radius:3px;">
                <div style="height:5px; width:${pct}%; background:${trackColors[track]}; border-radius:3px;"></div>
            </div>
        </div>`;
    }).join('');
}

// --- Roadmap data validation ---
function validateRoadmapData() {
    const errors = [];
    const totalDays = Object.keys(ROADMAP_DAYS).length;
    if (totalDays < 101) errors.push(`Only ${totalDays} days in roadmap, expected 101.`);
    Object.entries(ROADMAP_DAYS).forEach(([dayNum, dayData]) => {
        const d = parseInt(dayNum);
        if (d < 1 || d > 101) errors.push(`Day ${dayNum} is out of range.`);
        ['bd', 'tech', 'content', 'islamic', 'asset'].forEach(track => {
            if (!dayData[track]) errors.push(`Day ${dayNum} missing "${track}" task.`);
        });
    });
    return errors;
}

// --- Roadmap streak ---
function getRoadmapStreak() {
    const progress = DB.get('roadmap_progress', {});
    let streak = 0;
    for (let i = roadmapTodayNumber(); i >= 1; i--) {
        if (roadmapDone(String(i), progress)) streak++;
        else break;
    }
    return streak;
}
function renderRoadmapDayDetail() {
    const day = ROADMAP_DAYS[roadmapSelectedDay];
    if (!day) return;
    const progress = DB.get('roadmap_progress', {})[day.day] || {};
    const trackColors = { bd: '#c8a96e', tech: '#7c6ef0', content: '#38bdf8', islamic: '#4ade80', asset: '#fb923c' };
    const trackIcons = { bd: '💼', tech: '💻', content: '🎥', islamic: '🕌', asset: '📦' };

    const dayPhase = day.day <= 30 ? 1 : day.day <= 60 ? 2 : 3;
    const phaseColors = { 1: '#c8a96e', 2: '#7c6ef0', 3: '#4ade80' };
    const phaseLabels = { 1: 'Foundation (1–30)', 2: 'First Revenue (31–60)', 3: 'Systemization (61–101)' };

    const tracksHtml = Object.entries(ROADMAP_TRACKS).map(([track, label]) => {
        const isDone = progress[track] || false;
        const color = trackColors[track];
        const icon = trackIcons[track];
        const task = day[track] || '—';
        return `<label style="display:flex; align-items:flex-start; gap:12px; padding:12px 0; border-bottom:1px solid var(--border); cursor:pointer; transition:opacity 0.2s; ${isDone ? 'opacity:0.55;' : ''}">
            <input type="checkbox" ${isDone ? 'checked' : ''}
                onchange="toggleRoadmapTrack(${day.day}, '${track}', this.checked)"
                style="margin-top:4px; accent-color:${color}; width:16px; height:16px; cursor:pointer; flex-shrink:0;">
            <div style="flex:1; min-width:0;">
                <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
                    <span style="font-size:14px;">${icon}</span>
                    <span style="font-size:12px; font-weight:600; color:${color};">${esc(label)}</span>
                    ${isDone ? '<span style="font-size:10px; font-weight:600; color:var(--success); background:rgba(74,222,128,0.1); padding:1px 7px; border-radius:8px;">✓ Complete</span>' : ''}
                </div>
                <div style="font-size:12px; color:var(--text); line-height:1.5; ${isDone ? 'text-decoration:line-through; color:var(--muted);' : ''}">${esc(task)}</div>
            </div>
        </label>`;
    }).join('');

    const tracksDone = Object.keys(ROADMAP_TRACKS).filter(t => progress[t]).length;
    const allDone = tracksDone === Object.keys(ROADMAP_TRACKS).length;

    document.getElementById('rm-day-detail-card').innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
            <div>
                <h3 style="font-family:'DM Serif Display',serif; font-size:18px; margin-bottom:2px;">Day ${day.day} · ${esc(day.date)}, 2026</h3>
                <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                    <span style="font-size:11px; color:${phaseColors[dayPhase]}; background:${phaseColors[dayPhase]}18; padding:2px 8px; border-radius:6px;">${phaseLabels[dayPhase]}</span>
                    <span style="font-size:11px; color:var(--muted);">${tracksDone}/${Object.keys(ROADMAP_TRACKS).length} tracks</span>
                </div>
            </div>
            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                <div style="display:flex; align-items:center; gap:6px; font-size:12px; color:${allDone ? 'var(--success)' : 'var(--muted)'};">
                    ${allDone ? '✓ All Done' : `${tracksDone} of ${Object.keys(ROADMAP_TRACKS).length} complete`}
                </div>
                ${day.day === roadmapTodayNumber() && !allDone
                    ? `<button class="btn btn-primary" onclick="markAllRoadmapDoneToday()" style="font-size:12px; padding:7px 14px;">✓ Mark Today Complete</button>`
                    : ''}
            </div>
        </div>
        <div style="margin-top:8px;">${tracksHtml}</div>`;
}
function selectRoadmapDay(day) { roadmapSelectedDay = safeInt(day, 1, 101, 1); renderRoadmap(); }
function filterRoadmapPhase(phase) { roadmapPhase = [1, 2, 3].includes(Number(phase)) ? Number(phase) : 'all'; renderRoadmap(); }
function jumpToRoadmapToday() {
    roadmapPhase = 'all'; selectRoadmapDay(Math.max(1, Math.min(101, roadmapTodayNumber())));
    document.getElementById('rm-day-' + roadmapSelectedDay)?.scrollIntoView({ block: 'nearest' });
}
function toggleRoadmapTrack(day, track, checked) {
    if (!ROADMAP_DAYS[day] || !Object.hasOwn(ROADMAP_TRACKS, track)) return;
    const progress = DB.get('roadmap_progress', {});
    progress[day] = { ...progress[day], [track]: checked };
    if (DB.set('roadmap_progress', progress)) { renderRoadmap(); renderRoadmapHeroWidget(); }
}
function markAllRoadmapDoneToday() {
    const day = roadmapTodayNumber();
    if (!ROADMAP_DAYS[day]) return showToast('Today is outside the roadmap dates. Select a day to update its tasks.');
    const progress = DB.get('roadmap_progress', {});
    progress[day] = Object.fromEntries(Object.keys(ROADMAP_TRACKS).map(t => [t, true]));
    if (DB.set('roadmap_progress', progress)) { jumpToRoadmapToday(); renderRoadmapHeroWidget(); showToast('Today completed ✓'); }
}

// Each editor uses the existing modal fields and the same local storage layer.
const HUB_EDITORS = {
    prospect: { key: 'crm_prospects', modal: 'modal-prospect', prefix: 'crm-p-', title: 'prospect-modal-title', label: 'Prospect', required: 'name', fields: ['name', 'company', 'niche', 'channel', 'stage', 'offer', 'value', 'followup', 'b', 'a', 'n', 't', 'link', 'notes'], defaults: { niche: 'Pharmacy', channel: 'LinkedIn', stage: 'prospect', offer: 'Health Check' } },
    tech: { key: 'tech_content', modal: 'modal-content-tech', prefix: 'tcont-', title: 'tech-content-modal-title', label: 'Tech Content Piece', required: 'title', fields: ['title', 'problem', 'status', 'date', 'long-link', 'short1', 'short2', 'short3', 'li1', 'li2'], defaults: { status: 'Idea' } },
    islamic: { key: 'islamic_content', modal: 'modal-content-islamic', prefix: 'icont-', title: 'isl-content-modal-title', label: 'Islamic Content Piece', required: 'title', fields: ['title', 'cat', 'date', 'source', 'v1', 'v2', 'v3', 'v4', 'v5', 'notes', 'link'], defaults: { cat: 'Quran Lesson' } },
    idea: { key: 'content_ideas', modal: 'modal-content-idea', prefix: 'idea-', title: 'idea-modal-title', label: 'Content / Asset Idea', required: 'title', fields: ['title', 'type', 'priority', 'notes'], defaults: { type: 'tech', priority: 'medium' } }
};
const hubEditingIds = {};
function openHubEditor(kind, id = null) {
    const config = HUB_EDITORS[kind];
    const item = id === null ? {} : DB.get(config.key, []).find(p => p.id === id);
    if (!item) return showToast('This item no longer exists.');
    hubEditingIds[kind] = id;
    config.fields.forEach(field => {
        const el = document.getElementById(config.prefix + field);
        if (el.type === 'checkbox') el.checked = !!item[field];
        else el.value = item[field] ?? config.defaults[field] ?? (field === 'date' ? todayStr() : '');
    });
    document.getElementById(config.title).textContent = (id === null ? 'New ' : 'Edit ') + config.label;
    document.getElementById(config.prefix + 'delete-btn').style.display = id === null ? 'none' : 'inline-block';
    openModal(config.modal);
}
function saveHubEditor(kind) {
    const config = HUB_EDITORS[kind];
    const items = DB.get(config.key, []);
    const id = hubEditingIds[kind];
    const item = { ...(items.find(p => p.id === id) || {}), id: id ?? genId() };
    config.fields.forEach(field => {
        const el = document.getElementById(config.prefix + field);
        item[field] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? safeNum(el.value) : el.value.trim();
    });
    if (!item[config.required]) return showToast('Please enter a ' + config.required + '.');
    if (kind === 'islamic' && item.link && (!item.source || !['v1', 'v2', 'v3', 'v4', 'v5'].every(f => item[f]))) return showToast('Complete the source and all five verification steps before adding a published link.');
    const index = items.findIndex(p => p.id === item.id);
    if (index < 0) items.push(item); else items[index] = item;
    if (!DB.set(config.key, items)) return;
    closeModal(config.modal);
    if (kind === 'prospect') renderCrmPage(); else { switchContentTab(kind === 'idea' ? 'ideas' : kind); }
    showToast(config.label + ' saved ✓');
}
function deleteHubItem(kind) {
    const config = HUB_EDITORS[kind];
    const id = hubEditingIds[kind];
    if (id == null || !confirm('Delete this ' + config.label.toLowerCase() + '?')) return;
    if (!DB.set(config.key, DB.get(config.key, []).filter(p => p.id !== id))) return;
    closeModal(config.modal);
    if (kind === 'prospect') renderCrmPage(); else renderContentHub();
}
function openProspectModal(id = null) { openHubEditor('prospect', id); }
function saveProspect() { saveHubEditor('prospect'); }
function deleteCurrentProspect() { deleteHubItem('prospect'); }
function openTechContentModal(id = null) { openHubEditor('tech', id); }
function saveTechContent() { saveHubEditor('tech'); }
function deleteCurrentTechContent() { deleteHubItem('tech'); }
function openIslamicContentModal(id = null) { openHubEditor('islamic', id); }
function saveIslamicContent() { saveHubEditor('islamic'); }
function deleteCurrentIslamicContent() { deleteHubItem('islamic'); }
function openIdeaModal(id = null) { openHubEditor('idea', id); }
function saveIdea() { saveHubEditor('idea'); }
function deleteCurrentIdea() { deleteHubItem('idea'); }
function switchHubTabs(prefix, toggle, tabs, selected) {
    if (!tabs.includes(selected)) return;
    tabs.forEach(tab => document.getElementById(prefix + tab).style.display = tab === selected ? 'block' : 'none');
    document.querySelectorAll('#' + toggle + ' .toggle-btn').forEach((b, i) => b.classList.toggle('active', tabs[i] === selected));
}
function switchCrmTab(tab) { switchHubTabs('crm-tab-', 'crm-view-toggle', ['pipeline', 'table', 'offers', 'scripts'], tab); renderCrmPage(); }
function hubEditButton(kind, id) {
    return `<button class="btn btn-secondary" data-kind="${kind}" data-id="${esc(id)}" onclick="openHubEditor(this.dataset.kind, this.dataset.id)">Edit</button>`;
}
function renderCrmPage() {
    const items = DB.get('crm_prospects', []);
    const stages = Array.from(document.getElementById('crm-p-stage').options);
    const metrics = { total: items.length, qualified: items.filter(p => p.stage === 'qualified' || ['b', 'a', 'n', 't'].every(f => p[f])).length, calls: items.filter(p => p.stage === 'discovery').length, proposals: items.filter(p => p.stage === 'proposal').length, closed: items.filter(p => ['closed_won', 'care_plan'].includes(p.stage)).length, val: items.filter(p => !['closed_lost', 'closed_won', 'care_plan'].includes(p.stage)).reduce((sum, p) => sum + safeNum(p.value), 0) };
    Object.entries(metrics).forEach(([key, value]) => document.getElementById('crm-stat-' + key).textContent = key === 'val' ? value.toLocaleString() : value);
    document.getElementById('crm-kanban-board').innerHTML = stages.map(stage => `<section class="card"><h3>${esc(stage.textContent)}</h3>${items.filter(p => p.stage === stage.value).map(p => `<div style="margin-top:12px;"><b>${esc(p.name)}</b><p>${esc(p.company)} · ${safeNum(p.value).toLocaleString()}</p><p>Follow-up: ${esc(p.followup || 'Not set')}</p>${hubEditButton('prospect', p.id)}</div>`).join('') || '<p>No prospects</p>'}</section>`).join('');
    document.getElementById('crm-table-container').innerHTML = `<table style="width:100%;"><thead><tr><th>Name</th><th>Company</th><th>Stage</th><th>Value</th><th>Action</th></tr></thead><tbody>${items.map(p => `<tr><td>${esc(p.name)}</td><td>${esc(p.company)}</td><td>${esc(stages.find(s => s.value === p.stage)?.textContent || p.stage)}</td><td>${safeNum(p.value).toLocaleString()}</td><td>${hubEditButton('prospect', p.id)}</td></tr>`).join('') || '<tr><td colspan="5">No prospects yet. Add your first prospect.</td></tr>'}</tbody></table>`;
}
function switchContentTab(tab) { switchHubTabs('content-tab-', 'content-tab-toggle', ['tech', 'islamic', 'ideas'], tab); renderContentHub(); }
function renderContentHub() {
    for (const [kind, container] of [['tech', 'tech-content-list'], ['islamic', 'islamic-content-list'], ['idea', 'idea-bank-list']]) {
        const items = DB.get(HUB_EDITORS[kind].key, []);
        document.getElementById(container).innerHTML = items.map(item => {
            const detail = kind === 'tech' ? `${item.status} · ${['long-link', 'short1', 'short2', 'short3', 'li1', 'li2'].filter(f => item[f]).length}/6 repurposing items` : kind === 'islamic' ? `${['v1', 'v2', 'v3', 'v4', 'v5'].filter(f => item[f]).length}/5 verification steps · ${item.link ? 'Published' : 'Draft'}` : `${item.type} · ${item.priority} priority`;
            return `<div class="card"><h3>${esc(item.title)}</h3><p>${esc(detail)}</p><p>${esc(item.problem || item.notes || '')}</p>${hubEditButton(kind, item.id)}</div>`;
        }).join('') || '<div class="card">No items yet. Use the buttons above to add one.</div>';
    }
}
function renderKpiPage() {
    const select = document.getElementById('kpi-week-select');
    const week = select.value || Math.max(1, Math.min(15, Math.ceil(roadmapTodayNumber() / 7)));
    select.innerHTML = Array.from({ length: 15 }, (_, i) => `<option value="${i + 1}">Week ${i + 1}</option>`).join('');
    loadKpiForWeek(week);
    document.querySelectorAll('#page-kpi input[id^="sc-"]').forEach(el => el.checked = !!DB.get('scorecard_' + el.id.split('-')[1], {})[el.id]);
}
function loadKpiForWeek(week) {
    week = safeInt(week, 1, 15, 1);
    document.getElementById('kpi-week-select').value = week;
    document.getElementById('kpi-week-label').textContent = 'Week ' + week;
    const saved = DB.get('kpi_week_' + week, {});
    document.querySelectorAll('#page-kpi input[id^="kpi-"], #kpi-isl-verified').forEach(el => el.value = saved[el.id] ?? (el.id === 'kpi-isl-verified' ? 'yes' : 0));
}
function saveCurrentWeekKpi() {
    const data = {};
    document.querySelectorAll('#page-kpi input[id^="kpi-"], #kpi-isl-verified').forEach(el => data[el.id] = el.type === 'number' ? safeNum(el.value, 0, el.id === 'kpi-cont-ctr' ? 100 : 1e9) : el.value);
    const week = safeInt(document.getElementById('kpi-week-select').value, 1, 15, 1);
    if (DB.set('kpi_week_' + week, data)) showToast('Weekly KPIs saved ✓');
}
function saveScorecard(month) {
    if (!['sep', 'oct', 'nov', 'dec'].includes(month)) return;
    const data = {};
    document.querySelectorAll('#page-kpi input[id^="sc-' + month + '-"]').forEach(el => data[el.id] = el.checked);
    DB.set('scorecard_' + month, data);
}

