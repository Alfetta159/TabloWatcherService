import { useEffect, useState } from 'react'

// The version this SPA was built for: set by the API's BuildSpa target during `dotnet
// publish` (VITE_APP_VERSION), so it's the server's version too - unless the server is
// running a different build. Undefined under `npm run dev`.
export const APP_VERSION: string | undefined = import.meta.env.VITE_APP_VERSION || undefined

export interface ServerVersion {
  version: string
  commit: string | null
}

// GET /api/version, read once. `missing` means the server has no such endpoint - it's older
// than this page (from before versions were reported). Null while loading or unreachable.
export function useServerVersion(): ServerVersion | 'missing' | null {
  const [result, setResult] = useState<ServerVersion | 'missing' | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/version')
      .then(async (res): Promise<ServerVersion | 'missing'> => {
        if (res.status === 404) return 'missing'
        if (!res.ok) throw new Error(`API returned ${res.status}`)
        return (await res.json()) as ServerVersion
      })
      .then((v) => !cancelled && setResult(v))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  return result
}
