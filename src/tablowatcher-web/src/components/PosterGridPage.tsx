import { useEffect, useMemo, useState, type ComponentType, type KeyboardEvent, type ReactNode } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { RecordingPill } from '@/components/Recording'
import { TagFilterControls } from '@/components/TagFilterControls'
import { useTagFilters } from '@/hooks/useTagFilters'
import { compareTitles } from '@/lib/format'
import type { RecordingState } from '@/lib/recording'

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
  // Pill on the poster: an airing is set to record, or is in conflict.
  recordingState?: RecordingState | null
  // This card's value for each of the page's facets (see Facet), keyed by Facet.key; null
  // or missing means it has none (e.g. an unrated movie).
  facets?: Record<string, string | null>
}

// An extra dropdown filter over one property of the cards, like a movie's rating.
// Its options are whatever values the cards actually have, plus "Not rated" (or noneLabel)
// when some card has none.
export interface Facet {
  key: string
  label: string
  // The dropdown's "no filter" option, e.g. "All ratings".
  placeholder: string
  formatValue?: (value: string) => string
  // Orders the options; defaults to alphabetical.
  compare?: (a: string, b: string) => number
  noneLabel?: string
}

// Stands in for "no value" (e.g. unrated) as a facet option; no real rating looks like it.
const NO_VALUE = '__none__'

// Shared by the Channel and facet dropdowns.
const SELECT_CLASS_NAME =
  'border-input bg-background focus-visible:ring-ring/50 h-9 rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]'

interface UpcomingResponse<T> {
  updatedAt: string | null
  items: T[]
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
  onOpen,
}: {
  card: PosterCardData
  channels: UpcomingChannel[]
  placeholderIcon: ComponentType<{ className?: string }>
  showAiringCount: boolean
  // Makes the card clickable (and keyboard-activatable), opening its detail dialog.
  onOpen?: () => void
}) {
  const [imageFailed, setImageFailed] = useState(false)
  const next = channels[0]
  const airingCount = channels.reduce((sum, c) => sum + c.airingCount, 0)

  return (
    <Card
      className={`gap-0 overflow-hidden py-0 ${onOpen ? 'hover:ring-primary/50 focus-visible:ring-primary cursor-pointer transition-shadow outline-none hover:ring-2 focus-visible:ring-2' : ''}`}
      title={card.description ?? undefined}
      {...(onOpen && {
        role: 'button',
        tabIndex: 0,
        onClick: onOpen,
        onKeyDown: (e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onOpen()
          }
        },
      })}
    >
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
        {card.recordingState && <RecordingPill state={card.recordingState} className="absolute top-2 right-2" />}
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
  // An upcoming-list endpoint returning { updatedAt, items } (the page sorts them itself).
  endpoint: string
  // e.g. ['show', 'shows'], for "12 shows coming up".
  noun: [singular: string, plural: string]
  toCard: (item: T) => PosterCardData
  placeholderIcon: ComponentType<{ className?: string }>
  // Off where every item is a single airing (sports events), so the count is always 1.
  showAiringCount?: boolean
  facets?: Facet[]
  // The initial order; the Sort dropdown can change it.
  defaultSort?: SortOrder
  // When given, clicking a card opens a dialog with this content (a DialogContent) for its
  // item. `onChanged` re-reads the list - e.g. after a recording is scheduled, so the card's
  // pill is right once the dialog closes.
  renderDetail?: (item: T, onChanged: () => void) => ReactNode
}

export type SortOrder = 'title' | 'airDate'

const SORT_LABELS: Record<SortOrder, string> = { title: 'Title', airDate: 'Air date' }

function compareCardTitles(a: PosterCardData, b: PosterCardData): number {
  return compareTitles(a.title, b.title)
}

const NO_FACETS: Facet[] = []

function facetValue(card: PosterCardData, facet: Facet): string {
  return card.facets?.[facet.key] ?? NO_VALUE
}

// A poster card per upcoming title (TV show, movie, sports event), with a channel filter.
export function PosterGridPage<T>({
  endpoint,
  noun,
  toCard,
  placeholderIcon,
  showAiringCount = true,
  facets = NO_FACETS,
  defaultSort = 'title',
  renderDetail,
}: PosterGridPageProps<T>) {
  // The card whose detail dialog is open, by PosterCardData.key.
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  // Bumped to re-read the list right away rather than at the next poll.
  const [reloadToken, setReloadToken] = useState(0)
  const [sortOrder, setSortOrder] = useState<SortOrder>(defaultSort)
  const [data, setData] = useState<UpcomingResponse<T> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [channelFilter, setChannelFilter] = useState(ALL_CHANNELS)
  // Facet key -> the value chosen in its dropdown; absent means no filtering.
  const [facetSelections, setFacetSelections] = useState<Record<string, string>>({})
  // `endpoint` is already e.g. "/api/tv-shows", so it doubles as the "kind" the tags
  // endpoint expects.
  const tagFilters = useTagFilters(endpoint.replace(/^\/api\//, ''))

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
  }, [endpoint, reloadToken])

  const cards = useMemo(() => (data?.items ?? []).map(toCard), [data, toCard])

  // Looked up by key, so an open dialog shows the item's latest data after a reload.
  const selectedItem = useMemo(() => {
    if (selectedKey === null) return null
    const index = cards.findIndex((card) => card.key === selectedKey)
    return index === -1 ? null : (data?.items[index] ?? null)
  }, [cards, data, selectedKey])

  // Every channel any card is coming up on, for the filter.
  const channelOptions = useMemo(() => {
    const byId = new Map<number, ChannelInfo>()
    for (const card of cards) for (const c of card.channels) byId.set(c.objectId, c)
    return [...byId.values()].sort((a, b) => a.major - b.major || a.minor - b.minor)
  }, [cards])

  // Each facet's options: the values the cards actually have, sorted, with "no value" last.
  const facetOptions = useMemo(
    () =>
      facets.map((facet) => {
        const values = new Set(cards.map((card) => facetValue(card, facet)))
        const hasNone = values.delete(NO_VALUE)
        const options = [...values]
          .sort(facet.compare ?? ((a, b) => a.localeCompare(b)))
          .map((value) => ({ value, label: facet.formatValue?.(value) ?? value }))
        if (hasNone) options.push({ value: NO_VALUE, label: facet.noneLabel ?? 'Not rated' })
        return options
      }),
    [cards, facets],
  )

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
        .filter(({ card }) => tagFilters.includeTags.size === 0 || card.genres.some((g) => tagFilters.includeTags.has(g)))
        .filter(({ card }) =>
          facets.every((facet) => {
            const selected = facetSelections[facet.key]
            return !selected || selected === facetValue(card, facet)
          }),
        )
        // By air date means the soonest airing on the channels still showing (so it follows
        // the Channel filter), then by title for airings at the same time.
        .sort((a, b) =>
          sortOrder === 'airDate'
            ? Date.parse(a.channels[0].nextAiring) - Date.parse(b.channels[0].nextAiring) || compareCardTitles(a.card, b.card)
            : compareCardTitles(a.card, b.card),
        ),
    [cards, channelFilter, tagFilters.includeTags, facets, facetSelections, sortOrder],
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
              className={`${SELECT_CLASS_NAME} min-w-56`}
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
            <Label htmlFor={`${endpoint}-sort`}>Sort by</Label>
            <select
              id={`${endpoint}-sort`}
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as SortOrder)}
              className={`${SELECT_CLASS_NAME} min-w-32`}
            >
              {Object.entries(SORT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {facets.map((facet, i) => (
            <div key={facet.key} className="space-y-1.5">
              <Label htmlFor={`${endpoint}-${facet.key}`}>{facet.label}</Label>
              <select
                id={`${endpoint}-${facet.key}`}
                value={facetSelections[facet.key] ?? ''}
                onChange={(e) => setFacetSelections((prev) => ({ ...prev, [facet.key]: e.target.value }))}
                className={`${SELECT_CLASS_NAME} min-w-36`}
              >
                <option value="">{facet.placeholder}</option>
                {facetOptions[i].map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          ))}

          <TagFilterControls {...tagFilters} />
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
            onOpen={renderDetail && (() => setSelectedKey(card.key))}
          />
        ))}
      </div>

      {renderDetail && (
        <Dialog open={selectedItem !== null} onOpenChange={(open) => !open && setSelectedKey(null)}>
          {selectedItem !== null && renderDetail(selectedItem, () => setReloadToken((t) => t + 1))}
        </Dialog>
      )}
    </div>
  )
}
