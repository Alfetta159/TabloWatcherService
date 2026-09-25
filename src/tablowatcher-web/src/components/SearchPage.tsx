import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, LoaderCircle, Search } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

type MatchedField = 'title' | 'episodeTitle' | 'description' | 'cast'

interface SearchAiring {
  airingDetails: {
    datetime: string
    duration: number
    showTitle: string
    channel: {
      objectId: number
      channel: { callSign: string; major: number; minor: number }
    }
  }
  path: string
  moviePath?: string | null
  seriesPath?: string | null
  episode?: { title: string | null; description: string; number: number; seasonNumber: number } | null
  movieAiring?: { releaseYear: number } | null
  event?: { description: string } | null
}

interface SearchResult {
  airing: SearchAiring
  matchedFields: MatchedField[]
  matchedCast: string[]
}

interface SearchResponse {
  updatedAt: string | null
  query: string
  totalCount: number
  results: SearchResult[]
}

// All the matching airings of one series, movie or program.
interface ShowGroup {
  key: string
  title: string
  kind: string
  matchedFields: Set<MatchedField>
  matchedCast: Set<string>
  results: SearchResult[]
}

const FIELD_LABELS: Record<MatchedField, string> = {
  title: 'Title',
  episodeTitle: 'Episode title',
  description: 'Description',
  cast: 'Cast',
}

function kindOf(a: SearchAiring): string {
  if (a.moviePath) return 'Movie'
  if (a.event) return 'Sports'
  if (a.seriesPath) return 'Series'
  return 'Program'
}

// Results come back soonest-first; groups keep that order (by their soonest airing).
function groupByShow(results: SearchResult[]): ShowGroup[] {
  const groups = new Map<string, ShowGroup>()
  for (const result of results) {
    const a = result.airing
    const key = a.seriesPath ?? a.moviePath ?? a.airingDetails.showTitle
    let group = groups.get(key)
    if (!group) {
      group = {
        key,
        title: a.airingDetails.showTitle,
        kind: kindOf(a),
        matchedFields: new Set(),
        matchedCast: new Set(),
        results: [],
      }
      groups.set(key, group)
    }
    result.matchedFields.forEach((f) => group.matchedFields.add(f))
    result.matchedCast.forEach((c) => group.matchedCast.add(c))
    group.results.push(result)
  }
  return [...groups.values()]
}

function formatAiringTime(a: SearchAiring): string {
  const start = new Date(a.airingDetails.datetime)
  const now = Date.now()
  if (start.getTime() <= now) return 'On now'
  return start.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function formatChannel(a: SearchAiring): string {
  const { major, minor, callSign } = a.airingDetails.channel.channel
  return `${major}.${minor} ${callSign}`
}

function episodeLabel(a: SearchAiring): string | null {
  if (a.episode) {
    const se = a.episode.seasonNumber > 0 ? `S${a.episode.seasonNumber}E${a.episode.number}` : null
    const parts = [se, a.episode.title].filter(Boolean)
    if (parts.length > 0) return parts.join(' · ')
  }
  if (a.movieAiring?.releaseYear) return `${a.movieAiring.releaseYear}`
  return null
}

// Best-effort highlight of the term in displayed text: like the server, ignores case, treats
// any run of whitespace as matching and only matches at the start of a word - but not
// accents, so an accent-insensitive server match may just show unhighlighted.
function highlight(text: string, term: string): ReactNode {
  const words = term.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return text
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')})`, 'giu')
  return text.split(pattern).map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="rounded-sm bg-primary/20 px-0.5 text-foreground">
        {part}
      </mark>
    ) : (
      part
    ),
  )
}

export function SearchPage() {
  const [term, setTerm] = useState('')
  const [response, setResponse] = useState<SearchResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set())

  const groups = useMemo(() => (response ? groupByShow(response.results) : []), [response])

  function toggleCollapsed(key: string) {
    setCollapsedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  function search(e: FormEvent) {
    e.preventDefault()
    const q = term.trim()
    if (!q) return

    setLoading(true)
    setError(null)
    fetch(`/api/search?${new URLSearchParams({ q })}`)
      .then((res) => {
        if (!res.ok) throw new Error(`API returned ${res.status}`)
        return res.json() as Promise<SearchResponse>
      })
      .then(setResponse)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  return (
    <div className="space-y-6">
      <form onSubmit={search} className="flex gap-2">
        <Input
          type="search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search titles, episodes, actors and descriptions"
          aria-label="Search the guide"
          maxLength={100}
          autoFocus
        />
        <Button type="submit" disabled={loading || !term.trim()}>
          {loading ? <LoaderCircle className="size-4 animate-spin" /> : <Search className="size-4" />}
          Search
        </Button>
      </form>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Search failed</AlertTitle>
          <AlertDescription>/api/search returned an error: {error}</AlertDescription>
        </Alert>
      )}

      {response && !response.updatedAt && (
        <Alert>
          <AlertTitle>The guide is still loading</AlertTitle>
          <AlertDescription>The server hasn't finished reading the guide from the Tablo yet. Try again shortly.</AlertDescription>
        </Alert>
      )}

      {response?.updatedAt && (
        <p className="text-muted-foreground text-sm">
          {response.totalCount === 0
            ? `Nothing upcoming matches "${response.query}".`
            : `${response.totalCount} airing${response.totalCount === 1 ? '' : 's'} of ${groups.length} show${groups.length === 1 ? '' : 's'} match "${response.query}"` +
              (response.totalCount > response.results.length ? ` (showing the first ${response.results.length})` : '') +
              '.'}
        </p>
      )}

      {response &&
        groups.map((group) => {
          const collapsed = collapsedKeys.has(group.key)
          return (
            <Card key={group.key}>
              <CardHeader className="space-y-2">
                <button
                  type="button"
                  className="flex w-full items-start justify-between gap-2 text-left"
                  onClick={() => toggleCollapsed(group.key)}
                  aria-expanded={!collapsed}
                >
                  <div className="flex items-start gap-1.5">
                    {collapsed ? (
                      <ChevronRight className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
                    ) : (
                      <ChevronDown className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
                    )}
                    <CardTitle>{highlight(group.title, response.query)}</CardTitle>
                  </div>
                  <Badge variant="outline">{group.kind}</Badge>
                </button>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-muted-foreground">Matched:</span>
                  {[...group.matchedFields].map((f) => (
                    <Badge key={f} variant="secondary">
                      {FIELD_LABELS[f]}
                    </Badge>
                  ))}
                  {group.matchedCast.size > 0 && (
                    <span className="text-muted-foreground">({[...group.matchedCast].join(', ')})</span>
                  )}
                </div>
              </CardHeader>
              {!collapsed && (
                <CardContent className="divide-y text-sm">
                  {group.results.map(({ airing }) => {
                    const label = episodeLabel(airing)
                    const description = airing.episode?.description || airing.event?.description
                    return (
                      <div key={airing.path} className="space-y-1 py-2 first:pt-0 last:pb-0">
                        <div className="flex items-baseline justify-between gap-4">
                          <span className="font-medium">{formatAiringTime(airing)}</span>
                          <span className="text-muted-foreground shrink-0">{formatChannel(airing)}</span>
                        </div>
                        {label && <p>{highlight(label, response.query)}</p>}
                        {description && (
                          <p className="text-muted-foreground line-clamp-2">{highlight(description, response.query)}</p>
                        )}
                      </div>
                    )
                  })}
                </CardContent>
              )}
            </Card>
          )
        })}
    </div>
  )
}
