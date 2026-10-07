// ============================================================
// MEAL MODAL
// ============================================================
function openAddMealModal() {
    mealFoodItems = [];
    document.getElementById('meal-name-input').value = '';
    document.getElementById('fi-name').value = '';
    document.getElementById('fi-qty').value = '';
    document.getElementById('fi-cal').value = '';
    document.getElementById('fi-protein').value = '';
    document.getElementById('fi-carbs').value = '';
    renderMealFoodItems();
    const lib = DB.get('food_library', []);
    document.getElementById('meal-food-select').innerHTML = '<option value="">— Select from library —</option>' + lib.map((f, i) => `<option value="${i}">${esc(f.name)}</option>`).join('');
    openModal('modal-meal');
}

function prefillFoodFromLibrary() {
    const idx = document.getElementById('meal-food-select').value;
    if (idx === '') return;
    const lib = DB.get('food_library', []);
    const food = lib[parseInt(idx)];
    if (!food) return;
    document.getElementById('fi-name').value = food.name;
    document.getElementById('fi-qty').value = 100;
    document.getElementById('fi-cal').value = food.cal;
    document.getElementById('fi-protein').value = food.protein;
    document.getElementById('fi-carbs').value = food.carbs;
}

function addFoodItemToMeal() {
    const name = document.getElementById('fi-name').value.trim();
    if (!name) return void showToast('Enter food name');
    const qty = parseFloat(document.getElementById('fi-qty').value) || 100;
    const baseCal = parseFloat(document.getElementById('fi-cal').value) || 0;
    const baseProtein = parseFloat(document.getElementById('fi-protein').value) || 0;
    const baseCarbs = parseFloat(document.getElementById('fi-carbs').value) || 0;
    const factor = qty / 100;
    mealFoodItems.push({ name, qty, cal: Math.round(baseCal * factor), protein: Math.round(baseProtein * factor), carbs: Math.round(baseCarbs * factor) });
    renderMealFoodItems();
    document.getElementById('fi-name').value = '';
    document.getElementById('fi-qty').value = '';
    document.getElementById('fi-cal').value = '';
    document.getElementById('fi-protein').value = '';
    document.getElementById('fi-carbs').value = '';
    document.getElementById('meal-food-select').value = '';
}

function renderMealFoodItems() {
    document.getElementById('meal-food-items-list').innerHTML = mealFoodItems.map((it, i) => `
    <div class="food-item" style="margin-bottom:6px;">
      <div style="font-size:13px;">${esc(it.name)} <span style="color:var(--muted);">(${it.qty}g) · ${it.cal}cal · ${it.protein}g P · ${it.carbs}g C</span></div>
      <button class="btn btn-ghost" onclick="removeMealItem(${i})" style="padding:2px 6px;font-size:13px;">✕</button>
    </div>
  `).join('');
}

function removeMealItem(i) { mealFoodItems.splice(i, 1); renderMealFoodItems(); }

function saveMeal() {
    const name = document.getElementById('meal-name-input').value.trim() || 'Meal';
    if (!mealFoodItems.length) return void showToast('Add at least one food item');
    const day = DB.getDay(currentLogDate);
    day.meals = day.meals || [];
    day.meals.push({ name, items: [...mealFoodItems] });
    DB.setDay(currentLogDate, day);
    DB.registerDay(currentLogDate);
    closeModal('modal-meal');
    renderLogMeals(day.meals);
    if (nutritionTab === 'today') renderNutritionToday();
}

// ============================================================
// FOOD LIBRARY MODAL
// ============================================================
function openAddFoodModal() {
    document.getElementById('food-lib-name').value = '';
    document.getElementById('food-lib-cal').value = '';
    document.getElementById('food-lib-protein').value = '';
    document.getElementById('food-lib-carbs').value = '';
    document.getElementById('food-lib-notes').value = '';
    openModal('modal-food');
}

function saveFoodToLibrary() {
    const name = document.getElementById('food-lib-name').value.trim();
    if (!name) return void showToast('Enter food name');
    const lib = DB.get('food_library', []);
    lib.push({
        name,
        cal: parseFloat(document.getElementById('food-lib-cal').value) || 0,
        protein: parseFloat(document.getElementById('food-lib-protein').value) || 0,
        carbs: parseFloat(document.getElementById('food-lib-carbs').value) || 0,
        notes: document.getElementById('food-lib-notes').value.trim()
    });
    DB.set('food_library', lib);
    closeModal('modal-food');
    renderFoodLibrary();
    showToast('Food saved to library!');
}

function deleteFoodFromLibrary(idx) {
    const lib = DB.get('food_library', []);
    lib.splice(idx, 1);
    DB.set('food_library', lib);
    renderFoodLibrary();
}

// ============================================================
// MODAL HELPERS
// ============================================================
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

document.querySelectorAll('.modal-bg').forEach(mb => {
    mb.addEventListener('click', e => { if (e.target === mb) mb.classList.remove('open'); });
});

// ============================================================
// TOAST
// ============================================================
function showToast(msg, duration = 2500) {
    // Safe: use textContent, never innerHTML
    const t = document.createElement('div');
    t.style.cssText = `position:fixed;bottom:24px;right:24px;background:var(--accent);color:#1a1200;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;z-index:9999;animation:fadeUp 0.3s ease;max-width:320px;word-break:break-word;`;
    t.textContent = String(msg);
    document.body.appendChild(t);
    const tid = setTimeout(() => t.remove(), Math.max(1500, Math.min(duration, 10000)));
    t.addEventListener('click', () => { clearTimeout(tid); t.remove(); });
}

// Non-blocking confirm dialog — returns a Promise<boolean>
function showConfirm(message, confirmLabel = 'Confirm', dangerMode = false) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:10000;display:flex;align-items:center;justify-content:center;padding:24px;';
        const box = document.createElement('div');
        box.style.cssText = 'background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:24px;max-width:340px;width:100%;';
        const msg = document.createElement('p');
        msg.style.cssText = 'font-size:14px;line-height:1.6;margin:0 0 20px;color:var(--text);';
        msg.textContent = message;
        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;';
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn btn-secondary';
        cancelBtn.textContent = 'Cancel';
        const confirmBtn = document.createElement('button');
        confirmBtn.className = dangerMode ? 'btn btn-danger' : 'btn btn-primary';
        confirmBtn.textContent = confirmLabel;
        cancelBtn.onclick = () => { overlay.remove(); resolve(false); };
        confirmBtn.onclick = () => { overlay.remove(); resolve(true); };
        overlay.onclick = e => { if (e.target === overlay) { overlay.remove(); resolve(false); } };
        btnRow.append(cancelBtn, confirmBtn);
        box.append(msg, btnRow);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        confirmBtn.focus();
    });
}

