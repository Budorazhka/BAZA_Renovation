import { useState } from 'react'
import { useSeoMetadata } from '../hooks/useSeoMetadata'

export interface ClientRequestItem {
  id: string
  authorName: string
  avatarInitials: string
  dealType: 'buy' | 'rent'
  propertyType: string
  city: string
  budget: string
  title: string
  tags: string[]
  comment: string
  createdAt: string
}

const INITIAL_REQUESTS: ClientRequestItem[] = [
  {
    id: 'req-1',
    authorName: 'Константин М.',
    avatarInitials: 'КМ',
    dealType: 'buy',
    propertyType: 'Квартира',
    city: 'Батуми',
    budget: 'до $90 000',
    title: 'Куплю 2-комнатную квартиру у моря с ремонтом',
    tags: ['Вторичка или новостройка', 'от 50 м²', 'Вид на море', 'Готовы к сделке'],
    comment: 'Ищем квартиру для семьи в районе Нового бульвара или Химшиашвили. Желательно с мебелью и техникой, не выше 20 этажа.',
    createdAt: 'Сегодня в 14:20',
  },
  {
    id: 'req-2',
    authorName: 'Татьяна В.',
    avatarInitials: 'ТВ',
    dealType: 'buy',
    propertyType: 'Апартаменты',
    budget: 'до $55 000',
    city: 'Батуми',
    title: 'Инвестиционная студия в Orbi или Horizon',
    tags: ['Студия / 1-комн.', 'до 500м до моря', 'Высокий арендный потенциал'],
    comment: 'Рассматриваю ликвидные варианты под посуточную сдачу. Оплата 100% сразу без ипотеки.',
    createdAt: 'Вчера',
  },
  {
    id: 'req-3',
    authorName: 'Алексей Д.',
    avatarInitials: 'АД',
    dealType: 'rent',
    propertyType: 'Квартира',
    city: 'Тбилиси',
    budget: 'до $1 500 / мес',
    title: 'Аренда 3-комнатной квартиры в Ваке или Сабуртало',
    tags: ['Долгосрок от 1 года', 'от 90 м²', 'Паркинг', 'Можно с котом'],
    comment: 'Семья с ребенком. Нужен тихий район, свежий ремонт, посудомоечная машина и закрепленное паркоместо.',
    createdAt: '02 сентября 2026',
  },
]

export function RequestsPage() {
  const [requests] = useState<ClientRequestItem[]>(INITIAL_REQUESTS)
  const [dealFilter, setDealFilter] = useState<'all' | 'buy' | 'rent'>('all')
  const [cityFilter, setCityFilter] = useState<'all' | 'Батуми' | 'Тбилиси'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [isOfferModalOpen, setIsOfferModalOpen] = useState(false)
  const [activeReqId, setActiveReqId] = useState<string | null>(null)
  const [offerSuccess, setOfferSuccess] = useState(false)

  useSeoMetadata({
    title: 'Запросы покупателей и арендаторов | BAZA',
    description: 'Доска актуальных заявок на покупку и аренду недвижимости. Предложите свой объект напрямую клиенту.',
  })

  const handleOpenOffer = (id: string) => {
    setActiveReqId(id)
    setIsOfferModalOpen(true)
    setOfferSuccess(false)
  }

  const handleSendOffer = (e: React.FormEvent) => {
    e.preventDefault()
    setOfferSuccess(true)
    setTimeout(() => {
      setIsOfferModalOpen(false)
      setOfferSuccess(false)
      setActiveReqId(null)
    }, 2000)
  }

  const filtered = requests.filter((r) => {
    if (dealFilter !== 'all' && r.dealType !== dealFilter) return false
    if (cityFilter !== 'all' && r.city !== cityFilter) return false
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      return (
        r.title.toLowerCase().includes(q) ||
        r.comment.toLowerCase().includes(q) ||
        r.authorName.toLowerCase().includes(q)
      )
    }
    return true
  })

  return (
    <div className="figma-requests-page">
      <div className="figma-requests-header">
        <div>
          <h1 className="figma-requests-header__title">Запросы клиентов</h1>
          <p className="figma-requests-header__desc">
            Актуальные заявки от проверенных покупателей и арендаторов. Предложите подходящий объект.
          </p>
        </div>

        <button
          type="button"
          className="figma-requests-add-btn"
          onClick={() => alert('Форма добавления заявки')}
          data-testid="add-request-btn"
        >
          + Оставить запрос
        </button>
      </div>

      <div className="figma-requests-layout">
        <aside className="figma-requests-filters" aria-label="Фильтры запросов">
          <div className="figma-requests-filter-group">
            <div className="figma-requests-filter-title">Тип сделки</div>
            <div className="figma-requests-chips" role="radiogroup">
              <button
                type="button"
                className={`figma-requests-chip${dealFilter === 'all' ? ' is-active' : ''}`}
                onClick={() => setDealFilter('all')}
              >
                Все
              </button>
              <button
                type="button"
                className={`figma-requests-chip${dealFilter === 'buy' ? ' is-active' : ''}`}
                onClick={() => setDealFilter('buy')}
              >
                Покупка
              </button>
              <button
                type="button"
                className={`figma-requests-chip${dealFilter === 'rent' ? ' is-active' : ''}`}
                onClick={() => setDealFilter('rent')}
              >
                Аренда
              </button>
            </div>
          </div>

          <div className="figma-requests-filter-group">
            <div className="figma-requests-filter-title">Город</div>
            <div className="figma-requests-chips">
              <button
                type="button"
                className={`figma-requests-chip${cityFilter === 'all' ? ' is-active' : ''}`}
                onClick={() => setCityFilter('all')}
              >
                Все города
              </button>
              <button
                type="button"
                className={`figma-requests-chip${cityFilter === 'Батуми' ? ' is-active' : ''}`}
                onClick={() => setCityFilter('Батуми')}
              >
                Батуми
              </button>
              <button
                type="button"
                className={`figma-requests-chip${cityFilter === 'Тбилиси' ? ' is-active' : ''}`}
                onClick={() => setCityFilter('Тбилиси')}
              >
                Тбилиси
              </button>
            </div>
          </div>

          <div className="figma-requests-filter-group">
            <div className="figma-requests-filter-title">Поиск по тексту</div>
            <input
              type="search"
              placeholder="Ключевые слова..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="figma-requests-input"
              aria-label="Поиск по запросам"
            />
          </div>
        </aside>

        <section className="figma-requests-list" aria-label="Список запросов клиентов">
          {filtered.map((req) => (
            <article key={req.id} className="figma-request-card">
              <div className="figma-request-card__header">
                <div className="figma-request-author">
                  <div className="figma-request-avatar">{req.avatarInitials}</div>
                  <div>
                    <div className="figma-request-author-name">{req.authorName}</div>
                    <div className="figma-request-date">📍 {req.city} · {req.createdAt}</div>
                  </div>
                </div>

                <div className="figma-request-budget">{req.budget}</div>
              </div>

              <h2 className="figma-request-card__title">{req.title}</h2>

              <div className="figma-request-tags">
                {req.tags.map((tag, idx) => (
                  <span key={idx} className="figma-request-tag">
                    {tag}
                  </span>
                ))}
              </div>

              <p className="figma-request-card__comment">{req.comment}</p>

              <div className="figma-request-card__actions">
                <button
                  type="button"
                  className="figma-request-action-btn figma-request-action-btn--primary"
                  onClick={() => handleOpenOffer(req.id)}
                  data-testid={`offer-btn-${req.id}`}
                >
                  Предложить объект ➔
                </button>
                <a
                  href="tel:+995599000000"
                  className="figma-request-action-btn"
                >
                  Связаться 📞
                </a>
              </div>
            </article>
          ))}
        </section>
      </div>

      {isOfferModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px',
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '20px',
            padding: '32px',
            maxWidth: '480px',
            width: '100%',
          }}>
            <h2 style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 12px 0' }}>
              Предложить объект клиенту
            </h2>
            <p style={{ fontSize: '14px', color: '#757575', margin: '0 0 20px 0' }}>
              Выберите ваш объект из каталога или вставьте ссылку на объявление.
            </p>

            {offerSuccess ? (
              <div style={{ padding: '20px', background: '#E8F5E9', color: '#1BA800', borderRadius: '12px', textAlign: 'center', fontWeight: 600 }}>
                ✓ Предложение успешно отправлено клиенту!
              </div>
            ) : (
              <form onSubmit={handleSendOffer}>
                <input
                  type="text"
                  placeholder="Ссылка на объект или адрес..."
                  required
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    border: '1px solid #EAEAEA',
                    marginBottom: '14px',
                    boxSizing: 'border-box',
                  }}
                />
                <textarea
                  placeholder="Комментарий для клиента (цена, условия, сроки)..."
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    border: '1px solid #EAEAEA',
                    marginBottom: '20px',
                    boxSizing: 'border-box',
                  }}
                />
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="figma-request-action-btn"
                    onClick={() => setIsOfferModalOpen(false)}
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    className="figma-request-action-btn figma-request-action-btn--primary"
                  >
                    Отправить предложение
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
