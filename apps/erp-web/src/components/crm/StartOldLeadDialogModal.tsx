import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { developmentApi, type OldLead } from '@/services/developmentApi'
import { messengerApi, isMessengerAccountConnected, type Account } from '@/services/messengerApi'
import { useI18n } from '@/i18n'

const PRIMARY = 'var(--gold)'
const SURFACE = 'var(--green-deep)'
const DIALOG_BG = 'var(--rail-bg)'

type Channel = 'whatsapp' | 'telegram'

/**
 * Шаблон первого сообщения. Это текст для клиента, а не интерфейс, поэтому он
 * не зависит от языка ERP — старые лиды русскоязычные.
 */
const DEFAULT_MESSAGE =
  'Добрый день, вы ранее интересовались недвижимостью в Батуми. Есть у вас актуальность в получении информации о текущих проектах и предложениях?'

function apiErrorMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { message?: string; error?: string } } })?.response?.data
  const fromApi = data?.error || data?.message
  if (typeof fromApi === 'string' && fromApi.trim()) return fromApi.trim()
  if (err instanceof Error && err.message.trim()) return err.message.trim()
  return fallback
}

function accountLabel(account: Account): string {
  if (account.name?.trim()) return account.name.trim()
  if (account.telegramBotUsername) return `@${account.telegramBotUsername}`
  if (account.telegramPhoneNumber) return account.telegramPhoneNumber
  return account._id
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
  /** Монтируется только на время показа — состояние сбрасывается вместе с размонтированием. */
  lead: OldLead
  onClose: () => void
  onStarted: (lead: OldLead) => void
}

export function StartOldLeadDialogModal({ lead, onClose, onStarted }: Props) {
  const { t } = useI18n()
  const navigate = useNavigate()

  const whatsapp = lead.whatsapp?.trim() || ''
  const telegram = lead.telegram?.trim() || ''
  const availableChannels: Channel[] = [
    ...(whatsapp ? (['whatsapp'] as Channel[]) : []),
    ...(telegram ? (['telegram'] as Channel[]) : []),
  ]

  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountsLoading, setAccountsLoading] = useState(true)
  const [channel, setChannel] = useState<Channel>(whatsapp ? 'whatsapp' : 'telegram')
  const [pickedAccountId, setPickedAccountId] = useState('')
  const [text, setText] = useState(DEFAULT_MESSAGE)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [startedDialogId, setStartedDialogId] = useState<string | null>(null)

  const channelAccounts = accounts.filter(
    (a) => a.platform === channel && isMessengerAccountConnected(a),
  )
  const accountId = channelAccounts.some((a) => a._id === pickedAccountId)
    ? pickedAccountId
    : (channelAccounts[0]?._id ?? '')
  const to = channel === 'whatsapp' ? whatsapp : telegram

  useEffect(() => {
    let cancelled = false
    messengerApi
      .getAccounts()
      .then((resp) => {
        if (cancelled) return
        setAccounts(Array.isArray(resp?.accounts) ? resp.accounts : [])
      })
      .catch((err) => {
        if (cancelled) return
        setAccounts([])
        setError(apiErrorMessage(err, t('oldLeads.startDialog.accountsFailed')))
      })
      .finally(() => {
        if (!cancelled) setAccountsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [t])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleOpenChats = useCallback(() => {
    onClose()
    navigate(startedDialogId ? `/dashboard/chats?dialog=${startedDialogId}` : '/dashboard/chats')
  }, [navigate, onClose, startedDialogId])

  if (typeof document === 'undefined') return null

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const message = text.trim()
    if (!to) {
      setError(t('oldLeads.startDialog.noContact'))
      return
    }
    if (!accountId) {
      setError(t('oldLeads.startDialog.noAccounts'))
      return
    }
    if (!message) {
      setError(t('oldLeads.startDialog.messageRequired'))
      return
    }

    setSending(true)
    try {
      const resp = await messengerApi.startDialog(accountId, {
        to,
        text: message,
        name: lead.name || undefined,
        notes: lead.description || undefined,
        crmOldLeadId: lead.id,
      })
      if (!resp?.success || !resp.dialog?._id) {
        throw new Error(resp?.error || t('oldLeads.startDialog.failed'))
      }
      setStartedDialogId(String(resp.dialog._id))

      // Диалог уже начат — провал PATCH не должен выглядеть как ошибка отправки.
      const lastContactTime = new Date().toISOString()
      const patched = await developmentApi
        .updateOldLead(lead.id, { status: 'converted', lastContactTime })
        .catch(() => null)
      onStarted(patched?.data ?? { ...lead, status: 'converted', lastContactTime })
    } catch (err) {
      setError(apiErrorMessage(err, t('oldLeads.startDialog.failed')))
    } finally {
      setSending(false)
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
        aria-labelledby="start-old-lead-dialog-title"
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
            id="start-old-lead-dialog-title"
            style={{ margin: 0, fontSize: 18, fontWeight: 400, color: '#fff', lineHeight: 1.25 }}
          >
            {startedDialogId
              ? t('oldLeads.startDialog.successTitle')
              : t('oldLeads.startDialog.title')}
          </h2>
          <button
            type="button"
            aria-label={t('oldLeads.startDialog.close')}
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

        {startedDialogId ? (
          <>
            <p style={{ margin: '0 0 18px', fontSize: 13, lineHeight: 1.5, color: 'rgba(220,230,224,0.9)' }}>
              {t('oldLeads.startDialog.successText')}
            </p>
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
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {t('oldLeads.startDialog.close')}
              </button>
              <button
                type="button"
                onClick={handleOpenChats}
                style={{
                  flex: 1,
                  height: 48,
                  borderRadius: 10,
                  border: 'none',
                  background: '#a07828',
                  color: '#fff',
                  fontSize: 14,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  letterSpacing: '0.04em',
                }}
              >
                {t('oldLeads.startDialog.openChats')}
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <label style={{ display: 'block', marginBottom: 14 }}>
              <span style={labelStyle}>{t('oldLeads.startDialog.channel')}</span>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as Channel)}
                disabled={availableChannels.length < 2}
                style={{ ...inputBase, height: 48, cursor: 'pointer' }}
              >
                {availableChannels.map((key) => (
                  <option key={key} value={key}>
                    {t(`oldLeads.columns.${key}`)}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: 'block', marginBottom: 14 }}>
              <span style={labelStyle}>{t('oldLeads.startDialog.to')}</span>
              <input value={to || '—'} readOnly style={{ ...inputBase, opacity: 0.75 }} />
            </label>

            <label style={{ display: 'block', marginBottom: 14 }}>
              <span style={labelStyle}>{t('oldLeads.startDialog.account')}</span>
              <select
                value={accountId}
                onChange={(e) => setPickedAccountId(e.target.value)}
                disabled={accountsLoading || channelAccounts.length === 0}
                style={{ ...inputBase, height: 48, cursor: 'pointer' }}
              >
                {accountsLoading && <option value="">{t('oldLeads.startDialog.loadingAccounts')}</option>}
                {!accountsLoading && channelAccounts.length === 0 && (
                  <option value="">{t('oldLeads.startDialog.noAccounts')}</option>
                )}
                {channelAccounts.map((account) => (
                  <option key={account._id} value={account._id}>
                    {accountLabel(account)}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: 'block', marginBottom: error ? 12 : 18 }}>
              <span style={labelStyle}>
                {t('oldLeads.startDialog.message')}
                <span style={{ color: '#fb923c' }}>*</span>
              </span>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={5}
                autoFocus
                style={{
                  ...inputBase,
                  height: 'auto',
                  minHeight: 132,
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
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {t('oldLeads.startDialog.cancel')}
              </button>
              <button
                type="submit"
                disabled={sending || !accountId || !to}
                style={{
                  flex: 1,
                  height: 48,
                  borderRadius: 10,
                  border: 'none',
                  background: '#a07828',
                  color: '#fff',
                  fontSize: 14,
                  cursor: sending ? 'default' : 'pointer',
                  opacity: sending || !accountId || !to ? 0.6 : 1,
                  fontFamily: 'inherit',
                  letterSpacing: '0.04em',
                }}
              >
                {sending ? t('oldLeads.startDialog.sending') : t('oldLeads.startDialog.submit')}
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  )

  return createPortal(modal, document.body)
}
