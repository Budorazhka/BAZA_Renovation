import type { DevSelectionBlockKey } from '@/config/dev-selection-customization'
import type { SelectionLanguage } from '@/lib/selection-display'

/**
 * Логические блоки мини-лендинга из share-вкладки. Их порядок участвует в `blk`
 * и должен расширяться только append-only, чтобы не ломать старые ссылки.
 */
export type UnitShareVisitBlockKey =
  | 'shareObjectInfo'
  | 'shareHero'
  | 'shareBazaBranding'
  | 'shareBranding'
  | 'shareUnitCard'
  | 'shareUnitPlan'
  | 'shareUnitGallery'
  | 'shareUnitFinance'
  | 'shareInstallment'
  | 'shareFullPayment'
  | 'shareProjectInfo'
  | 'shareProjectGallery'
  | 'shareProjectInfrastructure'
  | 'shareProjectLocation'
  | 'shareDeveloperInfo'
  | 'shareLegalInfo'
  | 'sharePurchaseFlow'
  | 'shareCityInfo'
  | 'shareCityGallery'
  | 'shareDistrictInfo'
  | 'shareDistrictGallery'
  | 'shareCountryInfo'
  | 'shareCountryGallery'
  | 'shareInvestmentPotential'
  | 'shareRentalPotential'
  | 'shareSimilarUnits'
  | 'shareRealtorCard'
  | 'shareStickyContacts'
  | 'shareFinalCta'
  | 'shareProjectMap'
  | 'shareDistrict'
  | 'shareCity'
  | 'shareCountry'
  | 'shareRealtorAvatar'
  | 'shareRealtorInfo'
  | 'shareDeveloperCompanyName'
  | 'shareDeveloperLogo'

export const UNIT_VISIT_BLOCK_ORDER: UnitShareVisitBlockKey[] = [
  'shareObjectInfo',
  'shareHero',
  'shareBazaBranding',
  'shareBranding',
  'shareUnitCard',
  'shareUnitPlan',
  'shareUnitGallery',
  'shareUnitFinance',
  'shareInstallment',
  'shareFullPayment',
  'shareProjectInfo',
  'shareProjectGallery',
  'shareProjectInfrastructure',
  'shareProjectLocation',
  'shareDeveloperInfo',
  'shareLegalInfo',
  'sharePurchaseFlow',
  'shareCityInfo',
  'shareCityGallery',
  'shareDistrictInfo',
  'shareDistrictGallery',
  'shareCountryInfo',
  'shareCountryGallery',
  'shareInvestmentPotential',
  'shareRentalPotential',
  'shareSimilarUnits',
  'shareRealtorCard',
  'shareStickyContacts',
  'shareFinalCta',
  'shareProjectMap',
  'shareDistrict',
  'shareCity',
  'shareCountry',
  'shareRealtorAvatar',
  'shareRealtorInfo',
  'shareDeveloperCompanyName',
  'shareDeveloperLogo',
]

/** Подписи свитчеров «Поделиться» (ru), если отличаются от заголовков секций. */
export const UNIT_SHARE_SWITCH_LABELS_RU: Partial<Record<DevSelectionBlockKey, string>> = {
  shareObjectInfo: 'Презентация объекта',
  shareHero: 'Hero-презентация объекта',
  shareBazaBranding: 'Отправитель BAZA.sale',
  shareBranding: 'Контакт риэлтора',
  shareRealtorAvatar: 'Аватарка риэлтора',
  shareRealtorInfo: 'Описание риэлтора',
  shareDeveloperCompanyName: 'Название компании',
  shareDeveloperLogo: 'Логотип',
  shareUnitCard: 'Параметры квартиры',
  shareUnitPlan: 'Планировка квартиры',
  shareUnitGallery: 'Галерея квартиры',
  shareUnitFinance: 'Условия покупки',
  shareInstallment: 'Рассрочка',
  shareFullPayment: 'Полная оплата',
  shareProjectInfo: 'О проекте',
  shareProjectMap: 'Карта',
  shareDistrict: 'О районе',
  shareCity: 'О городе',
  shareCountry: 'О стране',
  shareProjectGallery: 'Галерея проекта',
  shareProjectInfrastructure: 'Инфраструктура проекта',
  shareProjectLocation: 'Локация проекта',
  shareDeveloperInfo: 'Застройщик',
  shareLegalInfo: 'Документы',
  sharePurchaseFlow: 'Как проходит покупка',
  shareCityInfo: 'Информация о городе',
  shareCityGallery: 'Галерея города',
  shareDistrictInfo: 'Информация о районе',
  shareDistrictGallery: 'Галерея района',
  shareCountryInfo: 'Информация о стране',
  shareCountryGallery: 'Галерея страны',
  shareInvestmentPotential: 'Инвестиционный потенциал объекта',
  shareRentalPotential: 'Арендный потенциал',
  shareSimilarUnits: 'Похожие варианты',
  shareRealtorCard: 'Карточка риэлтора',
  shareStickyContacts: 'Социальные сети',
  shareFinalCta: 'Связаться с нами',
}

/** Заголовки секций визитки — совпадают с подписями свитчеров «Поделиться». */
export const UNIT_VISIT_BLOCK_LABELS: Record<DevSelectionBlockKey, Record<SelectionLanguage, string>> = {
  countryInfo: {
    ru: 'Инвестиционные преимущества',
    en: 'Investment advantages',
    ka: 'საინვესტიციო უპირატესობები',
  },
  cityInfo: {
    ru: 'О городе',
    en: 'About the city',
    ka: 'ქალაქის შესახებ',
  },
  projectGallery: {
    ru: 'Галерея проекта',
    en: 'Project gallery',
    ka: 'პროექტის გალერეა',
  },
  projectOverview: {
    ru: 'Обзор (класс, сдача, цены)',
    en: 'Overview (class, completion, pricing)',
    ka: 'მიმოხილვა (კლასი, ჩაბარება, ფასები)',
  },
  projectDescription: {
    ru: 'Описание комплекса',
    en: 'Complex description',
    ka: 'კომპლექსის აღწერა',
  },
  amenities: {
    ru: 'Удобства и инфраструктура',
    en: 'Amenities & infrastructure',
    ka: 'კომფორტი და ინფრასტრუქტურა',
  },
  video: {
    ru: 'Видео-презентация',
    en: 'Video presentation',
    ka: 'ვიდეო პრეზენტაცია',
  },
  locationMap: {
    ru: 'Расположение на карте',
    en: 'Location on map',
    ka: 'მდებარეობა რუკაზე',
  },
  constructionProgress: {
    ru: 'Ход строительства',
    en: 'Construction progress',
    ka: 'მშენებლობის მიმდინარეობა',
  },
  unitPlan: {
    ru: 'Характеристики и планировка',
    en: 'Specs & floor plan',
    ka: 'მახასიათებლები და გეგმა',
  },
  unitSpecs: {
    ru: 'Характеристики',
    en: 'Specifications',
    ka: 'მახასიათებლები',
  },
  unitStatus: {
    ru: 'Статус продажи',
    en: 'Sale status',
    ka: 'გაყიდვის სტატუსი',
  },
  unitPrice: {
    ru: 'Цена',
    en: 'Price',
    ka: 'ფასი',
  },
  paymentPlans: {
    ru: 'Способы оплаты',
    en: 'Payment options',
    ka: 'გადახდის ფორმები',
  },
  bazasaleLogo: {
    ru: 'Логотип BazaSale',
    en: 'BazaSale logo',
    ka: 'BazaSale ლოგო',
  },
  realtorLogo: {
    ru: 'Логотип застройщика',
    en: 'Developer logo',
    ka: 'დეველოპერის ლოგო',
  },
  agentContacts: {
    ru: 'Контакты агента',
    en: 'Agent contacts',
    ka: 'აგენტის კონტაქტები',
  },
  shareObjectInfo: {
    ru: 'Презентация объекта',
    en: 'Unit presentation',
    ka: 'ობიექტის პრეზენტაცია',
  },
  shareHero: {
    ru: 'Hero-презентация объекта',
    en: 'Hero presentation',
    ka: 'ობიექტის გმირი-პრეზენტაცია',
  },
  shareBazaBranding: {
    ru: 'Отправитель BAZA.sale',
    en: 'Sent via BAZA.sale',
    ka: 'BAZA.sale',
  },
  shareBranding: {
    ru: 'Контакт риэлтора',
    en: 'Realtor contact',
    ka: 'რიელტორის კონტაქტი',
  },
  shareUnitCard: {
    ru: 'Параметры квартиры',
    en: 'Unit details',
    ka: 'ბინის პარამეტრები',
  },
  shareUnitPlan: {
    ru: 'Планировка',
    en: 'Floor plan',
    ka: 'გეგმარება',
  },
  shareUnitGallery: {
    ru: 'Галерея',
    en: 'Gallery',
    ka: 'გალერეა',
  },
  shareUnitFinance: {
    ru: 'Условия покупки',
    en: 'Purchase terms',
    ka: 'შეძენის პირობები',
  },
  shareInstallment: {
    ru: 'Рассрочка',
    en: 'Installment',
    ka: 'განვადება',
  },
  shareFullPayment: {
    ru: 'Полная оплата',
    en: 'Full payment',
    ka: 'სრული გადახდა',
  },
  shareProjectInfo: {
    ru: 'О проекте',
    en: 'About the project',
    ka: 'პროექტის შესახებ',
  },
  shareProjectGallery: {
    ru: 'Галерея проекта',
    en: 'Project Gallery',
    ka: 'პროექტის გალერეა',
  },
  shareProjectInfrastructure: {
    ru: 'Инфраструктура',
    en: 'Infrastructure',
    ka: 'ინფრასტრუქტურა',
  },
  shareProjectLocation: {
    ru: 'Расположение',
    en: 'Location',
    ka: 'მდებარეობა',
  },
  shareDeveloperInfo: {
    ru: 'Застройщик',
    en: 'Developer',
    ka: 'დეველოპერი',
  },
  shareLegalInfo: {
    ru: 'Документы',
    en: 'Documents',
    ka: 'დოკუმენტები',
  },
  sharePurchaseFlow: {
    ru: 'Как проходит покупка',
    en: 'How it works',
    ka: 'როგორ მიმდინარეობს ყიდვა',
  },
  shareCityInfo: {
    ru: 'О городе',
    en: 'About the city',
    ka: 'ქალაქის შესახებ',
  },
  shareCityGallery: {
    ru: 'Город',
    en: 'City',
    ka: 'ქალაქი',
  },
  shareDistrictInfo: {
    ru: 'Район',
    en: 'District',
    ka: 'რაიონი',
  },
  shareDistrictGallery: {
    ru: 'Атмосфера района',
    en: 'District photos',
    ka: 'რაიონის გალერეა',
  },
  shareCountryInfo: {
    ru: 'О стране',
    en: 'About the country',
    ka: 'ქვეყნის შესახებ',
  },
  shareCountryGallery: {
    ru: 'Страна',
    en: 'Country',
    ka: 'ქვეყანა',
  },
  shareInvestmentPotential: {
    ru: 'Инвестиционный потенциал',
    en: 'Investment potential',
    ka: 'საინვესტიციო პოტენციალი',
  },
  shareRentalPotential: {
    ru: 'Возможная аренда',
    en: 'Rental potential',
    ka: 'საიჯარო პოტენციალი',
  },
  shareSimilarUnits: {
    ru: 'Похожие варианты',
    en: 'Similar options',
    ka: 'მსგავსი ვარიანტები',
  },
  shareRealtorCard: {
    ru: 'Ваш консультант',
    en: 'Your consultant',
    ka: 'თქვენი კონსულტანტი',
  },
  shareStickyContacts: {
    ru: 'Социальные сети',
    en: 'Social links',
    ka: 'სოციალური ქსელები',
  },
  shareFinalCta: {
    ru: 'Связаться с нами',
    en: 'Contact us',
    ka: 'დაგვიკავშირდით',
  },
  shareProjectMap: {
    ru: 'Карта',
    en: 'Map',
    ka: 'რუკა',
  },
  shareDistrict: {
    ru: 'О районе',
    en: 'About the district',
    ka: 'რაიონის შესახებ',
  },
  shareCity: {
    ru: 'О городе',
    en: 'About the city',
    ka: 'ქალაქის შესახებ',
  },
  shareCountry: {
    ru: 'О стране',
    en: 'About the country',
    ka: 'ქვეყნის შესახებ',
  },
  shareRealtorAvatar: {
    ru: 'Аватарка риэлтора',
    en: 'Realtor avatar',
    ka: 'რიელტორის ავატარი',
  },
  shareRealtorInfo: {
    ru: 'Описание риэлтора',
    en: 'Realtor bio',
    ka: 'რიელტორის აღწერა',
  },
  shareDeveloperCompanyName: {
    ru: 'Название компании',
    en: 'Company name',
    ka: 'კომპანიის სახელი',
  },
  shareDeveloperLogo: {
    ru: 'Логотип',
    en: 'Logo',
    ka: 'ლოგო',
  },
}

export function visitBlockLabel(language: SelectionLanguage, key: DevSelectionBlockKey): string {
  return UNIT_VISIT_BLOCK_LABELS[key][language]
}
