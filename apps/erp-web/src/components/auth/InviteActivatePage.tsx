import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { teamApi } from '@/services/teamApi'

/**
 * Публичная страница активации приглашения (/invite/:token).
 * Приглашённый сотрудник попадает сюда по ссылке от менеджера (email не отправляется —
 * ссылкой делятся вручную), ставит пароль и после этого может войти под своим email.
 * См. docs/tracking/teams-tracker.md §3 (инвайт-флоу).
 */
export function InviteActivatePage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [repeatPassword, setRepeatPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activatedEmail, setActivatedEmail] = useState<string | null>(null)

  const mismatch = repeatPassword.length > 0 && password !== repeatPassword
  const canSubmit = !!token && password.length >= 6 && password === repeatPassword && !submitting

  const submit = async () => {
    if (!canSubmit || !token) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await teamApi.activateInvite(token, password)
      setActivatedEmail(result.email)
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (err as { message?: string })?.message ||
        'Не удалось активировать приглашение'
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 42, padding: '0 14px', borderRadius: 6,
    border: '1px solid var(--green-border, rgba(255,255,255,0.15))',
    background: 'var(--green-deep, #0d1f17)', color: 'var(--workspace-text, #e8e6e0)',
    fontSize: 15, outline: 'none',
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--app-bg, #0a1812)', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 400, background: 'var(--green-card, #12271d)', border: '1px solid var(--gold, #c9a84c)', borderRadius: 8, padding: 28, boxShadow: '0 24px 64px rgba(0,0,0,0.55)' }}>
        {activatedEmail ? (
          <>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--workspace-text, #e8e6e0)', marginBottom: 8 }}>Пароль установлен</div>
            <div style={{ fontSize: 14, color: 'var(--workspace-text-dim, #9aa79f)', marginBottom: 20 }}>
              Аккаунт {activatedEmail} активирован. Теперь можно войти в систему.
            </div>
            <button
              type="button"
              onClick={() => navigate('/login')}
              style={{ width: '100%', height: 42, borderRadius: 6, border: '1px solid var(--gold, #c9a84c)', background: 'var(--gold, #c9a84c)', color: 'var(--gold-btn-text, #1a1a1a)', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
            >
              Войти
            </button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--workspace-text, #e8e6e0)', marginBottom: 8 }}>Приглашение в команду</div>
            <div style={{ fontSize: 14, color: 'var(--workspace-text-dim, #9aa79f)', marginBottom: 20 }}>
              Придумайте пароль для входа в аккаунт.
            </div>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--workspace-text-dim, #9aa79f)', marginBottom: 6 }}>Пароль</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Минимум 6 символов"
              style={{ ...inputStyle, marginBottom: 14 }}
            />
            <label style={{ display: 'block', fontSize: 13, color: 'var(--workspace-text-dim, #9aa79f)', marginBottom: 6 }}>Повторите пароль</label>
            <input
              type="password"
              value={repeatPassword}
              onChange={(e) => setRepeatPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void submit() }}
              placeholder="Ещё раз"
              style={{ ...inputStyle, marginBottom: mismatch || error ? 8 : 20 }}
            />
            {mismatch && (
              <div style={{ fontSize: 13, color: '#e2725b', marginBottom: 12 }}>Пароли не совпадают</div>
            )}
            {error && (
              <div style={{ fontSize: 13, color: '#e2725b', marginBottom: 12 }}>{error}</div>
            )}
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!canSubmit}
              style={{ width: '100%', height: 42, borderRadius: 6, border: '1px solid var(--gold, #c9a84c)', background: 'var(--gold, #c9a84c)', color: 'var(--gold-btn-text, #1a1a1a)', fontSize: 15, fontWeight: 600, cursor: canSubmit ? 'pointer' : 'not-allowed', opacity: canSubmit ? 1 : 0.5 }}
            >
              {submitting ? 'Сохраняем…' : 'Установить пароль'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
