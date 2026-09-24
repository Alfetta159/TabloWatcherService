import { useEffect, useState } from 'react'
import {
  CalendarClock,
  Clock,
  Disc3,
  Film,
  MonitorPlay,
  Radio,
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
import { ResizableSplit } from '@/components/ResizableSplit'

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
  { label: 'Prime Time', icon: Clock },
  { label: 'TV Shows', icon: MonitorPlay },
  { label: 'Movies', icon: Film },
  { label: 'Sports', icon: Trophy },
  { label: 'Scheduled', icon: CalendarClock },
  { label: 'Recordings', icon: Disc3 },
  { label: 'Settings', icon: Settings },
]

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
  http: number
  slip: number
  lastSeen: string
  modified: string
  inserted: string
  relay: boolean
}

interface TunerAssignment {
  tunerNumber: number
  channelObjectId: number
}

// How often to re-read the device's tuners, to pick up channels other Tablo clients or
// recordings have tuned.
const TUNERS_POLL_INTERVAL_MS = 15_000

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
  const [channels, setChannels] = useState<GuideChannel[]>([])
  const [channelsLoading, setChannelsLoading] = useState(false)
  const [channelsError, setChannelsError] = useState<string | null>(null)
  const [selectedProgram, setSelectedProgram] = useState<SelectedProgram | null>(null)
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
    fetch('/api/servers')
      .then((res) => {
        if (!res.ok) throw new Error(`API returned ${res.status}`)
        return res.json() as Promise<Recorder[]>
      })
      .then((data) => {
        setServers(data)
        setSelectedServerId((current) => current || data[0]?.serverid || '')
      })
      .catch((err) => setServersError(err.message))
  }, [])

  useEffect(() => {
    if (selectedNav !== 'Live TV') return

    const server = servers.find((s) => s.serverid === selectedServerId)
    if (!server) return

    // server.http (from the association server's cached record) can be stale; 8885 is the
    // Tablo device's actual local-API port.
    const query = `ip=${server.privateIp}&port=8885`
    setChannelsLoading(true)
    setChannelsError(null)

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
        setChannels(sorted)
      })
      .catch((err) => setChannelsError(err.message))
      .finally(() => setChannelsLoading(false))
  }, [selectedNav, selectedServerId, servers])

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

  return (
    <Tabs
      value={selectedServerId}
      onValueChange={setSelectedServerId}
      className="flex h-screen flex-col gap-0 bg-background"
    >
      <header className="flex items-center gap-4 border-b px-6 py-3">
        <div className="flex items-center gap-2 font-semibold">
          <Radio className="size-5 text-primary" />
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

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-56 shrink-0 space-y-1 overflow-y-auto border-r p-3">
          {NAV_ITEMS.map((item) => (
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
        </aside>

        <main
          className={
            selectedNav === 'Live TV'
              ? 'flex-1 space-y-6 overflow-y-auto p-6'
              : 'mx-auto w-full max-w-2xl flex-1 space-y-6 overflow-y-auto p-6'
          }
        >
        {selectedNav === 'Live TV' ? (
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
                    {selectedProgram?.description && (
                      <p className="line-clamp-2 text-2xl opacity-80">{selectedProgram.description}</p>
                    )}
                  </CardContent>
                  {selectedProgram?.thumbnailImageUrl && (
                    // Takes whatever height is left under the text (so it never covers it) and
                    // grows as the preview pane is dragged taller.
                    <div className="relative flex min-h-0 flex-1 items-end px-(--card-spacing) pt-3 pb-(--card-spacing)">
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
                    </div>
                  )}
                </div>

                <div className="flex w-2/3 flex-1 items-center justify-center bg-black">
                  <LivePlayer
                    // Remount per channel so playback/error state starts fresh on each tune.
                    key={watchedChannel?.objectId}
                    playlistUrl={playlistUrl}
                    tuningLabel={watchedChannel?.tuningLabel ?? null}
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
                    {server.privateIp}:{server.http}
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
