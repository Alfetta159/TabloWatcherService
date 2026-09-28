import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react'
import { HardDrive as HardDriveIcon, TriangleAlert } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ChannelsTab } from '@/components/ChannelsTab'
import { DeleteRecordingsDialog, type StoredRecording } from '@/components/DeleteRecordingsDialog'
import { formatSize } from '@/lib/format'

// GET /server/harddrives on the device, via /api/storage/hard-drives. Sizes are bytes.
interface HardDrive {
  connected: boolean
  formatState: string
  name: string
  busyState: string
  kind: string
  size: number
  usage: number
  free: number
  limit: number
}

type Kind = 'tv' | 'movie' | 'sport' | 'program'

// /api/storage/recordings: space used per series/program/movie title, or per sport tag.
interface UsageItem {
  kind: Kind
  label: string
  size: number
  recordingCount: number
  // Each recording - movies and sports only.
  recordings: StoredRecording[] | null
}

interface UsageResponse {
  updatedAt: string | null
  items: UsageItem[]
}

// What the ring's inner ring shows. Programs (e.g. local newscasts) count as TV, as they
// do on the Recordings page.
type Category = 'tv' | 'movie' | 'sport'

const CATEGORIES: { key: Category; label: string; color: string }[] = [
  { key: 'tv', label: 'TV Shows', color: 'var(--series-1)' },
  { key: 'movie', label: 'Movies', color: 'var(--series-2)' },
  { key: 'sport', label: 'Sports', color: 'var(--series-3)' },
]

const categoryOf = (kind: Kind): Category => (kind === 'program' ? 'tv' : kind)

// The recordings cache refreshes every 15 minutes; until its first load lands, check back often.
const POLL_INTERVAL_MS = 60_000
const LOADING_POLL_INTERVAL_MS = 5_000

function usePolled<T>(endpoint: string, isLoaded: (data: T) => boolean) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Bumped to re-read right away rather than at the next poll.
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    function load() {
      fetch(endpoint)
        .then((res) => {
          if (!res.ok) throw new Error(`API returned ${res.status}`)
          return res.json() as Promise<T>
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
          if (!cancelled) timer = setTimeout(load, d && isLoaded(d) ? POLL_INTERVAL_MS : LOADING_POLL_INTERVAL_MS)
        })
    }

    load()

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // isLoaded is expected to be a stable, module-level function.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, reloadToken])

  const reload = useCallback(() => setReloadToken((t) => t + 1), [])
  return { data, error, reload }
}

const drivesLoaded = () => true
const usageLoaded = (d: UsageResponse) => d.updatedAt !== null

export function SettingsPage() {
  return (
    <Tabs defaultValue="channels" className="h-full">
      <TabsList>
        <TabsTrigger value="channels">Channels</TabsTrigger>
        <TabsTrigger value="storage">Storage</TabsTrigger>
      </TabsList>
      <TabsContent value="channels" className="mt-4 min-h-0 flex-1">
        <ChannelsTab />
      </TabsContent>
      <TabsContent value="storage" className="mt-4 min-h-0 flex-1">
        <StorageTab />
      </TabsContent>
    </Tabs>
  )
}

function StorageTab() {
  const drives = usePolled<HardDrive[]>('/api/storage/hard-drives', drivesLoaded)
  const usage = usePolled<UsageResponse>('/api/storage/recordings', usageLoaded)
  const recordingsTotal = usage.data?.items.reduce((sum, item) => sum + item.size, 0) ?? null

  return (
    <div className="grid grid-cols-5 gap-6">
      <div className="col-span-1 min-w-0 space-y-4">
        {drives.error && (
          <Alert variant="destructive">
            <AlertTitle>Couldn't read the hard drives</AlertTitle>
            <AlertDescription>{drives.error}</AlertDescription>
          </Alert>
        )}
        {!drives.data && !drives.error && <p className="text-muted-foreground text-sm">Loading hard drives…</p>}
        {drives.data?.length === 0 && <p className="text-muted-foreground text-sm">No hard drives connected.</p>}
        {drives.data?.map((drive) => (
          <HardDriveCard
            key={drive.name}
            drive={drive}
            // Only meaningful against the one drive recordings can be on.
            recordingsTotal={drives.data?.length === 1 ? recordingsTotal : null}
          />
        ))}
      </div>

      <Card className="col-span-4 min-w-0">
        <CardHeader>
          <CardTitle>Space used by recordings</CardTitle>
        </CardHeader>
        <CardContent>
          {usage.error && (
            <Alert variant="destructive">
              <AlertTitle>Couldn't read the recordings</AlertTitle>
              <AlertDescription>{usage.error}</AlertDescription>
            </Alert>
          )}
          {usage.data && !usage.data.updatedAt ? (
            <p className="text-muted-foreground text-sm">Recordings are still loading…</p>
          ) : usage.data && usage.data.items.length === 0 ? (
            <p className="text-muted-foreground text-sm">No recordings yet.</p>
          ) : usage.data ? (
            <RecordingUsage items={usage.data.items} onChanged={usage.reload} />
          ) : (
            !usage.error && <p className="text-muted-foreground text-sm">Loading recordings…</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// At or above this share of a drive's capacity, it's flagged as nearly full.
const NEARLY_FULL_RATIO = 0.95

function HardDriveCard({ drive, recordingsTotal }: { drive: HardDrive; recordingsTotal: number | null }) {
  // The device may reserve part of a drive; the limit is what it will actually fill.
  const capacity = drive.limit || drive.size
  const usedRatio = capacity > 0 ? Math.min(1, drive.usage / capacity) : 0
  const nearlyFull = usedRatio >= NEARLY_FULL_RATIO

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-start gap-2 text-base leading-snug">
          <HardDriveIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
          <span className="min-w-0 break-words">{drive.name}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary" className="capitalize">
            {drive.kind}
          </Badge>
          <Badge variant={drive.connected ? 'secondary' : 'destructive'}>
            {drive.connected ? drive.busyState : 'Disconnected'}
          </Badge>
          {drive.formatState !== 'authorized' && <Badge variant="outline">{drive.formatState}</Badge>}
          {nearlyFull && (
            <Badge className="gap-1 bg-amber-100 text-amber-900" title={`${Math.round(usedRatio * 100)}% of this drive is used`}>
              <TriangleAlert className="size-3" />
              Almost full
            </Badge>
          )}
        </div>

        <div className="space-y-1.5">
          <div
            className="bg-muted h-2 overflow-hidden rounded-full"
            role="meter"
            aria-label="Space used"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(usedRatio * 100)}
          >
            <div className="h-full rounded-full" style={{ width: `${usedRatio * 100}%`, background: nearlyFull ? 'var(--color-amber-500)' : 'var(--series-1)' }} />
          </div>
          <p className="text-muted-foreground text-xs">{Math.round(usedRatio * 100)}% used</p>
        </div>

        <dl className="space-y-1.5">
          <Stat label="Capacity" value={formatSize(capacity)} />
          <Stat label="Used" value={formatSize(drive.usage)} />
          <Stat label="Free" value={formatSize(drive.free)} />
          {recordingsTotal !== null && <Stat label="Recordings" value={formatSize(recordingsTotal)} />}
        </dl>
      </CardContent>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  )
}

// One slice of the outer ring: a title or sport tag, or the leftovers too thin to see.
interface Slice {
  key: string
  category: Category
  label: string
  size: number
  recordingCount: number
  // Set for a movie or sport - which can be opened to delete its recordings.
  recordings: StoredRecording[] | null
  // How many titles a leftovers slice stands for.
  folded?: number
}

// Slices thinner than this are folded into one "N more" slice per category.
const MIN_SLICE_ANGLE = (3 * Math.PI) / 180

function RecordingUsage({ items, onChanged }: { items: UsageItem[]; onChanged: () => void }) {
  const [hovered, setHovered] = useState<string | null>(null)
  // The movie or sport whose recordings are open to delete.
  const [opened, setOpened] = useState<Slice | null>(null)
  const [filter, setFilter] = useState<Category | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number } | null>(null)

  const { categories, slices, total, listed } = useMemo(() => {
    const total = items.reduce((sum, item) => sum + item.size, 0)

    // A series and a program sharing a title are one entry, both being TV.
    const merged = new Map<string, Slice>()
    for (const item of items) {
      const category = categoryOf(item.kind)
      const key = `${category}:${item.label}`
      const existing = merged.get(key)
      if (existing) {
        existing.size += item.size
        existing.recordingCount += item.recordingCount
      } else {
        merged.set(key, {
          key,
          category,
          label: item.label,
          size: item.size,
          recordingCount: item.recordingCount,
          recordings: item.recordings,
        })
      }
    }
    const listed = [...merged.values()].sort((a, b) => b.size - a.size)

    const categories = CATEGORIES.map((c) => {
      const members = listed.filter((s) => s.category === c.key)
      return { ...c, size: members.reduce((sum, s) => sum + s.size, 0), members }
    }).filter((c) => c.size > 0)

    const slices: Slice[] = []
    for (const c of categories) {
      const shown = c.members.filter((s) => (s.size / total) * 2 * Math.PI >= MIN_SLICE_ANGLE)
      slices.push(...shown)
      const rest = c.members.slice(shown.length)
      if (rest.length > 0) {
        slices.push({
          key: `${c.key}:*`,
          category: c.key,
          label: `${rest.length} more`,
          size: rest.reduce((sum, s) => sum + s.size, 0),
          recordingCount: rest.reduce((sum, s) => sum + s.recordingCount, 0),
          recordings: null,
          folded: rest.length,
        })
      }
    }

    // Inner ring by category; outer ring by title, lined up under its category.
    const withAngles = <T extends { size: number }>(parts: T[]) => {
      let angle = 0
      return parts.map((p) => {
        const start = angle
        angle += (p.size / total) * 2 * Math.PI
        return { ...p, start, end: angle }
      })
    }

    return { categories: withAngles(categories), slices: withAngles(slices), total, listed }
  }, [items])

  const colorOf = (category: Category) => CATEGORIES.find((c) => c.key === category)!.color
  const hoveredSlice: Slice | undefined =
    slices.find((s) => s.key === hovered) ?? listed.find((s) => s.key === hovered)
  const hoveredCategory = categories.find((c) => `cat:${c.key}` === hovered)
  // A list row folded into a leftovers slice lights that slice up.
  const litSlice =
    hoveredSlice && !slices.some((s) => s.key === hoveredSlice.key) ? `${hoveredSlice.category}:*` : hoveredSlice?.key
  const isDimmed = (key: string, category: Category) =>
    hovered !== null &&
    key !== litSlice &&
    key !== hovered &&
    !(hoveredCategory?.key === category) &&
    !(hoveredSlice && key === `cat:${hoveredSlice.category}`)

  function hover(key: string, e: MouseEvent) {
    const box = (e.currentTarget as Element).closest('[data-ring]')!.getBoundingClientRect()
    setHovered(key)
    setTooltip({ x: e.clientX - box.left, y: e.clientY - box.top })
  }

  function leave() {
    setHovered(null)
    setTooltip(null)
  }

  const shownRows = filter ? listed.filter((s) => s.category === filter) : listed
  const tooltipItem = hoveredSlice ?? (hoveredCategory && { label: hoveredCategory.label, size: hoveredCategory.size })

  return (
    <div className="flex flex-wrap gap-8">
      <div data-ring className="relative shrink-0 self-start">
        <svg viewBox="0 0 320 320" className="size-80" onMouseLeave={leave}>
          {categories.map((c) => (
            <path
              key={c.key}
              fillRule="evenodd"
              d={arc(INNER_R0, INNER_R1, c.start, c.end, categories.length)}
              fill={c.color}
              opacity={isDimmed(`cat:${c.key}`, c.key) ? 0.3 : 1}
              onMouseMove={(e) => hover(`cat:${c.key}`, e)}
              className="cursor-pointer transition-opacity"
              onClick={() => setFilter((f) => (f === c.key ? null : c.key))}
            />
          ))}
          {slices.map((s) => (
            <path
              key={s.key}
              fillRule="evenodd"
              d={arc(OUTER_R0, OUTER_R1, s.start, s.end, slices.length)}
              fill={colorOf(s.category)}
              opacity={isDimmed(s.key, s.category) ? 0.2 : s.folded ? 0.45 : 0.75}
              onMouseMove={(e) => hover(s.key, e)}
              onClick={() => s.recordings && setOpened(s)}
              className={`transition-opacity ${s.recordings ? 'cursor-pointer' : ''}`}
            />
          ))}
          <text x="160" y="154" textAnchor="middle" className="fill-foreground text-2xl font-semibold">
            {formatSize(total)}
          </text>
          <text x="160" y="176" textAnchor="middle" className="fill-muted-foreground text-xs">
            in {listed.reduce((sum, s) => sum + s.recordingCount, 0).toLocaleString()} recordings
          </text>
        </svg>

        {tooltip && tooltipItem && (
          <div
            className="bg-popover text-popover-foreground pointer-events-none absolute z-10 w-max max-w-64 rounded-lg border px-3 py-2 text-xs shadow-md"
            style={{ left: tooltip.x + 14, top: tooltip.y + 14 }}
          >
            <p className="text-sm font-medium">{tooltipItem.label}</p>
            <p className="text-muted-foreground tabular-nums">
              {formatSize(tooltipItem.size)} · {percent(tooltipItem.size, total)}
              {'recordingCount' in tooltipItem && ` · ${tooltipItem.recordingCount} recordings`}
            </p>
          </div>
        )}
      </div>

      <div className="min-w-72 flex-1 space-y-4">
        {/* Legend - click one to list only its titles. */}
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setFilter((f) => (f === c.key ? null : c.key))}
              onMouseEnter={() => setHovered(`cat:${c.key}`)}
              onMouseLeave={() => setHovered(null)}
              aria-pressed={filter === c.key}
              className={`hover:bg-muted flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${filter === c.key ? 'bg-muted border-foreground/30' : ''}`}
            >
              <span className="size-2.5 rounded-full" style={{ background: c.color }} />
              {c.label}
              <span className="text-muted-foreground tabular-nums">
                {formatSize(c.size)} · {percent(c.size, total)}
              </span>
            </button>
          ))}
        </div>

        <div className="max-h-[28rem] overflow-y-auto rounded-lg border">
          <table className="w-full text-sm [&_td]:whitespace-nowrap">
            <thead className="bg-muted/60 text-muted-foreground sticky top-0 text-left text-xs backdrop-blur">
              <tr>
                <th className="px-3 py-2 font-medium">{filter === 'sport' ? 'Sport' : 'Title'}</th>
                <th className="px-3 py-2 text-right font-medium">Recordings</th>
                <th className="px-3 py-2 text-right font-medium">Size</th>
                <th className="px-3 py-2 text-right font-medium">Share</th>
              </tr>
            </thead>
            <tbody>
              {shownRows.map((s) => (
                <tr
                  key={s.key}
                  onMouseEnter={() => setHovered(s.key)}
                  onMouseLeave={() => setHovered(null)}
                  // Movies and sports open to manage their recordings; TV shows don't (yet).
                  {...(s.recordings && {
                    onClick: () => setOpened(s),
                    onKeyDown: (e) => {
                      if (e.key !== 'Enter' && e.key !== ' ') return
                      e.preventDefault()
                      setOpened(s)
                    },
                    tabIndex: 0,
                    'aria-haspopup': 'dialog',
                  })}
                  className={`border-t ${hovered === s.key ? 'bg-muted' : ''} ${s.recordings ? 'focus-visible:bg-muted cursor-pointer outline-none' : ''}`}
                >
                  <td className="w-full max-w-0 px-3 py-1.5">
                    <span className="flex items-center gap-2">
                      <span className="size-2 shrink-0 rounded-full" style={{ background: colorOf(s.category) }} />
                      <span className="truncate">{s.label}</span>
                    </span>
                  </td>
                  <td className="text-muted-foreground px-3 py-1.5 text-right tabular-nums">{s.recordingCount}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatSize(s.size)}</td>
                  <td className="text-muted-foreground px-3 py-1.5 text-right tabular-nums">{percent(s.size, total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={opened !== null} onOpenChange={(open) => !open && setOpened(null)}>
        {opened?.recordings && (
          <DeleteRecordingsDialog
            key={opened.key}
            title={opened.label}
            recordings={opened.recordings}
            onChanged={onChanged}
            onEmpty={() => setOpened(null)}
          />
        )}
      </Dialog>
    </div>
  )
}

const INNER_R0 = 84
const INNER_R1 = 108
const OUTER_R0 = 112
const OUTER_R1 = 152

function percent(part: number, whole: number): string {
  const p = (part / whole) * 100
  return p >= 10 || p === 0 ? `${Math.round(p)}%` : p >= 0.1 ? `${p.toFixed(1)}%` : '<0.1%'
}

// An annulus segment from angle a0 to a1 (radians, clockwise from 12 o'clock), trimmed so
// neighbouring segments leave a 2px gap. A lone segment is a full ring with no gap.
function arc(r0: number, r1: number, a0: number, a1: number, count: number): string {
  if (count === 1) {
    return [
      `M 160 ${160 - r1} A ${r1} ${r1} 0 1 1 159.99 ${160 - r1} Z`,
      `M 160 ${160 - r0} A ${r0} ${r0} 0 1 0 160.01 ${160 - r0} Z`,
    ].join(' ')
  }
  const pad = 1 / r0
  const start = a0 + pad
  const end = Math.max(start, a1 - pad)
  const large = end - start > Math.PI ? 1 : 0
  const pt = (r: number, a: number) => `${160 + r * Math.sin(a)} ${160 - r * Math.cos(a)}`
  return `M ${pt(r1, start)} A ${r1} ${r1} 0 ${large} 1 ${pt(r1, end)} L ${pt(r0, end)} A ${r0} ${r0} 0 ${large} 0 ${pt(r0, start)} Z`
}
