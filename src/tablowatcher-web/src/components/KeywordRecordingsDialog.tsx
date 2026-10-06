import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { ArrowLeft, LoaderCircle, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScheduleStatus } from '@/components/Recording'
import type { ChannelInfo } from '@/components/PosterGridPage'
import type { AiringSchedule } from '@/lib/recording'

// GET /api/keyword-recordings: a saved keyword recording (KeywordRecordingsController.Summary).
interface KeywordRecording {
  id: string
  name: string
  director: string | null
  actor: string | null
  titleContains: string | null
  titleExcludes: string | null
  plotContains: string | null
  plotExcludes: string | null
  descriptionContains: string | null
  descriptionExcludes: string | null
  createdAt: string
  // Upcoming airings it matches, whoever set them to record.
  matchCount: number
  // Upcoming airings it scheduled itself that are still set to record.
  scheduledCount: number
}

// One match in a preview (ScheduleResponses.Item).
interface MatchItem {
  key: string
  title: string
  subtitle: string | null
  datetime: string
  channel: ChannelInfo
  schedule: AiringSchedule | null
}

interface Criteria {
  director: string
  actor: string
  titleContains: string
  titleExcludes: string
  plotContains: string
  plotExcludes: string
  descriptionContains: string
  descriptionExcludes: string
}

const EMPTY_CRITERIA: Criteria = {
  director: '',
  actor: '',
  titleContains: '',
  titleExcludes: '',
  plotContains: '',
  plotExcludes: '',
  descriptionContains: '',
  descriptionExcludes: '',
}

// Same rule as the server: something to look for, not just something to leave out.
function hasPositiveCondition(c: Criteria): boolean {
  return [c.director, c.actor, c.titleContains, c.plotContains, c.descriptionContains].some((v) => v.trim() !== '')
}

// e.g. "Director is Ridley Scott · Actor is Sigourney Weaver · Title has “alien”".
function describeConditions(
  r: Pick<
    KeywordRecording,
    'director' | 'actor' | 'titleContains' | 'titleExcludes' | 'plotContains' | 'plotExcludes' | 'descriptionContains' | 'descriptionExcludes'
  >,
): string {
  return [
    r.director && `Director is ${r.director}`,
    r.actor && `Actor is ${r.actor}`,
    r.titleContains && `Title has “${r.titleContains}”`,
    r.titleExcludes && `Title doesn't have “${r.titleExcludes}”`,
    r.plotContains && `Plot has “${r.plotContains}”`,
    r.plotExcludes && `Plot doesn't have “${r.plotExcludes}”`,
    r.descriptionContains && `Description has “${r.descriptionContains}”`,
    r.descriptionExcludes && `Description doesn't have “${r.descriptionExcludes}”`,
  ]
    .filter(Boolean)
    .join(' · ')
}

function formatAiring(item: MatchItem): string {
  const when = new Date(item.datetime).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  return `${when} · ${item.channel.major}.${item.channel.minor} ${item.channel.callSign}`
}

// An error response's message: the first validation error (ValidationProblem), or the status.
async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { errors?: Record<string, string[]> }
    const first = body.errors && Object.values(body.errors).flat()[0]
    if (first) return first
  } catch {
    // Not JSON - fall through to the status.
  }
  return `API returned ${res.status}`
}

// The form: conditions, a live preview of what they match, and Save.
function NewKeywordRecording({ onSaved, onBack }: { onSaved: (scheduled: number) => void; onBack: () => void }) {
  const [criteria, setCriteria] = useState<Criteria>(EMPTY_CRITERIA)
  const [name, setName] = useState('')
  const [preview, setPreview] = useState<{ count: number; items: MatchItem[] } | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ready = hasPositiveCondition(criteria)

  // Re-previewed a moment after typing stops.
  useEffect(() => {
    if (!ready) return
    let cancelled = false
    const timer = setTimeout(() => {
      setPreviewing(true)
      fetch('/api/keyword-recordings/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(criteria),
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(await errorMessage(res))
          return res.json() as Promise<{ count: number; items: MatchItem[] }>
        })
        .then((p) => {
          if (cancelled) return
          setPreview(p)
          setError(null)
        })
        .catch((err) => !cancelled && setError(err.message))
        .finally(() => !cancelled && setPreviewing(false))
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [criteria, ready])

  function field(key: keyof Criteria) {
    return {
      id: `keyword-${key}`,
      value: criteria[key],
      maxLength: 100,
      onChange: (e: ChangeEvent<HTMLInputElement>) => setCriteria((c) => ({ ...c, [key]: e.target.value })),
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/keyword-recordings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...criteria, name }),
      })
      if (!res.ok) throw new Error(await errorMessage(res))
      const body = (await res.json()) as { scheduled: number }
      onSaved(body.scheduled)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex items-start gap-2 pr-8">
        <Button type="button" variant="ghost" size="icon" className="-ml-2 shrink-0" onClick={onBack} aria-label="Back">
          <ArrowLeft className="size-4" />
        </Button>
        <div className="space-y-1">
          <DialogTitle className="text-lg leading-tight font-semibold">New keyword recording</DialogTitle>
          <DialogDescription>
            Records every upcoming airing that meets all of these, now and whenever the guide updates.
          </DialogDescription>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="keyword-director">Director is</Label>
          <Input {...field('director')} placeholder="Full name" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="keyword-actor">An actor is</Label>
          <Input {...field('actor')} placeholder="Full name" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="keyword-titleContains">Title contains</Label>
          <Input {...field('titleContains')} placeholder="A word or phrase" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="keyword-titleExcludes">Title doesn't contain</Label>
          <Input {...field('titleExcludes')} placeholder="A word or phrase" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="keyword-plotContains">Plot contains</Label>
          <Input {...field('plotContains')} placeholder="A word or phrase" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="keyword-plotExcludes">Plot doesn't contain</Label>
          <Input {...field('plotExcludes')} placeholder="A word or phrase" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="keyword-descriptionContains">Description contains</Label>
          <Input {...field('descriptionContains')} placeholder="A word or phrase" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="keyword-descriptionExcludes">Description doesn't contain</Label>
          <Input {...field('descriptionExcludes')} placeholder="A word or phrase" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="keyword-name">Name (optional)</Label>
        <Input
          id="keyword-name"
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
          placeholder="Named after its conditions if left blank"
        />
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-md border p-3 text-sm">
        {!ready ? (
          <p className="text-muted-foreground">
            Enter a director, an actor, a title, a plot or words the description contains to see what it matches.
          </p>
        ) : !preview ? (
          <p className="text-muted-foreground flex items-center gap-2">
            <LoaderCircle className="size-4 animate-spin" /> Checking the guide…
          </p>
        ) : (
          <>
            <p className="flex items-center gap-2 font-medium">
              {preview.count === 0
                ? 'Nothing upcoming matches yet - it will record matches as they appear in the guide.'
                : `${preview.count} upcoming airing${preview.count === 1 ? '' : 's'} match`}
              {previewing && <LoaderCircle className="text-muted-foreground size-3.5 animate-spin" />}
            </p>
            <ul className="space-y-1.5">
              {preview.items.map((item) => (
                <li key={item.key} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                  <span className="min-w-0">
                    <span className="font-medium">{item.title}</span>
                    {item.subtitle && <span className="text-muted-foreground"> · {item.subtitle}</span>}
                    <span className="text-muted-foreground block text-xs">{formatAiring(item)}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <ScheduleStatus schedule={item.schedule} />
                  </span>
                </li>
              ))}
            </ul>
            {preview.count > preview.items.length && (
              <p className="text-muted-foreground text-xs">…and {preview.count - preview.items.length} more.</p>
            )}
          </>
        )}
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <div className="flex justify-end">
        <Button type="submit" disabled={!ready || busy}>
          {busy && <LoaderCircle className="size-4 animate-spin" />}
          Save and record matches
        </Button>
      </div>
    </form>
  )
}

// One saved keyword recording, with Delete (and a confirmation offering to cancel what it scheduled).
function KeywordRecordingRow({ recording, onDeleted }: { recording: KeywordRecording; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const [cancelScheduled, setCancelScheduled] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      const params = new URLSearchParams({ cancelScheduled: String(cancelScheduled && recording.scheduledCount > 0) })
      const res = await fetch(`/api/keyword-recordings/${recording.id}?${params}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await errorMessage(res))
      onDeleted()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <li className="space-y-2 rounded-md border p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <p className="font-medium">{recording.name}</p>
          <p className="text-muted-foreground text-xs">{describeConditions(recording)}</p>
          <p className="text-muted-foreground text-xs">
            {recording.matchCount} upcoming match{recording.matchCount === 1 ? '' : 'es'} · {recording.scheduledCount} set to
            record by it
          </p>
        </div>
        {!confirming && (
          <Button variant="ghost" size="icon" onClick={() => setConfirming(true)} aria-label={`Delete ${recording.name}`}>
            <Trash2 className="size-4" />
          </Button>
        )}
      </div>
      {confirming && (
        <div className="bg-muted/60 space-y-2 rounded-md p-2">
          <p>Delete this keyword recording? It won't schedule anything new.</p>
          {recording.scheduledCount > 0 && (
            <label className="flex items-center gap-2">
              <Checkbox checked={cancelScheduled} onCheckedChange={setCancelScheduled} disabled={busy} />
              Also cancel the {recording.scheduledCount} upcoming recording{recording.scheduledCount === 1 ? '' : 's'} it set up
            </label>
          )}
          {error && <p className="text-destructive">Couldn't delete it: {error}</p>}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
              Keep it
            </Button>
            <Button size="sm" variant="destructive" onClick={remove} disabled={busy}>
              {busy && <LoaderCircle className="size-4 animate-spin" />}
              Delete
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}

// Keyword recordings: the saved ones (each deletable), and a form for a new one.
// `onChanged` tells the Search page to re-run its search, since recording states changed.
export function KeywordRecordingsDialog({ onChanged }: { onChanged: () => void }) {
  const [items, setItems] = useState<KeywordRecording[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const reload = useCallback(() => setReloadToken((t) => t + 1), [])

  useEffect(() => {
    let cancelled = false
    fetch('/api/keyword-recordings')
      .then(async (res) => {
        if (!res.ok) throw new Error(await errorMessage(res))
        return res.json() as Promise<{ items: KeywordRecording[] }>
      })
      .then((d) => {
        if (cancelled) return
        setItems(d.items)
        setError(null)
        // Nothing saved yet: go straight to the form.
        if (d.items.length === 0 && reloadToken === 0) setCreating(true)
      })
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [reloadToken])

  return (
    <DialogContent className="flex max-h-[85vh] flex-col gap-4 sm:max-w-2xl">
      {creating ? (
        <NewKeywordRecording
          onBack={() => setCreating(false)}
          onSaved={(scheduled) => {
            setCreating(false)
            setNotice(
              scheduled === 0
                ? 'Saved. Nothing new needed scheduling yet.'
                : `Saved, and set ${scheduled} airing${scheduled === 1 ? '' : 's'} to record.`,
            )
            reload()
            onChanged()
          }}
        />
      ) : (
        <>
          <div className="space-y-1 pr-8">
            <DialogTitle className="text-lg leading-tight font-semibold">Keyword recordings</DialogTitle>
            <DialogDescription>
              Each one records every upcoming airing that matches it, checked again whenever the guide updates. Cancelling one
              of its airings sticks.
            </DialogDescription>
          </div>

          <div className="flex items-center justify-between gap-3">
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="size-4" />
              New keyword recording
            </Button>
            {notice && <p className="text-muted-foreground text-sm">{notice}</p>}
          </div>

          {error && <p className="text-destructive text-sm">Couldn't load keyword recordings: {error}</p>}
          {items === null && !error && <p className="text-muted-foreground text-sm">Loading…</p>}
          {items?.length === 0 && <p className="text-muted-foreground text-sm">No keyword recordings yet.</p>}

          <ul className="-mx-1 min-h-0 flex-1 space-y-2 overflow-y-auto px-1">
            {items?.map((r) => (
              <KeywordRecordingRow
                key={r.id}
                recording={r}
                onDeleted={() => {
                  setNotice(null)
                  reload()
                  onChanged()
                }}
              />
            ))}
          </ul>
        </>
      )}
    </DialogContent>
  )
}
