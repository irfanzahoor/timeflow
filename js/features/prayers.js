// ============================================================
// PRAYERS PAGE
// ============================================================
function renderPrayers() {
    initSurahDropdown();
    const today = DB.getDay(todayStr());
    const prayers = today.prayers || [];
    document.getElementById('prayer-today-count').textContent = prayers.length + '/5';
    document.getElementById('prayer-today-label').textContent = fmtDate(todayStr());

    document.getElementById('prayer-today-btns').innerHTML = PRAYERS.map(p => `
    <button class="prayer-btn ${prayers.includes(p) ? 'done' : ''}" onclick="togglePrayerPage('${p}')">${p}</button>
  `).join('');

    const allDays = DB.getDays();
    const weekDates = getWeekDates(todayStr());
    const weekAvg = weekDates.reduce((a, d) => a + (DB.getDay(d).prayers || []).length, 0) / 7;
    document.getElementById('prayer-week-avg').textContent = Math.round(weekAvg) + '/5';

    const monthStr = todayStr().slice(0, 7);
    const monthDays = allDays.filter(d => d.startsWith(monthStr));
    const perfectDays = monthDays.filter(d => (DB.getDay(d).prayers || []).length === 5).length;
    document.getElementById('prayer-perfect-days').textContent = perfectDays;

    const last30 = Array.from({ length: 30 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - 29 + i);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const da = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${da}`;
    });
    document.getElementById('prayer-history-grid').innerHTML = last30.map(d => {
        const cnt = (DB.getDay(d).prayers || []).length;
        const bg = cnt === 5 ? 'var(--success)' : cnt >= 3 ? 'var(--accent)' : cnt >= 1 ? 'var(--danger)' : 'var(--surface2)';
        return `<div title="${fmtDateShort(d)}: ${cnt}/5 prayers" style="width:20px;height:20px;border-radius:3px;background:${bg};cursor:pointer;"></div>`;
    }).join('');

    renderHadithSection();
    renderQuranSection();
}

function togglePrayerPage(name) {
    const day = DB.getDay(todayStr());
    day.prayers = day.prayers || [];
    if (day.prayers.includes(name)) day.prayers = day.prayers.filter(p => p !== name);
    else day.prayers.push(name);
    DB.setDay(todayStr(), day);
    DB.registerDay(todayStr());
    renderPrayers();
}

// ============================================================
// HADITH TRACKER
// ============================================================
function addHadithEntry() {
    const book = document.getElementById('hadith-book-input').value.trim();
    const number = document.getElementById('hadith-number-input').value.trim();
    const count = parseInt(document.getElementById('hadith-count-input').value) || 1;
    const note = document.getElementById('hadith-note-input').value.trim();
    if (!book) return void showToast('Please enter a book / collection name.');
    const entries = DB.get('hadith_log', []);
    entries.push({ id: genId(), date: todayStr(), book, number, count, note });
    DB.set('hadith_log', entries);
    document.getElementById('hadith-book-input').value = '';
    document.getElementById('hadith-number-input').value = '';
    document.getElementById('hadith-count-input').value = '';
    document.getElementById('hadith-note-input').value = '';
    renderHadithSection();
    showToast('Hadith logged!');
}

function removeHadithEntry(id) {
    const entries = DB.get('hadith_log', []).filter(e => e.id !== id);
    DB.set('hadith_log', entries);
    renderHadithSection();
}

function renderHadithSection() {
    const all = DB.get('hadith_log', []);
    const today = todayStr();
    const todayE = all.filter(e => e.date === today);
    const weekD = getWeekDates(today);
    const weekE = all.filter(e => weekD.includes(e.date));

    document.getElementById('hadith-today-count').textContent = todayE.reduce((a, e) => a + (e.count || 1), 0);
    document.getElementById('hadith-week-count').textContent = weekE.reduce((a, e) => a + (e.count || 1), 0);

    document.getElementById('hadith-today-list').innerHTML = todayE.length ? todayE.map(e => `
    <div style="background:var(--surface2); border-radius:10px; padding:12px 14px; margin-bottom:8px; border-left:3px solid var(--accent);">
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <div>
          <div style="font-size:13px; font-weight:600;">${esc(e.book)}${e.number ? ' — ' + e.number : ''}</div>
          <div style="font-size:11px; color:var(--muted); margin-top:2px;">${e.count} hadith${e.count > 1 ? 's' : ''} read</div>
          ${e.note ? `<div style="font-size:12px; color:var(--text); margin-top:6px; line-height:1.5; border-top:1px solid var(--border); padding-top:6px;">💡 ${esc(e.note)}</div>` : ''}
        </div>
        <button class="btn btn-ghost" onclick="removeHadithEntry('${e.id}')" style="font-size:14px; padding:2px 8px;">✕</button>
      </div>
    </div>
  `).join('') : '<div style="color:var(--muted); font-size:13px;">No hadiths logged today yet.</div>';
}

// ============================================================
// QURAN TRACKER
// ============================================================
// ============================================================
// QURAN TRACKER — SURAH DATA + HELPERS
// ============================================================
const SURAHS = [
    { n: 1, name: "Al-Fatihah", ayahs: 7 }, { n: 2, name: "Al-Baqarah", ayahs: 286 }, { n: 3, name: "Ali 'Imran", ayahs: 200 },
    { n: 4, name: "An-Nisa", ayahs: 176 }, { n: 5, name: "Al-Ma'idah", ayahs: 120 }, { n: 6, name: "Al-An'am", ayahs: 165 },
    { n: 7, name: "Al-A'raf", ayahs: 206 }, { n: 8, name: "Al-Anfal", ayahs: 75 }, { n: 9, name: "At-Tawbah", ayahs: 129 },
    { n: 10, name: "Yunus", ayahs: 109 }, { n: 11, name: "Hud", ayahs: 123 }, { n: 12, name: "Yusuf", ayahs: 111 },
    { n: 13, name: "Ar-Ra'd", ayahs: 43 }, { n: 14, name: "Ibrahim", ayahs: 52 }, { n: 15, name: "Al-Hijr", ayahs: 99 },
    { n: 16, name: "An-Nahl", ayahs: 128 }, { n: 17, name: "Al-Isra", ayahs: 111 }, { n: 18, name: "Al-Kahf", ayahs: 110 },
    { n: 19, name: "Maryam", ayahs: 98 }, { n: 20, name: "Ta-Ha", ayahs: 135 }, { n: 21, name: "Al-Anbiya", ayahs: 112 },
    { n: 22, name: "Al-Hajj", ayahs: 78 }, { n: 23, name: "Al-Mu'minun", ayahs: 118 }, { n: 24, name: "An-Nur", ayahs: 64 },
    { n: 25, name: "Al-Furqan", ayahs: 77 }, { n: 26, name: "Ash-Shu'ara", ayahs: 227 }, { n: 27, name: "An-Naml", ayahs: 93 },
    { n: 28, name: "Al-Qasas", ayahs: 88 }, { n: 29, name: "Al-'Ankabut", ayahs: 69 }, { n: 30, name: "Ar-Rum", ayahs: 60 },
    { n: 31, name: "Luqman", ayahs: 34 }, { n: 32, name: "As-Sajdah", ayahs: 30 }, { n: 33, name: "Al-Ahzab", ayahs: 73 },
    { n: 34, name: "Saba", ayahs: 54 }, { n: 35, name: "Fatir", ayahs: 45 }, { n: 36, name: "Ya-Sin", ayahs: 83 },
    { n: 37, name: "As-Saffat", ayahs: 182 }, { n: 38, name: "Sad", ayahs: 88 }, { n: 39, name: "Az-Zumar", ayahs: 75 },
    { n: 40, name: "Ghafir", ayahs: 85 }, { n: 41, name: "Fussilat", ayahs: 54 }, { n: 42, name: "Ash-Shura", ayahs: 53 },
    { n: 43, name: "Az-Zukhruf", ayahs: 89 }, { n: 44, name: "Ad-Dukhan", ayahs: 59 }, { n: 45, name: "Al-Jathiyah", ayahs: 37 },
    { n: 46, name: "Al-Ahqaf", ayahs: 35 }, { n: 47, name: "Muhammad", ayahs: 38 }, { n: 48, name: "Al-Fath", ayahs: 29 },
    { n: 49, name: "Al-Hujurat", ayahs: 18 }, { n: 50, name: "Qaf", ayahs: 45 }, { n: 51, name: "Adh-Dhariyat", ayahs: 60 },
    { n: 52, name: "At-Tur", ayahs: 49 }, { n: 53, name: "An-Najm", ayahs: 62 }, { n: 54, name: "Al-Qamar", ayahs: 55 },
    { n: 55, name: "Ar-Rahman", ayahs: 78 }, { n: 56, name: "Al-Waqi'ah", ayahs: 96 }, { n: 57, name: "Al-Hadid", ayahs: 29 },
    { n: 58, name: "Al-Mujadila", ayahs: 22 }, { n: 59, name: "Al-Hashr", ayahs: 24 }, { n: 60, name: "Al-Mumtahanah", ayahs: 13 },
    { n: 61, name: "As-Saf", ayahs: 14 }, { n: 62, name: "Al-Jumu'ah", ayahs: 11 }, { n: 63, name: "Al-Munafiqun", ayahs: 11 },
    { n: 64, name: "At-Taghabun", ayahs: 18 }, { n: 65, name: "At-Talaq", ayahs: 12 }, { n: 66, name: "At-Tahrim", ayahs: 12 },
    { n: 67, name: "Al-Mulk", ayahs: 30 }, { n: 68, name: "Al-Qalam", ayahs: 52 }, { n: 69, name: "Al-Haqqah", ayahs: 52 },
    { n: 70, name: "Al-Ma'arij", ayahs: 44 }, { n: 71, name: "Nuh", ayahs: 28 }, { n: 72, name: "Al-Jinn", ayahs: 28 },
    { n: 73, name: "Al-Muzzammil", ayahs: 20 }, { n: 74, name: "Al-Muddaththir", ayahs: 56 }, { n: 75, name: "Al-Qiyamah", ayahs: 40 },
    { n: 76, name: "Al-Insan", ayahs: 31 }, { n: 77, name: "Al-Mursalat", ayahs: 50 }, { n: 78, name: "An-Naba", ayahs: 40 },
    { n: 79, name: "An-Nazi'at", ayahs: 46 }, { n: 80, name: "Abasa", ayahs: 42 }, { n: 81, name: "At-Takwir", ayahs: 29 },
    { n: 82, name: "Al-Infitar", ayahs: 19 }, { n: 83, name: "Al-Mutaffifin", ayahs: 36 }, { n: 84, name: "Al-Inshiqaq", ayahs: 25 },
    { n: 85, name: "Al-Buruj", ayahs: 22 }, { n: 86, name: "At-Tariq", ayahs: 17 }, { n: 87, name: "Al-A'la", ayahs: 19 },
    { n: 88, name: "Al-Ghashiyah", ayahs: 26 }, { n: 89, name: "Al-Fajr", ayahs: 30 }, { n: 90, name: "Al-Balad", ayahs: 20 },
    { n: 91, name: "Ash-Shams", ayahs: 15 }, { n: 92, name: "Al-Layl", ayahs: 21 }, { n: 93, name: "Ad-Duha", ayahs: 11 },
    { n: 94, name: "Ash-Sharh", ayahs: 8 }, { n: 95, name: "At-Tin", ayahs: 8 }, { n: 96, name: "Al-Alaq", ayahs: 19 },
    { n: 97, name: "Al-Qadr", ayahs: 5 }, { n: 98, name: "Al-Bayyinah", ayahs: 8 }, { n: 99, name: "Az-Zalzalah", ayahs: 8 },
    { n: 100, name: "Al-Adiyat", ayahs: 11 }, { n: 101, name: "Al-Qari'ah", ayahs: 11 }, { n: 102, name: "At-Takathur", ayahs: 8 },
    { n: 103, name: "Al-Asr", ayahs: 3 }, { n: 104, name: "Al-Humazah", ayahs: 9 }, { n: 105, name: "Al-Fil", ayahs: 5 },
    { n: 106, name: "Quraysh", ayahs: 4 }, { n: 107, name: "Al-Ma'un", ayahs: 7 }, { n: 108, name: "Al-Kawthar", ayahs: 3 },
    { n: 109, name: "Al-Kafirun", ayahs: 6 }, { n: 110, name: "An-Nasr", ayahs: 3 }, { n: 111, name: "Al-Masad", ayahs: 5 },
    { n: 112, name: "Al-Ikhlas", ayahs: 4 }, { n: 113, name: "Al-Falaq", ayahs: 5 }, { n: 114, name: "An-Nas", ayahs: 6 }
];

function initSurahDropdown() {
    const sel = document.getElementById('quran-surah-input');
    if (!sel || sel.options.length > 1) return;
    SURAHS.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.n;
        opt.textContent = `${s.n}. ${esc(s.name)} (${s.ayahs} ayahs)`;
        sel.appendChild(opt);
    });
}

function onSurahChange() {
    const sel = document.getElementById('quran-surah-input');
    const n = parseInt(sel.value);
    const surah = SURAHS.find(s => s.n === n);
    const fromEl = document.getElementById('quran-ayah-from');
    const toEl = document.getElementById('quran-ayah-to');
    const meta = document.getElementById('quran-surah-meta');
    if (!surah) {
        fromEl.max = ''; toEl.max = '';
        fromEl.placeholder = '1'; toEl.placeholder = '10';
        meta.textContent = '';
        return;
    }
    fromEl.max = surah.ayahs; fromEl.placeholder = '1';
    toEl.max = surah.ayahs; toEl.placeholder = String(surah.ayahs);
    meta.textContent = `${surah.name} has ${surah.ayahs} ayahs`;
    // Clamp existing values
    if (parseInt(fromEl.value) > surah.ayahs) fromEl.value = 1;
    if (parseInt(toEl.value) > surah.ayahs) toEl.value = surah.ayahs;
}

function addQuranEntry() {
    const selEl = document.getElementById('quran-surah-input');
    const n = parseInt(selEl.value);
    const surah = SURAHS.find(s => s.n === n);
    const ayahFrom = parseInt(document.getElementById('quran-ayah-from').value) || null;
    const ayahTo = parseInt(document.getElementById('quran-ayah-to').value) || null;
    const pages = parseInt(document.getElementById('quran-pages-input').value) || 0;
    const note = document.getElementById('quran-note-input').value.trim();
    if (!surah) return void showToast('Please select a Surah.');
    if (ayahFrom && ayahTo && ayahFrom > ayahTo) return void showToast('Ayah "From" cannot be greater than "To".');
    if (ayahTo && surah && ayahTo > surah.ayahs) return void showToast(`Surah ${surah.name} only has ${surah.ayahs} ayahs.`);
    const ayah = (ayahFrom && ayahTo) ? `${ayahFrom}–${ayahTo}` : ayahFrom ? `${ayahFrom}` : '';
    const entries = DB.get('quran_log', []);
    entries.push({ id: genId(), date: todayStr(), surahN: n, surah: surah.name, ayah, pages, note });
    DB.set('quran_log', entries);
    selEl.value = '';
    document.getElementById('quran-ayah-from').value = '';
    document.getElementById('quran-ayah-to').value = '';
    document.getElementById('quran-pages-input').value = '';
    document.getElementById('quran-note-input').value = '';
    document.getElementById('quran-surah-meta').textContent = '';
    renderQuranSection();
    showToast('Quran session logged!');
}

function removeQuranEntry(id) {
    const entries = DB.get('quran_log', []).filter(e => e.id !== id);
    DB.set('quran_log', entries);
    renderQuranSection();
}

function renderQuranSection() {
    initSurahDropdown();
    const all = DB.get('quran_log', []);
    const today = todayStr();
    const todayE = all.filter(e => e.date === today);
    const weekD = getWeekDates(today);
    const weekE = all.filter(e => weekD.includes(e.date));
    const monthStr = today.slice(0, 7);
    const monthE = all.filter(e => e.date.startsWith(monthStr));

    document.getElementById('quran-pages-today').textContent = todayE.reduce((a, e) => a + (e.pages || 0), 0);
    document.getElementById('quran-pages-week').textContent = weekE.reduce((a, e) => a + (e.pages || 0), 0);
    document.getElementById('quran-sessions-month').textContent = monthE.length;

    document.getElementById('quran-today-list').innerHTML = todayE.length ? todayE.map(e => `
    <div style="background:var(--surface2); border-radius:10px; padding:12px 14px; margin-bottom:8px; border-left:3px solid var(--accent2);">
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <div>
          <div style="font-size:13px; font-weight:600;">${e.surahN ? e.surahN + '. ' : ''}${e.surah || 'Quran'}${e.ayah ? ' · Ayah ' + e.ayah : ''}</div>
          <div style="font-size:11px; color:var(--muted); margin-top:2px;">${e.pages ? e.pages + ' page' + (e.pages > 1 ? 's' : '') : 'Session logged'}</div>
          ${e.note ? `<div style="font-size:12px; color:var(--text); margin-top:6px; line-height:1.5; border-top:1px solid var(--border); padding-top:6px;">💡 ${esc(e.note)}</div>` : ''}
        </div>
        <button class="btn btn-ghost" onclick="removeQuranEntry('${e.id}')" style="font-size:14px; padding:2px 8px;">✕</button>
      </div>
    </div>
  `).join('') : '<div style="color:var(--muted); font-size:13px;">No Quran sessions logged today yet.</div>';
}

