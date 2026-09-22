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
import { GuideGrid } from '@/components/GuideGrid'

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
          <div className="flex h-full min-h-0 flex-col gap-4">
            <Card className="min-h-0 flex-1">
              <CardHeader>
                <CardTitle>Live TV</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground text-sm">
                {channels.length > 0 ? `${channels.length} channels available` : 'No channels loaded yet'}
              </CardContent>
            </Card>

            <Card className="min-h-0 flex-[3] overflow-hidden">
              {channelsError && (
                <Alert variant="destructive" className="m-4">
                  <AlertTitle>Couldn't reach the API</AlertTitle>
                  <AlertDescription>/api/guide-channels returned an error: {channelsError}</AlertDescription>
                </Alert>
              )}
              {channelsLoading && <p className="text-muted-foreground p-4 text-sm">Loading channels…</p>}
              <GuideGrid />
            </Card>
          </div>
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
