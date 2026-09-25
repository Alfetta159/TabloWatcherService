import { useEffect, useMemo, useState } from 'react'
import { MonitorPlay } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'

interface ShowChannel {
  objectId: number
  callSign: string
  network: string
  major: number
  minor: number
  nextAiring: string
  airingCount: number
}

interface TvShow {
  path: string
  title: string
  description: string | null
  genres: string[]
  seriesRating: string | null
  thumbnailImageId: number | null
  coverImageId: number | null
  backgroundImageId: number | null
  // Sorted by soonest airing.
  channels: ShowChannel[]
}

interface TvShowsResponse {
  updatedAt: string | null
  shows: TvShow[]
}

// Like the guide grid: the server only rebuilds its cache every 15 minutes, but re-reading
// it is cheap, and until the first refresh lands check back often.
const POLL_INTERVAL_MS = 60_000
const LOADING_POLL_INTERVAL_MS = 5_000

const ALL_CHANNELS = ''

function channelNumber(c: { major: number; minor: number }): string {
  return `${c.major}.${c.minor}`
}

function formatNextAiring(datetime: string): string {
  const start = new Date(datetime)
  if (start.getTime() <= Date.now()) return 'On now'
  return start.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// Prefer the portrait poster; the other images are landscape, but better than nothing.
function posterImageId(show: TvShow): number | null {
  return show.thumbnailImageId ?? show.coverImageId ?? show.backgroundImageId
}

function ShowCard({ show, channels }: { show: TvShow; channels: ShowChannel[] }) {
  const [imageFailed, setImageFailed] = useState(false)
  const imageId = posterImageId(show)
  const next = channels[0]
  const airingCount = channels.reduce((sum, c) => sum + c.airingCount, 0)

  return (
    <Card className="gap-0 overflow-hidden py-0" title={show.description ?? undefined}>
      <div className="bg-muted flex aspect-[2/3] items-center justify-center">
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
            <MonitorPlay className="size-8" />
            {show.title}
          </div>
        )}
      </div>
      <div className="space-y-1 p-3 text-sm">
        <p className="line-clamp-2 font-medium leading-snug">{show.title}</p>
        <p className="text-muted-foreground">
          {formatNextAiring(next.nextAiring)}
          <br />
          {channelNumber(next)} {next.callSign}
          {channels.length > 1 && ` +${channels.length - 1} more`}
        </p>
        <p className="text-muted-foreground text-xs">
          {airingCount} upcoming airing{airingCount === 1 ? '' : 's'}
        </p>
        {show.genres.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {show.genres.slice(0, 2).map((g) => (
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

export function TvShowsPage() {
  const [data, setData] = useState<TvShowsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [channelFilter, setChannelFilter] = useState(ALL_CHANNELS)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    function load() {
      fetch('/api/tv-shows')
        .then((res) => {
          if (!res.ok) throw new Error(`API returned ${res.status}`)
          return res.json() as Promise<TvShowsResponse>
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
  }, [])

  // Every channel any show is coming up on, for the filter.
  const channelOptions = useMemo(() => {
    const byId = new Map<number, ShowChannel>()
    for (const show of data?.shows ?? []) for (const c of show.channels) byId.set(c.objectId, c)
    return [...byId.values()].sort((a, b) => a.major - b.major || a.minor - b.minor)
  }, [data])

  // Each show paired with just the channels that pass the filter (so its card shows the
  // next airing on the chosen channel), dropping shows with none.
  const visible = useMemo(
    () =>
      (data?.shows ?? [])
        .map((show) => ({
          show,
          channels:
            channelFilter === ALL_CHANNELS
              ? show.channels
              : show.channels.filter((c) => String(c.objectId) === channelFilter),
        }))
        .filter(({ channels }) => channels.length > 0),
    [data, channelFilter],
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="tv-shows-channel">Channel</Label>
          <select
            id="tv-shows-channel"
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            className="border-input bg-background focus-visible:ring-ring/50 h-9 min-w-56 rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
          >
            <option value={ALL_CHANNELS}>All channels</option>
            {channelOptions.map((c) => (
              <option key={c.objectId} value={String(c.objectId)}>
                {channelNumber(c)} {c.callSign}
                {c.network && c.network !== c.callSign ? ` (${c.network})` : ''}
              </option>
            ))}
          </select>
        </div>
        {data?.updatedAt && (
          <p className="text-muted-foreground text-sm">
            {visible.length} show{visible.length === 1 ? '' : 's'} coming up
          </p>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Couldn't reach the API</AlertTitle>
          <AlertDescription>/api/tv-shows returned an error: {error}</AlertDescription>
        </Alert>
      )}

      {data && !data.updatedAt && (
        <Alert>
          <AlertTitle>The guide is still loading</AlertTitle>
          <AlertDescription>The server hasn't finished reading the guide from the Tablo yet.</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-4">
        {visible.map(({ show, channels }) => (
          <ShowCard key={show.path} show={show} channels={channels} />
        ))}
      </div>
    </div>
  )
}
