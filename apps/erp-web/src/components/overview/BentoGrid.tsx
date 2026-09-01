import {
  Clock,
  Users,
  Target,
  Wallet,
  Presentation,
  Home,
} from 'lucide-react'
import { StatCard } from './StatCard'
import { ReferralsStatCard } from './ReferralsStatCard'
import type { NetworkAnalyticsData, AnalyticsPeriod } from '@/lib/city-analytics'
import { useI18n } from "@/i18n";

interface BentoGridProps {
  analytics: NetworkAnalyticsData
}

function getPeriodTrendText(period: AnalyticsPeriod) {
  if (period === 'week') return 'по сравнению с прошлой неделей'
  if (period === 'month') return 'по сравнению с прошлым месяцем'
  return ''
}

export function BentoGrid({ analytics }: BentoGridProps) {
    const { t } = useI18n();
  const { current, trendsPercent, period } = analytics
  const trendText = getPeriodTrendText(period)
  const hasTrends = period !== 'allTime'

  return (
    <section className="w-full overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <div className="flex min-w-[1080px]">
        <div className="min-w-[146px] shrink-0 flex-1 border-r border-slate-200 px-2.5 py-1.5">
        <StatCard
          label={t('overview.bentoGrid.новые_лиды')}
          value={current.leads.toLocaleString('ru-RU')}
          icon={Target}
          description={`Из ${current.activeCities} городов`}
          trendPercent={hasTrends ? trendsPercent.leads : undefined}
          trendLabel={trendText}
        />
      </div>

        <div className="min-w-[146px] shrink-0 flex-1 border-r border-slate-200 px-2.5 py-1.5">
        <StatCard
          label={t('overview.bentoGrid.презентации')}
          value={current.presentations.toLocaleString('ru-RU')}
          icon={Presentation}
          description={t('overview.bentoGrid.встречи_по_лидам')}
          trendPercent={hasTrends ? trendsPercent.presentations : undefined}
          trendLabel={trendText}
        />
      </div>

        <div className="min-w-[178px] shrink-0 flex-1 border-r border-slate-200 px-2.5 py-1.5">
        <ReferralsStatCard
          valueL1={current.referralsL1}
          valueL2={current.referralsL2}
          trendPercentL1={hasTrends ? trendsPercent.referralsL1 : undefined}
          trendPercentL2={hasTrends ? trendsPercent.referralsL2 : undefined}
          trendLabel={trendText}
        />
      </div>

        <div className="min-w-[146px] shrink-0 flex-1 border-r border-slate-200 px-2.5 py-1.5">
        <StatCard
          label={t('overview.bentoGrid.всего_объектов')}
          value={current.objectsTotal.toLocaleString('ru-RU')}
          icon={Home}
          description={`За ${analytics.periodLabel.toLowerCase()}`}
          trendPercent={hasTrends ? trendsPercent.objectsTotal : undefined}
          trendLabel={trendText}
        />
      </div>

        <div className="min-w-[146px] shrink-0 flex-1 border-r border-slate-200 px-2.5 py-1.5">
        <StatCard
          label={t('overview.bentoGrid.комиссия')}
          value={`$${current.revenue.toLocaleString('ru-RU')}`}
          icon={Wallet}
          description={t('overview.bentoGrid.суммарный_доход_сети')}
          trendPercent={hasTrends ? trendsPercent.revenue : undefined}
          trendLabel={trendText}
        />
      </div>

        <div className="min-w-[146px] shrink-0 flex-1 border-r border-slate-200 px-2.5 py-1.5">
        <StatCard
          label={t('overview.bentoGrid.время_в_системе')}
          value={`${current.crmHours.toLocaleString('ru-RU')}ч`}
          icon={Clock}
          trendPercent={hasTrends ? trendsPercent.crmHours : undefined}
          trendLabel={trendText}
        />
      </div>

        <div className="min-w-[146px] shrink-0 flex-1 px-2.5 py-1.5">
        <StatCard
          label={t('overview.bentoGrid.сеть_рефералов')}
          value={`${current.partnersOnline} / ${current.partnersAll}`}
          icon={Users}
          description={t('overview.bentoGrid.сейчас_онлайн_всего')}
        />
      </div>
      </div>
    </section>
  )
}
