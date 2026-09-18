import { useEffect, useState } from 'react'
import { Radio } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface WeatherForecast {
  date: string
  temperatureC: number
  temperatureF: number
  summary: string | null
}

function App() {
  const [forecasts, setForecasts] = useState<WeatherForecast[]>([])
  const [error, setError] = useState<string | null>(null)
  const [liveUpdates, setLiveUpdates] = useState(true)

  useEffect(() => {
    fetch('/api/weatherforecast')
      .then((res) => {
        if (!res.ok) throw new Error(`API returned ${res.status}`)
        return res.json() as Promise<WeatherForecast[]>
      })
      .then(setForecasts)
      .catch((err) => setError(err.message))
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-2 font-semibold">
          <Radio className="size-5 text-primary" />
          TabloWatcherService
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="live-updates" className="text-muted-foreground">
            Live updates
          </Label>
          <Switch id="live-updates" checked={liveUpdates} onCheckedChange={setLiveUpdates} />
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 p-6">
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
      </main>
    </div>
  )
}

export default App
