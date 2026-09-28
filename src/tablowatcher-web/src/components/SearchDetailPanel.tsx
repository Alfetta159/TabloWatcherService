import { useEffect, useState } from 'react'
import { Eye, LoaderCircle, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Genres, Section } from '@/components/DetailDialogs'
import { AiringRow } from '@/components/Recording'
import { formatClock, formatDuration, formatRating, formatSize, formatStars } from '@/lib/format'
import type { ScheduledAiring } from '@/lib/recording'

// GET /api/search/details.
interface SearchResultDetail {
  airing: ScheduledAiring
  title: string
  episodeTitle: string | null
  seasonNumber: number | null
  episodeNumber: number | null
  // The episode's or game's own description; `description` is the show's/movie's/sport's.
  airingDescription: string | null
  description: string | null
  genres: string[]
  // "2019-03-05"-style dates, no time of day.
  episodeOriginalAirDate: string | null
  seriesPremiereDate: string | null
  releaseYear: number | null
  rating: string | null
  starRating: number | null
  // Seconds.
  runtime: number | null
  cast: string[]
  directors: string[]
  venue: string | null
  teams: { name: string; isHome: boolean }[]
  thumbnailImageId: number | null
  coverImageId: number | null
  backgroundImageId: number | null
  // Recordings already on the Tablo of this same episode or movie, newest first.
  recordings: {
    path: string
    datetime: string
    state: string | null
    size: number | null
    duration: number | null
    width: number | null
    height: number | null
    watched: boolean
  }[]
}

function imageUrl(id: number | null): string | null {
  return id == null ? null : `/api/images/${id}`
}

// "2019-03-05" -> "Mar 5, 2019", read as a local date (new Date() would take it as UTC
// midnight and show the day before anywhere west of Greenwich).
function formatDate(date: string): string {
  const [y, m, d] = date.split('T')[0].split('-').map(Number)
  if (!y || !m || !d) return date
  return new Date(y, m - 1, d).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </>
  )
}

// The panel beside the search results showing everything known about one of them.
// `reloadToken` changes when the results are re-read (e.g. after a recording change made
// from the list), so the panel re-reads its airing's status too.
export function SearchDetailPanel({
  path,
  reloadToken,
  onChanged,
  onClose,
}: {
  path: string
  reloadToken: number
  onChanged: () => void
  onClose: () => void
}) {
  const [detail, setDetail] = useState<SearchResultDetail | null>(null)
  // Tagged with its path, like `detail`, so one result's error doesn't show for the next.
  const [error, setError] = useState<{ path: string; message: string } | null>(null)
  // The poster URL that failed to load (404 - none on the device), so it's hidden for that
  // result only.
  const [failedPoster, setFailedPoster] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/search/details?${new URLSearchParams({ path })}`)
      .then((res) => {
        if (!res.ok) throw new Error(`API returned ${res.status}`)
        return res.json() as Promise<SearchResultDetail>
      })
      .then((d) => {
        if (cancelled) return
        setDetail(d)
        setError(null)
      })
      .catch((err) => {
        if (!cancelled) setError({ path, message: err.message })
      })
    return () => {
      cancelled = true
    }
  }, [path, reloadToken])

  // Only show the loaded detail once it's this path's - not the previous selection's while
  // the new one loads.
  const current = detail?.airing.path === path ? detail : null
  const currentError = error?.path === path ? error.message : null

  const closeButton = (
    <Button
      variant="ghost"
      size="icon"
      className="absolute top-2 right-2 z-10 bg-black/30 text-white hover:bg-black/50 hover:text-white"
      onClick={onClose}
      aria-label="Close details"
    >
      <X className="size-4" />
    </Button>
  )

  if (!current) {
    return (
      <Card className="relative p-6">
        {closeButton}
        {currentError ? (
          <p className="text-destructive text-sm">/api/search/details returned an error: {currentError}</p>
        ) : (
          <LoaderCircle className="text-muted-foreground size-6 animate-spin" />
        )}
      </Card>
    )
  }

  const backdrop = imageUrl(current.backgroundImageId ?? current.coverImageId)
  const posterUrl = imageUrl(current.thumbnailImageId ?? current.coverImageId)
  const poster = posterUrl === failedPoster ? null : posterUrl
  const episodeLabel = [
    current.seasonNumber && current.episodeNumber ? `S${current.seasonNumber}E${current.episodeNumber}` : null,
    current.episodeTitle,
  ]
    .filter(Boolean)
    .join(' · ')
  const meta = [
    current.releaseYear,
    formatRating(current.rating),
    current.starRating && formatStars(current.starRating),
    current.runtime && formatDuration(current.runtime),
  ]
    .filter(Boolean)
    .join(' · ')
  // "Northwestern at Indiana" already names the teams; list them only when it doesn't.
  const teams =
    current.teams.length > 0 && !current.teams.every((t) => current.episodeTitle?.includes(t.name)) ? current.teams : []
  const showDescription = current.description && current.description !== current.airingDescription

  return (
    <Card className="relative gap-0 overflow-hidden py-0">
      {closeButton}
      <div
        className="bg-muted relative h-40 bg-cover bg-center"
        style={backdrop ? { backgroundImage: `url(${backdrop})` } : undefined}
      >
        <div className="from-card via-card/60 absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t to-transparent" />
      </div>
      <div className="relative -mt-16 flex gap-4 px-5">
        {poster && (
          <img
            src={poster}
            alt=""
            className="aspect-[2/3] w-24 shrink-0 rounded-lg object-cover shadow-xl ring-1 ring-white/20"
            onError={() => setFailedPoster(poster)}
          />
        )}
        <div className="flex min-w-0 flex-col justify-end gap-1 pb-1">
          <h2 className="text-xl leading-tight font-semibold">{current.title}</h2>
          {episodeLabel && <p className="text-sm">{episodeLabel}</p>}
          {meta && <p className="text-muted-foreground text-sm">{meta}</p>}
        </div>
      </div>

      <div className="space-y-5 p-5 text-sm">
        <Genres genres={current.genres} />

        {current.airingDescription && <p className="leading-relaxed">{current.airingDescription}</p>}
        {showDescription && (
          <Section title={current.airingDescription ? 'About the show' : 'Description'}>
            <p className="leading-relaxed">{current.description}</p>
          </Section>
        )}

        <Section title="Airing">
          <AiringRow
            airing={current.airing}
            onChanged={(a) => {
              setDetail({ ...current, airing: a })
              onChanged()
            }}
          />
        </Section>

        {(current.episodeOriginalAirDate || current.seriesPremiereDate || current.venue || teams.length > 0) && (
          <Section title="Details">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              {current.episodeOriginalAirDate && (
                <DetailRow label="Original air date" value={formatDate(current.episodeOriginalAirDate)} />
              )}
              {current.seriesPremiereDate && (
                <DetailRow label="Series premiere" value={formatDate(current.seriesPremiereDate)} />
              )}
              {current.venue && <DetailRow label="Venue" value={current.venue} />}
              {teams.length > 0 && (
                <DetailRow
                  label="Teams"
                  value={teams.map((t) => (t.isHome ? `${t.name} (home)` : t.name)).join(' vs. ')}
                />
              )}
            </dl>
          </Section>
        )}

        {current.cast.length > 0 && (
          <Section title="Cast">
            <p>{current.cast.slice(0, 12).join(', ')}</p>
          </Section>
        )}
        {current.directors.length > 0 && (
          <Section title={current.directors.length === 1 ? 'Director' : 'Directors'}>
            <p>{current.directors.join(', ')}</p>
          </Section>
        )}

        {current.recordings.length > 0 && (
          <Section title={`Already recorded (${current.recordings.length})`}>
            <div className="divide-y">
              {current.recordings.map((r) => (
                <div key={r.path} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="space-y-0.5">
                    <p className="font-medium">
                      {new Date(r.datetime).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {[
                        r.duration ? formatClock(r.duration) : null,
                        r.height ? `${r.height}p` : null,
                        r.size ? `${formatSize(r.size)} on disk` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {r.state === 'recording' && <Badge className="bg-red-600 text-white">Recording</Badge>}
                    {r.state === 'failed' && <Badge variant="destructive">Failed</Badge>}
                    {r.watched && (
                      <Badge variant="outline" className="gap-1">
                        <Eye className="size-3" />
                        Watched
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>
    </Card>
  )
}
