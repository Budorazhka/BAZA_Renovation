import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
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
  Ban,
  ArrowRight,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { PartnerRow, SortColumn, SortDirection } from '@/types/analytics';
import { ParticipantCell } from '@/components/analytics-network/participant-cell';
import { crmAnalyticsPartnerPath } from '@/features/crm/crmAnalyticsPaths';
import { MiniBar } from '@/components/analytics-network/mini-bar';
import { useI18n } from "@/i18n";

interface LeaderboardTableProps {
  title?: string;
  commissionLabel?: string;
  partners: PartnerRow[];
  maxLeadsAdded: number;
  maxStageChangesCount: number;
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  onSortChange: (column: SortColumn) => void;
  onResetFilters?: () => void;
  className?: string;
}

interface ColumnConfig {
  key: SortColumn | 'participant' | 'activity' | 'actions';
  label: string;
  sortable: boolean;
  sortKey?: SortColumn;
  className?: string;
}

const columns: ColumnConfig[] = [
  { key: 'participant', label: 'Участник', sortable: false, className: 'min-w-[200px]' },
  { key: 'leadsAdded', label: 'Лиды', sortable: true, sortKey: 'leadsAdded', className: 'min-w-[140px]' },
  { key: 'activity', label: 'Активность', sortable: true, sortKey: 'activityTotal', className: 'min-w-[150px]' },
  {
    key: 'stageChangesCount',
    label: 'Прогресс',
    sortable: true,
    sortKey: 'stageChangesCount',
    className: 'min-w-[140px]',
  },
  {
    key: 'onlineDaysLast7',
    label: 'Онлайн 7 дней',
    sortable: true,
    sortKey: 'onlineDaysLast7',
    className: 'min-w-[120px]',
  },
  {
    key: 'commissionUsd',
    label: 'Комиссия, USD',
    sortable: true,
    sortKey: 'commissionUsd',
    className: 'min-w-[120px]',
  },
  { key: 'actions', label: '', sortable: false, className: 'w-[48px]' },
];

function SortIcon({
  column,
  currentColumn,
  direction,
}: {
  column: SortColumn;
  currentColumn: SortColumn;
  direction: SortDirection;
}) {
  if (column !== currentColumn) {
    return <ArrowUpDown className="h-4 w-4 text-muted-foreground" />;
  }
  return direction === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />;
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
}: LeaderboardTableProps) {
    const { t } = useI18n();
  const navigate = useNavigate();

  if (partners.length === 0) {
    return (
      <Card className="w-full overflow-hidden">
        <CardContent className="px-6 pb-6">
          <div className="flex flex-col items-center gap-2 text-center py-10">
            <p className="text-base font-medium">{t('crm.crm.leaderboardTable.ничего_не_найдено')}</p>
            <p className="text-sm text-muted-foreground">{t('crm.crm.leaderboardTable.попробуйте_изменить')}</p>
            {onResetFilters && (
              <Button variant="secondary" onClick={onResetFilters}>
                {t('crm.crm.leaderboardTable.сбросить_фильтры')}</Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('h-full min-h-0 w-full overflow-hidden', className)}>
      <CardContent className="px-0 pb-0 md:flex md:min-h-0 md:flex-1 md:flex-col">
        <div className="space-y-2 px-3 pb-3 md:hidden">
          {partners.map((partner) => (
            <MobilePartnerCard
              key={partner.id}
              partner={partner}
              maxLeadsAdded={maxLeadsAdded}
              maxStageChangesCount={maxStageChangesCount}
            />
          ))}
        </div>
        <div className="hidden overflow-x-auto md:block md:min-h-0 md:flex-1">
          <div className="h-[600px] max-h-[calc(100vh-320px)] overflow-y-auto md:h-full md:max-h-none">
            <Table className="min-w-[860px]">
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow className="hover:bg-transparent bg-background">
                  {columns.map((col) => (
                    <TableHead
                      key={col.key}
                      className={cn(
                        'p-3',
                        col.className,
                        col.key === 'participant' && 'ps-6',
                        col.key === 'onlineDaysLast7' && 'hidden lg:table-cell',
                        col.key === 'commissionUsd' && 'hidden lg:table-cell',
                      )}
                    >
                      {col.sortable && col.sortKey ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-auto p-0 font-medium hover:bg-transparent"
                          onClick={() => onSortChange(col.sortKey!)}
                        >
                          {col.label}
                          <SortIcon column={col.sortKey} currentColumn={sortColumn} direction={sortDirection} />
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
                    <TableCell className="p-3 ps-6">
                      <ParticipantCell partner={partner} />
                    </TableCell>

                    <TableCell className="p-3">
                      <MiniBar
                        value={partner.leadsAdded}
                        maxValue={maxLeadsAdded}
                        color="bg-emerald-500"
                        showValue
                      />
                    </TableCell>

                    <TableCell className="p-3">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1" title={t('crm.crm.leaderboardTable.звонки')}>
                          <Phone className="h-3.5 w-3.5 text-orange-500" />
                          <span className="text-sm">
                            {partner.callClicks.toLocaleString('ru-RU')}
                          </span>
                        </div>
                        <div className="flex items-center gap-1" title={t('crm.crm.leaderboardTable.чаты')}>
                          <MessageCircle className="h-3.5 w-3.5 text-cyan-500" />
                          <span className="text-sm">
                            {partner.chatOpens.toLocaleString('ru-RU')}
                          </span>
                        </div>
                        <div className="flex items-center gap-1" title={t('crm.crm.leaderboardTable.рассылки')}>
                          <LayoutList className="h-3.5 w-3.5 text-pink-500" />
                          <span className="text-sm">
                            {partner.selectionsCreated.toLocaleString('ru-RU')}
                          </span>
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

                    <TableCell className="hidden p-3 text-sm text-muted-foreground lg:table-cell">
                      {partner.onlineDaysLast7}/7
                    </TableCell>

                    <TableCell className="hidden p-3 text-sm text-muted-foreground lg:table-cell">
                      ${partner.commissionUsd.toLocaleString('ru-RU')}
                    </TableCell>

                    <TableCell className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="sm" asChild>
                          <Link to={crmAnalyticsPartnerPath(partner.id)}>
                            {t('crm.crm.leaderboardTable.карточка')}<ArrowRight className="ml-1 h-4 w-4" />
                          </Link>
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 rounded-full text-muted-foreground hover:bg-muted"
                            >
                              <EllipsisVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem asChild className="gap-2">
                              <Link to={crmAnalyticsPartnerPath(partner.id)}>
                                <Eye className="h-4 w-4 text-emerald-500" />
                                <span>{t('crm.crm.leaderboardTable.открыть_карточку')}</span>
                              </Link>
                            </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2">
                            <Phone className="h-4 w-4 text-orange-500" />
                            <span>{t('crm.crm.leaderboardTable.позвонить')}</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2">
                            <MessageCircle className="h-4 w-4 text-cyan-500" />
                            <span>{t('crm.crm.leaderboardTable.написать_в_чат')}</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2">
                            <LayoutList className="h-4 w-4 text-pink-500" />
                            <span>{t('crm.crm.leaderboardTable.добавить_в_рассылку')}</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2">
                            <UserPlus className="h-4 w-4 text-indigo-500" />
                            <span>{t('crm.crm.leaderboardTable.создать_задачу_по_па')}</span>
                          </DropdownMenuItem>
                            <DropdownMenuItem className="gap-2 text-red-600">
                              <Ban className="h-4 w-4" />
                              <span>{t('crm.crm.leaderboardTable.заблокировать')}</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
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
}: {
  partner: PartnerRow;
  maxLeadsAdded: number;
  maxStageChangesCount: number;
}) {
    const { t } = useI18n();
  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-3">
        <ParticipantCell partner={partner} />
        <span className="text-xs text-muted-foreground">
          {partner.onlineDaysLast7}{t('crm.crm.leaderboardTable.7_дней_онлайн')}</span>
      </div>
      <div className="space-y-2">
        <div className="space-y-1">
          <p className="text-[11px] text-muted-foreground">{t('crm.crm.leaderboardTable.лиды')}</p>
          <MiniBar
            value={partner.leadsAdded}
            maxValue={maxLeadsAdded}
            color="bg-emerald-500"
            showValue
          />
        </div>
        <div className="space-y-1">
          <p className="text-[11px] text-muted-foreground">{t('crm.crm.leaderboardTable.прогресс')}</p>
          <MiniBar
            value={partner.stageChangesCount}
            maxValue={maxStageChangesCount}
            color="bg-violet-500"
            showValue
          />
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Phone className="h-3.5 w-3.5 text-orange-500" />
            {partner.callClicks.toLocaleString('ru-RU')}
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageCircle className="h-3.5 w-3.5 text-cyan-500" />
            {partner.chatOpens.toLocaleString('ru-RU')}
          </span>
          <span className="inline-flex items-center gap-1">
            <LayoutList className="h-3.5 w-3.5 text-pink-500" />
            {partner.selectionsCreated.toLocaleString('ru-RU')}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{t('crm.crm.leaderboardTable.комиссия')}{partner.commissionUsd.toLocaleString('ru-RU')}</span>
          <Button variant="outline" size="sm" asChild>
            <Link to={crmAnalyticsPartnerPath(partner.id)}>
              {t('crm.crm.leaderboardTable.карточка')}<ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

