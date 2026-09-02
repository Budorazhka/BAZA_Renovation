import { Link } from 'react-router-dom'
import { ClipboardCheck } from 'lucide-react'
import { DeskShell, DeskHeader, DeskKpi, DeskHero, DeskMiniStats, DESK_HEADER_LINK_CLASS, REPORT_LINKS } from '../desk-shared'
import { mockProperties } from '@/components/management/my-properties/mock-data'
import type { WidgetSlot } from '@/config/widgets-config'
import { useI18n } from "@/i18n";

export function WidgetObjectQuality({ slot }: { slot: WidgetSlot }) {
    const { t } = useI18n();
  const all        = mockProperties
  const noPhoto    = all.filter((p) => !p.photo).length
  const noPrice    = all.filter((p) => !p.price).length
  const incomplete = Math.max(0, Math.round(all.length * 0.18))
  const ok         = Math.max(0, all.length - noPhoto - noPrice - incomplete)
  const qualityPct = all.length > 0 ? Math.round((ok / all.length) * 100) : 0

  if (slot === 'small') {
    return (
      <DeskShell accent="#fb7185" className="flex flex-col">
        <DeskHeader
          icon={<ClipboardCheck className="size-4" strokeWidth={2} />}
          title={t('dashboard.widgets.widgetObjectQuality.качество_базы')}
          accentColor="#fb7185"
          layout="compact"
          right={<Link to={REPORT_LINKS.objects} className={DESK_HEADER_LINK_CLASS}>{t('dashboard.widgets.widgetObjectQuality.отч_т')}</Link>}
        />
        <DeskHero
          label={t('dashboard.widgets.widgetObjectQuality.качественных_объекто')}
          value={String(ok)}
          sub={`/ ${all.length}`}
          color="#4ade80"
          pct={qualityPct}
        />
        <DeskMiniStats
          items={[
            { label: 'Без фото', value: String(noPhoto), color: '#f87171' },
            { label: 'Без цены', value: String(noPrice), color: '#fb923c' },
            { label: 'Неполных', value: String(incomplete), color: '#fbbf24' },
          ]}
        />
      </DeskShell>
    )
  }

  return (
    <DeskShell accent="#fb7185" className="flex flex-col">
      <DeskHeader
        icon={<ClipboardCheck className="size-5" strokeWidth={2} />}
        title={t('dashboard.widgets.widgetObjectQuality.качество_объектов')}
        accentColor="#fb7185"
        right={<Link to={REPORT_LINKS.objects} className={DESK_HEADER_LINK_CLASS}>{t('dashboard.widgets.widgetObjectQuality.отч_т')}</Link>}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2">
        <div className="grid grid-cols-2 gap-1.5">
          <DeskKpi label={t('dashboard.widgets.widgetObjectQuality.без_фото')}      value={String(noPhoto)}    color="#f87171" />
          <DeskKpi label={t('dashboard.widgets.widgetObjectQuality.без_цены')}      value={String(noPrice)}    color="#fb923c" />
          <DeskKpi label={t('dashboard.widgets.widgetObjectQuality.неполные')}      value={String(incomplete)} color="#fbbf24" />
          <DeskKpi label={t('dashboard.widgets.widgetObjectQuality.качественных')}  value={String(ok)}         color="#4ade80" pct={qualityPct} />
        </div>
      </div>
    </DeskShell>
  )
}
