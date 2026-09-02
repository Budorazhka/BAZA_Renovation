import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

// Должен совпадать с путём, по которому отдаётся приложение (с завершающим /).
// Корень сайта → '/'. Подкаталог → '/agencynew/' и т.п. Иначе чанки грузятся с неверного URL и сервер отдаёт HTML → ошибка MIME type для module scripts.
export default defineConfig({
  base: '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(projectRoot, './src'),
    },
  },
})
