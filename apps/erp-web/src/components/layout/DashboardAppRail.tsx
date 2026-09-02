import { useMemo, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Lock, LogOut, PanelLeft, PanelLeftClose, Settings } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { cn } from '@/lib/utils'
import { useSidebarRail } from '@/context/SidebarRailContext'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/i18n'
import {
  getDashboardRailItemsWithAccess,
  isDashboardRailItemActive,
  isRealUserAccount,
  roleCanAccessSettingsHub,
} from '@/config/dashboard-rail'
import { getRoleLabel } from '@/lib/permissions'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const RAIL_EXPANDED_W = 'w-[min(100%,288px)]'
const RAIL_COLLAPSED_W = 'w-[72px]'
const RAIL_ICON = 'size-[22px] shrink-0'

export function DashboardAppRail() {
  const navigate = useNavigate()
  const location = useLocation()
  const { currentUser, logout } = useAuth()
  const { railCollapsed, toggleRail } = useSidebarRail()
  const { isLightTheme: isLight } = useTheme()
  const { t } = useI18n()

  const railItems = useMemo(
    () =>
      getDashboardRailItemsWithAccess(
        currentUser?.role ?? 'manager',
        currentUser?.permissionOverrides,
        currentUser?.teamRole,
      ),
    [currentUser?.role, currentUser?.permissionOverrides, currentUser?.teamRole],
  )

  function openAccessDenied(item: { id: string; to: string; label: string }) {
    navigate('/dashboard/access-denied', {
      state: { from: item.to, sectionId: item.id, sectionLabel: t(`nav.${item.id}`, item.label) },
    })
  }
  const canSettingsHub = roleCanAccessSettingsHub(currentUser?.role ?? 'manager') || isRealUserAccount(currentUser?.login)

  const userDisplayName = currentUser?.name ?? t('common.userFallback')
  const rawRoleLabel = getRoleLabel(currentUser?.role)
  const accountRoleLabel = currentUser?.role ? t(`roles.${currentUser.role}`, rawRoleLabel) : rawRoleLabel
  // Роль позиции в команде (teamRole из ensure-self) — второй частью через « / »,
  // когда она известна и не дублирует аккаунтную роль (в демо-сессиях они совпадают).
  const teamRoleLabel =
    currentUser?.teamRole && currentUser.teamRole !== currentUser.role
      ? t(`roles.${currentUser.teamRole}`, getRoleLabel(currentUser.teamRole))
      : null
  const roleLabel = teamRoleLabel ? `${accountRoleLabel} / ${teamRoleLabel}` : accountRoleLabel
  const userInitials = userDisplayName.slice(0, 2).toUpperCase()

  function UserRoleTooltip({
    children,
    side = 'right',
  }: {
    children: ReactNode
    side?: 'top' | 'right' | 'bottom' | 'left'
  }) {
    if (roleLabel === '—') {
      return <>{children}</>
    }
    return (
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={side} sideOffset={6}>
          {roleLabel}
        </TooltipContent>
      </Tooltip>
    )
  }

  const linkBase = cn(
    'group flex min-w-0 font-sans text-[17px] font-normal leading-snug tracking-tight transition-colors duration-150',
    railCollapsed ? 'items-center justify-center px-0 py-3' : 'items-start gap-3 px-4 py-3',
  )

  return (
    <aside
      className={cn(
        'z-50 flex h-screen min-h-0 shrink-0 flex-col border-r bg-[var(--rail-bg)] py-3 transition-[width] duration-200 ease-out',
        isLight
          ? 'border-[var(--green-border)] shadow-sm'
          : 'border-emerald-900/20 shadow-[inset_-1px_0_0_rgba(201,168,76,0.1),30px_0_30px_rgba(0,17,13,0.4)]',
        railCollapsed ? RAIL_COLLAPSED_W : RAIL_EXPANDED_W,
      )}
    >
      <div className={cn('shrink-0', railCollapsed ? 'mb-2 px-2' : 'mb-3 px-4')}>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={toggleRail}
            title={railCollapsed ? t('shell.expandMenu') : t('shell.collapse')}
            aria-expanded={!railCollapsed}
            className={cn(
              'flex items-center rounded-lg border px-2.5 py-2 transition-colors',
              isLight
                ? 'border-slate-200 bg-slate-100 text-slate-600 hover:border-[var(--gold)]/50 hover:text-slate-900'
                : 'border-emerald-900/30 bg-[var(--rail-surface)] text-emerald-100/75 hover:border-[color:var(--rail-active-border)] hover:text-[color:var(--rail-active-fg)]',
              railCollapsed ? 'justify-center' : 'gap-2.5',
            )}
          >
            {railCollapsed ? (
              <PanelLeft className={RAIL_ICON} strokeWidth={2} />
            ) : (
              <>
                <PanelLeftClose className="size-5 shrink-0" strokeWidth={2} />
                <span className="text-[17px] font-normal">{t('shell.collapse')}</span>
              </>
            )}
          </button>

          {!railCollapsed ? (
            <div className="flex items-center gap-2.5 pt-0.5">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[var(--gold)]">
                <span className="text-sm font-normal text-[color:var(--gold-btn-text)]">{userInitials}</span>
              </div>
              <div className="min-w-0">
              <UserRoleTooltip>
                <h1 className="line-clamp-2 min-w-0 cursor-default break-words text-[19px] font-normal tracking-tight text-[color:var(--rail-product-title)] [overflow-wrap:anywhere]">
                  {userDisplayName}
                </h1>
              </UserRoleTooltip>
                <p className="flex items-baseline gap-0.5 truncate">
                  <span className="text-[15px] font-normal tracking-wide text-[color:var(--app-text-muted)]">BAZA</span>
                  <span className="text-[11px] font-normal text-[color:var(--app-text-muted)]">.sale</span>
                </p>
              </div>
            </div>
          ) : (
            <div className="flex justify-center pt-0.5">
              <UserRoleTooltip>
                <div className="flex size-9 cursor-default items-center justify-center rounded-md bg-[var(--gold)]">
                  <span className="text-xs font-normal text-[color:var(--gold-btn-text)]">{userInitials}</span>
                </div>
              </UserRoleTooltip>
            </div>
          )}
        </div>
      </div>

      <nav
        className="flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto overflow-x-hidden px-0 overscroll-contain [-webkit-overflow-scrolling:touch]"
        aria-label={t('shell.sections')}
      >
        {railItems.map((item) => {
          const Icon = item.icon
          const active = item.accessible && isDashboardRailItemActive(location.pathname, item)
          const locked = !item.accessible
          const itemLabel = t(`nav.${item.id}`, item.label)

          if (locked) {
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => openAccessDenied(item)}
                title={itemLabel}
                className={cn(
                  linkBase,
                  'group relative w-full cursor-not-allowed text-left',
                  railCollapsed && 'overflow-hidden',
                  isLight
                    ? 'text-slate-400 hover:bg-slate-50'
                    : 'text-emerald-100/28 hover:bg-emerald-900/15',
                )}
              >
                <Icon
                  className={cn(RAIL_ICON, 'relative z-[2] shrink-0 opacity-50', !railCollapsed && 'mt-0.5')}
                  strokeWidth={2}
                />
                {!railCollapsed && (
                  <>
                    <span className="relative z-[2] min-w-0 flex-1 break-words hyphens-auto leading-tight [overflow-wrap:anywhere] line-clamp-4">
                      {itemLabel}
                    </span>
                    <Lock className="relative z-[2] mt-1 size-4 shrink-0 opacity-45" strokeWidth={2} aria-hidden />
                  </>
                )}
                {railCollapsed ? (
                  <Lock
                    className="pointer-events-none absolute bottom-1.5 right-1.5 z-[3] size-3 opacity-60"
                    strokeWidth={2.25}
                    aria-hidden
                  />
                ) : null}
              </button>
            )
          }

          return (
            <Link
              key={item.id}
              to={item.to}
              title={railCollapsed ? itemLabel : undefined}
              className={cn(
                linkBase,
                'group relative',
                railCollapsed && 'overflow-hidden',
                active
                  ? cn(
                      'text-[color:var(--rail-active-fg)]',
                      isLight ? 'bg-[var(--nav-item-bg-active)]' : 'bg-emerald-900/35',
                    )
                  : cn(
                      isLight
                        ? 'text-[color:var(--nav-item-text)] hover:bg-slate-100 hover:text-slate-900'
                        : 'text-emerald-100/70 hover:bg-emerald-900/25 hover:text-emerald-50',
                    ),
              )}
            >
              {active ? (
                <span
                  className="pointer-events-none absolute top-0 bottom-0 left-0 z-[1] w-[3px] bg-[color:var(--rail-active-border)]"
                  aria-hidden
                />
              ) : null}
              <Icon
                className={cn(
                  RAIL_ICON,
                  'relative z-[2] shrink-0 transition-transform duration-200 ease-out',
                  'motion-safe:group-hover:scale-110 motion-safe:group-active:scale-90',
                  active && 'scale-105',
                  !railCollapsed && 'mt-0.5',
                )}
                strokeWidth={active ? 2.25 : 2}
              />
              {!railCollapsed && (
                <span className="relative z-[2] min-w-0 flex-1 break-words hyphens-auto leading-tight [overflow-wrap:anywhere] line-clamp-4">
                  {itemLabel}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      <div className={cn('mt-auto shrink-0 border-t pt-2', isLight ? 'border-[var(--green-border)]' : 'border-emerald-900/25', railCollapsed ? 'px-2' : 'px-4')}>
        {canSettingsHub && (
          <button
            type="button"
            onClick={() => navigate('/dashboard/settings-hub')}
            title={t('shell.settings')}
            className={cn(
              'flex w-full items-center rounded-lg py-3 font-sans text-[17px] font-normal transition-colors',
              isLight
                ? 'text-[color:var(--nav-item-text)] hover:bg-slate-100 hover:text-slate-900'
                : 'text-emerald-100/70 hover:bg-emerald-900/25 hover:text-emerald-50',
              railCollapsed ? 'justify-center' : 'gap-3 px-1',
            )}
          >
            <Settings className={RAIL_ICON} strokeWidth={2} />
            {!railCollapsed && t('shell.settings')}
          </button>
        )}

        <div className={cn('mt-2', railCollapsed ? 'flex justify-center' : '')}>
          <button
            type="button"
            title={t('shell.logout')}
            onClick={() => {
              logout()
              navigate('/')
            }}
            className={cn(
              'flex items-center rounded-md transition-colors hover:text-[color:var(--theme-accent-link)]',
              isLight ? 'text-slate-500 hover:bg-slate-100' : 'text-emerald-100/45 hover:bg-emerald-900/25',
              railCollapsed ? 'justify-center p-1.5' : 'w-full gap-2 px-2 py-2.5 text-[17px] font-normal',
            )}
          >
            <LogOut className="size-5" />
            {!railCollapsed && t('shell.logout')}
          </button>
        </div>
      </div>
    </aside>
  )
}
