import { Connection, Types } from 'mongoose';
import { BillingService } from './billing.service';
import type { SubscriptionPlanRepository } from './repository/subscription-plan.repository';
import type { OrganizationSubscriptionRepository } from './repository/organization-subscription.repository';
import type { BillingLedgerRepository } from './repository/billing-ledger.repository';
import type { AuditService } from '../audit/audit.service';
import type { IdempotencyService } from '../../shared/idempotency/idempotency.service';
import type { AdminContext } from '../../shared/admin/admin-context';
import type { TenantContext } from '../../shared/tenant/tenant-context';
import { AppException } from '../../shared/errors/app-exception';

function makeAdminContext(overrides: Partial<AdminContext> = {}): AdminContext {
  return {
    identityId: new Types.ObjectId().toString(),
    adminAccountId: new Types.ObjectId().toString(),
    isSuperAdmin: false,
    ...overrides,
  };
}

/** Идемпотентность в этих тестах не проверяется — важен сам вызов репозитория. */
function idem() {
  return { identityId: new Types.ObjectId(), key: new Types.ObjectId().toString(), requestBody: { probe: 1 } };
}

function makeTenantContext(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    organizationId: new Types.ObjectId().toString(),
    positionId: new Types.ObjectId().toString(),
    identityId: new Types.ObjectId().toString(),
    ...overrides,
  };
}

describe('BillingService', () => {
  let service: BillingService;
  let mockConnection: Partial<Connection>;
  let mockPlanRepo: Partial<SubscriptionPlanRepository>;
  let mockSubRepo: Partial<OrganizationSubscriptionRepository>;
  let mockLedgerRepo: Partial<BillingLedgerRepository>;
  let mockAuditService: Partial<AuditService>;
  let mockIdempotencyService: Partial<IdempotencyService>;

  beforeEach(() => {
    mockConnection = {
      startSession: jest.fn().mockResolvedValue({
        withTransaction: jest.fn().mockImplementation((cb) => cb({} as unknown as never)),
        endSession: jest.fn().mockResolvedValue(undefined),
      }),
    };

    mockPlanRepo = {
      listActive: jest.fn().mockResolvedValue([
        {
          code: 'agency_trial',
          name: 'Agency Trial',
          limits: {
            maxActiveListings: 30,
            maxTeamPositions: 5,
            crmAccess: true,
            chessboardAccess: true,
            landingAccess: false,
          },
          pricePerMonth: { amountMinorUnits: 0, currency: 'USD' },
          isActive: true,
        },
      ]),
      findByCode: jest.fn().mockImplementation((code: string) => {
        if (code === 'agency_trial' || code === 'agency_pro') {
          return Promise.resolve({
            code,
            name: code === 'agency_trial' ? 'Agency Trial' : 'Agency Pro',
            limits: {
              maxActiveListings: 100,
              maxTeamPositions: 10,
              crmAccess: true,
              chessboardAccess: true,
              landingAccess: true,
            },
            pricePerMonth: { amountMinorUnits: 14900, currency: 'USD' },
            isActive: true,
          });
        }
        return Promise.resolve(null);
      }),
      upsertPlan: jest.fn().mockImplementation((p) => Promise.resolve(p)),
    };

    mockSubRepo = {
      findByOrganizationId: jest.fn().mockResolvedValue(null),
      upsertSubscription: jest.fn().mockImplementation((sub) =>
        Promise.resolve({
          _id: new Types.ObjectId(),
          ...sub,
        }),
      ),
      updateStatus: jest.fn().mockImplementation((orgId, status, graceEnd) =>
        Promise.resolve({
          organizationId: orgId,
          status,
          gracePeriodEndsAt: graceEnd,
        }),
      ),
    };

    mockLedgerRepo = {
      appendEntry: jest.fn().mockImplementation((entry) =>
        Promise.resolve({
          _id: new Types.ObjectId(),
          ...entry,
        }),
      ),
      listByOrganizationId: jest.fn().mockResolvedValue([
        {
          _id: new Types.ObjectId(),
          planCode: 'agency_trial',
          action: 'plan_activated',
          amountMinorUnits: 0,
          currency: 'USD',
          periodDays: 14,
          reason: 'Initial trial period',
          createdAt: new Date(),
        },
      ]),
    };

    mockAuditService = {
      append: jest.fn().mockResolvedValue({} as unknown as never),
    };

    mockIdempotencyService = {
      checkReplay: jest.fn().mockResolvedValue(null),
      record: jest.fn().mockResolvedValue(undefined),
    };

    service = new BillingService(
      mockConnection as Connection,
      mockPlanRepo as SubscriptionPlanRepository,
      mockSubRepo as OrganizationSubscriptionRepository,
      mockLedgerRepo as BillingLedgerRepository,
      mockAuditService as AuditService,
      mockIdempotencyService as IdempotencyService,
    );
  });

  describe('listPlans', () => {
    it('returns active subscription plans', async () => {
      const plans = await service.listPlans();
      expect(plans).toHaveLength(1);
      expect(plans[0]?.code).toBe('agency_trial');
    });
  });

  describe('getOrganizationSubscription', () => {
    it('creates default trial subscription if none exists', async () => {
      const orgId = new Types.ObjectId();
      const overview = await service.getOrganizationSubscription(orgId);

      expect(mockSubRepo.upsertSubscription).toHaveBeenCalled();
      expect(overview.subscription.planCode).toBe('agency_trial');
      expect(overview.subscription.status).toBe('trial');
      expect(overview.effectiveLimits.maxActiveListings).toBe(100);
    });

    it('returns existing subscription if already present', async () => {
      const orgId = new Types.ObjectId();
      const futureDate = new Date(Date.now() + 10 * 86400000);
      mockSubRepo.findByOrganizationId = jest.fn().mockResolvedValue({
        organizationId: orgId,
        planCode: 'agency_pro',
        status: 'active',
        startedAt: new Date(),
        expiresAt: futureDate,
        customLimits: null,
        currentUsage: { activeListings: 12, teamPositions: 3 },
      });

      const overview = await service.getOrganizationSubscription(orgId);
      expect(overview.subscription.planCode).toBe('agency_pro');
      expect(overview.subscription.status).toBe('active');
    });
  });

  describe('getLedgerForOwner', () => {
    it('returns ledger entries for the tenant organization', async () => {
      const tenantContext = makeTenantContext();
      const ledger = await service.getLedgerForOwner(tenantContext);

      expect(mockLedgerRepo.listByOrganizationId).toHaveBeenCalledWith(
        new Types.ObjectId(tenantContext.organizationId),
        50,
      );
      expect(ledger).toHaveLength(1);
    });
  });

  describe('adminActivateSubscription', () => {
    it('throws error if reason is shorter than 10 characters', async () => {
      const adminCtx = makeAdminContext();
      const orgId = new Types.ObjectId();

      await expect(
        service.adminActivateSubscription(adminCtx, {
          organizationId: orgId,
          planCode: 'agency_pro',
          reason: 'Too short',
          idempotency: idem(),
        }),
      ).rejects.toThrow(AppException);
    });

    it('activates plan, records ledger entry, and appends audit event within transaction', async () => {
      const adminCtx = makeAdminContext();
      const orgId = new Types.ObjectId();

      const result = await service.adminActivateSubscription(adminCtx, {
        organizationId: orgId,
        planCode: 'agency_pro',
        periodDays: 60,
        amountMinorUnits: 29800,
        currency: 'USD',
        reason: 'Payment received via bank transfer invoice #1042',
        idempotency: idem(),
      });

      expect(mockSubRepo.upsertSubscription).toHaveBeenCalled();
      expect(mockLedgerRepo.appendEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          planCode: 'agency_pro',
          periodDays: 60,
          amountMinorUnits: 29800,
          reason: 'Payment received via bank transfer invoice #1042',
        }),
        expect.anything(),
      );
      expect(mockAuditService.append).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'billing.subscription.activate',
          resource: 'organization_subscription',
          reason: 'Payment received via bank transfer invoice #1042',
        }),
        expect.anything(),
      );
      expect(result.planCode).toBe('agency_pro');
      expect(result.status).toBe('active');
    });
  });
});
