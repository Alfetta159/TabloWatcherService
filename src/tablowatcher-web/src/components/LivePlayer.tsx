import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'

interface LivePlayerProps {
  playlistUrl: string | null
  className?: string
}

// The playlist_url points directly at the Tablo device's separate streaming server (not
// this app's own API) and is CORS-open, so playback happens straight from the browser -
// no proxying needed. Chromium/Firefox need hls.js (no native HLS support); Safari plays
// the .m3u8 directly.
export function LivePlayer({ playlistUrl, className }: LivePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setError(null)
    const video = videoRef.current
    if (!video || !playlistUrl) return

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = playlistUrl
      video.play().catch(() => {})
      return
    }

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

    setError('HLS playback is not supported in this browser')
  }, [playlistUrl])

  if (!playlistUrl) {
    return (
      <div className={`flex items-center justify-center text-sm text-white/60 ${className ?? ''}`}>
        Select a channel to watch
      </div>
    )
  }

  return (
    <div className={`flex items-center justify-center ${className ?? ''}`}>
      {error ? (
        <p className="p-4 text-center text-sm text-white/80">Couldn't play this channel: {error}</p>
      ) : (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video ref={videoRef} className="max-h-full max-w-full" style={{ aspectRatio: '16 / 9' }} controls muted />
      )}
    </div>
  )
}
