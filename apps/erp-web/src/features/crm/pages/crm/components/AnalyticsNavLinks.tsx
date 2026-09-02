import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import { CRM_ANALYTICS_BASE } from '@/features/crm/crmAnalyticsPaths';
import { useI18n } from "@/i18n";

interface AnalyticsNavLinksProps {
  className?: string;
}

/** On partner page: "Команда" is active by default. "Детали менеджера" is active only after clicking that tab (?view=referral). */
const PARTNER_PATH_REGEX = /^\/dashboard\/crm\/analytics\/partners\/[^/]+$/;
const REFERRAL_VIEW_SEARCH = '?view=referral';

const navBaseClass =
  'max-w-full rounded-sm border px-3 py-2 text-center text-[16px] leading-tight font-normal whitespace-nowrap transition-colors';

export function AnalyticsNavLinks({ className }: AnalyticsNavLinksProps) {
    const { t } = useI18n();
  const { role } = useRolePermissions();
  const location = useLocation();

  // Managers do not have access to Команда overview: hide navigation bar
  if (role === 'manager') {
    return null;
  }

  const isOnPartnerPage = PARTNER_PATH_REGEX.test(location.pathname);
  const isReferralView = isOnPartnerPage && location.search.includes('view=referral');
  const isNetworkActive =
    location.pathname === CRM_ANALYTICS_BASE || (isOnPartnerPage && !isReferralView);

  const activeClass =
    'border-primary bg-primary/15 text-[#d0e8df] font-medium shadow-sm hover:bg-primary/20';
  const inactiveClass =
    'border-input bg-background text-[color:var(--workspace-text-muted)] hover:bg-accent hover:text-[#d0e8df]';

  return (
    <span className={cn('inline-flex max-w-full flex-wrap items-center justify-center gap-2', className)}>
      <Link
        to={CRM_ANALYTICS_BASE}
        className={cn(navBaseClass, isNetworkActive ? activeClass : inactiveClass)}
        aria-current={isNetworkActive ? 'page' : undefined}
      >
        {t('crm.crm.analyticsNavLinks.команда')}</Link>
      {isOnPartnerPage ? (
        <Link
          to={location.pathname + REFERRAL_VIEW_SEARCH}
          className={cn(navBaseClass, isReferralView ? activeClass : inactiveClass)}
          aria-current={isReferralView ? 'page' : undefined}
        >
          {t('crm.crm.analyticsNavLinks.детали_менеджера')}</Link>
      ) : (
        <span
          className={cn(
            navBaseClass,
            'cursor-not-allowed border-input bg-muted/50 text-muted-foreground opacity-70',
          )}
          aria-disabled
          title={t('crm.crm.analyticsNavLinks.select_a_manager_fro')}
        >
          {t('crm.crm.analyticsNavLinks.детали_менеджера')}</span>
      )}
    </span>
  );
}
