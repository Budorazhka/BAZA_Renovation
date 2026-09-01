import { type WidgetSlot, WIDGET_META } from '@/config/widgets-config'
import { DeskShell, DeskHeader } from '../desk-shared'
import { Eye } from 'lucide-react'
import { BarChart, Bar, ResponsiveContainer, XAxis, Tooltip } from 'recharts'
import { useI18n } from '@/i18n'

interface Props {
  slot: WidgetSlot
}

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
const VIEWINGS_BY_DAY = [12, 19, 15, 22, 28, 35, 30]

export function WidgetDevMarketing({ slot: _slot }: Props) {
  const { t } = useI18n()
  const meta = WIDGET_META['dev_marketing']

  const data = DAY_KEYS.map((day, idx) => ({
    name: t(`widgets.devMarketing.days.${day}`),
    viewings: VIEWINGS_BY_DAY[idx],
  }))

  return (
    <DeskShell accent={meta.accent} className="flex flex-col">
      <DeskHeader title={t('widgets.devMarketing.title', meta.label)} accentColor={meta.accent} icon={<Eye className="size-5" />} />
      <div className="flex flex-col flex-1 justify-between p-4 gap-4">
        <div className="flex gap-4">
          <div className="flex-1 bg-[color:var(--workspace-surface-lowest)] border border-[color:var(--workspace-surface-high)] rounded-[6px] p-3 flex flex-col items-center justify-center">
            <span className="text-[16px] text-[color:var(--workspace-text-muted)] uppercase tracking-[0.05em] mb-1">{t('widgets.devMarketing.weekTotal', 'За неделю')}</span>
            <span className="text-[28px] font-normal text-[color:var(--workspace-text)] leading-none">161</span>
          </div>
          <div className="flex-1 bg-[color:var(--workspace-surface-lowest)] border border-[color:var(--workspace-surface-high)] rounded-[6px] p-3 flex flex-col items-center justify-center">
            <span className="text-[16px] text-[color:var(--workspace-text-muted)] uppercase tracking-[0.05em] mb-1">{t('widgets.devMarketing.bookingConversion', 'Конверсия в бронь')}</span>
            <span className="text-[28px] font-medium text-[#c084fc] leading-none">14%</span>
          </div>
        </div>

        <div className="flex-1 w-full min-h-[140px] mt-2 relative -mx-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--workspace-text-muted)', fontSize: 13 }} dy={10} />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                contentStyle={{
                  backgroundColor: 'rgba(10, 35, 28, 0.95)',
                  border: '1px solid rgba(192, 132, 252, 0.3)',
                  borderRadius: '6px',
                  color: '#fff',
                  fontFamily: "'Montserrat', sans-serif"
                }}
                itemStyle={{ color: '#fff', fontSize: '14px', fontWeight: 500 }}
                formatter={(value: any) => [`${value} ${t('widgets.devMarketing.tooltipViewsSuffix', 'показов')}`, t('widgets.devMarketing.tooltipTotal', 'Итого')]}
              />
              <Bar dataKey="viewings" fill="#c084fc" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </DeskShell>
  )
}
