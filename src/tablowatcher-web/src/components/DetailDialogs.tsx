import { useEffect, useRef, useState, type ReactNode } from 'react'
import { LoaderCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { AiringRow, RecordingPill } from '@/components/Recording'
import type { ChannelInfo } from '@/components/PosterGridPage'
import { formatRating, formatStars } from '@/lib/format'
import { recordingStateOf, type AiringSchedule, type RecordingState, type ScheduledAiring } from '@/lib/recording'

// GET /api/movies/{id}.
interface MovieDetail {
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
  recordingState: RecordingState | null
  airings: ScheduledAiring[]
}

// The fields of a /api/sports item the dialog shows.
export interface SportsEventDetail {
  path: string
  title: string
  sport: string
  description: string | null
  venue: string | null
  teams: { name: string; isHome: boolean }[]
  live: boolean
  datetime: string
  duration: number
  genres: string[]
  thumbnailImageId: number | null
  coverImageId: number | null
  backgroundImageId: number | null
  channel: ChannelInfo
  schedule: AiringSchedule | null
  recordingState: RecordingState | null
}

function imageUrl(id: number | null): string | null {
  return id == null ? null : `/api/images/${id}`
}

function formatRuntime(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  const hours = Math.floor(minutes / 60)
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`
}

// The dialog's shared frame: backdrop across the top, poster overlapping it, title and
// meta line beside the poster, then the body.
function DetailFrame({
  title,
  meta,
  backdropImageId,
  posterImageId,
  recordingState,
  children,
}: {
  title: string
  meta: string
  backdropImageId: number | null
  posterImageId: number | null
  recordingState: RecordingState | null
  children: ReactNode
}) {
  const [posterFailed, setPosterFailed] = useState(false)
  // Focus the dialog itself on open. By default the first button gets focus - the first
  // Record button, far enough down to scroll the backdrop and title out of view.
  const popupRef = useRef<HTMLDivElement>(null)
  const backdrop = imageUrl(backdropImageId)
  const poster = posterFailed ? null : imageUrl(posterImageId)

  return (
    <DialogContent
      ref={popupRef}
      initialFocus={popupRef}
      className="max-h-[90vh] gap-0 overflow-y-auto p-0 outline-none sm:max-w-3xl"
    >
      <div
        className="bg-muted relative h-48 bg-cover bg-center sm:h-64"
        style={backdrop ? { backgroundImage: `url(${backdrop})` } : undefined}
      >
        {/* Fades just the bottom of the backdrop into the dialog, under the poster and title. */}
        <div className="from-popover via-popover/60 absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t to-transparent" />
      </div>
      <div className="relative -mt-20 flex gap-4 px-6">
        {poster && (
          <img
            src={poster}
            alt=""
            className="aspect-[2/3] w-28 shrink-0 rounded-lg object-cover shadow-xl ring-1 ring-white/20 sm:w-36"
            onError={() => setPosterFailed(true)}
          />
        )}
        <div className="flex min-w-0 flex-col justify-end gap-1.5 pb-1">
          {recordingState && <RecordingPill state={recordingState} className="self-start" />}
          <DialogTitle className="text-2xl leading-tight font-semibold">{title}</DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            {meta}
          </DialogDescription>
        </div>
      </div>
      <div className="space-y-5 p-6">{children}</div>
    </DialogContent>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{title}</h3>
      {children}
    </section>
  )
}

function Genres({ genres }: { genres: string[] }) {
  return genres.length === 0 ? null : (
    <div className="flex flex-wrap gap-1">
      {genres.map((g) => (
        <Badge key={g} variant="secondary">
          {g}
        </Badge>
      ))}
    </div>
  )
}

export function MovieDetailDialog({ path, onChanged }: { path: string; onChanged: () => void }) {
  const [movie, setMovie] = useState<MovieDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Bumped after a recording change, to re-read every airing's status (scheduling one
  // airing can skip or un-skip the movie's others).
  const [reloadToken, setReloadToken] = useState(0)
  const movieId = path.split('/').pop()

  useEffect(() => {
    let cancelled = false
    fetch(`/api/movies/${movieId}`)
      .then((res) => {
        if (!res.ok) throw new Error(`API returned ${res.status}`)
        return res.json() as Promise<MovieDetail>
      })
      .then((d) => {
        if (cancelled) return
        setMovie(d)
        setError(null)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [movieId, reloadToken])

  if (!movie) {
    return (
      <DialogContent className="sm:max-w-md">
        <DialogTitle>{error ? "Couldn't load this movie" : 'Loading…'}</DialogTitle>
        {error ? (
          <DialogDescription>/api/movies returned an error: {error}</DialogDescription>
        ) : (
          <LoaderCircle className="text-muted-foreground size-6 animate-spin" />
        )}
      </DialogContent>
    )
  }

  const meta = [
    movie.releaseYear,
    formatRating(movie.filmRating),
    movie.starRating && formatStars(movie.starRating),
    movie.runtime && formatRuntime(movie.runtime),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <DetailFrame
      title={movie.title}
      meta={meta}
      backdropImageId={movie.backgroundImageId ?? movie.coverImageId}
      posterImageId={movie.thumbnailImageId ?? movie.coverImageId}
      recordingState={movie.recordingState}
    >
      <Genres genres={movie.genres} />
      {movie.description && <p className="leading-relaxed">{movie.description}</p>}
      {(movie.cast.length > 0 || movie.directors.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          {movie.cast.length > 0 && (
            <Section title="Cast">
              <p>{movie.cast.slice(0, 12).join(', ')}</p>
            </Section>
          )}
          {movie.directors.length > 0 && (
            <Section title={movie.directors.length === 1 ? 'Director' : 'Directors'}>
              <p>{movie.directors.join(', ')}</p>
            </Section>
          )}
        </div>
      )}
      <Section title={`Upcoming airings (${movie.airings.length})`}>
        <div className="divide-y">
          {movie.airings.map((airing) => (
            <AiringRow
              key={airing.path}
              airing={airing}
              onChanged={() => {
                setReloadToken((t) => t + 1)
                onChanged()
              }}
            />
          ))}
        </div>
      </Section>
    </DetailFrame>
  )
}

export function SportsEventDetailDialog({ event, onChanged }: { event: SportsEventDetail; onChanged: () => void }) {
  // The list item only refreshes once the page re-reads /api/sports; show the device's
  // answer immediately in the meantime.
  const [updated, setUpdated] = useState<ScheduledAiring | null>(null)
  const airing: ScheduledAiring = updated ?? {
    path: event.path,
    datetime: event.datetime,
    duration: event.duration,
    live: event.live,
    isNew: false,
    channel: event.channel,
    schedule: event.schedule,
  }
  const recordingState = updated ? recordingStateOf(updated.schedule) : event.recordingState

  // "Northwestern at Indiana" is already the title; list the teams only when it isn't.
  const teams = event.teams.length > 0 && !event.teams.every((t) => event.title.includes(t.name)) ? event.teams : []

  return (
    <DetailFrame
      title={event.title}
      meta={[event.title === event.sport ? null : event.sport, event.venue].filter(Boolean).join(' · ')}
      backdropImageId={event.backgroundImageId ?? event.coverImageId}
      posterImageId={event.thumbnailImageId ?? event.coverImageId}
      recordingState={recordingState}
    >
      <Genres genres={event.genres} />
      {event.description && <p className="leading-relaxed">{event.description}</p>}
      {teams.length > 0 && (
        <Section title="Teams">
          <p>{teams.map((t) => (t.isHome ? `${t.name} (home)` : t.name)).join(' vs. ')}</p>
        </Section>
      )}
      <Section title="Airing">
        <AiringRow
          airing={airing}
          onChanged={(a) => {
            setUpdated(a)
            onChanged()
          }}
        />
      </Section>
    </DetailFrame>
  )
}
