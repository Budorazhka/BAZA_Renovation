import { useEffect, useState } from 'react'
import { Check, X, Zap, Crown, Building2, RefreshCw } from 'lucide-react'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { useI18n } from "@/i18n";
import { billingApiV2, type OrganizationSubscriptionOverview, type SubscriptionPlan } from '@/services/billingApiV2';

const C = {
  gold: 'var(--gold)',
  white: '#ffffff',
  whiteMid: 'rgba(255,255,255,0.7)',
  whiteLow: 'rgba(255,255,255,0.4)',
  border: 'var(--green-border)',
  card: 'var(--green-card)',
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

export function TariffPage() {
  const { t } = useI18n();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [overview, setOverview] = useState<OrganizationSubscriptionOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [plansData, overviewData] = await Promise.all([
          billingApiV2.listPlans(),
          billingApiV2.getSubscription(),
        ]);
        setPlans(plansData);
        setOverview(overviewData);
      } catch (err) {
        console.error('Failed to load tariff data', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const currentPlanCode = overview?.subscription?.planCode;
  const currentUsage = overview?.subscription?.currentUsage;
  const effectiveLimits = overview?.effectiveLimits;

  const usageCards = [
    {
      label: 'Объекты в каталоге',
      used: currentUsage?.activeListings ?? 0,
      max: effectiveLimits?.maxActiveListings ?? 100,
      color: '#4ade80',
    },
    {
      label: 'Позиции в команде',
      used: currentUsage?.teamPositions ?? 1,
      max: effectiveLimits?.maxTeamPositions ?? 10,
      color: '#60a5fa',
    },
  ];

  return (
    <DashboardShell>
      <div style={{ padding: '24px 28px 48px' }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 20, fontWeight: 400, color: C.white, marginBottom: 4 }}>
            {t('settings.tariffPage.тарифные_планы')}
          </div>
          <div style={{ fontSize: 12, color: C.whiteLow }}>
            {t('settings.tariffPage.текущий_тариф')}{' '}
            <span style={{ color: C.gold, fontWeight: 500 }}>
              {overview?.plan?.name || currentPlanCode || '—'}
            </span>{' '}
            · Действует до: {formatDate(overview?.subscription?.expiresAt)}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-12 text-sm text-[color:var(--hub-stat-label)]">
            <RefreshCw className="mr-2 size-4 animate-spin" />
            Загрузка тарифов...
          </div>
        ) : (
          <>
            {/* Current usage */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 320px))', gap: 16, marginBottom: 28 }}>
              {usageCards.map(s => (
                <div key={s.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, color: C.whiteLow, marginBottom: 6 }}>{s.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 500, color: s.color, marginBottom: 6 }}>
                    {s.used} / {s.max}
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)' }}>
                    <div
                      style={{
                        width: `${Math.min(100, (s.used / s.max) * 100)}%`,
                        height: '100%',
                        borderRadius: 2,
                        background: s.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Plans grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, maxWidth: 1000 }}>
              {plans.map(plan => {
                const isCurrent = plan.code === currentPlanCode;
                const priceFormatted = plan.pricePerMonth.amountMinorUnits === 0
                  ? 'Бесплатно'
                  : `$${(plan.pricePerMonth.amountMinorUnits / 100).toLocaleString('ru-RU')}`;

                const icon = plan.limits.maxActiveListings >= 200
                  ? <Building2 size={20} />
                  : plan.limits.maxActiveListings >= 50
                    ? <Crown size={20} />
                    : <Zap size={20} />;

                const color = isCurrent ? '#c9a84c' : '#60a5fa';

                const features = [
                  { label: `До ${plan.limits.maxActiveListings} объектов`, included: true },
                  { label: `До ${plan.limits.maxTeamPositions} сотрудников`, included: true },
                  { label: 'CRM-воронка лидов', included: plan.limits.crmAccess },
                  { label: 'Интерактивная шахматка', included: plan.limits.chessboardAccess },
                  { label: 'Персональный сайт-лендинг', included: plan.limits.landingAccess },
                ];

                return (
                  <div
                    key={plan.code}
                    style={{
                      background: isCurrent ? `${color}08` : C.card,
                      border: `1px solid ${isCurrent ? `${color}55` : C.border}`,
                      borderRadius: 14,
                      padding: '22px 20px',
                      position: 'relative',
                    }}
                  >
                    {isCurrent && (
                      <div style={{
                        position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)',
                        fontSize: 9, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase',
                        padding: '3px 12px', borderRadius: 20,
                        background: `${color}22`, border: `1px solid ${color}66`, color: color,
                        whiteSpace: 'nowrap',
                      }}>
                        {t('settings.tariffPage.текущий_план')}
                      </div>
                    )}

                    {/* Icon + name */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                      <div style={{ color: color }}>{icon}</div>
                      <div style={{ fontSize: 16, fontWeight: 500, color: C.white }}>{plan.name}</div>
                    </div>

                    {/* Price */}
                    <div style={{ marginBottom: 20 }}>
                      <span style={{ fontSize: 24, fontWeight: 600, color: color }}>{priceFormatted}</span>
                      {plan.pricePerMonth.amountMinorUnits > 0 && (
                        <span style={{ fontSize: 12, color: C.whiteLow, marginLeft: 4 }}>/мес</span>
                      )}
                    </div>

                    {/* Features */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                      {features.map((f, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {f.included
                            ? <Check size={13} color="#4ade80" style={{ flexShrink: 0 }} />
                            : <X size={13} color="rgba(255,255,255,0.2)" style={{ flexShrink: 0 }} />
                          }
                          <span style={{ fontSize: 12, color: f.included ? C.whiteMid : 'rgba(255,255,255,0.25)' }}>
                            {f.label}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* CTA */}
                    <button
                      disabled={isCurrent}
                      style={{
                        width: '100%', padding: '10px 0', borderRadius: 10,
                        fontSize: 12, fontWeight: 500, cursor: isCurrent ? 'default' : 'pointer',
                        background: isCurrent ? `${color}10` : `${color}18`,
                        border: `1px solid ${isCurrent ? `${color}33` : `${color}55`}`,
                        color: isCurrent ? `${color}88` : color,
                        letterSpacing: '0.05em',
                      }}
                    >
                      {isCurrent ? 'Текущий план' : 'Выбрать тариф'}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </DashboardShell>
  )
}
