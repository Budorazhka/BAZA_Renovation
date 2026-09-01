/**
 * Язык и валюта клиентского отображения подборок (портал, письмо, PDF).
 * Числа в данных трактуются как суммы в USD; валюта пересчитывается
 * по индикативному курсу — только для показа клиенту.
 */

export type SelectionLanguage = 'ru' | 'en' | 'ka'
export type SelectionCurrency = 'USD' | 'EUR' | 'GEL'

export const SELECTION_LANGUAGES: { value: SelectionLanguage; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'ka', label: 'ქართული · В разработке' },
  { value: 'ru', label: 'Русский' },
]

export const SELECTION_CURRENCIES: { value: SelectionCurrency; label: string; symbol: string }[] = [
  { value: 'USD', label: 'USD · $', symbol: '$' },
  { value: 'EUR', label: 'EUR · €', symbol: '€' },
  { value: 'GEL', label: 'Лари · ₾', symbol: '₾' },
]

/** Индикативные курсы к USD (для демонстрации мультивалютности). */
const FX_FROM_USD: Record<SelectionCurrency, number> = { USD: 1, EUR: 0.92, GEL: 2.7 }
const LOCALE: Record<SelectionLanguage, string> = { ru: 'ru-RU', en: 'en-US', ka: 'ka-GE' }

const PRICE_ON_REQUEST: Record<SelectionLanguage, string> = {
  ru: 'Цена по запросу',
  en: 'Price on request',
  ka: 'ფასი მოთხოვნისამებრ',
}

/** Формат суммы с учётом валюты и языка. USD — символ слева, лари — символ справа. */
export function formatMoney(
  usd: number | undefined | null,
  currency: SelectionCurrency = 'USD',
  language: SelectionLanguage = 'ru',
): string {
  if (!usd) return PRICE_ON_REQUEST[language]
  const value = Math.round(usd * FX_FROM_USD[currency])
  const num = value.toLocaleString(LOCALE[language], { maximumFractionDigits: 0 }).replace(/ /g, ' ')
  if (currency === 'GEL') return `${num} ₾`
  if (currency === 'EUR') return `€${num}`
  return `$${num}`
}

/** Цена за м² с учётом валюты. */
export function formatMoneyPerM2(
  usdPerM2: number | undefined | null,
  currency: SelectionCurrency = 'USD',
  language: SelectionLanguage = 'ru',
): string {
  if (!usdPerM2) return '—'
  const perM2 = language === 'en' ? '/m²' : language === 'ka' ? '/მ²' : '/м²'
  return `${formatMoney(usdPerM2, currency, language)}${perM2}`
}

/* ─── Словарь клиентских подписей ──────────────────────────────── */

const STRINGS = {
  ru: {
    personalSelection: 'Персональная подборка',
    forClient: 'для',
    locationUnknown: 'Расположение не указано',
    completion: 'Сдача',
    priceRange: 'Диапазон цен',
    variantsCount: 'вариантов',
    aboutComplex: 'О комплексе',
    locationSection: 'Расположение и территория',
    videoSection: 'Видео-презентация проекта',
    amenitiesSection: 'Удобства и инфраструктура',
    paymentsSection: 'Способы оплаты',
    installmentSection: 'Условия рассрочки',
    paymentMonthly: 'Ежемесячно',
    paymentQuarterly: 'Ежеквартально',
    validUntil: 'Действует до',
    constructionSection: 'Ход строительства',
    preparedBy: 'Подборка подготовлена вашим агентом',
    reactionsHint: 'Реакции на квартиры автоматически сохраняются и отображаются у вашего агента',
    like: 'Нравится',
    hasQuestions: 'Есть вопросы',
    notSuitable: 'Не подходит',
    notFoundTitle: 'Подборка не найдена',
    notFoundSub: 'Ссылка недействительна или срок её действия истёк.',
    copied: 'Скопировано',
    statusFree: 'В продаже',
    statusBooked: 'Бронь',
    statusSold: 'Продано',
    statusWithdrawn: 'Снято',
    block: 'Корпус',
    floor: 'этаж',
    developer: 'Застройщик',
    address: 'Адрес',
    area: 'Площадь',
    rooms: 'Комнат',
    price: 'Цена',
    primary: 'Новостройка',
    secondary: 'Вторичка',
    loading: 'Загрузка…',
    unitNotFoundTitle: 'Квартира не найдена',
    unitNotFoundSub: 'Ссылка недействительна или срок её действия истёк.',
    loadFailed: 'Не удалось загрузить данные квартиры',
    gallery: 'Галерея',
    layoutPlan: 'Планировка',
    layoutFloor: 'На этаже',
    installment: 'Рассрочка',
    installmentNotConfigured: 'Рассрочка не настроена',
    fullPayment: 'Полная оплата',
    fullPaymentHint: 'Единовременная оплата при подписании договора.',
    priceOnRequest: 'Цена по запросу',
    layoutNotUploaded: 'Планировка не загружена',
    floorPlanNotUploaded: 'Поэтажный план не загружен',
    consultant: 'Консультант',
    call: 'Позвонить',
    connect: 'Связаться',
    promo: 'Акция',
    overview: 'Обзор',
    whyBuy: 'Почему стоит купить проект?',
    forWhom: 'Для кого',
    ceilings: 'Потолки',
    condition: 'Кондиция',
    studio: 'Студия',
    roomsLabel: 'Комнатность',
    floorLabel: 'Этаж',
    sqm: 'м²',
    firstPayment: 'Первый взнос',
    monthsShort: 'мес.',
    discount: 'Скидка',
    aptNumber: 'Квартира №',
    lotOffer: 'Предложение по лоту №',
    lot: 'Лот',
    aboutProject: 'О проекте',
    whatsapp: 'WhatsApp',
    telegram: 'Telegram',
    characteristics: 'Характеристики',
    view: 'Вид',
    windowView: 'Вид из окна',
    coastline: 'Линия моря',
    blockNotFilled: 'Информация пока не заполнена',
    galleryEmpty: 'Фотографии проекта скоро появятся',
    constructionEmpty: 'Фото хода строительства пока нет',
    amenitiesEmpty: 'Список удобств пока не заполнен',
    mapCoordsMissing: 'Карта появится после указания границ объекта на карте',
  },
  en: {
    personalSelection: 'Personal selection',
    forClient: 'for',
    locationUnknown: 'Location not specified',
    completion: 'Completion',
    priceRange: 'Price range',
    variantsCount: 'options',
    aboutComplex: 'About the complex',
    locationSection: 'Location & area',
    videoSection: 'Project video',
    amenitiesSection: 'Amenities & infrastructure',
    paymentsSection: 'Payment options',
    installmentSection: 'Installment terms',
    paymentMonthly: 'Monthly',
    paymentQuarterly: 'Quarterly',
    validUntil: 'Valid until',
    constructionSection: 'Construction progress',
    preparedBy: 'Prepared by your agent',
    reactionsHint: 'Your reactions are saved automatically and shown to your agent',
    like: 'I like it',
    hasQuestions: 'Questions',
    notSuitable: 'Not a fit',
    notFoundTitle: 'Selection not found',
    notFoundSub: 'The link is invalid or has expired.',
    copied: 'Copied',
    statusFree: 'Available',
    statusBooked: 'Reserved',
    statusSold: 'Sold',
    statusWithdrawn: 'Withdrawn',
    block: 'Building',
    floor: 'floor',
    developer: 'Developer',
    address: 'Address',
    area: 'Area',
    rooms: 'Rooms',
    price: 'Price',
    primary: 'New development',
    secondary: 'Resale',
    loading: 'Loading…',
    unitNotFoundTitle: 'Unit not found',
    unitNotFoundSub: 'The link is invalid or has expired.',
    loadFailed: 'Failed to load unit data',
    gallery: 'Gallery',
    layoutPlan: 'Floor plan',
    layoutFloor: 'On floor',
    installment: 'Installment',
    installmentNotConfigured: 'Installment plan not configured',
    fullPayment: 'Full payment',
    fullPaymentHint: 'One-time payment upon signing the contract.',
    priceOnRequest: 'Price on request',
    layoutNotUploaded: 'Floor plan not uploaded',
    floorPlanNotUploaded: 'Floor layout not uploaded',
    consultant: 'Consultant',
    call: 'Call',
    connect: 'Contact',
    promo: 'Promo',
    overview: 'Overview',
    whyBuy: 'Why buy this project?',
    forWhom: 'Who it is for',
    ceilings: 'Ceilings',
    condition: 'Condition',
    studio: 'Studio',
    roomsLabel: 'Bedrooms',
    floorLabel: 'Floor',
    sqm: 'm²',
    firstPayment: 'Down payment',
    monthsShort: 'mo.',
    discount: 'Discount',
    aptNumber: 'Apt.',
    lotOffer: 'Offer for lot №',
    lot: 'Lot',
    aboutProject: 'About the project',
    whatsapp: 'WhatsApp',
    telegram: 'Telegram',
    characteristics: 'Specifications',
    view: 'View',
    windowView: 'Window view',
    coastline: 'Coastline',
    blockNotFilled: 'Information is not available yet',
    galleryEmpty: 'Project photos will appear soon',
    constructionEmpty: 'Construction progress photos are not available yet',
    amenitiesEmpty: 'Amenities list is not filled in yet',
    mapCoordsMissing: 'The map will appear once the project boundaries are set',
  },
  ka: {
    personalSelection: 'პერსონალური შერჩევა',
    forClient: 'კლიენტისთვის',
    locationUnknown: 'მდებარეობა არ არის მითითებული',
    completion: 'ჩაბარება',
    priceRange: 'ფასის დიაპაზონი',
    variantsCount: 'ვარიანტი',
    aboutComplex: 'კომპლექსის შესახებ',
    locationSection: 'მდებარეობა და ტერიტორია',
    videoSection: 'პროექტის ვიდეო',
    amenitiesSection: 'კომფორტი და ინფრასტრუქტურა',
    paymentsSection: 'გადახდის ფორმები',
    installmentSection: 'განვადების პირობები',
    paymentMonthly: 'ყოველთვიურად',
    paymentQuarterly: 'კვარტალურად',
    validUntil: 'მოქმედებს',
    constructionSection: 'მშენებლობის მიმდინარეობა',
    preparedBy: 'შერჩევა მომზადებულია თქვენი აგენტის მიერ',
    reactionsHint: 'რეაქციები ავტომატურად ინახება და ჩანს აგენტთან',
    like: 'მომწონს',
    hasQuestions: 'კითხვები მაქვს',
    notSuitable: 'არ მიჯრდება',
    notFoundTitle: 'შერჩევა ვერ მოიძებნა',
    notFoundSub: 'ბმული არასწორია ან ვადა გაუვიდა.',
    copied: 'კოპირებულია',
    statusFree: 'გაყიდვაშია',
    statusBooked: 'დაჯავშნილი',
    statusSold: 'გაყიდული',
    statusWithdrawn: 'გაყვანილია',
    block: 'კორპუსი',
    floor: 'სართული',
    developer: 'დეველოპერი',
    address: 'მისამართი',
    area: 'ფართობი',
    rooms: 'ოთახები',
    price: 'ფასი',
    primary: 'ახალი აშენებულობა',
    secondary: 'მეორეული',
    loading: 'იტვირთება…',
    unitNotFoundTitle: 'ბინა ვერ მოიძებნა',
    unitNotFoundSub: 'ბმული არასწორია ან ვადა გაუვიდა.',
    loadFailed: 'ბინის მონაცემების ჩატვირთვა ვერ მოხერხდა',
    gallery: 'გალერეა',
    layoutPlan: 'გეგმარათი',
    layoutFloor: 'სართულზე',
    installment: 'განვადება',
    installmentNotConfigured: 'განვადება არ არის კონფიგურირებული',
    fullPayment: 'სრული გადახდა',
    fullPaymentHint: 'ერთჯერადი გადახდა ხელშეკრულების ხელმოწერისას.',
    priceOnRequest: 'ფასი მოთხოვნის მიხედვით',
    layoutNotUploaded: 'გეგმარათი არ არის ატვირთული',
    floorPlanNotUploaded: 'სართულის გეგმა არ არის ატვირთული',
    consultant: 'კონსულტანტი',
    call: 'დარეკვა',
    connect: 'დაკავშირება',
    promo: 'აქცია',
    overview: 'მიმოხილვა',
    whyBuy: 'რატომ ღირს პროექტის ყიდვა?',
    forWhom: 'ვისთვის',
    ceilings: 'ჭერები',
    condition: 'კონდიცია',
    studio: 'სტუდიო',
    roomsLabel: 'ოთახების რაოდენობა',
    floorLabel: 'სართული',
    sqm: 'მ²',
    firstPayment: 'პირველი შენატანი',
    monthsShort: 'თვე',
    discount: 'ფასდაკლება',
    aptNumber: 'ბინა №',
    lotOffer: 'შეთავაზება ლოტზე №',
    lot: 'ლოტი',
    aboutProject: 'პროექტის შესახებ',
    whatsapp: 'WhatsApp',
    telegram: 'Telegram',
    characteristics: 'მახასიათებლები',
    view: 'ხედი',
    windowView: 'ხედი ფანჯრიდან',
    coastline: 'სანაპირო ხაზი',
    blockNotFilled: 'ინფორმაცია ჯერ არ არის შევსებული',
    galleryEmpty: 'პროექტის ფოტოები მალე გამოჩნდება',
    constructionEmpty: 'მშენებლობის ფოტოები ჯერ არ არის',
    amenitiesEmpty: 'კომფორტის სია ჯერ არ არის შევსებული',
    mapCoordsMissing: 'რუკა გამოჩნდება ობიექტის საზღვრების მითითების შემდეგ',
  },
} as const

export type SelectionStringKey = keyof typeof STRINGS['ru']

export function t(language: SelectionLanguage, key: SelectionStringKey): string {
  return STRINGS[language][key]
}

const UNIT_STATUS_KEY: Record<string, SelectionStringKey> = {
  free: 'statusFree',
  booked: 'statusBooked',
  sold: 'statusSold',
  withdrawn: 'statusWithdrawn',
  available: 'statusFree',
  reserved: 'statusBooked',
  hidden: 'statusWithdrawn',
}

export type VisitUnitStatus = 'available' | 'reserved' | 'sold' | 'hidden'

/** Единый slug статуса для CSS-классов визитки (free/booked → available/reserved). */
export function normalizeVisitStatus(status: string): VisitUnitStatus {
  switch (status) {
    case 'free':
    case 'available':
      return 'available'
    case 'booked':
    case 'reserved':
      return 'reserved'
    case 'sold':
      return 'sold'
    default:
      return 'hidden'
  }
}

export function unitStatusLabel(language: SelectionLanguage, status: string): string {
  const key = UNIT_STATUS_KEY[status]
  return key ? t(language, key) : status
}
