import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useSeoMetadata } from '../hooks/useSeoMetadata'

/*
 * Доска запросов клиентов — фрейм `search result (2 page)` (`2287:34150`):
 * слева панель «Фильтр» (`2287:34177`), в центре строка со счётчиком и
 * сортировкой (`2287:34221`) и карточки «card Запрос» (`2287:34226`).
 *
 * Бэкенда у доски пока нет (очередь владельца, N-13), запросы ниже —
 * образцы для витрины. Даты считаются от сегодняшнего дня, иначе фильтр
 * «Актуальность» со временем опустошал бы список.
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

/* Подписи переключателей — ровно те, что в макете (`2287:34200`…`2287:34214`). */
const RESIDENTIAL: Array<[PropertyKind, string]> = [
  ['newbuild', 'Квартира в новостройке'],
  ['secondary', 'Квартира во вторичке'],
  ['house', 'Дом'],
  ['land', 'Земельный участок'],
  ['other', 'Другое'],
]

const COMMERCIAL: Array<[PropertyKind, string]> = [
  ['office', 'Офис'],
  ['warehouse', 'Склад'],
  ['retail', 'Торговая площадь'],
  ['free', 'Помещение свободного назначения'],
]

/* Короткие названия для низа карточки: там значение набрано 22px. */
const KIND_SHORT: Record<PropertyKind, string> = {
  newbuild: 'Новостройка',
  secondary: 'Вторичка',
  house: 'Дом',
  land: 'Участок',
  other: 'Другое',
  office: 'Офис',
  warehouse: 'Склад',
  retail: 'Торговая площадь',
  free: 'Свободное назначение',
}

const DEAL_LABEL: Record<DealType, string> = { buy: 'Покупка', rent: 'Аренда' }

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

function formatBudget(budget: ClientRequestItem['budget']): string {
  return `до $${MONEY.format(budget.amount)}${budget.perMonth ? ' / мес' : ''}`
}

function postedAt(daysAgo: number): Date {
  return new Date(Date.now() - daysAgo * DAY_MS)
}

function plural(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return forms[0]
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1]
  return forms[2]
}

function requestsWord(n: number): string {
  return plural(n, ['запрос', 'запроса', 'запросов'])
}

/** «+995 599 00 00 01» → видимое начало и скрытый хвост. */
function splitPhone(phone: string): [string, string] {
  const parts = phone.split(' ')
  return [parts.slice(0, 2).join(' '), parts.slice(2).join(' ')]
}

export function RequestsPage() {
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
    title: 'Запросы покупателей и арендаторов | BAZA',
    description:
      'Доска актуальных заявок на покупку и аренду недвижимости в Грузии. Предложите свой объект напрямую клиенту.',
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
          <h1>Запросы клиентов</h1>
          <p>Что ищут покупатели и арендаторы. Подберите объект и напишите клиенту напрямую.</p>
        </div>
        <button
          type="button"
          className="bz-rq-btn bz-rq-btn--call bz-requests__cta"
          onClick={() => setCreateOpen(true)}
          data-testid="add-request-btn"
        >
          <PlusIcon />
          Оставить запрос
        </button>
      </header>

      <div className="bz-requests__layout">
        {filtersOpen ? (
          <div className="bz-rq-scrim" aria-hidden="true" onClick={() => setFiltersOpen(false)} />
        ) : null}

        <aside
          id="requests-filters"
          className={`bz-rq-filters${filtersOpen ? ' is-open' : ''}`}
          aria-label="Фильтры запросов"
        >
          <div className="bz-rq-filters__top">
            <h2 className="bz-rq-filters__title">Фильтр</h2>
            {hasAnyFilter ? (
              <button type="button" className="bz-rq-filters__reset" onClick={resetFilters}>
                Сбросить
              </button>
            ) : null}
            <button
              type="button"
              className="bz-rq-filters__close"
              onClick={() => setFiltersOpen(false)}
              aria-label="Закрыть фильтр"
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
              placeholder="Район, комплекс, пожелание"
              aria-label="Поиск по запросам"
            />
          </label>

          <fieldset className="bz-rq-group">
            <legend className="bz-rq-group__title">Категория</legend>
            <div className="bz-rq-radios">
              {(
                [
                  ['all', 'Все'],
                  ['buy', 'Покупка'],
                  ['rent', 'Аренда'],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="bz-rq-radio">
                  <input
                    type="radio"
                    name="rq-deal"
                    value={value}
                    checked={deal === value}
                    onChange={() => setDeal(value)}
                  />
                  <span className="bz-rq-radio__mark" aria-hidden="true" />
                  <span className="bz-rq-radio__label">{label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="bz-rq-group">
            <legend className="bz-rq-group__title">Тип недвижимости</legend>
            <KindSwitches title="Жилая" options={RESIDENTIAL} selected={kinds} onToggle={toggleKind} />
            <KindSwitches title="Коммерческая" options={COMMERCIAL} selected={kinds} onToggle={toggleKind} />
          </fieldset>

          <div className="bz-rq-group">
            <label className="bz-rq-group__title" htmlFor="rq-city">
              Город
            </label>
            <div className="bz-rq-select">
              <select id="rq-city" value={city} onChange={(event) => setCity(event.target.value as 'all' | City)}>
                <option value="all">Все города</option>
                <option value="Батуми">Батуми</option>
                <option value="Тбилиси">Тбилиси</option>
              </select>
            </div>
          </div>

          <div className="bz-rq-group">
            <label className="bz-rq-group__title" htmlFor="rq-freshness">
              Актуальность
            </label>
            <div className="bz-rq-select">
              <select
                id="rq-freshness"
                value={freshness}
                onChange={(event) => setFreshness(event.target.value as Freshness)}
              >
                <option value="all">За всё время</option>
                <option value="week">За последнюю неделю</option>
                <option value="month">За последний месяц</option>
              </select>
            </div>
          </div>

          <button type="button" className="bz-rq-btn bz-rq-btn--call bz-rq-filters__apply" onClick={() => setFiltersOpen(false)}>
            {count > 0 ? `Показать ${count} ${requestsWord(count)}` : 'Запросов нет'}
          </button>
        </aside>

        <section className="bz-rq-results" aria-labelledby="rq-count">
          <div className="bz-rq-bar">
            <p id="rq-count" className="bz-rq-bar__count" aria-live="polite">
              <strong>{count}</strong> {requestsWord(count)} {count % 10 === 1 && count % 100 !== 11 ? 'найден' : 'найдено'}
            </p>
            <button
              type="button"
              className="bz-rq-bar__filters"
              onClick={() => setFiltersOpen(true)}
              aria-controls="requests-filters"
              aria-expanded={filtersOpen}
            >
              <FilterIcon />
              Фильтр
              {activeFilters > 0 ? <span className="bz-rq-bar__badge">{activeFilters}</span> : null}
            </button>
            <div className="bz-rq-select bz-rq-select--ink">
              <select value={sort} onChange={(event) => setSort(event.target.value as Sort)} aria-label="Порядок запросов">
                <option value="new">Сначала новые</option>
                <option value="old">Сначала старые</option>
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
                  />
                </li>
              ))}
            </ol>
          ) : (
            <div className="bz-rq-empty">
              <p className="bz-rq-empty__title">По этим условиям запросов нет</p>
              <p>Ослабьте фильтры или оставьте свой запрос: риелторы увидят его и предложат варианты.</p>
              <button type="button" className="bz-rq-btn bz-rq-btn--outline" onClick={resetFilters}>
                Сбросить фильтры
              </button>
            </div>
          )}
        </section>
      </div>

      {writeTo ? <WriteDialog request={writeTo} onClose={() => setWriteTo(null)} /> : null}
      {createOpen ? <CreateRequestDialog onClose={() => setCreateOpen(false)} /> : null}
    </div>
  )
}

function KindSwitches({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string
  options: Array<[PropertyKind, string]>
  selected: Set<PropertyKind>
  onToggle: (kind: PropertyKind) => void
}) {
  return (
    <div className="bz-rq-switches">
      <p className="bz-rq-switches__title">{title}</p>
      {options.map(([kind, label]) => (
        <label key={kind} className="bz-rq-switch">
          <input type="checkbox" role="switch" checked={selected.has(kind)} onChange={() => onToggle(kind)} />
          <span className="bz-rq-switch__track" aria-hidden="true" />
          <span className="bz-rq-switch__label">{label}</span>
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
}: {
  request: ClientRequestItem
  phoneShown: boolean
  onRevealPhone: () => void
  onWrite: () => void
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
          Дата размещения: <time dateTime={date.toISOString().slice(0, 10)}>{date.toLocaleDateString('ru-RU')}</time>
        </p>
      </div>

      <p className="bz-rq-card__text">{request.comment}</p>

      <div className="bz-rq-card__contact">
        <PhoneIcon />
        <span className="bz-rq-card__contact-label">Контакты:</span>
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
              <span className="visually-hidden">номер скрыт</span>
            </>
          )}
        </span>
        {phoneShown ? null : (
          <button
            type="button"
            className="bz-rq-card__reveal"
            onClick={onRevealPhone}
            aria-label={`Показать телефон: ${request.authorName}`}
          >
            <EyeIcon />
            Показать
          </button>
        )}
      </div>

      <div className="bz-rq-card__foot">
        <dl className="bz-rq-card__facts">
          <div>
            <dt>Категория</dt>
            <dd>{DEAL_LABEL[request.dealType]}</dd>
          </div>
          <div>
            <dt>Тип недвижимости</dt>
            <dd>{KIND_SHORT[request.kind]}</dd>
          </div>
          <div>
            <dt>Бюджет</dt>
            <dd>{formatBudget(request.budget)}</dd>
          </div>
        </dl>
        <div className="bz-rq-card__actions">
          <a
            className="bz-rq-btn bz-rq-btn--call"
            href={`tel:${request.phone.replace(/\s/g, '')}`}
            onClick={onRevealPhone}
          >
            Позвонить
          </a>
          <button
            type="button"
            className="bz-rq-btn bz-rq-btn--outline"
            onClick={onWrite}
            data-testid={`offer-btn-${request.id}`}
          >
            Написать
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
function Dialog({ title, subtitle, onClose, children }: { title: string; subtitle?: ReactNode; onClose: () => void; children: ReactNode }) {
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
        <button type="button" className="bz-rq-dialog__close" onClick={onClose} aria-label="Закрыть окно">
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

function WriteDialog({ request, onClose }: { request: ClientRequestItem; onClose: () => void }) {
  const [sent, setSent] = useState(false)

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    setSent(true)
  }

  return (
    <Dialog
      title="Написать клиенту"
      subtitle={
        <>
          {request.authorName} ищет: {request.title.charAt(0).toLowerCase() + request.title.slice(1)}
        </>
      }
      onClose={onClose}
    >
      {sent ? (
        <div className="bz-rq-dialog__done" role="status">
          <p className="bz-rq-dialog__done-title">Сообщение отправлено</p>
          <button type="button" className="bz-rq-btn bz-rq-btn--outline" onClick={onClose}>
            Закрыть
          </button>
        </div>
      ) : (
        <form className="bz-rq-form" onSubmit={handleSubmit}>
          <label className="bz-rq-field">
            <span className="bz-rq-field__label">Объект</span>
            <input type="url" placeholder="Ссылка на объект в BAZA" />
            <span className="bz-rq-field__hint">Необязательно. Клиент увидит карточку объекта.</span>
          </label>
          <label className="bz-rq-field">
            <span className="bz-rq-field__label">Сообщение</span>
            <textarea rows={4} required placeholder="Цена, условия, когда можно посмотреть" />
          </label>
          <div className="bz-rq-form__actions">
            <button type="button" className="bz-rq-btn bz-rq-btn--outline" onClick={onClose}>
              Отмена
            </button>
            <button type="submit" className="bz-rq-btn bz-rq-btn--call">
              Отправить
            </button>
          </div>
        </form>
      )}
    </Dialog>
  )
}

function CreateRequestDialog({ onClose }: { onClose: () => void }) {
  const [sent, setSent] = useState(false)
  const [deal, setDeal] = useState<DealType>('buy')

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    setSent(true)
  }

  return (
    <Dialog title="Оставить запрос" subtitle="Опишите, что ищете. Риелторы предложат подходящие объекты." onClose={onClose}>
      {sent ? (
        <div className="bz-rq-dialog__done" role="status">
          <p className="bz-rq-dialog__done-title">Запрос принят</p>
          <p>Он появится на доске после проверки модератором.</p>
          <button type="button" className="bz-rq-btn bz-rq-btn--outline" onClick={onClose}>
            Закрыть
          </button>
        </div>
      ) : (
        <form className="bz-rq-form" onSubmit={handleSubmit}>
          <fieldset className="bz-rq-field">
            <legend className="bz-rq-field__label">Что нужно</legend>
            <div className="bz-rq-radios">
              {(Object.keys(DEAL_LABEL) as DealType[]).map((value) => (
                <label key={value} className="bz-rq-radio">
                  <input type="radio" name="rq-create-deal" checked={deal === value} onChange={() => setDeal(value)} />
                  <span className="bz-rq-radio__mark" aria-hidden="true" />
                  <span className="bz-rq-radio__label">{value === 'buy' ? 'Купить' : 'Снять'}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="bz-rq-form__row">
            <label className="bz-rq-field">
              <span className="bz-rq-field__label">Тип недвижимости</span>
              <span className="bz-rq-select">
                <select defaultValue="newbuild">
                  {[...RESIDENTIAL, ...COMMERCIAL].map(([kind, label]) => (
                    <option key={kind} value={kind}>
                      {label}
                    </option>
                  ))}
                </select>
              </span>
            </label>
            <label className="bz-rq-field">
              <span className="bz-rq-field__label">Город</span>
              <span className="bz-rq-select">
                <select defaultValue="Батуми">
                  <option>Батуми</option>
                  <option>Тбилиси</option>
                </select>
              </span>
            </label>
          </div>
          <label className="bz-rq-field">
            <span className="bz-rq-field__label">{deal === 'buy' ? 'Бюджет, $' : 'Бюджет в месяц, $'}</span>
            <input type="number" min={0} step={100} inputMode="numeric" placeholder={deal === 'buy' ? '90 000' : '800'} />
          </label>
          <label className="bz-rq-field">
            <span className="bz-rq-field__label">Что ищете</span>
            <textarea rows={4} required placeholder="Район, площадь, этаж, ремонт, сроки" />
          </label>
          <label className="bz-rq-field">
            <span className="bz-rq-field__label">Телефон</span>
            <input type="tel" required autoComplete="tel" placeholder="+995" />
          </label>
          <div className="bz-rq-form__actions">
            <button type="button" className="bz-rq-btn bz-rq-btn--outline" onClick={onClose}>
              Отмена
            </button>
            <button type="submit" className="bz-rq-btn bz-rq-btn--call">
              Опубликовать запрос
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
