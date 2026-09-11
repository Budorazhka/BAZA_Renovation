import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { BillingModule } from '../../src/modules/billing/billing.module';
import { BillingService } from '../../src/modules/billing/billing.service';
import { OrganizationsService } from '../../src/modules/organizations/organizations.service';
import { AuthService } from '../../src/modules/identity/auth.service';

/**
 * ИСПРАВЛЕНО 11.09.2026: BillingService.getOrganizationSubscription при
 * первой подписке хардкодил planCode: 'agency_trial' для ЛЮБОЙ организации
 * без подписки, включая застройщика (targetAudience:'agency' и agency-
 * лимиты вместо developer_trial). Реальная MongoDB здесь важна не ради
 * семантики запроса (сам выбор кода — чистый JS), а ради того, что
 * DEFAULT_PLANS реально засеян в subscription_plans и effectiveLimits в
 * ответе — это данные РЕАЛЬНОГО документа плана, не мок-объект (юнит-тест
 * billing.service.spec.ts мокает findByCode — здесь проверяется, что
 * seedDefaultPlans() и выбранный planCode действительно совпадают по ключу
 * в настоящей коллекции).
 */
describe('BillingService.getOrganizationSubscription: выбор trial-плана по типу организации (реальная MongoDB)', () => {
  let replSet: MongoMemoryReplSet;
  let connection: Connection;
  let billingService: BillingService;
  let organizationsService: OrganizationsService;
  let authService: AuthService;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await replSet.waitUntilRunning();
    const uri = replSet.getUri();

    process.env.MINIO_ENDPOINT ??= 'http://localhost:9000';
    process.env.MINIO_ACCESS_KEY ??= 'test-access-key';
    process.env.MINIO_SECRET_KEY ??= 'test-secret-key';
    process.env.MINIO_BUCKET_PRIVATE ??= 'test-private';
    process.env.MINIO_BUCKET_PUBLIC ??= 'test-public';
    process.env.REDIS_URL ??= 'redis://localhost:6379';

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), MongooseModule.forRoot(uri), BillingModule],
    }).compile();

    connection = moduleRef.get<Connection>(getConnectionToken());
    billingService = moduleRef.get(BillingService);
    organizationsService = moduleRef.get(OrganizationsService);
    authService = moduleRef.get(AuthService);
  }, 120_000);

  afterAll(async () => {
    await connection?.close();
    await replSet?.stop();
  });

  afterEach(async () => {
    await connection.collection('organization_subscriptions').deleteMany({});
    // subscription_plans НЕ чистим: BillingService кеширует факт "каталог
    // засеян" в собственном поле экземпляра (plansSeeded), который живёт
    // весь прогон файла (сервис поднят один раз в beforeAll) — если стереть
    // коллекцию между тестами, повторный ensurePlansSeeded() решит, что
    // сеять не нужно, и найдёт пустую коллекцию. Каталог планов — не
    // тенантные данные, общий на все тесты файла безопасен.
    await connection.collection('organizations').deleteMany({});
    await connection.collection('positions').deleteMany({});
    await connection.collection('position_assignments').deleteMany({});
    await connection.collection('permission_grants').deleteMany({});
    await connection.collection('identities').deleteMany({});
    await connection.collection('product_accesses').deleteMany({});
  });

  async function seedOrganization(type: 'developer' | 'agency' | 'independent_realtor'): Promise<Types.ObjectId> {
    const login = `owner-${new Types.ObjectId().toString()}@example.test`;
    const identityId = await authService.registerIdentity({ login, password: 'correct horse battery staple' });
    const { organizationId } = await organizationsService.createOrganizationWithOwner({
      type,
      name: `Организация ${type}`,
      ownerIdentityId: identityId,
    });
    return organizationId;
  }

  it('developer организация — developer_trial, с лимитами и планом из настоящей коллекции subscription_plans', async () => {
    const organizationId = await seedOrganization('developer');

    const overview = await billingService.getOrganizationSubscription(organizationId);

    expect(overview.subscription.planCode).toBe('developer_trial');
    expect(overview.plan?.code).toBe('developer_trial');
    expect(overview.plan?.targetAudience).toBe('developer');
    expect(overview.effectiveLimits.maxActiveListings).toBe(20);

    const stored = await connection.collection('subscription_plans').findOne({ code: 'developer_trial' });
    expect(stored).not.toBeNull();
  });

  it('agency организация — agency_trial (поведение не изменилось)', async () => {
    const organizationId = await seedOrganization('agency');

    const overview = await billingService.getOrganizationSubscription(organizationId);

    expect(overview.subscription.planCode).toBe('agency_trial');
    expect(overview.effectiveLimits.maxActiveListings).toBe(30);
  });

  it('independent_realtor организация — realtor_free, не agency_trial', async () => {
    const organizationId = await seedOrganization('independent_realtor');

    const overview = await billingService.getOrganizationSubscription(organizationId);

    expect(overview.subscription.planCode).toBe('realtor_free');
    expect(overview.plan?.targetAudience).toBe('independent_realtor');
    expect(overview.effectiveLimits.maxActiveListings).toBe(5);
  });

  it('повторный вызов не пересоздаёт подписку — planCode остаётся тем же, что при первом обращении', async () => {
    const organizationId = await seedOrganization('developer');

    const first = await billingService.getOrganizationSubscription(organizationId);
    const second = await billingService.getOrganizationSubscription(organizationId);

    expect(first.subscription.planCode).toBe('developer_trial');
    expect(second.subscription.planCode).toBe('developer_trial');
    expect(await connection.collection('organization_subscriptions').countDocuments({ organizationId })).toBe(1);
  });
});
