import { Types } from 'mongoose';
import { LeadController } from './lead.controller';
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
  };
}

describe('LeadController.createLead', () => {
  it('пробрасывает contactId/requesterName/requesterPhone + actor/organization из tenantContext', async () => {
    const organizationId = new Types.ObjectId();
    const positionId = new Types.ObjectId();
    const contactId = new Types.ObjectId();
    const createLead = jest.fn().mockResolvedValue({ id: 'lead-1', ownerPositionId: null, stage: 'new' });
    const controller = new LeadController(
      { createLead } as unknown as CrmService,
      { matchingScopes: jest.fn() } as unknown as PolicyEvaluatorService,
      noReplay(),
    );
    const req = makeRequest(organizationId, positionId);

    const result = await controller.createLead(req as never, {
      contactId: contactId.toString(),
      requesterName: 'Игнорируется, если есть contactId',
    }, 'key-1');

    expect(createLead).toHaveBeenCalledWith({
      organizationId,
      contactId,
      requesterName: 'Игнорируется, если есть contactId',
      requesterPhone: undefined,
      actorPositionId: positionId,
      actorIdentityId: new Types.ObjectId(req.tenantContext.identityId),
      correlationId: undefined,
      idempotencyKey: 'key-1',
      idempotencyRequestBody: {
        contactId: contactId.toString(),
        requesterName: 'Игнорируется, если есть contactId',
        requesterPhone: null,
      },
    });
    expect(result).toEqual({ id: 'lead-1', ownerPositionId: null, stage: 'new' });
  });

  it('без contactId передаёт undefined, requesterPhone доходит до сервиса как есть', async () => {
    const organizationId = new Types.ObjectId();
    const positionId = new Types.ObjectId();
    const createLead = jest.fn().mockResolvedValue({ id: 'lead-2' });
    const controller = new LeadController(
      { createLead } as unknown as CrmService,
      { matchingScopes: jest.fn() } as unknown as PolicyEvaluatorService,
      noReplay(),
    );

    await controller.createLead(makeRequest(organizationId, positionId) as never, {
      requesterPhone: '+995500000009',
    }, 'key-2');

    expect(createLead).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: undefined, requesterPhone: '+995500000009' }),
    );
  });
});

describe('LeadController.changeStage', () => {
  it('без Idempotency-Key — IDEMPOTENCY_KEY_REQUIRED, сервис не вызывается', async () => {
    const organizationId = new Types.ObjectId();
    const positionId = new Types.ObjectId();
    const leadId = new Types.ObjectId();
    const changeLeadStage = jest.fn();
    const checkReplay = jest.fn();
    const controller = new LeadController(
      { changeLeadStage } as unknown as CrmService,
      { matchingScopes: jest.fn().mockResolvedValue(['organization']) } as unknown as PolicyEvaluatorService,
      { checkReplay } as unknown as IdempotencyService,
    );

    await expect(
      controller.changeStage(makeRequest(organizationId, positionId) as never, leadId, {
        stage: 'contacted',
        expectedVersion: 0,
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
    expect(changeLeadStage).not.toHaveBeenCalled();
    expect(checkReplay).not.toHaveBeenCalled();
  });

  it('повтор с тем же Idempotency-Key возвращает сохранённый ответ, не вызывает сервис повторно', async () => {
    const organizationId = new Types.ObjectId();
    const positionId = new Types.ObjectId();
    const leadId = new Types.ObjectId();
    const changeLeadStage = jest.fn();
    const checkReplay = jest.fn().mockResolvedValue({
      responseStatus: 200,
      responseBody: { id: leadId.toString(), stage: 'contacted', version: 1 },
    });
    const controller = new LeadController(
      { changeLeadStage } as unknown as CrmService,
      { matchingScopes: jest.fn().mockResolvedValue(['organization']) } as unknown as PolicyEvaluatorService,
      { checkReplay } as unknown as IdempotencyService,
    );

    const result = await controller.changeStage(
      makeRequest(organizationId, positionId) as never,
      leadId,
      { stage: 'contacted', expectedVersion: 0 },
      'same-key',
    );

    expect(result).toEqual({ id: leadId.toString(), stage: 'contacted', version: 1 });
    expect(changeLeadStage).not.toHaveBeenCalled();
  });

  it('пробрасывает leadId/stage/expectedVersion + actor/organization из tenantContext, с idempotencyKey', async () => {
    const organizationId = new Types.ObjectId();
    const positionId = new Types.ObjectId();
    const leadId = new Types.ObjectId();
    const changeLeadStage = jest.fn().mockResolvedValue({ id: leadId.toString(), stage: 'contacted', version: 1 });
    const controller = new LeadController(
      { changeLeadStage } as unknown as CrmService,
      { matchingScopes: jest.fn().mockResolvedValue(['organization']) } as unknown as PolicyEvaluatorService,
      { checkReplay: jest.fn().mockResolvedValue(null) } as unknown as IdempotencyService,
    );
    const req = makeRequest(organizationId, positionId);

    await controller.changeStage(
      req as never,
      leadId,
      { stage: 'contacted', expectedVersion: 0 },
      'key-1',
    );

    expect(changeLeadStage).toHaveBeenCalledWith({
      leadId,
      newStage: 'contacted',
      expectedVersion: 0,
      actorPositionId: positionId,
      actorIdentityId: new Types.ObjectId(req.tenantContext.identityId),
      expectedOrganizationId: organizationId,
      requiredOwnerPositionId: undefined,
      correlationId: undefined,
      idempotencyKey: 'key-1',
      idempotencyRequestBody: {
        leadId: leadId.toString(),
        stage: 'contacted',
        expectedVersion: 0,
      },
    });
  });
});

describe('LeadController — read scope', () => {
  it('сужает GET /leads для own-grant до текущей Position прямо в CRM query', async () => {
    const organizationId = new Types.ObjectId();
    const positionId = new Types.ObjectId();
    const listLeads = jest.fn().mockResolvedValue({ items: [] });
    const matchingScopes = jest.fn().mockResolvedValue(['own']);
    const controller = new LeadController(
      { listLeads } as unknown as CrmService,
      { matchingScopes } as unknown as PolicyEvaluatorService,
      noReplay(),
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
      noReplay(),
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
      noReplay(),
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
      noReplay(),
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
      noReplay(),
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
      noReplay(),
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

describe('LeadController — GET /leads/:leadId/timeline', () => {
  it('передаёт параметры запроса в CrmService.getLeadTimeline с учётом own-scope', async () => {
    const organizationId = new Types.ObjectId();
    const positionId = new Types.ObjectId();
    const leadId = new Types.ObjectId();
    const getLeadTimeline = jest.fn().mockResolvedValue({ items: [], nextCursor: null });
    const controller = new LeadController(
      { getLeadTimeline } as unknown as CrmService,
      { matchingScopes: jest.fn().mockResolvedValue(['own']) } as unknown as PolicyEvaluatorService,
      noReplay(),
    );

    await controller.getLeadTimeline(makeRequest(organizationId, positionId) as never, leadId, {
      type: 'lead_stage_changed',
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-31T23:59:59.999Z',
      cursor: 'cursor-123',
      limit: 10,
    });

    expect(getLeadTimeline).toHaveBeenCalledWith({
      leadId,
      organizationId,
      ownerPositionId: positionId,
      type: 'lead_stage_changed',
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-31T23:59:59.999Z',
      cursor: 'cursor-123',
      limit: 10,
    });
  });
});
