import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface WeatherForecast {
  date: string
  temperatureC: number
  temperatureF: number
  summary: string | null
}

function App() {
  const [forecasts, setForecasts] = useState<WeatherForecast[]>([])
  const [error, setError] = useState<string | null>(null)

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
    <main className="mx-auto max-w-xl space-y-6 p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">TabloWatcherService</h1>
        <p className="text-muted-foreground text-sm">
          SPA served by ASP.NET Core - the card below confirms the API is reachable.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          Error calling /api/weatherforecast: {error}
        </p>
      )}

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
    </main>
  )
}

export default App
