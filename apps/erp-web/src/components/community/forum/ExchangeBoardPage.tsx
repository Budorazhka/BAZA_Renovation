import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowDown, ArrowUp, Columns2, Rows3 } from 'lucide-react'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { communityApi } from '@/services/communityApi'
import type { ForumThread } from './forumData'
import {
  AuthorLine,
  FilterTabs,
  FORUM_BASE,
  ForumShell,
  GOLD,
  IntentTag,
  MINT,
  MotionDiv,
  ReactionButton,
  ReplyCount,
  StatusDot,
  useListVariants,
} from './forumKit'
import { ForumLoader } from './ForumLoader'
import { useI18n } from "@/i18n";

type IntentGroup = 'all' | 'sale' | 'rent' | 'cobroking' | 'service'

const GROUP_FILTERS: Array<{ key: IntentGroup; label: string }> = [
  { key: 'all', label: 'Все' },
  { key: 'sale', label: 'Покупка / Продажа' },
  { key: 'rent', label: 'Аренда' },
  { key: 'cobroking', label: 'Co-broking' },
  { key: 'service', label: 'Услуги' },
]

function OrderCard({ thread }: { thread: ForumThread }) {
    const { t } = useI18n();
  const navigate = useNavigate()
  const { item } = useListVariants()
  const ex = thread.exchange!
  const accent = ex.side === 'demand' ? MINT : GOLD
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
      className="group cursor-pointer rounded-[6px] bg-[color:var(--workspace-row-bg)] p-3.5 transition-colors hover:bg-[color:var(--hub-card-bg-hover)]"
      style={{ boxShadow: `inset 3px 0 0 0 ${accent}, inset 0 0 0 1px var(--workspace-row-border)` }}
    >
      <div className="flex items-center justify-between gap-2">
        <IntentTag intent={ex.intent} />
        <StatusDot status={ex.status} />
      </div>

      <h3 className="mt-2.5 text-[18px] leading-snug" style={{ color: 'var(--workspace-text)', fontWeight: 500 }}>
        {thread.title}
      </h3>

      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[16px]" style={{ color: 'var(--workspace-text-muted)' }}>
        <span>{t('community.forum.exchangeBoardPage.сделка')}</span>
        <span style={{ color: 'var(--workspace-text)' }}>{ex.dealKind}</span>
        <span>{t('community.forum.exchangeBoardPage.локация')}</span>
        <span style={{ color: 'var(--workspace-text)' }}>{ex.location}</span>
        <span>{ex.side === 'demand' ? 'Бюджет' : 'Цена'}</span>
        <span style={{ color: accent }}>{ex.amount}</span>
        {ex.commission && (
          <>
            <span>{t('community.forum.exchangeBoardPage.комиссия')}</span>
            <span style={{ color: 'var(--workspace-text)' }}>{ex.commission}</span>
          </>
        )}
        {ex.deadline && (
          <>
            <span>{t('community.forum.exchangeBoardPage.срок')}</span>
            <span style={{ color: 'var(--workspace-text)' }}>{ex.deadline}</span>
          </>
        )}
      </div>

      <div className="mt-3 flex items-center gap-4">
        <span className="text-[16px]" style={{ color: 'var(--workspace-text-dim)' }}>
          <AuthorLine authorId={thread.authorId} />
        </span>
        <span className="text-[16px]" style={{ color: 'var(--workspace-text-dim)' }}>· {thread.createdAgo} {t('community.forum.exchangeBoardPage.назад')}</span>
        <span className="ml-auto flex items-center gap-3">
          <ReactionButton count={thread.reactions} />
          <ReplyCount count={thread.replyCount} />
        </span>
      </div>
    </MotionDiv>
  )
}

function ColumnHeader({ side }: { side: 'demand' | 'supply' }) {
  const isDemand = side === 'demand'
  const color = isDemand ? MINT : GOLD
  const Icon = isDemand ? ArrowDown : ArrowUp
  return (
    <div className="mb-3 flex items-center gap-2 text-[17px] uppercase tracking-[0.08em]" style={{ color }}>
      <Icon size={18} strokeWidth={2} />
      {isDemand ? 'Спрос' : 'Предложение'}
    </div>
  )
}

export default function ExchangeBoardPage() {
    const { t } = useI18n();
  const [view, setView] = useState<'book' | 'feed'>('book')
  const [group, setGroup] = useState<IntentGroup>('all')
  const [demand, setDemand] = useState<ForumThread[]>([])
  const [supply, setSupply] = useState<ForumThread[]>([])
  const [loading, setLoading] = useState(true)
  const { container } = useListVariants()

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const intentGroup = group === 'all' ? undefined : group
      const result = await communityApi.getExchangeBoard({ intentGroup })
      if (!cancelled) {
        setDemand(result.demand)
        setSupply(result.supply)
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [group])

  const allOrders = [...(Array.isArray(demand) ? demand : []), ...(Array.isArray(supply) ? supply : [])]

  return (
    <DashboardShell>
      <ForumShell active="exchange">
        <div className="mb-3.5">
          <h2 className="text-[22px] tracking-[-0.02em]" style={{ color: 'var(--theme-accent-heading)', fontWeight: 500 }}>
            {t('community.forum.exchangeBoardPage.биржа')}</h2>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <FilterTabs items={GROUP_FILTERS} value={group} onChange={setGroup} />

          <div className="ml-auto flex items-center gap-1 rounded-[4px] p-1" style={{ background: 'var(--workspace-row-bg)', boxShadow: 'inset 0 0 0 1px var(--workspace-row-border)' }}>
            {([
              { key: 'book', label: 'Стакан', icon: Columns2 },
              { key: 'feed', label: 'Лента', icon: Rows3 },
            ] as const).map(({ key, label, icon: Icon }) => {
              const isActive = view === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setView(key)}
                  className="inline-flex items-center gap-2 rounded-[4px] px-3 py-1.5 text-[16px] transition-colors"
                  style={{
                    color: isActive ? 'var(--gold-btn-text)' : 'var(--workspace-text-muted)',
                    background: isActive ? GOLD : 'transparent',
                    fontWeight: isActive ? 500 : 400,
                  }}
                >
                  <Icon size={16} strokeWidth={1.75} />
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {loading ? (
          <ForumLoader text="Загрузка биржи..." />
        ) : view === 'book' ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <section>
              <ColumnHeader side="demand" />
              <MotionDiv key={`d-${group}`} variants={container} initial="hidden" animate="show" className="flex flex-col gap-3">
                {demand.map((t) => (
                  <OrderCard key={t.id} thread={t} />
                ))}
              </MotionDiv>
            </section>
            <section>
              <ColumnHeader side="supply" />
              <MotionDiv key={`s-${group}`} variants={container} initial="hidden" animate="show" className="flex flex-col gap-3">
                {supply.map((t) => (
                  <OrderCard key={t.id} thread={t} />
                ))}
              </MotionDiv>
            </section>
          </div>
        ) : (
          <MotionDiv key={`f-${group}`} variants={container} initial="hidden" animate="show" className="flex flex-col gap-3">
            {allOrders.map((t) => (
              <OrderCard key={t.id} thread={t} />
            ))}
          </MotionDiv>
        )}
      </ForumShell>
    </DashboardShell>
  )
}
