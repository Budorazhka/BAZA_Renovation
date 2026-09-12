import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { marketplaceApi } from '../api/marketplace-api'
import { DevelopmentCard } from '../components/DevelopmentCard'
import { ListingCard } from '../components/ListingCard'
import type { PublicDevelopmentCard, PublicListingCard } from '../types/marketplace'

/**
 * Главная страница по утверждённому фрейму Figma `Home page` v4 long
 * (`3428:55239`, 1920x5544); решение владельца — MKT-SCR-001 в
 * docs/discovery/marketplace-screen-build-spec.md.
 *
 * Вёрстка снята с узлов макета, а не с их перечня: у каждой секции здесь
 * свой автолэйаут (`stackMode`/`stackSpacing`/`stackPadding`), свои
 * начертания и кегли, свои радиусы и тени. Значения перечислены рядом с
 * каждым блоком в home.css; инструмент выгрузки — analysis_tools/dump_spec.js.
 *
 * Секции фрейма (дети `3428:55241`):
 *   `3851:56175` hero 1920x905, VERTICAL gap 62, center
 *   `3428:55271` категории 1920x523, HORIZONTAL gap 19, padding 0/80
 *   `3428:55292` «Почему выбирают BAZA.sale?» 1920x352, HORIZONTAL gap 249
 *   `3428:55382` промо 1920x500, HORIZONTAL gap 50
 *   `3428:55605` «Горячие предложения» 1920x746, карточки 424x626 gap 21
 *   `3428:55845` «Новые объявления квартир» 1920x783, карточки 424x663
 *   `3428:56071` «Каталог проверенных риелторов» — нет публичного API
 *   `3428:56103` «Рейтинг застройщиков» — нет публичного API
 *   `3428:56129` footer 3 (на всех экранах утверждён `footer 1`, MKT-SCR-003)
 */

interface CategorySpec {
  title: string
  to: string
  countKey: 'developments' | 'sale' | 'rent' | 'commercial'
  /** Ширина карточки в макете: 390/470/410/450/450 из ряда 1920. */
  width: number
}

const CATEGORIES: CategorySpec[] = [
  { title: 'Новостройки', to: '/newconstructions', countKey: 'developments', width: 390 },
  { title: 'Вторичка', to: '/secondary', countKey: 'sale', width: 470 },
  { title: 'Аренда', to: '/rent', countKey: 'rent', width: 410 },
  { title: 'Проекты', to: '/newconstructions', countKey: 'developments', width: 450 },
  { title: 'Коммерция', to: '/secondary?propertyType=commercial', countKey: 'commercial', width: 450 },
]

/** Три довода из `3428:55298`: иконка 139x139, заголовок 20px, текст 20px. */
const ADVANTAGES = [
  { title: 'Большой выбор', text: 'Объявления, которые регулярно обновляются' },
  { title: 'Проверенные агенты', text: 'База проверенных риелторов с реальными отзывами' },
  { title: 'Удобный поиск', text: 'Множество фильтров и карта объектов' },
]

interface HomeData {
  developments: PublicDevelopmentCard[]
  listings: PublicListingCard[]
  counts: Partial<Record<CategorySpec['countKey'], number>>
}

const EMPTY: HomeData = { developments: [], listings: [], counts: {} }

/**
 * Обложка объявления. У публичной карточки ЖК фотографий нет вовсе
 * (`PublicDevelopmentCard` — slug, имя, локация, цена, состав квартир),
 * хотя макет их предполагает: отдельный пробел проекции публикации.
 */
function coverOf(item: PublicListingCard | undefined): string | null {
  const media = item?.media ?? []
  return (media.find((m) => m.role === 'cover') ?? media[0])?.url ?? null
}

export function HomePage() {
  const [data, setData] = useState<HomeData>(EMPTY)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      try {
        const [developments, sale, rent, commercial] = await Promise.all([
          marketplaceApi.listDevelopments({ limit: 4 }, { signal: controller.signal }),
          marketplaceApi.listListings({ limit: 4, dealType: 'sale' }, { signal: controller.signal }),
          marketplaceApi.listListings({ limit: 1, dealType: 'rent_long' }, { signal: controller.signal }),
          marketplaceApi.listListings({ limit: 1, propertyType: 'commercial' }, { signal: controller.signal }),
        ])
        setData({
          developments: developments.items,
          listings: sale.items,
          // Счётчик в скобках у категории — `total` из того же ответа,
          // отдельный запрос ради цифры не нужен.
          counts: {
            developments: developments.total,
            sale: sale.total,
            rent: rent.total,
            commercial: commercial.total,
          },
        })
        setLoadError(false)
      } catch {
        if (controller.signal.aborted) return
        setData(EMPTY)
        setLoadError(true)
      }
    }

    void load()
    return () => controller.abort()
  }, [])

  const heroCover = coverOf(data.listings[0])

  return (
    <div className="home">
      {/* hero `3851:56175`: VERTICAL gap 62, center; логотип-плашка 557x180; слоган 50px */}
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-hero__head">
          <p className="home-hero__logo">
            <svg viewBox="0 0 100 100" width="100" height="100" aria-hidden="true" focusable="false">
              <path
                d="M50 12 14 42v46h26V62h20v26h26V42z"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                strokeLinejoin="round"
              />
            </svg>
            <span className="home-hero__logo-text">BAZA.sale</span>
          </p>
          <h1 id="home-title" className="home-hero__slogan">Лучший способ найти недвижимость</h1>
        </div>

        {heroCover ? (
          <div className="home-hero__photo">
            <img src={heroCover} alt="" loading="eager" />
          </div>
        ) : null}
      </section>

      {/* категории `3428:55271`: HORIZONTAL gap 19, карточки radius 30, border 3px, тень */}
      <section className="home-categories" aria-label="Категории недвижимости">
        <div className="home-categories__row">
          {CATEGORIES.map((category) => {
            const count = data.counts[category.countKey]
            const cover = coverOf(data.listings[0])
            return (
              <Link
                key={category.title}
                to={category.to}
                className="home-category"
                style={{ flexBasis: `${category.width}px` }}
              >
                <span className="home-category__head">
                  <span className="home-category__title">{category.title}</span>
                  {count !== undefined ? <span className="home-category__count">({count})</span> : null}
                </span>
                <span className={`home-category__photo${cover ? '' : ' home-category__photo--empty'}`}>
                  {cover ? <img src={cover} alt="" loading="lazy" /> : null}
                </span>
              </Link>
            )
          })}
        </div>
      </section>

      {/* «Почему выбирают» `3428:55292`: слева пилюля + заголовок 50px ExtraBold, справа три довода */}
      <section className="home-why" aria-labelledby="home-why-title">
        <div className="home-why__intro">
          <p className="home-why__tag">Преимущества</p>
          <h2 id="home-why-title" className="home-why__title">Почему выбирают BAZA.sale?</h2>
          <p className="home-why__lead">Тысячи клиентов ежемесячно находят жильё на нашей платформе</p>
        </div>
        <ul className="home-why__list">
          {ADVANTAGES.map((advantage) => (
            <li key={advantage.title} className="home-advantage">
              <span className="home-advantage__icon" aria-hidden="true" />
              <h3 className="home-advantage__title">{advantage.title}</h3>
              <p className="home-advantage__text">{advantage.text}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* промо `3428:55382`: зелёный блок 670x500 и баннер 1040x500, оба radius 30 */}
      <section className="home-promo" aria-label="Разместить объявление и акции">
        <div className="home-promo__sell">
          <h2 className="home-promo__sell-title">Хотите продать квартиру, дом или участок?</h2>
          <p className="home-promo__sell-text">
            Бесплатно разместите своё объявление на BAZA, и вы быстро найдёте покупателей
          </p>
          <Link to="/publish" className="home-promo__sell-button">+ Разместить объявление</Link>
        </div>

        <div className="home-promo__sale">
          <div className="home-promo__sale-body">
            <p className="home-promo__sale-kicker">Горячие предложения</p>
            <p className="home-promo__sale-word">SALE</p>
            <p className="home-promo__sale-value">до 30%</p>
          </div>
        </div>
      </section>

      {/* рельса ЖК `3428:55605`: шапка 60px, ряд карточек 424x626 gap 21 */}
      <section className="home-rail" aria-labelledby="home-hot-title">
        <div className="home-rail__head">
          <h2 id="home-hot-title" className="home-rail__title">
            <span className="home-rail__badge" aria-hidden="true" />
            Горячие предложения
          </h2>
          <Link to="/newconstructions" className="home-rail__all">
            Смотреть все
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
              <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>
        {data.developments.length > 0 ? (
          <div className="home-rail__items">
            {data.developments.slice(0, 4).map((item) => (
              <DevelopmentCard key={item.slug} item={item} />
            ))}
          </div>
        ) : (
          <p className="home-rail__empty">
            {loadError ? 'Объекты сейчас не загрузились.' : 'Пока нет опубликованных жилых комплексов.'}
          </p>
        )}
      </section>

      {/* рельса вторички `3428:55845`: та же шапка, карточки 424x663 */}
      <section className="home-rail" aria-labelledby="home-new-title">
        <div className="home-rail__head">
          <h2 id="home-new-title" className="home-rail__title">
            <span className="home-rail__badge" aria-hidden="true" />
            Новые объявления квартир
          </h2>
          <Link to="/secondary" className="home-rail__all">
            Смотреть все
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
              <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>
        {data.listings.length > 0 ? (
          <div className="home-rail__items">
            {data.listings.slice(0, 4).map((item) => (
              <ListingCard key={item.slug} item={item} />
            ))}
          </div>
        ) : (
          <p className="home-rail__empty">
            {loadError ? 'Объявления сейчас не загрузились.' : 'Пока нет опубликованных объявлений.'}
          </p>
        )}
      </section>
    </div>
  )
}
