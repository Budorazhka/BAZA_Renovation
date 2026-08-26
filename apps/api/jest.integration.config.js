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
  // НЕ требует внешней инфраструктуры (Docker/compose.dev.yml) — тесты
  // сами поднимают временный in-process MongoDB single-node replica set
  // через mongodb-memory-server (первый запуск на новой машине скачивает
  // реальный mongod-бинарник, ~780МБ, кэшируется в node_modules/.cache).
  // Не выполняется как часть обычного `pnpm test`, только явного
  // `pnpm test:integration` — реальный I/O и replica set boot делают его
  // заметно медленнее unit-тестов (секунды, не миллисекунды).
  testTimeout: 120_000,
};
