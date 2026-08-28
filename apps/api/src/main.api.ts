import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import { AppModule } from './app.module';
import { AppExceptionFilter } from './shared/errors/app-exception.filter';
import { CorrelationIdMiddleware } from './shared/errors/correlation-id.middleware';
import { TenantContextMiddleware } from './shared/tenant/tenant-context.middleware';
import { AdminContextMiddleware } from './shared/admin/admin-context.middleware';
import { MarketplaceAccountContextMiddleware } from './shared/marketplace-account/marketplace-account-context.middleware';

/**
 * ADR-001: API-процесс — один из двух entrypoint'ов одного кодового
 * артефакта (второй — main.worker.ts в apps/worker). Fastify adapter
 * (не Express), master plan разд.6.1.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());

  await app.register(fastifyCookie);

  // TenantContextMiddleware/AdminContextMiddleware — нативные Fastify
  // onRequest hooks, НЕ NestJS NestMiddleware (AppModule.configure()
  // комментарий объясняет почему: GitHub issue nestjs/nest#8837, middie
  // compat-слой отдаёт NestMiddleware сырой req, не тот объект, что видят
  // Guards). app.get(...) — сервисы уже зарегистрированы в DI-контейнере
  // построенного app, hook — не NestJS provider, constructor injection
  // здесь недоступен.
  const fastifyInstance = app.getHttpAdapter().getInstance();
  const correlationIdMiddleware = app.get(CorrelationIdMiddleware);
  const tenantContextMiddleware = app.get(TenantContextMiddleware);
  const adminContextMiddleware = app.get(AdminContextMiddleware);
  const marketplaceAccountContextMiddleware = app.get(MarketplaceAccountContextMiddleware);

  // /health и /health/ready — публичные liveness/readiness endpoints без
  // setGlobalPrefix (main.api.ts exclude ниже), опрашиваются оркестратором
  // часто и не нуждаются ни в correlationId, ни в tenant/admin контексте —
  // early-exit здесь (second-opinion ревью: без него каждый health-пинг
  // платит cookie-parsing + session-lookup дважды впустую). onRequest hook
  // выполняется до роутинга — req.routerPath ещё недоступен, поэтому
  // проверка идёт по сырому req.url, не по имени route.
  const isHealthCheckPath = (url: string): boolean => url === '/health' || url === '/health/ready';

  // Порядок важен: correlationId должен быть установлен до tenant/admin
  // hooks — те при ошибке идут через AppExceptionFilter, которому
  // req.correlationId нужен для requestId в error-ответе.
  fastifyInstance.addHook('onRequest', async (req, reply) => {
    if (isHealthCheckPath(req.url)) return;
    await correlationIdMiddleware.use(req, reply, () => {});
  });
  fastifyInstance.addHook('onRequest', async (req, reply) => {
    if (isHealthCheckPath(req.url)) return;
    await tenantContextMiddleware.use(req, reply, () => {});
  });
  fastifyInstance.addHook('onRequest', async (req, reply) => {
    if (isHealthCheckPath(req.url)) return;
    await adminContextMiddleware.use(req, reply, () => {});
  });
  fastifyInstance.addHook('onRequest', async (req, reply) => {
    if (isHealthCheckPath(req.url)) return;
    await marketplaceAccountContextMiddleware.use(req, reply, () => {});
  });

  app.useGlobalFilters(new AppExceptionFilter());

  // conventions.md: неизвестные/лишние поля в body отклоняются, не молча
  // отбрасываются — явная ошибка на этапе разработки клиента лучше тихого
  // рассинхрона DTO и реального API.
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  // CORS: allowed origins из env, по одному на продукт (conventions.md раздел 6) —
  // не wildcard, ADR-004 host-only session изоляция требует явного списка.
  const allowedOrigins = [
    process.env.CORS_ALLOWED_ORIGIN_MARKETPLACE,
    process.env.CORS_ALLOWED_ORIGIN_ERP,
    process.env.CORS_ALLOWED_ORIGIN_ADMIN,
  ].filter((origin): origin is string => Boolean(origin));

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });

  const port = Number(process.env.API_PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
}

bootstrap().catch((err) => {
  console.error('Fatal error during API bootstrap', err);
  process.exit(1);
});
