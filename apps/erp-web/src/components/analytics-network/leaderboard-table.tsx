"use client";
// [DOC-RU]
// Если ты меняешь этот файл, сначала держи прежний смысл метрик и полей, чтобы UI не разъехался.
// Смысл файла: таблица лидеров/партнёров; тут ты управляешь колонками, сортировкой и переходами в карточку партнёра.
// После правок ты проверяешь экран руками и сверяешь ключевые цифры/периоды.


import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
    EllipsisVertical,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    Phone,
    MessageCircle,
    LayoutList,
    Eye,
    UserPlus,
    Ban
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActivityMarker, PartnerRow, SortColumn, SortDirection } from "@/types/analytics";
import { ParticipantCell } from "./participant-cell";
import { MiniBar } from "./mini-bar";
import { useNavigate, useParams } from "react-router-dom";
import { useI18n } from "@/i18n";

interface LeaderboardTableProps {
    partners: PartnerRow[];
    maxLeadsAdded: number;
    maxStageChangesCount: number;
    sortColumn: SortColumn;
    sortDirection: SortDirection;
    onSortChange: (column: SortColumn) => void;
    onResetFilters?: () => void;
    onOpenPartner?: (partnerId: string) => void;
    title?: string;
    participantLabel?: string;
    commissionLabel?: string;
    formatCommission?: (value: number) => string;
    showActions?: boolean;
    className?: string;
}

interface ColumnConfig {
    key: SortColumn | "participant" | "activity" | "actions";
    label: string;
    sortable: boolean;
    sortKey?: SortColumn;
    className?: string;
}

const baseColumns: ColumnConfig[] = [
    { key: "participant", label: "Участник", sortable: false, className: "min-w-[200px]" },
    { key: "leadsAdded", label: "Лиды", sortable: true, sortKey: "leadsAdded", className: "min-w-[140px]" },
    { key: "activity", label: "Активность", sortable: true, sortKey: "activityTotal", className: "min-w-[150px]" },
    { key: "stageChangesCount", label: "Прогресс", sortable: true, sortKey: "stageChangesCount", className: "min-w-[140px]" },
    { key: "onlineDaysLast7", label: "Онлайн 7 дней", sortable: true, sortKey: "onlineDaysLast7", className: "min-w-[120px]" },
    { key: "commissionUsd", label: "Комиссия, USD", sortable: true, sortKey: "commissionUsd", className: "min-w-[120px]" },
    { key: "actions", label: "", sortable: false, className: "w-[48px]" },
];

const weekDayLabels = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function getMarkerClass(marker: ActivityMarker) {
    if (marker === "green") return "bg-emerald-500";
    if (marker === "yellow") return "bg-yellow-400";
    return "bg-rose-500";
}

function getMarkerLabel(marker: ActivityMarker) {
    if (marker === "green") return "активный";
    if (marker === "yellow") return "средний";
    return "пассивный";
}

function SortIcon({ column, currentColumn, direction }: {
    column: SortColumn;
    currentColumn: SortColumn;
    direction: SortDirection;
}) {
    const iconClass = "h-4 w-4 text-[color:var(--app-text-muted)]";
    if (column !== currentColumn) {
        return <ArrowUpDown className={iconClass} />;
    }
    return direction === "asc"
        ? <ArrowUp className={iconClass} />
        : <ArrowDown className={iconClass} />;
}

export function LeaderboardTable({
    partners,
    maxLeadsAdded,
    maxStageChangesCount,
    sortColumn,
    sortDirection,
    onSortChange,
    onResetFilters,
    onOpenPartner,
    title = "Лидерборд: Мои рефералы L1",
    participantLabel = "Участник",
    commissionLabel = "Комиссия, USD",
    formatCommission = (value) => `$${value.toLocaleString("ru-RU")}`,
    showActions = true,
    className,
}: LeaderboardTableProps) {
    const { t } = useI18n();
    const navigate = useNavigate();
    const { cityId } = useParams<{ cityId: string }>();
    const canOpenPartner = Boolean(onOpenPartner || cityId);
    const openPartner = (id: string) => {
        if (onOpenPartner) {
            onOpenPartner(id);
            return;
        }
        if (!cityId) return;
        navigate(`/dashboard/city/${cityId}/partner/${id}`);
    };
    const columns = baseColumns
        .filter((column) => showActions || column.key !== "actions")
        .map((column) => {
            if (column.key === "participant") return { ...column, label: participantLabel };
            if (column.key === "commissionUsd") return { ...column, label: commissionLabel };
            return column;
        });

    if (partners.length === 0) {
        return (
            <Card className={cn("w-full overflow-hidden", className)}>
                <CardHeader className="pb-3">
                    <CardTitle className="text-center text-base font-normal sm:text-lg">
                        {title}
                    </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-1 items-center justify-center px-6 pb-6">
                    <div className="flex flex-col items-center gap-2 py-10 text-center">
                        <p className="text-base font-medium">{t('analytics-network.leaderboard-table.ничего_не_найдено')}</p>
                        <p className="text-sm text-muted-foreground">
                            {t('analytics-network.leaderboard-table.попробуйте_изменить')}</p>
                        {onResetFilters && (
                            <Button variant="secondary" onClick={onResetFilters}>
                                {t('analytics-network.leaderboard-table.сбросить_фильтры')}</Button>
                        )}
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className={cn("flex h-full min-h-0 w-full flex-col overflow-hidden", className)}>
            <CardHeader className="pb-3">
                <CardTitle className="text-center text-base font-normal sm:text-lg">
                    {title}
                </CardTitle>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col px-0 pb-0">
                <div className="space-y-2 px-3 pb-3 md:hidden">
                    {partners.map((partner) => (
                        <MobilePartnerCard
                            key={partner.id}
                            partner={partner}
                            maxLeadsAdded={maxLeadsAdded}
                            maxStageChangesCount={maxStageChangesCount}
                            commissionLabel={commissionLabel}
                            formatCommission={formatCommission}
                            onOpenPartner={openPartner}
                        />
                    ))}
                </div>
                <div className="hidden min-h-0 flex-1 md:block">
                    <div className="h-full overflow-x-auto">
                        <div className="h-full overflow-y-auto">
                        <Table className="min-w-[860px]">
                            <TableHeader className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 backdrop-blur-sm">
                                <TableRow className="border-0 bg-transparent hover:bg-transparent">
                                {columns.map((col) => (
                                    <TableHead
                                        key={col.key}
                                        className={cn(
                                            "p-3 text-slate-900 font-normal",
                                            col.className,
                                            col.key === "participant" && "ps-6",
                                            col.key === "onlineDaysLast7" && "hidden lg:table-cell",
                                            col.key === "commissionUsd" && "hidden lg:table-cell"
                                        )}
                                    >
                                        {col.sortable && col.sortKey ? (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-auto p-0 font-normal text-slate-900 hover:bg-slate-200/60 hover:text-slate-900"
                                                onClick={() => onSortChange(col.sortKey!)}
                                            >
                                                {col.label}
                                                <SortIcon
                                                    column={col.sortKey}
                                                    currentColumn={sortColumn}
                                                    direction={sortDirection}
                                                />
                                            </Button>
                                        ) : (
                                            col.label
                                        )}
                                    </TableHead>
                                ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {partners.map((partner) => (
                                    <TableRow
                                        key={partner.id}
                                        className={cn(
                                            "border-0 transition-colors hover:bg-muted/40",
                                            canOpenPartner && "cursor-pointer"
                                        )}
                                        onClick={() => openPartner(partner.id)}
                                    >
                                        <TableCell className="p-3 ps-6">
                                            <ParticipantCell partner={partner} />
                                        </TableCell>

                                        <TableCell className="p-3">
                                            <MiniBar
                                                value={partner.leadsAdded}
                                                maxValue={maxLeadsAdded}
                                                color="bg-blue-500"
                                                showValue
                                        />
                                        </TableCell>

                                        <TableCell className="p-3">
                                        <div className="flex items-center gap-3">
                                            <div className="flex items-center gap-1" title={t('analytics-network.leaderboard-table.звонки')}>
                                                <Phone className="h-3.5 w-3.5 text-orange-500" />
                                                    <span className="text-sm font-medium text-slate-800 tabular-nums">{partner.callClicks.toLocaleString("ru-RU")}</span>
                                            </div>
                                            <div className="flex items-center gap-1" title={t('analytics-network.leaderboard-table.чаты')}>
                                                <MessageCircle className="h-3.5 w-3.5 text-sky-500" />
                                                    <span className="text-sm font-medium text-slate-800 tabular-nums">{partner.chatOpens.toLocaleString("ru-RU")}</span>
                                            </div>
                                            <div className="flex items-center gap-1" title={t('analytics-network.leaderboard-table.рассылки')}>
                                                <LayoutList className="h-3.5 w-3.5 text-violet-500" />
                                                    <span className="text-sm font-medium text-slate-800 tabular-nums">{partner.selectionsCreated.toLocaleString("ru-RU")}</span>
                                            </div>
                                        </div>
                                    </TableCell>

                                        <TableCell className="p-3">
                                            <MiniBar
                                                value={partner.stageChangesCount}
                                                maxValue={maxStageChangesCount}
                                                color="bg-violet-500"
                                                showValue
                                            />
                                        </TableCell>

                                        <TableCell className="p-3 hidden lg:table-cell">
                                            <div className="flex items-center gap-1.5">
                                                <span className="font-normal text-slate-900 tabular-nums">{partner.onlineDaysLast7}</span>
                                                <span className="text-slate-600">/7</span>
                                                <div className="flex gap-0.5 ml-1" aria-hidden>
                                                    {partner.onlineWeekMarkers.map((marker, i) => (
                                                        <div
                                                            key={i}
                                                            className={cn("w-1.5 h-3 rounded-sm", getMarkerClass(marker))}
                                                            title={`${weekDayLabels[i]}: ${getMarkerLabel(marker)}`}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        </TableCell>

                                        <TableCell className="p-3 hidden lg:table-cell">
                                            <span className="font-normal text-slate-900 tabular-nums">
                                                {formatCommission(partner.commissionUsd)}
                                            </span>
                                        </TableCell>

                                        {showActions && (
                                            <TableCell className="p-3 pe-6" onClick={(event) => event.stopPropagation()}>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8"
                                                            onClick={(event) => event.stopPropagation()}
                                                        >
                                                            <EllipsisVertical className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onClick={() => openPartner(partner.id)}>
                                                            {t('analytics-network.leaderboard-table.открыть_аналитику')}</DropdownMenuItem>
                                                        <DropdownMenuItem className="lg:hidden text-muted-foreground" disabled>
                                                            {t('analytics-network.leaderboard-table.онлайн_7_дней')}{partner.onlineDaysLast7}/7
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem className="lg:hidden text-muted-foreground" disabled>
                                                            {commissionLabel}: {formatCommission(partner.commissionUsd)}
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => openPartner(partner.id)}>
                                                            <Eye className="h-4 w-4 mr-2" />
                                                            {t('analytics-network.leaderboard-table.посмотреть_профиль')}</DropdownMenuItem>
                                                        <DropdownMenuItem className="cursor-pointer">
                                                            <UserPlus className="h-4 w-4 mr-2" />
                                                            {t('analytics-network.leaderboard-table.назначить_лида')}</DropdownMenuItem>
                                                        <DropdownMenuItem className="cursor-pointer text-destructive">
                                                            <Ban className="h-4 w-4 mr-2" />
                                                            {t('analytics-network.leaderboard-table.ограничить')}</DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        )}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function MobilePartnerCard({
    partner,
    maxLeadsAdded,
    maxStageChangesCount,
    commissionLabel,
    formatCommission,
    onOpenPartner,
}: {
    partner: PartnerRow;
    maxLeadsAdded: number;
    maxStageChangesCount: number;
    commissionLabel: string;
    formatCommission: (value: number) => string;
    onOpenPartner: (partnerId: string) => void;
}) {
    const { t } = useI18n();
    return (
        <div
            className="space-y-3 rounded-xl border border-[color:var(--green-border)] bg-[color:var(--green-card)]/35 p-3 shadow-sm"
            onClick={() => onOpenPartner(partner.id)}
        >
            <ParticipantCell partner={partner} />
            <div className="space-y-1">
                <p className="text-xs font-medium text-[color:var(--app-text-muted)]">{t('analytics-network.leaderboard-table.лиды')}</p>
                <MiniBar value={partner.leadsAdded} maxValue={maxLeadsAdded} color="bg-blue-500" showValue />
            </div>
            <div className="space-y-1">
                <p className="text-xs font-medium text-[color:var(--app-text-muted)]">{t('analytics-network.leaderboard-table.прогресс')}</p>
                <MiniBar
                    value={partner.stageChangesCount}
                    maxValue={maxStageChangesCount}
                    color="bg-violet-500"
                    showValue
                />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs font-medium tabular-nums text-[color:var(--app-text)]">
                <span className="inline-flex items-center gap-1" title={t('analytics-network.leaderboard-table.звонки')}>
                    <Phone className="h-3.5 w-3.5 text-orange-500" />
                    {partner.callClicks.toLocaleString("ru-RU")}
                </span>
                <span className="inline-flex items-center gap-1" title={t('analytics-network.leaderboard-table.чаты')}>
                    <MessageCircle className="h-3.5 w-3.5 text-sky-500" />
                    {partner.chatOpens.toLocaleString("ru-RU")}
                </span>
                <span className="inline-flex items-center gap-1" title={t('analytics-network.leaderboard-table.рассылки')}>
                    <LayoutList className="h-3.5 w-3.5 text-violet-500" />
                    {partner.selectionsCreated.toLocaleString("ru-RU")}
                </span>
            </div>
            <div className="flex items-center justify-between text-xs text-[color:var(--app-text-muted)]">
                <span>{t('analytics-network.leaderboard-table.онлайн_7_дней')}{partner.onlineDaysLast7}/7</span>
                <span className="font-normal tabular-nums text-[color:var(--app-text)]">
                    {commissionLabel}: {formatCommission(partner.commissionUsd)}
                </span>
            </div>
        </div>
    );
}
