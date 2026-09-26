import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import { LoaderCircle } from 'lucide-react'

interface LivePlayerProps {
  playlistUrl: string | null
  // Set once a channel has been picked (e.g. "3.2 Me-TV M*A*S*H"); shown until playback starts.
  tuningLabel: string | null
  tuneError?: string | null
  className?: string
  // Also plays recordings (see RecordingPlayerDialog), which need different wording and can
  // resume partway through:
  // Seconds into the stream to start at. Leave unset for live TV, to start at the live edge;
  // a recording passes 0 to start at the beginning - even one still being recorded, whose
  // stream otherwise looks live.
  startAt?: number
  // Shown until playback starts; defaults to "Tuning into {tuningLabel}".
  loadingMessage?: string
  // Prefixes a playback error; defaults to "Couldn't play this channel".
  errorMessage?: string
}

// The playlist_url points directly at the Tablo device's separate streaming server (not
// this app's own API) and is CORS-open, so playback happens straight from the browser -
// no proxying needed. hls.js is tried first wherever MSE exists: recent Chrome reports
// native HLS support ("maybe" from canPlayType) but its native player rejects the Tablo's
// byte-range playlists (MEDIA_ERR_SRC_NOT_SUPPORTED). Native playback is only the fallback
// for browsers without MSE (e.g. iOS Safari).
interface AudioSettings {
  volume: number
  muted: boolean
}

// The player remounts on every channel change (see App), so the user's volume/mute choice is
// kept here - and in localStorage, so it survives reloads too. Starts muted, like before.
const AUDIO_STORAGE_KEY = 'livePlayer.audio'
let audioSettings: AudioSettings = loadAudioSettings()

function loadAudioSettings(): AudioSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(AUDIO_STORAGE_KEY) ?? 'null') as Partial<AudioSettings> | null
    if (saved && typeof saved.volume === 'number' && typeof saved.muted === 'boolean') {
      return { volume: Math.min(1, Math.max(0, saved.volume)), muted: saved.muted }
    }
  } catch {
    // Storage unavailable or corrupt - fall back to the default.
  }
  return { volume: 1, muted: true }
}

function saveAudioSettings(video: HTMLVideoElement) {
  audioSettings = { volume: video.volume, muted: video.muted }
  try {
    localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(audioSettings))
  } catch {
    // Not persisted across reloads, but still kept for this session.
  }
}

// Unmuted autoplay can be refused (browser autoplay policy); fall back to muted rather than
// not playing at all.
function play(video: HTMLVideoElement) {
  video.play().catch((err: unknown) => {
    if (err instanceof DOMException && err.name === 'NotAllowedError' && !video.muted) {
      video.muted = true
      video.play().catch(() => {})
    }
  })
}

export function LivePlayer({
  playlistUrl,
  tuningLabel,
  tuneError,
  className,
  startAt,
  loadingMessage,
  errorMessage = "Couldn't play this channel",
}: LivePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video || !playlistUrl) return

    video.volume = audioSettings.volume
    video.muted = audioSettings.muted

    if (Hls.isSupported()) {
      // -1 is hls.js's default: the live edge for live streams, the start otherwise.
      const hls = new Hls({ startPosition: startAt ?? -1 })
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) setError(data.details)
      })
      hls.loadSource(playlistUrl)
      hls.attachMedia(video)
      play(video)

      return () => hls.destroy()
    }

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      const onError = () => setError(video.error?.message || `media error ${video.error?.code}`)
      const onLoadedMetadata = () => {
        if (startAt !== undefined) video.currentTime = startAt
      }
      video.addEventListener('error', onError)
      video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true })
      video.src = playlistUrl
      play(video)

      return () => {
        video.removeEventListener('error', onError)
        video.removeEventListener('loadedmetadata', onLoadedMetadata)
        video.removeAttribute('src')
        video.load()
      }
    }

    setError('HLS playback is not supported in this browser')
  }, [playlistUrl, startAt])

  if (!tuningLabel) {
    return (
      <div className={`flex items-center justify-center text-sm text-white/60 ${className ?? ''}`}>
        Select a channel to watch
      </div>
    )
  }

  const shownError = tuneError ?? error
  if (shownError) {
    return (
      <div className={`flex items-center justify-center ${className ?? ''}`}>
        <p className="p-4 text-center text-sm text-white/80">
          {errorMessage}: {shownError}
        </p>
      </div>
    )
  }

  return (
    <div className={`relative flex items-center justify-center ${className ?? ''}`}>
      {playlistUrl && (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          ref={videoRef}
          className="max-h-full max-w-full"
          style={{ aspectRatio: '16 / 9' }}
          controls
          onPlaying={() => setPlaying(true)}
          onVolumeChange={(e) => saveAudioSettings(e.currentTarget)}
        />
      )}
      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 p-4 text-sm text-white/60">
          <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden />
          <span>{loadingMessage ?? `Tuning into ${tuningLabel}`}</span>
        </div>
      )}
    </div>
  )
}
