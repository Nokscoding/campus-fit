const STORAGE_KEY = 'campus-fit-v2';
const LEGACY_KEY = 'campus-fit-v1';
const MONTH_THEME_COUNT = 12;

const themeCatalog = [
  'Full White', 'Full Black', 'Streetwear', 'Businessman', 'Old Money', 'Denim Only',
  'Y2K', 'Sport Chic', 'Oversize', 'Preppy / University', 'Vintage', 'Monochrome',
  'Quiet Luxury', 'All Grey', 'Earth Tones', 'Blue Only', 'Red Touch', 'Black & White',
  'Cargo Day', 'Jersey Day', 'Tracksuit Day', 'Smart Casual', 'CEO Day', '90s',
  'Minimalist', 'Baggy Fit', 'Leather Touch', 'Summer Clean', 'Retro Sport', 'Double Denim',
  'Sneaker Highlight', 'No Logo', 'One Color', 'Formal Friday', 'Varsity', 'Techwear',
  'Casual Friday', 'Office Core', 'Rock Style', 'Luxury Street', 'College Core', 'Vintage Rap'
];

const firstMonthThemes = [
  'Full White', 'Full Black', 'Streetwear', 'Businessman', 'Old Money', 'Denim Only',
  'Y2K', 'Sport Chic', 'Oversize', 'Preppy / University', 'Vintage', 'Monochrome'
];

const challengeTemplates = [
  'Photo de groupe avant le premier cours : tout le monde doit respecter le thème.',
  'Ajoute un accessoire qui renforce le thème sans casser la tenue.',
  'Fais valider ta tenue par au moins 2 personnes du groupe avant midi.',
  'Réussissez une photo “cover d’album” avec au moins 3 membres du groupe.',
  'Aucun vêtement hors thème visible sur la photo finale du groupe.',
  'Fais une pose signature avec ta tenue et garde-la pour le récap du mois.',
  'Faites voter le groupe pour le meilleur détail de tenue de la semaine.',
  'Le groupe doit réussir une photo coordonnée en moins de 2 minutes.',
  'Ajoute un détail à moins de 10 $ qui améliore clairement le look.',
  'Même thème, mais chacun doit avoir une pièce forte différente.'
];

const palette = ['#f4e04d','#94d7ff','#c7a7ff','#ff9e80','#90e0a7','#f3b6d2','#b7b3a1','#7e8cff','#78d8cc','#ffbe6b','#b6d7a8','#d2b5ff'];

function uid() {
  return crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function yearFromMonthKey(key) {
  return Number(String(key).slice(0, 4));
}

function monthLabelFromKey(key) {
  const [year, month] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })
    .format(new Date(year, month - 1, 1))
    .replace(/^./, c => c.toUpperCase());
}

function shuffle(input) {
  const a = [...input];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateMonthlyThemes(previous = []) {
  const excluded = new Set(previous.map(t => t.toLowerCase()));
  let fresh = shuffle(themeCatalog.filter(t => !excluded.has(t.toLowerCase())));
  if (fresh.length < MONTH_THEME_COUNT) {
    fresh = [...fresh, ...shuffle(themeCatalog.filter(t => excluded.has(t.toLowerCase())))];
  }
  return fresh.slice(0, MONTH_THEME_COUNT);
}

function blankWeeks() {
  return Array.from({ length: 4 }, (_, i) => ({
    week: i + 1,
    theme: null,
    challenge: null,
    scores: {}
  }));
}

function initialState(players = null) {
  return {
    version: 2,
    monthKey: currentMonthKey(),
    players: players?.length ? players : [
      { id: uid(), name: 'Noks' },
      { id: uid(), name: 'Pote 1' },
      { id: uid(), name: 'Pote 2' },
      { id: uid(), name: 'Pote 3' }
    ],
    monthThemes: [...firstMonthThemes],
    proposals: {},
    activeWeek: 1,
    weeks: blankWeeks(),
    history: []
  };
}

function normalizeState(s) {
  s.version = 2;
  s.players = Array.isArray(s.players) && s.players.length ? s.players : initialState().players;
  s.monthThemes = Array.isArray(s.monthThemes) && s.monthThemes.length ? s.monthThemes : [...firstMonthThemes];
  s.proposals = s.proposals && typeof s.proposals === 'object' ? s.proposals : {};
  s.activeWeek = Math.min(4, Math.max(1, Number(s.activeWeek) || 1));
  s.weeks = Array.isArray(s.weeks) && s.weeks.length === 4 ? s.weeks : blankWeeks();
  s.weeks.forEach((w, i) => {
    w.week = i + 1;
    w.theme = w.theme || null;
    w.challenge = w.challenge || null;
    w.scores = w.scores && typeof w.scores === 'object' ? w.scores : {};
  });
  s.history = Array.isArray(s.history) ? s.history : [];
  return s;
}

function migrateLegacy() {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const old = JSON.parse(raw);
    const migrated = initialState(old.players);
    if (old.monthKey === currentMonthKey()) {
      migrated.activeWeek = old.activeWeek || 1;
      migrated.weeks = Array.isArray(old.weeks) && old.weeks.length === 4 ? old.weeks : migrated.weeks;
    }
    return normalizeState(migrated);
  } catch {
    return null;
  }
}

function hasMonthActivity(s) {
  return s.weeks?.some(w => w.theme || Object.values(w.scores || {}).some(score => Number(score?.base || 0) > 0 || score?.bonus));
}

function totalForPlayerInWeeks(playerId, weeks) {
  return (weeks || []).reduce((sum, w) => {
    const score = w.scores?.[playerId];
    return sum + (score ? Number(score.base || 0) + (score.bonus ? 2 : 0) : 0);
  }, 0);
}

function weeklyWinsForPlayer(playerId, weeks, players) {
  let wins = 0;
  (weeks || []).forEach(w => {
    const scored = players.map(p => ({ id: p.id, pts: (() => {
      const s = w.scores?.[p.id];
      return s ? Number(s.base || 0) + (s.bonus ? 2 : 0) : 0;
    })() }));
    const max = Math.max(0, ...scored.map(x => x.pts));
    if (max > 0 && scored.find(x => x.id === playerId)?.pts === max) wins++;
  });
  return wins;
}

function archiveMonth(s) {
  if (!hasMonthActivity(s)) return;
  if (s.history.some(h => h.monthKey === s.monthKey)) return;

  const standings = s.players.map(p => ({
    id: p.id,
    name: p.name,
    points: totalForPlayerInWeeks(p.id, s.weeks),
    weeklyWins: weeklyWinsForPlayer(p.id, s.weeks, s.players)
  })).sort((a, b) => b.points - a.points || b.weeklyWins - a.weeklyWins || a.name.localeCompare(b.name, 'fr'));

  const top = standings[0];
  const winnerId = top && top.points > 0 ? top.id : null;

  s.history.push({
    monthKey: s.monthKey,
    year: yearFromMonthKey(s.monthKey),
    label: monthLabelFromKey(s.monthKey),
    winnerId,
    winnerName: winnerId ? top.name : null,
    winningPoints: winnerId ? top.points : 0,
    standings,
    themes: [...s.monthThemes],
    proposals: { ...s.proposals }
  });
}

function rollToCurrentMonth(s) {
  if (s.monthKey === currentMonthKey()) return s;
  archiveMonth(s);
  const previousThemes = [...(s.monthThemes || [])];
  s.monthKey = currentMonthKey();
  s.monthThemes = generateMonthlyThemes(previousThemes);
  s.proposals = {};
  s.activeWeek = 1;
  s.weeks = blankWeeks();
  return s;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    let parsed = raw ? normalizeState(JSON.parse(raw)) : migrateLegacy() || initialState();
    parsed = rollToCurrentMonth(parsed);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    return parsed;
  } catch {
    return initialState();
  }
}

let state = loadState();
let spinRotation = 0;
let spinning = false;

const els = {
  monthTitle: document.getElementById('monthTitle'),
  monthSubtitle: document.getElementById('monthSubtitle'),
  progressBadge: document.getElementById('progressBadge'),
  weekTabs: document.getElementById('weekTabs'),
  weekStatus: document.getElementById('weekStatus'),
  wheel: document.getElementById('wheel'),
  selectedTheme: document.getElementById('selectedTheme'),
  themeHint: document.getElementById('themeHint'),
  spinBtn: document.getElementById('spinBtn'),
  spinBtnText: document.getElementById('spinBtnText'),
  challengeText: document.getElementById('challengeText'),
  podium: document.getElementById('podium'),
  rankingList: document.getElementById('rankingList'),
  annualYear: document.getElementById('annualYear'),
  annualLeader: document.getElementById('annualLeader'),
  annualList: document.getElementById('annualList'),
  historyList: document.getElementById('historyList'),
  settingsBtn: document.getElementById('settingsBtn'),
  settingsSheet: document.getElementById('settingsSheet'),
  closeSettings: document.getElementById('closeSettings'),
  sheetBackdrop: document.getElementById('sheetBackdrop'),
  playersEditor: document.getElementById('playersEditor'),
  playerCount: document.getElementById('playerCount'),
  themesEditor: document.getElementById('themesEditor'),
  themeCount: document.getElementById('themeCount'),
  proposalPlayer: document.getElementById('proposalPlayer'),
  newThemeInput: document.getElementById('newThemeInput'),
  addThemeBtn: document.getElementById('addThemeBtn'),
  proposalsEditor: document.getElementById('proposalsEditor'),
  proposalCount: document.getElementById('proposalCount'),
  newPlayerInput: document.getElementById('newPlayerInput'),
  addPlayerBtn: document.getElementById('addPlayerBtn'),
  resetBtn: document.getElementById('resetBtn'),
  scoreModeBtn: document.getElementById('scoreModeBtn'),
  scoreSheet: document.getElementById('scoreSheet'),
  closeScore: document.getElementById('closeScore'),
  scoreWeekNo: document.getElementById('scoreWeekNo'),
  scoreEditor: document.getElementById('scoreEditor'),
  saveScoresBtn: document.getElementById('saveScoresBtn'),
  toast: document.getElementById('toast')
};

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function escapeHTML(str = '') {
  return String(str).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
}

function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() || '').join('');
}

function allMonthThemes() {
  const proposals = Object.values(state.proposals || {}).map(p => p.theme).filter(Boolean);
  return [...state.monthThemes, ...proposals].filter((theme, index, arr) => arr.findIndex(t => t.toLowerCase() === theme.toLowerCase()) === index);
}

function wheelCandidates() {
  const usedByOtherWeeks = new Set(state.weeks
    .filter(w => w.week !== state.activeWeek && w.theme)
    .map(w => w.theme.toLowerCase()));
  return allMonthThemes().filter(t => !usedByOtherWeeks.has(t.toLowerCase()));
}

function buildWheel() {
  const themes = wheelCandidates();
  const count = Math.max(themes.length, 1);
  const deg = 360 / count;
  const stops = themes.length
    ? themes.map((_, i) => `${palette[i % palette.length]} ${i * deg}deg ${(i + 1) * deg}deg`).join(',')
    : '#2b2e35 0deg 360deg';
  els.wheel.style.background = `conic-gradient(${stops})`;
}

function weekData() {
  return state.weeks[state.activeWeek - 1];
}

function currentRanking() {
  return state.players.map(p => ({ ...p, points: totalForPlayerInWeeks(p.id, state.weeks) }))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'fr'));
}

function annualStats() {
  const year = yearFromMonthKey(state.monthKey);
  const map = new Map(state.players.map(p => [p.id, { id: p.id, name: p.name, wins: 0, points: totalForPlayerInWeeks(p.id, state.weeks) }]));

  state.history.filter(h => h.year === year).forEach(h => {
    (h.standings || []).forEach(row => {
      if (!map.has(row.id)) map.set(row.id, { id: row.id, name: row.name, wins: 0, points: 0 });
      map.get(row.id).points += Number(row.points || 0);
    });
    if (h.winnerId) {
      if (!map.has(h.winnerId)) map.set(h.winnerId, { id: h.winnerId, name: h.winnerName || 'Ancien joueur', wins: 0, points: 0 });
      map.get(h.winnerId).wins += 1;
    }
  });

  return [...map.values()].sort((a, b) => b.wins - a.wins || b.points - a.points || a.name.localeCompare(b.name, 'fr'));
}

function render() {
  els.monthTitle.textContent = monthLabelFromKey(state.monthKey);
  els.monthSubtitle.textContent = `${allMonthThemes().length} thèmes disponibles · 4 semaines · 4 défis`;
  const completed = state.weeks.filter(w => w.theme).length;
  els.progressBadge.textContent = `${completed}/4`;
  renderWeekTabs();
  renderWeek();
  renderRanking();
  renderAnnual();
  renderEditors();
  buildWheel();
}

function renderWeekTabs() {
  els.weekTabs.innerHTML = state.weeks.map(w => `
    <button class="week-tab ${w.week === state.activeWeek ? 'active' : ''} ${w.theme ? 'done' : ''}" data-week="${w.week}">S${w.week}</button>
  `).join('');
  els.weekTabs.querySelectorAll('.week-tab').forEach(btn => btn.addEventListener('click', () => {
    state.activeWeek = Number(btn.dataset.week);
    saveState();
    render();
  }));
}

function renderWeek() {
  const w = weekData();
  els.weekStatus.textContent = `Semaine ${state.activeWeek} · ${w.theme ? 'thème verrouillé' : 'thème à tirer'}`;
  els.selectedTheme.textContent = w.theme || 'À découvrir';
  els.themeHint.textContent = w.theme
    ? 'Le dress code est fixé. Ce thème ne pourra pas tomber sur une autre semaine ce mois-ci.'
    : `${wheelCandidates().length} thèmes encore disponibles pour ce tirage.`;
  els.challengeText.textContent = w.challenge || 'Le défi apparaîtra après le tirage du thème.';
  els.spinBtnText.textContent = w.theme ? 'Relancer cette semaine' : 'Lancer la roulette';
  els.spinBtn.disabled = spinning || wheelCandidates().length < 1;
}

function renderRanking() {
  const ranking = currentRanking();
  const top = ranking.slice(0, 3);
  const order = [top[1], top[0], top[2]];
  els.podium.innerHTML = order.map((p, idx) => {
    if (!p) return '<div></div>';
    const actualRank = idx === 0 ? 2 : idx === 1 ? 1 : 3;
    return `<div class="podium-item ${actualRank === 1 ? 'first' : ''}">
      <div class="avatar">${escapeHTML(initials(p.name))}</div>
      <div class="podium-name">${escapeHTML(p.name)}</div>
      <div class="podium-score">${p.points} pts</div>
      <div class="podium-rank">#${actualRank}</div>
    </div>`;
  }).join('');

  els.rankingList.innerHTML = ranking.map((p, i) => `
    <div class="rank-row">
      <div class="rank-no">#${i + 1}</div>
      <div class="rank-name">${escapeHTML(p.name)}</div>
      <div class="rank-points">${p.points} pts</div>
    </div>
  `).join('') || '<p class="empty-copy">Ajoute des participants pour commencer.</p>';
}

function renderAnnual() {
  const year = yearFromMonthKey(state.monthKey);
  const stats = annualStats();
  const leader = stats[0];
  els.annualYear.textContent = year;
  els.annualLeader.innerHTML = leader
    ? `<strong>${escapeHTML(leader.name)}</strong><span>${leader.wins} victoire${leader.wins > 1 ? 's' : ''} mensuelle${leader.wins > 1 ? 's' : ''} · ${leader.points} pts saison</span>`
    : '<strong>Aucun leader</strong><span>La saison commence ici.</span>';

  els.annualList.innerHTML = stats.map((p, i) => `
    <div class="annual-row">
      <span class="annual-pos">${i + 1}</span>
      <div><strong>${escapeHTML(p.name)}</strong><small>${p.points} pts cumulés</small></div>
      <div class="win-chip">${p.wins} win${p.wins > 1 ? 's' : ''}</div>
    </div>
  `).join('');

  const yearHistory = state.history.filter(h => h.year === year).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  els.historyList.innerHTML = yearHistory.length
    ? yearHistory.slice(0, 12).map(h => `
      <div class="history-row">
        <span>${escapeHTML(h.label.replace(` ${year}`, ''))}</span>
        <strong>${h.winnerName ? `🏆 ${escapeHTML(h.winnerName)}` : 'Pas de gagnant'}</strong>
      </div>
    `).join('')
    : '<p class="empty-copy">Les gagnants mensuels apparaîtront ici dès le prochain changement de mois.</p>';
}

function renderEditors() {
  els.playerCount.textContent = state.players.length;
  els.playersEditor.innerHTML = state.players.map(p => `
    <div class="editor-item"><span>${escapeHTML(p.name)}</span><button class="remove-btn" data-remove-player="${p.id}" aria-label="Supprimer ${escapeHTML(p.name)}">×</button></div>
  `).join('');

  els.playersEditor.querySelectorAll('[data-remove-player]').forEach(btn => btn.addEventListener('click', () => {
    if (state.players.length <= 2) return showToast('Garde au moins 2 participants');
    const id = btn.dataset.removePlayer;
    state.players = state.players.filter(p => p.id !== id);
    delete state.proposals[id];
    state.weeks.forEach(w => { if (w.scores) delete w.scores[id]; });
    saveState(); render();
  }));

  els.themeCount.textContent = state.monthThemes.length;
  els.themesEditor.innerHTML = state.monthThemes.map(t => `<div class="editor-item theme-readonly"><span>${escapeHTML(t)}</span><em>du mois</em></div>`).join('');

  els.proposalPlayer.innerHTML = state.players.map(p => {
    const has = Boolean(state.proposals[p.id]);
    return `<option value="${p.id}">${escapeHTML(p.name)}${has ? ' · déjà proposé' : ''}</option>`;
  }).join('');

  const proposalEntries = Object.entries(state.proposals);
  els.proposalCount.textContent = `${proposalEntries.length}/${state.players.length}`;
  els.proposalsEditor.innerHTML = proposalEntries.length ? proposalEntries.map(([playerId, proposal]) => {
    const player = state.players.find(p => p.id === playerId);
    const used = state.weeks.some(w => w.theme?.toLowerCase() === proposal.theme.toLowerCase());
    return `<div class="proposal-item">
      <div><strong>${escapeHTML(proposal.theme)}</strong><span>proposé par ${escapeHTML(player?.name || proposal.playerName || 'Participant')}</span></div>
      <button class="remove-btn" data-remove-proposal="${playerId}" ${used ? 'disabled title="Déjà tiré ce mois-ci"' : ''}>×</button>
    </div>`;
  }).join('') : '<p class="empty-copy">Chaque participant peut ajouter 1 thème personnel ce mois-ci.</p>';

  els.proposalsEditor.querySelectorAll('[data-remove-proposal]').forEach(btn => btn.addEventListener('click', () => {
    const id = btn.dataset.removeProposal;
    const proposal = state.proposals[id];
    if (!proposal) return;
    if (state.weeks.some(w => w.theme?.toLowerCase() === proposal.theme.toLowerCase())) return showToast('Ce thème a déjà été tiré');
    delete state.proposals[id];
    saveState(); render();
  }));
}

function spinWheel() {
  if (spinning) return;
  const w = weekData();
  const candidates = wheelCandidates();
  if (!candidates.length) return showToast('Plus de thème disponible');
  if (w.theme && !confirm('Relancer changera le thème et le défi de cette semaine. Continuer ?')) return;

  spinning = true;
  renderWeek();
  const idx = Math.floor(Math.random() * candidates.length);
  const count = candidates.length;
  const segment = 360 / count;
  const centerDeg = idx * segment + segment / 2;
  const targetAtTop = 360 - centerDeg;
  const rounds = 5 + Math.floor(Math.random() * 3);
  spinRotation += rounds * 360 + targetAtTop - (spinRotation % 360);
  els.wheel.style.transform = `rotate(${spinRotation}deg)`;

  setTimeout(() => {
    w.theme = candidates[idx];
    w.challenge = challengeTemplates[Math.floor(Math.random() * challengeTemplates.length)];
    w.scores = w.scores || {};
    spinning = false;
    saveState();
    render();
    showToast(`Semaine ${state.activeWeek} : ${w.theme}`);
    if (navigator.vibrate) navigator.vibrate([40, 30, 60]);
  }, 4250);
}

function openSheet(sheet) {
  document.body.classList.add('sheet-open');
  els.sheetBackdrop.classList.add('show');
  sheet.classList.add('show');
  sheet.setAttribute('aria-hidden', 'false');
}

function closeSheets() {
  document.body.classList.remove('sheet-open');
  els.sheetBackdrop.classList.remove('show');
  [els.settingsSheet, els.scoreSheet].forEach(sheet => {
    sheet.classList.remove('show');
    sheet.setAttribute('aria-hidden', 'true');
  });
}

function addPlayer() {
  const name = els.newPlayerInput.value.trim();
  if (!name) return;
  if (state.players.some(p => p.name.toLowerCase() === name.toLowerCase())) return showToast('Ce participant existe déjà');
  state.players.push({ id: uid(), name });
  els.newPlayerInput.value = '';
  saveState(); render();
}

function addThemeProposal() {
  const playerId = els.proposalPlayer.value;
  const player = state.players.find(p => p.id === playerId);
  const theme = els.newThemeInput.value.trim();
  if (!player || !theme) return showToast('Choisis un participant et écris un thème');
  if (theme.length < 3) return showToast('Nom de thème trop court');

  const existing = state.proposals[playerId];
  if (existing && state.weeks.some(w => w.theme?.toLowerCase() === existing.theme.toLowerCase())) {
    return showToast('Sa proposition a déjà été tirée ce mois-ci');
  }

  const duplicate = allMonthThemes().some(t => t.toLowerCase() === theme.toLowerCase() && t.toLowerCase() !== existing?.theme?.toLowerCase());
  if (duplicate) return showToast('Ce thème est déjà dans la roulette');

  state.proposals[playerId] = { theme, playerName: player.name };
  els.newThemeInput.value = '';
  saveState(); render();
  showToast(existing ? 'Proposition remplacée' : 'Thème ajouté pour ce mois');
}

function openScoreSheet() {
  const w = weekData();
  if (!w.theme) return showToast('Tire d’abord le thème de cette semaine');
  els.scoreWeekNo.textContent = state.activeWeek;
  els.scoreEditor.innerHTML = state.players.map(p => {
    const s = w.scores?.[p.id] || { base: 0, bonus: false };
    return `<div class="score-item" data-player-score="${p.id}">
      <div class="score-player"><span>${escapeHTML(p.name)}</span><span>${Number(s.base || 0) + (s.bonus ? 2 : 0)} pts</span></div>
      <div class="score-controls">
        <div class="score-stepper">
          <button data-minus="${p.id}" type="button">−</button>
          <div class="score-value" data-value="${p.id}">${Number(s.base || 0)}</div>
          <button data-plus="${p.id}" type="button">+</button>
        </div>
        <label class="bonus-check"><input type="checkbox" data-bonus="${p.id}" ${s.bonus ? 'checked' : ''}> Défi +2</label>
      </div>
    </div>`;
  }).join('');

  els.scoreEditor.querySelectorAll('[data-minus]').forEach(btn => btn.addEventListener('click', () => changeTempScore(btn.dataset.minus, -1)));
  els.scoreEditor.querySelectorAll('[data-plus]').forEach(btn => btn.addEventListener('click', () => changeTempScore(btn.dataset.plus, 1)));
  openSheet(els.scoreSheet);
}

function changeTempScore(id, delta) {
  const valueEl = els.scoreEditor.querySelector(`[data-value="${id}"]`);
  let val = Number(valueEl.textContent);
  val = Math.max(0, Math.min(10, val + delta));
  valueEl.textContent = val;
  updateScorePreview(id);
}

function updateScorePreview(id) {
  const item = els.scoreEditor.querySelector(`[data-player-score="${id}"]`);
  const base = Number(item.querySelector(`[data-value="${id}"]`).textContent);
  const bonus = item.querySelector(`[data-bonus="${id}"]`).checked;
  item.querySelector('.score-player span:last-child').textContent = `${base + (bonus ? 2 : 0)} pts`;
}

function saveScores() {
  const w = weekData();
  w.scores = w.scores || {};
  state.players.forEach(p => {
    const item = els.scoreEditor.querySelector(`[data-player-score="${p.id}"]`);
    w.scores[p.id] = {
      base: Number(item.querySelector(`[data-value="${p.id}"]`).textContent),
      bonus: item.querySelector(`[data-bonus="${p.id}"]`).checked
    };
  });
  saveState(); render(); closeSheets(); showToast('Scores enregistrés');
}

function resetMonth() {
  if (!confirm('Recommencer ce mois ? Les scores, thèmes tirés et propositions seront effacés. Aucune victoire mensuelle ne sera attribuée.')) return;
  const previous = [...state.monthThemes];
  state.monthThemes = generateMonthlyThemes(previous);
  state.proposals = {};
  state.activeWeek = 1;
  state.weeks = blankWeeks();
  saveState(); render(); closeSheets(); showToast('Nouveau tirage de thèmes prêt');
}

let toastTimer;
function showToast(message) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add('show');
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2200);
}

els.spinBtn.addEventListener('click', spinWheel);
els.settingsBtn.addEventListener('click', () => openSheet(els.settingsSheet));
els.closeSettings.addEventListener('click', closeSheets);
els.closeScore.addEventListener('click', closeSheets);
els.sheetBackdrop.addEventListener('click', closeSheets);
els.addPlayerBtn.addEventListener('click', addPlayer);
els.addThemeBtn.addEventListener('click', addThemeProposal);
els.newPlayerInput.addEventListener('keydown', e => { if (e.key === 'Enter') addPlayer(); });
els.newThemeInput.addEventListener('keydown', e => { if (e.key === 'Enter') addThemeProposal(); });
els.resetBtn.addEventListener('click', resetMonth);
els.scoreModeBtn.addEventListener('click', openScoreSheet);
els.saveScoresBtn.addEventListener('click', saveScores);
els.scoreEditor.addEventListener('change', e => {
  if (e.target.matches('[data-bonus]')) updateScorePreview(e.target.dataset.bonus);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheets(); });

render();
