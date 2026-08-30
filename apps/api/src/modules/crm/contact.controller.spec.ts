import { Types } from 'mongoose';
import { ContactController } from './contact.controller';
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

describe('ContactController — GET /contacts', () => {
  it('organization-grant: не сужает — ownerPositionId:undefined в CrmService.listContacts', async () => {
    const organizationId = new Types.ObjectId();
    const positionId = new Types.ObjectId();
    const listContacts = jest.fn().mockResolvedValue({ items: [], nextCursor: null });
    const controller = new ContactController(
      { listContacts } as unknown as CrmService,
      { matchingScopes: jest.fn().mockResolvedValue(['organization']) } as unknown as PolicyEvaluatorService,
    );

    await controller.listContacts(makeRequest(organizationId, positionId) as never, { limit: 20 });

    expect(listContacts).toHaveBeenCalledWith({
      organizationId,
      ownerPositionId: undefined,
      q: undefined,
      cursor: undefined,
      limit: 20,
    });
  });

  it('own-grant: сужает GET /contacts до текущей Position', async () => {
    const organizationId = new Types.ObjectId();
    const positionId = new Types.ObjectId();
    const listContacts = jest.fn().mockResolvedValue({ items: [], nextCursor: null });
    const controller = new ContactController(
      { listContacts } as unknown as CrmService,
      { matchingScopes: jest.fn().mockResolvedValue(['own']) } as unknown as PolicyEvaluatorService,
    );

    await controller.listContacts(makeRequest(organizationId, positionId) as never, { limit: 20 });

    expect(listContacts).toHaveBeenCalledWith({
      organizationId,
      ownerPositionId: positionId,
      q: undefined,
      cursor: undefined,
      limit: 20,
    });
  });

  it('пробрасывает q и cursor как есть', async () => {
    const organizationId = new Types.ObjectId();
    const positionId = new Types.ObjectId();
    const cursor = new Types.ObjectId();
    const listContacts = jest.fn().mockResolvedValue({ items: [], nextCursor: null });
    const controller = new ContactController(
      { listContacts } as unknown as CrmService,
      { matchingScopes: jest.fn().mockResolvedValue(['organization']) } as unknown as PolicyEvaluatorService,
    );

    await controller.listContacts(makeRequest(organizationId, positionId) as never, {
      q: 'Иван',
      cursor: cursor.toString(),
      limit: 20,
    });

    expect(listContacts).toHaveBeenCalledWith({
      organizationId,
      ownerPositionId: undefined,
      q: 'Иван',
      cursor,
      limit: 20,
    });
  });
});

describe('ContactController — GET /contacts/:contactId', () => {
  it('organization-grant: ownerPositionId:undefined в CrmService.getContact', async () => {
    const organizationId = new Types.ObjectId();
    const positionId = new Types.ObjectId();
    const contactId = new Types.ObjectId();
    const getContact = jest.fn().mockResolvedValue({ id: contactId.toString() });
    const controller = new ContactController(
      { getContact } as unknown as CrmService,
      { matchingScopes: jest.fn().mockResolvedValue(['organization']) } as unknown as PolicyEvaluatorService,
    );

    await controller.getContact(makeRequest(organizationId, positionId) as never, contactId);

    expect(getContact).toHaveBeenCalledWith({ contactId, organizationId, ownerPositionId: undefined });
  });

  it('own-grant: ownerPositionId сужен до текущей Position в CrmService.getContact', async () => {
    const organizationId = new Types.ObjectId();
    const positionId = new Types.ObjectId();
    const contactId = new Types.ObjectId();
    const getContact = jest.fn().mockResolvedValue({ id: contactId.toString() });
    const controller = new ContactController(
      { getContact } as unknown as CrmService,
      { matchingScopes: jest.fn().mockResolvedValue(['own']) } as unknown as PolicyEvaluatorService,
    );

    await controller.getContact(makeRequest(organizationId, positionId) as never, contactId);

    expect(getContact).toHaveBeenCalledWith({ contactId, organizationId, ownerPositionId: positionId });
  });
});

describe('ContactController — GET /contacts/:contactId/timeline', () => {
  it('передаёт параметры запроса в CrmService.getContactTimeline с учётом own-scope', async () => {
    const organizationId = new Types.ObjectId();
    const positionId = new Types.ObjectId();
    const contactId = new Types.ObjectId();
    const getContactTimeline = jest.fn().mockResolvedValue({ items: [], nextCursor: null });
    const controller = new ContactController(
      { getContactTimeline } as unknown as CrmService,
      { matchingScopes: jest.fn().mockResolvedValue(['own']) } as unknown as PolicyEvaluatorService,
    );

    await controller.getContactTimeline(makeRequest(organizationId, positionId) as never, contactId, {
      type: 'task_completed',
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-31T23:59:59.999Z',
      cursor: 'cursor-456',
      limit: 15,
    });

    expect(getContactTimeline).toHaveBeenCalledWith({
      contactId,
      organizationId,
      ownerPositionId: positionId,
      type: 'task_completed',
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-31T23:59:59.999Z',
      cursor: 'cursor-456',
      limit: 15,
    });
  });
});
