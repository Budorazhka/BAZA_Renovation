import { type ReactNode, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeftRight,
  Building2,
  ChevronLeft,
  Megaphone,
  MessageSquare,
  MessagesSquare,
  type LucideIcon,
} from 'lucide-react'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { communityApi } from '@/services/communityApi'
import { INTENT_LABEL, SECTIONS, type ExchangeIntent, type ThreadType } from './forumData'
import { cardClass, FORUM_BASE, ForumShell, GOLD } from './forumKit'
import { useI18n } from "@/i18n";

const TYPE_OPTIONS: Array<{ key: ThreadType; label: string; icon: LucideIcon; restricted?: boolean }> = [
  { key: 'discussion', label: 'Обсуждение', icon: MessageSquare },
  { key: 'question', label: 'Вопрос', icon: MessagesSquare },
  { key: 'exchange', label: 'Биржа', icon: ArrowLeftRight },
  { key: 'announcement', label: 'Анонс', icon: Megaphone, restricted: true },
  { key: 'showcase', label: 'Новостройки', icon: Building2, restricted: true },
]

const categorySections = SECTIONS.filter((s) => s.kind === 'category' || s.kind === 'feed')

const inputStyle = {
  background: 'rgba(3,29,22,0.5)',
  color: 'var(--workspace-text)',
  boxShadow: 'inset 0 0 0 1px var(--workspace-row-border)',
} as const

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[16px] uppercase tracking-[0.08em]" style={{ color: 'var(--workspace-text-dim)' }}>{label}</span>
      {children}
    </label>
  )
}

const fieldClass = 'w-full rounded-[4px] px-3 py-2.5 text-[17px] outline-none placeholder:text-[color:var(--workspace-text-dim)]'

export default function NewThreadPage() {
    const { t } = useI18n();
  const navigate = useNavigate()
  const [type, setType] = useState<ThreadType>('discussion')
  const [sectionId, setSectionId] = useState('law')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [tags, setTags] = useState('')
  const [intent, setIntent] = useState<ExchangeIntent>('client_handover')
  const [dealKind, setDealKind] = useState('')
  const [location, setLocation] = useState('')
  const [amount, setAmount] = useState('')
  const [commission, setCommission] = useState('')
  const [deadline, setDeadline] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const isExchange = type === 'exchange'

  const handleSubmit = async () => {
    if (!title.trim() || !body.trim()) return
    setSubmitting(true)
    try {
      const thread = await communityApi.createThread({
        type,
        sectionId: isExchange ? 'exchange' : sectionId,
        title: title.trim(),
        body: body.trim(),
        tags: tags.split(/[\s,]+/).filter(Boolean).map((t) => t.replace(/^#/, '')),
        exchange: isExchange
          ? {
              intent,
              side: (['rent_seek', 'buy_seek', 'partner_seek'].includes(intent) ? 'demand' : 'supply') as 'demand' | 'supply',
              dealKind: dealKind || 'Не указано',
              location: location || 'Не указано',
              amount: amount || 'по договорённости',
              commission: commission || undefined,
              deadline: deadline || undefined,
            }
          : undefined,
      })
      if (thread) {
        navigate(isExchange ? `${FORUM_BASE}/exchange` : `${FORUM_BASE}/t/${thread.id}`)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <DashboardShell>
      <ForumShell active="home">
        <button
          type="button"
          onClick={() => navigate(FORUM_BASE)}
          className="mb-3 inline-flex items-center gap-1.5 text-[16px] transition-colors hover:text-[color:var(--theme-accent-heading)]"
          style={{ color: 'var(--workspace-text-dim)' }}
        >
          <ChevronLeft size={16} strokeWidth={1.75} />
          {t('community.forum.newThreadPage.сообщество')}</button>

        <div className="mx-auto w-full max-w-[760px]">
          <h2 className="mb-4 text-[24px] tracking-[-0.02em]" style={{ color: 'var(--theme-accent-heading)', fontWeight: 500 }}>
            {t('community.forum.newThreadPage.новая_тема')}</h2>

          {/* Шаг 1 — тип */}
          <section className={`${cardClass} p-5`}>
            <p className="mb-3 text-[16px] uppercase tracking-[0.08em]" style={{ color: 'var(--workspace-text-dim)' }}>{t('community.forum.newThreadPage.1_тип')}</p>
            <div className="flex flex-wrap gap-2.5">
              {TYPE_OPTIONS.map((opt) => {
                const isActive = type === opt.key
                const Icon = opt.icon
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setType(opt.key)}
                    className="inline-flex items-center gap-2 rounded-[4px] px-3.5 py-2.5 text-[17px] transition-colors"
                    style={{
                      color: isActive ? 'var(--gold-btn-text)' : 'var(--workspace-text-muted)',
                      background: isActive ? GOLD : 'var(--workspace-row-bg)',
                      fontWeight: isActive ? 500 : 400,
                      boxShadow: isActive ? 'none' : 'inset 0 0 0 1px var(--workspace-row-border)',
                    }}
                  >
                    <Icon size={18} strokeWidth={1.75} />
                    {opt.label}
                    {opt.restricted && (
                      <span className="text-[16px]" style={{ color: isActive ? 'var(--gold-btn-text)' : 'var(--workspace-text-dim)' }}>{t('community.forum.newThreadPage.компания')}</span>
                    )}
                  </button>
                )
              })}
            </div>
          </section>

          {/* Шаг 2 — детали */}
          <section className={`${cardClass} mt-4 p-5`}>
            <p className="mb-4 text-[16px] uppercase tracking-[0.08em]" style={{ color: 'var(--workspace-text-dim)' }}>{t('community.forum.newThreadPage.2_детали')}</p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t('community.forum.newThreadPage.раздел')}>
                <select className={fieldClass} style={inputStyle} value={isExchange ? 'exchange' : sectionId} onChange={(e) => setSectionId(e.target.value)} disabled={isExchange}>
                  {isExchange ? (
                    <option value="exchange">{t('community.forum.newThreadPage.биржа')}</option>
                  ) : (
                    categorySections.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))
                  )}
                </select>
              </Field>

              {isExchange && (
                <Field label={t('community.forum.newThreadPage.интент')}>
                  <select className={fieldClass} style={inputStyle} value={intent} onChange={(e) => setIntent(e.target.value as ExchangeIntent)}>
                    {(Object.keys(INTENT_LABEL) as Array<keyof typeof INTENT_LABEL>).map((k) => (
                      <option key={k} value={k}>{INTENT_LABEL[k]}</option>
                    ))}
                  </select>
                </Field>
              )}

              <div className="sm:col-span-2">
                <Field label={t('community.forum.newThreadPage.заголовок')}>
                  <input className={fieldClass} style={inputStyle} placeholder={t('community.forum.newThreadPage.коротко_и_по_делу')} value={title} onChange={(e) => setTitle(e.target.value)} />
                </Field>
              </div>

              {isExchange && (
                <>
                  <Field label={t('community.forum.newThreadPage.тип_сделки')}>
                    <input className={fieldClass} style={inputStyle} placeholder={t('community.forum.newThreadPage.покупка_вторичка')} value={dealKind} onChange={(e) => setDealKind(e.target.value)} />
                  </Field>
                  <Field label={t('community.forum.newThreadPage.локация')}>
                    <input className={fieldClass} style={inputStyle} placeholder={t('community.forum.newThreadPage.город_район')} value={location} onChange={(e) => setLocation(e.target.value)} />
                  </Field>
                  <Field label={t('community.forum.newThreadPage.бюджет_цена')}>
                    <input className={fieldClass} style={inputStyle} placeholder={t('community.forum.newThreadPage.до_400_000')} value={amount} onChange={(e) => setAmount(e.target.value)} />
                  </Field>
                  <Field label={t('community.forum.newThreadPage.комиссия')}>
                    <input className={fieldClass} style={inputStyle} placeholder="30" value={commission} onChange={(e) => setCommission(e.target.value)} />
                  </Field>
                  <Field label={t('community.forum.newThreadPage.срок')}>
                    <input className={fieldClass} style={inputStyle} placeholder={t('community.forum.newThreadPage.до_30_04')} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
                  </Field>
                </>
              )}

              <div className="sm:col-span-2">
                <Field label={t('community.forum.newThreadPage.описание')}>
                  <textarea rows={5} className={`${fieldClass} resize-none`} style={inputStyle} value={body} onChange={(e) => setBody(e.target.value)} />
                </Field>
              </div>

              <div className="sm:col-span-2">
                <Field label={t('community.forum.newThreadPage.теги')}>
                  <input className={fieldClass} style={inputStyle} placeholder={t('community.forum.newThreadPage.эскроу_спб')} value={tags} onChange={(e) => setTags(e.target.value)} />
                </Field>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => navigate(FORUM_BASE)}
                className="rounded-[4px] px-4 py-2.5 text-[17px] transition-colors"
                style={{ color: 'var(--workspace-text-muted)', boxShadow: 'inset 0 0 0 1px var(--workspace-row-border)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--workspace-row-bg)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {t('community.forum.newThreadPage.отмена')}</button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !title.trim() || !body.trim()}
                className="rounded-[4px] px-4 py-2.5 text-[17px] transition-colors disabled:opacity-50"
                style={{ background: GOLD, color: 'var(--gold-btn-text)', fontWeight: 500 }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--gold-light)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = GOLD)}
              >
                {submitting ? 'Публикация...' : 'Опубликовать тему'}
              </button>
            </div>
          </section>
        </div>
      </ForumShell>
    </DashboardShell>
  )
}
