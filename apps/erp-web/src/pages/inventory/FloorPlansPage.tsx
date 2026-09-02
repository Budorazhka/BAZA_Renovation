import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

import { FloorPlanEditor } from '@/components/inventory/FloorPlanEditor'
import { LayoutManagerView } from '@/components/inventory/LayoutManagerView'
import { useCoreStore } from '@/store/useCoreStore'

type Tab = 'layouts' | 'floors'

export default function FloorPlansPage() {
  const [tab, setTab] = useState<Tab>('layouts')
  const projects = useCoreStore((s) => s.projects)
  const activeProjectId = useCoreStore((s) => s.activeProjectId)
  const setActiveProject = useCoreStore((s) => s.setActiveProject)
  const fetchProjects = useCoreStore((s) => s.fetchProjects)
  const fetchBuildings = useCoreStore((s) => s.fetchBuildings)
  const [projectDropOpen, setProjectDropOpen] = useState(false)
  const projectDropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void fetchProjects()
  }, [fetchProjects])

  useEffect(() => {
    if (!projectDropOpen) return
    function handleOutside(event: MouseEvent) {
      if (projectDropRef.current && !projectDropRef.current.contains(event.target as Node)) {
        setProjectDropOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [projectDropOpen])

  function handleProjectChange(projectId: string) {
    setActiveProject(projectId)
    setProjectDropOpen(false)
    void fetchBuildings(projectId)
  }

  const activeProjectName = projects.find((project) => project._id === activeProjectId)?.name ?? 'ЖК'

  return (
    <div className="flex flex-col gap-6">
      {/* Tab bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-[560px]" ref={projectDropRef}>
          <button
            type="button"
            onClick={() => setProjectDropOpen((value) => !value)}
            className={`inline-flex h-11 w-full max-w-[560px] items-center justify-between gap-3 rounded-md border px-4 text-[16px] font-normal transition-colors ${
              projectDropOpen
                ? 'border-[#e6c364] bg-[rgba(230,195,100,0.12)] text-[#fcecc8]'
                : 'border-[rgba(230,195,100,0.22)] bg-[rgba(0,0,0,0.25)] text-[rgba(255,255,255,0.72)] hover:border-[rgba(230,195,100,0.4)] hover:text-[#fcecc8]'
            }`}
          >
            <span className="truncate text-left">{activeProjectName}</span>
            <ChevronDown size={16} className={`shrink-0 transition-transform ${projectDropOpen ? 'rotate-180' : ''}`} />
          </button>
          {projectDropOpen ? (
            <div className="absolute left-0 top-full z-30 mt-1.5 min-w-[260px] max-w-[420px] rounded-md border border-[rgba(230,195,100,0.18)] bg-[#112d1c] py-1 shadow-[0_8px_32px_rgba(0,0,0,0.45)]">
              {projects.map((project) => (
                <button
                  key={project._id}
                  type="button"
                  onClick={() => handleProjectChange(project._id)}
                  className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-[16px] font-normal transition-colors ${
                    activeProjectId === project._id
                      ? 'bg-[rgba(230,195,100,0.12)] text-[#fcecc8]'
                      : 'text-[rgba(255,255,255,0.72)] hover:bg-[rgba(230,195,100,0.06)] hover:text-[#fcecc8]'
                  }`}
                >
                  <span className={`h-2 w-2 shrink-0 rounded-sm ${activeProjectId === project._id ? 'bg-[#e6c364]' : 'bg-transparent'}`} />
                  <span className="min-w-0 break-words">{project.name}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex gap-1 rounded-md border border-[rgba(242,207,141,0.1)] bg-[rgba(0,0,0,0.2)] p-1">
          {([
            ['layouts', 'Планировки'],
            ['floors',  'Поэтажные планы'],
          ] as const).map(([t, lbl]) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-md px-4 py-2 text-[15px] font-normal whitespace-nowrap transition-colors ${
                tab === t
                  ? 'bg-[rgba(201,168,76,0.15)] text-[#fcecc8]'
                  : 'text-[rgba(242,207,141,0.72)] hover:text-[rgba(242,207,141,0.85)]'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {tab === 'layouts' ? <LayoutManagerView /> : <FloorPlanEditor />}
    </div>
  )
}
