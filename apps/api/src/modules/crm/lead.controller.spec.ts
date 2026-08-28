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
      limit: 20,
    });
  });

  it('не сужает GET /leads для organization-grant', async () => {
    const organizationId = new Types.ObjectId();
    const positionId = new Types.ObjectId();
    const listLeads = jest.fn().mockResolvedValue({ items: [] });
    const controller = new LeadController(
      { listLeads } as unknown as CrmService,
      { matchingScopes: jest.fn().mockResolvedValue(['organization']) } as unknown as PolicyEvaluatorService,
    );

    await controller.listLeads(makeRequest(organizationId, positionId) as never, { limit: 20 });

    expect(listLeads).toHaveBeenCalledWith({
      organizationId,
      ownerPositionId: undefined,
      stage: undefined,
      limit: 20,
    });
  });
});
