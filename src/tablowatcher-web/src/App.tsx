import { useEffect, useState } from 'react'
import {
  CalendarClock,
  Disc3,
  Film,
  MonitorPlay,
  Search,
  Settings,
  Trophy,
  Tv,
  type LucideIcon,
} from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GuideGrid, type SelectedProgram, type WatchedChannel } from '@/components/GuideGrid'
import { LivePlayer } from '@/components/LivePlayer'
import { RecordButton } from '@/components/Recording'
import { ResizableSplit } from '@/components/ResizableSplit'
import { RecordingsPage } from '@/components/RecordingsPage'
import { ManualPage } from '@/components/ManualPage'
import { useGuideListings } from '@/hooks/useGuideListings'
import { APP_VERSION, useServerVersion } from '@/hooks/useServerVersion'
import { SearchPage } from '@/components/SearchPage'
import { SettingsPage } from '@/components/SettingsPage'
import { MoviesPage, SportsPage, TvShowsPage } from '@/components/UpcomingPages'
import { formatDuration } from '@/lib/format'

interface WeatherForecast {
  date: string
  temperatureC: number
  temperatureF: number
  summary: string | null
}

interface NavItem {
  label: string
  icon: LucideIcon
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Live TV', icon: Tv },
  { label: 'Recordings', icon: Disc3 },
  { label: 'Search', icon: Search },
  { label: 'TV Shows', icon: MonitorPlay },
  { label: 'Movies', icon: Film },
  { label: 'Sports', icon: Trophy },
  { label: 'Manual', icon: CalendarClock },
  { label: 'Settings', icon: Settings },
]

// Pages built from the guide's listings - only shown once the Tablo has returned some (see
// useGuideListings): hidden while the guide loads, and while it has none (no listings
// subscription).
const GUIDE_LISTING_NAV = new Set(['Search', 'TV Shows', 'Movies', 'Sports'])

// Pages that use the whole width of the main area rather than a narrow centered column.
const FULL_WIDTH_NAV = new Set(['Live TV', 'TV Shows', 'Movies', 'Sports', 'Recordings', 'Manual', 'Search', 'Settings'])

interface ChannelDetails {
  callSign: string
  name: string
  major: number
  minor: number
  network: string
  resolution: string
}

interface GuideChannel {
  objectId: number
  path: string
  channel: ChannelDetails
}

interface Recorder {
  serverid: string
  host: string
  name: string
  board: string
  serverVersion: string
  publicIp: string
  privateIp: string
  http: number | null
  slip: number | null
  lastSeen: string
  modified: string
  inserted: string
  relay: boolean
}

interface TunerAssignment {
  tunerNumber: number
  channelObjectId: number
}

// The subset of GET /api/movies/{id} the Live TV preview pane shows for a selected movie
// airing - description/cast/directors/runtime aren't in the guide grid response itself.
interface SelectedMovieInfo {
  moviePath: string
  description: string | null
  cast: string[]
  directors: string[]
  // Seconds.
  runtime: number | null
}

// How often to re-read the device's tuners, to pick up channels other Tablo clients or
// recordings have tuned.
const TUNERS_POLL_INTERVAL_MS = 15_000

// The server list and channel list are loaded once, but either can fail transiently (the
// association server rate-limits with 429s, or the service is mid-restart) - retry at this
// interval until they succeed, rather than leaving the guide without rows until a reload.
const LOAD_RETRY_INTERVAL_MS = 5_000

// Records each tuner as now showing its channel. A channel's label only goes away when its
// tuner is seen on a different channel - an idle tuner leaves the last label in place.
function assignTuners(current: Record<number, number>, assignments: TunerAssignment[]): Record<number, number> {
  const movedTuners = new Set(assignments.map((a) => a.tunerNumber))
  const next = Object.fromEntries(Object.entries(current).filter(([, tuner]) => !movedTuners.has(tuner)))
  for (const { tunerNumber, channelObjectId } of assignments) next[channelObjectId] = tunerNumber
  return next
}

function App() {
  const [forecasts, setForecasts] = useState<WeatherForecast[]>([])
  const [error, setError] = useState<string | null>(null)
  const [servers, setServers] = useState<Recorder[]>([])
  const [serversError, setServersError] = useState<string | null>(null)
  const [selectedServerId, setSelectedServerId] = useState('')
  const [selectedNav, setSelectedNav] = useState<string>(NAV_ITEMS[0].label)
  // Leaving a guide page for Live TV when it's hidden from under you.
  const hasListings = useGuideListings(() =>
    setSelectedNav((nav) => (GUIDE_LISTING_NAV.has(nav) ? NAV_ITEMS[0].label : nav)),
  )
  const serverVersion = useServerVersion()
  // This page came from one build and the server is running another - typically a service
  // still running an old binary after an upgrade replaced the files it serves.
  const serverVersionMismatch =
    APP_VERSION !== undefined &&
    (serverVersion === 'missing' || (serverVersion !== null && serverVersion.version !== APP_VERSION))
  const navItems = hasListings === true ? NAV_ITEMS : NAV_ITEMS.filter((item) => !GUIDE_LISTING_NAV.has(item.label))
  const [channels, setChannels] = useState<GuideChannel[]>([])
  const [channelsLoading, setChannelsLoading] = useState(false)
  const [channelsError, setChannelsError] = useState<string | null>(null)
  const [selectedProgram, setSelectedProgram] = useState<SelectedProgram | null>(null)
  const [movieInfo, setMovieInfo] = useState<SelectedMovieInfo | null>(null)
  const [watchedChannel, setWatchedChannel] = useState<WatchedChannel | null>(null)
  const [playlistUrl, setPlaylistUrl] = useState<string | null>(null)
  const [tuneError, setTuneError] = useState<string | null>(null)
  // Last known tuner per channel, from this app's own tunes and the device's tuner list.
  const [tunerByChannel, setTunerByChannel] = useState<Record<number, number>>({})

  useEffect(() => {
    let cancelled = false

    function load() {
      fetch('/api/watch/tuners')
        .then((res) => (res.ok ? (res.json() as Promise<TunerAssignment[]>) : null))
        .then((assignments) => {
          if (!cancelled && assignments) setTunerByChannel((current) => assignTuners(current, assignments))
        })
        .catch(() => {})
    }

    load()
    const interval = setInterval(load, TUNERS_POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    fetch('/api/weatherforecast')
      .then((res) => {
        if (!res.ok) throw new Error(`API returned ${res.status}`)
        return res.json() as Promise<WeatherForecast[]>
      })
      .then(setForecasts)
      .catch((err) => setError(err.message))
  }, [])

  useEffect(() => {
    let cancelled = false
    let retry: ReturnType<typeof setTimeout> | undefined

    function load() {
      fetch('/api/servers')
        .then((res) => {
          if (!res.ok) throw new Error(`API returned ${res.status}`)
          return res.json() as Promise<Recorder[]>
        })
        .then((data) => {
          if (cancelled) return
          setServers(data)
          setServersError(null)
          setSelectedServerId((current) => current || data[0]?.serverid || '')
        })
        .catch((err) => {
          if (cancelled) return
          setServersError(err.message)
          retry = setTimeout(load, LOAD_RETRY_INTERVAL_MS)
        })
    }

    load()

    return () => {
      cancelled = true
      clearTimeout(retry)
    }
  }, [])

  useEffect(() => {
    if (selectedNav !== 'Live TV') return

    const server = servers.find((s) => s.serverid === selectedServerId)
    if (!server) return

    // server.http (from the association server's cached record) can be stale; 8885 is the
    // Tablo device's actual local-API port.
    const query = `ip=${server.privateIp}&port=8885`
    let cancelled = false
    let retry: ReturnType<typeof setTimeout> | undefined
    setChannelsLoading(true)
    setChannelsError(null)

    function load() {
      fetch(`/api/guide-channels?${query}`)
        .then((res) => {
          if (!res.ok) throw new Error(`API returned ${res.status}`)
          return res.json() as Promise<string[]>
        })
        .then((paths) =>
          fetch(`/api/guide-channels?${query}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(paths),
          }),
        )
        .then((res) => {
          if (!res.ok) throw new Error(`API returned ${res.status}`)
          return res.json() as Promise<Record<string, GuideChannel>>
        })
        .then((data) => {
          const sorted = Object.values(data).sort(
            (a, b) => a.channel.major - b.channel.major || a.channel.minor - b.channel.minor,
          )
          if (cancelled) return
          setChannels(sorted)
          setChannelsError(null)
          setChannelsLoading(false)
        })
        .catch((err) => {
          if (cancelled) return
          // Stays "loading" while retrying; the error shows alongside so a persistent
          // failure is still visible.
          setChannelsError(err.message)
          retry = setTimeout(load, LOAD_RETRY_INTERVAL_MS)
        })
    }

    load()

    return () => {
      cancelled = true
      clearTimeout(retry)
    }
  }, [selectedNav, selectedServerId, servers])

  useEffect(() => {
    const moviePath = selectedProgram?.moviePath
    if (!moviePath) {
      setMovieInfo(null)
      return
    }

    let cancelled = false
    const movieId = moviePath.split('/').pop()

    fetch(`/api/movies/${movieId}`)
      .then((res) => {
        if (!res.ok) throw new Error(`API returned ${res.status}`)
        return res.json() as Promise<{ description: string | null; cast: string[]; directors: string[]; runtime: number | null }>
      })
      .then((d) => {
        if (cancelled) return
        setMovieInfo({ moviePath, description: d.description, cast: d.cast, directors: d.directors, runtime: d.runtime })
      })
      .catch(() => {
        if (!cancelled) setMovieInfo(null)
      })

    return () => {
      cancelled = true
    }
  }, [selectedProgram?.moviePath])

  useEffect(() => {
    const channelObjectId = watchedChannel?.objectId
    if (channelObjectId === undefined) return

    let cancelled = false
    setPlaylistUrl(null)
    setTuneError(null)

    fetch(`/api/watch/${channelObjectId}`, { method: 'POST' })
      .then((res) => {
        if (!res.ok) throw new Error(`API returned ${res.status}`)
        return res.json() as Promise<{ playlistUrl: string }>
      })
      .then((data) => {
        if (cancelled) return
        setPlaylistUrl(data.playlistUrl)

        // Separate call so playback isn't held up while the device reports the tuner.
        fetch(`/api/watch/${channelObjectId}/tuner`)
          .then((res) => (res.ok ? (res.json() as Promise<{ tunerNumber: number | null }>) : null))
          .then((tunerData) => {
            const tunerNumber = tunerData?.tunerNumber
            if (tunerNumber == null) return
            setTunerByChannel((current) => assignTuners(current, [{ tunerNumber, channelObjectId }]))
          })
          .catch(() => {})
      })
      .catch((err) => {
        if (!cancelled) setTuneError(err.message)
      })

    return () => {
      cancelled = true
    }
  }, [watchedChannel?.objectId])

  // The guide grid doesn't carry a movie's plot/cast/directors/runtime - only present
  // once `movieInfo` catches up with `selectedProgram` (see the effect above).
  const selectedMovieInfo = movieInfo?.moviePath === selectedProgram?.moviePath ? movieInfo : null
  const previewDescription = selectedProgram?.description ?? selectedMovieInfo?.description ?? null
  const previewMovieMeta = selectedMovieInfo
    ? [
        selectedMovieInfo.runtime ? formatDuration(selectedMovieInfo.runtime) : null,
        selectedMovieInfo.directors.length > 0
          ? `${selectedMovieInfo.directors.length === 1 ? 'Director' : 'Directors'}: ${selectedMovieInfo.directors.join(', ')}`
          : null,
        selectedMovieInfo.cast.length > 0 ? `Cast: ${selectedMovieInfo.cast.slice(0, 6).join(', ')}` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null

  return (
    <Tabs
      value={selectedServerId}
      onValueChange={setSelectedServerId}
      className="flex h-screen flex-col gap-0 bg-background"
    >
      <header className="flex items-center gap-4 border-b px-6 py-3">
        <div className="flex items-center gap-2 font-semibold">
          <img src="/favicon-32.png" alt="" className="size-5" />
          Tabloid
        </div>
        {servers.length > 0 && (
          <TabsList>
            {servers.map((server) => (
              <TabsTrigger key={server.serverid} value={server.serverid}>
                {server.name}
              </TabsTrigger>
            ))}
          </TabsList>
        )}
      </header>

      {serverVersionMismatch && (
        <Alert variant="destructive" className="rounded-none border-x-0 border-t-0">
          <AlertTitle>The server is running a different version</AlertTitle>
          <AlertDescription>
            This page is version {APP_VERSION}, but the server is running{' '}
            {serverVersion === 'missing' ? 'an older one' : (serverVersion?.version ?? 'another one')}, so newer pages
            won't work. Restart the tablowatcherservice service; if this stays, an older service unit may be overriding
            the package's (see the README).
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-1 overflow-hidden">
        <aside className="flex w-56 shrink-0 flex-col gap-1 overflow-y-auto border-r p-3">
          {navItems.map((item) => (
            <Button
              key={item.label}
              variant={selectedNav === item.label ? 'secondary' : 'ghost'}
              className="w-full justify-start gap-2"
              onClick={() => setSelectedNav(item.label)}
            >
              <item.icon className="size-4" />
              {item.label}
            </Button>
          ))}
          {serverVersion !== null && (
            <p
              className="text-muted-foreground mt-auto px-3 pt-4 text-xs"
              title={serverVersion !== 'missing' && serverVersion.commit ? `Commit ${serverVersion.commit}` : undefined}
            >
              {serverVersion === 'missing' ? 'Server version unknown' : `Version ${serverVersion.version}`}
            </p>
          )}
        </aside>

        <main
          className={
            FULL_WIDTH_NAV.has(selectedNav)
              ? 'flex-1 space-y-6 overflow-y-auto p-6'
              : 'mx-auto w-full max-w-2xl flex-1 space-y-6 overflow-y-auto p-6'
          }
        >
        {/* Kept mounted (just hidden) rather than unmounted when navigating away, so the
            live stream - and any native Picture-in-Picture window playing it - keeps
            running instead of being torn down with the rest of this page. */}
        <div className={selectedNav === 'Live TV' ? 'contents' : 'hidden'}>
          <ResizableSplit
            className="h-full"
            defaultTopRatio={1 / 2}
            top={
              <Card className="min-h-0 flex-1 flex-row overflow-hidden py-0">
                <div
                  className="relative flex w-1/3 shrink-0 flex-col gap-2 bg-cover bg-center pt-(--card-spacing)"
                  style={
                    selectedProgram?.backgroundImageUrl
                      ? { backgroundImage: `url(${selectedProgram.backgroundImageUrl})` }
                      : undefined
                  }
                >
                  {selectedProgram?.backgroundImageUrl && (
                    <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/50 to-black/20" />
                  )}
                  <CardHeader className="relative">
                    <CardTitle
                      className={`text-[2rem] leading-tight ${selectedProgram?.backgroundImageUrl ? 'text-white text-shadow-lg/60' : ''}`}
                    >
                      {selectedProgram ? selectedProgram.title : 'Live TV'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent
                    className={`relative space-y-1 text-sm ${selectedProgram?.backgroundImageUrl ? 'text-white/90 text-shadow-md/60' : 'text-muted-foreground'}`}
                  >
                    <p>
                      {selectedProgram
                        ? selectedProgram.subtitle
                        : channels.length > 0
                          ? `${channels.length} channels available`
                          : 'No channels loaded yet'}
                    </p>
                    {previewDescription && (
                      <p className="line-clamp-2 text-lg opacity-80" title={previewDescription}>
                        {previewDescription}
                      </p>
                    )}
                    {previewMovieMeta && (
                      <p className="line-clamp-2 text-xs opacity-70" title={previewMovieMeta}>
                        {previewMovieMeta}
                      </p>
                    )}
                  </CardContent>
                  {(selectedProgram?.thumbnailImageUrl || selectedProgram?.path) && (
                    // Takes whatever height is left under the text (so it never covers it) and
                    // grows as the preview pane is dragged taller. The poster sits on the left,
                    // the record button in the lower right.
                    <div className="relative flex min-h-0 flex-1 items-end justify-between gap-3 px-(--card-spacing) pt-3 pb-(--card-spacing)">
                      {selectedProgram?.thumbnailImageUrl ? (
                        <img
                          // Keyed so a poster that failed to load (404 - none on the device)
                          // doesn't stay hidden for the next selection.
                          key={selectedProgram.thumbnailImageUrl}
                          src={selectedProgram.thumbnailImageUrl}
                          alt=""
                          className="h-full max-h-60 w-auto rounded-md shadow-lg ring-1 ring-white/20"
                          onError={(e) => {
                            e.currentTarget.hidden = true
                          }}
                        />
                      ) : (
                        <div />
                      )}
                      {selectedProgram?.path && (
                        <RecordButton
                          key={selectedProgram.path}
                          path={selectedProgram.path}
                          schedule={selectedProgram.schedule}
                          onChanged={(updated) =>
                            setSelectedProgram((prev) =>
                              prev && prev.path === updated.path ? { ...prev, schedule: updated.schedule } : prev,
                            )
                          }
                        />
                      )}
                    </div>
                  )}
                </div>

                <div className="flex w-2/3 flex-1 items-center justify-center bg-black">
                  <LivePlayer
                    // Remount per channel so playback/error state starts fresh on each tune.
                    key={watchedChannel?.objectId}
                    playlistUrl={playlistUrl}
                    tuningLabel={watchedChannel?.tuningLabel ?? null}
                    mediaTitle={selectedProgram?.title ?? null}
                    mediaSubtitle={selectedProgram?.subtitle ?? null}
                    tuneError={tuneError}
                    className="h-full w-full"
                  />
                </div>
              </Card>
            }
            bottom={
              <Card className="min-h-0 flex-1 overflow-hidden">
                {channelsError && (
                  <Alert variant="destructive" className="m-4">
                    <AlertTitle>Couldn't reach the API</AlertTitle>
                    <AlertDescription>/api/guide-channels returned an error: {channelsError}</AlertDescription>
                  </Alert>
                )}
                {channelsLoading && <p className="text-muted-foreground p-4 text-sm">Loading channels…</p>}
                <GuideGrid
                  onSelect={setSelectedProgram}
                  onWatchChannel={setWatchedChannel}
                  tunerByChannel={tunerByChannel}
                  channels={channels}
                />
              </Card>
            }
          />
        </div>
        {selectedNav === 'Live TV' ? null : selectedNav === 'Search' ? (
          <SearchPage />
        ) : selectedNav === 'TV Shows' ? (
          <TvShowsPage />
        ) : selectedNav === 'Movies' ? (
          <MoviesPage />
        ) : selectedNav === 'Sports' ? (
          <SportsPage />
        ) : selectedNav === 'Recordings' ? (
          <RecordingsPage />
        ) : selectedNav === 'Manual' ? (
          <ManualPage />
        ) : selectedNav === 'Settings' ? (
          <SettingsPage />
        ) : (
          <>
        <Alert>
          <AlertTitle>Style preview</AlertTitle>
          <AlertDescription>
            This page exists to compare shadcn/ui presets against real components, not just plain text.
          </AlertDescription>
        </Alert>

        {error && (
          <Alert variant="destructive">
            <AlertTitle>Couldn't reach the API</AlertTitle>
            <AlertDescription>/api/weatherforecast returned an error: {error}</AlertDescription>
          </Alert>
        )}

        {serversError && (
          <Alert variant="destructive">
            <AlertTitle>Couldn't reach the API</AlertTitle>
            <AlertDescription>/api/servers returned an error: {serversError}</AlertDescription>
          </Alert>
        )}

        {servers.map((server) => (
          <TabsContent key={server.serverid} value={server.serverid}>
            <Card>
              <CardHeader>
                <CardTitle>{server.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Address</span>
                  <span>
                    {server.privateIp}
                    {server.http != null && `:${server.http}`}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Version</span>
                  <span>{server.serverVersion}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Last seen</span>
                  <span>{new Date(server.lastSeen).toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Relay</span>
                  <Badge variant={server.relay ? 'default' : 'secondary'}>
                    {server.relay ? 'Yes' : 'No'}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ))}

        <Tabs defaultValue="forecast">
          <TabsList>
            <TabsTrigger value="forecast">Forecast</TabsTrigger>
            <TabsTrigger value="devices">Devices</TabsTrigger>
          </TabsList>

          <TabsContent value="forecast" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Forecast</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {forecasts.map((f) => (
                  <div key={f.date} className="flex items-center justify-between text-sm">
                    <span>{f.date}</span>
                    <span className="flex items-center gap-2">
                      {f.temperatureC}&deg;C
                      <Badge variant="secondary">{f.summary}</Badge>
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="devices" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Known devices</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground text-sm">
                No Tablo devices have been added yet.
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Separator />

        <Card>
          <CardHeader>
            <CardTitle>Add a device</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="device-address">Device address</Label>
                <Input id="device-address" placeholder="192.168.1.42" />
              </div>
              <Button>Add</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Button variants</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Button>Default</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
              <Button variant="link">Link</Button>
            </div>
          </CardContent>
        </Card>
          </>
        )}
        </main>
      </div>
    </Tabs>
  )
}

export default App
