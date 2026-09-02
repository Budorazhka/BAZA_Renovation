"use client";
// [DOC-RU]
// Если ты меняешь этот файл, сначала держи прежний смысл метрик и полей, чтобы UI не разъехался.
// Смысл файла: распределение партнёров по активности; тут ты фильтруешь по marker и показываешь сегменты.
// После правок ты проверяешь экран руками и сверяешь ключевые цифры/периоды.


import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from "@/components/ui/chart";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";
import { Pie, PieChart, Cell, Label } from "recharts";
import { cn } from "@/lib/utils";
import type { PartnerRow, AnalyticsPeriod, ActivityMarker } from "@/types/analytics";
import { useI18n } from "@/i18n";

interface PartnersActivityDistributionProps {
    partners: PartnerRow[];
    period: AnalyticsPeriod;
    onPeriodChange: (period: AnalyticsPeriod) => void;
    onSegmentClick?: (marker: ActivityMarker) => void;
    title?: string;
    riskTitle?: string;
    riskWeekDescription?: string;
    riskPeriodDescription?: string;
}

const chartConfig = {
    green: {
        label: "Активные",
        color: "#24a6b8",
    },
    yellow: {
        label: "Средние",
        color: "#c5a348",
    },
    red: {
        label: "Пассивные",
        color: "#c25f73",
    },
} satisfies ChartConfig;

const periods: { value: AnalyticsPeriod; label: string }[] = [
    { value: "week", label: "Неделя" },
    { value: "month", label: "Месяц" },
    { value: "allTime", label: "За всё время" },
];

const segmentLabels: Record<string, string> = {
    green: "активны",
    yellow: "средние",
    red: "пассивны",
};

export function PartnersActivityDistribution({
    partners,
    period,
    onPeriodChange,
    onSegmentClick,
    title = "Распределение активности партнёров",
    riskTitle = "Партнёры в зоне риска",
    riskWeekDescription = "В зоне риска: партнёры с 0 активных дней за последние 7 дней.",
    riskPeriodDescription = "В зоне риска: все пассивные партнёры за выбранный период.",
}: PartnersActivityDistributionProps) {
    const { t } = useI18n();
    const [highlightedSegment, setHighlightedSegment] = useState<string | null>(null);
    const centerValueColor = "var(--theme-accent-heading, #c5a348)";
    const centerLabelColor = "var(--workspace-text-muted, rgba(184, 205, 194, 0.74))";

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

    const currentSegmentKey = highlightedSegment ?? "green";
    const currentSegment = distribution.find((d) => d.key === currentSegmentKey);
    const centerPercent = totalPartners > 0 && currentSegment
        ? Math.round((currentSegment.value / totalPartners) * 100)
        : activePercent;
    const centerLabel = segmentLabels[currentSegmentKey] ?? "активны";
    const riskPartners = partners.filter((partner) =>
        period === "week" ? partner.onlineDaysLast7 === 0 : partner.activityMarker === "red"
    );
    const riskCount = riskPartners.length;
    const riskPercent = totalPartners > 0 ? Math.round((riskCount / totalPartners) * 100) : 0;
    const riskPreview = riskPartners.slice(0, 3);

    return (
        <Card className="w-full">
            <CardHeader className="px-3 pb-2 pt-4 sm:px-4">
                <div className="flex flex-col items-center gap-3">
                    <div className="flex flex-col items-center gap-1">
                        <div className="flex items-center justify-center gap-1.5">
                            <CardTitle className="text-center text-base font-normal text-[color:var(--workspace-text)] sm:text-lg">{title}</CardTitle>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        type="button"
                                        className="inline-flex items-center justify-center rounded-full p-0.5 text-muted-foreground/70 hover:text-muted-foreground hover:bg-accent transition-colors"
                                        aria-label={t('analytics-network.partners-activity-distribution.как_считается_активн')}
                                    >
                                        <HelpCircle className="h-4 w-4" />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-[280px]">
                                    <div className="space-y-1 text-xs">
                                    <p><span className="font-medium">{t('analytics-network.partners-activity-distribution.активные')}</span> {t('analytics-network.partners-activity-distribution.работали_в_платформе')}</p>
                                    <p><span className="font-medium">{t('analytics-network.partners-activity-distribution.средние')}</span> {t('analytics-network.partners-activity-distribution.заходили_но_активнос')}</p>
                                    <p><span className="font-medium">{t('analytics-network.partners-activity-distribution.пассивные')}</span> {t('analytics-network.partners-activity-distribution.не_проявляли_активно')}</p>
                                    </div>
                                </TooltipContent>
                            </Tooltip>
                        </div>
                        <span className="text-sm text-[color:var(--workspace-text-muted)]">
                            {t('analytics-network.partners-activity-distribution.всего')}<span className="font-medium">{totalPartners.toLocaleString("ru-RU")}</span>
                        </span>
                    </div>
                    <Tabs value={period} onValueChange={(v) => onPeriodChange(v as AnalyticsPeriod)} className="h-auto">
                        <TabsList className="h-auto flex-wrap p-0.5">
                            {periods.map((p) => (
                                <TabsTrigger
                                    key={p.value}
                                    value={p.value}
                                    className="h-8 px-3 text-sm font-medium data-[state=active]:bg-background sm:text-base"
                                >
                                    {p.label}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </Tabs>
                </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 px-3 pb-4 pt-2 sm:flex-row sm:items-center sm:gap-6 sm:px-4">
                <ChartContainer config={chartConfig} className="mx-auto aspect-square w-full max-w-[300px] shrink-0 sm:mx-0 sm:max-w-[320px]">
                    <PieChart>
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Pie
                            data={distribution}
                            dataKey="value"
                            nameKey="label"
                            cx="50%"
                            cy="50%"
                            innerRadius="42%"
                            outerRadius="65%"
                            strokeWidth={0}
                        >
                            {distribution.map((item) => (
                                <Cell
                                    key={item.key}
                                    fill={item.color}
                                    className="cursor-pointer transition-opacity"
                                    opacity={highlightedSegment && highlightedSegment !== item.key ? 0.35 : 1}
                                    onClick={() => {
                                        setHighlightedSegment((prev) => prev === item.key ? null : item.key);
                                        onSegmentClick?.(item.key as ActivityMarker);
                                    }}
                                />
                            ))}
                            <Label
                                content={({ viewBox }) => {
                                    if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                                        return (
                                            <text
                                                x={viewBox.cx}
                                                y={viewBox.cy}
                                                textAnchor="middle"
                                                dominantBaseline="middle"
                                            >
                                                <tspan
                                                    x={viewBox.cx}
                                                    y={(viewBox.cy || 0) - 10}
                                                    fontSize={28}
                                                    fontWeight={600}
                                                    fill={centerValueColor}
                                                >
                                                    {centerPercent}%
                                                </tspan>
                                                <tspan
                                                    x={viewBox.cx}
                                                    y={(viewBox.cy || 0) + 16}
                                                    fontSize={13}
                                                    fontWeight={500}
                                                    fill={centerLabelColor}
                                                >
                                                    {centerLabel}
                                                </tspan>
                                            </text>
                                        );
                                    }
                                }}
                            />
                        </Pie>
                    </PieChart>
                </ChartContainer>
                <div className="w-full flex-1 space-y-3">
                    <div className="space-y-2">
                        {distribution.map((item) => {
                            const percent = totalPartners > 0 ? Math.round((item.value / totalPartners) * 100) : 0;
                            const isSelected = highlightedSegment === item.key;
                            return (
                                <div
                                    key={item.key}
                                    className={cn(
                                        "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm cursor-pointer transition-all",
                                        isSelected
                                            ? "bg-accent/60 font-medium"
                                            : highlightedSegment
                                              ? "opacity-50 hover:opacity-80"
                                              : "hover:bg-accent/30"
                                    )}
                                    onClick={() => {
                                        setHighlightedSegment((prev) => prev === item.key ? null : item.key);
                                        onSegmentClick?.(item.key as ActivityMarker);
                                    }}
                                >
                                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                                    <span
                                        className={cn(
                                            isSelected ? "font-medium text-[color:var(--workspace-text)]" : "text-[color:var(--workspace-text-muted)]"
                                        )}
                                    >
                                        {item.label}
                                    </span>
                                    <span className="ml-auto text-base font-normal text-[color:var(--workspace-text)]">{percent}%</span>
                                </div>
                            );
                        })}
                    </div>
                    <div className="rounded-lg border bg-muted/30 p-3 sm:p-3.5">
                        <div className="flex items-center justify-between gap-1.5">
                            <p className="text-sm font-normal text-[color:var(--workspace-text)]">{riskTitle}</p>
                            <span className="text-sm font-normal text-[color:var(--workspace-text)]">{riskCount.toLocaleString("ru-RU")} ({riskPercent}%)</span>
                        </div>
                        <p className="mt-1 text-sm text-[color:var(--workspace-text-muted)]">
                            {period === "week" ? riskWeekDescription : riskPeriodDescription}
                        </p>
                        {riskPreview.length > 0 && (
                            <div className="mt-2 space-y-1">
                                {riskPreview.map((partner) => (
                                    <p key={partner.id} className="truncate text-sm text-[color:var(--workspace-text-muted)]">
                                        {partner.name}
                                    </p>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

