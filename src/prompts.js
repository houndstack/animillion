// IDs are permanent because saved runs refer to them.
const genre = (name) => ({ field: 'genres', value: name });
const tag = (name) => ({ field: 'tags', value: name });
const format = (value) => ({ field: 'format', value });
const source = (value) => ({ field: 'source', value });
const decade = (value) => ({ field: 'decade', value });

export const prompts = [
  ['sports', 'Genre', 'Name a sports anime.', genre('Sports')],
  ['horror', 'Genre', 'Name an anime in the horror genre.', genre('Horror')],
  ['mystery', 'Genre', 'Name an anime in the mystery genre.', genre('Mystery')],
  ['music', 'Genre', 'Name an anime in the music genre.', genre('Music')],
  ['psychological', 'Genre', 'Name a psychological anime.', genre('Psychological')],
  ['mecha', 'Genre', 'Name a mecha anime.', genre('Mecha')],
  ['sci-fi', 'Genre', 'Name a science fiction anime.', genre('Sci-Fi')],
  ['slice-of-life', 'Genre', 'Name a slice-of-life anime.', genre('Slice of Life')],
  ['romance', 'Genre', 'Name an anime in the romance genre.', genre('Romance')],
  ['supernatural', 'Genre', 'Name an anime in the supernatural genre.', genre('Supernatural')],
  ['adventure', 'Genre', 'Name an anime in the adventure genre.', genre('Adventure')],
  ['thriller', 'Genre', 'Name a thriller anime.', genre('Thriller')],
  ['school', 'Tag', 'Name an anime tagged School.', tag('School')],
  ['isekai', 'Tag', 'Name an anime tagged Isekai.', tag('Isekai')],
  ['magic', 'Tag', 'Name an anime tagged Magic.', tag('Magic')],
  ['vampire', 'Tag', 'Name an anime tagged Vampire.', tag('Vampire')],
  ['space', 'Tag', 'Name an anime tagged Space.', tag('Space')],
  ['demons', 'Tag', 'Name an anime tagged Demons.', tag('Demons')],
  ['detective', 'Tag', 'Name an anime tagged Detective.', tag('Detective')],
  ['cooking', 'Tag', 'Name an anime tagged Food.', tag('Food')],
  ['idol', 'Tag', 'Name an anime tagged Idol.', tag('Idol')],
  ['samurai', 'Tag', 'Name an anime tagged Samurai.', tag('Samurai')],
  ['martial-arts', 'Tag', 'Name an anime tagged Martial Arts.', tag('Martial Arts')],
  ['video-games', 'Tag', 'Name an anime tagged Video Games.', tag('Video Games')],
  ['eighties', 'Release date', 'Name an anime that premiered in the 1980s.', decade(1980)],
  ['nineties', 'Release date', 'Name an anime that premiered in the 1990s.', decade(1990)],
  ['aughts', 'Release date', 'Name an anime that premiered in the 2000s.', decade(2000)],
  ['tens', 'Release date', 'Name an anime that premiered in the 2010s.', decade(2010)],
  ['twenties', 'Release date', 'Name an anime that premiered in the 2020s.', decade(2020)],
  ['manga', 'Source', 'Name an anime adapted from a manga.', source('MANGA')],
  ['light-novel', 'Source', 'Name an anime adapted from a light novel.', source('LIGHT_NOVEL')],
  ['visual-novel', 'Source', 'Name an anime adapted from a visual novel.', source('VISUAL_NOVEL')],
  ['video-game-source', 'Source', 'Name an anime adapted from a video game.', source('VIDEO_GAME')],
  ['original', 'Source', 'Name an anime classified as an original work.', source('ORIGINAL')],
  ['fantasy-film', 'Genre + format', 'Name a fantasy anime film.', genre('Fantasy'), format('MOVIE')],
  ['romance-film', 'Genre + format', 'Name a romance anime film.', genre('Romance'), format('MOVIE')],
  ['sci-fi-film', 'Genre + format', 'Name a science fiction anime film.', genre('Sci-Fi'), format('MOVIE')],
  ['drama-film', 'Genre + format', 'Name a drama anime film.', genre('Drama'), format('MOVIE')],
  ['nineties-action', 'Genre + release date', 'Name an action anime that premiered in the 1990s.', genre('Action'), decade(1990)],
  ['aughts-comedy', 'Genre + release date', 'Name a comedy anime that premiered in the 2000s.', genre('Comedy'), decade(2000)],
  ['tens-fantasy', 'Genre + release date', 'Name a fantasy anime that premiered in the 2010s.', genre('Fantasy'), decade(2010)],
  ['manga-action', 'Genre + source', 'Name an action anime adapted from a manga.', genre('Action'), source('MANGA')],
].map(([id, category, text, ...rules]) => ({ id, category, text, rules }));

export const promptById = new Map(prompts.map((prompt) => [prompt.id, prompt]));
