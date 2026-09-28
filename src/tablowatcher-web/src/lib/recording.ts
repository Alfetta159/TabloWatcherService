import type { ChannelInfo } from '@/components/PosterGridPage'

// An airing's schedule as the API reports it (UpcomingResponses.Schedule on the server).
export interface AiringSchedule {
  // "none", "scheduled", "conflict", "skipped" - and possibly "conflicted"/"recording".
  state: string
  qualifier: string | null
  skipReason: string | null
  skipDetail: string | null
}

// One airing as a detail dialog lists it (UpcomingResponses.Airing on the server).
export interface ScheduledAiring {
  path: string
  datetime: string
  duration: number
  live: boolean
  isNew: boolean
  channel: ChannelInfo
  schedule: AiringSchedule | null
}

// e.g. "Sat, Oct 3 · 3:00 PM – 4:00 PM"
export function formatTimeRange(a: Pick<ScheduledAiring, 'datetime' | 'duration'>): string {
  const start = new Date(a.datetime)
  const end = new Date(start.getTime() + a.duration * 1000)
  const day = start.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
  const time = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return `${day} · ${time(start)} – ${time(end)}`
}

// What a card's pill shows: something will be recorded, or can't be for lack of a tuner.
export type RecordingState = 'scheduled' | 'conflict'

export function isConflict(schedule: AiringSchedule | null): boolean {
  return schedule?.state === 'conflict' || schedule?.state === 'conflicted'
}

export function isScheduled(schedule: AiringSchedule | null): boolean {
  return schedule?.state === 'scheduled' || schedule?.state === 'recording' || isConflict(schedule)
}

// Asks the Tablo (via the API) to record, or stop recording, one airing.
export async function setScheduled(path: string, scheduled: boolean): Promise<ScheduledAiring> {
  const res = await fetch('/api/airings/schedule', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, scheduled }),
  })
  if (!res.ok) throw new Error(res.status === 502 ? "The Tablo didn't respond - try again" : `API returned ${res.status}`)
  return res.json() as Promise<ScheduledAiring>
}

// The pill for a single airing, like the server's AiringSchedule.Summarize.
export function recordingStateOf(schedule: AiringSchedule | null): RecordingState | null {
  return isConflict(schedule) ? 'conflict' : isScheduled(schedule) ? 'scheduled' : null
}

// Stops (keeping what's recorded so far) or deletes one recording.
export async function postRecordingAction(action: 'stop' | 'delete', path: string): Promise<void> {
  const res = await fetch(`/api/recordings/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  })
  if (!res.ok) {
    const problem = (await res.json().catch(() => null)) as { detail?: string } | null
    throw new Error(problem?.detail ?? (res.status === 502 ? "The Tablo didn't respond - try again" : `API returned ${res.status}`))
  }
}
