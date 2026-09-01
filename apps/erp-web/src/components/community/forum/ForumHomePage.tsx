import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { useBackendStatus } from '@/hooks/useBackendStatus'
import { communityApi } from '@/services/communityApi'
import type { ForumThread, ThreadType } from './forumData'
import { FilterTabs, ForumRightRail, ForumShell, MotionDiv, panelClass, useListVariants } from './forumKit'
import { ThreadCard } from './ThreadCard'
import { ForumLoader } from './ForumLoader'
import { useI18n } from "@/i18n";

type FeedFilter = 'all' | ThreadType

const FILTERS: Array<{ key: FeedFilter; label: string }> = [
  { key: 'all', label: 'Все' },
  { key: 'announcement', label: 'Анонсы' },
  { key: 'question', label: 'Вопросы' },
  { key: 'discussion', label: 'Обсуждения' },
  { key: 'exchange', label: 'Биржа' },
]

export default function ForumHomePage() {
    const { t } = useI18n();
  const [filter, setFilter] = useState<FeedFilter>('all')
  const [threads, setThreads] = useState<ForumThread[]>([])
  const [loading, setLoading] = useState(true)
  const { container } = useListVariants()
  const backendStatus = useBackendStatus()
  const toastShown = useRef(false)

  useEffect(() => {
    if (loading || toastShown.current || backendStatus === null) return
    toastShown.current = true
    toast(backendStatus ? '🟢 Режим онлайн — связь с сервером установлена' : '⚪ Оффлайн-режим — данные загружены из кэша', {
      duration: 3000,
    })
  }, [backendStatus, loading])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const type = filter === 'all' ? undefined : filter
      const result = await communityApi.getThreads({ type, sort: 'active', pageSize: 50 })
      if (!cancelled) {
        setThreads(result.items)
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [filter])

  return (
    <DashboardShell>
      <ForumShell active="home" right={<ForumRightRail />}>
        <div className="mb-3.5">
          <FilterTabs items={FILTERS} value={filter} onChange={setFilter} />
        </div>

        <div className={panelClass}>
          {loading ? (
            <ForumLoader />
          ) : (
            <MotionDiv key={filter} variants={container} initial="hidden" animate="show">
              {threads.map((t, i) => (
                <ThreadCard key={t.id} thread={t} last={i === threads.length - 1} />
              ))}
            </MotionDiv>
          )}

          {!loading && threads.length === 0 && (
            <div className="px-5 py-12 text-center text-[16px]" style={{ color: 'var(--workspace-text-muted)' }}>
              {t('community.forum.forumHomePage.в_этой_категории_пок')}</div>
          )}
        </div>
      </ForumShell>
    </DashboardShell>
  )
}
