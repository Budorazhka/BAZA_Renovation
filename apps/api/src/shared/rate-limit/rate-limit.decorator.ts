import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_METADATA_KEY = 'rateLimit';

export interface RateLimitOptions {
  /** Redis-ключ neймспейс, например 'auth-login' — уникален per-route. */
  keyPrefix: string;
  /** Максимум запросов с одного IP за окно. */
  limit: number;
  windowSeconds: number;
}

/**
 * Вешается на конкретный route (не на класс) — в отличие от
 * RedisRateLimitGuard (жёстко под reveal-contact: составной IP+slug ключ),
 * этот guard общего назначения читает лимит/окно из метадаты, чтобы один
 * IpRateLimitGuard закрывал все публичные auth-подобные эндпоинты
 * (login/register/organization onboarding/invite activate) без дублирования
 * guard-класса под каждый.
 */
export const RateLimit = (options: RateLimitOptions): MethodDecorator =>
  SetMetadata(RATE_LIMIT_METADATA_KEY, options);
