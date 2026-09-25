import { useEffect, useMemo, useState, type ComponentType } from 'react'
import { ChevronDown } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'

// A channel as the TV shows/movies/sports endpoints return it (UpcomingResponses on the server).
export interface ChannelInfo {
  objectId: number
  callSign: string
  network: string
  major: number
  minor: number
}

// A channel a title is coming up on, with its soonest airing there.
export interface UpcomingChannel extends ChannelInfo {
  nextAiring: string
  airingCount: number
}

// The image ids an upcoming title carries, for GET /api/images/{id}.
export interface Artwork {
  thumbnailImageId: number | null
  coverImageId: number | null
  backgroundImageId: number | null
}

export interface PosterCardData {
  key: string
  title: string
  // A short line under the title, e.g. a movie's year and rating or a game's sport.
  subtitle?: string | null
  // Shown on hover.
  description: string | null
  genres: string[]
  imageId: number | null
  // Sorted by soonest airing.
  channels: UpcomingChannel[]
  // Highlighted on the poster, e.g. "Live".
  flag?: string | null
}

interface UpcomingResponse<T> {
  updatedAt: string | null
  items: T[]
}

interface TagsResponse {
  allTags: string[]
  blockedTags: string[]
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

function PosterCard({
  card,
  channels,
  placeholderIcon: PlaceholderIcon,
  showAiringCount,
}: {
  card: PosterCardData
  channels: UpcomingChannel[]
  placeholderIcon: ComponentType<{ className?: string }>
  showAiringCount: boolean
}) {
  const [imageFailed, setImageFailed] = useState(false)
  const next = channels[0]
  const airingCount = channels.reduce((sum, c) => sum + c.airingCount, 0)

  return (
    <Card className="gap-0 overflow-hidden py-0" title={card.description ?? undefined}>
      <div className="bg-muted relative flex aspect-[2/3] items-center justify-center">
        {card.imageId != null && !imageFailed ? (
          <img
            src={`/api/images/${card.imageId}`}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="text-muted-foreground flex flex-col items-center gap-2 p-4 text-center text-sm">
            <PlaceholderIcon className="size-8" />
            {card.title}
          </div>
        )}
        {card.flag && <Badge className="absolute top-2 left-2 shadow">{card.flag}</Badge>}
      </div>
      <div className="space-y-1 p-3 text-sm">
        <p className="line-clamp-2 font-medium leading-snug">{card.title}</p>
        {card.subtitle && <p className="text-muted-foreground line-clamp-1 text-xs">{card.subtitle}</p>}
        <p className="text-muted-foreground">
          {formatNextAiring(next.nextAiring)}
          <br />
          {channelNumber(next)} {next.callSign}
          {channels.length > 1 && ` +${channels.length - 1} more`}
        </p>
        {showAiringCount && (
          <p className="text-muted-foreground text-xs">
            {airingCount} upcoming airing{airingCount === 1 ? '' : 's'}
          </p>
        )}
        {card.genres.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {card.genres.slice(0, 2).map((g) => (
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

interface PosterGridPageProps<T> {
  // An upcoming-list endpoint returning { updatedAt, items }, already in display order.
  endpoint: string
  // e.g. ['show', 'shows'], for "12 shows coming up".
  noun: [singular: string, plural: string]
  toCard: (item: T) => PosterCardData
  placeholderIcon: ComponentType<{ className?: string }>
  // Off where every item is a single airing (sports events), so the count is always 1.
  showAiringCount?: boolean
}

// A poster card per upcoming title (TV show, movie, sports event), with a channel filter.
export function PosterGridPage<T>({
  endpoint,
  noun,
  toCard,
  placeholderIcon,
  showAiringCount = true,
}: PosterGridPageProps<T>) {
  const [data, setData] = useState<UpcomingResponse<T> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [channelFilter, setChannelFilter] = useState(ALL_CHANNELS)
  const [allTags, setAllTags] = useState<string[]>([])
  const [blockedTags, setBlockedTags] = useState<Set<string>>(new Set())
  const [showTags, setShowTags] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    function load() {
      fetch(endpoint)
        .then((res) => {
          if (!res.ok) throw new Error(`API returned ${res.status}`)
          return res.json() as Promise<UpcomingResponse<T>>
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

  // Tags are global (shared across TV Shows/Movies/Sports and across users, not per-page),
  // so this only needs to load once, not poll on the same cadence as the item list.
  useEffect(() => {
    let cancelled = false

    fetch('/api/tags')
      .then((res) => {
        if (!res.ok) throw new Error(`API returned ${res.status}`)
        return res.json() as Promise<TagsResponse>
      })
      .then((d) => {
        if (cancelled) return
        setAllTags(d.allTags)
        setBlockedTags(new Set(d.blockedTags))
      })
      .catch(() => {
        // Non-fatal: the tag filters just come up empty: neither used to block content nor to
        // hide anything already showing.
      })

    return () => {
      cancelled = true
    }
  }, [])

  function toggleShowTag(tag: string) {
    setShowTags((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) {
        next.delete(tag)
      } else {
        next.add(tag)
      }
      return next
    })
  }

  // The block list is a shared, server-persisted setting (not per-browser), so every toggle
  // writes straight through - there's no separate "save" step.
  function toggleBlockedTag(tag: string, blocked: boolean) {
    setBlockedTags((prev) => {
      const next = new Set(prev)
      if (blocked) {
        next.add(tag)
      } else {
        next.delete(tag)
      }

      fetch('/api/tags/blocked', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([...next]),
      }).catch(() => {
        // Best-effort; the next /api/tags load will reconcile with whatever the server has.
      })

      return next
    })

    // A newly-blocked tag can no longer be a "show" filter either.
    if (blocked) {
      setShowTags((prev) => {
        if (!prev.has(tag)) return prev
        const next = new Set(prev)
        next.delete(tag)
        return next
      })
    }
  }

  const cards = useMemo(() => (data?.items ?? []).map(toCard), [data, toCard])

  // Tags to offer as a "show" filter - everything blocked is already gone from the item
  // list itself, but stays listed (and checked) under "Always block" so it can be unblocked.
  const availableTags = useMemo(() => allTags.filter((t) => !blockedTags.has(t)), [allTags, blockedTags])

  // Every channel any card is coming up on, for the filter.
  const channelOptions = useMemo(() => {
    const byId = new Map<number, ChannelInfo>()
    for (const card of cards) for (const c of card.channels) byId.set(c.objectId, c)
    return [...byId.values()].sort((a, b) => a.major - b.major || a.minor - b.minor)
  }, [cards])

  // Each card paired with just the channels that pass the filter (so it shows the next
  // airing on the chosen channel), dropping cards with none.
  const visible = useMemo(
    () =>
      cards
        .map((card) => ({
          card,
          channels:
            channelFilter === ALL_CHANNELS
              ? card.channels
              : card.channels.filter((c) => String(c.objectId) === channelFilter),
        }))
        .filter(({ channels }) => channels.length > 0)
        .filter(({ card }) => showTags.size === 0 || card.genres.some((g) => showTags.has(g))),
    [cards, channelFilter, showTags],
  )

  const filterId = `${endpoint}-channel`

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label htmlFor={filterId}>Channel</Label>
            <select
              id={filterId}
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

          <div className="space-y-1.5">
            <Label>Show tags</Label>
            <DropdownMenu>
              <DropdownMenuTrigger className={buttonVariants({ variant: 'outline', className: 'min-w-40 justify-between' })}>
                {showTags.size > 0 ? `${showTags.size} selected` : 'All tags'}
                <ChevronDown className="size-4 opacity-50" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="max-h-72 overflow-y-auto">
                {availableTags.length === 0 ? (
                  <DropdownMenuLabel>No tags yet</DropdownMenuLabel>
                ) : (
                  availableTags.map((tag) => (
                    <DropdownMenuCheckboxItem key={tag} checked={showTags.has(tag)} onCheckedChange={() => toggleShowTag(tag)}>
                      {tag}
                    </DropdownMenuCheckboxItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="space-y-1.5">
            <Label>Always block</Label>
            <DropdownMenu>
              <DropdownMenuTrigger className={buttonVariants({ variant: 'outline', className: 'min-w-40 justify-between' })}>
                {blockedTags.size > 0 ? `${blockedTags.size} blocked` : 'None blocked'}
                <ChevronDown className="size-4 opacity-50" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="max-h-72 overflow-y-auto">
                {allTags.length === 0 ? (
                  <DropdownMenuLabel>No tags yet</DropdownMenuLabel>
                ) : (
                  allTags.map((tag) => (
                    <DropdownMenuCheckboxItem
                      key={tag}
                      checked={blockedTags.has(tag)}
                      onCheckedChange={(checked) => toggleBlockedTag(tag, checked)}
                    >
                      {tag}
                    </DropdownMenuCheckboxItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {data?.updatedAt && (
          <p className="text-muted-foreground text-sm">
            {visible.length} {visible.length === 1 ? noun[0] : noun[1]} coming up
          </p>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Couldn't reach the API</AlertTitle>
          <AlertDescription>
            {endpoint} returned an error: {error}
          </AlertDescription>
        </Alert>
      )}

      {data && !data.updatedAt && (
        <Alert>
          <AlertTitle>The guide is still loading</AlertTitle>
          <AlertDescription>The server hasn't finished reading the guide from the Tablo yet.</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-4">
        {visible.map(({ card, channels }) => (
          <PosterCard
            key={card.key}
            card={card}
            channels={channels}
            placeholderIcon={placeholderIcon}
            showAiringCount={showAiringCount}
          />
        ))}
      </div>
    </div>
  )
}
