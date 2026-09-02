import type { PublicUnitLanding } from '@/services/developmentApi'
import type { SelectionLanguage } from '@/lib/selection-display'
import type { UnitShareAgent } from '@/lib/unit-share'
import { normalizeOptionValue, optionLabelRu, type OptionGroup } from '@/lib/project-options'
import type { IBuilding, IUnit } from '@/types/core'

type VisitInfoContent = {
  intro: string
  bullets: string[]
  note?: string
}

export type ShareGalleryContent = {
  images: string[]
  note?: string
}

export type SimilarUnitCard = {
  unitId: string
  number: string
  rooms: string
  area?: number | null
  floor?: number | null
  price?: number | null
  buildingName?: string
}

function dedupe(items: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of items) {
    const value = item?.trim()
    if (!value || seen.has(value)) continue
    seen.add(value)
    result.push(value)
  }
  return result
}

function localize(
  language: SelectionLanguage,
  ru: string,
  en: string,
  ka: string,
): string {
  if (language === 'en') return en
  if (language === 'ka') return ka
  return ru
}

/**
 * Подпись для канонического значения опции проекта (classType, coastline, …).
 * ru — русская подпись; остальные языки — канонический слаг.
 */
function optText(language: SelectionLanguage, group: OptionGroup, value: string | undefined | null): string {
  const canonical = normalizeOptionValue(group, value)
  if (!canonical) return ''
  return language === 'ru' ? optionLabelRu(group, canonical) : canonical
}

export function formatVisitActualDate(language: SelectionLanguage, date = new Date()): string {
  const locale = language === 'en' ? 'en-US' : language === 'ka' ? 'ka-GE' : 'ru-RU'
  return date.toLocaleDateString(locale)
}

export function resolveShareUnitGallery(
  landing: PublicUnitLanding,
  projectGalleryImages: string[],
): ShareGalleryContent {
  const unitImages = dedupe([
    landing.unit.image?.url,
    landing.unit.floorPlanImage?.url,
    landing.unit.floorPlanUrl,
  ])
  if (unitImages.length >= 2) return { images: unitImages.slice(0, 5) }

  const fallback = dedupe([
    ...unitImages,
    landing.complex.coverUrl,
    landing.complex.cover?.url,
    ...projectGalleryImages,
  ]).slice(0, 5)

  return {
    images: fallback,
    note:
      fallback.length > 0
        ? 'В этом блоке используются визуалы проекта и планировки как ориентир по стилю и окружению лота.'
        : undefined,
  }
}

function resolveDistrictName(complex: PublicUnitLanding['complex'], building: PublicUnitLanding['building']): string {
  const address = complex.address?.trim()
  if (!address) return building.name || complex.name
  const parts = address.split(',').map((part) => part.trim()).filter(Boolean)
  return parts[1] || parts[0] || building.name || complex.name
}

export function resolveProjectInfoContent(
  landing: PublicUnitLanding,
  language: SelectionLanguage,
): VisitInfoContent {
  const complex = landing.complex
  const lines = [
    complex.description?.trim(),
    complex.descriptionWhy?.trim(),
    complex.descriptionWho?.trim(),
  ].filter(Boolean) as string[]

  if (lines.length > 0) {
    return {
      intro: lines[0],
      bullets: lines.slice(1),
    }
  }

  return {
    intro: localize(
      language,
      `${complex.name} — проект для покупателей, которым важны понятные условия входа, визуальная среда и ликвидная новостройка.`,
      `${complex.name} is designed for buyers who value a clear purchase path, strong visual appeal, and a liquid new-build product.`,
      `${complex.name} განკუთვნილია მყიდველებისთვის, ვისაც მნიშვნელოვანია გასაგები შეძენის პროცესი, ძლიერი ვიზუალური გარემო და ლიკვიდური ახალი აშენებული ობიექტი.`,
    ),
    bullets: dedupe([
      complex.classType
        ? localize(
            language,
            `Класс проекта: ${optText(language, 'classTypes', complex.classType)}`,
            `Project class: ${optText(language, 'classTypes', complex.classType)}`,
            `პროექტის კლასი: ${optText(language, 'classTypes', complex.classType)}`,
          )
        : null,
      complex.developmentStage
        ? localize(
            language,
            `Стадия строительства: ${complex.developmentStage}`,
            `Construction stage: ${complex.developmentStage}`,
            `მშენებლობის ეტაპი: ${complex.developmentStage}`,
          )
        : null,
      complex.completionDate
        ? localize(
            language,
            `Плановая сдача: ${complex.completionDate}`,
            `Planned completion: ${complex.completionDate}`,
            `დაგეგმილი ჩაბარება: ${complex.completionDate}`,
          )
        : null,
      complex.paymentTypes?.[0]
        ? localize(
            language,
            `Подходит для сценариев: жизнь, отдых, аренда и инвестиция.`,
            `Suitable for living, lifestyle, rental and investment scenarios.`,
            `გამოდგება საცხოვრებლად, დასასვენებლად, იჯარისთვის და საინვესტიციო სცენარისთვის.`,
          )
        : null,
    ]),
  }
}

export function resolveDistrictContent(
  landing: PublicUnitLanding,
  language: SelectionLanguage,
): VisitInfoContent {
  const complex = landing.complex
  const district = resolveDistrictName(complex, landing.building)
  // Приоритет — текст про район из визарда ЖК; иначе собираем из инфраструктуры.
  const districtText = complex.districtText?.trim()
  const coastlineLabel = optText(language, 'coastline', complex.coastline)
  const bullets = dedupe([
    ...(complex.infrastructureLocation ?? []).map((v) => optText(language, 'infraLocation', v)),
    ...(complex.infrastructureExternal ?? []).slice(0, 3).map((v) => optText(language, 'infraExternal', v)),
    coastlineLabel
      ? localize(
          language,
          `Ориентир по расположению: ${coastlineLabel}`,
          `Location cue: ${coastlineLabel}`,
          `ლოკაციის ორიენტირი: ${coastlineLabel}`,
        )
      : null,
  ]).slice(0, 5)

  return {
    intro:
      districtText ||
      (district
        ? localize(language, `Район: ${district}`, `District: ${district}`, `უბანი: ${district}`)
        : ''),
    bullets:
      bullets.length > 0
        ? bullets
        : [
            localize(
              language,
              'Рядом важные точки городской инфраструктуры и сервисов.',
              'Nearby are essential city services and day-to-day infrastructure.',
              'ახლოს არის ქალაქის მნიშვნელოვანი სერვისები და ყოველდღიური ინფრასტრუქტურა.',
            ),
            localize(
              language,
              'Локация подходит как для жизни, так и для сдачи в аренду.',
              'The location works both for living and for rental scenarios.',
              'ლოკაცია გამოდგება როგორც საცხოვრებლად, ისე გასაქირავებლად.',
            ),
          ],
  }
}

export function resolveCountryInfoContent(
  landing: PublicUnitLanding,
  language: SelectionLanguage,
): VisitInfoContent {
  const countryRaw = (landing.complex.country ?? '').toLowerCase()
  const isGeorgia =
    normalizeOptionValue('countries', landing.complex.country) === 'ge' ||
    countryRaw.includes('georgia') ||
    countryRaw.includes('грузи') ||
    countryRaw.includes('საქართველო')

  if (isGeorgia) {
    return {
      intro: localize(
        language,
        'Грузия — одна из самых быстро развивающихся стран региона с богатой культурой, уникальной природой и открытой экономикой.',
        'Georgia is one of the fastest-growing countries in the region, with a rich culture, stunning nature, and an open economy.',
        'საქართველო რეგიონის ერთ-ერთი ყველაზე სწრაფად განვითარებადი ქვეყანაა მდიდარი კულტურით, უნიკალური ბუნებით და ღია ეკონომიკით.',
      ),
      bullets: [
        localize(
          language,
          'Уникальное сочетание: горы, море, термальные курорты и старинные города — всё в одной небольшой стране.',
          'A unique combination: mountains, sea, thermal resorts, and ancient cities — all within one small country.',
          'უნიკალური კომბინაცია: მთები, ზღვა, თერმული კურორტები და ძველი ქალაქები — ყველაფერი ერთ პატარა ქვეყანაში.',
        ),
        localize(
          language,
          'Упрощённый налоговый режим для иностранных покупателей: нет налога на прирост капитала при перепродаже через 2+ года.',
          'Simplified tax regime for foreign buyers: no capital gains tax on resale after 2+ years of ownership.',
          'გამარტივებული საგადასახადო რეჟიმი უცხოელი მყიდველებისთვის: კაპიტალის მოგების გადასახადი არ ვრცელდება 2+ წლიანი საკუთრების შემდეგ.',
        ),
        localize(
          language,
          'Иностранцы имеют право на покупку недвижимости наравне с гражданами — без ограничений по площади или количеству объектов.',
          'Foreigners have the same rights to purchase property as citizens — with no limits on area or number of units.',
          'უცხოელებს აქვთ უფლება შეიძინონ საკუთრება მოქალაქეების თანაბრად — ფართობის ან ობიექტების რაოდენობის შეზღუდვების გარეშე.',
        ),
        localize(
          language,
          'Быстрое развитие инфраструктуры: новые дороги, аэропорты, морские порты и туристические зоны растут темпами выше среднеевропейских.',
          'Rapidly developing infrastructure: new roads, airports, seaports, and tourist zones growing faster than the European average.',
          'სწრაფი ინფრასტრუქტურის განვითარება: ახალი გზები, აეროპორტები, საზღვაო პორტები და ტურისტული ზონები ევროპულ საშუალოზე სწრაფად იზრდება.',
        ),
        localize(
          language,
          'Грузинское гостеприимство и высокий уровень безопасности делают страну привлекательной для длительного проживания и семейной жизни.',
          'Georgian hospitality and high safety levels make the country appealing for long-term living and family life.',
          'ქართული სტუმართმოყვარეობა და უსაფრთხოების მაღალი დონე ქვეყანას მიმზიდველს ხდის გრძელვადიანი საცხოვრებლად და საოჯახო ცხოვრებისთვის.',
        ),
      ],
      note: '',
    }
  }

  const country = optText(language, 'countries', landing.complex.country) || localize(language, 'Страна проекта', 'Project country', 'პროექტის ქვეყანა')
  return {
    intro: localize(
      language,
      `${country} — страна с развивающейся экономикой, растущим рынком недвижимости и интересом со стороны международных покупателей.`,
      `${country} is a country with a growing economy, an expanding real estate market, and increasing interest from international buyers.`,
      `${country} — ქვეყანა განვითარებადი ეკონომიკით, მზარდი უძრავი ქონების ბაზრით და საერთაშორისო მყიდველთა მზარდი ინტერესით.`,
    ),
    bullets: [
      localize(
        language,
        'Иностранные покупатели могут приобретать недвижимость с соблюдением местного законодательства.',
        'Foreign buyers may purchase property subject to local legislation.',
        'უცხოელ მყიდველებს შეუძლიათ შეიძინონ საკუთრება ადგილობრივი კანონმდებლობის დაცვით.',
      ),
      localize(
        language,
        'Растущий туристический поток создаёт устойчивый спрос на краткосрочную и долгосрочную аренду.',
        'A growing tourist flow creates stable demand for short- and long-term rental.',
        'მზარდი ტურისტული ნაკადი ქმნის სტაბილურ მოთხოვნას მოკლე და გრძელვადიან გასაქირავებლად.',
      ),
      localize(
        language,
        'Детали налогообложения и регистрации уточняются перед подписанием договора.',
        'Tax and registration details should be confirmed before signing the agreement.',
        'გადასახადებისა და რეგისტრაციის დეტალები უნდა დაზუსტდეს ხელშეკრულების გაფორმებამდე.',
      ),
    ],
    note: '',
  }
}

export function resolveLegalInfoContent(
  landing: PublicUnitLanding,
  language: SelectionLanguage,
): VisitInfoContent {
  const developerName = landing.complex.developerProfile?.name || landing.complex.developer || landing.complex.name
  return {
    intro: localize(
      language,
      'Юридический блок помогает заранее снять ключевые страхи клиента по безопасности сделки и прозрачности оформления.',
      'The legal block helps address the main concerns around transaction safety and paperwork transparency.',
      'იურიდიული ბლოკი ეხმარება კლიენტის ძირითადი შიშების მოხსნას გარიგების უსაფრთხოებისა და დოკუმენტაციის გამჭვირვალობის შესახებ.',
    ),
    bullets: [
      localize(
        language,
        `Проект реализуется девелопером ${developerName}.`,
        `The project is delivered by ${developerName}.`,
        `პროექტს ახორციელებს დეველოპერი ${developerName}.`,
      ),
      localize(
        language,
        'По запросу можно получить пакет документов и разбор юридической схемы покупки.',
        'A document pack and a walkthrough of the purchase structure can be requested.',
        'მოთხოვნის შემთხვევაში შესაძლებელია დოკუმენტების პაკეტის და შესყიდვის სქემის ახსნა.',
      ),
      localize(
        language,
        'Условия регистрации права, налоги и дополнительные расходы подтверждаются перед бронированием.',
        'Registration steps, taxes, and additional costs should be confirmed before reservation.',
        'რეგისტრაციის ეტაპები, გადასახადები და დამატებითი ხარჯები უნდა დადასტურდეს დაჯავშნამდე.',
      ),
    ],
    note: '',
  }
}

export function resolvePurchaseFlowContent(language: SelectionLanguage): string[] {
  return [
    localize(language, 'Консультация и уточнение целей покупки', 'Consultation and clarification of the buying goal', 'კონსულტაცია და ყიდვის მიზნის დაზუსტება'),
    localize(language, 'Проверка условий по лоту и способу оплаты', 'Verification of the unit terms and payment method', 'ლოტის პირობებისა და გადახდის მეთოდის გადამოწმება'),
    localize(language, 'Бронирование и согласование документов', 'Reservation and document alignment', 'დაჯავშნა და დოკუმენტების შეთანხმება'),
    localize(language, 'Подписание договора и оплата по графику', 'Contract signing and payment according to schedule', 'ხელშეკრულების გაფორმება და გადახდა გრაფიკის მიხედვით'),
    localize(language, 'Регистрация и сопровождение до передачи объекта', 'Registration and support until handover', 'რეგისტრაცია და сопровождение ობიექტის გადაცემამდე'),
  ]
}

export function resolveInvestmentContent(
  landing: PublicUnitLanding,
  language: SelectionLanguage,
): VisitInfoContent {
  const complex = landing.complex
  // Приоритет — текст и цифры, заданные менеджером застройщика в визарде.
  const investmentText = complex.investmentText?.trim()
  const descriptionWhy = complex.descriptionWhy?.trim()

  return {
    intro: investmentText || descriptionWhy || localize(
      language,
      `${complex.name} — проект с инвестиционным потенциалом для покупателей, оценивающих рост цены, ликвидность и арендный сценарий.`,
      `${complex.name} is a project with investment potential for buyers evaluating price growth, liquidity, and a rental scenario.`,
      `${complex.name} — პროექტი საინვესტიციო პოტენციალით მყიდველებისთვის, რომლებიც აფასებენ ფასის ზრდას, ლიკვიდობას და საიჯარო სცენარს.`,
    ),
    bullets: dedupe([
      complex.investmentYield
        ? localize(
            language,
            `Ожидаемая доходность: около ${complex.investmentYield}% годовых.`,
            `Expected yield: around ${complex.investmentYield}% per year.`,
            `მოსალოდნელი სარგებელი: დაახლოებით ${complex.investmentYield}% წელიწადში.`,
          )
        : null,
      complex.developmentStage
        ? localize(
            language,
            `Текущая стадия: ${complex.developmentStage}.`,
            `Current stage: ${complex.developmentStage}.`,
            `მიმდინარე ეტაპი: ${complex.developmentStage}.`,
          )
        : null,
      localize(
        language,
        'Агент подготовит расчёт доходности и сравнение с аналогами по запросу.',
        'The agent can prepare a yield calculation and comparable analysis upon request.',
        'აგენტი მოამზადებს შემოსავლიანობის გაანგარიშებას და ანალოგებთან შედარებას მოთხოვნის შემთხვევაში.',
      ),
    ]),
    note: '',
  }
}

export function resolveRentalContent(
  landing: PublicUnitLanding,
  language: SelectionLanguage,
): VisitInfoContent {
  const complex = landing.complex
  // Приоритет — данные из визарда (текст и/или проценты доходности).
  const rentalText = complex.rentalText?.trim()
  const hasYields = complex.rentalYieldShort != null || complex.rentalYieldLong != null
  if (rentalText || hasYields) {
    return {
      intro:
        rentalText ||
        localize(
          language,
          `${complex.name} подходит под арендный сценарий — краткосрочную или долгосрочную сдачу.`,
          `${complex.name} fits a rental scenario — short-term or long-term letting.`,
          `${complex.name} შესაფერისია საიჯარო სცენარისთვის — მოკლე ან გრძელვადიანი გაქირავება.`,
        ),
      bullets: dedupe([
        complex.rentalYieldShort != null
          ? localize(
              language,
              `Краткосрочная аренда: около ${complex.rentalYieldShort}% годовых.`,
              `Short-term rental: around ${complex.rentalYieldShort}% per year.`,
              `მოკლევადიანი გაქირავება: დაახლოებით ${complex.rentalYieldShort}% წელიწადში.`,
            )
          : null,
        complex.rentalYieldLong != null
          ? localize(
              language,
              `Долгосрочная аренда: около ${complex.rentalYieldLong}% годовых.`,
              `Long-term rental: around ${complex.rentalYieldLong}% per year.`,
              `გრძელვადიანი გაქირავება: დაახლოებით ${complex.rentalYieldLong}% წელიწადში.`,
            )
          : null,
        localize(
          language,
          'Агент подготовит расчёт доходности под ваш сценарий по запросу.',
          'The agent can prepare a yield calculation for your scenario on request.',
          'აგენტი მოამზადებს შემოსავლიანობის გაანგარიშებას მოთხოვნის შემთხვევაში.',
        ),
      ]),
      note: '',
    }
  }

  const countryRaw = (landing.complex.country ?? '').toLowerCase()
  const cityRaw = (landing.complex.city ?? '').toLowerCase()
  const isBatumi = cityRaw.includes('batumi') || cityRaw.includes('батум') || cityRaw.includes('ბათ')
  const isGeorgia =
    normalizeOptionValue('countries', landing.complex.country) === 'ge' ||
    countryRaw.includes('georgia') || countryRaw.includes('грузи') || countryRaw.includes('საქართველო')
  const city = optText(language, 'cities', landing.complex.city) || localize(language, 'этом городе', 'this city', 'ამ ქალაქში')

  if (isBatumi) {
    return {
      intro: localize(
        language,
        'Батуми — один из самых активных рынков краткосрочной аренды на черноморском побережье. Туристический поток растёт круглогодично.',
        'Batumi is one of the most active short-term rental markets on the Black Sea coast. Tourist flow grows year-round.',
        'ბათუმი შავი ზღვის სანაპიროზე მოკლევადიანი გაქირავების ერთ-ერთი ყველაზე აქტიური ბაზარია. ტურისტული ნაკადი წლის განმავლობაში იზრდება.',
      ),
      bullets: [
        localize(
          language,
          'Краткосрочная аренда (посуточно): средняя доходность 8–14% годовых при хорошей заполняемости в высокий сезон (июнь–сентябрь).',
          'Short-term rental (daily): average yield of 8–14% per year with good occupancy in high season (June–September).',
          'მოკლევადიანი გაქირავება (დღიურად): საშუალო სარგებელი 8–14% წელიწადში კარგი დასაქმებით სეზონის პიკზე (ივნისი–სექტემბერი).',
        ),
        localize(
          language,
          'Долгосрочная аренда: стабильный пассивный доход 5–8% годовых без сезонных колебаний и управленческих усилий.',
          'Long-term rental: stable passive income of 5–8% per year without seasonal fluctuations or management effort.',
          'გრძელვადიანი გაქირავება: სტაბილური პასიური შემოსავალი 5–8% წელიწადში სეზონური რყევების და მენეჯმენტის ძალისხმევის გარეშე.',
        ),
        localize(
          language,
          'Рост туристического потока в Грузии: +20–25% ежегодно в последние годы, что поддерживает высокий спрос на аренду.',
          'Tourist arrivals in Georgia grow 20–25% annually in recent years, sustaining strong rental demand.',
          'ტურისტების ჩამოსვლა საქართველოში ბოლო წლებში 20–25%-ით იზრდება წლიურად, რაც მაღალ საიჯარო მოთხოვნას ინარჩუნებს.',
        ),
        localize(
          language,
          'Управляющие компании берут на себя заселение, уборку и коммуникацию с гостями — от 15–20% от дохода.',
          'Property management companies handle check-in, cleaning, and guest communication — from 15–20% of rental income.',
          'მართვის კომპანიები ზრუნავენ სტუმრების შეყვანაზე, დალაგებაზე და კომუნიკაციაზე — შემოსავლის 15–20%-ად.',
        ),
      ],
      note: '',
    }
  }

  if (isGeorgia) {
    return {
      intro: localize(
        language,
        `${city} привлекает арендаторов благодаря росту туристического потока, развитой инфраструктуре и доступным ценам на проживание.`,
        `${city} attracts tenants due to growing tourist flow, developed infrastructure, and affordable living costs.`,
        `${city} მოიზიდავს დამქირავებლებს ტურისტული ნაკადის ზრდის, განვითარებული ინფრასტრუქტურის და ხელმისაწვდომი საცხოვრებელი ხარჯების გამო.`,
      ),
      bullets: [
        localize(
          language,
          'Грузия входит в топ-10 стран по простоте открытия бизнеса — аренда оформляется быстро и без бюрократии.',
          'Georgia ranks in the top 10 for ease of doing business — rental setup is fast and bureaucracy-free.',
          'საქართველო შედის ტოპ-10 ქვეყნებში ბიზნესის სიმარტივის მიხედვით — გაქირავება ფორმდება სწრაფად და ბიუროკრატიის გარეშე.',
        ),
        localize(
          language,
          'Налог на доход от аренды для физических лиц — 5%, для нерезидентов — 20% (можно оптимизировать через ИП в Грузии).',
          'Rental income tax for individuals is 5%, for non-residents — 20% (can be optimised via a Georgian sole proprietorship).',
          'საიჯარო შემოსავლის გადასახადი ფიზიკური პირებისთვის — 5%, არარეზიდენტებისთვის — 20% (ოპტიმიზაცია შესაძლებელია ქართული ინდ. მეწარმის მეშვეობით).',
        ),
        localize(
          language,
          'Агент помогает подобрать сценарий аренды и при необходимости подключить управляющую компанию.',
          'The agent can help select a rental strategy and connect you with a property management company if needed.',
          'აგენტი დაგეხმარებათ საიჯარო სტრატეგიის შერჩევაში და საჭიროების შემთხვევაში მართვის კომპანიასთან დაკავშირებაში.',
        ),
      ],
      note: '',
    }
  }

  const location = [
    optText(language, 'cities', landing.complex.city),
    optText(language, 'countries', landing.complex.country),
  ].filter(Boolean).join(', ')
  return {
    intro: localize(
      language,
      `Лот можно рассматривать под долгосрочную или краткосрочную аренду${location ? ` в ${location}` : ''}.`,
      `This unit can be considered for long-term or short-term rental${location ? ` in ${location}` : ''}.`,
      `ეს ლოტი შეიძლება განიხილებოდეს გრძელვადიანი ან მოკლევადიანი იჯარისთვის${location ? ` ${location}-ში` : ''}.`,
    ),
    bullets: [
      localize(
        language,
        'Для аренды важны транспорт, инфраструктура и понятная планировка для будущего арендатора.',
        'Transport access, infrastructure, and a tenant-friendly layout are key rental drivers.',
        'იჯარისთვის მნიშვნელოვანია ტრანსპორტი, ინფრასტრუქტურა და მომავალი დამქირავებლისთვის გასაგები გეგმარება.',
      ),
      localize(
        language,
        'Агент подготовит подборку сопоставимых предложений и сценарий аренды по запросу.',
        'The agent can prepare comparable listings and a rental scenario upon request.',
        'საჭიროების შემთხვევაში აგენტი მოამზადებს შედარებით შეთავაზებებს და საიჯარო სცენარს.',
      ),
    ],
    note: '',
  }
}
export function resolveRealtorBio(agent: UnitShareAgent | null | undefined, language: SelectionLanguage): string {
  const name = agent?.name?.trim()
  if (!name) {
    return localize(
      language,
      'Контактный специалист поможет уточнить условия сделки, подобрать похожие варианты и сопроводить клиента до бронирования.',
      'A contact specialist can clarify the deal structure, propose similar options, and guide the client through reservation.',
      'საკონტაქტო სპეციალისტი დაგეხმარებათ გარიგების პირობების დაზუსტებაში, მსგავსი ვარიანტების შერჩევასა და დაჯავშნამდე сопровождении.',
    )
  }

  return localize(
    language,
    `${name} сопровождает клиента по объекту, помогает сверить условия сделки и подобрать следующие шаги после просмотра мини-лендинга.`,
    `${name} supports the client on this unit, helps verify the deal terms, and suggests the next steps after reviewing the mini landing.`,
    `${name} ახლავს კლიენტს ამ ობიექტზე, ეხმარება გარიგების პირობების გადამოწმებაში და სთავაზობს შემდეგ ნაბიჯებს მინი-ლენდინგის ნახვის შემდეგ.`,
  )
}

export function buildAgentCtaMessage(
  kind: 'docs' | 'similar' | 'reserve' | 'generic',
  unitTitle: string,
  language: SelectionLanguage,
): string {
  if (kind === 'docs') {
    return localize(
      language,
      `Здравствуйте! Хочу запросить документы по ${unitTitle}.`,
      `Hello! I would like to request the documents for ${unitTitle}.`,
      `გამარჯობა! მსურს დოკუმენტების მოთხოვნა ობიექტზე: ${unitTitle}.`,
    )
  }
  if (kind === 'similar') {
    return localize(
      language,
      `Здравствуйте! Нужна подборка похожих вариантов по ${unitTitle}.`,
      `Hello! I would like to receive similar options for ${unitTitle}.`,
      `გამარჯობა! მსურს მსგავსი ვარიანტების მიღება ობიექტზე: ${unitTitle}.`,
    )
  }
  if (kind === 'reserve') {
    return localize(
      language,
      `Здравствуйте! Хочу обсудить бронирование ${unitTitle}.`,
      `Hello! I would like to discuss reserving ${unitTitle}.`,
      `გამარჯობა! მსურს განვიხილო დაჯავშნა ობიექტზე: ${unitTitle}.`,
    )
  }
  return localize(
    language,
    `Здравствуйте! Интересует ${unitTitle}.`,
    `Hello! I am interested in ${unitTitle}.`,
    `გამარჯობა! მაინტერესებს ${unitTitle}.`,
  )
}

export function resolveSimilarUnits(
  currentUnitId: string,
  currentUnit: PublicUnitLanding['unit'],
  allUnits: IUnit[],
  buildings: IBuilding[],
): SimilarUnitCard[] {
  const sameProjectBuildingIds = new Set(
    buildings
      .filter((building) => building.project === currentUnit.complexId)
      .map((building) => building._id),
  )

  return allUnits
    .filter((candidate) => candidate._id !== currentUnitId && sameProjectBuildingIds.has(candidate.building))
    .map((candidate) => {
      const score =
        Math.abs((candidate.area ?? 0) - (currentUnit.area ?? 0)) +
        Math.abs((candidate.price ?? 0) - (currentUnit.price ?? 0)) / 1000 +
        (candidate.rooms === currentUnit.rooms ? 0 : 25)

      return { candidate, score }
    })
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map(({ candidate }) => ({
      unitId: candidate._id,
      number: String(candidate.number),
      rooms: candidate.rooms ?? '',
      area: candidate.area,
      floor: candidate.floor,
      price: candidate.price,
      buildingName: buildings.find((building) => building._id === candidate.building)?.name,
    }))
}
