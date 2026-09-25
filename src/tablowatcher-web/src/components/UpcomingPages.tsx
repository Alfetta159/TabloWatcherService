import { Film, MonitorPlay, Trophy } from 'lucide-react'
import {
  PosterGridPage,
  type Artwork,
  type ChannelInfo,
  type PosterCardData,
  type UpcomingChannel,
} from '@/components/PosterGridPage'

interface TvShow extends Artwork {
  path: string
  title: string
  description: string | null
  genres: string[]
  seriesRating: string | null
  channels: UpcomingChannel[]
}

interface Movie extends Artwork {
  path: string
  title: string
  description: string | null
  genres: string[]
  releaseYear: number | null
  filmRating: string | null
  channels: UpcomingChannel[]
}

interface SportsEvent extends Artwork {
  path: string
  title: string
  sport: string
  description: string | null
  venue: string | null
  live: boolean
  datetime: string
  duration: number
  genres: string[]
  channel: ChannelInfo
}

// Prefer the portrait poster; the other images are landscape, but better than nothing.
function posterImageId(artwork: Artwork): number | null {
  return artwork.thumbnailImageId ?? artwork.coverImageId ?? artwork.backgroundImageId
}

// Ratings come back lowercase - "r", "pg-13", "nc-17" - with TV ratings undashed ("tvpg",
// "tv14"), so "tvpg" -> "TV-PG" and "pg-13" -> "PG-13".
function formatRating(rating: string | null): string | null {
  if (!rating) return null
  return rating.toUpperCase().replace(/^TV(?!-)/, 'TV-')
}

// Module-level, so each page's toCard is stable and doesn't re-map every render.
function tvShowCard(show: TvShow): PosterCardData {
  return {
    key: show.path,
    title: show.title,
    description: show.description,
    genres: show.genres,
    imageId: posterImageId(show),
    channels: show.channels,
  }
}

function movieCard(movie: Movie): PosterCardData {
  return {
    key: movie.path,
    title: movie.title,
    subtitle: [movie.releaseYear, formatRating(movie.filmRating)].filter(Boolean).join(' · ') || null,
    description: movie.description,
    genres: movie.genres,
    imageId: posterImageId(movie),
    channels: movie.channels,
  }
}

function sportsEventCard(event: SportsEvent): PosterCardData {
  return {
    key: event.path,
    title: event.title,
    subtitle: event.title === event.sport ? event.venue : event.sport,
    description: [event.description, event.venue].filter(Boolean).join('\n') || null,
    genres: event.genres,
    imageId: posterImageId(event),
    channels: [{ ...event.channel, nextAiring: event.datetime, airingCount: 1 }],
    flag: event.live ? 'Live' : null,
  }
}

export function TvShowsPage() {
  return (
    <PosterGridPage endpoint="/api/tv-shows" noun={['show', 'shows']} toCard={tvShowCard} placeholderIcon={MonitorPlay} />
  )
}

export function MoviesPage() {
  return <PosterGridPage endpoint="/api/movies" noun={['movie', 'movies']} toCard={movieCard} placeholderIcon={Film} />
}

export function SportsPage() {
  return (
    <PosterGridPage
      endpoint="/api/sports"
      noun={['event', 'events']}
      toCard={sportsEventCard}
      placeholderIcon={Trophy}
      showAiringCount={false}
    />
  )
}
