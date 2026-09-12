import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useSeoMetadata } from '../hooks/useSeoMetadata'
import { useI18n } from '../i18n'
import type { Language, Translate } from '../i18n'

/*
 * Доска запросов клиентов — фрейм `search result (2 page)` (`2287:34150`):
 * слева панель «Фильтр» (`2287:34177`), в центре строка со счётчиком и
 * сортировкой (`2287:34221`) и карточки «card Запрос» (`2287:34226`).
 *
 * Бэкенда у доски пока нет (очередь владельца, N-13), запросы ниже —
 * образцы для витрины. Даты считаются от сегодняшнего дня, иначе фильтр
 * «Актуальность» со временем опустошал бы список.
 *
 * Переводится только оболочка (заголовки, подписи, кнопки) — сами запросы
 * образец пользовательского контента и на переключатель языка не должны
 * реагировать, как не переводятся описания объектов из базы.
 */

type DealType = 'buy' | 'rent'
type City = 'Батуми' | 'Тбилиси'
type PropertyKind =
  | 'newbuild'
  | 'secondary'
  | 'house'
  | 'land'
  | 'other'
  | 'office'
  | 'warehouse'
  | 'retail'
  | 'free'

export interface ClientRequestItem {
  id: string
  authorName: string
  dealType: DealType
  kind: PropertyKind
  city: City
  budget: { amount: number; perMonth?: boolean }
  title: string
  comment: string
  phone: string
  daysAgo: number
}

/* Подписи переключателей — ключи словаря, порядок как в макете (`2287:34200`…`2287:34214`). */
const RESIDENTIAL: Array<[PropertyKind, string]> = [
  ['newbuild', 'requests.kind.newbuild'],
  ['secondary', 'requests.kind.secondary'],
  ['house', 'requests.kind.house'],
  ['land', 'requests.kind.land'],
  ['other', 'requests.kind.other'],
]

const COMMERCIAL: Array<[PropertyKind, string]> = [
  ['office', 'requests.kind.office'],
  ['warehouse', 'requests.kind.warehouse'],
  ['retail', 'requests.kind.retail'],
  ['free', 'requests.kind.free'],
]

/* Короткие названия для низа карточки: там значение набрано 22px. */
const KIND_SHORT_KEY: Record<PropertyKind, string> = {
  newbuild: 'requests.kindShort.newbuild',
  secondary: 'requests.kindShort.secondary',
  house: 'requests.kindShort.house',
  land: 'requests.kindShort.land',
  other: 'requests.kindShort.other',
  office: 'requests.kindShort.office',
  warehouse: 'requests.kindShort.warehouse',
  retail: 'requests.kindShort.retail',
  free: 'requests.kindShort.free',
}

const DEAL_LABEL_KEY: Record<DealType, string> = { buy: 'requests.category.buy', rent: 'requests.category.rent' }

/*
 * Сами запросы — образцы, стоят в очереди на backend (N-13), поэтому не
 * переведены: это будущий контент с витрины, а не интерфейс.
 */
const REQUESTS: ClientRequestItem[] = [
  {
    id: 'req-1',
    authorName: 'Константин М.',
    dealType: 'buy',
    kind: 'newbuild',
    city: 'Батуми',
    budget: { amount: 90000 },
    title: 'Куплю двушку в центре Батуми',
    comment:
      'Рассмотрю варианты в новостройках, в современном доме с лифтом и парковкой. Важно: хорошее состояние, вид из окон и пешая доступность до набережной. Интересует светлое, чистое жильё с мебелью, техникой и хорошим ремонтом.',
    phone: '+995 599 00 00 01',
    daysAgo: 0,
  },
  {
    id: 'req-2',
    authorName: 'Нино К.',
    dealType: 'rent',
    kind: 'secondary',
    city: 'Батуми',
    budget: { amount: 700, perMonth: true },
    title: 'Сниму квартиру в Батуми с современным интерьером',
    comment:
      'Желательно 2–3 комнаты, рядом с центром или в районе Старого города. Нужна чистая, ухоженная квартира с мебелью, кондиционером и балконом.',
    phone: '+995 599 00 00 02',
    daysAgo: 1,
  },
  {
    id: 'req-3',
    authorName: 'Давид Г.',
    dealType: 'rent',
    kind: 'retail',
    city: 'Батуми',
    budget: { amount: 2500, perMonth: true },
    title: 'Сниму помещение под шоурум или салон',
    comment:
      'Площадь 40–100 м², желательно на первой линии с хорошим потоком людей. Рассмотрю районы: центр, Новый бульвар.',
    phone: '+995 599 00 00 03',
    daysAgo: 2,
  },
  {
    id: 'req-4',
    authorName: 'Татьяна В.',
    dealType: 'buy',
    kind: 'newbuild',
    city: 'Батуми',
    budget: { amount: 55000 },
    title: 'Инвестиционная студия в Orbi или Horizon',
    comment:
      'Студия или однокомнатная не дальше 500 м от моря, под посуточную сдачу. Интересуют ликвидные варианты с высоким арендным потенциалом. Оплата сразу, без ипотеки.',
    phone: '+995 599 00 00 04',
    daysAgo: 4,
  },
  {
    id: 'req-5',
    authorName: 'Алексей Д.',
    dealType: 'rent',
    kind: 'secondary',
    city: 'Тбилиси',
    budget: { amount: 1500, perMonth: true },
    title: 'Аренда 3-комнатной квартиры в Ваке или Сабуртало',
    comment:
      'Надолго, от года. От 90 м², паркинг, можно с котом. Семья с ребёнком: нужен тихий район, свежий ремонт, посудомоечная машина и своё парковочное место.',
    phone: '+995 599 00 00 05',
    daysAgo: 9,
  },
  {
    id: 'req-6',
    authorName: 'Гиорги Т.',
    dealType: 'buy',
    kind: 'land',
    city: 'Тбилиси',
    budget: { amount: 120000 },
    title: 'Куплю участок под частный дом в Цхнети',
    comment:
      'От 6 соток, с электричеством и водой, удобный подъезд круглый год. Вид на город будет плюсом.',
    phone: '+995 599 00 00 06',
    daysAgo: 18,
  },
  {
    id: 'req-7',
    authorName: 'Марина С.',
    dealType: 'buy',
    kind: 'office',
    city: 'Батуми',
    budget: { amount: 150000 },
    title: 'Ищу небольшой офис для агентства',
    comment:
      'От 50 м², отдельный вход или первый этаж бизнес-центра, рядом парковка. Рассмотрю готовый ремонт и помещение под отделку.',
    phone: '+995 599 00 00 07',
    daysAgo: 36,
  },
]

type Freshness = 'all' | 'week' | 'month'
type Sort = 'new' | 'old'

const FRESHNESS_DAYS: Record<Exclude<Freshness, 'all'>, number> = { week: 7, month: 30 }

const MONEY = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 })
const DAY_MS = 86_400_000

function formatBudget(budget: ClientRequestItem['budget'], t: Translate): string {
  const amount = `$${MONEY.format(budget.amount)}`
  return budget.perMonth ? t('requests.budget.perMonth', { amount }) : t('requests.budget.total', { amount })
}

function postedAt(daysAgo: number): Date {
  return new Date(Date.now() - daysAgo * DAY_MS)
}

function ruPlural(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return forms[0]
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1]
  return forms[2]
}

/**
 * Счётчик результатов согласуется по числу и роду только в русском —
 * английский и грузинский этого не требуют (в грузинском существительное
 * после числительного всегда в единственном числе).
 */
function countLabel(language: Language, count: number, t: Translate): string {
  if (language === 'ru') {
    const noun = ruPlural(count, ['запрос', 'запроса', 'запросов'])
    const verb = count % 10 === 1 && count % 100 !== 11 ? 'найден' : 'найдено'
    return `${count} ${noun} ${verb}`
  }
  if (language === 'ka') {
    return t('requests.count.ka', { count })
  }
  return t('requests.count.en', { count, noun: count === 1 ? t('requests.count.enSingular') : t('requests.count.enPlural') })
}

function showButtonLabel(language: Language, count: number, t: Translate): string {
  if (count === 0) return t('requests.filters.none')
  if (language === 'ru') {
    const noun = ruPlural(count, ['запрос', 'запроса', 'запросов'])
    return `${t('requests.filters.showPrefix')} ${count} ${noun}`
  }
  return t('requests.filters.show', { count })
}

/** «+995 599 00 00 01» → видимое начало и скрытый хвост. */
function splitPhone(phone: string): [string, string] {
  const parts = phone.split(' ')
  return [parts.slice(0, 2).join(' '), parts.slice(2).join(' ')]
}

export function RequestsPage() {
  const { t, language } = useI18n()
  const [deal, setDeal] = useState<'all' | DealType>('all')
  const [kinds, setKinds] = useState<Set<PropertyKind>>(() => new Set())
  const [city, setCity] = useState<'all' | City>('all')
  const [freshness, setFreshness] = useState<Freshness>('all')
  const [sort, setSort] = useState<Sort>('new')
  const [query, setQuery] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set())
  const [writeTo, setWriteTo] = useState<ClientRequestItem | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  useSeoMetadata({
    title: t('requests.seo.title'),
    description: t('requests.seo.description'),
  })

  const toggleKind = (kind: PropertyKind) => {
    setKinds((prev) => {
      const next = new Set(prev)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      return next
    })
  }

  const resetFilters = () => {
    setDeal('all')
    setKinds(new Set())
    setCity('all')
    setFreshness('all')
    setQuery('')
  }

  const q = query.trim().toLowerCase()
  const visible = REQUESTS.filter((r) => {
    if (deal !== 'all' && r.dealType !== deal) return false
    if (kinds.size > 0 && !kinds.has(r.kind)) return false
    if (city !== 'all' && r.city !== city) return false
    if (freshness !== 'all' && r.daysAgo > FRESHNESS_DAYS[freshness]) return false
    if (q) {
      const haystack = `${r.title} ${r.comment} ${r.authorName}`.toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  }).sort((a, b) => (sort === 'new' ? a.daysAgo - b.daysAgo : b.daysAgo - a.daysAgo))

  const activeFilters =
    (deal !== 'all' ? 1 : 0) + kinds.size + (city !== 'all' ? 1 : 0) + (freshness !== 'all' ? 1 : 0)
  const hasAnyFilter = activeFilters > 0 || q.length > 0
  const count = visible.length

  // Открытая на телефоне панель фильтров закрывается по Escape.
  useEffect(() => {
    if (!filtersOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFiltersOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [filtersOpen])

  return (
    <div className="bz-requests">
      <header className="bz-requests__head">
        <div className="bz-requests__intro">
          <h1>{t('requests.title')}</h1>
          <p>{t('requests.subtitle')}</p>
        </div>
        <button
          type="button"
          className="bz-rq-btn bz-rq-btn--call bz-requests__cta"
          onClick={() => setCreateOpen(true)}
          data-testid="add-request-btn"
        >
          <PlusIcon />
          {t('requests.cta')}
        </button>
      </header>

      <div className="bz-requests__layout">
        {filtersOpen ? (
          <div className="bz-rq-scrim" aria-hidden="true" onClick={() => setFiltersOpen(false)} />
        ) : null}

        <aside
          id="requests-filters"
          className={`bz-rq-filters${filtersOpen ? ' is-open' : ''}`}
          aria-label={t('requests.filters.aria')}
        >
          <div className="bz-rq-filters__top">
            <h2 className="bz-rq-filters__title">{t('requests.filters.title')}</h2>
            {hasAnyFilter ? (
              <button type="button" className="bz-rq-filters__reset" onClick={resetFilters}>
                {t('requests.filters.reset')}
              </button>
            ) : null}
            <button
              type="button"
              className="bz-rq-filters__close"
              onClick={() => setFiltersOpen(false)}
              aria-label={t('requests.filters.close')}
            >
              <CloseIcon />
            </button>
          </div>

          <label className="bz-rq-search">
            <SearchIcon />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('requests.search.placeholder')}
              aria-label={t('requests.search.aria')}
            />
          </label>

          <fieldset className="bz-rq-group">
            <legend className="bz-rq-group__title">{t('requests.category.legend')}</legend>
            <div className="bz-rq-radios">
              {(
                [
                  ['all', 'requests.category.all'],
                  ['buy', 'requests.category.buy'],
                  ['rent', 'requests.category.rent'],
                ] as const
              ).map(([value, labelKey]) => (
                <label key={value} className="bz-rq-radio">
                  <input
                    type="radio"
                    name="rq-deal"
                    value={value}
                    checked={deal === value}
                    onChange={() => setDeal(value)}
                  />
                  <span className="bz-rq-radio__mark" aria-hidden="true" />
                  <span className="bz-rq-radio__label">{t(labelKey)}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="bz-rq-group">
            <legend className="bz-rq-group__title">{t('requests.propertyType.legend')}</legend>
            <KindSwitches titleKey="requests.propertyType.residential" options={RESIDENTIAL} selected={kinds} onToggle={toggleKind} t={t} />
            <KindSwitches titleKey="requests.propertyType.commercial" options={COMMERCIAL} selected={kinds} onToggle={toggleKind} t={t} />
          </fieldset>

          <div className="bz-rq-group">
            <label className="bz-rq-group__title" htmlFor="rq-city">
              {t('requests.city.label')}
            </label>
            <div className="bz-rq-select">
              <select id="rq-city" value={city} onChange={(event) => setCity(event.target.value as 'all' | City)}>
                <option value="all">{t('requests.city.all')}</option>
                <option value="Батуми">{t('requests.city.batumi')}</option>
                <option value="Тбилиси">{t('requests.city.tbilisi')}</option>
              </select>
            </div>
          </div>

          <div className="bz-rq-group">
            <label className="bz-rq-group__title" htmlFor="rq-freshness">
              {t('requests.freshness.label')}
            </label>
            <div className="bz-rq-select">
              <select
                id="rq-freshness"
                value={freshness}
                onChange={(event) => setFreshness(event.target.value as Freshness)}
              >
                <option value="all">{t('requests.freshness.all')}</option>
                <option value="week">{t('requests.freshness.week')}</option>
                <option value="month">{t('requests.freshness.month')}</option>
              </select>
            </div>
          </div>

          <button type="button" className="bz-rq-btn bz-rq-btn--call bz-rq-filters__apply" onClick={() => setFiltersOpen(false)}>
            {showButtonLabel(language, count, t)}
          </button>
        </aside>

        <section className="bz-rq-results" aria-labelledby="rq-count">
          <div className="bz-rq-bar">
            <p id="rq-count" className="bz-rq-bar__count" aria-live="polite">
              {countLabel(language, count, t)}
            </p>
            <button
              type="button"
              className="bz-rq-bar__filters"
              onClick={() => setFiltersOpen(true)}
              aria-controls="requests-filters"
              aria-expanded={filtersOpen}
            >
              <FilterIcon />
              {t('requests.filters.title')}
              {activeFilters > 0 ? <span className="bz-rq-bar__badge">{activeFilters}</span> : null}
            </button>
            <div className="bz-rq-select bz-rq-select--ink">
              <select value={sort} onChange={(event) => setSort(event.target.value as Sort)} aria-label={t('requests.sort.aria')}>
                <option value="new">{t('requests.sort.new')}</option>
                <option value="old">{t('requests.sort.old')}</option>
              </select>
            </div>
          </div>

          {count > 0 ? (
            <ol className="bz-rq-list">
              {visible.map((request) => (
                <li key={request.id}>
                  <RequestCard
                    request={request}
                    phoneShown={revealed.has(request.id)}
                    onRevealPhone={() => setRevealed((prev) => new Set(prev).add(request.id))}
                    onWrite={() => setWriteTo(request)}
                    t={t}
                  />
                </li>
              ))}
            </ol>
          ) : (
            <div className="bz-rq-empty">
              <p className="bz-rq-empty__title">{t('requests.empty.title')}</p>
              <p>{t('requests.empty.text')}</p>
              <button type="button" className="bz-rq-btn bz-rq-btn--outline" onClick={resetFilters}>
                {t('requests.empty.reset')}
              </button>
            </div>
          )}
        </section>
      </div>

      {writeTo ? <WriteDialog request={writeTo} onClose={() => setWriteTo(null)} t={t} /> : null}
      {createOpen ? <CreateRequestDialog onClose={() => setCreateOpen(false)} t={t} /> : null}
    </div>
  )
}

function KindSwitches({
  titleKey,
  options,
  selected,
  onToggle,
  t,
}: {
  titleKey: string
  options: Array<[PropertyKind, string]>
  selected: Set<PropertyKind>
  onToggle: (kind: PropertyKind) => void
  t: Translate
}) {
  return (
    <div className="bz-rq-switches">
      <p className="bz-rq-switches__title">{t(titleKey)}</p>
      {options.map(([kind, labelKey]) => (
        <label key={kind} className="bz-rq-switch">
          <input type="checkbox" role="switch" checked={selected.has(kind)} onChange={() => onToggle(kind)} />
          <span className="bz-rq-switch__track" aria-hidden="true" />
          <span className="bz-rq-switch__label">{t(labelKey)}</span>
        </label>
      ))}
    </div>
  )
}

/**
 * Карточка запроса по `card Запрос` (`2287:34226`): заголовок 24px и дата
 * справа, текст запроса, строка контактов с прикрытым номером, линия, внизу
 * пары «подпись — значение» и кнопки. Бюджет в макете не показан, но без
 * него запрос не оценить — он третьей парой в том же стиле.
 */
function RequestCard({
  request,
  phoneShown,
  onRevealPhone,
  onWrite,
  t,
}: {
  request: ClientRequestItem
  phoneShown: boolean
  onRevealPhone: () => void
  onWrite: () => void
  t: Translate
}) {
  const titleId = `${request.id}-title`
  const date = postedAt(request.daysAgo)
  const [phoneHead, phoneTail] = splitPhone(request.phone)

  return (
    <article className="bz-rq-card" aria-labelledby={titleId}>
      <div className="bz-rq-card__head">
        <h3 id={titleId} className="bz-rq-card__title">
          {request.title}
        </h3>
        <p className="bz-rq-card__date">
          {t('requests.card.datePrefix')} <time dateTime={date.toISOString().slice(0, 10)}>{date.toLocaleDateString('ru-RU')}</time>
        </p>
      </div>

      <p className="bz-rq-card__text">{request.comment}</p>

      <div className="bz-rq-card__contact">
        <PhoneIcon />
        <span className="bz-rq-card__contact-label">{t('requests.card.contacts')}</span>
        <span className="bz-rq-card__author">{request.authorName}</span>
        <span className="bz-rq-card__phone">
          {phoneHead}{' '}
          {phoneShown ? (
            phoneTail
          ) : (
            <>
              <span className="bz-rq-card__phone-mask" aria-hidden="true">
                {phoneTail}
              </span>
              <span className="visually-hidden">{t('requests.card.hiddenSr')}</span>
            </>
          )}
        </span>
        {phoneShown ? null : (
          <button
            type="button"
            className="bz-rq-card__reveal"
            onClick={onRevealPhone}
            aria-label={t('requests.card.revealAria', { name: request.authorName })}
          >
            <EyeIcon />
            {t('requests.card.reveal')}
          </button>
        )}
      </div>

      <div className="bz-rq-card__foot">
        <dl className="bz-rq-card__facts">
          <div>
            <dt>{t('requests.card.categoryLabel')}</dt>
            <dd>{t(DEAL_LABEL_KEY[request.dealType])}</dd>
          </div>
          <div>
            <dt>{t('requests.card.propertyLabel')}</dt>
            <dd>{t(KIND_SHORT_KEY[request.kind])}</dd>
          </div>
          <div>
            <dt>{t('requests.card.budgetLabel')}</dt>
            <dd>{formatBudget(request.budget, t)}</dd>
          </div>
        </dl>
        <div className="bz-rq-card__actions">
          <a
            className="bz-rq-btn bz-rq-btn--call"
            href={`tel:${request.phone.replace(/\s/g, '')}`}
            onClick={onRevealPhone}
          >
            {t('requests.card.call')}
          </a>
          <button
            type="button"
            className="bz-rq-btn bz-rq-btn--outline"
            onClick={onWrite}
            data-testid={`offer-btn-${request.id}`}
          >
            {t('requests.card.write')}
          </button>
        </div>
      </div>
    </article>
  )
}

/**
 * Модальное окно: фокус внутрь при открытии и назад при закрытии, Escape
 * и клик по затемнению закрывают, прокрутка страницы под окном стоит.
 */
function Dialog({
  title,
  subtitle,
  onClose,
  t,
  children,
}: {
  title: string
  subtitle?: ReactNode
  onClose: () => void
  t: Translate
  children: ReactNode
}) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  // Обработчик закрытия в ref: иначе эффект перезапускался бы при каждой
  // перерисовке родителя и снова уводил фокус на первое поле.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const first = panelRef.current?.querySelector<HTMLElement>('input, textarea, select, button:not(.bz-rq-dialog__close)')
    first?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
      opener?.focus()
    }
  }, [])

  return (
    <div
      className="bz-rq-dialog"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div ref={panelRef} className="bz-rq-dialog__panel" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <button type="button" className="bz-rq-dialog__close" onClick={onClose} aria-label={t('requests.dialog.close')}>
          <CloseIcon />
        </button>
        <h2 id={titleId} className="bz-rq-dialog__title">
          {title}
        </h2>
        {subtitle ? <p className="bz-rq-dialog__subtitle">{subtitle}</p> : null}
        {children}
      </div>
    </div>
  )
}

function WriteDialog({ request, onClose, t }: { request: ClientRequestItem; onClose: () => void; t: Translate }) {
  const [sent, setSent] = useState(false)

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    setSent(true)
  }

  return (
    <Dialog
      title={t('requests.write.title')}
      subtitle={t('requests.write.subtitle', {
        author: request.authorName,
        title: request.title.charAt(0).toLowerCase() + request.title.slice(1),
      })}
      onClose={onClose}
      t={t}
    >
      {sent ? (
        <div className="bz-rq-dialog__done" role="status">
          <p className="bz-rq-dialog__done-title">{t('requests.write.sentTitle')}</p>
          <button type="button" className="bz-rq-btn bz-rq-btn--outline" onClick={onClose}>
            {t('requests.write.cancel')}
          </button>
        </div>
      ) : (
        <form className="bz-rq-form" onSubmit={handleSubmit}>
          <label className="bz-rq-field">
            <span className="bz-rq-field__label">{t('requests.write.objectLabel')}</span>
            <input type="url" placeholder={t('requests.write.objectPlaceholder')} />
            <span className="bz-rq-field__hint">{t('requests.write.objectHint')}</span>
          </label>
          <label className="bz-rq-field">
            <span className="bz-rq-field__label">{t('requests.write.messageLabel')}</span>
            <textarea rows={4} required placeholder={t('requests.write.messagePlaceholder')} />
          </label>
          <div className="bz-rq-form__actions">
            <button type="button" className="bz-rq-btn bz-rq-btn--outline" onClick={onClose}>
              {t('requests.write.cancel')}
            </button>
            <button type="submit" className="bz-rq-btn bz-rq-btn--call">
              {t('requests.write.send')}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  )
}

function CreateRequestDialog({ onClose, t }: { onClose: () => void; t: Translate }) {
  const [sent, setSent] = useState(false)
  const [deal, setDeal] = useState<DealType>('buy')

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    setSent(true)
  }

  return (
    <Dialog title={t('requests.create.title')} subtitle={t('requests.create.subtitle')} onClose={onClose} t={t}>
      {sent ? (
        <div className="bz-rq-dialog__done" role="status">
          <p className="bz-rq-dialog__done-title">{t('requests.create.sentTitle')}</p>
          <p>{t('requests.create.sentText')}</p>
          <button type="button" className="bz-rq-btn bz-rq-btn--outline" onClick={onClose}>
            {t('requests.create.close')}
          </button>
        </div>
      ) : (
        <form className="bz-rq-form" onSubmit={handleSubmit}>
          <fieldset className="bz-rq-field">
            <legend className="bz-rq-field__label">{t('requests.create.needLegend')}</legend>
            <div className="bz-rq-radios">
              {(Object.keys(DEAL_LABEL_KEY) as DealType[]).map((value) => (
                <label key={value} className="bz-rq-radio">
                  <input type="radio" name="rq-create-deal" checked={deal === value} onChange={() => setDeal(value)} />
                  <span className="bz-rq-radio__mark" aria-hidden="true" />
                  <span className="bz-rq-radio__label">{value === 'buy' ? t('requests.create.buy') : t('requests.create.rent')}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="bz-rq-form__row">
            <label className="bz-rq-field">
              <span className="bz-rq-field__label">{t('requests.create.propertyType')}</span>
              <span className="bz-rq-select">
                <select defaultValue="newbuild">
                  {[...RESIDENTIAL, ...COMMERCIAL].map(([kind, labelKey]) => (
                    <option key={kind} value={kind}>
                      {t(labelKey)}
                    </option>
                  ))}
                </select>
              </span>
            </label>
            <label className="bz-rq-field">
              <span className="bz-rq-field__label">{t('requests.create.city')}</span>
              <span className="bz-rq-select">
                <select defaultValue="Батуми">
                  <option>{t('requests.city.batumi')}</option>
                  <option>{t('requests.city.tbilisi')}</option>
                </select>
              </span>
            </label>
          </div>
          <label className="bz-rq-field">
            <span className="bz-rq-field__label">{deal === 'buy' ? t('requests.create.budgetBuy') : t('requests.create.budgetRent')}</span>
            <input type="number" min={0} step={100} inputMode="numeric" placeholder={deal === 'buy' ? t('requests.create.budgetPlaceholderBuy') : t('requests.create.budgetPlaceholderRent')} />
          </label>
          <label className="bz-rq-field">
            <span className="bz-rq-field__label">{t('requests.create.whatLabel')}</span>
            <textarea rows={4} required placeholder={t('requests.create.whatPlaceholder')} />
          </label>
          <label className="bz-rq-field">
            <span className="bz-rq-field__label">{t('requests.create.phoneLabel')}</span>
            <input type="tel" required autoComplete="tel" placeholder={t('requests.create.phonePlaceholder')} />
          </label>
          <div className="bz-rq-form__actions">
            <button type="button" className="bz-rq-btn bz-rq-btn--outline" onClick={onClose}>
              {t('requests.write.cancel')}
            </button>
            <button type="submit" className="bz-rq-btn bz-rq-btn--call">
              {t('requests.create.submit')}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  )
}

/* ── значки ─────────────────────────────────────────────────────────── */

function SearchIcon() {
  return (
    <svg className="bz-rq-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg className="bz-rq-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg className="bz-rq-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function FilterIcon() {
  return (
    <svg className="bz-rq-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  )
}

/* Трубка из `fi_7269995` (`2287:34241`): залитая, фирменный зелёный. */
function PhoneIcon() {
  return (
    <svg className="bz-rq-icon bz-rq-card__contact-icon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6.6 10.8a15.2 15.2 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z"
      />
    </svg>
  )
}

/* Глаз из `fi_535193` (`2287:34248`). */
function EyeIcon() {
  return (
    <svg className="bz-rq-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}
