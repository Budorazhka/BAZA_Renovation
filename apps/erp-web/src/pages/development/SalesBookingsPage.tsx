import { useMemo, useState, useEffect } from 'react'
import { BookingsPanel } from '@/components/development/sales/BookingsPanel'
import { useCoreStore } from '@/store/useCoreStore'
import { useAuth } from '@/context/AuthContext'
import { Building2 } from 'lucide-react'
import { SALES_PROJECT_ID_KEY } from '@/components/development/sales/salesManagementStorage'
import { useI18n } from "@/i18n";

export function SalesBookingsPage() {
    const { t } = useI18n();
  const { currentUser } = useAuth()
  const projects = useCoreStore((s) => s.projects)
  const allUnits = useCoreStore((s) => s.allUnits)
  const allBuildings = useCoreStore((s) => s.allBuildings)

  const availableProjects = projects.filter(p => p.status !== 'draft')
  const displayProjects = availableProjects.length > 0 ? availableProjects : projects

  const [projectId, setProjectId] = useState(() => {
    const stored = localStorage.getItem(SALES_PROJECT_ID_KEY)
    if (stored && displayProjects.some(p => p._id === stored)) return stored
    return displayProjects[0]?._id ?? ''
  })

  useEffect(() => {
    localStorage.setItem(SALES_PROJECT_ID_KEY, projectId)
  }, [projectId])

  const readOnly = currentUser?.role !== 'developer'

  const project = useMemo(
    () => displayProjects.find((item) => item._id === projectId) ?? displayProjects[0] ?? null,
    [projectId, displayProjects],
  )

  const units = useMemo(() => {
    if (!project) return []
    const projectBuildings = allBuildings.filter(b => b.project === project._id)
    const buildingIds = new Set(projectBuildings.map((b) => b._id))
    return allUnits.filter((u) => buildingIds.has(u.building))
  }, [allUnits, allBuildings, project])

  if (!project) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl bg-[var(--installments-empty-bg)] text-[16px] text-[color:var(--installments-text-muted)] shadow-sm">
        {t('development.salesBookingsPage.нет_доступных_проект')}</div>
    )
  }

  return (
    <div className="flex flex-col gap-4 h-full p-1">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[color:var(--workspace-row-border)] bg-[var(--workspace-row-bg)] p-4 shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-[color:var(--workspace-text-muted)]">
            <Building2 size={18} className="text-[color:var(--gold)]" />
            <span className="text-[16px] font-normal">{t('development.salesBookingsPage.выбор_проекта')}</span>
          </div>
          <select
            value={project._id}
            onChange={(e) => setProjectId(e.target.value)}
            className="h-10 w-[400px] rounded-[6px] border border-[color:var(--installments-select-border)] bg-[var(--installments-select-bg)] px-3 text-[16px] text-[color:var(--installments-text)] outline-none transition-colors focus:border-[color:var(--cb-ctrl-border-hover)]"
          >
            {displayProjects.map((item) => (
              <option key={item._id} value={item._id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
        {readOnly && (
          <span className="rounded-[4px] bg-[var(--workspace-row-bg)] px-3 py-1.5 text-[14px] text-[color:var(--workspace-text-dim)] border border-[color:var(--workspace-row-border)]">
            {t('development.salesBookingsPage.режим_просмотра')}</span>
        )}
      </div>

      <div className="flex-1 min-h-0">
        <BookingsPanel
          project={project}
          units={units}
          readOnly={readOnly}
        />
      </div>
    </div>
  )
}
