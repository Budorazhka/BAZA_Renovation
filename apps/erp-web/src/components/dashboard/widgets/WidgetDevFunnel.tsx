import { useState } from 'react'
import { type WidgetSlot, WIDGET_META } from '@/config/widgets-config'
import { DeskShell } from '../desk-shared'
import { Filter, Info } from 'lucide-react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useI18n } from '@/i18n'

interface Props {
  slot: WidgetSlot
}

type GroupType = 'in_progress' | 'rejection' | 'success'

const FUNNEL_DATA = {
  in_progress: {
    color: '#4ade80',
    total: 835,
    steps: [
      'newLead', 'askedContactLater', 'presentedCompany', 'discussedCountrySituation',
      'identifiedNeed', 'adjustedNeed', 'sentProposal', 'handlingObjections',
      'deferredDemand', 'warmup', 'viewing', 'depositReceived', 'contractSigned',
    ] as const,
    counts: [340, 320, 310, 295, 280, 260, 230, 210, 195, 190, 180, 120, 95],
    convs: ['100', '94', '96', '95', '94', '92', '88', '91', '92', '97', '94', '66', '79'],
  },
  rejection: {
    color: '#f87171',
    total: 124,
    steps: ['badLead', 'rejected', 'noAnswer3', 'noAnswer2', 'noAnswer1'] as const,
    counts: [14, 20, 15, 30, 45],
    convs: ['11', '16', '12', '24', '36'],
  },
  success: {
    color: '#e6c364',
    total: 45,
    steps: ['goldFund', 'checkedIn', 'askReferral', 'identifyNeedNewDeals'] as const,
    counts: [20, 15, 10, 0],
    convs: ['44', '33', '22', '0'],
  },
}

export function WidgetDevFunnel({ slot: _slot }: Props) {
  const { t } = useI18n()
  const meta = WIDGET_META['dev_funnel']
  const [activeGroup, setActiveGroup] = useState<GroupType>('in_progress')

  const currentData = FUNNEL_DATA[activeGroup]
  const groupLabel = (group: GroupType) => t(`widgets.devFunnel.groups.${group}.label`)
  const groupSubtitle = (group: GroupType) => t(`widgets.devFunnel.groups.${group}.subtitle`)
  const stepLabel = (group: GroupType, step: string) => t(`widgets.devFunnel.steps.${group}.${step}.label`)
  const stepTooltip = (group: GroupType, step: string) => t(`widgets.devFunnel.steps.${group}.${step}.tooltip`)

  return (
    <DeskShell accent={meta.accent} className="flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[color:var(--workspace-surface-high)]">
        <div className="flex items-center gap-2">
          <Filter className="size-5" style={{ color: meta.accent }} />
          <h3 className="text-[16px] font-medium uppercase tracking-[0.08em] text-[#e6c364]">{t('widgets.devFunnel.title', meta.label)}</h3>
        </div>
        <select className="bg-[color:var(--workspace-surface-low)] border border-[color:var(--workspace-surface-high)] text-[color:var(--workspace-text)] text-[14px] outline-none rounded p-1 cursor-pointer">
          <option value="all">{t('widgets.devFunnel.allComplexes', 'Все ЖК')}</option>
          <option value="residence">{t('dashboard.widgets.widgetDevFunnel.жк_residence_park')}</option>
          <option value="sky">{t('dashboard.widgets.widgetDevFunnel.жк_sky_garden')}</option>
          <option value="olimp">{t('dashboard.widgets.widgetDevFunnel.жк_олимп')}</option>
        </select>
      </div>
      <div className="flex flex-1 flex-col p-4 gap-4 overflow-hidden">

        {/* АКТИВНАЯ ГРУППА ЭТАПОВ (ВЕРХ ЦЕНТР) */}
        <div className="flex-[2] border rounded-[6px] p-3 flex flex-col bg-[color:var(--workspace-surface-lowest)] overflow-y-auto transition-colors"
             style={{ borderColor: currentData.color }}>
          <div className="text-[15px] uppercase tracking-[0.08em] font-medium mb-3 text-center"
               style={{ color: currentData.color }}>
            {groupLabel(activeGroup)}
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex justify-between items-center py-1 text-[13px] text-[color:var(--workspace-text-muted)] uppercase tracking-[0.05em] border-b border-transparent">
              <span>{t('widgets.devFunnel.columnStage', 'Этап')}</span>
              <div className="flex gap-4 text-right w-32 justify-end">
                <span>{t('widgets.devFunnel.columnLeads', 'Лиды')}</span>
                <span className="w-16">{t('widgets.devFunnel.columnPrevConv', 'Из пред.')}</span>
              </div>
            </div>
            {currentData.steps.map((step, idx) => (
              <div key={idx} className="flex justify-between items-center py-1.5 border-b border-[color:var(--workspace-surface-high)] last:border-0 hover:bg-[color:var(--workspace-surface-low)] px-1 rounded transition-colors group cursor-default">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[16px] text-[color:var(--workspace-text)] truncate">{stepLabel(activeGroup, step)}</span>
                  <Tooltip delayDuration={100}>
                    <TooltipTrigger asChild>
                      <Info className="size-3.5 text-[color:var(--workspace-text-muted)] group-hover:text-[color:var(--workspace-text)] transition-colors flex-shrink-0 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-[250px] bg-[#0f172a] text-white border border-[#e6c364]/30 shadow-xl p-3 rounded text-[13px] leading-relaxed z-50">
                      {stepTooltip(activeGroup, step)}
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex gap-4 text-[14px] text-right w-32 justify-end items-center flex-shrink-0">
                  <span className="font-normal text-[color:var(--workspace-text)]">{currentData.counts[idx]}</span>
                  <span className="w-16" style={{ color: currentData.color }}>{currentData.convs[idx]}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* НИЖНИЙ РЯД: ИНТЕРАКТИВНЫЕ КНОПКИ */}
        <div className="flex flex-1 gap-4">

          {/* ОТКАЗ (СЛЕВА ВНИЗУ) */}
          <button
            onClick={() => setActiveGroup('rejection')}
            className={cn(
              "flex-1 border rounded-[6px] p-3 flex flex-col items-center justify-center text-center transition-all",
              activeGroup === 'rejection'
                ? "bg-[color:var(--workspace-surface-low)] shadow-[inset_0_0_10px_rgba(248,113,113,0.1)]"
                : "bg-[color:var(--workspace-surface-lowest)] hover:bg-[color:var(--workspace-surface-low)] opacity-70 hover:opacity-100"
            )}
            style={{ borderColor: activeGroup === 'rejection' ? FUNNEL_DATA.rejection.color : 'var(--workspace-surface-high)' }}
          >
             <div className="text-[16px] uppercase tracking-[0.08em] font-medium mb-1" style={{ color: FUNNEL_DATA.rejection.color }}>{groupLabel('rejection')}</div>
             <div className="text-[32px] font-normal text-[color:var(--workspace-text)] leading-none">{FUNNEL_DATA.rejection.total}</div>
             <div className="text-[16px] text-[color:var(--workspace-text-muted)] mt-1">{groupSubtitle('rejection')}</div>
          </button>

          {/* В РАБОТЕ (ЦЕНТР) */}
          <button
            onClick={() => setActiveGroup('in_progress')}
            className={cn(
              "flex-1 border rounded-[6px] p-3 flex flex-col items-center justify-center text-center transition-all",
              activeGroup === 'in_progress'
                ? "bg-[color:var(--workspace-surface-low)] shadow-[inset_0_0_10px_rgba(74,222,128,0.1)]"
                : "bg-[color:var(--workspace-surface-lowest)] hover:bg-[color:var(--workspace-surface-low)] opacity-70 hover:opacity-100"
            )}
            style={{ borderColor: activeGroup === 'in_progress' ? FUNNEL_DATA.in_progress.color : 'var(--workspace-surface-high)' }}
          >
             <div className="text-[16px] uppercase tracking-[0.08em] font-medium mb-1" style={{ color: FUNNEL_DATA.in_progress.color }}>{groupLabel('in_progress')}</div>
             <div className="text-[32px] font-normal text-[color:var(--workspace-text)] leading-none">{FUNNEL_DATA.in_progress.total}</div>
             <div className="text-[16px] text-[color:var(--workspace-text-muted)] mt-1">{groupSubtitle('in_progress')}</div>
          </button>

          {/* КУПИЛИ (СПРАВА ВНИЗУ) */}
          <button
            onClick={() => setActiveGroup('success')}
            className={cn(
              "flex-1 border rounded-[6px] p-3 flex flex-col items-center justify-center text-center transition-all",
              activeGroup === 'success'
                ? "bg-[color:var(--workspace-surface-low)] shadow-[inset_0_0_10px_rgba(230,195,100,0.1)]"
                : "bg-[color:var(--workspace-surface-lowest)] hover:bg-[color:var(--workspace-surface-low)] opacity-70 hover:opacity-100"
            )}
            style={{ borderColor: activeGroup === 'success' ? FUNNEL_DATA.success.color : 'var(--workspace-surface-high)' }}
          >
             <div className="text-[16px] uppercase tracking-[0.08em] font-medium mb-1" style={{ color: FUNNEL_DATA.success.color }}>{groupLabel('success')}</div>
             <div className="text-[32px] font-normal text-[color:var(--workspace-text)] leading-none">{FUNNEL_DATA.success.total}</div>
             <div className="text-[16px] text-[color:var(--workspace-text-muted)] mt-1">{groupSubtitle('success')}</div>
          </button>

        </div>

      </div>
    </DeskShell>
  )
}
