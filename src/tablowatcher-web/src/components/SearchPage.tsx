import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, LoaderCircle, Search } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { RecordButton, RecordingPill, ScheduleStatus } from '@/components/Recording'
import { TagFilterControls } from '@/components/TagFilterControls'
import { useTagFilters } from '@/hooks/useTagFilters'
import { recordingStateOf, type AiringSchedule, type RecordingState } from '@/lib/recording'

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
  schedule?: AiringSchedule | null
}

interface SearchResult {
  airing: SearchAiring
  matchedFields: MatchedField[]
  matchedCast: string[]
  genres: string[]
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
  genres: Set<string>
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
        genres: new Set(),
        results: [],
      }
      groups.set(key, group)
    }
    result.matchedFields.forEach((f) => group.matchedFields.add(f))
    result.matchedCast.forEach((c) => group.matchedCast.add(c))
    result.genres.forEach((g) => group.genres.add(g))
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

// The pill for a group's header: any of its airings in conflict, else any set to record.
function groupRecordingState(group: ShowGroup): RecordingState | null {
  const states = group.results.map((r) => recordingStateOf(r.airing.schedule ?? null))
  return states.includes('conflict') ? 'conflict' : states.includes('scheduled') ? 'scheduled' : null
}

export function SearchPage() {
  const [term, setTerm] = useState('')
  const [response, setResponse] = useState<SearchResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set())
  const tagFilters = useTagFilters('search')

  const groups = useMemo(() => {
    const allGroups = response ? groupByShow(response.results) : []
    if (tagFilters.includeTags.size === 0) return allGroups
    return allGroups.filter((g) => [...g.genres].some((genre) => tagFilters.includeTags.has(genre)))
  }, [response, tagFilters.includeTags])

  const visibleAiringCount = useMemo(() => groups.reduce((sum, g) => sum + g.results.length, 0), [groups])

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

  function runSearch(q: string) {
    return fetch(`/api/search?${new URLSearchParams({ q })}`)
      .then((res) => {
        if (!res.ok) throw new Error(`API returned ${res.status}`)
        return res.json() as Promise<SearchResponse>
      })
      .then(setResponse)
      .catch((err) => setError(err.message))
  }

  function search(e: FormEvent) {
    e.preventDefault()
    const q = term.trim()
    if (!q) return

    setLoading(true)
    setError(null)
    runSearch(q).finally(() => setLoading(false))
  }

  // After a recording is set or cancelled, re-run the same search (quietly, keeping which
  // groups are collapsed) so every result's status is current - scheduling one airing of a
  // movie can also skip or un-skip its other airings.
  function refreshResults() {
    if (response) runSearch(response.query)
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

      <div className="flex flex-wrap items-end gap-4">
        <TagFilterControls {...tagFilters} />
      </div>

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
          {visibleAiringCount === 0
            ? `Nothing upcoming matches "${response.query}".`
            : `${visibleAiringCount} airing${visibleAiringCount === 1 ? '' : 's'} of ${groups.length} show${groups.length === 1 ? '' : 's'} match "${response.query}"` +
              (response.totalCount > response.results.length ? ` (showing the first ${response.results.length})` : '') +
              '.'}
        </p>
      )}

      {response &&
        groups.map((group) => {
          const collapsed = collapsedKeys.has(group.key)
          const groupState = groupRecordingState(group)
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
                  <div className="flex shrink-0 items-center gap-1.5">
                    {groupState && <RecordingPill state={groupState} />}
                    <Badge variant="outline">{group.kind}</Badge>
                  </div>
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
                      <div key={airing.path} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="font-medium">{formatAiringTime(airing)}</span>
                            <span className="text-muted-foreground">{formatChannel(airing)}</span>
                            <ScheduleStatus schedule={airing.schedule ?? null} />
                          </div>
                          {label && <p>{highlight(label, response.query)}</p>}
                          {description && (
                            <p className="text-muted-foreground line-clamp-2">{highlight(description, response.query)}</p>
                          )}
                        </div>
                        <RecordButton path={airing.path} schedule={airing.schedule ?? null} onChanged={refreshResults} />
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
