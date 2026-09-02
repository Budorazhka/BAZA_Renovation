import type { Complex, PublicCdnFileRef, PublicUnitLanding } from '@/services/developmentApi'
import { developmentApi } from '@/services/developmentApi'
import { normalizeRooms, normalizeViewType } from '@/lib/project-options'
import { resolvePublicInstallment, resolveUnitModalListPrice } from '@/lib/installment-display'
import { enrichLandingWithCatalogImages } from '@/lib/newbuildings-catalog-images'
import { getBranding } from '@/store/agencyStore'
import type { IBuilding, IProject, InstallmentTerm, IUnit } from '@/types/core'
import type { IInstallmentPlan } from '@/types/installment'

export { parseInstallmentFromStorage, parseInstallmentFromStorage as readInstallmentFromStorage } from '@/lib/installment-display'

function landingListPrice(unit: PublicUnitLanding['unit']): number {
  return resolveUnitModalListPrice({
    price: unit.price,
    pricePerSqm: unit.details?.pricePerSqm,
    area: unit.area,
  })
}

function cdnFromUrl(url: string, id = url, name = ''): PublicCdnFileRef {
  return {
    id,
    name,
    url,
    mimeType: 'image/jpeg',
    size: 0,
    createdAt: '',
  }
}

/** Медиа из API ЖК (`renders` / `constructionProgress`) приходят как FileEntity[] или string[]. */
function toCdnRefs(value: Array<{ url?: string; id?: string; name?: string } | string> | undefined): PublicCdnFileRef[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? cdnFromUrl(item) : cdnFromUrl(item.url ?? '', item.id, item.name ?? '')))
    .filter((ref) => ref.url)
}

interface ComplexInstallmentFields {
  installmentPlans?: IInstallmentPlan[]
  installmentTerms?: InstallmentTerm[]
}

function pickStringList(existing?: string[], fetched?: string[]): string[] | undefined {
  if (existing?.length) return existing
  if (fetched?.length) return fetched
  return existing
}

async function fetchComplexDetails(complexId: string): Promise<Complex | null> {
  try {
    const resp = await developmentApi.getComplexById(complexId)
    if (resp.success && resp.data) return resp.data
  } catch {
    /* публичные посетители без JWT — игнорируем */
  }
  return null
}

function mergeComplexFields(
  target: PublicUnitLanding['complex'],
  source: Complex,
): PublicUnitLanding['complex'] {
  const renders = target.renders?.length ? target.renders : toCdnRefs(source.renders)
  const renderUrls = renders.map((file) => file.url).filter(Boolean)
  const images = target.images?.length ? target.images : renderUrls

  return {
    ...target,
    name: target.name || source.name,
    city: target.city ?? source.city,
    country: target.country ?? source.country,
    address: target.address ?? source.city,
    developer: target.developer ?? source.developer,
    coastline: target.coastline ?? source.coastline,
    classType: target.classType ?? source.class,
    completionDate: target.completionDate ?? source.completionDate ?? source.startDate,
    description: target.description ?? source.description,
    descriptionWhy: target.descriptionWhy ?? source.descriptionSuccess,
    descriptionWho: target.descriptionWho ?? source.descriptionAudience,
    youtubeLink: target.youtubeLink ?? source.youtubeLink,
    paymentTypes: target.paymentTypes?.length ? target.paymentTypes : source.paymentTypes,
    finishTypes: target.finishTypes ?? source.finishTypes,
    wallMaterial: target.wallMaterial ?? source.wallMaterial,
    ceilingHeight: target.ceilingHeight ?? source.ceilingHeight,
    amenities: target.amenities,
    infrastructureInternal: pickStringList(target.infrastructureInternal, source.infrastructureInternal),
    infrastructureExternal: pickStringList(target.infrastructureExternal, source.infrastructureExternal),
    infrastructureLocation: pickStringList(target.infrastructureLocation, source.infrastructureLocation),
    areaPolygon: target.areaPolygon ?? source.areaPolygon,
    coordinates: target.coordinates ?? source.locationCenter,
    locationCenter: target.locationCenter ?? source.locationCenter,
    coverUrl: target.coverUrl ?? source.cover?.url ?? renders[0]?.url ?? images[0] ?? null,
    cover:
      target.cover ??
      (source.cover?.url
        ? cdnFromUrl(source.cover.url, source.cover.id, source.cover.name ?? '')
        : renders[0]),
    renders,
    images: images.length ? images : target.images,
    constructionProgress: target.constructionProgress?.length
      ? target.constructionProgress
      : toCdnRefs(source.constructionProgress),
    districtGallery: target.districtGallery?.length
      ? target.districtGallery
      : toCdnRefs(source.districtGallery),
    districtText: target.districtText ?? source.districtText,
    documents: target.documents?.length
      ? target.documents
      : (source.documents as Array<string | { url?: string }> | undefined)
          ?.map((doc) => (typeof doc === 'string' ? doc : doc.url ?? ''))
          .filter(Boolean),
    rentalYieldShort: target.rentalYieldShort ?? source.rentalYieldShort,
    rentalYieldLong: target.rentalYieldLong ?? source.rentalYieldLong,
    investmentYield: target.investmentYield ?? source.investmentYield,
    rentalText: target.rentalText ?? source.rentalText,
    investmentText: target.investmentText ?? source.investmentText,
    installmentPlans: target.installmentPlans?.length ? target.installmentPlans : source.installmentPlans,
    installmentTerms: target.installmentTerms?.length ? target.installmentTerms : source.installmentTerms,
  }
}

function shouldFetchComplexDetails(complex: PublicUnitLanding['complex']): boolean {
  const hasGallery = !!(
    complex.renders?.length ||
    complex.images?.length ||
    complex.coverUrl ||
    complex.cover?.url
  )
  const hasInfrastructure = !!(
    complex.infrastructureInternal?.length ||
    complex.infrastructureExternal?.length ||
    complex.infrastructureLocation?.length
  )
  const hasInstallments = !!(complex.installmentPlans?.length || complex.installmentTerms?.length)

  return !hasGallery || !hasInfrastructure || !hasInstallments
}

function resolveLandingInstallment(landing: PublicUnitLanding): PublicUnitLanding {
  landing.installment = resolvePublicInstallment(landing.installment, {
    projectId: landing.complex.id,
    projectPlans: landing.complex.installmentPlans,
    projectTerms: landing.complex.installmentTerms,
    unitId: landing.unit.id,
    listPrice: landingListPrice(landing.unit),
  })
  return landing
}

/** Дополняет лендинг медиа/инфраструктурой/рассрочкой из API ЖК. */
async function finalizePublicLanding(
  landing: PublicUnitLanding,
  fetchedComplex?: Complex | null,
): Promise<PublicUnitLanding> {
  if (fetchedComplex) {
    landing.complex = mergeComplexFields(landing.complex, fetchedComplex)
  } else if (landing.complex?.id && shouldFetchComplexDetails(landing.complex)) {
    const fetched = await fetchComplexDetails(landing.complex.id)
    if (fetched) landing.complex = mergeComplexFields(landing.complex, fetched)
  }

  return resolveLandingInstallment(landing)
}

function mapStoreStatus(status: IUnit['status']): PublicUnitLanding['unit']['status'] {
  switch (status) {
    case 'free':
      return 'available'
    case 'booked':
      return 'reserved'
    case 'sold':
      return 'sold'
    default:
      return 'hidden'
  }
}

/** Собрать лендинг из уже загруженных в ERP данных (демо / тот же сеанс). */
export function buildPublicUnitLandingFromStore(
  unitId: string,
  ctx: {
    allUnits: IUnit[]
    buildings: IBuilding[]
    projects: IProject[]
  },
): PublicUnitLanding | null {
  const unit = ctx.allUnits.find((u) => u._id === unitId)
  if (!unit) return null

  const building = ctx.buildings.find((b) => b._id === unit.building)
  const project = building ? ctx.projects.find((p) => p._id === building.project) : undefined

  // Логотип и описание застройщика из настроек (agencyStore) — фолбэк для блока
  // застройщика в превью и PDF. На клиентской ссылке придут с бэкенда.
  const branding = getBranding()
  const agencyLogo = branding.logoDataUrl
  const agencyDescription = branding.description?.trim()

  return finalizePublicLandingSync({
    unit: {
      id: unit._id,
      complexId: building?.project ?? '',
      buildingId: unit.building,
      sectionId: unit.sectionId ?? null,
      sectionName: unit.sectionName ?? null,
      floor: unit.floor,
      number: unit.number,
      rooms: normalizeRooms(unit.rooms) || 'studio',
      roomsStr: unit.rooms,
      area: unit.area ?? 0,
      price: unit.price ?? 0,
      currency: 'USD',
      status: mapStoreStatus(unit.status),
      finishing: 'unknown',
      windowsSide: normalizeViewType(unit.viewType) || 'unknown',
      imageFileId: unit.imageFileId ?? null,
      image: unit.layoutImageUrl
        ? { id: unit.imageFileId ?? '', name: '', url: unit.layoutImageUrl }
        : null,
      floorPlanUrl: unit.floorPlanUrl ?? null,
      floorPlanImage: unit.floorPlanUrl
        ? cdnFromUrl(unit.floorPlanUrl, '', 'Поэтажный план')
        : null,
      details: {
        livingArea: unit.areaLiving,
        balconyArea: unit.areaBalcony,
        viewType: unit.viewType,
        pricePerSqm: unit.pricePerSqm,
        finishPrices: unit.finishPrices,
        promo: unit.promotion?.isActive,
        renovation: typeof unit.customFields?.Отделка === 'string' ? unit.customFields.Отделка : undefined,
      },
      createdAt: '',
      updatedAt: '',
    },
    building: {
      id: building?._id ?? unit.building,
      name: building?.name ?? 'Корпус',
    },
    complex: {
      id: project?._id ?? building?.project ?? '',
      name: project?.name ?? 'Жилой комплекс',
      city: project?.city,
      country: project?.country,
      address: project?.location,
      coastline: project?.coastline,
      developer: project?.developer,
      developerProfile: (agencyLogo || agencyDescription)
        ? {
            name: project?.developer ?? project?.name ?? '',
            image: agencyLogo ?? undefined,
            description: agencyDescription || undefined,
          }
        : undefined,
      completionDate: project?.completionDate,
      description: project?.description,
      descriptionWhy: project?.descriptionSuccess,
      descriptionWho: project?.descriptionAudience,
      youtubeLink: project?.youtubeLink,
      paymentTypes: project?.paymentTypes ?? [],
      finishTypes: project?.finishTypes,
      wallMaterial: project?.wallMaterial,
      ceilingHeight: project?.ceilingHeight,
      classType: project?.classType,
      amenities: project?.amenities,
      infrastructureInternal: project?.infrastructureInternal,
      infrastructureExternal: project?.infrastructureExternal,
      infrastructureLocation: project?.infrastructureLocation,
      areaPolygon: project?.areaPolygon,
      coordinates: project?.locationCenter,
      locationCenter: project?.locationCenter,
      images: project?.renders ?? [],
      coverUrl: project?.renders?.[0] ?? null,
      renders: (project?.renders ?? []).map((url) => cdnFromUrl(url)),
      constructionProgress: (project?.constructionProgress ?? []).map((url) => cdnFromUrl(url)),
      districtGallery: (project?.districtGallery ?? []).map((url) => cdnFromUrl(url)),
      districtText: project?.districtText,
      documents: project?.documents,
      rentalYieldShort: project?.rentalYieldShort,
      rentalYieldLong: project?.rentalYieldLong,
      investmentYield: project?.investmentYield,
      rentalText: project?.rentalText,
      investmentText: project?.investmentText,
    },
  }, {
    installmentPlans: project?.installmentPlans,
    installmentTerms: project?.installmentTerms,
  })
}

function finalizePublicLandingSync(
  landing: PublicUnitLanding,
  extra?: ComplexInstallmentFields,
): PublicUnitLanding {
  if (extra?.installmentPlans || extra?.installmentTerms) {
    landing.complex = {
      ...landing.complex,
      installmentPlans: extra.installmentPlans ?? landing.complex.installmentPlans,
      installmentTerms: extra.installmentTerms ?? landing.complex.installmentTerms,
    }
  }

  return resolveLandingInstallment(landing)
}

/** Загрузка лендинга: публичный API → (при авторизации) units/:id → локальный store. */
export async function loadPublicUnitLanding(
  unitId: string,
  storeCtx?: {
    allUnits: IUnit[]
    buildings: IBuilding[]
    projects: IProject[]
  },
): Promise<{ data: PublicUnitLanding | null; error: string | null }> {
  try {
    const resp = await developmentApi.getPublicUnitById(unitId)
    if (resp.success && resp.data) {
      const landing = await finalizePublicLanding(resp.data)
      const data = await enrichLandingWithCatalogImages(landing)
      return { data, error: null }
    }
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status
    // 404 на старом бэке без эндпоинта — пробуем fallback ниже
    if (status && status !== 404 && status !== 401) {
      // для прочих ошибок тоже пробуем fallback
    }
  }

  const hasToken = typeof localStorage !== 'undefined' && !!localStorage.getItem('jwt_token')
  if (hasToken) {
    try {
      const resp = await developmentApi.getUnitById(unitId)
      if (resp.success && resp.data) {
        const u = resp.data
        let complexResp = null
        if (u.complexId) {
          try {
            complexResp = await developmentApi.getComplexById(u.complexId)
          } catch {
            /* ignore */
          }
        }
        const complex = complexResp?.success ? complexResp.data : null
        const landing = await finalizePublicLanding(
          {
            unit: {
              ...u,
              floorPlanUrl: (u as { floorPlanUrl?: string }).floorPlanUrl ?? null,
            },
            building: {
              id: u.buildingId,
              name: 'Корпус',
            },
            complex: {
              id: u.complexId,
              name: complex?.name ?? 'Жилой комплекс',
            },
          },
          complex,
        )
        const data = await enrichLandingWithCatalogImages(landing)
        return { data, error: null }
      }
    } catch {
      /* fallback to store */
    }
  }

  if (storeCtx) {
    const local = buildPublicUnitLandingFromStore(unitId, storeCtx)
    if (local) {
      const data = await enrichLandingWithCatalogImages(local)
      return { data, error: null }
    }
  }

  return { data: null, error: 'Квартира не найдена' }
}
