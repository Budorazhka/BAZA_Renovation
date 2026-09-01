import { MOCK_EMPLOYEES, type Employee } from "@/data/personnel-mock";
import { MOCK_KPI } from "@/data/team-kpi-mock";
import { getAnalyticsData } from "@/lib/mock/analytics-network";
import type {
    ActivityTimeseriesPoint,
    AnalyticsPeriod,
    DynamicKpi,
    FunnelBoard,
    PartnerRow,
    StaticKpi,
} from "@/types/analytics";

export type TeamBranchFilter = "all" | "msk" | "spb";

export interface ManagerAnalyticsData {
    period: AnalyticsPeriod;
    periodLabel: string;
    branchLabel: string;
    staticKpi: StaticKpi;
    dynamicKpi: DynamicKpi;
    leadsTimeseries: { date: string; leads: number }[];
    activityTimeseries: ActivityTimeseriesPoint[];
    funnels: FunnelBoard[];
    managers: PartnerRow[];
    maxLeadsAdded: number;
    maxStageChangesCount: number;
    summary: {
        managersCount: number;
        activeManagersCount: number;
        riskManagersCount: number;
        avgOnlineDaysLast7: number;
        avgPlanPercent: number;
        revenueMillions: number;
    };
}

const BRANCH_LABELS: Record<TeamBranchFilter, string> = {
    all: "Вся команда",
    msk: "Москва и МО",
    spb: "Санкт-Петербург",
};

function getBranchForEmployee(employee: Employee): TeamBranchFilter | "all" {
    if (employee.role === "director") return "all";
    if (employee.id === "emp-rop-spb" || employee.managerId === "emp-rop-spb") return "spb";
    return "msk";
}

function getEmployeesByBranch(branch: TeamBranchFilter) {
    return MOCK_EMPLOYEES.filter((employee) => {
        if (employee.role === "owner") return false;
        const employeeBranch = getBranchForEmployee(employee);
        return branch === "all" || employeeBranch === branch || employee.role === "director";
    });
}

function getPeriodFactor(period: AnalyticsPeriod) {
    if (period === "week") return 0.28;
    if (period === "allTime") return 8.4;
    return 1;
}

function periodValue(value: number, period: AnalyticsPeriod) {
    return Math.max(0, Math.round(value * getPeriodFactor(period)));
}

function getDirectReportsCount(employeeId: string) {
    return MOCK_EMPLOYEES.filter((employee) => employee.managerId === employeeId).length;
}

function getAvatarUrl(employee: Employee) {
    if (employee.avatarUrl) return employee.avatarUrl;
    const name = encodeURIComponent(employee.name);
    return `https://ui-avatars.com/api/?name=${name}&background=14532d&color=ffffff&size=128&font-size=0.45&bold=true&format=svg`;
}

function buildManagerRow(employee: Employee, source: PartnerRow, period: AnalyticsPeriod, index: number): PartnerRow {
    const kpi = MOCK_KPI[employee.id] ?? {
        leadsMonth: 0,
        dealsMonth: 0,
        revenue: 0,
        plan: 0,
        activeTasks: 0,
    };
    const roleFactor = employee.role === "director" ? 1.25 : employee.role === "rop" ? 1.12 : 1;
    const variance = 0.92 + (index % 5) * 0.04;
    const leadsAdded = Math.max(0, Math.round(periodValue(kpi.leadsMonth, period) * roleFactor * variance));
    const deals = Math.max(0, Math.round(periodValue(kpi.dealsMonth, period) * roleFactor));
    const callClicks = Math.max(0, Math.round((leadsAdded * 8 + kpi.activeTasks * 5 + source.callClicks * 0.08) * roleFactor));
    const chatOpens = Math.max(0, Math.round((leadsAdded * 4 + kpi.activeTasks * 3 + source.chatOpens * 0.07) * roleFactor));
    const selectionsCreated = Math.max(0, Math.round((leadsAdded * 1.35 + deals * 3 + source.selectionsCreated * 0.08) * roleFactor));
    const stageChangesCount = Math.max(0, Math.round(leadsAdded * 1.7 + deals * 5 + kpi.activeTasks * 0.7));
    const periodRevenueMillions = Math.round((kpi.revenue / 1_000_000) * getPeriodFactor(period) * 10) / 10;

    return {
        id: employee.id,
        avatarUrl: getAvatarUrl(employee),
        name: employee.name,
        isOnline: source.isOnline,
        lastSeenMinutesAgo: source.lastSeenMinutesAgo,
        activityMarker: source.activityMarker,
        platformMinutesToday: source.platformMinutesToday,
        crmMinutesToday: source.crmMinutesToday,
        level1Count: getDirectReportsCount(employee.id),
        level2Count: kpi.activeTasks,
        leadsAdded,
        callClicks,
        chatOpens,
        selectionsCreated,
        activityTotal: callClicks + chatOpens + selectionsCreated,
        stageChangesCount,
        onlineDaysLast7: source.onlineDaysLast7,
        onlineWeekMarkers: source.onlineWeekMarkers,
        commissionUsd: periodRevenueMillions,
    };
}

function scaleLeadsSeries(rows: { date: string; leads: number }[], ratio: number) {
    return rows.map((row) => ({
        ...row,
        leads: Math.max(0, Math.round(row.leads * ratio)),
    }));
}

function scaleActivitySeries(rows: ActivityTimeseriesPoint[], ratios: { calls: number; chats: number; selections: number }) {
    return rows.map((row) => ({
        ...row,
        calls: Math.max(0, Math.round(row.calls * ratios.calls)),
        chats: Math.max(0, Math.round(row.chats * ratios.chats)),
        selections: Math.max(0, Math.round(row.selections * ratios.selections)),
    }));
}

function scaleFunnel(board: FunnelBoard, ratio: number): FunnelBoard {
    const normalizeText = (value: string) =>
        value
            .replace(/Сеть/g, "Команда")
            .replace(/сеть/g, "команда")
            .replace(/партнёр/g, "менеджер")
            .replace(/Партнёр/g, "Менеджер")
            .replace(/партнер/g, "менеджер")
            .replace(/Партнер/g, "Менеджер");
    const columns = board.columns.map((column) => {
        const stages = column.stages.map((stage) => ({
            ...stage,
            name: normalizeText(stage.name),
            count: Math.max(0, Math.round(stage.count * ratio)),
        }));
        return {
            ...column,
            name: normalizeText(column.name),
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
        name: normalizeText(board.name),
        shortName: normalizeText(board.shortName),
        totalCount,
        activeCount: Math.max(0, totalCount - rejectionCount - closedCount),
        rejectionCount,
        closedCount,
        columns,
    };
}

function sumDynamicKpi(managers: PartnerRow[]): DynamicKpi {
    const leads = managers.reduce((sum, manager) => sum + manager.leadsAdded, 0);
    const calls = managers.reduce((sum, manager) => sum + manager.callClicks, 0);
    const chats = managers.reduce((sum, manager) => sum + manager.chatOpens, 0);
    const selections = managers.reduce((sum, manager) => sum + manager.selectionsCreated, 0);
    const stageChanges = managers.reduce((sum, manager) => sum + manager.stageChangesCount, 0);
    const deals = Math.max(0, Math.round(stageChanges / 9));

    return {
        addedListings: Math.max(0, Math.round(leads * 0.58)),
        addedLevel1Referrals: managers.filter((manager) => manager.level1Count > 0).length,
        addedLevel2Referrals: managers.reduce((sum, manager) => sum + manager.level1Count, 0),
        addedLeads: leads,
        callClicks: calls,
        chatOpens: chats,
        selectionsCreated: selections,
        deals,
    };
}

export function getManagerAnalyticsData(
    period: AnalyticsPeriod,
    branchFilter: TeamBranchFilter = "all"
): ManagerAnalyticsData {
    const source = getAnalyticsData(period);
    const employees = getEmployeesByBranch(branchFilter);
    const managers = employees.map((employee, index) =>
        buildManagerRow(employee, source.partners[index % source.partners.length], period, index)
    );
    const dynamicKpi = sumDynamicKpi(managers);
    const revenueMillions = managers.reduce((sum, manager) => sum + manager.commissionUsd, 0);
    const planValues = employees.map((employee) => MOCK_KPI[employee.id]?.plan ?? 0);
    const avgPlanPercent = planValues.length
        ? Math.round(planValues.reduce((sum, value) => sum + value, 0) / planValues.length)
        : 0;
    const staticKpi: StaticKpi = {
        level1Referrals: managers.length,
        totalListings: managers.reduce((sum, manager) => sum + manager.level2Count, 0),
        totalLeads: dynamicKpi.addedLeads,
        totalDeals: dynamicKpi.deals,
    };
    const leadsRatio = source.dynamicKpi.addedLeads > 0 ? dynamicKpi.addedLeads / source.dynamicKpi.addedLeads : 1;
    const activityRatios = {
        calls: source.dynamicKpi.callClicks > 0 ? dynamicKpi.callClicks / source.dynamicKpi.callClicks : 1,
        chats: source.dynamicKpi.chatOpens > 0 ? dynamicKpi.chatOpens / source.dynamicKpi.chatOpens : 1,
        selections:
            source.dynamicKpi.selectionsCreated > 0
                ? dynamicKpi.selectionsCreated / source.dynamicKpi.selectionsCreated
                : 1,
    };

    return {
        period,
        periodLabel: source.periodLabel,
        branchLabel: BRANCH_LABELS[branchFilter],
        staticKpi,
        dynamicKpi,
        leadsTimeseries: scaleLeadsSeries(source.leadsTimeseries, leadsRatio),
        activityTimeseries: scaleActivitySeries(source.activityTimeseries, activityRatios),
        funnels: source.funnels.map((funnel) => scaleFunnel(funnel, leadsRatio)),
        managers,
        maxLeadsAdded: Math.max(...managers.map((manager) => manager.leadsAdded), 1),
        maxStageChangesCount: Math.max(...managers.map((manager) => manager.stageChangesCount), 1),
        summary: {
            managersCount: managers.length,
            activeManagersCount: managers.filter((manager) => manager.activityMarker === "green").length,
            riskManagersCount: managers.filter((manager) => manager.onlineDaysLast7 === 0 || manager.activityMarker === "red").length,
            avgOnlineDaysLast7: managers.length
                ? Math.round((managers.reduce((sum, manager) => sum + manager.onlineDaysLast7, 0) / managers.length) * 10) / 10
                : 0,
            avgPlanPercent,
            revenueMillions: Math.round(revenueMillions * 10) / 10,
        },
    };
}
