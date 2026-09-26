import { useState } from 'react'
import { CircleDot, LoaderCircle, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  isScheduled,
  recordingStateOf,
  setScheduled,
  type AiringSchedule,
  type RecordingState,
  type ScheduledAiring,
} from '@/lib/recording'

export function RecordingPill({ state, className }: { state: RecordingState; className?: string }) {
  return state === 'conflict' ? (
    <Badge className={`gap-1 bg-amber-500 text-black shadow ${className ?? ''}`}>
      <TriangleAlert className="size-3" />
      Conflict
    </Badge>
  ) : (
    <Badge className={`gap-1 bg-red-600 text-white shadow ${className ?? ''}`}>
      <CircleDot className="size-3" />
      Scheduled
    </Badge>
  )
}

function formatTimeRange(a: ScheduledAiring): string {
  const start = new Date(a.datetime)
  const end = new Date(start.getTime() + a.duration * 1000)
  const day = start.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
  const time = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return `${day} · ${time(start)} – ${time(end)}`
}

function skipNote(schedule: AiringSchedule | null): string | null {
  if (schedule?.state !== 'skipped') return null
  if (schedule.skipDetail === 'already_recorded') return 'Skipped: already recorded'
  if (schedule.skipReason === 'duplicate') return 'Skipped: recording another airing'
  if (schedule.skipReason === 'channel') return 'Skipped: set to record on another channel'
  return 'Skipped'
}

// Records, or cancels the recording of, one airing - with a spinner while the Tablo answers
// and the error if it doesn't.
export function RecordButton({
  path,
  schedule,
  onChanged,
}: {
  path: string
  schedule: AiringSchedule | null
  onChanged: (updated: ScheduledAiring) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scheduled = isScheduled(schedule)

  function toggle() {
    setBusy(true)
    setError(null)
    setScheduled(path, !scheduled)
      .then(onChanged)
      .catch((err) => setError(err.message))
      .finally(() => setBusy(false))
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant={scheduled ? 'outline' : 'default'} size="sm" onClick={toggle} disabled={busy}>
        {busy ? <LoaderCircle className="size-4 animate-spin" /> : !scheduled && <CircleDot className="size-4" />}
        {scheduled ? 'Cancel recording' : 'Record'}
      </Button>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  )
}

// The pill for one airing's schedule (nothing if it isn't set to record), plus why a
// skipped airing won't be.
export function ScheduleStatus({ schedule }: { schedule: AiringSchedule | null }) {
  const state = recordingStateOf(schedule)
  const note = skipNote(schedule)
  return (
    <>
      {state && <RecordingPill state={state} />}
      {note && <span className="text-muted-foreground text-xs">{note}</span>}
    </>
  )
}

// One upcoming airing with its recording status and a Record / Cancel button.
export function AiringRow({ airing, onChanged }: { airing: ScheduledAiring; onChanged: (updated: ScheduledAiring) => void }) {
  const { major, minor, callSign } = airing.channel

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0 space-y-1">
        <p className="font-medium">{formatTimeRange(airing)}</p>
        <div className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
          <span>
            {major}.{minor} {callSign}
          </span>
          {airing.live && <Badge variant="outline">Live</Badge>}
          {airing.isNew && <Badge variant="outline">New</Badge>}
          <ScheduleStatus schedule={airing.schedule} />
        </div>
      </div>
      <RecordButton path={airing.path} schedule={airing.schedule} onChanged={onChanged} />
    </div>
  )
}
