import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CalendarDays, ChevronLeft, ExternalLink, Heart, MessageSquare } from 'lucide-react'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { ROLE_LABEL, SEGMENT_LABEL } from './forumData'
import type { ForumMember, ForumThread } from './forumData'
import { communityApi } from '@/services/communityApi'
import {
  cardClass,
  FORUM_BASE,
  ForumShell,
  GOLD,
  MemberAvatar,
  MINT,
  MotionDiv,
  TrustIndex,
  useListVariants,
  VerifiedBadge,
} from './forumKit'
import { ThreadCard } from './ThreadCard'
import { ForumLoader } from './ForumLoader'
import { useI18n } from "@/i18n";

function StatCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={`${cardClass} p-4`}>
      <p className="mb-3 text-[16px] uppercase tracking-[0.08em]" style={{ color: 'var(--workspace-text-dim)' }}>{title}</p>
      {children}
    </div>
  )
}

function StatRow({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="flex items-center justify-between py-1 text-[17px]">
      <span style={{ color: 'var(--workspace-text-muted)' }}>{label}</span>
      <span style={{ color: accent ?? 'var(--workspace-text)', fontWeight: 500 }}>{value}</span>
    </div>
  )
}

export default function MemberProfilePage() {
    const { t } = useI18n();
  const { memberId = '' } = useParams()
  const navigate = useNavigate()
  const [member, setMember] = useState<ForumMember | null>(null)
  const [myThreads, setMyThreads] = useState<ForumThread[]>([])
  const [loading, setLoading] = useState(true)
  const { container } = useListVariants()

  useEffect(() => {
    if (!memberId) return
    let cancelled = false
    const load = async () => {
      const m = await communityApi.getMemberById(memberId)
      if (cancelled) return
      setMember(m)
      if (m) {
        const result = await communityApi.getMemberThreads(m.id, { pageSize: 20 })
        if (!cancelled) setMyThreads(result.items)
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [memberId])

  if (loading) {
    return (
      <DashboardShell>
        <ForumShell active="home">
          <ForumLoader text="Загрузка профиля..." />
        </ForumShell>
      </DashboardShell>
    )
  }

  if (!member) {
    return (
      <DashboardShell>
        <ForumShell active="home">
          <div className={`${cardClass} px-5 py-10 text-center text-[17px]`} style={{ color: 'var(--workspace-text-muted)' }}>
            {t('community.forum.memberProfilePage.участник_не_найден')}</div>
        </ForumShell>
      </DashboardShell>
    )
  }

  const hasCrm = member.crmContactId !== '—'
  const percentile = member.trustIndex >= 90 ? 'верхние 5%' : member.trustIndex >= 75 ? 'верхние 20%' : member.trustIndex >= 50 ? 'средний сегмент' : 'нужен контакт'

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
          {t('community.forum.memberProfilePage.сообщество')}</button>

        <div className={`${cardClass} p-5`}>
          <div className="flex flex-wrap items-start gap-4">
            <MemberAvatar member={member} size={56} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <h1 className="text-[24px] tracking-[-0.02em]" style={{ color: 'var(--workspace-text)', fontWeight: 500 }}>{member.name}</h1>
                {member.badges.map((b) => (
                  <VerifiedBadge key={b} label={b} />
                ))}
              </div>
              <p className="mt-1.5 text-[17px]" style={{ color: 'var(--workspace-text-muted)' }}>
                {SEGMENT_LABEL[member.segment]} · {ROLE_LABEL[member.role]} · {member.company} · {member.city}
              </p>
              <p className="mt-1 text-[16px]" style={{ color: 'var(--workspace-text-dim)' }}>
                {t('community.forum.memberProfilePage.в_сообществе_с')}{member.joined} {t('community.forum.memberProfilePage.заходил')}{member.lastActiveLabel}
              </p>
            </div>

            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                className="rounded-[4px] px-4 py-2.5 text-[17px] transition-colors"
                style={{ color: GOLD, boxShadow: 'inset 0 0 0 1px color-mix(in srgb, #e6c364 40%, transparent)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'color-mix(in srgb, #e6c364 12%, transparent)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {t('community.forum.memberProfilePage.написать')}</button>
              {hasCrm && (
                <button
                  type="button"
                  onClick={() => navigate('/dashboard/clients/list')}
                  className="inline-flex items-center gap-2 rounded-[4px] px-4 py-2.5 text-[17px] transition-colors"
                  style={{ color: 'var(--workspace-text-muted)', boxShadow: 'inset 0 0 0 1px var(--workspace-row-border)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--workspace-row-bg)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <ExternalLink size={16} strokeWidth={1.75} />
                  {t('community.forum.memberProfilePage.открыть_в_crm')}</button>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <StatCard title={t('community.forum.memberProfilePage.индекс_доверия')}>
            <div className="flex items-end justify-between">
              <TrustIndex value={member.trustIndex} size="lg" />
              <span className="text-[16px]" style={{ color: MINT }}>{percentile}</span>
            </div>
          </StatCard>

          <StatCard title={t('community.forum.memberProfilePage.вклад')}>
            <StatRow label={t('community.forum.memberProfilePage.тем')} value={myThreads.length} />
            <StatRow label={t('community.forum.memberProfilePage.реш_нных_вопросов')} value={member.solvedQuestions} accent={GOLD} />
            <StatRow label={t('community.forum.memberProfilePage.сделок_co_broking')} value={member.cobrokingDeals} />
          </StatCard>

          <StatCard title={t('community.forum.memberProfilePage.активность')}>
            <StatRow label={t('community.forum.memberProfilePage.заходил')} value={member.lastActiveLabel} />
            <div className="flex items-center justify-between py-1 text-[17px]">
              <span className="inline-flex items-center gap-2" style={{ color: 'var(--workspace-text-muted)' }}>
                <CalendarDays size={16} strokeWidth={1.75} /> {t('community.forum.memberProfilePage.событий_за_год')}</span>
              <span style={{ color: 'var(--workspace-text)', fontWeight: 500 }}>{member.eventsYtd}</span>
            </div>
            <div className="flex items-center justify-between py-1 text-[17px]">
              <span className="inline-flex items-center gap-2" style={{ color: 'var(--workspace-text-muted)' }}>
                <Heart size={16} strokeWidth={1.75} /> {t('community.forum.memberProfilePage.реакций_получено')}</span>
              <span style={{ color: 'var(--workspace-text)', fontWeight: 500 }}>{member.reactionsReceived}</span>
            </div>
          </StatCard>
        </div>

        <h2 className="mb-3 mt-5 inline-flex items-center gap-2 text-[16px] uppercase tracking-[0.08em]" style={{ color: 'var(--workspace-text-dim)' }}>
          <MessageSquare size={16} strokeWidth={1.75} /> {t('community.forum.memberProfilePage.последние_темы')}</h2>
        {myThreads.length > 0 ? (
          <MotionDiv variants={container} initial="hidden" animate="show" className="flex flex-col gap-3">
            {myThreads.map((t) => (
              <ThreadCard key={t.id} thread={t} />
            ))}
          </MotionDiv>
        ) : (
          <div className={`${cardClass} px-5 py-8 text-center text-[17px]`} style={{ color: 'var(--workspace-text-muted)' }}>
            {t('community.forum.memberProfilePage.пока_нет_опубликован')}</div>
        )}
      </ForumShell>
    </DashboardShell>
  )
}
