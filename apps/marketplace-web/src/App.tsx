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
import { CardSkeleton } from './components/CardSkeleton'
import { FacetFilters } from './components/FacetFilters'
import './styles/header-footer.css'
import './styles/cards.css'
import './styles/filters.css'
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

function ListingCardItem({ item }: { item: PublicListingCard }) {
  const slug = item.slug
  const coverItem = item.media?.find((m) => m.role === 'cover') || item.media?.[0]
  const [imgError, setImgError] = useState(false)

  const mediaDisplay =
    coverItem && !imgError ? (
      <div className="listing-card-media">
        <img
          src={coverItem.url}
          alt={coverItem.alt || listingTitle(item)}
          className="listing-card-media__img"
          loading="lazy"
          onError={() => setImgError(true)}
        />
      </div>
    ) : (
      <BuildingPlaceholder />
    )

  const content = (
    <>
      {mediaDisplay}
      <div className="listing-card__body">
        <span className="listing-badge">✦ {item.dealType === 'sale' ? 'Срочная продажа' : listingDealTypeLabel(item.dealType)}</span>
        <p className="listing-card-price">{listingPrice(item)}</p>
        <div className="listing-card__title-row">
          <h2>{listingTitle(item)}</h2>
          <span className="listing-card__actions" aria-hidden="true">♧ <span>♥</span></span>
        </div>
        <p className="address"><span className="address__pin" aria-hidden="true">●</span>{listingAddress(item)}</p>
        {item.location?.country ? (
          <p className="address address--country"><span aria-hidden="true">✚</span>{item.location.country}{item.location.city ? `, ${item.location.city}` : ''}</p>
        ) : null}
        <div className="listing-chips" aria-label="Характеристики объекта">
          {item.characteristics?.rooms ? (
            <span className="listing-chip">{item.characteristics.rooms} комн.</span>
          ) : null}
          {item.characteristics?.area ? (
            <span className="listing-chip">{item.characteristics.area} м²</span>
          ) : null}
          {item.characteristics?.floor ? (
            <span className="listing-chip">
              {item.characteristics.floor}
              {item.characteristics.totalFloors ? ` / ${item.characteristics.totalFloors}` : ''} эт.
            </span>
          ) : null}
        </div>
        <div className="listing-card__contact-actions" aria-hidden="true">
          <span>Позвонить</span>
          <span>Написать</span>
        </div>
        <div className="card-footer listing-card__footer">
          <span className="listing-card__property">{listingPropertyTypeLabel(item.propertyType, item.commercialSubtype)}</span>
          <span className="arrow" aria-hidden="true">↗</span>
        </div>
      </div>
    </>
  )
  return slug ? (
    <Link className="listing-card" to={`/listings/${slug}`} aria-label={`Объявление: ${listingTitle(item)}`}>
      {content}
    </Link>
  ) : (
    <article className="listing-card">{content}</article>
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
        <>
          <section className="home-hero" aria-labelledby="home-hero-title">
            <div className="home-hero__copy">
              <p className="home-hero__eyebrow">Каталог недвижимости</p>
              <h1 id="home-hero-title">ПОИСК НЕДВИЖИМОСТИ <span>В ГРУЗИИ</span></h1>
              <div className="home-hero__search-card">
                <div className="home-hero__tabs" role="tablist" aria-label="Тип операции">
                  <Link className="home-hero__tab is-active" role="tab" aria-selected="true" to="/">Купить</Link>
                  <Link className="home-hero__tab" role="tab" aria-selected="false" to="/?tab=listings&dealType=rent_long">Снять</Link>
                </div>
                <form className="home-search" onSubmit={submitCity} role="search" aria-label="Поиск по городу">
                  <label htmlFor="city">Город</label>
                  <div className="home-search__control">
                    <input
                      id="city"
                      name="city"
                      type="search"
                      autoComplete="address-level2"
                      value={cityInput}
                      onChange={(event) => setCityInput(event.target.value)}
                      placeholder="Например, Батуми"
                    />
                    <button type="submit" aria-label="Найти объекты в городе">Найти</button>
                  </div>
                </form>
              </div>
            </div>
          </section>
          <section className="home-hero__promos" aria-label="Возможности BAZA">
            <Link className="home-promo home-promo--light" to="/publish">
              <strong>Хотите продать квартиру, дом или участок?</strong>
              <span>Бесплатно разместите свое объявление на BAZA и быстро найдите покупателей.</span>
              <span className="home-promo__action">Разместить объект <span aria-hidden="true">→</span></span>
            </Link>
            <Link className="home-promo home-promo--green" to="/?tab=listings">
              <strong>Эксклюзивные предложения от BAZA</strong>
              <span>Уникальные предложения по стоимости и комиссиям только для партнёров.</span>
              <span className="home-promo__action">Смотреть предложения <span aria-hidden="true">→</span></span>
            </Link>
          </section>
        </>
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
                          <ListingCardItem key={item.slug ?? `listing-${index}`} item={item} />
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
              <div className="development-grid">
                {isDev
                  ? (state.items as PublicDevelopmentCard[]).map((item, index) => (
                      <DevelopmentCard key={item.slug ?? `${item.name}-${index}`} item={item} />
                    ))
                  : (state.items as PublicListingCard[]).map((item, index) => (
                      <ListingCardItem key={item.slug ?? `listing-${index}`} item={item} />
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

  return (
    <Shell>
      <section className="detail-page" aria-labelledby="development-detail-title">
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
            <div className="detail-hero">
              <BuildingPlaceholder />
              <div className="detail-hero__copy">
                {state.item.classType ? <p className="meta">{state.item.classType}</p> : null}
                <h1 id="development-detail-title">{developmentTitle(state.item)}</h1>
                <p className="address">{developmentAddress(state.item)}</p>
              </div>
            </div>
            <div className="detail-facts" aria-label="Ключевые факты о комплексе">
              <div>
                <span>Срок сдачи</span>
                <strong>{completionLabel(state.item.completionDate) ?? 'Уточняется'}</strong>
              </div>
              <div>
                <span>Страна</span>
                <strong>{state.item.location?.country ?? 'Уточняется'}</strong>
              </div>
              <div>
                <span>Город</span>
                <strong>{state.item.location?.city ?? 'Уточняется'}</strong>
              </div>
            </div>
            <section className="detail-description" aria-labelledby="about-project-heading">
              <h2 id="about-project-heading">О проекте</h2>
              <p>{state.item.description?.trim() || 'Описание проекта будет добавлено застройщиком.'}</p>
            </section>
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
      <section className="detail-page" aria-labelledby="listing-detail-title">
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
            <div className="detail-hero detail-hero--listing">
              <ListingMediaGallery media={state.item.media} title={listingTitle(state.item)} />
              <div className="detail-hero__copy">
                <span className="listing-badge">{listingDealTypeLabel(state.item.dealType)}</span>
                <h1 id="listing-detail-title">{listingTitle(state.item)}</h1>
                <p className="address">{listingAddress(state.item)}</p>
                <div className="detail-price-box">
                  <p className="detail-price-main">{listingPrice(state.item)}</p>
                  <p className="meta">
                    {listingPropertyTypeLabel(state.item.propertyType, state.item.commercialSubtype)}
                  </p>
                </div>
              </div>
            </div>
            <div className="detail-facts" aria-label="Характеристики объекта">
              <div>
                <span>Тип сделки</span>
                <strong>{listingDealTypeLabel(state.item.dealType)}</strong>
              </div>
              <div>
                <span>Площадь</span>
                <strong>
                  {state.item.characteristics?.area ? `${state.item.characteristics.area} м²` : '—'}
                </strong>
              </div>
              <div>
                <span>Комнат</span>
                <strong>{state.item.characteristics?.rooms ?? '—'}</strong>
              </div>
              <div>
                <span>Этаж</span>
                <strong>
                  {state.item.characteristics?.floor
                    ? `${state.item.characteristics.floor}${state.item.characteristics.totalFloors ? ` / ${state.item.characteristics.totalFloors}` : ''}`
                    : '—'}
                </strong>
              </div>
              <div>
                <span>Город</span>
                <strong>{state.item.location?.city ?? 'Уточняется'}</strong>
              </div>
              <div>
                <span>Страна</span>
                <strong>{state.item.location?.country ?? 'Уточняется'}</strong>
              </div>
            </div>
            <section className="detail-description" aria-labelledby="listing-description-heading">
              <h2 id="listing-description-heading">Описание</h2>
              <p>
                {state.item.seo?.description?.trim() ||
                  'Объект проверен и опубликован через систему управления недвижимостью BAZA.'}
              </p>
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
        <Route path="/publish" element={<PublishingWizardPage />} />
        <Route path="*" element={<CataloguePage />} />
      </Routes>
    </RouteErrorBoundary>
  )
}
