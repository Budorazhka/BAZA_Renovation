import { flushAllRedisMocks } from './redis-mock';

/**
 * Глобальный afterEach для интеграционных тестов (подключён через
 * setupFilesAfterEnv в jest.integration.config.js).
 *
 * Сбрасывает счётчики rate-limiter'а между тестами. Сделано здесь, а не в
 * каждой спеке, потому что относится ко всем файлам одинаково и не должно
 * забываться при добавлении новых. Для спек без ioredis-mock это no-op —
 * реестр пуст.
 */
afterEach(async () => {
  await flushAllRedisMocks();
});
