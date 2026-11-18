import { setTimeout as delay } from 'node:timers/promises';
import { eligibleFormats, eligibleStatuses, mediaFields, meetsPrompt, request, tagRank } from '../src/anilist.js';
import { prompts } from '../src/prompts.js';

const query = `query VerifyPrompt($genre: String, $tag: String, $rank: Int,
    $formats: [MediaFormat], $statuses: [MediaStatus], $source: MediaSource,
    $after: FuzzyDateInt, $before: FuzzyDateInt) {
  Page(page: 1, perPage: 12) {
    media(type: ANIME, isAdult: false, format_in: $formats, status_in: $statuses,
      genre: $genre, tag: $tag, minimumTagRank: $rank, source: $source,
      startDate_greater: $after, startDate_lesser: $before, sort: POPULARITY_DESC) {
      ${mediaFields}
    }
  }
}`;

const requested = new Set(process.argv.slice(2));
const selected = requested.size ? prompts.filter(({ id }) => requested.has(id)) : prompts;
if (requested.size && selected.length !== requested.size) throw new Error('Unknown prompt ID.');

let failures = 0;
for (const prompt of selected) {
  const variables = { formats: eligibleFormats, statuses: eligibleStatuses };
  for (const { field, value } of prompt.rules) {
    switch (field) {
      case 'genres': variables.genre = value; break;
      case 'tags': variables.tag = value; variables.rank = tagRank - 1; break;
      case 'format': variables.formats = [value]; break;
      case 'source': variables.source = value; break;
      case 'decade':
        variables.after = (value - 1) * 10000 + 1231;
        variables.before = (value + 10) * 10000 + 101;
        break;
    }
  }
  try {
    let data;
    try {
      data = await request(query, variables);
    } catch (error) {
      if (!error.retryAt) throw error;
      await delay(Math.max(1000, error.retryAt - Date.now()));
      data = await request(query, variables);
    }
    const count = data.Page.media.filter((media) => meetsPrompt(media, prompt)).length;
    const passes = count >= 2;
    if (!passes) failures += 1;
    console.log(`${passes ? 'PASS' : 'FAIL'} ${prompt.id} · ${count} eligible examples`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${prompt.id} · ${error.message}`);
  }
  if (prompt !== selected.at(-1)) await delay(2400);
}
console.log(`${selected.length - failures}/${selected.length} prompts verified`);
process.exitCode = failures ? 1 : 0;
