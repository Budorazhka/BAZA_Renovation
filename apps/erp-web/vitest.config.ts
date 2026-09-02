import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Юнит-тесты гоняются vitest'ом изолированно: тест-файлы (tests/**) не входят
// ни в `tsc -b`, ни в `vite build`, поэтому на прод-бандл и бэкенд не влияют.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
