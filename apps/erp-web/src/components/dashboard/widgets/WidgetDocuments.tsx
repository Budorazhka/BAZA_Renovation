import { FileText } from 'lucide-react'
import { DeskShell, DeskHeader, DeskHero, DeskMiniStats } from '../desk-shared'
import type { WidgetSlot } from '@/config/widgets-config'
import { useI18n } from "@/i18n";

const MOCK_DOCS = [
  { id: 'd1', label: 'Договор задатка · Фролов Д.А.',    status: 'На согласовании',   color: '#fbbf24' },
  { id: 'd2', label: 'ДКП · Иванов А.В.',                status: 'Готов к подписанию', color: '#4ade80' },
  { id: 'd3', label: 'Доп. соглашение · Петров И.С.',    status: 'На проверке',        color: '#fb923c' },
  { id: 'd4', label: 'Шаблон: Аренда стандарт',          status: 'Активный',           color: '#60a5fa' },
  { id: 'd5', label: 'Отчёт по сделке · Смирнова',       status: 'Черновик',           color: '#94a3b8' },
  { id: 'd6', label: 'Договор купли-продажи · Захаров',  status: 'На согласовании',   color: '#fbbf24' },
  { id: 'd7', label: 'Акт приёма-передачи · Николаев',   status: 'Готов к подписанию', color: '#4ade80' },
  { id: 'd8', label: 'Доверенность · Климова Т.В.',      status: 'На проверке',        color: '#fb923c' },
]

export function WidgetDocuments({ slot }: { slot: WidgetSlot }) {
    const { t } = useI18n();
  const pending  = MOCK_DOCS.filter((d) => d.status === 'На согласовании').length
  const ready    = MOCK_DOCS.filter((d) => d.status === 'Готов к подписанию').length
  const inReview = MOCK_DOCS.filter((d) => d.status === 'На проверке').length

  const items = MOCK_DOCS.slice(0, slot === 'big' ? 8 : slot === 'med' ? 6 : 4)

  if (slot === 'small') {
    return (
      <DeskShell accent="#94a3b8" className="flex flex-col">
        <DeskHeader
          icon={<FileText className="size-4" strokeWidth={2} />}
          title={t('dashboard.widgets.widgetDocuments.документы')}
          accentColor="#94a3b8"
          layout="compact"
        />
        <DeskHero
          label={t('dashboard.widgets.widgetDocuments.готовы_к_подписанию')}
          value={String(ready)}
          sub={`/ ${MOCK_DOCS.length} всего`}
          color="#4ade80"
          pct={MOCK_DOCS.length > 0 ? (ready / MOCK_DOCS.length) * 100 : 0}
        />
        <DeskMiniStats
          items={[
            { label: 'На согласовании', value: String(pending),  color: '#fbbf24' },
            { label: 'На проверке',     value: String(inReview), color: '#fb923c' },
            { label: 'Всего',           value: String(MOCK_DOCS.length), color: '#94a3b8' },
          ]}
        />
      </DeskShell>
    )
  }

  return (
    <DeskShell accent="#94a3b8" className="flex flex-col">
      <DeskHeader
        icon={<FileText className="size-5" strokeWidth={2} />}
        title={t('dashboard.widgets.widgetDocuments.документы')}
        accentColor="#94a3b8"
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2">
        <ul className="space-y-1">
          {items.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-[color:var(--workspace-row-border)] bg-[var(--workspace-row-bg)] px-2.5 py-1.5"
            >
              <p className="min-w-0 flex-1 truncate text-[12px] text-[color:var(--workspace-text)]">{d.label}</p>
              <span
                className="shrink-0 rounded px-1.5 py-px text-[10px] uppercase"
                style={{ color: d.color, border: `1px solid ${d.color}55` }}
              >
                {d.status}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </DeskShell>
  )
}
