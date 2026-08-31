import { CanActivate, ExecutionContext, HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { RedisRateLimiterService } from './redis-rate-limiter.service';

/**
 * Заменяет @nestjs/throttler ThrottlerGuard (in-memory, не shared между
 * инстансами API — см. app.module.ts докстринг про ThrottlerModule.forRoot)
 * на public/*'reveal-contact' — Redis-backed, консистентен между всеми
 * запущенными API-процессами за балансировщиком.
 *
 * Составной ключ: и по IP, и по publicationSlug (path-параметр `slug`) —
 * enforced СТРОЖАЙШИЙ из двух лимитов, чтобы (а) один IP не мог задолбить
 * ОДИН конкретный listing запросами с разными slug (защита per-IP), и (б)
 * ботнет с множества IP не мог задолбить ОДИН конкретный listing (защита
 * per-listing). Ни один из двух лимитов по отдельности не закрывает оба
 * сценария.
 *
 * FAIL CLOSED при недоступности Redis (см. RedisRateLimiterService.consume
 * — бросает при ошибке, не проглатывает): reveal-contact раскрывает номер
 * телефона через создание Lead — privacy/PII-sensitive команда. Тихий
 * fail-open здесь означал бы, что отказ инфраструктуры Redis снимает
 * anti-abuse защиту с самого чувствительного публичного endpoint'а именно
 * тогда, когда наблюдаемость хуже всего — прямо противоположно желаемому.
 * "Лучше временно отказать гостю в reveal, чем позволить неограниченный
 * scraping контактов при деградации инфраструктуры" — явное решение,
 * не обходится тихим fallback на in-memory limiting (это заново вносило
 * бы проблему "не shared между инстансами", которую эта замена как раз
 * устраняет).
 */
@Injectable()
export class RedisRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RedisRateLimitGuard.name);

  constructor(
    private readonly rateLimiter: RedisRateLimiterService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const reply = context.switchToHttp().getResponse<FastifyReply>();
    const slug = (req.params as Record<string, string> | undefined)?.slug ?? 'unknown';
    const ip = req.ip;

    const ipLimit = Number(this.config.get('RATE_LIMIT_REVEAL_CONTACT_IP_LIMIT') ?? 5);
    const listingLimit = Number(this.config.get('RATE_LIMIT_REVEAL_CONTACT_LISTING_LIMIT') ?? 20);
    const windowSeconds = Number(this.config.get('RATE_LIMIT_REVEAL_CONTACT_WINDOW_SECONDS') ?? 60);

    let ipResult;
    let listingResult;
    try {
      [ipResult, listingResult] = await Promise.all([
        this.rateLimiter.consume({ key: `ratelimit:reveal-contact:ip:${ip}`, limit: ipLimit, windowSeconds }),
        this.rateLimiter.consume({
          key: `ratelimit:reveal-contact:listing:${slug}`,
          limit: listingLimit,
          windowSeconds,
        }),
      ]);
    } catch (error) {
      // Fail closed — см. докстринг класса. Логируем полную ошибку
      // server-side (диагностика инцидента с Redis), клиенту — только
      // generic 503, не детали инфраструктурного сбоя.
      this.logger.error(
        'Redis rate limiter unavailable — failing closed on privacy-sensitive endpoint',
        error instanceof Error ? error.stack : String(error),
      );
      throw new HttpException('Service temporarily unavailable', 503);
    }

    // Строжайший из двух лимитов — наименьший remaining/наибольший retryAfter.
    const strictest = ipResult.allowed && listingResult.allowed ? null : !ipResult.allowed ? ipResult : listingResult;

    if (strictest) {
      reply.header('Retry-After', String(strictest.retryAfterSeconds));
      throw new HttpException('Too many requests', 429);
    }

    return true;
  }
}
