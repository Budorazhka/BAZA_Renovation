"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ActivityTimeseriesPoint, AnalyticsPeriod } from "@/types/analytics";
import { useI18n } from "@/i18n";

type CalendarEntry = {
    key: string;
    labelShort: string;
    labelLong: string;
    dateNumber?: number;
    total: number;
    calls: number;
    chats: number;
    selections: number;
    inSelectedRange?: boolean;
    isFuture?: boolean;
};

interface ActivityCalendarCardProps {
    period: AnalyticsPeriod;
    range: { start: Date; end: Date };
    monthRange: { start: Date; end: Date };
    monthData: ActivityTimeseriesPoint[];
    allTimeData: ActivityTimeseriesPoint[];
    className?: string;
    highContrast?: boolean;
    /** Режим данных:
     *  - "activity" — количество действий (звонки/чаты/рассылки)
     *  - "onlinePresence" — минуты онлайн-присутствия за день
     */
    mode?: "activity" | "onlinePresence";
    /** По дням (YYYY-MM-DD) активность для модалки: звонки/чаты/рассылки. В режиме onlinePresence подставляется в модалку вместо нулей. */
    activityByDate?: Record<string, { calls: number; chats: number; selections: number }>;
}

function getDayIndexFromMonday(date: Date) {
    const day = date.getDay();
    return day === 0 ? 6 : day - 1;
}

/** Форматирует минуты в "N час N минут" (часы только если > 0) */
function formatMinutesAsHoursMinutes(totalMinutes: number): string {
    if (totalMinutes <= 0) return "0 мин.";
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const parts: string[] = [];
    if (hours > 0) {
        parts.push(`${hours} ч.`);
    }
    if (minutes > 0) {
        parts.push(`${minutes} мин.`);
    }
    return parts.length > 0 ? parts.join(" ") : "0 мин.";
}

function getTrafficTone(total: number, mode: "activity" | "onlinePresence") {
    if (mode === "onlinePresence") {
        if (total <= 5) {
            return {
                label: "Нет присутствия",
                className:
                    "bg-rose-100/80 border-rose-300 text-rose-900 hover:bg-rose-100 dark:bg-rose-500/15 dark:border-rose-500/40 dark:text-rose-200",
            };
        }

        if (total > 5 && total < 20) {
            return {
                label: "Слабое присутствие",
                className:
                    "bg-amber-100/80 border-amber-300 text-amber-900 hover:bg-amber-100 dark:bg-amber-500/15 dark:border-amber-500/40 dark:text-amber-200",
            };
        }

        return {
            label: "Активное присутствие",
            className:
                "bg-emerald-100/80 border-emerald-300 text-emerald-900 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:border-emerald-500/40 dark:text-emerald-200",
        };
    }

    if (total === 0) {
        return {
            label: "Нет активности",
            className:
                "bg-rose-100/80 border-rose-300 text-rose-900 hover:bg-rose-100 dark:bg-rose-500/15 dark:border-rose-500/40 dark:text-rose-200",
        };
    }

    if (total < 5) {
        return {
            label: "Слабая активность",
            className:
                "bg-amber-100/80 border-amber-300 text-amber-900 hover:bg-amber-100 dark:bg-amber-500/15 dark:border-amber-500/40 dark:text-amber-200",
        };
    }

    return {
        label: "Активный день",
        className:
            "bg-emerald-100/80 border-emerald-300 text-emerald-900 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:border-emerald-500/40 dark:text-emerald-200",
    };
}

function normalizeDate(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Ключ даты в локальной таймзоне YYYY-MM-DD для сопоставления с API */
function toLocalDateKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function buildMonthEntries(
    range: { start: Date; end: Date },
    monthData: ActivityTimeseriesPoint[],
    selectedRange: { start: Date; end: Date } | null
) {
    const monthStart = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
    const monthEnd = new Date(range.start.getFullYear(), range.start.getMonth() + 1, 0);
    const selectedStart = selectedRange ? normalizeDate(selectedRange.start) : null;
    const selectedEnd = selectedRange ? normalizeDate(selectedRange.end) : null;

    const today = normalizeDate(new Date());
    const entries: CalendarEntry[] = [];
    let dayIndex = 0;
    const cursor = new Date(monthStart);
    while (cursor <= monthEnd) {
        const cursorDate = normalizeDate(cursor);
        const isFuture = cursorDate.getTime() > today.getTime();
        const point = monthData[dayIndex];
        const calls = isFuture ? 0 : point?.calls ?? 0;
        const chats = isFuture ? 0 : point?.chats ?? 0;
        const selections = isFuture ? 0 : point?.selections ?? 0;
        const total = calls + chats + selections;

        entries.push({
            key: toLocalDateKey(cursor),
            labelShort: cursor.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }),
            labelLong: cursor.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" }),
            dateNumber: cursor.getDate(),
            total,
            calls,
            chats,
            selections,
            isFuture,
            inSelectedRange: Boolean(
                selectedStart &&
                    selectedEnd &&
                    cursorDate.getTime() >= selectedStart.getTime() &&
                    cursorDate.getTime() <= selectedEnd.getTime()
            ),
        });

        cursor.setDate(cursor.getDate() + 1);
        dayIndex += 1;
    }

    return entries;
}

function buildAllTimeEntries(allTimeData: ActivityTimeseriesPoint[]) {
    return allTimeData.slice(-12).map((point, index) => ({
        key: `month-${index}`,
        labelShort: point.date,
        labelLong: point.date,
        total: point.calls + point.chats + point.selections,
        calls: point.calls,
        chats: point.chats,
        selections: point.selections,
        isFuture: false,
    }));
}

export function ActivityCalendarCard({
    period,
    range,
    monthRange,
    monthData,
    allTimeData,
    className,
    highContrast = false,
    mode = "activity",
    activityByDate,
}: ActivityCalendarCardProps) {
    const { t } = useI18n();
    const [selectedEntryKey, setSelectedEntryKey] = useState<string | null>(null);
    const [isDrilldownOpen, setIsDrilldownOpen] = useState(false);

    const monthEntries = useMemo(
        () => buildMonthEntries(monthRange, monthData, period === "week" ? range : null),
        [monthRange, monthData, period, range]
    );
    const allTimeEntries = useMemo(() => buildAllTimeEntries(allTimeData), [allTimeData]);
    const entries = period === "allTime" ? allTimeEntries : monthEntries;

    const monthStart = useMemo(
        () => new Date(monthRange.start.getFullYear(), monthRange.start.getMonth(), 1),
        [monthRange]
    );
    const dayOffset = useMemo(() => getDayIndexFromMonday(monthStart), [monthStart]);

    useEffect(() => {
        setSelectedEntryKey(entries[0]?.key ?? null);
    }, [entries]);

    const selectedEntry = entries.find((entry) => entry.key === selectedEntryKey) ?? entries[0] ?? null;
    const weekDayLabels = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

    const caption = useMemo(() => {
        if (period === "allTime") {
            return mode === "onlinePresence"
                ? "Присутствие онлайн за 12 месяцев"
                : "Последние 12 месяцев";
        }
        const monthLabel = monthStart.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
        if (period === "week") {
            const start = range.start.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
            const end = range.end.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
            const prefix =
                mode === "onlinePresence"
                    ? "Онлайн за неделю"
                    : "Неделя";
            return `${monthLabel} · ${prefix} ${start} - ${end}`;
        }
        if (mode === "onlinePresence") {
            return `Присутствие онлайн: ${monthLabel}`;
        }
        return monthLabel;
    }, [period, monthStart, range, mode]);

    const openDrilldown = (entryKey: string) => {
        const entry = monthEntries.find((item) => item.key === entryKey) ?? allTimeEntries.find((item) => item.key === entryKey);
        if (entry?.isFuture) return;
        setSelectedEntryKey(entryKey);
        setIsDrilldownOpen(true);
    };
    const weekStartKey = period === "week" ? toLocalDateKey(normalizeDate(range.start)) : null;
    const weekEndKey = period === "week" ? toLocalDateKey(normalizeDate(range.end)) : null;

    return (
        <Card className={cn(className)}>
            <CardHeader className="pb-2">
                <div className="flex flex-col items-center gap-1 text-center">
                    <CardTitle className={cn("text-center text-xl font-medium", highContrast && "text-2xl")}>{t('crm.analytics-network.activity-calendar-card.календарь_активности')}</CardTitle>
                    <span className={cn("text-base text-muted-foreground", highContrast && "text-lg text-foreground/80")}>{caption}</span>
                </div>
            </CardHeader>
            <CardContent className="space-y-3 px-2 pt-1 sm:px-6">
                {period !== "allTime" ? (
                    <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
                        {weekDayLabels.map((dayLabel) => (
                            <div key={dayLabel} className={cn("pb-0.5 text-center text-base font-medium text-muted-foreground sm:pb-1", highContrast && "sm:text-lg sm:text-foreground/75")}>
                                {dayLabel}
                            </div>
                        ))}

                        {Array.from({ length: dayOffset }).map((_, index) => (
                            <div key={`empty-${index}`} className="h-14 rounded-md border border-dashed border-border/40 sm:h-20" />
                        ))}

                        {monthEntries.map((entry) => {
                            const tone = getTrafficTone(entry.total, mode);
                            const isActive = selectedEntry?.key === entry.key;
                            const isWeekStart = weekStartKey === entry.key;
                            const isWeekEnd = weekEndKey === entry.key;

                            return (
                                <button
                                    key={entry.key}
                                    type="button"
                                    onClick={() => openDrilldown(entry.key)}
                                    className={cn(
                                        "h-20 min-w-0 overflow-hidden rounded-md border px-1.5 py-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-24 sm:p-2",
                                        entry.isFuture
                                            ? "bg-muted/20 border-border/60 text-muted-foreground hover:bg-muted/30"
                                            : tone.className,
                                        entry.inSelectedRange &&
                                            "border-primary ring-2 ring-primary/45 shadow-[0_0_0_1px_rgba(59,130,246,0.28)_inset]",
                                        isWeekStart && "ring-primary",
                                        isWeekEnd && "ring-primary",
                                        isActive && "ring-2 ring-primary",
                                        entry.isFuture && "cursor-not-allowed opacity-70"
                                    )}
                                    title={
                                        entry.isFuture
                                            ? `Будущий день: ${entry.labelLong}`
                                            : mode === "onlinePresence"
                                            ? `${entry.labelLong} · Онлайн: ${entry.total} мин.`
                                            : `${entry.labelLong} · Активность: ${entry.total} действий`
                                    }
                                >
                                    <div className="flex min-w-0 items-center justify-between gap-1">
                                        <span className={cn("shrink-0 text-lg font-medium leading-none sm:text-xl", highContrast && "sm:text-xl sm:font-normal")}>{entry.dateNumber}</span>
                                        <span className={cn("min-w-0 truncate text-base font-medium", highContrast && "sm:text-base sm:font-normal")}>{entry.total}</span>
                                    </div>
                                    <p className={cn("mt-1 hidden min-h-0 overflow-hidden text-base leading-tight line-clamp-2 sm:block", highContrast && "sm:text-base sm:font-medium")}>
                                        {entry.isFuture ? "Будущий день" : tone.label}
                                    </p>
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                        {allTimeEntries.map((entry) => {
                            const tone = getTrafficTone(entry.total, mode);
                            const isActive = selectedEntry?.key === entry.key;
                            return (
                                <button
                                    key={entry.key}
                                    type="button"
                                    onClick={() => openDrilldown(entry.key)}
                                    className={cn(
                                        "h-20 rounded-md border p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                        tone.className,
                                        isActive && "ring-2 ring-primary"
                                    )}
                                >
                                    <p className={cn("break-words text-base font-medium", highContrast && "text-lg text-foreground/90")}>{entry.labelShort}</p>
                                    <p className={cn("mt-1 text-lg font-medium", highContrast && "text-xl font-normal")}>{entry.total.toLocaleString("ru-RU")}</p>
                                </button>
                            );
                        })}
                    </div>
                )}

                <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-base text-foreground", highContrast && "sm:text-lg sm:text-foreground/75")}>
                    {period === "week" && (
                        <span className="inline-flex items-center gap-1.5">
                            <span className="h-2.5 w-2.5 rounded-sm border border-primary/70 bg-primary/20" />{t('crm.analytics-network.activity-calendar-card.выбранная_неделя')}</span>
                    )}
                    <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-rose-500" />
                        {mode === "onlinePresence" ? "Нет присутствия" : "Нет активности"}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-amber-500" />
                        {mode === "onlinePresence" ? "Слабое присутствие" : "1–4 действия"}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        {mode === "onlinePresence" ? "Активное присутствие" : "5+ действий"}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <span className="h-2 w-2 rounded-full bg-muted-foreground/60" />{t('crm.analytics-network.activity-calendar-card.будущие_дни')}</span>
                </div>

                {selectedEntry && (() => {
                    const activity = activityByDate?.[selectedEntry.key];
                    const showCalls = activity?.calls ?? (mode === "onlinePresence" ? 0 : selectedEntry.calls);
                    const showChats = activity?.chats ?? (mode === "onlinePresence" ? 0 : selectedEntry.chats);
                    const showSelections = activity?.selections ?? (mode === "onlinePresence" ? 0 : selectedEntry.selections);
                    return (
                        <div className="rounded-lg border bg-muted/30 p-2.5">
                            <p className={cn("text-base font-medium", highContrast && "text-lg")}>{selectedEntry.labelLong}</p>
                            {mode === "onlinePresence" ? (
                                <div className={cn("mt-1 flex flex-wrap items-center gap-3 text-base text-muted-foreground", highContrast && "text-lg text-foreground/75")}>
                                    <span>{t('crm.analytics-network.activity-calendar-card.онлайн')}{selectedEntry.total.toLocaleString("ru-RU")} {t('crm.analytics-network.activity-calendar-card.мин')}</span>
                                    <span>{t('crm.analytics-network.activity-calendar-card.звонки')}{showCalls.toLocaleString("ru-RU")}</span>
                                    <span>{t('crm.analytics-network.activity-calendar-card.чаты')}{showChats.toLocaleString("ru-RU")}</span>
                                    <span>{t('crm.analytics-network.activity-calendar-card.подборки')}{showSelections.toLocaleString("ru-RU")}</span>
                                </div>
                            ) : (
                                <div className={cn("mt-1 flex flex-wrap items-center gap-3 text-base text-muted-foreground", highContrast && "text-lg text-foreground/75")}>
                                    <span>{t('crm.analytics-network.activity-calendar-card.всего')}{(showCalls + showChats + showSelections).toLocaleString("ru-RU")}</span>
                                    <span>{t('crm.analytics-network.activity-calendar-card.звонки')}{showCalls.toLocaleString("ru-RU")}</span>
                                    <span>{t('crm.analytics-network.activity-calendar-card.чаты')}{showChats.toLocaleString("ru-RU")}</span>
                                    <span>{t('crm.analytics-network.activity-calendar-card.подборки')}{showSelections.toLocaleString("ru-RU")}</span>
                                </div>
                            )}
                        </div>
                    );
                })()}
            </CardContent>

            <Dialog open={isDrilldownOpen} onOpenChange={setIsDrilldownOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>
                            {selectedEntry
                                ? `Структура активности: ${selectedEntry.labelLong}`
                                : "Структура активности"}
                        </DialogTitle>
                        <DialogDescription>
                            {selectedEntry
                                ? (() => {
                                    const activity = activityByDate?.[selectedEntry.key];
                                    const calls = activity?.calls ?? selectedEntry.calls;
                                    const chats = activity?.chats ?? selectedEntry.chats;
                                    const selections = activity?.selections ?? selectedEntry.selections;
                                    const totalActivities = calls + chats + selections;
                                    const onlineStr = mode === "onlinePresence"
                                        ? `Онлайн: ${formatMinutesAsHoursMinutes(selectedEntry.total)}. `
                                        : "";
                                    return `${onlineStr}Всего действий: ${totalActivities.toLocaleString("ru-RU")}`;
                                })()
                                : "Выберите день или месяц на календаре"}
                        </DialogDescription>
                    </DialogHeader>

                    {selectedEntry ? (() => {
                        const activity = activityByDate?.[selectedEntry.key];
                        const calls = activity?.calls ?? (mode === "onlinePresence" ? 0 : selectedEntry.calls);
                        const chats = activity?.chats ?? (mode === "onlinePresence" ? 0 : selectedEntry.chats);
                        const selections = activity?.selections ?? (mode === "onlinePresence" ? 0 : selectedEntry.selections);
                        const totalActivities = calls + chats + selections;
                        return (
                            <>
                                {mode === "onlinePresence" && (
                                    <div className="rounded-md border bg-muted/20 p-3">
                                        <p className="text-xs text-foreground">{t('crm.analytics-network.activity-calendar-card.время_онлайн')}</p>
                                        <p className="text-lg font-medium">{formatMinutesAsHoursMinutes(selectedEntry.total)}</p>
                                    </div>
                                )}
                                <div className="grid gap-2 sm:grid-cols-3">
                                    <div className="rounded-md border bg-muted/20 p-3">
                                        <p className="text-xs text-foreground">{t('crm.analytics-network.activity-calendar-card.звонки')}</p>
                                        <p className="text-lg font-medium">{calls.toLocaleString("ru-RU")}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {totalActivities > 0 ? `${Math.round((calls / totalActivities) * 100)}% от действий` : "—"}
                                        </p>
                                    </div>
                                    <div className="rounded-md border bg-muted/20 p-3">
                                        <p className="text-xs text-foreground">{t('crm.analytics-network.activity-calendar-card.подборки')}</p>
                                        <p className="text-lg font-medium">{selections.toLocaleString("ru-RU")}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {totalActivities > 0 ? `${Math.round((selections / totalActivities) * 100)}% от действий` : "—"}
                                        </p>
                                    </div>
                                    <div className="rounded-md border bg-muted/20 p-3">
                                        <p className="text-xs text-foreground">{t('crm.analytics-network.activity-calendar-card.чаты')}</p>
                                        <p className="text-lg font-medium">{chats.toLocaleString("ru-RU")}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {totalActivities > 0 ? `${Math.round((chats / totalActivities) * 100)}% от действий` : "—"}
                                        </p>
                                    </div>
                                </div>
                            </>
                        );
                    })() : null}
                </DialogContent>
            </Dialog>
        </Card>
    );
}
