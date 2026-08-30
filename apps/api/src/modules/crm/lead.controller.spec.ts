import { Types } from 'mongoose';
import { LeadController } from './lead.controller';
import type { CrmService } from './crm.service';
import type { PolicyEvaluatorService } from '../authorization/policy-evaluator.service';

function makeRequest(organizationId: Types.ObjectId, positionId: Types.ObjectId) {
  return {
    tenantContext: {
      organizationId: organizationId.toString(),
      positionId: positionId.toString(),
      identityId: new Types.ObjectId().toString(),
    },
  };
}

describe('LeadController — read scope', () => {
  it('сужает GET /leads для own-grant до текущей Position прямо в CRM query', async () => {
    const organizationId = new Types.ObjectId();
    const positionId = new Types.ObjectId();
    const listLeads = jest.fn().mockResolvedValue({ items: [] });
    const matchingScopes = jest.fn().mockResolvedValue(['own']);
    const controller = new LeadController(
      { listLeads } as unknown as CrmService,
      { matchingScopes } as unknown as PolicyEvaluatorService,
    );

    await controller.listLeads(makeRequest(organizationId, positionId) as never, { limit: 20 });

    expect(listLeads).toHaveBeenCalledWith({
      organizationId,
      ownerPositionId: positionId,
      stage: undefined,
      cursor: undefined,
      limit: 20,
    });
  });

  it('не сужает GET /leads для organization-grant', async () => {
    const organizationId = new Types.ObjectId();
    const positionId = new Types.ObjectId();
    const listLeads = jest.fn().mockResolvedValue({ items: [], nextCursor: null });
    const controller = new LeadController(
      { listLeads } as unknown as CrmService,
      { matchingScopes: jest.fn().mockResolvedValue(['organization']) } as unknown as PolicyEvaluatorService,
    );

    await controller.listLeads(makeRequest(organizationId, positionId) as never, { limit: 20 });

    expect(listLeads).toHaveBeenCalledWith({
      organizationId,
      ownerPositionId: undefined,
      stage: undefined,
      cursor: undefined,
      limit: 20,
    });
  });

  it('own-grant: клиентский ownerPositionId, совпадающий со своей позицией, проходит без изменений', async () => {
    const organizationId = new Types.ObjectId();
    const positionId = new Types.ObjectId();
    const listLeads = jest.fn().mockResolvedValue({ items: [], nextCursor: null });
    const controller = new LeadController(
      { listLeads } as unknown as CrmService,
      { matchingScopes: jest.fn().mockResolvedValue(['own']) } as unknown as PolicyEvaluatorService,
    );

    await controller.listLeads(makeRequest(organizationId, positionId) as never, {
      limit: 20,
      ownerPositionId: positionId.toString(),
    });

    expect(listLeads).toHaveBeenCalledWith({
      organizationId,
      ownerPositionId: positionId,
      stage: undefined,
      cursor: undefined,
      limit: 20,
    });
  });

  it('own-grant: клиентский ownerPositionId чужой позиции отклоняется 400, не расширяет scope', async () => {
    const organizationId = new Types.ObjectId();
    const positionId = new Types.ObjectId();
    const otherPositionId = new Types.ObjectId();
    const listLeads = jest.fn().mockResolvedValue({ items: [], nextCursor: null });
    const controller = new LeadController(
      { listLeads } as unknown as CrmService,
      { matchingScopes: jest.fn().mockResolvedValue(['own']) } as unknown as PolicyEvaluatorService,
    );

    await expect(
      controller.listLeads(makeRequest(organizationId, positionId) as never, {
        limit: 20,
        ownerPositionId: otherPositionId.toString(),
      }),
    ).rejects.toThrow('ownerPositionId filter is outside the caller permission scope');
    expect(listLeads).not.toHaveBeenCalled();
  });

  it('organization-grant: пробрасывает cursor как ObjectId в CrmService.listLeads', async () => {
    const organizationId = new Types.ObjectId();
    const positionId = new Types.ObjectId();
    const cursor = new Types.ObjectId();
    const listLeads = jest.fn().mockResolvedValue({ items: [], nextCursor: null });
    const controller = new LeadController(
      { listLeads } as unknown as CrmService,
      { matchingScopes: jest.fn().mockResolvedValue(['organization']) } as unknown as PolicyEvaluatorService,
    );

    await controller.listLeads(makeRequest(organizationId, positionId) as never, {
      limit: 20,
      cursor: cursor.toString(),
    });

    expect(listLeads).toHaveBeenCalledWith({
      organizationId,
      ownerPositionId: undefined,
      stage: undefined,
      cursor,
      limit: 20,
    });
  });
});

describe('LeadController — GET /leads/:leadId/events', () => {
  it('передаёт leadId/organizationId/ownerPositionId/cursor/limit в CrmService.listLeadEvents', async () => {
    const organizationId = new Types.ObjectId();
    const positionId = new Types.ObjectId();
    const leadId = new Types.ObjectId();
    const cursor = new Types.ObjectId();
    const listLeadEvents = jest.fn().mockResolvedValue({ items: [], nextCursor: null });
    const controller = new LeadController(
      { listLeadEvents } as unknown as CrmService,
      { matchingScopes: jest.fn().mockResolvedValue(['own']) } as unknown as PolicyEvaluatorService,
    );

    await controller.listLeadEvents(makeRequest(organizationId, positionId) as never, leadId, {
      limit: 20,
      cursor: cursor.toString(),
    });

    expect(listLeadEvents).toHaveBeenCalledWith({
      leadId,
      organizationId,
      ownerPositionId: positionId,
      cursor,
      limit: 20,
    });
  });
});
