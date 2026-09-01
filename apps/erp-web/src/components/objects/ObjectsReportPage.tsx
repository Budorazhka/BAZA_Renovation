import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, BarChart3, Building2, Filter, Loader2 } from 'lucide-react'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { getConditionState } from '@/components/management/my-properties/utils'
import type { Property, PropertyCategory, SaleStatus } from '@/components/management/my-properties/types'
import { mapEstateApartmentToProperty } from '@/lib/map-estate-apartment'
import { CATALOG_PAGE_SIZE, secondaryObjectsApi } from '@/services/secondaryObjectsApi'
import { useI18n } from "@/i18n";

const CATEGORY_LABELS: Record<PropertyCategory, string> = {
  primary: 'Первичка',
  secondary: 'Вторичка',
  rent: 'Аренда',
  commercial: 'Коммерция',
  other: 'Прочее',
}

const STATUS_LABELS: Record<SaleStatus, string> = {
  for_sale: 'В продаже',
  booked: 'Забронирован',
  sold: 'Продан/сдан',
  moderation: 'На модерации',
  draft: 'Черновик',
  archive: 'Архив',
}

function getIsoWeekKey(iso: string) {
  const d = new Date(iso)
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

const REPORT_SAMPLE_LIMIT = 200

const CATALOG_CATEGORIES: PropertyCategory[] = ['secondary', 'rent', 'commercial', 'other']

async function loadCatalogSample(category: 'all' | PropertyCategory): Promise<Property[]> {
  const categories =
    category === 'all' || category === 'primary' ? CATALOG_CATEGORIES : [category]
  if (category === 'primary') return []

  const perCategory = Math.max(CATALOG_PAGE_SIZE, Math.ceil(REPORT_SAMPLE_LIMIT / categories.length))
  const results: Property[] = []

  for (const cat of categories) {
    let skip = 0
    while (results.length < REPORT_SAMPLE_LIMIT) {
      const page = await secondaryObjectsApi.fetchCatalogPage(cat, skip, perCategory)
      results.push(...page.items.map(mapEstateApartmentToProperty))
      if (!page.hasMore || page.items.length === 0) break
      skip += page.items.length
    }
  }

  return results.slice(0, REPORT_SAMPLE_LIMIT)
}

export default function ObjectsReportPage() {
    const { t } = useI18n();
  const [period, setPeriod] = useState<'30d' | '90d' | 'all'>('90d')
  const [status, setStatus] = useState<'all' | SaleStatus>('all')
  const [category, setCategory] = useState<'all' | PropertyCategory>('secondary')
  const [employee, setEmployee] = useState<'all' | string>('all')
  const [catalogProperties, setCatalogProperties] = useState<Property[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const now = useMemo(() => Date.now(), [])

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)

    loadCatalogSample(category)
      .then((items) => {
        if (!cancelled) setCatalogProperties(items)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [category])

  const filtered = useMemo(() => {
    let list = [...catalogProperties]
    if (period !== 'all') {
      const days = period === '30d' ? 30 : 90
      const threshold = now - days * 24 * 60 * 60 * 1000
      list = list.filter((p) => new Date(p.updatedAt).getTime() >= threshold)
    }
    if (status !== 'all') list = list.filter((p) => p.status === status)
    if (category !== 'all') list = list.filter((p) => p.category === category)
    if (employee !== 'all') list = list.filter((p) => p.agentId === employee)
    return list
  }, [catalogProperties, category, employee, now, period, status])

  const managerOptions = useMemo(() => {
    return Array.from(new Map(catalogProperties.map((p) => [p.agentId, p.agentName])).entries())
  }, [catalogProperties])

  const kpi = useMemo(() => {
    const total = filtered.length
    const noActivity = filtered.filter((p) => getConditionState(p.updatedAt, p.category) === 'needs_update').length
    const inDeal = filtered.filter((p) => p.status === 'booked').length
    const sold = filtered.filter((p) => p.status === 'sold').length
    const avgDaysWithoutUpdate = total > 0
      ? Math.round(filtered.reduce((s, p) => s + Math.max(0, Math.floor((now - new Date(p.updatedAt).getTime()) / 86400000)), 0) / total)
      : 0
    return { total, noActivity, inDeal, sold, avgDaysWithoutUpdate }
  }, [filtered, now])

  const problematic = useMemo(
    () => filtered.filter((p) => getConditionState(p.updatedAt, p.category) === 'needs_update' || p.status === 'draft').slice(0, 10),
    [filtered],
  )

  const dynamics = useMemo(() => {
    const map = new Map<string, number>()
    filtered.forEach((p) => {
      const key = getIsoWeekKey(p.updatedAt)
      map.set(key, (map.get(key) ?? 0) + 1)
    })
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-8)
      .map(([week, count]) => ({ week, count }))
  }, [filtered])
  const maxDyn = Math.max(1, ...dynamics.map((d) => d.count))

  return (
    <DashboardShell>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="w-full space-y-4">
          <div>
            <h1 className="text-xl font-normal text-[color:var(--theme-accent-heading)]">{t('objects.objectsReportPage.отч_т_по_объектам')}</h1>
            <p className="mt-1 text-sm text-[color:var(--app-text-muted)]">
              {t('objects.objectsReportPage.качество_и_активност')}{isLoading && (
                <span className="ml-2 inline-flex items-center gap-1 text-[color:var(--gold)]">
                  <Loader2 className="size-3.5 animate-spin" />
                  {t('objects.objectsReportPage.загрузка')}</span>
              )}
            </p>
          </div>
          <section className="rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3">
            <div className="mb-3 flex items-center gap-2">
              <Filter className="size-4 text-[color:var(--gold)]" />
              <h2 className="text-sm font-normal text-[color:var(--theme-accent-heading)]">{t('objects.objectsReportPage.фильтры')}</h2>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
              <select value={period} onChange={(e) => setPeriod(e.target.value as '30d' | '90d' | 'all')} className="rounded-md border border-[var(--hub-card-border)] bg-[color-mix(in_srgb,var(--rail-bg)_82%,transparent)] px-2 py-2 text-sm text-[color:var(--workspace-text)] [color-scheme:dark]">
                <option value="30d">{t('objects.objectsReportPage.период_30_дней')}</option>
                <option value="90d">{t('objects.objectsReportPage.период_90_дней')}</option>
                <option value="all">{t('objects.objectsReportPage.период_весь')}</option>
              </select>
              <select value={status} onChange={(e) => setStatus(e.target.value as 'all' | SaleStatus)} className="rounded-md border border-[var(--hub-card-border)] bg-[color-mix(in_srgb,var(--rail-bg)_82%,transparent)] px-2 py-2 text-sm text-[color:var(--workspace-text)] [color-scheme:dark]">
                <option value="all">{t('objects.objectsReportPage.статус_все')}</option>
                <option value="for_sale">{t('objects.objectsReportPage.в_продаже')}</option>
                <option value="booked">{t('objects.objectsReportPage.забронирован')}</option>
                <option value="sold">{t('objects.objectsReportPage.продан')}</option>
                <option value="draft">{t('objects.objectsReportPage.черновик')}</option>
              </select>
              <select value={category} onChange={(e) => setCategory(e.target.value as 'all' | PropertyCategory)} className="rounded-md border border-[var(--hub-card-border)] bg-[color-mix(in_srgb,var(--rail-bg)_82%,transparent)] px-2 py-2 text-sm text-[color:var(--workspace-text)] [color-scheme:dark]">
                <option value="all">{t('objects.objectsReportPage.категория_все')}</option>
                <option value="primary">{t('objects.objectsReportPage.первичка')}</option>
                <option value="secondary">{t('objects.objectsReportPage.вторичка')}</option>
                <option value="rent">{t('objects.objectsReportPage.аренда')}</option>
                <option value="commercial">{t('objects.objectsReportPage.коммерция')}</option>
                <option value="other">{t('objects.objectsReportPage.прочее')}</option>
              </select>
              <select value={employee} onChange={(e) => setEmployee(e.target.value)} className="rounded-md border border-[var(--hub-card-border)] bg-[color-mix(in_srgb,var(--rail-bg)_82%,transparent)] px-2 py-2 text-sm text-[color:var(--workspace-text)] [color-scheme:dark]">
                <option value="all">{t('objects.objectsReportPage.сотрудник_все')}</option>
                {managerOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </div>
          </section>
          <section className="grid grid-cols-2 gap-2 md:grid-cols-5">
            <div className="rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3"><p className="text-[10px] uppercase text-[color:var(--app-text-subtle)]">{t('objects.objectsReportPage.объекты')}</p><p className="text-xl font-normal text-[color:var(--theme-accent-heading)]">{kpi.total}</p></div>
            <div className="rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3"><p className="text-[10px] uppercase text-[color:var(--app-text-subtle)]">{t('objects.objectsReportPage.без_активности')}</p><p className="text-xl font-normal text-red-300">{kpi.noActivity}</p></div>
            <div className="rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3"><p className="text-[10px] uppercase text-[color:var(--app-text-subtle)]">{t('objects.objectsReportPage.в_сделке')}</p><p className="text-xl font-normal text-amber-300">{kpi.inDeal}</p></div>
            <div className="rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3"><p className="text-[10px] uppercase text-[color:var(--app-text-subtle)]">{t('objects.objectsReportPage.продано')}</p><p className="text-xl font-normal text-emerald-300">{kpi.sold}</p></div>
            <div className="rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3"><p className="text-[10px] uppercase text-[color:var(--app-text-subtle)]">{t('objects.objectsReportPage.ср_без_обновл')}</p><p className="text-xl font-normal text-blue-300">{kpi.avgDaysWithoutUpdate} {t('objects.objectsReportPage.дн')}</p></div>
          </section>
          <section className="rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3">
            <div className="mb-3 flex items-center gap-2">
              <BarChart3 className="size-4 text-[color:var(--gold)]" />
              <h2 className="text-sm font-normal text-[color:var(--theme-accent-heading)]">{t('objects.objectsReportPage.таблица_объектов')}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--workspace-row-border)] text-left text-[11px] uppercase tracking-wide text-[color:var(--app-text-subtle)]">
                    <th className="px-2 py-2">{t('objects.objectsReportPage.объект')}</th>
                    <th className="px-2 py-2">{t('objects.objectsReportPage.категория')}</th>
                    <th className="px-2 py-2">{t('objects.objectsReportPage.статус')}</th>
                    <th className="px-2 py-2">{t('objects.objectsReportPage.сотрудник')}</th>
                    <th className="px-2 py-2">{t('objects.objectsReportPage.обновлен')}</th>
                    <th className="px-2 py-2">{t('objects.objectsReportPage.состояние')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 60).map((p: Property) => {
                    const condition = getConditionState(p.updatedAt, p.category)
                    const conditionLabel =
                      condition === 'needs_update' ? 'Нужен апдейт' :
                      condition === 'needs_attention' ? 'Внимание' : 'Актуально'
                    return (
                      <tr key={p.id} className="border-b border-[color:var(--workspace-row-border)]">
                        <td className="px-2 py-2 text-[color:var(--workspace-text)]">
                          <span className="inline-flex items-center gap-1">
                            <Building2 className="size-3.5 text-[color:var(--gold)]" />
                            {p.title}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-[color:var(--workspace-text-muted)]">{CATEGORY_LABELS[p.category]}</td>
                        <td className="px-2 py-2 text-[color:var(--workspace-text-muted)]">{STATUS_LABELS[p.status]}</td>
                        <td className="px-2 py-2 text-[color:var(--workspace-text-muted)]">{p.agentName}</td>
                        <td className="px-2 py-2 text-[color:var(--workspace-text-muted)]">{new Date(p.updatedAt).toLocaleDateString('ru-RU')}</td>
                        <td className={condition === 'needs_update' ? 'px-2 py-2 text-red-300' : condition === 'needs_attention' ? 'px-2 py-2 text-amber-300' : 'px-2 py-2 text-emerald-300'}>
                          {conditionLabel}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
          <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3">
              <div className="mb-2 flex items-center gap-2">
                <AlertTriangle className="size-4 text-amber-300" />
                <h2 className="text-sm font-normal text-[color:var(--theme-accent-heading)]">{t('objects.objectsReportPage.проблемные_объекты')}</h2>
              </div>
              <div className="space-y-2">
                {problematic.map((p) => (
                  <div key={p.id} className="rounded-md border border-[color:var(--workspace-row-border)] bg-[var(--workspace-row-bg)] px-3 py-2">
                    <p className="text-sm font-normal text-[color:var(--workspace-text)]">{p.title}</p>
                    <p className="mt-1 text-xs text-[color:var(--workspace-text-muted)]">{p.city} · {STATUS_LABELS[p.status]}</p>
                  </div>
                ))}
                {problematic.length === 0 && <p className="text-sm text-[color:var(--workspace-text-muted)]">{t('objects.objectsReportPage.проблемных_объектов')}</p>}
              </div>
            </div>
            <div className="rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3">
              <div className="mb-2 flex items-center gap-2">
                <BarChart3 className="size-4 text-[color:var(--gold)]" />
                <h2 className="text-sm font-normal text-[color:var(--theme-accent-heading)]">{t('objects.objectsReportPage.динамика_активности')}</h2>
              </div>
              <div className="space-y-2">
                {dynamics.map((row) => (
                  <div key={row.week}>
                    <div className="mb-1 flex items-center justify-between text-xs text-[color:var(--workspace-text-muted)]">
                      <span>{row.week}</span>
                      <span>{row.count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-[rgba(255,255,255,0.07)]">
                      <div className="h-full rounded-full bg-[var(--gold)]" style={{ width: `${Math.round((row.count / maxDyn) * 100)}%` }} />
                    </div>
                  </div>
                ))}
                {dynamics.length === 0 && <p className="text-sm text-[color:var(--workspace-text-muted)]">{t('objects.objectsReportPage.недостаточно_данных')}</p>}
              </div>
            </div>
          </section>
        </div>
      </div>
    </DashboardShell>
  )
}
