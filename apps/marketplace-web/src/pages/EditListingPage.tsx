import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  publishingApi,
  PublishingApiError,
  type OwnerListing,
  type OwnerPropertyAsset,
} from '../features/publishing/api/publishing-api'
import { listingPropertyTypeLabel } from '../lib/format'
import { useI18n } from '../i18n'
import '../features/publishing/styles/publishing.css'
import '../features/auth/styles/auth.css'

/**
 * MKT-SCR-021: редактирование объявления владельцем.
 *
 * Экран правит ровно то, что разрешает сервер: цену, характеристики и телефон.
 * Тип объекта, тип сделки и адрес показываются, но не редактируются — по ним
 * система ищет дубликаты, и правка позволила бы объявлению «переехать» в другой
 * дом в обход проверки. Это решение владельца от 04.09.2026, и оно закреплено на
 * сервере: такие поля отклоняются с 400, форма их просто не отправляет.
 */
export function EditListingPage() {
  const { assetId = '', listingId = '' } = useParams()
  const navigate = useNavigate()
  const { t } = useI18n()

  const [asset, setAsset] = useState<OwnerPropertyAsset | null>(null)
  const [listing, setListing] = useState<OwnerListing | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [area, setArea] = useState('')
  const [rooms, setRooms] = useState('')
  const [floor, setFloor] = useState('')
  const [totalFloors, setTotalFloors] = useState('')
  const [phone, setPhone] = useState('')

  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedNote, setSavedNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const [loadedAsset, listings] = await Promise.all([
        publishingApi.getPropertyAsset(assetId),
        publishingApi.listListingsForAsset(assetId),
      ])
      const found = listings.find((item) => item._id === listingId) ?? null
      if (!found) {
        setLoadError(t('editListing.notFound'))
        return
      }
      setAsset(loadedAsset)
      setListing(found)
      // Цена приходит в копейках: в форме показываем целые единицы валюты,
      // иначе владелец увидит 8500000 вместо 85 000.
      setAmount(String(Math.round(found.price.amountMinorUnits / 100)))
      setCurrency(found.price.currency)
      setArea(loadedAsset.characteristics.area?.toString() ?? '')
      setRooms(loadedAsset.characteristics.rooms?.toString() ?? '')
      setFloor(loadedAsset.characteristics.floor?.toString() ?? '')
      setTotalFloors(loadedAsset.characteristics.totalFloors?.toString() ?? '')
      setPhone(loadedAsset.representativePhone)
    } catch (error) {
      setLoadError(
        error instanceof PublishingApiError && error.status === 404
          ? t('editListing.notFound')
          : t('editListing.loadFailed'),
      )
    } finally {
      setIsLoading(false)
    }
  }, [assetId, listingId, t])

  useEffect(() => {
    void load()
  }, [load])

  /** Пустая строка означает «не трогать поле», а не «обнулить». */
  function numberOrUndefined(value: string): number | undefined {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? Math.round(parsed) : undefined
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSaveError(null)
    setSavedNote(null)

    const amountUnits = numberOrUndefined(amount)
    if (amountUnits === undefined || amountUnits < 0) {
      setSaveError(t('editListing.errorPriceNumber'))
      return
    }

    setIsSaving(true)
    try {
      const result = await publishingApi.updateListing(assetId, listingId, {
        price: { amountMinorUnits: amountUnits * 100, currency },
        characteristics: {
          area: numberOrUndefined(area),
          rooms: numberOrUndefined(rooms),
          floor: numberOrUndefined(floor),
          totalFloors: numberOrUndefined(totalFloors),
        },
        representativePhone: phone.trim() || undefined,
      })
      setListing(result.listing)
      setSavedNote(result.rebuildRequested ? t('editListing.savedRebuild') : t('editListing.saved'))
    } catch (error) {
      if (error instanceof PublishingApiError && error.status === 409) {
        // Ровно тот случай, ради которого на сервере стоит сверка версии: кто-то
        // изменил это же объявление, пока форма была открыта. Затирать чужую
        // правку нельзя, поэтому предлагаем перечитать.
        setSaveError(t('editListing.errorConflict'))
      } else if (error instanceof PublishingApiError && error.status === 400) {
        setSaveError(t('editListing.errorRejected'))
      } else {
        setSaveError(t('editListing.errorSaveFailed'))
      }
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="state-panel" role="status" aria-busy="true">
        <p>{t('editListing.loading')}</p>
      </div>
    )
  }

  if (loadError || !asset || !listing) {
    return (
      <div className="state-panel state-panel--error" role="alert">
        <p>{loadError ?? t('editListing.unavailable')}</p>
        <Link to="/account/properties" className="clear-filter-btn">
          {t('editListing.backToProperties')}
        </Link>
      </div>
    )
  }

  return (
    <section className="edit-listing" aria-labelledby="edit-listing-title">
      <h1 id="edit-listing-title" className="edit-listing__title">
        {t('editListing.title')}
      </h1>

      {/*
        Неизменяемая часть. Показана не для красоты: владелец должен видеть, что
        именно он правит, и понимать, почему адреса нет среди полей формы.
      */}
      <dl className="edit-listing__fixed">
        <div>
          <dt>{t('editListing.address')}</dt>
          <dd>
            {asset.location.city}, {asset.location.address}
          </dd>
        </div>
        <div>
          <dt>{t('editListing.propertyType')}</dt>
          <dd>{listingPropertyTypeLabel(asset.propertyType, asset.commercialSubtype, t)}</dd>
        </div>
        <div>
          <dt>{t('editListing.dealType')}</dt>
          <dd>{listing.dealType === 'sale' ? t('format.dealSale') : t('editListing.rent')}</dd>
        </div>
      </dl>
      <p className="edit-listing__fixed-note">{t('editListing.fixedNote')}</p>

      {saveError && (
        <div className="wizard-alert wizard-alert--error" role="alert" data-testid="edit-listing-error">
          <span>{saveError}</span>
        </div>
      )}
      {savedNote && (
        <div className="wizard-alert" role="status" data-testid="edit-listing-saved">
          <span>{savedNote}</span>
        </div>
      )}

      <form className="wizard-form" onSubmit={handleSubmit} noValidate>
        <div className="wizard-field">
          <label htmlFor="edit-price">{t('editListing.price')}</label>
          <input
            id="edit-price"
            type="number"
            inputMode="numeric"
            min={0}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            disabled={isSaving}
            data-testid="edit-input-price"
          />
        </div>

        <div className="wizard-field">
          <label htmlFor="edit-currency">{t('editListing.currency')}</label>
          <select
            id="edit-currency"
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
            disabled={isSaving}
          >
            <option value="USD">USD</option>
            <option value="GEL">GEL</option>
            <option value="RUB">RUB</option>
          </select>
        </div>

        <div className="wizard-field">
          <label htmlFor="edit-area">{t('editListing.area')}</label>
          <input
            id="edit-area"
            type="number"
            inputMode="numeric"
            min={1}
            value={area}
            onChange={(event) => setArea(event.target.value)}
            disabled={isSaving}
          />
        </div>

        {asset.propertyType !== 'land' && (
          <>
            <div className="wizard-field">
              <label htmlFor="edit-rooms">{t('editListing.rooms')}</label>
              <input
                id="edit-rooms"
                type="number"
                inputMode="numeric"
                min={0}
                value={rooms}
                onChange={(event) => setRooms(event.target.value)}
                disabled={isSaving}
              />
            </div>

            <div className="wizard-field">
              <label htmlFor="edit-floor">{t('editListing.floor')}</label>
              <input
                id="edit-floor"
                type="number"
                inputMode="numeric"
                value={floor}
                onChange={(event) => setFloor(event.target.value)}
                disabled={isSaving}
              />
            </div>

            <div className="wizard-field">
              <label htmlFor="edit-total-floors">{t('editListing.totalFloors')}</label>
              <input
                id="edit-total-floors"
                type="number"
                inputMode="numeric"
                min={1}
                value={totalFloors}
                onChange={(event) => setTotalFloors(event.target.value)}
                disabled={isSaving}
              />
            </div>
          </>
        )}

        <div className="wizard-field">
          <label htmlFor="edit-phone">{t('editListing.phone')}</label>
          <input
            id="edit-phone"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            disabled={isSaving}
          />
        </div>

        <div className="edit-listing__actions">
          <button
            type="submit"
            className="wizard-btn wizard-btn--primary"
            disabled={isSaving}
            aria-busy={isSaving}
            data-testid="edit-submit-btn"
          >
            {isSaving ? t('editListing.saving') : t('editListing.save')}
          </button>
          <button
            type="button"
            className="wizard-btn"
            onClick={() => navigate('/account/properties')}
            disabled={isSaving}
          >
            {t('editListing.cancel')}
          </button>
        </div>
      </form>

      {listing.updatedAt && (
        <p className="edit-listing__updated">
          {t('editListing.lastUpdated', { date: new Date(listing.updatedAt).toLocaleString('ru-RU') })}
        </p>
      )}
    </section>
  )
}
