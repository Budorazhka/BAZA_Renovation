import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Тонкая обёртка над ioredis-клиентом — тот же принцип, что MediaStorageService
 * оборачивает S3Client (packages/media-storage/src/media-storage.service.ts):
 * единственная точка конфигурации Redis-подключения, переиспользуемая и
 * rate-limiter'ом (RedisRateLimiterService), и потенциально другими
 * потребителями (worker-процесс уже получает REDIS_URL в compose.runtime.yml,
 * но сейчас его использует только api — см. RedisRateLimitGuard).
 *
 * lazyConnect НЕ используется — соединение открывается сразу при старте
 * процесса (та же логика, что MongooseModule.forRootAsync uri), чтобы
 * ошибка конфигурации (неверный REDIS_URL) проявлялась на старте, не на
 * первом реальном запросе.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor(private readonly config: ConfigService) {
    const redisUrl = this.config.getOrThrow<string>('REDIS_URL');
    this.client = new Redis(redisUrl, {
      // maxRetriesPerRequest: null — блокирующие retry-циклы ioredis по
      // умолчанию ретраят команду бесконечно при разрыве соединения, что
      // держит HTTP-запрос висящим неопределённо долго. Явный лимит + fail
      // closed на уровне RedisRateLimiterService (см. её докстринг) —
      // предпочтительнее, чем зависший запрос.
      maxRetriesPerRequest: 2,
      // Не бросает исключение из конструктора, если Redis временно
      // недоступен на старте процесса — ioredis сам переподключается в
      // фоне; вызывающий код (RedisRateLimiterService) обрабатывает ошибки
      // per-command, не полагается на то, что клиент всегда "connected".
      lazyConnect: false,
    });

    this.client.on('error', (err) => {
      this.logger.error('Redis client error', err instanceof Error ? err.stack : String(err));
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
