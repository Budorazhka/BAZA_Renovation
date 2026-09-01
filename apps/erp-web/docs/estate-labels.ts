/**
 * Estate Complex Form — All Russian Labels & Option Values
 *
 * This file documents every hardcoded Russian string used as selectable
 * options/tags in the "Create Estate Complex" wizard (ProjectWizardPage).
 *
 * These values are sent to the backend as-is (in Russian) via FormData.
 * The backend stores them as strings/string arrays.
 */

// ─────────────────────────────────────────────────────────────
// STEP 1 — Основное (Basic Info)
// ─────────────────────────────────────────────────────────────

/** Property class tier — single-select chip in Step 1 "Класс жилья" */
export const CLASS_OPTIONS = ['Комфорт', 'Бизнес', 'Премиум', 'Делюкс'] as const

/** Property type — single-select chip in Step 1 "Тип недвижимости" */
export const PROPERTY_TYPES = ['Квартиры', 'Апартаменты', 'Таунхаусы', 'Виллы'] as const

/** Coastline proximity — single-select chip in Step 1 "Береговая линия" */
export const COASTLINE_OPTIONS = ['Первая линия', 'Вторая линия', 'Третья линия', 'Город'] as const

/** Project status — dropdown in Step 1 "Статус" */
export const STATUS_OPTIONS = {
  draft: 'Черновик',       // Hidden from agents, only developer sees it
  active: 'В продаже',    // Open for selections and bookings
  completed: 'Завершён',  // Sales closed, archived
} as const

/** Countries — dropdown with flags in Step 1 "Страна" */
export const COUNTRIES = ['Грузия', 'Таиланд', 'Турция', 'Индонезия', 'Польша'] as const

/** Cities grouped by country — dropdown in Step 1 "Город" */
export const CITIES_BY_COUNTRY = {
  Грузия:    ['Батуми', 'Тбилиси', 'Кобулети', 'Гудаури'],
  Таиланд:   ['Пхукет', 'Бангкок', 'Паттайя', 'Самуи', 'Чиангмай'],
  Турция:    ['Стамбул', 'Анталья', 'Аланья', 'Бодрум', 'Измир'],
  Индонезия: ['Бали', 'Джакарта', 'Ломбок', 'Медан'],
  Польша:    ['Варшава', 'Краков', 'Гданьск', 'Вроцлав', 'Познань'],
} as const

// ─────────────────────────────────────────────────────────────
// STEP 2 — О проекте (About the Project)
// Construction materials, finishes, elevators, parking
// ─────────────────────────────────────────────────────────────

/** Wall construction material — single-select chip "Материалы стен" */
export const WALL_MATERIALS = [
  'Монолит-каркас',
  'Монолит-кирпич',
  'Панельный',
  'Кирпичный',
  'Блочный',
  'Сборно-монолитный',
] as const

/** Interior finish types — multi-select chips "Варианты отделки" */
export const FINISH_TYPES = [
  'Черный каркас',   // Shell & core (bare concrete)
  'Белый каркас',    // White box (plastered walls, no finishes)
  'Зеленый каркас',  // Green frame (partially finished)
  'С ремонтом',      // Renovated / move-in ready
  'Под ключ',        // Turnkey (fully furnished)
] as const

/** Ceiling height options — dropdown "Высота потолков" */
export const CEILING_HEIGHTS = [
  '2.4 м', '2.5 м', '2.6 м', '2.7 м', '2.8 м', '2.9 м',
  '3.0 м', '3.1 м', '3.2 м', '3.3 м', '3.4 м', '3.5 м',
  '3.6 м', '3.7 м', '3.8 м', '3.9 м', '4.0 м',
  '4.5 м', '5.0 м', '5.0 м+',
] as const

/** Elevator types — multi-select chips "Лифты" */
export const ELEVATOR_TYPES = [
  'Пассажирский',  // Passenger elevator
  'Грузовой',      // Cargo/freight elevator
] as const

/** Parking types — multi-select chips "Парковка" */
export const PARKING_TYPES = [
  'Подземный паркинг',  // Underground parking
  'Наземный паркинг',   // Above-ground parking
] as const

// ─────────────────────────────────────────────────────────────
// STEP 4 — Инфраструктура (Infrastructure)
// Utilities, external surroundings, internal amenities, location character
// ─────────────────────────────────────────────────────────────

/** Water supply type — single-select chip "Водоснабжение" */
export const WATER_SUPPLY_OPTIONS = [
  'Центральное',  // Central/municipal
  'Скважина',     // Well/borehole
  'Нет',          // None
] as const

/** Sewerage type — single-select chip "Канализация" */
export const SEWERAGE_OPTIONS = [
  'Центральная',  // Central/municipal
  'Септик',       // Septic tank
  'Нет',          // None
] as const

/**
 * External infrastructure — multi-select tags "Что есть рядом с ЖК?"
 * Nearby facilities: schools, shops, transport, healthcare, leisure
 */
export const INFRA_EXTERNAL = [
  // Education & services
  'Школа',                 // School
  'Детский сад',           // Kindergarten
  'Университет',           // University
  'Аптека',                // Pharmacy

  // Shopping & dining
  'Супермаркет',           // Supermarket
  'ТЦ',                    // Shopping mall
  'Рынок',                 // Market
  'Ресторан',              // Restaurant
  'Кафе',                  // Cafe

  // Finance
  'Банк',                  // Bank
  'Банкомат',              // ATM

  // Healthcare
  'Больница',              // Hospital
  'Поликлиника',           // Polyclinic
  'Стоматология',          // Dental clinic

  // Leisure & nature
  'Парк',                  // Park
  'Пляж',                  // Beach
  'Набережная',            // Embankment/Promenade
  'Сквер',                 // Public garden
  'Фитнес-клуб',           // Fitness club
  'Кинотеатр',             // Cinema
  'Спортивная площадка',   // Sports ground
  'Стадион',               // Stadium
  'Велодорожки',           // Bike lanes

  // Transport
  'Автобусная остановка',  // Bus stop
  'Метро',                 // Metro
  'Трамвай',               // Tram
  'ЖД станция',            // Railway station
  'Аэропорт рядом',        // Airport nearby

  // Business
  'Бизнес-центр',          // Business center
  'Коворкинг',             // Coworking space
] as const

/**
 * Internal infrastructure — multi-select tags "Что есть внутри ЖК?"
 * On-site amenities within the residential complex
 */
export const INFRA_INTERNAL = [
  // Recreation & wellness
  'Бассейн',               // Swimming pool
  'Терраса на крыше',      // Rooftop terrace
  'Зона барбекю',          // BBQ area
  'Сад',                   // Garden
  'Спортзал',              // Gym
  'SPA',                   // SPA
  'Сауна',                 // Sauna
  'Джакузи',               // Jacuzzi

  // Kids
  'Детская площадка',      // Playground
  'Игровая комната',       // Game room

  // Work & business
  'Коворкинг',             // Coworking
  'Переговорная комната',  // Meeting room

  // Entertainment
  'Кинотеатр',             // Cinema room

  // Services
  'Консьерж',              // Concierge
  'Лобби',                 // Lobby
  'Кофе-зона',             // Coffee lounge
  'Рецепция',              // Reception
  'Клининг',               // Cleaning service

  // Storage & transport
  'Кладовые',              // Storage units
  'Велопарковка',          // Bicycle parking
  'Зарядка для электромобилей', // EV charging

  // Security
  'Видеонаблюдение',       // CCTV
  'Охрана 24/7',           // 24/7 security
  'Закрытая территория',   // Gated community

  // Engineering
  'Генератор',             // Backup generator
  'Автономное водоснабжение', // Autonomous water supply
  'Умный дом',             // Smart home
] as const

/**
 * Location character — multi-select tags "Характер расположения"
 * Describes the area type and surroundings
 */
export const INFRA_LOCATION = [
  // Waterfront
  'Первая линия моря',     // First sea line (beachfront)
  'Вторая линия моря',     // Second sea line
  'У реки',                // By the river
  'У озера',               // By the lake
  'Порт',                  // Port/harbor
  'Набережная',            // Embankment

  // Area type
  'Тихий район',           // Quiet area
  'Центр города',          // City center
  'Горный район',          // Mountain area
  'Лесная зона',           // Forest zone
  'Экорайон',              // Eco district

  // District character
  'Деловой центр',         // Business district
  'Туристический район',   // Tourist area
  'Спальный район',        // Residential/sleeping area
  'Рядом с аэропортом',    // Near airport
  'Элитный квартал',       // Elite/luxury quarter
] as const

// ─────────────────────────────────────────────────────────────
// STEP 5 — Условия продаж (Sales Terms)
// Payment methods
// ─────────────────────────────────────────────────────────────

/** Payment methods — multi-select chips "Условия покупки" */
export const PAYMENT_TYPES = [
  'Наличными',  // Cash payment
  'Ипотека',    // Mortgage
] as const

// ─────────────────────────────────────────────────────────────
// DATE FORMATTING
// Used in date pickers for start/completion dates
// ─────────────────────────────────────────────────────────────

/** Quarter label format: "{Q} квартал {YYYY}" e.g. "II квартал 2026" */
export const QUARTER_LABELS = ['I', 'II', 'III', 'IV'] as const
