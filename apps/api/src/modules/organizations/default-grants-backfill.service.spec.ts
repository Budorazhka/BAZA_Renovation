import { Types } from 'mongoose';
import { DefaultGrantsBackfillService } from './default-grants-backfill.service';
import { DEFAULT_ROLE_GRANTS } from './default-role-grants';
import type { AuditService } from '../audit/audit.service';
import type { PolicyEvaluatorService } from '../authorization/policy-evaluator.service';
import type { PositionRepository } from './repository/position.repository';
import type { FixedRole, PositionDocument } from './schemas/position.schema';

// runInTransaction передаёт работе саму сессию из startSession().
const fakeSession = {
  withTransaction: async (work: () => Promise<unknown>) => work(),
  endSession: jest.fn().mockResolvedValue(undefined),
};

function makeConnection() {
  return { startSession: jest.fn().mockResolvedValue(fakeSession) };
}

const LONG_AGO = new Date('2026-08-01T00:00:00.000Z');
const NOW = new Date('2026-09-11T12:00:00.000Z');

function position(fixedRole: FixedRole, createdAt: Date = LONG_AGO): PositionDocument {
  return {
    _id: new Types.ObjectId(),
    organizationId: new Types.ObjectId(),
    fixedRole,
    status: 'occupied',
    createdAt,
  } as unknown as PositionDocument;
}

type GrantRow = { subjectId: Types.ObjectId; resource: string; action: string; revoked: boolean };

/** Строки грантов «как в базе» для позиции: весь набор роли, кроме пар из `except`. */
function rowsFor(p: PositionDocument, except: string[] = [], revoked: string[] = []): GrantRow[] {
  const rows = DEFAULT_ROLE_GRANTS[p.fixedRole]
    .filter((g) => !except.includes(`${g.resource}.${g.action}`))
    .map((g) => ({ subjectId: p._id, resource: g.resource, action: g.action, revoked: false }));
  for (const key of revoked) {
    const [resource, action] = key.split('.') as [string, string];
    rows.push({ subjectId: p._id, resource, action, revoked: true });
  }
  return rows;
}

describe('DefaultGrantsBackfillService', () => {
  let positions: PositionDocument[];
  let grantRows: GrantRow[];
  let positionRepository: { listNotClosedPage: jest.Mock };
  let policyEvaluator: { listGrantKeysForSubjects: jest.Mock; grantMany: jest.Mock };
  let auditService: { append: jest.Mock };
  let service: DefaultGrantsBackfillService;

  beforeEach(() => {
    positions = [];
    grantRows = [];
    positionRepository = {
      listNotClosedPage: jest.fn().mockImplementation(async ({ cursor, limit }) => {
        const start = cursor ? positions.findIndex((p) => p._id.equals(cursor)) + 1 : 0;
        return positions.slice(start, start + limit);
      }),
    };
    policyEvaluator = {
      listGrantKeysForSubjects: jest
        .fn()
        .mockImplementation(async (_type: string, ids: Types.ObjectId[]) =>
          grantRows.filter((row) => ids.some((id) => id.equals(row.subjectId))),
        ),
      grantMany: jest.fn().mockResolvedValue(undefined),
    };
    auditService = { append: jest.fn().mockResolvedValue(undefined) };
    service = new DefaultGrantsBackfillService(
      makeConnection() as never,
      positionRepository as unknown as PositionRepository,
      policyEvaluator as unknown as PolicyEvaluatorService,
      auditService as unknown as AuditService,
    );
  });

  it('доливает недостающие стартовые гранты роли и пишет аудит в той же транзакции', async () => {
    const owner = position('owner');
    positions = [owner];
    grantRows = rowsFor(owner, ['community_thread.read', 'messenger_account.read']);

    const report = await service.backfill({ now: NOW });

    expect(policyEvaluator.grantMany).toHaveBeenCalledTimes(1);
    const [items, session] = policyEvaluator.grantMany.mock.calls[0]!;
    expect(session).toBe(fakeSession);
    expect(items).toEqual([
      { subjectType: 'position', subjectId: owner._id, resource: 'messenger_account', action: 'read', scope: 'organization' },
      { subjectType: 'position', subjectId: owner._id, resource: 'community_thread', action: 'read', scope: 'organization' },
    ]);
    expect(auditService.append).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { type: 'system' },
        action: 'position.default_grants_backfill',
        resourceId: owner._id,
        after: expect.objectContaining({
          organizationId: owner.organizationId,
          added: ['messenger_account.read:organization', 'community_thread.read:organization'],
        }),
      }),
      fakeSession,
    );
    expect(report).toMatchObject({
      dryRun: false,
      positionsScanned: 1,
      positionsUpdated: 1,
      grantsAdded: 2,
      addedByGrant: { 'messenger_account.read': 1, 'community_thread.read': 1 },
      errors: 0,
    });
  });

  it('не расширяет суженный вручную scope и не возвращает отозванный грант', async () => {
    const owner = position('owner');
    positions = [owner];
    // lead.read выдан, но со scope own (сужен вручную); lms_course.manage отозван.
    grantRows = rowsFor(owner, ['lead.read', 'lms_course.manage'], ['lms_course.manage']);
    grantRows.push({ subjectId: owner._id, resource: 'lead', action: 'read', revoked: false });

    const report = await service.backfill({ now: NOW });

    expect(policyEvaluator.grantMany).not.toHaveBeenCalled();
    expect(auditService.append).not.toHaveBeenCalled();
    expect(report).toMatchObject({ positionsUpdated: 0, grantsAdded: 0, revokedKept: 1 });
  });

  it('dry-run считает то же самое и ничего не пишет', async () => {
    const manager = position('manager');
    positions = [manager];
    grantRows = [];

    const report = await service.backfill({ dryRun: true, now: NOW });

    expect(policyEvaluator.grantMany).not.toHaveBeenCalled();
    expect(auditService.append).not.toHaveBeenCalled();
    expect(report).toMatchObject({
      dryRun: true,
      positionsUpdated: 1,
      grantsAdded: DEFAULT_ROLE_GRANTS.manager.length,
    });
  });

  it('пропускает позиции моложе 10 минут: гранты им пишет путь создания', async () => {
    positions = [position('owner', new Date(NOW.getTime() - 60_000))];

    const report = await service.backfill({ now: NOW });

    expect(policyEvaluator.grantMany).not.toHaveBeenCalled();
    expect(report).toMatchObject({ positionsScanned: 1, skippedFresh: 1, positionsUpdated: 0 });
  });

  it('перечитывает гранты в транзакции: уже долитое параллельно не дублирует', async () => {
    const owner = position('owner');
    positions = [owner];
    grantRows = rowsFor(owner, ['community_thread.read']);
    // Пачка прочитана без гранта, а к моменту транзакции его уже долили.
    policyEvaluator.listGrantKeysForSubjects
      .mockImplementationOnce(async () => grantRows)
      .mockImplementationOnce(async () => rowsFor(owner));

    const report = await service.backfill({ now: NOW });

    expect(policyEvaluator.listGrantKeysForSubjects).toHaveBeenLastCalledWith('position', [owner._id], fakeSession);
    expect(policyEvaluator.grantMany).not.toHaveBeenCalled();
    expect(report).toMatchObject({ positionsUpdated: 0, grantsAdded: 0 });
  });

  it('сбой одной позиции не останавливает остальные', async () => {
    const broken = position('marketer');
    const healthy = position('marketer');
    positions = [broken, healthy];
    policyEvaluator.grantMany
      .mockRejectedValueOnce(new Error('write conflict'))
      .mockResolvedValueOnce(undefined);

    const report = await service.backfill({ now: NOW });

    expect(policyEvaluator.grantMany).toHaveBeenCalledTimes(2);
    expect(report).toMatchObject({ positionsScanned: 2, positionsUpdated: 1, errors: 1 });
  });

  it('проходит все позиции пачками по курсору', async () => {
    positions = [position('marketer'), position('marketer'), position('marketer')];

    const report = await service.backfill({ batchSize: 2, now: NOW });

    expect(positionRepository.listNotClosedPage).toHaveBeenNthCalledWith(1, { cursor: undefined, limit: 2 });
    expect(positionRepository.listNotClosedPage).toHaveBeenNthCalledWith(2, { cursor: positions[1]!._id, limit: 2 });
    expect(report.positionsScanned).toBe(3);
    expect(report.positionsUpdated).toBe(3);
  });

  it('повторный прогон по полностью долитой позиции ничего не меняет', async () => {
    const director = position('director');
    positions = [director];
    grantRows = rowsFor(director);

    const report = await service.backfill({ now: NOW });

    expect(policyEvaluator.grantMany).not.toHaveBeenCalled();
    expect(report).toMatchObject({ positionsScanned: 1, positionsUpdated: 0, grantsAdded: 0 });
  });
});
