"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Percent } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FunnelBoard, FunnelColumn } from "@/types/analytics";
import { useI18n } from "@/i18n";

interface FunnelKanbanProps {
    funnels: FunnelBoard[];
}

function getColumnTone({
    boardId,
    columnId,
    isFinalColumn,
}: {
    boardId: FunnelBoard["id"];
    columnId: string;
    isFinalColumn: boolean;
}) {
    if (columnId === "rejection") {
        return {
            pill: "border-[#e25b5b]/40 bg-[#e25b5b]/15 text-[#ffb4ab]",
            bar: "bg-[#e25b5b]",
        };
    }

    if (columnId === "success" || (boardId !== "sales" && isFinalColumn)) {
        return {
            pill: "border-[#2eae68]/40 bg-[#2eae68]/15 text-[#9be7b8]",
            bar: "bg-[#2eae68]",
        };
    }

    if (columnId === "in_progress" || columnId === "preparation" || columnId === "active") {
        return {
            pill: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
            bar: "bg-[#2eae68]",
        };
    }

    return {
        pill: "bg-muted text-muted-foreground",
        bar: "bg-primary",
    };
}

function getStageCumulativeCount(board: FunnelBoard, stageName: string): number {
    let count = 0;
    let found = false;
    const flowColumnIds = ["in_progress", "active", "success"];

    for (const colId of flowColumnIds) {
        const column = board.columns.find(c => c.id === colId);
        if (!column) continue;

        for (const stage of column.stages) {
            if (stage.name === stageName) {
                found = true;
            }
            if (found) {
                count += stage.count;
            }
        }
    }

    return count;
}

function calculateConversion(board: FunnelBoard, fromStage: string, toStage: string): number {
    const fromCount = getStageCumulativeCount(board, fromStage);
    const toCount = getStageCumulativeCount(board, toStage);
    if (fromCount === 0) return 0;
    return Math.round((toCount / fromCount) * 100);
}

function ConversionsDropdown({ board }: { board: FunnelBoard }) {
    const { t } = useI18n();
    if (board.id !== "sales") return null;

    // Russian strings used for matching backend data stages
    const conversions = [
        { label: "Лид → презентация", from: "Новый лид", to: "Презентовали компанию" },
        { label: "Презентация → показ", from: "Презентовали компанию", to: "Показ" },
        { label: "Показ → сделка", from: "Показ", to: "Заключен договор" },
        { label: "Лид → сделка", from: "Новый лид", to: "Заключен договор" },
    ];

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="ml-auto gap-2">
                    <Percent className="h-4 w-4" />{t('crm.analytics-network.funnel-kanban.конверсии')}</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[280px]">
                {conversions.map((item, idx) => {
                    const val = calculateConversion(board, item.from, item.to);
                    return (
                        <DropdownMenuItem key={idx} className="flex justify-between gap-2">
                            <span className="truncate text-base text-muted-foreground">{item.label}</span>
                            <span className="font-medium">{val}%</span>
                        </DropdownMenuItem>
                    );
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export function FunnelKanban({ funnels }: FunnelKanbanProps) {
    const { t } = useI18n();
    if (funnels.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>{t('crm.analytics-network.funnel-kanban.воронки')}</CardTitle>
                    <CardDescription className="text-base">{t('crm.analytics-network.funnel-kanban.нет_данных_для_отобр')}</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    return (
        <Card>
            <Tabs defaultValue={funnels[0].id}>
                <CardHeader className="gap-3">
                    <div className="space-y-1 text-center">
                        <CardTitle className="text-base font-medium sm:text-lg">{t('crm.analytics-network.funnel-kanban.воронки_по_этапам')}</CardTitle>
                        <CardDescription className="text-base">{t('crm.analytics-network.funnel-kanban.статусы_и_этапы_воро')}</CardDescription>
                    </div>
                    <TabsList className="h-auto w-full flex-wrap justify-center">
                        {funnels.map((board) => (
                            <TabsTrigger key={board.id} value={board.id} className="text-center text-sm font-medium whitespace-normal leading-tight sm:text-base sm:whitespace-nowrap">
                                {board.shortName}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </CardHeader>
                <CardContent className="space-y-3">
                    {funnels.map((board) => (
                        <TabsContent key={board.id} value={board.id} className="m-0 space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="secondary" className="text-base">{t('crm.analytics-network.funnel-kanban.всего')}{board.totalCount.toLocaleString("ru-RU")}</Badge>
                                <Badge variant="secondary" className="text-base">{t('crm.analytics-network.funnel-kanban.активные')}{board.activeCount.toLocaleString("ru-RU")}</Badge>
                                <Badge variant="secondary" className="text-base">{t('crm.analytics-network.funnel-kanban.отказ')}{board.rejectionCount.toLocaleString("ru-RU")}</Badge>
                                {board.closedCount > 0 && (
                                    <Badge variant="secondary" className="text-base">{t('crm.analytics-network.funnel-kanban.закрытые')}{board.closedCount.toLocaleString("ru-RU")}</Badge>
                                )}
                                <ConversionsDropdown board={board} />
                            </div>
                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                {board.columns.map((column, columnIndex) => (
                                    <FunnelColumnCard
                                        key={`${board.id}-${column.id}`}
                                        boardId={board.id}
                                        column={column}
                                        isFinalColumn={columnIndex === board.columns.length - 1}
                                    />
                                ))}
                            </div>
                        </TabsContent>
                    ))}
                </CardContent>
            </Tabs>
        </Card>
    );
}

function FunnelColumnCard({
    boardId,
    column,
    isFinalColumn,
}: {
    boardId: FunnelBoard["id"];
    column: FunnelColumn;
    isFinalColumn: boolean;
}) {
    const { t } = useI18n();
    const tone = getColumnTone({ boardId, columnId: column.id, isFinalColumn });
    const maxStageCount = Math.max(...column.stages.map((stage) => stage.count), 1);

    return (
        <div className="rounded-xl border bg-muted/20 p-3">
            <div className="flex min-w-0 items-center justify-between gap-2">
                <p className="min-w-0 break-words text-sm font-medium">{column.name}</p>
                <Badge className={cn("shadow-none", tone.pill)}>
                    {column.count.toLocaleString("ru-RU")}
                </Badge>
            </div>
            <Separator className="my-2" />
            <div className="space-y-2">
                {column.stages.map((stage) => {
                    const width = Math.max(6, Math.round((stage.count / maxStageCount) * 100));
                    return (
                        <div key={stage.id} className="rounded-lg border bg-background p-2">
                            <div className="flex min-w-0 items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="text-base text-muted-foreground">{t('crm.analytics-network.funnel-kanban.этап')} {stage.order}</p>
                                    <p className="break-words text-base leading-tight">{stage.name}</p>
                                </div>
                                <span className="text-base font-medium tabular-nums">
                                    {stage.count.toLocaleString("ru-RU")}
                                </span>
                            </div>
                            <div className="mt-2 h-1.5 rounded-full bg-muted">
                                <div
                                    className={cn("h-full rounded-full", tone.bar)}
                                    style={{ width: `${width}%` }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
