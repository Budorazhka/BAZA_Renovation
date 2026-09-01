"use client";

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Flame, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ActivityCalendarCard } from "./activity-calendar-card";
import { ActivityChart } from "./activity-chart";
import { ActivityComposition, ActivityQuoteCard } from "./activity-composition";
import { DynamicKpiCards } from "./dynamic-kpi-cards";
import { FunnelKanban } from "./funnel-kanban";
import { LeadsChart } from "./leads-chart";
import { PersonalAnalyticsInsights } from "./personal-analytics-insights";
import { PeriodTabs } from "./period-tabs";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getPeriodDateRange } from "@/features/crm/pages/crm/analyticsData";
import { cn } from "@/lib/utils";
import type { PlanTargetsByBucketExport } from "./personal-analytics-insights";
import type { AnalyticsPeriod, FunnelBoard, PersonAnalyticsData } from "@/types/analytics";
import { AnalyticsNavLinks } from "@/features/crm/pages/crm/components/AnalyticsNavLinks";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from "recharts";
import { useI18n } from "@/i18n";

interface PersonAnalyticsPageProps {
    data: PersonAnalyticsData | null;
    loading: boolean;
    error: string | null;
    period: AnalyticsPeriod;
    onPeriodChange: (period: AnalyticsPeriod) => void;
    mode: "me" | "partner";
    /** Для mode="partner": показывать полный функционал как в «Аналитика меня» (календари и т.д.) при открытии вкладки «Аналитика реферала». */
    showFullAnalytics?: boolean;
    refetch?: () => void;
    /** План/факт: загрузка с бэкенда (только для mode="me") */
    onLoadPlan?: () => Promise<PlanTargetsByBucketExport | null>;
    onSavePlan?: (targets: PlanTargetsByBucketExport) => Promise<void>;
    planLoadError?: string | null;
}

export function PersonAnalyticsPage({
    data: globalData,
    loading,
    error,
    period: globalPeriod,
    onPeriodChange: setGlobalPeriod,
    mode,
    showFullAnalytics = false,
    refetch,
    onLoadPlan,
    onSavePlan,
    planLoadError,
}: PersonAnalyticsPageProps) {
    const { t } = useI18n();
    const [leadsPeriod, setLeadsPeriod] = useState<AnalyticsPeriod>("week");
    const [activityPeriod, setActivityPeriod] = useState<AnalyticsPeriod>("week");

    const leadsData = useMemo(
        () => (globalData && leadsPeriod === globalPeriod ? globalData.leadsTimeseries : []),
        [globalData, leadsPeriod, globalPeriod]
    );
    const activityData = useMemo(
        () => (globalData && activityPeriod === globalPeriod ? globalData.activityTimeseries : []),
        [globalData, activityPeriod, globalPeriod]
    );
    const monthCalendarData = useMemo(
        () =>
            (globalData?.monthActivityTimeseries?.length
                ? globalData.monthActivityTimeseries
                : globalData?.period === "month"
                  ? globalData.activityTimeseries
                  : []) as { date: string; calls: number; chats: number; selections: number }[],
        [globalData]
    );
    const allTimeCalendarData = useMemo(
        () =>
            (globalData?.allTimeActivityTimeseries?.length
                ? globalData.allTimeActivityTimeseries
                : globalData?.period === "allTime"
                  ? globalData.activityTimeseries
                  : []) as { date: string; calls: number; chats: number; selections: number }[],
        [globalData]
    );
    const range = useMemo(() => getPeriodDateRange(globalPeriod), [globalPeriod]);
    const monthRangeForCalendar = useMemo(() => getPeriodDateRange("month"), []);
    const rangeLabel = useMemo(() => {
        const formatter = new Intl.DateTimeFormat("ru-RU", {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
        return `${formatter.format(range.start)} - ${formatter.format(range.end)}`;
    }, [range]);

    if (loading && !globalData) {
        return (
            <div className="agency-analytics-theme flex min-h-[50vh] items-center justify-center px-3 py-4">
                <p className="text-sm text-muted-foreground">{t('person-analytics-page.loading')}</p>
            </div>
        );
    }
    if (error && !globalData) {
        return (
            <div className="agency-analytics-theme mx-auto w-full max-w-4xl p-6">
                <Card>
                    <CardContent className="flex flex-col gap-2 p-6">
                        <p className="text-base font-medium text-destructive">{error}</p>
                        {refetch && (
                            <Button variant="outline" size="sm" onClick={refetch}>{t('person-analytics-page.repeat')}</Button>
                        )}
                    </CardContent>
                </Card>
            </div>
        );
    }
    if (!globalData) {
        return (
            <div className="agency-analytics-theme mx-auto w-full max-w-4xl p-6">
                <Card>
                    <CardContent className="p-6">
                        <p className="text-base font-medium">{t('person-analytics-page.employeeNotFound')}</p>
                        <p className="text-sm text-muted-foreground">{t('person-analytics-page.checkTheLinkIsCorrectOrSelectA')}</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const person = globalData.person;
    const salesFunnel = globalData.funnels.find((funnel) => funnel.id === "sales") ?? globalData.funnels[0];
    const isMeMode = mode === "me";
    const title = isMeMode ? "Моя аналитика" : "Аналитика реферала";
    const statusText = person.isOnline ? "Онлайн" : `Был в сети ${formatLastSeen(person.lastSeenMinutesAgo)}`;

    const periodLabel = t(`period-tabs.${globalPeriod === "allTime" ? "forAllTime" : globalPeriod}`);

    return (
        <div className="agency-analytics-theme w-full min-h-0 max-w-full space-y-4 px-2 py-3 sm:px-4 sm:py-4 md:px-5">
            <div className="grid min-h-[5rem] min-w-0 grid-cols-1 gap-3 lg:grid-cols-[1fr_auto_1fr] lg:items-start">
                <div className="flex min-h-[4rem] min-w-0 items-center gap-3">
                    <Avatar className="size-10 shrink-0 ring-2 ring-border/50">
                        <AvatarImage src={person.avatarUrl} alt={person.name} />
                        <AvatarFallback>{getInitials(person.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-foreground">
                            <span>{title}</span>
                            <span className="h-1 w-1 rounded-full bg-muted-foreground/60" />
                            <span>{rangeLabel}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="truncate text-xl font-medium sm:text-2xl">{person.name}</h1>
                            <Badge variant="outline" className="text-xs">
                                {periodLabel}
                            </Badge>
                        </div>
                        <p className="text-xs text-foreground">{statusText}</p>
                    </div>
                </div>
                <div className="flex justify-center">
                    <AnalyticsNavLinks />
                </div>
                <div className="flex w-full flex-wrap items-center justify-center gap-2 sm:w-auto sm:justify-end lg:justify-end">
                    <PeriodTabs selectedPeriod={globalPeriod} onPeriodChange={setGlobalPeriod} />
                </div>
            </div>

            <div className="grid min-w-0 gap-4 lg:gap-5 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
                <div className="flex min-w-0 flex-col gap-4">
                    <PersonalSalesSummary
                        title={isMeMode ? "Личные результаты" : "Результаты реферала"}
                        totalLeads={globalData.staticKpi.totalLeads}
                        totalDeals={globalData.staticKpi.totalDeals}
                        totalListings={globalData.staticKpi.totalListings}
                        onlineDays={person.onlineDaysLast7}
                    />

                    <DynamicKpiCards
                        data={globalData.dynamicKpi}
                        todayData={globalData.period === "week" ? globalData.dynamicKpi : undefined}
                        periodLabel={periodLabel}
                        variant="directOnly"
                    />
                    <ActivityComposition data={globalData.dynamicKpi} />
                    <ActivityQuoteCard className="flex-1" quoteUserKey={globalData.person.id} />
                </div>

                <div className="min-w-0 space-y-4">
                    {(isMeMode || showFullAnalytics) ? (
                        <div className="grid min-w-0 gap-4 xl:grid-cols-[1fr_280px]">
                            <ActivityCalendarCard
                                period={globalPeriod}
                                range={range}
                                monthRange={monthRangeForCalendar}
                                monthData={monthCalendarData}
                                allTimeData={allTimeCalendarData}
                                className="w-full"
                                highContrast
                            />
                            <ActivityProfileCard monthData={monthCalendarData} />
                        </div>
                    ) : (
                        <DirectActionsCard data={globalData.dynamicKpi} salesFunnel={salesFunnel} />
                    )}
                    <PersonalAnalyticsInsights
                        dynamicKpi={globalData.dynamicKpi}
                        funnels={globalData.funnels}
                        period={globalPeriod}
                        allowPlanEditing={isMeMode}
                        onLoadPlan={onLoadPlan}
                        onSavePlan={onSavePlan}
                        planLoadError={planLoadError}
                    />
                </div>
            </div>

            <div className="grid min-w-0 gap-4 lg:grid-cols-2">
                <LeadsChart data={leadsData} period={leadsPeriod} onPeriodChange={setLeadsPeriod} />
                <ActivityChart data={activityData} period={activityPeriod} onPeriodChange={setActivityPeriod} />
            </div>

            <FunnelKanban funnels={globalData.funnels} />
        </div>
    );
}

interface PersonalSalesSummaryProps {
    title: string;
    totalLeads: number;
    totalDeals: number;
    totalListings: number;
    onlineDays: number;
}

function PersonalSalesSummary({ title, totalLeads, totalDeals, totalListings, onlineDays }: PersonalSalesSummaryProps) {
    const cards = [
        { label: "Лиды", value: totalLeads },
        { label: "Сделки", value: totalDeals },
        { label: "Объекты", value: totalListings },
        { label: "Дней онлайн", value: onlineDays, suffix: "/7" },
    ];

    return (
        <Card>
            <CardHeader className="pb-2 text-center">
                <CardTitle className="text-center text-base font-medium sm:text-lg">{title}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-2">
                {cards.map((card) => (
                    <div key={card.label} className="rounded-md border p-3 text-center">
                        <p className="text-xs text-foreground">{card.label}</p>
                        <p className="text-lg font-medium">
                            {card.value.toLocaleString("ru-RU")}
                            {card.suffix ?? ""}
                        </p>
                    </div>
                ))}
            </CardContent>
        </Card>
    );
}

function DirectActionsCard({
    data,
    salesFunnel,
}: {
    data: {
        addedLeads: number;
        callClicks: number;
        chatOpens: number;
        selectionsCreated: number;
        deals: number;
    };
    salesFunnel: FunnelBoard;
}) {
    const { t } = useI18n();
    const totalTouches = data.callClicks + data.chatOpens + data.selectionsCreated;
    const funnelMoves = Math.max(0, Math.round(data.addedLeads * 1.6 + data.selectionsCreated * 0.5));
    const leadToPresentation = calculateFunnelConversion(salesFunnel, "Новый лид", "Презентовали компанию");
    const presentationToShowing = calculateFunnelConversion(salesFunnel, "Презентовали компанию", "Показ");
    const showingToDeal = calculateFunnelConversion(salesFunnel, "Показ", "Заключен договор");
    const leadToDeal = calculateFunnelConversion(salesFunnel, "Новый лид", "Заключен договор");
    const touchToDeal = totalTouches > 0 ? Math.round((data.deals / totalTouches) * 100) : 0;
    const touchesPerDeal = data.deals > 0 ? totalTouches / data.deals : null;
    const touchesPerDealLabel = touchesPerDeal
        ? new Intl.NumberFormat("ru-RU", {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
          }).format(touchesPerDeal)
        : null;
    const touchToDealTone =
        touchToDeal >= 12
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
            : touchToDeal >= 6
              ? "border-amber-500/30 bg-amber-500/10 text-amber-700"
              : "border-rose-500/30 bg-rose-500/10 text-rose-700";
    const touchToDealGrade = touchToDeal >= 12 ? "Высокая" : touchToDeal >= 6 ? "Средняя" : "Низкая";
    const metricHints = {
        addedLeads: "Количество новых лидов за выбранный период",
        totalTouches: "Все действия с лидами: звонки, чаты и отправленные подборки",
        deals: "Количество закрытых сделок",
        funnelMoves: "Переходы по этапам воронки продаж",
        leadToPresentation: "Доля новых лидов, дошедших до презентации",
        presentationToShowing: "Доля презентаций, завершившихся показом",
        showingToDeal: "Доля показов, завершившихся сделкой",
        leadToDeal: "Конверсия из нового лида в закрытую сделку",
        touchToDeal: "Доля действий, приведших к сделке",
        calls: "Количество звонков",
        chats: "Количество открытых чатов",
        selections: "Количество созданных подборок",
    };
    const conversionMetrics = [
        {
            key: "leadToPresentation",
            label: "Лид → презентация",
            value: leadToPresentation,
            color: "hsl(214, 84%, 56%)",
            hint: metricHints.leadToPresentation,
        },
        {
            key: "presentationToShowing",
            label: "Презентация → показ",
            value: presentationToShowing,
            color: "hsl(195, 92%, 45%)",
            hint: metricHints.presentationToShowing,
        },
        {
            key: "showingToDeal",
            label: "Показ → сделка",
            value: showingToDeal,
            color: "hsl(152, 72%, 37%)",
            hint: metricHints.showingToDeal,
        },
        {
            key: "leadToDeal",
            label: "Лид → сделка",
            value: leadToDeal,
            color: "hsl(42, 95%, 50%)",
            hint: metricHints.leadToDeal,
        },
        {
            key: "touchToDeal",
            label: "Действия → сделка",
            value: touchToDeal,
            color: "hsl(280, 65%, 57%)",
            hint: metricHints.touchToDeal,
        },
    ];
    const efficiencyMetrics = [
        {
            key: "addedLeads",
            label: "Новые лиды",
            value: data.addedLeads,
            color: "hsl(187, 85%, 53%)",
            hint: metricHints.addedLeads,
        },
        {
            key: "totalTouches",
            label: "Действия",
            value: totalTouches,
            color: "hsl(25, 95%, 53%)",
            hint: metricHints.totalTouches,
        },
        {
            key: "funnelMoves",
            label: "Прогресс воронки",
            value: funnelMoves,
            color: "hsl(145, 72%, 38%)",
            hint: metricHints.funnelMoves,
        },
    ];
    const efficiencyMaxValue = Math.max(...efficiencyMetrics.map((metric) => metric.value), 1);
    const conversionChartConfig = conversionMetrics.reduce<ChartConfig>((acc, metric) => {
        acc[metric.key] = {
            label: metric.label,
            color: metric.color,
        };
        return acc;
    }, {});
    const efficiencyChartConfig = efficiencyMetrics.reduce<ChartConfig>((acc, metric) => {
        acc[metric.key] = {
            label: metric.label,
            color: metric.color,
        };
        return acc;
    }, {});

    return (
        <Card>
            <CardHeader className="pb-2 text-center">
                <CardTitle className="text-center text-base font-medium sm:text-lg">{t('crm.analytics-network.person-analytics-page.эффективность_за_пер')}</CardTitle>
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
                                <p className="text-xl font-medium sm:text-2xl">{metric.value.toLocaleString("ru-RU")}</p>
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
                        <p className="mb-3 text-center text-xs font-medium text-foreground">{t('crm.analytics-network.person-analytics-page.конверсии_воронки')}</p>
                        <ChartContainer config={conversionChartConfig} className="h-[230px] w-full">
                            <BarChart
                                data={conversionMetrics}
                                layout="vertical"
                                margin={{ top: 0, right: 42, left: 4, bottom: 0 }}
                            >
                                <CartesianGrid horizontal={true} vertical={false} strokeDasharray="3 3" />
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
                                    width={138}
                                    tickLine={false}
                                    axisLine={false}
                                    tick={{ fill: "#d0e8df", fontSize: 16 }}
                                />
                                <ChartTooltip
                                    cursor={false}
                                    allowEscapeViewBox={{ x: false, y: false }}
                                    content={
                                        <ChartTooltipContent
                                            className="max-w-[180px] whitespace-normal break-words text-left"
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
                        <p className="mb-3 text-center text-xs font-medium text-foreground">{t('crm.analytics-network.person-analytics-page.эффективность_действ')}</p>
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
                                        formatter={(label) => Number(label).toLocaleString("ru-RU")}
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
                                <MetricTooltipLabel label={t('crm.analytics-network.person-analytics-page.действия_сделка')} hint={metricHints.touchToDeal} />
                            </p>
                            <div className="mt-2 flex items-center gap-3">
                                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                                    <div
                                        className="h-full rounded-full bg-[hsl(280,65%,57%)] transition-all"
                                        style={{ width: `${touchToDeal}%` }}
                                    />
                                </div>
                                <span className="text-sm font-medium">{touchToDeal}%</span>
                                <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", touchToDealTone)}>
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

function getStageCumulativeCount(board: FunnelBoard, stageName: string): number {
    let count = 0;
    let found = false;
    const flowColumnIds = ["in_progress", "active", "success"];

    for (const columnId of flowColumnIds) {
        const column = board.columns.find((item) => item.id === columnId);
        if (!column) continue;

        for (const stage of column.stages) {
            if (stage.name === stageName) {
                found = true;
            }
            if (found) {
                count += stage.count;
            }
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

function ActivityProfileCard({
    monthData,
}: {
    monthData: { calls: number; chats: number; selections: number }[];
}) {
    const { t } = useI18n();
    const now = new Date();
    const currentDay = now.getDate();
    const year = now.getFullYear();
    const month = now.getMonth();

    const pastEntries = monthData.slice(0, currentDay);
    const dailyTotals = pastEntries.map((p) => p.calls + p.chats + p.selections);
    const total = dailyTotals.reduce((s, v) => s + v, 0);
    const avg = dailyTotals.length > 0 ? total / dailyTotals.length : 0;
    const best = Math.max(...dailyTotals, 0);

    const ACTIVE_THRESHOLD = 5;

    let streak = 0;
    for (let i = dailyTotals.length - 1; i >= 0; i--) {
        if (dailyTotals[i] >= ACTIVE_THRESHOLD) streak++;
        else break;
    }

    // Current week (Mon–Sun) for the streak tracker
    const todayDow = now.getDay() === 0 ? 6 : now.getDay() - 1; // 0=Mon .. 6=Sun
    const mondayDate = new Date(year, month, currentDay - todayDow);
    const weekDowLabels = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
    const weekDays: { day: number; status: "active" | "inactive" | "future"; total: number; label: string; dow: string }[] = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(mondayDate.getFullYear(), mondayDate.getMonth(), mondayDate.getDate() + i);
        const dayIndex = d.getDate() - 1; // index in monthData
        const isFuture = d > now;
        const isInMonth = d.getMonth() === month && d.getFullYear() === year;
        const dayTotal = isInMonth && dayIndex >= 0 && dayIndex < dailyTotals.length ? dailyTotals[dayIndex] : 0;
        const dayLabel = d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
        weekDays.push({
            day: d.getDate(),
            status: isFuture ? "future" : dayTotal >= ACTIVE_THRESHOLD ? "active" : "inactive",
            total: isFuture ? 0 : dayTotal,
            label: dayLabel,
            dow: weekDowLabels[i],
        });
    }

    const dowTotals = Array(7).fill(0) as number[];
    const dowCounts = Array(7).fill(0) as number[];
    pastEntries.forEach((_, i) => {
        const d = new Date(year, month, i + 1);
        const dow = d.getDay() === 0 ? 6 : d.getDay() - 1;
        dowTotals[dow] += dailyTotals[i];
        dowCounts[dow]++;
    });
    const dowAvg = dowTotals.map((t, i) => (dowCounts[i] > 0 ? t / dowCounts[i] : 0));
    const maxDowAvg = Math.max(...dowAvg, 1);

    const fmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

    const hints = {
        avg: "Среднее число действий в день: звонки, чаты, подборки",
        best: "Наибольшее число действий за один день",
        streak: `Количество подряд идущих активных дней с ${ACTIVE_THRESHOLD}+ действиями.`,
        dow: "Средняя активность по дням недели",
        streakRow: `Текущая неделя. Огонь — активный день, крестик — низкая активность, тире — будущий день.`,
    };

    return (
        <Card className="flex flex-col">
            <CardHeader className="pb-2">
                <CardTitle className="text-center text-sm font-medium">
                    <MetricTooltipLabel
                        label={t('crm.analytics-network.person-analytics-page.профиль_активности')}
                        hint="Сводка ежедневной активности за месяц"
                    />
                </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-3 pt-1">
                <div className="rounded-md border bg-muted/20 px-3 py-2.5 text-center">
                    <p className="text-xs text-muted-foreground">
                        <MetricTooltipLabel label={t('crm.analytics-network.person-analytics-page.среднее_за_день')} hint={hints.avg} />
                    </p>
                    <p className="text-2xl font-normal tabular-nums">{fmt.format(avg)}</p>
                    <p className="text-[11px] text-muted-foreground">{t('crm.analytics-network.person-analytics-page.действий_в_день')}</p>
                </div>

                <div className="space-y-2">
                    <div className="flex items-center justify-between rounded-md border bg-muted/10 px-2.5 py-1.5 text-sm">
                        <span className="text-muted-foreground">
                            <MetricTooltipLabel label={t('crm.analytics-network.person-analytics-page.рекорд_за_день')} hint={hints.best} />
                        </span>
                        <span className="font-medium tabular-nums">{best}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-md border bg-muted/10 px-2.5 py-1.5 text-sm">
                        <span className="text-muted-foreground">
                            <MetricTooltipLabel label={t('crm.analytics-network.person-analytics-page.серия_активности')} hint={hints.streak} />
                        </span>
                        <div className="flex items-center gap-1.5">
                            {streak > 0 && <Flame className="size-4 text-orange-500" />}
                            <span className="font-medium tabular-nums">{streak} {t('crm.analytics-network.person-analytics-page.дн')}</span>
                        </div>
                    </div>
                </div>

                {/* Duolingo-style streak row */}
                <div className="space-y-1.5">
                    <p className="text-center text-[11px] text-muted-foreground">
                        <MetricTooltipLabel label={t('crm.analytics-network.person-analytics-page.серия_активности')} hint={hints.streakRow} />
                    </p>
                    <div className="flex flex-wrap items-start justify-center gap-2">
                        {weekDays.map((d) => (
                            <Tooltip key={d.dow}>
                                <TooltipTrigger asChild>
                                    <button
                                        type="button"
                                        className="flex flex-col items-center gap-1"
                                        aria-label={`${d.dow} ${d.label}: ${d.status === "future" ? "Ещё не наступил" : `${d.total} действий`}`}
                                    >
                                        <span className={cn(
                                            "text-[10px] font-medium leading-none",
                                            d.status === "active" ? "text-emerald-600 dark:text-emerald-400"
                                                : d.status === "inactive" ? "text-blue-500 dark:text-blue-400"
                                                : "text-muted-foreground/40"
                                        )}>
                                            {d.dow}
                                        </span>
                                        <div
                                            className={cn(
                                                "flex size-7 items-center justify-center rounded-full border-2 transition-colors",
                                                d.status === "active"
                                                    ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-500"
                                                    : d.status === "inactive"
                                                      ? "border-blue-400/40 bg-blue-500/10 text-blue-400"
                                                      : "border-dashed border-muted-foreground/20 bg-transparent text-muted-foreground/25"
                                            )}
                                        >
                                            {d.status === "active" ? (
                                                <Flame className="size-4" />
                                            ) : d.status === "inactive" ? (
                                                <X className="size-3.5" />
                                            ) : (
                                                <span className="text-[10px]">—</span>
                                            )}
                                        </div>
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" sideOffset={4} className="text-center text-xs">
                                    <p className="font-medium">{d.dow}, {d.label}</p>
                                    {d.status === "future" ? (
                                        <p className="text-muted-foreground">{t('crm.analytics-network.person-analytics-page.ещ_не_наступил')}</p>
                                    ) : (
                                        <>
                                            <p>{d.total} {t('crm.analytics-network.person-analytics-page.действий')}</p>
                                            <p className={d.status === "active" ? "text-emerald-400" : "text-blue-400"}>
                                                {d.status === "active" ? "Цель на день выполнена" : "Цель на день не выполнена"}
                                            </p>
                                        </>
                                    )}
                                </TooltipContent>
                            </Tooltip>
                        ))}
                    </div>
                </div>

                <div className="mt-auto space-y-1.5">
                    <p className="text-center text-[11px] text-muted-foreground">
                        <MetricTooltipLabel label={t('crm.analytics-network.person-analytics-page.среднее_по_дням_неде')} hint={hints.dow} />
                    </p>
                    <div className="space-y-1">
                        {dowAvg.map((val, i) => {
                            const pct = maxDowAvg > 0 ? (val / maxDowAvg) * 100 : 0;
                            const isLeader = val === maxDowAvg && val > 0;
                            const isWeekend = i >= 5;
                            return (
                                <div key={weekDowLabels[i]} className="flex items-center gap-2">
                                    <span className={cn(
                                        "w-5 shrink-0 text-[11px] tabular-nums",
                                        isLeader ? "font-normal text-blue-600 dark:text-blue-400" : isWeekend ? "text-muted-foreground/60" : "text-muted-foreground"
                                    )}>
                                        {weekDowLabels[i]}
                                    </span>
                                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-blue-100 dark:bg-blue-950/40">
                                        <div
                                            className={cn(
                                                "h-full rounded-full transition-all",
                                                isLeader
                                                    ? "bg-blue-500"
                                                    : isWeekend
                                                      ? "bg-blue-300/60 dark:bg-blue-700/40"
                                                      : "bg-blue-400/70 dark:bg-blue-600/60"
                                            )}
                                            style={{ width: `${Math.max(4, pct)}%` }}
                                        />
                                    </div>
                                    <span className={cn(
                                        "w-7 shrink-0 text-right text-[11px] tabular-nums",
                                        isLeader ? "font-normal text-blue-600 dark:text-blue-400" : "text-muted-foreground"
                                    )}>
                                        {fmt.format(val)}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function getInitials(name: string) {
    return name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("");
}

function formatLastSeen(minutes: number | null) {
    if (minutes === null) return "только что";
    if (minutes < 60) return `${minutes} мин. назад`;
    return `${Math.floor(minutes / 60)} ч. назад`;
}
