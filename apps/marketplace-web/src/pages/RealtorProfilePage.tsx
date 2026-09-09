import React, { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useSeoMetadata } from '../hooks/useSeoMetadata'
import { MOCK_REALTORS, type RealtorItem } from './RealtorsPage'

interface ReviewItem {
  id: string
  authorName: string
  date: string
  rating: number
  dealType: string
  comment: string
}

const MOCK_REVIEWS: Record<string, ReviewItem[]> = {
  'realtor-1': [
    {
      id: 'rev-1',
      authorName: 'Михаил С.',
      date: '18 августа 2026',
      rating: 5,
      dealType: 'Покупка апартаментов в Батуми',
      comment: 'Георгий помог выбрать отличную студию в ЖК с видом на море. Проверил все документы застройщика, согласовал скидку и рассрочку на 3 года. Сделка прошла безупречно!',
    },
    {
      id: 'rev-2',
      authorName: 'Елена В.',
      date: '02 июля 2026',
      rating: 5,
      dealType: 'Инвестиционный пул квартир',
      comment: 'Сотрудничаем с Георгием уже второй год. Отличный аналитический подход к доходности от аренды, всегда на связи по WhatsApp.',
    },
  ],
}

/**
 * RealtorProfilePage Component (Figma: Отзывы Node ID 3576:53737)
 */
export function RealtorProfilePage() {
  const { id } = useParams<{ id: string }>()
  const realtor: RealtorItem | undefined = MOCK_REALTORS.find((r) => r.id === id) || MOCK_REALTORS[0]

  const [reviews, setReviews] = useState<ReviewItem[]>(MOCK_REVIEWS[realtor.id] || MOCK_REVIEWS['realtor-1'])
  const [newAuthor, setNewAuthor] = useState('')
  const [newComment, setNewComment] = useState('')
  const [formSubmitted, setFormSubmitted] = useState(false)

  useSeoMetadata({
    title: `${realtor.name} — отзывы и профиль риелтора в ${realtor.city}`,
    description: `Профиль риелтора ${realtor.name} (${realtor.agency}). Рейтинг ${realtor.rating}, отзывы клиентов и контакты на BAZA.`,
  })

  const handleSubmitReview = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newAuthor.trim() || !newComment.trim()) return

    const newRev: ReviewItem = {
      id: `rev-${Date.now()}`,
      authorName: newAuthor.trim(),
      date: 'Сегодня',
      rating: 5,
      dealType: 'Отзыв клиента',
      comment: newComment.trim(),
    }

    setReviews([newRev, ...reviews])
    setNewAuthor('')
    setNewComment('')
    setFormSubmitted(true)
  }

  return (
    <div className="figma-realtors-page">
      <div className="demo-notice-banner" role="note">
        <span className="demo-notice-banner__icon" aria-hidden="true">ℹ️</span>
        <div className="demo-notice-banner__text">
          <strong>Демонстрационный профиль:</strong> Страница эксперта и отзывы отображаются в ознакомительном режиме. Сбор реальных отзывов станет доступен после официальной аттестации агентств.
        </div>
      </div>

      <Link className="back-link" to="/realtors" aria-label="Вернуться в рейтинг риелторов" style={{ display: 'inline-flex', marginBottom: '24px', color: '#757575', textDecoration: 'none' }}>
        ← Все риелторы
      </Link>

      {/* Hero Profile */}
      <div className="figma-realtor-profile-hero">
        <div className="figma-realtor-profile-avatar" aria-hidden="true">
          {realtor.avatarInitials}
        </div>
        <div>
          <div className="figma-realtor-badges" style={{ marginBottom: '8px' }}>
            <span className="figma-realtor-badge figma-realtor-badge--demo">Демо-профиль</span>
            {realtor.badges.map((b, i) => (
              <span key={i} className="figma-realtor-badge figma-realtor-badge--top">{b}</span>
            ))}
          </div>
          <h1 style={{ fontFamily: 'Plus Jakarta Sans', fontSize: '28px', margin: '0 0 6px' }}>{realtor.name}</h1>
          <p style={{ margin: '0 0 10px', color: '#757575', fontSize: '15px' }}>
            {realtor.agency} · {realtor.city} · Опыт {realtor.experienceYears} лет
          </p>
          <div className="figma-realtor-rating-row" style={{ fontSize: '15px' }}>
            <span className="figma-realtor-stars">★ {realtor.rating.toFixed(1)}</span>
            <span>({reviews.length} отзывов в демо-режиме)</span>
          </div>
        </div>

        <div>
          <a
            href={`tel:${realtor.phone.replace(/\s+/g, '')}`}
            className="figma-realtor-card__btn"
            style={{ display: 'inline-block', textDecoration: 'none', padding: '12px 24px' }}
          >
            Связаться: {realtor.phone}
          </a>
        </div>
      </div>

      {/* Reviews Section */}
      <section aria-labelledby="reviews-heading" style={{ marginBottom: '40px' }}>
        <h2 id="reviews-heading" style={{ fontFamily: 'Plus Jakarta Sans', fontSize: '22px', marginBottom: '20px' }}>
          Отзывы клиентов ({reviews.length})
        </h2>

        <div className="figma-reviews-list">
          {reviews.map((rev) => (
            <div key={rev.id} className="figma-review-item">
              <div className="figma-review-header">
                <div>
                  <div className="figma-review-author">{rev.authorName}</div>
                  <div style={{ fontSize: '12px', color: '#1BA800', fontWeight: 600 }}>{rev.dealType}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="figma-realtor-stars">{'★'.repeat(rev.rating)}</span>
                  <span className="figma-review-date">{rev.date}</span>
                </div>
              </div>
              <p className="figma-review-text">{rev.comment}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Add Review Form (Figma 3576:53923) */}
      <section className="figma-listing-section" aria-labelledby="add-review-heading">
        <h2 id="add-review-heading" className="figma-listing-section-title">Оставить отзыв о риелторе</h2>
        {formSubmitted ? (
          <div style={{ padding: '16px', background: '#F0FFF0', border: '1px solid #1BA800', borderRadius: '8px', color: '#1BA800', fontWeight: 600 }}>
            ✓ Спасибо! Ваш отзыв успешно добавлен (демонстрационный режим).
          </div>
        ) : (
          <form onSubmit={handleSubmitReview} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label htmlFor="rev-author" style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                Ваше имя
              </label>
              <input
                id="rev-author"
                type="text"
                required
                value={newAuthor}
                onChange={(e) => setNewAuthor(e.target.value)}
                placeholder="Например, Александр"
                style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #EAEAEA', fontSize: '14px', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label htmlFor="rev-comment" style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                Текст отзыва
              </label>
              <textarea
                id="rev-comment"
                required
                rows={4}
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Расскажите о вашем опыте работы с риелтором, проведенной сделке или подборе объекта..."
                style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #EAEAEA', fontSize: '14px', boxSizing: 'border-box' }}
              />
            </div>

            <button
              type="submit"
              className="figma-realtor-card__btn"
              style={{ maxWidth: '240px', padding: '12px 20px' }}
            >
              Отправить отзыв
            </button>
          </form>
        )}
      </section>
    </div>
  )
}
