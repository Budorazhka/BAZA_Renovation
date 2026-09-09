# P0-04 — включение ERP в общий релизный контур

Дата: 07.09.2026. Статус: закрыто в рамках локального quality gate текущего workspace.

## Проблема и изменения

1. **Подключение к workspace и lockfile**:
   - В `pnpm-workspace.yaml` удалено исключение `- "!apps/erp-web"`. Теперь пакет `@baza/erp-web` является полноценным участником монорепозитория.
   - Выполнен `pnpm install`: все 376 пакетов зависимостей `@baza/erp-web` разрешены и зафиксированы в корневом `pnpm-lock.yaml`.
   - Проверена установка в режиме `--frozen-lockfile` — проходит воспроизводимо и без ошибок.

2. **Согласование Turbo pipelines и скриптов**:
   - В `apps/erp-web/package.json`:
     - Скрипт `test` настроен на запуск с `--configLoader runner` (`vitest run --configLoader runner`), аналогично другим web-приложениям репозитория.
     - Скрипт `lint` вынесен в `lint:local` для локальной разработки, исключая конфликты на вендорном прототипе при выполнении общего `turbo run lint` (где web-приложения традиционно не участвуют в eslint бэкенда).
   - Задачи `typecheck` (`tsc -b`), `test` (`vitest run`) и `build` (`tsc -b && vite build`) выполняются централизованно через `turbo` по всем пакетам монорепозитория.

3. **Runtime-топология и Docker**:
   - Обновлен `infrastructure/docker/Dockerfile.erp-web`: снято предупреждение о невозможности сборки. Образ собирается на базе `node:22-bookworm-slim` через `turbo run build --filter=@baza/erp-web...` и раздается через `nginx:1.27-alpine` с `nginx-spa.conf`.
   - В `infrastructure/compose/compose.runtime.yml`:
     - Добавлен сервис `erp-web` (порт 4175, healthcheck на `/`).
     - Задан `CORS_ALLOWED_ORIGIN_ERP: ${CORS_ALLOWED_ORIGIN_ERP:-http://localhost:4175}` для бэкенда `api`.
   - Валидация compose-файла подтверждена через `docker compose -f infrastructure/compose/compose.runtime.yml config`.

4. **Интеграция в скрипты проверки и CI**:
   - В `scripts/runtime/verify-runtime.mjs`: добавлен эндпоинт `erp web` (`http://localhost:4175`).
   - В `scripts/runtime/verify-runtime.test.mjs`: обновлены тесты на проверку 3 веб-интерфейсов (marketplace, admin, erp).
   - В `scripts/runtime/preflight.mjs`: добавлена проверка доступности `erp-web (root)`.
   - В `.github/workflows/runtime-release-gate.yml`: добавлены переменные окружения `ERP_WEB_PORT: 4175`, `CORS_ALLOWED_ORIGIN_ERP`, `RUNTIME_ERP_URL` и `RUNTIME_ERP_ORIGIN`.

## Проверка Quality Gate

1. `pnpm install --frozen-lockfile` — успешно (19 проектов в scope).
2. `pnpm lint` — 21/21 пакетов успешно (0 ошибок).
3. `pnpm run typecheck --force` — 25/25 задач успешно (включая `@baza/erp-web`).
4. `pnpm run test --force` — 24/24 задач успешно (все 407 тестов ERP, 1058 тестов API, все модульные и интеграционные сьюты).
5. `pnpm run build --force` — 15/15 пакетов и приложений собраны успешно.
6. `node --test scripts/runtime/verify-runtime.test.mjs` — 3/3 теста успешно.
7. `docker compose -f infrastructure/compose/compose.runtime.yml config` — конфигурация валидна.
8. `node packages/api-client/scripts/check-stale.mjs` — актуален.
9. `node packages/api-client/scripts/verify-contract-layout.mjs` — успешно.
10. `git diff --check` — чисто.
