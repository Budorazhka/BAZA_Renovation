import type { PromotionActivation } from '@/services/developmentApi'
import type { IInstallmentPlan } from '@/types/installment'

export type ProjectStatus = 'draft' | 'active' | 'completed'
export type UnitStatus = 'free' | 'booked' | 'sold' | 'withdrawn'
export type UnitStatus2 = 'available' | 'booked' | 'reserved' | 'sold' | 'hidden' | 'archived' | 'closed'

/**
 * Канонические значения опций — английские слаги (см. src/lib/project-options.ts
 * и docs/tracking/section-development-refactor.md). В API уходят только они;
 * русские подписи — через i18n. Legacy-русские значения из старых записей
 * нормализуются через normalizeOptionValue при гидрации.
 */
/** Класс жилья для портала недвижимости */
export type ProjectClassType = 'econom' | 'comfort' | 'business' | 'premium' | 'elite'
export type PropertyType = 'apartments' | 'aparthotel' | 'townhouses' | 'villas'
export type CoastlineType = 'first_line' | 'second_line' | 'third_line' | 'city'
export type FinishType = 'black_frame' | 'white_frame' | 'green_frame' | 'renovation' | 'turnkey'
export type UnitFinishPrices = Partial<Record<FinishType, number>>
export type ElevatorType = 'passenger' | 'cargo' | 'vip'
export type ParkingType = 'underground' | 'ground'
export type WallMaterial = 'monolith_frame' | 'monolith_brick' | 'panel' | 'brick' | 'block' | 'precast_monolith'
export type ViewType = 'yard' | 'mountain' | 'sea' | 'city'
export type WaterSupplyType = 'central' | 'well' | 'none'
export type SewerageType = 'central' | 'septic' | 'none'

export interface InstallmentTerm {
  type: string
  downPaymentPercent: number
  durationMonths: number
}

export interface MortgageTerm {
  interestRateMin: number
  downPaymentPercent: number
  maxTermYears: number
}

export interface RealtorScriptItem {
  question: string
  answer: string
}

export interface IProject {
  _id: string
  /** Id пользователя-создателя проекта; кнопки редактирования шахматки видит только он. */
  author?: string
  name: string
  developer: string
  location: string
  classType: ProjectClassType
  coastline: string
  buildingsCount: number
  totalUnits: number
  completionDate: string
  startDate: string
  description: string
  descriptionSuccess?: string
  descriptionAudience?: string
  youtubeLink?: string
  paymentTypes: string[]
  installmentTerms?: InstallmentTerm[]
  /** Full installment variants (rich plans) as stored/returned by the API. */
  installmentPlans?: IInstallmentPlan[]
  mortgageTerm?: MortgageTerm
  realtorScripts?: RealtorScriptItem[]
  renders?: string[]
  /** Legacy / UI-only; not part of canonical portal spec */
  status?: ProjectStatus

  // Legacy fields (existing mock data)
  constructionMethod?: string
  parking?: string
  amenities?: string[]

  // New structured fields
  country?: string
  city?: string
  /** Street address of the complex, e.g. "ул. Адлия, 12". */
  address?: string
  propertyType?: PropertyType[]
  finishTypes?: FinishType[]
  ceilingHeight?: string
  elevatorTypes?: ElevatorType[]
  parkingTypes?: ParkingType[]
  parkingSpots?: number
  wallMaterial?: WallMaterial
  viewTypes?: ViewType[]
  hasGas?: boolean
  waterSupply?: WaterSupplyType
  sewerage?: SewerageType
  buildingPermit?: boolean
  infrastructureExternal?: string[]
  infrastructureInternal?: string[]
  infrastructureLocation?: string[]
  areaPolygon?: [number, number][]
  locationCenter?: [number, number]
  constructionProgress?: string[]
  /** Документы ЖК (PDF): разрешения на строительство, договоры и пр. Показываются клиенту. */
  documents?: string[]
  /** Фото района (галерея «О районе» в визитке). */
  districtGallery?: string[]
  /** Текст про район (блок «Информация о районе» в визитке). */
  districtText?: string
  /** Доходность краткосрочной аренды, % годовых (заполняет менеджер застройщика). */
  rentalYieldShort?: number
  /** Доходность долгосрочной аренды, % годовых. */
  rentalYieldLong?: number
  /** Инвестиционная доходность / рост, % (опционально). */
  investmentYield?: number
  /** Текст про арендный потенциал (если задан — вместо пресета по городу). */
  rentalText?: string
  /** Текст про инвестиционный потенциал (если задан — вместо пресета). */
  investmentText?: string
  /** Активные платные услуги продвижения (для бейджей на карточке ЖК) */
  promotions?: PromotionActivation[]

  /** Валюта цен комплекса ('USD' | 'EUR' | string), по умолчанию 'USD' */
  currency?: string
  /** Aggregated catalog stats for card display (from complexes API). */
  areaFrom?: number
  areaTo?: number
  priceFrom?: string
  priceTo?: string
  priceFromUsd?: number
  priceToUsd?: number
  floorsFrom?: number
  floorsTo?: number
}

/** Данные для создания ЖК (без _id) */
export type NewProjectData = Omit<IProject, '_id'>

export interface IBuilding {
  _id: string
  project: string
  name?: string
  buildingCode?: string
  floors?: number
  unitsPerFloor?: number
  completionDate?: string
  startDate?: string
  floorPlanUrl?: string
  floorTypes?: BuildingFloorType[]
  polygon?: [number, number][]
}

export interface ILayout {
  _id: string
  buildingId: string
  name: string
  rooms: string
  area: number
  isEuro?: boolean
  imageUrl?: string
  /** CDN file id of the plan image (sent to the API as `planFileId`). */
  planFileId?: string
  tags?: string[]
}

export type UnitPromotionKind = 'price_discount' | 'installment' | 'gift'

export interface UnitPromotion {
  kind: UnitPromotionKind
  label: string
  isActive?: boolean
  discountPercent?: number
  discountPerSqm?: number
  downPaymentPercent?: number
  installmentMonths?: number
  giftText?: string
  expiresAt?: string
}

export interface IUnit {
  _id: string
  building: string
  /** Секция корпуса, если шахматка разделена на секции. */
  sectionId?: string
  /** Человекочитаемое название секции из шахматки. */
  sectionName?: string
  floor: number
  /** Порядковая позиция на этаже слева-направо, 1..unitsPerFloor */
  positionInFloor?: number
  number: string
  rooms?: string
  /** Общая площадь, м². Главное поле, на нём считается цена. */
  area?: number
  /** Жилая площадь, м² (опционально, если разбили общую). */
  areaLiving?: number
  /** Площадь балкона/лоджии, м² (опционально). */
  areaBalcony?: number
  /** Видовая характеристика — на двор, на море и т.д. */
  viewType?: string
  /** Произвольные поля, специфичные для ЖК (отделка, кладовка, парковка и т.д.). */
  customFields?: Record<string, string | number | boolean>
  currency?: string
  price?: number
  pricePerSqm?: number
  /** Цены за м² для доступных покупателю вариантов отделки. Пустой вариант не предлагается. */
  finishPrices?: UnitFinishPrices
  basePricePerSqm?: number
  promotion?: UnitPromotion
  status: UnitStatus
  polygonPoints?: { x: number; y: number }[]
  layoutImageUrl?: string
  /** Привязанная планировка из библиотеки (estatelayouts _id). */
  layoutId?: string
  /** CdnFile id плана лота (привязанная картинка из библиотеки планировок). */
  imageFileId?: string
  /** Поэтажный план этажа, на котором находится лот (вкладка «На этаже»). */
  floorPlanUrl?: string
  /** Контур лота на поэтажном плане (доли 0..1). Персистится per-unit через PUT /units/:id/plot. */
  plot?: [number, number][]
}

/** Описание одного слота на типовом этаже — используется в мастере построения шахматки. */
export interface FloorTemplateSlot {
  /** Номер / позиция квартиры на этаже в шахматке (колонка, 1…N). */
  positionInFloor?: number
  /**
   * Если задан — эта строка шаблона применяется только к этому этажу (в пределах диапазона типа).
   * Если не задан — строка повторяется на каждом этаже диапазона типа (как раньше).
   * При смешивании в одном типе все строки должны либо все с этажом, либо все без.
   */
  templateFloor?: number
  currency?: string
  rooms?: string
  area?: number
  pricePerSqm?: number
  finishPrices?: UnitFinishPrices
  viewType?: string
}

export type FloorPurpose =
  | 'residential'
  | 'commercial'
  | 'penthouse'
  | 'office'
  | 'technical'
  | 'parking'
  | 'other'

/** Тип этажа для мастера шахматки: диапазон этажей + конфигурация помещений на них. */
export interface BuildingFloorType {
  id: string
  name: string
  purpose?: FloorPurpose
  description?: string
  rangeFrom: number
  rangeTo: number
  color?: string
  units: FloorTemplateSlot[]
}

/** Правило нумерации квартир, выбираемое в мастере. */
export type NumberingRule =
  /** A-0101, A-0102…  префикс корпуса + этаж + позиция */
  | 'floor-position'
  /** A-1, A-2…  сквозная по корпусу */
  | 'sequential'
