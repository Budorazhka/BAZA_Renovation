"use client";

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
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
    XCircle,
    UserPlus,
    Handshake,
    CircleDollarSign,
    Eye,
    Ban
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ActivityMarker, PartnerRow, SalesStageCounts, SortColumn, SortDirection } from "@/types/analytics";
import { crmAnalyticsPartnerPath } from "@/features/crm/crmAnalyticsPaths";
import { ParticipantCell } from "./participant-cell";
import { MiniBar } from "./mini-bar";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { useI18n } from "@/i18n";

interface LeaderboardTableProps {
    participantLabel?: string;
    showActions?: boolean;
    title?: string;
    partners: PartnerRow[];
    maxLeadsAdded: number;
    formatCommission?: (value: number) => string;
    commissionLabel?: string;
    maxStageChangesCount: number;
    sortColumn: SortColumn;
    sortDirection: SortDirection;
    onSortChange: (column: SortColumn) => void;
    onResetFilters?: () => void;
    className?: string;
    /** Показывать в колонке «Лиды» 4 иконки по этапам продаж (Отказ, В работе, Переговоры, Купили). На мобильных устройствах по умолчанию скрыто, чтобы не перегружать колонку. */
    showLeadsBySalesStage?: boolean;
}

interface ColumnConfig {
    key: SortColumn | "participant" | "activity" | "actions";
    label: string;
    sortable: boolean;
    sortKey?: SortColumn;
    className?: string;
}

const getColumns = (showLeadsBySalesStage: boolean): ColumnConfig[] => [
    { key: "participant", label: "Участник", sortable: false, className: "min-w-[200px]" },
    { key: "leadsAdded", label: "Лиды", sortable: true, sortKey: "leadsAdded", className: showLeadsBySalesStage ? "min-w-[200px]" : "min-w-[100px]" },
    { key: "activity", label: "Активность", sortable: true, sortKey: "activityTotal", className: "min-w-[180px]" },
    { key: "stageChangesCount", label: "Прогресс", sortable: true, sortKey: "stageChangesCount", className: "min-w-[140px]" },
    { key: "onlineDaysLast7", label: "Онлайн (7д)", sortable: true, sortKey: "onlineDaysLast7", className: "min-w-[100px]" },
    { key: "commissionUsd", label: "Комиссия", sortable: true, sortKey: "commissionUsd", className: "min-w-[128px] text-center" },
    { key: "actions", label: "", sortable: false, className: "w-[48px]" },
];

const columnsDefault = getColumns(false);

const weekDayLabels = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const DEFAULT_SALES_STAGES: SalesStageCounts = { rejection: 0, inProgress: 0, negotiation: 0, success: 0 };

const SALES_STAGE_ITEMS: { key: keyof SalesStageCounts; Icon: typeof XCircle; label: string; tooltip: string; iconClass: string }[] = [
    { key: "rejection", Icon: XCircle, label: "Отказ", tooltip: "Лиды на этапе отказа", iconClass: "text-slate-500" },
    { key: "inProgress", Icon: UserPlus, label: "В работе", tooltip: "Лиды в работе", iconClass: "text-blue-500" },
    { key: "negotiation", Icon: Handshake, label: "Переговоры", tooltip: "Лиды на этапе переговоров", iconClass: "text-amber-500" },
    { key: "success", Icon: CircleDollarSign, label: "Сделка", tooltip: "Закрытые сделки", iconClass: "text-emerald-500" },
];

function getMarkerClass(marker: ActivityMarker) {
    if (marker === "green") return "bg-[#e6c364]";
    if (marker === "yellow") return "bg-[#d0e8df]";
    return "bg-[#ffb4ab]";
}

function getMarkerLabel(marker: ActivityMarker) {
    if (marker === "green") return "Активный";
    if (marker === "yellow") return "Средний";
    return "Пассивный";
}

function SortIcon({ column, currentColumn, direction }: {
    column: SortColumn;
    currentColumn: SortColumn;
    direction: SortDirection;
}) {
    if (column !== currentColumn) {
        return <ArrowUpDown className="h-4 w-4 text-muted-foreground" />;
    }
    return direction === "asc"
        ? <ArrowUp className="h-4 w-4" />
        : <ArrowDown className="h-4 w-4" />;
}

export function LeaderboardTable({
    partners,
    maxLeadsAdded,
    maxStageChangesCount,
    sortColumn,
    sortDirection,
    onSortChange,
    onResetFilters,
    className,
    showLeadsBySalesStage = false,
}: LeaderboardTableProps) {
    const { t } = useI18n();
    const navigate = useNavigate();
    const columns = showLeadsBySalesStage ? getColumns(true) : columnsDefault;

    if (partners.length === 0) {
        return (
            <Card className="w-full overflow-hidden">
                <CardContent className="px-6 pb-6">
                    <div className="flex flex-col items-center gap-2 text-center py-10">
                        <p className="text-base font-medium">{t('crm.analytics-network.leaderboard-table.рефералы_не_найдены')}</p>
                        <p className="text-sm text-muted-foreground">Try changing your search or filters</p>
                        {onResetFilters && (
                            <Button variant="secondary" onClick={onResetFilters}>Reset Filters</Button>
                        )}
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className={cn("h-full min-h-0 w-full overflow-hidden", className)}>
            <CardContent className="px-0 pb-0 md:flex md:min-h-0 md:flex-1 md:flex-col">
                <div className="space-y-2 px-3 pb-3 md:hidden">
                    {partners.map((partner) => (
                        <MobilePartnerCard
                            key={partner.id}
                            partner={partner}
                            maxLeadsAdded={maxLeadsAdded}
                            maxStageChangesCount={maxStageChangesCount}
                            showLeadsBySalesStage={showLeadsBySalesStage}
                        />
                    ))}
                </div>
                <div className="hidden overflow-x-auto md:block md:min-h-0 md:flex-1">
                    <div className="h-[600px] max-h-[calc(100vh-320px)] overflow-y-auto md:h-full md:max-h-none">
                        <Table className="min-w-[860px] [&_th]:border-r [&_td]:border-r [&_th]:border-border [&_td]:border-border [&_th:last-child]:border-r-0 [&_td:last-child]:border-r-0">
                            <TableHeader className="sticky top-0 z-10 bg-background">
                                <TableRow className="hover:bg-transparent bg-background">
                                {columns.map((col) => (
                                    <TableHead
                                        key={col.key}
                                        className={cn(
                                            "px-4 py-3",
                                            col.className,
                                            col.key === "leadsAdded" && "text-center",
                                            (col.key === "activity" || col.key === "stageChangesCount") && "text-center",
                                            col.key === "commissionUsd" && "hidden lg:table-cell text-center"
                                        )}
                                        title={col.key === "participant" ? "Статус сети, присутствие за сегодня и основная инфа" : undefined}
                                    >
                                        {col.sortable && col.sortKey ? (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className={cn(
                                                    "h-auto p-0 font-medium hover:bg-transparent",
                                                    (col.key === "activity" || col.key === "stageChangesCount") && "w-full justify-center"
                                                )}
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
                                        className="cursor-pointer transition-colors hover:bg-muted/40"
                                        onClick={() => navigate(crmAnalyticsPartnerPath(partner.id))}
                                    >
                                        <TableCell className="px-4 py-3">
                                            <ParticipantCell partner={partner} />
                                        </TableCell>
                                        <TableCell className="px-4 py-3">
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <div className="mx-auto grid w-full max-w-[156px] cursor-help gap-2 text-left">
                                                        <div className="flex items-baseline justify-between gap-2">
                                                            <span className="text-lg font-medium tabular-nums text-[color:var(--workspace-text)]">
                                                                {partner.leadsAdded.toLocaleString("ru-RU")}
                                                            </span>
                                                            <span className="text-base text-[color:var(--workspace-text-muted)]">{t('crm.analytics-network.leaderboard-table.новых')}</span>
                                                        </div>
                                                        <MiniBar value={partner.leadsAdded} maxValue={maxLeadsAdded} showValue={false} className="w-full" />
                                                    </div>
                                                </TooltipTrigger>
                                                <TooltipContent>{t('crm.analytics-network.leaderboard-table.новые_лиды_за_выбран')}</TooltipContent>
                                            </Tooltip>
                                        </TableCell>

                                        <TableCell className="px-4 py-3 text-center">
                                            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <div className="flex cursor-help items-center gap-1">
                                                            <Phone className="h-3.5 w-3.5 shrink-0 text-orange-500" />
                                                            <span className="text-sm tabular-nums">{partner.callClicks.toLocaleString("ru-RU")}</span>
                                                        </div>
                                                    </TooltipTrigger>
                                                    <TooltipContent>{t('crm.analytics-network.leaderboard-table.звонки_за_выбранный')}</TooltipContent>
                                                </Tooltip>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <div className="flex cursor-help items-center gap-1">
                                                            <MessageCircle className="h-3.5 w-3.5 shrink-0 text-cyan-500" />
                                                            <span className="text-sm tabular-nums">{partner.chatOpens.toLocaleString("ru-RU")}</span>
                                                        </div>
                                                    </TooltipTrigger>
                                                    <TooltipContent>{t('crm.analytics-network.leaderboard-table.чаты_за_выбранный_пе')}</TooltipContent>
                                                </Tooltip>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <div className="flex cursor-help items-center gap-1">
                                                            <LayoutList className="h-3.5 w-3.5 shrink-0 text-pink-500" />
                                                            <span className="text-sm tabular-nums">{partner.selectionsCreated.toLocaleString("ru-RU")}</span>
                                                        </div>
                                                    </TooltipTrigger>
                                                    <TooltipContent>{t('crm.analytics-network.leaderboard-table.подборки_за_выбранны')}</TooltipContent>
                                                </Tooltip>
                                            </div>
                                        </TableCell>

                                        <TableCell className="px-4 py-3 text-center">
                                            <div className="flex justify-center">
                                                <MiniBar
                                                    value={partner.stageChangesCount}
                                                    maxValue={maxStageChangesCount}
                                                    color="bg-[#d0e8df]"
                                                    showValue
                                                    className="w-full max-w-[140px]"
                                                />
                                            </div>
                                        </TableCell>

                                        <TableCell className="px-4 py-3">
                                            <div className="flex items-center justify-center gap-0.5" title={t('crm.analytics-network.leaderboard-table.статус_сети_за_после')} aria-label={`Онлайн ${partner.onlineDaysLast7} из 7 дней`}>
                                                {partner.onlineWeekMarkers.map((marker, i) => (
                                                    <div
                                                        key={i}
                                                        className={cn("w-1.5 h-3 rounded-sm", getMarkerClass(marker))}
                                                        title={`${weekDayLabels[i]}: ${getMarkerLabel(marker)}`}
                                                    />
                                                ))}
                                            </div>
                                        </TableCell>

                                        <TableCell className="px-4 py-3 hidden lg:table-cell text-center align-middle">
                                            <span className="font-medium">
                                                ${partner.commissionUsd.toLocaleString("ru-RU")}
                                            </span>
                                        </TableCell>

                                        <TableCell className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-8 w-8"
                                                        onClick={(event) => event.stopPropagation()}
                                                    >
                                                        <EllipsisVertical className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem asChild>
                                                        <Link to={crmAnalyticsPartnerPath(partner.id)}>{t('crm.analytics-network.leaderboard-table.открыть_аналитику')}</Link>
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem className="lg:hidden text-muted-foreground" disabled>{t('crm.analytics-network.leaderboard-table.онлайн_7д')}</DropdownMenuItem>
                                                    <DropdownMenuItem className="lg:hidden text-muted-foreground" disabled>
                                                        {t('crm.analytics-network.leaderboard-table.комиссия')}{partner.commissionUsd.toLocaleString("ru-RU")}
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem asChild>
                                                        <Link to={crmAnalyticsPartnerPath(partner.id)}>
                                                            <Eye className="h-4 w-4 mr-2" />{t('crm.analytics-network.leaderboard-table.посмотреть_профиль')}</Link>
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem className="cursor-pointer">
                                                        <UserPlus className="h-4 w-4 mr-2" />{t('crm.analytics-network.leaderboard-table.назначить_лида')}</DropdownMenuItem>
                                                    <DropdownMenuItem className="cursor-pointer text-destructive">
                                                        <Ban className="h-4 w-4 mr-2" />{t('crm.analytics-network.leaderboard-table.ограничить_действия')}</DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
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
    showLeadsBySalesStage,
}: {
    partner: PartnerRow;
    maxLeadsAdded: number;
    maxStageChangesCount: number;
    showLeadsBySalesStage: boolean;
}) {
    const { t } = useI18n();
    const navigate = useNavigate();

    return (
        <div
            className="space-y-3 rounded-lg border p-3"
            onClick={() => navigate(crmAnalyticsPartnerPath(partner.id))}
        >
            <ParticipantCell partner={partner} />
            <div className="space-y-1">
                <p className="text-[11px] text-foreground">{t('crm.analytics-network.leaderboard-table.лиды')}</p>
                <div className="flex items-center gap-2">
                    {showLeadsBySalesStage && (
                        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                            {SALES_STAGE_ITEMS.map(({ key, Icon, tooltip, iconClass }) => {
                                const counts = partner.salesStageCounts ?? DEFAULT_SALES_STAGES;
                                return (
                                    <Tooltip key={key}>
                                        <TooltipTrigger asChild>
                                            <span className="inline-flex cursor-help items-center gap-1 text-sm">
                                                <Icon className={cn("h-4 w-4", iconClass)} />
                                                {counts[key].toLocaleString("ru-RU")}
                                            </span>
                                        </TooltipTrigger>
                                        <TooltipContent>{tooltip}</TooltipContent>
                                    </Tooltip>
                                );
                            })}
                        </div>
                    )}
                    <MiniBar value={partner.leadsAdded} maxValue={maxLeadsAdded} showValue className="min-w-0 flex-1" />
                </div>
            </div>
            <div className="space-y-1">
                <p className="text-[11px] text-foreground">{t('crm.analytics-network.leaderboard-table.прогресс')}</p>
                <MiniBar
                    value={partner.stageChangesCount}
                    maxValue={maxStageChangesCount}
                    color="bg-[#d0e8df]"
                    showValue
                />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <span className="inline-flex cursor-help items-center gap-1">
                            <Phone className="h-3.5 w-3.5 text-orange-500" />
                            {partner.callClicks.toLocaleString("ru-RU")}
                        </span>
                    </TooltipTrigger>
                    <TooltipContent>{t('crm.analytics-network.leaderboard-table.звонки_за_выбранный')}</TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <span className="inline-flex cursor-help items-center gap-1">
                            <MessageCircle className="h-3.5 w-3.5 text-cyan-500" />
                            {partner.chatOpens.toLocaleString("ru-RU")}
                        </span>
                    </TooltipTrigger>
                    <TooltipContent>{t('crm.analytics-network.leaderboard-table.чаты_за_выбранный_пе')}</TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <span className="inline-flex cursor-help items-center gap-1">
                            <LayoutList className="h-3.5 w-3.5 text-pink-500" />
                            {partner.selectionsCreated.toLocaleString("ru-RU")}
                        </span>
                    </TooltipTrigger>
                    <TooltipContent>{t('crm.analytics-network.leaderboard-table.подборки_за_выбранны')}</TooltipContent>
                </Tooltip>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{t('crm.analytics-network.leaderboard-table.онлайн_7д')}</span>
                <span>{t('crm.analytics-network.leaderboard-table.комиссия')}{partner.commissionUsd.toLocaleString("ru-RU")}</span>
            </div>
        </div>
    );
}
