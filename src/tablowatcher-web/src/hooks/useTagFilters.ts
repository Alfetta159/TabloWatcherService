import { useEffect, useState } from 'react'

interface TagsResponse {
  allTags: string[]
  blockedTags: string[]
}

export interface TagFilters {
  // Every tag relevant to this page's content type, regardless of exclusion.
  allTags: string[]
  // allTags minus excludedTags - what "Include Tags" offers, since an excluded tag is
  // already gone from the results, so including it too would do nothing.
  availableTags: string[]
  // A local, per-session choice: only show items with at least one of these tags.
  includeTags: Set<string>
  // A global, server-persisted choice (shared across users/browsers): items with any of
  // these tags are left out everywhere, not just here.
  excludedTags: Set<string>
  toggleInclude: (tag: string) => void
  toggleExclude: (tag: string, excluded: boolean) => void
}

// Backs the "Include Tags"/"Exclude Tags" dropdowns on TV Shows, Movies, Sports and Search.
// `kind` is one of tv-shows/movies/sports/search - see TagsController.
export function useTagFilters(kind: string): TagFilters {
  const [allTags, setAllTags] = useState<string[]>([])
  const [excludedTags, setExcludedTags] = useState<Set<string>>(new Set())
  const [includeTags, setIncludeTags] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false

    fetch(`/api/tags?${new URLSearchParams({ kind })}`)
      .then((res) => {
        if (!res.ok) throw new Error(`API returned ${res.status}`)
        return res.json() as Promise<TagsResponse>
      })
      .then((d) => {
        if (cancelled) return
        setAllTags(d.allTags)
        setExcludedTags(new Set(d.blockedTags))
      })
      .catch(() => {
        // Non-fatal: the tag filters just come up empty - neither used to exclude content
        // nor to narrow down what's already showing.
      })

    return () => {
      cancelled = true
    }
  }, [kind])

  function toggleInclude(tag: string) {
    setIncludeTags((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) {
        next.delete(tag)
      } else {
        next.add(tag)
      }
      return next
    })
  }

  // The exclude list is a shared, server-persisted setting (not per-browser), so every
  // toggle writes straight through - there's no separate "save" step.
  function toggleExclude(tag: string, excluded: boolean) {
    setExcludedTags((prev) => {
      const next = new Set(prev)
      if (excluded) {
        next.add(tag)
      } else {
        next.delete(tag)
      }

      fetch('/api/tags/blocked', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([...next]),
      }).catch(() => {
        // Best-effort; the next /api/tags load will reconcile with whatever the server has.
      })

      return next
    })

    // A newly-excluded tag can no longer be an "include" filter either.
    if (excluded) {
      setIncludeTags((prev) => {
        if (!prev.has(tag)) return prev
        const next = new Set(prev)
        next.delete(tag)
        return next
      })
    }
  }

  const availableTags = allTags.filter((t) => !excludedTags.has(t))

  return { allTags, availableTags, includeTags, excludedTags, toggleInclude, toggleExclude }
}
