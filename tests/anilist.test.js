import assert from 'node:assert/strict';
import test from 'node:test';
import { AniListError, eligible, gradeCandidates, meetsPrompt, normalizeTitle, request, verifyGuess } from '../src/anilist.js';
import { promptById } from '../src/prompts.js';

const series = {
  id: 1, title: { english: 'Café! World', romaji: 'Sekai', native: 'ガ' },
  synonyms: ['World Zero'], genres: ['Sports'], type: 'ANIME', format: 'TV', status: 'FINISHED',
  isAdult: false, episodes: 12, popularity: 4_000, source: 'MANGA', startDate: { year: 2010 },
};
const sport = promptById.get('sports');

test('recognizes normalized English, romaji, native, and AniList-listed alternative titles', () => {
  for (const title of ['CAFE world', ' sEkAi ', 'ｶﾞ', 'World-zero']) {
    assert.equal(gradeCandidates(title, sport, [series]).mediaId, 1);
  }
  assert.notEqual(normalizeTitle('ガ'), normalizeTitle('カ'));
  assert.equal(gradeCandidates('World', sport, [series]).outcome, 'unknown');
  assert.equal(gradeCandidates('!!!', sport, [series]).outcome, 'unknown');
});

test('grades the most popular qualifying exact match and distinguishes wrong from unknown', () => {
  const popular = { ...series, id: 2, popularity: 300_000 };
  const unrelated = { ...series, id: 3, popularity: 400_000, genres: ['Horror'] };
  assert.deepEqual(gradeCandidates('Sekai', sport, [unrelated, series, popular]), {
    outcome: 'correct', points: 10, mediaId: 2, title: 'Café! World',
  });
  assert.equal(gradeCandidates('Sekai', sport, [unrelated]).outcome, 'incorrect');
  assert.equal(gradeCandidates('Somewhere else', sport, [unrelated]).outcome, 'unknown');
});

test('catalog and clue eligibility are enforced for source, era, format, and safe tag relevance', () => {
  for (const changes of [{ format: 'OVA' }, { isAdult: true }, { status: 'NOT_YET_RELEASED' },
    { type: 'MANGA' }, { format: 'ONA', episodes: 1 }, { format: 'ONA', episodes: null }]) {
    assert.equal(eligible({ ...series, ...changes }), false);
  }
  assert.equal(eligible({ ...series, format: 'ONA', episodes: 2 }), true);
  assert.equal(eligible({ ...series, format: 'TV_SHORT', status: 'RELEASING' }), true);
  assert.equal(meetsPrompt(series, promptById.get('tens')), true);
  assert.equal(meetsPrompt(series, promptById.get('aughts')), false);
  assert.equal(meetsPrompt(series, promptById.get('manga')), true);
  assert.equal(meetsPrompt(series, promptById.get('sci-fi-film')), false);
  const tag = { name: 'Isekai', rank: 60 };
  assert.equal(meetsPrompt({ ...series, tags: [tag] }, promptById.get('isekai')), true);
  for (const changes of [{ rank: 59 }, { isMediaSpoiler: true }, { isGeneralSpoiler: true }, { isAdult: true }]) {
    assert.equal(meetsPrompt({ ...series, tags: [{ ...tag, ...changes }] }, promptById.get('isekai')), false);
  }
});

test('uses a bounded lookup and falls back to an alternative search when needed', async () => {
  const queries = [];
  const mockFetch = async (url, options) => {
    const { variables } = JSON.parse(options.body);
    assert.equal(url, 'https://graphql.anilist.co');
    queries.push(variables);
    return Response.json({ data: { Page: { media: queries.length === 2 ? [series] : [] } } });
  };
  assert.equal((await verifyGuess('World-zero', sport, mockFetch)).mediaId, 1);
  assert.deepEqual(queries, [{ search: 'World-zero', page: 1 }, { search: 'World zero', page: 1 }]);
});

test('network faults, GraphQL errors, malformed results, and rate limits preserve retry information', async () => {
  await assert.rejects(() => request('', {}, () => { throw new TypeError('Disconnected'); }), AniListError);
  await assert.rejects(() => request('', {}, async () => Response.json({ errors: [{ message: 'failed' }] })), AniListError);
  await assert.rejects(() => verifyGuess('Sekai', sport, async () => Response.json({ data: {} })), AniListError);
  const start = Date.now();
  await assert.rejects(() => request('', {}, async () => new Response(null, { status: 429, headers: { 'Retry-After': '30' } })),
    (error) => error instanceof AniListError && error.retryAt >= start + 30_000);
  await assert.rejects(() => request('', {}, async () => Response.json({ errors: [{ status: 429 }] })),
    (error) => error instanceof AniListError && error.retryAt >= start + 60_000);
});
