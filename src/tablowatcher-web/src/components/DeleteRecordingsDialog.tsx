import { useState } from 'react'
import { LoaderCircle, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import type { ChannelInfo } from '@/components/PosterGridPage'
import { formatDuration, formatSize } from '@/lib/format'
import { postRecordingAction } from '@/lib/recording'

// One recording of a movie or sports event, as /api/storage/recordings lists them.
export interface StoredRecording {
  path: string
  // The movie, or the game ("Yankees at Red Sox").
  title: string
  // The competition ("MLB Baseball"), or the movie's release year.
  subtitle: string | null
  recordedAt: string
  channel: ChannelInfo
  state: string | null
  // Seconds recorded.
  duration: number
  size: number
  watched: boolean
}

function formatDate(datetime: string): string {
  return new Date(datetime).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

// Picks one or more of a movie's or sport's recordings and deletes them from the Tablo.
// `onChanged` tells the page to re-read its usage after anything is deleted; `onEmpty`
// closes the dialog once there's nothing left in it.
export function DeleteRecordingsDialog({
  title,
  recordings: initialRecordings,
  onChanged,
  onEmpty,
}: {
  title: string
  recordings: StoredRecording[]
  onChanged: () => void
  onEmpty: () => void
}) {
  const [recordings, setRecordings] = useState(initialRecordings)
  // The device refuses to delete a recording still in progress.
  const deletable = recordings.filter((r) => r.state !== 'recording')
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(deletable.length === 1 ? [deletable[0].path] : []),
  )
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  // Why each recording that couldn't be deleted wasn't.
  const [errors, setErrors] = useState<Map<string, string>>(new Map())

  const total = recordings.reduce((sum, r) => sum + r.size, 0)
  const selectedRecordings = recordings.filter((r) => selected.has(r.path))
  const selectedSize = selectedRecordings.reduce((sum, r) => sum + r.size, 0)
  const allSelected = deletable.length > 0 && selectedRecordings.length === deletable.length

  function toggle(path: string, checked: boolean) {
    setConfirming(false)
    setSelected((current) => {
      const next = new Set(current)
      if (checked) next.add(path)
      else next.delete(path)
      return next
    })
  }

  function toggleAll(checked: boolean) {
    setConfirming(false)
    setSelected(new Set(checked ? deletable.map((r) => r.path) : []))
  }

  // One at a time - the device's embedded server doesn't cope well with a burst of requests.
  async function deleteSelected() {
    setBusy(true)
    const deleted = new Set<string>()
    const failed = new Map<string, string>()
    for (const r of selectedRecordings) {
      try {
        await postRecordingAction('delete', r.path)
        deleted.add(r.path)
      } catch (err) {
        failed.set(r.path, (err as Error).message)
      }
    }
    setBusy(false)
    setConfirming(false)
    setErrors(failed)
    // What failed stays selected, to retry.
    setSelected(new Set(failed.keys()))

    if (deleted.size === 0) return
    onChanged()
    const remaining = recordings.filter((r) => !deleted.has(r.path))
    setRecordings(remaining)
    if (remaining.length === 0) onEmpty()
  }

  return (
    <DialogContent className="flex max-h-[80vh] flex-col gap-4 sm:max-w-xl">
      <div className="space-y-1 pr-8">
        <DialogTitle className="text-lg leading-tight font-semibold">{title}</DialogTitle>
        <DialogDescription>
          {recordings.length === 1 ? '1 recording' : `${recordings.length} recordings`} · {formatSize(total)}
        </DialogDescription>
      </div>

      {deletable.length > 1 && (
        <label className="flex items-center gap-3 px-3 text-sm">
          <Checkbox checked={allSelected} onCheckedChange={toggleAll} disabled={busy} />
          Select all
        </label>
      )}

      <ul className="-mx-1 min-h-0 flex-1 space-y-1.5 overflow-y-auto px-1">
        {recordings.map((r) => {
          const inProgress = r.state === 'recording'
          const error = errors.get(r.path)
          return (
            <li key={r.path}>
              <label
                className={`flex items-start gap-3 rounded-md border p-3 text-sm transition-colors ${inProgress ? 'opacity-60' : 'hover:bg-muted cursor-pointer'} ${selected.has(r.path) ? 'border-foreground/30 bg-muted/60' : ''}`}
              >
                <Checkbox
                  className="mt-0.5"
                  checked={selected.has(r.path)}
                  onCheckedChange={(checked) => toggle(r.path, checked)}
                  disabled={inProgress || busy}
                />
                <span className="min-w-0 flex-1 space-y-0.5">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium">{r.title}</span>
                    {inProgress && <Badge variant="destructive">Recording</Badge>}
                  </span>
                  {r.subtitle && <span className="text-muted-foreground block text-xs">{r.subtitle}</span>}
                  <span className="text-muted-foreground block text-xs">
                    {[
                      `Recorded ${formatDate(r.recordedAt)}`,
                      `${r.channel.major}.${r.channel.minor} ${r.channel.callSign}`,
                      r.duration > 0 ? formatDuration(r.duration) : null,
                      r.watched ? 'Watched' : null,
                      r.state && r.state !== 'finished' && !inProgress ? r.state : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  {inProgress && (
                    <span className="text-muted-foreground block text-xs">
                      Stop it from the Recordings page before deleting it.
                    </span>
                  )}
                  {error && <span className="text-destructive block text-xs">Couldn't delete: {error}</span>}
                </span>
                <span className="shrink-0 text-sm tabular-nums">{formatSize(r.size)}</span>
              </label>
            </li>
          )
        })}
      </ul>

      <div className="border-t pt-4">
        {confirming ? (
          <div className="border-destructive/40 bg-destructive/5 space-y-2 rounded-md border p-3">
            <p className="text-sm">
              Delete {selectedRecordings.length === 1 ? 'this recording' : `these ${selectedRecordings.length} recordings`}{' '}
              ({formatSize(selectedSize)}) from the Tablo? This can't be undone.
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" disabled={busy} onClick={deleteSelected}>
                {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                {busy ? 'Deleting…' : 'Delete'}
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={selectedRecordings.length === 0}
            onClick={() => setConfirming(true)}
          >
            <Trash2 className="size-4" />
            {selectedRecordings.length === 0
              ? 'Delete'
              : `Delete ${selectedRecordings.length === 1 ? '1 recording' : `${selectedRecordings.length} recordings`} (${formatSize(selectedSize)})`}
          </Button>
        )}
      </div>
    </DialogContent>
  )
}
