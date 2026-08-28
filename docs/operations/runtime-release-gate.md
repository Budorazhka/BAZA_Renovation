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
| `erp-web` | ERP Vite SPA | `http://localhost:4174` |

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
- `http://localhost:4174` — ERP;
- `pnpm runtime:ps` — состояние контейнеров;
- `pnpm runtime:logs` — последние логи всех сервисов.
- `pnpm runtime:verify` — API liveness/readiness и web smoke-check.

Оба web-контейнера собираются с относительным API origin `/api/v1`. Nginx
проксирует `/api/` к `api:3000`, поэтому браузеру не нужны прямые cross-origin
запросы к внутреннему имени контейнера. API всё равно получает явные CORS
origins для host ports.

## Runtime verification

После `runtime:up` выполните:

```powershell
pnpm runtime:ps
pnpm runtime:verify
pnpm --filter @baza/erp-web test:e2e
```

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
- Playwright D-07 и worker publication runtime E2E считаются зелёными только
  после реального запуска против отдельных процессов.
- Если Docker daemon, base images или внешние сервисы недоступны, runtime gate
  остаётся `blocked`; нельзя заменять его `playwright --list` или API
  integration-тестами.

## Troubleshooting

- Если API не проходит readiness, сначала проверьте `docker compose ... logs
  mongodb api` и наличие `mongodb:27017` в replica-set status.
- Если MinIO bucket init повторяется, это нормально: `mc mb --ignore-existing`
  делает job безопасной для повторного запуска.
- Если web открывается, но API возвращает 502, проверьте `api` health и nginx
  proxy в `docker compose ... logs marketplace-web erp-web`.
- Если ERP production build жалуется на API origin, используйте относительный
  `/api/v1`, а не `http://localhost:3000`: это требование текущего
  `PLATFORM_API_BASE_URL` guard.
