import { useEffect, useState } from 'react'
import type { ChannelInfo } from '@/components/PosterGridPage'

// One request shared by every dropdown on screen (the server caches the device's list too).
// A failed request isn't kept, so the next dropdown to open tries again.
let pending: Promise<ChannelInfo[]> | null = null

function loadChannels(): Promise<ChannelInfo[]> {
  pending ??= fetch('/api/channels/list')
    .then((res) => {
      if (!res.ok) throw new Error(`API returned ${res.status}`)
      return res.json() as Promise<ChannelInfo[]>
    })
    .catch((err) => {
      pending = null
      throw err
    })
  return pending
}

// The Tablo's channels by number (GET /api/channels/list) - read from the device's own channel
// list, never from the guide's airings, so channels with nothing in the guide still appear.
// Null until loaded; `error` if they couldn't be read.
export function useDeviceChannels(): { channels: ChannelInfo[] | null; error: string | null } {
  const [channels, setChannels] = useState<ChannelInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    loadChannels()
      .then((c) => !cancelled && setChannels(c))
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [])

  return { channels, error }
}
