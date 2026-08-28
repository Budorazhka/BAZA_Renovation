import { FormEvent, useState } from 'react'
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { completionLabel, developmentAddress, developmentTitle } from './lib/format'
import { useCatalogue } from './hooks/useCatalogue'
import { useDevelopmentDetail } from './hooks/useDevelopmentDetail'
import type { PublicDevelopmentCard } from './types/marketplace'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="wordmark" to="/" aria-label="BAZA.sale, каталог жилых комплексов">
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
  return slug ? <Link className="development-card" to={`/developments/${slug}`}>{content}</Link> : <article className="development-card">{content}</article>
}

function CataloguePage() {
  const navigate = useNavigate()
  const [cityInput, setCityInput] = useState('')
  const [activeCity, setActiveCity] = useState('')
  const { state, loadMore } = useCatalogue({ city: activeCity })

  function submitCity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setActiveCity(cityInput.trim())
  }

  return (
    <Shell>
      <section className="catalogue-intro">
        <div>
          <p className="section-kicker">Каталог новостроек</p>
          <h1>Место, где начинается ваш новый адрес.</h1>
          <p className="intro-copy">Собрали опубликованные жилые комплексы в одном понятном каталоге.</p>
        </div>
        <form className="city-form" onSubmit={submitCity}>
          <label htmlFor="city">Город</label>
          <div className="city-form__control">
            <input id="city" value={cityInput} onChange={(event) => setCityInput(event.target.value)} placeholder="Например, Батуми" />
            <button type="submit">Найти</button>
          </div>
          {activeCity ? <button className="clear-filter" type="button" onClick={() => { setCityInput(''); setActiveCity('') }}>Сбросить фильтр</button> : null}
        </form>
      </section>

      <section className="catalogue-section" aria-live="polite">
        <div className="section-heading">
          <p>{activeCity ? `ЖК в городе ${activeCity}` : 'Все опубликованные ЖК'}</p>
          {state.status === 'ready' ? <span>{`Показано: ${state.items.length}`}</span> : null}
          {state.status === 'empty' ? <span>Пока нет объектов</span> : null}
        </div>

        {state.status === 'loading' ? <div className="state-panel">Загружаем каталог…</div> : null}
        {state.status === 'error' ? (
          <div className="state-panel state-panel--error">
            <p>{state.message}</p>
            <button type="button" onClick={state.retry}>Повторить</button>
          </div>
        ) : null}
        {state.status === 'empty' ? <div className="state-panel">По этому запросу пока нет опубликованных объектов.</div> : null}
        {state.status === 'ready' ? <div className="development-grid">{state.items.map((item, index) => <DevelopmentCard key={item.slug ?? `${item.name}-${index}`} item={item} />)}</div> : null}
        {state.status === 'ready' && state.nextCursor ? <button className="load-more" type="button" onClick={loadMore} disabled={state.loadingMore}>{state.loadingMore ? 'Загружаем…' : 'Показать ещё'}</button> : null}
      </section>

      <button className="visually-hidden" type="button" onClick={() => navigate('/')}>Вернуться в начало каталога</button>
    </Shell>
  )
}

function DetailPage() {
  const { slug } = useParams()
  const state = useDevelopmentDetail(slug)

  return (
    <Shell>
      <section className="detail-page">
        <Link className="back-link" to="/">← В каталог</Link>
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
              <div><span>Срок сдачи</span><strong>{completionLabel(state.item.completionDate) ?? 'Уточняется'}</strong></div>
              <div><span>Страна</span><strong>{state.item.location?.country ?? 'Уточняется'}</strong></div>
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

export default function App() {
  return <Routes><Route path="/" element={<CataloguePage />} /><Route path="/developments/:slug" element={<DetailPage />} /><Route path="*" element={<CataloguePage />} /></Routes>
}
