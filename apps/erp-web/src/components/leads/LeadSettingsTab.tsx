import { Info } from 'lucide-react'
import { useLeads } from '@/context/LeadsContext'
import { useRolePermissions } from '@/hooks/useRolePermissions'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { DistributionRuleType } from '@/types/leads'
import { useI18n } from "@/i18n";

const RULE_LABELS: Record<DistributionRuleType, string> = {
  round_robin: 'По кругу (round-robin)',
  by_load: 'По загрузке',
  manual: 'Только ручная раздача',
}

const PANEL = 'rounded-xl border border-[color:var(--hub-card-border)] bg-[rgba(0,0,0,0.15)] p-5 space-y-4'
const LABEL = 'block text-xs font-medium uppercase tracking-wide text-[color:var(--hub-stat-label)]'

export function LeadSettingsTab() {
    const { t } = useI18n();
  const { state, dispatch } = useLeads()
  const { canChangeDistribution } = useRolePermissions()
  const { distributionRule, manualDistributorId, leadManagers } = state

  if (!canChangeDistribution) {
    return (
      <div className={PANEL}>
        <div className="flex items-start gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-[color:var(--hub-card-border)] bg-[var(--hub-action-hover)] text-[color:var(--hub-desc)]">
            <Info className="size-5" />
          </div>
          <div>
            <h3 className="font-medium text-[color:var(--app-text)]">{t('leads.leadSettingsTab.только_для_директора')}</h3>
            <p className="mt-1 text-sm text-[color:var(--hub-desc)]">
              {t('leads.leadSettingsTab.настройки_раздачи_до')}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 max-w-xl">

      {/* Distribution rule */}
      <div className={PANEL}>
        <div>
          <p className={LABEL}>{t('leads.leadSettingsTab.правило_раздачи')}</p>
          <p className="mt-1 text-sm text-[color:var(--hub-desc)]">
            {t('leads.leadSettingsTab.единое_правило_для_р')}</p>
        </div>
        <div className="space-y-1.5">
          <label className={LABEL}>{t('leads.leadSettingsTab.тип_правила')}</label>
          <Select
            value={distributionRule.type}
            onValueChange={(value: DistributionRuleType) => {
              dispatch({ type: 'SET_DISTRIBUTION_RULE', rule: { type: value } })
              if (value === 'round_robin' || value === 'by_load') {
                dispatch({ type: 'SET_MANUAL_DISTRIBUTOR', managerId: null })
              }
            }}
          >
            <SelectTrigger className="w-full max-w-xs rounded-xl border border-[color:var(--hub-card-border)] bg-[rgba(0,0,0,0.25)] text-[color:var(--app-text)] shadow-none focus:ring-1 focus:ring-[color:var(--hub-card-border)] focus:border-[color:var(--hub-card-border-hover)]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(RULE_LABELS) as DistributionRuleType[]).map((type) => (
                <SelectItem key={type} value={type}>
                  {RULE_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Manual distributor */}
      <div className={PANEL}>
        <div>
          <p className={LABEL}>{t('leads.leadSettingsTab.менеджер_в_рукопашно')}</p>
          <p className="mt-1 text-sm text-[color:var(--hub-desc)]">
            {distributionRule.type === 'manual'
              ? 'Кто вручную распределяет лиды. При выборе распределителя действует только ручная раздача.'
              : 'При правиле «По кругу» или «По загрузке» распределитель не используется — лиды назначаются автоматически.'}
          </p>
        </div>
        <div className="space-y-1.5">
          <label className={LABEL}>{t('leads.leadSettingsTab.распределитель')}</label>
          <Select
            value={manualDistributorId ?? '_none'}
            disabled={distributionRule.type !== 'manual'}
            onValueChange={(value) => {
              const id = value === '_none' ? null : value
              dispatch({ type: 'SET_MANUAL_DISTRIBUTOR', managerId: id })
              if (id != null) {
                dispatch({ type: 'SET_DISTRIBUTION_RULE', rule: { type: 'manual' } })
              }
            }}
          >
            <SelectTrigger className="w-full max-w-xs rounded-xl border border-[color:var(--hub-card-border)] bg-[rgba(0,0,0,0.25)] text-[color:var(--app-text)] shadow-none focus:ring-1 focus:ring-[color:var(--hub-card-border)] focus:border-[color:var(--hub-card-border-hover)] disabled:opacity-40">
              <SelectValue placeholder={t('leads.leadSettingsTab.не_назначен')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">{t('leads.leadSettingsTab.не_назначен')}</SelectItem>
              {leadManagers.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name} ({m.login})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

    </div>
  )
}
