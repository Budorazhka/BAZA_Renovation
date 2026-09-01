import { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, ChevronDown } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { isDashboardPathAllowedForRole } from '@/config/dashboard-rail'
import { cn } from '@/lib/utils'
import { useI18n } from '@/i18n'

export const WORKSPACE_ADD_ACTIONS = [
  { key: 'newLead', route: '/dashboard/leads/poker' },
  { key: 'registerClient', route: '/dashboard/new-buildings/registration' },
  { key: 'newDeal', route: '/dashboard/deals' },
  { key: 'newTask', route: '/dashboard/tasks/new' },
  { key: 'secondarySelection', route: '/dashboard/objects/selections/new' },
  { key: 'newbuildSelection', route: '/dashboard/new-buildings/selections' },
  { key: 'newBooking', route: '/dashboard/bookings' },
  { key: 'calendarEvent', route: '/dashboard/calendar' },
  { key: 'newObject', route: '/dashboard/objects/list' },
] as const

type Props = {
  className?: string
  /** `header` — как в верхней панели; `fab` — плавающая кнопка, меню вверх */
  variant?: 'fab' | 'header'
  /** Текст на кнопке (в хедере по ТЗ — «Быстрые действия») */
  label?: string
}

export function WorkspaceAddButton({ className, variant = 'fab', label }: Props) {
  const navigate = useNavigate()
  const { currentUser } = useAuth()
  const { t } = useI18n()
  const role = currentUser?.role ?? 'manager'
  const actions = useMemo(
    () =>
      WORKSPACE_ADD_ACTIONS.filter((a) =>
        isDashboardPathAllowedForRole(a.route, role, currentUser?.permissionOverrides, currentUser?.teamRole),
      ),
    [role, currentUser?.permissionOverrides, currentUser?.teamRole],
  )

  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const isFab = variant === 'fab'
  const buttonLabel = label ?? t(isFab ? 'workspaceActions.add' : 'workspaceActions.quickActions')
  const empty = actions.length === 0

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  return (
    <div className={cn('relative', className)} ref={ref}>
      <button
        type="button"
        disabled={empty}
        title={empty ? t('workspaceActions.emptyTitle') : undefined}
        onClick={() => !empty && setOpen((o) => !o)}
        className={cn(
          'flex items-center gap-2 text-[color:var(--gold-btn-text)] transition-all hover:brightness-110 active:scale-95',
          isFab
            ? 'rounded-full bg-[var(--gold)] px-5 py-3 text-[15px] font-normal shadow-[0_4px_18px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.18)]'
            : 'min-h-10 w-[232px] justify-between rounded-[var(--section-cta-radius)] bg-[var(--gold)] px-3.5 py-2 text-[13px] font-normal text-[color:var(--gold-btn-text)] shadow-[0_4px_18px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.18)] sm:px-4',
          empty && 'cursor-not-allowed opacity-45 hover:brightness-100',
        )}
      >
        <Plus className="size-5" strokeWidth={isFab ? 2.25 : 2} />
        <span className={cn(!isFab && 'min-w-0 flex-1 truncate text-left')}>
          {buttonLabel}
        </span>
        {!isFab && !empty && (
          <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
        )}
      </button>
      {open && !empty && (
        <div
          className={cn(
            'absolute right-0 z-50 min-w-[220px] overflow-hidden rounded-lg border border-[var(--dropdown-border)] bg-[var(--dropdown-bg)] py-1 shadow-[var(--dropdown-shadow)]',
            isFab ? 'bottom-[calc(100%+10px)]' : 'top-[calc(100%+8px)]',
          )}
        >
          {actions.map((a) => (
            <button
              key={a.key}
              type="button"
              className="block w-full px-4 py-2.5 text-left text-[13px] font-medium text-[color:var(--dropdown-text)] hover:bg-[var(--dropdown-hover)]"
              onClick={() => {
                navigate(a.route)
                setOpen(false)
              }}
            >
              {t(`workspaceActions.items.${a.key}`)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
