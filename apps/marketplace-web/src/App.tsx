import { FormEvent, useState } from 'react'
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom'
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
import { ListingContactForm } from './components/ListingContactForm'
import type {
  PublicDevelopmentCard,
  PublicListingCard,
  ListingDealType,
} from './types/marketplace'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="wordmark" to="/" aria-label="BAZA.sale, каталог недвижимости">
          BAZA<span>.sale</span>
        </Link>
        <p className="header-caption">Недвижимость без лишнего шума</p>
      </header>
      <main>{children}</main>
      <footer className="site-footer">BAZA.sale · каталог объектов недвижимости</footer>
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
    <Link className="development-card" to={`/developments/${slug}`}>
      {content}
    </Link>
  ) : (
    <article className="development-card">{content}</article>
  )
}

function ListingCardItem({ item }: { item: PublicListingCard }) {
  const slug = item.slug
  const content = (
    <>
      <BuildingPlaceholder />
      <div className="development-card__body">
        <span className="listing-badge">{listingDealTypeLabel(item.dealType)}</span>
        <p className="listing-card-price">{listingPrice(item)}</p>
        <h2>{listingTitle(item)}</h2>
        <p className="address">{listingAddress(item)}</p>
        <div className="listing-chips">
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
        <div className="card-footer">
          <span>{listingPropertyTypeLabel(item.propertyType, item.commercialSubtype)}</span>
          <span className="arrow" aria-hidden="true">↗</span>
        </div>
      </div>
    </>
  )
  return slug ? (
    <Link className="development-card" to={`/listings/${slug}`}>
      {content}
    </Link>
  ) : (
    <article className="development-card">{content}</article>
  )
}

type CatalogueTab = 'developments' | 'listings'

function CataloguePage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<CatalogueTab>('developments')
  const [cityInput, setCityInput] = useState('')
  const [activeCity, setActiveCity] = useState('')
  const [dealTypeFilter, setDealTypeFilter] = useState<ListingDealType | undefined>(undefined)

  const developmentsQuery = useCatalogue({ city: activeCity })
  const listingsQuery = useListingsCatalogue({
    city: activeCity,
    dealType: dealTypeFilter,
  })

  function submitCity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setActiveCity(cityInput.trim())
  }

  const isDev = activeTab === 'developments'
  const state = isDev ? developmentsQuery.state : listingsQuery.state
  const loadMore = isDev ? developmentsQuery.loadMore : listingsQuery.loadMore

  return (
    <Shell>
      <section className="catalogue-intro">
        <div>
          <div className="catalogue-tabs" role="tablist">
            <button
              type="button"
              className={`catalogue-tab-btn${activeTab === 'developments' ? ' is-active' : ''}`}
              onClick={() => setActiveTab('developments')}
            >
              Новостройки
            </button>
            <button
              type="button"
              className={`catalogue-tab-btn${activeTab === 'listings' ? ' is-active' : ''}`}
              onClick={() => setActiveTab('listings')}
            >
              Вторичка и аренда
            </button>
          </div>
          <p className="section-kicker">
            {activeTab === 'developments' ? 'Каталог новостроек' : 'Вторичная недвижимость и аренда'}
          </p>
          <h1>Место, где начинается ваш новый адрес.</h1>
          <p className="intro-copy">
            {activeTab === 'developments'
              ? 'Собрали проверенные жилые комплексы в одном понятном каталоге.'
              : 'Актуальные квартиры, дома и коммерческие помещения от собственников и агентств.'}
          </p>

          {activeTab === 'listings' && (
            <div className="catalogue-subfilters">
              <button
                type="button"
                className={`filter-chip${dealTypeFilter === undefined ? ' is-active' : ''}`}
                onClick={() => setDealTypeFilter(undefined)}
              >
                Все типы сделок
              </button>
              <button
                type="button"
                className={`filter-chip${dealTypeFilter === 'sale' ? ' is-active' : ''}`}
                onClick={() => setDealTypeFilter('sale')}
              >
                Купить
              </button>
              <button
                type="button"
                className={`filter-chip${dealTypeFilter === 'rent_long' ? ' is-active' : ''}`}
                onClick={() => setDealTypeFilter('rent_long')}
              >
                Снять длительно
              </button>
              <button
                type="button"
                className={`filter-chip${dealTypeFilter === 'rent_short' ? ' is-active' : ''}`}
                onClick={() => setDealTypeFilter('rent_short')}
              >
                Посуточно
              </button>
            </div>
          )}
        </div>
        <form className="city-form" onSubmit={submitCity}>
          <label htmlFor="city">Город</label>
          <div className="city-form__control">
            <input
              id="city"
              value={cityInput}
              onChange={(event) => setCityInput(event.target.value)}
              placeholder="Например, Батуми"
            />
            <button type="submit">Найти</button>
          </div>
          {activeCity ? (
            <button
              className="clear-filter"
              type="button"
              onClick={() => {
                setCityInput('')
                setActiveCity('')
              }}
            >
              Сбросить фильтр
            </button>
          ) : null}
        </form>
      </section>

      <section className="catalogue-section" aria-live="polite">
        <div className="section-heading">
          <p>
            {activeCity
              ? `${isDev ? 'ЖК' : 'Объекты'} в городе ${activeCity}`
              : `Все опубликованные ${isDev ? 'ЖК' : 'объекты'}`}
          </p>
          {state.status === 'ready' ? <span>{`Показано: ${state.items.length}`}</span> : null}
          {state.status === 'empty' ? <span>Пока нет объектов</span> : null}
        </div>

        {state.status === 'loading' ? <div className="state-panel">Загружаем каталог…</div> : null}
        {state.status === 'error' ? (
          <div className="state-panel state-panel--error">
            <p>{state.message}</p>
            <button type="button" onClick={state.retry}>
              Повторить
            </button>
          </div>
        ) : null}
        {state.status === 'empty' ? (
          <div className="state-panel">По этому запросу пока нет опубликованных объектов.</div>
        ) : null}
        {state.status === 'ready' ? (
          <div className="development-grid">
            {isDev
              ? (state.items as PublicDevelopmentCard[]).map((item, index) => (
                  <DevelopmentCard key={item.slug ?? `${item.name}-${index}`} item={item} />
                ))
              : (state.items as PublicListingCard[]).map((item, index) => (
                  <ListingCardItem key={item.slug ?? `listing-${index}`} item={item} />
                ))}
          </div>
        ) : null}
        {state.status === 'ready' && state.nextCursor ? (
          <button className="load-more" type="button" onClick={loadMore} disabled={state.loadingMore}>
            {state.loadingMore ? 'Загружаем…' : 'Показать ещё'}
          </button>
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

  return (
    <Shell>
      <section className="detail-page">
        <Link className="back-link" to="/">
          ← В каталог
        </Link>
        {state.status === 'loading' ? <div className="state-panel">Загружаем объект…</div> : null}
        {state.status === 'not-found' ? (
          <div className="state-panel state-panel--error">
            <p>Объект не найден или больше не опубликован.</p>
            <Link to="/">Вернуться в каталог</Link>
          </div>
        ) : null}
        {state.status === 'error' ? (
          <div className="state-panel state-panel--error">
            <p>{state.message}</p>
            <Link to="/">Вернуться в каталог</Link>
          </div>
        ) : null}
        {state.status === 'ready' ? (
          <>
            <div className="detail-hero">
              <BuildingPlaceholder />
              <div className="detail-hero__copy">
                {state.item.classType ? <p className="meta">{state.item.classType}</p> : null}
                <h1>{developmentTitle(state.item)}</h1>
                <p className="address">{developmentAddress(state.item)}</p>
              </div>
            </div>
            <div className="detail-facts">
              <div>
                <span>Срок сдачи</span>
                <strong>{completionLabel(state.item.completionDate) ?? 'Уточняется'}</strong>
              </div>
              <div>
                <span>Страна</span>
                <strong>{state.item.location?.country ?? 'Уточняется'}</strong>
              </div>
            </div>
            <section className="detail-description">
              <h2>О проекте</h2>
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

  return (
    <Shell>
      <section className="detail-page">
        <Link className="back-link" to="/">
          ← В каталог
        </Link>
        {state.status === 'loading' ? <div className="state-panel">Загружаем объект…</div> : null}
        {state.status === 'not-found' ? (
          <div className="state-panel state-panel--error">
            <p>Объект не найден или больше не опубликован.</p>
            <Link to="/">Вернуться в каталог</Link>
          </div>
        ) : null}
        {state.status === 'error' ? (
          <div className="state-panel state-panel--error">
            <p>{state.message}</p>
            <Link to="/">Вернуться в каталог</Link>
          </div>
        ) : null}
        {state.status === 'ready' ? (
          <>
            <div className="detail-hero">
              <BuildingPlaceholder />
              <div className="detail-hero__copy">
                <span className="listing-badge">{listingDealTypeLabel(state.item.dealType)}</span>
                <h1>{listingTitle(state.item)}</h1>
                <p className="address">{listingAddress(state.item)}</p>
                <div className="detail-price-box">
                  <p className="detail-price-main">{listingPrice(state.item)}</p>
                  <p className="meta">{listingPropertyTypeLabel(state.item.propertyType, state.item.commercialSubtype)}</p>
                </div>
              </div>
            </div>
            <div className="detail-facts">
              <div>
                <span>Тип сделки</span>
                <strong>{listingDealTypeLabel(state.item.dealType)}</strong>
              </div>
              <div>
                <span>Площадь</span>
                <strong>{state.item.characteristics?.area ? `${state.item.characteristics.area} м²` : '—'}</strong>
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
            <section className="detail-description">
              <h2>Описание</h2>
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
