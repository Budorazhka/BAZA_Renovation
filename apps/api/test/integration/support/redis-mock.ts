import RedisMock from 'ioredis-mock';

/**
 * DI-подмена RedisService на ioredis-mock для интеграционных тестов.
 *
 * Зачем: оба рейт-лимитера (RedisRateLimitGuard на reveal-contact и
 * IpRateLimitGuard на auth-login/auth-register/org-register/invite-activate)
 * ходят в Redis через RedisRateLimiterService и намеренно ПАДАЮТ ЗАКРЫТО
 * при его недоступности — отдают 503 (см. докстринги guard'ов: тихий
 * fail-open снимал бы anti-abuse защиту с самых чувствительных публичных
 * endpoint'ов ровно тогда, когда наблюдаемость хуже всего). Без живого
 * Redis это делало нерабочими 11 интеграционных файлов (~85 тестов):
 * любая регистрация идентити или организации ПО HTTP упиралась в 503 ещё
 * до бизнес-логики. Спеки, которые сеют данные через сервисы напрямую
 * (authService.registerIdentity и т.п.), guard'ов не проходят и потому
 * работали и без этого.
 *
 * ioredis-mock, а не поднятый настоящий Redis: у Redis нет официальной
 * сборки под Windows (машина владельца), а вся поверхность Redis в
 * кодовой базе — один `client.eval(...)` с фиксированным Lua-скриптом,
 * который ioredis-mock эмулирует полноценно. Тот же принцип подмены
 * инфраструктуры, что MongoMemoryReplSet делает для MongoDB.
 *
 * Важно: это НЕ заглушка "всё разрешать" — fixed-window семантика
 * (INCR + EXPIRE на первом запросе окна + TTL) работает по-настоящему,
 * поэтому тесты, которые ПРОВЕРЯЮТ срабатывание лимита (429 на
 * reveal-contact), остаются осмысленными.
 *
 * Паттерн изначально появился inline в listing-reveal-lead/
 * development-reveal-lead; вынесен сюда, когда понадобился ещё девяти
 * файлам.
 */

const createdClients: InstanceType<typeof RedisMock>[] = [];

export function createRedisMockService(): {
  client: InstanceType<typeof RedisMock>;
  onModuleDestroy: () => Promise<void>;
} {
  const client = new RedisMock();
  createdClients.push(client);
  return {
    client,
    onModuleDestroy: async () => {},
  };
}

/**
 * Сброс счётчиков между тестами. Вызывается глобальным afterEach из
 * support/jest-setup-after-env.ts, а не из каждой спеки по отдельности.
 *
 * Без него счётчики fixed-window текут из теста в тест ВНУТРИ файла, и
 * спеки, регистрирующие несколько идентити/организаций по HTTP, упираются
 * в 429 (auth-register и org-register — 5 запросов на IP за 60 секунд, а
 * в тестах весь трафик идёт с одного адреса). Сброс именно между тестами,
 * а не внутри теста: тесты, проверяющие срабатывание лимита, набивают
 * счётчик в пределах одного it() и должны видеть настоящий 429.
 */
export async function flushAllRedisMocks(): Promise<void> {
  await Promise.all(createdClients.map((client) => client.flushall()));
}
