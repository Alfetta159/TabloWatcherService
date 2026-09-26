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

// 6000 -> "1h 40m"
export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  const hours = Math.floor(minutes / 60)
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`
}

// 3723 -> "1:02:03", 125 -> "2:05"
export function formatClock(seconds: number): string {
  const s = Math.floor(seconds % 60)
  const m = Math.floor(seconds / 60) % 60
  const h = Math.floor(seconds / 3600)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

export function formatSize(bytes: number): string {
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`
}
