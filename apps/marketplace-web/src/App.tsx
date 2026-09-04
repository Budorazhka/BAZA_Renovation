import { FormEvent, useEffect, useState, useTransition } from 'react'
import { Link, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  completionLabel,
  developmentAddress,
  developmentTitle,
  listingTitle,
  listingAddress,
  listingPrice,
  listingDealTypeLabel,
  listingPropertyTypeLabel,
} from './lib/format'
import { useCatalogue } from './hooks/useCatalogue'
import { useDevelopmentDetail } from './hooks/useDevelopmentDetail'
import { useListingsCatalogue } from './hooks/useListingsCatalogue'
import { useListingDetail } from './hooks/useListingDetail'
import { useSeoMetadata, buildListingJsonLd, buildDevelopmentJsonLd } from './hooks/useSeoMetadata'
import { ListingContactForm } from './components/ListingContactForm'
import { ListingMediaGallery } from './components/ListingMediaGallery'
import { MarketplaceMap } from './components/MarketplaceMap'
import { PublishingWizard } from './features/publishing'
import { Header } from './components/Header'
import { Footer } from './components/Footer'
import { DevelopmentCard, BuildingPlaceholder } from './components/DevelopmentCard'
import { ListingCard } from './components/ListingCard'
import { CardSkeleton } from './components/CardSkeleton'
import { FacetFilters } from './components/FacetFilters'
import { RevealContactCTA } from './components/RevealContactCTA'
import { UnitQuickViewModal, type UnitInfo } from './components/UnitQuickViewModal'
import { RealtorsPage } from './pages/RealtorsPage'
import { RealtorProfilePage } from './pages/RealtorProfilePage'
import { MyPropertiesPage } from './pages/MyPropertiesPage'
import { FavoritesPage } from './pages/FavoritesPage'
import { SelectionsPage } from './pages/SelectionsPage'
import { SelectionDetailPage } from './pages/SelectionDetailPage'
import { RequestsPage } from './pages/RequestsPage'
import { CrmKanbanPage } from './pages/CrmKanbanPage'
import { CrmTasksPage } from './pages/CrmTasksPage'
import { CrmCalendarPage } from './pages/CrmCalendarPage'
import './styles/header-footer.css'
import './styles/cards.css'
import './styles/listing-card.css'
import './styles/filters.css'
import './styles/development-detail.css'
import './styles/listing-detail.css'
import './styles/realtors.css'
import './styles/my-properties.css'
import './styles/favorites-selections.css'
import './styles/requests.css'
import './styles/crm.css'
import './styles/home.css'
import { RouteErrorBoundary } from './components/RouteErrorBoundary'
import type {
  BoundingBox,
  PublicDevelopmentCard,
  PublicListingCard,
  ListingDealType,
  ListingPropertyType,
  PublicListingSort,
} from './types/marketplace'

function Shell({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const isCatalogueRoute = location.pathname === '/'
  const mapQuery = new URLSearchParams(location.search)
  mapQuery.set('view', 'map')
  mapQuery.delete('cursor')
  const listQuery = new URLSearchParams(location.search)
  listQuery.delete('view')
  listQuery.delete('bbox')
  listQuery.delete('cursor')
  const isMapView = location.search.includes('view=map')
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Перейти к основному содержанию
      </a>
      <Header />
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
      {isCatalogueRoute ? (
        <div className="floating-controls" aria-label="Инструменты каталога">
          <a href="#catalogue-filters" className="floating-control floating-control--filters" aria-label="Открыть фильтры">☷<span>⌁</span></a>
          <Link
            to={`/?${isMapView ? listQuery.toString() : mapQuery.toString()}`}
            className="floating-control floating-control--map"
            aria-label={isMapView ? 'Показать списком' : 'Показать на карте'}
          >
            {isMapView ? '▤' : '♧'}
          </Link>
        </div>
      ) : null}
      <Footer />
    </div>
  )
}

type CatalogueTab = 'developments' | 'listings'
const LISTING_SORTS = ['newest', 'price_asc', 'price_desc', 'area_asc', 'area_desc'] as const

function parseBoundingBox(value: string | null): BoundingBox | undefined {
  if (!value) return undefined
  const numbers = value.split(',').map(Number)
  if (numbers.length !== 4 || numbers.some((number) => !Number.isFinite(number))) return undefined
  const [minLng, minLat, maxLng, maxLat] = numbers
  if (minLng < -180 || maxLng > 180 || minLat < -90 || maxLat > 90 || minLng >= maxLng || minLat >= maxLat) {
    return undefined
  }
  return { minLng, minLat, maxLng, maxLat }
}

function serializeBoundingBox(bbox: BoundingBox): string {
  return [bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat].map((value) => value.toFixed(5)).join(',')
}

function CataloguePage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [, startTransition] = useTransition()

  // Read URL parameters
  const tabParam = (searchParams.get('tab') as CatalogueTab) || 'developments'
  const cityParam = searchParams.get('city') || ''
  const dealTypeParam = (searchParams.get('dealType') as ListingDealType) || undefined
  const propertyTypeParam = (searchParams.get('propertyType') as ListingPropertyType) || undefined
  const commercialSubtypeParam = searchParams.get('commercialSubtype') || undefined
  const rawSortParam = searchParams.get('sort')
  const sortParam: PublicListingSort = LISTING_SORTS.includes(rawSortParam as PublicListingSort)
    ? (rawSortParam as PublicListingSort)
    : 'newest'
  const isMapView = searchParams.get('view') === 'map'
  const bboxParam = parseBoundingBox(searchParams.get('bbox'))

  const [cityInput, setCityInput] = useState(cityParam)

  // Keep input synchronized if URL changes (e.g. back/forward button)
  useEffect(() => {
    setCityInput(cityParam)
  }, [cityParam])

  // Queries
  const developmentsQuery = useCatalogue({
    city: cityParam,
    bbox: isMapView ? bboxParam : undefined,
  })

  const listingsQuery = useListingsCatalogue({
    city: cityParam,
    dealType: dealTypeParam,
    propertyType: propertyTypeParam,
    commercialSubtype: commercialSubtypeParam,
    bbox: isMapView ? bboxParam : undefined,
    sort: sortParam,
  })

  const isDev = tabParam === 'developments'
  const state = isDev ? developmentsQuery.state : listingsQuery.state
  const loadMore = isDev ? developmentsQuery.loadMore : listingsQuery.loadMore
  const retryLoadMore = isDev ? developmentsQuery.retryLoadMore : listingsQuery.retryLoadMore

  // Update URL helper (resets cursor)
  function updateFilters(updates: Record<string, string | undefined>) {
    startTransition(() => {
      const nextParams = new URLSearchParams(searchParams)
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === '') {
          nextParams.delete(key)
        } else {
          nextParams.set(key, value)
        }
      }
      nextParams.delete('cursor')
      setSearchParams(nextParams, { replace: false })
    })
  }

  function submitCity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    updateFilters({ city: cityInput.trim() || undefined })
  }

  function clearAllFilters() {
    setCityInput('')
    updateFilters({
      city: undefined,
      dealType: undefined,
      propertyType: undefined,
      commercialSubtype: undefined,
      bbox: undefined,
    })
  }

  function handleMapBoundsChange(nextBbox: BoundingBox) {
    const serialized = serializeBoundingBox(nextBbox)
    if (serialized === searchParams.get('bbox')) return
    updateFilters({ bbox: serialized, view: 'map' })
  }

  function viewUrl(view: 'list' | 'map') {
    const params = new URLSearchParams(searchParams)
    if (view === 'map') params.set('view', 'map')
    else {
      params.delete('view')
      params.delete('bbox')
    }
    params.delete('cursor')
    return `/?${params.toString()}`
  }

  return (
    <Shell>
      {isDev ? (
        <div className="figma-home">
          {/* Section 1: Hero Block (Figma 1035:16926 / 3851:56175) */}
          <section className="home-hero figma-home-hero" aria-labelledby="home-hero-title">
            <div className="figma-home-hero__bg-pattern" aria-hidden="true" />
            <div className="home-hero__copy" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <p className="home-hero__eyebrow figma-home-hero__eyebrow">
                <span aria-hidden="true">✦</span> Проверенная недвижимость в Грузии
              </p>
              <h1 id="home-hero-title" className="figma-home-hero__title">
                ПОИСК НЕДВИЖИМОСТИ <span>В ГРУЗИИ</span>
              </h1>
              <p className="figma-home-hero__subtitle">
                Единая база проверенных жилых комплексов, квартир и коммерческих объектов без скрытых комиссий
              </p>

              {/* Search Card */}
              <div className="home-hero__search-card figma-home-search-box">
                <div className="home-hero__tabs figma-home-search-tabs" role="tablist" aria-label="Тип операции">
                  <Link className="home-hero__tab figma-home-search-tab is-active" role="tab" aria-selected="true" to="/">
                    Новостройки
                  </Link>
                  <Link className="home-hero__tab figma-home-search-tab" role="tab" aria-selected="false" to="/?tab=listings">
                    Купить вторичку
                  </Link>
                  <Link className="home-hero__tab figma-home-search-tab" role="tab" aria-selected="false" to="/?tab=listings&dealType=rent_long">
                    Снять
                  </Link>
                </div>
                <form className="home-search figma-home-search-bar" onSubmit={submitCity} role="search" aria-label="Поиск по городу">
                  <label htmlFor="city" className="visually-hidden">Город</label>
                  <input
                    id="city"
                    name="city"
                    type="search"
                    autoComplete="address-level2"
                    value={cityInput}
                    onChange={(event) => setCityInput(event.target.value)}
                    placeholder="Например, Батуми, Тбилиси или название ЖК"
                  />
                  <button type="submit" className="figma-home-search-btn" aria-label="Найти объекты в городе">
                    Найти
                  </button>
                </form>
              </div>
            </div>
          </section>

          {/* Section 2: Category Matrix (Figma 3428:55271 & 3854:69048) */}
          <section className="figma-home-container" aria-label="Категории недвижимости">
            <div className="figma-home-categories-grid">
              <Link to="/" className="figma-category-card">
                <div className="figma-category-card__icon" aria-hidden="true">🏢</div>
                <div>
                  <h2 className="figma-category-card__title">Новостройки</h2>
                  <span className="figma-category-card__count">Жилые комплексы от застройщиков</span>
                </div>
                <span className="figma-category-card__arrow">Смотреть ЖК →</span>
              </Link>

              <Link to="/?tab=listings" className="figma-category-card">
                <div className="figma-category-card__icon" aria-hidden="true">🔑</div>
                <div>
                  <h2 className="figma-category-card__title">Вторичка</h2>
                  <span className="figma-category-card__count">Квартиры с готовым ремонтом</span>
                </div>
                <span className="figma-category-card__arrow">Смотреть квартиры →</span>
              </Link>

              <Link to="/?tab=listings&propertyType=house" className="figma-category-card">
                <div className="figma-category-card__icon" aria-hidden="true">🏡</div>
                <div>
                  <h2 className="figma-category-card__title">Дома и виллы</h2>
                  <span className="figma-category-card__count">Частные резиденции и таунхаусы</span>
                </div>
                <span className="figma-category-card__arrow">Смотреть дома →</span>
              </Link>

              <Link to="/?tab=listings&propertyType=commercial" className="figma-category-card">
                <div className="figma-category-card__icon" aria-hidden="true">🏬</div>
                <div>
                  <h2 className="figma-category-card__title">Коммерция</h2>
                  <span className="figma-category-card__count">Офисы, торговые площади, склады</span>
                </div>
                <span className="figma-category-card__arrow">Смотреть коммерцию →</span>
              </Link>

              <Link to="/?tab=listings&propertyType=land" className="figma-category-card">
                <div className="figma-category-card__icon" aria-hidden="true">🌄</div>
                <div>
                  <h2 className="figma-category-card__title">Земельные участки</h2>
                  <span className="figma-category-card__count">Участки под застройку и инвестиции</span>
                </div>
                <span className="figma-category-card__arrow">Смотреть участки →</span>
              </Link>
            </div>
          </section>

          {/* Section 3: Ecosystem Highlights (Figma 3428:55292) */}
          <section className="figma-home-container" aria-label="Преимущества платформы">
            <div className="figma-home-metrics">
              <div className="figma-metric-item">
                <div className="figma-metric-item__icon" aria-hidden="true">✓</div>
                <div>
                  <div className="figma-metric-item__value">0% комиссия</div>
                  <p className="figma-metric-item__desc">Покупка новостроек напрямую по официальным ценам застройщиков</p>
                </div>
              </div>

              <div className="figma-metric-item">
                <div className="figma-metric-item__icon" aria-hidden="true">★</div>
                <div>
                  <div className="figma-metric-item__value">100% проверка</div>
                  <p className="figma-metric-item__desc">Юридическая проверка документации и разрешений на строительство</p>
                </div>
              </div>

              <div className="figma-metric-item">
                <div className="figma-metric-item__icon" aria-hidden="true">⚡</div>
                <div>
                  <div className="figma-metric-item__value">Экосистема BAZA</div>
                  <p className="figma-metric-item__desc">Прямой контакт с отделами продаж застройщиков и проверенными риэлторами</p>
                </div>
              </div>
            </div>
          </section>

          {/* Section 4: Partner Promos (Figma 3428:56103) */}
          <section className="figma-home-container home-hero__promos" aria-label="Возможности BAZA">
            <div className="figma-home-promos">
              <Link className="figma-home-banner" to="/publish">
                <div>
                  <span className="figma-home-banner__badge">Для собственников и риэлторов</span>
                  <h2 className="figma-home-banner__title">Хотите продать квартиру, дом или участок?</h2>
                  <p className="figma-home-banner__text">
                    Бесплатно разместите свое объявление на BAZA и найдите покупателей среди тысяч пользователей.
                  </p>
                </div>
                <span className="figma-home-banner__cta">Разместить объект →</span>
              </Link>

              <Link className="figma-home-banner figma-home-banner--green" to="/?tab=listings">
                <div>
                  <span className="figma-home-banner__badge">Для партнеров</span>
                  <h2 className="figma-home-banner__title">Эксклюзивные предложения от BAZA</h2>
                  <p className="figma-home-banner__text">
                    Уникальные условия инвестирования, скидки от застройщиков и партнерские комиссии.
                  </p>
                </div>
                <span className="figma-home-banner__cta">Смотреть предложения →</span>
              </Link>
            </div>
          </section>
        </div>
      ) : null}
      <FacetFilters
        tabParam={tabParam}
        cityParam={cityParam}
        dealTypeParam={dealTypeParam}
        propertyTypeParam={propertyTypeParam}
        sortParam={sortParam}
        isMapView={isMapView}
        onFilterChange={updateFilters}
        onClearFilters={clearAllFilters}
        viewUrl={viewUrl}
      />

      <section className="catalogue-section" aria-live="polite" aria-labelledby="catalogue-results-heading">
        <div className="section-heading">
          <h2 id="catalogue-results-heading">
            {cityParam
              ? `${isDev ? 'ЖК' : 'Объекты'} в городе ${cityParam}`
              : `Все опубликованные ${isDev ? 'ЖК' : 'объекты'}`}
          </h2>
          {state.status === 'ready' ? <span>{`Показано: ${state.items.length} из ${state.total}`}</span> : null}
          {state.status === 'empty' ? <span>Пока нет объектов</span> : null}
        </div>

        {state.status === 'loading' ? (
          <div className="state-panel" role="status" aria-busy="true">
            <p>Загружаем каталог…</p>
            <div className="development-grid figma-catalog-grid">
              <CardSkeleton count={6} />
            </div>
          </div>
        ) : null}

        {state.status === 'error' ? (
          <div className="state-panel state-panel--error" role="alert">
            <p>{state.message}</p>
            <button type="button" className="retry-btn" onClick={state.retry}>
              Повторить попытку
            </button>
          </div>
        ) : null}

        {state.status === 'empty' ? (
          <div className="state-panel state-panel--empty">
            <p>По выбранным параметрам пока нет опубликованных объектов.</p>
            {(cityParam || dealTypeParam || propertyTypeParam) && (
              <button type="button" className="clear-filter-btn" onClick={clearAllFilters}>
                Сбросить фильтры
              </button>
            )}
          </div>
        ) : null}

        {state.status === 'ready' ? (
          <>
            {isMapView ? (
              <div className="catalogue-split-view">
                <aside className="catalogue-split-sidebar" aria-label="Список объектов на карте">
                  <div className="catalogue-split-cards">
                    {isDev
                      ? (state.items as PublicDevelopmentCard[]).map((item, index) => (
                          <DevelopmentCard
                            key={item.slug ?? `${item.name}-${index}`}
                            item={item}
                            size="small"
                          />
                        ))
                      : (state.items as PublicListingCard[]).map((item, index) => (
                          <ListingCard
                            key={item.slug ?? `listing-${index}`}
                            item={item}
                            size="small"
                          />
                        ))}
                  </div>
                </aside>
                <div className="catalogue-split-map">
                  <MarketplaceMap
                    items={state.items as Array<PublicDevelopmentCard | PublicListingCard>}
                    onBoundsChange={handleMapBoundsChange}
                  />
                </div>
              </div>
            ) : (
              <div className="development-grid figma-catalog-grid">
                {isDev
                  ? (state.items as PublicDevelopmentCard[]).map((item, index) => (
                      <DevelopmentCard key={item.slug ?? `${item.name}-${index}`} item={item} />
                    ))
                  : (state.items as PublicListingCard[]).map((item, index) => (
                      <ListingCard key={item.slug ?? `listing-${index}`} item={item} />
                    ))}
              </div>
            )}

            {state.loadMoreError && (
              <div className="pagination-error-panel" role="alert">
                <p>{state.loadMoreError}</p>
                <button type="button" className="retry-btn" onClick={retryLoadMore}>
                  Попробовать снова
                </button>
              </div>
            )}

            {state.nextCursor ? (
              <div className="load-more-container">
                <button
                  className="load-more"
                  type="button"
                  onClick={loadMore}
                  disabled={state.loadingMore}
                  aria-busy={state.loadingMore}
                >
                  {state.loadingMore ? 'Загружаем…' : 'Показать ещё'}
                </button>
              </div>
            ) : (
              <p className="catalogue-end-note" aria-live="polite">
                Все доступные объекты показаны
              </p>
            )}
          </>
        ) : null}
      </section>

      <button className="visually-hidden" type="button" onClick={() => navigate('/')}>
        Вернуться в начало каталога
      </button>
    </Shell>
  )
}

function DevelopmentDetailPage() {
  const { slug } = useParams()
  const state = useDevelopmentDetail(slug)
  const [selectedUnit, setSelectedUnit] = useState<UnitInfo | null>(null)

  useSeoMetadata(
    state.status === 'ready'
      ? {
          title: developmentTitle(state.item),
          description: state.item.description || `Жилой комплекс ${developmentTitle(state.item)}`,
          jsonLd: buildDevelopmentJsonLd(
            state.item,
            typeof window !== 'undefined' ? window.location.origin : ''
          ),
        }
      : {
          title: state.status === 'not-found' ? 'Объект не найден' : undefined,
        }
  )

  const sampleUnits: UnitInfo[] = [
    { title: 'Студия', area: 32.5, rooms: 1, floor: 4, price: 'от $39 000' },
    { title: '1-комнатная квартира', area: 48.0, rooms: 1, floor: 7, price: 'от $57 600' },
    { title: '2-комнатная квартира', area: 72.4, rooms: 2, floor: 10, price: 'от $86 800' },
    { title: '3-комнатный пентхаус', area: 115.0, rooms: 3, floor: 18, price: 'от $155 000' },
  ]

  return (
    <Shell>
      <section className="detail-page figma-dev-detail" aria-labelledby="development-detail-title">
        <Link className="back-link" to="/" aria-label="Вернуться в каталог объектов">
          ← В каталог
        </Link>
        {state.status === 'loading' ? (
          <div className="state-panel" role="status" aria-busy="true">
            Загружаем объект…
          </div>
        ) : null}
        {state.status === 'not-found' ? (
          <div className="state-panel state-panel--error" role="alert">
            <p>Жилой комплекс не найден или был снят с публикации.</p>
            <Link to="/" className="back-to-catalogue-btn">
              Вернуться в каталог
            </Link>
          </div>
        ) : null}
        {state.status === 'error' ? (
          <div className="state-panel state-panel--error" role="alert">
            <p>{state.message}</p>
            <button type="button" className="retry-btn" onClick={state.retry}>
              Повторить попытку
            </button>
          </div>
        ) : null}
        {state.status === 'ready' ? (
          <>
            {/* Top Hero: Gallery & Details (Figma 3314:200744 & 3314:200763) */}
            <div className="detail-hero figma-dev-hero">
              <div className="figma-dev-gallery">
                <BuildingPlaceholder />
              </div>
              <div className="detail-hero__copy figma-dev-summary">
                <div className="figma-dev-badges">
                  <span className="figma-badge figma-badge--completed">В продаже</span>
                  {state.item.classType ? (
                    <span className="figma-badge figma-badge--class">{state.item.classType}</span>
                  ) : null}
                </div>
                <h1 id="development-detail-title" className="figma-dev-title">
                  {developmentTitle(state.item)}
                </h1>
                <p className="address figma-dev-address">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  <span>{developmentAddress(state.item)}</span>
                </p>

                <div className="figma-dev-pricing-card">
                  <span className="figma-dev-spec-label">Стоимость квартир:</span>
                  <div className="figma-dev-price-main">от $39 000</div>
                  <div className="figma-dev-price-sqm">от $1 200 / м² · Возможна беспроцентная рассрочка</div>
                </div>

                {slug ? <RevealContactCTA slug={slug} type="development" /> : null}
              </div>
            </div>

            {/* Specs Ribbon (Figma 3314:200845) */}
            <div className="detail-facts figma-dev-ribbon" aria-label="Ключевые факты о комплексе">
              <div className="figma-dev-spec">
                <span className="figma-dev-spec-label">Срок сдачи</span>
                <strong className="figma-dev-spec-value">{completionLabel(state.item.completionDate) ?? 'Уточняется'}</strong>
              </div>
              <div className="figma-dev-spec">
                <span className="figma-dev-spec-label">Класс жилья</span>
                <strong className="figma-dev-spec-value">{state.item.classType ?? 'Комфорт'}</strong>
              </div>
              <div className="figma-dev-spec">
                <span className="figma-dev-spec-label">Страна</span>
                <strong className="figma-dev-spec-value">{state.item.location?.country ?? 'Грузия'}</strong>
              </div>
              <div className="figma-dev-spec">
                <span className="figma-dev-spec-label">Город</span>
                <strong className="figma-dev-spec-value">{state.item.location?.city ?? 'Батуми'}</strong>
              </div>
            </div>

            {/* About Project (Figma 3314:200866) */}
            <section className="detail-description figma-dev-section" aria-labelledby="about-project-heading">
              <h2 id="about-project-heading" className="figma-dev-section-title">О проекте</h2>
              <p className="figma-dev-description">
                {state.item.description?.trim() || 'Современный жилой комплекс с развитой инфраструктурой, подземным паркингом, панорамным остеклением и видами на море и горы.'}
              </p>
            </section>

            {/* Layouts and Units Matrix (Figma 3314:202465) */}
            <section id="units" className="figma-dev-section" aria-label="Планировки и цены">
              <h2 className="figma-dev-section-title">Планировки и цены</h2>
              <div className="figma-units-matrix">
                {sampleUnits.map((u, i) => (
                  <div key={i} className="figma-unit-card">
                    <h3 className="figma-unit-card__title">{u.title}</h3>
                    <div className="figma-unit-card__meta">
                      <span>Площадь: {u.area} м²</span>
                      <span>{u.floor} этаж</span>
                    </div>
                    <div className="figma-unit-card__price">{u.price}</div>
                    <button
                      type="button"
                      className="figma-unit-card__btn"
                      onClick={() => setSelectedUnit(u)}
                    >
                      Посмотреть планировку
                    </button>
                  </div>
                ))}
              </div>
            </section>

            {/* Quick View Modal (Figma 3314:203298) */}
            <UnitQuickViewModal
              unit={selectedUnit}
              developmentName={developmentTitle(state.item)}
              onClose={() => setSelectedUnit(null)}
            />
          </>
        ) : null}
      </section>
    </Shell>
  )
}

function ListingDetailPage() {
  const { slug } = useParams()
  const state = useListingDetail(slug)

  useSeoMetadata(
    state.status === 'ready'
      ? {
          title: state.item.seo?.title || listingTitle(state.item),
          description:
            state.item.seo?.description ||
            `${listingTitle(state.item)} по адресу ${listingAddress(state.item)}`,
          imageUrl: state.item.media?.find((m) => m.role === 'cover')?.url || state.item.media?.[0]?.url,
          jsonLd: buildListingJsonLd(
            state.item,
            typeof window !== 'undefined' ? window.location.origin : ''
          ),
        }
      : {
          title: state.status === 'not-found' ? 'Объявление не найдено' : undefined,
        }
  )

  return (
    <Shell>
      <section className="detail-page figma-listing-detail" aria-labelledby="listing-detail-title">
        <Link className="back-link" to="/?tab=listings" aria-label="Вернуться в каталог вторички и аренды">
          ← В каталог
        </Link>
        {state.status === 'loading' ? (
          <div className="state-panel" role="status" aria-busy="true">
            Загружаем объект…
          </div>
        ) : null}
        {state.status === 'not-found' ? (
          <div className="state-panel state-panel--error" role="alert">
            <p>Объявление не найдено или было снято с публикации.</p>
            <Link to="/?tab=listings" className="back-to-catalogue-btn">
              Вернуться в каталог
            </Link>
          </div>
        ) : null}
        {state.status === 'error' ? (
          <div className="state-panel state-panel--error" role="alert">
            <p>{state.message}</p>
            <button type="button" className="retry-btn" onClick={state.retry}>
              Повторить попытку
            </button>
          </div>
        ) : null}
        {state.status === 'ready' ? (
          <>
            {/* Top Hero: Gallery & Details (Figma 3314:206822) */}
            <div className="detail-hero detail-hero--listing figma-listing-hero">
              <div className="figma-listing-gallery">
                <ListingMediaGallery media={state.item.media} title={listingTitle(state.item)} />
              </div>
              <div className="detail-hero__copy figma-listing-summary">
                <div className="figma-listing-summary__badges">
                  <span className="listing-badge figma-listing-card__badge figma-listing-card__badge--deal">
                    {listingDealTypeLabel(state.item.dealType)}
                  </span>
                  {state.item.isVerified ? (
                    <span className="figma-listing-card__badge figma-listing-card__badge--verified">
                      ✓ Проверено
                    </span>
                  ) : null}
                </div>
                <h1 id="listing-detail-title" className="figma-listing-title">
                  {listingTitle(state.item)}
                </h1>
                <p className="address figma-listing-address">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  <span>{listingAddress(state.item)}</span>
                </p>
                <div className="detail-price-box figma-listing-pricing-card">
                  <p className="detail-price-main figma-listing-price-main">
                    {listingPrice(state.item)}
                    {state.item.dealType === 'rent_short' ? (
                      <span className="figma-listing-price-sub"> / сутки</span>
                    ) : state.item.dealType === 'rent_long' ? (
                      <span className="figma-listing-price-sub"> / мес</span>
                    ) : null}
                  </p>
                  <p className="meta figma-listing-price-sub">
                    {listingPropertyTypeLabel(state.item.propertyType, state.item.commercialSubtype)}
                  </p>
                </div>
                {slug ? <RevealContactCTA slug={slug} type="listing" /> : null}
              </div>
            </div>

            {/* Facts / Specifications Ribbon */}
            <div className="detail-facts figma-listing-ribbon" aria-label="Характеристики объекта">
              <div className="figma-listing-spec">
                <span className="figma-listing-spec-label">Тип сделки</span>
                <strong className="figma-listing-spec-value">{listingDealTypeLabel(state.item.dealType)}</strong>
              </div>
              <div className="figma-listing-spec">
                <span className="figma-listing-spec-label">Площадь</span>
                <strong className="figma-listing-spec-value">
                  {state.item.characteristics?.area ? `${state.item.characteristics.area} м²` : '—'}
                </strong>
              </div>
              <div className="figma-listing-spec">
                <span className="figma-listing-spec-label">Комнат</span>
                <strong className="figma-listing-spec-value">{state.item.characteristics?.rooms ?? '—'}</strong>
              </div>
              <div className="figma-listing-spec">
                <span className="figma-listing-spec-label">Этаж</span>
                <strong className="figma-listing-spec-value">
                  {state.item.characteristics?.floor
                    ? `${state.item.characteristics.floor}${state.item.characteristics.totalFloors ? ` / ${state.item.characteristics.totalFloors}` : ''}`
                    : '—'}
                </strong>
              </div>
              <div className="figma-listing-spec">
                <span className="figma-listing-spec-label">Город</span>
                <strong className="figma-listing-spec-value">{state.item.location?.city ?? 'Уточняется'}</strong>
              </div>
              <div className="figma-listing-spec">
                <span className="figma-listing-spec-label">Страна</span>
                <strong className="figma-listing-spec-value">{state.item.location?.country ?? 'Уточняется'}</strong>
              </div>
            </div>

            {/* Description Section */}
            <section className="detail-description figma-listing-section" aria-labelledby="listing-description-heading">
              <h2 id="listing-description-heading" className="figma-listing-section-title">Описание</h2>
              <p className="figma-listing-description">
                {state.item.seo?.description?.trim() ||
                  'Объект проверен и опубликован через систему управления недвижимостью BAZA.'}
              </p>
            </section>

            {/* Contacts & Lead Generation Section (Figma 3304:57919) */}
            <section className="figma-listing-contacts" id="contacts" aria-labelledby="contacts-heading">
              <h2 id="contacts-heading" className="figma-listing-section-title">Связаться с риелтором</h2>
              <ListingContactForm slug={slug!} />
            </section>
          </>
        ) : null}
      </section>
    </Shell>
  )
}

function PublishingWizardPage() {
  useSeoMetadata({
    title: 'Разместить объявление',
    description: 'Публикация объявления о продаже или аренде недвижимости в каталоге BAZA.sale',
    canonicalUrl: `${window.location.origin}/publish`,
  })

  return (
    <Shell>
      <PublishingWizard />
    </Shell>
  )
}

export default function App() {
  return (
    <RouteErrorBoundary>
      <Routes>
        <Route path="/" element={<CataloguePage />} />
        <Route path="/developments/:slug" element={<DevelopmentDetailPage />} />
        <Route path="/listings/:slug" element={<ListingDetailPage />} />
        <Route path="/realtors" element={<Shell><RealtorsPage /></Shell>} />
        <Route path="/realtors/:id" element={<Shell><RealtorProfilePage /></Shell>} />
        <Route path="/favorites" element={<Shell><FavoritesPage /></Shell>} />
        <Route path="/account/favorites" element={<Shell><FavoritesPage /></Shell>} />
        <Route path="/selections" element={<Shell><SelectionsPage /></Shell>} />
        <Route path="/selections/:slug" element={<Shell><SelectionDetailPage /></Shell>} />
        <Route path="/requests" element={<Shell><RequestsPage /></Shell>} />
        <Route path="/account/properties" element={<Shell><MyPropertiesPage /></Shell>} />
        <Route path="/account/crm" element={<Shell><CrmKanbanPage /></Shell>} />
        <Route path="/account/tasks" element={<Shell><CrmTasksPage /></Shell>} />
        <Route path="/account/calendar" element={<Shell><CrmCalendarPage /></Shell>} />
        <Route path="/account" element={<Shell><MyPropertiesPage /></Shell>} />
        <Route path="/publish" element={<PublishingWizardPage />} />
        <Route path="*" element={<CataloguePage />} />
      </Routes>
    </RouteErrorBoundary>
  )
}
