import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, CalendarDays, CheckCircle2, X } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useI18n } from "@/i18n";

export interface BookingUnitInfo {
  title: string
  subtitle?: string
  priceLabel?: string
  extraLabel?: string
}

interface Props {
  /** Заголовок над названием лота — например, название ЖК или проекта. Необязателен. */
  contextTitle?: string
  unit: BookingUnitInfo
  onClose: () => void
  onSubmit?: (data: { clientName: string; clientPhone: string; notes: string; startsAt: string; expiresAt: string }) => void | Promise<void>
}

const pad2 = (n: number) => String(n).padStart(2, '0')
const toIsoDate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

/** «пн, 25 июля» — день недели важнее минут: срок брони считают по дням. */
function fmtDay(d: Date) {
  return d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' })
}

function fmtTime(d: Date) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function plural(n: number, one: string, few: string, many: string) {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

const PRESETS = [
  { hours: 24, label: '24 часа' },
  { hours: 48, label: '48 часов' },
  { hours: 72, label: '72 часа' },
  { hours: 168, label: '7 дней' },
]

export function BookingRequestModal({ contextTitle, unit, onClose, onSubmit }: Props) {
    const { t } = useI18n();
  const { currentUser } = useAuth()

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey) }
  }, [onClose])

  const now = useMemo(() => new Date(), [])

  const [agentName, setAgentName] = useState(currentUser?.name ?? '')
  const [agencyName, setAgencyName] = useState(currentUser?.companyName ?? '')
  const [notes, setNotes] = useState('')
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Срок брони: пресет в часах либо своя дата окончания из календаря.
  const [hours, setHours] = useState<number | null>(72)
  const [customDate, setCustomDate] = useState('')

  const endsAt = useMemo(() => {
    if (hours !== null) return new Date(now.getTime() + hours * 3_600_000)
    if (!customDate) return new Date(now.getTime() + 72 * 3_600_000)
    // Своя дата — конец выбранного дня, время начала сохраняем.
    const [y, m, d] = customDate.split('-').map(Number)
    return new Date(y, m - 1, d, now.getHours(), now.getMinutes())
  }, [hours, customDate, now])

  const minDate = toIsoDate(new Date(now.getTime() + 24 * 3_600_000))
  const maxDate = toIsoDate(new Date(now.getTime() + 180 * 24 * 3_600_000))

  const startDt = `${toIsoDate(now)}T${pad2(now.getHours())}:${pad2(now.getMinutes())}:00`
  const endDt = `${toIsoDate(endsAt)}T${pad2(endsAt.getHours())}:${pad2(endsAt.getMinutes())}:00`
  const durationDays = Math.max(1, Math.round((endsAt.getTime() - now.getTime()) / 86_400_000))
  const canSubmit = agentName.trim().length > 0 && endsAt > now && !submitting

  // Разделение через смену фона + inner glow, без 1px-линий (правило "No Line").
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '11px 14px',
    background: 'var(--workspace-row-bg, rgba(0,28,20,0.48))',
    border: 'none',
    boxShadow: 'inset 0 0 0 1px rgba(201,168,76,0.18)',
    borderRadius: 4,
    color: 'var(--app-text, #ffffff)',
    fontSize: 16,
    fontFamily: "'Montserrat', sans-serif",
    outline: 'none',
    boxSizing: 'border-box' as const,
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 16,
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--theme-accent-heading)',
    marginBottom: 8,
  }

  const focusRing = 'inset 0 0 0 2px var(--gold, #e6c364)'
  const restRing = 'inset 0 0 0 1px rgba(201,168,76,0.18)'

  async function handleSubmit() {
    if (!canSubmit) return
    setError(null)
    setSubmitting(true)
    try {
      await onSubmit?.({
        clientName: agentName.trim(),
        clientPhone: agencyName.trim(),
        notes: notes.trim(),
        startsAt: startDt,
        expiresAt: endDt,
      })
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось отправить заявку. Попробуйте ещё раз.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9100,
        background: 'rgba(0,0,0,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Montserrat', sans-serif",
        padding: 'clamp(8px, 2vw, 24px)',
        boxSizing: 'border-box',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 560,
          maxHeight: '100%',
          background: 'var(--app-bg, #06130f)',
          boxShadow: 'inset 0 0 0 1px rgba(201,168,76,0.25)',
          borderRadius: 8,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minHeight: 0,
        }}
        onClick={e => e.stopPropagation()}
      >
        {done ? (
          <SuccessView unit={unit} startsAt={startDt} expiresAt={endDt} onClose={onClose} />
        ) : (
          <>
            {/* Header */}
            <div style={{
              padding: '20px 24px',
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
              background: 'var(--workspace-card-bg, rgba(10,42,34,0.88))',
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={labelStyle}>
                  {t('inventory.bookingRequestModal.заявка_на_бронирован')}</div>
                {contextTitle && (
                  <div style={{ fontSize: 16, color: 'rgba(255,255,255,0.72)', marginBottom: 4 }}>
                    {contextTitle}
                  </div>
                )}
                <div style={{
                  fontSize: 24, fontWeight: 500,
                  letterSpacing: '-0.02em',
                  color: 'var(--app-text, #ffffff)',
                }}>
                  {unit.title}
                </div>
                {(unit.subtitle || unit.priceLabel) && (
                  <div style={{
                    display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 12,
                    marginTop: 6, fontSize: 16,
                  }}>
                    {unit.subtitle && <span style={{ color: 'rgba(255,255,255,0.72)' }}>{unit.subtitle}</span>}
                    {unit.priceLabel && <span style={{ color: 'var(--theme-accent-heading)' }}>{unit.priceLabel}</span>}
                    {unit.extraLabel && <span style={{ color: 'rgba(255,255,255,0.72)' }}>{unit.extraLabel}</span>}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={t('inventory.bookingRequestModal.закрыть')}
                style={{
                  flexShrink: 0,
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'rgba(255,255,255,0.72)', padding: 4, display: 'flex',
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div style={{ flex: '0 1 auto', overflowY: 'auto', minHeight: 0, padding: '18px 24px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* Agent name */}
                <div>
                  <div style={labelStyle}>
                    {t('inventory.bookingRequestModal.риэлтор')}</div>
                  <input
                    value={agentName}
                    onChange={e => setAgentName(e.target.value)}
                    placeholder={t('inventory.bookingRequestModal.иванов_иван_иванович')}
                    style={inputStyle}
                    onFocus={e => (e.currentTarget.style.boxShadow = focusRing)}
                    onBlur={e => (e.currentTarget.style.boxShadow = restRing)}
                  />
                </div>

                {/* Agency */}
                <div>
                  <div style={labelStyle}>
                    {t('inventory.bookingRequestModal.агенство')}</div>
                  <input
                    value={agencyName}
                    onChange={e => setAgencyName(e.target.value)}
                    placeholder={t('inventory.bookingRequestModal.агентство_недвижимос')}
                    style={inputStyle}
                    onFocus={e => (e.currentTarget.style.boxShadow = focusRing)}
                    onBlur={e => (e.currentTarget.style.boxShadow = restRing)}
                  />
                </div>

                {/* Fixed booking range: now → +72h */}
                <div style={{
                  padding: '16px',
                  background: 'var(--workspace-row-bg, rgba(0,28,20,0.48))',
                  boxShadow: restRing,
                  borderRadius: 6,
                  display: 'flex', flexDirection: 'column', gap: 12,
                }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                  }}>
                    <span style={{ ...labelStyle, marginBottom: 0 }}>
                      {t('inventory.bookingRequestModal.срок_брони')}</span>
                    <span style={{
                      fontSize: 16, padding: '2px 10px', borderRadius: 4,
                      background: 'color-mix(in srgb, var(--gold) 14%, transparent)',
                      color: 'var(--theme-accent-heading)',
                      letterSpacing: '0.08em',
                    }}>
                      {durationDays} {plural(durationDays, 'день', 'дня', 'дней')}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {PRESETS.map(preset => {
                      const active = hours === preset.hours
                      return (
                        <button
                          key={preset.hours}
                          type="button"
                          onClick={() => { setHours(preset.hours); setCustomDate('') }}
                          style={{
                            padding: '8px 14px',
                            borderRadius: 4,
                            border: 'none',
                            boxShadow: active ? 'inset 0 0 0 1px var(--gold, #e6c364)' : restRing,
                            background: active ? 'color-mix(in srgb, var(--gold) 15%, transparent)' : 'transparent',
                            color: active ? 'var(--theme-accent-heading)' : 'rgba(255,255,255,0.72)',
                            fontSize: 16,
                            fontFamily: "'Montserrat', sans-serif",
                            cursor: 'pointer',
                            transition: 'background 0.15s, box-shadow 0.15s, color 0.15s',
                          }}
                        >
                          {preset.label}
                        </button>
                      )
                    })}
                    <label style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 14px',
                      borderRadius: 4,
                      boxShadow: hours === null ? 'inset 0 0 0 1px var(--gold, #e6c364)' : restRing,
                      background: hours === null ? 'color-mix(in srgb, var(--gold) 15%, transparent)' : 'transparent',
                      color: hours === null ? 'var(--theme-accent-heading)' : 'rgba(255,255,255,0.72)',
                      fontSize: 16,
                      cursor: 'pointer',
                    }}>
                      <CalendarDays size={18} style={{ flexShrink: 0 }} />
                      <input
                        type="date"
                        value={customDate}
                        min={minDate}
                        max={maxDate}
                        onChange={e => {
                          setCustomDate(e.target.value)
                          setHours(e.target.value ? null : 72)
                        }}
                        style={{
                          background: 'transparent', border: 'none', outline: 'none',
                          color: 'inherit', fontSize: 16, fontFamily: "'Montserrat', sans-serif",
                          colorScheme: 'dark', cursor: 'pointer', padding: 0,
                        }}
                      />
                    </label>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 16, color: 'rgba(255,255,255,0.72)', marginBottom: 4 }}>{t('inventory.bookingRequestModal.с')}</div>
                      <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--app-text, #ffffff)', letterSpacing: '-0.02em' }}>{fmtDay(now)}</div>
                      <div style={{ fontSize: 16, color: '#d0e8df', marginTop: 2 }}>{fmtTime(now)}</div>
                    </div>
                    <ArrowRight size={20} style={{ color: 'var(--theme-accent-heading)', flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 16, color: 'rgba(255,255,255,0.72)', marginBottom: 4 }}>{t('inventory.bookingRequestModal.по')}</div>
                      <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--app-text, #ffffff)', letterSpacing: '-0.02em' }}>{fmtDay(endsAt)}</div>
                      <div style={{ fontSize: 16, color: '#d0e8df', marginTop: 2 }}>{fmtTime(endsAt)}</div>
                    </div>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <div style={labelStyle}>
                    {t('inventory.bookingRequestModal.комментарий_необязат')}</div>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder={t('inventory.bookingRequestModal.клиент_рассматривает')}
                    rows={2}
                    style={{ ...inputStyle, resize: 'none', lineHeight: 1.5 }}
                    onFocus={e => (e.currentTarget.style.boxShadow = focusRing)}
                    onBlur={e => (e.currentTarget.style.boxShadow = restRing)}
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{
              flexShrink: 0,
              padding: '16px 24px 20px',
              background: 'var(--workspace-card-bg, rgba(10,42,34,0.88))',
            }}>
              {error && (
                <div style={{
                  marginBottom: 12,
                  padding: '11px 14px',
                  borderRadius: 4,
                  background: 'rgba(255,180,171,0.1)',
                  boxShadow: 'inset 0 0 0 1px rgba(255,180,171,0.3)',
                  color: '#ffb4ab',
                  fontSize: 16,
                  lineHeight: 1.4,
                }}>
                  {error}
                </div>
              )}
              <button
                type="button"
                disabled={!canSubmit}
                onClick={handleSubmit}
                style={{
                  width: '100%',
                  padding: '13px',
                  borderRadius: 4,
                  border: 'none',
                  boxShadow: canSubmit ? 'inset 0 0 0 1px var(--gold, #e6c364)' : restRing,
                  background: canSubmit ? 'color-mix(in srgb, var(--gold) 15%, transparent)' : 'var(--workspace-row-bg, rgba(0,28,20,0.48))',
                  color: canSubmit ? 'var(--theme-accent-heading)' : 'rgba(255,255,255,0.72)',
                  fontSize: 16,
                  fontWeight: 500,
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                  fontFamily: "'Montserrat', sans-serif",
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  transition: 'background 0.15s, box-shadow 0.15s, color 0.15s',
                }}
              >
                {submitting ? 'Отправка…' : 'Отправить заявку'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function SuccessView({ unit, startsAt, expiresAt, onClose }: {
  unit: BookingUnitInfo
  startsAt: string
  expiresAt: string
  onClose: () => void
}) {
    const { t } = useI18n();
  function fmtIso(iso: string) {
    const d = new Date(iso)
    return `${fmtDay(d)}, ${fmtTime(d)}`
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '40px 32px', textAlign: 'center',
      fontFamily: "'Montserrat', sans-serif",
    }}>
      <CheckCircle2 size={52} color="var(--theme-accent-heading)" style={{ marginBottom: 24 }} />
      <div style={{
        fontSize: 16, fontWeight: 500, textTransform: 'uppercase',
        letterSpacing: '0.08em', color: 'var(--theme-accent-heading)', marginBottom: 10,
      }}>
        {t('inventory.bookingRequestModal.заявка_отправлена')}</div>
      <div style={{
        fontSize: 24, fontWeight: 500, letterSpacing: '-0.02em',
        color: 'var(--app-text, #ffffff)', marginBottom: 8,
      }}>
        {unit.title}
      </div>
      {unit.subtitle && (
        <div style={{ fontSize: 16, color: 'rgba(255,255,255,0.72)', marginBottom: 16, lineHeight: 1.5 }}>
          {unit.subtitle}
        </div>
      )}
      <div style={{
        padding: '14px 20px',
        background: 'var(--workspace-row-bg, rgba(0,28,20,0.48))',
        boxShadow: 'inset 0 0 0 1px rgba(201,168,76,0.18)',
        borderRadius: 6,
        fontSize: 16, color: 'rgba(255,255,255,0.72)',
        lineHeight: 1.7, marginBottom: 24, textAlign: 'left',
      }}>
        <div>{t('inventory.bookingRequestModal.с')}<span style={{ color: 'var(--theme-accent-heading)' }}>{fmtIso(startsAt)}</span></div>
        <div>{t('inventory.bookingRequestModal.по')}<span style={{ color: 'var(--theme-accent-heading)' }}>{fmtIso(expiresAt)}</span></div>
      </div>
      <button
        type="button"
        onClick={onClose}
        style={{
          padding: '11px 32px',
          borderRadius: 4,
          border: 'none',
          boxShadow: 'inset 0 0 0 1px rgba(201,168,76,0.18)',
          background: 'var(--workspace-row-bg, rgba(0,28,20,0.48))',
          color: 'rgba(255,255,255,0.72)',
          fontSize: 16,
          cursor: 'pointer',
          fontFamily: "'Montserrat', sans-serif",
        }}
      >
        {t('inventory.bookingRequestModal.закрыть')}</button>
    </div>
  )
}
