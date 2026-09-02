"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from "@/components/ui/chart";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { LeadsTimeseriesPoint, AnalyticsPeriod } from "@/types/analytics";
import { useI18n } from "@/i18n";

interface LeadsChartProps {
    data: LeadsTimeseriesPoint[];
    period: AnalyticsPeriod;
    onPeriodChange: (period: AnalyticsPeriod) => void;
}

const chartConfig = {
    leads: {
        label: "Лиды",
        color: "#e6c364",
    },
} satisfies ChartConfig;

const periods: { value: AnalyticsPeriod; label: string }[] = [
    { value: "week", label: "Неделя" },
    { value: "month", label: "Месяц" },
    { value: "allTime", label: "За всё время" },
];

function getAllTimeFallback(): LeadsTimeseriesPoint[] {
    const now = new Date();
    const year = now.getFullYear();
    const endMonth = now.getMonth();
    const out: LeadsTimeseriesPoint[] = [];
    for (let m = 0; m <= endMonth; m += 1) {
        const monthKey = `${year}-${String(m + 1).padStart(2, "0")}`;
        out.push({ date: `${monthKey}-01`, leads: 0 });
    }
    return out.length > 0 ? out : [{ date: `${year}-01-01`, leads: 0 }];
}

export function LeadsChart({ data, period, onPeriodChange }: LeadsChartProps) {
    const { t } = useI18n();
    const chartData = period === "allTime" && data.length === 0 ? getAllTimeFallback() : data;
    const totalLeads = chartData.reduce((sum, point) => sum + point.leads, 0);

    return (
        <Card className="w-full">
            <CardHeader className="px-4 pb-2 pt-3">
                <div className="flex flex-col items-center gap-2">
                    <CardTitle className="text-center text-base">{t('crm.analytics-network.leads-chart.динамика_лидов')}</CardTitle>
                    <div className="flex items-center justify-center gap-2">
                        <Tabs
                            value={period}
                            onValueChange={(v) => onPeriodChange(v as AnalyticsPeriod)}
                            className="h-auto"
                        >
                            <TabsList className="h-auto w-full flex-wrap justify-center p-0.5">
                                {periods.map((p) => (
                                    <TabsTrigger
                                        key={p.value}
                                        value={p.value}
                                        className="h-7 px-2 text-center text-sm font-normal whitespace-normal leading-tight data-[state=active]:bg-background sm:whitespace-nowrap"
                                    >
                                        {p.label}
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                        </Tabs>
                    </div>
                </div>
                <div className="mt-1 text-center">
                    <span className="text-2xl font-medium">{totalLeads.toLocaleString("ru-RU")}</span>
                </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-2">
                <ChartContainer config={chartConfig} className="h-[220px] w-full">
                    <AreaChart accessibilityLayer data={chartData} margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="leadsGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#e6c364" stopOpacity={0.4} />
                                <stop offset="95%" stopColor="#e6c364" stopOpacity={0.05} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid
                            vertical={false}
                            strokeDasharray="3 3"
                            stroke="rgba(144, 164, 174, 0.3)"
                        />
                        <XAxis
                            dataKey="date"
                            tickLine={false}
                            tickMargin={10}
                            axisLine={false}
                            fontSize={14}
                            minTickGap={30}
                            tickFormatter={
                                period === "allTime"
                                    ? (value) => {
                                          const d = new Date(value);
                                          return isNaN(d.getTime()) ? value : d.toLocaleDateString("ru-RU", { month: "short" });
                                      }
                                    : undefined
                            }
                        />
                        <YAxis
                            tickLine={false}
                            axisLine={false}
                            tickMargin={10}
                            fontSize={14}
                            width={44}
                            allowDecimals={false}
                            tickFormatter={(value) => Number(value).toFixed(0)}
                            domain={totalLeads === 0 ? [0, 1] : undefined}
                        />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Area
                            type="monotone"
                            dataKey="leads"
                            stroke="#e6c364"
                            strokeWidth={3}
                            fill="url(#leadsGradient)"
                            fillOpacity={1}
                        />
                    </AreaChart>
                </ChartContainer>
            </CardContent>
        </Card>
    );
}
