import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // @vitejs/plugin-react (не только environment) — этот app первым в
  // монорепо пишет JSX прямо в тестах (render(<Component/>), не только
  // renderHook), automatic JSX runtime без плагина здесь не резолвится,
  // esbuild падает на "React is not defined" (classic runtime по умолчанию).
  plugins: [react()],
  test: {
    environment: 'node',
    // Тот же паттерн, что apps/marketplace-web: .tsx hook/component-тесты
    // переопределяют environment на jsdom файлово через
    // /** @vitest-environment jsdom */, дефолт остаётся node.
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
})
