import { useCallback, useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from 'react'
import { CalendarClock, LoaderCircle, Plus } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ScheduleStatus } from '@/components/Recording'
import type { ChannelInfo } from '@/components/PosterGridPage'
import { useDeviceChannels } from '@/hooks/useDeviceChannels'
import { formatDuration } from '@/lib/format'
import type { AiringSchedule } from '@/lib/recording'

// GET /api/manual-recordings: a manual recording on the Tablo - a channel and time slot,
// once or on a weekly repeat (ManualRecordingsController.Item on the server).
interface ManualRecording {
  id: number
  path: string
  title: string
  channel: ChannelInfo | null
  repeating: boolean
  once: { year: number; month: number; day: number; hour: number; minute: number; timezone: string } | null
  recurring: { days: string[]; hour: number; minute: number; timezone: string } | null
  durationMinutes: number
  // Its next slot, once the server's guide cache has picked it up.
  nextAiring: { datetime: string; schedule: AiringSchedule | null } | null
}

// In the device's order and spelling (lowercase English), Sunday first.
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const WEEKDAYS = DAYS.slice(1, 6)
const WEEKEND = [DAYS[0], DAYS[6]]

// A Sunday, so DAYS[i] falls on day i - for the browser's own short day names.
const REFERENCE_SUNDAY = new Date(2026, 9, 4)

function dayName(day: string, weekday: 'short' | 'long' = 'short'): string {
  const date = new Date(REFERENCE_SUNDAY)
  date.setDate(date.getDate() + DAYS.indexOf(day))
  return date.toLocaleDateString([], { weekday })
}

function formatClockTime(hour: number, minute: number): string {
  return new Date(2026, 0, 1, hour, minute).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

// e.g. "Weekdays", "Sat, Sun", "Every day".
function describeDays(days: string[]): string {
  const set = new Set(days)
  if (set.size === 7) return 'Every day'
  if (set.size === 5 && WEEKDAYS.every((d) => set.has(d))) return 'Weekdays'
  if (set.size === 2 && WEEKEND.every((d) => set.has(d))) return 'Weekends'
  return DAYS.filter((d) => set.has(d)).map((d) => dayName(d)).join(', ')
}

// When it records: "Weekdays · 5:01 AM" or "Thu, Oct 8, 2026 · 3:00 AM", in the time zone it
// was set up in.
function describeWhen(r: ManualRecording): string {
  if (r.recurring) return `${describeDays(r.recurring.days)} · ${formatClockTime(r.recurring.hour, r.recurring.minute)}`
  if (r.once) {
    const date = new Date(r.once.year, r.once.month - 1, r.once.day)
    const day = date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    return `${day} · ${formatClockTime(r.once.hour, r.once.minute)}`
  }
  return ''
}

function formatNextAiring(datetime: string): string {
  return new Date(datetime).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function channelLabel(c: ChannelInfo): string {
  return `${c.major}.${c.minor} ${c.callSign}`
}

// An error response's message: the first validation error (ValidationProblem), or the status.
async function errorMessage(res: Response): Promise<string> {
  // The Tablo's embedded server sometimes drops a request outright, mostly while the server is
  // in the middle of a guide or recordings refresh.
  if (res.status === 502) return "The Tablo didn't answer. Try again in a moment."
  try {
    const body = (await res.json()) as { errors?: Record<string, string[]>; title?: string }
    const first = body.errors && Object.values(body.errors).flat()[0]
    if (first) return first
  } catch {
    // Not JSON - fall through to the status.
  }
  return `API returned ${res.status}`
}

function ManualRecordingCard({ recording, onOpen }: { recording: ManualRecording; onOpen: () => void }) {
  return (
    <Card
      role="button"
      tabIndex={0}
      className="hover:ring-primary/50 focus-visible:ring-primary cursor-pointer gap-1 p-4 text-sm transition-shadow outline-none hover:ring-2 focus-visible:ring-2"
      onClick={onOpen}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
    >
      <p className="line-clamp-2 font-medium leading-snug">{recording.title}</p>
      <p className="text-muted-foreground text-xs">{describeWhen(recording)}</p>
      <p className="text-muted-foreground text-xs">
        {[recording.channel && channelLabel(recording.channel), formatDuration(recording.durationMinutes * 60)]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {recording.nextAiring && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
          <span className="text-muted-foreground">Next: {formatNextAiring(recording.nextAiring.datetime)}</span>
          <ScheduleStatus schedule={recording.nextAiring.schedule} />
        </div>
      )}
    </Card>
  )
}

// Confirms and cancels one manual recording.
function CancelManualRecordingDialog({
  recording,
  onCancelled,
}: {
  recording: ManualRecording
  onCancelled: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function cancel() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/manual-recordings/${recording.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await errorMessage(res))
      onCancelled()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <DialogContent className="gap-4 sm:max-w-md">
      <div className="space-y-1 pr-8">
        <DialogTitle className="text-lg leading-tight font-semibold">{recording.title}</DialogTitle>
        <DialogDescription>
          {[describeWhen(recording), recording.channel && channelLabel(recording.channel), formatDuration(recording.durationMinutes * 60)]
            .filter(Boolean)
            .join(' · ')}
        </DialogDescription>
      </div>
      <p className="text-sm">
        Cancel this manual recording? {recording.repeating ? 'None of its upcoming slots will record.' : 'It won’t record.'}{' '}
        Anything it has already recorded stays on the Recordings page.
      </p>
      {error && <p className="text-destructive text-sm">Couldn't cancel it: {error}</p>}
      <div className="flex justify-end">
        <Button variant="destructive" onClick={cancel} disabled={busy}>
          {busy && <LoaderCircle className="size-4 animate-spin" />}
          Cancel recording
        </Button>
      </div>
    </DialogContent>
  )
}

// Today in the browser's time zone, as an <input type="date"> value.
function todayValue(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

// Sets up a manual recording: repeating on chosen days, or just once on a date.
function AddManualRecordingDialog({ onAdded }: { onAdded: () => void }) {
  const { channels, error: channelsError } = useDeviceChannels()
  const [repeating, setRepeating] = useState(false)
  const [title, setTitle] = useState('')
  const [channelId, setChannelId] = useState('')
  const [days, setDays] = useState<Set<string>>(() => new Set(WEEKDAYS))
  const [date, setDate] = useState(todayValue)
  const [time, setTime] = useState('')
  const [duration, setDuration] = useState('30')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleDay(day: string, checked: boolean) {
    setDays((current) => {
      const next = new Set(current)
      if (checked) next.add(day)
      else next.delete(day)
      return next
    })
  }

  const durationMinutes = Number(duration)
  const valid =
    title.trim() !== '' &&
    channelId !== '' &&
    /^\d{1,2}:\d{2}$/.test(time) &&
    Number.isInteger(durationMinutes) &&
    durationMinutes > 0 &&
    (repeating ? days.size > 0 : date !== '')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    const [hour, minute] = time.split(':').map(Number)
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/manual-recordings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          channelId: Number(channelId),
          repeating,
          date: repeating ? null : date,
          days: repeating ? DAYS.filter((d) => days.has(d)) : null,
          hour,
          minute,
          durationMinutes,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      })
      if (!res.ok) throw new Error(await errorMessage(res))
      onAdded()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <DialogContent className="sm:max-w-md">
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1 pr-8">
          <DialogTitle className="text-lg leading-tight font-semibold">Add a manual recording</DialogTitle>
          <DialogDescription>Record a channel at a set time, whatever the guide says is on.</DialogDescription>
        </div>

        <div className="flex items-center gap-2">
          <Switch id="manual-repeating" checked={repeating} onCheckedChange={setRepeating} />
          <Label htmlFor="manual-repeating">{repeating ? 'Repeating' : 'Just once'}</Label>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="manual-title">Title</Label>
          <Input id="manual-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Morning News" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="manual-channel">Channel</Label>
          <select
            id="manual-channel"
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            disabled={channels === null}
            className="border-input bg-background focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
          >
            <option value="">{channels === null && !channelsError ? 'Loading channels…' : 'Choose a channel'}</option>
            {channels?.map((c) => (
              <option key={c.objectId} value={String(c.objectId)}>
                {channelLabel(c)}
                {c.network && c.network !== c.callSign ? ` (${c.network})` : ''}
              </option>
            ))}
          </select>
          {channelsError && <p className="text-destructive text-xs">Couldn't load the channels: {channelsError}</p>}
        </div>

        {repeating ? (
          <fieldset className="space-y-1.5">
            <legend className="text-sm leading-none font-medium">Days</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1.5">
              {DAYS.map((day) => (
                <label key={day} className="flex items-center gap-1.5 text-sm" title={dayName(day, 'long')}>
                  <Checkbox
                    aria-label={dayName(day, 'long')}
                    checked={days.has(day)}
                    onCheckedChange={(checked) => toggleDay(day, checked)}
                  />
                  {dayName(day)}
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="manual-date">Date</Label>
            <Input id="manual-date" type="date" min={todayValue()} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        )}

        <div className="flex gap-4">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="manual-time">Starts at</Label>
            <Input id="manual-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="manual-duration">Duration (minutes)</Label>
            <Input
              id="manual-duration"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          </div>
        </div>

        {error && <p className="text-destructive text-sm">Couldn't add it: {error}</p>}

        <div className="flex justify-end">
          <Button type="submit" disabled={!valid || busy}>
            {busy && <LoaderCircle className="size-4 animate-spin" />}
            Add
          </Button>
        </div>
      </form>
    </DialogContent>
  )
}

// Manual recordings: set up a channel and time slot to record, and cancel ones already set up.
// What they record shows on the Recordings page's Manual tab.
export function ManualPage() {
  const [items, setItems] = useState<ManualRecording[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)
  // Bumped to re-read right away after an add or cancel.
  const [reloadToken, setReloadToken] = useState(0)
  const reload = useCallback(() => setReloadToken((t) => t + 1), [])

  useEffect(() => {
    let cancelled = false
    fetch('/api/manual-recordings')
      .then(async (res) => {
        if (!res.ok) throw new Error(await errorMessage(res))
        return res.json() as Promise<{ items: ManualRecording[] }>
      })
      .then((d) => {
        if (cancelled) return
        setItems(d.items)
        setError(null)
      })
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [reloadToken])

  const open = useMemo(() => items?.find((r) => r.id === openId) ?? null, [items, openId])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Button onClick={() => setAdding(true)}>
          <Plus className="size-4" />
          Add…
        </Button>
        {items && (
          <p className="text-muted-foreground text-sm">
            {items.length} manual recording{items.length === 1 ? '' : 's'}
          </p>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Couldn't reach the Tablo</AlertTitle>
          <AlertDescription>/api/manual-recordings returned an error: {error}</AlertDescription>
        </Alert>
      )}

      {items === null && !error && <p className="text-muted-foreground text-sm">Loading manual recordings…</p>}

      {items?.length === 0 && (
        <div className="text-muted-foreground flex flex-col items-center gap-2 py-12 text-center text-sm">
          <CalendarClock className="size-8" />
          No manual recordings yet. Use Add… to record a channel at a set time.
        </div>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-4">
        {items?.map((r) => <ManualRecordingCard key={r.id} recording={r} onOpen={() => setOpenId(r.id)} />)}
      </div>

      <Dialog open={adding} onOpenChange={setAdding}>
        {adding && (
          <AddManualRecordingDialog
            onAdded={() => {
              setAdding(false)
              reload()
            }}
          />
        )}
      </Dialog>

      <Dialog open={open !== null} onOpenChange={(isOpen) => !isOpen && setOpenId(null)}>
        {open !== null && (
          <CancelManualRecordingDialog
            key={open.id}
            recording={open}
            onCancelled={() => {
              setOpenId(null)
              reload()
            }}
          />
        )}
      </Dialog>
    </div>
  )
}
