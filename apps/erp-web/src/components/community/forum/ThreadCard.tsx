import { useNavigate } from 'react-router-dom'
import { getSection, type ForumThread } from './forumData'
import {
  AuthorLine,
  FORUM_BASE,
  IntentTag,
  MotionDiv,
  Pin,
  ReactionButton,
  ReplyCount,
  ROW_DIVIDER,
  StatusDot,
  ThreadTypeIcon,
  useListVariants,
} from './forumKit'
import { useI18n } from "@/i18n";

/** Строка темы внутри панели-ленты (плотная, без собственной рамки). */
export function ThreadCard({ thread, last }: { thread: ForumThread; last?: boolean }) {
    const { t } = useI18n();
  const navigate = useNavigate()
  const { item } = useListVariants()
  const section = getSection(thread.sectionId)
  const open = () => navigate(`${FORUM_BASE}/t/${thread.id}`)

  return (
    <MotionDiv
      variants={item}
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          open()
        }
      }}
      className="group cursor-pointer px-4 py-3 transition-colors hover:bg-[color:var(--workspace-row-bg)]"
      style={{ borderBottom: last ? 'none' : ROW_DIVIDER }}
    >
      <div className="flex gap-3">
        <ThreadTypeIcon type={thread.type} solved={thread.solved} />

        <div className="min-w-0 flex-1">
          {/* Заголовок + интент */}
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {thread.pinned && <Pin size={14} strokeWidth={2} style={{ color: '#e6c364' }} />}
            {thread.exchange && <IntentTag intent={thread.exchange.intent} />}
            <h3 className="min-w-0 truncate text-[17px] leading-tight" style={{ color: 'var(--workspace-text)', fontWeight: 500 }}>
              {thread.title}
            </h3>
          </div>

          {/* Биржевая сводка / превью */}
          {thread.exchange ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[16px]" style={{ color: 'var(--workspace-text-muted)' }}>
              <span>{thread.exchange.location}</span>
              <span style={{ color: 'var(--workspace-text)' }}>{thread.exchange.amount}</span>
              {thread.exchange.commission && <span>{t('community.forum.threadCard.комиссия')}{thread.exchange.commission}</span>}
              <StatusDot status={thread.exchange.status} />
            </div>
          ) : (
            <p className="mt-1 line-clamp-1 text-[16px] leading-snug" style={{ color: 'var(--workspace-text-muted)' }}>
              {thread.excerpt}
            </p>
          )}

          {/* Мета + действия в одну строку */}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[16px]" style={{ color: 'var(--workspace-text-dim)' }}>
            {section && <span style={{ color: 'var(--theme-accent-heading)' }}>{section.name}</span>}
            <span>·</span>
            <AuthorLine authorId={thread.authorId} />
            <span>·</span>
            <span>{thread.createdAgo} {t('community.forum.threadCard.назад')}</span>
            <span className="ml-auto flex items-center gap-3">
              <ReactionButton count={thread.reactions} />
              <ReplyCount count={thread.replyCount} />
            </span>
          </div>
        </div>
      </div>
    </MotionDiv>
  )
}
