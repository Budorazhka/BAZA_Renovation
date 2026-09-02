"use client";

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from 'recharts';
import { cn } from '@/lib/utils';
import type { FunnelBoard } from '@/types/analytics';
import { useI18n } from "@/i18n";

function getStageCumulativeCount(board: FunnelBoard, stageName: string): number {
  let count = 0;
  let found = false;
  const flowColumnIds = ['in_progress', 'active', 'success', 'preparation'];

  for (const columnId of flowColumnIds) {
    const column = board.columns.find((item) => item.id === columnId);
    if (!column) continue;
    for (const stage of column.stages) {
      if (stage.name === stageName) found = true;
      if (found) count += stage.count;
    }
  }
  return count;
}

function calculateFunnelConversion(board: FunnelBoard, fromStage: string, toStage: string): number {
  const fromCount = getStageCumulativeCount(board, fromStage);
  const toCount = getStageCumulativeCount(board, toStage);
  if (fromCount === 0) return 0;
  return Math.round((toCount / fromCount) * 100);
}

function MetricTooltipLabel({ label, hint }: { label: string; hint: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="cursor-help decoration-dotted underline underline-offset-2 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          tabIndex={0}
        >
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} className="max-w-[260px] text-center leading-relaxed">
        {hint}
      </TooltipContent>
    </Tooltip>
  );
}

interface DirectActionsCardProps {
  data: {
    addedLeads: number;
    callClicks: number;
    chatOpens: number;
    selectionsCreated: number;
    deals: number;
  };
  salesFunnel: FunnelBoard;
}

export function DirectActionsCard({ data, salesFunnel }: DirectActionsCardProps) {
    const { t } = useI18n();
  const totalTouches = data.callClicks + data.chatOpens + data.selectionsCreated;
  const funnelMoves = Math.max(0, Math.round(data.addedLeads * 1.6 + data.selectionsCreated * 0.5));
  
  // Funnel stage matching must use Russian strings to query backend data
  const leadToPresentation = calculateFunnelConversion(salesFunnel, "Новый лид", "Презентовали компанию");
  const presentationToShowing = calculateFunnelConversion(salesFunnel, "Презентовали компанию", "Показ");
  const showingToDeal = calculateFunnelConversion(salesFunnel, "Показ", "Заключен договор");
  const leadToDeal = calculateFunnelConversion(salesFunnel, "Новый лид", "Заключен договор");
  
  const touchToDeal = totalTouches > 0 ? Math.round((data.deals / totalTouches) * 100) : 0;
  const touchesPerDeal = data.deals > 0 ? totalTouches / data.deals : null;
  const touchesPerDealLabel = touchesPerDeal
    ? new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(touchesPerDeal)
    : null;
  const touchToDealTone =
    touchToDeal >= 12
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
      : touchToDeal >= 6
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-700'
        : 'border-rose-500/30 bg-rose-500/10 text-rose-700';
  const touchToDealGrade = touchToDeal >= 12 ? 'Высокая' : touchToDeal >= 6 ? 'Средняя' : 'Низкая';

  const metricHints: Record<string, string> = {
    addedLeads: "Количество новых лидов за выбранный период",
    totalTouches: "Все действия с лидами: звонки, чаты и подборки",
    deals: "Количество закрытых сделок",
    funnelMoves: "Переходы по этапам воронки продаж",
    leadToPresentation: "Доля новых лидов, дошедших до презентации",
    presentationToShowing: "Доля презентаций, завершившихся показом",
    showingToDeal: "Доля показов, завершившихся сделкой",
    leadToDeal: "Конверсия из нового лида в закрытую сделку",
    touchToDeal: "Доля действий, приведших к сделке",
  };

  const conversionMetrics = [
    { key: 'leadToPresentation', label: 'Лид → презентация', value: leadToPresentation, color: 'hsl(214, 84%, 56%)', hint: metricHints.leadToPresentation },
    { key: 'presentationToShowing', label: 'Презентация → показ', value: presentationToShowing, color: 'hsl(195, 92%, 45%)', hint: metricHints.presentationToShowing },
    { key: 'showingToDeal', label: 'Показ → сделка', value: showingToDeal, color: 'hsl(152, 72%, 37%)', hint: metricHints.showingToDeal },
    { key: 'leadToDeal', label: 'Лид → сделка', value: leadToDeal, color: 'hsl(42, 95%, 50%)', hint: metricHints.leadToDeal },
    { key: 'touchToDeal', label: 'Действия → сделка', value: touchToDeal, color: 'hsl(280, 65%, 57%)', hint: metricHints.touchToDeal },
  ];

  const efficiencyMetrics = [
    { key: 'addedLeads', label: 'Новые лиды', value: data.addedLeads, color: 'hsl(187, 85%, 53%)', hint: metricHints.addedLeads },
    { key: 'totalTouches', label: 'Действия', value: totalTouches, color: 'hsl(25, 95%, 53%)', hint: metricHints.totalTouches },
    { key: 'funnelMoves', label: 'Прогресс воронки', value: funnelMoves, color: 'hsl(145, 72%, 38%)', hint: metricHints.funnelMoves },
  ];

  const efficiencyMaxValue = Math.max(...efficiencyMetrics.map((m) => m.value), 1);
  const conversionChartConfig: ChartConfig = conversionMetrics.reduce<ChartConfig>((acc, m) => {
    acc[m.key] = { label: m.label, color: m.color };
    return acc;
  }, {});
  const efficiencyChartConfig: ChartConfig = efficiencyMetrics.reduce<ChartConfig>((acc, m) => {
    acc[m.key] = { label: m.label, color: m.color };
    return acc;
  }, {});

  return (
    <Card>
      <CardHeader className="pb-2 text-center">
        <CardTitle className="text-center text-base font-medium sm:text-lg">{t('crm.analytics-network.direct-actions-card.эффективность_за_пер')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-1">
        <div className="grid gap-3 sm:grid-cols-3">
          {efficiencyMetrics.map((metric) => {
            const fillPercent = Math.round((metric.value / efficiencyMaxValue) * 100);
            return (
              <div key={metric.key} className="rounded-lg border p-3 text-center">
                <p className="text-sm text-muted-foreground">
                  <MetricTooltipLabel label={metric.label} hint={metric.hint} />
                </p>
                <p className="text-xl font-medium sm:text-2xl">{metric.value.toLocaleString('ru-RU')}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${fillPercent}%`, backgroundColor: metric.color }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-lg border p-3">
            <p className="mb-3 text-center text-xs font-medium text-muted-foreground">{t('crm.analytics-network.direct-actions-card.конверсии_воронки')}</p>
            <ChartContainer config={conversionChartConfig} className="h-[230px] w-full">
              <BarChart
                data={conversionMetrics}
                layout="vertical"
                margin={{ top: 0, right: 12, left: 12, bottom: 0 }}
              >
                <CartesianGrid horizontal vertical={false} strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `${value}%`}
                  fontSize={11}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={126}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 10 }}
                />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      formatter={(value, name) => (
                        <div className="flex w-full items-center justify-between gap-2">
                          <span className="text-muted-foreground">{name}</span>
                          <span className="font-mono font-medium">{Number(value)}%</span>
                        </div>
                      )}
                    />
                  }
                />
                <Bar dataKey="value" radius={6}>
                  <LabelList
                    dataKey="value"
                    position="right"
                    formatter={(label) => `${Number(label)}%`}
                    className="fill-foreground text-[11px]"
                  />
                  {conversionMetrics.map((metric) => (
                    <Cell key={metric.key} fill={metric.color} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {conversionMetrics.map((metric) => (
                <div key={metric.key} className="flex items-center gap-2 rounded-md border bg-muted/20 px-2 py-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: metric.color }} />
                  <span className="truncate text-[11px] text-muted-foreground">
                    <MetricTooltipLabel label={metric.label} hint={metric.hint} />
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border p-3">
            <p className="mb-3 text-center text-xs font-medium text-muted-foreground">{t('crm.analytics-network.direct-actions-card.эффективность_действ')}</p>
            <ChartContainer config={efficiencyChartConfig} className="h-[230px] w-full">
              <BarChart data={efficiencyMetrics} margin={{ top: 0, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <YAxis tickLine={false} axisLine={false} width={35} tick={{ fontSize: 11 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="value" radius={8}>
                  <LabelList
                    dataKey="value"
                    position="top"
                    formatter={(label) => Number(label).toLocaleString('ru-RU')}
                    className="fill-foreground text-[11px]"
                  />
                  {efficiencyMetrics.map((metric) => (
                    <Cell key={metric.key} fill={metric.color} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
            <div className="mt-3 rounded-md border bg-muted/20 px-3 py-2.5">
              <p className="text-[11px] text-muted-foreground">
                <MetricTooltipLabel label={t('crm.analytics-network.direct-actions-card.действия_сделка')} hint={metricHints.touchToDeal} />
              </p>
              <div className="mt-2 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-[hsl(280,65%,57%)] transition-all"
                    style={{ width: `${touchToDeal}%` }}
                  />
                </div>
                <span className="text-sm font-medium">{touchToDeal}%</span>
                <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium', touchToDealTone)}>
                  {touchToDealGrade}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {touchesPerDealLabel
                  ? `В среднем: 1 сделка на ${touchesPerDealLabel} действий.`
                  : "За выбранный период сделок нет."}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
