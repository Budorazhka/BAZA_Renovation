import type {
  Property,
  PropertyCategory,
  PropertyDetails,
  PropertyType,
  SaleStatus,
} from '@/components/management/my-properties/types'
import type { EstateApartmentApi } from '@/services/secondaryObjectsApi'

const CITY_LABELS: Record<string, string> = {
  batumi: 'Батуми',
  tbilisi: 'Тбилиси',
  kutaisi: 'Кутаиси',
  rustavi: 'Рустави',
  gori: 'Гори',
  zugdidi: 'Зугдиди',
  kvariati: 'Квариати',
}

export function cityLabelToCode(label: string): string | undefined {
  const norm = label.trim().toLowerCase()
  for (const [code, name] of Object.entries(CITY_LABELS)) {
    if (code === norm || name.toLowerCase() === norm) return code
  }
  return undefined
}

const COUNTRY_LABELS: Record<string, string> = {
  GE: 'Грузия',
  TR: 'Турция',
}

function labelCity(code?: string): string {
  if (!code) return ''
  const key = code.trim().toLowerCase()
  return CITY_LABELS[key] ?? code.charAt(0).toUpperCase() + code.slice(1)
}

function labelCountry(code?: string): string {
  if (!code) return 'Грузия'
  return COUNTRY_LABELS[code.trim().toUpperCase()] ?? code
}

function mapStatus(status?: string): SaleStatus {
  switch (status) {
    case 'active':
      return 'for_sale'
    case 'booked':
      return 'booked'
    case 'sold':
      return 'sold'
    case 'moderation':
      return 'moderation'
    case 'draft':
      return 'draft'
    case 'archived':
    case 'archive':
    case 'deleted':
      return 'archive'
    default:
      return 'draft'
  }
}

function parseRooms(rooms?: string, title?: string): number {
  if (rooms) {
    const value = rooms.toLowerCase().trim()
    if (value === 'studio' || value === 'студия' || value === 'stu') return 1
    const match = value.match(/^(\d+)\+(\d+)$/)
    if (match) return Number(match[1]) + 1
    const numeric = Number(value)
    if (Number.isFinite(numeric) && numeric > 0) return numeric
  }
  if (!title) return 0
  const lower = title.toLowerCase()
  if (/\bstudio\b|студи|\bсту\b/.test(lower)) return 1
  const fromTitle = title.match(/(\d+)\+(\d+)/)
  if (fromTitle) return Number(fromTitle[1]) + 1
  return 0
}

function parseAreaFromTitle(title?: string): number {
  if (!title) return 0
  const match = title.match(/(\d+(?:[.,]\d+)?)\s*m[²2]/i)
  if (!match) return 0
  return Number(match[1].replace(',', '.'))
}

function resolveAddress(apt: EstateApartmentApi): string {
  return apt.address || apt.building?.address || ''
}

function mapPropertyType(propertyType?: string, buildingType?: string): PropertyType {
  const type = (propertyType || '').toLowerCase()
  const building = (buildingType || '').toLowerCase()
  if (type.includes('commercial') || building === 'commercial') return 'Коммерция'
  if (type.includes('land') || type === 'plot') return 'Участок'
  if (type.includes('house') || type.includes('villa') || type.includes('cottage')) return 'Дом'
  if (type.includes('apart')) return 'Апартаменты'
  return 'Квартира'
}

function mapCategory(
  dealType?: string,
  propertyType?: string,
  buildingType?: string,
): PropertyCategory {
  if (dealType === 'rent') return 'rent'
  const type = (propertyType || '').toLowerCase()
  const building = (buildingType || '').toLowerCase()
  if (type.includes('commercial') || building === 'commercial') return 'commercial'
  if (type.includes('land') || type === 'plot') return 'other'
  if (type.includes('house') || type.includes('villa') || type.includes('cottage')) return 'other'
  return 'secondary'
}

function toIsoDate(value?: string): string {
  if (!value) return new Date().toISOString().slice(0, 10)
  return value.slice(0, 10)
}

function buildDetails(apt: EstateApartmentApi): PropertyDetails {
  const address = resolveAddress(apt)
  const lat = apt.coordinates?.[0] ?? apt.building?.coordinates?.[0]
  const lng = apt.coordinates?.[1] ?? apt.building?.coordinates?.[1]
  return {
    searchValue: apt.title || '',
    summary: apt.description?.slice(0, 180) || apt.title || '',
    description: apt.description || '',
    address,
    mapLocationLabel: [labelCity(apt.city), address].filter(Boolean).join(', '),
    mapLat: lat != null ? String(lat) : '',
    mapLng: lng != null ? String(lng) : '',
    views: Array.isArray(apt.viewTypes) ? apt.viewTypes : [],
    roadType: apt.roadType || '',
    shoreline: apt.coastline || '',
    renovation: apt.renovation || '',
    bathroomType: apt.bathroom || '',
    bathroomsCount: apt.bathroomCount != null ? String(apt.bathroomCount) : '',
    balconyType: apt.balcony || '',
    ceilingHeight: apt.ceilingHeight || '',
    planFileName: '',
    mediaFileNames: [],
    elevatorOptions: apt.elevator ? [apt.elevator] : [],
    parkingOptions: Array.isArray(apt.parkingTypes) ? apt.parkingTypes : [],
    propertyUsage: [],
    wallMaterial: apt.wallMaterial || '',
    gas: apt.gas ? 'yes' : '',
    waterSupply: apt.waterSupply || '',
    sewage: apt.sewage || '',
    landType: apt.landType || '',
    electricity: apt.electricity ? 'yes' : '',
    amenities: Array.isArray(apt.amenities) ? apt.amenities : [],
    commissionPercent: apt.commission != null ? String(apt.commission) : '',
    sellerType: 'agent',
    mortgageAvailable: Boolean(apt.mortgageAvailable),
    installmentAvailable: Boolean(apt.installmentAvailable),
    priceOnRequest: Boolean(apt.priceOnRequest),
    // commissionMls — процент комиссии по правилам MLS, не флаг публикации в MLS.
    // Пока API не отдаёт inMls, статус берём только из локальных действий пользователя.
    isMls: false,
  }
}

function resolveListingPrice(apt: EstateApartmentApi): number {
  const isRent = apt.dealType === 'rent'
  if (isRent) {
    return apt.price_per_month || apt.price || 0
  }
  return apt.price || apt.price_per_month || 0
}

export function mapEstateApartmentToProperty(apt: EstateApartmentApi): Property {
  const price = resolveListingPrice(apt)
  const address = resolveAddress(apt)
  const area = apt.area ?? parseAreaFromTitle(apt.title) ?? 0
  const images = Array.isArray(apt.images) ? apt.images.filter(Boolean) : []

  return {
    id: apt._id,
    title: apt.title || 'Объект без названия',
    type: mapPropertyType(apt.propertyType, apt.buildingType),
    category: mapCategory(apt.dealType, apt.propertyType, apt.buildingType),
    country: labelCountry(apt.country),
    city: labelCity(apt.city),
    street: address,
    floor: apt.floor ?? 0,
    totalFloors: apt.totalFloors ?? 0,
    rooms: parseRooms(apt.rooms, apt.title),
    area,
    price,
    pricePerM2:
      apt.dealType === 'rent'
        ? price > 0
          ? Math.round(price / 30)
          : 0
        : apt.price_sqm ?? (area > 0 ? Math.round(price / area) : 0),
    listedAt: toIsoDate(apt.createdAt),
    updatedAt: toIsoDate(apt.updatedAt),
    status: mapStatus(apt.status),
    agentId: apt.author?._id || '',
    agentName: apt.author?.username || apt.author?.email || '—',
    photo: images[0],
    photos: images,
    details: buildDetails(apt),
  }
}
