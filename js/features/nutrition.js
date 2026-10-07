// ============================================================
// NUTRITION PAGE
// ============================================================
function getNutritionGoals() {
    return DB.get('nutrition_goals', { cal: 0, protein: 0, carbs: 0, water: 0 });
}

function saveNutritionGoals() {
    const goals = {
        cal: parseFloat(document.getElementById('goal-cal').value) || 0,
        protein: parseFloat(document.getElementById('goal-protein').value) || 0,
        carbs: parseFloat(document.getElementById('goal-carbs').value) || 0,
        water: parseFloat(document.getElementById('goal-water').value) || 0,
    };
    DB.set('nutrition_goals', goals);
    showToast('Goals saved!');
    renderNutritionToday();
    renderNutritionAnalytics();
}

function loadNutritionGoalsForm() {
    const g = getNutritionGoals();
    if (g.cal) document.getElementById('goal-cal').value = g.cal;
    if (g.protein) document.getElementById('goal-protein').value = g.protein;
    if (g.carbs) document.getElementById('goal-carbs').value = g.carbs;
    if (g.water) document.getElementById('goal-water').value = g.water;
    // Restore saved calculator state if any
    const s = DB.get('calc_state', null);
    if (s) {
        if (s.sex) setCalcSex(s.sex, false);
        if (s.age) document.getElementById('calc-age').value = s.age;
        if (s.weight) document.getElementById('calc-weight').value = s.weight;
        if (s.height) document.getElementById('calc-height').value = s.height;
        if (s.activity) document.getElementById('calc-activity').value = s.activity;
        if (s.obj) setGoalObj(s.obj, false);
        if (s.intensity) document.getElementById('calc-gym-intensity').value = s.intensity;
        if (s.creatine) document.getElementById('calc-creatine').checked = s.creatine;
        if (s.preworkout) document.getElementById('calc-preworkout').checked = s.preworkout;
        if (s.proteinPowder) document.getElementById('calc-protein-powder').checked = s.proteinPowder;
        liveCalc();
    }
}

// ── Calculator state ──────────────────────────────────────────
let calcSex = 'male';
let calcObj = 'maintain';

function setCalcSex(sex, recalc = true) {
    calcSex = sex;
    document.getElementById('calc-sex-male').style.cssText = sex === 'male'
        ? 'flex:1;padding:9px;border-radius:8px;border:1px solid var(--accent);background:rgba(200,169,110,0.1);color:var(--accent);cursor:pointer;font-family:inherit;font-size:13px;transition:all 0.2s;font-weight:600;'
        : 'flex:1;padding:9px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--muted);cursor:pointer;font-family:inherit;font-size:13px;transition:all 0.2s;';
    document.getElementById('calc-sex-female').style.cssText = sex === 'female'
        ? 'flex:1;padding:9px;border-radius:8px;border:1px solid var(--accent);background:rgba(200,169,110,0.1);color:var(--accent);cursor:pointer;font-family:inherit;font-size:13px;transition:all 0.2s;font-weight:600;'
        : 'flex:1;padding:9px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--muted);cursor:pointer;font-family:inherit;font-size:13px;transition:all 0.2s;';
    if (recalc) liveCalc();
}

function setGoalObj(obj, recalc = true) {
    calcObj = obj;
    const btns = { cut: 'gobj-cut', maintain: 'gobj-maintain', bulk: 'gobj-bulk' };
    Object.entries(btns).forEach(([key, id]) => {
        const active = key === obj;
        const colors = { cut: 'var(--danger)', maintain: 'var(--accent)', bulk: 'var(--success)' };
        const bgs = { cut: 'rgba(248,113,113,0.1)', maintain: 'rgba(200,169,110,0.08)', bulk: 'rgba(74,222,128,0.1)' };
        document.getElementById(id).style.cssText = active
            ? `padding:10px 6px;border-radius:8px;border:1px solid ${colors[key]};background:${bgs[key]};color:${colors[key]};cursor:pointer;font-family:inherit;font-size:12px;text-align:center;transition:all 0.2s;line-height:1.4;font-weight:600;`
            : 'padding:10px 6px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--muted);cursor:pointer;font-family:inherit;font-size:12px;text-align:center;transition:all 0.2s;line-height:1.4;';
    });
    if (recalc) liveCalc();
}

function liveCalc() {
    const age = parseFloat(document.getElementById('calc-age').value);
    const weight = parseFloat(document.getElementById('calc-weight').value);
    const height = parseFloat(document.getElementById('calc-height').value);
    const activity = parseFloat(document.getElementById('calc-activity').value);
    const intensity = document.getElementById('calc-gym-intensity').value;
    const creatine = document.getElementById('calc-creatine').checked;
    const preworkout = document.getElementById('calc-preworkout').checked;
    const proteinPow = document.getElementById('calc-protein-powder').checked;

    // Save state
    DB.set('calc_state', { sex: calcSex, age, weight, height, activity, obj: calcObj, intensity, creatine, preworkout, proteinPowder: proteinPow });

    if (!age || !weight || !height || isNaN(activity)) {
        document.getElementById('calc-results').style.display = 'none';
        document.getElementById('calc-results-placeholder').style.display = 'block';
        return;
    }

    // Mifflin-St Jeor BMR
    let bmr;
    if (calcSex === 'male') {
        bmr = 10 * weight + 6.25 * height - 5 * age + 5;
    } else {
        bmr = 10 * weight + 6.25 * height - 5 * age - 161;
    }
    const tdee = Math.round(bmr * activity);
    bmr = Math.round(bmr);

    // Calorie adjustment based on goal
    const adjMap = { cut: -500, maintain: 0, bulk: 300 };
    // Tighten cut/bulk based on gym intensity
    const intensityFactor = { low: 0.8, med: 1.0, high: 1.15 };
    const factor = intensityFactor[intensity] || 1;
    const adj = Math.round((adjMap[calcObj] || 0) * factor);
    const targetCal = tdee + adj;

    // Protein: based on goal + gym intensity
    const proteinMultiplier = {
        cut: { low: 1.8, med: 2.0, high: 2.2 },
        maintain: { low: 1.6, med: 1.8, high: 2.0 },
        bulk: { low: 1.8, med: 2.0, high: 2.2 },
    };
    let pm = proteinMultiplier[calcObj]?.[intensity] || 1.8;
    // Protein powder: slightly lower need since supplement fills the gap
    if (proteinPow) pm = Math.max(pm - 0.1, 1.6);
    const protein = Math.round(weight * pm);
    const proteinCal = protein * 4;

    // Fat: 25–30% of calories
    const fatPct = calcObj === 'cut' ? 0.25 : 0.28;
    const fat = Math.round((targetCal * fatPct) / 9);
    const fatCal = fat * 9;

    // Carbs: remainder
    const carbs = Math.round((targetCal - proteinCal - fatCal) / 4);
    const carbsCal = carbs * 4;

    // Macro % for split bar
    const protPct = Math.round(proteinCal / targetCal * 100);
    const carbPct = Math.round(carbsCal / targetCal * 100);
    const fatPctDisplay = 100 - protPct - carbPct;

    // ── WATER CALCULATION ──────────────────────────────────────
    // Base: 35ml per kg body weight
    let baseWaterMl = Math.round(weight * 35);
    // Activity factor bump
    const activityWaterMap = { '1.2': 0, '1.375': 200, '1.55': 350, '1.725': 500, '1.9': 700 };
    baseWaterMl += activityWaterMap[String(activity)] || 300;
    // Goal bump
    if (calcObj === 'bulk') baseWaterMl += 200;
    if (calcObj === 'cut') baseWaterMl += 100;
    // Supplements bump
    let suppWaterMl = 0;
    const suppNotes = [];
    if (creatine) { suppWaterMl += 400; suppNotes.push('+400ml for creatine'); }
    if (preworkout) { suppWaterMl += 200; suppNotes.push('+200ml for pre-workout'); }
    const totalWaterMl = baseWaterMl + suppWaterMl;
    const totalWaterL = (totalWaterMl / 1000).toFixed(1);

    // Render results
    const adjLabel = adj === 0 ? 'No adjustment (maintenance)' : (adj > 0 ? `+${adj} kcal (surplus)` : `${adj} kcal (deficit)`);
    const goalLabels = { cut: 'Fat loss — caloric deficit', maintain: 'Maintenance calories', bulk: 'Muscle gain — caloric surplus' };

    document.getElementById('res-cal').textContent = targetCal + ' kcal';
    document.getElementById('res-cal-note').textContent = goalLabels[calcObj];
    document.getElementById('res-protein').textContent = protein + 'g';
    document.getElementById('res-protein-note').textContent = `${pm.toFixed(1)}g × ${weight}kg${proteinPow ? ' (with powder)' : ''}`;
    document.getElementById('res-carbs').textContent = carbs + 'g';
    document.getElementById('res-carbs-note').textContent = `~${carbPct}% of calories`;
    document.getElementById('res-bmr').textContent = bmr + ' kcal';
    document.getElementById('res-tdee').textContent = tdee + ' kcal';
    document.getElementById('res-adj').textContent = adjLabel;

    document.getElementById('res-split-bar').innerHTML =
        `<div style="width:${protPct}%;background:var(--accent2);height:100%;"></div>` +
        `<div style="width:${carbPct}%;background:var(--success);height:100%;"></div>` +
        `<div style="width:${fatPctDisplay}%;background:var(--accent);height:100%;"></div>`;
    document.getElementById('res-split-labels').innerHTML =
        `<span style="color:var(--accent2);">■ Protein ${protPct}%</span>` +
        `<span style="color:var(--success);">■ Carbs ${carbPct}%</span>` +
        `<span style="color:var(--accent);">■ Fat ${fatPctDisplay}%</span>`;

    // Water result
    document.getElementById('res-water').textContent = totalWaterL + ' L  (' + totalWaterMl + ' ml)';
    document.getElementById('res-water-note').textContent = `Base: ${(baseWaterMl / 1000).toFixed(1)}L (${weight}kg × 35ml + activity)`;
    const suppNoteEl = document.getElementById('res-supp-note');
    if (suppNotes.length) {
        suppNoteEl.textContent = '+ Supplements: ' + suppNotes.join(', ');
        suppNoteEl.style.display = 'block';
    } else {
        suppNoteEl.style.display = 'none';
    }

    // Store for apply button
    window._calcResult = { cal: targetCal, protein, carbs, water: totalWaterMl };

    document.getElementById('calc-results').style.display = 'block';
    document.getElementById('calc-results-placeholder').style.display = 'none';
}

function applyCalculatedGoals() {
    if (!window._calcResult) return;
    document.getElementById('goal-cal').value = window._calcResult.cal;
    document.getElementById('goal-protein').value = window._calcResult.protein;
    document.getElementById('goal-carbs').value = window._calcResult.carbs;
    if (window._calcResult.water) document.getElementById('goal-water').value = window._calcResult.water;
    saveNutritionGoals();
    showToast('Calculated targets applied! ✓');
}

function getDayMacros(dateStr) {
    const meals = DB.getDay(dateStr).meals || [];
    let cal = 0, protein = 0, carbs = 0;
    meals.forEach(m => m.items.forEach(i => {
        cal += i.cal || 0;
        protein += i.protein || 0;
        carbs += i.carbs || 0;
    }));
    return { cal: Math.round(cal), protein: Math.round(protein), carbs: Math.round(carbs) };
}

function switchNutritionTab(tab) {
    nutritionTab = tab;
    const tabs = ['today', 'analytics', 'goals', 'library'];
    document.querySelectorAll('#nutrition-toggle .toggle-btn').forEach((b, i) => {
        b.classList.toggle('active', tabs[i] === tab);
    });
    tabs.forEach(t => {
        const el = document.getElementById('nutr-tab-' + t);
        if (el) el.style.display = t === tab ? 'block' : 'none';
    });
    if (tab === 'today') renderNutritionToday();
    else if (tab === 'analytics') renderNutritionAnalytics();
    else if (tab === 'goals') loadNutritionGoalsForm();
    else if (tab === 'library') renderFoodLibrary();
}

function renderNutrition() {
    if (nutritionTab === 'today') renderNutritionToday();
    else if (nutritionTab === 'analytics') renderNutritionAnalytics();
    else if (nutritionTab === 'goals') loadNutritionGoalsForm();
    else if (nutritionTab === 'library') renderFoodLibrary();
}

function renderNutritionToday() {
    const macros = getDayMacros(todayStr());
    const goals = getNutritionGoals();

    // Macro ring cards
    function ringCard(label, val, target, color, unit) {
        const pct = target > 0 ? Math.min(val / target * 100, 100) : 0;
        const r = 28, circ = +(2 * Math.PI * r).toFixed(2);
        const dash = +(pct / 100 * circ).toFixed(2);
        const statusColor = target > 0 ? (pct >= 100 ? 'var(--success)' : 'var(--muted)') : 'var(--muted)';
        const statusText = target > 0
            ? (pct >= 100 ? '✓ Goal met!' : `${Math.round(target - val)}${unit} to go`)
            : 'No target set';
        return `
      <div class="card card-sm" style="display:flex;align-items:center;gap:14px;">
        <div style="position:relative;flex-shrink:0;width:72px;height:72px;">
          <svg width="72" height="72" style="transform:rotate(-90deg);">
            <circle cx="36" cy="36" r="${r}" fill="none" stroke="var(--surface2)" stroke-width="6"/>
            <circle cx="36" cy="36" r="${r}" fill="none" stroke="${color}" stroke-width="6"
              stroke-dasharray="${dash} ${circ}" stroke-linecap="round"/>
          </svg>
          <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;">${Math.round(pct)}%</div>
        </div>
        <div>
          <div class="label" style="margin-bottom:3px;">${label}</div>
          <div style="font-size:24px;font-weight:700;font-family:'DM Serif Display',serif;">${val}${unit === 'kcal' ? '' : unit}</div>
          ${target > 0 ? `<div style="font-size:11px;color:var(--muted);">of ${target}${unit}</div>` : ''}
          <div style="font-size:11px;color:${statusColor};margin-top:2px;">${statusText}</div>
        </div>
      </div>`;
    }

    document.getElementById('nutr-macros-today').innerHTML =
        `<div class="grid-3">
      ${ringCard('Calories', macros.cal, goals.cal, 'var(--accent)', 'kcal')}
      ${ringCard('Protein', macros.protein, goals.protein, 'var(--accent2)', 'g')}
      ${ringCard('Carbs', macros.carbs, goals.carbs, 'var(--success)', 'g')}
    </div>`;

    // Target vs actual bars
    const el = document.getElementById('nutr-target-chart');
    if (el) {
        const items = [
            { label: 'Calories', val: macros.cal, target: goals.cal, color: 'var(--accent)', unit: 'kcal' },
            { label: 'Protein', val: macros.protein, target: goals.protein, color: 'var(--accent2)', unit: 'g' },
            { label: 'Carbs', val: macros.carbs, target: goals.carbs, color: 'var(--success)', unit: 'g' },
        ];
        el.innerHTML = items.map(item => {
            const hasTarget = item.target > 0;
            const pct = hasTarget ? Math.min(item.val / item.target * 100, 110) : 0;
            const over = hasTarget && item.val > item.target;
            const barColor = over ? 'var(--danger)' : item.color;
            return `
        <div style="margin-bottom:18px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <div style="font-size:13px;font-weight:500;">${item.label}</div>
            <div style="font-size:13px;color:var(--muted);">
              <span style="color:var(--text);font-weight:600;">${item.val}${item.unit}</span>
              ${hasTarget ? ` / ${item.target}${item.unit}` : ' <span style="font-size:11px;">(no target set)</span>'}
              ${over ? ' <span style="color:var(--danger);font-size:11px;">▲ over</span>' : ''}
            </div>
          </div>
          <div style="height:10px;background:var(--surface2);border-radius:5px;overflow:hidden;">
            <div style="height:100%;width:${pct.toFixed(1)}%;background:${barColor};border-radius:5px;transition:width 0.6s ease;"></div>
          </div>
          ${hasTarget ? `<div style="display:flex;justify-content:space-between;margin-top:3px;"><span style="font-size:10px;color:var(--muted);">0</span><span style="font-size:10px;color:var(--muted);">Target: ${item.target}${item.unit}</span></div>` : ''}
        </div>`;
        }).join('');
    }

    // Meals list
    const meals = DB.getDay(todayStr()).meals || [];
    document.getElementById('nutr-meals-today').innerHTML = meals.length ? meals.map((m, i) => `
    <div class="food-item" style="flex-direction:column;align-items:flex-start;margin-bottom:10px;">
      <div style="display:flex;align-items:center;justify-content:space-between;width:100%;margin-bottom:6px;">
        <div style="font-size:14px;font-weight:600;">${esc(m.name)} <span style="color:var(--muted);font-weight:400;font-size:12px;">(${m.items.length} item${m.items.length !== 1 ? 's' : ''})</span></div>
        <button class="btn btn-ghost" onclick="removeMealNutr(${i})" style="font-size:14px;padding:2px 6px;">✕</button>
      </div>
      ${m.items.map(it => `<div class="tag" style="margin:2px;">${esc(it.name)} · <b>${it.cal}</b> kcal · <b>${it.protein}g</b> P · <b>${it.carbs}g</b> C</div>`).join('')}
    </div>
  `).join('') : '<div style="color:var(--muted);font-size:13px;text-align:center;padding:30px;">No meals today. Add one!</div>';

    renderWaterTracker();
}

function renderNutritionAnalytics() {
    const last7 = getLast7Days();
    const goals = getNutritionGoals();

    // 7-day averages
    const sums = last7.reduce((a, d) => {
        const m = getDayMacros(d);
        a.cal += m.cal; a.protein += m.protein; a.carbs += m.carbs;
        return a;
    }, { cal: 0, protein: 0, carbs: 0 });
    const avg = { cal: Math.round(sums.cal / 7), protein: Math.round(sums.protein / 7), carbs: Math.round(sums.carbs / 7) };

    function statCard(label, avgVal, target, unit, color) {
        const pct = target > 0 ? Math.round(avgVal / target * 100) : null;
        const pillBg = pct == null ? 'var(--surface2)' : pct >= 90 && pct <= 115 ? 'rgba(74,222,128,0.15)' : pct < 90 ? 'rgba(124,110,240,0.15)' : 'rgba(248,113,113,0.15)';
        const pillCol = pct == null ? 'var(--muted)' : pct >= 90 && pct <= 115 ? 'var(--success)' : pct < 90 ? 'var(--accent2)' : 'var(--danger)';
        const pillTxt = pct == null ? 'No goal set' : `${pct}% of goal`;
        return `
      <div class="card card-sm">
        <div class="label">${label} <span style="font-size:10px;">(7-day avg)</span></div>
        <div style="font-size:30px;font-family:'DM Serif Display',serif;margin:6px 0;">${avgVal}${unit}</div>
        ${target ? `<div style="font-size:11px;color:var(--muted);margin-bottom:6px;">Target: ${target}${unit}/day</div>` : '<div style="font-size:11px;color:var(--muted);margin-bottom:6px;">No target set</div>'}
        <span style="font-size:11px;padding:3px 9px;border-radius:20px;background:${pillBg};color:${pillCol};font-weight:600;">${pillTxt}</span>
      </div>`;
    }

    document.getElementById('nutr-analytics-stats').innerHTML =
        statCard('Calories', avg.cal, goals.cal, ' kcal', 'var(--accent)') +
        statCard('Protein', avg.protein, goals.protein, 'g', 'var(--accent2)') +
        statCard('Carbs', avg.carbs, goals.carbs, 'g', 'var(--success)');

    // 7-day line chart
    const el = document.getElementById('nutr-trend-chart');
    if (el) {
        const data = last7.map(d => getDayMacros(d));
        const labels = last7.map(d => { const dt = new Date(d + 'T00:00:00'); return dt.toLocaleDateString('en-US', { weekday: 'short' }) + ' ' + dt.getDate(); });
        const n = last7.length;
        const calScale = 10;
        const calVals = data.map(d => d.cal / calScale);
        const protVals = data.map(d => d.protein);
        const carbVals = data.map(d => d.carbs);
        const allVals = [...calVals, ...protVals, ...carbVals,
        goals.cal ? goals.cal / calScale : 0, goals.protein || 0, goals.carbs || 0];
        const maxVal = Math.max(...allVals, 10);
        const W = 680, H = 200, pL = 34, pR = 14, pT = 16, pB = 40;
        const cW = W - pL - pR, cH = H - pT - pB;
        const xOf = i => pL + (n > 1 ? (i / (n - 1)) * cW : cW / 2);
        const yOf = v => pT + cH - (Math.max(v, 0) / maxVal) * cH;

        function curve(vals) {
            if (n === 1) return `M${xOf(0)},${yOf(vals[0])}`;
            let d = `M${xOf(0)},${yOf(vals[0])}`;
            for (let i = 0; i < n - 1; i++) {
                const cpx = (xOf(i) + xOf(i + 1)) / 2;
                d += ` C${cpx},${yOf(vals[i])} ${cpx},${yOf(vals[i + 1])} ${xOf(i + 1)},${yOf(vals[i + 1])}`;
            }
            return d;
        }
        function area(vals) {
            const bot = pT + cH;
            return `${curve(vals)} L${xOf(n - 1)},${bot} L${xOf(0)},${bot} Z`;
        }
        function dotRow(vals, col) {
            return vals.map((v, i) => v > 0
                ? `<circle cx="${xOf(i).toFixed(1)}" cy="${yOf(v).toFixed(1)}" r="3.5" fill="${col}" stroke="var(--surface)" stroke-width="1.5"/>`
                : '').join('');
        }
        function dashed(yVal) {
            const y = yOf(yVal).toFixed(1);
            return `<line x1="${pL}" y1="${y}" x2="${W - pR}" y2="${y}" stroke="var(--border)" stroke-width="1.5" stroke-dasharray="5,4"/>`;
        }
        const gridLines = [0.25, 0.5, 0.75, 1].map(f => {
            const y = (pT + cH * (1 - f)).toFixed(1);
            return `<line x1="${pL}" y1="${y}" x2="${W - pR}" y2="${y}" stroke="var(--border)" stroke-width="0.5"/>
        <text x="${pL - 4}" y="${+y + 4}" text-anchor="end" font-size="9" fill="var(--muted)" font-family="DM Sans,sans-serif">${Math.round(maxVal * f)}</text>`;
        }).join('');
        const xLabels = labels.map((l, i) =>
            `<text x="${xOf(i).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="10" fill="var(--muted)" font-family="DM Sans,sans-serif">${l}</text>`
        ).join('');
        const pCal = curve(calVals), pProt = curve(protVals), pCarb = curve(carbVals);
        el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block;">
      ${gridLines}
      ${goals.cal ? dashed(goals.cal / calScale) : ''}
      ${goals.protein ? dashed(goals.protein) : ''}
      ${goals.carbs ? dashed(goals.carbs) : ''}
      <path d="${area(carbVals)}"  fill="#4ade80" opacity="0.07"/>
      <path d="${area(protVals)}"  fill="#7c6ef0" opacity="0.07"/>
      <path d="${area(calVals)}"   fill="#c8a96e" opacity="0.07"/>
      <path d="${pCarb}" fill="none" stroke="#4ade80" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="${pProt}" fill="none" stroke="#7c6ef0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="${pCal}"  fill="none" stroke="#c8a96e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      ${dotRow(carbVals, '#4ade80')}${dotRow(protVals, '#7c6ef0')}${dotRow(calVals, '#c8a96e')}
      ${xLabels}
      <text x="${W - pR}" y="${pT - 3}" text-anchor="end" font-size="9" fill="var(--muted)" font-family="DM Sans,sans-serif">*Calories ÷10</text>
    </svg>`;
    }

    // Adherence heatmap
    const adEl = document.getElementById('nutr-adherence-grid');
    if (adEl) {
        const rows = [
            { key: 'cal', label: 'Calories', unit: 'kcal', target: goals.cal, color: '#c8a96e' },
            { key: 'protein', label: 'Protein', unit: 'g', target: goals.protein, color: '#7c6ef0' },
            { key: 'carbs', label: 'Carbs', unit: 'g', target: goals.carbs, color: '#4ade80' },
        ].filter(r => r.target > 0);

        if (!rows.length) {
            adEl.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:12px 0;">Set your goals first (Goals tab) to see adherence tracking.</div>';
            return;
        }

        adEl.innerHTML = rows.map(row => {
            const cells = last7.map(d => {
                const val = getDayMacros(d)[row.key];
                const hasMeals = (DB.getDay(d).meals || []).length > 0;
                const pct = row.target > 0 ? val / row.target : 0;
                const bg = !hasMeals ? 'var(--surface2)' : pct >= 0.9 && pct <= 1.15 ? row.color : pct < 0.9 ? 'rgba(248,113,113,0.35)' : 'rgba(248,113,113,0.8)';
                const tip = !hasMeals ? 'No data' : `${val}${row.unit} (${Math.round(pct * 100)}%)`;
                const dayLbl = new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' });
                return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;">
          <div style="width:100%;height:32px;border-radius:6px;background:${bg};" title="${tip}"></div>
          <div style="font-size:10px;color:var(--muted);">${dayLbl}</div>
          <div style="font-size:10px;color:var(--muted);">${hasMeals ? val : '—'}</div>
        </div>`;
            }).join('');
            const metCount = last7.filter(d => {
                const val = getDayMacros(d)[row.key];
                if (!(DB.getDay(d).meals || []).length) return false;
                const p = val / row.target;
                return p >= 0.9 && p <= 1.15;
            }).length;
            return `
        <div style="margin-bottom:22px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <div style="font-size:13px;font-weight:600;">${row.label} <span style="font-size:11px;color:var(--muted);font-weight:400;">· target ${row.target}${row.unit}/day</span></div>
            <span style="font-size:11px;padding:3px 10px;border-radius:20px;background:${row.color}22;color:${row.color};font-weight:600;">${metCount}/7 on target</span>
          </div>
          <div style="display:flex;gap:6px;">${cells}</div>
          <div style="display:flex;gap:14px;margin-top:8px;font-size:11px;color:var(--muted);">
            <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${row.color};margin-right:4px;vertical-align:middle;"></span>On target (90–115%)</span>
            <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:rgba(248,113,113,0.35);margin-right:4px;vertical-align:middle;"></span>Under</span>
            <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:rgba(248,113,113,0.8);margin-right:4px;vertical-align:middle;"></span>Over</span>
          </div>
        </div>`;
        }).join('');
    }
}

function removeMealNutr(idx) {
    const day = DB.getDay(todayStr());
    day.meals = day.meals || [];
    day.meals.splice(idx, 1);
    DB.setDay(todayStr(), day);
    renderNutritionToday();
}

function renderFoodLibrary() {
    const lib = DB.get('food_library', []);
    const q = (document.getElementById('food-search')?.value || '').toLowerCase();
    const filtered = q ? lib.filter(f => f.name.toLowerCase().includes(q)) : lib;
    document.getElementById('food-library-list').innerHTML = filtered.length ? filtered.map((f, i) => `
    <div class="food-item" style="margin-bottom:8px;">
      <div>
        <div style="font-size:13px;font-weight:600;">${esc(f.name)}</div>
        <div style="font-size:11px;color:var(--muted);">${f.cal} cal · ${f.protein}g protein · ${f.carbs}g carbs / 100g</div>
      </div>
      <div style="display:flex;gap:6px;">
        <button class="btn btn-ghost" onclick="deleteFoodFromLibrary(${i})" style="padding:4px 8px;font-size:13px;">🗑</button>
      </div>
    </div>
  `).join('') : '<div style="color:var(--muted);font-size:13px;">No foods in library. Add some!</div>';
}

