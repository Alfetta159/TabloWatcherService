import { useEffect, useState } from 'react'

// Like the guide pages: the server rebuilds its guide every 15 minutes, and this endpoint just
// reads that in-memory cache, so polling it is cheap. Until the first refresh lands, check back
// often.
const POLL_INTERVAL_MS = 60_000
const LOADING_POLL_INTERVAL_MS = 5_000

// Whether the Tablo's guide has listings (GET /api/guide/listings): false when it has none
// (no listings subscription), null until the server has read the guide or while the endpoint
// can't be reached. `onNoListings` runs on each poll that finds none.
export function useGuideListings(onNoListings?: () => void): boolean | null {
  const [hasListings, setHasListings] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    function load() {
      fetch('/api/guide/listings')
        .then((res) => {
          if (!res.ok) throw new Error(`API returned ${res.status}`)
          return res.json() as Promise<{ updatedAt: string | null; hasListings: boolean }>
        })
        .then((d) => {
          if (cancelled) return
          const known = d.updatedAt ? d.hasListings : null
          setHasListings(known)
          if (known === false) onNoListings?.()
          return d
        })
        // Keep the last answer; a blip shouldn't show or hide pages.
        .catch(() => undefined)
        .then((d) => {
          if (!cancelled) timer = setTimeout(load, d?.updatedAt ? POLL_INTERVAL_MS : LOADING_POLL_INTERVAL_MS)
        })
    }

    load()

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // onNoListings is a callback the caller needn't memoize; polling shouldn't restart for it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return hasListings
}
