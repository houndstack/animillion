import { AniListError, verifyGuess } from './anilist.js';
import {
  advanceClock, ANSWER_MS, finishGuess, newRound, nextPrompt, PREVIEW_MS,
  restoreRound, ROUND_SIZE, shareText, submitGuess, tiers, totalPoints, utcDay,
} from './game.js';
import { promptById } from './prompts.js';

const byId = (id) => document.getElementById(id);
const home = byId('home');
const game = byId('game');
const results = byId('results');
const form = byId('guess-form');
const input = byId('guess');
const next = byId('next-button');
const retry = byId('retry-button');
const rules = byId('rules');
const storagePrefix = 'animillion:v1:';
const cooldownKey = `${storagePrefix}anilist-retry-at`;
const memory = new Map();
const dateFormat = new Intl.DateTimeFormat('en', {
  month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
});
const colors = { 10: '#f2ded4', 20: '#edc478', 40: '#ff925e', 60: '#f27e91', 80: '#bd98f6', 100: '#99e0af' };

let round = null;
let homeDay;
let liveTitle = '';
let errorMessage = '';
let retryAt = loadCooldown();

function loadCooldown() {
  try { return Number(localStorage.getItem(cooldownKey)) || 0; } catch { return 0; }
}

const keyFor = (mode, day) => `${storagePrefix}${mode === 'daily' ? `daily:${day}` : 'practice'}`;

function loadRound(mode, day) {
  const key = keyFor(mode, day);
  try {
    const serialized = localStorage.getItem(key);
    return serialized ? JSON.parse(serialized) : memory.get(key);
  } catch {
    return memory.get(key);
  }
}

function saveRound(value) {
  const key = keyFor(value.mode, value.day);
  memory.set(key, value);
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Session play still works. */ }
}

function updateHome() {
  homeDay = utcDay();
  byId('broadcast-date').textContent = dateFormat.format(new Date(`${homeDay}T00:00:00Z`));
  const daily = restoreRound(loadRound('daily', homeDay), Date.now());
  const practice = restoreRound(loadRound('practice', homeDay), Date.now());
  const dailyLabel = daily?.phase === 'complete' ? 'Daily results' : daily ? 'Resume daily' : 'Play daily';
  byId('daily-button').firstChild.textContent = `${dailyLabel} `;
  byId('practice-button').firstChild.textContent = practice && practice.phase !== 'complete' ? 'Resume practice ' : 'Practice ';
}

function showHome(focus = true) {
  round = null;
  home.hidden = false;
  game.hidden = true;
  results.hidden = true;
  updateHome();
  if (focus) byId('hero-title').focus();
}

function openRound(mode, fresh = false) {
  const now = Date.now();
  const day = utcDay(now);
  const saved = restoreRound(loadRound(mode, day), now);
  liveTitle = '';
  errorMessage = '';
  round = saved && !fresh && (mode === 'daily' || saved.phase !== 'complete') ? saved :
    newRound(mode, day, now, mode === 'practice' ? saved?.promptIds : undefined);
  input.value = '';
  commit(round, true);
  window.scrollTo(0, 0);
}

function commit(value, focus = false) {
  round = value;
  saveRound(round);
  if (round.phase === 'complete') renderResults(focus);
  else renderGame(focus);
}

function renderTimer(now) {
  if (!round || round.phase === 'complete') return;
  const timed = round.phase === 'answer' || round.phase === 'preview';
  const clock = byId('clock');
  let remaining = 0;
  if (timed) {
    const duration = round.phase === 'answer' ? ANSWER_MS : PREVIEW_MS;
    remaining = Math.max(0, round.deadline - now);
    byId('timer-fill').style.transform = `scaleX(${Math.min(1, remaining / duration)})`;
  }
  const seconds = `${Math.ceil(remaining / 1000)}s`;
  const label = timed ? seconds : '—';
  if (clock.textContent !== label) clock.textContent = label;
  clock.classList.toggle('urgent', round.phase === 'answer' && remaining <= 5000);
  byId('timer-track').hidden = !timed;

  if (round.phase === 'unavailable') {
    const waiting = Math.ceil((retryAt - now) / 1000);
    retry.disabled = waiting > 0;
    const label = waiting > 0 ? `Retry in ${waiting}s` : 'Retry check';
    if (retry.textContent !== label) retry.textContent = label;
  }
}

const verdicts = {
  incorrect: ['Doesn’t fit this prompt', 'AniList recognized that title, but it didn’t meet the prompt’s criteria.'],
  unknown: ['Title not found', 'AniList’s search didn’t return a matching title for this spelling.'],
  timeout: ['Time’s up', 'No answer was submitted.'],
  skipped: ['Prompt skipped', 'The submitted answer could not be verified.'],
};

function setMediaLink(link, id, title) {
  link.href = `https://anilist.co/anime/${id}`;
  link.textContent = title;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
}

function renderVerdict(result) {
  const title = byId('verdict-title');
  const detail = byId('verdict-detail');
  const link = byId('media-link');
  const correct = result.outcome === 'correct';
  title.classList.toggle('correct', correct);
  link.hidden = !correct;
  if (correct) {
    const tier = tiers.find(({ points }) => points === result.points);
    title.textContent = `${tier.label} · +${result.points} pts`;
    setMediaLink(link, result.mediaId, liveTitle || result.guess || 'View on AniList');
    detail.textContent = '';
  } else {
    [title.textContent, detail.textContent] = verdicts[result.outcome];
  }
}

function renderGame(focus) {
  const now = Date.now();
  home.hidden = true;
  game.hidden = false;
  results.hidden = true;
  const prompt = promptById.get(round.promptIds[round.index]);
  const { phase } = round;
  const feedback = phase === 'feedback';
  const unavailable = phase === 'unavailable';
  byId('game-label').textContent = round.mode === 'daily' ? 'Daily broadcast' : 'Practice';
  byId('round-number').textContent = `${round.index + 1} / ${ROUND_SIZE}`;
  byId('game-score').textContent = totalPoints(round);
  byId('category').textContent = prompt.category;
  byId('prompt').textContent = prompt.text;
  byId('segments').replaceChildren(...round.promptIds.map((_, index) => {
    const mark = document.createElement('span');
    const result = round.results[index];
    mark.className = result ? (result.points ? 'scored' : 'missed') : index === round.index ? 'active' : '';
    return mark;
  }));
  form.hidden = phase !== 'answer';
  byId('verdict').hidden = !feedback;
  byId('game-actions').hidden = !feedback && !unavailable;
  next.hidden = !feedback;
  retry.hidden = !unavailable;
  byId('skip-button').hidden = !unavailable;
  if (feedback) {
    renderVerdict(round.results.at(-1));
    next.textContent = round.index === ROUND_SIZE - 1 ? 'See results →' : 'Next prompt →';
  }
  const phaseText = {
    preview: 'Read the prompt. The answer field opens in a moment.',
    checking: `Checking “${round.pending}” on AniList…`,
    unavailable: `${errorMessage || 'The answer check was interrupted.'} Your guess is saved.`,
  };
  byId('phase-message').textContent = phaseText[phase] ?? '';
  renderTimer(now);

  if (!focus || rules.open) return;
  if (phase === 'answer') input.focus({ preventScroll: true });
  else if (feedback) {
    byId('verdict-title').tabIndex = -1;
    byId('verdict-title').focus({ preventScroll: true });
  } else if (unavailable) (retry.disabled ? byId('skip-button') : retry).focus({ preventScroll: true });
  else byId('prompt').focus({ preventScroll: true });
}

function renderResults(focus) {
  home.hidden = true;
  game.hidden = true;
  results.hidden = false;
  byId('results-label').textContent = round.mode === 'daily' ? 'Daily broadcast' : 'Practice';
  byId('result-score').textContent = totalPoints(round);
  byId('share-status').textContent = '';
  byId('manual-share').hidden = true;
  byId('replay-button').firstChild.textContent = round.mode === 'practice' ? 'Play again ' : 'Play practice ';
  byId('result-marks').replaceChildren(...round.results.map(({ points }) => {
    const mark = document.createElement('span');
    if (colors[points]) mark.style.setProperty('--mark', colors[points]);
    return mark;
  }));
  byId('result-list').replaceChildren(...round.results.map((result, index) => {
    const row = document.createElement('li');
    const number = document.createElement('span');
    const clue = document.createElement('div');
    const answer = document.createElement('small');
    const score = document.createElement('span');
    number.className = 'index';
    number.textContent = String(index + 1).padStart(2, '0');
    clue.textContent = promptById.get(round.promptIds[index]).text;
    answer.textContent = result.guess || verdicts[result.outcome]?.[0] || '';
    if (result.mediaId) {
      const link = document.createElement('a');
      setMediaLink(link, result.mediaId, answer.textContent || 'View on AniList');
      answer.replaceChildren(link);
    } else if (result.guess) {
      answer.textContent += ` · ${verdicts[result.outcome][0]}`;
    }
    clue.append(answer);
    score.className = 'points';
    score.textContent = `+${result.points}`;
    row.append(number, clue, score);
    return row;
  }));
  if (focus) byId('results-title').focus();
}

async function checkAnswer(checking) {
  if (retryAt > Date.now()) {
    errorMessage = 'AniList asked us to slow down.';
    commit({ ...checking, phase: 'unavailable' }, true);
    return;
  }
  commit(checking);
  try {
    const verdict = await verifyGuess(checking.pending, promptById.get(checking.promptIds[checking.index]));
    if (round !== checking) return;
    liveTitle = verdict.title ?? '';
    commit(finishGuess(checking, verdict.outcome, verdict.points, verdict.mediaId), true);
  } catch (error) {
    if (error instanceof AniListError && error.retryAt > retryAt) {
      retryAt = error.retryAt;
      try { localStorage.setItem(cooldownKey, String(retryAt)); } catch { /* The cooldown still applies in memory. */ }
    }
    if (round !== checking) return;
    errorMessage = error instanceof AniListError ? error.message : 'The answer check was interrupted.';
    commit({ ...checking, phase: 'unavailable' }, true);
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (round?.phase !== 'answer') return;
  const updated = submitGuess(round, input.value, Date.now());
  if (updated.phase === 'checking') void checkAnswer(updated);
  else if (updated !== round) commit(updated, true);
});

next.addEventListener('click', () => {
  if (round?.phase !== 'feedback') return;
  input.value = '';
  liveTitle = '';
  commit(nextPrompt(round, Date.now()), true);
});
retry.addEventListener('click', () => {
  if (round?.phase === 'unavailable' && retryAt <= Date.now()) void checkAnswer({ ...round, phase: 'checking' });
});
byId('skip-button').addEventListener('click', () => {
  if (round?.phase === 'unavailable') commit(finishGuess(round, 'skipped'), true);
});

byId('share-button').addEventListener('click', async () => {
  const completed = round;
  const url = new URL('./', location.href).href;
  const text = shareText(completed, url);
  const status = byId('share-status');
  try {
    if (navigator.share) await navigator.share({ title: 'Animillion', text });
    else {
      await navigator.clipboard.writeText(text);
      if (round === completed) status.textContent = 'Result copied.';
    }
  } catch (error) {
    if (error.name === 'AbortError' || round !== completed) return;
    const manual = byId('manual-share');
    manual.value = text;
    manual.hidden = false;
    manual.select();
    status.textContent = 'Copy your result from the field below.';
  }
});

byId('home-link').addEventListener('click', (event) => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  showHome();
});
byId('leave-game').addEventListener('click', () => showHome());
byId('leave-results').addEventListener('click', () => showHome());
byId('open-help').addEventListener('click', () => rules.showModal());
byId('daily-button').addEventListener('click', () => openRound('daily'));
byId('practice-button').addEventListener('click', () => openRound('practice'));
byId('replay-button').addEventListener('click', () => openRound('practice', round.mode === 'practice'));

function tick() {
  const now = Date.now();
  if (!round && utcDay(now) !== homeDay) updateHome();
  if (round) {
    const updated = advanceClock(round, now);
    if (updated !== round) commit(updated, true);
    else renderTimer(now);
  }
}

window.addEventListener('storage', ({ key, newValue }) => {
  if (!key?.startsWith(storagePrefix) || !newValue) return;
  if (key === cooldownKey) {
    retryAt = Math.max(retryAt, Number(newValue) || 0);
    return;
  }
  if (!round) updateHome();
  else if (key === keyFor(round.mode, round.day)) {
    const changed = restoreRound(loadRound(round.mode, round.day), Date.now());
    if (!changed) return;
    round = changed;
    liveTitle = '';
    errorMessage = '';
    input.value = '';
    if (round.phase === 'complete') renderResults(false);
    else renderGame(false);
  }
});

showHome(false);
setInterval(tick, 100);
document.addEventListener('visibilitychange', tick);
