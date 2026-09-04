import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { DevelopmentRepository } from '@baza/development';
import { DevelopmentsModule } from '../../src/modules/developments/developments.module';
import { DevelopmentsService } from '../../src/modules/developments/developments.service';
import { InstallmentPlanRepository } from '../../src/modules/developments/repository/installment-plan.repository';

describe('InstallmentPlans — integration tests (real MongoDB & transactions)', () => {
  let replSet: MongoMemoryReplSet;
  let connection: Connection;
  let developmentsService: DevelopmentsService;
  let developmentRepository: DevelopmentRepository;
  let installmentPlanRepository: InstallmentPlanRepository;

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
      imports: [ConfigModule.forRoot({ isGlobal: true }), MongooseModule.forRoot(uri), DevelopmentsModule],
    }).compile();

    connection = moduleRef.get<Connection>(getConnectionToken());
    developmentsService = moduleRef.get(DevelopmentsService);
    developmentRepository = moduleRef.get(DevelopmentRepository);
    installmentPlanRepository = moduleRef.get(InstallmentPlanRepository);
  }, 120_000);

  afterAll(async () => {
    await connection?.close();
    await replSet?.stop();
  });

  afterEach(async () => {
    await connection.collection('developments').deleteMany({});
    await connection.collection('installment_plans').deleteMany({});
    await connection.collection('idempotency_records').deleteMany({});
  });

  async function seedDevelopment(organizationId: Types.ObjectId) {
    return developmentRepository.create({
      organizationId,
      name: 'ЖК Батуми Резиденс',
      location: {
        country: 'GE',
        city: 'Batumi',
        address: 'Rustaveli 1',
        geo: { type: 'Point', coordinates: [41.6, 41.6] },
      },
      contact: { phone: '+995555123456' },
    });
  }

  describe('createInstallmentPlan & idempotency', () => {
    it('создаёт план рассрочки с версией 0 и сохраняет idempotency record', async () => {
      const orgId = new Types.ObjectId();
      const identityId = new Types.ObjectId();
      const dev = await seedDevelopment(orgId);

      const plan = await developmentsService.createInstallmentPlan({
        developmentId: dev._id,
        organizationId: orgId,
        title: 'Рассрочка 30/70 на 24 мес',
        downPaymentType: 'percent',
        downPaymentValue: 30,
        termType: 'months_from_current_date',
        termMonths: 24,
        paymentFrequency: 'monthly',
        useDiscount: true,
        discountPercent: 5,
        idempotency: {
          identityId,
          operation: 'devCreateInstallmentPlan',
          key: 'key-1',
          requestBody: { title: 'Рассрочка 30/70 на 24 мес' },
        },
      });

      expect(plan).toBeDefined();
      expect(plan.title).toBe('Рассрочка 30/70 на 24 мес');
      expect(plan.version).toBe(0);
      expect(plan.isActive).toBe(true);
      expect(plan.applyTo).toBe('project');

      // Повторный checkCreateReplay с тем же ключом возвращает записанный ответ
      const replay = await developmentsService.checkCreateReplay(
        identityId,
        'devCreateInstallmentPlan',
        'key-1',
        { title: 'Рассрочка 30/70 на 24 мес' },
      );
      expect(replay).not.toBeNull();
      expect(replay!.responseStatus).toBe(201);
    });

    it('отклоняет создание, если ЖК не существует или принадлежит чужой организации', async () => {
      const orgA = new Types.ObjectId();
      const orgB = new Types.ObjectId();
      const devA = await seedDevelopment(orgA);

      await expect(
        developmentsService.createInstallmentPlan({
          developmentId: devA._id,
          organizationId: orgB, // чужая организация
          title: 'Попытка взлома',
          downPaymentType: 'percent',
          downPaymentValue: 50,
          termType: 'months_from_current_date',
          paymentFrequency: 'monthly',
          idempotency: {
            identityId: new Types.ObjectId(),
            operation: 'devCreateInstallmentPlan',
            key: 'hack-key',
            requestBody: {},
          },
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listInstallmentPlans & multi-tenant isolation', () => {
    it('возвращает только планы своей организации для данного ЖК', async () => {
      const orgA = new Types.ObjectId();
      const orgB = new Types.ObjectId();
      const devA = await seedDevelopment(orgA);
      const devB = await seedDevelopment(orgB);

      await developmentsService.createInstallmentPlan({
        developmentId: devA._id,
        organizationId: orgA,
        title: 'План A1',
        downPaymentType: 'percent',
        downPaymentValue: 20,
        termType: 'months_from_current_date',
        paymentFrequency: 'monthly',
        sortOrder: 1,
        idempotency: {
          identityId: new Types.ObjectId(),
          operation: 'devCreateInstallmentPlan',
          key: 'k-a1',
          requestBody: {},
        },
      });

      await developmentsService.createInstallmentPlan({
        developmentId: devA._id,
        organizationId: orgA,
        title: 'План A2',
        downPaymentType: 'percent',
        downPaymentValue: 40,
        termType: 'months_from_current_date',
        paymentFrequency: 'monthly',
        sortOrder: 0,
        idempotency: {
          identityId: new Types.ObjectId(),
          operation: 'devCreateInstallmentPlan',
          key: 'k-a2',
          requestBody: {},
        },
      });

      const plansA = await developmentsService.listInstallmentPlans(devA._id, orgA);
      expect(plansA).toHaveLength(2);
      expect(plansA[0]!.title).toBe('План A2'); // sortOrder: 0 идёт первым
      expect(plansA[1]!.title).toBe('План A1'); // sortOrder: 1

      // Чужая организация orgB не может прочитать планы ЖК devA
      await expect(
        developmentsService.listInstallmentPlans(devA._id, orgB),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateInstallmentPlan & optimistic concurrency', () => {
    it('успешно обновляет поля и инкрементирует версию при совпадении expectedVersion', async () => {
      const orgId = new Types.ObjectId();
      const identityId = new Types.ObjectId();
      const dev = await seedDevelopment(orgId);

      const created = await developmentsService.createInstallmentPlan({
        developmentId: dev._id,
        organizationId: orgId,
        title: 'Первая редакция',
        downPaymentType: 'percent',
        downPaymentValue: 20,
        termType: 'months_from_current_date',
        paymentFrequency: 'monthly',
        idempotency: {
          identityId,
          operation: 'devCreateInstallmentPlan',
          key: 'k-upd-1',
          requestBody: {},
        },
      });

      expect(created.version).toBe(0);

      const updated = await developmentsService.updateInstallmentPlan({
        id: created._id,
        developmentId: dev._id,
        organizationId: orgId,
        expectedVersion: 0,
        patch: { title: 'Вторая редакция', downPaymentValue: 25 },
        idempotency: {
          identityId,
          operation: 'devUpdateInstallmentPlan',
          key: 'k-upd-2',
          requestBody: {},
        },
      });

      expect(updated.title).toBe('Вторая редакция');
      expect(updated.downPaymentValue).toBe(25);
      expect(updated.version).toBe(1);

      // Вторая попытка с устаревшей expectedVersion: 0 выбрасывает ConflictException (409)
      await expect(
        developmentsService.updateInstallmentPlan({
          id: created._id,
          developmentId: dev._id,
          organizationId: orgId,
          expectedVersion: 0,
          patch: { title: 'Конфликтная редакция' },
          idempotency: {
            identityId,
            operation: 'devUpdateInstallmentPlan',
            key: 'k-upd-conflict',
            requestBody: {},
          },
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('deleteInstallmentPlan & version conflict', () => {
    it('удаляет план при совпадении expectedVersion и блокирует повторное/устаревшее удаление', async () => {
      const orgId = new Types.ObjectId();
      const identityId = new Types.ObjectId();
      const dev = await seedDevelopment(orgId);

      const created = await developmentsService.createInstallmentPlan({
        developmentId: dev._id,
        organizationId: orgId,
        title: 'Удаляемый план',
        downPaymentType: 'percent',
        downPaymentValue: 50,
        termType: 'fixed_end_date',
        endDate: '2027-12-31',
        paymentFrequency: 'quarterly',
        idempotency: {
          identityId,
          operation: 'devCreateInstallmentPlan',
          key: 'k-del-1',
          requestBody: {},
        },
      });

      // Попытка удалить с неверной версией (например, 1 вместо 0) -> 409
      await expect(
        developmentsService.deleteInstallmentPlan({
          id: created._id,
          developmentId: dev._id,
          organizationId: orgId,
          expectedVersion: 1,
          idempotency: {
            identityId,
            operation: 'devDeleteInstallmentPlan',
            key: 'k-del-wrong-ver',
            requestBody: {},
          },
        }),
      ).rejects.toThrow(ConflictException);

      // Удаление с верной версией (0)
      await developmentsService.deleteInstallmentPlan({
        id: created._id,
        developmentId: dev._id,
        organizationId: orgId,
        expectedVersion: 0,
        idempotency: {
          identityId,
          operation: 'devDeleteInstallmentPlan',
          key: 'k-del-ok',
          requestBody: {},
        },
      });

      // План больше не находится в БД
      const inDb = await installmentPlanRepository.findByIdForOrganization(created._id, orgId);
      expect(inDb).toBeNull();
    });
  });
});
