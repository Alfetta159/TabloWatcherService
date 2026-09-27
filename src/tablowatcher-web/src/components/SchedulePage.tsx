import { useCallback, useEffect, useMemo, useState } from 'react'
import { Clapperboard, TriangleAlert } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { RecordButton, ScheduleStatus } from '@/components/Recording'
import type { ChannelInfo } from '@/components/PosterGridPage'
import { compareTitles } from '@/lib/format'
import { isConflict, type AiringSchedule } from '@/lib/recording'

type Kind = 'tv' | 'movie' | 'sport' | 'program'

// GET /api/schedule: an upcoming airing a recording covers (ScheduleResponses.Item).
interface ScheduleItem {
  key: string
  path: string
  kind: Kind
  title: string
  subtitle: string | null
  description: string | null
  genres: string[]
  thumbnailImageId: number | null
  coverImageId: number | null
  backgroundImageId: number | null
  datetime: string
  duration: number
  live: boolean
  isNew: boolean
  channel: ChannelInfo
  schedule: AiringSchedule | null
}

interface ScheduleResponse {
  updatedAt: string | null
  conflictCount: number
  items: ScheduleItem[]
}

type SortOrder = 'date' | 'name'
type KindFilter = 'all' | 'tv' | 'movie' | 'sport'

const KIND_FILTERS: [KindFilter, string][] = [
  ['all', 'Everything'],
  ['tv', 'TV Shows'],
  ['movie', 'Movies'],
  ['sport', 'Sports'],
]

// Programs (e.g. local newscasts) are TV too, just without series data behind them.
function matchesKind(item: ScheduleItem, filter: KindFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'tv') return item.kind === 'tv' || item.kind === 'program'
  return item.kind === filter
}

// Like the other pages: the guide cache refreshes every 15 minutes; re-reading it is cheap.
const POLL_INTERVAL_MS = 60_000
const LOADING_POLL_INTERVAL_MS = 5_000

const ALL_CHANNELS = ''

const SELECT_CLASS_NAME =
  'border-input bg-background focus-visible:ring-ring/50 h-9 rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]'

function channelLabel(c: ChannelInfo): string {
  return `${c.major}.${c.minor} ${c.callSign}`
}

// "Today", "Tomorrow", or e.g. "Monday, Sep 28".
function dayLabel(date: Date): string {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((startOfDay(date) - startOfDay(new Date())) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })
}

function formatTimeRange(item: ScheduleItem): string {
  const start = new Date(item.datetime)
  const end = new Date(start.getTime() + item.duration * 1000)
  const time = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return `${time(start)} – ${time(end)}`
}

interface Group {
  key: string
  label: string
  items: ScheduleItem[]
}

// One airing: when, what, where, its status, and Record / Cancel.
function ScheduleRow({
  item,
  showTitle,
  showDay,
  onChanged,
}: {
  item: ScheduleItem
  // Off inside a show's group (sorted by name), where the header already names it.
  showTitle: boolean
  // On when rows aren't already grouped by day.
  showDay: boolean
  onChanged: () => void
}) {
  const [posterFailed, setPosterFailed] = useState(false)
  const conflict = isConflict(item.schedule)
  const posterId = item.thumbnailImageId ?? item.coverImageId ?? item.backgroundImageId

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 ${conflict ? 'border-l-4 border-l-amber-500 bg-amber-500/10' : 'border-l-4 border-l-transparent'} ${item.schedule?.state === 'skipped' ? 'opacity-70' : ''}`}
    >
      {showTitle && (
        <div className="bg-muted flex aspect-[2/3] w-10 shrink-0 items-center justify-center overflow-hidden rounded">
          {posterId != null && !posterFailed ? (
            <img
              src={`/api/images/${posterId}`}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
              onError={() => setPosterFailed(true)}
            />
          ) : (
            <Clapperboard className="text-muted-foreground size-4" />
          )}
        </div>
      )}
      <div className="w-36 shrink-0 text-sm">
        <p className="font-medium">{showDay ? dayLabel(new Date(item.datetime)) : formatTimeRange(item)}</p>
        <p className="text-muted-foreground text-xs">{showDay ? formatTimeRange(item) : channelLabel(item.channel)}</p>
      </div>
      <div className="min-w-0 flex-1 space-y-0.5" title={item.description ?? undefined}>
        {showTitle && <p className="truncate font-medium">{item.title}</p>}
        {item.subtitle && <p className={`truncate text-sm ${showTitle ? 'text-muted-foreground' : ''}`}>{item.subtitle}</p>}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {showDay && <span className="text-muted-foreground">{channelLabel(item.channel)}</span>}
          {item.live && <Badge variant="outline">Live</Badge>}
          {item.isNew && <Badge variant="outline">New</Badge>}
          <ScheduleStatus schedule={item.schedule} />
        </div>
      </div>
      <RecordButton path={item.path} schedule={item.schedule} onChanged={onChanged} />
    </div>
  )
}

// Every upcoming airing a recording covers, grouped by day (or by show), with conflicts
// called out and Record / Cancel on each.
export function SchedulePage() {
  const [data, setData] = useState<ScheduleResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [includeSkipped, setIncludeSkipped] = useState(false)
  const [conflictsOnly, setConflictsOnly] = useState(false)
  const [channelFilter, setChannelFilter] = useState(ALL_CHANNELS)
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const [sortOrder, setSortOrder] = useState<SortOrder>('date')
  // Bumped to re-read right away (after a Record / Cancel) rather than at the next poll.
  const [reloadToken, setReloadToken] = useState(0)
  const reload = useCallback(() => setReloadToken((t) => t + 1), [])

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    function load() {
      fetch(`/api/schedule?${new URLSearchParams({ includeSkipped: String(includeSkipped) })}`)
        .then((res) => {
          if (!res.ok) throw new Error(`API returned ${res.status}`)
          return res.json() as Promise<ScheduleResponse>
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
  }, [includeSkipped, reloadToken])

  const channelOptions = useMemo(() => {
    const byId = new Map<number, ChannelInfo>()
    for (const item of data?.items ?? []) byId.set(item.channel.objectId, item.channel)
    return [...byId.values()].sort((a, b) => a.major - b.major || a.minor - b.minor)
  }, [data])

  const visible = useMemo(
    () =>
      (data?.items ?? []).filter(
        (item) =>
          matchesKind(item, kindFilter) &&
          (channelFilter === ALL_CHANNELS || String(item.channel.objectId) === channelFilter) &&
          (!conflictsOnly || isConflict(item.schedule)),
      ),
    [data, kindFilter, channelFilter, conflictsOnly],
  )

  // By date: a group per day, soonest first (items arrive in time order). By name: a group
  // per show, alphabetical, each in time order.
  const groups = useMemo<Group[]>(() => {
    const byKey = new Map<string, Group>()
    for (const item of visible) {
      const key = sortOrder === 'date' ? new Date(item.datetime).toDateString() : item.title
      let group = byKey.get(key)
      if (!group) {
        group = { key, label: sortOrder === 'date' ? dayLabel(new Date(item.datetime)) : item.title, items: [] }
        byKey.set(key, group)
      }
      group.items.push(item)
    }
    const result = [...byKey.values()]
    return sortOrder === 'name' ? result.sort((a, b) => compareTitles(a.label, b.label)) : result
  }, [visible, sortOrder])

  const scheduledCount = visible.filter((item) => item.schedule?.state !== 'skipped').length
  const skippedCount = visible.length - scheduledCount

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="schedule-kind">Show</Label>
          <select
            id="schedule-kind"
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as KindFilter)}
            className={`${SELECT_CLASS_NAME} min-w-36`}
          >
            {KIND_FILTERS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="schedule-channel">Channel</Label>
          <select
            id="schedule-channel"
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            className={`${SELECT_CLASS_NAME} min-w-48`}
          >
            <option value={ALL_CHANNELS}>All channels</option>
            {channelOptions.map((c) => (
              <option key={c.objectId} value={String(c.objectId)}>
                {channelLabel(c)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="schedule-sort">Sort by</Label>
          <select
            id="schedule-sort"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as SortOrder)}
            className={`${SELECT_CLASS_NAME} min-w-32`}
          >
            <option value="date">Air date</option>
            <option value="name">Name</option>
          </select>
        </div>
        <div className="flex h-9 items-center gap-2">
          <Switch id="schedule-skipped" checked={includeSkipped} onCheckedChange={setIncludeSkipped} />
          <Label htmlFor="schedule-skipped">Show skipped</Label>
        </div>
        <div className="flex h-9 items-center gap-2">
          <Switch id="schedule-conflicts" checked={conflictsOnly} onCheckedChange={setConflictsOnly} />
          <Label htmlFor="schedule-conflicts">Conflicts only</Label>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Couldn't reach the API</AlertTitle>
          <AlertDescription>/api/schedule returned an error: {error}</AlertDescription>
        </Alert>
      )}

      {data && !data.updatedAt && (
        <Alert>
          <AlertTitle>The guide is still loading</AlertTitle>
          <AlertDescription>The server hasn't finished reading the guide from the Tablo yet.</AlertDescription>
        </Alert>
      )}

      {data && data.conflictCount > 0 && (
        <Alert className="border-amber-500/50 bg-amber-500/10">
          <TriangleAlert className="text-amber-600" />
          <AlertTitle>
            {data.conflictCount} recording{data.conflictCount === 1 ? '' : 's'} in conflict
          </AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>Not enough tuners are free at those times, so they won't record unless something else is cancelled.</span>
            {!conflictsOnly && (
              <Button size="sm" variant="outline" onClick={() => setConflictsOnly(true)}>
                Show conflicts
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {data?.updatedAt && (
        <p className="text-muted-foreground text-sm">
          {scheduledCount} airing{scheduledCount === 1 ? '' : 's'} set to record
          {includeSkipped && ` · ${skippedCount} skipped`}
        </p>
      )}

      {data?.updatedAt && visible.length === 0 && (
        <p className="text-muted-foreground text-sm">Nothing matches these filters.</p>
      )}

      {groups.map((group) => (
        <section key={group.key} className="space-y-2">
          <h2 className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">{group.label}</h2>
          <Card className="gap-0 divide-y overflow-hidden py-0">
            {group.items.map((item) => (
              <ScheduleRow
                key={item.key}
                item={item}
                showTitle={sortOrder === 'date'}
                showDay={sortOrder === 'name'}
                onChanged={reload}
              />
            ))}
          </Card>
        </section>
      ))}
    </div>
  )
}
