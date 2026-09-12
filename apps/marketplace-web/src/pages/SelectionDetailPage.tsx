import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useSeoMetadata } from '../hooks/useSeoMetadata'
import { BuildingPlaceholder } from '../components/DevelopmentCard'
import { marketplaceApi } from '../api/marketplace-api'
import { useI18n } from '../i18n'
import type { Translate } from '../i18n'
import type { PublicSelection, PublicSelectionItem } from '../types/marketplace'
import '../styles/favorites-selections.css'

/**
 * MKT-SCR-018: персональная подборка, которую клиент открывает по ссылке от
 * риэлтора.
 *
 * До 04.09.2026 страница была 128 строками захардкоженной вёрстки: она
 * игнорировала токен из адреса и любому клиенту показывала одни и те же
 * выдуманные объекты, выдуманного эксперта «Георгий Беридзе» и выдуманный номер
 * WhatsApp. То есть человек, которому агент прислал ссылку, видел не свою
 * подборку, а декорацию с чужими контактами.
 *
 * Теперь читает `GET /public/selections/:token`. Просмотр там же отмечается на
 * сервере (sent -> viewed), поэтому агент видит, что клиент открыл ссылку.
 */
export function SelectionDetailPage() {
  const { slug = '' } = useParams()
  const { t } = useI18n()
  const [selection, setSelection] = useState<PublicSelection | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'not_found' | 'error'>('loading')

  useSeoMetadata({
    title: selection ? `${selection.title} | BAZA` : t('selectionDetail.seoTitle'),
    description: t('selectionDetail.seoDescription'),
    // Подборка адресована одному человеку и открывается по ссылке: в поиске ей
    // делать нечего.
    noindex: true,
  })

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    void (async () => {
      setStatus('loading')
      try {
        const result = await marketplaceApi.getPublicSelection(slug, { signal: controller.signal })
        if (cancelled) return
        setSelection(result)
        setStatus('ready')
      } catch (error) {
        if (cancelled) return
        const httpStatus = (error as { status?: number }).status
        setStatus(httpStatus === 404 ? 'not_found' : 'error')
      }
    })()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [slug])

  if (status === 'loading') {
    return (
      <div className="state-panel" role="status" aria-busy="true">
        <p>{t('selectionDetail.loading')}</p>
      </div>
    )
  }

  if (status === 'not_found') {
    return (
      <div className="state-panel state-panel--empty">
        <p>{t('selectionDetail.notFound')}</p>
        <Link to="/newconstructions" className="clear-filter-btn">
          {t('selectionDetail.viewCatalogue')}
        </Link>
      </div>
    )
  }

  if (status === 'error' || !selection) {
    return (
      <div className="state-panel state-panel--error" role="alert">
        <p>{t('selectionDetail.loadFailed')}</p>
      </div>
    )
  }

  return (
    <section className="client-selection" aria-labelledby="selection-title">
      <header className="client-selection__header">
        <h1 id="selection-title" className="client-selection__title">
          {selection.title}
        </h1>
        {selection.clientName && (
          <p className="client-selection__client">{t('selectionDetail.pickedFor', { name: selection.clientName })}</p>
        )}
        {selection.agentNote && <p className="client-selection__note">{selection.agentNote}</p>}
      </header>

      {selection.items.length === 0 ? (
        <div className="state-panel state-panel--empty">
          <p>{t('selectionDetail.emptyItems')}</p>
        </div>
      ) : (
        <ul className="client-selection__grid">
          {selection.items.map((item) => (
            <SelectionItemCard key={item.unitId} item={item} t={t} />
          ))}
        </ul>
      )}
    </section>
  )
}

function formatPrice(price?: { amountMinorUnits: number; currency: string }): string | null {
  if (!price) return null
  return `${Math.round(price.amountMinorUnits / 100).toLocaleString('ru-RU')} ${price.currency}`
}

function SelectionItemCard({ item, t }: { item: PublicSelectionItem; t: Translate }) {
  const price = formatPrice(item.unit?.price)

  return (
    <li className="client-selection__card">
      <div className="client-selection__media">
        <BuildingPlaceholder />
      </div>
      <div className="client-selection__body">
        {item.unit ? (
          <>
            <p className="client-selection__unit-number">{t('devDetail.unitTitleNumbered', { number: item.unit.number })}</p>
            {price && <p className="client-selection__price">{price}</p>}
            <p className="client-selection__params">
              {[
                item.unit.rooms !== undefined ? t('card.rooms', { count: item.unit.rooms }) : null,
                t('card.area', { area: item.unit.area }),
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </>
        ) : (
          /*
            Объект пропал из базы после того, как агент собрал подборку. Честно
            говорим об этом, а не показываем пустую карточку без объяснения.
          */
          <p className="client-selection__missing">{t('selectionDetail.itemMissing')}</p>
        )}

        {item.agentNote && <p className="client-selection__agent-note">{item.agentNote}</p>}
      </div>
    </li>
  )
}
