import { useEffect, useState } from 'react'
import { TrendingUp, Users, ShieldCheck, AlertCircle, RefreshCw, Calendar } from 'lucide-react'
import { useI18n } from "@/i18n";
import { billingApiV2, type BillingLedgerEntry, type OrganizationSubscriptionOverview } from '@/services/billingApiV2';

interface UsageBarProps {
  label: string
  used: number
  total: number
  icon: React.ReactNode
}

function UsageBar({ label, used, total, icon }: UsageBarProps) {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  const color = pct > 80 ? 'bg-red-500' : pct > 60 ? 'bg-amber-500' : 'bg-emerald-500'

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-[color:var(--theme-accent-link-dim)]">
          <span className="text-[color:var(--hub-stat-label)]">{icon}</span>
          {label}
        </div>
        <span className="text-sm font-normal text-[color:var(--app-text)]">
          {used.toLocaleString('ru-RU')} <span className="text-[color:var(--workspace-text-muted)] font-normal">/ {total.toLocaleString('ru-RU')}</span>
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-[rgba(255,255,255,0.07)]">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function formatStatusBadge(status: string) {
  switch (status) {
    case 'active':
      return <span className="rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-400 uppercase tracking-wide">Активен</span>;
    case 'trial':
      return <span className="rounded-full border border-blue-500/40 bg-blue-500/15 px-2.5 py-0.5 text-xs font-medium text-blue-400 uppercase tracking-wide">Пробный период</span>;
    case 'grace_period':
      return <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-400 uppercase tracking-wide">Льготный период</span>;
    case 'frozen':
      return <span className="rounded-full border border-red-500/40 bg-red-500/15 px-2.5 py-0.5 text-xs font-medium text-red-400 uppercase tracking-wide">Заморожен</span>;
    default:
      return <span className="rounded-full border border-gray-500/40 bg-gray-500/15 px-2.5 py-0.5 text-xs font-medium text-gray-400 uppercase tracking-wide">{status}</span>;
  }
}

function formatDate(dateStr?: string | null) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export function BillingTab() {
  const { t } = useI18n();
  const [overview, setOverview] = useState<OrganizationSubscriptionOverview | null>(null);
  const [ledger, setLedger] = useState<BillingLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBillingData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [overviewData, ledgerData] = await Promise.all([
        billingApiV2.getSubscription(),
        billingApiV2.getLedger().catch(() => []), // Non-owners may receive 403 on ledger
      ]);
      setOverview(overviewData);
      setLedger(ledgerData);
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || 'Ошибка загрузки данных биллинга');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBillingData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-sm text-[color:var(--hub-stat-label)]">
        <RefreshCw className="mr-2 size-4 animate-spin" />
        {t('settings.billingTab.загрузка')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-300">
        <div className="flex items-center gap-2 mb-2 font-medium">
          <AlertCircle className="size-4" />
          Ошибка биллинга
        </div>
        <p>{error}</p>
        <button
          onClick={loadBillingData}
          className="mt-4 rounded-lg border border-red-400/40 px-3 py-1.5 text-xs text-red-200 hover:bg-red-500/20"
        >
          Повторить
        </button>
      </div>
    );
  }

  const subscription = overview?.subscription;
  const plan = overview?.plan;
  const effectiveLimits = overview?.effectiveLimits;
  const priceDisplay = plan?.pricePerMonth
    ? `${(plan.pricePerMonth.amountMinorUnits / 100).toLocaleString('ru-RU')} ${plan.pricePerMonth.currency}`
    : '0 USD';

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Current plan */}
      <div className="rounded-xl border border-[color:var(--hub-card-border-hover)] bg-[var(--hub-action-hover)] p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-xl font-medium text-[color:var(--app-text)]">
                {plan?.name || subscription?.planCode || 'Текущий тариф'}
              </span>
              {subscription && formatStatusBadge(subscription.status)}
            </div>
            <p className="mt-2 text-sm text-[color:var(--hub-desc)] flex items-center gap-1.5">
              <Calendar className="size-4 text-[color:var(--hub-stat-label)]" />
              Действует до:{' '}
              <span className="text-[color:var(--app-text)] font-medium">
                {formatDate(subscription?.expiresAt)}
              </span>
            </p>
            {subscription?.startedAt && (
              <p className="mt-0.5 text-xs text-[color:var(--hub-stat-label)]">
                Активирован: {formatDate(subscription.startedAt)}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold text-[color:var(--app-text)]">{priceDisplay}</p>
            <p className="text-xs text-[color:var(--hub-stat-label)]">{t('settings.billingTab.в_месяц')}</p>
          </div>
        </div>

        {/* Features toggles */}
        <div className="mt-5 pt-4 border-t border-[color:var(--hub-card-border)] grid grid-cols-3 gap-2 text-xs">
          <div className="flex items-center gap-1.5 text-[color:var(--theme-accent-link-dim)]">
            <ShieldCheck className={`size-4 ${effectiveLimits?.crmAccess ? 'text-emerald-400' : 'text-gray-500'}`} />
            CRM-воронка: {effectiveLimits?.crmAccess ? 'Доступна' : 'Отключена'}
          </div>
          <div className="flex items-center gap-1.5 text-[color:var(--theme-accent-link-dim)]">
            <ShieldCheck className={`size-4 ${effectiveLimits?.chessboardAccess ? 'text-emerald-400' : 'text-gray-500'}`} />
            Шахматка: {effectiveLimits?.chessboardAccess ? 'Доступна' : 'Отключена'}
          </div>
          <div className="flex items-center gap-1.5 text-[color:var(--theme-accent-link-dim)]">
            <ShieldCheck className={`size-4 ${effectiveLimits?.landingAccess ? 'text-emerald-400' : 'text-gray-500'}`} />
            Сайт-лендинг: {effectiveLimits?.landingAccess ? 'Доступен' : 'Отключен'}
          </div>
        </div>
      </div>

      {/* Usage */}
      <div className="space-y-4">
        <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--hub-stat-label)]">
          {t('settings.billingTab.использование')}
        </p>
        <div className="rounded-xl border border-[color:var(--hub-tile-icon-border)] bg-[rgba(0,0,0,0.15)] p-5 space-y-5">
          <UsageBar
            label={t('settings.billingTab.объекты')}
            used={subscription?.currentUsage?.activeListings ?? 0}
            total={effectiveLimits?.maxActiveListings ?? 100}
            icon={<TrendingUp className="size-3.5" />}
          />
          <UsageBar
            label={t('settings.billingTab.менеджеры')}
            used={subscription?.currentUsage?.teamPositions ?? 1}
            total={effectiveLimits?.maxTeamPositions ?? 10}
            icon={<Users className="size-3.5" />}
          />
        </div>
      </div>

      {/* Payment and Ledger history */}
      {ledger.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--hub-stat-label)]">
            {t('settings.billingTab.история_платежей')} и начислений
          </p>
          <div className="rounded-xl border border-[color:var(--hub-tile-icon-border)] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--hub-tile-icon-border)] bg-[rgba(0,0,0,0.2)]">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-[color:var(--hub-stat-label)] uppercase tracking-wide">
                    {t('settings.billingTab.дата')}
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-[color:var(--hub-stat-label)] uppercase tracking-wide">
                    Действие
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-[color:var(--hub-stat-label)] uppercase tracking-wide">
                    {t('settings.billingTab.сумма')}
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-[color:var(--hub-stat-label)] uppercase tracking-wide">
                    Обоснование
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--hub-card-border)]">
                {ledger.map((row) => (
                  <tr key={row.id || `${row.createdAt}-${row.planCode}`} className="hover:bg-[var(--hub-action-hover)] transition-colors">
                    <td className="px-4 py-3 text-[color:var(--theme-accent-link-dim)] whitespace-nowrap">
                      {formatDate(row.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400">
                        {row.action === 'plan_activated' ? 'Активация' : row.action === 'plan_renewed' ? 'Продление' : row.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-[color:var(--app-text)] whitespace-nowrap">
                      {(row.amountMinorUnits / 100).toLocaleString('ru-RU')} {row.currency}
                    </td>
                    <td className="px-4 py-3 text-xs text-[color:var(--workspace-text-muted)]">
                      {row.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
