import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

export interface RateLimitConsumeParams {
  key: string;
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Атомарный fixed-window rate limiter — INCR+EXPIRE в одном Lua-скрипте
 * (единственный execute() на Redis — избегает race между "прочитать
 * счётчик" и "инкрементировать": два конкурентных запроса, оба видящих
 * "N-1 из N слотов свободно" и оба проходящих, не должны быть возможны).
 * fixed-window (не sliding) — проще, этого достаточно для anti-abuse на
 * reveal-contact (задача явно допускает "fixed-window с Lua — это ОК, этот
 * codebase предпочитает простоту").
 *
 * EXPIRE выставляется ТОЛЬКО когда INCR вернул 1 (первый запрос в новом
 * окне) — иначе конкурентный INCR от другого запроса мог бы продлить TTL
 * окна на каждый запрос, окно никогда не закрывалось бы.
 */
const RATE_LIMIT_LUA_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
return { current, ttl }
`;

@Injectable()
export class RedisRateLimiterService {
  private readonly logger = new Logger(RedisRateLimiterService.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * Бросает исключение при ошибке Redis (не проглатывает) — вызывающий код
   * (RedisRateLimitGuard) решает fail-open/fail-closed для конкретного
   * endpoint'а, это НЕ решение самого limiter'а (см. guard докстринг).
   */
  async consume(params: RateLimitConsumeParams): Promise<RateLimitResult> {
    const [current, ttl] = (await this.redis.client.eval(
      RATE_LIMIT_LUA_SCRIPT,
      1,
      params.key,
      params.windowSeconds,
    )) as [number, number];

    const allowed = current <= params.limit;
    const retryAfterSeconds = ttl > 0 ? ttl : params.windowSeconds;

    if (!allowed) {
      this.logger.debug(`Rate limit exceeded for key=${params.key}: ${current}/${params.limit}`);
    }

    return {
      allowed,
      remaining: Math.max(0, params.limit - current),
      retryAfterSeconds,
    };
  }
}
