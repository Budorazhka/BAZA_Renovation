"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AnalyticsPeriod } from "@/types/analytics";
import { useI18n } from "@/i18n";

interface PeriodTabsProps {
    selectedPeriod: AnalyticsPeriod;
    onPeriodChange: (period: AnalyticsPeriod) => void;
}

const periods: { value: AnalyticsPeriod; labelKey: "week" | "month" | "forAllTime" }[] = [
    { value: "week", labelKey: "week" },
    { value: "month", labelKey: "month" },
    { value: "allTime", labelKey: "forAllTime" },
];

export function PeriodTabs({ selectedPeriod, onPeriodChange }: PeriodTabsProps) {
    const { t } = useI18n();

    return (
        <Tabs value={selectedPeriod} onValueChange={(value) => onPeriodChange(value as AnalyticsPeriod)}>
            <TabsList className="h-auto w-full flex-wrap justify-start gap-1 p-1">
                {periods.map((period) => (
                    <TabsTrigger
                        key={period.value}
                        value={period.value}
                        className="min-h-9 px-3 text-[16px] font-normal leading-tight whitespace-nowrap"
                    >
                        {t(`period-tabs.${period.labelKey}`)}
                    </TabsTrigger>
                ))}
            </TabsList>
        </Tabs>
    );
}
