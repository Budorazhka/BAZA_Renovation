export type SubscriptionStatus = 'trial' | 'active' | 'grace_period' | 'frozen' | 'cancelled';

export interface PlanLimits {
  maxActiveListings: number;
  maxTeamPositions: number;
  crmAccess: boolean;
  chessboardAccess: boolean;
  landingAccess: boolean;
}

export interface PricePerMonth {
  amountMinorUnits: number;
  currency: string;
}

export interface SubscriptionPlan {
  code: string;
  name: string;
  targetAudience: 'developer' | 'agency' | 'independent_realtor';
  limits: PlanLimits;
  pricePerMonth: PricePerMonth;
  isActive: boolean;
}

export interface ResourceUsage {
  activeListings: number;
  teamPositions: number;
}

export interface OrganizationSubscription {
  organizationId: string;
  planCode: string;
  status: SubscriptionStatus;
  startedAt: string;
  expiresAt: string;
  gracePeriodEndsAt?: string | null;
  customLimits?: PlanLimits | null;
  currentUsage: ResourceUsage;
}

export interface OrganizationSubscriptionOverview {
  subscription: OrganizationSubscription;
  plan: SubscriptionPlan | null;
  effectiveLimits: PlanLimits;
}

export interface BillingLedgerEntry {
  id: string;
  organizationId: string;
  action: 'plan_activated' | 'plan_renewed' | 'plan_changed' | 'limit_adjusted' | 'payment_recorded' | 'frozen' | string;
  amountMinorUnits: number;
  currency: string;
  planCode: string;
  periodDays: number;
  reason: string;
  recordedBy?: string;
  createdAt: string;
}
