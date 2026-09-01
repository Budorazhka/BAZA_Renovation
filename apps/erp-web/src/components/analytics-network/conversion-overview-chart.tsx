"use client";
// [DOC-RU]
// Если ты меняешь этот файл, оставляй график и расшифровку читаемыми:
// пользователь должен сразу понимать, от какого этапа к какому считается процент.

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FunnelBoard } from "@/types/analytics";
import { useI18n } from "@/i18n";

interface ConversionOverviewChartProps {
    funnel: FunnelBoard;
    className?: string;
    /** При переданном колбэке в шапке карточки показывается кнопка «Сеть» (просмотр сети партнёра) */
    onViewNetwork?: () => void;
    /** Тема «сукно» для страницы лидов: тёмный фон, кремовый текст, золотистые акценты */
    variant?: "default" | "leads";
}

type ConversionItem = {
    key: string;
    label: string;
    value: number;
    color: string;
    valueTone: string;
    description: string;
};

function getStageCumulativeCount(board: FunnelBoard, stageName: string): number {
    let count = 0;
    let found = false;
    const flowColumnIds = ["in_progress", "active", "success"];

    for (const colId of flowColumnIds) {
        const column = board.columns.find((item) => item.id === colId);
        if (!column) continue;

        for (const stage of column.stages) {
            if (stage.name === stageName) found = true;
            if (found) count += stage.count;
        }
    }

    return count;
}

function calculateConversion(board: FunnelBoard, fromStage: string, toStage: string): number {
    const fromCount = getStageCumulativeCount(board, fromStage);
    const toCount = getStageCumulativeCount(board, toStage);
    if (fromCount === 0) return 0;
    return Math.round((toCount / fromCount) * 100);
}

const LEADS_BAR_COLORS = {
    leadToPresentation: "hsl(45, 68%, 55%)",
    presentationToShowing: "hsl(180, 45%, 55%)",
    showingToDeal: "hsl(152, 45%, 52%)",
    leadToDeal: "hsl(35, 75%, 55%)",
} as const;

const REPORT_BAR_COLORS = {
    leadToPresentation: "#4f8ed8",
    presentationToShowing: "#24a6b8",
    showingToDeal: "#56a879",
    leadToDeal: "#c58b2e",
} as const;

const REPORT_VALUE_TONES = {
    high: "#b9d9e1",
    medium: "#c5a348",
    low: "#d39a61",
} as const;

export function ConversionOverviewChart({ funnel, className, onViewNetwork, variant = "default" }: ConversionOverviewChartProps) {
    const { t } = useI18n();
    const isLeads = variant === "leads";
    const data: ConversionItem[] = [
        {
            key: "leadToPresentation",
            label: "Лид → През.",
            value: calculateConversion(funnel, "Новый лид", "Презентовали компанию"),
            color: isLeads ? LEADS_BAR_COLORS.leadToPresentation : REPORT_BAR_COLORS.leadToPresentation,
            valueTone: isLeads ? "#f7ecd4" : REPORT_VALUE_TONES.high,
            description: "Из новых лидов дошли до презентации",
        },
        {
            key: "presentationToShowing",
            label: "Презент. → Показ",
            value: calculateConversion(funnel, "Презентовали компанию", "Показ"),
            color: isLeads ? LEADS_BAR_COLORS.presentationToShowing : REPORT_BAR_COLORS.presentationToShowing,
            valueTone: isLeads ? "#f7ecd4" : REPORT_VALUE_TONES.medium,
            description: "Из презентаций дошли до показа",
        },
        {
            key: "showingToDeal",
            label: "Показ → Сделка",
            value: calculateConversion(funnel, "Показ", "Заключен договор"),
            color: isLeads ? LEADS_BAR_COLORS.showingToDeal : REPORT_BAR_COLORS.showingToDeal,
            valueTone: isLeads ? "#f7ecd4" : REPORT_VALUE_TONES.high,
            description: "Из показов закрылись в сделку",
        },
        {
            key: "leadToDeal",
            label: "Лид → Сделка",
            value: calculateConversion(funnel, "Новый лид", "Заключен договор"),
            color: isLeads ? LEADS_BAR_COLORS.leadToDeal : REPORT_BAR_COLORS.leadToDeal,
            valueTone: isLeads ? "#f7ecd4" : REPORT_VALUE_TONES.low,
            description: "Сквозная конверсия от лида до сделки",
        },
    ];

    return (
        <Card className={cn(className, isLeads && "leads-card border border-[rgba(229,196,136,0.35)] bg-gradient-to-b from-[rgba(45,32,18,0.92)] to-[rgba(32,22,12,0.9)] text-[#f7ecd4] shadow-[0_4px_16px_rgba(0,0,0,0.25)]")}>
            <CardHeader className="px-3 pb-2 sm:px-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                        <CardTitle className={cn(
                            "text-center text-xl font-normal sm:text-left sm:text-3xl",
                            isLeads ? "text-[color:var(--app-text)]" : "text-[color:var(--workspace-text)]"
                        )}>
                            {t('analytics-network.conversion-overview-chart.конверсии')}</CardTitle>
                        <p className={cn(
                            "mt-1 text-center text-sm font-medium sm:text-left sm:text-base",
                            isLeads ? "text-[#e8dcc4]" : "text-[color:var(--workspace-text-muted)]"
                        )}>
                            {t('analytics-network.conversion-overview-chart.процент_лидов_переше')}</p>
                    </div>
                    {onViewNetwork && (
                        <Button
                            variant="outline"
                            size="sm"
                            className={cn(
                                "shrink-0",
                                isLeads
                                    ? "border-[rgba(229,196,136,0.5)] bg-[rgba(68,43,18,0.6)] text-[color:var(--app-text)] hover:bg-[rgba(88,57,25,0.7)]"
                                    : "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 hover:bg-emerald-500/20"
                            )}
                            onClick={onViewNetwork}
                        >
                            {t('analytics-network.conversion-overview-chart.сеть')}</Button>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-2.5 px-3 pt-1 sm:px-6">
                <div className="grid gap-2.5">
                    {data.map((item) => (
                        <div
                            key={item.key}
                            className={cn(
                                "grid gap-3 rounded-lg border px-3 py-3 sm:grid-cols-[minmax(130px,0.95fr)_minmax(180px,1.45fr)_76px] sm:items-center",
                                isLeads
                                    ? "border-[rgba(229,196,136,0.25)] bg-[rgba(36,26,14,0.6)]"
                                    : "bg-[rgba(5,29,20,0.64)]"
                            )}
                        >
                            <div className="min-w-0">
                                <div className="flex min-w-0 items-center gap-2">
                                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                                    <span className={cn("min-w-0 break-words text-[14px] font-normal leading-tight", isLeads ? "text-[#e8dcc4]" : "text-[color:var(--workspace-text)]")}>
                                        {item.label}
                                    </span>
                                </div>
                                <p className={cn("mt-1 text-[12px] leading-snug", isLeads ? "text-[#e8dcc4]/75" : "text-[color:var(--workspace-text-muted)]")}>
                                    {item.description}
                                </p>
                            </div>
                            <div className="min-w-0">
                                <div className={cn("h-2 overflow-hidden rounded-full", isLeads ? "bg-[rgba(0,0,0,0.32)]" : "bg-[rgba(184,146,55,0.13)]")}>
                                    <div
                                        className="h-full rounded-full"
                                        style={{ width: `${Math.max(4, Math.min(100, item.value))}%`, backgroundColor: item.color }}
                                    />
                                </div>
                                <div className="mt-1 flex justify-between text-[10px] tabular-nums text-[color:var(--workspace-text-dim)]">
                                    <span>0</span>
                                    <span>50</span>
                                    <span>100</span>
                                </div>
                            </div>
                            <div
                                className="flex h-10 items-center justify-end rounded-md px-2 text-[22px] font-normal leading-none tabular-nums"
                                style={{
                                    color: item.valueTone,
                                    backgroundColor: isLeads ? "rgba(229,196,136,0.08)" : "rgba(143,113,39,0.09)",
                                }}
                            >
                                {item.value}%
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
