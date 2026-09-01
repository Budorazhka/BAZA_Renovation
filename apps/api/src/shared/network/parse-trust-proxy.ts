/**
 * `req.ip` (использован везде, где нужен per-IP rate limit: RedisRateLimitGuard,
 * IpRateLimitGuard) без `trustProxy` — это адрес reverse proxy/балансировщика
 * перед API, ОДИН и тот же для всех гостей за ним, не реальный клиентский IP
 * (security review: за прокси весь anti-abuse rate limit на практике
 * схлопывается в один общий лимит на всю платформу). `TRUST_PROXY` — список
 * доверенных hop-адресов (сам reverse proxy), через запятую, из которых
 * Fastify берёт `X-Forwarded-For` — НЕ `true` (это доверяло бы заголовку от
 * любого источника, тривиально подделываемому напрямую внешним клиентом,
 * минуя прокси). Пусто/не задано — `false` (без reverse proxy перед API,
 * как в локальной разработке), `req.ip` остаётся адресом сокета.
 *
 * Отдельный файл (не inline в main.api.ts) — main.api.ts вызывает
 * bootstrap() на уровне модуля (см. её низ), импортировать его в тесте
 * означало бы поднимать реальное Nest-приложение; чистая функция вынесена,
 * чтобы её можно было протестировать изолированно.
 */
export function parseTrustProxy(raw: string | undefined): boolean | string[] {
  if (!raw || raw.trim() === '' || raw.trim() === 'false') return false;
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}
