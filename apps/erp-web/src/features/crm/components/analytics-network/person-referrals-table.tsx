"use client";

import { Link } from "react-router-dom";
import { ArrowRight, LayoutList, MessageCircle, Phone } from "lucide-react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { PartnerRow } from "@/types/analytics";
import { crmAnalyticsPartnerPath } from "@/features/crm/crmAnalyticsPaths";
import { ParticipantCell } from "./participant-cell";
import { MiniBar } from "./mini-bar";
import { useI18n } from "@/i18n";

interface PersonReferralsTableProps {
    referrals: PartnerRow[];
    maxLeadsAdded: number;
    maxStageChangesCount: number;
    title?: string;
    description?: string;
}

export function PersonReferralsTable({
    referrals,
    maxLeadsAdded,
    maxStageChangesCount,
    title = "Рефералы",
    description = "Приглашённые партнёры",
}: PersonReferralsTableProps) {
    const { t } = useI18n();
    const sortedReferrals = [...referrals]
        .sort((a, b) => {
            const diff = b.leadsAdded - a.leadsAdded;
            if (diff !== 0) return diff;
            return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
        })
        .slice(0, 10);

    return (
        <Card className="w-full overflow-hidden">
            <CardHeader className="pb-3">
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent className="px-0 pb-0">
                {sortedReferrals.length === 0 ? (
                    <div className="px-6 pb-6 pt-2 text-sm text-muted-foreground">{t('crm.analytics-network.person-referrals-table.подключ_нных_реферал')}</div>
                ) : (
                    <>
                    <div className="space-y-2 px-3 pb-3 md:hidden">
                        {sortedReferrals.map((partner) => (
                            <div key={partner.id} className="space-y-3 rounded-lg border p-3">
                                <ParticipantCell partner={partner} />
                                <div className="space-y-1">
                                    <p className="text-[11px] text-muted-foreground">Leads</p>
                                    <MiniBar
                                        value={partner.leadsAdded}
                                        maxValue={maxLeadsAdded}
                                        color="bg-emerald-500"
                                        showValue
                                    />
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[11px] text-muted-foreground">Progress</p>
                                    <MiniBar
                                        value={partner.stageChangesCount}
                                        maxValue={maxStageChangesCount}
                                        color="bg-violet-500"
                                        showValue
                                    />
                                </div>
                                <div className="flex flex-wrap items-center gap-3 text-xs">
                                    <span className="inline-flex items-center gap-1" title={t('crm.analytics-network.person-referrals-table.звонки')}>
                                        <Phone className="h-3.5 w-3.5 text-orange-500" />
                                        {partner.callClicks.toLocaleString("ru-RU")}
                                    </span>
                                    <span className="inline-flex items-center gap-1" title={t('crm.analytics-network.person-referrals-table.чаты')}>
                                        <MessageCircle className="h-3.5 w-3.5 text-cyan-500" />
                                        {partner.chatOpens.toLocaleString("ru-RU")}
                                    </span>
                                    <span className="inline-flex items-center gap-1" title="Selections">
                                        <LayoutList className="h-3.5 w-3.5 text-pink-500" />
                                        {partner.selectionsCreated.toLocaleString("ru-RU")}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                    <span>Commission: ${partner.commissionUsd.toLocaleString("ru-RU")}</span>
                                    <Button variant="outline" size="sm" asChild>
                                        <Link to={crmAnalyticsPartnerPath(partner.id)}>Profile<ArrowRight className="h-4 w-4" />
                                        </Link>
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="hidden overflow-x-auto md:block">
                        <Table className="min-w-[760px]">
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="ps-6">Member</TableHead>
                                    <TableHead>Leads</TableHead>
                                    <TableHead>Activity</TableHead>
                                    <TableHead>Progress</TableHead>
                                    <TableHead className="hidden lg:table-cell">Commission</TableHead>
                                    <TableHead className="pe-6 text-right">Profile</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sortedReferrals.map((partner) => (
                                    <TableRow key={partner.id}>
                                        <TableCell className="ps-6">
                                            <ParticipantCell partner={partner} />
                                        </TableCell>
                                        <TableCell>
                                            <MiniBar
                                                value={partner.leadsAdded}
                                                maxValue={maxLeadsAdded}
                                                color="bg-emerald-500"
                                                showValue
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                <div className="flex items-center gap-1" title={t('crm.analytics-network.person-referrals-table.звонки')}>
                                                    <Phone className="h-3.5 w-3.5 text-orange-500" />
                                                    <span className="text-sm">
                                                        {partner.callClicks.toLocaleString("ru-RU")}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1" title={t('crm.analytics-network.person-referrals-table.чаты')}>
                                                    <MessageCircle className="h-3.5 w-3.5 text-cyan-500" />
                                                    <span className="text-sm">
                                                        {partner.chatOpens.toLocaleString("ru-RU")}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1" title="Selections">
                                                    <LayoutList className="h-3.5 w-3.5 text-pink-500" />
                                                    <span className="text-sm">
                                                        {partner.selectionsCreated.toLocaleString("ru-RU")}
                                                    </span>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <MiniBar
                                                value={partner.stageChangesCount}
                                                maxValue={maxStageChangesCount}
                                                color="bg-violet-500"
                                                showValue
                                            />
                                        </TableCell>
                                        <TableCell className="hidden lg:table-cell">
                                            ${partner.commissionUsd.toLocaleString("ru-RU")}
                                        </TableCell>
                                        <TableCell className="pe-6 text-right">
                                            <Button variant="ghost" size="sm" asChild>
                                                <Link to={crmAnalyticsPartnerPath(partner.id)}>Profile<ArrowRight className="h-4 w-4" />
                                                </Link>
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                    </>
                )}
            </CardContent>
        </Card>
    );
}
