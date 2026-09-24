import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import { LoaderCircle } from 'lucide-react'

interface LivePlayerProps {
  playlistUrl: string | null
  // Set once a channel has been picked (e.g. "3.2 Me-TV M*A*S*H"); shown until playback starts.
  tuningLabel: string | null
  tuneError?: string | null
  className?: string
}

// The playlist_url points directly at the Tablo device's separate streaming server (not
// this app's own API) and is CORS-open, so playback happens straight from the browser -
// no proxying needed. hls.js is tried first wherever MSE exists: recent Chrome reports
// native HLS support ("maybe" from canPlayType) but its native player rejects the Tablo's
// byte-range playlists (MEDIA_ERR_SRC_NOT_SUPPORTED). Native playback is only the fallback
// for browsers without MSE (e.g. iOS Safari).
export function LivePlayer({ playlistUrl, tuningLabel, tuneError, className }: LivePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video || !playlistUrl) return

    if (Hls.isSupported()) {
      const hls = new Hls()
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) setError(data.details)
      })
      hls.loadSource(playlistUrl)
      hls.attachMedia(video)
      video.play().catch(() => {})

      return () => hls.destroy()
    }

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      const onError = () => setError(video.error?.message || `media error ${video.error?.code}`)
      video.addEventListener('error', onError)
      video.src = playlistUrl
      video.play().catch(() => {})

      return () => {
        video.removeEventListener('error', onError)
        video.removeAttribute('src')
        video.load()
      }
    }

    setError('HLS playback is not supported in this browser')
  }, [playlistUrl])

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
        <p className="p-4 text-center text-sm text-white/80">Couldn't play this channel: {shownError}</p>
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
          muted
          onPlaying={() => setPlaying(true)}
        />
      )}
      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 p-4 text-sm text-white/60">
          <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden />
          <span>Tuning into {tuningLabel}</span>
        </div>
      )}
    </div>
  )
}
