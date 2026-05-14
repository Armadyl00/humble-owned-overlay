function normalizeTitle(title) {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[®™©]/g, '')
    .replace(/&/g, 'and')
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(
      /\s*[:\-–]\s*(game of the year|goty|definitive edition|enhanced edition|complete edition|remastered|deluxe edition|gold edition|anniversary edition|special edition|directors cut|director's cut)\s*$/i,
      ''
    )
    .replace(
      /\s+(game of the year|goty|definitive edition|enhanced edition|complete edition|remastered|deluxe edition|gold edition|anniversary edition|special edition|directors cut|director's cut)\s*$/i,
      ''
    )
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
