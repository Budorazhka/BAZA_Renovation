import { type WidgetSlot, WIDGET_META } from '@/config/widgets-config'
import { DeskShell, DeskHeader, DeskEmptyState } from '../desk-shared'
import { Users2 } from 'lucide-react'
import { useI18n } from '@/i18n'

interface Props {
  slot: WidgetSlot
}

export function WidgetDevPartners({ slot }: Props) {
  const { t } = useI18n()
  const meta = WIDGET_META['dev_partners']

  if (slot === 'small') {
    return (
      <DeskShell accent={meta.accent}>
        <DeskHeader title={t('widgets.devPartners.title', meta.label)} accentColor={meta.accent} icon={<Users2 className="size-5" />} />
        <DeskEmptyState text={t('widgets.devPartners.smallSlotText', 'Слишком маленький слот')} />
      </DeskShell>
    )
  }

  const agents = [
    { name: 'Александр Коваль (GeoPrime)', apartments: 12, leads: 45, trend: '+3' },
    { name: 'Елена Батурина (Batumi Invest)', apartments: 9, leads: 38, trend: '+1' },
    { name: 'Сергей Игнатов (Частный)', apartments: 8, leads: 22, trend: '-2' },
    { name: 'Мария Сиди (SeaView)', apartments: 5, leads: 18, trend: '0' },
  ]

  return (
    <DeskShell accent={meta.accent} className="flex flex-col">
      <DeskHeader title={t('widgets.devPartners.title', meta.label)} accentColor={meta.accent} icon={<Users2 className="size-5" />} />
      <div className="flex flex-col flex-1 p-4 overflow-y-auto">
        <table className="w-full text-left border-collapse border border-[color:var(--workspace-surface-high)]">
          <thead>
            <tr className="bg-[color:var(--workspace-surface-low)] border-b border-[color:var(--workspace-surface-high)]">
              <th className="p-3 text-[16px] text-[color:var(--workspace-text-muted)] uppercase tracking-[0.05em] font-medium border-r border-[color:var(--workspace-surface-high)]">{t('widgets.devPartners.columnAgent', 'Агент (Внешний)')}</th>
              <th className="p-3 text-[16px] text-[color:var(--workspace-text-muted)] uppercase tracking-[0.05em] font-medium text-right border-r border-[color:var(--workspace-surface-high)]">{t('widgets.devPartners.columnApartments', 'Квартир')}</th>
              <th className="p-3 text-[16px] text-[color:var(--workspace-text-muted)] uppercase tracking-[0.05em] font-medium text-right">{t('widgets.devPartners.columnLeadsInProgress', 'Лидов в работе')}</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a, idx) => {
              return (
                <tr key={idx} className="border-b border-[color:var(--workspace-surface-high)] hover:bg-[color:var(--workspace-surface-lowest)] transition-colors">
                  <td className="p-3 text-[color:var(--workspace-text)] text-[17px] border-r border-[color:var(--workspace-surface-high)]">{a.name}</td>
                  <td className="p-3 text-[#4ade80] text-[18px] font-normal text-right border-r border-[color:var(--workspace-surface-high)]">{a.apartments}</td>
                  <td className="p-3 text-[color:var(--workspace-text)] text-[18px] font-normal text-right">{a.leads}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </DeskShell>
  )
}
