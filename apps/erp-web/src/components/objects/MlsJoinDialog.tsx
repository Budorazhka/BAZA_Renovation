import { useEffect, useState } from 'react'
import { Crown, Handshake, ShieldCheck, X, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { requestMlsMembership } from '@/services/mlsApi'
import { useI18n } from "@/i18n";

const MLS_SPLIT = [
  { key: 'buyer', label: 'Агенту покупателя', percent: 40, color: '#e6c364' },
  { key: 'seller', label: 'Агенту продавца', percent: 40, color: '#53c993' },
  { key: 'platform', label: 'Платформа BAZA.sale', percent: 10, color: '#cf91d8' },
  { key: 'partner', label: 'Арбитр / Региональный партнёр', percent: 10, color: '#ef8d6b' },
] as const

/** Попап «Вступить в MLS-круг» — вызывается с главной страницы «Вторичка», без привязки к объекту. */
export function MlsJoinDialog({ onClose }: { onClose: () => void }) {
    const { t } = useI18n();
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !submitting) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, submitting])

  async function submit() {
    setSubmitting(true)
    const res = await requestMlsMembership()
    setSubmitting(false)
    if (res.success) {
      toast.success('Заявка на вступление в MLS-круг отправлена')
      onClose()
    } else {
      toast.error(res.message ?? 'Не удалось отправить заявку')
    }
  }

  return (
    <div
      className="objects-confirm-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t('objects.mlsJoinDialog.mls_круг_baza_sale')}
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose()
      }}
    >
      <div className="objects-confirm-modal objects-mls-modal objects-mls-modal-wide">
        <div className="objects-mls-head">
          <span className="objects-mls-badge" aria-hidden>MLS</span>
          <h2 style={{ fontSize: 20, fontWeight: 500, color: 'var(--objects-ink)' }}>{t('objects.mlsJoinDialog.mls_круг_baza_sale')}</h2>
          <button
            type="button"
            className="objects-mls-x"
            onClick={onClose}
            aria-label={t('objects.mlsJoinDialog.закрыть')}
            disabled={submitting}
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <div className="objects-mls-grid">
          {/* Левая колонка: Описание и преимущества */}
          <div className="objects-mls-info-col">
            <p style={{ color: 'rgba(255, 255, 255, 0.85)', fontSize: 16 }}>
              {t('objects.mlsJoinDialog.mls_круг_закрытое_со')}</p>

            <div className="objects-mls-features">
              <div className="objects-mls-feature-item">
                <span className="objects-mls-feature-icon">
                  <Zap size={18} />
                </span>
                <div className="objects-mls-feature-text">
                  <h3 style={{ fontSize: 16, fontWeight: 500, color: 'var(--objects-ink)' }}>{t('objects.mlsJoinDialog.сделки_в_3_раза_быст')}</h3>
                  <p style={{ fontSize: 16, color: 'rgba(255, 255, 255, 0.72)' }}>
                    {t('objects.mlsJoinDialog.ваши_объекты_видят_т')}</p>
                </div>
              </div>

              <div className="objects-mls-feature-item">
                <span className="objects-mls-feature-icon">
                  <Handshake size={18} />
                </span>
                <div className="objects-mls-feature-text">
                  <h3 style={{ fontSize: 16, fontWeight: 500, color: 'var(--objects-ink)' }}>{t('objects.mlsJoinDialog.гарантированная_коми')}</h3>
                  <p style={{ fontSize: 16, color: 'rgba(255, 255, 255, 0.72)' }}>
                    {t('objects.mlsJoinDialog.деление_комиссии_заф')}</p>
                </div>
              </div>

              <div className="objects-mls-feature-item">
                <span className="objects-mls-feature-icon">
                  <ShieldCheck size={18} />
                </span>
                <div className="objects-mls-feature-text">
                  <h3 style={{ fontSize: 16, fontWeight: 500, color: 'var(--objects-ink)' }}>{t('objects.mlsJoinDialog.только_верифицирован')}</h3>
                  <p style={{ fontSize: 16, color: 'rgba(255, 255, 255, 0.72)' }}>
                    {t('objects.mlsJoinDialog.в_круге_состоят_толь')}</p>
                </div>
              </div>

              <div className="objects-mls-feature-item">
                <span className="objects-mls-feature-icon">
                  <Crown size={18} />
                </span>
                <div className="objects-mls-feature-text">
                  <h3 style={{ fontSize: 16, fontWeight: 500, color: 'var(--objects-ink)' }}>{t('objects.mlsJoinDialog.приоритет_в_каталоге')}</h3>
                  <p style={{ fontSize: 16, color: 'rgba(255, 255, 255, 0.72)' }}>
                    {t('objects.mlsJoinDialog.mls_объекты_поднимаю')}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Правая колонка: Диаграмма распределения комиссии */}
          <div className="objects-mls-right-col">
            <h3 className="objects-mls-right-col-title" style={{ fontSize: 16, fontWeight: 500 }}>
              {t('objects.mlsJoinDialog.распределение_комисс')}</h3>

            {/* Графическая диаграмма (Donut Chart) */}
            <div className="objects-mls-donut-container" aria-label={t('objects.mlsJoinDialog.схема_распределения')}>
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
                  <span style={{ fontSize: 16, color: 'rgba(255, 255, 255, 0.72)', marginTop: 2 }}>{t('objects.mlsJoinDialog.комиссия')}</span>
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
                {t('objects.mlsJoinDialog.пример_распределения')}</h4>
              <p className="objects-mls-calc-box-text" style={{ fontSize: 16, color: 'rgba(255, 255, 255, 0.72)' }}>
                {t('objects.mlsJoinDialog.при_продаже_квартиры')}<strong>$10 000</strong> {t('objects.mlsJoinDialog.со_агент_приведший_п')}<strong>$4 000</strong> {t('objects.mlsJoinDialog.в_день_сделки')}</p>
            </div>
          </div>
        </div>

        {/* Действия */}
        <div className="objects-confirm-actions" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: 16 }}>
          <button
            type="button"
            className="objects-confirm-back"
            onClick={onClose}
            disabled={submitting}
            style={{ fontSize: 16, height: 44, padding: '0 24px', fontWeight: 500 }}
          >
            {t('objects.mlsJoinDialog.отмена')}</button>
          <button
            type="button"
            className="objects-confirm-submit"
            onClick={submit}
            disabled={submitting}
            style={{ fontSize: 16, height: 44, padding: '0 28px', fontWeight: 500, background: '#e6c364', color: '#072821' }}
          >
            {submitting ? 'Отправляем…' : 'Подать заявку'}
          </button>
        </div>
      </div>
    </div>
  )
}
