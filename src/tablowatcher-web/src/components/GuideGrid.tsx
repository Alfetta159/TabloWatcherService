import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CardContent } from '@/components/ui/card'

interface ChannelDetails {
  callSign: string
  name: string
  major: number
  minor: number
}

interface GridChannelInfo {
  objectId: number
  channel: ChannelDetails
}

interface GridAiring {
  airingDetails: {
    datetime: string
    duration: number
    showTitle: string
  }
}

interface GridChannel {
  channel: GridChannelInfo
  airings: GridAiring[]
}

interface GuideGridResponse {
  updatedAt: string | null
  channels: GridChannel[]
}

const WINDOW_HOURS = 3
const HOUR_WIDTH_PX = 240
const HALF_HOUR_WIDTH_PX = HOUR_WIDTH_PX / 2
const ROW_HEIGHT_PX = 56
const WINDOW_MS = WINDOW_HOURS * 60 * 60 * 1000

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

export function GuideGrid() {
  const [windowStart, setWindowStart] = useState(() => roundDownToHalfHour(new Date()))
  const [data, setData] = useState<GuideGridResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const windowEnd = useMemo(() => new Date(windowStart.getTime() + WINDOW_MS), [windowStart])

  useEffect(() => {
    const params = new URLSearchParams({
      from: windowStart.toISOString(),
      to: windowEnd.toISOString(),
    })

    fetch(`/api/guide/grid?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error(`API returned ${res.status}`)
        return res.json() as Promise<GuideGridResponse>
      })
      .then(setData)
      .catch((err) => setError(err.message))
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

  return (
    <>
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="text-sm font-medium">
          {windowStart.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })} &ndash;{' '}
          {windowEnd.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
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
            {data?.channels.map((c) => (
              <div
                key={c.channel.objectId}
                className="flex items-center gap-2 border-b px-2 text-sm"
                style={{ height: ROW_HEIGHT_PX }}
              >
                <span className="text-muted-foreground text-xs">
                  {c.channel.channel.major}.{c.channel.channel.minor}
                </span>
                <span className="truncate font-medium">{c.channel.channel.name}</span>
              </div>
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

            {data?.channels.map((c) => (
              <div key={c.channel.objectId} className="relative border-b" style={{ height: ROW_HEIGHT_PX }}>
                {c.airings.map((a) => {
                  const { left, width } = positionOf(a)
                  return (
                    <div
                      key={a.airingDetails.datetime + a.airingDetails.showTitle}
                      className="bg-secondary text-secondary-foreground absolute top-1 bottom-1 overflow-hidden rounded-md px-2 py-1 text-xs"
                      style={{ left, width }}
                      title={a.airingDetails.showTitle}
                    >
                      {a.airingDetails.showTitle}
                    </div>
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
