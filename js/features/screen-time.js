// ============================================================
// SCREEN TIME PAGE
// ============================================================
function getScreenGoal() { return DB.get('screen_daily_goal_mins', 0); }

function saveScreenGoal() {
    const val = parseInt(document.getElementById('screen-goal-input').value) || 0;
    DB.set('screen_daily_goal_mins', val);
    renderScreenGoal();
    showToast(val > 0 ? `Goal set: ${val} min/day` : 'Goal cleared.');
}

function renderScreenGoal() {
    const goal = getScreenGoal();
    const input = document.getElementById('screen-goal-input');
    if (input && !input.value && goal > 0) input.value = goal;

    const appLogToday = DB.get('app_usage_log', []).filter(e => e.date === todayStr());
    const usedMins = appLogToday.reduce((a, e) => a + (e.mins || 0), 0);

    const wrap = document.getElementById('screen-goal-progress-wrap');
    const empty = document.getElementById('screen-goal-empty');
    const bar = document.getElementById('screen-goal-bar');
    const label = document.getElementById('screen-goal-label');
    const pctEl = document.getElementById('screen-goal-pct');
    const remEl = document.getElementById('screen-goal-remaining');

    if (!goal) {
        if (wrap) wrap.style.display = 'none';
        if (empty) empty.style.display = 'block';
        return;
    }
    if (wrap) wrap.style.display = 'block';
    if (empty) empty.style.display = 'none';

    const pct = Math.min(Math.round(usedMins / goal * 100), 100);
    const over = usedMins > goal;
    const overMins = usedMins - goal;
    const remMins = goal - usedMins;

    if (bar) {
        bar.style.width = pct + '%';
        bar.style.background = over ? 'var(--danger)' : pct >= 80 ? '#fb923c' : 'var(--success)';
    }
    if (label) label.textContent = `${usedMins} / ${goal} min used`;
    if (pctEl) {
        pctEl.textContent = pct + '%';
        pctEl.style.color = over ? 'var(--danger)' : pct >= 80 ? '#fb923c' : 'var(--success)';
    }
    if (remEl) {
        if (over) {
            remEl.textContent = `⚠ ${overMins} min over your daily goal`;
            remEl.style.color = 'var(--danger)';
        } else {
            remEl.textContent = `${remMins} min remaining today`;
            remEl.style.color = 'var(--muted)';
        }
    }

    // Inject overall goal alert into danger alerts if exceeded
    const alertEl = document.getElementById('screen-danger-alerts');
    if (alertEl && over) {
        const existing = alertEl.querySelector('.goal-exceeded-alert');
        if (!existing) {
            const div = document.createElement('div');
            div.className = 'goal-exceeded-alert';
            div.style.cssText = 'padding:12px 16px;border-radius:10px;margin-bottom:8px;font-size:13px;line-height:1.5;background:rgba(248,113,113,0.12);border:1px solid rgba(248,113,113,0.35);color:var(--danger);';
            div.innerHTML = `🚫 <strong>Daily goal exceeded!</strong> You've used ${usedMins} min — ${overMins} min over your ${goal}-min limit.`;
            alertEl.prepend(div);
        }
    }
}

function getScreenTotalHrsForDate(dateStr) {
    const appLog = DB.get('app_usage_log', []).filter(e => e.date === dateStr);
    return calcTotalScreenHrs(appLog);
}

function renderScreenTime() {
    const todayD = todayStr();
    const appLogToday = DB.get('app_usage_log', []).filter(e => e.date === todayD);
    const totalHrs = calcTotalScreenHrs(appLogToday);
    const prodHrs = calcProductiveHrs(todayD);

    // Keep day.screen in sync for dashboard
    const today = DB.getDay(todayD);
    today.screen = { total: totalHrs, productive: prodHrs };
    DB.setDay(todayD, today);

    document.getElementById('screen-today').textContent = totalHrs + 'h';
    document.getElementById('screen-productive-today').textContent = prodHrs + 'h';

    // Week avg — computed live from app_usage_log
    const last7 = getLast7Days();
    const weekVals = last7.map(d => getScreenTotalHrsForDate(d));
    const prodVals = last7.map(d => {
        const studyHrs = getTotalStudyHrs(d);
        const appLog = DB.get('app_usage_log', []).filter(e => e.date === d);
        const appProdMins = appLog.filter(e => e.category === 'Productivity' || e.category === 'Education')
            .reduce((a, e) => a + (e.mins || 0), 0);
        return +(studyHrs + appProdMins / 60).toFixed(1);
    });
    const avg = weekVals.reduce((a, v) => a + v, 0) / 7;
    document.getElementById('screen-week-avg').textContent = avg.toFixed(1) + 'h';

    // ---- SVG Line Chart ----
    const chartW = 480, chartH = 130, padL = 30, padR = 12, padT = 14, padB = 28;
    const innerW = chartW - padL - padR;
    const innerH = chartH - padT - padB;
    const maxVal = Math.max(...weekVals, ...prodVals, 1);

    const xPos = i => padL + (i / (last7.length - 1)) * innerW;
    const yPos = v => padT + innerH - (v / maxVal) * innerH;

    const makePath = vals => {
        return vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${xPos(i).toFixed(1)},${yPos(v).toFixed(1)}`).join(' ');
    };

    const makeArea = vals => {
        const top = vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${xPos(i).toFixed(1)},${yPos(v).toFixed(1)}`).join(' ');
        const bottom = `L${xPos(last7.length - 1).toFixed(1)},${(padT + innerH).toFixed(1)} L${padL.toFixed(1)},${(padT + innerH).toFixed(1)} Z`;
        return top + ' ' + bottom;
    };

    // Y-axis gridlines
    const gridLines = [0, 0.25, 0.5, 0.75, 1].map(r => {
        const y = (padT + innerH - r * innerH).toFixed(1);
        const label = (maxVal * r).toFixed(1).replace(/\.0$/, '');
        return `<line x1="${padL}" y1="${y}" x2="${chartW - padR}" y2="${y}" stroke="var(--border)" stroke-width="1"/>
            <text x="${(padL - 4)}" y="${y}" text-anchor="end" dominant-baseline="middle" font-size="9" fill="var(--muted)" font-family="DM Sans,sans-serif">${label}</text>`;
    }).join('');

    // X-axis labels + dots
    const xLabels = last7.map((d, i) => {
        const x = xPos(i).toFixed(1);
        const label = new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' });
        const tot = weekVals[i], prod = prodVals[i];
        return `<text x="${x}" y="${(chartH - 4)}" text-anchor="middle" font-size="9" fill="var(--muted)" font-family="DM Sans,sans-serif">${label}</text>
            <circle cx="${x}" cy="${yPos(tot).toFixed(1)}" r="3.5" fill="var(--danger)" stroke="var(--surface)" stroke-width="1.5"/>
            <circle cx="${x}" cy="${yPos(prod).toFixed(1)}" r="3.5" fill="var(--success)" stroke="var(--surface)" stroke-width="1.5"/>`;
    }).join('');

    const svgChart = `<svg viewBox="0 0 ${chartW} ${chartH}" style="width:100%;height:auto;display:block;" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="scGradTotal" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--danger)" stop-opacity="0.18"/>
        <stop offset="100%" stop-color="var(--danger)" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="scGradProd" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--success)" stop-opacity="0.15"/>
        <stop offset="100%" stop-color="var(--success)" stop-opacity="0"/>
      </linearGradient>
    </defs>
    ${gridLines}
    <path d="${makeArea(weekVals)}" fill="url(#scGradTotal)"/>
    <path d="${makeArea(prodVals)}" fill="url(#scGradProd)"/>
    <path d="${makePath(weekVals)}" fill="none" stroke="var(--danger)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="${makePath(prodVals)}" fill="none" stroke="var(--success)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${xLabels}
  </svg>`;

    const bc = document.getElementById('screen-week-chart');
    const lc = document.getElementById('screen-week-labels');
    bc.style.cssText = 'display:block;';
    bc.innerHTML = svgChart;
    lc.style.display = 'none';
    lc.innerHTML = '';

    // Legend (remove old one first)
    const oldLegend = document.getElementById('screen-chart-legend');
    if (oldLegend) oldLegend.remove();
    bc.insertAdjacentHTML('afterend', `
    <div id="screen-chart-legend" style="display:flex;gap:16px;margin-top:10px;flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted);">
        <div style="width:20px;height:2px;background:var(--danger);border-radius:1px;"></div> Total Screen Time
      </div>
      <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted);">
        <div style="width:20px;height:2px;background:var(--success);border-radius:1px;"></div> Productive (Study + Quran + Books + Skills)
      </div>
    </div>`);

    renderAppUsage();
    renderScreenGoal();
}

// ============================================================
// APP USAGE TRACKER
// ============================================================
const APP_CAT_DANGER = {
    'Social Media': { soft: 60, hard: 120, label: 'social media' },
    'Entertainment': { soft: 90, hard: 180, label: 'entertainment' },
    'Gaming': { soft: 60, hard: 120, label: 'gaming' },
    'News': { soft: 30, hard: 60, label: 'news browsing' },
    'Shopping': { soft: 30, hard: 60, label: 'shopping' },
    'Productivity': { soft: 240, hard: 480, label: 'productivity' },
    'Education': { soft: 240, hard: 480, label: 'education' },
    'Communication': { soft: 60, hard: 120, label: 'messaging' },
    'Health & Fitness': { soft: 60, hard: 120, label: 'health & fitness' },
    'Other': { soft: 120, hard: 240, label: 'other apps' }
};

const APP_CAT_COLORS = {
    'Social Media': '#f87171', 'Entertainment': '#fb923c', 'Gaming': '#f472b6',
    'Productivity': 'var(--success)', 'Education': 'var(--accent2)', 'Communication': 'var(--accent)',
    'News': '#facc15', 'Shopping': '#a78bfa', 'Health & Fitness': '#34d399', 'Other': 'var(--muted)'
};

function addAppUsage() {
    const name = document.getElementById('app-name-input').value.trim();
    const category = document.getElementById('app-category-input').value;
    const mins = parseInt(document.getElementById('app-mins-input').value) || 0;
    const limit = parseInt(document.getElementById('app-limit-input').value) || 0;
    if (!name) return void showToast('Please enter an app name.');
    if (!mins || mins <= 0) return void showToast('Please enter time spent.');
    const logs = DB.get('app_usage_log', []);
    // Merge with existing entry for same app today
    const todayStr_ = todayStr();
    const existing = logs.findIndex(e => e.date === todayStr_ && e.name.toLowerCase() === name.toLowerCase());
    if (existing >= 0) {
        logs[existing].mins += mins;
        if (limit) logs[existing].limit = limit;
    } else {
        logs.push({ id: genId(), date: todayStr_, name, category, mins, limit });
    }
    DB.set('app_usage_log', logs);
    document.getElementById('app-name-input').value = '';
    document.getElementById('app-mins-input').value = '';
    document.getElementById('app-limit-input').value = '';
    renderAppUsage();
    showToast('App usage logged!');
}

function removeAppEntry(id) {
    DB.set('app_usage_log', DB.get('app_usage_log', []).filter(e => e.id !== id));
    renderAppUsage();
}

function renderAppUsage() {
    const all = DB.get('app_usage_log', []);
    const today = todayStr();
    const weekD = getWeekDates(today);
    const todayE = all.filter(e => e.date === today).sort((a, b) => b.mins - a.mins);
    const weekE = all.filter(e => weekD.includes(e.date));

    // ---- Danger alerts ----
    const alerts = [];
    // Per-app limit alerts (today)
    todayE.forEach(e => {
        if (e.limit && e.mins >= e.limit) {
            const pct = Math.round(e.mins / e.limit * 100);
            const lvl = pct >= 150 ? 'critical' : 'warning';
            alerts.push({ lvl, msg: `<strong>${esc(e.name)}</strong>: ${e.mins} min used — ${pct}% of your ${e.limit}-min daily limit.` });
        }
    });
    // Per-category threshold alerts (today)
    const catTotals = {};
    todayE.forEach(e => { catTotals[e.category] = (catTotals[e.category] || 0) + e.mins; });
    Object.entries(catTotals).forEach(([cat, mins]) => {
        const thres = APP_CAT_DANGER[cat];
        if (!thres) return;
        if (mins >= thres.hard) {
            alerts.push({ lvl: 'critical', msg: `🚨 <strong>${mins} min</strong> on ${thres.label} today — this is dangerously high. Consider a digital detox.` });
        } else if (mins >= thres.soft) {
            alerts.push({ lvl: 'warning', msg: `⚠️ <strong>${mins} min</strong> on ${thres.label} today — approaching excessive use.` });
        }
    });
    // Total screen time vs productive ratio
    const totalMins = todayE.reduce((a, e) => a + e.mins, 0);
    const wasteCats = ['Social Media', 'Entertainment', 'Gaming', 'Shopping', 'News'];
    const wasteMins = todayE.filter(e => wasteCats.includes(e.category)).reduce((a, e) => a + e.mins, 0);
    if (totalMins > 0 && wasteMins / totalMins > 0.6 && totalMins >= 60) {
        alerts.push({ lvl: 'warning', msg: `📊 Over 60% of your logged screen time today is unproductive (${wasteMins}/${totalMins} min).` });
    }

    const alertEl = document.getElementById('screen-danger-alerts');
    if (alerts.length) {
        alertEl.innerHTML = alerts.map(a => `
      <div style="
        padding:12px 16px; border-radius:10px; margin-bottom:8px; font-size:13px; line-height:1.5;
        background:${a.lvl === 'critical' ? 'rgba(248,113,113,0.12)' : 'rgba(251,146,60,0.12)'};
        border:1px solid ${a.lvl === 'critical' ? 'rgba(248,113,113,0.35)' : 'rgba(251,146,60,0.35)'};
        color:${a.lvl === 'critical' ? 'var(--danger)' : '#fb923c'};
      ">${a.msg}</div>
    `).join('');
    } else {
        alertEl.innerHTML = totalMins > 0
            ? `<div style="padding:10px 14px; border-radius:10px; font-size:13px; background:rgba(74,222,128,0.08); border:1px solid rgba(74,222,128,0.2); color:var(--success);">✓ Your screen time looks healthy today. Keep it up!</div>`
            : '';
    }

    // ---- Today's app list ----
    document.getElementById('app-today-list').innerHTML = todayE.length ? todayE.map(e => {
        const col = APP_CAT_COLORS[e.category] || 'var(--muted)';
        const pct = e.limit ? Math.min(Math.round(e.mins / e.limit * 100), 100) : 0;
        const over = e.limit && e.mins >= e.limit;
        return `
    <div style="background:var(--surface2); border-radius:10px; padding:12px 14px; margin-bottom:8px; border-left:3px solid ${col};">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:${e.limit ? '8px' : '0'};">
        <div>
          <span style="font-size:13px; font-weight:600;">${esc(e.name)}</span>
          <span style="font-size:11px; color:var(--muted); margin-left:8px;">${esc(e.category)}</span>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="font-size:13px; font-weight:600; color:${over ? 'var(--danger)' : 'var(--text)'};">${e.mins} min${e.mins >= 60 ? ' (' + (e.mins / 60).toFixed(1) + 'h)' : ''}</span>
          <button class="btn btn-ghost" onclick="removeAppEntry('${e.id}')" style="font-size:13px; padding:2px 6px;">✕</button>
        </div>
      </div>
      ${e.limit ? `
        <div style="height:5px; background:var(--border); border-radius:3px; overflow:hidden;">
          <div style="height:5px; width:${pct}%; background:${over ? 'var(--danger)' : col}; border-radius:3px; transition:width 0.3s;"></div>
        </div>
        <div style="font-size:10px; color:var(--muted); margin-top:3px;">${e.mins}/${e.limit} min limit${over ? ' — limit exceeded!' : ''}</div>
      ` : ''}
    </div>`;
    }).join('') : '<div style="color:var(--muted); font-size:13px;">No app usage logged today.</div>';

    // ---- Weekly breakdown ----
    const weekTotals = {};
    weekE.forEach(e => {
        if (!weekTotals[e.name]) weekTotals[e.name] = { mins: 0, category: e.category };
        weekTotals[e.name].mins += e.mins;
    });
    const sorted = Object.entries(weekTotals).sort((a, b) => b[1].mins - a[1].mins).slice(0, 10);
    const maxM = sorted.length ? sorted[0][1].mins : 1;
    document.getElementById('app-week-breakdown').innerHTML = sorted.length ? sorted.map(([name, data]) => {
        const col = APP_CAT_COLORS[data.category] || 'var(--muted)';
        const pct = Math.round(data.mins / maxM * 100);
        const hrs = (data.mins / 60).toFixed(1);
        return `
    <div style="margin-bottom:12px;">
      <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
        <span style="font-size:13px; font-weight:500;">${esc(name)} <span style="font-size:11px; color:var(--muted); font-weight:400;">[${data.category}]</span></span>
        <span style="font-size:12px; color:var(--muted);">${data.mins}m · ${hrs}h</span>
      </div>
      <div style="height:6px; background:var(--surface2); border-radius:3px;">
        <div style="height:6px; width:${pct}%; background:${col}; border-radius:3px; transition:width 0.3s;"></div>
      </div>
    </div>`;
    }).join('') : '<div style="color:var(--muted); font-size:13px;">No app usage logged this week.</div>';

    renderScreenGoal();
}

