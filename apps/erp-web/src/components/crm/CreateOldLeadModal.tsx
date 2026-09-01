import { useEffect, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import {
  developmentApi,
  type CreateOldLeadPayload,
  type OldLead,
  type OldLeadStatus,
} from '@/services/developmentApi'
import { useI18n } from '@/i18n'

const PRIMARY = 'var(--gold)'
const SURFACE = 'var(--green-deep)'
const DIALOG_BG = 'var(--rail-bg)'

const STATUS_OPTIONS: OldLeadStatus[] = ['active', 'deleted', 'converted']

function apiErrorMessage(err: unknown, fallback: string): string {
  const axiosMsg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
  if (typeof axiosMsg === 'string' && axiosMsg.trim()) return axiosMsg.trim()
  if (err instanceof Error && err.message.trim()) return err.message.trim()
  return fallback
}

const inputBase = {
  width: '100%' as const,
  height: 44,
  padding: '0 14px',
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.12)',
  background: SURFACE,
  color: '#e8f2ec',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box' as const,
  fontFamily: 'inherit',
}

const labelStyle = {
  display: 'block' as const,
  fontSize: 13,
  fontWeight: 400 as const,
  color: 'rgba(220,230,224,0.92)',
  marginBottom: 6,
}

type Props = {
  open: boolean
  onClose: () => void
  onCreated: (lead: OldLead) => void
}

export function CreateOldLeadModal({ open, onClose, onCreated }: Props) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [telegram, setTelegram] = useState('')
  const [lastContactTime, setLastContactTime] = useState('')
  const [status, setStatus] = useState<OldLeadStatus>('active')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setName('')
    setWhatsapp('')
    setTelegram('')
    setLastContactTime('')
    setStatus('active')
    setDescription('')
    setError(null)
    setSaving(false)
  }, [open])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const trimmedName = name.trim()
    if (!trimmedName) {
      setError(t('oldLeads.create.nameRequired'))
      return
    }

    const payload: CreateOldLeadPayload = { name: trimmedName, status }
    if (whatsapp.trim()) payload.whatsapp = whatsapp.trim()
    if (telegram.trim()) payload.telegram = telegram.trim()
    if (description.trim()) payload.description = description.trim()
    if (lastContactTime) {
      const parsed = new Date(lastContactTime)
      if (!Number.isNaN(parsed.getTime())) payload.lastContactTime = parsed.toISOString()
    }

    setSaving(true)
    try {
      const resp = await developmentApi.createOldLead(payload)
      if (!resp.success || !resp.data) {
        throw new Error(resp.message || t('oldLeads.create.failed'))
      }
      onCreated(resp.data)
      onClose()
    } catch (err) {
      setError(apiErrorMessage(err, t('oldLeads.create.failed')))
    } finally {
      setSaving(false)
    }
  }

  const modal = (
    <>
      <div
        role="presentation"
        aria-hidden
        style={{ position: 'fixed', inset: 0, zIndex: 10100, background: 'rgba(0,0,0,0.55)' }}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal
        aria-labelledby="create-old-lead-title"
        style={{
          position: 'fixed',
          zIndex: 10101,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(520px, calc(100vw - 28px))',
          maxHeight: 'min(90vh, 780px)',
          overflowY: 'auto',
          padding: 22,
          background: DIALOG_BG,
          border: `2px solid ${PRIMARY}`,
          borderRadius: 14,
          boxShadow: '0 24px 64px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.05)',
          boxSizing: 'border-box',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 18,
          }}
        >
          <h2
            id="create-old-lead-title"
            style={{ margin: 0, fontSize: 18, fontWeight: 400, color: '#fff', lineHeight: 1.25 }}
          >
            {t('oldLeads.create.title')}
          </h2>
          <button
            type="button"
            aria-label={t('oldLeads.create.cancel')}
            onClick={onClose}
            style={{
              flexShrink: 0,
              width: 36,
              height: 36,
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(0,0,0,0.35)',
              color: 'rgba(220,230,224,0.85)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <label style={{ display: 'block', marginBottom: 14 }}>
            <span style={labelStyle}>
              {t('oldLeads.columns.name')}
              <span style={{ color: '#fb923c' }}>*</span>
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('oldLeads.create.namePlaceholder')}
              style={inputBase}
              autoFocus
            />
          </label>

          <label style={{ display: 'block', marginBottom: 14 }}>
            <span style={labelStyle}>{t('oldLeads.columns.whatsapp')}</span>
            <input
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="+7 …"
              inputMode="tel"
              style={inputBase}
            />
          </label>

          <label style={{ display: 'block', marginBottom: 14 }}>
            <span style={labelStyle}>{t('oldLeads.columns.telegram')}</span>
            <input
              value={telegram}
              onChange={(e) => setTelegram(e.target.value)}
              placeholder="@username"
              style={inputBase}
            />
          </label>

          <label style={{ display: 'block', marginBottom: 14 }}>
            <span style={labelStyle}>{t('oldLeads.columns.lastContact')}</span>
            <input
              type="datetime-local"
              value={lastContactTime}
              onChange={(e) => setLastContactTime(e.target.value)}
              style={{ ...inputBase, cursor: 'pointer' }}
            />
          </label>

          <label style={{ display: 'block', marginBottom: 14 }}>
            <span style={labelStyle}>
              {t('oldLeads.columns.status')}
              <span style={{ color: '#fb923c' }}>*</span>
            </span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as OldLeadStatus)}
              style={{ ...inputBase, height: 48, cursor: 'pointer' }}
            >
              {STATUS_OPTIONS.map((key) => (
                <option key={key} value={key}>
                  {t(`oldLeads.status.${key}`)}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: 'block', marginBottom: error ? 12 : 18 }}>
            <span style={labelStyle}>{t('oldLeads.columns.description')}</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              style={{
                ...inputBase,
                height: 'auto',
                minHeight: 80,
                padding: '12px 14px',
                resize: 'vertical' as const,
              }}
            />
          </label>

          {error && (
            <p style={{ margin: '0 0 14px', fontSize: 13, color: '#fb923c', lineHeight: 1.4 }}>{error}</p>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                height: 48,
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'transparent',
                color: 'rgba(220,230,224,0.9)',
                fontSize: 14,
                fontWeight: 400,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {t('oldLeads.create.cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                flex: 1,
                height: 48,
                borderRadius: 10,
                border: 'none',
                background: '#a07828',
                color: '#fff',
                fontSize: 14,
                fontWeight: 400,
                cursor: saving ? 'default' : 'pointer',
                opacity: saving ? 0.6 : 1,
                fontFamily: 'inherit',
                letterSpacing: '0.04em',
              }}
            >
              {saving ? t('oldLeads.create.saving') : t('oldLeads.create.submit')}
            </button>
          </div>
        </form>
      </div>
    </>
  )

  return createPortal(modal, document.body)
}
