// ============================================================
// MONEY TRACKER
// ============================================================
const EXPENSE_CATEGORIES = [
    'Rent', 'Utilities', 'Groceries', 'Transport', 'Health',
    'Loans', 'Food & Drinks', 'Shopping', 'Entertainment',
    'Personal', 'Bills & Utilities', 'Education', 'Gym & Fitness', 'Other'
];
const CAT_ICONS = {
    'Rent': '🏠', 'Utilities': '💡', 'Groceries': '🛒', 'Transport': '🚗', 'Health': '💊',
    'Loans': '🏦', 'Food & Drinks': '🍜', 'Shopping': '🛍', 'Entertainment': '🎮',
    'Personal': '🧴', 'Bills & Utilities': '📋', 'Education': '📚', 'Gym & Fitness': '💪', 'Other': '📦'
};

function getMoneyMonthStr(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function changeMoneyMonth(dir) {
    moneyViewDate = new Date(moneyViewDate.getFullYear(), moneyViewDate.getMonth() + dir, 1);
    renderMoneyPage();
}

function renderMoneyDailyChart() {
    const monthStr = getMoneyMonthStr(moneyViewDate);
    const expenses = getMonthExpenses(monthStr);
    const year = moneyViewDate.getFullYear();
    const month = moneyViewDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cur = getCurrency();

    const daily = {};
    for (let i = 1; i <= daysInMonth; i++) {
        daily[`${monthStr}-${String(i).padStart(2, '0')}`] = 0;
    }
    expenses.forEach(e => { if (daily[e.date] !== undefined) daily[e.date] += e.amount || 0; });

    const vals = Object.values(daily);
    const dates = Object.keys(daily);
    const maxVal = Math.max(...vals, 1);
    const n = dates.length;

    const W = 600, H = 140, padL = 8, padR = 8, padT = 16, padB = 28;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;

    const xOf = i => padL + (i / (n - 1 || 1)) * chartW;
    const yOf = v => padT + chartH - (v / maxVal) * chartH;

    function buildPath(vs) {
        if (n === 1) return `M${xOf(0)},${yOf(vs[0])}`;
        let d = `M${xOf(0)},${yOf(vs[0])}`;
        for (let i = 0; i < n - 1; i++) {
            const x0 = i > 0 ? xOf(i - 1) : xOf(0);
            const y0 = i > 0 ? yOf(vs[i - 1]) : yOf(vs[0]);
            const x1 = xOf(i), y1 = yOf(vs[i]);
            const x2 = xOf(i + 1), y2 = yOf(vs[i + 1]);
            const x3 = i < n - 2 ? xOf(i + 2) : xOf(n - 1);
            const y3 = i < n - 2 ? yOf(vs[i + 2]) : yOf(vs[n - 1]);
            const cp1x = x1 + (x2 - x0) / 6;
            const cp1y = y1 + (y2 - y0) / 6;
            const cp2x = x2 - (x3 - x1) / 6;
            const cp2y = y2 - (y3 - y1) / 6;
            d += ` C${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${x2.toFixed(2)},${y2.toFixed(2)}`;
        }
        return d;
    }

    const linePath = buildPath(vals);
    const areaPath = `${linePath} L${xOf(n - 1)},${padT + chartH} L${xOf(0)},${padT + chartH} Z`;

    const labels = dates.map((d, i) => {
        if ((i + 1) % 5 !== 1 && i !== n - 1) return '';
        const day = parseInt(d.split('-')[2]);
        return `<text x="${xOf(i)}" y="${H - 6}" text-anchor="middle" font-size="9" fill="var(--muted)" font-family="DM Sans,sans-serif">${day}</text>`;
    }).join('');

    const dots = dates.map((d, i) => {
        if (!vals[i]) return '';
        return `<circle cx="${xOf(i).toFixed(2)}" cy="${yOf(vals[i]).toFixed(2)}" r="3"
      fill="#7c6ef0" stroke="var(--surface)" stroke-width="1.5" style="cursor:pointer;">
      <title>${fmtDateShort(d)}: ${cur} ${vals[i].toFixed(2)}</title>
    </circle>`;
    }).join('');

    const gridLines = [0.25, 0.5, 0.75].map(f => {
        const y = padT + chartH * (1 - f);
        const lv = (maxVal * f).toFixed(0);
        return `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}"
      stroke="var(--border)" stroke-width="0.5" stroke-dasharray="3,3"/>
      <text x="${padL + 2}" y="${y - 3}" font-size="8" fill="var(--muted)" font-family="DM Sans,sans-serif">${lv}</text>`;
    }).join('');

    const gradId = 'moneyGrad';
    const svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block;">
    <defs>
      <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stop-color="#7c6ef0" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="#7c6ef0" stop-opacity="0.02"/>
      </linearGradient>
    </defs>
    ${gridLines}
    <path d="${areaPath}" fill="url(#${gradId})"/>
    <path d="${linePath}" fill="none" stroke="#7c6ef0" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}
    ${labels}
  </svg>`;

    document.getElementById('money-daily-chart').innerHTML = svg;
}

function renderMoneyExpenseList() {
    const monthStr = getMoneyMonthStr(moneyViewDate);
    let expenses = getMonthExpenses(monthStr);
    const filterCat = document.getElementById('money-filter-cat').value;
    if (filterCat) expenses = expenses.filter(e => e.category === filterCat);
    expenses = expenses.slice().sort((a, b) => b.date.localeCompare(a.date));

    if (!expenses.length) {
        document.getElementById('money-expense-list').innerHTML = '<div style="color:var(--muted);font-size:13px;padding:20px 0;">No expenses found. Add one!</div>';
        return;
    }

    const grouped = {};
    expenses.forEach(e => { if (!grouped[e.date]) grouped[e.date] = []; grouped[e.date].push(e); });

    document.getElementById('money-expense-list').innerHTML = Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0])).map(([date, exps]) => {
        const dayTotal = exps.reduce((a, e) => a + (e.amount || 0), 0);
        return `
      <div style="margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div style="font-size:12px;color:var(--muted);font-weight:600;letter-spacing:0.05em;">${fmtDate(date)}</div>
          <div style="font-size:12px;color:var(--muted);">${getCurrency()} ${dayTotal.toFixed(2)}</div>
        </div>
        ${exps.map(e => `
          <div class="food-item" style="margin-bottom:6px;cursor:pointer;" onclick="openEditExpenseModal('${e.id}')">
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="font-size:18px;">${CAT_ICONS[e.category] || '📦'}</div>
              <div>
                <div style="font-size:13px;font-weight:500;">${esc(e.desc)}</div>
                <div style="font-size:11px;color:var(--muted);">${esc(e.category)}${e.notes ? ' · ' + e.notes : ''}</div>
              </div>
            </div>
            <div style="font-size:14px;font-weight:600;color:var(--danger);">−${getCurrency()} ${(e.amount || 0).toFixed(2)}</div>
          </div>
        `).join('')}
      </div>
    `;
    }).join('');
}

function openAddExpenseModal() {
    editingExpenseId = null;
    document.getElementById('expense-modal-title').textContent = 'Add Expense';
    document.getElementById('exp-desc').value = '';
    document.getElementById('exp-amount').value = '';
    document.getElementById('exp-date').value = todayStr();
    document.getElementById('exp-category').value = 'Food & Drinks';
    document.getElementById('exp-notes').value = '';
    document.getElementById('exp-delete-btn').style.display = 'none';
    openModal('modal-expense');
}

function openEditExpenseModal(id) {
    const all = DB.get('money_expenses', []);
    const exp = all.find(e => e.id === id);
    if (!exp) return;
    editingExpenseId = id;
    document.getElementById('expense-modal-title').textContent = 'Edit Expense';
    document.getElementById('exp-desc').value = exp.desc || '';
    document.getElementById('exp-amount').value = exp.amount || '';
    document.getElementById('exp-date').value = exp.date || todayStr();
    document.getElementById('exp-category').value = exp.category || 'Other';
    document.getElementById('exp-notes').value = exp.notes || '';
    document.getElementById('exp-delete-btn').style.display = 'inline-flex';
    openModal('modal-expense');
}

function saveExpense() {
    const desc = document.getElementById('exp-desc').value.trim().slice(0, 200);
    const amount = safeNum(document.getElementById('exp-amount').value, 0.01, 9999999, 0);
    const date = document.getElementById('exp-date').value;
    if (!desc) return void showToast('Please enter a description.');
    if (amount <= 0) return void showToast('Please enter a valid amount.');
    if (!date) return void showToast('Please select a date.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return void showToast('Invalid date format.');

    const all = DB.get('money_expenses', []);
    const exp = {
        id: editingExpenseId || genId(),
        desc, amount, date,
        category: document.getElementById('exp-category').value,
        notes: document.getElementById('exp-notes').value.trim().slice(0, 500)
    };

    if (editingExpenseId) {
        const idx = all.findIndex(e => e.id === editingExpenseId);
        all[idx] = exp;
    } else {
        all.push(exp);
    }
    DB.set('money_expenses', all);
    closeModal('modal-expense');
    renderMoneyPage();
    showToast(editingExpenseId ? 'Expense updated!' : 'Expense added!');
}

async function deleteExpense() {
    if (!editingExpenseId) return;
    if (!await showConfirm('Delete this expense?', 'Delete', true)) return;
    let all = DB.get('money_expenses', []);
    all = all.filter(e => e.id !== editingExpenseId);
    DB.set('money_expenses', all);
    closeModal('modal-expense');
    renderMoneyPage();
    showToast('Expense deleted');
}

