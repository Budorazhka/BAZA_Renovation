/**
 * Общие UI-примитивы рабочего стола.
 * Извлечены из DashboardWorkspace для переиспользования в виджетах.
 */
import { cn } from '@/lib/utils'

export const DESK_HEADER_LINK_CLASS =
  'text-[12px] font-normal uppercase tracking-widest text-[color:var(--theme-accent-link-dim)] hover:text-[color:var(--theme-accent-link)] transition-colors sm:text-[13px]'

export const REPORT_LINKS = {
  leads: '/dashboard/leads/report/general',
  marketing: '/dashboard/leads/report/marketing',
  deals: '/dashboard/deals/report',
  finance: '/dashboard/finance/report',
  objects: '/dashboard/objects/report',
  team: '/dashboard/reports/team',
  manager: '/dashboard/reports/manager',
  personal: '/dashboard/my-report',
} as const

export const FEED_ITEM_CLASS =
  'flex items-start gap-2.5 overflow-hidden rounded-lg border border-[color:var(--workspace-row-border)] bg-[var(--workspace-row-bg)] px-3 py-2.5 sm:px-3.5 sm:py-3'
export const FEED_TITLE_CLASS =
  'line-clamp-2 text-[13px] font-normal leading-snug text-[color:var(--workspace-text)] sm:text-[14px]'
export const FEED_BODY_CLASS =
  'line-clamp-2 text-[12px] font-normal leading-snug text-[color:var(--workspace-text-muted)] sm:text-[13px]'
export const FEED_META_CLASS =
  'text-[11px] font-normal leading-snug text-[color:var(--workspace-text-muted)] sm:text-[12px]'
export const FEED_STACK_CLASS = 'flex min-w-0 flex-1 flex-col gap-1'

export function DeskShell({
  children,
  className,
  accent,
}: {
  children: React.ReactNode
  className?: string
  accent?: string
}) {
  return (
    <div
      className={cn(
        'flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl',
        'backdrop-blur-xl',
        'shadow-[inset_0_0_0_1px_var(--workspace-card-ring)]',
        'transition-shadow duration-200',
        'hover:shadow-[inset_0_0_0_1px_var(--workspace-card-ring-hover)]',
        className,
      )}
      style={{
        background: accent
          ? `radial-gradient(ellipse 130% 80% at -5% -10%, ${accent}12 0%, transparent 55%), var(--workspace-card-bg)`
          : 'var(--workspace-card-bg)',
        ...(accent ? { borderTop: `2px solid ${accent}` } : {}),
      }}
    >
      {children}
    </div>
  )
}

export function DeskHeader({
  icon,
  title,
  right,
  accentColor,
  layout = 'comfort',
  titleClassName,
}: {
  icon: React.ReactNode
  title?: string | null
  right?: React.ReactNode
  accentColor?: string
  layout?: 'compact' | 'comfort'
  titleClassName?: string
}) {
  const spacious = layout === 'comfort'
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-between gap-2 border-b border-[color:var(--workspace-row-border)]',
        spacious ? 'px-3 py-2.5 sm:px-4 sm:py-3' : 'px-3 py-2',
      )}
    >
      <div className={cn('flex min-w-0 items-center', spacious ? 'gap-2.5' : 'gap-2')}>
        <div
          className={cn(
            'flex shrink-0 items-center justify-center rounded-lg',
            spacious ? 'size-8 sm:size-9' : 'size-6 rounded-md',
          )}
          style={{
            background: accentColor ? `${accentColor}20` : 'var(--workspace-widget-icon-bg)',
            color: accentColor ?? 'var(--workspace-widget-icon-fg)',
          }}
        >
          {icon}
        </div>
        {title ? (
          <h3
            className={cn(
              'min-w-0 flex-1 line-clamp-2 font-normal leading-snug tracking-tight text-[color:var(--workspace-widget-title)]',
              spacious ? 'text-[15px] sm:text-[16px]' : 'text-[13px] sm:text-[14px]',
              titleClassName,
            )}
          >
            {title}
          </h3>
        ) : null}
      </div>
      {right != null && <div className="shrink-0">{right}</div>}
    </div>
  )
}

export function DeskTab({
  active,
  onClick,
  children,
  badge,
  variant = 'default',
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  badge?: number
  variant?: 'default' | 'main'
}) {
  const main = variant === 'main'
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative inline-flex shrink-0 items-center gap-0.5 transition-colors',
        main
          ? 'rounded-lg px-2.5 py-1.5 text-[13px] font-normal tracking-tight sm:px-3 sm:text-[14px]'
          : 'rounded-md px-2.5 py-1 text-[13px] font-normal uppercase tracking-wide sm:text-[14px]',
        active
          ? 'bg-[color-mix(in_srgb,var(--gold)_24%,transparent)] text-[color:var(--workspace-text)]'
          : 'text-[color:var(--workspace-text-muted)] hover:bg-[rgba(255,255,255,0.05)] hover:text-[color:var(--workspace-text)]',
      )}
    >
      {children}
      {badge != null && badge > 0 && (
        <span className="flex size-4 items-center justify-center rounded-full bg-[#e11d48] text-[10px] leading-none text-white">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  )
}

export function MiniBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full"
      style={{ background: `${color}22` }}
    >
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }}
      />
    </div>
  )
}

export function DeskRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 rounded-lg border border-[color:var(--workspace-row-border)] bg-[var(--workspace-row-bg)] px-2.5 py-1.5',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function DeskEmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-[color:var(--workspace-row-border)] px-3 py-6 text-center text-[13px] text-[color:var(--workspace-text-muted)] opacity-50">
      {text}
    </div>
  )
}

export function DeskKpi({
  label,
  value,
  sub,
  pct,
  color,
  hint,
}: {
  label: string
  value: string
  sub?: string
  pct?: number
  color?: string
  /** Краткая расшифровка метрики (подсказка) */
  hint?: string
}) {
  const inner = (
    <div
      aria-label={hint ? `${label}: ${hint}` : label}
      className="rounded-lg px-2.5 py-2"
      style={{
        background: color ? `${color}0f` : 'var(--workspace-row-bg)',
        border: `1px solid ${color ? `${color}28` : 'var(--workspace-row-border)'}`,
      }}
    >
      <p className="text-[11px] font-normal uppercase tracking-wider text-[color:var(--workspace-text-dim)]">{label}</p>
      <p
        className="mt-0.5 text-[19px] font-normal leading-none"
        style={{ color: color ?? 'var(--workspace-text)' }}
      >
        {value}
        {sub && (
          <span className="ml-1 text-[10px]" style={{ color: color ? `${color}99` : 'var(--workspace-text-muted)' }}>
            {sub}
          </span>
        )}
      </p>
      {pct != null && color && (
        <div className="mt-1.5">
          <MiniBar pct={pct} color={color} />
        </div>
      )}
    </div>
  )

  return inner
}

/** Крупный герой-метрик для small-виджетов — одно большое число с прогресс-баром. */
export function DeskHero({
  label,
  value,
  sub,
  color,
  pct,
}: {
  label: string
  value: string
  sub?: string
  color: string
  pct?: number
}) {
  return (
    <div
      className="flex flex-1 flex-col justify-center px-3 py-3 border-b border-[color:var(--workspace-row-border)]"
      style={{ background: `${color}07` }}
    >
      <p className="text-[11px] uppercase tracking-wider text-[color:var(--workspace-text-dim)]">{label}</p>
      <p className="mt-1.5 text-[30px] font-light leading-none sm:text-[34px]" style={{ color }}>
        {value}
        {sub && (
          <span className="ml-2 text-[14px] font-normal" style={{ color: `${color}80` }}>
            {sub}
          </span>
        )}
      </p>
      {pct != null && (
        <div className="mt-2.5">
          <MiniBar pct={pct} color={color} />
        </div>
      )}
    </div>
  )
}

/** Нижняя строка из 2–4 мини-статов для small-виджетов под DeskHero. */
export function DeskMiniStats({
  items,
}: {
  items: { label: string; value: string; color?: string }[]
}) {
  const cols =
    items.length === 2 ? 'grid-cols-2' :
    items.length === 3 ? 'grid-cols-3' :
    'grid-cols-4'

  return (
    <div className={cn('grid shrink-0 divide-x divide-[color:var(--workspace-row-border)]', cols)}>
      {items.map((item) => (
        <div key={item.label} className="px-2.5 py-2.5">
          <p className="text-[10px] uppercase tracking-wide text-[color:var(--workspace-text-dim)]">{item.label}</p>
          <p
            className="mt-1 text-[16px] font-normal leading-none"
            style={{ color: item.color ?? 'var(--workspace-text)' }}
          >
            {item.value}
          </p>
        </div>
      ))}
    </div>
  )
}
