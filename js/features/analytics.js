// ============================================================
// ANALYTICS
// ============================================================
let analyticsPeriod = 'week';

function switchAnalyticsPeriod(p) {
    analyticsPeriod = p;
    document.querySelectorAll('#analytics-period-toggle .toggle-btn').forEach((b, i) => {
        b.classList.toggle('active', ['week', 'month', 'all'][i] === p);
    });
    renderAnalytics();
}

function renderAnalytics() {
    const allDays = DB.getDays().sort();
    const today = todayStr();
    const currency = getCurrency();

    // Build date range based on period
    let dates = [];
    if (analyticsPeriod === 'week') {
        dates = getLast7Days();
    } else if (analyticsPeriod === 'month') {
        dates = Array.from({ length: 30 }, (_, i) => {
            const d = new Date(); d.setDate(d.getDate() - (29 - i));
            return d.toISOString().slice(0, 10);
        });
    } else {
        dates = allDays;
    }
    if (!dates.length) dates = getLast7Days();

    // ---- Pull all data for the period ----
    const sleepLogs = DB.get('sleep_logs', []).filter(e => dates.includes(e.date));
    const appLogs = DB.get('app_usage_log', []).filter(e => dates.includes(e.date));
    const expenses = DB.get('money_expenses', []).filter(e => dates.includes(e.date));
    const quranLogs = DB.get('quran_log', []).filter(e => dates.includes(e.date));
    const hadithLogs = DB.get('hadith_log', []).filter(e => dates.includes(e.date));

    // ---- KPIs ----
    const gymCount = dates.filter(d => DB.getDay(d).gym === true).length;
    const studyHrs = dates.reduce((a, d) => a + getTotalStudyHrs(d), 0);
    const prayerTotal = dates.reduce((a, d) => a + (DB.getDay(d).prayers || []).length, 0);
    const prayerCons = dates.length ? Math.round(prayerTotal / (dates.length * 5) * 100) : 0;
    const sleepAvg = sleepLogs.length ? (sleepLogs.reduce((a, l) => a + l.hours, 0) / sleepLogs.length).toFixed(1) : null;
    const screenAvg = dates.length ? (appLogs.reduce((a, e) => a + e.mins, 0) / 60 / dates.length).toFixed(1) : 0;
    const totalSpent = expenses.reduce((a, e) => a + (e.amount || 0), 0);
    const quranPgs = quranLogs.reduce((a, e) => a + (e.pages || 0), 0);
    const hadithCnt = hadithLogs.reduce((a, e) => a + (e.count || 1), 0);
    const perfectDays = dates.filter(d => (DB.getDay(d).prayers || []).length === 5).length;

    document.getElementById('ana-kpi-row').innerHTML = [
        { label: 'Gym Sessions', val: gymCount, icon: '💪', color: 'var(--success)' },
        { label: 'Study Hours', val: studyHrs.toFixed(1) + 'h', icon: '📚', color: 'var(--accent2)' },
        { label: 'Prayer Rate', val: prayerCons + '%', icon: '📿', color: 'var(--accent)' },
        { label: 'Perfect Prayer Days', val: perfectDays, icon: '⭐', color: '#facc15' },
        { label: 'Avg Sleep', val: sleepAvg ? sleepAvg + 'h' : '—', icon: '😴', color: '#a78bfa' },
        { label: 'Avg Screen/Day', val: screenAvg + 'h', icon: '📱', color: '#fb923c' },
        { label: 'Total Spent', val: currency + ' ' + totalSpent.toFixed(0), icon: '💰', color: '#34d399' },
        { label: 'Quran Pages', val: quranPgs, icon: '📖', color: 'var(--accent)' },
        { label: 'Hadiths Read', val: hadithCnt, icon: '🕌', color: 'var(--accent)' },
    ].map(k => `
    <div class="card card-sm" style="padding:14px;">
      <div style="font-size:18px; margin-bottom:4px;">${k.icon}</div>
      <div style="font-size:22px; font-weight:700; font-family:'DM Serif Display',serif; color:${k.color};">${k.val}</div>
      <div style="font-size:11px; color:var(--muted); margin-top:2px;">${k.label}</div>
    </div>`).join('');

    // ---- Chart helper ----
    function makeChart(containerId, labelId, values, labels, color, suffix = '', goalLine = null) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const max = Math.max(...values, 0.01);
        const N = values.length;
        const step = N <= 7 ? 1 : N <= 14 ? 2 : N <= 30 ? 4 : Math.ceil(N / 8);
        container.innerHTML = values.map((v, i) => {
            const h = Math.max(v / max * 84, v > 0 ? 3 : 0);
            const barColor = (goalLine && v > goalLine) ? 'var(--danger)' : color;
            const tipLabel = labels[i].replace('\n', ' ');
            return `<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;height:90px;" title="${tipLabel}: ${v}${suffix}">
        <div style="width:100%;border-radius:3px 3px 0 0;height:${h}px;background:${barColor};opacity:0.82;transition:opacity .15s;"
             onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.82"></div>
      </div>`;
        }).join('');
        const labelsEl = document.getElementById(containerId + '-labels');
        if (labelsEl) labelsEl.innerHTML = values.map((_, i) => {
            if (i % step !== 0) return `<div style="flex:1;"></div>`;
            const parts = labels[i].split('\n');
            return `<div style="flex:1;text-align:center;font-size:9px;color:var(--muted);line-height:1.3;">
        ${parts.map(p => `<div>${p}</div>`).join('')}
      </div>`;
        }).join('');
    }

    // Label helpers
    function dayLabel(dateStr) {
        // e.g. "Feb 15" or for week view "Sat 15"
        const d = new Date(dateStr + 'T00:00:00');
        if (analyticsPeriod === 'week') {
            return d.toLocaleDateString('en-US', { weekday: 'short' }) + '\n' +
                d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    function weekLabel(dateStr) {
        const d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    // Group daily data into weeks helper
    function groupByWeek(dateFn) {
        const weeks = {};
        const order = [];
        dates.forEach(d => {
            const wd = getWeekDates(d)[0];
            if (!weeks[wd]) { weeks[wd] = 0; order.push(wd); }
            weeks[wd] += dateFn(d);
        });
        const keys = [...new Set(order)].sort();
        return { keys, vals: keys.map(k => weeks[k]) };
    }

    // ---- Gym chart ----
    if (analyticsPeriod === 'week') {
        document.getElementById('ana-gym-chart-label').textContent = 'sessions per day';
        const vals = dates.map(d => DB.getDay(d).gym === true ? 1 : 0);
        const labels = dates.map(d => dayLabel(d));
        makeChart('ana-gym-chart', 'ana-gym-chart-label', vals, labels, 'var(--success)');
    } else {
        document.getElementById('ana-gym-chart-label').textContent = 'sessions per week';
        const { keys, vals } = groupByWeek(d => DB.getDay(d).gym === true ? 1 : 0);
        makeChart('ana-gym-chart', 'ana-gym-chart-label', vals, keys.map(weekLabel), 'var(--success)');
    }

    // ---- Study chart ----
    document.getElementById('ana-study-chart-label').textContent = 'hours per day';
    {
        const vals = dates.map(d => getTotalStudyHrs(d));
        const labels = dates.map(d => dayLabel(d));
        makeChart('ana-study-chart', 'ana-study-chart-label', vals, labels, 'var(--accent2)', 'h');
    }

    // ---- Prayer chart ----
    document.getElementById('ana-prayer-chart-label').textContent = 'prayers per day (out of 5)';
    {
        const vals = dates.map(d => (DB.getDay(d).prayers || []).length);
        const labels = dates.map(d => dayLabel(d));
        makeChart('ana-prayer-chart', 'ana-prayer-chart-label', vals, labels, 'var(--accent)', ' / 5', 4.9);
    }

    // ---- Screen chart ----
    document.getElementById('ana-screen-chart-label').textContent = 'total hours per day';
    {
        const vals = dates.map(d => {
            const mins = appLogs.filter(e => e.date === d).reduce((a, e) => a + e.mins, 0);
            return +(mins / 60).toFixed(1);
        });
        const labels = dates.map(d => dayLabel(d));
        const goal = getScreenGoal() > 0 ? getScreenGoal() / 60 : null;
        makeChart('ana-screen-chart', 'ana-screen-chart-label', vals, labels, '#fb923c', 'h', goal);
    }

    // ---- Sleep chart ----
    document.getElementById('ana-sleep-chart-label').textContent = 'hours per night (7–9h is ideal)';
    {
        const vals = dates.map(d => {
            const e = sleepLogs.find(l => l.date === d);
            return e ? +e.hours.toFixed(1) : 0;
        });
        const labels = dates.map(d => dayLabel(d));
        makeChart('ana-sleep-chart', 'ana-sleep-chart-label', vals, labels, '#a78bfa', 'h');
    }

    // ---- Money chart ----
    document.getElementById('ana-money-chart-label').textContent = `spending per day (${currency})`;
    {
        const vals = dates.map(d =>
            +expenses.filter(e => e.date === d).reduce((a, e) => a + (e.amount || 0), 0).toFixed(0)
        );
        const labels = dates.map(d => dayLabel(d));
        makeChart('ana-money-chart', 'ana-money-chart-label', vals, labels, '#34d399', currency);
    }

    // ---- Streaks ----
    function calcStreak(fn) {
        let streak = 0, best = 0, cur = 0;
        const sorted = allDays.slice().sort();
        for (let i = 0; i < sorted.length; i++) {
            if (fn(sorted[i])) { cur++; best = Math.max(best, cur); }
            else { cur = 0; }
        }
        // current streak = from today backwards
        const rev = allDays.slice().sort().reverse();
        for (const d of rev) {
            if (fn(d)) streak++; else break;
        }
        return { current: streak, best };
    }
    const gymStreak = calcStreak(d => DB.getDay(d).gym === true);
    const prayerStreak = calcStreak(d => (DB.getDay(d).prayers || []).length === 5);
    const studyStreak = calcStreak(d => getTotalStudyHrs(d) > 0);
    const logStreak = calcStreak(d => DB.getDay(d).prayers || DB.getDay(d).gym !== undefined || getTotalStudyHrs(d) > 0);

    document.getElementById('ana-streaks').innerHTML = [
        { label: 'Gym Sessions', icon: '💪', color: 'var(--success)', ...gymStreak },
        { label: 'Perfect Prayers', icon: '📿', color: 'var(--accent)', ...prayerStreak },
        { label: 'Study Days', icon: '📚', color: 'var(--accent2)', ...studyStreak },
        { label: 'Any Activity', icon: '🔥', color: '#fb923c', ...logStreak },
    ].map(s => `
    <div style="background:var(--surface2); border-radius:10px; padding:14px;">
      <div style="font-size:16px; margin-bottom:6px;">${s.icon}</div>
      <div style="font-size:12px; color:var(--muted); margin-bottom:8px;">${s.label}</div>
      <div style="display:flex; gap:16px; align-items:flex-end;">
        <div>
          <div style="font-size:22px; font-weight:700; font-family:'DM Serif Display',serif; color:${s.color};">${s.current}</div>
          <div style="font-size:10px; color:var(--muted);">current</div>
        </div>
        <div>
          <div style="font-size:16px; font-weight:600; color:var(--muted);">${s.best}</div>
          <div style="font-size:10px; color:var(--muted);">best</div>
        </div>
      </div>
    </div>`).join('');

    // ---- Daily log table ----
    const tableRows = dates.slice().reverse().slice(0, 60).map(d => {
        const day = DB.getDay(d);
        const gym = day.gym;
        const prayers = (day.prayers || []).length;
        const studyH = getTotalStudyHrs(d);
        const sleep = sleepLogs.find(l => l.date === d);
        const screenM = appLogs.filter(e => e.date === d).reduce((a, e) => a + e.mins, 0);
        const spent = expenses.filter(e => e.date === d).reduce((a, e) => a + (e.amount || 0), 0);
        // Discipline score: simple weighted sum out of 100
        let score = 0;
        score += prayers === 5 ? 30 : Math.round(prayers / 5 * 25);
        score += gym === true ? 20 : 0;
        score += Math.min(studyH, 4) / 4 * 20;
        score += sleep && sleep.hours >= 6 && sleep.hours <= 9 ? 15 : (sleep ? 8 : 0);
        score += screenM <= 120 ? 15 : screenM <= 240 ? 8 : 0;
        score = Math.round(score);
        const scoreColor = score >= 80 ? 'var(--success)' : score >= 50 ? 'var(--accent)' : 'var(--danger)';

        return `<tr style="border-bottom:1px solid var(--border);">
      <td style="padding:8px 10px 8px 0; white-space:nowrap; font-size:12px; color:var(--muted);">${fmtDateShort(d)}</td>
      <td style="padding:8px 10px; text-align:center; font-size:12px;">
        ${gym === true ? '<span style="color:var(--success);">✓</span>' : gym === false ? '<span style="color:var(--danger);">✗</span>' : '<span style="color:var(--border);">—</span>'}
      </td>
      <td style="padding:8px 10px; text-align:center; font-size:12px;">
        <span style="color:${prayers === 5 ? 'var(--success)' : prayers >= 3 ? 'var(--accent)' : 'var(--danger)'};">${prayers}/5</span>
      </td>
      <td style="padding:8px 10px; text-align:center; font-size:12px;">
        ${studyH > 0 ? `<span style="color:var(--accent2);">${studyH.toFixed(1)}h</span>` : '<span style="color:var(--border);">—</span>'}
      </td>
      <td style="padding:8px 10px; text-align:center; font-size:12px;">
        ${sleep ? `<span style="color:${sleep.hours >= 7 && sleep.hours <= 9 ? 'var(--success)' : 'var(--accent)'};">${sleep.hours}h</span>` : '<span style="color:var(--border);">—</span>'}
      </td>
      <td style="padding:8px 10px; text-align:center; font-size:12px;">
        ${screenM > 0 ? `<span style="color:${screenM <= 120 ? 'var(--success)' : screenM <= 240 ? '#fb923c' : 'var(--danger)'};">${(screenM / 60).toFixed(1)}h</span>` : '<span style="color:var(--border);">—</span>'}
      </td>
      <td style="padding:8px 10px; text-align:center; font-size:12px;">
        ${spent > 0 ? `<span style="color:var(--muted);">${currency}${spent.toFixed(0)}</span>` : '<span style="color:var(--border);">—</span>'}
      </td>
      <td style="padding:8px 10px; text-align:center;">
        <span style="font-size:12px; font-weight:700; color:${scoreColor};">${score}</span>
      </td>
    </tr>`;
    }).join('');

    document.getElementById('ana-log-tbody').innerHTML = tableRows ||
        `<tr><td colspan="8" style="padding:20px 0; text-align:center; color:var(--muted); font-size:13px;">No data yet for this period. Start logging!</td></tr>`;
}

