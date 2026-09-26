import { Film, MonitorPlay, Trophy } from 'lucide-react'
import {
  PosterGridPage,
  type Artwork,
  type Facet,
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
  // 1-4 in half steps (Gracenote's critic rating), or null if unrated.
  starRating: number | null
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

// Movie ratings first, mildest to strictest, then TV ratings the same way; anything
// unexpected sorts after these.
const RATING_ORDER = ['G', 'PG', 'PG-13', 'R', 'NC-17', 'TV-Y', 'TV-Y7', 'TV-G', 'TV-PG', 'TV-14', 'TV-MA']

function compareRatings(a: string, b: string): number {
  const rank = (r: string) => {
    const i = RATING_ORDER.indexOf(r)
    return i === -1 ? RATING_ORDER.length : i
  }
  return rank(a) - rank(b) || a.localeCompare(b)
}

// 3.5 -> "★★★½"
function formatStars(stars: number): string {
  return '★'.repeat(Math.floor(stars)) + (stars % 1 ? '½' : '')
}

// Module-level (like the toCard functions below) so they're stable across renders.
const RATING_FACET: Facet = { key: 'rating', label: 'Rating', placeholder: 'All ratings', compare: compareRatings }

const STAR_FACET: Facet = {
  key: 'stars',
  label: 'Stars',
  placeholder: 'Any stars',
  formatValue: (value) => formatStars(Number(value)),
  // Best first.
  compare: (a, b) => Number(b) - Number(a),
}

const TV_SHOW_FACETS = [RATING_FACET]
const MOVIE_FACETS = [RATING_FACET, STAR_FACET]

// Module-level, so each page's toCard is stable and doesn't re-map every render.
function tvShowCard(show: TvShow): PosterCardData {
  return {
    key: show.path,
    title: show.title,
    description: show.description,
    genres: show.genres,
    imageId: posterImageId(show),
    channels: show.channels,
    facets: { rating: formatRating(show.seriesRating) },
  }
}

function movieCard(movie: Movie): PosterCardData {
  return {
    key: movie.path,
    title: movie.title,
    subtitle:
      [movie.releaseYear, formatRating(movie.filmRating), movie.starRating && formatStars(movie.starRating)]
        .filter(Boolean)
        .join(' · ') || null,
    description: movie.description,
    genres: movie.genres,
    imageId: posterImageId(movie),
    channels: movie.channels,
    facets: {
      rating: formatRating(movie.filmRating),
      stars: movie.starRating == null ? null : String(movie.starRating),
    },
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
    <PosterGridPage
      endpoint="/api/tv-shows"
      noun={['show', 'shows']}
      toCard={tvShowCard}
      placeholderIcon={MonitorPlay}
      facets={TV_SHOW_FACETS}
    />
  )
}

export function MoviesPage() {
  return (
    <PosterGridPage
      endpoint="/api/movies"
      noun={['movie', 'movies']}
      toCard={movieCard}
      placeholderIcon={Film}
      facets={MOVIE_FACETS}
    />
  )
}

export function SportsPage() {
  return (
    <PosterGridPage
      endpoint="/api/sports"
      noun={['event', 'events']}
      toCard={sportsEventCard}
      placeholderIcon={Trophy}
      showAiringCount={false}
      defaultSort="airDate"
    />
  )
}
