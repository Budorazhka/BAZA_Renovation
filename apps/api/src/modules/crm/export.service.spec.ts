import { Types } from 'mongoose';
import { ExportService } from './export.service';
import type { CrmService } from './crm.service';
import type { PolicyEvaluatorService } from '../authorization/policy-evaluator.service';
import type { AuditService } from '../audit/audit.service';

const organizationId = new Types.ObjectId();
const positionId = new Types.ObjectId();
const actorIdentityId = new Types.ObjectId();

function makeService(overrides: {
  allowed?: boolean;
  scopes?: string[];
  items?: unknown[];
  crm?: Partial<CrmService>;
} = {}) {
  const evaluate = jest.fn().mockResolvedValue(overrides.allowed ?? true);
  const matchingScopes = jest.fn().mockResolvedValue(overrides.scopes ?? ['organization']);
  const append = jest.fn().mockResolvedValue(undefined);

  const items = overrides.items ?? [];
  const listResult = { items, nextCursor: null };
  const crm = {
    listLeads: jest.fn().mockResolvedValue(listResult),
    listDeals: jest.fn().mockResolvedValue(listResult),
    listContacts: jest.fn().mockResolvedValue(listResult),
    listTasks: jest.fn().mockResolvedValue(listResult),
    ...overrides.crm,
  };

  const service = new ExportService(
    crm as unknown as CrmService,
    { evaluate, matchingScopes } as unknown as PolicyEvaluatorService,
    { append } as unknown as AuditService,
  );
  return { service, evaluate, matchingScopes, append, crm };
}

const baseParams = {
  organizationId,
  positionId,
  actorIdentityId,
  correlationId: 'corr-export-1',
};

describe('ExportService — право export.run НЕ заменяет право на чтение', () => {
  it('без права на чтение сущности отказывает, даже если export.run выдан', async () => {
    const { service, crm } = makeService({ allowed: false });

    await expect(service.buildExport({ ...baseParams, entity: 'deals' })).rejects.toThrow(
      'Недостаточно прав: deal.read',
    );
    // Данные не должны быть даже прочитаны.
    expect(crm.listDeals).not.toHaveBeenCalled();
  });

  it('проверяет право именно той сущности, которую выгружают', async () => {
    const { service, evaluate } = makeService();

    await service.buildExport({ ...baseParams, entity: 'tasks' });

    expect(evaluate).toHaveBeenCalledWith(
      expect.objectContaining({ resource: 'task', action: 'read', subjectId: positionId }),
    );
  });

  it('own-grant сужает выборку до своей позиции', async () => {
    const { service, crm } = makeService({ scopes: ['own'] });

    await service.buildExport({ ...baseParams, entity: 'leads' });

    expect(crm.listLeads).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId, ownerPositionId: positionId }),
    );
  });

  it('organization-grant не сужает', async () => {
    const { service, crm } = makeService({ scopes: ['organization'] });

    await service.buildExport({ ...baseParams, entity: 'leads' });

    expect(crm.listLeads).toHaveBeenCalledWith(
      expect.objectContaining({ ownerPositionId: undefined }),
    );
  });

  it('для задач сужение идёт по assignedPositionId, а не ownerPositionId', async () => {
    const { service, crm } = makeService({ scopes: ['own'] });

    await service.buildExport({ ...baseParams, entity: 'tasks' });

    expect(crm.listTasks).toHaveBeenCalledWith(
      expect.objectContaining({ assignedPositionId: positionId }),
    );
  });
});

describe('ExportService — содержимое и аудит', () => {
  it('отдаёт лист, заголовки и строки по числу записей', async () => {
    const items = [
      {
        createdAt: '2026-09-01T10:00:00.000Z',
        name: 'Иван',
        phone: '+995500000001',
        email: null,
      },
      {
        createdAt: '2026-09-01T11:00:00.000Z',
        name: 'Пётр',
        phone: '+995500000002',
        email: 'p@e.test',
      },
    ];
    const { service } = makeService({ items });

    const result = await service.buildExport({ ...baseParams, entity: 'contacts' });

    expect(result.sheetName).toBe('Контакты');
    expect(result.headers).toEqual(['Создан', 'Имя', 'Телефон', 'Email']);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual(['2026-09-01 10:00', 'Иван', '+995500000001', '']);
  });

  it('пустая выборка — валидный файл с одними заголовками, а не ошибка', async () => {
    const { service } = makeService({ items: [] });

    const result = await service.buildExport({ ...baseParams, entity: 'leads' });

    expect(result.rows).toEqual([]);
    expect(result.headers.length).toBeGreaterThan(0);
  });

  it('пишет audit-событие export.run с сущностью и числом строк', async () => {
    const { service, append } = makeService({
      items: [{ createdAt: '2026-09-01T10:00:00.000Z', name: 'И', phone: '+1', email: null }],
    });

    await service.buildExport({ ...baseParams, entity: 'contacts' });

    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'export.run',
        resource: 'export',
        after: expect.objectContaining({ entity: 'contacts', rowCount: 1, scoped: false }),
      }),
    );
  });

  it('превышение потолка отклоняется целиком, а не обрезает файл молча', async () => {
    const tooMany = Array.from({ length: 10_001 }, () => ({
      createdAt: '2026-09-01T10:00:00.000Z',
      name: 'И',
      phone: '+1',
      email: null,
    }));
    const { service } = makeService({ items: tooMany });

    await expect(service.buildExport({ ...baseParams, entity: 'contacts' })).rejects.toThrow(
      'Выгрузка ограничена 10000 строками',
    );
  });

  it('ровно потолок — всё ещё валидная выгрузка', async () => {
    const exactly = Array.from({ length: 10_000 }, () => ({
      createdAt: '2026-09-01T10:00:00.000Z',
      name: 'И',
      phone: '+1',
      email: null,
    }));
    const { service } = makeService({ items: exactly });

    const result = await service.buildExport({ ...baseParams, entity: 'contacts' });

    expect(result.rows).toHaveLength(10_000);
  });
});
