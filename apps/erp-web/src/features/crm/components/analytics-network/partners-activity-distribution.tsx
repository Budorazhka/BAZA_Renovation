"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PartnerRow, AnalyticsPeriod, ActivityMarker } from "@/types/analytics";
import { useI18n } from "@/i18n";

interface PartnersActivityDistributionProps {
    partners: PartnerRow[];
    period: AnalyticsPeriod;
    onPeriodChange: (period: AnalyticsPeriod) => void;
    onSegmentClick?: (marker: ActivityMarker) => void;
    /** Заголовок компонента */
    title?: string;
}

const periods: { value: AnalyticsPeriod; label: string }[] = [
    { value: "week", label: "Неделя" },
    { value: "month", label: "Месяц" },
    { value: "allTime", label: "За всё время" },
];

export function PartnersActivityDistribution({ partners, period, onPeriodChange, onSegmentClick }: PartnersActivityDistributionProps) {
    const { t } = useI18n();
    const [highlightedSegment, setHighlightedSegment] = useState<string | null>(null);

    if (partners.length === 0) {
        return null;
    }

    const distribution = [
        {
            key: "green",
            label: "Активные",
            value: partners.filter((p) => p.activityMarker === "green").length,
            color: "var(--color-green)",
        },
        {
            key: "yellow",
            label: "Средние",
            value: partners.filter((p) => p.activityMarker === "yellow").length,
            color: "var(--color-yellow)",
        },
        {
            key: "red",
            label: "Пассивные",
            value: partners.filter((p) => p.activityMarker === "red").length,
            color: "var(--color-red)",
        },
    ];

    const totalPartners = partners.length;
    const activeCount = distribution.find((d) => d.key === "green")?.value || 0;
    const activePercent = totalPartners > 0 ? Math.round((activeCount / totalPartners) * 100) : 0;

    const riskPartners = partners.filter((partner) =>
        period === "week" ? partner.onlineDaysLast7 === 0 : partner.activityMarker === "red"
    );
    const riskCount = riskPartners.length;
    const riskPercent = totalPartners > 0 ? Math.round((riskCount / totalPartners) * 100) : 0;
    const riskPreview = riskPartners.slice(0, 3);

    return (
        <Card className="w-full gap-0 py-0">
            <CardHeader className="border-b border-[rgba(30,74,42,0.52)] px-4 py-4 sm:px-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 items-center gap-2">
                        <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                                <CardTitle className="text-xl font-medium">{t('crm.analytics-network.partners-activity-distribution.распределение_активн')}</CardTitle>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <button
                                            type="button"
                                            className="inline-flex items-center justify-center rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                                            aria-label={t('crm.analytics-network.partners-activity-distribution.как_считается_активн')}
                                        >
                                            <HelpCircle className="h-4 w-4" />
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-[320px]">
                                        <div className="space-y-1 text-base">
                                            <p><span className="font-medium">{t('crm.analytics-network.partners-activity-distribution.активные')}</span>{t('crm.analytics-network.partners-activity-distribution.работали_в_платформе')}</p>
                                            <p><span className="font-medium">{t('crm.analytics-network.partners-activity-distribution.средние')}</span>{t('crm.analytics-network.partners-activity-distribution.заходили_но_были_акт')}</p>
                                            <p><span className="font-medium">{t('crm.analytics-network.partners-activity-distribution.пассивные')}</span>{t('crm.analytics-network.partners-activity-distribution.менее_5_минут_активн')}</p>
                                        </div>
                                    </TooltipContent>
                                </Tooltip>
                            </div>
                            <p className="mt-1 text-base text-muted-foreground">{t('crm.analytics-network.partners-activity-distribution.всего')}<span className="font-medium text-foreground">{totalPartners.toLocaleString("ru-RU")}</span></p>
                        </div>
                    </div>
                    <Tabs value={period} onValueChange={(v) => onPeriodChange(v as AnalyticsPeriod)} className="h-auto">
                        <TabsList className="h-auto flex-wrap p-0.5">
                            {periods.map((p) => (
                                <TabsTrigger
                                    key={p.value}
                                    value={p.value}
                                    className="h-9 px-3 text-base font-normal data-[state=active]:bg-background"
                                >
                                    {p.label}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </Tabs>
                </div>
            </CardHeader>
            <CardContent className="grid gap-4 px-4 py-4 md:grid-cols-2 lg:grid-cols-[minmax(240px,0.7fr)_minmax(360px,1.2fr)_minmax(300px,0.9fr)] lg:px-5 lg:py-5">
                <section className="activity-distribution__hero flex min-h-[188px] flex-col justify-between rounded-md p-4 sm:p-5">
                    <div>
                        <p className="text-base text-muted-foreground">Команда в рабочем ритме</p>
                        <div className="mt-2 flex items-end gap-2">
                            <span className="text-4xl font-medium tabular-nums text-foreground">{activePercent}%</span>
                            <span className="pb-1 text-lg text-muted-foreground">активны</span>
                        </div>
                    </div>
                    <div>
                        <div className="flex h-3 overflow-hidden rounded-sm bg-[rgba(3,29,22,0.72)]">
                            {distribution.map((item) => {
                                const percent = totalPartners > 0 ? (item.value / totalPartners) * 100 : 0;
                                return <span key={item.key} style={{ width: `${percent}%`, backgroundColor: item.color }} />;
                            })}
                        </div>
                        <p className="mt-2 text-base text-muted-foreground">{activeCount.toLocaleString("ru-RU")} из {totalPartners.toLocaleString("ru-RU")} менеджеров работали в периоде</p>
                    </div>
                </section>

                <section className="space-y-2 rounded-md bg-[rgba(3,29,22,0.26)] p-3 sm:p-4" aria-label="Распределение активности по менеджерам">
                    {distribution.map((item) => {
                        const percent = totalPartners > 0 ? Math.round((item.value / totalPartners) * 100) : 0;
                        const isSelected = highlightedSegment === item.key;
                        return (
                            <button
                                key={item.key}
                                type="button"
                                className={cn(
                                    "w-full rounded-sm px-3 py-2.5 text-left transition-colors",
                                    isSelected ? "bg-[rgba(230,195,100,0.12)]" : "hover:bg-[rgba(208,232,223,0.07)]"
                                )}
                                onClick={() => {
                                    setHighlightedSegment((prev) => prev === item.key ? null : item.key);
                                    onSegmentClick?.(item.key as ActivityMarker);
                                }}
                            >
                                <span className="flex items-center gap-3">
                                    <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: item.color }} />
                                    <span className="text-lg text-foreground">{item.label}</span>
                                    <span className="ml-auto text-lg font-medium tabular-nums text-foreground">{percent}%</span>
                                    <span className="w-8 text-right text-base tabular-nums text-muted-foreground">{item.value}</span>
                                </span>
                                <span className="mt-2 block h-1.5 overflow-hidden rounded-sm bg-[rgba(3,29,22,0.72)]">
                                    <span className="block h-full rounded-sm" style={{ width: `${percent}%`, backgroundColor: item.color }} />
                                </span>
                            </button>
                        );
                    })}
                </section>

                <section className="activity-distribution__risk flex min-h-[188px] flex-col rounded-md p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-lg font-medium text-foreground">{t('crm.analytics-network.partners-activity-distribution.менеджеры_в_зоне_рис')}</p>
                            <p className="mt-1 text-base text-muted-foreground">
                                {period === "week"
                                    ? "Без активных дней за эту неделю"
                                    : "Пассивные за выбранный период"}
                            </p>
                        </div>
                        <span className="shrink-0 text-xl font-medium tabular-nums text-foreground">{riskCount.toLocaleString("ru-RU")} <span className="text-base text-muted-foreground">({riskPercent}%)</span></span>
                    </div>
                    <div className="mt-auto pt-4">
                        {riskPreview.length > 0 ? (
                            <div className="space-y-2">
                                {riskPreview.map((partner) => (
                                    <p key={partner.id} className="truncate text-base text-muted-foreground">
                                        {partner.isCurrentUser ? "Я" : partner.name}
                                    </p>
                                ))}
                            </div>
                        ) : (
                            <p className="text-base text-muted-foreground">Рисков по выбранному периоду нет.</p>
                        )}
                    </div>
                </section>
            </CardContent>
        </Card>
    );
}
