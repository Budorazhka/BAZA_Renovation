import { useState, useMemo } from 'react'
import { type WidgetSlot, WIDGET_META } from '@/config/widgets-config'
import { DeskShell, DeskHeader, DeskEmptyState } from '../desk-shared'
import { Building2 } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { useI18n } from '@/i18n'

interface Props {
  slot: WidgetSlot
}

const projects = [
  { name: 'Residence Park', free: 210, reserved: 45, sold: 195 },
  { name: 'Sky Garden', free: 500, reserved: 80, sold: 220 },
  { name: 'Олимп', free: 50, reserved: 20, sold: 250 },
]

const COLORS = {
  sold: '#4ade80',
  reserved: '#f87171',
  free: '#e6c364'
}

export function WidgetDevInventory({ slot }: Props) {
  const { t } = useI18n()
  const meta = WIDGET_META['dev_inventory']
  const [selectedProject, setSelectedProject] = useState<string>('all')

  const soldLabel = t('widgets.devInventory.sold', 'Продано')
  const reservedLabel = t('widgets.devInventory.reserved', 'Бронь')
  const freeLabel = t('widgets.devInventory.free', 'Свободно')

  const chartData = useMemo(() => {
    if (selectedProject === 'all') {
      return [
        { name: soldLabel, value: projects.reduce((acc, p) => acc + p.sold, 0), color: COLORS.sold },
        { name: reservedLabel, value: projects.reduce((acc, p) => acc + p.reserved, 0), color: COLORS.reserved },
        { name: freeLabel, value: projects.reduce((acc, p) => acc + p.free, 0), color: COLORS.free },
      ]
    }
    const proj = projects.find(p => p.name === selectedProject)
    if (!proj) return []
    return [
      { name: soldLabel, value: proj.sold, color: COLORS.sold },
      { name: reservedLabel, value: proj.reserved, color: COLORS.reserved },
      { name: freeLabel, value: proj.free, color: COLORS.free },
    ]
  }, [selectedProject, soldLabel, reservedLabel, freeLabel])

  if (slot === 'small') {
    return (
      <DeskShell accent={meta.accent}>
        <DeskHeader title={t('widgets.devInventory.title', meta.label)} accentColor={meta.accent} icon={<Building2 className="size-5" />} />
        <DeskEmptyState text={t('widgets.devInventory.smallSlotText', 'Слишком маленький слот')} />
      </DeskShell>
    )
  }

  return (
    <DeskShell accent={meta.accent} className="flex flex-col">
      <DeskHeader
        title={t('widgets.devInventory.title', meta.label)}
        accentColor={meta.accent}
        icon={<Building2 className="size-5" />}
        right={
          <select
            value={selectedProject}
            onChange={e => setSelectedProject(e.target.value)}
            className="bg-[color:var(--workspace-surface-high)] border border-[color:var(--workspace-surface-highest)] text-[color:var(--workspace-text)] text-[13px] rounded-[4px] px-2 py-1 outline-none cursor-pointer hover:bg-[color:var(--workspace-surface-hover)] transition-colors h-7 font-['Montserrat']"
          >
            <option value="all">{t('widgets.devInventory.allComplexes', 'Все ЖК')}</option>
            {projects.map(p => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </select>
        }
      />
      <div className="flex-1 p-2 flex items-center justify-center min-h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={4}
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(10, 35, 28, 0.95)',
                border: '1px solid color-mix(in srgb, var(--gold) 30%, transparent)',
                borderRadius: '6px',
                color: '#fff',
                fontFamily: "'Montserrat', sans-serif"
              }}
              itemStyle={{ color: '#fff', fontSize: '14px', fontFamily: "'Montserrat', sans-serif" }}
            />
            <Legend 
              verticalAlign="bottom" 
              height={36}
              formatter={(value) => <span className="ml-1 font-normal font-['Montserrat']" style={{ color: 'var(--workspace-text)' }}>{value}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </DeskShell>
  )
}
