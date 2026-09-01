import type { NewBuildingItem, PublicUnitLanding } from '@/services/developmentApi'
import { developmentApi } from '@/services/developmentApi'

const U = (id: string, w = 1000) => `https://images.unsplash.com/${id}?w=${w}&q=80&auto=format&fit=crop`

/** Демо-карточки с `#/dashboard/new-buildings` (те же URL, что в списке). */
export const NEW_BUILDINGS_DEMO_IMAGES: Record<string, string[]> = {
  c1: [
    U('photo-1545324418-cc1a3fa10c00'),
    U('photo-1512917774080-9991f1c4c750'),
    U('photo-1486406146926-c627a92ad1ab'),
    U('photo-1502672260266-1c1ef2d93688'),
  ],
  c2: [
    U('photo-1486325212027-8081e485255e'),
    U('photo-1517292987719-0369a794ec0f'),
    U('photo-1493809842364-78817add7ffb'),
  ],
}

/** Все демо-фото с `#/dashboard/new-buildings` (Unsplash), если у ЖК нет своих в каталоге. */
export const ALL_NEW_BUILDINGS_STOCK_IMAGES: string[] = Object.values(NEW_BUILDINGS_DEMO_IMAGES)
  .flat()
  .filter((u, i, arr) => arr.indexOf(u) === i)

/** Первое фото карточек `#/dashboard/new-buildings` — фон визитки по умолчанию. */
export const NEW_BUILDINGS_HERO_IMAGE = ALL_NEW_BUILDINGS_STOCK_IMAGES[0]

function upscaleCatalogImage(url: string): string {
  if (!url.includes('unsplash.com')) return url
  const base = url.split('?')[0]
  return `${base}?auto=format&fit=crop&w=2560&q=90`
}

/** Одно фото для hero визитки: обложка ЖК или сток с new-buildings. */
export function resolvePremiumHeroImage(options: {
  coverUrl?: string | null
  catalogImages?: string[]
}): string {
  const fromProject = options.coverUrl ?? options.catalogImages?.find(Boolean)
  if (fromProject) return upscaleCatalogImage(fromProject)
  return upscaleCatalogImage(NEW_BUILDINGS_HERO_IMAGE)
}

type CatalogSnapshot = Pick<
  NewBuildingItem,
  'developer' | 'city' | 'country' | 'images'
>

/** Демо-метаданные карточек — те же, что на `#/dashboard/new-buildings`. */
const DEMO_CATALOG: Record<string, CatalogSnapshot> = {
  c1: {
    developer: 'Batumi Prime Dev',
    city: 'Батуми',
    country: 'Грузия',
    images: NEW_BUILDINGS_DEMO_IMAGES.c1,
  },
  c2: {
    developer: 'Global Realty',
    city: 'Батуми',
    country: 'Грузия',
    images: NEW_BUILDINGS_DEMO_IMAGES.c2,
  },
}

let catalogCache: Map<string, CatalogSnapshot> | null = null

async function loadCatalogMap(): Promise<Map<string, CatalogSnapshot>> {
  if (catalogCache) return catalogCache

  const map = new Map<string, CatalogSnapshot>()
  try {
    const resp = await developmentApi.getNewBuildings({ page: 1, limit: 100 })
    if (resp.success) {
      for (const item of resp.data.items) {
        map.set(item.id, {
          developer: item.developer,
          city: item.city,
          country: item.country,
          images: (item.images ?? []).filter(Boolean),
        })
      }
    }
  } catch {
    /* каталог недоступен — останутся демо / fallback */
  }

  catalogCache = map
  return map
}

function resolveCatalogSnapshot(complexId: string): CatalogSnapshot | undefined {
  return DEMO_CATALOG[complexId]
}

/** Те же `images[]`, что на странице «Жилые комплексы» (`GET /development/newbuildings`). */
export async function fetchNewBuildingsCatalogImages(complexId: string): Promise<string[]> {
  const demo = DEMO_CATALOG[complexId]
  if (demo?.images?.length) return demo.images

  const map = await loadCatalogMap()
  return map.get(complexId)?.images ?? []
}

/** Каталог новостроек: фото, город, страна, застройщик — как на `#/dashboard/new-buildings`. */
export async function enrichLandingWithCatalogImages(
  landing: PublicUnitLanding,
): Promise<PublicUnitLanding> {
  const complexId = landing.complex.id
  const hasProjectGallery = !!(
    landing.complex.renders?.length ||
    landing.complex.images?.length ||
    landing.complex.coverUrl ||
    landing.complex.cover?.url
  )

  if (hasProjectGallery) {
    const images = landing.complex.images?.length
      ? landing.complex.images
      : (landing.complex.renders ?? []).map((file) => file.url).filter(Boolean)

    return {
      ...landing,
      complex: {
        ...landing.complex,
        images,
        coverUrl: landing.complex.coverUrl ?? landing.complex.cover?.url ?? images[0] ?? null,
      },
    }
  }

  const demo = resolveCatalogSnapshot(complexId)
  const fromApi = demo ? undefined : (await loadCatalogMap()).get(complexId)
  const catalog = demo ?? fromApi

  const catalogImages = catalog?.images?.length
    ? catalog.images
    : await fetchNewBuildingsCatalogImages(complexId)
  const images = catalogImages.length > 0 ? catalogImages : ALL_NEW_BUILDINGS_STOCK_IMAGES

  return {
    ...landing,
    complex: {
      ...landing.complex,
      images,
      coverUrl: images[0] ?? null,
      renders: images.map((url, index) => ({
        id: `catalog-${index}`,
        name: `render-${index + 1}`,
        url,
        mimeType: 'image/jpeg',
        size: 0,
        createdAt: '',
      })),
      developer: catalog?.developer || landing.complex.developer,
      city: catalog?.city || landing.complex.city,
      country: catalog?.country || landing.complex.country,
    },
  }
}
