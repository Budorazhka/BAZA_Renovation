import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useSeoMetadata } from '../hooks/useSeoMetadata'
import { BuildingPlaceholder } from '../components/DevelopmentCard'

export interface FavoriteItem {
  id: string
  slug: string
  title: string
  dealType: 'sale' | 'rent_short' | 'rent_long'
  propertyType: string
  price: string
  pricePerSqm?: string
  address: string
  city: string
  rooms: number
  area: number
  floor: number
  imageUrl?: string
}

const INITIAL_FAVORITES: FavoriteItem[] = [
  {
    id: 'fav-1',
    slug: 'batumi-flat-sea-view',
    title: '2-комн. апартаменты с панорамным видом на море',
    dealType: 'sale',
    propertyType: 'Квартира',
    price: '$85 000',
    pricePerSqm: '$1 307 / м²',
    address: 'ул. Шерифа Химшиашвили, 15',
    city: 'Батуми',
    rooms: 2,
    area: 65,
    floor: 12,
  },
  {
    id: 'fav-2',
    slug: 'batumi-studio-orbi',
    title: 'Студия под ключ в Orbi City',
    dealType: 'sale',
    propertyType: 'Апартаменты',
    price: '$48 000',
    pricePerSqm: '$1 454 / м²',
    address: 'ул. Пиросмани, 8',
    city: 'Батуми',
    rooms: 1,
    area: 33,
    floor: 18,
  },
  {
    id: 'fav-3',
    slug: 'tbilisi-vake-3room',
    title: 'Просторная 3-комнатная квартира в Ваке',
    dealType: 'rent_long',
    propertyType: 'Квартира',
    price: '$1 200 / мес',
    address: 'просп. Чавчавадзе, 42',
    city: 'Тбилиси',
    rooms: 3,
    area: 110,
    floor: 5,
  },
]

export function FavoritesPage() {
  const [favorites, setFavorites] = useState<FavoriteItem[]>(INITIAL_FAVORITES)
  const [dealFilter, setDealFilter] = useState<'all' | 'sale' | 'rent_long' | 'rent_short'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortOrder, setSortOrder] = useState<'default' | 'price_asc' | 'price_desc'>('default')
  const [isCreatedSelectionOpen, setIsCreatedSelectionOpen] = useState(false)

  useSeoMetadata({
    title: 'Избранное | BAZA',
    description: 'Сохраненные объекты недвижимости, квартиры и апартаменты в Батуми и Тбилиси.',
  })

  const handleRemove = (id: string) => {
    setFavorites((prev) => prev.filter((item) => item.id !== id))
  }

  const handleCreateSelection = () => {
    setIsCreatedSelectionOpen(true)
    setTimeout(() => setIsCreatedSelectionOpen(false), 3000)
  }

  const filtered = favorites
    .filter((item) => {
      if (dealFilter !== 'all' && item.dealType !== dealFilter) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        return (
          item.title.toLowerCase().includes(q) ||
          item.address.toLowerCase().includes(q) ||
          item.city.toLowerCase().includes(q)
        )
      }
      return true
    })

  return (
    <div className="figma-fav-page">
      <div className="figma-fav-header">
        <div className="figma-fav-header__title-group">
          <h1 className="figma-fav-header__title">Избранное</h1>
          <span className="figma-fav-header__badge" data-testid="favorites-count-badge">
            {favorites.length} объектов
          </span>
        </div>

        {favorites.length > 0 && (
          <button
            type="button"
            className="figma-fav-create-btn"
            onClick={handleCreateSelection}
            data-testid="create-selection-btn"
          >
            {isCreatedSelectionOpen ? '✓ Подборка создана!' : '+ Создать подборку из избранного'}
          </button>
        )}
      </div>

      {favorites.length > 0 && (
        <div className="figma-fav-controls">
          <div className="figma-fav-tabs" role="tablist" aria-label="Фильтрация сделок">
            <button
              type="button"
              className={`figma-fav-tab-btn${dealFilter === 'all' ? ' is-active' : ''}`}
              onClick={() => setDealFilter('all')}
              role="tab"
              aria-selected={dealFilter === 'all'}
            >
              Все ({favorites.length})
            </button>
            <button
              type="button"
              className={`figma-fav-tab-btn${dealFilter === 'sale' ? ' is-active' : ''}`}
              onClick={() => setDealFilter('sale')}
              role="tab"
              aria-selected={dealFilter === 'sale'}
            >
              Покупка ({favorites.filter((f) => f.dealType === 'sale').length})
            </button>
            <button
              type="button"
              className={`figma-fav-tab-btn${dealFilter === 'rent_long' ? ' is-active' : ''}`}
              onClick={() => setDealFilter('rent_long')}
              role="tab"
              aria-selected={dealFilter === 'rent_long'}
            >
              Долгосрок ({favorites.filter((f) => f.dealType === 'rent_long').length})
            </button>
          </div>

          <div className="figma-fav-search-sort">
            <input
              type="search"
              placeholder="Поиск по избранному..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="figma-fav-search-input"
              aria-label="Поиск по избранному"
            />
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as any)}
              className="figma-fav-select"
              aria-label="Сортировка"
            >
              <option value="default">По умолчанию</option>
              <option value="price_asc">Сначала дешевле</option>
              <option value="price_desc">Сначала дороже</option>
            </select>
          </div>
        </div>
      )}

      {filtered.length > 0 ? (
        <div className="figma-fav-grid" aria-label="Список избранных объектов">
          {filtered.map((item) => (
            <article key={item.id} className="figma-fav-card">
              <div className="figma-fav-card__media">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.title} />
                ) : (
                  <BuildingPlaceholder />
                )}
                <button
                  type="button"
                  className="figma-fav-card__like-btn"
                  onClick={() => handleRemove(item.id)}
                  title="Удалить из избранного"
                  aria-label="Удалить из избранного"
                >
                  ♥
                </button>
              </div>

              <div className="figma-fav-card__body">
                <div className="figma-fav-card__price-row">
                  <span className="figma-fav-card__price">{item.price}</span>
                  {item.pricePerSqm && (
                    <span className="figma-fav-card__price-sqm">{item.pricePerSqm}</span>
                  )}
                </div>

                <h2 className="figma-fav-card__title">{item.title}</h2>
                <p className="figma-fav-card__address">
                  📍 {item.city}, {item.address}
                </p>

                <div className="figma-fav-card__specs">
                  <span>🛏 {item.rooms} комн.</span>
                  <span>📐 {item.area} м²</span>
                  <span>🏢 {item.floor} этаж</span>
                </div>

                <div className="figma-fav-card__actions">
                  <Link
                    to={`/listings/${item.slug}`}
                    className="figma-fav-card-btn figma-fav-card-btn--primary"
                  >
                    Смотреть
                  </Link>
                  <button
                    type="button"
                    className="figma-fav-card-btn"
                    onClick={() => handleRemove(item.id)}
                  >
                    Удалить
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="figma-fav-empty">
          <div className="figma-fav-empty__icon">♥</div>
          <h2 className="figma-fav-empty__title">В избранном пока ничего нет</h2>
          <p className="figma-fav-empty__desc">
            Сохраняйте понравившиеся квартиры, апартаменты и дома, чтобы вернуться к ним позже или создать подборку для клиента.
          </p>
          <Link to="/" className="figma-fav-create-btn">
            Перейти в каталог
          </Link>
        </div>
      )}
    </div>
  )
}
