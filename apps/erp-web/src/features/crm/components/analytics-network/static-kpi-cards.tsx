import { Card, CardContent } from "@/components/ui/card";
import { Home, UserCheck, Handshake } from "lucide-react";
import type { StaticKpi } from "@/types/analytics";

interface StaticKpiCardsProps {
    data: StaticKpi;

    secondMetric?: {
        label: string;
        value: number;
    };
}

function getKpiConfig(secondMetricLabel: string) {
    return [{
            key: "totalListings" as const,
            label: secondMetricLabel,
            icon: Home,
            iconColor: "text-emerald-500",
            iconBg: "bg-emerald-500/10",
        },
        {
            key: "totalLeads" as const,
            label: "Лиды",
            icon: UserCheck,
            iconColor: "text-amber-500",
            iconBg: "bg-amber-500/10",
        },
        {
            key: "totalDeals" as const,
            label: "Сделки",
            icon: Handshake,
            iconColor: "text-violet-500",
            iconBg: "bg-violet-500/10",
        },
    ];
}

export function StaticKpiCards({ data, secondMetric }: StaticKpiCardsProps) {
    const kpiConfig = getKpiConfig(secondMetric?.label ?? "Объекты");

    return (
        <div className="grid grid-cols-3 gap-3">
            {kpiConfig.map((kpi) => {
                const Icon = kpi.icon;
                const value = kpi.key === "totalListings" && secondMetric ? secondMetric.value : data[kpi.key];

                return (
                    <Card key={kpi.key} className="min-w-0 p-3">
                        <CardContent className="p-0 flex flex-col items-center gap-2 text-center">
                            <div className={`shrink-0 rounded-sm p-2 ${kpi.iconBg}`}>
                                <Icon className={`h-4 w-4 ${kpi.iconColor}`} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-[16px] leading-snug text-[color:var(--workspace-text-muted)]">{kpi.label}</p>
                                <p className="mt-1 text-[20px] font-medium leading-none text-[#e6c364]">{value.toLocaleString("ru-RU")}</p>
                            </div>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}
