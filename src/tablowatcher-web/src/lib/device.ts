// Which Tablo this page is showing. The backend keeps every device's data separately and
// answers each /api request for the device it names - the X-Tablo-Device header, which
// installDeviceFetch adds to every fetch, or a `device` query parameter (withDevice) where
// no header can be sent, like an <img> src. A request naming no device (or one that's gone
// offline) gets the first online one. Kept per page rather than in a cookie, so two browser
// tabs can show different devices without crossing wires.

const HEADER = 'X-Tablo-Device'
const STORAGE_KEY = 'tablo-device'

let currentDevice = ''

/** Sets the device every later /api request from this page is for. Call before rendering anything that fetches. */
export function setCurrentDevice(serverId: string) {
  currentDevice = serverId
}

/**
 * Remembers a device the user picked, so a reload (or a new tab) comes back to it. Only on an
 * actual pick - not whenever a page renders - or two tabs on different devices would keep
 * overwriting each other's choice. Best-effort (private windows etc.).
 */
export function rememberDevice(serverId: string) {
  try {
    localStorage.setItem(STORAGE_KEY, serverId)
  } catch {
    // Not remembered - the first device is selected on reload instead.
  }
}

/** The device selected last time in this browser, or '' for none. */
export function rememberedDevice(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

/** An /api URL with the current device added, for requests that can't carry a header (img src, CSS url()). */
export function withDevice(url: string): string {
  if (!currentDevice) return url
  return `${url}${url.includes('?') ? '&' : '?'}device=${encodeURIComponent(currentDevice)}`
}

function isApiRequest(input: RequestInfo | URL): boolean {
  const url = new URL(input instanceof Request ? input.url : String(input), window.location.href)
  return url.origin === window.location.origin && url.pathname.startsWith('/api/')
}

/**
 * Adds the current device to every same-origin /api fetch. Done once, globally, rather than at
 * each of the dozens of call sites, so a new one can't forget it and quietly read another
 * device's data.
 */
export function installDeviceFetch() {
  const originalFetch = window.fetch.bind(window)
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (!currentDevice || !isApiRequest(input)) return originalFetch(input, init)
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    headers.set(HEADER, currentDevice)
    return originalFetch(input, { ...init, headers })
  }
}
