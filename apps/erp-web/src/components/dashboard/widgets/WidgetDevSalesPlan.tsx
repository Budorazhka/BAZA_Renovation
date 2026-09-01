import { useState } from 'react'
import { type WidgetSlot, WIDGET_META } from '@/config/widgets-config'
import { DeskShell } from '../desk-shared'
import { Target, Edit2, Save } from 'lucide-react'
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts'
import { useI18n } from '@/i18n'

interface Props {
  slot: WidgetSlot
}

export function WidgetDevSalesPlan({ slot: _slot }: Props) {
  const { t } = useI18n()
  const meta = WIDGET_META['dev_sales_plan']

  const [activeTab, setActiveTab] = useState<'deals' | 'bookings' | 'leads'>('deals')
  const [isEditing, setIsEditing] = useState(false)
  const [planValue, setPlanValue] = useState(150)
  const factValue = 102

  const getTabLabel = (tab: 'deals' | 'bookings' | 'leads') => {
    switch (tab) {
      case 'deals': return t('widgets.devSalesPlan.tabs.deals', 'Сделки')
      case 'bookings': return t('widgets.devSalesPlan.tabs.bookings', 'Брони')
      case 'leads': return t('widgets.devSalesPlan.tabs.leads', 'Лиды')
    }
  }

  const handleSave = () => {
    setIsEditing(false)
    // In real app, save to backend
  }

  const planPct = Math.min(Math.round((factValue / planValue) * 100), 100)

  // Генерируем красивую кривую для графика динамики
  const chartData = [
    { day: 1, value: 5 }, { day: 3, value: 12 }, { day: 6, value: 24 }, 
    { day: 9, value: 38 }, { day: 12, value: 45 }, { day: 15, value: 58 }, 
    { day: 18, value: 65 }, { day: 21, value: 78 }, { day: 24, value: 89 }, 
    { day: 27, value: 95 }, { day: 30, value: factValue }
  ]

  return (
    <DeskShell accent={meta.accent} className="flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[color:var(--workspace-surface-high)]">
        <div className="flex items-center gap-2">
          <Target className="size-5" style={{ color: meta.accent }} />
          <h3 className="text-[16px] font-medium uppercase tracking-[0.08em] text-[#fb923c]">{t('widgets.devSalesPlan.title', meta.label)}</h3>
        </div>
        <div className="flex gap-2">
          {(['leads', 'bookings', 'deals'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1 rounded text-[15px] font-medium transition-colors ${activeTab === tab ? 'bg-[#fb923c] text-black' : 'bg-[color:var(--workspace-surface-low)] text-[color:var(--workspace-text-muted)] hover:text-[color:var(--workspace-text)]'}`}
            >
              {getTabLabel(tab)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col flex-1 p-4">
        <div className="flex items-center justify-between mb-4 border border-[color:var(--workspace-surface-high)] p-4 rounded-[6px] bg-[color:var(--workspace-surface-lowest)]">
          <div className="flex flex-col">
            <span className="text-[16px] text-[color:var(--workspace-text-muted)] uppercase tracking-[0.05em] mb-1">{t('widgets.devSalesPlan.factLabel', 'Факт')} ({getTabLabel(activeTab)})</span>
            <span className="text-[32px] font-normal text-[color:var(--workspace-text)] leading-none">{factValue}</span>
          </div>

          <div className="flex flex-col text-right">
            <div className="flex items-center justify-end gap-2 mb-1">
              <span className="text-[16px] text-[color:var(--workspace-text-muted)] uppercase tracking-[0.05em]">{t('widgets.devSalesPlan.planLabel', 'План')}</span>
              {isEditing ? (
                <button onClick={handleSave} className="text-[#4ade80] hover:opacity-80"><Save className="size-4" /></button>
              ) : (
                <button onClick={() => setIsEditing(true)} className="text-[#fb923c] hover:opacity-80"><Edit2 className="size-4" /></button>
              )}
            </div>
            {isEditing ? (
              <input 
                type="number" 
                value={planValue} 
                onChange={e => setPlanValue(Number(e.target.value))}
                className="w-24 bg-transparent border-b border-[#fb923c] text-[32px] font-normal text-[color:var(--workspace-text)] leading-none outline-none text-right"
                autoFocus
              />
            ) : (
              <span className="text-[32px] font-normal text-[color:var(--workspace-text)] leading-none">{planValue}</span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 mb-4">
          <div className="flex justify-between text-[16px] text-[color:var(--workspace-text-muted)]">
            <span>{t('widgets.devSalesPlan.progressLabel', 'Прогресс выполнения')}</span>
            <span className="text-[#fb923c] font-medium">{planPct}%</span>
          </div>
          <div className="h-4 w-full bg-[color:var(--workspace-surface-lowest)] border border-[color:var(--workspace-surface-high)] rounded-[4px] overflow-hidden">
            <div className="h-full bg-[#fb923c] transition-all duration-500" style={{ width: `${planPct}%` }} />
          </div>
        </div>

        <div className="flex-1 w-full min-h-[120px] relative -mx-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#fb923c" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#fb923c" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'rgba(10, 35, 28, 0.95)', 
                  border: '1px solid rgba(251, 146, 60, 0.3)', 
                  borderRadius: '6px', 
                  color: '#fff',
                  fontFamily: "'Montserrat', sans-serif"
                }} 
                labelStyle={{ display: 'none' }}
                itemStyle={{ color: '#fff', fontSize: '14px', fontWeight: 500 }}
                formatter={(value: any) => [`${value} ${getTabLabel(activeTab).toLowerCase()}`, t('widgets.devSalesPlan.tooltipFact', 'Факт')]}
              />
              <Area 
                type="monotone" 
                dataKey="value" 
                stroke="#fb923c" 
                strokeWidth={3}
                fillOpacity={1} 
                fill="url(#colorValue)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </DeskShell>
  )
}
