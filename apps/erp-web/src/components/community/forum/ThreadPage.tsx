import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { CheckCircle2, ChevronLeft, Eye } from 'lucide-react'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { communityApi } from '@/services/communityApi'
import { getMember, getSection, THREAD_TYPE_LABEL } from './forumData'
import type { ForumAuthor, ForumReply, ForumThread } from './forumData'
import {
  AuthorLine,
  cardClass,
  FORUM_BASE,
  ForumShell,
  GOLD,
  IntentTag,
  MemberAvatar,
  MINT,
  MotionDiv,
  ReactionButton,
  rowClass,
  StatusDot,
  ThreadTypeIcon,
  useListVariants,
} from './forumKit'
import { ForumLoader } from './ForumLoader'
import { useI18n } from "@/i18n";

export default function ThreadPage() {
    const { t } = useI18n();
  const { threadId = '' } = useParams()
  const navigate = useNavigate()
  const [draft, setDraft] = useState('')
  const [thread, setThread] = useState<ForumThread | null>(null)
  const [replies, setReplies] = useState<ForumReply[]>([])
  const [loading, setLoading] = useState(true)
  const [replyLoading, setReplyLoading] = useState(false)
  const { container, item } = useListVariants()

  useEffect(() => {
    if (!threadId) return
    let cancelled = false
    const load = async () => {
      const t = await communityApi.getThreadById(threadId)
      if (cancelled) return
      setThread(t)
      if (t) {
        const result = await communityApi.getReplies(threadId, { sort: 'best_first', pageSize: 50 })
        if (!cancelled) setReplies(result.items)
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [threadId])

  const handleReaction = async () => {
    if (!thread) return
    try {
      const result = await communityApi.toggleThreadReaction(thread.id)
      setThread({ ...thread, reactions: result.reactionCount })
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'Не удалось поставить реакцию')
    }
  }

  const handleReplyReaction = async (replyId: string) => {
    try {
      const result = await communityApi.toggleReplyReaction(replyId)
      setReplies((prev) => prev.map((r) => (r.id === replyId ? { ...r, reactions: result.reactionCount } : r)))
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'Не удалось поставить реакцию')
    }
  }

  const handleSetBest = async (replyId: string) => {
    if (!thread) return
    try {
      const result = await communityApi.setBestReply(thread.id, replyId)
      setThread({ ...thread, solved: result.threadSolved })
      setReplies((prev) => prev.map((r) => ({ ...r, isBest: r.id === replyId ? result.isBest : false })))
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'Не удалось отметить лучший ответ')
    }
  }

  const handleSendReply = async () => {
    if (!thread || !draft.trim()) return
    setReplyLoading(true)
    try {
      const reply = await communityApi.createReply(thread.id, draft.trim())
      setReplies((prev) => [...prev, reply])
      setDraft('')
      setThread({ ...thread, replyCount: thread.replyCount + 1 })
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'Не удалось отправить ответ')
    } finally {
      setReplyLoading(false)
    }
  }

  if (loading) {
    return (
      <DashboardShell>
        <ForumShell active="home">
          <ForumLoader text="Загрузка темы..." />
        </ForumShell>
      </DashboardShell>
    )
  }

  if (!thread) {
    return (
      <DashboardShell>
        <ForumShell active="home">
          <div className={`${cardClass} px-5 py-10 text-center text-[17px]`} style={{ color: 'var(--workspace-text-muted)' }}>
            {t('community.forum.threadPage.тема_не_найдена')}</div>
        </ForumShell>
      </DashboardShell>
    )
  }

  const section = getSection(thread.sectionId)
  // API всегда отдаёт снимок автора (community.service.ts::DEFAULT_AUTHOR_SNAPSHOT
  // как минимум) — getMember нужен только демо-тредам мока, которых в проде не бывает.
  const author = thread.author ?? getMember(thread.authorId)
  const best = replies.find((r) => r.isBest)
  const rest = replies.filter((r) => !r.isBest)
  const ex = thread.exchange

  return (
    <DashboardShell>
      <ForumShell active={section?.id ?? 'home'}>
        <button
          type="button"
          onClick={() => navigate(section ? `${FORUM_BASE}/c/${section.id}` : FORUM_BASE)}
          className="mb-3 inline-flex items-center gap-1.5 text-[16px] transition-colors hover:text-[color:var(--theme-accent-heading)]"
          style={{ color: 'var(--workspace-text-dim)' }}
        >
          <ChevronLeft size={16} strokeWidth={1.75} />
          {section?.name ?? 'Сообщество'}
        </button>

        <article className={`${cardClass} p-5`}>
          <div className="flex items-center gap-2 text-[16px] uppercase tracking-[0.08em]" style={{ color: 'var(--theme-accent-heading)' }}>
            <ThreadTypeIcon type={thread.type} />
            <span>{THREAD_TYPE_LABEL[thread.type]}</span>
            {thread.solved && (
              <span className="inline-flex items-center gap-1.5" style={{ color: GOLD }}>
                <CheckCircle2 size={16} strokeWidth={2} /> {t('community.forum.threadPage.реш_н')}</span>
            )}
          </div>

          {ex && (
            <div className="mt-3">
              <IntentTag intent={ex.intent} />
            </div>
          )}

          <h1 className="mt-3 text-[24px] leading-snug tracking-[-0.02em]" style={{ color: 'var(--workspace-text)', fontWeight: 500 }}>
            {thread.title}
          </h1>

          {author && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <MemberAvatar member={author} />
              <div className="min-w-0">
                <AuthorLine authorId={thread.authorId} author={thread.author} />
                <p className="text-[16px]" style={{ color: 'var(--workspace-text-dim)' }}>
                  {author.company ? `${author.company} · ` : ''}{thread.createdAgo} {t('community.forum.threadPage.назад')}</p>
              </div>
              <span className="ml-auto flex items-center gap-4">
                <span className="inline-flex items-center gap-1.5 text-[16px]" style={{ color: 'var(--workspace-text-dim)' }}>
                  <Eye size={16} strokeWidth={1.75} />
                  {thread.views}
                </span>
                <ReactionButton count={thread.reactions} onClick={handleReaction} />
              </span>
            </div>
          )}

          {ex && (
            <div className={`${rowClass} mt-4 p-4`}>
              <div className="grid grid-cols-1 gap-x-8 gap-y-2 text-[17px] sm:grid-cols-2" style={{ color: 'var(--workspace-text-muted)' }}>
                <div className="flex justify-between gap-4"><span>{t('community.forum.threadPage.тип_сделки')}</span><span style={{ color: 'var(--workspace-text)' }}>{ex.dealKind}</span></div>
                <div className="flex justify-between gap-4"><span>{t('community.forum.threadPage.локация')}</span><span style={{ color: 'var(--workspace-text)' }}>{ex.location}</span></div>
                <div className="flex justify-between gap-4"><span>{ex.side === 'demand' ? 'Бюджет' : 'Цена'}</span><span style={{ color: ex.side === 'demand' ? MINT : GOLD }}>{ex.amount}</span></div>
                {ex.commission && <div className="flex justify-between gap-4"><span>{t('community.forum.threadPage.комиссия')}</span><span style={{ color: 'var(--workspace-text)' }}>{ex.commission}</span></div>}
                {ex.deadline && <div className="flex justify-between gap-4"><span>{t('community.forum.threadPage.срок')}</span><span style={{ color: 'var(--workspace-text)' }}>{ex.deadline}</span></div>}
                <div className="flex justify-between gap-4"><span>{t('community.forum.threadPage.статус')}</span><StatusDot status={ex.status} /></div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2.5">
                <button
                  type="button"
                  className="rounded-[4px] px-4 py-2.5 text-[17px] transition-colors"
                  style={{ background: GOLD, color: 'var(--gold-btn-text)', fontWeight: 500 }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--gold-light)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = GOLD)}
                >
                  {t('community.forum.threadPage.взять_в_работу')}</button>
                <button
                  type="button"
                  onClick={() => navigate('/dashboard/leads/poker')}
                  className="rounded-[4px] px-4 py-2.5 text-[17px] transition-colors"
                  style={{ color: GOLD, boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--forum-gold) 40%, transparent)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'color-mix(in srgb, var(--forum-gold) 12%, transparent)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  {t('community.forum.threadPage.создать_лид_в_crm')}</button>
              </div>
            </div>
          )}

          {/* Полный текст темы, не превью: до 11.09.2026 (N-08) страница темы
              показывала thread.excerpt (обрезанное превью для карточек списка) —
              настоящий текст поста нигде не отображался. thread.body — то же
              Markdown-сырьё, что принял POST /community/threads; рендерится как
              простой текст с переносами строк, не как размеченный HTML. */}
          <p className="mt-4 whitespace-pre-wrap text-[19px] leading-relaxed" style={{ color: 'var(--workspace-text)' }}>
            {thread.body ?? thread.excerpt}
          </p>

          {thread.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {thread.tags.map((tag) => (
                <span key={tag} className="rounded-[4px] px-2.5 py-1 text-[16px]" style={{ color: 'var(--workspace-text-muted)', background: 'var(--workspace-row-bg)' }}>
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </article>

        {best && (
          <div
            className="mt-4 rounded-[6px] p-4"
            style={{ background: 'var(--hub-card-bg)', boxShadow: 'inset 0 0 0 1px color-mix(in srgb, #e6c364 42%, transparent)' }}
          >
            <p className="mb-2 inline-flex items-center gap-1.5 text-[16px] uppercase tracking-[0.08em]" style={{ color: GOLD }}>
              <CheckCircle2 size={16} strokeWidth={2} /> {t('community.forum.threadPage.лучший_ответ')}</p>
            <ReplyBody authorId={best.authorId} author={best.author} createdAgo={best.createdAgo} body={best.body} reactions={best.reactions}
              onReaction={() => handleReplyReaction(best.id)} onSetBest={() => handleSetBest(best.id)} isBest />
          </div>
        )}

        <h2 className="mb-3 mt-5 text-[16px] uppercase tracking-[0.08em]" style={{ color: 'var(--workspace-text-dim)' }}>
          {replies.length} {pluralReplies(replies.length)}
        </h2>

        <MotionDiv variants={container} initial="hidden" animate="show" className="flex flex-col gap-2.5">
          {rest.map((r) => (
            <MotionDiv key={r.id} variants={item} className={`${rowClass} p-4`}>
              <ReplyBody authorId={r.authorId} author={r.author} createdAgo={r.createdAgo} body={r.body} reactions={r.reactions}
                onReaction={() => handleReplyReaction(r.id)} onSetBest={() => handleSetBest(r.id)} />
            </MotionDiv>
          ))}
        </MotionDiv>

        <div className={`${cardClass} mt-4 p-4`}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder={t('community.forum.threadPage.ваш_ответ')}
            className="w-full resize-none rounded-[4px] px-3 py-2.5 text-[17px] outline-none placeholder:text-[color:var(--workspace-text-dim)]"
            style={{ background: 'rgba(3,29,22,0.5)', color: 'var(--workspace-text)', boxShadow: 'inset 0 0 0 1px var(--workspace-row-border)' }}
          />
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={handleSendReply}
              disabled={replyLoading || !draft.trim()}
              className="rounded-[4px] px-4 py-2.5 text-[17px] transition-colors disabled:opacity-50"
              style={{ background: GOLD, color: 'var(--gold-btn-text)', fontWeight: 500 }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--gold-light)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = GOLD)}
            >
              {replyLoading ? 'Отправка...' : 'Отправить'}
            </button>
          </div>
        </div>
      </ForumShell>
    </DashboardShell>
  )
}

function ReplyBody({ authorId, author, createdAgo, body, reactions, onReaction, onSetBest, isBest }: {
  authorId: string
  author?: ForumAuthor
  createdAgo: string
  body: string
  reactions: number
  onReaction: () => void
  onSetBest: () => void
  isBest?: boolean
}) {
    const { t } = useI18n();
  const member = author ?? getMember(authorId)
  return (
    <div className="flex gap-3">
      {member && <MemberAvatar member={member} size={32} />}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <AuthorLine authorId={authorId} author={author} />
          <span className="text-[16px]" style={{ color: 'var(--workspace-text-dim)' }}>· {createdAgo}</span>
        </div>
        <p className="mt-1.5 whitespace-pre-wrap text-[18px] leading-relaxed" style={{ color: 'var(--workspace-text)' }}>{body}</p>
        <div className="mt-2 flex items-center gap-3">
          <ReactionButton count={reactions} onClick={onReaction} />
          {!isBest && (
            <button
              type="button"
              onClick={onSetBest}
              className="text-[16px] transition-colors hover:text-[color:var(--theme-accent-heading)]"
              style={{ color: 'var(--workspace-text-dim)' }}
            >
              {t('community.forum.threadPage.лучший_ответ')}</button>
          )}
        </div>
      </div>
    </div>
  )
}

function pluralReplies(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'ответ'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'ответа'
  return 'ответов'
}
