import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { AppModule } from '../../src/app.module';

/**
 * DI-граф всего приложения — Nest резолвит зависимости в рантайме, не на
 * этапе компиляции. "Модуль А инжектирует provider из модуля Б, но не
 * импортирует Б" типизируется корректно (интерфейс provider'а виден через
 * TypeScript), но реально ломается только при старте приложения — тот же
 * класс "не ловится typecheck/build", что уже несколько раз встречался в
 * этой сессии для decorator-metadata reflection (другая причина, тот же
 * симптом: тихо проходит статическую проверку, падает в рантайме).
 * AppModule.compile() — единственный способ поймать сломанный module wiring
 * (забытый import, отсутствующий export, дублирующийся provider) до того,
 * как приложение реально не поднимется в проде.
 *
 * MONGO_URI подставляется из mongodb-memory-server ДО импорта AppModule
 * (ConfigModule.forRoot читает process.env синхронно при регистрации
 * MongooseModule.forRootAsync внутри AppModule) — реальное MongoDB
 * connection необходимо, поскольку AppModule сам регистрирует
 * MongooseModule.forRootAsync, не принимает переопределение URI как
 * параметр теста (в отличие от media-confirm-upload теста, который строит
 * тестовый модуль с нуля без AppModule).
 */
describe('AppModule — DI graph boots without error', () => {
  let replSet: MongoMemoryReplSet;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await replSet.waitUntilRunning();
    process.env.MONGO_URI = replSet.getUri();

    // MediaStorageService (@baza/media-storage) конструирует реальный
    // S3Client в конструкторе через ConfigService.getOrThrow — этот тест
    // не выполняет ни одного реального S3-вызова (только проверяет, что
    // DI-граф резолвится), но конструктор класса требует, чтобы эти ключи
    // существовали, независимо от того, вызывается ли клиент. Синтаксически
    // валидные фиктивные значения, не реальные MinIO-credentials.
    process.env.MINIO_ENDPOINT = 'http://localhost:9000';
    process.env.MINIO_ACCESS_KEY = 'test-access-key';
    process.env.MINIO_SECRET_KEY = 'test-secret-key';
    process.env.MINIO_BUCKET_PRIVATE = 'test-private';
    process.env.MINIO_BUCKET_PUBLIC = 'test-public';
  });

  afterAll(async () => {
    await replSet.stop();
  });

  it('компилирует весь AppModule (все модули/providers/guards резолвятся)', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    // main.api.ts использует FastifyAdapter, не Express (ADR-001/master
    // plan разд.6.1) — createNestApplication() без адаптера по умолчанию
    // пытается зарезолвить @nestjs/platform-express, который не установлен
    // в этом проекте.
    const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.close();
  });
}, 60_000);
