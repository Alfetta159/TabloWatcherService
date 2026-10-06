import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, LoaderCircle, Play, RotateCcw, Shield, ShieldCheck, Trash2, X } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Genres, Section } from '@/components/DetailDialogs'
import { LivePlayer } from '@/components/LivePlayer'
import type { ChannelInfo } from '@/components/PosterGridPage'
import { formatClock, formatDuration, formatRating, formatSize } from '@/lib/format'
import { postRecordingAction, resumePosition, startRecordingStream, updateRecording } from '@/lib/recording'

// One recorded episode (or program airing).
interface ShowRecording {
  path: string
  recordedAt: string
  channel: ChannelInfo
  state: string | null
  // Seconds recorded.
  duration: number
  size: number
  watched: boolean
  // Kept from being deleted, automatically (by the series' keep rule) or from here.
  protected: boolean
  // Seconds in, where playback last left off.
  position: number
  episodeNumber: number | null
  title: string | null
  description: string | null
}

// GET /api/recordings/series/{id} or /api/recordings/programs/{id}.
interface RecordedShow {
  path: string
  kind: 'tv' | 'program'
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
  snapshotImageId: number | null
  // Null number: recordings without a season (all of a program's).
  seasons: { number: number | null; recordings: ShowRecording[] }[]
}

// A bulk delete waiting on the user to confirm it.
interface PendingDelete {
  // What's being deleted, e.g. "watched" or "Season 2".
  label: string
  recordings: ShowRecording[]
  // Protected recordings it would otherwise have included, which are kept.
  keptProtected: number
}

// "Delete the 2 failed recordings (1 MB)...", "Delete all 18 recordings...", "Delete the 3
// recordings in Season 2..."
function confirmPrompt({ label, recordings, keptProtected }: PendingDelete): string {
  const n = recordings.length
  const size = formatSize(recordings.reduce((sum, r) => sum + r.size, 0))
  const what =
    label === 'all'
      ? n === 1 ? 'the 1 recording' : `all ${n} recordings`
      : label === 'watched' || label === 'failed'
        ? `the ${n} ${label} recording${n === 1 ? '' : 's'}`
        : `the ${countLabel(n)} in ${label}`
  const kept = keptProtected > 0 ? ` ${keptProtected === 1 ? '1 protected recording is' : `${keptProtected} protected recordings are`} kept.` : ''
  return `Delete ${what} (${size}) from the Tablo?${kept} This can't be undone.`
}

function seasonLabel(number: number | null): string {
  return number === null ? 'Other' : `Season ${number}`
}

function formatDate(datetime: string): string {
  return new Date(datetime).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

// The device refuses to delete a recording still in progress; protected ones have to be
// unprotected first, so a bulk delete can't take them along by accident.
const deletable = (r: ShowRecording) => r.state !== 'recording' && !r.protected
const isFailed = (r: ShowRecording) => r.state === 'failed'

// A bulk delete of whichever of `recordings` can be deleted.
function pendingDelete(label: string, recordings: ShowRecording[]): PendingDelete {
  return { label, recordings: recordings.filter(deletable), keptProtected: recordings.filter((r) => r.protected).length }
}

function countLabel(count: number): string {
  return `${count} recording${count === 1 ? '' : 's'}`
}

// A recorded TV show (or program) in a large dialog: its details on the left, its recordings
// by season on the right, each deletable - one at a time, a season at a time, or all/watched/
// failed at once. `path` is its /recordings/series/... or /recordings/programs/... path.
// `onChanged` tells the page to re-read its list after anything is deleted; `onEmpty` closes
// the dialog once there's nothing left in it.
export function RecordedShowDialog({
  kind,
  path,
  onChanged,
  onEmpty,
}: {
  kind: 'tv' | 'program'
  path: string
  onChanged: () => void
  onEmpty: () => void
}) {
  const [show, setShow] = useState<RecordedShow | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [season, setSeason] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingDelete | null>(null)
  // The one row whose delete button is asking to confirm.
  const [confirmingPath, setConfirmingPath] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  // Why each recording that couldn't be deleted wasn't.
  const [errors, setErrors] = useState<Map<string, string>>(new Map())
  const [posterFailed, setPosterFailed] = useState(false)
  // The one recording playing in its row's viewer.
  const [watchingPath, setWatchingPath] = useState<string | null>(null)
  // Recordings being marked watched/unwatched or protected/unprotected right now.
  const [updating, setUpdating] = useState<Set<string>>(new Set())
  // Why each recording that couldn't be marked wasn't.
  const [updateErrors, setUpdateErrors] = useState<Map<string, string>>(new Map())
  // Focus the dialog itself on open rather than its first button.
  const popupRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/recordings/${kind === 'tv' ? 'series' : 'programs'}/${path.split('/').pop()}`)
      .then((res) => {
        if (!res.ok) throw new Error(`API returned ${res.status}`)
        return res.json() as Promise<RecordedShow>
      })
      .then((d) => {
        if (!cancelled) setShow(d)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [kind, path])

  if (!show) {
    return (
      <DialogContent className="sm:max-w-md">
        <DialogTitle>{loadError ? "Couldn't load this show" : 'Loading…'}</DialogTitle>
        {loadError ? (
          <DialogDescription>/api/recordings returned an error: {loadError}</DialogDescription>
        ) : (
          <LoaderCircle className="text-muted-foreground size-6 animate-spin" />
        )}
      </DialogContent>
    )
  }

  const busy = progress !== null
  const all = show.seasons.flatMap((s) => s.recordings)
  const totalSize = all.reduce((sum, r) => sum + r.size, 0)
  const bulkOptions = [
    pendingDelete('all', all),
    pendingDelete('watched', all.filter((r) => r.watched)),
    pendingDelete('failed', all.filter(isFailed)),
  ]

  // One at a time - the device's embedded server doesn't cope well with a burst of requests.
  async function deleteRecordings(targets: ShowRecording[]) {
    setProgress({ done: 0, total: targets.length })
    const deleted = new Set<string>()
    const failed = new Map<string, string>()
    for (const r of targets) {
      try {
        await postRecordingAction('delete', r.path)
        deleted.add(r.path)
      } catch (err) {
        failed.set(r.path, (err as Error).message)
      }
      setProgress({ done: deleted.size + failed.size, total: targets.length })
    }
    setProgress(null)
    setPending(null)
    setConfirmingPath(null)
    setErrors(failed)

    if (deleted.size === 0) return
    onChanged()
    const seasons = show!.seasons
      .map((s) => ({ ...s, recordings: s.recordings.filter((r) => !deleted.has(r.path)) }))
      .filter((s) => s.recordings.length > 0)
    setShow({ ...show!, seasons })
    if (seasons.length === 0) onEmpty()
  }

  // Marks one recording watched/unwatched or protected/unprotected, then shows it as the device
  // now reports it.
  async function update(recording: ShowRecording, change: { watched?: boolean; protected?: boolean }) {
    const { path } = recording
    setUpdating((prev) => new Set(prev).add(path))
    setUpdateErrors((prev) => {
      const next = new Map(prev)
      next.delete(path)
      return next
    })
    try {
      const updated = await updateRecording<ShowRecording>(path, change)
      setShow((current) =>
        current && {
          ...current,
          seasons: current.seasons.map((s) => ({
            ...s,
            recordings: s.recordings.map((r) => (r.path === path ? updated : r)),
          })),
        },
      )
      // The page's cards show unwatched counts.
      onChanged()
    } catch (err) {
      setUpdateErrors((prev) => new Map(prev).set(path, (err as Error).message))
    } finally {
      setUpdating((prev) => {
        const next = new Set(prev)
        next.delete(path)
        return next
      })
    }
  }

  const meta = [
    show.origAirDate && new Date(`${show.origAirDate}T00:00`).getFullYear(),
    formatRating(show.seriesRating),
    show.episodeRuntime && formatDuration(show.episodeRuntime),
  ]
    .filter(Boolean)
    .join(' · ')
  const backdrop = show.backgroundImageId ?? show.coverImageId
  const posterId = posterFailed ? null : (show.thumbnailImageId ?? (backdrop ? null : show.snapshotImageId))
  const labels = show.seasons.map((s) => seasonLabel(s.number))
  const selectedSeason = season && labels.includes(season) ? season : labels[0]
  // A program's airings have no seasons at all - no point in a lone "Other" tab.
  const showTabs = !(show.seasons.length === 1 && show.seasons[0].number === null)

  const seasonPanel = (s: RecordedShow['seasons'][number]) => (
    <SeasonRecordings
      showTitle={show.title}
      recordings={s.recordings}
      busy={busy}
      errors={errors}
      confirmingPath={confirmingPath}
      onConfirm={setConfirmingPath}
      onDelete={(r) => deleteRecordings([r])}
      watchingPath={watchingPath}
      onWatch={setWatchingPath}
      updating={updating}
      updateErrors={updateErrors}
      onUpdate={update}
      onDeleteSeason={
        showTabs
          ? () => {
              setConfirmingPath(null)
              setPending(pendingDelete(seasonLabel(s.number), s.recordings))
            }
          : undefined
      }
    />
  )

  return (
    <DialogContent
      ref={popupRef}
      initialFocus={popupRef}
      className="grid h-[90vh] grid-cols-3 gap-0 overflow-hidden p-0 outline-none sm:max-w-6xl"
    >
      {/* Left third: the show. */}
      <div className="col-span-1 min-h-0 overflow-y-auto border-r">
        <div
          className="bg-muted relative h-40 bg-cover bg-center"
          style={backdrop ? { backgroundImage: `url(/api/images/${backdrop})` } : undefined}
        >
          <div className="from-popover via-popover/60 absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t to-transparent" />
        </div>
        <div className="relative -mt-10 space-y-5 px-5 pb-5">
          {posterId != null && (
            <img
              src={`/api/images/${posterId}`}
              alt=""
              className="aspect-[2/3] w-32 rounded-lg object-cover shadow-md"
              onError={() => setPosterFailed(true)}
            />
          )}
          <div className="space-y-1.5">
            <DialogTitle className="text-2xl leading-tight font-semibold">{show.title}</DialogTitle>
            {meta && <DialogDescription className="text-muted-foreground text-sm">{meta}</DialogDescription>}
          </div>
          <Genres genres={show.genres} />
          {show.description && <p className="leading-relaxed">{show.description}</p>}
          {show.cast.length > 0 && (
            <Section title="Cast">
              <p>{show.cast.slice(0, 8).join(', ')}</p>
            </Section>
          )}
          <Section title="Recorded">
            <p>
              {countLabel(all.length)} · {formatSize(totalSize)}
              {all.some((r) => !r.watched) && ` · ${all.filter((r) => !r.watched).length} unwatched`}
            </p>
          </Section>
        </div>
      </div>

      {/* Right two-thirds: the recordings by season. */}
      <div className="col-span-2 flex min-h-0 flex-col gap-3 p-5 pr-14">
        <div className="flex shrink-0 items-center justify-end gap-3">
          {progress && (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <LoaderCircle className="size-4 animate-spin" />
              Deleting {Math.min(progress.done + 1, progress.total)} of {progress.total}…
            </p>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger className={buttonVariants({ variant: 'outline', size: 'sm' })} disabled={busy}>
              <Trash2 className="size-4" />
              Delete
              <ChevronDown className="size-4 opacity-50" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-auto whitespace-nowrap">
              {bulkOptions.map((option) => (
                <DropdownMenuItem
                  key={option.label}
                  variant="destructive"
                  disabled={option.recordings.length === 0}
                  onClick={() => {
                    setConfirmingPath(null)
                    setPending(option)
                  }}
                >
                  Delete {option.label} ({option.recordings.length})
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {pending && (
          <div className="border-destructive/40 bg-destructive/5 shrink-0 space-y-2 rounded-md border p-3">
            <p className="text-sm">{confirmPrompt(pending)}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" disabled={busy} onClick={() => deleteRecordings(pending.recordings)}>
                {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                {busy ? 'Deleting…' : 'Delete'}
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setPending(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {errors.size > 0 && (
          <Alert variant="destructive" className="shrink-0">
            <AlertDescription>
              {errors.size === 1 ? "1 recording couldn't be deleted" : `${errors.size} recordings couldn't be deleted`} - see
              below.
            </AlertDescription>
          </Alert>
        )}

        {showTabs ? (
          <Tabs value={selectedSeason} onValueChange={(v) => setSeason(v as string)} className="min-h-0 flex-1">
            <TabsList className="h-auto max-w-full shrink-0 flex-wrap justify-start">
              {show.seasons.map((s) => (
                <TabsTrigger key={seasonLabel(s.number)} value={seasonLabel(s.number)}>
                  {seasonLabel(s.number)}
                </TabsTrigger>
              ))}
            </TabsList>
            {show.seasons.map((s) => (
              <TabsContent key={seasonLabel(s.number)} value={seasonLabel(s.number)} className="mt-3 min-h-0 flex-1 overflow-y-auto">
                {seasonPanel(s)}
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">{seasonPanel(show.seasons[0])}</div>
        )}
      </div>
    </DialogContent>
  )
}

function SeasonRecordings({
  showTitle,
  recordings,
  busy,
  errors,
  confirmingPath,
  onConfirm,
  onDelete,
  onDeleteSeason,
  ...rowProps
}: {
  showTitle: string
  recordings: ShowRecording[]
  busy: boolean
  errors: Map<string, string>
  confirmingPath: string | null
  onConfirm: (path: string | null) => void
  onDelete: (recording: ShowRecording) => void
  // Absent when there's only the one list, which the Delete menu already covers.
  onDeleteSeason?: () => void
} & Pick<RowProps, 'watchingPath' | 'onWatch' | 'onUpdate'> & {
  updating: Set<string>
  updateErrors: Map<string, string>
}) {
  const size = recordings.reduce((sum, r) => sum + r.size, 0)
  const deletableCount = recordings.filter(deletable).length

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {countLabel(recordings.length)} · {formatSize(size)}
        </p>
        {onDeleteSeason && (
          <Button size="sm" variant="outline" disabled={busy || deletableCount === 0} onClick={onDeleteSeason}>
            <Trash2 className="size-4" />
            Delete season ({deletableCount})
          </Button>
        )}
      </div>
      <div className="divide-y rounded-lg border">
        {recordings.map((r) => (
          <RecordingRow
            showTitle={showTitle}
            key={r.path}
            recording={r}
            busy={busy}
            error={errors.get(r.path)}
            confirming={confirmingPath === r.path}
            onConfirm={onConfirm}
            onDelete={onDelete}
            watchingPath={rowProps.watchingPath}
            onWatch={rowProps.onWatch}
            updating={rowProps.updating.has(r.path)}
            updateError={rowProps.updateErrors.get(r.path)}
            onUpdate={rowProps.onUpdate}
          />
        ))}
      </div>
    </div>
  )
}

interface RowProps {
  showTitle: string
  recording: ShowRecording
  busy: boolean
  error: string | undefined
  confirming: boolean
  onConfirm: (path: string | null) => void
  onDelete: (recording: ShowRecording) => void
  // The recording playing in its row's viewer, if any - only one plays at a time.
  watchingPath: string | null
  onWatch: (path: string | null) => void
  // Being marked watched/unwatched or protected/unprotected right now.
  updating: boolean
  updateError: string | undefined
  onUpdate: (recording: ShowRecording, change: { watched?: boolean; protected?: boolean }) => void
}

function RecordingRow({
  showTitle,
  recording: r,
  busy,
  error,
  confirming,
  onConfirm,
  onDelete,
  watchingPath,
  onWatch,
  updating,
  updateError,
  onUpdate,
}: RowProps) {
  const inProgress = r.state === 'recording'
  const watching = watchingPath === r.path
  // A program's airings have no episode titles, so they go by when they were recorded.
  const datedHeading = r.title === null && r.episodeNumber === null
  const deleteTitle = inProgress
    ? 'Stop the recording before deleting it'
    : r.protected
      ? 'Unprotect this recording before deleting it'
      : 'Delete this recording'

  return (
    <div className="space-y-3 px-4 py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className="font-medium">
            {r.episodeNumber !== null && <span className="text-muted-foreground mr-1.5 tabular-nums">E{r.episodeNumber}</span>}
            {datedHeading ? `Recorded ${formatDate(r.recordedAt)}` : (r.title ?? 'Untitled episode')}
          </p>
          {r.description && <p className="text-muted-foreground line-clamp-2">{r.description}</p>}
          <div className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
            <span>
              {[
                datedHeading ? null : `Recorded ${formatDate(r.recordedAt)}`,
                `${r.channel.major}.${r.channel.minor} ${r.channel.callSign}`,
                r.duration > 0 ? formatDuration(r.duration) : null,
                formatSize(r.size),
                r.watched ? 'Watched' : resumePosition(r) > 0 ? `Stopped at ${formatClock(r.position)}` : 'Unwatched',
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
            {r.protected && <Badge variant="secondary">Protected</Badge>}
            {inProgress && <Badge variant="destructive">Recording</Badge>}
            {isFailed(r) && <Badge variant="destructive">Failed</Badge>}
            {r.state && r.state !== 'finished' && !inProgress && !isFailed(r) && <Badge variant="outline">{r.state}</Badge>}
          </div>
          {error && <p className="text-destructive text-xs">Couldn't delete: {error}</p>}
          {updateError && <p className="text-destructive text-xs">Couldn't update: {updateError}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {confirming ? (
            <>
              <Button size="sm" variant="destructive" disabled={busy} onClick={() => onDelete(r)}>
                {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                Delete
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => onConfirm(null)}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant={watching ? 'secondary' : 'outline'}
                className="mr-1"
                onClick={() => onWatch(watching ? null : r.path)}
              >
                {watching ? <X className="size-4" /> : <Play className="size-4" />}
                {watching ? 'Close' : 'Watch'}
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                disabled={busy || updating}
                className={r.watched ? 'text-primary' : undefined}
                title={r.watched ? 'Mark as unwatched' : 'Mark as watched'}
                aria-label="Watched"
                aria-pressed={r.watched}
                onClick={() => onUpdate(r, { watched: !r.watched })}
              >
                <Check className="size-4" />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                disabled={busy || updating}
                className={r.protected ? 'text-primary' : undefined}
                title={r.protected ? 'Unprotect - allow it to be deleted' : 'Protect - keep it from being deleted'}
                aria-label="Protected"
                aria-pressed={r.protected}
                onClick={() => onUpdate(r, { protected: !r.protected })}
              >
                {r.protected ? <ShieldCheck className="size-4" /> : <Shield className="size-4" />}
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                disabled={busy || inProgress || r.protected}
                title={deleteTitle}
                aria-label="Delete this recording"
                onClick={() => onConfirm(r.path)}
              >
                <Trash2 className="size-4" />
              </Button>
            </>
          )}
        </div>
      </div>
      {watching && <RecordingViewer showTitle={showTitle} recording={r} />}
    </div>
  )
}

// A small player for one recording, opened under its row. Starts where it was left off; "Start
// over" plays it from the beginning.
function RecordingViewer({ showTitle, recording }: { showTitle: string; recording: ShowRecording }) {
  // `attempt` changes on every play, so each one remounts the player and starts a fresh stream.
  const [request, setRequest] = useState(() => ({ startAt: resumePosition(recording), attempt: 0 }))
  const [playlistUrl, setPlaylistUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    startRecordingStream(recording.path)
      .then((url) => {
        if (!cancelled) setPlaylistUrl(url)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [recording.path, request])

  function startOver() {
    setPlaylistUrl(null)
    setError(null)
    setRequest((prev) => ({ startAt: 0, attempt: prev.attempt + 1 }))
  }

  return (
    <div className="space-y-2">
      <div className="aspect-video w-full max-w-2xl overflow-hidden rounded-md bg-black">
        <LivePlayer
          key={request.attempt}
          playlistUrl={playlistUrl}
          // Any non-empty label - an empty one means "nothing selected" to the player.
          tuningLabel={recording.title ?? 'recording'}
          mediaTitle={showTitle}
          mediaSubtitle={recording.title}
          tuneError={error}
          startAt={request.startAt}
          loadingMessage={request.startAt > 0 ? `Resuming at ${formatClock(request.startAt)}` : 'Starting playback'}
          errorMessage="Couldn't play this recording"
          className="h-full w-full"
        />
      </div>
      {request.startAt > 0 && (
        <Button size="sm" variant="outline" onClick={startOver}>
          <RotateCcw className="size-4" />
          Start over
        </Button>
      )}
    </div>
  )
}
