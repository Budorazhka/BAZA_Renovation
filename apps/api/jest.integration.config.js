/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/test/integration'],
  testMatch: ['**/*.integration-spec.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  // Глобальный afterEach: сброс счётчиков ioredis-mock между тестами —
  // иначе fixed-window лимиты (auth-register/org-register: 5 запросов на
  // IP за 60 секунд, а в тестах весь трафик с одного адреса) текут из
  // теста в тест и роняют спеки в 429. См. support/redis-mock.ts.
  setupFilesAfterEnv: ['<rootDir>/test/integration/support/jest-setup-after-env.ts'],
  // НЕ требует внешней инфраструктуры (Docker/compose.dev.yml) — тесты
  // сами поднимают временный in-process MongoDB single-node replica set
  // через mongodb-memory-server (первый запуск на новой машине скачивает
  // реальный mongod-бинарник, ~780МБ, кэшируется в node_modules/.cache).
  // Не выполняется как часть обычного `pnpm test`, только явного
  // `pnpm test:integration` — реальный I/O и replica set boot делают его
  // заметно медленнее unit-тестов (секунды, не миллисекунды).
  testTimeout: 120_000,
  /**
   * forceExit — из-за него интеграционный гейт в CI не завершался НИ РАЗУ.
   *
   * Диагностика (01.09.2026, прогон 33450483014): все 33 файла и все 396
   * тестов проходят, после чего jest просто НЕ выходит, и задача висит до
   * таймаута. В логе 13 994 строки `AggregateError` — это ioredis из тех
   * спек, что не подменяют RedisService: `lazyConnect: false` открывает
   * соединение сразу, в CI слушателя на localhost:6379 нет, клиент
   * бесконечно переподключается и держит хендлы открытыми. Локально это
   * маскировалось тем, что jest успевал сам сработать аварийным
   * "worker process has failed to exit gracefully".
   *
   * Правильнее было бы, чтобы ни одна спека не поднимала настоящий
   * ioredis (см. support/redis-mock.ts — уже подставлен в 12 файлов);
   * forceExit оставлен как страховка, чтобы зелёный прогон не зависел от
   * того, не забыл ли кто-то мок в новой спеке. Он срабатывает ПОСЛЕ
   * завершения всех тестов, поэтому не может скрыть падение — только
   * не-закрытые хендлы.
   */
  forceExit: true,
};
