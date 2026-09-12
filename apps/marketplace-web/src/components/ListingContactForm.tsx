import { useRef, useState, type FormEvent } from 'react'
import { marketplaceApi, MarketplaceApiError } from '../api/marketplace-api'
import { useI18n } from '../i18n'

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
  const { t } = useI18n()
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
      setErrorMessage(t('listingContact.errorPhoneRequired'))
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
        setErrorMessage(t('listingContact.errorGeneric'))
      }
    } finally {
      isSubmittingRef.current = false
    }
  }

  if (status === 'success' && revealedPhone) {
    return (
      <section className="listing-lead-card listing-lead-card--success" aria-live="polite">
        <div className="listing-lead-card__header">
          <span className="listing-lead-card__badge">{t('listingContact.submitted')}</span>
          <h3>{t('listingContact.repContacts')}</h3>
          <p>{t('listingContact.directPhone')}</p>
        </div>
        <div className="listing-lead-card__revealed-box">
          <a className="listing-lead-card__phone-link" href={`tel:${revealedPhone}`}>
            {revealedPhone}
          </a>
        </div>
        <p className="listing-lead-card__subtext">{t('listingContact.managerNotified')}</p>
      </section>
    )
  }

  return (
    <section className="listing-lead-card">
      {/*
        Заголовок даёт секция-обёртка на детальной странице
        (`figma-listing-contacts` в App.tsx, `h2#contacts-heading`). Свой `h3`
        здесь был бы вторым заголовком с ровно тем же текстом: на экране это
        видно как дубль, а для программ чтения с экрана и для тестов — два
        разных элемента с одинаковым именем.
      */}
      <div className="listing-lead-card__header">
        <p>{t('listingContact.intro')}</p>
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
                {t('common.tryAgain')}
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="listing-lead-form__field">
          <label htmlFor="lead-phone">{t('listingContact.phoneLabel')}</label>
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
          <label htmlFor="lead-name">{t('listingContact.nameLabel')}</label>
          <input
            id="lead-name"
            name="name"
            type="text"
            autoComplete="name"
            placeholder={t('listingContact.namePlaceholder')}
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
          {status === 'submitting' ? t('listingContact.sending') : t('listingContact.submit')}
        </button>
      </form>
    </section>
  )
}
