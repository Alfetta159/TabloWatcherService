// Ratings come back lowercase - "r", "pg-13", "nc-17" - with TV ratings undashed ("tvpg",
// "tv14"), so "tvpg" -> "TV-PG" and "pg-13" -> "PG-13".
export function formatRating(rating: string | null): string | null {
  if (!rating) return null
  return rating.toUpperCase().replace(/^TV(?!-)/, 'TV-')
}

// 3.5 -> "★★★½"
export function formatStars(stars: number): string {
  return '★'.repeat(Math.floor(stars)) + (stars % 1 ? '½' : '')
}

// Sorts "The Office" with the Os, matching the server's own title order (AiringsStore).
export function sortableTitle(title: string): string {
  return title.replace(/^(the|a|an)\s+(?=\S)/i, '')
}

export function compareTitles(a: string, b: string): number {
  return sortableTitle(a).localeCompare(sortableTitle(b), undefined, { sensitivity: 'base' })
}
