import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { LoaderCircle, Star } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Section } from '@/components/DetailDialogs'
import { ScheduleStatus } from '@/components/Recording'
import { formatSize } from '@/lib/format'
import type { AiringSchedule } from '@/lib/recording'

// One airing as a channel lists it (ChannelsController.Program on the server).
interface ChannelProgram {
  path: string
  title: string
  episodeTitle: string | null
  datetime: string
  // Seconds.
  duration: number
  schedule: AiringSchedule | null
}

// "darkLarge" is a black logo, "lightLarge" a white one, "originalLarge" full colour.
interface ChannelLogo {
  kind: string
  url: string
}

// Full colour reads on any background; otherwise the black one, for this light UI.
const LOGO_PREFERENCE = ['originalLarge', 'darkLarge']

function logoUrl(logos: ChannelLogo[]): string | null {
  for (const kind of LOGO_PREFERENCE) {
    const logo = logos.find((l) => l.kind === kind)
    if (logo) return logo.url
  }
  return logos.find((l) => l.kind !== 'lightLarge')?.url ?? null
}

// GET /api/channels.
interface ChannelInfo {
  objectId: number
  path: string
  callSign: string
  name: string
  major: number
  minor: number
  network: string
  resolution: string
  flags: string[]
  favourite: boolean
  source: string
  callSignSource: string
  tmsStationId: string
  tmsAffiliateId: string
  channelIdentifier: string
  // Network logos on Tablo's CDN - most channels have none.
  logos: ChannelLogo[]
  onNow: ChannelProgram | null
  upNext: ChannelProgram[]
  upcomingAiringCount: number
  guideThrough: string | null
  scheduledCount: number
  recordingCount: number
  recordingsSize: number
  lastRecordedAt: string | null
}

interface ChannelsResponse {
  guideUpdatedAt: string | null
  recordingsUpdatedAt: string | null
  channels: ChannelInfo[]
}

const number = (c: ChannelInfo) => `${c.major}.${c.minor}`

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// "hd_1080" -> "HD 1080", "sd" -> "SD".
function formatResolution(resolution: string): string {
  return resolution.replace(/_/g, ' ').toUpperCase()
}

// The device's channel flags, as seen on real devices; anything else shows as-is.
const FLAG_LABELS: Record<string, string> = { mpeg4: 'MPEG-4', mpeg2: 'MPEG-2', canRecord: 'Recordable' }

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </>
  )
}

export function ChannelsTab() {
  const [response, setResponse] = useState<ChannelsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [filter, setFilter] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)

  // Read once per visit (and on Retry) rather than polled: the channel list comes live from
  // the device's /batch, which the guide and recordings refreshes are already queued on.
  useEffect(() => {
    let cancelled = false
    fetch('/api/channels')
      .then((res) => {
        if (!res.ok) throw new Error(`API returned ${res.status}`)
        return res.json() as Promise<ChannelsResponse>
      })
      .then((d) => {
        if (cancelled) return
        setResponse(d)
        setError(null)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [reloadToken])

  const visible = useMemo(() => {
    const channels = response?.channels ?? []
    const q = filter.trim().toLowerCase()
    if (!q) return channels
    return channels.filter((c) =>
      [number(c), c.callSign, c.name, c.network].some((field) => field.toLowerCase().includes(q)),
    )
  }, [response, filter])

  // The first channel until one is picked.
  const selected = response?.channels.find((c) => c.objectId === selectedId) ?? response?.channels[0] ?? null

  if (error && !response) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Couldn't read the channels</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>/api/channels returned an error: {error}</p>
          <Button variant="outline" size="sm" onClick={() => setReloadToken((t) => t + 1)}>
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  if (!response) {
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <LoaderCircle className="size-4 animate-spin" />
        Loading channels…
      </p>
    )
  }

  if (response.channels.length === 0) {
    return <p className="text-muted-foreground text-sm">The Tablo has no channels. Run a channel scan on the device.</p>
  }

  return (
    <div className="grid grid-cols-5 items-start gap-6">
      <Card className="col-span-2 min-w-0 gap-3">
        <CardHeader className="space-y-3">
          <CardTitle>
            {response.channels.length} channel{response.channels.length === 1 ? '' : 's'}
          </CardTitle>
          <Input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by number, call sign or network"
            aria-label="Filter channels"
          />
        </CardHeader>
        <CardContent className="px-3">
          {visible.length === 0 ? (
            <p className="text-muted-foreground px-3 text-sm">No channels match "{filter.trim()}".</p>
          ) : (
            <ul className="space-y-0.5">
              {visible.map((c) => (
                <li key={c.objectId}>
                  <button
                    type="button"
                    className={`hover:bg-accent/60 flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm ${selected?.objectId === c.objectId ? 'bg-accent' : ''}`}
                    onClick={() => setSelectedId(c.objectId)}
                    aria-pressed={selected?.objectId === c.objectId}
                  >
                    <span className="w-12 shrink-0 font-medium tabular-nums">{number(c)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{c.callSign}</span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {c.onNow ? c.onNow.title : c.network || c.name}
                      </span>
                    </span>
                    {c.favourite && <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-400" aria-label="Favorite" />}
                    {c.resolution && (
                      <Badge variant="outline" className="shrink-0">
                        {formatResolution(c.resolution)}
                      </Badge>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {selected && (
        <ChannelDetail channel={selected} guideLoaded={response.guideUpdatedAt !== null} recordingsLoaded={response.recordingsUpdatedAt !== null} />
      )}
    </div>
  )
}

function ChannelDetail({
  channel: c,
  guideLoaded,
  recordingsLoaded,
}: {
  channel: ChannelInfo
  guideLoaded: boolean
  recordingsLoaded: boolean
}) {
  const identifiers = [
    ['Source', c.source === 'ota' ? 'Antenna (OTA)' : c.source],
    ['Call sign source', c.callSignSource],
    ['TMS station ID', c.tmsStationId],
    ['TMS affiliate ID', c.tmsAffiliateId],
    ['Channel identifier', c.channelIdentifier],
    ['Tablo path', c.path],
  ].filter(([, value]) => value)
  const logo = logoUrl(c.logos)
  // A logo that fails to load is hidden rather than shown broken.
  const [failedLogo, setFailedLogo] = useState<string | null>(null)

  return (
    // Stays in view while a long channel list scrolls.
    <Card className="sticky top-0 col-span-3 min-w-0">
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          {logo && failedLogo !== logo && (
            <img
              src={logo}
              alt={`${c.network || c.callSign} logo`}
              className="h-12 w-20 shrink-0 object-contain"
              onError={() => setFailedLogo(logo)}
            />
          )}
          <div className="min-w-0 flex-1">
            <CardTitle className="text-2xl">
              {number(c)} {c.callSign}
            </CardTitle>
            <p className="text-muted-foreground text-sm">
              {[c.network, c.name !== c.callSign ? c.name : null].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
            {c.favourite && (
              <Badge className="gap-1 bg-amber-400 text-black">
                <Star className="size-3 fill-current" />
                Favorite
              </Badge>
            )}
            {c.resolution && <Badge variant="outline">{formatResolution(c.resolution)}</Badge>}
            {c.flags.map((f) => (
              <Badge key={f} variant="secondary">
                {FLAG_LABELS[f] ?? f}
              </Badge>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 text-sm">
        {!guideLoaded ? (
          <p className="text-muted-foreground">The guide is still loading - what's on will show once it has.</p>
        ) : (
          <>
            <Section title="On now">
              {c.onNow ? <ProgramRow program={c.onNow} /> : <p className="text-muted-foreground">Nothing in the guide.</p>}
            </Section>
            {c.upNext.length > 0 && (
              <Section title="Up next">
                <div className="divide-y">
                  {c.upNext.map((p) => (
                    <ProgramRow key={p.path} program={p} />
                  ))}
                </div>
              </Section>
            )}
          </>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <Section title="Guide">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <Stat label="Upcoming airings" value={guideLoaded ? c.upcomingAiringCount : '…'} />
              <Stat label="Guide runs through" value={c.guideThrough ? formatDateTime(c.guideThrough) : '—'} />
              <Stat label="Set to record" value={guideLoaded ? c.scheduledCount : '…'} />
            </dl>
          </Section>
          <Section title="Recordings">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <Stat label="Recordings" value={recordingsLoaded ? c.recordingCount : '…'} />
              <Stat label="Space used" value={recordingsLoaded ? (c.recordingsSize > 0 ? formatSize(c.recordingsSize) : '—') : '…'} />
              <Stat
                label="Last recorded"
                value={c.lastRecordedAt ? new Date(c.lastRecordedAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
              />
            </dl>
          </Section>
        </div>

        {identifiers.length > 0 && (
          <Section title="Identifiers">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              {identifiers.map(([label, value]) => (
                <Stat key={label} label={label} value={<span className="font-mono text-xs break-all">{value}</span>} />
              ))}
            </dl>
          </Section>
        )}
      </CardContent>
    </Card>
  )
}

function ProgramRow({ program: p }: { program: ChannelProgram }) {
  const end = new Date(new Date(p.datetime).getTime() + p.duration * 1000).toISOString()
  return (
    <div className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="font-medium">{p.title}</p>
        {p.episodeTitle && <p className="text-muted-foreground truncate">{p.episodeTitle}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-muted-foreground tabular-nums">
          {formatTime(p.datetime)} – {formatTime(end)}
        </span>
        <div className="flex items-center gap-1.5">
          <ScheduleStatus schedule={p.schedule} />
        </div>
      </div>
    </div>
  )
}
