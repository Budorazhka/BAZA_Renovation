import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CalendarDays, ChevronLeft, Radio } from 'lucide-react'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { getSection, type ForumEvent } from './forumData'
import { communityApi } from '@/services/communityApi'
import type { ForumThread } from './forumData'
import {
  FilterTabs,
  FORUM_BASE,
  ForumRightRail,
  ForumShell,
  GOLD,
  MINT,
  MotionDiv,
  panelClass,
  ROW_DIVIDER,
  SectionGlyph,
  useListVariants,
} from './forumKit'
import { ThreadCard } from './ThreadCard'
import { ForumLoader } from './ForumLoader'
import { useI18n } from "@/i18n";

type SortKey = 'active' | 'new' | 'unanswered'

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: 'active', label: 'Активные' },
  { key: 'new', label: 'Новые' },
  { key: 'unanswered', label: 'Без ответа' },
]

function EventsPanel() {
  const [events, setEvents] = useState<ForumEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    communityApi.getEvents().then((e) => { setEvents(e); setLoading(false) })
  }, [])

  if (loading) return <div className={panelClass}><ForumLoader text="Загрузка событий..." /></div>

  if (events.length === 0) {
    return (
      <div className={`${panelClass} px-5 py-12 text-center text-[16px]`} style={{ color: 'var(--workspace-text-muted)' }}>
        Мероприятий пока нет
      </div>
    )
  }

  return (
    <div className={panelClass}>
      {events.map((e, i) => (
        <div key={e.id} className="px-4 py-3" style={{ borderBottom: i === events.length - 1 ? 'none' : ROW_DIVIDER }}>
          <div className="flex items-center gap-2">
            <span className="size-2.5 rounded-full" style={{ background: e.registrationOpen ? GOLD : MINT }} />
            <h3 className="text-[17px]" style={{ color: 'var(--workspace-text)', fontWeight: 500 }}>{e.title}</h3>
            <span className="ml-auto text-[16px]" style={{ color: e.registrationOpen ? GOLD : 'var(--workspace-text-dim)' }}>
              {e.registrationOpen ? 'Регистрация открыта' : 'Скоро'}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-[16px]" style={{ color: 'var(--workspace-text-muted)' }}>
            <span className="inline-flex items-center gap-1.5"><CalendarDays size={15} strokeWidth={1.75} />{e.date}</span>
            <span className="inline-flex items-center gap-1.5"><Radio size={15} strokeWidth={1.75} />{e.format === 'online' ? 'Онлайн' : e.city}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function SectionPage() {
    const { t } = useI18n();
  const { sectionId = '' } = useParams()
  const navigate = useNavigate()
  const [sort, setSort] = useState<SortKey>('active')
  const [threads, setThreads] = useState<ForumThread[]>([])
  const [loading, setLoading] = useState(true)
  const { container } = useListVariants()
  const section = getSection(sectionId)

  useEffect(() => {
    if (!sectionId) return
    let cancelled = false
    const load = async () => {
      const result = await communityApi.getThreads({ section: sectionId, sort, pageSize: 50 })
      if (!cancelled) {
        setThreads(result.items)
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [sectionId, sort])

  if (!section) {
    return (
      <DashboardShell>
        <ForumShell active="home">
          <div className={`${panelClass} px-5 py-12 text-center text-[16px]`} style={{ color: 'var(--workspace-text-muted)' }}>{t('community.forum.sectionPage.раздел_не_найден')}</div>
        </ForumShell>
      </DashboardShell>
    )
  }

  const isEvents = section.kind === 'events'

  return (
    <DashboardShell>
      <ForumShell active={section.id} right={<ForumRightRail />}>
        <button type="button" onClick={() => navigate(FORUM_BASE)}
          className="mb-3 inline-flex items-center gap-1.5 text-[16px] transition-colors hover:text-[color:var(--theme-accent-heading)]"
          style={{ color: 'var(--workspace-text-dim)' }}>
          <ChevronLeft size={16} strokeWidth={1.75} />{t('community.forum.sectionPage.сообщество')}</button>

        <div className="mb-4 flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[8px]" style={{ background: 'color-mix(in srgb, var(--gold) 11%, transparent)', color: GOLD }}>
            <SectionGlyph icon={section.icon} size={20} />
          </span>
          <div>
            <h2 className="text-[22px] tracking-[-0.02em]" style={{ color: 'var(--theme-accent-heading)', fontWeight: 500 }}>{section.name}</h2>
          </div>
        </div>

        {isEvents ? (
          <EventsPanel />
        ) : (
          <>
            <div className="mb-3.5">
              <FilterTabs items={SORTS} value={sort} onChange={setSort} />
            </div>
            <div className={panelClass}>
              {loading ? (
                <ForumLoader />
              ) : (
                <MotionDiv key={sort} variants={container} initial="hidden" animate="show">
                  {threads.map((t, i) => (
                    <ThreadCard key={t.id} thread={t} last={i === threads.length - 1} />
                  ))}
                </MotionDiv>
              )}
              {!loading && threads.length === 0 && (
                <div className="px-5 py-12 text-center text-[16px]" style={{ color: 'var(--workspace-text-muted)' }}>{t('community.forum.sectionPage.в_этой_категории_пок')}</div>
              )}
            </div>
          </>
        )}
      </ForumShell>
    </DashboardShell>
  )
}
