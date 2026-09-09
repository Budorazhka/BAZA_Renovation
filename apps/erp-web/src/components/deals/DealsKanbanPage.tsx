import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Plus, Briefcase, AlertTriangle, ChevronRight } from 'lucide-react'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { formatUsdMillions } from '@/lib/format-currency'
import { STAGE_LABELS, STAGE_ORDER, type Deal, type DealStage } from '@/types/deals'
import { useLeads } from '@/context/LeadsContext'
import { useDeals } from '@/context/DealsContext'
import { leadsApiV2 } from '@/services/leadsApiV2'
import { useModulePermissions } from '@/hooks/useModulePermissions'
import { LEAD_STAGE_COLUMN, LEAD_STAGES } from '@/data/leads-mock'
import { ExportButton } from '@/components/common/ExportButton'
import type { Lead } from '@/types/leads'
import { useI18n } from "@/i18n";


const STAGE_COLORS: Record<DealStage, string> = {
  showing:     '#60a5fa',
  deposit:     '#f87171',
  deal:        '#c9a84c',
  golden:      '#d3bd75',
  check_in:    '#fbbf24',
  referral:    '#f59e0b',
  closed_lost: '#64748b',
}

const C = {
  text: 'var(--app-text)',
  textMuted: 'var(--app-text-muted)',
  textSubtle: 'var(--app-text-subtle)',
  border: 'var(--green-border)',
  card: 'var(--green-card)',
}

function formatPrice(n: number) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  return `${(n / 1000).toFixed(0)}K`
}

export function DealsKanbanPage() {
    const { t } = useI18n();
  const navigate = useNavigate()
  const { canEdit: canEditModule } = useModulePermissions()
  const canEditDeals = canEditModule('deals')
  const { state, leadManagers } = useLeads()
  const { deals, changeStage, createDeal } = useDeals()
  const [isLeadPickerOpen, setIsLeadPickerOpen] = useState(false)
  const [isCreatingFromLead, setIsCreatingFromLead] = useState(false)

  const salesFunnelLeads = useMemo(
    () => state.leadPool.filter(lead => LEAD_STAGE_COLUMN[lead.stageId] !== 'rejection'),
    [state.leadPool],
  )

  const linkedLeadIds = useMemo(() => new Set(deals.map(d => d.sourceLeadId).filter(Boolean)), [deals])
  const selectableLeads = useMemo(
    () => salesFunnelLeads.filter(lead => !linkedLeadIds.has(lead.id)),
    [salesFunnelLeads, linkedLeadIds],
  )

  const dealsByStage = STAGE_ORDER.reduce<Record<DealStage, Deal[]>>((acc, stage) => {
    acc[stage] = deals.filter(d => d.stage === stage)
    return acc
  }, {} as Record<DealStage, Deal[]>)

  async function advanceStage(deal: Deal) {
    const idx = STAGE_ORDER.indexOf(deal.stage)
    if (idx < 0 || idx >= STAGE_ORDER.length - 1) return
    const nextStage = STAGE_ORDER[idx + 1]
    await changeStage(deal.id, nextStage)
  }

  /**
   * Создание сделки из лида воронки продаж. POST /deals требует `contactId`
   * (id Contact, не Lead) — лид из пула LeadsContext (мапленный
   * mapLeadV2ToPoker) его не несёт, поэтому дочитываем полную запись лида
   * через leadsApiV2.getById непосредственно перед созданием, а не храним
   * лишний запрос на каждую карточку пула.
   */
  async function createDealFromSelectedLead(lead: Lead) {
    if (deals.some(d => d.sourceLeadId === lead.id) || isCreatingFromLead) return
    setIsCreatingFromLead(true)
    try {
      const fullLead = await leadsApiV2.getById(lead.id)
      if (!fullLead.contact) {
        toast.error('У лида нет привязанного контакта — нельзя создать сделку')
        return
      }
      const created = await createDeal({
        contactId: fullLead.contact.id,
        leadId: lead.id,
        title: lead.name ? `Сделка: ${lead.name}` : `Сделка по лиду ${lead.id}`,
        ownerPositionId: lead.managerId ?? undefined,
      })
      if (created) {
        setIsLeadPickerOpen(false)
        navigate(`/dashboard/deals/${created.id}`)
      }
    } finally {
      setIsCreatingFromLead(false)
    }
  }

  return (
    <DashboardShell>
      <div
        style={{
          padding: '24px 28px 40px',
          width: '100%',
          maxWidth: '100%',
          boxSizing: 'border-box',
          background: 'var(--app-bg)',
          minHeight: '100%',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 400, color: C.text, letterSpacing: '-0.01em' }}>{t('deals.dealsKanbanPage.сделки')}</div>
            <div style={{ fontSize: 13, color: C.textSubtle, marginTop: 4 }}>
              {t('deals.dealsKanbanPage.канбан_воронки')}{deals.length} {t('deals.dealsKanbanPage.сделок_в_воронке')}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, position: 'relative' as const, alignItems: 'center' }}>
            <ExportButton entity="deals" label="Экспорт сделок" />
            <button
              onClick={() => navigate('/dashboard/deals/report')}
              style={{
                padding: '9px 16px',
                background: 'var(--hub-card-bg)',
                border: '1px solid var(--hub-card-border)',
                borderRadius: 7,
                color: C.textMuted,
                fontSize: 12,
                fontWeight: 400,
                cursor: 'pointer',
              }}
            >
              {t('deals.dealsKanbanPage.отч_т')}</button>

            {canEditDeals ? (
              <button
                type="button"
                className="alphabase-section-primary"
                onClick={() => setIsLeadPickerOpen(v => !v)}
              >
                <Plus size={13} strokeWidth={2.5} /> {t('deals.dealsKanbanPage.новая_сделка')}</button>
            ) : null}
            {isLeadPickerOpen && (
              <div style={{
                position: 'absolute',
                right: 0,
                top: 'calc(100% + 8px)',
                width: 420,
                maxHeight: 360,
                overflowY: 'auto' as const,
                background: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                zIndex: 30,
                boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
              }}>
                <div style={{ padding: '10px 12px', borderBottom: `1px solid ${C.border}`, fontSize: 11, color: C.textSubtle, fontWeight: 400, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
                  {t('deals.dealsKanbanPage.выбери_лида_этапы_в')}</div>
                {selectableLeads.length === 0 && (
                  <div style={{ padding: '14px 12px', color: C.textSubtle, fontSize: 12 }}>
                    {t('deals.dealsKanbanPage.нет_лидов_для_создан')}</div>
                )}
                {selectableLeads.map(lead => {
                  const stageName = LEAD_STAGES.find(s => s.id === lead.stageId)?.name ?? lead.stageId
                  const managerName = lead.managerId
                    ? leadManagers.find(m => m.id === lead.managerId)?.name ?? 'Не назначен'
                    : 'Не назначен'
                  return (
                    <button
                      key={lead.id}
                      disabled={isCreatingFromLead}
                      onClick={() => createDealFromSelectedLead(lead)}
                      style={{
                        width: '100%',
                        textAlign: 'left' as const,
                        background: 'transparent',
                        border: 'none',
                        borderBottom: `1px solid ${C.border}`,
                        padding: '10px 12px',
                        cursor: isCreatingFromLead ? 'default' : 'pointer',
                        color: C.text,
                        opacity: isCreatingFromLead ? 0.6 : 1,
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 400 }}>{lead.name ?? `Лид ${lead.id}`}</div>
                      <div style={{ fontSize: 11, color: C.textSubtle, marginTop: 3 }}>
                        {t('deals.dealsKanbanPage.этап')}{stageName} {t('deals.dealsKanbanPage.менеджер')}{managerName}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Kanban board */}
        <div
          style={{
            display: 'flex',
            gap: 12,
            width: '100%',
            overflowX: 'auto' as const,
            paddingBottom: 16,
            marginTop: 20,
            alignItems: 'stretch',
          }}
        >
          {STAGE_ORDER.map(stage => {
            const stageDealList = dealsByStage[stage] || []
            const stageColor = STAGE_COLORS[stage]
            const totalCommission = stageDealList.reduce((s, d) => s + d.commission, 0)

            return (
              <div
                key={stage}
                style={{
                  flex: '1 1 0%',
                  minWidth: 260,
                  maxWidth: '100%',
                }}
              >
                {/* Column header */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: `${stageColor}12`,
                  border: `1px solid ${stageColor}30`,
                  borderRadius: '8px 8px 0 0',
                  borderBottom: 'none',
                }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 400, color: stageColor, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
                      {STAGE_LABELS[stage]}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--app-text-subtle)', marginTop: 2 }}>
                      {stageDealList.length} {t('deals.dealsKanbanPage.сделок')}{formatPrice(totalCommission)} {t('deals.dealsKanbanPage.комисс')}</div>
                  </div>
                  <div style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: `${stageColor}20`,
                    border: `1px solid ${stageColor}40`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 400,
                    color: stageColor,
                  }}>
                    {stageDealList.length}
                  </div>
                </div>

                {/* Cards */}
                <div style={{
                  minHeight: 'clamp(200px, calc(100vh - 280px), 720px)',
                  background: 'var(--green-deep)',
                  border: `1px solid ${stageColor}20`,
                  borderTop: 'none',
                  borderRadius: '0 0 8px 8px',
                  padding: 10,
                  display: 'flex',
                  flexDirection: 'column' as const,
                  gap: 8,
                }}>
                  {stageDealList.map(deal => (
                    <DealCard
                      key={deal.id}
                      deal={deal}
                      stageColor={stageColor}
                      onAdvance={() => advanceStage(deal)}
                      onClick={() => navigate(`/dashboard/deals/${deal.id}`)}
                    />
                  ))}
                  {stageDealList.length === 0 && (
                    <div style={{ padding: '20px 0', textAlign: 'center' as const, fontSize: 11, color: 'var(--app-text-subtle)' }}>
                      {t('deals.dealsKanbanPage.пусто')}</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </DashboardShell>
  )
}

function DealCard({
  deal,
  stageColor,
  onAdvance,
  onClick,
}: {
  deal: Deal
  stageColor: string
  onAdvance: () => void
  onClick: () => void
}) {
    const { t } = useI18n();
  const C_local = {
    text: 'var(--app-text)',
    textSubtle: 'var(--app-text-subtle)',
    border: 'var(--green-border)',
    card: 'var(--green-card)',
    gold: 'var(--gold)',
  }

  const doneItems = deal.checklist.filter(c => c.done).length
  const totalItems = deal.checklist.length
  const checklistPct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0
  const canAdvance = STAGE_ORDER.indexOf(deal.stage) < STAGE_ORDER.length - 1
  return (
    <div
      style={{
        background: C_local.card,
        border: `1px solid ${C_local.border}`,
        borderRadius: 8,
        padding: '12px',
        cursor: 'pointer',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = `${stageColor}50`)}
      onMouseLeave={e => (e.currentTarget.style.borderColor = C_local.border)}
    >
      {/* Deal info */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 400, color: C_local.text, marginBottom: 2 }}>
          {deal.clientName}
        </div>
        <div style={{ fontSize: 11, color: C_local.textSubtle }}>{deal.propertyAddress}</div>
        <div style={{ fontSize: 10, color: C_local.textSubtle }}>{deal.propertyType}</div>
      </div>

      {/* Price */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 400, color: C_local.text }}>
          {formatUsdMillions(deal.price, 1)}
        </span>
        <span style={{ fontSize: 11, color: C_local.gold }}>
          +{(deal.commission / 1000).toFixed(0)}{t('deals.dealsKanbanPage.k_комисс')}</span>
      </div>

      {/* Checklist progress */}
      {totalItems > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontSize: 10, color: C_local.textSubtle }}>{t('deals.dealsKanbanPage.чеклист')}</span>
            <span style={{ fontSize: 10, color: C_local.textSubtle }}>{doneItems}/{totalItems}</span>
          </div>
          <div style={{ height: 3, background: 'var(--hub-progress-track)', borderRadius: 2 }}>
            <div style={{
              height: '100%',
              width: `${checklistPct}%`,
              background: checklistPct === 100 ? '#4ade80' : stageColor,
              borderRadius: 2,
            }} />
          </div>
        </div>
      )}

      {/* Lawyer task badge */}
      {deal.lawyerTaskCreated && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
          <AlertTriangle size={10} color="#fb923c" />
          <span style={{ fontSize: 10, color: '#fb923c' }}>{t('deals.dealsKanbanPage.задача_юристу_создан')}</span>
        </div>
      )}

      {/* Agent */}
      <div style={{ fontSize: 10, color: C_local.textSubtle, marginBottom: 8 }}>
        {deal.agentName}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onClick() }}
          style={{
            flex: 1,
            padding: '6px 8px',
            background: 'var(--hub-tile-icon-bg)',
            border: '1px solid var(--hub-tile-icon-border)',
            borderRadius: 6,
            color: 'var(--app-text)',
            fontSize: 10,
            fontWeight: 400,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
            transition: 'background 0.15s, border-color 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'var(--nav-item-bg-active)'
            e.currentTarget.style.borderColor = 'var(--hub-card-border-hover)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'var(--hub-tile-icon-bg)'
            e.currentTarget.style.borderColor = 'var(--hub-tile-icon-border)'
          }}
        >
          <Briefcase size={12} strokeWidth={2.25} color="var(--gold)" aria-hidden />
          {t('deals.dealsKanbanPage.карточка')}</button>
        {canAdvance && (
          <button
            onClick={e => { e.stopPropagation(); onAdvance() }}
            style={{
              flex: 1,
              padding: '5px 8px',
              background: `${stageColor}15`,
              border: `1px solid ${stageColor}40`,
              borderRadius: 5,
              color: stageColor,
              fontSize: 10,
              fontWeight: 400,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            <ChevronRight size={10} /> {t('deals.dealsKanbanPage.продвинуть')}</button>
        )}
      </div>
    </div>
  )
}
