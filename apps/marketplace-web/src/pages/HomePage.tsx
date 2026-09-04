import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

/**
 * Главная страница: информационная витрина, без списка объектов с фильтрами.
 *
 * Решение владельца от 04.09.2026 по образцу действующего baza.sale: главная
 * рассказывает о платформе и разводит по разделам, а работа с каталогом
 * (фильтры, сортировка, карта, пагинация) живёт в самих разделах —
 * `/newconstructions`, `/secondary`, `/rent`. До этого обе роли исполнял один
 * маршрут `/`: под информационными блоками сразу же шёл рабочий каталог.
 *
 * В Figma это тоже два разных фрейма: `Home page` (`3428:55239`, 1920x5544) и
 * `search result` (`236:27197`, 1920x1216).
 */
export function HomePage() {
  const navigate = useNavigate()
  const [cityInput, setCityInput] = useState('')

  function submitCity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const city = cityInput.trim()
    // Поиск с главной ведёт в раздел новостроек: главная сама ничего не ищет.
    navigate(city ? `/newconstructions?city=${encodeURIComponent(city)}` : '/newconstructions')
  }

  return (
    <div className="figma-home">
      {/* Section 1: Hero Block (Figma 1035:16926 / 3851:56175) */}
      <section className="home-hero figma-home-hero" aria-labelledby="home-hero-title">
        <div className="figma-home-hero__bg-pattern" aria-hidden="true" />
        <div className="home-hero__copy" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <p className="home-hero__eyebrow figma-home-hero__eyebrow">
            <span aria-hidden="true">✦</span> Проверенная недвижимость в Грузии
          </p>
          <h1 id="home-hero-title" className="figma-home-hero__title">
            Поиск недвижимости <span>в Грузии</span>
          </h1>
          <p className="figma-home-hero__subtitle">
            Единая база проверенных жилых комплексов, квартир и коммерческих объектов без скрытых комиссий
          </p>

          <div className="home-hero__search-card figma-home-search-box">
            <div className="home-hero__tabs figma-home-search-tabs" role="tablist" aria-label="Тип операции">
              <Link
                className="home-hero__tab figma-home-search-tab is-active"
                role="tab"
                aria-selected="true"
                to="/newconstructions"
              >
                Новостройки
              </Link>
              <Link className="home-hero__tab figma-home-search-tab" role="tab" aria-selected="false" to="/secondary">
                Купить вторичку
              </Link>
              <Link className="home-hero__tab figma-home-search-tab" role="tab" aria-selected="false" to="/rent">
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
          <Link to="/newconstructions" className="figma-category-card">
            <div className="figma-category-card__icon" aria-hidden="true">🏢</div>
            <div>
              <h2 className="figma-category-card__title">Новостройки</h2>
              <span className="figma-category-card__count">Жилые комплексы от застройщиков</span>
            </div>
            <span className="figma-category-card__arrow">Смотреть ЖК →</span>
          </Link>

          <Link to="/secondary" className="figma-category-card">
            <div className="figma-category-card__icon" aria-hidden="true">🔑</div>
            <div>
              <h2 className="figma-category-card__title">Вторичка</h2>
              <span className="figma-category-card__count">Квартиры с готовым ремонтом</span>
            </div>
            <span className="figma-category-card__arrow">Смотреть квартиры →</span>
          </Link>

          <Link to="/secondary?propertyType=house" className="figma-category-card">
            <div className="figma-category-card__icon" aria-hidden="true">🏡</div>
            <div>
              <h2 className="figma-category-card__title">Дома и виллы</h2>
              <span className="figma-category-card__count">Частные резиденции и таунхаусы</span>
            </div>
            <span className="figma-category-card__arrow">Смотреть дома →</span>
          </Link>

          <Link to="/secondary?propertyType=commercial" className="figma-category-card">
            <div className="figma-category-card__icon" aria-hidden="true">🏬</div>
            <div>
              <h2 className="figma-category-card__title">Коммерция</h2>
              <span className="figma-category-card__count">Офисы, торговые площади, склады</span>
            </div>
            <span className="figma-category-card__arrow">Смотреть коммерцию →</span>
          </Link>

          <Link to="/secondary?propertyType=land" className="figma-category-card">
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

          <Link className="figma-home-banner figma-home-banner--green" to="/secondary">
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
  )
}
