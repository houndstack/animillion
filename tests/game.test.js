import assert from 'node:assert/strict';
import test from 'node:test';
import {
  advanceClock, dailyPrompts, finishGuess, newRound, nextPrompt, practicePrompts,
  resolveGuess, restoreRound, shareText, submitGuess, tierFor, totalPoints, utcDay,
} from '../src/game.js';
import { prompts } from '../src/prompts.js';

const now = Date.parse('2026-11-17T23:59:59.999Z');
const day = utcDay(now);

test('daily lineup is shared, distinct, and changes at midnight UTC', () => {
  assert.equal(day, '2026-11-17');
  assert.equal(utcDay(now + 1), '2026-11-18');
  assert.equal(new Set(prompts.map(({ id }) => id)).size, 42);
  const today = dailyPrompts(day);
  assert.equal(new Set(today).size, 7);
  assert.deepEqual(today, dailyPrompts(day));
  assert.notDeepEqual(today, dailyPrompts(utcDay(now + 1)));
});

test('practice does not repeat a daily prompt or a prompt from the preceding practice round', () => {
  const first = practicePrompts(day, [], () => 0.5);
  const second = practicePrompts(day, first, () => 0.5);
  assert.equal(new Set([...dailyPrompts(day), ...first, ...second]).size, 21);
});

test('a guess is accepted only during the 25-second answer window', () => {
  const round = newRound('daily', day, now);
  assert.equal(submitGuess(round, 'Anime', now + 2999).phase, 'preview');
  assert.equal(submitGuess(round, '   ', now + 3000).phase, 'answer');
  const checking = submitGuess(round, ' Anime ', now + 27999);
  assert.equal(checking.phase, 'checking');
  assert.equal(checking.pending, 'Anime');
  assert.equal(submitGuess(checking, 'Different', now + 28000), checking);
  const expired = submitGuess(round, 'Anime', now + 28000);
  assert.deepEqual(expired.results, [{ outcome: 'timeout', points: 0 }]);
});

test('reload keeps original dates, expires abandoned timers, and preserves interrupted submissions', () => {
  const round = newRound('daily', day, now);
  const inProgress = restoreRound(JSON.parse(JSON.stringify(round)), now + 5000);
  assert.equal(inProgress.phase, 'answer');
  assert.equal(inProgress.deadline, now + 28000);
  assert.equal(inProgress.day, day);
  assert.equal(restoreRound(round, now + 31000).results[0].outcome, 'timeout');
  const checking = submitGuess(round, 'Anime', now + 3000);
  const interrupted = restoreRound(checking, now + 9000);
  assert.equal(interrupted.phase, 'unavailable');
  assert.equal(interrupted.pending, 'Anime');
  assert.equal(interrupted.deadline, now + 28000);
  assert.equal(restoreRound(checking, now + 28000).results[0].outcome, 'timeout');
  assert.equal(restoreRound({ ...checking, deadline: null }, now + 31000).phase, 'unavailable');
  assert.equal(restoreRound({ ...round, promptIds: ['missing'] }, now), null);
});

test('incorrect and unrecognized guesses reopen the same prompt and deadline until a valid answer', () => {
  let round = newRound('daily', day, now);
  for (const [index, outcome] of ['incorrect', 'unknown'].entries()) {
    const checking = submitGuess(round, outcome, now + 4000 + index * 4000);
    round = resolveGuess(checking, { outcome }, now + 6000 + index * 4000);
    assert.equal(round.phase, 'answer');
    assert.equal(round.index, 0);
    assert.equal(round.lastMiss, outcome);
    assert.equal(round.pending, undefined);
    assert.equal(round.deadline, now + 28000);
    assert.deepEqual(round.results, []);
  }
  const checking = submitGuess(round, 'Valid anime', now + 11000);
  const scored = resolveGuess(checking, { outcome: 'correct', points: 80, mediaId: 123 }, now + 12000);
  assert.equal(scored.phase, 'feedback');
  assert.deepEqual(scored.results, [{ outcome: 'correct', points: 80, guess: 'Valid anime', mediaId: 123 }]);
});

test('a pending guess can finish grading after time expires, without reopening the answer field', () => {
  const round = newRound('daily', day, now);
  const checking = submitGuess(round, 'Last-second anime', now + 27999);
  assert.equal(advanceClock(checking, now + 28000), checking);
  assert.equal(submitGuess(checking, 'Late answer', now + 29000), checking);
  assert.equal(resolveGuess(checking, { outcome: 'correct', points: 80 }, now + 29000).results[0].points, 80);
  assert.deepEqual(resolveGuess(checking, { outcome: 'incorrect' }, now + 29000).results, [{ outcome: 'timeout', points: 0 }]);
  assert.equal(advanceClock({ ...checking, phase: 'unavailable' }, now + 28000).results[0].outcome, 'timeout');
});

test('all score thresholds are inclusive and only rarity and total appear in the share card', () => {
  const scoreCases = [[0, 100], [999, 100], [1_000, 80], [4_999, 80], [5_000, 60], [24_999, 60],
    [25_000, 40], [99_999, 40], [100_000, 20], [249_999, 20], [250_000, 10]];
  for (const [popularity, expected] of scoreCases) assert.equal(tierFor(popularity).points, expected);
  let round = newRound('daily', day, now);
  for (let index = 0; index < 7; index += 1) {
    const previewEnds = round.deadline;
    round = submitGuess(round, 'Secret answer', previewEnds);
    round = nextPrompt(finishGuess(round, 'correct', 100, 1000), previewEnds);
  }
  assert.equal(round.phase, 'complete');
  assert.equal(totalPoints(round), 700);
  assert.equal(advanceClock(round, now * 2), round);
  assert.equal(shareText(round, 'https://example.test/'), `Animillion · ${day}\n${'🟩'.repeat(7)}\n700/700 pts\nhttps://example.test/`);
});
