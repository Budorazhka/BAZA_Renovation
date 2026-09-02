"use client";

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
    /** Заголовок компонента */
    title?: string;
}

const chartConfig = {
    referrals: {
        label: "Лиды",
        color: "#e6c364",
    },
} satisfies ChartConfig;

const periods: { value: AnalyticsPeriod; label: string }[] = [
    { value: "week", label: "Неделя" },
    { value: "month", label: "Месяц" },
    { value: "allTime", label: "За всё время" },
];

export function TopReferralsChart({ partners, period, onPeriodChange }: TopReferralsChartProps) {
    const { t } = useI18n();
    const topPartners = [...partners]
        .sort((a, b) => {
            const diff = b.leadsAdded - a.leadsAdded;
            if (diff !== 0) return diff;
            return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
        })
        .slice(0, 5)
        .map((partner) => ({
            name: partner.isCurrentUser ? "Я" : partner.name,
            value: partner.leadsAdded,
        }));

    const totalLeads = topPartners.reduce((sum, partner) => sum + partner.value, 0);

    return (
        <Card className="w-full gap-3 py-3 lg:h-[420px]">
            <CardHeader className="gap-2 px-4 pb-1 pt-2">
                <div className="flex flex-col items-center gap-3">
                    <div className="flex flex-col items-center gap-1">
                        <CardTitle className="text-center text-base font-medium">{t('crm.analytics-network.top-referrals-chart.топ_5_менеджеров_по')}</CardTitle>
                        <span className="text-base text-muted-foreground">{t('crm.analytics-network.top-referrals-chart.всего')}<span className="font-medium">{totalLeads.toLocaleString("ru-RU")}</span>
                        </span>
                    </div>
                    <Tabs value={period} onValueChange={(v) => onPeriodChange(v as AnalyticsPeriod)} className="h-auto">
                        <TabsList className="h-auto flex-wrap p-0.5">
                            {periods.map((p) => (
                                <TabsTrigger
                                    key={p.value}
                                    value={p.value}
                                    className="h-8 px-2.5 text-base font-normal data-[state=active]:bg-background"
                                >
                                    {p.label}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </Tabs>
                </div>
            </CardHeader>
            <CardContent className="px-4 pb-3 pt-1">
                {topPartners.length > 0 ? (
                    <ChartContainer config={chartConfig} className="h-[220px] w-full">
                        <BarChart
                            data={topPartners}
                            layout="vertical"
                            margin={{ left: 0, right: 8, top: 0, bottom: 0 }}
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
                                tick={{ fill: "#d0e8df", fontSize: 16 }}
                                fontSize={16}
                                allowDecimals={false}
                                tickFormatter={(value) => Number(value).toFixed(0)}
                            />
                            <YAxis
                                type="category"
                                dataKey="name"
                                tickLine={false}
                                axisLine={false}
                                tick={{ fill: "#d0e8df", fontSize: 16 }}
                                width={120}
                                fontSize={16}
                            />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            <Bar
                                dataKey="value"
                                fill="var(--color-referrals)"
                                radius={[4, 4, 4, 4]}
                                barSize={18}
                            />
                        </BarChart>
                    </ChartContainer>
                ) : (
                    <div className="flex h-[220px] items-center justify-center rounded-md border border-dashed bg-muted/20">
                        <p className="text-sm text-muted-foreground">{t('crm.analytics-network.top-referrals-chart.нет_данных_за_выбран')}</p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
