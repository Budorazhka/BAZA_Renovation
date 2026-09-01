import type { FloorTemplateSlot, IBuilding, ILayout, IProject, IUnit, UnitStatus } from '@/types/core'

export const DEMO_PROJECT_ID = 'demo-baza-residence'
export const DEMO_BUILDING_ID = 'demo-baza-residence-tower-a'

export const DEMO_VARFLOORS_PROJECT_ID = 'demo-varfloors'
export const DEMO_VARFLOORS_BUILDING_ID = 'demo-varfloors-tower-a'

const ASSET_ROOT = '/demo-development'
const TYPICAL_FLOOR_PLAN = `${ASSET_ROOT}/baza-typical-floor.png`

export const PROJECTS_MOCK: IProject[] = []

// export const PROJECTS_MOCK: IProject[] = [
//   {
//     _id: DEMO_PROJECT_ID,
//     name: 'ЖК BAZA Residence · Демо',
//     developer: 'BZ26 Development',
//     location: 'Тбилиси, Ваке',
//     classType: 'Премиум',
//     coastline: 'Город',
//     buildingsCount: 1,
//     totalUnits: 28,
//     completionDate: 'IV квартал 2027',
//     startDate: 'II квартал 2025',
//     description:
//       'Камерный городской дом в Ваке на 28 резиденций. Архитектура построена вокруг приватного двора, двухсветного лобби и видовых террас верхних этажей.',
//     descriptionSuccess:
//       'Небольшое количество квартир, готовые дизайнерские планировки и единый сервис управляющей компании создают ликвидный продукт для жизни и долгосрочной аренды.',
//     descriptionAudience:
//       'Для семей, предпринимателей и инвесторов, которым важны центральная локация, приватность, современная инженерия и прогнозируемая стоимость владения.',
//     youtubeLink: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
//     paymentTypes: ['Рассрочка', 'Полная оплата'],
//     installmentTerms: [
//       { type: 'До окончания строительства', downPaymentPercent: 20, durationMonths: 24 },
//       { type: 'Ускоренная', downPaymentPercent: 50, durationMonths: 12 },
//     ],
//     mortgageTerm: {
//       interestRateMin: 9.8,
//       downPaymentPercent: 20,
//       maxTermYears: 20,
//     },
//     realtorScripts: [
//       {
//         question: 'Чем проект отличается от крупных комплексов?',
//         answer: 'В доме всего 28 квартир, поэтому лобби, двор и сервис остаются приватными.',
//       },
//       {
//         question: 'Есть ли готовые планировочные решения?',
//         answer: 'Да. Все лоты привязаны к библиотеке планировок и нанесены на планы этажей.',
//       },
//       {
//         question: 'Подходит ли объект для инвестиций?',
//         answer: 'Локация Ваке, ограниченное предложение и профессиональное управление поддерживают спрос на аренду.',
//       },
//     ],
//     status: 'active',
//     country: 'Грузия',
//     city: 'Тбилиси',
//     propertyType: 'Квартиры',
//     wallMaterial: 'Монолит-кирпич',
//     finishTypes: ['Белый каркас', 'Под ключ'],
//     ceilingHeight: '3,1 м',
//     elevatorTypes: ['Пассажирский', 'Грузовой'],
//     parkingTypes: ['Подземный паркинг'],
//     parkingSpots: 34,
//     viewTypes: ['На двор', 'На горы', 'На город'],
//     hasGas: true,
//     waterSupply: 'Центральное',
//     sewerage: 'Центральная',
//     buildingPermit: true,
//     infrastructureExternal: [
//       'Школа',
//       'Детский сад',
//       'Супермаркет',
//       'Фитнес-клуб',
//       'Парк',
//       'Клиника',
//       'Кафе и рестораны',
//     ],
//     infrastructureInternal: [
//       'Закрытый двор',
//       'Детская площадка',
//       'Коворкинг',
//       'Лобби',
//       'Рецепция',
//       'Кладовые',
//       'Умный дом',
//       'Видеонаблюдение',
//     ],
//     infrastructureLocation: ['Центр города', 'Тихий район', 'Элитный квартал'],
//     areaPolygon: [
//       [41.70992, 44.75232],
//       [41.71024, 44.75271],
//       [41.70994, 44.75311],
//       [41.70961, 44.75268],
//     ],
//     locationCenter: [41.70993, 44.75272],
//     renders: [
//       `${ASSET_ROOT}/render-exterior.svg`,
//       `${ASSET_ROOT}/render-courtyard.svg`,
//       `${ASSET_ROOT}/render-lobby.svg`,
//     ],
//     constructionProgress: [
//       `${ASSET_ROOT}/construction-01.svg`,
//       `${ASSET_ROOT}/construction-02.svg`,
//     ],
//     promotions: [
//       {
//         id: 'demo-promo-top',
//         serviceId: 'boost',
//         durationId: '30d',
//         priceUsd: 0,
//         activatedAt: '2026-01-01T00:00:00.000Z',
//         expiresAt: '2030-01-01T00:00:00.000Z',
//       },
//       {
//         id: 'demo-promo-mark',
//         serviceId: 'object_mark',
//         durationId: '30d',
//         priceUsd: 0,
//         activatedAt: '2026-01-01T00:00:00.000Z',
//         expiresAt: '2030-01-01T00:00:00.000Z',
//         config: 'Полностью заполнен',
//       },
//     ],
//   },
//   // {
//   //   _id: DEMO_VARFLOORS_PROJECT_ID,
//   //   name: 'ЖК Тестовый · Разные этажи',
//   //   developer: 'BZ26 Development',
//   //   location: 'Батуми, Новый бульвар',
//   //   classType: 'Бизнес',
//   //   coastline: 'Вторая линия',
//   //   buildingsCount: 1,
//   //   totalUnits: 31,
//   //   completionDate: 'II квартал 2027',
//   //   startDate: 'III квартал 2025',
//   //   description:
//   //     'Тестовый жилой комплекс для проверки шахматки: ступенчатый корпус, где на каждом этаже разное количество квартир — от шести внизу до одного пентхауса наверху.',
//   //   paymentTypes: ['Рассрочка', 'Полная оплата'],
//   //   status: 'active',
//   //   country: 'Грузия',
//   //   city: 'Батуми',
//   //   propertyType: 'Квартиры',
//   //   wallMaterial: 'Монолит-каркас',
//   //   finishTypes: ['Белый каркас', 'Под ключ'],
//   //   viewTypes: ['На двор', 'На горы', 'На город'],
//   // },
// ]

// Пресеты квартир для тестового корпуса со ступенчатой этажностью (позиции 1..6).
const VARFLOORS_PRESETS = [
  { rooms: 'studio', area: 29.4, living: 18.2, balcony: 3.6, pricePerSqm: 2360, view: 'yard' },
  { rooms: '1+1', area: 44.8, living: 27.5, balcony: 5.4, pricePerSqm: 2420, view: 'yard' },
  { rooms: '2+1', area: 62.7, living: 39.8, balcony: 7.1, pricePerSqm: 2510, view: 'city' },
  { rooms: '3+1', area: 88.3, living: 57.4, balcony: 9.8, pricePerSqm: 2600, view: 'mountain' },
  { rooms: '3+1', area: 96.1, living: 62.0, balcony: 11.0, pricePerSqm: 2660, view: 'city' },
  { rooms: '4+', area: 118.5, living: 78.3, balcony: 13.5, pricePerSqm: 2740, view: 'mountain' },
] as const

// Сколько квартир на каждом этаже — намеренно разное, чтобы шахматка показывала ступеньку.
const VARFLOORS_FLOOR_COUNTS: Record<number, number> = {
  1: 6,
  2: 6,
  3: 5,
  4: 4,
  5: 4,
  6: 3,
  7: 2,
  8: 1,
}

const varfloorsSlots = (count: number): FloorTemplateSlot[] =>
  VARFLOORS_PRESETS.slice(0, count).map((preset, idx) => ({
    positionInFloor: idx + 1,
    rooms: preset.rooms,
    area: preset.area,
    pricePerSqm: preset.pricePerSqm,
    viewType: preset.view,
  }))

export const BUILDINGS_MOCK: IBuilding[] = [
  {
    _id: DEMO_BUILDING_ID,
    project: DEMO_PROJECT_ID,
    name: 'Башня A',
    buildingCode: 'A',
    floors: 7,
    unitsPerFloor: 4,
    completionDate: 'IV квартал 2027',
    floorPlanUrl: TYPICAL_FLOOR_PLAN,
    floorTypes: [
      {
        id: 'demo-floor-type-ground',
        name: 'Первый жилой этаж',
        purpose: 'residential',
        description: 'Резиденции с увеличенными террасами и выходом во двор',
        rangeFrom: 1,
        rangeTo: 1,
        color: '#d0e8df',
        units: [
          { positionInFloor: 1, rooms: 'studio', area: 34.2, pricePerSqm: 2450, viewType: 'yard' },
          { positionInFloor: 2, rooms: '1+1', area: 51.4, pricePerSqm: 2520, viewType: 'yard' },
          { positionInFloor: 3, rooms: '2+1', area: 70.8, pricePerSqm: 2600, viewType: 'city' },
          { positionInFloor: 4, rooms: '3+1', area: 96.5, pricePerSqm: 2680, viewType: 'mountain' },
        ],
      },
      {
        id: 'demo-floor-type-typical',
        name: 'Типовой этаж',
        purpose: 'residential',
        description: 'Четыре квартиры, две секции и центральный лифтовой холл',
        rangeFrom: 2,
        rangeTo: 6,
        color: '#e6c364',
        units: [
          { positionInFloor: 1, rooms: 'studio', area: 31.8, pricePerSqm: 2550, viewType: 'yard' },
          { positionInFloor: 2, rooms: '1+1', area: 48.6, pricePerSqm: 2620, viewType: 'yard' },
          { positionInFloor: 3, rooms: '2+1', area: 67.4, pricePerSqm: 2710, viewType: 'city' },
          { positionInFloor: 4, rooms: '3+1', area: 92.1, pricePerSqm: 2820, viewType: 'mountain' },
        ],
      },
      {
        id: 'demo-floor-type-top',
        name: 'Видовой этаж',
        purpose: 'penthouse',
        description: 'Увеличенная высота потолка и открытые террасы',
        rangeFrom: 7,
        rangeTo: 7,
        color: '#f0d98f',
        units: [
          { positionInFloor: 1, rooms: 'studio', area: 33.6, pricePerSqm: 2960, viewType: 'city' },
          { positionInFloor: 2, rooms: '1+1', area: 51.2, pricePerSqm: 3020, viewType: 'yard' },
          { positionInFloor: 3, rooms: '2+1', area: 72.8, pricePerSqm: 3150, viewType: 'city' },
          { positionInFloor: 4, rooms: '3+1', area: 101.4, pricePerSqm: 3290, viewType: 'mountain' },
        ],
      },
    ],
  },
  {
    _id: DEMO_VARFLOORS_BUILDING_ID,
    project: DEMO_VARFLOORS_PROJECT_ID,
    name: 'Корпус A',
    buildingCode: 'A',
    floors: 8,
    // unitsPerFloor намеренно не задаём: число слотов берётся из максимума по этажам,
    // а более короткие этажи показывают пустые позиции — отсюда «ступенька» в шахматке.
    floorTypes: [
      {
        id: 'varfloors-type-base',
        name: 'Нижние этажи',
        purpose: 'residential',
        description: 'Шесть квартир в ряду, выход во двор и к коммерческой галерее',
        rangeFrom: 1,
        rangeTo: 2,
        color: '#d0e8df',
        units: varfloorsSlots(6),
      },
      {
        id: 'varfloors-type-transition',
        name: 'Переходный этаж',
        purpose: 'residential',
        description: 'Пять квартир: угловая секция уходит под террасу',
        rangeFrom: 3,
        rangeTo: 3,
        color: '#cfe3d8',
        units: varfloorsSlots(5),
      },
      {
        id: 'varfloors-type-typical',
        name: 'Типовой этаж',
        purpose: 'residential',
        description: 'Четыре квартиры, две секции и центральный холл',
        rangeFrom: 4,
        rangeTo: 5,
        color: '#e6c364',
        units: varfloorsSlots(4),
      },
      {
        id: 'varfloors-type-upper',
        name: 'Верхний этаж',
        purpose: 'residential',
        description: 'Три просторные квартиры с увеличенными лоджиями',
        rangeFrom: 6,
        rangeTo: 6,
        color: '#ecd292',
        units: varfloorsSlots(3),
      },
      {
        id: 'varfloors-type-semi-penthouse',
        name: 'Полупентхаусы',
        purpose: 'penthouse',
        description: 'Две видовые квартиры с панорамным остеклением',
        rangeFrom: 7,
        rangeTo: 7,
        color: '#f0d98f',
        units: varfloorsSlots(2),
      },
      {
        id: 'varfloors-type-penthouse',
        name: 'Пентхаус',
        purpose: 'penthouse',
        description: 'Единственная квартира на этаже с собственной террасой',
        rangeFrom: 8,
        rangeTo: 8,
        color: '#f5e3a8',
        units: varfloorsSlots(1),
      },
    ],
  },
]

const UNIT_PRESETS = [
  { rooms: 'studio', area: 31.8, living: 20.4, balcony: 4.2, layout: 'layout-studio.svg', view: 'yard' },
  { rooms: '1+1', area: 48.6, living: 29.8, balcony: 6.1, layout: 'layout-1-plus-1.svg', view: 'yard' },
  { rooms: '2+1', area: 67.4, living: 43.2, balcony: 7.8, layout: 'layout-2-plus-1.svg', view: 'city' },
  { rooms: '3+1', area: 92.1, living: 61.5, balcony: 11.4, layout: 'layout-3-plus-1.svg', view: 'mountain' },
] as const

function unitStatus(floor: number, position: number): UnitStatus {
  if (floor === 7) return (['free', 'booked', 'sold', 'free'] as UnitStatus[])[position - 1]
  if (position === 2 && floor % 3 === 0) return 'booked'
  if (position === 3 && floor % 2 === 0) return 'sold'
  if (position === 4 && floor === 5) return 'sold'
  return 'free'
}

function generateDemoUnits(): IUnit[] {
  const units: IUnit[] = []
  for (let floor = 1; floor <= 7; floor += 1) {
    for (let position = 1; position <= 4; position += 1) {
      const preset = UNIT_PRESETS[position - 1]
      const isTopFloor = floor === 7
      const isGroundFloor = floor === 1
      const area = +(preset.area + (isTopFloor ? position * 2.2 : isGroundFloor ? position * 0.8 : 0)).toFixed(1)
      const basePricePerSqm = 2480 + floor * 65 + position * 35
      const pricePerSqm = Math.round(basePricePerSqm / 10) * 10
      const status = unitStatus(floor, position)
      const number = `${floor}0${position}`

      units.push({
        _id: `${DEMO_BUILDING_ID}-unit-${number}`,
        building: DEMO_BUILDING_ID,
        sectionId: position <= 2 ? 'demo-section-a' : 'demo-section-b',
        sectionName: position <= 2 ? 'Секция A' : 'Секция B',
        floor,
        positionInFloor: position,
        number,
        rooms: preset.rooms,
        area,
        areaLiving: preset.living,
        areaBalcony: preset.balcony,
        viewType: preset.view,
        customFields: {
          Отделка: position % 2 === 0 ? 'Под ключ' : 'Белый каркас',
          Потолки: isTopFloor ? '3,4 м' : '3,1 м',
          Терраса: isTopFloor || isGroundFloor,
          Кладовая: position >= 3,
        },
        basePricePerSqm: pricePerSqm + 120,
        pricePerSqm,
        price: Math.round(area * pricePerSqm),
        finishPrices: {
          white_frame: pricePerSqm,
          turnkey: pricePerSqm + 420,
        },
        promotion:
          status === 'free' && floor === 7 && position === 1
            ? {
                kind: 'price_discount',
                label: 'Скидка 5% до конца месяца',
                isActive: true,
                discountPercent: 5,
                expiresAt: '2030-01-01',
              }
            : undefined,
        status,
        layoutImageUrl: `${ASSET_ROOT}/${preset.layout}`,
        imageFileId: `demo-layout-${position}`,
        floorPlanUrl: TYPICAL_FLOOR_PLAN,
      })
    }
  }
  return units
}

function varfloorsStatus(floor: number, position: number): UnitStatus {
  if (floor === 8) return 'free'
  if (position === 1 && floor % 2 === 0) return 'sold'
  if (position === 2 && floor % 3 === 0) return 'booked'
  if (position === 4 && floor === 4) return 'sold'
  if (position === 5 && floor === 3) return 'booked'
  return 'free'
}

function generateVarfloorsUnits(): IUnit[] {
  const units: IUnit[] = []
  const floors = Object.keys(VARFLOORS_FLOOR_COUNTS)
    .map(Number)
    .sort((a, b) => a - b)

  for (const floor of floors) {
    const count = VARFLOORS_FLOOR_COUNTS[floor]
    const isTopFloor = floor >= 7
    for (let position = 1; position <= count; position += 1) {
      const preset = VARFLOORS_PRESETS[position - 1]
      const area = +(preset.area + (isTopFloor ? position * 1.6 : 0)).toFixed(1)
      const basePricePerSqm = preset.pricePerSqm + floor * 45 + (isTopFloor ? 220 : 0)
      const pricePerSqm = Math.round(basePricePerSqm / 10) * 10
      const status = varfloorsStatus(floor, position)
      const number = `${floor}${String(position).padStart(2, '0')}`

      units.push({
        _id: `${DEMO_VARFLOORS_BUILDING_ID}-unit-${number}`,
        building: DEMO_VARFLOORS_BUILDING_ID,
        floor,
        positionInFloor: position,
        number,
        rooms: preset.rooms,
        area,
        areaLiving: preset.living,
        areaBalcony: preset.balcony,
        viewType: preset.view,
        basePricePerSqm: pricePerSqm + 110,
        pricePerSqm,
        price: Math.round(area * pricePerSqm),
        status,
      })
    }
  }
  return units
}

export const UNITS_MOCK: IUnit[] = [...generateDemoUnits(), ...generateVarfloorsUnits()]

export const LAYOUTS_MOCK: ILayout[] = UNIT_PRESETS.map((preset, index) => ({
  _id: `demo-layout-${index + 1}`,
  buildingId: DEMO_BUILDING_ID,
  name: `${preset.rooms} · тип ${String.fromCharCode(65 + index)}`,
  rooms: preset.rooms,
  area: preset.area,
  isEuro: preset.rooms !== 'studio',
  imageUrl: `${ASSET_ROOT}/${preset.layout}`,
  planFileId: `demo-layout-file-${index + 1}`,
  tags: [preset.rooms, preset.view, index >= 2 ? 'семейная' : 'компактная'],
}))

export interface DemoFloorPlanFixture {
  buildingId: string
  floor: number
  imageDataUrl: string
  imageId?: string
  polygons: Array<{ unitId: string; points: [number, number][] }>
  places: Array<{ id: string; label: string; points: [number, number][] }>
}

// Демонстрационная обводка 4 квартир на реальной типовой плите (координаты — доли 0..1).
// Это «тренировочные» контуры под пресеты Студия/1+1/2+1/3+1; у юнитов уже привязаны планировки.
const UNIT_POLYGONS: [number, number][][] = [
  [[0.10, 0.16], [0.17, 0.16], [0.17, 0.42], [0.10, 0.42]],
  [[0.30, 0.16], [0.38, 0.16], [0.38, 0.42], [0.30, 0.42]],
  [[0.62, 0.16], [0.70, 0.16], [0.70, 0.42], [0.62, 0.42]],
  [[0.74, 0.60], [0.85, 0.60], [0.85, 0.80], [0.74, 0.80]],
]

export const FLOOR_PLANS_MOCK: DemoFloorPlanFixture[] = Array.from({ length: 7 }, (_, index) => {
  const floor = index + 1
  // Реальная типовая поэтажка (4 подъезда) — этажи 1–9 одинаковые, для демо одна картинка на все этажи.
  return {
    buildingId: DEMO_BUILDING_ID,
    floor,
    imageDataUrl: TYPICAL_FLOOR_PLAN,
    imageId: `demo-floor-image-${floor}`,
    polygons: UNIT_POLYGONS.map((points, position) => ({
      unitId: `${DEMO_BUILDING_ID}-unit-${floor}0${position + 1}`,
      points,
    })),
    places: [],
  }
})
