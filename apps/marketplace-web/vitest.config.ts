import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    // D-04A: .tsx hook-тесты переопределяют environment на jsdom файлово
    // через /** @vitest-environment jsdom */ (паттерн из apps/erp-web) —
    // дефолт остаётся node для существующих чистых .ts тестов.
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
})
