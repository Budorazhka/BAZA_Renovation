import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { GitBranch } from 'lucide-react'
import {
  DeskShell,
  DeskHeader,
  DeskTab,
  DeskHero,
  DeskMiniStats,
  MiniBar,
  DeskKpi,
  DESK_HEADER_LINK_CLASS,
  REPORT_LINKS,
} from '../desk-shared'
import { LEAD_STAGES, LEAD_STAGE_COLUMN } from '@/data/leads-mock'
import {
  BROKER_DESK_ROWS,
  NETWORK_DESK_ROWS,
  OWNER_DESK_ROWS,
  sumCounts,
  sumCountsByGroup,
} from '@/data/funnel-stages-from-csv'
import type { Lead } from '@/types/leads'
import type { Deal } from '@/types/deals'
import type { WidgetSlot } from '@/config/widgets-config'
import { useI18n } from "@/i18n";

/* ── данные стадий ── */
const ALL_IN_PROGRESS = LEAD_STAGES.filter((s) => LEAD_STAGE_COLUMN[s.id] === 'in_progress')
const FUNNEL_STAGES_BIG = ALL_IN_PROGRESS
const FUNNEL_STAGES_MED = ALL_IN_PROGRESS.slice(0, 6)
const DISPLAY_FUNNEL_STAGES_BIG = [...FUNNEL_STAGES_BIG].reverse()
const DISPLAY_FUNNEL_STAGES_MED = [...FUNNEL_STAGES_MED].reverse()

/* ── мок активности сегодня (действия / движения по этапу) ── */
const STAGE_ACTIVITY_TODAY: Record<string, number> = {
  new: 4,
  callback: 2,
  presented: 3,
  country_discussed: 1,
  need_identified: 5,
  need_adjusted: 2,
  kp_sent: 3,
  objections: 1,
  deferred: 0,
  warmup: 2,
  showing: 3,
  deposit: 1,
  deal: 2,
}

/* ── хелперы цветов ── */
function activityColor(n: number): string {
  if (n >= 3) return '#4ade80'  // green — высокая активность
  if (n >= 1) return '#fbbf24'  // amber — есть движение
  return '#60a5fa'              // blue  — наблюдается
}

function stageBarColor(index: number, total: number): string {
  const ratio = index / Math.max(1, total - 1)
  // violet → purple → blue
  if (ratio < 0.35) return '#a78bfa'
  if (ratio < 0.65) return '#7c3aed'
  return '#3b82f6'
}

/* ── воронка-строка (центрированный трапециевидный бар) ── */
function FunnelRow({
  name,
  count,
  maxCount,
  activity,
  color,
  showActivity = true,
}: {
  name: string
  count: number
  maxCount: number
  activity: number
  color: string
  showActivity?: boolean
}) {
  const pct = maxCount > 0 ? Math.max(10, Math.round((count / maxCount) * 92)) : 10
  const aColor = activityColor(activity)

  return (
    <div className="grid w-full grid-cols-[minmax(76px,132px)_minmax(0,1fr)_60px] items-center gap-2 sm:grid-cols-[minmax(84px,146px)_minmax(0,1fr)_66px]">
      <p className="min-w-0 truncate text-right text-[12px] leading-snug text-[color:var(--workspace-text-muted)] sm:text-[13px]">
        {name}
      </p>

      <div className="flex min-w-0 justify-center px-0.5">
        <div
          className="h-[22px] max-w-full rounded transition-all duration-500 sm:h-[24px]"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${color}bb 0%, ${color} 55%, ${color}cc 100%)`,
            boxShadow: `0 0 10px ${color}45`,
          }}
        />
      </div>

      <div className="flex min-w-0 items-center justify-end gap-1.5">
        <span className="text-[13px] tabular-nums text-[color:var(--workspace-text)] sm:text-[14px]">{count}</span>
        {showActivity && activity > 0 && (
          <span
            className="shrink-0 rounded-full px-1.5 py-[3px] text-[10px] font-normal leading-none sm:text-[11px]"
            style={{
              color: aColor,
              background: `${aColor}1a`,
              border: `1px solid ${aColor}50`,
            }}
          >
            +{activity}
          </span>
        )}
        {showActivity && activity === 0 && (
          <span
            className="size-[6px] shrink-0 rounded-full opacity-30"
            style={{ background: '#60a5fa' }}
          />
        )}
      </div>
    </div>
  )
}

/* ── список воронки (переиспользуется для Собственников и Партнёров) ── */
function StaticFunnelList({
  items,
}: {
  items: { id: string; name: string; count: number; activity: number }[]
}) {
  const maxCount = Math.max(1, ...items.map((s) => s.count))
  const displayItems = [...items].reverse()
  return (
    <div className="space-y-1.5">
      {displayItems.map((s, i) => (
        <FunnelRow
          key={s.id}
          name={s.name}
          count={s.count}
          maxCount={maxCount}
          activity={s.activity}
          color={stageBarColor(i, items.length)}
        />
      ))}
    </div>
  )
}

/* ── легенда активности ── */
function ActivityLegend() {
    const { t } = useI18n();
  return (
    <div className="flex w-full flex-wrap items-center justify-center gap-x-4 gap-y-1 pb-1.5 text-[10px] uppercase tracking-wider text-[color:var(--workspace-text-dim)] sm:text-[11px]">
      <span className="flex items-center gap-1.5">
        <span className="inline-block size-2 rounded-full bg-[#4ade80]" />
        {t('dashboard.widgets.widgetFunnel.высокая_активность')}</span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block size-2 rounded-full bg-[#fbbf24]" />
        {t('dashboard.widgets.widgetFunnel.есть_движение')}</span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block size-2 rounded-full bg-[#60a5fa] opacity-55" />
        {t('dashboard.widgets.widgetFunnel.тихо')}</span>
    </div>
  )
}

/* ════════════════ ГЛАВНЫЙ КОМПОНЕНТ ════════════════ */
type FunnelWorkspaceTab = 'sales' | 'owners' | 'network' | 'broker'

export function WidgetFunnel({
  leads,
  deals: _deals,
  slot,
}: {
  leads: Lead[]
  deals: Deal[]
  slot: WidgetSlot
}) {
    const { t } = useI18n();
  void _deals
  const [tab, setTab] = useState<FunnelWorkspaceTab>('sales')

  const leadsByStage = useMemo(() => {
    const map: Record<string, number> = {}
    for (const l of leads) map[l.stageId] = (map[l.stageId] ?? 0) + 1
    return map
  }, [leads])

  const inProg = leads.filter((l) => LEAD_STAGE_COLUMN[l.stageId] === 'in_progress').length
  const success = leads.filter((l) => LEAD_STAGE_COLUMN[l.stageId] === 'success').length
  const convRate = leads.length > 0 ? Math.round((success / leads.length) * 100) : 0
  const totalActivity = Object.values(STAGE_ACTIVITY_TODAY).reduce((a, b) => a + b, 0)

  /* ── SMALL ── */
  if (slot === 'small') {
    const rejected = leads.filter((l) => LEAD_STAGE_COLUMN[l.stageId] === 'rejection').length
    return (
      <DeskShell accent="#a78bfa" className="flex flex-col">
        <DeskHeader
          icon={<GitBranch className="size-4" strokeWidth={2} />}
          title={t('dashboard.widgets.widgetFunnel.воронка')}
          accentColor="#a78bfa"
          layout="compact"
          right={<Link to={REPORT_LINKS.team} className={DESK_HEADER_LINK_CLASS}>{t('dashboard.widgets.widgetFunnel.отч_т')}</Link>}
        />
        <DeskHero
          label={t('dashboard.widgets.widgetFunnel.лидов_в_работе')}
          value={String(inProg)}
          color="#a78bfa"
          pct={leads.length > 0 ? (inProg / leads.length) * 100 : 0}
        />
        <DeskMiniStats
          items={[
            { label: 'Новые', value: String(leadsByStage['new'] ?? 0), color: '#22d3ee' },
            { label: 'Успешных', value: String(success), color: '#4ade80' },
            { label: 'Отказы', value: String(rejected), color: '#f87171' },
          ]}
        />
      </DeskShell>
    )
  }

  /* ── MED ── */
  if (slot === 'med') {
    const maxCount = Math.max(1, ...FUNNEL_STAGES_MED.map((s) => leadsByStage[s.id] ?? 0))
    return (
      <DeskShell accent="#a78bfa" className="flex flex-col">
        <DeskHeader
          icon={<GitBranch className="size-4" strokeWidth={2} />}
          title={t('dashboard.widgets.widgetFunnel.воронка_продаж')}
          accentColor="#a78bfa"
          layout="compact"
          right={<Link to={REPORT_LINKS.team} className={DESK_HEADER_LINK_CLASS}>{t('dashboard.widgets.widgetFunnel.отч_т')}</Link>}
        />
        <div className="grid shrink-0 grid-cols-2 gap-1.5 p-2.5 pb-1.5">
          <div className="rounded-md border border-[color:var(--workspace-row-border)] bg-[var(--workspace-row-bg)] px-2 py-1.5">
            <p className="text-[10px] uppercase tracking-wide text-[color:var(--workspace-text-dim)]">{t('dashboard.widgets.widgetFunnel.в_работе')}</p>
            <p className="text-[18px] leading-none" style={{ color: '#60a5fa' }}>{inProg}</p>
          </div>
          <div className="rounded-md border border-[color:var(--workspace-row-border)] bg-[var(--workspace-row-bg)] px-2 py-1.5">
            <p className="text-[10px] uppercase tracking-wide text-[color:var(--workspace-text-dim)]">{t('dashboard.widgets.widgetFunnel.успешных')}</p>
            <p className="text-[18px] leading-none" style={{ color: '#4ade80' }}>{success}</p>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-1.5">
          <div className="space-y-1">
            {DISPLAY_FUNNEL_STAGES_MED.map((stage, i) => {
              const count = leadsByStage[stage.id] ?? 0
              const pct = Math.round((count / maxCount) * 100)
              return (
                <li key={stage.id} className="grid list-none grid-cols-[1fr_auto] items-center gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[12px] text-[color:var(--workspace-text)]">{stage.name}</p>
                    <MiniBar pct={pct} color={stageBarColor(i, DISPLAY_FUNNEL_STAGES_MED.length)} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="shrink-0 text-[12px] tabular-nums text-[color:var(--workspace-text-muted)]">{count}</span>
                    {(STAGE_ACTIVITY_TODAY[stage.id] ?? 0) > 0 && (
                      <span
                        className="shrink-0 rounded-full px-1 text-[8px] font-normal leading-none"
                        style={{
                          color: activityColor(STAGE_ACTIVITY_TODAY[stage.id] ?? 0),
                          background: `${activityColor(STAGE_ACTIVITY_TODAY[stage.id] ?? 0)}1a`,
                        }}
                      >
                        +{STAGE_ACTIVITY_TODAY[stage.id]}
                      </span>
                    )}
                  </div>
                </li>
              )
            })}
          </div>
          <p className="mt-2 text-[10px] text-[color:var(--workspace-text-dim)]">
            {t('dashboard.widgets.widgetFunnel.всего')}{leads.length} {t('dashboard.widgets.widgetFunnel.конверсия')}{convRate}%
          </p>
        </div>
      </DeskShell>
    )
  }

  /* ── BIG ── */
  const maxLeadCount = Math.max(1, ...FUNNEL_STAGES_BIG.map((s) => leadsByStage[s.id] ?? 0))

  return (
    <DeskShell accent="#a78bfa" className="flex flex-col">
      <DeskHeader
        icon={<GitBranch className="size-5" strokeWidth={2} />}
        title={t('dashboard.widgets.widgetFunnel.воронка_продаж')}
        accentColor="#a78bfa"
        right={<Link to={REPORT_LINKS.team} className={DESK_HEADER_LINK_CLASS}>{t('dashboard.widgets.widgetFunnel.отч_т')}</Link>}
      />

      {/* Вкладки — контуры из матрицы воронок: Продажи · Собственник · Сеть · Посредник */}
      <div className="flex shrink-0 flex-wrap gap-1 border-b border-[color:var(--workspace-row-border)] px-2.5 py-1.5">
        <DeskTab variant="main" active={tab === 'sales'} onClick={() => setTab('sales')}>
          {t('dashboard.widgets.widgetFunnel.продажи')}</DeskTab>
        <DeskTab variant="main" active={tab === 'owners'} onClick={() => setTab('owners')}>
          {t('dashboard.widgets.widgetFunnel.собственник')}</DeskTab>
        <DeskTab variant="main" active={tab === 'network'} onClick={() => setTab('network')}>
          {t('dashboard.widgets.widgetFunnel.сеть')}</DeskTab>
        <DeskTab variant="main" active={tab === 'broker'} onClick={() => setTab('broker')}>
          {t('dashboard.widgets.widgetFunnel.посредник')}</DeskTab>
      </div>

      {/* Сводка */}
      {tab === 'sales' && (
        <div className="grid shrink-0 grid-cols-2 gap-1.5 px-2.5 py-2 sm:grid-cols-4">
          <DeskKpi
            label={t('dashboard.widgets.widgetFunnel.в_работе')}
            value={String(inProg)}
            color="#60a5fa"
            hint="Лиды в активных этапах воронки (до договора), без отказов и без золотого фонда."
          />
          <DeskKpi
            label={t('dashboard.widgets.widgetFunnel.успешных_в_работе')}
            value={String(success)}
            color="#4ade80"
            hint="Лиды в золотом фонде и постпродажных этапах: повторные сделки и рекомендации."
          />
          <DeskKpi
            label={t('dashboard.widgets.widgetFunnel.конверсия')}
            value={`${convRate}%`}
            color="#a78bfa"
            hint="Доля успешных лидов в текущем пуле."
          />
          <DeskKpi
            label={t('dashboard.widgets.widgetFunnel.активность')}
            value={`+${totalActivity}`}
            color="#fbbf24"
            hint="Касания и движения по этапам за сегодня."
          />
        </div>
      )}

      {tab === 'owners' && (
        <div className="grid shrink-0 grid-cols-3 gap-1.5 px-2.5 py-2">
          <DeskKpi label={t('dashboard.widgets.widgetFunnel.всего_этапов')} value={String(sumCounts(OWNER_DESK_ROWS))} color="#38bdf8" />
          <DeskKpi label={t('dashboard.widgets.widgetFunnel.подготовка')} value={String(sumCountsByGroup(OWNER_DESK_ROWS, 'Подготовка'))} color="#fbbf24" />
          <DeskKpi label={t('dashboard.widgets.widgetFunnel.в_работе')} value={String(sumCountsByGroup(OWNER_DESK_ROWS, 'В работе'))} color="#4ade80" />
        </div>
      )}

      {tab === 'network' && (
        <div className="grid shrink-0 grid-cols-3 gap-1.5 px-2.5 py-2">
          <DeskKpi label={t('dashboard.widgets.widgetFunnel.отказ')} value={String(sumCountsByGroup(NETWORK_DESK_ROWS, 'Отказ'))} color="#f87171" />
          <DeskKpi label={t('dashboard.widgets.widgetFunnel.в_работе')} value={String(sumCountsByGroup(NETWORK_DESK_ROWS, 'В работе'))} color="#a3e635" />
          <DeskKpi label={t('dashboard.widgets.widgetFunnel.активные')} value={String(sumCountsByGroup(NETWORK_DESK_ROWS, 'Активный'))} color="#4ade80" />
        </div>
      )}

      {tab === 'broker' && (
        <div className="grid shrink-0 grid-cols-3 gap-1.5 px-2.5 py-2">
          <DeskKpi label={t('dashboard.widgets.widgetFunnel.отказ')} value={String(sumCountsByGroup(BROKER_DESK_ROWS, 'Отказ'))} color="#f87171" />
          <DeskKpi label={t('dashboard.widgets.widgetFunnel.в_работе')} value={String(sumCountsByGroup(BROKER_DESK_ROWS, 'В работе'))} color="#38bdf8" />
          <DeskKpi label={t('dashboard.widgets.widgetFunnel.активные')} value={String(sumCountsByGroup(BROKER_DESK_ROWS, 'Активный'))} color="#4ade80" />
        </div>
      )}

      {/* Основной контент */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
        {tab === 'sales' && (
          <div className="space-y-1.5">
            <ActivityLegend />
            {DISPLAY_FUNNEL_STAGES_BIG.map((stage, i) => (
              <FunnelRow
                key={stage.id}
                name={stage.name}
                count={leadsByStage[stage.id] ?? 0}
                maxCount={maxLeadCount}
                activity={STAGE_ACTIVITY_TODAY[stage.id] ?? 0}
                color={stageBarColor(i, DISPLAY_FUNNEL_STAGES_BIG.length)}
              />
            ))}
            <p className="mt-2 text-center text-[12px] text-[color:var(--workspace-text-dim)] sm:text-[13px]">
              {t('dashboard.widgets.widgetFunnel.всего_лидов')}{leads.length} {t('dashboard.widgets.widgetFunnel.конверсия_в_успех')}{convRate}%
            </p>
          </div>
        )}

        {tab === 'owners' && (
          <div className="space-y-1.5">
            <ActivityLegend />
            <StaticFunnelList items={OWNER_DESK_ROWS} />
          </div>
        )}

        {tab === 'network' && (
          <div className="space-y-1.5">
            <ActivityLegend />
            <StaticFunnelList items={NETWORK_DESK_ROWS} />
          </div>
        )}

        {tab === 'broker' && (
          <div className="space-y-1.5">
            <ActivityLegend />
            <StaticFunnelList items={BROKER_DESK_ROWS} />
          </div>
        )}
      </div>
    </DeskShell>
  )
}
