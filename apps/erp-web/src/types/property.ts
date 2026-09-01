export const UNIT_ROOM_TYPES = ['studio', '1+1', '2+1'] as const
export type UnitRoomType = (typeof UNIT_ROOM_TYPES)[number]

export const UNIT_VIEWS = ['sea', 'mountains'] as const
export type UnitView = (typeof UNIT_VIEWS)[number]

export const UNIT_STATUSES = ['available', 'reserved', 'sold'] as const
export type UnitStatus = (typeof UNIT_STATUSES)[number]

export interface GeoPoint {
  lat: number
  lng: number
}

export interface ProjectLocation {
  country: string
  city: string
  district: string
  address: string
  coordinates: GeoPoint
}

export interface SvgPolygonPoint {
  x: number
  y: number
}

export interface FloorPlanPolygon {
  id: string
  label: string
  unitId: string
  points: SvgPolygonPoint[]
  fill?: string
  stroke?: string
}

export interface FloorPlanViewport {
  width: number
  height: number
}

export interface FloorPlan {
  id: string
  buildingId: string
  floorNumber: number
  imageUrl: string
  viewport: FloorPlanViewport
  polygons: FloorPlanPolygon[]
}

export interface Unit {
  id: string
  buildingId: string
  floorPlanId: string
  floorNumber: number
  number: string
  roomType: UnitRoomType
  areaSqm: number
  price: number
  view: UnitView
  status: UnitStatus
  polygonId: string
}

export interface Building {
  id: string
  name: string
  totalFloors: number
  elevatorCount: number
  floorPlans: FloorPlan[]
  units: Unit[]
}

export interface Project {
  id: string
  name: string
  location: ProjectLocation
  handoverDeadline: string
  amenities: string[]
  description: string
  buildings: Building[]
}
