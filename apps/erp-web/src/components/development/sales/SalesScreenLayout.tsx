import { useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useCoreStore } from '@/store/useCoreStore'
import type { IProject, IUnit } from '@/types/core'
import { useI18n } from '@/i18n'

import { SALES_PROJECT_ID_KEY } from './salesManagementStorage'

export function SalesScreenLayout({
  children,
}: {
  children: (args: {
    project: IProject
    units: IUnit[]
    buildingNameById: Map<string, string>
    readOnly: boolean
    headerSlot?: ReactNode
  }) => ReactNode
}) {
  const { t } = useI18n()
  const { currentUser } = useAuth()
  const projects = useCoreStore((s) => s.projects)
  const allBuildings = useCoreStore((s) => s.allBuildings)
  const allUnits = useCoreStore((s) => s.allUnits)

  const [projectId, setProjectId] = useState(() => {
    const stored = localStorage.getItem(SALES_PROJECT_ID_KEY)
    if (stored && projects.some(p => p._id === stored)) return stored
    return projects[0]?._id ?? ''
  })

  const handleProjectChange = (id: string) => {
    setProjectId(id)
    localStorage.setItem(SALES_PROJECT_ID_KEY, id)
  }

  const readOnly = currentUser?.role !== 'developer'

  const project = useMemo(
    () => projects.find((item) => item._id === projectId) ?? projects[0] ?? null,
    [projectId, projects],
  )

  const projectBuildings = useMemo(
    () => (project ? allBuildings.filter((building) => building.project === project._id) : []),
    [allBuildings, project],
  )

  const buildingNameById = useMemo(() => {
    const map = new Map<string, string>()
    projectBuildings.forEach((building) => map.set(building._id, building.name ?? t('salesManagement.shared.corpusFallback', 'Корпус')))
    return map
  }, [projectBuildings])

  const units = useMemo(() => {
    const buildingIds = new Set(projectBuildings.map((building) => building._id))
    return allUnits.filter((unit) => buildingIds.has(unit.building))
  }, [allUnits, projectBuildings])

  if (!project) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-[6px] bg-[var(--installments-empty-bg)] text-[16px] text-[color:var(--installments-text-muted)] border border-[color:var(--installments-border-inactive)]">
        {t('salesManagement.layout.noProjects', 'Нет проектов для управления продажами')}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <select
          value={project._id}
          onChange={(event) => handleProjectChange(event.target.value)}
          className="h-10 w-[400px] rounded-[6px] border border-[color:var(--installments-select-border)] bg-[var(--installments-select-bg)] px-3 text-[16px] text-[color:var(--installments-text)] outline-none transition-colors focus:border-[color:var(--cb-ctrl-border-hover)]"
        >
          {projects.map((item) => (
            <option key={item._id} value={item._id}>
              {item.name}
            </option>
          ))}
        </select>
        {readOnly && (
          <span className="text-[16px] text-[color:var(--installments-label)]">{t('salesManagement.layout.viewOnlyMode', 'режим просмотра')}</span>
        )}
      </div>

      {children({ project, units, buildingNameById, readOnly })}
    </div>
  )
}
