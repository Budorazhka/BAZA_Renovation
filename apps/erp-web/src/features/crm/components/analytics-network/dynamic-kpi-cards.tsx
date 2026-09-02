import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    UserCheck,
    Phone,
    MessageCircle,
    LayoutList,
    Trophy,
    Home,
} from "lucide-react";
import type { DynamicKpi } from "@/types/analytics";
import { useI18n } from "@/i18n";

interface DynamicKpiCardsProps {
    data: DynamicKpi;
    todayData?: DynamicKpi;
    periodLabel: string;
    variant?: "full" | "directOnly";
}

const fullKpiConfig = [
    { key: "addedListings" as const, labelKey: "newObjects", icon: Home, iconColor: "text-emerald-500", iconBg: "bg-emerald-500/10" },
    { key: "addedLeads" as const, labelKey: "newLeads", icon: UserCheck, iconColor: "text-emerald-500", iconBg: "bg-emerald-500/10" },
    { key: "callClicks" as const, labelKey: "calls", icon: Phone, iconColor: "text-orange-500", iconBg: "bg-orange-500/10" },
    { key: "chatOpens" as const, labelKey: "chats", icon: MessageCircle, iconColor: "text-cyan-500", iconBg: "bg-cyan-500/10" },
    { key: "selectionsCreated" as const, labelKey: "newsletters", icon: LayoutList, iconColor: "text-pink-500", iconBg: "bg-pink-500/10" },
    { key: "deals" as const, labelKey: "transactions", icon: Trophy, iconColor: "text-amber-500", iconBg: "bg-amber-500/10" },
];

const directOnlyKpiKeys: (keyof DynamicKpi)[] = [
    "addedListings",
    "addedLeads",
    "callClicks",
    "chatOpens",
    "selectionsCreated",
    "deals",
];

export function DynamicKpiCards({ data, todayData, periodLabel, variant = "full" }: DynamicKpiCardsProps) {
    const { t } = useI18n();
    const kpiConfig = variant === "directOnly"
        ? fullKpiConfig.filter((kpi) => directOnlyKpiKeys.includes(kpi.key))
        : fullKpiConfig;

    return (
        <div className="space-y-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h3 className="text-[16px] font-medium leading-tight text-[color:var(--workspace-text-muted)]">{t('dynamic-kpi-cards.period')}</h3>
                <Badge variant="secondary" className="h-auto text-[16px] leading-tight">{periodLabel}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-3">
                {kpiConfig.map((kpi) => {
                    const Icon = kpi.icon;
                    const value = data[kpi.key];
                    const todayValue = todayData?.[kpi.key] ?? 0;

                    return (
                        <Card key={kpi.key} className="min-w-0 overflow-hidden p-3">
                            <CardContent className="flex flex-col gap-2 p-0">
                                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-1.5">
                                    <Badge className="w-full min-w-0 shrink whitespace-normal [overflow-wrap:anywhere] bg-teal-400/10 px-1.5 py-1 text-center text-[16px] leading-tight text-[color:var(--workspace-text-muted)] shadow-none dark:text-teal-400">
                                        +{todayValue.toLocaleString("ru-RU")} {t('dynamic-kpi-cards.forToday')}</Badge>
                                    <div className={`shrink-0 rounded-sm p-1 ${kpi.iconBg}`}>
                                        <Icon className={`h-3.5 w-3.5 ${kpi.iconColor}`} />
                                    </div>
                                </div>
                                <div className="min-w-0 text-center">
                                    <p className="text-[20px] font-medium leading-none text-[#e6c364]">{value.toLocaleString("ru-RU")}</p>
                                    <p className="mt-1 text-[16px] leading-snug text-[color:var(--workspace-text-muted)]">{t(`dynamic-kpi-cards.${kpi.labelKey}`)}</p>
                                    <p className="text-[16px] leading-snug text-[color:var(--workspace-text-muted)]">{t('dynamic-kpi-cards.for')} {periodLabel}</p>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}
