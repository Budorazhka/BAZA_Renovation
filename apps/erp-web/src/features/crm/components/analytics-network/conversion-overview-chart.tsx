"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import type { FunnelBoard } from "@/types/analytics";
import type { SVGProps } from "react";
import { useI18n } from "@/i18n";

interface ConversionOverviewChartProps {
    funnel: FunnelBoard;
    className?: string;
}

const chartConfig = {
    value: {
        label: "Конверсия",
        color: "hsl(45, 75%, 65%)",
    },
} satisfies ChartConfig;

type ConversionAxisTickProps = SVGProps<SVGTextElement> & {
    payload?: { value?: string };
};

type ConversionItem = {
    key: string;
    label: string;
    value: number;
    color: string;
    description: string;
};

function ConversionAxisTick({ x = 0, y = 0, payload }: ConversionAxisTickProps) {
    return (
        <text x={Number(x) - 4} y={Number(y) + 4} textAnchor="end" fontSize={14} className="fill-muted-foreground text-base">
            {payload?.value ?? ""}
        </text>
    );
}

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

export function ConversionOverviewChart({ funnel, className }: ConversionOverviewChartProps) {
    const { t } = useI18n();
    const data: ConversionItem[] = [
        {
            key: "leadToPresentation",
            label: "Лид → презентация",
            value: calculateConversion(funnel, "Новый лид", "Презентовали компанию"),
            color: "hsl(45, 75%, 65%)", // Gold
            description: "Доля новых лидов, дошедших до презентации компании",
        },
        {
            key: "presentationToShowing",
            label: "Презентация → показ",
            value: calculateConversion(funnel, "Презентовали компанию", "Показ"),
            color: "hsl(158, 30%, 86%)", // Mint
            description: "Доля презентаций компании, завершившихся показом",
        },
        {
            key: "showingToDeal",
            label: "Показ → сделка",
            value: calculateConversion(funnel, "Показ", "Заключен договор"),
            color: "hsl(40, 60%, 39%)", // Gold dark
            description: "Доля показов, завершившихся договором",
        },
        {
            key: "leadToDeal",
            label: "Лид → сделка",
            value: calculateConversion(funnel, "Новый лид", "Заключен договор"),
            color: "hsl(158, 20%, 75%)", // Mint dark/secondary
            description: "Сквозная конверсия от нового лида до подписанного договора",
        },
    ];

    return (
        <Card className={cn(className)}>
            <CardHeader className="px-2 pb-2 sm:px-6">
                <CardTitle className="text-center text-xl font-medium sm:text-2xl">{t('crm.analytics-network.conversion-overview-chart.конверсии_воронки')}</CardTitle>
                <p className="text-center text-base text-muted-foreground">{t('crm.analytics-network.conversion-overview-chart.доля_лидов_переходящ')}</p>
            </CardHeader>
            <CardContent className="space-y-4 px-1 pt-1 sm:px-6">
                <div className="overflow-hidden">
                    <ChartContainer config={chartConfig} className="h-[340px] w-full">
                        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, left: 24, bottom: 8 }}>
                            <CartesianGrid horizontal={true} vertical={false} strokeDasharray="3 3" />
                            <XAxis
                                type="number"
                                domain={[0, 100]}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(value) => `${value}%`}
                                fontSize={14}
                            />
                            <YAxis
                                type="category"
                                dataKey="label"
                                width={170}
                                tickLine={false}
                                axisLine={false}
                                tick={<ConversionAxisTick />}
                            />
                            <ChartTooltip
                                cursor={false}
                                content={
                                    <ChartTooltipContent
                                        formatter={(value, _name, item) => {
                                            const row = item?.payload as ConversionItem | undefined;
                                            return (
                                                <div className="w-full space-y-1">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="text-muted-foreground">{row?.label ?? "Конверсия"}</span>
                                                        <span className="font-mono font-medium">{Number(value)}%</span>
                                                    </div>
                                                    {row?.description && (
                                                        <p className="text-base text-muted-foreground">{row.description}</p>
                                                    )}
                                                </div>
                                            );
                                        }}
                                    />
                                }
                            />
                            <Bar dataKey="value" radius={6}>
                                <LabelList
                                    dataKey="value"
                                    position="right"
                                    formatter={(label) => `${Number(label)}%`}
                                    className="fill-foreground text-base"
                                />
                                {data.map((item) => (
                                    <Cell key={item.key} fill={item.color} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ChartContainer>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-3 text-base">
                    {data.map((item) => (
                        <div key={item.key} className="rounded-md border bg-muted/20 px-2.5 py-1.5 sm:px-3 sm:py-2">
                            <div className="flex items-center justify-between gap-1.5">
                                <div className="flex min-w-0 items-center gap-1.5">
                                    <span className="h-2 w-2 shrink-0 rounded-full sm:h-2.5 sm:w-2.5" style={{ backgroundColor: item.color }} />
                                    <span className="break-words text-base text-muted-foreground">{item.label}</span>
                                </div>
                                <span className="text-base font-medium tabular-nums">{item.value}%</span>
                            </div>
                            <p className="mt-0.5 break-words text-base text-muted-foreground sm:mt-1">{item.description}</p>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
