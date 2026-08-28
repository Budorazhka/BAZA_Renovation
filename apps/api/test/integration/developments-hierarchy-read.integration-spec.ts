import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { DevelopmentRepository } from '@baza/development';
import { DevelopmentsModule } from '../../src/modules/developments/developments.module';
import { DevelopmentsService } from '../../src/modules/developments/developments.service';
import { BuildingRepository } from '../../src/modules/developments/repository/building.repository';
import { SectionRepository } from '../../src/modules/developments/repository/section.repository';
import { FloorRepository } from '../../src/modules/developments/repository/floor.repository';
import { FloorPlanRepository } from '../../src/modules/developments/repository/floor-plan.repository';
import { UnitRepository } from '../../src/modules/developments/repository/unit.repository';

/**
 * D-02 COMPLETE: read-side дочерней иерархии (listBuildingsForDevelopment/
 * listSectionsForBuilding/listFloorsForBuilding/listFloorPlansForBuilding/
 * listUnitsForBuilding) — integration-тест против РЕАЛЬНОГО MongoDB
 * (mongodb-memory-server, не мок Model), тот же паттерн, что
 * developments-transactions.integration-spec.ts установил для write-команд.
 * Repository unit-тесты (building/section/floor/floor-plan/unit .spec.ts)
 * уже проверяют точный Mongo-фильтр на моке — этот файл проверяет то, что
 * мок не может: что organizationId-фильтр реально изолирует данные при
 * прогоне через настоящую БД, и что parent-consistency проверки
 * (findByIdForOrganization в сервисе) реально отсекают чужую организацию,
 * а не просто выглядят так на бумаге.
 */
describe('DevelopmentsService — read hierarchy integration (real MongoDB)', () => {
  let replSet: MongoMemoryReplSet;
  let connection: Connection;
  let developmentsService: DevelopmentsService;
  let developmentRepository: DevelopmentRepository;
  let buildingRepository: BuildingRepository;
  let sectionRepository: SectionRepository;
  let floorRepository: FloorRepository;
  let floorPlanRepository: FloorPlanRepository;
  let unitRepository: UnitRepository;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await replSet.waitUntilRunning();
    const uri = replSet.getUri();

    // Тот же MINIO_* заглушка-паттерн, что developments-transactions —
    // DevelopmentsModule транзитивно тянет OrganizationsModule→MediaModule.
    process.env.MINIO_ENDPOINT ??= 'http://localhost:9000';
    process.env.MINIO_ACCESS_KEY ??= 'test-access-key';
    process.env.MINIO_SECRET_KEY ??= 'test-secret-key';
    process.env.MINIO_BUCKET_PRIVATE ??= 'test-private';
    process.env.MINIO_BUCKET_PUBLIC ??= 'test-public';

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), MongooseModule.forRoot(uri), DevelopmentsModule],
    }).compile();

    connection = moduleRef.get<Connection>(getConnectionToken());
    developmentsService = moduleRef.get(DevelopmentsService);
    developmentRepository = moduleRef.get(DevelopmentRepository);
    buildingRepository = moduleRef.get(BuildingRepository);
    sectionRepository = moduleRef.get(SectionRepository);
    floorRepository = moduleRef.get(FloorRepository);
    floorPlanRepository = moduleRef.get(FloorPlanRepository);
    unitRepository = moduleRef.get(UnitRepository);
  }, 120_000);

  afterAll(async () => {
    await connection?.close();
    await replSet?.stop();
  });

  afterEach(async () => {
    await connection.collection('developments').deleteMany({});
    await connection.collection('buildings').deleteMany({});
    await connection.collection('sections').deleteMany({});
    await connection.collection('floors').deleteMany({});
    await connection.collection('floor_plans').deleteMany({});
    await connection.collection('units').deleteMany({});
  });

  async function seedFullHierarchy(organizationId: Types.ObjectId) {
    const development = await developmentRepository.create({
      organizationId,
      name: 'ЖК Иерархия',
      location: { country: 'Georgia', city: 'Batumi', geo: { type: 'Point', coordinates: [41.6, 41.6] } },
      contact: { phone: '+995500000000' },
    });
    const building = await buildingRepository.create({
      developmentId: development._id,
      organizationId,
      name: 'Корпус 1',
      floorsCount: 5,
    });
    const section = await sectionRepository.create({
      buildingId: building._id,
      organizationId,
      name: 'Секция А',
    });
    const floor = await floorRepository.create({
      buildingId: building._id,
      sectionId: section._id,
      organizationId,
      floorNumber: 1,
    });
    const floorPlan = await floorPlanRepository.create({
      buildingId: building._id,
      organizationId,
      name: 'Планировка 1',
      rooms: 2,
      area: 55,
    });
    const unit = await unitRepository.create({
      buildingId: building._id,
      floorId: floor._id,
      organizationId,
      number: '1',
      kind: 'apartment',
      area: 40,
      price: { amountMinorUnits: 10000000, currency: 'USD' },
      floorPlanId: floorPlan._id,
    });
    return { development, building, section, floor, floorPlan, unit };
  }

  describe('listBuildingsForDevelopment', () => {
    it('tenant A не видит buildings tenant B (chужой development существует, но принадлежит другой организации)', async () => {
      const orgA = new Types.ObjectId();
      const orgB = new Types.ObjectId();
      const { development: devA } = await seedFullHierarchy(orgA);
      await seedFullHierarchy(orgB);

      await expect(developmentsService.listBuildingsForDevelopment(devA._id, orgB)).rejects.toThrow();
    });

    it('development из tenant A нельзя использовать с organizationId tenant B — 404, не пустой список', async () => {
      const orgA = new Types.ObjectId();
      const orgB = new Types.ObjectId();
      const { development: devB } = await seedFullHierarchy(orgB);

      // devB реально существует под orgB — попытка прочитать его buildings
      // с organizationId orgA должна упасть, не молча вернуть [].
      await expect(developmentsService.listBuildingsForDevelopment(devB._id, orgA)).rejects.toThrow();
    });

    it('возвращает buildings своей организации', async () => {
      const orgA = new Types.ObjectId();
      const { development, building } = await seedFullHierarchy(orgA);

      const result = await developmentsService.listBuildingsForDevelopment(development._id, orgA);

      expect(result).toHaveLength(1);
      expect(result[0]?._id.toString()).toBe(building._id.toString());
    });
  });

  describe('listUnitsForBuilding', () => {
    it('tenant A не видит units tenant B', async () => {
      const orgA = new Types.ObjectId();
      const orgB = new Types.ObjectId();
      const { building: buildingA } = await seedFullHierarchy(orgA);
      await seedFullHierarchy(orgB);

      await expect(
        developmentsService.listUnitsForBuilding(buildingA._id, orgB, { limit: 100 }),
      ).rejects.toThrow();
    });

    it('возвращает units своей организации с price/status', async () => {
      const orgA = new Types.ObjectId();
      const { building, unit } = await seedFullHierarchy(orgA);

      const result = await developmentsService.listUnitsForBuilding(building._id, orgA, { limit: 100 });

      expect(result).toHaveLength(1);
      expect(result[0]?._id.toString()).toBe(unit._id.toString());
      expect(result[0]?.status).toBe('available');
    });
  });

  describe('parent consistency — тот же принцип, что write-команды', () => {
    /**
     * floor из ОДНОГО building нельзя использовать с unit ДРУГОГО building —
     * это уже покрыто mock-тестом в developments.service.spec.ts
     * ("createUnit отклоняет, если floorId принадлежит ДРУГОМУ building").
     * Здесь — реальная БД версия того же сценария через createUnit (write-
     * путь), т.к. list-эндпоинты read-only и сами по себе не принимают
     * floorId/buildingId в паре — riск подмены проверяется на записи, не
     * на чтении.
     */
    it('floor из одного building нельзя использовать при создании unit в другом building (реальная БД)', async () => {
      const orgA = new Types.ObjectId();
      // seedFullHierarchy сама создаёт unit внутри своего building — второй
      // вызов создаёт СВОЙ unit под buildingB. Проверка "не создался ЛИШНИЙ
      // unit" должна фильтровать по number:'999' (тестовый unit из этого
      // it), не по голому buildingId (иначе ловит seed-unit и даёт false
      // negative — найдено этим же тестом на первом прогоне).
      const { floor: floorA } = await seedFullHierarchy(orgA);
      const { building: buildingB } = await seedFullHierarchy(orgA);

      await expect(
        developmentsService.createUnit({
          buildingId: buildingB._id,
          floorId: floorA._id,
          organizationId: orgA,
          number: '999',
          kind: 'apartment',
          area: 10,
          price: { amountMinorUnits: 1, currency: 'USD' },
        }),
      ).rejects.toThrow();

      const unitCount = await connection.collection('units').countDocuments({ buildingId: buildingB._id, number: '999' });
      expect(unitCount).toBe(0);
    });

    /** building из tenant A нельзя использовать с development tenant B при чтении sections. */
    it('building чужой организации → безопасный 404 при listSectionsForBuilding', async () => {
      const orgA = new Types.ObjectId();
      const orgB = new Types.ObjectId();
      const { building: buildingA } = await seedFullHierarchy(orgA);

      await expect(developmentsService.listSectionsForBuilding(buildingA._id, orgB)).rejects.toThrow();
    });

    it('building чужой организации → безопасный 404 при listFloorsForBuilding', async () => {
      const orgA = new Types.ObjectId();
      const orgB = new Types.ObjectId();
      const { building: buildingA } = await seedFullHierarchy(orgA);

      await expect(developmentsService.listFloorsForBuilding(buildingA._id, orgB)).rejects.toThrow();
    });

    it('building чужой организации → безопасный 404 при listFloorPlansForBuilding', async () => {
      const orgA = new Types.ObjectId();
      const orgB = new Types.ObjectId();
      const { building: buildingA } = await seedFullHierarchy(orgA);

      await expect(developmentsService.listFloorPlansForBuilding(buildingA._id, orgB)).rejects.toThrow();
    });
  });
});
