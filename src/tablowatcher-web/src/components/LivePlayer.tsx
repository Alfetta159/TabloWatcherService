import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import { LoaderCircle, Maximize2, Minimize2, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface LivePlayerProps {
  playlistUrl: string | null
  // Set once a channel has been picked (e.g. "3.2 Me-TV M*A*S*H"); shown until playback starts.
  tuningLabel: string | null
  mediaTitle?: string | null
  mediaSubtitle?: string | null
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

const SEEK_BACKWARD_SECONDS = 10
const SEEK_FORWARD_SECONDS = 30

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

function seekTo(video: HTMLVideoElement, time: number) {
  if (video.seekable.length > 0) {
    const last = video.seekable.length - 1
    const start = video.seekable.start(0)
    const end = video.seekable.end(last)
    video.currentTime = Math.min(Math.max(time, start), end)
    return
  }

  if (Number.isFinite(video.duration)) {
    video.currentTime = Math.min(Math.max(time, 0), video.duration)
    return
  }

  video.currentTime = Math.max(time, 0)
}

function seekBy(video: HTMLVideoElement, offsetSeconds: number) {
  seekTo(video, video.currentTime + offsetSeconds)
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

// A player closed while in picture-in-picture (e.g. its dialog was closed) keeps playing
// there: its video is moved out of the page, still in the document so the browser doesn't
// pause it, and torn down once picture-in-picture is closed or another player starts.
let detached: { video: HTMLVideoElement; teardown: () => void } | null = null
const mediaSessionTeardowns = new WeakMap<HTMLVideoElement, () => void>()

function keepPlayingDetached(video: HTMLVideoElement, teardown: () => void) {
  endDetached()
  video.style.cssText = 'position:fixed;left:-10000px;top:0;width:1px;height:1px;opacity:0;pointer-events:none'
  document.body.appendChild(video)
  detached = { video, teardown }
  video.addEventListener('leavepictureinpicture', () => {
    if (detached?.video === video) endDetached()
  }, { once: true })
}

function endDetached() {
  if (!detached) return
  const { video, teardown } = detached
  detached = null
  if (document.pictureInPictureElement === video) document.exitPictureInPicture().catch(() => {})
  mediaSessionTeardowns.get(video)?.()
  mediaSessionTeardowns.delete(video)
  teardown()
  video.remove()
}

export function LivePlayer({
  playlistUrl,
  tuningLabel,
  mediaTitle,
  mediaSubtitle,
  tuneError,
  className,
  startAt,
  loadingMessage,
  errorMessage = "Couldn't play this channel",
}: LivePlayerProps) {
  // The <video> is created here rather than rendered, so it can outlive this component in
  // picture-in-picture (see keepPlayingDetached).
  const hostRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)

  const [hovered, setHovered] = useState(false)
  const [muted, setMuted] = useState(audioSettings.muted)
  const [volume, setVolume] = useState(audioSettings.volume)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }

    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  function toggleFullscreen() {
    const container = hostRef.current
    if (!container) return

    if (!document.fullscreenElement) {
      container.requestFullscreen().catch((err) => {
        console.error('Failed to enter fullscreen', err)
      })
      return
    }

    document.exitFullscreen().catch((err) => {
      console.error('Failed to exit fullscreen', err)
    })
  }

  function applyVolume(video: HTMLVideoElement, nextVolume: number) {
    const bounded = Math.min(1, Math.max(0, nextVolume))
    video.volume = bounded
    if (bounded === 0) video.muted = true
    else if (video.muted && bounded > 0) video.muted = false
    setVolume(video.volume)
    setMuted(video.muted)
    saveAudioSettings(video)
  }

  function toggleMute(video: HTMLVideoElement | null) {
    if (!video) return
    video.muted = !video.muted
    if (video.volume === 0 && !video.muted) video.volume = audioSettings.volume || 0.5
    setVolume(video.volume)
    setMuted(video.muted)
    saveAudioSettings(video)
  }

  function seek(video: HTMLVideoElement | null, offsetSeconds: number) {
    if (!video) return
    seekBy(video, offsetSeconds)
  }

  // A layout effect, so its cleanup runs while the video is still in the page: moving it out
  // then doesn't pause it.
  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host || !playlistUrl) return

    // Only one stream at a time.
    endDetached()

    const video = document.createElement('video')
    // Fills the pane, letterboxed to the video's own aspect ratio.
    video.className = 'h-full w-full object-contain'
    video.controls = false
    video.volume = audioSettings.volume
    video.muted = audioSettings.muted
    video.addEventListener('playing', () => setPlaying(true))
    video.addEventListener('volumechange', () => {
      setVolume(video.volume)
      setMuted(video.muted)
      saveAudioSettings(video)
    })
    videoRef.current = video
    host.appendChild(video)

    const teardown = attachStream(video, playlistUrl, startAt, setError)
    return () => {
      videoRef.current = null
      if (document.pictureInPictureElement === video) {
        keepPlayingDetached(video, teardown)
      } else {
        teardown()
        video.remove()
      }
    }
  }, [playlistUrl, startAt])

  useLayoutEffect(() => {
    const video = videoRef.current
    if (!video || !navigator.mediaSession) return

    const session = navigator.mediaSession
    const onPlaybackChange = () => {
      session.playbackState = video.paused ? 'paused' : 'playing'
    }
    const onPlay = () => play(video)
    const onPause = () => video.pause()
    const onSeekBackward = () => seekBy(video, -SEEK_BACKWARD_SECONDS)
    const onSeekForward = () => seekBy(video, SEEK_FORWARD_SECONDS)

    session.setActionHandler('play', onPlay)
    session.setActionHandler('pause', onPause)
    session.setActionHandler('seekbackward', onSeekBackward)
    session.setActionHandler('seekforward', onSeekForward)
    if (typeof navigator.mediaSession.setActionHandler === 'function') {
      const volumeActions = ['volumeup', 'volumedown'] as const
      for (const action of volumeActions) {
        try {
          const actionName = action as MediaSessionAction
          session.setActionHandler(actionName, () => {
            const delta = action === 'volumeup' ? 0.1 : -0.1
            const volume = Math.min(1, Math.max(0, video.volume + delta))
            video.volume = volume
            if (volume === 0) video.muted = true
            else if (video.muted && volume > 0) video.muted = false
          })
        } catch {
          // Some browsers omit unsupported Media Session actions; ignore them.
        }
      }
    }
    if (typeof MediaMetadata !== 'undefined') {
      session.metadata = new MediaMetadata({
        title: mediaTitle ?? tuningLabel ?? 'TabloWatcher',
        ...(mediaSubtitle ? { artist: mediaSubtitle } : {}),
      })
    }
    video.addEventListener('play', onPlaybackChange)
    video.addEventListener('pause', onPlaybackChange)
    onPlaybackChange()

    const teardown = () => {
      video.removeEventListener('play', onPlaybackChange)
      video.removeEventListener('pause', onPlaybackChange)
      session.setActionHandler('play', null)
      session.setActionHandler('pause', null)
      session.setActionHandler('seekbackward', null)
      session.setActionHandler('seekforward', null)
      for (const action of ['volumeup', 'volumedown'] as const) {
        try {
          session.setActionHandler(action as MediaSessionAction, null)
        } catch {
          // Ignore unsupported actions while cleaning up.
        }
      }
      session.metadata = null
      session.playbackState = 'none'
    }
    mediaSessionTeardowns.set(video, teardown)
    return () => {
      if (document.pictureInPictureElement === video || detached?.video === video) return
      mediaSessionTeardowns.delete(video)
      teardown()
    }
  }, [mediaTitle, mediaSubtitle, playlistUrl, startAt, tuningLabel])

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

  const currentVideo = videoRef.current
  const isMuted = currentVideo ? currentVideo.muted : muted
  const currentVolume = currentVideo ? currentVideo.volume : volume

  return (
    <div
      className={`group relative flex items-center justify-center ${className ?? ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {playlistUrl && <div ref={hostRef} className="h-full w-full" />}
      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 p-4 text-sm text-white/60">
          <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden />
          <span>{loadingMessage ?? `Tuning into ${tuningLabel}`}</span>
        </div>
      )}
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/75 via-black/30 to-transparent p-3 opacity-0 transition-opacity duration-150 ${hovered ? 'pointer-events-auto opacity-100' : ''}`}
      >
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="icon-sm"
            className="bg-black/35 text-white hover:bg-black/50"
            aria-label="Back 10 seconds"
            onClick={() => seek(videoRef.current, -SEEK_BACKWARD_SECONDS)}
          >
            <SkipBack className="size-4" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="icon-sm"
            className="bg-black/35 text-white hover:bg-black/50"
            aria-label={currentVideo?.paused ? 'Play' : 'Pause'}
            onClick={() => {
              const video = videoRef.current
              if (!video) return
              if (video.paused) play(video)
              else video.pause()
            }}
          >
            {currentVideo?.paused ? <Play className="size-4" /> : <Pause className="size-4" />}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="icon-sm"
            className="bg-black/35 text-white hover:bg-black/50"
            aria-label="Forward 30 seconds"
            onClick={() => seek(videoRef.current, SEEK_FORWARD_SECONDS)}
          >
            <SkipForward className="size-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={currentVolume}
            aria-label="Volume"
            className="h-1.5 w-20 accent-white"
            onChange={(event) => {
              const video = videoRef.current
              if (!video) return
              applyVolume(video, Number(event.target.value))
            }}
          />
          <Button
            type="button"
            variant="secondary"
            size="icon-sm"
            className="bg-black/35 text-white hover:bg-black/50"
            aria-label={isMuted ? 'Unmute' : 'Mute'}
            onClick={() => toggleMute(videoRef.current)}
          >
            {isMuted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="icon-sm"
            className="bg-black/35 text-white hover:bg-black/50"
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            onClick={toggleFullscreen}
          >
            {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </Button>
        </div>
      </div>
      {mediaTitle && (
        <div className={`pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/65 via-black/30 to-transparent px-3 pt-3 pb-8 opacity-0 transition-opacity duration-150 ${hovered ? 'opacity-100' : ''}`}>
          <div className="space-y-0.5 text-white drop-shadow-sm">
            <p className="text-sm font-medium leading-tight">{mediaTitle}</p>
            {mediaSubtitle && <p className="text-xs text-white/80">{mediaSubtitle}</p>}
          </div>
        </div>
      )}
    </div>
  )
}

// Starts playlistUrl playing in video; returns what stops it.
function attachStream(
  video: HTMLVideoElement,
  playlistUrl: string,
  startAt: number | undefined,
  setError: (error: string) => void,
): () => void {
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
  return () => {}
}
