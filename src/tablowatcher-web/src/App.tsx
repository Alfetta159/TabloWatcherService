import { useEffect, useState } from 'react'
import './App.css'

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
    <main>
      <h1>TabloWatcherService</h1>
      <p>SPA is being served by ASP.NET Core, and the fetch below confirms the API is reachable.</p>
      {error && <p role="alert">Error calling /api/weatherforecast: {error}</p>}
      <ul>
        {forecasts.map((f) => (
          <li key={f.date}>
            {f.date}: {f.temperatureC}°C, {f.summary}
          </li>
        ))}
      </ul>
    </main>
  )
}

export default App
