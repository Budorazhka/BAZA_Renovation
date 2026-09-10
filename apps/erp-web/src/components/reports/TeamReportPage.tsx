/**
 * KPI и отчёты по позиции/человеку — ОСОЗНАННО не переведены на Platform API
 * (TEAM-001, 03.09.2026). Backend их не реализует: см.
 * docs/progress-report-2026-09-01.md, «Нет: KPI и отчёты по позиции и
 * человеку» — это отдельная задача этапа 6 мастер-плана, не honest gap этого
 * прохода. Экран продолжает читать `@/data/team-kpi-mock` и
 * `lib/bi/manager-analytics-adapter` (который сам читает `personnel-mock`).
 * Не подключать сюда несуществующий backend-эндпоинт.
 */
import { useMemo, useState } from "react";
import { Activity, AlertTriangle, Filter, RotateCcw, Search, Target, TrendingUp, Users } from "lucide-react";
import { useI18n } from "@/i18n";
import { DashboardShell } from "@/components/layout/DashboardShell";
import {
    ActivityChart,
    ActivityComposition,
    ConversionOverviewChart,
    DynamicKpiCards,
    FunnelKanban,
    LeaderboardTable,
    LeadsChart,
    PartnersActivityDistribution,
    PeriodTabs,
    StaticKpiCards,
    TopReferralsChart,
} from "@/components/analytics-network";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExportButton } from "@/components/common/ExportButton";
import { useTeamPerformance } from "@/hooks/useTeamPerformance";
import { MOCK_KPI } from "@/data/team-kpi-mock";
import { getManagerAnalyticsData, type ManagerAnalyticsData, type TeamBranchFilter } from "@/lib/bi/manager-analytics-adapter";
import type { ActivityMarker, ActivityTimeseriesPoint, AnalyticsPeriod, DynamicKpi, FunnelBoard, PartnerRow, SortColumn, SortDirection } from "@/types/analytics";


const defaultSortColumn: SortColumn = "leadsAdded";
const defaultSortDirection: SortDirection = "desc";
const ALL_MANAGERS_ID = "all";

type ReportMode = "team" | "manager";

interface TeamAnalyticsReportProps {
    mode?: ReportMode;
}

const localeByLanguage = { ru: 'ru-RU', en: 'en-US', ka: 'ka-GE', es: 'es-ES', tr: 'tr-TR' } as const;

function formatNumber(value: number, language: keyof typeof localeByLanguage) {
    return value.toLocaleString(localeByLanguage[language]);
}

function formatDecimal(value: number, language: keyof typeof localeByLanguage) {
    return value.toLocaleString(localeByLanguage[language], { maximumFractionDigits: 1 });
}

function SummaryTile({
    icon: Icon,
    label,
    value,
    meta,
    tone,
}: {
    icon: typeof Users;
    label: string;
    value: string;
    meta: string;
    tone: string;
}) {
    return (
        <div className="rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-4">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-xs uppercase text-[color:var(--app-text-subtle)]">{label}</p>
                    <p className="mt-2 text-2xl font-normal leading-none text-[color:var(--workspace-text)]">{value}</p>
                    <p className="mt-2 text-sm text-[color:var(--workspace-text-muted)]">{meta}</p>
                </div>
                <div className={`rounded-lg p-2 ${tone}`}>
                    <Icon className="size-5" />
                </div>
            </div>
        </div>
    );
}

function scaleLeadsSeries(rows: { date: string; leads: number }[], ratio: number) {
    return rows.map((row) => ({
        ...row,
        leads: Math.max(0, Math.round(row.leads * ratio)),
    }));
}

function scaleActivitySeries(
    rows: ActivityTimeseriesPoint[],
    ratios: { calls: number; chats: number; selections: number }
) {
    return rows.map((row) => ({
        ...row,
        calls: Math.max(0, Math.round(row.calls * ratios.calls)),
        chats: Math.max(0, Math.round(row.chats * ratios.chats)),
        selections: Math.max(0, Math.round(row.selections * ratios.selections)),
    }));
}

function scaleFunnel(board: FunnelBoard, ratio: number): FunnelBoard {
    const columns = board.columns.map((column) => {
        const stages = column.stages.map((stage) => ({
            ...stage,
            count: Math.max(0, Math.round(stage.count * ratio)),
        }));
        return {
            ...column,
            count: stages.reduce((sum, stage) => sum + stage.count, 0),
            stages,
        };
    });
    const totalCount = columns.reduce((sum, column) => sum + column.count, 0);
    const rejectionCount = columns
        .filter((column) => column.id === "rejection")
        .reduce((sum, column) => sum + column.count, 0);
    const closedCount = columns
        .filter((column) => column.id === "success" || column.id === "active")
        .reduce((sum, column) => sum + column.count, 0);

    return {
        ...board,
        totalCount,
        activeCount: Math.max(0, totalCount - rejectionCount - closedCount),
        rejectionCount,
        closedCount,
        columns,
    };
}

function buildFocusedManagerData(
    base: ManagerAnalyticsData,
    manager: PartnerRow,
    planPercent: number
): ManagerAnalyticsData {
    const dynamicKpi: DynamicKpi = {
        addedListings: Math.max(0, Math.round(manager.leadsAdded * 0.58)),
        addedLevel1Referrals: manager.level1Count > 0 ? 1 : 0,
        addedLevel2Referrals: manager.level1Count,
        addedLeads: manager.leadsAdded,
        callClicks: manager.callClicks,
        chatOpens: manager.chatOpens,
        selectionsCreated: manager.selectionsCreated,
        deals: Math.max(0, Math.round(manager.stageChangesCount / 9)),
    };
    const leadsRatio = base.dynamicKpi.addedLeads > 0 ? dynamicKpi.addedLeads / base.dynamicKpi.addedLeads : 0;
    const activityRatios = {
        calls: base.dynamicKpi.callClicks > 0 ? dynamicKpi.callClicks / base.dynamicKpi.callClicks : 0,
        chats: base.dynamicKpi.chatOpens > 0 ? dynamicKpi.chatOpens / base.dynamicKpi.chatOpens : 0,
        selections:
            base.dynamicKpi.selectionsCreated > 0
                ? dynamicKpi.selectionsCreated / base.dynamicKpi.selectionsCreated
                : 0,
    };

    return {
        ...base,
        branchLabel: manager.name,
        staticKpi: {
            level1Referrals: 1,
            totalListings: manager.level2Count,
            totalLeads: dynamicKpi.addedLeads,
            totalDeals: dynamicKpi.deals,
        },
        dynamicKpi,
        leadsTimeseries: scaleLeadsSeries(base.leadsTimeseries, leadsRatio),
        activityTimeseries: scaleActivitySeries(base.activityTimeseries, activityRatios),
        funnels: base.funnels.map((funnel) => scaleFunnel(funnel, leadsRatio)),
        managers: [manager],
        maxLeadsAdded: Math.max(manager.leadsAdded, 1),
        maxStageChangesCount: Math.max(manager.stageChangesCount, 1),
        summary: {
            managersCount: 1,
            activeManagersCount: manager.activityMarker === "green" ? 1 : 0,
            riskManagersCount: manager.onlineDaysLast7 === 0 || manager.activityMarker === "red" ? 1 : 0,
            avgOnlineDaysLast7: manager.onlineDaysLast7,
            avgPlanPercent: planPercent,
            revenueMillions: manager.commissionUsd,
        },
    };
}

/**
 * BI-отчёт по команде: переиспользует аналитику MLS как механику операционных метрик,
 * но субъект отчёта здесь менеджеры, РОПы и директор.
 */
export function TeamAnalyticsReport({ mode = "team" }: TeamAnalyticsReportProps) {
    const isManagerMode = mode === "manager";
    const { t, language } = useI18n();
    const branchOptions: { value: TeamBranchFilter; label: string }[] = [
        { value: 'all', label: t('teamReport.branchAll') },
        { value: 'msk', label: t('teamReport.branchMsk') },
        { value: 'spb', label: t('teamReport.branchSpb') },
    ];
    const mockDynamicLabels: Partial<Record<keyof DynamicKpi, string>> = {
        addedListings: t('teamReport.newListings'), addedLeads: t('teamReport.newLeads'), callClicks: t('teamReport.calls'), chatOpens: t('teamReport.chats'), selectionsCreated: t('teamReport.selections'), deals: t('teamReport.deals'),
    };
    // Для живого отчёта (useTeamPerformance) поля DynamicKpi переиспользованы
    // под другие метрики бэкенда (задачи вместо звонков/чатов, конверсии
    // вместо рассылок) — подписи те же слова, что раньше показывали мок,
    // но привязаны к реально приходящим полям.
    const liveDynamicLabels: Partial<Record<keyof DynamicKpi, string>> = {
        addedListings: 'Сделок всего', addedLeads: t('teamReport.newLeads'), callClicks: 'Задач выполнено', chatOpens: 'Задач всего', selectionsCreated: 'Лидов конвертировано', deals: t('teamReport.deals'),
    };
    const [globalPeriod, setGlobalPeriod] = useState<AnalyticsPeriod>("month");
    const [leadsPeriod, setLeadsPeriod] = useState<AnalyticsPeriod>("month");
    const [activityPeriod, setActivityPeriod] = useState<AnalyticsPeriod>("month");
    const [topManagersPeriod, setTopManagersPeriod] = useState<AnalyticsPeriod>("month");
    const [engagementPeriod, setEngagementPeriod] = useState<AnalyticsPeriod>("week");
    const [branchFilter, setBranchFilter] = useState<TeamBranchFilter>("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [onlyOnline, setOnlyOnline] = useState(false);
    const [inactiveLast7, setInactiveLast7] = useState(false);
    const [selectedActivityMarker, setSelectedActivityMarker] = useState<ActivityMarker | null>(null);
    const [sortColumn, setSortColumn] = useState<SortColumn>(defaultSortColumn);
    const [sortDirection, setSortDirection] = useState<SortDirection>(defaultSortDirection);
    const [selectedManagerId, setSelectedManagerId] = useState(ALL_MANAGERS_ID);

    const managerBaseData = useMemo(
        () => getManagerAnalyticsData(globalPeriod, "all"),
        [globalPeriod]
    );
    const managerOptions = managerBaseData.managers;
    const isAllManagersSelected = isManagerMode && selectedManagerId === ALL_MANAGERS_ID;
    const activeManagerId =
        selectedManagerId && selectedManagerId !== ALL_MANAGERS_ID
            ? selectedManagerId
            : managerOptions[0]?.id || "";
    const selectedManager = !isAllManagersSelected
        ? managerOptions.find((manager) => manager.id === activeManagerId) ?? managerOptions[0]
        : undefined;
    const selectedManagerPlan = selectedManager ? MOCK_KPI[selectedManager.id]?.plan ?? 0 : 0;

    const {
        data: liveTeamData,
        rawReport: liveRawReport,
        loading: liveTeamLoading,
        error: liveTeamError,
    } = useTeamPerformance(
        globalPeriod,
        branchFilter,
        isManagerMode && selectedManagerId !== ALL_MANAGERS_ID ? selectedManagerId : undefined,
    );
    const dynamicLabels = liveTeamData ? liveDynamicLabels : mockDynamicLabels;

    const teamGlobalData = useMemo(
        () => getManagerAnalyticsData(globalPeriod, branchFilter),
        [branchFilter, globalPeriod]
    );
    const managerGlobalData = useMemo(
        () => !isAllManagersSelected && selectedManager
            ? buildFocusedManagerData(managerBaseData, selectedManager, selectedManagerPlan)
            : managerBaseData,
        [isAllManagersSelected, managerBaseData, selectedManager, selectedManagerPlan]
    );
    const globalData = liveTeamData ?? (isManagerMode ? managerGlobalData : teamGlobalData);
    // Суммы комиссий по сделкам в разных валютах хук не складывает в одно
    // число (см. sumMinorUnitsIfSingleCurrency в useTeamPerformance) — здесь
    // подписываем итог реальным кодом валюты вместо жёстко зашитого "$",
    // либо честно говорим, что валюты смешаны, вместо того чтобы показать
    // сумму долларов и юаней под одним ярлыком.
    const liveCommissionCurrencies = liveTeamData
        ? Array.from(new Set((liveRawReport?.summary.dealsCommission ?? []).map((c) => c.currency)))
        : [];
    const revenueDisplay = !liveTeamData
        ? `$${formatDecimal(globalData.summary.revenueMillions, language)}M`
        : liveCommissionCurrencies.length > 1
            ? t('teamReport.mixedCurrencies', 'Смешанные валюты')
            : liveCommissionCurrencies.length === 1
                ? `${formatDecimal(globalData.summary.revenueMillions, language)}M ${liveCommissionCurrencies[0]}`
                : `${formatDecimal(0, language)}M`;

    const todayData = useMemo(() => getManagerAnalyticsData("week", branchFilter), [branchFilter]);
    const managerTodayData = useMemo(() => {
        const base = getManagerAnalyticsData("week", "all");
        if (isAllManagersSelected) return base;
        const manager = base.managers.find((item) => item.id === activeManagerId) ?? base.managers[0];
        return manager ? buildFocusedManagerData(base, manager, MOCK_KPI[manager.id]?.plan ?? 0) : base;
    }, [activeManagerId, isAllManagersSelected]);
    const activeTodayData = isManagerMode ? managerTodayData : todayData;
    const leadsData = useMemo(() => {
        const base = getManagerAnalyticsData(leadsPeriod, isManagerMode ? "all" : branchFilter);
        if (!isManagerMode) return base;
        if (isAllManagersSelected) return base;
        const manager = base.managers.find((item) => item.id === activeManagerId) ?? base.managers[0];
        return manager ? buildFocusedManagerData(base, manager, MOCK_KPI[manager.id]?.plan ?? 0) : base;
    }, [activeManagerId, branchFilter, isAllManagersSelected, isManagerMode, leadsPeriod]);
    const activityData = useMemo(
        () => {
            const base = getManagerAnalyticsData(activityPeriod, isManagerMode ? "all" : branchFilter);
            if (!isManagerMode) return base;
            if (isAllManagersSelected) return base;
            const manager = base.managers.find((item) => item.id === activeManagerId) ?? base.managers[0];
            return manager ? buildFocusedManagerData(base, manager, MOCK_KPI[manager.id]?.plan ?? 0) : base;
        },
        [activeManagerId, activityPeriod, branchFilter, isAllManagersSelected, isManagerMode]
    );
    const topManagers = useMemo(
        () => {
            const base = getManagerAnalyticsData(topManagersPeriod, isManagerMode ? "all" : branchFilter);
            if (!isManagerMode) return base.managers;
            if (isAllManagersSelected) return base.managers;
            const manager = base.managers.find((item) => item.id === activeManagerId) ?? base.managers[0];
            return manager ? [manager] : [];
        },
        [activeManagerId, branchFilter, isAllManagersSelected, isManagerMode, topManagersPeriod]
    );
    const engagementManagers = useMemo(
        () => {
            const base = getManagerAnalyticsData(engagementPeriod, isManagerMode ? "all" : branchFilter);
            if (!isManagerMode) return base.managers;
            if (isAllManagersSelected) return base.managers;
            const manager = base.managers.find((item) => item.id === activeManagerId) ?? base.managers[0];
            return manager ? [manager] : [];
        },
        [activeManagerId, branchFilter, engagementPeriod, isAllManagersSelected, isManagerMode]
    );

    const filteredManagers = useMemo(() => {
        if (isManagerMode) return globalData.managers;
        const query = searchQuery.trim().toLowerCase();
        return globalData.managers.filter((manager) => {
            if (query && !manager.name.toLowerCase().includes(query)) return false;
            if (onlyOnline && !manager.isOnline) return false;
            if (inactiveLast7 && manager.onlineDaysLast7 > 0) return false;
            if (selectedActivityMarker && manager.activityMarker !== selectedActivityMarker) return false;
            return true;
        });
    }, [globalData.managers, inactiveLast7, isManagerMode, onlyOnline, searchQuery, selectedActivityMarker]);

    const sortedManagers = useMemo(() => {
        return [...filteredManagers].sort((a, b) => {
            const diff = a[sortColumn] - b[sortColumn];
            if (diff !== 0) return sortDirection === "asc" ? diff : -diff;
            return a.name.localeCompare(b.name, "ru", { sensitivity: "base" });
        });
    }, [filteredManagers, sortColumn, sortDirection]);

    const maxLeadsAdded = useMemo(
        () => Math.max(...filteredManagers.map((manager) => manager.leadsAdded), 1),
        [filteredManagers]
    );
    const maxStageChangesCount = useMemo(
        () => Math.max(...filteredManagers.map((manager) => manager.stageChangesCount), 1),
        [filteredManagers]
    );
    const salesFunnel = useMemo(
        () => globalData.funnels.find((funnel) => funnel.id === "sales") ?? null,
        [globalData.funnels]
    );
    const reportFunnels = useMemo(() => globalData.funnels, [globalData.funnels]);

    const handleSortChange = (column: SortColumn) => {
        if (column === sortColumn) {
            setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
            return;
        }
        setSortColumn(column);
        setSortDirection("desc");
    };

    const handleResetFilters = () => {
        setSearchQuery("");
        setOnlyOnline(false);
        setInactiveLast7(false);
        setSelectedActivityMarker(null);
        setSortColumn(defaultSortColumn);
        setSortDirection(defaultSortDirection);
    };

    const activeFilterCount =
        Number(Boolean(searchQuery.trim())) + Number(onlyOnline) + Number(inactiveLast7) + Number(Boolean(selectedActivityMarker));

    return (
        <DashboardShell>
            <div className="network-analytics-theme team-report-theme min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
                <div className="mx-auto w-full max-w-[1680px] space-y-5">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                        <div className="min-w-0 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline" className="border-[var(--hub-card-border)] text-[color:var(--workspace-text-muted)]">
                                    {t("teamReport.analytics")}
                                </Badge>
                                <Badge variant="secondary">{globalData.periodLabel}</Badge>
                                <Badge variant="secondary">{globalData.branchLabel}</Badge>
                            </div>
                            <div>
                                <h1 className="text-2xl font-normal text-[color:var(--theme-accent-heading)] sm:text-3xl">
                                    {isManagerMode ? t("teamReport.managerTitle") : t("teamReport.title")}
                                </h1>
                                <p className="mt-1 max-w-3xl text-sm text-[color:var(--app-text-muted)]">
                                    {isManagerMode
                                        ? t("teamReport.managerDescription")
                                        : t("teamReport.teamDescription")}
                                </p>
                            </div>
                        </div>
                        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                            {isManagerMode ? (
                                <select
                                    value={selectedManagerId}
                                    onChange={(event) => setSelectedManagerId(event.target.value)}
                                    className="h-10 min-w-[260px] rounded-md border border-[var(--hub-card-border)] bg-[color-mix(in_srgb,var(--rail-bg)_82%,transparent)] px-3 text-sm text-[color:var(--workspace-text)] [color-scheme:dark]"
                                >
                                    <option value={ALL_MANAGERS_ID}>{t("teamReport.allManagers")}</option>
                                    {managerOptions.map((manager) => (
                                        <option key={manager.id} value={manager.id}>
                                            {manager.name}
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <select
                                    value={branchFilter}
                                    onChange={(event) => setBranchFilter(event.target.value as TeamBranchFilter)}
                                    className="h-10 rounded-md border border-[var(--hub-card-border)] bg-[color-mix(in_srgb,var(--rail-bg)_82%,transparent)] px-3 text-sm text-[color:var(--workspace-text)] [color-scheme:dark]"
                                >
                                    {branchOptions.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            )}
                            <PeriodTabs selectedPeriod={globalPeriod} onPeriodChange={setGlobalPeriod} />
                            <ExportButton entity="tasks" label="Выгрузка задач" />
                        </div>
                    </div>

                    {liveTeamLoading && (
                        <div className="rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] px-4 py-2 text-sm text-[color:var(--workspace-text-muted)]">
                            Загружаем актуальные показатели команды…
                        </div>
                    )}
                    {!liveTeamLoading && liveTeamError && (
                        <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-300">
                            <AlertTriangle className="size-4 shrink-0" />
                            Не удалось загрузить актуальные показатели команды: {liveTeamError}. Ниже — демонстрационные данные, не показатели вашей команды.
                        </div>
                    )}

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <SummaryTile
                            icon={Users}
                            label={isManagerMode && !isAllManagersSelected ? t("teamReport.employee") : t("teamReport.team")}
                            value={formatNumber(globalData.summary.managersCount, language)}
                            meta={
                                isManagerMode && !isAllManagersSelected
                                    ? selectedManager?.name ?? t("teamReport.notSelected")
                                    : `${formatNumber(globalData.summary.activeManagersCount, language)} ${t("teamReport.activeManagers")}`
                            }
                            tone="bg-emerald-500/10 text-emerald-300"
                        />
                        <SummaryTile
                            icon={TrendingUp}
                            label={t("teamReport.revenue")}
                            value={revenueDisplay}
                            meta={`${t("teamReport.averagePlan")} ${globalData.summary.avgPlanPercent}%`}
                            tone="bg-amber-500/10 text-amber-300"
                        />
                        <SummaryTile
                            icon={Activity}
                            label={t("teamReport.activity")}
                            value={formatNumber(globalData.dynamicKpi.callClicks + globalData.dynamicKpi.chatOpens + globalData.dynamicKpi.selectionsCreated, language)}
                            meta={`${t("teamReport.onlineDays")} ${formatDecimal(globalData.summary.avgOnlineDaysLast7, language)} / 7`}
                            tone="bg-sky-500/10 text-sky-300"
                        />
                        <SummaryTile
                            icon={AlertTriangle}
                            label={t("teamReport.riskZone")}
                            value={formatNumber(globalData.summary.riskManagersCount, language)}
                            meta={t("teamReport.noStableActivity")}
                            tone="bg-rose-500/10 text-rose-300"
                        />
                    </div>

                    {isManagerMode ? (
                        <section className="rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3">
                            <div className="mb-3 flex items-center gap-2">
                                <Target className="size-4 text-[color:var(--gold)]" />
                                <h2 className="text-sm font-normal text-[color:var(--theme-accent-heading)]">
                                    {isAllManagersSelected ? t("teamReport.managerSummary") : t("teamReport.managerFocus")}
                                </h2>
                            </div>
                            <div className="grid gap-2 md:grid-cols-4">
                                <div className="rounded-md border border-[var(--workspace-row-border)] bg-[var(--workspace-row-bg)] px-3 py-2">
                                    <p className="text-[10px] uppercase text-[color:var(--app-text-subtle)]">
                                        {isAllManagersSelected ? t("teamReport.averagePlan") : t("teamReport.plan")}
                                    </p>
                                    <p className="text-lg font-normal text-[color:var(--workspace-text)]">{globalData.summary.avgPlanPercent}%</p>
                                </div>
                                <div className="rounded-md border border-[var(--workspace-row-border)] bg-[var(--workspace-row-bg)] px-3 py-2">
                                    <p className="text-[10px] uppercase text-[color:var(--app-text-subtle)]">{t("teamReport.onlineLast7Days")}</p>
                                    <p className="text-lg font-normal text-[color:var(--workspace-text)]">{globalData.summary.avgOnlineDaysLast7}</p>
                                </div>
                                <div className="rounded-md border border-[var(--workspace-row-border)] bg-[var(--workspace-row-bg)] px-3 py-2">
                                    <p className="text-[10px] uppercase text-[color:var(--app-text-subtle)]">{t("teamReport.leads")}</p>
                                    <p className="text-lg font-normal text-[color:var(--workspace-text)]">{globalData.dynamicKpi.addedLeads}</p>
                                </div>
                                <div className="rounded-md border border-[var(--workspace-row-border)] bg-[var(--workspace-row-bg)] px-3 py-2">
                                    <p className="text-[10px] uppercase text-[color:var(--app-text-subtle)]">{t("teamReport.revenue")}</p>
                                    <p className="text-lg font-normal text-[color:var(--workspace-text)]">${formatDecimal(globalData.summary.revenueMillions, language)}M</p>
                                </div>
                            </div>
                        </section>
                    ) : (
                        <section className="rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                    <Filter className="size-4 text-[color:var(--gold)]" />
                                    <h2 className="text-sm font-normal text-[color:var(--theme-accent-heading)]">{t("teamReport.filters")}</h2>
                                    {activeFilterCount > 0 && <Badge variant="secondary">{activeFilterCount}</Badge>}
                                </div>
                                <Button variant="outline" size="sm" onClick={handleResetFilters}>
                                    <RotateCcw className="size-4" />
                                    {t("teamReport.reset")}
                                </Button>
                            </div>
                            <div className="grid gap-2 lg:grid-cols-[minmax(240px,1fr)_auto_auto_auto] lg:items-center">
                                <label className="flex h-10 min-w-0 items-center gap-2 rounded-md border border-[var(--hub-card-border)] bg-[color-mix(in_srgb,var(--rail-bg)_82%,transparent)] px-3">
                                    <Search className="size-4 shrink-0 text-[color:var(--app-text-subtle)]" />
                                    <input
                                        value={searchQuery}
                                        onChange={(event) => setSearchQuery(event.target.value)}
                                        placeholder={t("teamReport.searchPlaceholder")}
                                        className="min-w-0 flex-1 border-0 bg-transparent text-sm text-[color:var(--workspace-text)] outline-none placeholder:text-[color:var(--app-text-subtle)]"
                                    />
                                </label>
                                <Button
                                    type="button"
                                    variant={onlyOnline ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setOnlyOnline((current) => !current)}
                                >
                                    {t("teamReport.onlyOnline")}
                                </Button>
                                <Button
                                    type="button"
                                    variant={inactiveLast7 ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setInactiveLast7((current) => !current)}
                                >
                                    {t("teamReport.inactiveLast7Days")}
                                </Button>
                                <div className="flex items-center gap-2 text-sm text-[color:var(--workspace-text-muted)]">
                                    <Target className="size-4 text-[color:var(--gold)]" />
                                    {t("teamReport.found")}: {formatNumber(sortedManagers.length, language)}
                                </div>
                            </div>
                        </section>
                    )}

                    <div className="grid items-start gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
                        <aside className="space-y-4">
                            <StaticKpiCards
                                data={globalData.staticKpi}
                                referralsLabel={isManagerMode && !isAllManagersSelected ? t("teamReport.manager") : t("teamReport.managers")}
                                secondMetric={{ label: t("teamReport.activeTasks"), value: globalData.staticKpi.totalListings }}
                            />
                            <DynamicKpiCards
                                data={globalData.dynamicKpi}
                                todayData={activeTodayData.dynamicKpi}
                                periodLabel={globalData.periodLabel}
                                variant="directOnly"
                                labels={dynamicLabels}
                            />
                            <ActivityComposition data={globalData.dynamicKpi} />
                        </aside>

                        <main className="min-w-0 space-y-5">
                            <div className="grid gap-5 2xl:grid-cols-2">
                                <LeadsChart data={leadsData.leadsTimeseries} period={leadsPeriod} onPeriodChange={setLeadsPeriod} />
                                <ActivityChart
                                    data={activityData.activityTimeseries}
                                    period={activityPeriod}
                                    onPeriodChange={setActivityPeriod}
                                />
                            </div>

                            <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
                                {salesFunnel && <ConversionOverviewChart funnel={salesFunnel} />}
                                <PartnersActivityDistribution
                                    partners={engagementManagers}
                                    period={engagementPeriod}
                                    onPeriodChange={setEngagementPeriod}
                                    onSegmentClick={setSelectedActivityMarker}
                                    title={t("teamReport.activityDistribution")}
                                    riskTitle={t("teamReport.managersAtRisk")}
                                    riskWeekDescription={t("teamReport.riskWeekDescription")}
                                    riskPeriodDescription={t("teamReport.riskPeriodDescription")}
                                />
                            </div>

                            <div className="grid gap-5 2xl:grid-cols-[420px_minmax(0,1fr)]">
                                <TopReferralsChart
                                    partners={topManagers}
                                    period={topManagersPeriod}
                                    onPeriodChange={setTopManagersPeriod}
                                    title={
                                        isManagerMode && !isAllManagersSelected
                                            ? t("teamReport.selectedManagerLeads")
                                            : t("teamReport.topManagersLeads")
                                    }
                                    totalLabel={isManagerMode && !isAllManagersSelected ? t("teamReport.leads") : t("teamReport.topLeads")}
                                />
                                <FunnelKanban funnels={reportFunnels} />
                            </div>

                            <LeaderboardTable
                                partners={sortedManagers}
                                maxLeadsAdded={maxLeadsAdded}
                                maxStageChangesCount={maxStageChangesCount}
                                sortColumn={sortColumn}
                                sortDirection={sortDirection}
                                onSortChange={handleSortChange}
                                onResetFilters={handleResetFilters}
                                title={isManagerMode && !isAllManagersSelected ? t("teamReport.managerCard") : t("teamReport.managerRating")}
                                participantLabel={t("teamReport.manager")}
                                commissionLabel={t("teamReport.revenueMillions")}
                                formatCommission={(value) => `$${formatDecimal(value, language)}M`}
                                showActions={false}
                            />
                        </main>
                    </div>
                </div>
            </div>
        </DashboardShell>
    );
}

export default function TeamReportPage() {
    return <TeamAnalyticsReport mode="team" />;
}
