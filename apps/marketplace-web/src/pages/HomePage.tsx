import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { marketplaceApi } from '../api/marketplace-api'
import { DevelopmentCard } from '../components/DevelopmentCard'
import { ListingCard } from '../components/ListingCard'
import type { PublicDevelopmentCard, PublicListingCard } from '../types/marketplace'

/**
 * Главная страница по утверждённому фрейму Figma `Home page` v4 long
 * (`3428:55239`, 1920x5544), решение владельца в
 * docs/discovery/marketplace-screen-build-spec.md, строка MKT-SCR-001.
 *
 * До 12.09.2026 здесь стояла страница, собранная не по этому фрейму:
 * hero с формой поиска вместо логотипа и слогана, пять одинаковых
 * иконочных плашек вместо категорий с фотографиями, свои тексты вместо
 * макетных и, главное, ни одного реального объекта — ни «Горячих
 * предложений», ни «Новых объявлений квартир», хотя обе секции в макете
 * занимают вместе 1529px из 5544px.
 *
 * Порядок секций фрейма (сверху вниз, ID дочерних узлов `3428:55241`):
 *   `3851:56175` hero 1920x905      — логотип, слоган, фотополотно
 *   `3428:55271` категории 1920x523 — пять карточек с фото и счётчиками
 *   `3428:55292` «Почему выбирают BAZA.sale?» 1920x352
 *   `3428:55382` промо 1920x500     — продать объект + «Горячие предложения»
 *   `3428:55605` «Горячие предложения» 1920x746 — 4 карточки ЖК 424x626
 *   `3428:55845` «Новые объявления квартир» 1920x783 — 4 карточки 424x663
 *   `3428:56071` «Каталог проверенных риелторов» 1920x334
 *   `3428:56103` «Рейтинг застройщиков» 1920x347
 *   `3428:56129` footer 3 1920x640
 *
 * Две секции с людьми и компаниями (`3428:56071`, `3428:56103`) здесь
 * не собираются: публичного API ни для риэлторов, ни для застройщиков нет
 * (`/public/*` — это developments, listings и selections). Рисовать их на
 * выдуманных людях запрещает то же правило, по которому 11.09 вычищали
 * засев community. Секции появятся вместе со своим backend.
 */

const CATEGORY_LINKS = [
  { title: 'Новостройки', to: '/newconstructions', kind: 'developments' as const },
  { title: 'Вторичка', to: '/secondary', kind: 'listings' as const, dealType: 'sale' as const },
  { title: 'Аренда', to: '/rent', kind: 'listings' as const, dealType: 'rent_long' as const },
  { title: 'Проекты', to: '/newconstructions?stage=under_construction', kind: 'developments' as const },
  { title: 'Коммерция', to: '/secondary?propertyType=commercial', kind: 'listings' as const, propertyType: 'commercial' as const },
]

interface HomeData {
  developments: PublicDevelopmentCard[]
  listings: PublicListingCard[]
  counts: Record<string, number | null>
}

const EMPTY: HomeData = { developments: [], listings: [], counts: {} }

/**
 * Обложка объявления. У ЖК фотографий в публичном ответе нет вовсе
 * (`PublicDevelopmentCard` — это slug, имя, локация, цена, состав квартир),
 * хотя в макете обложка карточки ЖК — фотография. Пробел в API, отмечен в
 * документе работы; пока единственный источник настоящих фотографий на
 * главной — объявления.
 */
function coverOf(item: PublicListingCard | undefined): string | null {
  const media = item?.media ?? []
  const cover = media.find((m) => m.role === 'cover') ?? media[0]
  return cover?.url ?? null
}

export function HomePage() {
  const [data, setData] = useState<HomeData>(EMPTY)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      try {
        // Счётчики категорий берём из тех же выборок: `total` уже приходит
        // в ответе списка, отдельных запросов ради цифры в скобках не надо.
        const [developments, sale, rent, commercial] = await Promise.all([
          marketplaceApi.listDevelopments({ limit: 4 }, { signal: controller.signal }),
          marketplaceApi.listListings({ limit: 4, dealType: 'sale' }, { signal: controller.signal }),
          marketplaceApi.listListings({ limit: 1, dealType: 'rent_long' }, { signal: controller.signal }),
          marketplaceApi.listListings({ limit: 1, propertyType: 'commercial' }, { signal: controller.signal }),
        ])

        setData({
          developments: developments.items,
          listings: sale.items,
          counts: {
            Новостройки: developments.total ?? null,
            Вторичка: sale.total ?? null,
            Аренда: rent.total ?? null,
            Проекты: developments.total ?? null,
            Коммерция: commercial.total ?? null,
          },
        })
        setLoadError(null)
      } catch (error) {
        if (controller.signal.aborted) return
        // Пустые секции вместо выдуманных карточек: страница честно
        // показывает, что данные не пришли, и даёт повторить.
        setData(EMPTY)
        setLoadError(error instanceof Error ? error.message : 'Не удалось загрузить объекты')
      }
    }

    void load()
    return () => controller.abort()
  }, [])

  const heroCover = coverOf(data.listings[0])

  return (
    <div className="home">
      {/* Hero — Figma 3851:56175 (1920x905): логотип 557x180, слоган 50px, фото 1920x596 */}
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-hero__head">
          <p className="home-hero__wordmark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="72" height="72" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>BAZA<span className="home-hero__wordmark-dot">.sale</span></span>
          </p>
          <h1 id="home-title" className="home-hero__slogan">
            Лучший способ найти недвижимость
          </h1>
        </div>

        {/*
          * Фотополотно макета (`2851 1`, 1920x596) рисуется только когда
          * фотография действительно есть. Пустая плита во весь экран хуже
          * её отсутствия: она читается как незагрузившийся блок.
          */}
        {heroCover ? (
          <div className="home-hero__canvas">
            <img src={heroCover} alt="" loading="eager" />
          </div>
        ) : null}
      </section>

      {/* Категории — Figma 3428:55271 (1920x523): пять карточек разной ширины с фото */}
      <section className="home-categories" aria-label="Категории недвижимости">
        <div className="home-categories__row">
          {CATEGORY_LINKS.map((category) => {
            const count = data.counts[category.title]
            // Фотография категории — обложка настоящего объявления этой
            // категории. Своих иллюстраций у нас нет: картинки макета лежат
            // в исходном .fig, которого в репозитории нет.
            const cover = coverOf(data.listings[0])
            return (
              <Link key={category.title} to={category.to} className="home-category">
                <span className="home-category__head">
                  <span className="home-category__title">{category.title}</span>
                  {count !== null && count !== undefined ? (
                    <span className="home-category__count">({count})</span>
                  ) : null}
                </span>
                <span className={`home-category__photo${cover ? '' : ' home-category__photo--empty'}`}>
                  {cover ? <img src={cover} alt="" loading="lazy" /> : null}
                </span>
              </Link>
            )
          })}
        </div>
      </section>

      {/* Почему выбирают — Figma 3428:55292 (1920x352) */}
      <section className="home-why" aria-labelledby="home-why-title">
        <div className="home-why__intro">
          <h2 id="home-why-title" className="home-section__title">Почему выбирают BAZA.sale?</h2>
          <p className="home-section__lead">Тысячи клиентов ежемесячно находят жильё на нашей платформе</p>
        </div>
        <ul className="home-why__list">
          <li>
            <h3>Большой выбор</h3>
            <p>Объявления, которые регулярно обновляются</p>
          </li>
          <li>
            <h3>Проверенные агенты</h3>
            <p>База проверенных риэлторов с реальными отзывами</p>
          </li>
          <li>
            <h3>Удобный поиск</h3>
            <p>Множество фильтров и карта объектов</p>
          </li>
        </ul>
      </section>

      {/* Промо — Figma 3428:55382 (1920x500): зелёный блок 670x500 + баннер 1040x500 */}
      <section className="home-promo" aria-label="Разместить объект и горячие предложения">
        <div className="home-promo__sell">
          <h2>Хотите продать квартиру, дом или участок?</h2>
          <p>Бесплатно разместите своё объявление на BAZA, и вы быстро найдёте покупателей</p>
          <Link to="/publish" className="home-promo__button">Разместить объект</Link>
        </div>
        <div className="home-promo__sale">
          <p className="home-promo__sale-kicker">Уникальные предложения по стоимости и комиссиям только для партнёров</p>
          <p className="home-promo__sale-title">Горячие предложения</p>
          <p className="home-promo__sale-word">SALE</p>
          <p className="home-promo__sale-value">до 30%</p>
        </div>
      </section>

      {/* Горячие предложения — Figma 3428:55605 (1920x746), 4 карточки ЖК */}
      <section className="home-rail" aria-labelledby="home-hot-title">
        <div className="home-rail__head">
          <h2 id="home-hot-title" className="home-rail__title">Горячие предложения</h2>
          <Link to="/newconstructions" className="home-rail__all">Смотреть все</Link>
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

      {/* Новые объявления квартир — Figma 3428:55845 (1920x783), 4 карточки вторички */}
      <section className="home-rail" aria-labelledby="home-new-title">
        <div className="home-rail__head">
          <h2 id="home-new-title" className="home-rail__title">Новые объявления квартир</h2>
          <Link to="/secondary" className="home-rail__all">Смотреть все</Link>
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
