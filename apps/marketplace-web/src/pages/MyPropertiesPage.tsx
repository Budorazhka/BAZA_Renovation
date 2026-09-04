import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useSeoMetadata } from '../hooks/useSeoMetadata'
import {
  SaleStatusBadge,
  ActualityBadge,
  type ObjectSaleStatus,
  type ObjectActualityState,
} from '../components/StatusBadge'
import { BuildingPlaceholder } from '../components/DevelopmentCard'

export interface MyPropertyItem {
  id: string
  slug?: string
  title: string
  dealType: 'sale' | 'rent_long' | 'rent_short'
  propertyType: string
  priceFormatted: string
  address: string
  city: string
  rooms: number
  area: number
  floor: number
  totalFloors: number
  status: ObjectSaleStatus
  actuality: ObjectActualityState
  viewsCount: number
  leadsCount: number
  favoritesCount: number
  createdAt: string
  imageUrl?: string
}

const INITIAL_PROPERTIES: MyPropertyItem[] = [
  {
    id: 'prop-1',
    slug: 'batumi-flat-sea-view',
    title: '2-комн. апартаменты с панорамным видом на море',
    dealType: 'sale',
    propertyType: 'Квартира',
    priceFormatted: '$85 000',
    address: 'ул. Шерифа Химшиашвили, 15',
    city: 'Батуми',
    rooms: 2,
    area: 65,
    floor: 12,
    totalFloors: 24,
    status: 'for_sale',
    actuality: 'up_to_date',
    viewsCount: 1420,
    leadsCount: 18,
    favoritesCount: 34,
    createdAt: '12 августа 2026',
  },
  {
    id: 'prop-2',
    slug: 'batumi-studio-orbi',
    title: 'Студия под ключ в Orbi City',
    dealType: 'sale',
    propertyType: 'Апартаменты',
    priceFormatted: '$48 000',
    address: 'ул. Пиросмани, 8',
    city: 'Батуми',
    rooms: 1,
    area: 33,
    floor: 18,
    totalFloors: 45,
    status: 'moderation',
    actuality: 'needs_attention',
    viewsCount: 380,
    leadsCount: 4,
    favoritesCount: 12,
    createdAt: '01 сентября 2026',
  },
  {
    id: 'prop-3',
    slug: 'tbilisi-vake-3room',
    title: 'Просторная 3-комнатная квартира в Ваке',
    dealType: 'rent_long',
    propertyType: 'Квартира',
    priceFormatted: '$1 200 / мес',
    address: 'просп. Чавчавадзе, 42',
    city: 'Тбилиси',
    rooms: 3,
    area: 110,
    floor: 5,
    totalFloors: 9,
    status: 'for_sale',
    actuality: 'up_to_date',
    viewsCount: 2150,
    leadsCount: 29,
    favoritesCount: 45,
    createdAt: '20 июля 2026',
  },
  {
    id: 'prop-4',
    slug: 'batumi-old-town-house',
    title: 'Таунхаус в историческом центре',
    dealType: 'sale',
    propertyType: 'Дом',
    priceFormatted: '$220 000',
    address: 'ул. Мазнева, 4',
    city: 'Батуми',
    rooms: 4,
    area: 160,
    floor: 1,
    totalFloors: 3,
    status: 'booked',
    actuality: 'up_to_date',
    viewsCount: 940,
    leadsCount: 12,
    favoritesCount: 19,
    createdAt: '05 июня 2026',
  },
  {
    id: 'prop-5',
    slug: 'commercial-batumi-port',
    title: 'Коммерческое помещение свободного назначения',
    dealType: 'sale',
    propertyType: 'Коммерция',
    priceFormatted: '$175 000',
    address: 'ул. Гогебашвили, 18',
    city: 'Батуми',
    rooms: 2,
    area: 85,
    floor: 1,
    totalFloors: 5,
    status: 'archived',
    actuality: 'needs_update',
    viewsCount: 610,
    leadsCount: 7,
    favoritesCount: 8,
    createdAt: '15 мая 2026',
  },
]

/**
 * MyPropertiesPage Component (Figma: Кабинет риелтора: Мои объекты Node ID 824:17645 / 5071:68119)
 */
export function MyPropertiesPage() {
  const [properties, setProperties] = useState<MyPropertyItem[]>(INITIAL_PROPERTIES)
  const [statusFilter, setStatusFilter] = useState<'all' | ObjectSaleStatus>('all')
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards')
  const [searchQuery, setSearchQuery] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useSeoMetadata({
    title: 'Кабинет риелтора — Мои объекты | BAZA',
    description: 'Управление объектами недвижимости, модерация, статистика просмотров и подтверждение актуальности.',
  })

  // Handlers
  const handleConfirmActuality = (id: string) => {
    setProperties((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, actuality: 'up_to_date' as ObjectActualityState }
          : item
      )
    )
  }

  const handleToggleStatus = (id: string) => {
    setProperties((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const nextStatus: ObjectSaleStatus =
            item.status === 'for_sale' ? 'archived' : 'for_sale'
          return { ...item, status: nextStatus }
        }
        return item
      })
    )
  }

  const handleCopyLink = (item: MyPropertyItem) => {
    const url = item.slug
      ? `${window.location.origin}/listings/${item.slug}`
      : window.location.href
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        setCopiedId(item.id)
        setTimeout(() => setCopiedId(null), 2000)
      })
    }
  }

  // Filter logic
  const filteredProperties = properties.filter((item) => {
    if (statusFilter !== 'all' && item.status !== statusFilter) return false
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

  // Counts
  const countForSale = properties.filter((p) => p.status === 'for_sale').length
  const countModeration = properties.filter((p) => p.status === 'moderation').length
  const countBooked = properties.filter((p) => p.status === 'booked').length
  const countArchived = properties.filter((p) => p.status === 'archived').length
  const totalViews = properties.reduce((acc, p) => acc + p.viewsCount, 0)

  return (
    <div className="figma-account-page">
      {/* Top Header */}
      <div className="figma-account-header">
        <div>
          <h1 className="figma-account-header__title">Мои объекты</h1>
          <p className="figma-account-header__desc">
            Управление опубликованными объектами, аналитика просмотров и контроль актуальности базы.
          </p>
        </div>
        <Link to="/publish" className="figma-account-add-btn" data-testid="account-add-property-cta">
          + Добавить объект
        </Link>
      </div>

      {/* Metrics Ribbon */}
      <div className="figma-account-metrics-bar" aria-label="Сводная статистика объектов">
        <div className="figma-account-metric-card">
          <span className="figma-account-metric-card__value">{properties.length}</span>
          <span className="figma-account-metric-card__label">Всего объектов</span>
        </div>
        <div className="figma-account-metric-card">
          <span className="figma-account-metric-card__value" style={{ color: '#1BA800' }}>
            {countForSale}
          </span>
          <span className="figma-account-metric-card__label">В активной продаже</span>
        </div>
        <div className="figma-account-metric-card">
          <span className="figma-account-metric-card__value" style={{ color: '#0288D1' }}>
            {countModeration}
          </span>
          <span className="figma-account-metric-card__label">На модерации</span>
        </div>
        <div className="figma-account-metric-card">
          <span className="figma-account-metric-card__value">{totalViews.toLocaleString('ru-RU')}</span>
          <span className="figma-account-metric-card__label">Просмотров объявлений</span>
        </div>
      </div>

      {/* Control Bar (Status tabs + View Mode + Search) */}
      <div className="figma-account-controls">
        <div className="figma-account-status-tabs" role="tablist" aria-label="Фильтрация по статусу">
          <button
            type="button"
            className={`figma-account-tab-btn${statusFilter === 'all' ? ' is-active' : ''}`}
            onClick={() => setStatusFilter('all')}
            role="tab"
            aria-selected={statusFilter === 'all'}
          >
            Все ({properties.length})
          </button>
          <button
            type="button"
            className={`figma-account-tab-btn${statusFilter === 'for_sale' ? ' is-active' : ''}`}
            onClick={() => setStatusFilter('for_sale')}
            role="tab"
            aria-selected={statusFilter === 'for_sale'}
          >
            В продаже ({countForSale})
          </button>
          <button
            type="button"
            className={`figma-account-tab-btn${statusFilter === 'moderation' ? ' is-active' : ''}`}
            onClick={() => setStatusFilter('moderation')}
            role="tab"
            aria-selected={statusFilter === 'moderation'}
          >
            На модерации ({countModeration})
          </button>
          <button
            type="button"
            className={`figma-account-tab-btn${statusFilter === 'booked' ? ' is-active' : ''}`}
            onClick={() => setStatusFilter('booked')}
            role="tab"
            aria-selected={statusFilter === 'booked'}
          >
            Бронь ({countBooked})
          </button>
          <button
            type="button"
            className={`figma-account-tab-btn${statusFilter === 'archived' ? ' is-active' : ''}`}
            onClick={() => setStatusFilter('archived')}
            role="tab"
            aria-selected={statusFilter === 'archived'}
          >
            Архив ({countArchived})
          </button>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <input
            type="search"
            placeholder="Поиск по адресу или названию..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Поиск по моим объектам"
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid #EAEAEA',
              fontSize: '13px',
              outline: 'none',
              minWidth: '220px',
            }}
          />

          <div className="figma-account-view-toggles" role="radiogroup" aria-label="Вид отображения">
            <button
              type="button"
              className={`figma-account-view-btn${viewMode === 'cards' ? ' is-active' : ''}`}
              onClick={() => setViewMode('cards')}
              aria-label="Отображение карточками"
            >
              Карточки
            </button>
            <button
              type="button"
              className={`figma-account-view-btn${viewMode === 'table' ? ' is-active' : ''}`}
              onClick={() => setViewMode('table')}
              aria-label="Отображение таблицей"
            >
              Таблица
            </button>
          </div>
        </div>
      </div>

      {/* Content Rendering: Big Cards or Table */}
      {viewMode === 'cards' ? (
        <div className="figma-account-big-cards" aria-label="Список объектов">
          {filteredProperties.map((item) => (
            <article key={item.id} className="figma-account-big-card">
              {/* Media preview */}
              <div className="figma-account-card-media">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.title} />
                ) : (
                  <BuildingPlaceholder />
                )}
              </div>

              {/* Info details */}
              <div className="figma-account-card-details">
                <div className="figma-account-card-header-row">
                  <SaleStatusBadge status={item.status} />
                  <ActualityBadge
                    state={item.actuality}
                    onConfirm={() => handleConfirmActuality(item.id)}
                  />
                  <span style={{ fontSize: '12px', color: '#757575' }}>{item.createdAt}</span>
                </div>

                <h2 className="figma-account-card-title">{item.title}</h2>
                <div className="figma-account-card-price">{item.priceFormatted}</div>
                <p className="figma-account-card-address">
                  📍 {item.city}, {item.address} · {item.rooms} комн. · {item.area} м² · {item.floor}/{item.totalFloors} эт.
                </p>

                {/* Statistics row */}
                <div className="figma-account-card-stats-row">
                  <div className="figma-account-stat-item">
                    <span>👁</span>
                    <span><strong>{item.viewsCount}</strong> просмотров</span>
                  </div>
                  <div className="figma-account-stat-item">
                    <span>📞</span>
                    <span><strong>{item.leadsCount}</strong> контактов</span>
                  </div>
                  <div className="figma-account-stat-item">
                    <span>♥</span>
                    <span><strong>{item.favoritesCount}</strong> в избранном</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons (Figma 5071:68795) */}
              <div className="figma-account-card-actions">
                <Link
                  to={item.slug ? `/listings/${item.slug}` : '#'}
                  className="figma-account-action-btn figma-account-action-btn--primary"
                >
                  Смотреть на сайте ↗
                </Link>
                <button
                  type="button"
                  className="figma-account-action-btn"
                  onClick={() => handleCopyLink(item)}
                >
                  {copiedId === item.id ? '✓ Скопировано' : 'Поделиться 🔗'}
                </button>
                <button
                  type="button"
                  className="figma-account-action-btn"
                  onClick={() => handleToggleStatus(item.id)}
                >
                  {item.status === 'for_sale' ? 'Снять с продажи ⏸' : 'Опубликовать ▶'}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="figma-account-table-wrapper">
          <table className="figma-account-table" aria-label="Таблица моих объектов">
            <thead>
              <tr>
                <th>Объект</th>
                <th>Локация</th>
                <th>Цена</th>
                <th>Статус</th>
                <th>Актуальность</th>
                <th>Просмотры</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {filteredProperties.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong style={{ display: 'block' }}>{item.title}</strong>
                    <span style={{ fontSize: '12px', color: '#757575' }}>
                      {item.rooms} комн. · {item.area} м²
                    </span>
                  </td>
                  <td>{item.city}, {item.address}</td>
                  <td><strong style={{ color: '#1BA800' }}>{item.priceFormatted}</strong></td>
                  <td><SaleStatusBadge status={item.status} /></td>
                  <td>
                    <ActualityBadge
                      state={item.actuality}
                      onConfirm={() => handleConfirmActuality(item.id)}
                    />
                  </td>
                  <td>{item.viewsCount}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <Link
                        to={item.slug ? `/listings/${item.slug}` : '#'}
                        className="figma-account-action-btn"
                        style={{ padding: '4px 8px', fontSize: '12px' }}
                      >
                        ↗
                      </Link>
                      <button
                        type="button"
                        className="figma-account-action-btn"
                        style={{ padding: '4px 8px', fontSize: '12px' }}
                        onClick={() => handleToggleStatus(item.id)}
                        title={item.status === 'for_sale' ? 'Снять' : 'Опубликовать'}
                      >
                        {item.status === 'for_sale' ? '⏸' : '▶'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
