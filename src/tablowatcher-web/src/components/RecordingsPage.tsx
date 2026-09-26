import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { CircleDot, Clapperboard } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RecordingPill } from '@/components/Recording'
import type { ChannelInfo } from '@/components/PosterGridPage'
import { compareTitles } from '@/lib/format'
import type { RecordingState } from '@/lib/recording'

type Kind = 'tv' | 'movie' | 'sport' | 'program'

interface Artwork {
  thumbnailImageId: number | null
  coverImageId: number | null
  backgroundImageId: number | null
}

// GET /api/recordings: a series/program with all its recordings, or one movie/sports event.
interface RecordingGroup extends Artwork {
  key: string
  kind: Kind
  title: string
  subtitle: string | null
  description: string | null
  genres: string[]
  snapshotImageId: number | null
  recordingCount: number
  unwatchedCount: number
  latestRecordedAt: string
  // Bytes.
  totalSize: number
  inProgress: boolean
  failedCount: number
}

// GET /api/recordings/scheduled: an upcoming airing set to record.
interface ScheduledItem extends Artwork {
  key: string
  kind: Kind
  title: string
  subtitle: string | null
  description: string | null
  genres: string[]
  datetime: string
  duration: number
  channel: ChannelInfo
  recordingState: RecordingState | null
}

interface ListResponse<T> {
  updatedAt: string | null
  items: T[]
}

type Tab = 'all' | 'tv' | 'movie' | 'sport' | 'scheduled'

const TABS: [Tab, string][] = [
  ['all', 'All'],
  ['tv', 'TV Shows'],
  ['movie', 'Movies'],
  ['sport', 'Sports'],
  ['scheduled', 'Scheduled'],
]

// Programs (e.g. local newscasts) are TV too, just without series data behind them.
const TAB_KINDS: Record<Exclude<Tab, 'all' | 'scheduled'>, Kind[]> = {
  tv: ['tv', 'program'],
  movie: ['movie'],
  sport: ['sport'],
}

type SortOrder = 'name' | 'date'

// The recordings cache refreshes every 15 minutes (RecordingsRefreshService); re-reading
// it is cheap, and until the first load lands check back often.
const POLL_INTERVAL_MS = 60_000
const LOADING_POLL_INTERVAL_MS = 5_000

// Polls one of the Recordings endpoints.
function usePolledList<T>(endpoint: string) {
  const [data, setData] = useState<ListResponse<T> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    function load() {
      fetch(endpoint)
        .then((res) => {
          if (!res.ok) throw new Error(`API returned ${res.status}`)
          return res.json() as Promise<ListResponse<T>>
        })
        .then((d) => {
          if (cancelled) return
          setData(d)
          setError(null)
          return d
        })
        .catch((err) => {
          if (!cancelled) setError(err.message)
        })
        .then((d) => {
          if (!cancelled) timer = setTimeout(load, d?.updatedAt ? POLL_INTERVAL_MS : LOADING_POLL_INTERVAL_MS)
        })
    }

    load()

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [endpoint])

  return { data, error }
}

function formatDate(datetime: string): string {
  return new Date(datetime).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDateTime(datetime: string): string {
  const start = new Date(datetime)
  if (start.getTime() <= Date.now()) return 'On now'
  return start.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function formatSize(bytes: number): string {
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`
}

// Prefer the portrait poster; landscape art or a frame from the recording beat nothing.
function posterImageId(artwork: Artwork, snapshotImageId: number | null = null): number | null {
  return artwork.thumbnailImageId ?? artwork.coverImageId ?? snapshotImageId ?? artwork.backgroundImageId
}

// The layout shared by recorded and scheduled cards: poster (with pills), then text lines.
function RecordingCard({
  title,
  subtitle,
  description,
  imageId,
  pill,
  lines,
  genres,
}: {
  title: string
  subtitle: string | null
  description: string | null
  imageId: number | null
  pill: ReactNode
  lines: string[]
  genres: string[]
}) {
  const [imageFailed, setImageFailed] = useState(false)

  return (
    <Card className="gap-0 overflow-hidden py-0" title={description ?? undefined}>
      <div className="bg-muted relative flex aspect-[2/3] items-center justify-center">
        {imageId != null && !imageFailed ? (
          <img
            src={`/api/images/${imageId}`}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="text-muted-foreground flex flex-col items-center gap-2 p-4 text-center text-sm">
            <Clapperboard className="size-8" />
            {title}
          </div>
        )}
        {pill && <div className="absolute top-2 right-2">{pill}</div>}
      </div>
      <div className="space-y-1 p-3 text-sm">
        <p className="line-clamp-2 font-medium leading-snug">{title}</p>
        {subtitle && <p className="text-muted-foreground line-clamp-1 text-xs">{subtitle}</p>}
        {lines.map((line) => (
          <p key={line} className="text-muted-foreground text-xs">
            {line}
          </p>
        ))}
        {genres.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {genres.slice(0, 2).map((g) => (
              <Badge key={g} variant="secondary" className="text-xs">
                {g}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}

// Shown while something is being recorded right now.
function RecordingNowPill() {
  return (
    <Badge className="gap-1 bg-red-600 text-white shadow">
      <CircleDot className="size-3 animate-pulse" />
      Recording
    </Badge>
  )
}

function recordedLines(group: RecordingGroup): string[] {
  // Counted for series and programs - and for a movie recorded more than once.
  const grouped = group.kind === 'tv' || group.kind === 'program' || group.recordingCount > 1
  return [
    `Recorded ${formatDate(group.latestRecordedAt)}`,
    grouped
      ? `${group.recordingCount} recording${group.recordingCount === 1 ? '' : 's'}` +
        (group.unwatchedCount > 0 ? ` · ${group.unwatchedCount} unwatched` : '')
      : group.unwatchedCount > 0
        ? 'Unwatched'
        : 'Watched',
    formatSize(group.totalSize) + (group.failedCount > 0 ? ` · ${group.failedCount} failed` : ''),
  ]
}

export function RecordingsPage() {
  const [tab, setTab] = useState<Tab>('all')
  const [sortOrder, setSortOrder] = useState<SortOrder>('date')
  const recorded = usePolledList<RecordingGroup>('/api/recordings')
  const scheduled = usePolledList<ScheduledItem>('/api/recordings/scheduled')

  const showingScheduled = tab === 'scheduled'
  const current = showingScheduled ? scheduled : recorded

  // Newest recordings first; soonest scheduled airings first. Ties go by title.
  const visibleRecorded = useMemo(() => {
    const items = (recorded.data?.items ?? []).filter((g) => tab === 'all' || (tab !== 'scheduled' && TAB_KINDS[tab].includes(g.kind)))
    return items.sort((a, b) =>
      sortOrder === 'date'
        ? Date.parse(b.latestRecordedAt) - Date.parse(a.latestRecordedAt) || compareTitles(a.title, b.title)
        : compareTitles(a.title, b.title),
    )
  }, [recorded.data, tab, sortOrder])

  const visibleScheduled = useMemo(
    () =>
      [...(scheduled.data?.items ?? [])].sort((a, b) =>
        sortOrder === 'date'
          ? Date.parse(a.datetime) - Date.parse(b.datetime) || compareTitles(a.title, b.title)
          : compareTitles(a.title, b.title) || Date.parse(a.datetime) - Date.parse(b.datetime),
      ),
    [scheduled.data, sortOrder],
  )

  const count = showingScheduled ? visibleScheduled.length : visibleRecorded.length
  const recordingTotal = visibleRecorded.reduce((sum, g) => sum + g.recordingCount, 0)

  return (
    <div className="space-y-6">
      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
        <TabsList>
          {TABS.map(([value, label]) => (
            <TabsTrigger key={value} value={value}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="recordings-sort">Sort by</Label>
          <select
            id="recordings-sort"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as SortOrder)}
            className="border-input bg-background focus-visible:ring-ring/50 h-9 min-w-40 rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
          >
            <option value="name">Name</option>
            <option value="date">{showingScheduled ? 'Air date' : 'Date recorded'}</option>
          </select>
        </div>
        {current.data?.updatedAt && (
          <p className="text-muted-foreground text-sm">
            {showingScheduled
              ? `${count} airing${count === 1 ? '' : 's'} set to record`
              : `${count} title${count === 1 ? '' : 's'} · ${recordingTotal} recording${recordingTotal === 1 ? '' : 's'}`}
          </p>
        )}
      </div>

      {current.error && (
        <Alert variant="destructive">
          <AlertTitle>Couldn't reach the API</AlertTitle>
          <AlertDescription>
            {showingScheduled ? '/api/recordings/scheduled' : '/api/recordings'} returned an error: {current.error}
          </AlertDescription>
        </Alert>
      )}

      {current.data && !current.data.updatedAt && (
        <Alert>
          <AlertTitle>{showingScheduled ? 'The guide is still loading' : 'Recordings are still loading'}</AlertTitle>
          <AlertDescription>
            The server hasn't finished reading {showingScheduled ? 'the guide' : 'the recordings'} from the Tablo yet.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-4">
        {showingScheduled
          ? visibleScheduled.map((item) => (
              <RecordingCard
                key={item.key}
                title={item.title}
                subtitle={item.subtitle}
                description={item.description}
                imageId={posterImageId(item)}
                pill={item.recordingState && <RecordingPill state={item.recordingState} />}
                lines={[formatDateTime(item.datetime), `${item.channel.major}.${item.channel.minor} ${item.channel.callSign}`]}
                genres={item.genres}
              />
            ))
          : visibleRecorded.map((group) => (
              <RecordingCard
                key={group.key}
                title={group.title}
                subtitle={group.subtitle}
                description={group.description}
                imageId={posterImageId(group, group.snapshotImageId)}
                pill={group.inProgress && <RecordingNowPill />}
                lines={recordedLines(group)}
                genres={group.genres}
              />
            ))}
      </div>
    </div>
  )
}
