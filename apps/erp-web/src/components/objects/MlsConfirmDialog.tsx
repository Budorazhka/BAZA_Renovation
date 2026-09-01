import { useEffect, useState } from 'react'
import { Check, Crown, Handshake, ShieldCheck, X, Zap } from 'lucide-react'
import { toast } from 'sonner'
import type { Property } from '@/components/management/my-properties/types'
import { FMT_USD } from '@/lib/format-currency'
import { requestAddToMls, requestMlsAccess, requestRemoveFromMls } from '@/services/mlsApi'
import { useI18n } from "@/i18n";

export type MlsDialogMode = 'publish' | 'remove' | 'apply'

/** Обязательные условия MLS, которые пользователь подтверждает перед публикацией */
const MLS_TERMS = [
  'Объект актуален',
  'Я имею право размещать этот объект',
  'Информация об объекте достоверна',
  'Принимаю правила MLS',
  'Гарантирую выплату комиссии партнёру, который приведёт покупателя',
  'Принимаю установленную схему расчётов',
]

const HEAD: Record<MlsDialogMode, string> = {
  publish: 'Добавить объект в MLS',
  remove: 'Убрать объект из MLS',
  apply: 'Доступ к MLS',
}

const MLS_SPLIT = [
  { key: 'buyer', label: 'Агенту покупателя', percent: 40, color: '#e6c364' },
  { key: 'seller', label: 'Агенту продавца', percent: 40, color: '#53c993' },
  { key: 'platform', label: 'Платформа BAZA.sale', percent: 10, color: '#cf91d8' },
  { key: 'partner', label: 'Арбитр / Региональный партнёр', percent: 10, color: '#ef8d6b' },
] as const

export function MlsConfirmDialog({
  property,
  mode,
  onClose,
  onConfirmed,
}: {
  property: Property
  mode: MlsDialogMode
  onClose: () => void
  /** Вызывается после успешной публикации/снятия: isMlsNow — новое состояние объекта */
  onConfirmed: (id: string, isMlsNow: boolean) => void
}) {
    const { t } = useI18n();
  const [accepted, setAccepted] = useState<boolean[]>(() => MLS_TERMS.map(() => false))
  const [submitting, setSubmitting] = useState(false)
  const allAccepted = accepted.every(Boolean)
  const canSubmit = mode === 'publish' ? allAccepted && !submitting : !submitting

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !submitting) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, submitting])

  async function submit() {
    if (!canSubmit) return
    setSubmitting(true)
    // Серверная проверка прав — на бэкенде (см. services/mlsApi.ts).
    if (mode === 'apply') {
      const res = await requestMlsAccess({ propertyId: property.id })
      setSubmitting(false)
      if (res.success) {
        toast.success('Заявка на доступ к MLS отправлена')
        onClose()
      } else {
        toast.error(res.message ?? 'Не удалось отправить заявку')
      }
      return
    }
    if (mode === 'remove') {
      const res = await requestRemoveFromMls({ propertyId: property.id })
      setSubmitting(false)
      if (res.success) {
        toast.success('Объект убран из MLS')
        onConfirmed(property.id, false)
      } else {
        toast.error(res.message ?? 'Не удалось убрать из MLS')
      }
      return
    }
    const res = await requestAddToMls({
      propertyId: property.id,
      acceptedTerms: MLS_TERMS.filter((_, i) => accepted[i]),
    })
    setSubmitting(false)
    if (res.success) {
      toast.success('Объект добавлен в MLS')
      onConfirmed(property.id, true)
    } else {
      toast.error(res.message ?? 'Не удалось добавить в MLS')
    }
  }

  return (
    <div
      className="objects-confirm-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={HEAD[mode]}
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose()
      }}
    >
      <div className={`objects-confirm-modal objects-mls-modal ${mode === 'apply' ? 'objects-mls-modal-wide' : ''}`}>
        <div className="objects-mls-head">
          <span className="objects-mls-badge" aria-hidden>MLS</span>
          <h2 style={mode === 'apply' ? { fontSize: 20, fontWeight: 500, color: 'var(--objects-ink)' } : { fontSize: 17, fontWeight: 500, color: 'var(--objects-ink)' }}>{HEAD[mode]}</h2>
          <button
            type="button"
            className="objects-mls-x"
            onClick={onClose}
            aria-label={t('objects.mlsConfirmDialog.закрыть')}
            disabled={submitting}
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        {mode === 'apply' ? (
          <div className="objects-mls-property-banner">
            <span className="objects-mls-property-banner-text">
              {t('objects.mlsConfirmDialog.чтобы_опубликовать_о')}<strong className="objects-mls-property-banner-title">{property.title}</strong> {t('objects.mlsConfirmDialog.в_mls_круге_подайте')}</span>
          </div>
        ) : (
          <div className="objects-mls-object">
            <span className="objects-mls-object-title" style={{ fontSize: 16, fontWeight: 500 }}>{property.title}</span>
            <span className="objects-mls-object-meta" style={{ fontSize: 16 }}>
              {property.street}, {property.city} · {FMT_USD.format(property.price)} · {property.area} {t('objects.mlsConfirmDialog.м')}</span>
          </div>
        )}

        {mode === 'publish' && (
          <div className="objects-mls-terms">
            {MLS_TERMS.map((term, i) => (
              <label key={term} className="objects-mls-term" style={{ fontSize: 16 }}>
                <input
                  type="checkbox"
                  checked={accepted[i]}
                  onChange={() => setAccepted((prev) => prev.map((v, j) => (j === i ? !v : v)))}
                />
                <span style={{ color: 'rgba(255, 255, 255, 0.85)' }}>{term}</span>
              </label>
            ))}
          </div>
        )}

        {mode === 'remove' && (
          <p className="objects-mls-note" style={{ fontSize: 16, color: 'rgba(255, 255, 255, 0.72)' }}>
            {t('objects.mlsConfirmDialog.объект_перестанет_по')}</p>
        )}

        {mode === 'apply' && (
          <div className="objects-mls-grid">
            {/* Левая колонка: Описание и преимущества */}
            <div className="objects-mls-info-col">
              <p style={{ color: 'rgba(255, 255, 255, 0.85)', fontSize: 16 }}>
                {t('objects.mlsConfirmDialog.mls_круг_закрытое_со')}</p>

              <div className="objects-mls-features">
                <div className="objects-mls-feature-item">
                  <span className="objects-mls-feature-icon">
                    <Zap size={18} />
                  </span>
                  <div className="objects-mls-feature-text">
                    <h3 style={{ fontSize: 16, fontWeight: 500, color: 'var(--objects-ink)' }}>{t('objects.mlsConfirmDialog.сделки_в_3_раза_быст')}</h3>
                    <p style={{ fontSize: 16, color: 'rgba(255, 255, 255, 0.72)' }}>
                      {t('objects.mlsConfirmDialog.ваши_объекты_видят_т')}</p>
                  </div>
                </div>

                <div className="objects-mls-feature-item">
                  <span className="objects-mls-feature-icon">
                    <Handshake size={18} />
                  </span>
                  <div className="objects-mls-feature-text">
                    <h3 style={{ fontSize: 16, fontWeight: 500, color: 'var(--objects-ink)' }}>{t('objects.mlsConfirmDialog.гарантированная_коми')}</h3>
                    <p style={{ fontSize: 16, color: 'rgba(255, 255, 255, 0.72)' }}>
                      {t('objects.mlsConfirmDialog.деление_комиссии_заф')}</p>
                  </div>
                </div>

                <div className="objects-mls-feature-item">
                  <span className="objects-mls-feature-icon">
                    <ShieldCheck size={18} />
                  </span>
                  <div className="objects-mls-feature-text">
                    <h3 style={{ fontSize: 16, fontWeight: 500, color: 'var(--objects-ink)' }}>{t('objects.mlsConfirmDialog.только_верифицирован')}</h3>
                    <p style={{ fontSize: 16, color: 'rgba(255, 255, 255, 0.72)' }}>
                      {t('objects.mlsConfirmDialog.в_круге_состоят_толь')}</p>
                  </div>
                </div>

                <div className="objects-mls-feature-item">
                  <span className="objects-mls-feature-icon">
                    <Crown size={18} />
                  </span>
                  <div className="objects-mls-feature-text">
                    <h3 style={{ fontSize: 16, fontWeight: 500, color: 'var(--objects-ink)' }}>{t('objects.mlsConfirmDialog.приоритет_в_каталоге')}</h3>
                    <p style={{ fontSize: 16, color: 'rgba(255, 255, 255, 0.72)' }}>
                      {t('objects.mlsConfirmDialog.mls_объекты_поднимаю')}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Правая колонка: Диаграмма распределения комиссии */}
            <div className="objects-mls-right-col">
              <h3 className="objects-mls-right-col-title" style={{ fontSize: 16, fontWeight: 500 }}>
                {t('objects.mlsConfirmDialog.распределение_комисс')}</h3>

              {/* Графическая диаграмма (Donut Chart) */}
              <div className="objects-mls-donut-container" aria-label={t('objects.mlsConfirmDialog.схема_распределения')}>
                <div style={{ position: 'relative', width: 180, height: 180 }}>
                  <svg viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)', width: '100%', height: '100%' }}>
                    {/* Background track */}
                    <circle
                      cx="50"
                      cy="50"
                      r="38"
                      fill="transparent"
                      stroke="rgba(255, 255, 255, 0.05)"
                      strokeWidth="8"
                    />
                    {/* Segment circles with flat ends and a small gap */}
                    {MLS_SPLIT.map((part, index) => {
                      const radius = 38
                      const circumference = 2 * Math.PI * radius
                      const gap = 2.5
                      const strokeLength = (part.percent / 100) * circumference - gap
                      const prevPercentSum = MLS_SPLIT.slice(0, index).reduce((sum, p) => sum + p.percent, 0)
                      const strokeOffset = circumference - (prevPercentSum / 100) * circumference
                      return (
                        <circle
                          key={part.key}
                          cx="50"
                          cy="50"
                          r={radius}
                          fill="transparent"
                          stroke={part.color}
                          strokeWidth="8"
                          strokeDasharray={`${strokeLength} ${circumference - strokeLength}`}
                          strokeDashoffset={strokeOffset}
                        />
                      )
                    })}
                  </svg>
                  {/* Center label */}
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                  }}>
                    <span style={{ fontSize: 22, fontWeight: 500, color: '#ffffff', lineHeight: 1.1 }}>100%</span>
                    <span style={{ fontSize: 16, color: 'rgba(255, 255, 255, 0.72)', marginTop: 2 }}>{t('objects.mlsConfirmDialog.комиссия')}</span>
                  </div>
                </div>
              </div>

              {/* Легенда */}
              <div className="objects-mls-split-legend">
                {MLS_SPLIT.map((part) => (
                  <div key={part.key} className="objects-mls-split-item">
                    <span className="objects-mls-split-label" style={{ fontSize: 16 }}>
                      <span
                        className="objects-mls-split-dot"
                        style={{ background: part.color }}
                      />
                      <span style={{ color: 'rgba(255, 255, 255, 0.85)' }}>{part.label}</span>
                    </span>
                    <div className="objects-mls-split-value-group">
                      <span className="objects-mls-split-pct" style={{ fontSize: 16, fontWeight: 500, color: 'var(--objects-ink)' }}>
                        {part.percent}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Пример расчёта */}
              <div className="objects-mls-calc-box">
                <h4 className="objects-mls-calc-box-title" style={{ fontSize: 16, fontWeight: 500 }}>
                  {t('objects.mlsConfirmDialog.пример_распределения')}</h4>
                <p className="objects-mls-calc-box-text" style={{ fontSize: 16, color: 'rgba(255, 255, 255, 0.72)' }}>
                  {t('objects.mlsConfirmDialog.при_продаже_объекта')}<strong>$10 000</strong> {t('objects.mlsConfirmDialog.со_агент_приведший_п')}<strong>$4 000</strong> {t('objects.mlsConfirmDialog.в_день_сделки')}</p>
              </div>
            </div>
          </div>
        )}

        <div className="objects-confirm-actions" style={mode === 'apply' ? { borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: 16 } : undefined}>
          <button
            type="button"
            className="objects-confirm-back"
            onClick={onClose}
            disabled={submitting}
            style={mode === 'apply' ? { fontSize: 16, height: 44, padding: '0 24px', fontWeight: 500 } : { fontSize: 16, height: 44, padding: '0 18px', fontWeight: 500 }}
          >
            {t('objects.mlsConfirmDialog.отмена')}</button>
          <button
            type="button"
            className={mode === 'remove' ? 'objects-confirm-danger' : 'objects-confirm-submit'}
            onClick={submit}
            disabled={!canSubmit}
            style={mode === 'apply' ? { fontSize: 16, height: 44, padding: '0 28px', fontWeight: 500, background: '#e6c364', color: '#072821', border: 'none' } : { fontSize: 16, height: 44, padding: '0 18px', fontWeight: 500 }}
          >
            {mode !== 'remove' && mode !== 'apply' && <Check aria-hidden />}
            {mode === 'publish' && (submitting ? 'Публикуем…' : 'Опубликовать в MLS')}
            {mode === 'remove' && (submitting ? 'Убираем…' : 'Убрать из MLS')}
            {mode === 'apply' && (submitting ? 'Отправляем…' : 'Подать заявку')}
          </button>
        </div>
      </div>
    </div>
  )
}
