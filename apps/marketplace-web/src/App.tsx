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
import type {
  PublicDevelopmentCard,
  PublicListingCard,
  ListingDealType,
  ListingPropertyType,
} from './types/marketplace'

function Shell({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const listingsActive = location.search.includes('tab=listings')
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Перейти к основному содержанию
      </a>
      <header className="site-header" role="banner">
        <Link className="wordmark" to="/" aria-label="BAZA, каталог объектов недвижимости">
          BAZA
        </Link>
        <nav className="main-nav" aria-label="Основная навигация">
          <Link to="/" className={`main-nav__link${listingsActive ? '' : ' is-active'}`}>Новостройки</Link>
          <Link to="/?tab=listings" className={`main-nav__link${listingsActive ? ' is-active' : ''}`}>Вторичка</Link>
          <Link to="/" className="main-nav__link">Проекты</Link>
          <Link to="/?tab=listings&dealType=rent_long" className="main-nav__link">Аренда</Link>
          <Link to="/?tab=listings&propertyType=commercial" className="main-nav__link">Коммерция</Link>
          <Link to="/" className="main-nav__link">Запросы</Link>
          <Link to="/" className="main-nav__link">Банки</Link>
        </nav>
        <div className="header-actions">
          <Link className="header-action header-action--primary" to="/">+ Разместить</Link>
          <Link className="header-action header-action--dark" to="/">⌕ Войти</Link>
          <button className="header-locale" type="button" aria-label="Выбрать язык">RU⌄</button>
          <button className="header-locale" type="button" aria-label="Выбрать валюту">$⌄</button>
          <button className="header-location" type="button" aria-label="Выбрать город">● Тбилиси</button>
          <button className="header-profile" type="button" aria-label="Профиль">◔</button>
        </div>
      </header>
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
      <div className="floating-controls" aria-label="Инструменты каталога">
        <button type="button" className="floating-control floating-control--filters" aria-label="Открыть фильтры">☷<span>⌁</span></button>
        <button type="button" className="floating-control floating-control--map" aria-label="Показать на карте">♧</button>
      </div>
      <footer className="site-footer" role="contentinfo">
        <p>BAZA.sale · проверенный каталог объектов недвижимости</p>
      </footer>
    </div>
  )
}

function BuildingPlaceholder() {
  return (
    <div className="building-placeholder" aria-hidden="true">
      <span className="building-placeholder__sun" />
      <span className="building-placeholder__tower building-placeholder__tower--left" />
      <span className="building-placeholder__tower building-placeholder__tower--right" />
      <span className="building-placeholder__ground" />
    </div>
  )
}

function DevelopmentCard({ item }: { item: PublicDevelopmentCard }) {
  const slug = item.slug
  const content = (
    <>
      <BuildingPlaceholder />
      <div className="development-card__body">
        {item.classType ? <p className="meta">{item.classType}</p> : null}
        <h2>{developmentTitle(item)}</h2>
        <p className="address">{developmentAddress(item)}</p>
        <div className="card-footer">
          <span>{completionLabel(item.completionDate) ?? 'Срок сдачи уточняется'}</span>
          <span className="arrow" aria-hidden="true">↗</span>
        </div>
      </div>
    </>
  )
  return slug ? (
    <Link className="development-card" to={`/developments/${slug}`} aria-label={`Жилой комплекс ${developmentTitle(item)}`}>
      {content}
    </Link>
  ) : (
    <article className="development-card">{content}</article>
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

  const [cityInput, setCityInput] = useState(cityParam)

  // Keep input synchronized if URL changes (e.g. back/forward button)
  useEffect(() => {
    setCityInput(cityParam)
  }, [cityParam])

  // Queries
  const developmentsQuery = useCatalogue({
    city: cityParam,
  })

  const listingsQuery = useListingsCatalogue({
    city: cityParam,
    dealType: dealTypeParam,
    propertyType: propertyTypeParam,
    commercialSubtype: commercialSubtypeParam,
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
    })
  }

  return (
    <Shell>
      <section className="catalogue-toolbar" aria-labelledby="catalogue-heading">
        <h1 id="catalogue-heading" className="visually-hidden">Каталог объектов недвижимости</h1>
        <div className="catalogue-count">
          <strong>{state.status === 'ready' ? state.items.length.toLocaleString('ru-RU') : '—'}</strong>
          <span>объектов найдено</span>
        </div>
        <div className="catalogue-toolbar__actions">
          <form className="city-form city-form--compact" onSubmit={submitCity} role="search" aria-label="Поиск по городу">
            <label className="visually-hidden" htmlFor="city">Город</label>
            <input
              id="city"
              name="city"
              type="search"
              autoComplete="address-level2"
              value={cityInput}
              onChange={(event) => setCityInput(event.target.value)}
              placeholder="Город"
            />
            <button type="submit" aria-label="Найти объекты в городе">⌕</button>
          </form>
          <button className="sort-control" type="button" aria-label="Сортировка объектов">Сначала дешевле⌄</button>
          {(cityParam || dealTypeParam || propertyTypeParam) ? (
            <button className="clear-filter clear-filter--compact" type="button" onClick={clearAllFilters}>
              Сбросить
            </button>
          ) : null}
        </div>
      </section>

      {tabParam === 'listings' ? (
        <details className="filters-drawer">
          <summary>Фильтры и тип объекта</summary>
          <div className="catalogue-filters-panel" aria-label="Фильтры объявлений">
            <div className="catalogue-subfilters" role="group" aria-label="Тип сделки">
              {([
                [undefined, 'Все типы сделок'],
                ['sale', 'Купить'],
                ['rent_long', 'Снять длительно'],
                ['rent_short', 'Посуточно'],
              ] as const).map(([value, label]) => (
                <button key={label} type="button" className={`filter-chip${dealTypeParam === value ? ' is-active' : ''}`} onClick={() => updateFilters({ dealType: value })}>{label}</button>
              ))}
            </div>
            <div className="catalogue-subfilters" role="group" aria-label="Тип недвижимости">
              {([
                [undefined, 'Все объекты'],
                ['apartment', 'Квартиры'],
                ['house', 'Дома и виллы'],
                ['commercial', 'Коммерческая'],
                ['land', 'Участки'],
              ] as const).map(([value, label]) => (
                <button key={label} type="button" className={`filter-chip${propertyTypeParam === value ? ' is-active' : ''}`} onClick={() => updateFilters({ propertyType: value, commercialSubtype: undefined })}>{label}</button>
              ))}
            </div>
          </div>
        </details>
      ) : null}

      <section className="catalogue-section" aria-live="polite" aria-labelledby="catalogue-results-heading">
        <div className="section-heading section-heading--sr-only">
          <h2 id="catalogue-results-heading">
            {cityParam
              ? `${isDev ? 'ЖК' : 'Объекты'} в городе ${cityParam}`
              : `Все опубликованные ${isDev ? 'ЖК' : 'объекты'}`}
          </h2>
          {state.status === 'ready' ? <span>{`Показано: ${state.items.length}`}</span> : null}
          {state.status === 'empty' ? <span>Пока нет объектов</span> : null}
        </div>

        {state.status === 'loading' ? (
          <div className="state-panel" role="status" aria-busy="true">
            Загружаем каталог…
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
            <div className="development-grid">
              {isDev
                ? (state.items as PublicDevelopmentCard[]).map((item, index) => (
                    <DevelopmentCard key={item.slug ?? `${item.name}-${index}`} item={item} />
                  ))
                : (state.items as PublicListingCard[]).map((item, index) => (
                    <ListingCardItem key={item.slug ?? `listing-${index}`} item={item} />
                  ))}
            </div>

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

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<CataloguePage />} />
      <Route path="/developments/:slug" element={<DevelopmentDetailPage />} />
      <Route path="/listings/:slug" element={<ListingDetailPage />} />
      <Route path="*" element={<CataloguePage />} />
    </Routes>
  )
}
