import { useRef, useState, type FormEvent } from 'react'
import { marketplaceApi, MarketplaceApiError } from '../api/marketplace-api'

export interface ListingContactFormProps {
  slug: string
}

export function extractUtmParams(search: string): Record<string, string> | undefined {
  if (!search) return undefined
  const params = new URLSearchParams(search)
  const utm: Record<string, string> = {}
  let hasUtm = false

  for (const [key, value] of params.entries()) {
    if (key.startsWith('utm_') || key === 'utm') {
      utm[key] = value
      hasUtm = true
    }
  }

  return hasUtm ? utm : undefined
}

export function ListingContactForm({ slug }: ListingContactFormProps) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [revealedPhone, setRevealedPhone] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [errorStatus, setErrorStatus] = useState<number | null>(null)
  // React state updates are not synchronous, so two submit events dispatched
  // before the first re-render commits would both read status === 'idle' and
  // both fire a real network request. This ref is checked and flipped
  // immediately, ahead of any state/await, to close that window.
  const isSubmittingRef = useRef(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSubmittingRef.current) return

    const trimmedPhone = phone.trim()
    if (!trimmedPhone) {
      setStatus('error')
      setErrorMessage('Пожалуйста, укажите контактный телефон.')
      setErrorStatus(400)
      return
    }

    isSubmittingRef.current = true
    setStatus('submitting')
    setErrorMessage(null)
    setErrorStatus(null)

    try {
      const search = typeof window !== 'undefined' ? window.location.search : ''
      const utm = extractUtmParams(search)

      const response = await marketplaceApi.revealListingContact(slug, {
        requesterName: name.trim() || undefined,
        requesterPhone: trimmedPhone,
        utm,
      })

      setRevealedPhone(response.phone)
      setStatus('success')
    } catch (err) {
      setStatus('error')
      if (err instanceof MarketplaceApiError) {
        setErrorStatus(err.status)
        setErrorMessage(err.message)
      } else {
        setErrorStatus(500)
        setErrorMessage('Не удалось отправить заявку. Пожалуйста, проверьте соединение и попробуйте ещё раз.')
      }
    } finally {
      isSubmittingRef.current = false
    }
  }

  if (status === 'success' && revealedPhone) {
    return (
      <section className="listing-lead-card listing-lead-card--success" aria-live="polite">
        <div className="listing-lead-card__header">
          <span className="listing-lead-card__badge">✓ Заявка отправлена</span>
          <h3>Контакты представителя</h3>
          <p>Прямой телефон для связи и организации просмотра:</p>
        </div>
        <div className="listing-lead-card__revealed-box">
          <a className="listing-lead-card__phone-link" href={`tel:${revealedPhone}`}>
            {revealedPhone}
          </a>
        </div>
        <p className="listing-lead-card__subtext">
          Менеджер объекта также получил ваше обращение и свяжется с вами в ближайшее время.
        </p>
      </section>
    )
  }

  return (
    <section className="listing-lead-card">
      <div className="listing-lead-card__header">
        <h3>Связаться с риелтором</h3>
        <p>Оставьте номер телефона, чтобы получить прямой контакт представителя объекта и назначить просмотр.</p>
      </div>

      <form className="listing-lead-form" onSubmit={handleSubmit} noValidate>
        {status === 'error' && errorMessage ? (
          <div className="listing-lead-form__error" role="alert">
            <p>{errorMessage}</p>
            {errorStatus !== 404 && errorStatus !== 429 ? (
              <button
                type="button"
                className="listing-lead-form__retry-btn"
                onClick={() => {
                  setStatus('idle')
                  setErrorMessage(null)
                }}
              >
                Попробовать снова
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="listing-lead-form__field">
          <label htmlFor="lead-phone">Телефон *</label>
          <input
            id="lead-phone"
            name="phone"
            type="tel"
            required
            autoComplete="tel"
            placeholder="+995 555 12 34 56"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={status === 'submitting'}
          />
        </div>

        <div className="listing-lead-form__field">
          <label htmlFor="lead-name">Ваше имя</label>
          <input
            id="lead-name"
            name="name"
            type="text"
            autoComplete="name"
            placeholder="Как к вам обращаться"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={status === 'submitting'}
          />
        </div>

        <button
          type="submit"
          className="listing-lead-form__submit"
          disabled={status === 'submitting' || !phone.trim()}
        >
          {status === 'submitting' ? 'Отправляем…' : 'Показать телефон'}
        </button>
      </form>
    </section>
  )
}
