# Runtime release gate

Этот документ описывает воспроизводимый локальный runtime для BAZA. Он не
заменяет `compose.dev.yml`: dev-файл сохраняет host-side topology для Jest и
ручной разработки, а runtime-файл поднимает полный набор отдельных процессов.

## Состав

| Service | Роль | Host URL/порт |
| --- | --- | --- |
| `mongodb` | MongoDB 7 replica set | `mongodb://localhost:27017` |
| `redis` | Redis 7 | `redis://localhost:6379` |
| `minio` | S3-compatible private/public storage | `http://localhost:9000` |
| `api` | Fastify/Nest API | `http://localhost:3000` |
| `worker` | отдельный outbox poller | без HTTP |
| `marketplace-web` | публичный Vite SPA | `http://localhost:4173` |
| `admin-web` | Admin control-plane Vite SPA | `http://localhost:4174` |

`admin-web` (D-07) заменяет прежний `erp-web` service на этом же слоте
(`4174`, было `ERP_WEB_PORT`, теперь `ADMIN_WEB_PORT`) — в этом worktree нет
`apps/erp-web` (пакет `@baza/erp-web` не существует, `Dockerfile.erp-web`
был stale-ссылкой в нерабочий build). `CORS_ALLOWED_ORIGIN_ERP` намеренно
не задан в `.env.runtime.example`/`compose.runtime.yml` — ERP вне scope
текущего runtime-стека этого worktree.

`api` и `worker` подключаются к Mongo по `mongodb:27017`, а не по
`localhost:27017`. Mongo runtime healthcheck инициализирует replica set с
адресом `mongodb:27017`, доступным из соседних контейнеров. Это намеренно
отдельно от host-side адреса dev compose.

## Первый запуск

Требуется Docker Desktop с работающим Docker daemon. Значения по умолчанию
безопасны только для локальной машины. Для переопределения скопируйте
`.env.runtime.example` в `.env` и замените credentials/origins.

PowerShell:

```powershell
Copy-Item .env.runtime.example .env
pnpm runtime:config
pnpm runtime:up
```

`runtime:up` собирает четыре приложения, запускает data services и ждёт их
healthchecks. `minio-init` идемпотентно создаёт private/public buckets перед
стартом API и worker.

После запуска:

- `GET http://localhost:3000/health` — liveness;
- `GET http://localhost:3000/health/ready` — Mongo readiness;
- `http://localhost:4173` — marketplace;
- `http://localhost:4174` — admin-web;
- `pnpm runtime:ps` — состояние контейнеров;
- `pnpm runtime:logs` — последние логи всех сервисов.
- `pnpm runtime:verify` — API liveness/readiness и web smoke-check.
- `pnpm runtime:preflight` — полный D-07 preflight (Node/pnpm/Docker +
  реальные Mongo/Redis/MinIO/api/marketplace-web/admin-web проверки,
  `BLOCKED_INFRASTRUCTURE` с remediation-командами при любом пробеле).

Оба web-контейнера собираются с относительным API origin `/api/v1`. Nginx
проксирует `/api/` к `api:3000`, поэтому браузеру не нужны прямые cross-origin
запросы к внутреннему имени контейнера. API всё равно получает явные CORS
origins для host ports.

## Runtime verification

После `runtime:up` выполните:

```powershell
pnpm runtime:ps
pnpm runtime:verify
pnpm runtime:preflight
pnpm runtime:e2e
```

`pnpm runtime:e2e` запускает полный D-07 Playwright runtime E2E gate
(`apps/e2e-runtime`) — реальный браузер против реально запущенных
процессов, не `mongodb-memory-server` unit/integration-тесты. Подробности:
сценарии, известные ограничения, seed-скрипт для первого super_admin —
см. `docs/operations/d07-runtime-e2e-gate.md`.

Для отдельной проверки listing publication создайте/активируйте/publish
listing через существующий API, затем убедитесь, что worker в логах обработал
`PublicationRequested`, а `GET /api/v1/public/listings` возвращает проекцию.
Проверка должна идти против контейнерного API и отдельного worker, а не только
против `MongoMemoryReplSet` integration test.

Остановка и очистка контейнеров:

```powershell
pnpm runtime:down
```

Именованные runtime volumes сохраняются. Если нужен полностью чистый локальный
стенд, удаляйте только перечисленные runtime volumes после остановки стека:
`baza-runtime_mongodb_runtime_data`, `baza-runtime_redis_runtime_data`,
`baza-runtime_minio_runtime_data`.

## Verification policy

- `pnpm typecheck`, `pnpm test`, `pnpm test:integration` и `pnpm build` —
  репозиторные проверки кода.
- `docker compose ... config` — синтаксическая и interpolated-проверка Compose.
- `/health`/`/health/ready`, web root и worker log — runtime smoke checks.
- Playwright D-07 (`apps/e2e-runtime`, `pnpm runtime:e2e`) и worker
  publication runtime E2E считаются зелёными ТОЛЬКО после реального запуска
  против отдельных процессов — `playwright test --list` подтверждает
  наличие тестов, но список не является доказательством прохождения.
- Если Docker daemon, base images или внешние сервисы недоступны, runtime gate
  остаётся `blocked`; нельзя заменять его `playwright --list` или API
  integration-тестами. `apps/e2e-runtime`'s Playwright `globalSetup`
  enforces this structurally: it re-runs the same preflight
  (`scripts/runtime/preflight.mjs`) that `pnpm runtime:preflight` runs
  standalone, and throws (hard Playwright failure, not a skip) on any gap —
  see `docs/operations/d07-runtime-e2e-gate.md` "Known limitations" for what
  that means in an environment without Docker.

## Troubleshooting

- Если API не проходит readiness, сначала проверьте `docker compose ... logs
  mongodb api` и наличие `mongodb:27017` в replica-set status.
- Если MinIO bucket init повторяется, это нормально: `mc mb --ignore-existing`
  делает job безопасной для повторного запуска.
- Если web открывается, но API возвращает 502, проверьте `api` health и nginx
  proxy в `docker compose ... logs marketplace-web admin-web`.
- Если production build web-приложения жалуется на API origin, используйте
  относительный `/api/v1`, а не `http://localhost:3000`: nginx-контейнер
  проксирует `/api/` к `api:3000` изнутри Compose-сети, прямой host-адрес
  браузеру не нужен и не должен использоваться как build-time origin.
