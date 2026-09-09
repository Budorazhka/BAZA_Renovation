import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useSeoMetadata } from '../hooks/useSeoMetadata'
import { BuildingPlaceholder } from '../components/DevelopmentCard'

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

const INITIAL_COLLECTIONS: CollectionItem[] = [
  {
    id: 'col-1',
    title: 'Подборка для инвестора (Батуми у моря)',
    slug: 'batumi-investor-sea',
    createdAt: '02 сентября 2026',
    clientName: 'Михаил',
    properties: [
      {
        id: 'p1',
        title: '2-комн. апартаменты с панорамным видом на море',
        price: '$85 000',
        city: 'Батуми',
        address: 'ул. Шерифа Химшиашвили, 15',
        area: 65,
        rooms: 2,
        slug: 'batumi-flat-sea-view',
      },
      {
        id: 'p2',
        title: 'Студия под ключ в Orbi City',
        price: '$48 000',
        city: 'Батуми',
        address: 'ул. Пиросмани, 8',
        area: 33,
        rooms: 1,
        slug: 'batumi-studio-orbi',
      },
    ],
  },
  {
    id: 'col-2',
    title: 'Семья в Ваке (Тбилиси долгосрок)',
    slug: 'tbilisi-vake-family',
    createdAt: '28 августа 2026',
    clientName: 'Анна',
    properties: [
      {
        id: 'p3',
        title: 'Просторная 3-комнатная квартира в Ваке',
        price: '$1 200 / мес',
        city: 'Тбилиси',
        address: 'просп. Чавчавадзе, 42',
        area: 110,
        rooms: 3,
        slug: 'tbilisi-vake-3room',
      },
    ],
  },
]

const STORAGE_KEY = 'baza:marketplace:selections'

function loadSavedCollections(): CollectionItem[] {
  if (typeof window === 'undefined') return INITIAL_COLLECTIONS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch {
    // Ignore storage parse error
  }
  return INITIAL_COLLECTIONS
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
  const [collections, setCollections] = useState<CollectionItem[]>(loadSavedCollections)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useSeoMetadata({
    title: 'Мои подборки объектов | BAZA',
    description: 'Управление клиентскими подборками недвижимости, создание персонализированных ссылок и витрин.',
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
      title: `Новая подборка (${collections.length + 1})`,
      slug: `selection-${Date.now()}`,
      createdAt: 'Сегодня',
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
          <h1 className="figma-fav-header__title">Мои подборки</h1>
          <span className="figma-fav-header__badge">{collections.length} подборок</span>
        </div>

        <button
          type="button"
          className="figma-fav-create-btn"
          onClick={handleCreateNewCollection}
          data-testid="new-collection-btn"
        >
          + Создать подборку
        </button>
      </div>

      {collections.length === 0 ? (
        <div className="state-panel" role="status" style={{ textAlign: 'center', padding: '48px 16px' }}>
          <p style={{ fontSize: '16px', color: 'var(--color-neutral-secondary, #555454)', marginBottom: '16px' }}>
            У вас пока нет созданных подборок объектов.
          </p>
          <button
            type="button"
            className="figma-fav-filter-btn figma-fav-filter-btn--active"
            onClick={handleCreateNewCollection}
          >
            + Создать первую подборку
          </button>
        </div>
      ) : null}

      <div className="figma-collections-list" aria-label="Список клиентских подборок">
        {collections.map((col) => (
          <div key={col.id} className="figma-collection-card">
            <div className="figma-collection-card__header">
              <div>
                <input
                  type="text"
                  value={col.title}
                  onChange={(e) => handleUpdateTitle(col.id, e.target.value)}
                  className="figma-collection-title-input"
                  aria-label="Название подборки"
                />
                <div style={{ fontSize: '13px', color: '#757575', paddingLeft: '8px' }}>
                  Создана: {col.createdAt} · {col.properties.length} объектов
                </div>
              </div>

              <div className="figma-collection-actions">
                <button
                  type="button"
                  className="figma-collection-btn figma-collection-btn--primary"
                  onClick={() => handleCopyLink(col)}
                  data-testid={`copy-link-${col.id}`}
                >
                  {copiedId === col.id ? '✓ Ссылка скопирована' : '🔗 Ссылка для клиента'}
                </button>
                <Link
                  to={`/selections/${col.slug}`}
                  className="figma-collection-btn"
                >
                  Витрина ↗
                </Link>
                <button
                  type="button"
                  className="figma-collection-btn figma-collection-btn--danger"
                  onClick={() => handleDeleteCollection(col.id)}
                  title="Удалить подборку"
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
                        <span>🛏 {p.rooms} комн.</span>
                        <span>📐 {p.area} м²</span>
                      </div>
                      <div className="figma-fav-card__actions">
                        <Link
                          to={`/listings/${p.slug}`}
                          className="figma-fav-card-btn figma-fav-card-btn--primary"
                        >
                          Смотреть
                        </Link>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '24px', color: '#757575', fontSize: '14px' }}>
                В этой подборке пока нет объектов. Добавьте объекты из каталога или избранного.
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
