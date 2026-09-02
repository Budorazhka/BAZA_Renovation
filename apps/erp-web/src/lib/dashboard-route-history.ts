import type { DashboardBackNavigation } from '@/lib/dashboard-back'

const DASHBOARD_ROUTE_HISTORY_KEY = 'agency-new.dashboard-route-history'

type DashboardRouteHistory = {
  current?: DashboardBackNavigation
  previous?: DashboardBackNavigation
}

function normalizePath(pathname: string): string {
  if (!pathname || pathname === '/') return '/'
  return pathname.replace(/\/+$/, '') || '/'
}

function normalizeSearch(search?: string): string | undefined {
  if (!search) return undefined
  return search.startsWith('?') ? search : `?${search}`
}

function isDashboardRoute(pathname: string): boolean {
  const normalized = normalizePath(pathname)
  return normalized === '/dashboard' || normalized.startsWith('/dashboard/')
}

function sameRoute(a?: DashboardBackNavigation | null, b?: DashboardBackNavigation | null): boolean {
  if (!a || !b) return false
  return normalizePath(a.pathname) === normalizePath(b.pathname) && normalizeSearch(a.search) === normalizeSearch(b.search)
}

function readHistory(): DashboardRouteHistory {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.sessionStorage.getItem(DASHBOARD_ROUTE_HISTORY_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as DashboardRouteHistory
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeHistory(history: DashboardRouteHistory) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(DASHBOARD_ROUTE_HISTORY_KEY, JSON.stringify(history))
  } catch {
    /* ignore */
  }
}

export function rememberDashboardRoute(pathname: string, search: string) {
  if (!isDashboardRoute(pathname)) return

  const next: DashboardBackNavigation = {
    pathname: normalizePath(pathname),
    search: normalizeSearch(search),
  }
  const history = readHistory()
  if (sameRoute(history.current, next)) return

  writeHistory({
    previous: history.current,
    current: next,
  })
}

export function getPreviousDashboardRoute(
  pathname: string,
  search: string,
): DashboardBackNavigation | null {
  const current: DashboardBackNavigation = {
    pathname: normalizePath(pathname),
    search: normalizeSearch(search),
  }
  const history = readHistory()
  const previous = sameRoute(history.current, current) ? history.previous : history.current

  if (!previous || !isDashboardRoute(previous.pathname)) return null
  if (sameRoute(previous, current)) return null

  return previous
}
