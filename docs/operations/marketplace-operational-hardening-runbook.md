# Marketplace Operational Hardening — Runbook (Redis Rate Limiting, Guest Idempotency, Orphaned Media Cleanup)

**Дата:** 30.08.2026
**Ветка:** `codex/marketplace-operational-hardening`
**База:** `a465245` (`codex/marketplace-production-gate`)

Эксплуатационный runbook для трёх production-hardening механизмов, добавленных этим проходом. Не дублирует архитектурное описание reveal-contact flow (см. `docs/operations/public-listing-leads.md`) — только то, что нужно оператору: env vars, failure modes, как проверить состояние, rollback.

---

## 1. Guest idempotency для `reveal-contact`

### Что это

`POST /public/listings/:slug/reveal-contact` и `POST /public/developments/:slug/reveal-contact` теперь опционально принимают заголовок `Idempotency-Key`. Механизм отдельный от аутентифицированного ADR-006 (`shared/idempotency/idempotency.service.ts`) — тот требует `identityId`, которого у анонимного гостя нет.

### Поведение

- **Без заголовка** — поведение не меняется, каждый вызов создаёт новый `Lead`. Полная обратная совместимость.
- **С заголовком, тот же `(slug, key)`, тот же payload** — возвращает ранее сохранённый `{phone, whatsapp?, telegram?, leadId}` и `200`, **не создаёт новый Lead/LeadEvent/audit-запись**.
- **С заголовком, тот же `(slug, key)`, другой payload** — `409 IDEMPOTENCY_KEY_CONFLICT`.
- **Параллельные запросы с одним ключом** — ровно один Lead создаётся; проигравший в гонке транзакции ловит duplicate-key ошибку на уникальном индексе, откатывается, и синхронно возвращает то, что записал победитель (не 500, не второй Lead).

### Хранилище

Коллекция `public_reveal_idempotency_records` (не переиспользует `idempotency_records`). Уникальный индекс `{publicationSlug, idempotencyKey}`. TTL-индекс на `createdAt`.

### Env vars

| Переменная | Дефолт | Назначение |
|---|---|---|
| `PUBLIC_REVEAL_IDEMPOTENCY_TTL_HOURS` | `48` | Через сколько часов запись idempotency истекает (Mongo TTL index, `expireAfterSeconds`). Читается напрямую из `process.env` при регистрации схемы (до старта Nest DI), поэтому требует **рестарта процесса api**, если меняется. |

### Non-disclosure инвариант

`responseBody`, сохранённый в idempotency-записи, содержит **только** `{phone, whatsapp?, telegram?, leadId}` — те же поля, что клиент получает напрямую. `organizationId`/`publisherScope`/`identityId` никогда не попадают в эту коллекцию (см. `sanitizeRevealResponse` в `crm.service.ts`). Единый `404 Publication not found` для всех сценариев резолвинга (unknown slug/unpublished/wrong sourceType/missing Listing/missing PropertyAsset/non-organization publisher) не тронут этим проходом.

### Failure mode

Mongo недоступен ⇒ весь reveal-contact endpoint падает так же, как и раньше (эта команда всегда была Mongo-transactional) — не новый failure mode, не отдельно обрабатывается.

### Rollback

Убрать чтение заголовка `Idempotency-Key` в контроллерах (`listing-crm.controller.ts`, `crm.controller.ts`) и вызов `revealWithIdempotency` в `crm.service.ts` — оставшийся код (`createLeadForReveal`) работает точно так же, как до этого прохода. Коллекцию `public_reveal_idempotency_records` можно оставить (TTL сам её очистит) или удалить вручную — она не читается никаким другим кодом.

---

## 2. Redis-backed distributed rate limiting

### Что это

`reveal-contact` (оба варианта) больше не использует `@nestjs/throttler`'s in-memory `ThrottlerGuard` (не shared между API-инстансами за балансировщиком). Вместо этого — `RedisRateLimitGuard` (`apps/api/src/shared/rate-limit/`), атомарный fixed-window limiter на Redis (`INCR`+`EXPIRE` одним Lua-скриптом).

### Составные лимиты

Guard проверяет **два** независимых лимита и применяет строжайший:

- `ratelimit:reveal-contact:ip:{ip}` — защита от одного IP, долбящего любой listing.
- `ratelimit:reveal-contact:listing:{slug}` — защита одного listing от ботнета с разных IP.

### Env vars

| Переменная | Дефолт | Назначение |
|---|---|---|
| `REDIS_URL` | нет (обязателен) | Строка подключения ioredis. В `infrastructure/compose/compose.runtime.yml` собирается автоматически из `REDIS_PASSWORD`; для локального запуска `apps/api` вне docker нужен явный `.env`. |
| `RATE_LIMIT_REVEAL_CONTACT_IP_LIMIT` | `5` | Запросов на IP за окно. |
| `RATE_LIMIT_REVEAL_CONTACT_LISTING_LIMIT` | `20` | Запросов на listing за окно. |
| `RATE_LIMIT_REVEAL_CONTACT_WINDOW_SECONDS` | `60` | Длина окна. |

Изменение лимитов не требует изменения схемы/индекса — читается через `ConfigService` на каждый запрос, применяется сразу после рестарта процесса (или деплоя нового значения env, если платформа хот-релоадит конфиг).

### Failure mode — **fail closed**

Если Redis недоступен (таймаут, `ECONNREFUSED`, ошибка соединения), `RedisRateLimitGuard` возвращает **`503 Service temporarily unavailable`**, не пропускает запрос. Это осознанное решение: reveal-contact раскрывает номер телефона через создание Lead — privacy/PII-sensitive команда. Тихий fail-open здесь означал бы, что деградация Redis снимает anti-abuse защиту именно с самого чувствительного публичного endpoint'а, причём именно тогда, когда наблюдаемость хуже всего.

Полная ошибка логируется server-side (`RedisRateLimitGuard`, уровень `error`) — клиенту отдаётся только generic `503`, детали инфраструктурного сбоя не раскрываются.

**Нет in-memory fallback.** Если Redis лежит — reveal-contact недоступен, пока Redis не восстановится. Это намеренно (см. выше), не забытый TODO.

### Как проверить состояние

```bash
# Redis доступен?
docker compose -f infrastructure/compose/compose.runtime.yml exec redis redis-cli -a "$REDIS_PASSWORD" PING

# Текущий счётчик для конкретного IP/listing (TTL — сколько до сброса окна)
redis-cli -a "$REDIS_PASSWORD" GET "ratelimit:reveal-contact:ip:203.0.113.5"
redis-cli -a "$REDIS_PASSWORD" TTL "ratelimit:reveal-contact:ip:203.0.113.5"
```

429-ответ содержит заголовок `Retry-After` (секунды до сброса окна) — клиент/фронтенд должен на него ориентироваться, не ретраить вслепую.

### Rollback

1. Быстрый (без деплоя кода) — поднять лимиты через env (`RATE_LIMIT_REVEAL_CONTACT_*_LIMIT`) до значений, эффективно не блокирующих трафик, и рестартовать api. Redis остаётся source of truth, просто лимит становится мягче.
2. Полный откат к `@nestjs/throttler` — вернуть `@UseGuards(ThrottlerGuard)`/`@Throttle(...)` на `ListingCrmController`/`CrmController` и убрать `RedisRateLimitGuard`. Возвращает in-memory (не shared между инстансами) поведение — та же проблема, которую этот проход устраняет. Использовать только как временную меру при полном отказе Redis-инфраструктуры, не как штатный режим.

### Что НЕ было сделано

`@nestjs/throttler` как npm-зависимость оставлен в `apps/api/package.json`, хотя его регистрация (`ThrottlerModule.forRoot`) и все `@Throttle`-декораторы убраны — пакет сейчас не используется нигде в коде. Не удалён в этом проходе (не входило в scope, минимальный diff), кандидат на отдельный follow-up cleanup.

---

## 3. Orphaned pending media cleanup

### Что это

Media upload — трёхфазный flow: `upload-intent` (создаёт `MediaAsset` со `status:'pending'`) → клиент грузит файл напрямую в MinIO по presigned URL (TTL 300 секунд) → `confirm` (переводит в `verified`/`rejected`). Если клиент не доходит до фазы 3 (закрыл вкладку, потерял сеть, presigned URL истёк) — `MediaAsset` остаётся `pending` навсегда, объект может остаться в MinIO без владельца.

`MediaAssetRepository.findStalePending()` существовал с прошлого прохода (ADR-008), но не имел вызывающего кода — теперь есть: `apps/worker/src/jobs/media-cleanup.service.ts`.

### Запуск

Standalone command, **не** in-process scheduler — в кодовой базе нет ни одной scheduling-зависимости (`@nestjs/schedule`, `nest-commander`, `@Cron` — grep подтверждает ноль совпадений), поэтому cleanup вызывается **внешним ops-cron'ом**, не постоянно работающим процессом:

```bash
# Дефолтный запуск (реально удаляет)
pnpm --filter worker run cleanup:orphaned-media

# Dry-run — находит и логирует кандидатов, ничего не удаляет
pnpm --filter worker run cleanup:orphaned-media -- --dry-run
# либо
MEDIA_CLEANUP_DRY_RUN=true pnpm --filter worker run cleanup:orphaned-media
```

Рекомендуемое расписание ops-cron: раз в час (при TTL=24ч запас достаточный, не требует более частого запуска).

### Env vars

| Переменная | Дефолт | Назначение |
|---|---|---|
| `MEDIA_ORPHAN_TTL_HOURS` | `24` | Возраст `pending`-записи, после которого она считается orphaned. Сильно больше presigned URL TTL (5 минут) намеренно — запас на сетевые задержки/ретраи клиента до `confirm`, чтобы никогда не удалить объект, который гость ещё может (пусть и с опозданием) подтвердить. Тот же cutoff используется и как порог "протухшего" claim'а прошлого упавшего прогона (см. ниже). |

### Race-safety (confirm vs cleanup)

Cleanup **никогда** не удаляет объект напрямую после `find()`. Последовательность на каждый кандидат:

1. `claimForCleanup(id, cutoff)` — атомарный `updateOne` с фильтром `{_id, status:'pending', orphanCleanupClaimedAt: не существует ИЛИ старше cutoff}`, ставит `orphanCleanupClaimedAt: now`.
2. Если `modifiedCount === 0` — либо гость выиграл гонку и уже сделал `confirm` (статус уже не `pending`), либо другой прогон cleanup уже держит свежий claim. В обоих случаях — **безопасно пропущено**, не ошибка, счётчик `skipped++`.
3. Если claim выигран — `MediaStorageService.deleteObject()` (реальное удаление из MinIO), затем `deletePermanently()` (удаление Mongo-документа).
4. Если `deleteObject()` падает — Mongo-документ **не удаляется**, остаётся `claimed`. Следующий прогон увидит протухший claim (старше `MEDIA_ORPHAN_TTL_HOURS`) и повторит попытку. Никогда не удаляем Mongo-запись раньше подтверждённого удаления объекта в storage — иначе осиротевший объект в MinIO остался бы навсегда, ничем не отслеживаемый.

`status:'verified'` не трогается никогда (запрос `findStalePending` фильтрует по `status:'pending'` на уровне Mongo-запроса, не постфактум в коде). `status:'rejected'` тоже не трогается этим проходом — ретеншн-политика для отклонённых медиа осталась вне scope, продуктовое решение не принято.

### Идемпотентность повторного запуска

Второй подряд запуск cleanup находит только то, что осталось `pending` и старше cutoff — уже удалённые записи просто не матчатся запросом. Повторный запуск не ошибается и не приводит к двойному учёту.

### Метрики/логирование

Каждый прогон логирует (`Logger`, `apps/worker`):

```
media cleanup run started: found=N cutoff=<ISO> dryRun=<bool>
media cleanup failed for media_asset <id>            # только при ошибке, per-item
media cleanup run finished: found=N deleted=N skipped=N errors=N
```

`errors > 0` в финальной строке — сигнал проверить логи конкретных `media_asset` (обычно временная недоступность MinIO) и, если нужно, повторно прогнать cleanup вручную раньше следующего запланированного запуска.

### Storage abstraction

Используется исключительно `MediaStorageService.deleteObject({bucket, key})` (новый метод, добавлен этим проходом) — нигде в cleanup-коде нет прямого обращения к S3 SDK/MinIO.

### Rollback

Отключить ops-cron запуск команды — `findStalePending`/`claimForCleanup` не вызываются больше нигде, orphaned `pending`-записи просто накапливаются как раньше (до этого прохода). Данные не теряются, поведение возвращается к состоянию "нет автоматической уборки".

---

## 4. Сводка security invariants, проверенных этим проходом

| Инвариант | Как обеспечен |
|---|---|
| Единый `404` для недоступных публикаций | Резолвинг slug→publication→listing/development→propertyAsset не изменён; `revealWithIdempotency` вызывается только ПОСЛЕ успешного резолвинга. |
| Non-disclosure `{phone, leadId}` | `sanitizeRevealResponse()` — явный whitelist полей, сохраняемых в idempotency-записи; тот же набор полей уходит клиенту напрямую (без и с idempotency-key). |
| Audit только на реальном создании Lead | `AuditService.append('lead.create_from_reveal')` вызывается только внутри `createLeadForReveal`, который не вызывается на replay-пути (`revealWithIdempotency` возвращает сохранённый ответ раньше). |
| Не in-memory idempotency/rate-limit storage | Guest idempotency — Mongo (`public_reveal_idempotency_records`, реплицируемая коллекция); rate limiting — Redis (shared между инстансами). Ни один механизм не хранит состояние в памяти процесса. |
| Fail-closed на security-critical пути | `RedisRateLimitGuard` — `503` при недоступном Redis, не пропускает трафик. |
| Media cleanup никогда не трогает `verified` | Query-level фильтр `status:'pending'` в `findStalePending`/`claimForCleanup`, проверено тестами на confirm-vs-cleanup race. |
| Cross-tenant / auth model не изменены | Ни один guard/permission/scope-check из существующей authorization model не тронут этим проходом. |

---

## 5. Изменённые/новые файлы (сводка, детали — в отчёте сессии)

- `apps/api/src/shared/idempotency/public-reveal-idempotency*.ts` (новое)
- `apps/api/src/shared/redis/`, `apps/api/src/shared/rate-limit/` (новое)
- `apps/worker/src/jobs/media-cleanup*.ts` (новое)
- `packages/media-storage/src/media-storage.service.ts` (+`deleteObject`)
- `packages/media-storage/src/repository/media-asset.repository.ts` (+`claimForCleanup`, +`deletePermanently`)
- `packages/media-storage/src/schemas/media-asset.schema.ts` (+`orphanCleanupClaimedAt`)
- `apps/api/src/modules/crm/*` (idempotency wiring в reveal-contact)
- `docs/api/v1-first-vertical-slice.yaml` (+ опциональный `Idempotency-Key` header parameter)
- `.env.example` (все новые переменные из таблиц выше)
