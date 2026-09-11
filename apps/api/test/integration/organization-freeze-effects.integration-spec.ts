import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MarketplacePublicationRepository } from '@baza/publication';
import { OrganizationsModule } from '../../src/modules/organizations/organizations.module';
import { OrganizationsService } from '../../src/modules/organizations/organizations.service';
import { OrganizationRepository } from '../../src/modules/organizations/repository/organization.repository';

/**
 * Решение владельца 11.09.2026: заморозка организации убирает её
 * объявления с витрины и закрывает вход сотрудникам, данные при этом
 * сохраняются и возвращаются при разморозке.
 *
 * До этой работы `adminFreezeOrganization` меняла только поле `status`:
 * объявления замороженной организации продолжали продаваться на витрине,
 * а предупреждение в админке обещало блокировку, которой не было.
 *
 * Здесь проверяется витринная половина правила на настоящей MongoDB
 * (вторая половина, закрытый вход, — в tenant.guard.spec.ts и в самом
 * TenantContextMiddleware).
 */
describe('Заморозка организации — витрина (real MongoDB)', () => {
  let replSet: MongoMemoryReplSet;
  let connection: Connection;
  let organizationsService: OrganizationsService;
  let organizationRepository: OrganizationRepository;
  let publicationRepository: MarketplacePublicationRepository;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await replSet.waitUntilRunning();

    process.env.MINIO_ENDPOINT ??= 'http://localhost:9000';
    process.env.MINIO_ACCESS_KEY ??= 'test-access-key';
    process.env.MINIO_SECRET_KEY ??= 'test-secret-key';
    process.env.MINIO_BUCKET_PRIVATE ??= 'test-private';
    process.env.MINIO_BUCKET_PUBLIC ??= 'test-public';
    process.env.REDIS_URL ??= 'redis://localhost:6379';

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        MongooseModule.forRoot(replSet.getUri()),
        OrganizationsModule,
      ],
    }).compile();

    connection = moduleRef.get<Connection>(getConnectionToken());
    organizationsService = moduleRef.get(OrganizationsService);
    organizationRepository = moduleRef.get(OrganizationRepository);
    publicationRepository = moduleRef.get(MarketplacePublicationRepository);
  }, 120_000);

  afterAll(async () => {
    await connection?.close();
    await replSet?.stop();
  });

  afterEach(async () => {
    await connection.collection('organizations').deleteMany({});
    await connection.collection('marketplace_publications').deleteMany({});
    await connection.collection('audit_events').deleteMany({});
  });

  async function seedOrganizationWithPublication(name: string) {
    const organizationId = new Types.ObjectId();
    await connection.collection('organizations').insertOne({
      _id: organizationId,
      type: 'agency',
      name,
      status: 'active',
      createdAt: new Date(),
    });

    const slug = `listing-${organizationId.toString()}`;
    await connection.collection('marketplace_publications').insertOne({
      sourceType: 'listing',
      sourceId: new Types.ObjectId(),
      publisherScope: { type: 'organization', organizationId },
      slug,
      status: 'published',
      version: 1,
      publisherFrozen: false,
      denormalizedFields: {},
      searchProjection: { city: 'Batumi' },
      createdAt: new Date(),
    });

    return { organizationId, slug };
  }

  it('заморозка убирает объявления с витрины, разморозка возвращает их без участия издателя', async () => {
    const actorId = new Types.ObjectId();
    const { organizationId, slug } = await seedOrganizationWithPublication('Агентство Замороженное');

    expect(await publicationRepository.findBySlug(slug)).not.toBeNull();

    await organizationsService.adminFreezeOrganization({
      id: organizationId,
      reason: 'Неоплата тарифа',
      actorId,
      correlationId: 'freeze-1',
    });

    expect(await publicationRepository.findBySlug(slug)).toBeNull();
    const listedWhileFrozen = await publicationRepository.listPublishedByFilter({
      sourceType: 'listing',
      limit: 50,
    });
    expect(listedWhileFrozen).toHaveLength(0);

    // Собственный статус публикации заморозка не трогает: именно поэтому
    // разморозка возвращает витрину в прежнее состояние.
    const frozenDoc = await connection.collection('marketplace_publications').findOne({ slug });
    expect(frozenDoc?.status).toBe('published');
    expect(frozenDoc?.publisherFrozen).toBe(true);

    await organizationsService.adminUnfreezeOrganization({
      id: organizationId,
      reason: 'Оплата получена',
      actorId,
      correlationId: 'unfreeze-1',
    });

    expect(await publicationRepository.findBySlug(slug)).not.toBeNull();
    const listedAfter = await publicationRepository.listPublishedByFilter({
      sourceType: 'listing',
      limit: 50,
    });
    expect(listedAfter).toHaveLength(1);
  });

  it('заморозка не задевает объявления соседних организаций', async () => {
    const actorId = new Types.ObjectId();
    const frozen = await seedOrganizationWithPublication('Агентство Замороженное');
    const neighbour = await seedOrganizationWithPublication('Агентство Соседнее');

    await organizationsService.adminFreezeOrganization({
      id: frozen.organizationId,
      reason: 'Проверка изоляции',
      actorId,
      correlationId: 'freeze-2',
    });

    expect(await publicationRepository.findBySlug(frozen.slug)).toBeNull();
    expect(await publicationRepository.findBySlug(neighbour.slug)).not.toBeNull();
  });

  it('заморозка переводит организацию в frozen и пишет в аудит, сколько объявлений скрыто', async () => {
    const actorId = new Types.ObjectId();
    const { organizationId } = await seedOrganizationWithPublication('Агентство Аудит');

    await organizationsService.adminFreezeOrganization({
      id: organizationId,
      reason: 'Жалоба клиента',
      actorId,
      correlationId: 'freeze-3',
    });

    const organization = await organizationRepository.findById(organizationId);
    expect(organization?.status).toBe('frozen');

    const audit = await connection
      .collection('audit_events')
      .findOne({ action: 'organization.freeze', resourceId: organizationId });
    expect(audit?.after).toMatchObject({ status: 'frozen', hiddenPublications: 1 });
    expect(audit?.reason).toBe('Жалоба клиента');
  });
});
