import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useSeoMetadata } from '../hooks/useSeoMetadata'
import { BuildingPlaceholder } from '../components/DevelopmentCard'
import { useI18n } from '../i18n'

export interface CollectionItem {
  id: string
  title: string
  slug: string
  createdAt: string
  clientName?: string
  properties: {
    id: string
    title: string
    price: string
    city: string
    address: string
    area: number
    rooms: number
    slug: string
  }[]
}

// Backend для личных подборок покупателя на маркетплейсе не существует
// (проверено 10.09.2026): apps/api/src/modules/selections/selections.controller.ts
// — это CRM-подборки агента для клиента (organization-scoped, требует
// tenant-сессию сотрудника агентства), а не что-то, к чему может обратиться
// анонимный/самостоятельный покупатель на marketplace-web. Публичный
// эндпоинт (public-selections.controller.ts) — только чтение готовой
// подборки по токену, без создания своих подборок покупателем. Поэтому
// страница не подключена ни к какому API и не подсовывает захардкоженные
// подборки ("$85 000", "Orbi City" и т.п.) как настоящие — подборки живут
// только локально (localStorage), список по умолчанию честно пуст.
const STORAGE_KEY = 'baza:marketplace:selections'

function loadSavedCollections(): CollectionItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch {
    // Ignore storage parse error
  }
  return []
}

function saveCollections(items: CollectionItem[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    // Ignore storage write error
  }
}

export function SelectionsPage() {
  const { t } = useI18n()
  const [collections, setCollections] = useState<CollectionItem[]>(loadSavedCollections)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useSeoMetadata({
    title: t('selections.seoTitle'),
    description: t('selections.seoDescription'),
  })

  const updateCollections = (updater: (prev: CollectionItem[]) => CollectionItem[]) => {
    setCollections((prev) => {
      const next = updater(prev)
      saveCollections(next)
      return next
    })
  }

  const handleCreateNewCollection = () => {
    const newCol: CollectionItem = {
      id: `col-${Date.now()}`,
      title: t('selections.newTitle', { count: collections.length + 1 }),
      slug: `selection-${Date.now()}`,
      createdAt: t('realtorProfile.today'),
      properties: [],
    }
    updateCollections((prev) => [newCol, ...prev])
  }

  const handleUpdateTitle = (id: string, nextTitle: string) => {
    updateCollections((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title: nextTitle } : c)),
    )
  }

  const handleDeleteCollection = (id: string) => {
    updateCollections((prev) => prev.filter((c) => c.id !== id))
  }

  const handleCopyLink = (col: CollectionItem) => {
    const url = `${window.location.origin}/selections/${col.slug}`
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        setCopiedId(col.id)
        setTimeout(() => setCopiedId(null), 2000)
      })
    }
  }

  return (
    <div className="figma-fav-page">
      <div className="figma-fav-header">
        <div className="figma-fav-header__title-group">
          <h1 className="figma-fav-header__title">{t('selections.title')}</h1>
          <span className="figma-fav-header__badge">{t('selections.countBadge', { count: collections.length })}</span>
        </div>

        <button
          type="button"
          className="figma-fav-create-btn"
          onClick={handleCreateNewCollection}
          data-testid="new-collection-btn"
        >
          {t('selections.create')}
        </button>
      </div>

      {collections.length === 0 ? (
        <div className="state-panel" role="status" style={{ textAlign: 'center', padding: '48px 16px' }}>
          <p style={{ fontSize: '16px', color: 'var(--color-neutral-secondary, #555454)', marginBottom: '16px' }}>
            {t('selections.emptyText')}
          </p>
          <button
            type="button"
            className="figma-fav-filter-btn figma-fav-filter-btn--active"
            onClick={handleCreateNewCollection}
          >
            {t('selections.createFirst')}
          </button>
        </div>
      ) : null}

      <div className="figma-collections-list" aria-label={t('selections.listAria')}>
        {collections.map((col) => (
          <div key={col.id} className="figma-collection-card">
            <div className="figma-collection-card__header">
              <div>
                <input
                  type="text"
                  value={col.title}
                  onChange={(e) => handleUpdateTitle(col.id, e.target.value)}
                  className="figma-collection-title-input"
                  aria-label={t('selections.titleInputAria')}
                />
                <div style={{ fontSize: '13px', color: '#757575', paddingLeft: '8px' }}>
                  {t('selections.createdAt', { date: col.createdAt, count: col.properties.length })}
                </div>
              </div>

              <div className="figma-collection-actions">
                <button
                  type="button"
                  className="figma-collection-btn figma-collection-btn--primary"
                  onClick={() => handleCopyLink(col)}
                  data-testid={`copy-link-${col.id}`}
                >
                  {copiedId === col.id ? t('selections.linkCopied') : t('selections.clientLink')}
                </button>
                <Link
                  to={`/selections/${col.slug}`}
                  className="figma-collection-btn"
                >
                  {t('selections.showcase')}
                </Link>
                <button
                  type="button"
                  className="figma-collection-btn figma-collection-btn--danger"
                  onClick={() => handleDeleteCollection(col.id)}
                  title={t('selections.delete')}
                >
                  ✕
                </button>
              </div>
            </div>

            {col.properties.length > 0 ? (
              <div className="figma-fav-grid">
                {col.properties.map((p) => (
                  <article key={p.id} className="figma-fav-card">
                    <div className="figma-fav-card__media">
                      <BuildingPlaceholder />
                    </div>
                    <div className="figma-fav-card__body">
                      <div className="figma-fav-card__price">{p.price}</div>
                      <h2 className="figma-fav-card__title">{p.title}</h2>
                      <p className="figma-fav-card__address">
                        📍 {p.city}, {p.address}
                      </p>
                      <div className="figma-fav-card__specs">
                        <span>🛏 {t('card.rooms', { count: p.rooms })}</span>
                        <span>📐 {t('card.area', { area: p.area })}</span>
                      </div>
                      <div className="figma-fav-card__actions">
                        <Link
                          to={`/listings/${p.slug}`}
                          className="figma-fav-card-btn figma-fav-card-btn--primary"
                        >
                          {t('favorites.view')}
                        </Link>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '24px', color: '#757575', fontSize: '14px' }}>
                {t('selections.emptyCollection')}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
