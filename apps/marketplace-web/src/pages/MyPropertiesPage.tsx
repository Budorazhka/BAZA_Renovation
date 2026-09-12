import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { publishingApi, type OwnerListing, type OwnerPropertyAsset } from '../features/publishing/api/publishing-api'
import { useSeoMetadata } from '../hooks/useSeoMetadata'
import { listingPropertyTypeLabel } from '../lib/format'
import { useI18n } from '../i18n'
import type { Translate } from '../i18n'
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
  /** id объекта и объявления в API — нужны ссылке на редактирование. */
  assetId?: string
  listingId?: string
  /**
   * Счётчики просмотров, контактов и добавлений в избранное. Необязательные,
   * потому что API их не отдаёт: у приватных эндпоинтов владельца таких полей
   * нет вовсе. Раньше здесь стояли выдуманные числа, показанные как настоящие.
   */
  viewsCount?: number
  leadsCount?: number
  favoritesCount?: number
  createdAt: string
  imageUrl?: string
}


/**
 * MyPropertiesPage Component (Figma: Кабинет риелтора: Мои объекты Node ID 824:17645 / 5071:68119)
 */
/**
 * Объект и объявление из API -> строка кабинета.
 *
 * Всё, чего в API нет, остаётся пустым, а не заполняется правдоподобным: статус
 * модерации и актуальность выводятся из статуса объявления, счётчики просмотров
 * не выводятся вовсе.
 */
function toItem(asset: OwnerPropertyAsset, listing: OwnerListing, t?: Translate): MyPropertyItem {
  const price = listing.price
  const amount = Math.round(price.amountMinorUnits / 100)
  return {
    id: listing._id,
    assetId: asset._id,
    listingId: listing._id,
    // Тип объекта — человеку, а не как в API: в заголовке стояло сырое
    // `apartment`. Тот же переводчик, что на публичных страницах, чтобы кабинет
    // и каталог называли одно и то же одинаково.
    title: `${listingPropertyTypeLabel(asset.propertyType, asset.commercialSubtype, t)}, ${asset.location.address}`,
    dealType: listing.dealType,
    propertyType: asset.propertyType,
    priceFormatted: `${amount.toLocaleString('ru-RU')} ${price.currency}`,
    address: asset.location.address,
    city: asset.location.city,
    rooms: asset.characteristics.rooms ?? 0,
    area: asset.characteristics.area ?? 0,
    floor: asset.characteristics.floor ?? 0,
    totalFloors: asset.characteristics.totalFloors ?? 0,
    status: listing.status === 'archived' ? 'archived' : 'for_sale',
    actuality: listing.status === 'expired' ? 'needs_update' : 'up_to_date',
    createdAt: listing.createdAt ? new Date(listing.createdAt).toLocaleDateString('ru-RU') : '',
  }
}

export function MyPropertiesPage() {
  const { t } = useI18n()
  // Кабинет снят с фикстур 04.09.2026: раньше здесь лежал массив выдуманных
  // объектов, включая счётчики просмотров и контактов, показанные как настоящие.
  const [properties, setProperties] = useState<MyPropertyItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const assets = await publishingApi.listPropertyAssets()
        const rows = await Promise.all(
          assets.map(async (asset) => {
            const listings = await publishingApi.listListingsForAsset(asset._id)
            return listings.map((listing) => toItem(asset, listing, t))
          }),
        )
        if (!cancelled) setProperties(rows.flat())
      } catch {
        if (!cancelled) setLoadError(t('myProperties.loadError'))
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- перечитывать список при смене языка не нужно
  }, [])
  const [statusFilter, setStatusFilter] = useState<'all' | ObjectSaleStatus>('all')
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards')
  const [searchQuery, setSearchQuery] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useSeoMetadata({
    title: t('myProperties.seoTitle'),
    description: t('myProperties.seoDescription'),
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
  const totalViews = properties.reduce((acc, p) => acc + (p.viewsCount ?? 0), 0)

  return (
    <div className="figma-account-page">
      {/* Top Header */}
      <div className="figma-account-header">
        <div>
          <h1 className="figma-account-header__title">{t('myProperties.title')}</h1>
          <p className="figma-account-header__desc">{t('myProperties.subtitle')}</p>
        </div>
        <Link to="/publish" className="figma-account-add-btn" data-testid="account-add-property-cta">
          {t('myProperties.add')}
        </Link>
      </div>

      {/* Metrics Ribbon */}
      <div className="figma-account-metrics-bar" aria-label={t('myProperties.metricsAria')}>
        <div className="figma-account-metric-card">
          <span className="figma-account-metric-card__value">{properties.length}</span>
          <span className="figma-account-metric-card__label">{t('myProperties.metricTotal')}</span>
        </div>
        <div className="figma-account-metric-card">
          <span className="figma-account-metric-card__value" style={{ color: '#1BA800' }}>
            {countForSale}
          </span>
          <span className="figma-account-metric-card__label">{t('myProperties.metricForSale')}</span>
        </div>
        <div className="figma-account-metric-card">
          <span className="figma-account-metric-card__value" style={{ color: '#0288D1' }}>
            {countModeration}
          </span>
          <span className="figma-account-metric-card__label">{t('myProperties.metricModeration')}</span>
        </div>
        <div className="figma-account-metric-card">
          <span className="figma-account-metric-card__value">{totalViews.toLocaleString('ru-RU')}</span>
          <span className="figma-account-metric-card__label">{t('myProperties.metricViews')}</span>
        </div>
      </div>

      {/* Control Bar (Status tabs + View Mode + Search) */}
      <div className="figma-account-controls">
        <div className="figma-account-status-tabs" role="tablist" aria-label={t('myProperties.statusFilterAria')}>
          <button
            type="button"
            className={`figma-account-tab-btn${statusFilter === 'all' ? ' is-active' : ''}`}
            onClick={() => setStatusFilter('all')}
            role="tab"
            aria-selected={statusFilter === 'all'}
          >
            {t('myProperties.tabAll', { count: properties.length })}
          </button>
          <button
            type="button"
            className={`figma-account-tab-btn${statusFilter === 'for_sale' ? ' is-active' : ''}`}
            onClick={() => setStatusFilter('for_sale')}
            role="tab"
            aria-selected={statusFilter === 'for_sale'}
          >
            {t('myProperties.tabForSale', { count: countForSale })}
          </button>
          <button
            type="button"
            className={`figma-account-tab-btn${statusFilter === 'moderation' ? ' is-active' : ''}`}
            onClick={() => setStatusFilter('moderation')}
            role="tab"
            aria-selected={statusFilter === 'moderation'}
          >
            {t('myProperties.tabModeration', { count: countModeration })}
          </button>
          <button
            type="button"
            className={`figma-account-tab-btn${statusFilter === 'booked' ? ' is-active' : ''}`}
            onClick={() => setStatusFilter('booked')}
            role="tab"
            aria-selected={statusFilter === 'booked'}
          >
            {t('myProperties.tabBooked', { count: countBooked })}
          </button>
          <button
            type="button"
            className={`figma-account-tab-btn${statusFilter === 'archived' ? ' is-active' : ''}`}
            onClick={() => setStatusFilter('archived')}
            role="tab"
            aria-selected={statusFilter === 'archived'}
          >
            {t('myProperties.tabArchived', { count: countArchived })}
          </button>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <input
            type="search"
            placeholder={t('myProperties.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label={t('myProperties.searchAria')}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid #EAEAEA',
              fontSize: '13px',
              outline: 'none',
              minWidth: '220px',
            }}
          />

          <div className="figma-account-view-toggles" role="radiogroup" aria-label={t('myProperties.viewModeAria')}>
            <button
              type="button"
              className={`figma-account-view-btn${viewMode === 'cards' ? ' is-active' : ''}`}
              onClick={() => setViewMode('cards')}
              aria-label={t('myProperties.viewCardsAria')}
            >
              {t('myProperties.viewCards')}
            </button>
            <button
              type="button"
              className={`figma-account-view-btn${viewMode === 'table' ? ' is-active' : ''}`}
              onClick={() => setViewMode('table')}
              aria-label={t('myProperties.viewTableAria')}
            >
              {t('myProperties.viewTable')}
            </button>
          </div>
        </div>
      </div>

      {/* Content Rendering: Big Cards or Table */}
      {viewMode === 'cards' ? (
        <div className="figma-account-big-cards" aria-label={t('myProperties.listAria')}>
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
                  📍 {item.city}, {item.address}
                  {[
                    item.propertyType !== 'land' && item.rooms ? t('card.rooms', { count: item.rooms }) : null,
                    item.area ? t('card.area', { area: item.area }) : null,
                    item.propertyType !== 'land' && item.floor
                      ? item.totalFloors
                        ? t('card.floorOfTotal', { floor: item.floor, total: item.totalFloors })
                        : t('card.floor', { floor: item.floor })
                      : null,
                  ]
                    .filter(Boolean)
                    .map((chip) => ` · ${chip}`)
                    .join('')}
                </p>

                {/* Statistics row */}
                {/*
                  Статистика показывается, только если она пришла. API её пока
                  не отдаёт, поэтому блок обычно скрыт — это честнее, чем
                  нарисовать нули или выдуманные числа.
                */}
                {item.viewsCount !== undefined && (
                  <div className="figma-account-card-stats-row">
                    <div className="figma-account-stat-item">
                      <span>👁</span>
                      <span><strong>{item.viewsCount}</strong> {t('myProperties.statViewsSuffix')}</span>
                    </div>
                    <div className="figma-account-stat-item">
                      <span>📞</span>
                      <span><strong>{item.leadsCount}</strong> {t('myProperties.statLeadsSuffix')}</span>
                    </div>
                    <div className="figma-account-stat-item">
                      <span>♥</span>
                      <span><strong>{item.favoritesCount}</strong> {t('myProperties.statFavoritesSuffix')}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons (Figma 5071:68795) */}
              <div className="figma-account-card-actions">
                <Link
                  to={item.slug ? `/listings/${item.slug}` : '#'}
                  className="figma-account-action-btn figma-account-action-btn--primary"
                >
                  {t('myProperties.viewOnSite')}
                </Link>
                {/*
                  Правка ведёт на реальные id объекта и объявления. Раньше
                  кабинет работал на выдуманных данных, и такой ссылке некуда
                  было бы вести.
                */}
                {item.assetId && item.listingId && (
                  <Link
                    to={`/account/properties/${item.assetId}/listings/${item.listingId}/edit`}
                    className="figma-account-action-btn"
                  >
                    {t('myProperties.edit')}
                  </Link>
                )}
                <button
                  type="button"
                  className="figma-account-action-btn"
                  onClick={() => handleCopyLink(item)}
                >
                  {copiedId === item.id ? t('myProperties.copied') : t('myProperties.share')}
                </button>
                <button
                  type="button"
                  className="figma-account-action-btn"
                  onClick={() => handleToggleStatus(item.id)}
                >
                  {item.status === 'for_sale' ? t('myProperties.unpublish') : t('myProperties.publish')}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="figma-account-table-wrapper">
          <table className="figma-account-table" aria-label={t('myProperties.tableAria')}>
            <thead>
              <tr>
                <th>{t('myProperties.colObject')}</th>
                <th>{t('myProperties.colLocation')}</th>
                <th>{t('myProperties.colPrice')}</th>
                <th>{t('myProperties.colStatus')}</th>
                <th>{t('myProperties.colActuality')}</th>
                <th>{t('myProperties.colViews')}</th>
                <th>{t('myProperties.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredProperties.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong style={{ display: 'block' }}>{item.title}</strong>
                    <span style={{ fontSize: '12px', color: '#757575' }}>
                      {[
                        item.propertyType !== 'land' && item.rooms ? t('card.rooms', { count: item.rooms }) : null,
                        item.area ? t('card.area', { area: item.area }) : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
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
                  <td>{item.viewsCount ?? '—'}</td>
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
                        title={item.status === 'for_sale' ? t('myProperties.unpublishShort') : t('myProperties.publish')}
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
