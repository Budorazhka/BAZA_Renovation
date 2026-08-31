import { CanActivate, ExecutionContext, HttpException, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { RedisRateLimiterService } from './redis-rate-limiter.service';
import { RATE_LIMIT_METADATA_KEY, type RateLimitOptions } from './rate-limit.decorator';

/**
 * Rate limit по IP для публичных auth-подобных команд (login/register/
 * organization onboarding/invite activate) — security review: до этого
 * guard'а rate limit в кодовой базе существовал ТОЛЬКО на reveal-contact
 * (RedisRateLimitGuard), сам auth-контур был полностью без анти-abuse
 * защиты (credential stuffing на /auth/login, DoS через argon2id — 64МБ
 * памяти на попытку хеширования, см. AuthService — на дешёвом сервере
 * сотня параллельных запросов исчерпывает RAM).
 *
 * Route без @RateLimit(...) метадаты пропускается без проверки — этот
 * guard навешивается точечно (@UseGuards(IpRateLimitGuard) + @RateLimit(...)
 * на конкретном методе), не глобально, тот же паттерн, что уже применён к
 * RedisRateLimitGuard на reveal-contact.
 *
 * Fail-closed при недоступности Redis — тот же принцип, что
 * RedisRateLimitGuard: недоступный rate limiter не должен тихо снимать
 * анти-abuse защиту с публичного эндпоинта именно тогда, когда
 * наблюдаемость хуже всего.
 */
@Injectable()
export class IpRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(IpRateLimitGuard.name);

  constructor(
    private readonly rateLimiter: RedisRateLimiterService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.get<RateLimitOptions | undefined>(
      RATE_LIMIT_METADATA_KEY,
      context.getHandler(),
    );
    if (!options) return true;

    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const reply = context.switchToHttp().getResponse<FastifyReply>();

    let result;
    try {
      result = await this.rateLimiter.consume({
        key: `ratelimit:${options.keyPrefix}:ip:${req.ip}`,
        limit: options.limit,
        windowSeconds: options.windowSeconds,
      });
    } catch (error) {
      this.logger.error(
        `Redis rate limiter unavailable — failing closed on ${options.keyPrefix}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new HttpException('Service temporarily unavailable', 503);
    }

    if (!result.allowed) {
      reply.header('Retry-After', String(result.retryAfterSeconds));
      throw new HttpException('Too many requests', 429);
    }

    return true;
  }
}
