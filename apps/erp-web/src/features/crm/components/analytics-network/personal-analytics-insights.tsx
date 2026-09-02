"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AnalyticsPeriod, DynamicKpi, FunnelBoard } from "@/types/analytics";
import { cn } from "@/lib/utils";
import { ConversionOverviewChart } from "./conversion-overview-chart";
import { useI18n } from "@/i18n";

export type PlanTargetsByBucketExport = PlanTargetsByBucket;

interface PersonalAnalyticsInsightsProps {
    dynamicKpi: DynamicKpi;
    funnels: FunnelBoard[];
    period: AnalyticsPeriod;
    allowPlanEditing?: boolean;
    /** Загрузка плана с бэкенда. Если задано, при монтировании вызывается и результат мержится с дефолтом. */
    onLoadPlan?: () => Promise<PlanTargetsByBucket | null>;
    /** Сохранение плана на бэкенд. Если задано, при нажатии «Сохранить» вызывается с новыми целями. */
    onSavePlan?: (targets: PlanTargetsByBucket) => Promise<void>;
    /** Ошибка загрузки плана (показать пользователю при необходимости). */
    planLoadError?: string | null;
    /** Обработчик для просмотра сети */
    onViewNetwork?: () => void;
}

type PlanBucket = "week" | "month";
type PlanMetricKey = "leads" | "contacts" | "deals";
type PlanMetrics = Record<PlanMetricKey, number>;
type PlanTargetsByBucket = Record<PlanBucket, PlanMetrics>;
type PlanInputByBucket = Record<PlanBucket, Record<PlanMetricKey, string>>;

const PLAN_STORAGE_KEY = "analytics.personal.planTargets.v1";

const statusToneByColumn: Record<string, string> = {
    rejection: "bg-blue-500",
    in_progress: "bg-emerald-500",
    preparation: "bg-emerald-500",
    success: "bg-yellow-500",
    active: "bg-emerald-500",
};

const statusHintByColumn: Record<string, string> = {
    rejection: "failure or freeze",
    in_progress: "leads in active work",
    preparation: "leads in preparation",
    success: "final stage",
    active: "leads in active work",
};

const columnOrderPriority: Record<string, number> = {
    rejection: 0,
    in_progress: 1,
    preparation: 1,
    active: 1,
    success: 2,
};

function isExcludedFromTopStage(stageName: string, columnId: string) {
    const normalizedName = stageName.toLowerCase();
    // "Отказ" и "Бракованный лид" (in Russian) / Rejections should be excluded from bottleneck analysis
    return (
        columnId === "rejection" ||
        normalizedName.includes("отказ") ||
        normalizedName.includes("брак") ||
        normalizedName.includes("reject") ||
        normalizedName.includes("junk")
    );
}

const metricLabels: Record<PlanMetricKey, string> = {
    leads: "Новые лиды",
    contacts: "Activities",
    deals: "Сделки",
};

function normalizePlanValue(value: number) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.round(value));
}

function mapPlanTargetsToInputs(targets: PlanTargetsByBucket): PlanInputByBucket {
    return {
        week: {
            leads: String(targets.week.leads),
            contacts: String(targets.week.contacts),
            deals: String(targets.week.deals),
        },
        month: {
            leads: String(targets.month.leads),
            contacts: String(targets.month.contacts),
            deals: String(targets.month.deals),
        },
    };
}

function mapInputsToPlanTargets(inputs: PlanInputByBucket): PlanTargetsByBucket {
    return {
        week: {
            leads: normalizePlanValue(Number(inputs.week.leads || 0)),
            contacts: normalizePlanValue(Number(inputs.week.contacts || 0)),
            deals: normalizePlanValue(Number(inputs.week.deals || 0)),
        },
        month: {
            leads: normalizePlanValue(Number(inputs.month.leads || 0)),
            contacts: normalizePlanValue(Number(inputs.month.contacts || 0)),
            deals: normalizePlanValue(Number(inputs.month.deals || 0)),
        },
    };
}

function buildDefaultPlanTargets(dynamicKpi: DynamicKpi): PlanTargetsByBucket {
    const contacts = dynamicKpi.callClicks + dynamicKpi.chatOpens + dynamicKpi.selectionsCreated;
    const week: PlanMetrics = {
        leads: Math.max(dynamicKpi.addedLeads, 15),
        contacts: Math.max(contacts, 45),
        deals: Math.max(dynamicKpi.deals, 3),
    };

    return {
        week,
        month: {
            leads: Math.max(week.leads * 4, 60),
            contacts: Math.max(week.contacts * 4, 180),
            deals: Math.max(week.deals * 4, 12),
        },
    };
}

function mergePlanTargets(
    baseTargets: PlanTargetsByBucket,
    maybeStored: Partial<Record<PlanBucket, Partial<Record<PlanMetricKey, number>>>>
): PlanTargetsByBucket {
    return {
        week: {
            leads: normalizePlanValue(maybeStored.week?.leads ?? baseTargets.week.leads),
            contacts: normalizePlanValue(maybeStored.week?.contacts ?? baseTargets.week.contacts),
            deals: normalizePlanValue(maybeStored.week?.deals ?? baseTargets.week.deals),
        },
        month: {
            leads: normalizePlanValue(maybeStored.month?.leads ?? baseTargets.month.leads),
            contacts: normalizePlanValue(maybeStored.month?.contacts ?? baseTargets.month.contacts),
            deals: normalizePlanValue(maybeStored.month?.deals ?? baseTargets.month.deals),
        },
    };
}

function getProgressTone(percent: number) {
    if (percent >= 100) return "bg-emerald-500";
    if (percent >= 70) return "bg-amber-500";
    return "bg-rose-500";
}

export function PersonalAnalyticsInsights({
    dynamicKpi,
    funnels,
    period,
    allowPlanEditing = true,
    onLoadPlan,
    onSavePlan,
    planLoadError,
}: PersonalAnalyticsInsightsProps) {
    const { t } = useI18n();
    const salesFunnel = funnels.find((funnel) => funnel.id === "sales") ?? funnels[0];
    const defaultPlanTargets = useMemo(() => buildDefaultPlanTargets(dynamicKpi), [dynamicKpi]);
    const [planTargets, setPlanTargets] = useState<PlanTargetsByBucket>(defaultPlanTargets);
    const [isPlanDialogOpen, setIsPlanDialogOpen] = useState(false);
    const [editBucket, setEditBucket] = useState<PlanBucket>("week");
    const [, setDraftPlanTargets] = useState<PlanTargetsByBucket>(defaultPlanTargets);
    const [draftPlanInputs, setDraftPlanInputs] = useState<PlanInputByBucket>(mapPlanTargetsToInputs(defaultPlanTargets));
    const [isSavingPlan, setIsSavingPlan] = useState(false);

    useEffect(() => {
        setPlanTargets((prev) => mergePlanTargets(defaultPlanTargets, prev));
        setDraftPlanTargets((prev) => mergePlanTargets(defaultPlanTargets, prev));
        setDraftPlanInputs((prev) => mapPlanTargetsToInputs(mapInputsToPlanTargets(prev)));
    }, [defaultPlanTargets]);

    useEffect(() => {
        if (onLoadPlan) {
            onLoadPlan()
                .then((loaded) => {
                    if (loaded) {
                        const merged = mergePlanTargets(defaultPlanTargets, loaded);
                        setPlanTargets(merged);
                        setDraftPlanTargets(merged);
                        setDraftPlanInputs(mapPlanTargetsToInputs(merged));
                        return;
                    }
                    if (allowPlanEditing) {
                        try {
                            const raw = window.localStorage.getItem(PLAN_STORAGE_KEY);
                            if (!raw) return;
                            const parsed = JSON.parse(raw) as Partial<Record<PlanBucket, Partial<Record<PlanMetricKey, number>>>>;
                            const merged = mergePlanTargets(defaultPlanTargets, parsed);
                            setPlanTargets(merged);
                            setDraftPlanTargets(merged);
                            setDraftPlanInputs(mapPlanTargetsToInputs(merged));
                        } catch {
                            // ignore
                        }
                    } else {
                        setPlanTargets(defaultPlanTargets);
                        setDraftPlanTargets(defaultPlanTargets);
                        setDraftPlanInputs(mapPlanTargetsToInputs(defaultPlanTargets));
                    }
                })
                .catch(() => {});
            return;
        }

        if (!allowPlanEditing) {
            setPlanTargets(defaultPlanTargets);
            setDraftPlanTargets(defaultPlanTargets);
            setDraftPlanInputs(mapPlanTargetsToInputs(defaultPlanTargets));
            return;
        }

        try {
            const raw = window.localStorage.getItem(PLAN_STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw) as Partial<Record<PlanBucket, Partial<Record<PlanMetricKey, number>>>>;
            const merged = mergePlanTargets(defaultPlanTargets, parsed);
            setPlanTargets(merged);
            setDraftPlanTargets(merged);
            setDraftPlanInputs(mapPlanTargetsToInputs(merged));
        } catch {
            // ignore localStorage parse issues
        }
    }, [allowPlanEditing, defaultPlanTargets, onLoadPlan]);

    const activePlanBucket: PlanBucket = period === "month" || period === "allTime" ? "month" : "week";
    const activePlan = planTargets[activePlanBucket];
    const factMetrics: PlanMetrics = useMemo(
        () => ({
            leads: dynamicKpi.addedLeads,
            contacts: dynamicKpi.callClicks + dynamicKpi.chatOpens + dynamicKpi.selectionsCreated,
            deals: dynamicKpi.deals,
        }),
        [dynamicKpi]
    );

    const planRows = (Object.keys(metricLabels) as PlanMetricKey[]).map((key) => {
        const plan = activePlan[key];
        const fact = factMetrics[key];
        const percent = plan > 0 ? Math.round((fact / plan) * 100) : 0;
        return {
            key,
            label: metricLabels[key],
            plan,
            fact,
            percent,
        };
    });

    const overallProgressPercent = planRows.length
        ? Math.round(planRows.reduce((sum, row) => sum + row.percent, 0) / planRows.length)
        : 0;
    const planGapRows = planRows.map((row) => ({
        ...row,
        remaining: Math.max(row.plan - row.fact, 0),
        surplus: Math.max(row.fact - row.plan, 0),
    }));
    const completedMetricsCount = planGapRows.filter((row) => row.remaining === 0).length;
    const totalОсталось = planGapRows.reduce((sum, row) => sum + row.remaining, 0);
    const totalПеревыполнение = planGapRows.reduce((sum, row) => sum + row.surplus, 0);

    const columnSegments = [...(salesFunnel?.columns ?? [])].sort((a, b) => {
        const aPriority = columnOrderPriority[a.id] ?? 99;
        const bPriority = columnOrderPriority[b.id] ?? 99;
        if (aPriority !== bPriority) return aPriority - bPriority;
        return b.count - a.count;
    });
    const totalCount = salesFunnel?.totalCount ?? 0;
    const columnRows = columnSegments
        .map((segment) => ({
            id: segment.id,
            name: segment.name,
            count: segment.count,
            share: totalCount > 0 ? Math.round((segment.count / totalCount) * 100) : 0,
        }));
    const averageColumnLoad = columnRows.length > 0 ? Math.round(totalCount / columnRows.length) : 0;
    const topStagesByFunnel = funnels.map((board) => {
        const rows = board.columns
            .flatMap((column) =>
                column.stages.map((stage) => ({
                    id: `${board.id}-${stage.id}`,
                    name: stage.name,
                    count: stage.count,
                    columnId: column.id,
                }))
            )
            .filter((row) => !isExcludedFromTopStage(row.name, row.columnId))
            .sort((a, b) => b.count - a.count)
            .slice(0, 3)
            .map((row) => ({
                ...row,
                share: board.totalCount > 0 ? Math.round((row.count / board.totalCount) * 100) : 0,
            }));
        return {
            boardId: board.id,
            boardName: board.name,
            totalCount: board.totalCount,
            rows,
            maxCount: Math.max(...rows.map((row) => row.count), 1),
        };
    });

    return (
        <div className="grid min-w-0 gap-4 xl:grid-cols-2 xl:items-stretch">
            <Card className="flex h-full min-w-0 flex-col">
                <CardHeader className="pb-2">
                    <div className="space-y-2">
                        <div className="space-y-1 text-center">
                            <CardTitle className="text-lg font-medium sm:text-xl">{t('crm.analytics-network.personal-analytics-insights.план_факт')}</CardTitle>
                            <p className="text-sm text-muted-foreground">
                                {activePlanBucket === "week" ? "План на неделю" : "План на месяц"}
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-end">
                            {planLoadError && (
                                <span className="text-xs text-amber-600 dark:text-amber-400">{planLoadError}</span>
                            )}
                            <span className="rounded-md border bg-muted/30 px-2.5 py-1 text-sm font-medium">
                                {overallProgressPercent}%
                            </span>
                            {allowPlanEditing && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        setDraftPlanTargets(planTargets);
                                        setDraftPlanInputs(mapPlanTargetsToInputs(planTargets));
                                        setEditBucket(activePlanBucket);
                                        setIsPlanDialogOpen(true);
                                    }}
                                >{t('crm.analytics-network.personal-analytics-insights.задать_план')}</Button>
                            )}
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-4 pt-1">
                    <div className="grid gap-3 sm:grid-cols-3">
                        {planRows.map((row) => {
                            const progressWidth = Math.min(Math.max(row.percent, 0), 100);
                            return (
                                <div key={row.key} className="rounded-md border bg-muted/20 p-3">
                                    <p className="text-[13px] text-muted-foreground">{row.label}</p>
                                    <p className="mt-1 break-words text-lg font-medium">
                                        {row.fact.toLocaleString("ru-RU")} / {row.plan.toLocaleString("ru-RU")}
                                    </p>
                                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                                        <div
                                            className={cn("h-full rounded-full transition-all", getProgressTone(row.percent))}
                                            style={{ width: `${progressWidth}%` }}
                                        />
                                    </div>
                                    <p className="mt-1 text-sm text-muted-foreground">{row.percent}%</p>
                                </div>
                            );
                        })}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-md border bg-muted/20 px-3 py-2.5">
                            <p className="text-[13px] text-muted-foreground">{t('crm.analytics-network.personal-analytics-insights.выполнено_показателе')}</p>
                            <p className="text-lg font-medium tabular-nums">
                                {completedMetricsCount}/{planRows.length}
                            </p>
                        </div>
                        <div className="rounded-md border bg-muted/20 px-3 py-2.5">
                            <p className="text-[13px] text-muted-foreground">{t('crm.analytics-network.personal-analytics-insights.осталось')}</p>
                            <p className="text-lg font-medium tabular-nums">{totalОсталось.toLocaleString("ru-RU")}</p>
                        </div>
                        <div className="rounded-md border bg-muted/20 px-3 py-2.5">
                            <p className="text-[13px] text-muted-foreground">{t('crm.analytics-network.personal-analytics-insights.перевыполнение')}</p>
                            <p className="text-lg font-medium tabular-nums">{totalПеревыполнение.toLocaleString("ru-RU")}</p>
                        </div>
                    </div>

                    <div className="space-y-2 rounded-md border bg-muted/15 px-3 py-3">
                        <p className="text-sm text-muted-foreground">{t('crm.analytics-network.personal-analytics-insights.до_выполнения_плана')}</p>
                        {planGapRows.map((row) => (
                            <div key={`${row.key}-gap`} className="flex items-center justify-between gap-2 text-sm">
                                <span className="min-w-0 text-muted-foreground">{row.label}</span>
                                {row.remaining > 0 ? (
                                    <span className="font-medium text-amber-600">+{row.remaining.toLocaleString("ru-RU")}</span>
                                ) : (
                                    <span className="font-medium text-emerald-600">{t('crm.analytics-network.personal-analytics-insights.выполнено')}</span>
                                )}
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            <ConversionOverviewChart funnel={salesFunnel} className="h-full" />

            {allowPlanEditing && (
                <Dialog open={isPlanDialogOpen} onOpenChange={setIsPlanDialogOpen}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>{t('crm.analytics-network.personal-analytics-insights.задать_план')}</DialogTitle>
                            <DialogDescription>{t('crm.analytics-network.personal-analytics-insights.задайте_цели_на_неде')}</DialogDescription>
                        </DialogHeader>

                        <Tabs value={editBucket} onValueChange={(v) => setEditBucket(v as PlanBucket)}>
                            <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="week">{t('crm.analytics-network.personal-analytics-insights.неделя')}</TabsTrigger>
                                <TabsTrigger value="month">{t('crm.analytics-network.personal-analytics-insights.месяц')}</TabsTrigger>
                            </TabsList>
                            {(["week", "month"] as PlanBucket[]).map((bucket) => (
                                <TabsContent key={bucket} value={bucket} className="space-y-3 pt-3">
                                    {(Object.keys(metricLabels) as PlanMetricKey[]).map((key) => (
                                        <div key={`${bucket}-${key}`} className="space-y-1.5">
                                            <Label htmlFor={`${bucket}-${key}`}>{metricLabels[key]}</Label>
                                            <Input
                                                id={`${bucket}-${key}`}
                                                type="number"
                                                min={0}
                                                value={draftPlanInputs[bucket][key]}
                                                onChange={(e) => {
                                                    const raw = e.target.value;
                                                    if (!/^\d*$/.test(raw)) return;
                                                    setDraftPlanInputs((prev) => ({
                                                        ...prev,
                                                        [bucket]: {
                                                            ...prev[bucket],
                                                            [key]: raw,
                                                        },
                                                    }));
                                                }}
                                                onBlur={() => {
                                                    const normalized = normalizePlanValue(
                                                        Number(draftPlanInputs[bucket][key] || 0)
                                                    );
                                                    setDraftPlanTargets((prev) => ({
                                                        ...prev,
                                                        [bucket]: {
                                                            ...prev[bucket],
                                                            [key]: normalized,
                                                        },
                                                    }));
                                                    setDraftPlanInputs((prev) => ({
                                                        ...prev,
                                                        [bucket]: {
                                                            ...prev[bucket],
                                                            [key]: String(normalized),
                                                        },
                                                    }));
                                                }}
                                            />
                                        </div>
                                    ))}
                                </TabsContent>
                            ))}
                        </Tabs>

                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsPlanDialogOpen(false)} disabled={isSavingPlan}>{t('crm.analytics-network.personal-analytics-insights.отмена')}</Button>
                            <Button
                                disabled={isSavingPlan}
                                onClick={async () => {
                                    const normalizedTargets = mapInputsToPlanTargets(draftPlanInputs);
                                    setDraftPlanTargets(normalizedTargets);
                                    setDraftPlanInputs(mapPlanTargetsToInputs(normalizedTargets));
                                    setPlanTargets(normalizedTargets);
                                    try {
                                        if (onSavePlan) {
                                            setIsSavingPlan(true);
                                            await onSavePlan(normalizedTargets);
                                        }
                                        window.localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(normalizedTargets));
                                    } catch {
                                        // state already updated; caller may show planLoadError
                                    } finally {
                                        setIsSavingPlan(false);
                                    }
                                    setIsPlanDialogOpen(false);
                                }}
                            >
                                {isSavingPlan ? "Сохранение..." : "Save"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}

            <Card className="xl:col-span-2">
                <CardHeader className="pb-2">
                    <CardTitle className="text-center text-base font-medium sm:text-lg">{t('crm.analytics-network.personal-analytics-insights.распределение_лидов')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-1">
                    {totalCount > 0 && (
                        <div className="space-y-2">
                            <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                                {columnSegments.map((segment) => {
                                    const width = Math.max(3, (segment.count / totalCount) * 100);
                                    return (
                                        <div
                                            key={segment.id}
                                            className={cn(statusToneByColumn[segment.id] ?? "bg-primary")}
                                            style={{ width: `${width}%` }}
                                            title={`${segment.name}: ${segment.count.toLocaleString("ru-RU")}`}
                                        />
                                    );
                                })}
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                                {t('crm.analytics-network.personal-analytics-insights.всего_лидов_в_воронк')}{totalCount.toLocaleString("ru-RU")}
                            </p>
                        </div>
                    )}

                    <div className="grid gap-2 sm:grid-cols-3">
                        {columnRows.map((row) => (
                            <div key={row.id} className="rounded-md border bg-muted/20 px-3 py-2">
                                <div className="flex min-w-0 items-start justify-between gap-2">
                                    <div className="flex min-w-0 items-start gap-2">
                                        <span className={cn("h-2 w-2 shrink-0 rounded-full", statusToneByColumn[row.id] ?? "bg-primary")} />
                                        <span className="min-w-0 break-words text-xs leading-tight text-foreground">{row.name}</span>
                                    </div>
                                    <span className="shrink-0 text-xs font-medium tabular-nums">{row.share}%</span>
                                </div>
                                <p className="mt-1 text-[11px] text-muted-foreground">
                                    {row.count.toLocaleString("ru-RU")} {t('crm.analytics-network.personal-analytics-insights.лидов')}{statusHintByColumn[row.id] ?? "этап воронки"}
                                </p>
                            </div>
                        ))}
                    </div>

                    {topStagesByFunnel.some((group) => group.rows.length > 0) && (
                        <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                                <p className="min-w-0 text-xs text-muted-foreground">
                                    Top 3 stages where leads get stuck
                                </p>
                                <p className="text-[11px] text-muted-foreground sm:text-right">
                                    longer bar means higher lead count in this stage
                                </p>
                            </div>
                            <div className="grid gap-2 lg:grid-cols-2">
                                {topStagesByFunnel.map((group) => (
                                    <div key={group.boardId} className="min-w-0 space-y-2 rounded-md border bg-background/70 p-2.5">
                                        <div className="flex min-w-0 items-start justify-between gap-2">
                                            <p className="min-w-0 break-words text-xs font-medium leading-tight">{group.boardName}</p>
                                            <p className="shrink-0 text-[11px] text-muted-foreground">
                                                {group.totalCount.toLocaleString("ru-RU")} leads
                                            </p>
                                        </div>
                                        {group.rows.length > 0 ? (
                                            group.rows.map((row, index) => {
                                                const width = Math.max(10, (row.count / group.maxCount) * 100);
                                                return (
                                                    <div key={row.id} className="space-y-1.5">
                                                        <div className="flex min-w-0 flex-col gap-0.5 text-xs sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                                                            <span className="min-w-0 break-words text-muted-foreground">
                                                                {index + 1}. {row.name}
                                                            </span>
                                                            <span className="shrink-0 font-medium tabular-nums sm:text-right">
                                                                {row.count.toLocaleString("ru-RU")} ({row.share}%)
                                                            </span>
                                                        </div>
                                                        <div className="h-1.5 rounded-full bg-muted">
                                                            <div
                                                                className={cn(
                                                                    "h-full rounded-full",
                                                                    statusToneByColumn[row.columnId] ?? "bg-primary"
                                                                )}
                                                                style={{ width: `${width}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <p className="text-xs text-muted-foreground">
                                                No stage data
                                            </p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {columnRows.length > 0 && (
                        <div className="space-y-2 rounded-lg border bg-muted/25 p-3">
                            <div className="grid gap-2 sm:grid-cols-2">
                                <div className="rounded-md border bg-background/70 px-3 py-2.5">
                                    <p className="text-xs text-muted-foreground">
                                        <HintLabel
                                            label="Funnel Columns"
                                            hint="Number of main stages in the active funnel"
                                        />
                                    </p>
                                    <p className="text-lg font-medium tabular-nums">{columnRows.length}</p>
                                </div>
                                <div className="rounded-md border bg-background/70 px-3 py-2.5">
                                    <p className="text-xs text-muted-foreground">
                                        <HintLabel
                                            label="Average Load per Column"
                                            hint="Average number of leads per stage"
                                        />
                                    </p>
                                    <p className="text-lg font-medium tabular-nums">{averageColumnLoad.toLocaleString("ru-RU")}</p>
                                </div>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function HintLabel({ label, hint }: { label: string; hint: string }) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span
                    className="cursor-help decoration-dotted underline underline-offset-2 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    tabIndex={0}
                >
                    {label}
                </span>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={6} className="max-w-[260px] text-center leading-relaxed">
                {hint}
            </TooltipContent>
        </Tooltip>
    );
}
