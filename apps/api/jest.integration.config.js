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
};
