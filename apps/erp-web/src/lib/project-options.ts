import type { Translate } from '@/i18n/types'

/**
 * Canonical option values for the development section (project wizard,
 * chessboard, unit editors). The client stores and sends ONLY these English
 * values to the API; Russian/English/… labels are resolved through i18n keys
 * `projectWizard.options.<group>.<value>`.
 *
 * Legacy data saved in Russian is converted via `normalizeOptionValue` when
 * hydrating, so both old and new records render correctly.
 *
 * Canonical lists are documented in docs/tracking/section-development-refactor.md.
 */

/* ─── Canonical value lists ─────────────────────────────────── */

export const ROOM_TYPE_OPTIONS = ['studio', '1+1', '2+1', '3+1', '4+', '1b', '2b', '3b', '4b+', 'duplex'] as const
export type RoomTypeOption = (typeof ROOM_TYPE_OPTIONS)[number]

export const COMPLEX_CLASS_OPTIONS = ['econom', 'comfort', 'business', 'premium', 'elite'] as const
export type ComplexClassOption = (typeof COMPLEX_CLASS_OPTIONS)[number]

export const PROPERTY_TYPE_OPTIONS = ['apartments', 'aparthotel', 'townhouses', 'villas'] as const
export type PropertyTypeOption = (typeof PROPERTY_TYPE_OPTIONS)[number]

export const COASTLINE_OPTIONS = ['first_line', 'second_line', 'third_line', 'city'] as const
export type CoastlineOption = (typeof COASTLINE_OPTIONS)[number]

export const WALL_MATERIAL_OPTIONS = ['monolith_frame', 'monolith_brick', 'panel', 'brick', 'block', 'precast_monolith'] as const
export type WallMaterialOption = (typeof WALL_MATERIAL_OPTIONS)[number]

export const FINISH_TYPE_OPTIONS = ['black_frame', 'white_frame', 'green_frame', 'renovation', 'turnkey'] as const
export type FinishTypeOption = (typeof FINISH_TYPE_OPTIONS)[number]

/** Numeric meters as string; label adds the unit per locale. */
export const CEILING_HEIGHT_OPTIONS = [
  '2.4', '2.5', '2.6', '2.7', '2.8', '2.9',
  '3.0', '3.1', '3.2', '3.3', '3.4', '3.5',
  '3.6', '3.7', '3.8', '3.9', '4.0',
  '4.5', '5.0', '5.0+',
] as const

export const ELEVATOR_TYPE_OPTIONS = ['passenger', 'cargo', 'vip'] as const
export type ElevatorTypeOption = (typeof ELEVATOR_TYPE_OPTIONS)[number]

export const PARKING_TYPE_OPTIONS = ['underground', 'ground'] as const
export type ParkingTypeOption = (typeof PARKING_TYPE_OPTIONS)[number]

export const WATER_SUPPLY_OPTIONS = ['central', 'well', 'none'] as const
export type WaterSupplyOption = (typeof WATER_SUPPLY_OPTIONS)[number]

export const SEWERAGE_OPTIONS = ['central', 'septic', 'none'] as const
export type SewerageOption = (typeof SEWERAGE_OPTIONS)[number]

export const VIEW_TYPE_OPTIONS = ['yard', 'sea', 'mountain', 'city'] as const
export type ViewTypeOption = (typeof VIEW_TYPE_OPTIONS)[number]

export const PAYMENT_TYPE_OPTIONS = ['installment', 'full_payment'] as const
export type PaymentTypeOption = (typeof PAYMENT_TYPE_OPTIONS)[number]

export const CURRENCY_OPTIONS = ['USD', 'EUR'] as const
export type ProjectCurrency = (typeof CURRENCY_OPTIONS)[number]

export interface CurrencyConfigItem {
  value: ProjectCurrency
  label: string
  symbol: string
}

export const CURRENCY_CONFIG: readonly CurrencyConfigItem[] = [
  { value: 'USD', label: 'USD · $', symbol: '$' },
  { value: 'EUR', label: 'EUR · €', symbol: '€' },
] as const

export const INFRA_EXTERNAL_OPTIONS = [
  'school', 'kindergarten', 'pharmacy', 'park', 'mall',
  'supermarket', 'restaurant', 'cafe', 'bank', 'atm',
  'hospital', 'clinic', 'dental_clinic', 'fitness_club',
  'beach', 'seafront', 'green_square', 'bike_lanes',
  'bus_stop', 'metro', 'tram', 'railway_station',
  'airport_nearby', 'university', 'business_center', 'coworking',
  'market', 'cinema', 'sports_ground', 'stadium',
] as const

export const INFRA_INTERNAL_OPTIONS = [
  'pool', 'rooftop_terrace', 'playground', 'concierge',
  'bbq_area', 'garden', 'gym', 'spa', 'sauna', 'jacuzzi',
  'coworking', 'meeting_room', 'cinema', 'game_room',
  'storage_rooms', 'bike_parking', 'ev_charging',
  'cctv', 'security_24_7', 'gated_area',
  'lobby', 'coffee_zone', 'reception', 'cleaning',
  'generator', 'autonomous_water', 'smart_home',
] as const

export const INFRA_LOCATION_OPTIONS = [
  'sea_first_line', 'sea_second_line', 'riverside', 'lakeside',
  'port', 'seafront', 'quiet_district', 'city_center',
  'mountain_district', 'forest_zone', 'eco_district',
  'business_district', 'tourist_district', 'residential_district',
  'near_airport', 'elite_quarter',
] as const

/** Chessboard unit types for non-residential floor purposes. */
export const COMMERCIAL_UNIT_TYPE_OPTIONS = ['shop', 'boutique', 'showroom', 'cafe_restaurant', 'service_space', 'other'] as const
export const OFFICE_UNIT_TYPE_OPTIONS = ['office', 'open_space', 'private_office', 'meeting_room', 'coworking'] as const
export const TECHNICAL_UNIT_TYPE_OPTIONS = ['technical_room', 'server_room', 'engineering_block', 'storage'] as const
export const PARKING_UNIT_TYPE_OPTIONS = ['parking_space', 'storage', 'moto_space'] as const
export const OTHER_UNIT_TYPE_OPTIONS = ['unit', 'lot', 'block'] as const

export interface CountryOption {
  /** ISO 3166-1 alpha-2, lowercase — canonical value sent to the API. */
  code: string
  cities: string[]
}

export const COUNTRY_OPTIONS: CountryOption[] = [
  { code: 'ge', cities: ['batumi', 'tbilisi', 'kobuleti', 'gudauri'] },
  { code: 'th', cities: ['phuket', 'bangkok', 'pattaya', 'samui', 'chiangmai'] },
  { code: 'tr', cities: ['istanbul', 'antalya', 'alanya', 'bodrum', 'izmir'] },
  { code: 'id', cities: ['bali', 'jakarta', 'lombok', 'medan'] },
  { code: 'pl', cities: ['warsaw', 'krakow', 'gdansk', 'wroclaw', 'poznan'] },
]

/* ─── Legacy (Russian) → canonical maps ─────────────────────── */

export type OptionGroup =
  | 'rooms'
  | 'classTypes'
  | 'propertyTypes'
  | 'coastline'
  | 'wallMaterials'
  | 'finishTypes'
  | 'ceilingHeights'
  | 'elevatorTypes'
  | 'parkingTypes'
  | 'waterSupply'
  | 'sewerage'
  | 'views'
  | 'paymentTypes'
  | 'infraExternal'
  | 'infraInternal'
  | 'infraLocation'
  | 'unitTypes'
  | 'countries'
  | 'cities'

const LEGACY_TO_CANONICAL: Record<OptionGroup, Record<string, string>> = {
  rooms: {
    'Студия': 'studio',
    'студия': 'studio',
    '4+1': '4+',
    '5+1': '4+',
  },
  classTypes: {
    'Эконом': 'econom',
    'Комфорт': 'comfort',
    'Бизнес': 'business',
    'Премиум': 'premium',
    'Делюкс': 'elite',
    'Элит': 'elite',
    deluxe: 'elite', // старый слаг БД
  },
  propertyTypes: {
    'Квартиры': 'apartments',
    'Апартаменты': 'aparthotel',
    'Таунхаусы': 'townhouses',
    'Виллы': 'villas',
  },
  coastline: {
    'Первая линия': 'first_line',
    'Вторая линия': 'second_line',
    'Третья линия': 'third_line',
    'Город': 'city',
    // старые слаги БД
    first: 'first_line',
    second: 'second_line',
    third: 'third_line',
  },
  wallMaterials: {
    'Монолит-каркас': 'monolith_frame',
    'Монолит-кирпич': 'monolith_brick',
    'Панельный': 'panel',
    'Кирпичный': 'brick',
    'Блочный': 'block',
    'Сборно-монолитный': 'precast_monolith',
  },
  finishTypes: {
    'Черный каркас': 'black_frame',
    'Чёрный каркас': 'black_frame',
    'Белый каркас': 'white_frame',
    'Зеленый каркас': 'green_frame',
    'Зелёный каркас': 'green_frame',
    'С ремонтом': 'renovation',
    'Под ключ': 'turnkey',
    // старые слаги БД
    shell_core: 'black_frame',
    white_box: 'white_frame',
    renovated: 'renovation',
  },
  ceilingHeights: {
    '2.4 м': '2.4', '2.5 м': '2.5', '2.6 м': '2.6', '2.7 м': '2.7', '2.8 м': '2.8', '2.9 м': '2.9',
    '3.0 м': '3.0', '3.1 м': '3.1', '3.2 м': '3.2', '3.3 м': '3.3', '3.4 м': '3.4', '3.5 м': '3.5',
    '3.6 м': '3.6', '3.7 м': '3.7', '3.8 м': '3.8', '3.9 м': '3.9', '4.0 м': '4.0',
    '4.5 м': '4.5', '5.0 м': '5.0', '5.0 м+': '5.0+',
  },
  elevatorTypes: {
    'Пассажирский': 'passenger',
    'Грузовой': 'cargo',
    'ВИП': 'vip',
    freight: 'cargo', // старый слаг БД
  },
  parkingTypes: {
    'Подземный паркинг': 'underground',
    'Наземный паркинг': 'ground',
    ground_level: 'ground', // старый слаг БД
  },
  waterSupply: {
    'Центральное': 'central',
    'Скважина': 'well',
    'Нет': 'none',
  },
  sewerage: {
    'Центральная': 'central',
    'Септик': 'septic',
    'Нет': 'none',
  },
  views: {
    'На двор': 'yard',
    'На море': 'sea',
    'На горы': 'mountain',
    'На город': 'city',
  },
  paymentTypes: {
    'Рассрочка': 'installment',
    'Полная оплата': 'full_payment',
    'Наличными': 'full_payment',
    'Ипотека': 'installment',
    // старые слаги БД
    cash: 'full_payment',
    mortgage: 'installment',
  },
  infraExternal: {
    'Школа': 'school',
    'Детский сад': 'kindergarten',
    'Аптека': 'pharmacy',
    'Парк': 'park',
    'ТЦ': 'mall',
    'Супермаркет': 'supermarket',
    'Ресторан': 'restaurant',
    'Кафе': 'cafe',
    'Банк': 'bank',
    'Банкомат': 'atm',
    'Больница': 'hospital',
    'Поликлиника': 'clinic',
    'Стоматология': 'dental_clinic',
    'Фитнес-клуб': 'fitness_club',
    'Пляж': 'beach',
    'Набережная': 'seafront',
    'Сквер': 'green_square',
    'Велодорожки': 'bike_lanes',
    'Автобусная остановка': 'bus_stop',
    'Метро': 'metro',
    'Трамвай': 'tram',
    'ЖД станция': 'railway_station',
    'Аэропорт рядом': 'airport_nearby',
    'Университет': 'university',
    'Бизнес-центр': 'business_center',
    'Коворкинг': 'coworking',
    'Рынок': 'market',
    'Кинотеатр': 'cinema',
    'Спортивная площадка': 'sports_ground',
    'Стадион': 'stadium',
    // старые слаги БД
    shopping_mall: 'mall',
    polyclinic: 'clinic',
    promenade: 'seafront',
    public_garden: 'green_square',
  },
  infraInternal: {
    'Бассейн': 'pool',
    'Терраса на крыше': 'rooftop_terrace',
    'Детская площадка': 'playground',
    'Консьерж': 'concierge',
    'Зона барбекю': 'bbq_area',
    'Сад': 'garden',
    'Спортзал': 'gym',
    'SPA': 'spa',
    'Сауна': 'sauna',
    'Джакузи': 'jacuzzi',
    'Коворкинг': 'coworking',
    'Переговорная комната': 'meeting_room',
    'Кинотеатр': 'cinema',
    'Игровая комната': 'game_room',
    'Кладовые': 'storage_rooms',
    'Велопарковка': 'bike_parking',
    'Зарядка для электромобилей': 'ev_charging',
    'Видеонаблюдение': 'cctv',
    'Охрана 24/7': 'security_24_7',
    'Закрытая территория': 'gated_area',
    'Лобби': 'lobby',
    'Кофе-зона': 'coffee_zone',
    'Рецепция': 'reception',
    'Клининг': 'cleaning',
    'Генератор': 'generator',
    'Автономное водоснабжение': 'autonomous_water',
    'Умный дом': 'smart_home',
    // старые слаги БД
    swimming_pool: 'pool',
    cinema_room: 'cinema',
    gated_community: 'gated_area',
    backup_generator: 'generator',
    coffee_lounge: 'coffee_zone',
    storage_units: 'storage_rooms',
    bicycle_parking: 'bike_parking',
    cleaning_service: 'cleaning',
  },
  infraLocation: {
    'Первая линия моря': 'sea_first_line',
    'Вторая линия моря': 'sea_second_line',
    'У реки': 'riverside',
    'У озера': 'lakeside',
    'Порт': 'port',
    'Набережная': 'seafront',
    'Тихий район': 'quiet_district',
    'Центр города': 'city_center',
    'Горный район': 'mountain_district',
    'Лесная зона': 'forest_zone',
    'Экорайон': 'eco_district',
    'Деловой центр': 'business_district',
    'Туристический район': 'tourist_district',
    'Спальный район': 'residential_district',
    'Рядом с аэропортом': 'near_airport',
    'Элитный квартал': 'elite_quarter',
    // старые слаги БД (seafront-коллизию решает миграция на стороне API)
    second_sea_line: 'sea_second_line',
    by_the_river: 'riverside',
    by_the_lake: 'lakeside',
    embankment: 'seafront',
    quiet_area: 'quiet_district',
    mountain_area: 'mountain_district',
    tourist_area: 'tourist_district',
    residential_area: 'residential_district',
  },
  unitTypes: {
    'Магазин': 'shop',
    'Бутик': 'boutique',
    'Шоурум': 'showroom',
    'Кафе / ресторан': 'cafe_restaurant',
    'Сервисное помещение': 'service_space',
    'Другое': 'other',
    'Офис': 'office',
    'Open space': 'open_space',
    'Кабинет': 'private_office',
    'Переговорная': 'meeting_room',
    'Коворкинг': 'coworking',
    'Техпомещение': 'technical_room',
    'Серверная': 'server_room',
    'Инженерный блок': 'engineering_block',
    'Кладовая': 'storage',
    'Машино-место': 'parking_space',
    'Мото-место': 'moto_space',
    'Помещение': 'unit',
    'Лот': 'lot',
    'Блок': 'block',
  },
  countries: {
    'Грузия': 'ge',
    'Таиланд': 'th',
    'Турция': 'tr',
    'Индонезия': 'id',
    'Польша': 'pl',
    // ISO-коды в верхнем регистре и старые слаги БД
    GE: 'ge', TH: 'th', TR: 'tr', ID: 'id', PL: 'pl',
    georgia: 'ge', thailand: 'th', turkey: 'tr', indonesia: 'id', poland: 'pl',
  },
  cities: {
    'Батуми': 'batumi',
    'Тбилиси': 'tbilisi',
    'Кобулети': 'kobuleti',
    'Гудаури': 'gudauri',
    'Пхукет': 'phuket',
    'Бангкок': 'bangkok',
    'Паттайя': 'pattaya',
    'Самуи': 'samui',
    'Чиангмай': 'chiangmai',
    'Стамбул': 'istanbul',
    'Анталья': 'antalya',
    'Аланья': 'alanya',
    'Бодрум': 'bodrum',
    'Измир': 'izmir',
    'Бали': 'bali',
    'Джакарта': 'jakarta',
    'Ломбок': 'lombok',
    'Медан': 'medan',
    'Варшава': 'warsaw',
    'Краков': 'krakow',
    'Гданьск': 'gdansk',
    'Вроцлав': 'wroclaw',
    'Познань': 'poznan',
    // старые слаги БД
    koh_samui: 'samui',
    chiang_mai: 'chiangmai',
  },
}

/* ─── Normalizers ───────────────────────────────────────────── */

/** Convert a possibly-legacy (Russian) stored value to its canonical form. */
export function normalizeOptionValue(group: OptionGroup, value: string | undefined | null): string {
  const raw = (value ?? '').trim()
  if (!raw) return ''
  return LEGACY_TO_CANONICAL[group][raw] ?? raw
}

export function normalizeOptionValues(group: OptionGroup, values: readonly string[] | undefined | null): string[] {
  if (!values || values.length === 0) return []
  return Array.from(new Set(values.map((v) => normalizeOptionValue(group, v)).filter(Boolean)))
}

/**
 * Rooms need extra handling: legacy data contains Russian labels, bare numbers
 * (layouts API: 0 = студия, N = "N+1") and free-form strings ("2 комнаты").
 */
export function normalizeRooms(value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === '') return ''
  const raw = String(value).trim()
  const mapped = normalizeOptionValue('rooms', raw)
  if ((ROOM_TYPE_OPTIONS as readonly string[]).includes(mapped)) return mapped
  if (/студ|studio/i.test(raw)) return 'studio'
  if (/дуплекс|duplex/i.test(raw)) return 'duplex'
  const plus = raw.match(/^(\d+)\s*\+\s*\d+$/)
  if (plus) {
    const n = Number(plus[1])
    return n >= 4 ? '4+' : `${n}+1`
  }
  const count = raw.match(/^(\d+)\s*(?:[-\s]?(?:к|ком|комн|комнат|room).*)?$/i)
  if (count) {
    const n = Number(count[1])
    if (n <= 0) return 'studio'
    return n >= 4 ? '4+' : `${n}+1`
  }
  return mapped
}

/** Views: '—' and empty mean "not set". Returns '' when unset. */
export function normalizeViewType(value: string | undefined | null): string {
  const raw = (value ?? '').trim()
  if (!raw || raw === '—') return ''
  return normalizeOptionValue('views', raw)
}

/* ─── Labels ────────────────────────────────────────────────── */

/**
 * Resolve the display label for an option value (canonical or legacy).
 * Falls back to the raw value so unknown/legacy data never renders blank.
 */
export function optionLabel(t: Translate, group: OptionGroup, value: string | undefined | null): string {
  const raw = (value ?? '').trim()
  if (!raw) return ''
  const canonical = normalizeOptionValue(group, raw)
  return t(`projectWizard.options.${group}.${canonical}`, raw)
}

export function optionLabels(t: Translate, group: OptionGroup, values: readonly string[] | undefined | null): string[] {
  return (values ?? []).map((v) => optionLabel(t, group, v)).filter(Boolean)
}

/* ─── Static labels (для PDF и других контекстов без useI18n) ── */

/** canonical → русская подпись; строится инверсией legacy-карты. */
const CANONICAL_TO_RU: Partial<Record<OptionGroup, Record<string, string>>> = {}
for (const [group, map] of Object.entries(LEGACY_TO_CANONICAL) as Array<[OptionGroup, Record<string, string>]>) {
  const inverted: Record<string, string> = {}
  for (const [ru, slug] of Object.entries(map)) {
    if (!(slug in inverted)) inverted[slug] = ru
  }
  CANONICAL_TO_RU[group] = inverted
}

/** Русские подписи для значений, не существовавших в legacy-данных (или где инверсия неточна). */
const EXTRA_RU_LABELS: Partial<Record<OptionGroup, Record<string, string>>> = {
  rooms: {
    studio: 'Студия',
    '4+': '4+', // инверсия дала бы '4+1'
    '1b': '1 спальня',
    '2b': '2 спальни',
    '3b': '3 спальни',
    '4b+': '4+ спален',
    duplex: 'Дуплекс',
  },
}

/**
 * Русская подпись без i18n-контекста (PDF, текстовые документы).
 * Для интерфейса используйте optionLabel(t, …).
 */
export function optionLabelRu(group: OptionGroup, value: string | undefined | null): string {
  const raw = (value ?? '').trim()
  if (!raw) return ''
  const canonical = normalizeOptionValue(group, raw)
  return EXTRA_RU_LABELS[group]?.[canonical] ?? CANONICAL_TO_RU[group]?.[canonical] ?? raw
}
