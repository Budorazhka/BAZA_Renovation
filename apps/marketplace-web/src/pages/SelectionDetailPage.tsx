import { Link } from 'react-router-dom'
import { useSeoMetadata } from '../hooks/useSeoMetadata'
import { BuildingPlaceholder } from '../components/DevelopmentCard'

export function SelectionDetailPage() {
  useSeoMetadata({
    title: 'Персональная подборка недвижимости | BAZA',
    description: 'Индивидуально подобранные объекты недвижимости от эксперта BAZA.',
  })

  return (
    <div className="figma-fav-page">
      <div style={{
        background: 'linear-gradient(135deg, #111111 0%, #222222 100%)',
        color: '#FFFFFF',
        borderRadius: '20px',
        padding: '36px 32px',
        marginBottom: '40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '24px',
      }}>
        <div>
          <span style={{
            background: 'rgba(27, 168, 0, 0.2)',
            color: '#1BA800',
            fontSize: '13px',
            fontWeight: 700,
            padding: '4px 12px',
            borderRadius: '12px',
            display: 'inline-block',
            marginBottom: '12px',
          }}>
            ПЕРСОНАЛЬНАЯ ПОДБОРКА
          </span>
          <h1 style={{ fontSize: '28px', fontWeight: 700, margin: '0 0 8px 0' }}>
            Объекты для вашего запроса
          </h1>
          <p style={{ fontSize: '15px', color: '#CCCCCC', margin: 0, maxWidth: '540px' }}>
            Подборка сформирована риелтором на основе ваших предпочтений и актуальных предложений рынка.
          </p>
        </div>

        <div style={{
          background: 'rgba(255, 255, 255, 0.1)',
          borderRadius: '16px',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: '#1BA800',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px',
            fontWeight: 700,
          }}>
            ГБ
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '15px' }}>Георгий Беридзе</div>
            <div style={{ fontSize: '13px', color: '#AAAAAA' }}>Ваш эксперт BAZA</div>
          </div>
          <a
            href="https://wa.me/995599000000"
            target="_blank"
            rel="noopener noreferrer"
            className="figma-collection-btn figma-collection-btn--primary"
            style={{ marginLeft: '12px' }}
          >
            Написать в WhatsApp
          </a>
        </div>
      </div>

      <div className="figma-fav-grid">
        <article className="figma-fav-card">
          <div className="figma-fav-card__media">
            <BuildingPlaceholder />
          </div>
          <div className="figma-fav-card__body">
            <div className="figma-fav-card__price">$85 000</div>
            <h2 className="figma-fav-card__title">2-комн. апартаменты с панорамным видом на море</h2>
            <p className="figma-fav-card__address">📍 Батуми, ул. Шерифа Химшиашвили, 15</p>
            <div className="figma-fav-card__specs">
              <span>🛏 2 комн.</span>
              <span>📐 65 м²</span>
              <span>🏢 12 эт.</span>
            </div>
            <div className="figma-fav-card__actions">
              <Link to="/listings/batumi-flat-sea-view" className="figma-fav-card-btn figma-fav-card-btn--primary">
                Смотреть детали
              </Link>
            </div>
          </div>
        </article>

        <article className="figma-fav-card">
          <div className="figma-fav-card__media">
            <BuildingPlaceholder />
          </div>
          <div className="figma-fav-card__body">
            <div className="figma-fav-card__price">$48 000</div>
            <h2 className="figma-fav-card__title">Студия под ключ в Orbi City</h2>
            <p className="figma-fav-card__address">📍 Батуми, ул. Пиросмани, 8</p>
            <div className="figma-fav-card__specs">
              <span>🛏 1 комн.</span>
              <span>📐 33 м²</span>
              <span>🏢 18 эт.</span>
            </div>
            <div className="figma-fav-card__actions">
              <Link to="/listings/batumi-studio-orbi" className="figma-fav-card-btn figma-fav-card-btn--primary">
                Смотреть детали
              </Link>
            </div>
          </div>
        </article>
      </div>
    </div>
  )
}
