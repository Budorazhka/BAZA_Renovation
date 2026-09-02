import { useSyncExternalStore } from 'react'

import type {
  Building,
  FloorPlan,
  FloorPlanPolygon,
  Project,
  SvgPolygonPoint,
  Unit,
  UnitRoomType,
  UnitStatus,
  UnitView,
} from '@/types/property'

interface PropertyStoreState {
  projects: Project[]
  activeProject: Project | null
  isLoading: boolean
  setActiveProject: (projectId: string) => void
  addUnit: (projectId: string, buildingId: string, unit: Unit) => void
  addUnits: (projectId: string, buildingId: string, units: Unit[]) => void
  loadMockProjects: () => Promise<void>
}

const roomTypeSequence: readonly UnitRoomType[] = ['studio', '1+1', '2+1', '2+1']
const viewSequence: readonly UnitView[] = ['mountains', 'sea', 'sea', 'mountains']
const statusSequence: readonly UnitStatus[] = ['available', 'reserved', 'sold', 'available']
const polygonFillByStatus: Record<UnitStatus, string> = {
  available: 'rgba(15, 118, 110, 0.18)',
  reserved: 'rgba(217, 119, 6, 0.18)',
  sold: 'rgba(220, 38, 38, 0.2)',
}

function createPolygonPoints(columnIndex: number, rowIndex: number): SvgPolygonPoint[] {
  const baseX = 48 + columnIndex * 252
  const baseY = 56 + rowIndex * 230
  const width = 212
  const height = 168

  return [
    { x: baseX, y: baseY },
    { x: baseX + width, y: baseY },
    { x: baseX + width, y: baseY + height },
    { x: baseX, y: baseY + height },
  ]
}

function createFloorPlanPolygon(
  buildingId: string,
  floorNumber: number,
  index: number,
  unitId: string,
  status: UnitStatus,
): FloorPlanPolygon {
  return {
    id: `${buildingId}-floor-${floorNumber}-zone-${index + 1}`,
    label: `Лот ${index + 1}`,
    unitId,
    points: createPolygonPoints(index % 2, Math.floor(index / 2)),
    fill: polygonFillByStatus[status],
    stroke: 'rgba(15, 23, 42, 0.45)',
  }
}

function createFloorPlan(buildingId: string, floorNumber: number, polygons: FloorPlanPolygon[]): FloorPlan {
  return {
    id: `${buildingId}-floor-plan-${floorNumber}`,
    buildingId,
    floorNumber,
    imageUrl: `https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=1600&q=80&floor=${floorNumber}`,
    viewport: {
      width: 560,
      height: 520,
    },
    polygons,
  }
}

function createMockBuilding(params: {
  id: string
  name: string
  totalFloors: number
  elevatorCount: number
  unitNumberPrefix: string
  priceOffset: number
}): Building {
  const units: Unit[] = []
  const floorPlans: FloorPlan[] = []
  const modeledTopFloor = Math.min(params.totalFloors, 4)

  for (let floorNumber = 2; floorNumber <= modeledTopFloor; floorNumber += 1) {
    const floorUnits: Unit[] = []
    const polygons: FloorPlanPolygon[] = []

    for (let unitIndex = 0; unitIndex < 4; unitIndex += 1) {
      const unitId = `${params.id}-unit-${floorNumber}-${unitIndex + 1}`
      const status = statusSequence[(floorNumber + unitIndex + params.priceOffset) % statusSequence.length]
      const floorPlanId = `${params.id}-floor-plan-${floorNumber}`
      const roomType = roomTypeSequence[(floorNumber + unitIndex) % roomTypeSequence.length]
      const areaSqm = 52 + unitIndex * 11 + floorNumber * 1.5 + params.priceOffset
      const price = 185000 + floorNumber * 18500 + unitIndex * 23500 + params.priceOffset * 12000
      const polygon = createFloorPlanPolygon(params.id, floorNumber, unitIndex, unitId, status)

      const unit: Unit = {
        id: unitId,
        buildingId: params.id,
        floorPlanId,
        floorNumber,
        number: `${params.unitNumberPrefix}-${floorNumber}${unitIndex + 1}`,
        roomType,
        areaSqm: Number(areaSqm.toFixed(1)),
        price,
        view: viewSequence[(unitIndex + params.priceOffset) % viewSequence.length],
        status,
        polygonId: polygon.id,
      }

      polygons.push(polygon)
      floorUnits.push(unit)
    }

    units.push(...floorUnits)
    floorPlans.push(createFloorPlan(params.id, floorNumber, polygons))
  }

  return {
    id: params.id,
    name: params.name,
    totalFloors: params.totalFloors,
    elevatorCount: params.elevatorCount,
    floorPlans,
    units,
  }
}

function createMockProjects(): Project[] {
  return [
    {
      id: 'project-azure-cliff',
      name: 'Azure Cliff Residences',
      location: {
        country: 'Georgia',
        city: 'Batumi',
        district: 'New Boulevard',
        address: 'Lech and Maria Kaczynski Street 12',
        coordinates: {
          lat: 41.6168,
          lng: 41.6367,
        },
      },
      handoverDeadline: '2027-11-30',
      amenities: [
        'Infinity pool on the roof',
        'Private wellness spa',
        'Concierge 24/7',
        'Sea-view lounge',
        'Valet parking',
        'Signature coworking',
      ],
      description:
        'Премиальный жилой комплекс у моря с сервисной моделью управления, цифровой шахматкой и интерактивными планами этажей.',
      buildings: [
        createMockBuilding({
          id: 'building-a',
          name: 'Блок А',
          totalFloors: 18,
          elevatorCount: 3,
          unitNumberPrefix: 'A',
          priceOffset: 0,
        }),
        createMockBuilding({
          id: 'building-b',
          name: 'Блок B',
          totalFloors: 22,
          elevatorCount: 4,
          unitNumberPrefix: 'B',
          priceOffset: 1,
        }),
      ],
    },
  ]
}

const listeners = new Set<() => void>()
let storeState: PropertyStoreState

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function setStoreState(partial: Partial<PropertyStoreState> | ((state: PropertyStoreState) => Partial<PropertyStoreState>)) {
  const nextPartial = typeof partial === 'function' ? partial(storeState) : partial
  storeState = { ...storeState, ...nextPartial }
  emit()
}

function resolveActiveProject(projects: Project[], activeProjectId: string | null): Project | null {
  if (!activeProjectId) return projects[0] ?? null
  return projects.find((project) => project.id === activeProjectId) ?? projects[0] ?? null
}

const initialProjects = createMockProjects()

storeState = {
  projects: initialProjects,
  activeProject: initialProjects[0] ?? null,
  isLoading: false,
  setActiveProject: (projectId) => {
    setStoreState((state) => ({
      activeProject: state.projects.find((project) => project.id === projectId) ?? state.activeProject,
    }))
  },
  addUnit: (projectId, buildingId, unit) => {
    storeState.addUnits(projectId, buildingId, [unit])
  },
  addUnits: (projectId, buildingId, units) => {
    setStoreState((state) => {
      const nextProjects = state.projects.map((project) => {
        if (project.id !== projectId) return project
        return {
          ...project,
          buildings: project.buildings.map((building) => {
            if (building.id !== buildingId) return building
            const unitMap = new Map(building.units.map((buildingUnit) => [buildingUnit.id, buildingUnit]))
            for (const unit of units) unitMap.set(unit.id, unit)
            return { ...building, units: Array.from(unitMap.values()) }
          }),
        }
      })

      return {
        projects: nextProjects,
        activeProject: resolveActiveProject(nextProjects, state.activeProject?.id ?? null),
      }
    })
  },
  loadMockProjects: async () => {
    setStoreState({ isLoading: true })
    await new Promise<void>((resolve) => {
      globalThis.setTimeout(resolve, 450)
    })
    const nextProjects = createMockProjects()
    setStoreState({
      projects: nextProjects,
      activeProject: nextProjects[0] ?? null,
      isLoading: false,
    })
  },
}

export function usePropertyStore<T>(selector: (state: PropertyStoreState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(storeState),
    () => selector(storeState),
  )
}
