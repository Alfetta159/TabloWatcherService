import { useEffect, useRef, useState } from 'react'
import { CircleDot, LoaderCircle, RotateCcw } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Genres, Section } from '@/components/DetailDialogs'
import { RecordButton, RecordingPill, ScheduleStatus } from '@/components/Recording'
import { formatDuration, formatRating } from '@/lib/format'
import { formatTimeRange, isScheduled, setScheduled, type RecordingState, type ScheduledAiring } from '@/lib/recording'

// A show's recording rule and options (TvShowsController.RecordingOptions). Offsets are seconds.
interface RecordingOptions {
  rule: 'all' | 'new' | 'none'
  keepRule: 'none' | 'count' | 'all'
  keepCount: number | null
  channelPath: string | null
  startOffset: number
  endOffset: number
}

// One upcoming airing of an episode.
interface Episode extends ScheduledAiring {
  episodeNumber: number | null
  title: string | null
  description: string | null
  origAirDate: string | null
}

// GET /api/tv-shows/{id}.
interface SeriesDetail {
  path: string
  title: string
  description: string | null
  genres: string[]
  seriesRating: string | null
  origAirDate: string | null
  // Seconds.
  episodeRuntime: number | null
  cast: string[]
  thumbnailImageId: number | null
  coverImageId: number | null
  backgroundImageId: number | null
  recordingState: RecordingState | null
  channels: { path: string; callSign: string; major: number; minor: number }[]
  // Null if the Tablo couldn't be reached.
  recording: RecordingOptions | null
  // Null number: episodes without a season.
  seasons: { number: number | null; episodes: Episode[] }[]
}

const RULES: { value: RecordingOptions['rule']; label: string }[] = [
  { value: 'none', label: "Don't record" },
  { value: 'new', label: 'New episodes' },
  { value: 'all', label: 'All episodes' },
]

// "none" is the device's own default (Auto); "count:N" keeps the last N.
const KEEP_OPTIONS = [
  { value: 'none', label: 'Auto' },
  ...[1, 3, 5, 10, 20].map((n) => ({ value: `count:${n}`, label: `Last ${n}` })),
  { value: 'all', label: 'All' },
]

const START_OPTIONS = [
  { value: 0, label: 'On time' },
  { value: -120, label: '2 minutes early' },
  { value: -300, label: '5 minutes early' },
  { value: -600, label: '10 minutes early' },
]

const END_OPTIONS = [
  { value: 0, label: 'On time' },
  { value: 300, label: '5 minutes late' },
  { value: 900, label: '15 minutes late' },
  { value: 3600, label: '1 hour late' },
  { value: 7200, label: '2 hours late' },
  { value: 10800, label: '3 hours late' },
]

const SELECT_CLASS_NAME =
  'border-input bg-background focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] disabled:opacity-50'

const keepValue = (o: RecordingOptions) => (o.keepRule === 'count' ? `count:${o.keepCount}` : o.keepRule)

function seasonLabel(number: number | null): string {
  return number === null ? 'Other' : `Season ${number}`
}

function tabloError(res: Response): Error {
  return new Error(res.status === 502 ? "The Tablo didn't respond - try again" : `API returned ${res.status}`)
}

export function SeriesDetailDialog({ path, onChanged }: { path: string; onChanged: () => void }) {
  const [series, setSeries] = useState<SeriesDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Bumped after an episode's recording changes, to re-read every episode's status.
  const [reloadToken, setReloadToken] = useState(0)
  const [season, setSeason] = useState<string | null>(null)
  // Focus the dialog itself on open rather than its first button.
  const popupRef = useRef<HTMLDivElement>(null)
  const seriesId = path.split('/').pop()

  useEffect(() => {
    let cancelled = false
    fetch(`/api/tv-shows/${seriesId}`)
      .then((res) => {
        if (!res.ok) throw new Error(`API returned ${res.status}`)
        return res.json() as Promise<SeriesDetail>
      })
      .then((d) => {
        if (cancelled) return
        setSeries(d)
        setError(null)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [seriesId, reloadToken])

  function changed() {
    setReloadToken((t) => t + 1)
    onChanged()
  }

  if (!series) {
    return (
      <DialogContent className="sm:max-w-md">
        <DialogTitle>{error ? "Couldn't load this show" : 'Loading…'}</DialogTitle>
        {error ? (
          <DialogDescription>/api/tv-shows returned an error: {error}</DialogDescription>
        ) : (
          <LoaderCircle className="text-muted-foreground size-6 animate-spin" />
        )}
      </DialogContent>
    )
  }

  const meta = [
    series.origAirDate && new Date(`${series.origAirDate}T00:00`).getFullYear(),
    formatRating(series.seriesRating),
    series.episodeRuntime && formatDuration(series.episodeRuntime),
  ]
    .filter(Boolean)
    .join(' · ')
  const backdrop = series.backgroundImageId ?? series.coverImageId
  const selectedSeason = season ?? seasonLabel(series.seasons[0]?.number ?? null)

  return (
    <DialogContent
      ref={popupRef}
      initialFocus={popupRef}
      className="grid h-[90vh] grid-cols-3 gap-0 overflow-hidden p-0 outline-none sm:max-w-6xl"
    >
      {/* Left third: the show and its recording options. */}
      <div className="col-span-1 min-h-0 overflow-y-auto border-r">
        <div
          className="bg-muted relative h-40 bg-cover bg-center"
          style={backdrop ? { backgroundImage: `url(/api/images/${backdrop})` } : undefined}
        >
          <div className="from-popover via-popover/60 absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t to-transparent" />
        </div>
        <div className="relative -mt-10 space-y-5 px-5 pb-5">
          <div className="space-y-1.5">
            {series.recordingState && <RecordingPill state={series.recordingState} />}
            <DialogTitle className="text-2xl leading-tight font-semibold">{series.title}</DialogTitle>
            {meta && <DialogDescription className="text-muted-foreground text-sm">{meta}</DialogDescription>}
          </div>
          <Genres genres={series.genres} />
          {series.description && <p className="leading-relaxed">{series.description}</p>}
          {series.cast.length > 0 && (
            <Section title="Cast">
              <p>{series.cast.slice(0, 8).join(', ')}</p>
            </Section>
          )}
          <RecordingOptionsPanel
            series={series}
            onSaved={(d) => {
              setSeries(d)
              onChanged()
            }}
          />
        </div>
      </div>

      {/* Right two-thirds: upcoming episodes by season. */}
      <div className="col-span-2 flex min-h-0 flex-col p-5 pr-14">
        {series.seasons.length === 0 ? (
          <p className="text-muted-foreground text-sm">No upcoming episodes.</p>
        ) : (
          <Tabs value={selectedSeason} onValueChange={(v) => setSeason(v as string)} className="min-h-0 flex-1">
            <TabsList className="h-auto max-w-full shrink-0 flex-wrap justify-start">
              {series.seasons.map((s) => (
                <TabsTrigger key={seasonLabel(s.number)} value={seasonLabel(s.number)}>
                  {seasonLabel(s.number)}
                </TabsTrigger>
              ))}
            </TabsList>
            {series.seasons.map((s) => (
              <TabsContent key={seasonLabel(s.number)} value={seasonLabel(s.number)} className="mt-3 min-h-0 flex-1 overflow-y-auto">
                <SeasonEpisodes episodes={s.episodes} onChanged={changed} />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </div>
    </DialogContent>
  )
}

function RecordingOptionsPanel({ series, onSaved }: { series: SeriesDetail; onSaved: (updated: SeriesDetail) => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const options = series.recording

  if (!options) {
    return (
      <Section title="Recording">
        <p className="text-muted-foreground">Couldn't read this show's recording options from the Tablo.</p>
      </Section>
    )
  }

  function save(changes: Partial<RecordingOptions>) {
    setSaving(true)
    setError(null)
    fetch(`/api/tv-shows/${series.path.split('/').pop()}/recording`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...options, ...changes }),
    })
      .then((res) => {
        if (!res.ok) throw tabloError(res)
        return res.json() as Promise<SeriesDetail>
      })
      .then(onSaved)
      .catch((err) => setError(err.message))
      .finally(() => setSaving(false))
  }

  const isDefault =
    options.keepRule === 'none' && options.channelPath === null && options.startOffset === 0 && options.endOffset === 0
  // A channel limit set elsewhere that the show isn't currently airing on.
  const otherChannel = options.channelPath !== null && !series.channels.some((c) => c.path === options.channelPath)

  return (
    <Section title="Recording">
      <div className="space-y-4">
        <div className="bg-muted grid grid-cols-3 gap-1 rounded-lg p-1" role="group" aria-label="Record">
          {RULES.map((r) => (
            <button
              key={r.value}
              type="button"
              aria-pressed={options.rule === r.value}
              disabled={saving}
              onClick={() => options.rule !== r.value && save({ rule: r.value })}
              className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${options.rule === r.value ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <OptionSelect
            id="series-keep"
            label="Keep"
            value={keepValue(options)}
            disabled={saving}
            onChange={(v) => {
              const [rule, count] = v.split(':')
              save({ keepRule: rule as RecordingOptions['keepRule'], keepCount: count ? Number(count) : null })
            }}
            options={KEEP_OPTIONS}
          />
          <OptionSelect
            id="series-channel"
            label="Channel"
            value={options.channelPath ?? ''}
            disabled={saving}
            onChange={(v) => save({ channelPath: v || null })}
            options={[
              { value: '', label: 'All' },
              ...series.channels.map((c) => ({ value: c.path, label: `${c.major}.${c.minor} ${c.callSign}` })),
              ...(otherChannel ? [{ value: options.channelPath!, label: 'Another channel' }] : []),
            ]}
          />
          <OptionSelect
            id="series-start"
            label="Start"
            value={String(options.startOffset)}
            disabled={saving}
            onChange={(v) => save({ startOffset: Number(v) })}
            options={START_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
          />
          <OptionSelect
            id="series-end"
            label="Stop"
            value={String(options.endOffset)}
            disabled={saving}
            onChange={(v) => save({ endOffset: Number(v) })}
            options={END_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={saving || isDefault}
            onClick={() => save({ keepRule: 'none', keepCount: null, channelPath: null, startOffset: 0, endOffset: 0 })}
          >
            <RotateCcw className="size-4" />
            Reset options
          </Button>
          {saving && <LoaderCircle className="text-muted-foreground size-4 animate-spin" aria-label="Saving" />}
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
    </Section>
  )
}

function OptionSelect({
  id,
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  id: string
  label: string
  value: string
  options: { value: string; label: string }[]
  disabled: boolean
  onChange: (value: string) => void
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={SELECT_CLASS_NAME}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function SeasonEpisodes({ episodes, onChanged }: { episodes: Episode[]; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Episodes nothing is set to record yet. A skipped one is already covered - by the show's
  // rule, or another airing of the same episode - so it's left to the Tablo.
  const unscheduled = episodes.filter((e) => !isScheduled(e.schedule) && e.schedule?.state !== 'skipped')

  async function recordAll() {
    setBusy(true)
    setError(null)
    // One at a time: the Tablo drops requests made in parallel (see TabloBatch).
    let failed = 0
    for (const episode of unscheduled) {
      await setScheduled(episode.path, true).catch(() => failed++)
    }
    setBusy(false)
    if (failed > 0) setError(`${failed} of ${unscheduled.length} couldn't be set to record - try again`)
    onChanged()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {episodes.length} upcoming airing{episodes.length === 1 ? '' : 's'}
        </p>
        <Button size="sm" onClick={recordAll} disabled={busy || unscheduled.length === 0}>
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : <CircleDot className="size-4" />}
          {unscheduled.length === 0 ? 'Nothing to record' : `Record all (${unscheduled.length})`}
        </Button>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="divide-y rounded-lg border">
        {episodes.map((e) => (
          <EpisodeRow key={e.path} episode={e} onChanged={onChanged} />
        ))}
      </div>
    </div>
  )
}

function EpisodeRow({ episode: e, onChanged }: { episode: Episode; onChanged: () => void }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <div className="min-w-0 space-y-1">
        <p className="font-medium">
          {e.episodeNumber !== null && <span className="text-muted-foreground mr-1.5 tabular-nums">E{e.episodeNumber}</span>}
          {e.title ?? 'Untitled episode'}
        </p>
        {e.description && <p className="text-muted-foreground line-clamp-2">{e.description}</p>}
        <div className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
          <span>{formatTimeRange(e)}</span>
          <span>
            · {e.channel.major}.{e.channel.minor} {e.channel.callSign}
          </span>
          {e.live && <Badge variant="outline">Live</Badge>}
          {e.isNew && <Badge variant="outline">New</Badge>}
          <ScheduleStatus schedule={e.schedule} />
        </div>
      </div>
      <div className="shrink-0">
        <RecordButton path={e.path} schedule={e.schedule} onChanged={onChanged} />
      </div>
    </div>
  )
}
