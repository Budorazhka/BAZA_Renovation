import { useState } from 'react'
import { AlertCircle, Layers3, Plus, RefreshCw } from 'lucide-react'
import type { FloorV2, SectionV2 } from '@/services/developmentsApiV2'
import { FloorForm } from './FloorForm'

interface FloorsPanelProps {
  buildingId: string
  floors: FloorV2[]
  sections: SectionV2[]
  loading: boolean
  error: string | null
  onRetry: () => void
  onCreated: (floor: FloorV2) => void
  canCreate: boolean
}

/** D-02 COMPLETE: список Floor + форма создания (sectionId select из уже загруженных sections). */
export function FloorsPanel({ buildingId, floors, sections, loading, error, onRetry, onCreated, canCreate }: FloorsPanelProps) {
  const [formOpen, setFormOpen] = useState(false)

  const sortedFloors = [...floors].sort((a, b) => a.floorNumber - b.floorNumber)

  return (
    <section className="rounded-md bg-[var(--green-card)] p-5 shadow-[inset_0_0_0_1px_rgba(201,168,76,0.18)]">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[24px] font-medium tracking-[-0.02em] text-[color:var(--app-text)]">Этажи</h2>
        {canCreate && !formOpen && (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="flex items-center gap-2 rounded-sm border border-[color:var(--green-border)] bg-transparent px-4 py-2 text-[16px] font-normal text-[color:var(--app-text-muted)] hover:bg-[color-mix(in_srgb,var(--gold)_10%,transparent)] hover:text-[color:var(--app-text)]"
          >
            <Plus className="size-4" />
            Добавить этаж
          </button>
        )}
      </div>

      {formOpen && (
        <div className="mb-4">
          <FloorForm
            buildingId={buildingId}
            sections={sections}
            onCreated={(floor) => {
              onCreated(floor)
              setFormOpen(false)
            }}
            onCancel={() => setFormOpen(false)}
          />
        </div>
      )}

      {loading ? (
        <div data-testid="floors-loading" className="flex min-h-[100px] flex-col items-center justify-center gap-2 p-5 text-center">
          <div className="relative size-6">
            <span className="absolute inset-0 rounded-full border-2 border-[color:color-mix(in_srgb,var(--gold)_20%,transparent)]" />
            <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-[var(--gold)]" />
          </div>
          <p className="text-[16px] font-normal text-[color:var(--app-text-muted)]">Загрузка этажей…</p>
        </div>
      ) : error ? (
        <div data-testid="floors-error" className="flex min-h-[100px] flex-col items-center justify-center gap-2 p-5 text-center">
          <AlertCircle className="size-5 text-[#ffb4ab]" />
          <p className="max-w-md text-[16px] font-normal text-[color:var(--app-text-muted)]">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="flex items-center gap-2 rounded-sm border border-[color:var(--gold)] bg-[color-mix(in_srgb,var(--gold)_20%,transparent)] px-4 py-2 text-[16px] font-medium text-[color:var(--app-text)] hover:bg-[color-mix(in_srgb,var(--gold)_30%,transparent)]"
          >
            <RefreshCw className="size-4" />
            Повторить
          </button>
        </div>
      ) : floors.length === 0 ? (
        <div className="flex min-h-[100px] flex-col items-center justify-center gap-1 p-5 text-center">
          <Layers3 className="size-6 text-[color:var(--app-text-muted)]" />
          <p className="text-[16px] font-normal text-[color:var(--app-text-muted)]">Этажей пока нет</p>
        </div>
      ) : (
        <div data-testid="floors-list" className="flex flex-wrap gap-2">
          {sortedFloors.map((floor) => (
            <span key={floor._id} className="rounded-sm bg-[rgba(3,29,22,0.5)] px-3 py-1.5 text-[16px] font-normal text-[color:var(--app-text)]">
              Этаж {floor.floorNumber}
              {floor.floorType && <span className="text-[color:var(--app-text-muted)]"> · {floor.floorType}</span>}
            </span>
          ))}
        </div>
      )}
    </section>
  )
}
