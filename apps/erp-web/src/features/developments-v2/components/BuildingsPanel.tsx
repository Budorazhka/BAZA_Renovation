import { useState } from 'react'
import { AlertCircle, Building2, Plus, RefreshCw } from 'lucide-react'
import type { BuildingV2 } from '@/services/developmentsApiV2'
import { BuildingForm } from './BuildingForm'

interface BuildingsPanelProps {
  developmentId: string
  buildings: BuildingV2[]
  loading: boolean
  error: string | null
  onRetry: () => void
  selectedBuildingId: string | null
  onSelectBuilding: (buildingId: string) => void
  onCreated: (building: BuildingV2) => void
  canCreate: boolean
}

/** D-02 COMPLETE: список Building + форма создания, выбор активного building. */
export function BuildingsPanel({
  developmentId,
  buildings,
  loading,
  error,
  onRetry,
  selectedBuildingId,
  onSelectBuilding,
  onCreated,
  canCreate,
}: BuildingsPanelProps) {
  const [formOpen, setFormOpen] = useState(false)

  return (
    <section className="rounded-md bg-[var(--green-card)] p-5 shadow-[inset_0_0_0_1px_rgba(201,168,76,0.18)]">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[24px] font-medium tracking-[-0.02em] text-[color:var(--app-text)]">Корпуса</h2>
        {canCreate && !formOpen && (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="flex items-center gap-2 rounded-sm border border-[color:var(--green-border)] bg-transparent px-4 py-2 text-[16px] font-normal text-[color:var(--app-text-muted)] hover:bg-[color-mix(in_srgb,var(--gold)_10%,transparent)] hover:text-[color:var(--app-text)]"
          >
            <Plus className="size-4" />
            Добавить корпус
          </button>
        )}
      </div>

      {formOpen && (
        <div className="mb-4">
          <BuildingForm
            developmentId={developmentId}
            onCreated={(building) => {
              onCreated(building)
              setFormOpen(false)
            }}
            onCancel={() => setFormOpen(false)}
          />
        </div>
      )}

      {loading ? (
        <div data-testid="buildings-loading" className="flex min-h-[120px] flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="relative size-8">
            <span className="absolute inset-0 rounded-full border-2 border-[color:color-mix(in_srgb,var(--gold)_20%,transparent)]" />
            <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-[var(--gold)]" />
          </div>
          <p className="text-[16px] font-normal text-[color:var(--app-text-muted)]">Загрузка корпусов…</p>
        </div>
      ) : error ? (
        <div data-testid="buildings-error" className="flex min-h-[120px] flex-col items-center justify-center gap-3 p-6 text-center">
          <AlertCircle className="size-6 text-[#ffb4ab]" />
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
      ) : buildings.length === 0 ? (
        <div className="flex min-h-[120px] flex-col items-center justify-center gap-2 p-6 text-center">
          <Building2 className="size-8 text-[color:var(--app-text-muted)]" />
          <p className="text-[16px] font-normal text-[color:var(--app-text-muted)]">Корпусов пока нет</p>
        </div>
      ) : (
        <div data-testid="buildings-list" className="flex flex-col gap-2">
          {buildings.map((building) => (
            <button
              key={building._id}
              type="button"
              onClick={() => onSelectBuilding(building._id)}
              className={`flex items-center justify-between rounded-sm px-4 py-3 text-left text-[16px] font-normal transition-colors ${
                selectedBuildingId === building._id
                  ? 'bg-[color-mix(in_srgb,var(--gold)_18%,transparent)] text-[color:var(--app-text)]'
                  : 'bg-[rgba(3,29,22,0.5)] text-[color:var(--app-text-muted)] hover:bg-[color-mix(in_srgb,var(--gold)_10%,transparent)] hover:text-[color:var(--app-text)]'
              }`}
            >
              <span>{building.name}</span>
              <span className="text-[16px] text-[color:var(--app-text-muted)]">{building.floorsCount} этажей</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
