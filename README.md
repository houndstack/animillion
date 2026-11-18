# Animillion

Animillion is a daily anime trivia game. Name one anime for each of seven prompts. Correct titles score more when fewer AniList users have them on their lists. The daily challenge resets at midnight UTC. Practice is replayable.

## Run locally

Use Node.js 22 or newer. There are no dependencies to install.

```sh
node scripts/serve.mjs
node --test
node scripts/build.mjs
```

Open `http://127.0.0.1:5173`. The build copies the static site to `dist/`. Use `node scripts/serve.mjs --dist` to serve that output. On Windows, `npm.cmd run dev` also bypasses PowerShell's script execution policy for `npm.ps1`.

## Game and data

- `src/prompts.js` holds the authored clues and their AniList predicates. Keep prompt IDs stable so saved runs can be restored. Edit the bank between daily rounds to keep the same lineup available throughout a UTC day.
- `src/game.js` manages the round, scoring, and share text. Each browser saves its own rounds. The daily lineup is determined by the UTC date.
- `src/anilist.js` checks the submitted title against live AniList search results, then applies the clue's criteria. A title can only be recognized if the search returns one of its AniList entries. Player guesses, outcomes, and relevant entry IDs are saved locally. AniList search responses are kept in memory.

To verify that each clue has multiple eligible answers, run `node scripts/verify-prompts.mjs`. It performs one targeted, rate-limited live lookup per clue and prints aggregate counts. Append prompt IDs to check a subset.

Anime data comes from [AniList](https://anilist.co/). See the [AniList API terms](https://docs.anilist.co/guide/terms-of-use).
