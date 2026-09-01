import axios from 'axios'
import { BAZA_PUBLIC_API_BASE_URL } from '@/config/backend'
import { decodeJwtPayload } from '@/features/crm/services/api/client'
import type { PropertyCategory, PropertyType } from '@/components/management/my-properties/types'

export const CATALOG_PAGE_SIZE = 20

type SearchDealType = 'sale' | 'rent'
export type CatalogTypeFilter = PropertyType | 'all'

export interface CatalogQuery {
  dealType: SearchDealType
  propertyType?: string
}

export interface CatalogFilters {
  cityCodes?: string[]
  rooms?: string[]
  priceFrom?: string
  priceTo?: string
  pricePerMonthFrom?: string
  pricePerMonthTo?: string
  areaFrom?: string
  areaTo?: string
}

export interface CatalogPageResult {
  items: EstateApartmentApi[]
  total: number
  hasMore: boolean
}

interface SearchStreamDef {
  query: CatalogQuery
  searchPropertyType: 'secondary' | 'commercial'
  searchSubType?: string
}

interface CatalogStream {
  def: SearchStreamDef
  total: number
}

interface SearchV3Response {
  estateApartments?: Array<{ _id: string }>
}

const bazaApi = axios.create({
  baseURL: BAZA_PUBLIC_API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

const streamsCache = new Map<string, CatalogStream[]>()
const totalCache = new Map<string, number>()
const searchIdsCache = new Map<string, string[]>()
const authorApartmentsCache = new Map<string, EstateApartmentApi[]>()

const DETAIL_FETCH_BATCH = 10

export interface EstateApartmentAuthor {
  _id: string
  username?: string
  email?: string
}

export interface EstateApartmentBuilding {
  _id?: string
  title?: string
  address?: string
  coordinates?: number[]
}

export interface EstateApartmentApi {
  _id: string
  title?: string
  description?: string
  dealType?: string
  status?: string
  propertyType?: string
  buildingType?: string
  rooms?: string
  area?: number
  price?: number
  price_sqm?: number
  price_per_month?: number
  address?: string
  city?: string
  country?: string
  floor?: number
  totalFloors?: number
  images?: string[]
  commissionMls?: number
  commission?: number
  createdAt?: string
  updatedAt?: string
  author?: EstateApartmentAuthor
  building?: EstateApartmentBuilding
  coordinates?: number[]
  viewTypes?: string[]
  roadType?: string
  coastline?: string
  renovation?: string
  bathroom?: string
  bathroomCount?: number
  balcony?: string
  ceilingHeight?: string
  elevator?: string
  parkingTypes?: string[]
  wallMaterial?: string
  gas?: boolean
  waterSupply?: string
  sewage?: string
  landType?: string
  electricity?: boolean
  amenities?: string[]
  mortgageAvailable?: boolean
  installmentAvailable?: boolean
  priceOnRequest?: boolean
}

// TODO(demo): временный мок-фолбэк на период, пока в ERP нет реальной авторизации
// через baza.sale (localStorage.userId/jwt_token не проставляются моковым логином).
// Убрать DEMO_AUTHOR_ID/DEMO_APARTMENTS и связанные с ними фолбэки, когда появится
// настоящий вход в baza.sale-аккаунт.
const DEMO_AUTHOR_ID = 'demo-agent'
const IMG = (id: string) => `https://images.unsplash.com/${id}?w=1200&q=80&auto=format&fit=crop`
const DEMO_AUTHOR: EstateApartmentAuthor = { _id: DEMO_AUTHOR_ID, username: 'demo_agent' }

const DEMO_APARTMENTS: EstateApartmentApi[] = [
  {
    _id: 'demo-1',
    title: '3-комнатная квартира с видом на море',
    description: 'Просторная квартира в новом доме, ремонт под ключ, вид на море и горы.',
    dealType: 'sale',
    status: 'active',
    propertyType: 'apartment',
    buildingType: 'residential',
    rooms: '3',
    area: 96,
    price: 187000,
    price_sqm: 1948,
    commissionMls: 3,
    commission: 3,
    address: 'ул. Ниношвили, 14',
    city: 'batumi',
    country: 'GE',
    floor: 9,
    totalFloors: 22,
    images: [IMG('photo-1600585154340-be6161a56a0c'), IMG('photo-1600047509807-ba8f99d2cdde')],
    createdAt: '2026-05-10T00:00:00.000Z',
    updatedAt: '2026-07-05T00:00:00.000Z',
    author: DEMO_AUTHOR,
  },
  {
    _id: 'demo-2',
    title: '2-комнатная квартира в центре',
    description: 'Вторичка в тихом центре, требует освежить ремонт.',
    dealType: 'sale',
    status: 'active',
    propertyType: 'apartment',
    buildingType: 'residential',
    rooms: '2',
    area: 61,
    price: 98000,
    price_sqm: 1606,
    commissionMls: 3,
    commission: 3,
    address: 'пр. Руставели, 32',
    city: 'tbilisi',
    country: 'GE',
    floor: 4,
    totalFloors: 9,
    images: [IMG('photo-1600607687939-ce8a6c25118c')],
    createdAt: '2026-03-20T00:00:00.000Z',
    updatedAt: '2026-06-18T00:00:00.000Z',
    author: DEMO_AUTHOR,
  },
  {
    _id: 'demo-3',
    title: '1-комнатная квартира у моря',
    description: 'Забронирована, сделка на финальной стадии.',
    dealType: 'sale',
    status: 'booked',
    propertyType: 'apartment',
    buildingType: 'residential',
    rooms: '1',
    area: 42,
    price: 64000,
    price_sqm: 1524,
    commissionMls: 3,
    commission: 3,
    address: 'ул. Кобаладзе, 7',
    city: 'batumi',
    country: 'GE',
    floor: 12,
    totalFloors: 18,
    images: [IMG('photo-1600566753190-17f0baa2a6c3')],
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-06-25T00:00:00.000Z',
    author: DEMO_AUTHOR,
  },
  {
    _id: 'demo-4',
    title: '2-комнатная квартира посуточно',
    description: 'Аренда с мебелью, рядом набережная.',
    dealType: 'rent',
    status: 'active',
    propertyType: 'apartment',
    buildingType: 'residential',
    rooms: '2',
    area: 58,
    price_per_month: 850,
    commission: 50,
    address: 'ул. Горгиладзе, 18',
    city: 'batumi',
    country: 'GE',
    floor: 6,
    totalFloors: 14,
    images: [IMG('photo-1522708323590-d24dbb6b0267')],
    createdAt: '2026-05-15T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    author: DEMO_AUTHOR,
  },
  {
    _id: 'demo-5',
    title: 'Торговое помещение на первой линии',
    description: 'Готовый арендный бизнес, стрит-ритейл.',
    dealType: 'sale',
    status: 'active',
    propertyType: 'commercial',
    buildingType: 'commercial',
    rooms: '0',
    area: 145,
    price: 260000,
    price_sqm: 1793,
    commissionMls: 3,
    commission: 3,
    address: 'пр. Агмашенебели, 51',
    city: 'tbilisi',
    country: 'GE',
    floor: 1,
    totalFloors: 6,
    images: [IMG('photo-1517292987719-0369a794ec0f')],
    createdAt: '2026-02-20T00:00:00.000Z',
    updatedAt: '2026-06-10T00:00:00.000Z',
    author: DEMO_AUTHOR,
  },
  {
    _id: 'demo-6',
    title: 'Дом с участком в пригороде',
    description: 'Два этажа, гараж, сад 6 соток.',
    dealType: 'sale',
    status: 'active',
    propertyType: 'house',
    buildingType: 'residential',
    rooms: '5',
    area: 210,
    price: 245000,
    price_sqm: 1167,
    commissionMls: 3,
    commission: 3,
    address: 'с. Дигоми, ул. Садовая, 3',
    city: 'tbilisi',
    country: 'GE',
    floor: 0,
    totalFloors: 2,
    images: [IMG('photo-1493809842364-78817add7ffb')],
    createdAt: '2026-01-25T00:00:00.000Z',
    updatedAt: '2026-05-30T00:00:00.000Z',
    author: DEMO_AUTHOR,
  },
]

/** ID автора на baza.sale — из localStorage или JWT, либо демо-фолбэк (см. TODO выше). */
export function resolveAuthorUserId(): string {
  const stored = localStorage.getItem('userId')?.trim()
  if (stored) return stored

  const token = localStorage.getItem('jwt_token')
  if (token) {
    const payload = decodeJwtPayload(token)
    if (payload?.id?.trim()) return payload.id.trim()
  }

  return DEMO_AUTHOR_ID
}

export function hasCatalogFilters(filters?: CatalogFilters): boolean {
  if (!filters) return false
  return Boolean(
    filters.cityCodes?.length ||
      filters.rooms?.length ||
      filters.priceFrom ||
      filters.priceTo ||
      filters.pricePerMonthFrom ||
      filters.pricePerMonthTo ||
      filters.areaFrom ||
      filters.areaTo,
  )
}

function cacheKey(
  category: PropertyCategory,
  typeFilter: CatalogTypeFilter,
  filters?: CatalogFilters,
): string {
  return JSON.stringify({ category, typeFilter, filters: filters ?? null })
}

/** Потоки каталога — как на baza.sale/rent и /app/secondary/commercial */
function catalogStreamDefs(category: PropertyCategory): SearchStreamDef[] {
  switch (category) {
    case 'rent':
      return [
        {
          query: { dealType: 'rent', propertyType: 'apartment' },
          searchPropertyType: 'secondary',
          searchSubType: 'apartments',
        },
        {
          query: { dealType: 'rent', propertyType: 'cottages' },
          searchPropertyType: 'secondary',
          searchSubType: 'cottages',
        },
        {
          query: { dealType: 'rent', propertyType: 'house' },
          searchPropertyType: 'secondary',
          searchSubType: 'houses',
        },
      ]
    case 'commercial':
      return [
        {
          query: { dealType: 'sale', propertyType: 'commercial' },
          searchPropertyType: 'commercial',
        },
      ]
    case 'other':
      return [
        {
          query: { dealType: 'sale', propertyType: 'cottages' },
          searchPropertyType: 'secondary',
          searchSubType: 'cottages',
        },
        {
          query: { dealType: 'sale', propertyType: 'house' },
          searchPropertyType: 'secondary',
          searchSubType: 'houses',
        },
        {
          query: { dealType: 'sale', propertyType: 'land' },
          searchPropertyType: 'secondary',
          searchSubType: 'land',
        },
      ]
    default:
      return [
        {
          query: { dealType: 'sale', propertyType: 'apartment' },
          searchPropertyType: 'secondary',
          searchSubType: 'apartments',
        },
      ]
  }
}

function matchesTypeFilter(def: SearchStreamDef, typeFilter: CatalogTypeFilter): boolean {
  if (typeFilter === 'all') return true
  const propertyType = def.query.propertyType

  switch (typeFilter) {
    case 'Квартира':
    case 'Апартаменты':
      return propertyType === 'apartment'
    case 'Дом':
      return propertyType === 'cottages' || propertyType === 'house'
    case 'Участок':
      return propertyType === 'land'
    case 'Коммерция':
      return propertyType === 'commercial'
    default:
      return true
  }
}

function selectStreamDefs(
  category: PropertyCategory,
  typeFilter: CatalogTypeFilter = 'all',
): SearchStreamDef[] {
  return catalogStreamDefs(category).filter((def) => matchesTypeFilter(def, typeFilter))
}

function appendSearchParams(params: URLSearchParams, filters?: CatalogFilters) {
  if (!filters) return

  if (filters.rooms?.length) {
    params.set('rooms', filters.rooms.join(','))
  }
  if (filters.priceFrom) params.set('price_from', filters.priceFrom)
  if (filters.priceTo) params.set('price_to', filters.priceTo)
  if (filters.pricePerMonthFrom) params.set('price_per_month_from', filters.pricePerMonthFrom)
  if (filters.pricePerMonthTo) params.set('price_per_month_to', filters.pricePerMonthTo)
  if (filters.areaFrom) params.set('area_from', filters.areaFrom)
  if (filters.areaTo) params.set('area_to', filters.areaTo)
}

function buildSearchParams(def: SearchStreamDef, filters?: CatalogFilters, cityCode?: string) {
  const params = new URLSearchParams({
    deal_type: def.query.dealType,
    property_type: def.searchPropertyType,
    sort: 'dateDesc',
  })
  if (def.searchSubType) params.set('property_sub_type', def.searchSubType)
  if (cityCode) params.set('city', cityCode)
  appendSearchParams(params, filters)
  return params
}

async function fetchApartmentList(
  query: CatalogQuery,
  skip = 0,
  limit = CATALOG_PAGE_SIZE,
  filters?: CatalogFilters,
): Promise<EstateApartmentApi[]> {
  const params = new URLSearchParams({
    deal_type: query.dealType,
    skip: String(skip),
    limit: String(limit),
  })
  if (query.propertyType) params.set('property_type', query.propertyType)
  if (filters?.cityCodes?.length === 1) params.set('city', filters.cityCodes[0])

  const { data } = await bazaApi.get<EstateApartmentApi[]>(`/estate-apartments?${params.toString()}`)
  return Array.isArray(data) ? data : []
}

async function searchStreamIds(def: SearchStreamDef, filters?: CatalogFilters): Promise<string[]> {
  const cityCodes = filters?.cityCodes?.length ? filters.cityCodes : [undefined]
  const ids = new Set<string>()

  for (const cityCode of cityCodes) {
    const params = buildSearchParams(def, filters, cityCode)
    const { data } = await bazaApi.get<SearchV3Response>(`/search/v3?${params.toString()}`)
    for (const item of data.estateApartments ?? []) {
      if (item._id) ids.add(item._id)
    }
  }

  return [...ids]
}

async function streamSearchTotal(def: SearchStreamDef): Promise<number> {
  const params = buildSearchParams(def)
  const { data } = await bazaApi.get<SearchV3Response>(`/search/v3?${params.toString()}`)
  return data.estateApartments?.length ?? 0
}

async function countListItems(query: CatalogQuery): Promise<number> {
  let total = 0
  let skip = 0
  const step = 100

  while (true) {
    const batch = await fetchApartmentList(query, skip, step)
    total += batch.length
    if (batch.length < step) break
    skip += step
  }

  return total
}

async function resolveStreamTotals(defs: SearchStreamDef[]): Promise<CatalogStream[]> {
  return Promise.all(
    defs.map(async (def) => {
      const fromSearch = await streamSearchTotal(def)
      if (fromSearch > 0) return { def, total: fromSearch }

      return { def, total: await countListItems(def.query) }
    }),
  )
}

async function getStreamTotals(
  category: PropertyCategory,
  typeFilter: CatalogTypeFilter = 'all',
  filters?: CatalogFilters,
): Promise<CatalogStream[]> {
  const key = cacheKey(category, typeFilter, filters)
  const cachedStreams = streamsCache.get(key)
  if (cachedStreams) return cachedStreams

  const defs = selectStreamDefs(category, typeFilter)
  const streams = hasCatalogFilters(filters)
    ? await Promise.all(
        defs.map(async (def) => ({
          def,
          total: (await searchStreamIds(def, filters)).length,
        })),
      )
    : await resolveStreamTotals(defs)

  const total = streams.reduce((sum, stream) => sum + stream.total, 0)
  streamsCache.set(key, streams)
  totalCache.set(key, total)
  return streams
}

async function getSearchIds(
  category: PropertyCategory,
  typeFilter: CatalogTypeFilter,
  filters?: CatalogFilters,
): Promise<string[]> {
  const key = cacheKey(category, typeFilter, filters)
  const cached = searchIdsCache.get(key)
  if (cached) return cached

  const defs = selectStreamDefs(category, typeFilter)
  const ids: string[] = []
  const seen = new Set<string>()

  for (const def of defs) {
    for (const id of await searchStreamIds(def, filters)) {
      if (!seen.has(id)) {
        seen.add(id)
        ids.push(id)
      }
    }
  }

  searchIdsCache.set(key, ids)
  return ids
}

async function fetchApartmentsByIds(ids: string[]): Promise<EstateApartmentApi[]> {
  const results: EstateApartmentApi[] = []

  for (let index = 0; index < ids.length; index += DETAIL_FETCH_BATCH) {
    const batch = ids.slice(index, index + DETAIL_FETCH_BATCH)
    const items = await Promise.all(batch.map((id) => getEstateApartment(id)))
    results.push(...items.filter((item): item is EstateApartmentApi => item != null))
  }

  return results
}

async function getEstateApartment(id: string): Promise<EstateApartmentApi | null> {
  const demo = DEMO_APARTMENTS.find((apt) => apt._id === id)
  if (demo) return demo

  try {
    const { data } = await bazaApi.get<EstateApartmentApi>(`/estate-apartments/${id}`)
    return data?._id ? data : null
  } catch {
    return null
  }
}

function apartmentCategory(apt: EstateApartmentApi): PropertyCategory {
  if (apt.dealType === 'rent') return 'rent'
  const type = (apt.propertyType || '').toLowerCase()
  const building = (apt.buildingType || '').toLowerCase()
  if (type.includes('commercial') || building === 'commercial') return 'commercial'
  if (type.includes('land') || type === 'plot') return 'other'
  if (type.includes('house') || type.includes('villa') || type.includes('cottage')) return 'other'
  return 'secondary'
}

function apartmentPropertyType(apt: EstateApartmentApi): PropertyType {
  const type = (apt.propertyType || '').toLowerCase()
  const building = (apt.buildingType || '').toLowerCase()
  if (type.includes('commercial') || building === 'commercial') return 'Коммерция'
  if (type.includes('land') || type === 'plot') return 'Участок'
  if (type.includes('house') || type.includes('villa') || type.includes('cottage')) return 'Дом'
  if (type.includes('apart')) return 'Апартаменты'
  return 'Квартира'
}

function matchesApartmentTypeFilter(apt: EstateApartmentApi, typeFilter: CatalogTypeFilter): boolean {
  if (typeFilter === 'all') return true
  return apartmentPropertyType(apt) === typeFilter
}

function matchesCatalogFilters(
  apt: EstateApartmentApi,
  category: PropertyCategory,
  filters?: CatalogFilters,
): boolean {
  if (!filters) return true

  if (filters.cityCodes?.length) {
    const city = (apt.city || '').toLowerCase()
    if (!filters.cityCodes.some((code) => code.toLowerCase() === city)) return false
  }

  if (filters.rooms?.length) {
    const rooms = (apt.rooms || '').toLowerCase()
    if (!filters.rooms.some((value) => rooms === value || rooms.includes(value))) return false
  }

  const price = category === 'rent' ? (apt.price_per_month ?? apt.price ?? 0) : (apt.price ?? 0)
  if (category === 'rent') {
    if (filters.pricePerMonthFrom && price < Number(filters.pricePerMonthFrom)) return false
    if (filters.pricePerMonthTo && price > Number(filters.pricePerMonthTo)) return false
  } else {
    if (filters.priceFrom && price < Number(filters.priceFrom)) return false
    if (filters.priceTo && price > Number(filters.priceTo)) return false
  }

  if (filters.areaFrom && (apt.area ?? 0) < Number(filters.areaFrom)) return false
  if (filters.areaTo && (apt.area ?? 0) > Number(filters.areaTo)) return false

  return true
}

function filterAuthorApartments(
  items: EstateApartmentApi[],
  category: PropertyCategory,
  filters?: CatalogFilters,
  typeFilter: CatalogTypeFilter = 'all',
): EstateApartmentApi[] {
  return items
    .filter(
      (apt) =>
        apartmentCategory(apt) === category &&
        matchesApartmentTypeFilter(apt, typeFilter) &&
        matchesCatalogFilters(apt, category, filters),
    )
    .sort((a, b) => {
      const left = new Date(a.updatedAt || a.createdAt || 0).getTime()
      const right = new Date(b.updatedAt || b.createdAt || 0).getTime()
      return right - left
    })
}

async function fetchAuthorApartments(userId: string, refresh = false): Promise<EstateApartmentApi[]> {
  if (!refresh) {
    const cached = authorApartmentsCache.get(userId)
    if (cached) return cached
  }

  if (userId === DEMO_AUTHOR_ID) {
    authorApartmentsCache.set(userId, DEMO_APARTMENTS)
    return DEMO_APARTMENTS
  }

  try {
    const { data } = await bazaApi.get<EstateApartmentApi[]>(
      `/estate-apartments/author/${encodeURIComponent(userId)}`,
    )
    const items = Array.isArray(data) ? data : []
    if (items.length === 0) {
      // Моковые userId (lm-1, u1…) не существуют на baza.sale — бэкенд отвечает 200 с
      // пустым массивом, а не ошибкой. См. TODO(demo) у DEMO_AUTHOR_ID выше.
      authorApartmentsCache.set(userId, DEMO_APARTMENTS)
      return DEMO_APARTMENTS
    }
    authorApartmentsCache.set(userId, items)
    return items
  } catch (error) {
    console.error('[secondaryObjectsApi] author fetch failed, falling back to demo data:', error)
    authorApartmentsCache.set(userId, DEMO_APARTMENTS)
    return DEMO_APARTMENTS
  }
}

export const secondaryObjectsApi = {
  getEstateApartment,
  resolveAuthorUserId,

  clearTotalCache() {
    streamsCache.clear()
    totalCache.clear()
    searchIdsCache.clear()
    authorApartmentsCache.clear()
  },

  async getCatalogTotal(
    category: PropertyCategory,
    filters?: CatalogFilters,
    typeFilter: CatalogTypeFilter = 'all',
  ): Promise<number> {
    const key = cacheKey(category, typeFilter, filters)
    const cached = totalCache.get(key)
    if (cached != null) return cached

    const streams = await getStreamTotals(category, typeFilter, filters)
    return streams.reduce((sum, stream) => sum + stream.total, 0)
  },

  async fetchCatalogPage(
    category: PropertyCategory,
    skip = 0,
    limit = CATALOG_PAGE_SIZE,
    filters?: CatalogFilters,
    typeFilter: CatalogTypeFilter = 'all',
  ): Promise<CatalogPageResult> {
    // Как на baza.sale: выдача и порядок из search/v3, детали — по id.
    // /estate-apartments?deal_type=rent|... даёт другой набор, чем на сайте.
    const ids = await getSearchIds(category, typeFilter, filters)
    const slice = ids.slice(skip, skip + limit)
    const items = await fetchApartmentsByIds(slice)

    return {
      items,
      total: ids.length,
      hasMore: skip + slice.length < ids.length,
    }
  },

  async getAuthorCatalogTotal(
    userId: string,
    category: PropertyCategory,
    filters?: CatalogFilters,
    typeFilter: CatalogTypeFilter = 'all',
  ): Promise<number> {
    const items = await fetchAuthorApartments(userId)
    return filterAuthorApartments(items, category, filters, typeFilter).length
  },

  async fetchAuthorCatalogPage(
    userId: string,
    category: PropertyCategory,
    skip = 0,
    limit = CATALOG_PAGE_SIZE,
    filters?: CatalogFilters,
    typeFilter: CatalogTypeFilter = 'all',
  ): Promise<CatalogPageResult> {
    const items = await fetchAuthorApartments(userId)
    const filtered = filterAuthorApartments(items, category, filters, typeFilter)
    const slice = filtered.slice(skip, skip + limit)

    return {
      items: slice,
      total: filtered.length,
      hasMore: skip + slice.length < filtered.length,
    }
  },
}
