import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';
import fastifyMultipart from '@fastify/multipart';
import { AppModule } from './app.module';
import { AppExceptionFilter } from './shared/errors/app-exception.filter';
import { CorrelationIdMiddleware } from './shared/errors/correlation-id.middleware';
import { TenantContextMiddleware } from './shared/tenant/tenant-context.middleware';
import { AdminContextMiddleware } from './shared/admin/admin-context.middleware';
import { MarketplaceAccountContextMiddleware } from './shared/marketplace-account/marketplace-account-context.middleware';
import { parseTrustProxy } from './shared/network/parse-trust-proxy';

/**
 * ADR-001: API-процесс — один из двух entrypoint'ов одного кодового
 * артефакта (второй — main.worker.ts в apps/worker). Fastify adapter
 * (не Express), master plan разд.6.1.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
      // skipMiddie — security review 31.08.2026. FastifyAdapter.init()
      // регистрирует @fastify/middie БЕЗУСЛОВНО (не лениво), просто чтобы
      // Nest умел Express-style middleware. На @fastify/middie висит целая
      // серия адвизори класса "middleware bypass", включая critical
      // (обход аутентифицирующего middleware подделкой пути), а фикс есть
      // только в 9.3.2+, то есть в ветке под Fastify 5 — на Fastify 4
      // обновиться нельзя в принципе.
      //
      // Этому приложению middie не нужен вообще: через него не
      // зарегистрировано НИ ОДНОГО middleware. consumer.apply() не
      // используется сознательно (см. app.module.ts: NestMiddleware на
      // FastifyAdapter получает не тот объект запроса, что видят guards —
      // nestjs/nest#8837), app.use() не вызывается нигде, а correlation-id/
      // tenant/admin/marketplace-контексты подключены нативными
      // onRequest-хуками ниже. Убирая middie из пайплайна, мы убираем и
      // весь этот класс адвизори из поверхности атаки, не трогая фреймворк.
      //
      // Цена решения: если кто-то позже добавит Nest-middleware, приложение
      // упадёт на старте, а не тихо потеряет middleware. Это желаемое
      // поведение — молча неработающий middleware на этом адаптере уже
      // однажды стоил реального бага (тот же #8837).
      skipMiddie: true,
    }),
  );

  await app.register(fastifyCookie);

  // POST /leads/import — единственный потребитель на 03.09.2026. Обычный
  // multipart upload, не MediaModule (presigned + image-variants worker'ом
  // рассчитаны на постоянное хранение медиа, файл импорта разбирается и
  // выбрасывается в рамках одного запроса). Лимит 10MB — с большим запасом
  // для потолка в 2000 строк CSV/XLSX (LeadImportService.MAX_IMPORT_ROWS).
  await app.register(fastifyMultipart, {
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  });

  // Security review: apps/api не имел ни одного security-заголовка (нет
  // HSTS/X-Content-Type-Options/X-Frame-Options/Referrer-Policy) — master
  // plan разд.10.2 п.2 прямо требует "Security headers и CSP проверяются
  // автоматически" как обязательную регрессию из старого аудита.
  // `contentSecurityPolicy: false` — этот процесс отдаёт только JSON
  // (ValidationPipe/controllers), никогда HTML; CSP-директивы для несуществующего
  // HTML-контента не защищают ничего и рискуют мешать будущим explicit
  // HTML-ответам (health/ready, error pages), которые CSP здесь не учитывал бы.
  // `crossOriginResourcePolicy: 'cross-origin'` — helmet-дефолт 'same-origin'
  // блокировал бы браузером ЛЮБОЙ fetch с marketplace-web/erp-web/admin-web
  // (три РАЗНЫХ origin, ADR-004) даже при разрешающем CORS: CORP проверяется
  // независимо от Access-Control-Allow-Origin. Явный allowlist самого CORS
  // (allowedOrigins ниже) — уже единственный слой, отвечающий "кому можно",
  // CORP здесь не должен дублировать/конфликтовать с этим решением.
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

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
