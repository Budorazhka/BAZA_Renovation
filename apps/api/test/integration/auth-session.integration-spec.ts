import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import fastifyCookie from '@fastify/cookie';
import { AppModule } from '../../src/app.module';
import { AppExceptionFilter } from '../../src/shared/errors/app-exception.filter';
import { CorrelationIdMiddleware } from '../../src/shared/errors/correlation-id.middleware';
import { SessionService } from '../../src/modules/identity/session.service';

const MARKETPLACE_ORIGIN = 'https://marketplace.test.local';
const ERP_ORIGIN = 'https://erp.test.local';
const ADMIN_ORIGIN = 'https://admin.test.local';

describe('GET /auth/session (real HTTP + MongoDB)', () => {
  let replSet: MongoMemoryReplSet;
  let app: NestFastifyApplication;
  let connection: Connection;
  let sessionService: SessionService;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await replSet.waitUntilRunning();
    process.env.MONGO_URI = replSet.getUri();
    process.env.MINIO_ENDPOINT ??= 'http://localhost:9000';
    process.env.MINIO_ACCESS_KEY ??= 'test-access-key';
    process.env.MINIO_SECRET_KEY ??= 'test-secret-key';
    process.env.MINIO_BUCKET_PRIVATE ??= 'test-private';
    process.env.MINIO_BUCKET_PUBLIC ??= 'test-public';
    process.env.CORS_ALLOWED_ORIGIN_MARKETPLACE = MARKETPLACE_ORIGIN;
    process.env.CORS_ALLOWED_ORIGIN_ERP = ERP_ORIGIN;
    process.env.CORS_ALLOWED_ORIGIN_ADMIN = ADMIN_ORIGIN;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.register(fastifyCookie);
    const fastify = app.getHttpAdapter().getInstance();
    fastify.addHook('onRequest', async (req, reply) => app.get(CorrelationIdMiddleware).use(req, reply, () => {}));
    app.useGlobalFilters(new AppExceptionFilter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
    await app.init();
    await fastify.ready();

    connection = moduleRef.get<Connection>(getConnectionToken());
    sessionService = moduleRef.get(SessionService);
  }, 120_000);

  afterEach(async () => {
    await connection.collection('sessions').deleteMany({});
  });

  afterAll(async () => {
    await app?.close();
    await replSet?.stop();
  });

  async function createSession(productAudience: 'marketplace' | 'erp' | 'admin') {
    const identityId = new Types.ObjectId();
    const created = await sessionService.createSession({ identityId, productAudience });
    return { identityId, token: created.token };
  }

  it('returns unauthenticated without a cookie and does not create a session', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/auth/session', headers: { origin: MARKETPLACE_ORIGIN } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ authenticated: false });
    expect(await connection.collection('sessions').countDocuments()).toBe(0);
  });

  it.each([
    ['marketplace', MARKETPLACE_ORIGIN],
    ['erp', ERP_ORIGIN],
    ['admin', ADMIN_ORIGIN],
  ] as const)('recognizes an active %s session only for its matching audience origin', async (audience, origin) => {
    const session = await createSession(audience);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/session',
      headers: { origin, cookie: `baza_session=${session.token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ authenticated: true });
    expect(response.body).not.toContain(session.identityId.toString());
  });

  it('does not disclose a session when the cookie audience and origin do not match', async () => {
    const session = await createSession('marketplace');

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/session',
      headers: { origin: ERP_ORIGIN, cookie: `baza_session=${session.token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ authenticated: false });
  });

  it('returns unauthenticated after revoke and for an expired session', async () => {
    const revoked = await createSession('marketplace');
    await sessionService.revokeSession(revoked.token);
    const revokedResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/session',
      headers: { origin: MARKETPLACE_ORIGIN, cookie: `baza_session=${revoked.token}` },
    });
    expect(revokedResponse.json()).toEqual({ authenticated: false });

    const expired = await createSession('marketplace');
    await connection.collection('sessions').updateOne({ identityId: expired.identityId }, { $set: { expiresAt: new Date(0) } });
    const expiredResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/session',
      headers: { origin: MARKETPLACE_ORIGIN, cookie: `baza_session=${expired.token}` },
    });
    expect(expiredResponse.json()).toEqual({ authenticated: false });
  });

  it('keeps origin validation explicit for this endpoint', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/auth/session' });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('AUTH_AUDIENCE_MISMATCH');
  });
});
