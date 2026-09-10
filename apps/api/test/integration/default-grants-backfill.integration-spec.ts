import mongoose, { Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { DefaultGrantsBackfillService } from '../../src/modules/organizations/default-grants-backfill.service';
import { DEFAULT_ROLE_GRANTS } from '../../src/modules/organizations/default-role-grants';
import { PositionRepository } from '../../src/modules/organizations/repository/position.repository';
import {
  PositionDocument,
  PositionSchema,
  type FixedRole,
  type PositionStatus,
} from '../../src/modules/organizations/schemas/position.schema';
import { PermissionGrantRepository } from '../../src/modules/authorization/repository/permission-grant.repository';
import { PolicyEvaluatorService } from '../../src/modules/authorization/policy-evaluator.service';
import {
  PermissionGrantDocument,
  PermissionGrantSchema,
} from '../../src/modules/authorization/schemas/permission-grant.schema';
import { AuditEventRepository } from '../../src/modules/audit/repository/audit-event.repository';
import { AuditService } from '../../src/modules/audit/audit.service';
import { AuditEventDocument, AuditEventSchema } from '../../src/modules/audit/schemas/audit-event.schema';

/**
 * Доливка стартовых грантов меняет права во всех организациях сразу, поэтому
 * проверяется на настоящей MongoDB: организация «до 10.09» получает гранты
 * messenger/LMS/community, отозванное вручную не возвращается, суженное не
 * расширяется, закрытые и только что созданные позиции не трогаются, повтор
 * ничего не меняет.
 */
describe('Доливка стартовых грантов в существующие позиции', () => {
  let replSet: MongoMemoryReplSet;
  let connection: mongoose.Connection;
  let PositionModel: mongoose.Model<PositionDocument>;
  let GrantModel: mongoose.Model<PermissionGrantDocument>;
  let AuditModel: mongoose.Model<AuditEventDocument>;
  let evaluator: PolicyEvaluatorService;
  let service: DefaultGrantsBackfillService;

  const NOW = new Date('2026-09-11T12:00:00.000Z');
  const LONG_AGO = new Date('2026-09-01T09:00:00.000Z');
  const orgA = new Types.ObjectId();
  const orgB = new Types.ObjectId();
  const isNewModule = (resource: string) => /^(messenger_|lms_|community_)/.test(resource);

  let oldOwner: Types.ObjectId;
  let vacantManager: Types.ObjectId;
  let closedRop: Types.ObjectId;
  let freshOwner: Types.ObjectId;
  let fullDeveloper: Types.ObjectId;

  async function createPosition(fixedRole: FixedRole, organizationId: Types.ObjectId, status: PositionStatus, createdAt: Date) {
    const [doc] = await PositionModel.create([{ organizationId, fixedRole, status, createdAt }]);
    return doc!._id;
  }

  async function grant(subjectId: Types.ObjectId, resource: string, action: string, scope: string, revokedAt?: Date) {
    await GrantModel.create({ subjectType: 'position', subjectId, resource, action, scope, ...(revokedAt ? { revokedAt } : {}) });
  }

  async function activeGrants(subjectId: Types.ObjectId) {
    return GrantModel.find({ subjectType: 'position', subjectId, revokedAt: { $exists: false } }).lean();
  }

  function can(subjectId: Types.ObjectId, resource: string, action: string) {
    return evaluator.evaluate({ subjectType: 'position', subjectId, resource, action });
  }

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await replSet.waitUntilRunning();
    connection = await mongoose.createConnection(replSet.getUri()).asPromise();
    PositionModel = connection.model(PositionDocument.name, PositionSchema);
    GrantModel = connection.model(PermissionGrantDocument.name, PermissionGrantSchema);
    AuditModel = connection.model(AuditEventDocument.name, AuditEventSchema);
    await Promise.all([PositionModel.init(), GrantModel.init(), AuditModel.init()]);

    evaluator = new PolicyEvaluatorService(new PermissionGrantRepository(GrantModel));
    service = new DefaultGrantsBackfillService(
      connection,
      new PositionRepository(PositionModel),
      evaluator,
      new AuditService(new AuditEventRepository(AuditModel)),
    );

    // Владелец организации, созданной до 10.09: весь набор, кроме новых
    // разделов. lead.read сужен вручную до own, lms_course.manage отозван.
    oldOwner = await createPosition('owner', orgA, 'occupied', LONG_AGO);
    for (const g of DEFAULT_ROLE_GRANTS.owner) {
      if (isNewModule(g.resource)) continue;
      if (g.resource === 'lead' && g.action === 'read') continue;
      await grant(oldOwner, g.resource, g.action, g.scope);
    }
    await grant(oldOwner, 'lead', 'read', 'own');
    await grant(oldOwner, 'lms_course', 'manage', 'organization', new Date('2026-09-10T10:00:00.000Z'));

    // Вакантная позиция менеджера без единого гранта (создание упало до них).
    vacantManager = await createPosition('manager', orgA, 'vacant', LONG_AGO);
    // Закрытая = удалённая позиция: не трогаем.
    closedRop = await createPosition('rop', orgA, 'closed', LONG_AGO);
    // Создаётся прямо сейчас: гранты ей пишет путь создания.
    freshOwner = await createPosition('owner', orgB, 'occupied', new Date(NOW.getTime() - 60_000));
    // Полностью выданный набор другой организации.
    fullDeveloper = await createPosition('developer', orgB, 'occupied', LONG_AGO);
    for (const g of DEFAULT_ROLE_GRANTS.developer) await grant(fullDeveloper, g.resource, g.action, g.scope);
  }, 120_000);

  afterAll(async () => {
    await connection?.close();
    await replSet?.stop();
  });

  const expectedOwnerAdded = DEFAULT_ROLE_GRANTS.owner.filter(
    (g) => isNewModule(g.resource) && !(g.resource === 'lms_course' && g.action === 'manage'),
  ).length;
  const expectedTotal = expectedOwnerAdded + DEFAULT_ROLE_GRANTS.manager.length;

  it('dry-run показывает, что будет долито, и ничего не пишет', async () => {
    const grantsBefore = await GrantModel.countDocuments();

    const report = await service.backfill({ dryRun: true, now: NOW, batchSize: 2 });

    expect(report).toMatchObject({
      dryRun: true,
      positionsScanned: 4, // closed не выбирается вовсе
      positionsUpdated: 2,
      grantsAdded: expectedTotal,
      revokedKept: 1,
      skippedFresh: 1,
      errors: 0,
    });
    expect(await GrantModel.countDocuments()).toBe(grantsBefore);
    expect(await AuditModel.countDocuments()).toBe(0);
  });

  it('доливает недостающее, не возвращая отозванное и не расширяя суженное', async () => {
    expect(await can(oldOwner, 'community_thread', 'read')).toBe(false);

    const report = await service.backfill({ now: NOW, batchSize: 2 });

    expect(report).toMatchObject({ dryRun: false, positionsUpdated: 2, grantsAdded: expectedTotal, errors: 0 });

    // Новые разделы открылись.
    expect(await can(oldOwner, 'community_thread', 'read')).toBe(true);
    expect(await can(oldOwner, 'messenger_dialog', 'read')).toBe(true);
    expect(await can(oldOwner, 'lms_material', 'manage')).toBe(true);
    // Отозванное вручную осталось отозванным.
    expect(await can(oldOwner, 'lms_course', 'manage')).toBe(false);
    // Суженное вручную не расширено вторым грантом.
    const leadRead = (await activeGrants(oldOwner)).filter((g) => g.resource === 'lead' && g.action === 'read');
    expect(leadRead.map((g) => g.scope)).toEqual(['own']);

    // Менеджер получил ровно набор своей роли.
    const managerGrants = await activeGrants(vacantManager);
    expect(managerGrants.map((g) => `${g.resource}.${g.action}:${g.scope}`).sort()).toEqual(
      DEFAULT_ROLE_GRANTS.manager.map((g) => `${g.resource}.${g.action}:${g.scope}`).sort(),
    );

    // Закрытая и свежая позиции не тронуты, полностью выданная — тоже.
    expect(await GrantModel.countDocuments({ subjectId: closedRop })).toBe(0);
    expect(await GrantModel.countDocuments({ subjectId: freshOwner })).toBe(0);
    expect(await GrantModel.countDocuments({ subjectId: fullDeveloper })).toBe(DEFAULT_ROLE_GRANTS.developer.length);

    // Аудит от системы на каждую изменённую позицию, с организацией и списком.
    const audit = await AuditModel.find().lean();
    expect(audit).toHaveLength(2);
    const ownerAudit = audit.find((event) => event.resourceId.equals(oldOwner))!;
    expect(ownerAudit.actor.type).toBe('system');
    expect(ownerAudit.action).toBe('position.default_grants_backfill');
    expect((ownerAudit.after as { organizationId: Types.ObjectId }).organizationId.equals(orgA)).toBe(true);
    expect((ownerAudit.after as { added: string[] }).added).toHaveLength(expectedOwnerAdded);
  });

  it('повторный прогон ничего не меняет', async () => {
    const grantsBefore = await GrantModel.countDocuments();

    const report = await service.backfill({ now: NOW });

    expect(report).toMatchObject({ positionsUpdated: 0, grantsAdded: 0, revokedKept: 1, errors: 0 });
    expect(await GrantModel.countDocuments()).toBe(grantsBefore);
    expect(await AuditModel.countDocuments()).toBe(2);
  });
});
