"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import {
    ActivityCalendarCard,
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
} from "@/features/crm/components/analytics-network";
import { AnalyticsNavLinks } from "@/features/crm/pages/crm/components/AnalyticsNavLinks";
import { ParticipantCell } from "@/features/crm/components/analytics-network/participant-cell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getPeriodDateRange } from "@/features/crm/pages/crm/analyticsData";
import { crmAnalyticsPartnerPath } from "@/features/crm/crmAnalyticsPaths";
import { useNetworkAnalyticsBackend } from "@/features/crm/pages/crm/hooks/useNetworkAnalyticsBackend";
import type { ActivityMarker, AnalyticsPeriod, ActivityTimeseriesPoint, LeadsTimeseriesPoint, SortColumn, SortDirection } from "@/types/analytics";
import { ArrowRight } from "lucide-react";
import { useI18n } from "@/i18n";
import { useAuth } from "@/context/AuthContext";
import DeveloperAnalyticsPage from "@/components/analytics-developer/DeveloperAnalyticsPage";

const defaultPeriod: AnalyticsPeriod = "week";
const defaultSortColumn: SortColumn = "leadsAdded";
const defaultSortDirection: SortDirection = "desc";

const EMPTY_ACTIVITY_TIMESERIES = [{ date: "", calls: 0, chats: 0, selections: 0 }];

function NetworkAnalyticsDashboard() {
    const { t } = useI18n();
    const { role } = useRolePermissions();
    
    // Managers only see themselves: redirect to personal page
    if (role === "manager") {
        return <Navigate to="/dashboard/crm/analytics/me" replace />;
    }

    const navigate = useNavigate();
    const leftColumnRef = useRef<HTMLDivElement | null>(null);
    const [globalPeriod, setGlobalPeriod] = useState<AnalyticsPeriod>(defaultPeriod);
    const [leadsPeriod, setLeadsPeriod] = useState<AnalyticsPeriod>("week");
    const [activityPeriod, setActivityPeriod] = useState<AnalyticsPeriod>("week");
    const [engagementPeriod, setEngagementPeriod] = useState<AnalyticsPeriod>("week");
    const [leftColumnHeight, setLeftColumnHeight] = useState<number | null>(null);
    const [isDesktopLayout, setIsDesktopLayout] = useState(false);

    const [sortColumn, setSortColumn] = useState<SortColumn>(defaultSortColumn);
    const [sortDirection, setSortDirection] = useState<SortDirection>(defaultSortDirection);
    const [searchQuery, setSearchQuery] = useState("");
    const [onlyOnline, setOnlyOnline] = useState(false);
    const [inactiveLast7, setInactiveLast7] = useState(false);
    const [selectedActivityMarker, setSelectedActivityMarker] = useState<ActivityMarker | null>(null);

    const { data: networkData, loading: networkLoading, error: networkError, refetch, getLeadsTimeseriesForPeriod, getActivityTimeseriesForPeriod, todayDelta } = useNetworkAnalyticsBackend(globalPeriod);

    const globalAnalytics = networkData;
    const emptyDynamicKpi = { addedListings: 0, addedLevel1Referrals: 0, addedLevel2Referrals: 0, addedLeads: 0, callClicks: 0, chatOpens: 0, selectionsCreated: 0, deals: 0 };
    const todayAnalytics = networkData ? { dynamicKpi: todayDelta ?? networkData.dynamicKpi } : { dynamicKpi: emptyDynamicKpi };

    const periodLabel = useMemo(() => {
        const labelKey = globalPeriod === "allTime" ? "forAllTime" : globalPeriod;
        return t(`period-tabs.${labelKey}`);
    }, [globalPeriod, t]);

    const leadsData = useMemo((): LeadsTimeseriesPoint[] => {
        if (!networkData) {
            const range = getPeriodDateRange(leadsPeriod);
            if (leadsPeriod === "allTime") {
                const year = range.start.getFullYear();
                const endMonth = range.end.getMonth();
                const fallback: LeadsTimeseriesPoint[] = [];
                for (let m = 0; m <= endMonth; m += 1) {
                    const monthKey = `${year}-${String(m + 1).padStart(2, "0")}`;
                    fallback.push({ date: `${monthKey}-01`, leads: 0 });
                }
                return fallback.length > 0 ? fallback : [{ date: `${year}-01-01`, leads: 0 }];
            }
            const fallback: LeadsTimeseriesPoint[] = [];
            const cursor = new Date(range.start.getFullYear(), range.start.getMonth(), range.start.getDate());
            const endDate = new Date(range.end.getFullYear(), range.end.getMonth(), range.end.getDate());
            while (cursor <= endDate) {
                fallback.push({ date: cursor.toISOString().slice(0, 10), leads: 0 });
                cursor.setDate(cursor.getDate() + 1);
            }
            return fallback.length > 0 ? fallback : [{ date: new Date().toISOString().slice(0, 10), leads: 0 }];
        }
        const series = getLeadsTimeseriesForPeriod(leadsPeriod);
        if (series.length > 0) return series;
        if (leadsPeriod === "allTime") {
            const range = getPeriodDateRange("allTime");
            const year = range.start.getFullYear();
            const endMonth = range.end.getMonth();
            const fallback: LeadsTimeseriesPoint[] = [];
            for (let m = 0; m <= endMonth; m += 1) {
                const monthKey = `${year}-${String(m + 1).padStart(2, "0")}`;
                fallback.push({ date: `${monthKey}-01`, leads: 0 });
            }
            return fallback.length > 0 ? fallback : [{ date: `${year}-01-01`, leads: 0 }];
        }
        return [{ date: new Date().toISOString().slice(0, 10), leads: 0 }];
    }, [networkData, getLeadsTimeseriesForPeriod, leadsPeriod]);

    const activityData = useMemo((): ActivityTimeseriesPoint[] => (networkData ? getActivityTimeseriesForPeriod(activityPeriod) : EMPTY_ACTIVITY_TIMESERIES), [networkData, getActivityTimeseriesForPeriod, activityPeriod]);
    const monthRangeForCalendar = useMemo(() => getPeriodDateRange("month"), []);
    
    const monthCalendarData = useMemo(
        () =>
            (networkData?.monthActivityTimeseries?.length
                ? networkData.monthActivityTimeseries
                : networkData && globalPeriod === "month"
                  ? networkData.activityTimeseries
                  : EMPTY_ACTIVITY_TIMESERIES) as ActivityTimeseriesPoint[],
        [networkData, globalPeriod]
    );
    const allTimeCalendarData = useMemo(
        () =>
            (networkData?.allTimeActivityTimeseries?.length
                ? networkData.allTimeActivityTimeseries
                : networkData && globalPeriod === "allTime"
                  ? networkData.activityTimeseries
                  : EMPTY_ACTIVITY_TIMESERIES) as ActivityTimeseriesPoint[],
        [networkData, globalPeriod]
    );

    const engagementPartners = networkData && engagementPeriod === globalPeriod ? networkData.partners : networkData?.partners ?? [];

    const selectedActivityPartners = useMemo(
        () =>
            selectedActivityMarker
                ? engagementPartners.filter((p) => p.activityMarker === selectedActivityMarker)
                : [],
        [engagementPartners, selectedActivityMarker]
    );
    const range = useMemo(() => getPeriodDateRange(globalPeriod), [globalPeriod]);
    const rangeLabel = useMemo(() => {
        const formatter = new Intl.DateTimeFormat("ru-RU", {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
        return `${formatter.format(range.start)} - ${formatter.format(range.end)}`;
    }, [range]);

    const filteredPartners = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        let partners = globalAnalytics?.partners ?? [];

        if (query) {
            partners = partners.filter((partner) => partner.name.toLowerCase().includes(query));
        }
        if (onlyOnline) {
            partners = partners.filter((partner) => partner.isOnline);
        }
        if (inactiveLast7) {
            partners = partners.filter((partner) => partner.onlineDaysLast7 === 0);
        }

        return partners;
    }, [globalAnalytics?.partners, searchQuery, onlyOnline, inactiveLast7]);

    const maxLeadsAdded = useMemo(
        () => Math.max(...filteredPartners.map((partner) => partner.leadsAdded), 1),
        [filteredPartners]
    );
    const maxStageChangesCount = useMemo(
        () => Math.max(...filteredPartners.map((partner) => partner.stageChangesCount), 1),
        [filteredPartners]
    );

    const sortedPartners = useMemo(() => {
        return [...filteredPartners].sort((a, b) => {
            const diff = a[sortColumn] - b[sortColumn];
            if (diff !== 0) {
                return sortDirection === "asc" ? diff : -diff;
            }
            return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
        });
    }, [filteredPartners, sortColumn, sortDirection]);

    const salesFunnel = useMemo(
        () => globalAnalytics?.funnels?.find((funnel) => funnel.id === "sales") ?? globalAnalytics?.funnels?.[0],
        [globalAnalytics?.funnels]
    );

    const handleSortChange = (column: SortColumn) => {
        if (column === sortColumn) {
            setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
            return;
        }
        setSortColumn(column);
        setSortDirection("desc");
    };

    const handleResetFilters = () => {
        setSearchQuery("");
        setOnlyOnline(false);
        setInactiveLast7(false);
        setSortColumn(defaultSortColumn);
        setSortDirection(defaultSortDirection);
    };

    useEffect(() => {
        const mediaQuery = window.matchMedia("(min-width: 1024px)");
        const syncBreakpoint = () => setIsDesktopLayout(mediaQuery.matches);

        syncBreakpoint();
        if (typeof mediaQuery.addEventListener === "function") {
            mediaQuery.addEventListener("change", syncBreakpoint);
            return () => mediaQuery.removeEventListener("change", syncBreakpoint);
        }

        mediaQuery.addListener(syncBreakpoint);
        return () => mediaQuery.removeListener(syncBreakpoint);
    }, []);

    useEffect(() => {
        if (!isDesktopLayout) {
            setLeftColumnHeight(null);
            return;
        }

        const leftColumnNode = leftColumnRef.current;
        if (!leftColumnNode) return;

        const syncHeight = () => {
            setLeftColumnHeight(Math.round(leftColumnNode.getBoundingClientRect().height));
        };

        syncHeight();

        const observer =
            typeof ResizeObserver !== "undefined"
                ? new ResizeObserver(() => syncHeight())
                : null;

        observer?.observe(leftColumnNode);
        window.addEventListener("resize", syncHeight);

        return () => {
            observer?.disconnect();
            window.removeEventListener("resize", syncHeight);
        };
    }, [isDesktopLayout]);

    if (networkLoading && !networkData) {
        return (
            <div className="agency-analytics-theme flex min-h-[50vh] items-center justify-center px-3 py-4">
                <p className="text-sm text-muted-foreground">{t('crm.analyticsDashboard.loadingNetworkAnalytics')}</p>
            </div>
        );
    }
    if (networkError && !networkData) {
        return (
            <div className="agency-analytics-theme flex min-h-[50vh] flex-col items-center justify-center gap-2 px-3 py-4">
                <p className="text-sm text-destructive">{networkError}</p>
                <Button variant="outline" size="sm" onClick={() => refetch()}>{t('crm.analyticsDashboard.repeat')}</Button>
            </div>
        );
    }
    if (!globalAnalytics) {
        return null;
    }

    return (
        <div className="agency-analytics-theme w-full min-h-0 max-w-full space-y-4 px-2 py-3 sm:px-4 sm:py-4 md:px-5">
            <div className="grid min-h-[5rem] min-w-0 grid-cols-1 gap-3 lg:grid-cols-[1fr_auto_1fr] lg:items-start">
                <div className="min-h-[4rem] space-y-1 min-w-0">
                    <div className="flex items-center gap-2 text-[16px] leading-tight text-muted-foreground">
                        <span>{rangeLabel}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <h1 className="text-[30px] font-medium leading-tight tracking-[-0.02em] text-[#d0e8df]">{t('crm.crm.analyticsDashboard.аналитика_сети')}</h1>
                        <Badge variant="outline" className="h-auto px-2 py-1 text-[16px] leading-tight text-[#d0e8df]">
                            {periodLabel}
                        </Badge>
                    </div>
                </div>
                <div className="flex justify-center">
                    <AnalyticsNavLinks />
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2 lg:justify-end">
                    <PeriodTabs selectedPeriod={globalPeriod} onPeriodChange={setGlobalPeriod} />
                </div>
            </div>

            <div className="grid min-w-0 gap-4 lg:gap-5 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:items-stretch">
                <div ref={leftColumnRef} className="min-w-0 space-y-4 lg:sticky lg:top-0 self-start">
                    <StaticKpiCards
                        data={globalAnalytics.staticKpi}
                        secondMetric={{ label: t('person-analytics-page.totalObjects'), value: globalAnalytics.staticKpi.totalListings }}
                    />
                    <DynamicKpiCards
                        data={globalAnalytics.dynamicKpi}
                        todayData={todayAnalytics.dynamicKpi}
                        periodLabel={periodLabel}
                    />
                </div>

                <div
                    className="flex min-h-0 min-w-0 flex-col gap-4"
                    style={
                        isDesktopLayout && leftColumnHeight
                            ? { height: `${leftColumnHeight}px` }
                            : undefined
                    }
                >
                    <div className="flex flex-col gap-3 rounded-md border bg-card px-3 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:px-4">
                        <div className="min-w-0 flex-1">
                            <Input
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                                placeholder={t('crm.crm.analyticsDashboard.поиск_менеджера')}
                                className="h-10 text-[16px]"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <Switch id="only-online" checked={onlyOnline} onCheckedChange={setOnlyOnline} />
                            <Label htmlFor="only-online" className="text-[16px] font-normal leading-tight">{t('crm.crm.analyticsDashboard.только_онлайн')}</Label>
                        </div>
                        <div className="flex items-center gap-2">
                            <Switch id="inactive-last7" checked={inactiveLast7} onCheckedChange={setInactiveLast7} />
                            <Label htmlFor="inactive-last7" className="text-[16px] font-normal leading-tight">{t('crm.crm.analyticsDashboard.неактивные_7_дней')}</Label>
                        </div>
                    </div>

                    <LeaderboardTable
                        partners={sortedPartners}
                        maxLeadsAdded={maxLeadsAdded}
                        maxStageChangesCount={maxStageChangesCount}
                        sortColumn={sortColumn}
                        sortDirection={sortDirection}
                        onSortChange={handleSortChange}
                        onResetFilters={handleResetFilters}
                        className="lg:min-h-0 lg:flex-1"
                        showLeadsBySalesStage={false}
                    />
                </div>
            </div>

            <div className="grid min-w-0 gap-4 lg:grid-cols-2">
                <LeadsChart data={leadsData} period={leadsPeriod} onPeriodChange={setLeadsPeriod} />
                <ActivityChart data={activityData} period={activityPeriod} onPeriodChange={setActivityPeriod} />
            </div>

            <div className="grid min-w-0 items-start gap-4 xl:grid-cols-12">
                <ActivityCalendarCard
                    period={globalPeriod}
                    range={range}
                    monthRange={monthRangeForCalendar}
                    monthData={monthCalendarData}
                    allTimeData={allTimeCalendarData}
                    className="xl:col-span-6 h-full"
                />
                <ActivityComposition data={globalAnalytics.dynamicKpi} className="xl:col-span-3 h-full" />
                {(salesFunnel ?? globalAnalytics.funnels?.[0]) && (
                    <ConversionOverviewChart funnel={salesFunnel ?? globalAnalytics.funnels[0]!} className="xl:col-span-3 h-full" />
                )}
            </div>

            <div className="space-y-3">
                <div className="text-center">
                    <p className="text-sm font-medium">{t('crm.crm.analyticsDashboard.активность_менеджеро')}</p>
                    <p className="text-xs text-muted-foreground">{t('crm.crm.analyticsDashboard.топ_по_лидам_и_распр')}</p>
                </div>
                <div className="grid min-w-0 gap-4">
                    <PartnersActivityDistribution
                        partners={engagementPartners}
                        period={engagementPeriod}
                        onPeriodChange={setEngagementPeriod}
                        onSegmentClick={(marker) => setSelectedActivityMarker(marker)}
                    />
                </div>
            </div>

            <FunnelKanban funnels={globalAnalytics.funnels} />

            {selectedActivityMarker !== null && (
                <Dialog
                    open={true}
                    onOpenChange={(isOpen) => {
                        if (!isOpen) setSelectedActivityMarker(null);
                    }}
                >
                    <DialogContent className="max-w-lg sm:max-w-lg">
                        <DialogHeader>
                            <DialogTitle>
                                {selectedActivityMarker === "green"
                                    ? t('crm.analyticsDashboard.activePartners')
                                    : selectedActivityMarker === "yellow"
                                    ? t('crm.analyticsDashboard.middlePartners')
                                    : t('crm.analyticsDashboard.passivePartners')}
                            </DialogTitle>
                            <DialogDescription>
                                {selectedActivityPartners.length} {t('crm.crm.analyticsDashboard.менеджеров_в_этой_гр')}</DialogDescription>
                        </DialogHeader>
                        <div className="mt-2 space-y-3 max-h-[400px] overflow-y-auto">
                            {selectedActivityPartners.map((partner) => (
                                <div key={partner.id} className="flex flex-col gap-2 rounded-md border p-2 sm:flex-row sm:items-center sm:p-1">
                                    <div className="min-w-0 flex-1">
                                        <ParticipantCell partner={partner} />
                                    </div>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="w-full shrink-0 sm:w-auto"
                                        onClick={() => navigate(crmAnalyticsPartnerPath(partner.id))}
                                    >{t('crm.crm.analyticsDashboard.подробнее')}<ArrowRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}

export default function AnalyticsDashboard() {
    const { currentUser } = useAuth();

    if (currentUser?.accountType === "developer") {
        return <DeveloperAnalyticsPage />;
    }

    return <NetworkAnalyticsDashboard />;
}
