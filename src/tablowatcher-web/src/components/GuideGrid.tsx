import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CardContent } from '@/components/ui/card'

interface ChannelDetails {
  callSign: string
  name: string
  major: number
  minor: number
  network: string
}

export interface GridChannelInfo {
  objectId: number
  channel: ChannelDetails
}

interface EpisodeInfo {
  title: string | null
  description: string
  number: number
  seasonNumber: number
}

interface MovieAiringInfo {
  releaseYear: number
}

interface GridAiring {
  airingDetails: {
    datetime: string
    duration: number
    showTitle: string
  }
  moviePath?: string | null
  seriesPath?: string | null
  episode?: EpisodeInfo | null
  movieAiring?: MovieAiringInfo | null
}

interface GridChannel {
  channel: GridChannelInfo
  airings: GridAiring[]
}

interface GuideGridResponse {
  updatedAt: string | null
  channels: GridChannel[]
}

export interface SelectedProgram {
  title: string
  subtitle: string
  description: string | null
  backgroundImageUrl: string | null
}

export interface WatchedChannel {
  objectId: number
  tuningLabel: string
}

function airingKey(a: GridAiring): string {
  return a.airingDetails.datetime + a.airingDetails.showTitle
}

function nowPlayingAiring(airings: GridAiring[]): GridAiring | null {
  const now = Date.now()
  return (
    airings.find((a) => {
      const start = new Date(a.airingDetails.datetime).getTime()
      const end = start + a.airingDetails.duration * 1000
      return start <= now && now < end
    }) ?? null
  )
}

function selectionForChannel(c: GridChannel): SelectedProgram {
  const nowPlaying = nowPlayingAiring(c.airings)
  if (nowPlaying) {
    return {
      title: nowPlaying.airingDetails.showTitle,
      subtitle: describeAiring(nowPlaying, c.channel.channel.callSign),
      description: descriptionFor(nowPlaying),
      backgroundImageUrl: backgroundImageUrlFor(nowPlaying),
    }
  }

  return {
    title: c.channel.channel.callSign,
    subtitle: c.channel.channel.network,
    description: null,
    backgroundImageUrl: null,
  }
}

// e.g. "3.2 Me-TV M*A*S*H" - what the player shows while it tunes.
function tuningLabelFor(c: GridChannel): string {
  const { major, minor, callSign } = c.channel.channel
  const nowPlaying = nowPlayingAiring(c.airings)
  return [`${major}.${minor}`, callSign, nowPlaying?.airingDetails.showTitle].filter(Boolean).join(' ')
}

function backgroundImageUrlFor(a: GridAiring): string | null {
  if (a.moviePath) return `/api/images/background?moviePath=${encodeURIComponent(a.moviePath)}`
  if (a.seriesPath) return `/api/images/background?seriesPath=${encodeURIComponent(a.seriesPath)}`
  return null
}

function describeAiring(a: GridAiring, channelName: string): string {
  if (a.episode) {
    const se = a.episode.seasonNumber > 0 ? `S${a.episode.seasonNumber}E${a.episode.number}` : null
    const parts = [se, a.episode.title].filter(Boolean)
    if (parts.length > 0) return parts.join(' · ')
  }

  if (a.movieAiring) {
    return a.movieAiring.releaseYear ? `Movie · ${a.movieAiring.releaseYear}` : 'Movie'
  }

  const start = new Date(a.airingDetails.datetime)
  return `${channelName} · ${start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
}

function descriptionFor(a: GridAiring): string | null {
  return a.episode?.description || null
}

const WINDOW_HOURS = 6
const HOUR_WIDTH_PX = 240
const HALF_HOUR_WIDTH_PX = HOUR_WIDTH_PX / 2
const ROW_HEIGHT_PX = 56
const WINDOW_MS = WINDOW_HOURS * 60 * 60 * 1000

// The backend only rebuilds its airings cache every 15 minutes (AiringsRefreshService),
// but polling this endpoint is cheap - it just reads that in-memory cache, no device call -
// so poll more often to pick up a fresh cache soon after it lands rather than waiting a
// full cycle.
const POLL_INTERVAL_MS = 60_000
// Until the server's first airings refresh lands, check back often so listings appear promptly.
const LOADING_POLL_INTERVAL_MS = 5_000

function formatUpdatedAt(updatedAt: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(updatedAt).getTime()) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  return `${minutes}m ago`
}

function roundDownToHalfHour(date: Date): Date {
  const rounded = new Date(date)
  rounded.setMinutes(date.getMinutes() < 30 ? 0 : 30, 0, 0)
  return rounded
}

function formatTick(date: Date): string {
  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: date.getMinutes() === 0 ? undefined : '2-digit',
  })
}

interface GuideGridProps {
  // Fired for both channel and program clicks - updates the preview pane's details.
  onSelect?: (program: SelectedProgram) => void
  // Fired only for channel-column clicks: program cells just preview what's on, without
  // interrupting the channel already playing.
  onWatchChannel?: (channel: WatchedChannel) => void
  // Channel object id -> the tuner last known to be showing it, shown on that channel's row.
  tunerByChannel?: Record<number, number>
  // The device's channel list, loaded independently of airings - shown as the rows (with no
  // programs) until the server has finished building the guide.
  channels?: GridChannelInfo[]
}

export function GuideGrid({ onSelect, onWatchChannel, tunerByChannel, channels }: GuideGridProps) {
  const [windowStart, setWindowStart] = useState(() => roundDownToHalfHour(new Date()))
  const [data, setData] = useState<GuideGridResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(null)

  const windowEnd = useMemo(() => new Date(windowStart.getTime() + WINDOW_MS), [windowStart])

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    function load() {
      const params = new URLSearchParams({
        from: windowStart.toISOString(),
        to: windowEnd.toISOString(),
      })

      fetch(`/api/guide/grid?${params}`)
        .then((res) => {
          if (!res.ok) throw new Error(`API returned ${res.status}`)
          return res.json() as Promise<GuideGridResponse>
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
  }, [windowStart, windowEnd])

  const ticks = useMemo(() => {
    const result: Date[] = []
    for (let t = windowStart.getTime(); t < windowEnd.getTime(); t += 30 * 60 * 1000) {
      result.push(new Date(t))
    }
    return result
  }, [windowStart, windowEnd])

  const nowOffset = useMemo(() => {
    const now = Date.now()
    if (now < windowStart.getTime() || now > windowEnd.getTime()) return null
    return ((now - windowStart.getTime()) / WINDOW_MS) * (WINDOW_HOURS * HOUR_WIDTH_PX)
  }, [windowStart])

  function positionOf(airing: GridAiring) {
    const start = new Date(airing.airingDetails.datetime).getTime()
    const end = start + airing.airingDetails.duration * 1000
    const clippedStart = Math.max(start, windowStart.getTime())
    const clippedEnd = Math.min(end, windowEnd.getTime())
    const totalWidth = WINDOW_HOURS * HOUR_WIDTH_PX

    return {
      left: ((clippedStart - windowStart.getTime()) / WINDOW_MS) * totalWidth,
      width: Math.max(((clippedEnd - clippedStart) / WINDOW_MS) * totalWidth - 4, 20),
    }
  }

  const listingsLoading = !data?.updatedAt
  const rows: GridChannel[] =
    data?.updatedAt || !channels ? (data?.channels ?? []) : channels.map((channel) => ({ channel, airings: [] }))

  return (
    <>
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium">
            {windowStart.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })} &ndash;{' '}
            {windowEnd.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </span>
          {data?.updatedAt ? (
            <span className="text-muted-foreground text-xs">Updated {formatUpdatedAt(data.updatedAt)}</span>
          ) : (
            <span className="text-muted-foreground flex items-center gap-1 self-center text-xs">
              <LoaderCircle className="size-3 animate-spin" aria-hidden />
              Loading listings…
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setWindowStart(new Date(windowStart.getTime() - WINDOW_MS))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWindowStart(roundDownToHalfHour(new Date()))}>
            Now
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setWindowStart(new Date(windowStart.getTime() + WINDOW_MS))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {error && (
        <div className="text-destructive p-4 text-sm">Couldn't load the guide: {error}</div>
      )}

      <CardContent className="flex-1 overflow-auto p-0">
        <div className="flex w-fit">
          <div className="bg-card sticky left-0 z-10 w-32 shrink-0 border-r">
            <div className="h-8 border-b" />
            {rows.map((c) => (
              <button
                key={c.channel.objectId}
                type="button"
                className={
                  'flex w-full flex-col justify-center gap-0.5 border-b px-2 text-left text-sm transition-colors ' +
                  (c.channel.objectId === selectedChannelId ? 'bg-secondary' : 'hover:bg-muted')
                }
                style={{ height: ROW_HEIGHT_PX }}
                onClick={() => {
                  setSelectedChannelId(c.channel.objectId)
                  setSelectedKey(null)
                  onSelect?.(selectionForChannel(c))
                  onWatchChannel?.({ objectId: c.channel.objectId, tuningLabel: tuningLabelFor(c) })
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs">
                    {c.channel.channel.major}.{c.channel.channel.minor}
                  </span>
                  <span className="truncate font-medium">{c.channel.channel.callSign}</span>
                </div>
                <div className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
                  <span className="truncate">{c.channel.channel.network}</span>
                  {tunerByChannel?.[c.channel.objectId] !== undefined && (
                    <span className="shrink-0">Tuner {tunerByChannel[c.channel.objectId]}</span>
                  )}
                </div>
              </button>
            ))}
          </div>

          <div className="relative" style={{ width: WINDOW_HOURS * HOUR_WIDTH_PX }}>
            <div className="flex h-8 border-b">
              {ticks.map((tick) => (
                <div
                  key={tick.toISOString()}
                  className="text-muted-foreground flex shrink-0 items-center border-r px-2 text-xs"
                  style={{ width: HALF_HOUR_WIDTH_PX }}
                >
                  {formatTick(tick)}
                </div>
              ))}
            </div>

            {rows.map((c) => (
              <div key={c.channel.objectId} className="relative border-b" style={{ height: ROW_HEIGHT_PX }}>
                {listingsLoading && (
                  <div className="bg-muted/60 absolute inset-x-1 top-1 bottom-1 animate-pulse rounded-md" />
                )}
                {c.airings.map((a) => {
                  const { left, width } = positionOf(a)
                  const key = airingKey(a)
                  const selected = key === selectedKey

                  return (
                    <button
                      key={key}
                      type="button"
                      className={
                        'absolute top-1 bottom-1 overflow-hidden rounded-md px-2 py-1 text-left text-xs transition-colors ' +
                        (selected
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary text-secondary-foreground hover:bg-secondary/70')
                      }
                      style={{ left, width }}
                      title={a.airingDetails.showTitle}
                      onClick={() => {
                        setSelectedKey(key)
                        onSelect?.({
                          title: a.airingDetails.showTitle,
                          subtitle: describeAiring(a, c.channel.channel.callSign),
                          description: descriptionFor(a),
                          backgroundImageUrl: backgroundImageUrlFor(a),
                        })
                      }}
                    >
                      {a.airingDetails.showTitle}
                    </button>
                  )
                })}
              </div>
            ))}

            {nowOffset !== null && (
              <div className="bg-primary absolute top-0 bottom-0 w-px" style={{ left: nowOffset }} />
            )}
          </div>
        </div>
      </CardContent>
    </>
  )
}
