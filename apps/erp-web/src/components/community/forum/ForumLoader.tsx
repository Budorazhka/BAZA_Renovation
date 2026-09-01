export function ForumLoader({ text = 'Загрузка...' }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <div className="relative size-6">
        <div
          className="absolute inset-0 rounded-full border-2 border-transparent animate-spin"
          style={{ borderTopColor: 'var(--forum-gold)', borderRightColor: 'var(--forum-gold)' }}
        />
      </div>
      <span className="text-[16px]" style={{ color: 'var(--workspace-text-muted)' }}>{text}</span>
    </div>
  )
}

export function ForumCardLoader({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-4 py-3 animate-pulse"
          style={{ borderBottom: i === rows - 1 ? 'none' : '1px solid rgba(30,74,42,0.35)' }}
        >
          <div className="size-8 shrink-0 rounded-[6px]" style={{ background: 'var(--workspace-row-bg)' }} />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 rounded w-3/4" style={{ background: 'var(--workspace-row-bg)' }} />
            <div className="h-3 rounded w-1/2" style={{ background: 'var(--workspace-row-bg)' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export function ForumRailLoader({ items = 3 }: { items?: number }) {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="flex items-center justify-between py-1.5">
          <div className="h-3 rounded w-1/3" style={{ background: 'var(--workspace-row-bg)' }} />
          <div className="h-3 rounded w-6" style={{ background: 'var(--workspace-row-bg)' }} />
        </div>
      ))}
    </div>
  )
}
