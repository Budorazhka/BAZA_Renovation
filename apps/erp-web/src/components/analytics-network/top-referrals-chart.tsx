"use client";
// [DOC-RU]
// Если ты меняешь этот файл, сначала держи прежний смысл метрик и полей, чтобы UI не разъехался.
// Смысл файла: график топ-рефералов; тут ты показываешь лидеров по лидам в выбранном периоде.
// После правок ты проверяешь экран руками и сверяешь ключевые цифры/периоды.


import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { PartnerRow, AnalyticsPeriod } from "@/types/analytics";
import { useI18n } from "@/i18n";

interface TopReferralsChartProps {
    partners: PartnerRow[];
    period: AnalyticsPeriod;
    onPeriodChange: (period: AnalyticsPeriod) => void;
    title?: string;
    totalLabel?: string;
}

const chartConfig = {
    referrals: {
        label: "Новые лиды",
        color: "#c58b2e",
    },
} satisfies ChartConfig;

const periods: { value: AnalyticsPeriod; label: string }[] = [
    { value: "week", label: "Неделя" },
    { value: "month", label: "Месяц" },
    { value: "allTime", label: "За всё время" },
];

export function TopReferralsChart({
    partners,
    period,
    onPeriodChange,
    title = "Топ-5 партнёров по лидам",
    totalLabel = "Всего",
}: TopReferralsChartProps) {
    const { t } = useI18n();
    const topPartners = [...partners]
        .sort((a, b) => {
            const diff = b.leadsAdded - a.leadsAdded;
            if (diff !== 0) return diff;
            return a.name.localeCompare(b.name, "ru", { sensitivity: "base" });
        })
        .slice(0, 5)
        .map((partner) => ({
            name: partner.name,
            value: partner.leadsAdded,
        }));

    if (topPartners.length === 0) {
        return null;
    }

    const totalLeads = topPartners.reduce((sum, partner) => sum + partner.value, 0);
    const selectedManager = partners.length === 1 ? partners[0] : null;

    if (selectedManager) {
        const channelMax = Math.max(
            selectedManager.callClicks,
            selectedManager.chatOpens,
            selectedManager.selectionsCreated,
            1
        );
        const activityRows = [
            { label: "Звонки", value: selectedManager.callClicks, color: "#c58b2e" },
            { label: "Чаты", value: selectedManager.chatOpens, color: "#24a6b8" },
            { label: "Подборки", value: selectedManager.selectionsCreated, color: "#8f72c9" },
        ];
        const leadToStageRatio = selectedManager.leadsAdded > 0
            ? Math.round((selectedManager.stageChangesCount / selectedManager.leadsAdded) * 10) / 10
            : 0;

        return (
            <Card className="w-full">
                <CardHeader className="px-4 pb-2 pt-4">
                    <div className="flex flex-col items-center gap-3">
                        <div className="flex flex-col items-center gap-1">
                            <CardTitle className="text-center text-lg font-normal text-slate-900 sm:text-xl">{title}</CardTitle>
                            <span className="text-sm text-slate-700">
                                {selectedManager.name} · {totalLabel.toLowerCase()}:{" "}
                                <span className="font-medium">{selectedManager.leadsAdded.toLocaleString("ru-RU")}</span>
                            </span>
                        </div>
                        <Tabs value={period} onValueChange={(v) => onPeriodChange(v as AnalyticsPeriod)} className="h-auto">
                            <TabsList className="h-auto flex-wrap p-0.5">
                                {periods.map((p) => (
                                    <TabsTrigger
                                        key={p.value}
                                        value={p.value}
                                        className="h-8 px-3 text-base font-medium data-[state=active]:bg-background"
                                    >
                                        {p.label}
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                        </Tabs>
                    </div>
                </CardHeader>
                <CardContent className="space-y-3 px-4 pb-4 pt-2">
                    <div className="rounded-lg border border-[rgba(143,117,48,0.24)] bg-[rgba(9,39,27,0.58)] p-3">
                        <p className="text-[11px] uppercase tracking-wide text-[color:var(--workspace-text-dim)]">{t('analytics-network.top-referrals-chart.новые_лиды')}</p>
                        <div className="mt-2 flex items-end justify-between gap-3">
                            <span className="text-4xl font-normal leading-none tabular-nums text-[color:var(--theme-accent-heading)]">
                                {selectedManager.leadsAdded.toLocaleString("ru-RU")}
                            </span>
                            <span className="pb-1 text-sm text-[color:var(--workspace-text-muted)]">
                                {t('analytics-network.top-referrals-chart.этапов_на_лид')}{leadToStageRatio.toLocaleString("ru-RU")}
                            </span>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[rgba(184,146,55,0.13)]">
                            <div
                                className="h-full rounded-full bg-[#c58b2e]"
                                style={{ width: `${Math.max(10, Math.min(100, selectedManager.leadsAdded * 12))}%` }}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-md border border-[rgba(143,117,48,0.2)] bg-[rgba(5,29,20,0.72)] px-2.5 py-2">
                            <p className="text-[10px] uppercase tracking-wide text-[color:var(--workspace-text-dim)]">{t('analytics-network.top-referrals-chart.этапы')}</p>
                            <p className="mt-1 text-lg font-normal tabular-nums text-[color:var(--workspace-text)]">
                                {selectedManager.stageChangesCount.toLocaleString("ru-RU")}
                            </p>
                        </div>
                        <div className="rounded-md border border-[rgba(143,117,48,0.2)] bg-[rgba(5,29,20,0.72)] px-2.5 py-2">
                            <p className="text-[10px] uppercase tracking-wide text-[color:var(--workspace-text-dim)]">{t('analytics-network.top-referrals-chart.активность')}</p>
                            <p className="mt-1 text-lg font-normal tabular-nums text-[color:var(--workspace-text)]">
                                {selectedManager.activityTotal.toLocaleString("ru-RU")}
                            </p>
                        </div>
                        <div className="rounded-md border border-[rgba(143,117,48,0.2)] bg-[rgba(5,29,20,0.72)] px-2.5 py-2">
                            <p className="text-[10px] uppercase tracking-wide text-[color:var(--workspace-text-dim)]">{t('analytics-network.top-referrals-chart.онлайн')}</p>
                            <p className="mt-1 text-lg font-normal tabular-nums text-[color:var(--workspace-text)]">
                                {selectedManager.onlineDaysLast7}/7
                            </p>
                        </div>
                    </div>

                    <div className="space-y-2 rounded-lg border border-[rgba(143,117,48,0.2)] bg-[rgba(5,29,20,0.52)] p-3">
                        {activityRows.map((row) => (
                            <div key={row.label} className="grid grid-cols-[74px_minmax(0,1fr)_38px] items-center gap-2 text-sm">
                                <span className="text-[color:var(--workspace-text-muted)]">{row.label}</span>
                                <div className="h-2 overflow-hidden rounded-full bg-[rgba(184,205,194,0.1)]">
                                    <div
                                        className="h-full rounded-full"
                                        style={{
                                            width: `${Math.max(8, Math.round((row.value / channelMax) * 100))}%`,
                                            backgroundColor: row.color,
                                        }}
                                    />
                                </div>
                                <span className="text-right tabular-nums text-[color:var(--workspace-text)]">{row.value}</span>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="w-full">
            <CardHeader className="px-4 pb-2 pt-4">
                <div className="flex flex-col items-center gap-3">
                    <div className="flex flex-col items-center gap-1">
                        <CardTitle className="text-center text-lg font-normal text-slate-900 sm:text-xl">{title}</CardTitle>
                        <span className="text-sm text-slate-700">
                            {totalLabel}: <span className="font-medium">{totalLeads.toLocaleString("ru-RU")}</span>
                        </span>
                    </div>
                    <Tabs value={period} onValueChange={(v) => onPeriodChange(v as AnalyticsPeriod)} className="h-auto">
                        <TabsList className="h-auto flex-wrap p-0.5">
                            {periods.map((p) => (
                                <TabsTrigger
                                    key={p.value}
                                    value={p.value}
                                    className="h-8 px-3 text-base font-medium data-[state=active]:bg-background"
                                >
                                    {p.label}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </Tabs>
                </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-2">
                <ChartContainer config={chartConfig} className="h-[320px] w-full min-h-0">
                    <BarChart
                        data={topPartners}
                        layout="vertical"
                        margin={{ left: 8, right: 8, top: 8, bottom: 8 }}
                    >
                        <CartesianGrid
                            horizontal={false}
                            strokeDasharray="3 3"
                            stroke="rgba(144, 164, 174, 0.3)"
                        />
                        <XAxis
                            type="number"
                            tickLine={false}
                            axisLine={false}
                            tick={{ fill: "#475569", fontSize: 14, fontWeight: 500 }}
                            allowDecimals={false}
                            tickFormatter={(value) => Number(value).toFixed(0)}
                        />
                        <YAxis
                            type="category"
                            dataKey="name"
                            tickLine={false}
                            axisLine={false}
                            width={200}
                            tick={{ fill: "#475569", fontSize: 14, fontWeight: 500 }}
                        />
                        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                        <Bar
                            dataKey="value"
                            fill="var(--color-referrals)"
                            radius={[4, 4, 4, 4]}
                            barSize={22}
                        />
                    </BarChart>
                </ChartContainer>
            </CardContent>
        </Card>
    );
}

