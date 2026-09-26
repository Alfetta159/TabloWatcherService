import { useEffect, useState, type ReactNode } from 'react'
import { CircleStop, LoaderCircle, Play, RotateCcw, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { LivePlayer } from '@/components/LivePlayer'
import type { ChannelInfo } from '@/components/PosterGridPage'
import { formatClock, formatDuration, formatRating, formatSize, formatStars } from '@/lib/format'

// GET /api/recordings/movies/{id}.
interface RecordedMovie {
  path: string
  title: string
  description: string | null
  genres: string[]
  releaseYear: number | null
  filmRating: string | null
  starRating: number | null
  // Seconds.
  runtime: number | null
  cast: string[]
  directors: string[]
  thumbnailImageId: number | null
  coverImageId: number | null
  backgroundImageId: number | null
  // Newest first.
  recordings: MovieRecording[]
}

interface MovieRecording {
  path: string
  recordedAt: string
  channel: ChannelInfo
  state: string | null
  // Seconds recorded.
  duration: number
  size: number
  width: number
  height: number
  watched: boolean
  // Seconds in, where playback last left off.
  position: number
  snapshotImageId: number | null
}

// What the player is (or is about to be) playing. `attempt` changes on every play request, so
// asking to play the same spot again still restarts the player.
interface PlayRequest {
  path: string
  startAt: number
  attempt: number
}

// Where to pick up a recording: where it was left off, unless it was finished (or barely started).
function resumePosition(recording: MovieRecording): number {
  return !recording.watched && recording.position > 30 ? recording.position : 0
}

function formatDate(datetime: string): string {
  return new Date(datetime).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{title}</h3>
      {children}
    </section>
  )
}

// Stops (keeping what's recorded so far) or deletes one recording.
async function postRecordingAction(action: 'stop' | 'delete', path: string): Promise<void> {
  const res = await fetch(`/api/recordings/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  })
  if (!res.ok) {
    const problem = (await res.json().catch(() => null)) as { detail?: string } | null
    throw new Error(problem?.detail ?? (res.status === 502 ? "The Tablo didn't respond - try again" : `API returned ${res.status}`))
  }
}

// A recorded movie in a large dialog, split 1:3 - its details and recordings on the left,
// playing on the right. Playback starts on open, resuming where it was left off.
// `onChanged` tells the page to re-read its list after a recording is stopped or deleted;
// `onEmpty` closes the dialog once the movie has no recordings left.
export function RecordingPlayerDialog({
  moviePath,
  onChanged,
  onEmpty,
}: {
  moviePath: string
  onChanged: () => void
  onEmpty: () => void
}) {
  const [movie, setMovie] = useState<RecordedMovie | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [playRequest, setPlayRequest] = useState<PlayRequest | null>(null)
  const [playlistUrl, setPlaylistUrl] = useState<string | null>(null)
  const [watchError, setWatchError] = useState<string | null>(null)
  const [posterFailed, setPosterFailed] = useState(false)
  // Bumped to re-read the movie after a stop or delete.
  const [reloadToken, setReloadToken] = useState(0)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  // Deleting can't be undone, so it takes a second click.
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const movieId = moviePath.split('/').pop()

  // Clears the last stream here rather than in the effect that fetches the next one.
  function playFrom(recording: MovieRecording, startAt: number) {
    setPlaylistUrl(null)
    setWatchError(null)
    setPlayRequest((prev) => ({ path: recording.path, startAt, attempt: (prev?.attempt ?? 0) + 1 }))
  }

  useEffect(() => {
    let cancelled = false
    fetch(`/api/recordings/movies/${movieId}`)
      .then((res) => {
        if (!res.ok) throw new Error(`API returned ${res.status}`)
        return res.json() as Promise<RecordedMovie>
      })
      .then((m) => {
        if (cancelled) return
        setMovie(m)
        // Keep playing what's playing, unless it's gone (deleted) or nothing has started yet.
        setPlayRequest((current) => {
          if (current && m.recordings.some((r) => r.path === current.path)) return current
          const newest = m.recordings[0]
          if (!newest) return null
          setPlaylistUrl(null)
          setWatchError(null)
          return { path: newest.path, startAt: resumePosition(newest), attempt: (current?.attempt ?? 0) + 1 }
        })
      })
      .catch((err) => {
        if (cancelled) return
        // Its last recording was deleted, so the movie has dropped out of the recordings.
        if (reloadToken > 0 && err.message === 'API returned 404') onEmpty()
        else setLoadError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [movieId, reloadToken, onEmpty])

  function runAction(action: 'stop' | 'delete', recording: MovieRecording) {
    setActionBusy(true)
    setActionError(null)
    postRecordingAction(action, recording.path)
      .then(() => {
        setConfirmingDelete(false)
        setReloadToken((t) => t + 1)
        onChanged()
      })
      .catch((err) => setActionError(err.message))
      .finally(() => setActionBusy(false))
  }

  // Each play request gets a fresh stream from the device (its session token is short-lived).
  useEffect(() => {
    if (!playRequest) return
    let cancelled = false
    fetch('/api/recordings/watch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: playRequest.path }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 502 ? "the Tablo didn't respond - try again" : `API returned ${res.status}`)
        return res.json() as Promise<{ playlistUrl: string }>
      })
      .then((d) => {
        if (!cancelled) setPlaylistUrl(d.playlistUrl)
      })
      .catch((err) => {
        if (!cancelled) setWatchError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [playRequest])


  const playing = movie?.recordings.find((r) => r.path === playRequest?.path) ?? null
  const posterId = posterFailed ? null : (movie?.thumbnailImageId ?? movie?.coverImageId ?? playing?.snapshotImageId ?? null)
  const meta = movie
    ? [
        movie.releaseYear,
        formatRating(movie.filmRating),
        movie.starRating && formatStars(movie.starRating),
        movie.runtime && formatDuration(movie.runtime),
      ]
        .filter(Boolean)
        .join(' · ')
    : ''

  return (
    <DialogContent className="grid h-[88vh] w-[96vw] max-w-none grid-cols-4 gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,1800px)]">
      {/* Preview: 1 of 4 columns. */}
      <div className="col-span-1 min-w-0 space-y-5 overflow-y-auto border-r p-5">
        {!movie ? (
          <>
            <DialogTitle>{loadError ? "Couldn't load this recording" : 'Loading…'}</DialogTitle>
            {loadError ? (
              <DialogDescription>/api/recordings returned an error: {loadError}</DialogDescription>
            ) : (
              <LoaderCircle className="text-muted-foreground size-6 animate-spin" />
            )}
          </>
        ) : (
          <>
            {posterId != null && (
              <img
                src={`/api/images/${posterId}`}
                alt=""
                className="aspect-[2/3] w-full max-w-56 rounded-lg object-cover shadow-md"
                onError={() => setPosterFailed(true)}
              />
            )}
            <div className="space-y-1">
              <DialogTitle className="text-xl leading-tight font-semibold">{movie.title}</DialogTitle>
              <DialogDescription className="text-muted-foreground text-sm">{meta}</DialogDescription>
            </div>
            {movie.genres.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {movie.genres.map((g) => (
                  <Badge key={g} variant="secondary">
                    {g}
                  </Badge>
                ))}
              </div>
            )}
            {movie.description && <p className="text-sm leading-relaxed">{movie.description}</p>}

            {playing && (
              <div className="flex flex-wrap gap-2">
                {resumePosition(playing) > 0 && (
                  <Button size="sm" onClick={() => playFrom(playing, resumePosition(playing))}>
                    <Play className="size-4" />
                    Resume at {formatClock(resumePosition(playing))}
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => playFrom(playing, 0)}>
                  <RotateCcw className="size-4" />
                  Start over
                </Button>
              </div>
            )}

            {playing && (
              <div className="space-y-2">
                {playing.state === 'recording' ? (
                  <Button size="sm" variant="destructive" disabled={actionBusy} onClick={() => runAction('stop', playing)}>
                    {actionBusy ? <LoaderCircle className="size-4 animate-spin" /> : <CircleStop className="size-4" />}
                    Stop recording
                  </Button>
                ) : confirmingDelete ? (
                  <div className="border-destructive/40 bg-destructive/5 space-y-2 rounded-md border p-2">
                    <p className="text-sm">Delete this recording? This can't be undone.</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="destructive" disabled={actionBusy} onClick={() => runAction('delete', playing)}>
                        {actionBusy ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                        Delete
                      </Button>
                      <Button size="sm" variant="outline" disabled={actionBusy} onClick={() => setConfirmingDelete(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setConfirmingDelete(true)}>
                    <Trash2 className="size-4" />
                    Delete recording
                  </Button>
                )}
                {actionError && <p className="text-destructive text-xs">{actionError}</p>}
              </div>
            )}

            <Section title={movie.recordings.length === 1 ? 'Recording' : `Recordings (${movie.recordings.length})`}>
              <div className="space-y-2">
                {movie.recordings.map((r) => {
                  const current = r.path === playRequest?.path
                  return (
                    <button
                      key={r.path}
                      type="button"
                      onClick={() => {
                        if (current) return
                        setConfirmingDelete(false)
                        playFrom(r, resumePosition(r))
                      }}
                      className={`w-full rounded-md border p-2 text-left text-xs transition-colors ${current ? 'border-primary bg-primary/5' : 'hover:bg-muted'}`}
                      aria-pressed={current}
                    >
                      <p className="font-medium">
                        Recorded {formatDate(r.recordedAt)} · {r.channel.major}.{r.channel.minor} {r.channel.callSign}
                      </p>
                      <p className="text-muted-foreground">
                        {[
                          r.duration > 0 ? formatDuration(r.duration) : null,
                          formatSize(r.size),
                          r.height > 0 ? `${r.height}p` : null,
                          r.watched ? 'Watched' : r.position > 30 ? `Stopped at ${formatClock(r.position)}` : 'Unwatched',
                          r.state && r.state !== 'finished' ? r.state : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </button>
                  )
                })}
              </div>
            </Section>

            {movie.cast.length > 0 && (
              <Section title="Cast">
                <p className="text-sm">{movie.cast.slice(0, 12).join(', ')}</p>
              </Section>
            )}
            {movie.directors.length > 0 && (
              <Section title={movie.directors.length === 1 ? 'Director' : 'Directors'}>
                <p className="text-sm">{movie.directors.join(', ')}</p>
              </Section>
            )}
          </>
        )}
      </div>

      {/* Player: 3 of 4 columns. */}
      <div className="col-span-3 flex min-w-0 items-center justify-center bg-black">
        {playRequest && (
          <LivePlayer
            // Remount per request, so each play starts fresh at its own position.
            key={`${playRequest.path}:${playRequest.attempt}`}
            playlistUrl={playlistUrl}
            // Any non-empty label - an empty one means "nothing selected" to the player.
            tuningLabel={movie?.title ?? 'recording'}
            tuneError={watchError}
            startAt={playRequest.startAt}
            loadingMessage={playRequest.startAt > 0 ? `Resuming at ${formatClock(playRequest.startAt)}` : 'Starting playback'}
            errorMessage="Couldn't play this recording"
            className="h-full w-full"
          />
        )}
      </div>
    </DialogContent>
  )
}
