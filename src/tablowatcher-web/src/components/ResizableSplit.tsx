import { useRef, useState, type ReactNode } from 'react'

interface ResizableSplitProps {
  top: ReactNode
  bottom: ReactNode
  defaultTopRatio?: number
  minRatio?: number
  maxRatio?: number
  className?: string
}

// A vertical split with a mouse-draggable grip between the two panes. `top`/`bottom`
// should each be a single flex child (e.g. `className="min-h-0 flex-1 ..."`) so it
// stretches to fill the ratio it's given.
export function ResizableSplit({
  top,
  bottom,
  defaultTopRatio = 1 / 3,
  minRatio = 0.15,
  maxRatio = 0.7,
  className,
}: ResizableSplitProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [topRatio, setTopRatio] = useState(defaultTopRatio)

  function handleDragStart(e: React.MouseEvent) {
    e.preventDefault()
    const container = containerRef.current
    if (!container) return

    const previousUserSelect = document.body.style.userSelect
    const previousCursor = document.body.style.cursor
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'row-resize'

    function handleMouseMove(moveEvent: MouseEvent) {
      const rect = container!.getBoundingClientRect()
      const ratio = (moveEvent.clientY - rect.top) / rect.height
      setTopRatio(Math.min(maxRatio, Math.max(minRatio, ratio)))
    }

    function handleMouseUp() {
      document.body.style.userSelect = previousUserSelect
      document.body.style.cursor = previousCursor
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  return (
    <div ref={containerRef} className={`flex min-h-0 flex-col ${className ?? ''}`}>
      <div className="flex min-h-0 flex-col" style={{ flexGrow: topRatio, flexBasis: 0 }}>
        {top}
      </div>

      <div
        onMouseDown={handleDragStart}
        className="group flex h-3 shrink-0 cursor-row-resize items-center justify-center"
      >
        <div className="bg-border group-hover:bg-muted-foreground h-1 w-10 rounded-full transition-colors" />
      </div>

      <div className="flex min-h-0 flex-col" style={{ flexGrow: 1 - topRatio, flexBasis: 0 }}>
        {bottom}
      </div>
    </div>
  )
}
