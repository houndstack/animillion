import { tierFor } from './game.js';

export const endpoint = 'https://graphql.anilist.co';
export const eligibleFormats = ['TV', 'TV_SHORT', 'MOVIE', 'ONA'];
export const eligibleStatuses = ['FINISHED', 'RELEASING', 'HIATUS'];
export const tagRank = 60;

export const mediaFields = `
  id type format status isAdult episodes popularity
  title { english romaji native }
  synonyms genres source(version: 2) startDate { year }
  tags { name rank isGeneralSpoiler isMediaSpoiler isAdult }
`;

const searchQuery = `query SearchTitles($search: String!, $page: Int!) {
  Page(page: $page, perPage: 50) {
    pageInfo { hasNextPage }
    media(type: ANIME, isAdult: false, search: $search, sort: SEARCH_MATCH) { ${mediaFields} }
  }
}`;

export function eligible(media) {
  return media.type === 'ANIME' && media.isAdult === false &&
    eligibleStatuses.includes(media.status) && eligibleFormats.includes(media.format) &&
    (media.format !== 'ONA' || media.episodes >= 2);
}

export function meetsPrompt(media, prompt) {
  return eligible(media) && prompt.rules.every(({ field, value }) => {
    switch (field) {
      case 'genres': return media.genres?.includes(value);
      case 'tags': return media.tags?.some((tag) => tag.name === value && tag.rank >= tagRank &&
        !tag.isGeneralSpoiler && !tag.isMediaSpoiler && !tag.isAdult);
      case 'decade': return media.startDate?.year >= value && media.startDate.year < value + 10;
      case 'format': return media.format === value;
      case 'source': return media.source === value;
      default: return false;
    }
  });
}

function foldLatinAccents(title) {
  return title.normalize('NFKD').replace(/(\p{Script=Latin})\p{M}+/gu, '$1').normalize('NFC');
}

export function normalizeTitle(title) {
  return foldLatinAccents(title).toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, '');
}

function matchesTitle(media, title) {
  return media.isAdult === false && [...Object.values(media.title ?? {}), ...(media.synonyms ?? [])]
    .some((variant) => typeof variant === 'string' && normalizeTitle(variant) === title);
}

export function gradeCandidates(guess, prompt, candidates) {
  const title = normalizeTitle(guess);
  const matches = title ? candidates.filter((media) => matchesTitle(media, title)) : [];
  const valid = matches.filter((media) => meetsPrompt(media, prompt))
    .sort((left, right) => (right.popularity ?? -1) - (left.popularity ?? -1) || left.id - right.id);
  if (!valid.length) return { outcome: matches.length ? 'incorrect' : 'unknown' };

  const media = valid[0];
  const tier = Number.isInteger(media.popularity) && tierFor(media.popularity);
  if (!tier) throw new AniListError('AniList did not return a popularity count.');
  return {
    outcome: 'correct', points: tier.points, mediaId: media.id,
    title: media.title.english || media.title.romaji || media.title.native,
  };
}

export class AniListError extends Error {
  constructor(message, retryAt = 0) {
    super(message);
    this.retryAt = retryAt;
  }
}

function cooldown(response, now) {
  const candidates = [];
  for (const header of ['Retry-After', 'X-RateLimit-Reset']) {
    const value = response.headers.get(header);
    if (!value) continue;
    const seconds = Number(value);
    if (header === 'X-RateLimit-Reset') candidates.push(seconds * 1000);
    else candidates.push(Number.isFinite(seconds) ? now + seconds * 1000 : Date.parse(value));
  }
  const future = candidates.filter((at) => at > now);
  return future.length ? Math.max(now + 1000, ...future) : now + 60_000;
}

export async function request(query, variables, fetcher = fetch) {
  let response;
  let payload;
  try {
    response = await fetcher(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables }), cache: 'no-store',
      signal: AbortSignal.timeout(7000),
    });
    if (response.status === 429) throw new AniListError('AniList asked us to slow down.', cooldown(response, Date.now()));
    payload = await response.json();
  } catch (error) {
    if (error instanceof AniListError) throw error;
    throw new AniListError('AniList couldn’t be reached.');
  }
  if (payload?.errors?.some(({ status }) => status === 429)) {
    throw new AniListError('AniList asked us to slow down.', cooldown(response, Date.now()));
  }
  if (!response.ok || payload?.errors?.length || !payload?.data) {
    throw new AniListError('AniList couldn’t verify this answer right now.');
  }
  return payload.data;
}

export async function verifyGuess(guess, prompt, fetcher = fetch) {
  const title = normalizeTitle(guess);
  if (!title) return { outcome: 'unknown' };
  const search = guess.normalize('NFKC');
  const simplified = foldLatinAccents(search).replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
  const send = async (term, page) => {
    const data = await request(searchQuery, { search: term, page }, fetcher);
    if (!Array.isArray(data.Page?.media)) throw new AniListError('AniList returned incomplete search data.');
    return data.Page;
  };
  const first = await send(search, 1);
  let candidates = first.media;
  if (!candidates.some((media) => matchesTitle(media, title))) {
    const fallback = simplified && simplified !== search ? await send(simplified, 1) :
      first.pageInfo?.hasNextPage ? await send(search, 2) : null;
    if (fallback) candidates = [...candidates, ...fallback.media];
  }
  return gradeCandidates(guess, prompt, candidates);
}
