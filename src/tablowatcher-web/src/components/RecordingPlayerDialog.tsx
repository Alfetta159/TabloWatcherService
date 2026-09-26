import { useEffect, useState, type ReactNode } from 'react'
import { LoaderCircle, Play, RotateCcw } from 'lucide-react'
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

// A recorded movie in a large dialog, split 1:3 - its details and recordings on the left,
// playing on the right. Playback starts on open, resuming where it was left off.
export function RecordingPlayerDialog({ moviePath }: { moviePath: string }) {
  const [movie, setMovie] = useState<RecordedMovie | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [playRequest, setPlayRequest] = useState<PlayRequest | null>(null)
  const [playlistUrl, setPlaylistUrl] = useState<string | null>(null)
  const [watchError, setWatchError] = useState<string | null>(null)
  const [posterFailed, setPosterFailed] = useState(false)
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
        const newest = m.recordings[0]
        if (newest) playFrom(newest, resumePosition(newest))
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [movieId])

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

            <Section title={movie.recordings.length === 1 ? 'Recording' : `Recordings (${movie.recordings.length})`}>
              <div className="space-y-2">
                {movie.recordings.map((r) => {
                  const current = r.path === playRequest?.path
                  return (
                    <button
                      key={r.path}
                      type="button"
                      onClick={() => !current && playFrom(r, resumePosition(r))}
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
