import { useState } from 'react'
import { CircleDot, LoaderCircle, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  isConflict,
  isScheduled,
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

// One upcoming airing with its recording status and a Record / Cancel button.
export function AiringRow({ airing, onChanged }: { airing: ScheduledAiring; onChanged: (updated: ScheduledAiring) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scheduled = isScheduled(airing.schedule)
  const note = skipNote(airing.schedule)
  const { major, minor, callSign } = airing.channel

  function toggle() {
    setBusy(true)
    setError(null)
    setScheduled(airing.path, !scheduled)
      .then(onChanged)
      .catch((err) => setError(err.message))
      .finally(() => setBusy(false))
  }

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
          {isConflict(airing.schedule) ? (
            <RecordingPill state="conflict" />
          ) : (
            scheduled && <RecordingPill state="scheduled" />
          )}
          {note && <span>{note}</span>}
        </div>
        {error && <p className="text-destructive text-xs">{error}</p>}
      </div>
      <Button variant={scheduled ? 'outline' : 'default'} size="sm" onClick={toggle} disabled={busy}>
        {busy ? <LoaderCircle className="size-4 animate-spin" /> : !scheduled && <CircleDot className="size-4" />}
        {scheduled ? 'Cancel recording' : 'Record'}
      </Button>
    </div>
  )
}
