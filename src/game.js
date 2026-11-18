import { prompts, promptById } from './prompts.js';

export const ROUND_SIZE = 7;
export const PREVIEW_MS = 3_000;
export const ANSWER_MS = 25_000;
export const MAX_POINTS = 700;

export const tiers = [
  { min: 250_000, points: 10, label: 'Mainstream' },
  { min: 100_000, points: 20, label: 'Fan Favorite' },
  { min: 25_000, points: 40, label: 'Off the Radar' },
  { min: 5_000, points: 60, label: 'Deep Cut' },
  { min: 1_000, points: 80, label: 'Hidden Gem' },
  { min: 0, points: 100, label: 'Lost Broadcast' },
];

export function tierFor(popularity) {
  return tiers.find(({ min }) => popularity >= min);
}

export function utcDay(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

function shuffle(items, random) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const selected = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[selected]] = [shuffled[selected], shuffled[index]];
  }
  return shuffled;
}

export function dailyPrompts(day) {
  let seed = Number(day.replaceAll('-', ''));
  const random = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  return shuffle(prompts, random).slice(0, ROUND_SIZE).map(({ id }) => id);
}

export function practicePrompts(day, previous = [], random = Math.random) {
  const exclude = new Set([...dailyPrompts(day), ...previous]);
  return shuffle(prompts.filter(({ id }) => !exclude.has(id)), random)
    .slice(0, ROUND_SIZE).map(({ id }) => id);
}

export function newRound(mode, day, now, previous = []) {
  return {
    mode, day,
    promptIds: mode === 'daily' ? dailyPrompts(day) : practicePrompts(day, previous),
    results: [], index: 0, phase: 'preview', deadline: now + PREVIEW_MS,
  };
}

export function finishGuess(round, outcome, points = 0, mediaId) {
  const { pending, ...rest } = round;
  const result = { outcome, points, ...(pending && { guess: pending }), ...(mediaId && { mediaId }) };
  return { ...rest, results: [...round.results, result], phase: 'feedback', deadline: null };
}

export function advanceClock(round, now) {
  if (round.phase === 'preview' && now >= round.deadline) {
    round = { ...round, phase: 'answer', deadline: round.deadline + ANSWER_MS };
  }
  if (round.phase === 'answer' && now >= round.deadline) {
    return finishGuess(round, 'timeout');
  }
  return round;
}

export function submitGuess(round, input, now) {
  const current = advanceClock(round, now);
  const guess = input.trim();
  if (current.phase !== 'answer' || !guess) return current;
  return { ...current, pending: guess, phase: 'checking', deadline: null };
}

export function nextPrompt(round, now) {
  if (round.phase !== 'feedback') return round;
  if (round.results.length === ROUND_SIZE) return { ...round, phase: 'complete' };
  return { ...round, index: round.index + 1, phase: 'preview', deadline: now + PREVIEW_MS };
}

export function restoreRound(round, now) {
  if (!round || !['daily', 'practice'].includes(round.mode) ||
      !['preview', 'answer', 'checking', 'unavailable', 'feedback', 'complete'].includes(round.phase) ||
      !Array.isArray(round.promptIds) || round.promptIds.length !== ROUND_SIZE ||
      !round.promptIds.every((id) => promptById.has(id)) ||
      !Number.isInteger(round.index) || round.index < 0 || round.index >= ROUND_SIZE ||
      !Array.isArray(round.results) || round.results.length > ROUND_SIZE) return null;
  if (round.phase === 'checking') return { ...round, phase: 'unavailable' };
  return advanceClock(round, now);
}

export function totalPoints(round) {
  return round.results.reduce((total, result) => total + result.points, 0);
}

export function shareText(round, url) {
  const symbols = { 0: '⬛', 10: '⬜', 20: '🟨', 40: '🟧', 60: '🟥', 80: '🟪', 100: '🟩' };
  const title = round.mode === 'daily' ? `Animillion · ${round.day}` : 'Animillion · Practice';
  return [title, round.results.map(({ points }) => symbols[points]).join(''),
    `${totalPoints(round)}/${MAX_POINTS} pts`, url].filter(Boolean).join('\n');
}
