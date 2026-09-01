import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { DealController } from './deal.controller';
import type { CrmService } from './crm.service';
import type { PolicyEvaluatorService } from '../authorization/policy-evaluator.service';
import type { IdempotencyService } from '../../shared/idempotency/idempotency.service';

/** Повторов в этих тестах нет: checkReplay всегда отдаёт null. */
const noReplay = () => ({ checkReplay: jest.fn().mockResolvedValue(null) }) as unknown as IdempotencyService;

function makeRequest(organizationId: Types.ObjectId, positionId: Types.ObjectId) {
  return {
    tenantContext: {
      organizationId: organizationId.toString(),
      positionId: positionId.toString(),
      identityId: new Types.ObjectId().toString(),
    },
    correlationId: 'req-corr-deal-123',
  };
}

describe('DealController', () => {
  describe('listDeals', () => {
    it('scopes query to ownerPositionId for own-grant', async () => {
      const organizationId = new Types.ObjectId();
      const positionId = new Types.ObjectId();
      const listDeals = jest.fn().mockResolvedValue({ items: [], nextCursor: null });
      const matchingScopes = jest.fn().mockResolvedValue(['own']);
      const controller = new DealController(
        { listDeals } as unknown as CrmService,
        { matchingScopes } as unknown as PolicyEvaluatorService,
      noReplay(),
      );

      await controller.listDeals(makeRequest(organizationId, positionId) as never, { limit: 20 });

      expect(listDeals).toHaveBeenCalledWith({
        organizationId,
        ownerPositionId: positionId,
        stage: undefined,
        leadId: undefined,
        contactId: undefined,
        cursor: undefined,
        limit: 20,
      });
    });

    it('does not scope query to position for organization-grant', async () => {
      const organizationId = new Types.ObjectId();
      const positionId = new Types.ObjectId();
      const listDeals = jest.fn().mockResolvedValue({ items: [], nextCursor: null });
      const matchingScopes = jest.fn().mockResolvedValue(['organization']);
      const controller = new DealController(
        { listDeals } as unknown as CrmService,
        { matchingScopes } as unknown as PolicyEvaluatorService,
      noReplay(),
      );

      await controller.listDeals(makeRequest(organizationId, positionId) as never, { limit: 20 });

      expect(listDeals).toHaveBeenCalledWith({
        organizationId,
        ownerPositionId: undefined,
        stage: undefined,
        leadId: undefined,
        contactId: undefined,
        cursor: undefined,
        limit: 20,
      });
    });

    it('throws BadRequestException when own-grant requests a different ownerPositionId', async () => {
      const organizationId = new Types.ObjectId();
      const positionId = new Types.ObjectId();
      const otherPositionId = new Types.ObjectId();
      const listDeals = jest.fn().mockResolvedValue({ items: [], nextCursor: null });
      const matchingScopes = jest.fn().mockResolvedValue(['own']);
      const controller = new DealController(
        { listDeals } as unknown as CrmService,
        { matchingScopes } as unknown as PolicyEvaluatorService,
      noReplay(),
      );

      await expect(
        controller.listDeals(makeRequest(organizationId, positionId) as never, {
          ownerPositionId: otherPositionId.toString(),
          limit: 20,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getDeal', () => {
    it('passes requiredOwnerPositionId for own-grant to prevent disclosure', async () => {
      const dealId = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const positionId = new Types.ObjectId();
      const getDeal = jest.fn().mockResolvedValue({ id: dealId.toString() });
      const matchingScopes = jest.fn().mockResolvedValue(['own']);
      const controller = new DealController(
        { getDeal } as unknown as CrmService,
        { matchingScopes } as unknown as PolicyEvaluatorService,
      noReplay(),
      );

      const result = await controller.getDeal(makeRequest(organizationId, positionId) as never, dealId);

      expect(getDeal).toHaveBeenCalledWith({
        dealId,
        organizationId,
        requiredOwnerPositionId: positionId,
      });
      expect(result).toEqual({ id: dealId.toString() });
    });
  });

  describe('createDeal', () => {
    it('defaults ownerPositionId to caller position for own-scope', async () => {
      const organizationId = new Types.ObjectId();
      const positionId = new Types.ObjectId();
      const contactId = new Types.ObjectId();
      const createDeal = jest.fn().mockResolvedValue({ id: 'deal-1' });
      const matchingScopes = jest.fn().mockResolvedValue(['own']);
      const controller = new DealController(
        { createDeal } as unknown as CrmService,
        { matchingScopes } as unknown as PolicyEvaluatorService,
      noReplay(),
      );

      await controller.createDeal(makeRequest(organizationId, positionId) as never, {
        contactId: contactId.toString(),
        title: 'New Deal',
      }, 'test-key');

      expect(createDeal).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId,
          contactId,
          ownerPositionId: positionId,
          title: 'New Deal',
        }),
      );
    });
  });

  describe('changeDealStage', () => {
    it('delegates to crmService with expectedVersion and actor context', async () => {
      const dealId = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const positionId = new Types.ObjectId();
      const changeDealStage = jest.fn().mockResolvedValue({ id: dealId.toString(), stage: 'deposit' });
      const matchingScopes = jest.fn().mockResolvedValue(['organization']);
      const controller = new DealController(
        { changeDealStage } as unknown as CrmService,
        { matchingScopes } as unknown as PolicyEvaluatorService,
      noReplay(),
      );

      await controller.changeDealStage(makeRequest(organizationId, positionId) as never, dealId, {
        stage: 'deposit',
        expectedVersion: 0,
        reason: 'Deposit received',
      });

      expect(changeDealStage).toHaveBeenCalledWith(
        expect.objectContaining({
          dealId,
          organizationId,
          newStage: 'deposit',
          expectedVersion: 0,
          reason: 'Deposit received',
        }),
      );
    });
  });

  describe('reassignDeal', () => {
    it('resolves scope against resource "client" (not "deal") and delegates ownerPositionId', async () => {
      const dealId = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const positionId = new Types.ObjectId();
      const targetPositionId = new Types.ObjectId();
      const reassignDeal = jest.fn().mockResolvedValue({ id: dealId.toString(), ownerPositionId: targetPositionId.toString() });
      const matchingScopes = jest.fn().mockResolvedValue(['organization']);
      const controller = new DealController(
        { reassignDeal } as unknown as CrmService,
        { matchingScopes } as unknown as PolicyEvaluatorService,
      noReplay(),
      );

      await controller.reassignDeal(makeRequest(organizationId, positionId) as never, dealId, {
        expectedVersion: 0,
        ownerPositionId: targetPositionId.toString(),
      });

      expect(matchingScopes).toHaveBeenCalledWith(
        expect.objectContaining({ resource: 'client', action: 'reassign' }),
      );
      expect(reassignDeal).toHaveBeenCalledWith(
        expect.objectContaining({
          dealId,
          organizationId,
          requiredScopePositionId: undefined,
          expectedVersion: 0,
          ownerPositionId: targetPositionId,
        }),
      );
    });

    it('own-scope grant narrows requiredScopePositionId to the caller position', async () => {
      const dealId = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const positionId = new Types.ObjectId();
      const targetPositionId = new Types.ObjectId();
      const reassignDeal = jest.fn().mockResolvedValue({ id: dealId.toString() });
      const matchingScopes = jest.fn().mockResolvedValue(['own']);
      const controller = new DealController(
        { reassignDeal } as unknown as CrmService,
        { matchingScopes } as unknown as PolicyEvaluatorService,
      noReplay(),
      );

      await controller.reassignDeal(makeRequest(organizationId, positionId) as never, dealId, {
        expectedVersion: 0,
        ownerPositionId: targetPositionId.toString(),
      });

      expect(reassignDeal).toHaveBeenCalledWith(
        expect.objectContaining({ requiredScopePositionId: positionId }),
      );
    });
  });
});
