# Admin control plane

`apps/admin-web` — внутреннее приложение, через которое super_admin и
scoped admin входят в существующий admin-контур API, просматривают
публикации в пределах своего scope и снимают публикацию с публикации с
обязательной причиной. super_admin дополнительно управляет составом
admin-аккаунтов и их grants.

Ветка: `codex/admin-control-plane`, от коммита `6cfce25`.

**ОБНОВЛЕНО** веткой `codex/admin-lifecycle-hardening` (от `fd08c94`,
`origin/codex/integration`) — закрывает четыре ранее honest-gap пункта
из "Что не реализовано" ниже: logout/session invalidation, деактивация/
реактивация admin-аккаунта, revoke granta. Разделы ниже помечены
"ИЗМЕНЕНО"/"НОВОЕ" там, где это применимо; OpenAPI-контракт теперь
существует как `docs/api/v1-first-vertical-slice.yaml` (не существовал
до этой ветки).

## Готовые сценарии

1. **Вход.** `POST /auth/login` (уже существовал) — общий endpoint для
   marketplace/erp/admin, audience резолвится сервером по `Origin`.
   Успешный логин выставляет httpOnly `baza_session` cookie. admin-web не
   хранит и не читает токен сам — вся сессия живёт в cookie.
2. **Просмотр публикаций в своём scope.** `GET /admin/publications` (уже
   существовал) — server-side пагинация (cursor+limit), фильтры
   `sourceType`/`city`. Список уже ограничен пересечением клиентского
   фильтра и реального read-scope админа — сервер, не UI, решает, что
   видно.
3. **Снятие публикации с обязательной причиной.** `POST
   /admin/publications/:id/unpublish` (уже существовал) — reason
   `minLength: 10`, permission-проверка на `resource=sourceType,
   action='unpublish'` с учётом city-scope, аудируется в одной транзакции
   с самим изменением. UI требует подтверждения в диалоге и не даёт
   отправить форму с коротким reason.
4. **Whoami / scope-aware UI.** `GET /admin/me` (**новый**) — отдаёт
   `isSuperAdmin` и агрегированный `publicationReadScope`, чтобы фронтенд
   мог показать/скрыть "Аккаунты" в навигации и не путать "не вошёл" с
   "вошёл, но нет доступа" (см. "Известные ограничения" ниже).
5. **Создание admin-аккаунта.** `POST /admin/accounts` (уже
   существовал) — только super_admin, требует уже существующий
   `identityId` (см. gap ниже — приглашения по email нет).
6. **Выдача grant.** `POST /admin/accounts/:id/grants` (уже
   существовал) — только super_admin, один grant за вызов.
7. **Список admin-аккаунтов.** `GET /admin/accounts` (**новый**) —
   только super_admin, без него экран управления аккаунтами не мог бы
   отрендерить ничего.
8. **Просмотр grants аккаунта.** `GET /admin/accounts/:id/grants`
   (**ИЗМЕНЕНО** — теперь включает уже отозванные grants) — только
   super_admin, нужен, чтобы видеть, что уже выдано (и что отозвано),
   до выдачи нового grant.
9. **Выход.** `POST /auth/logout` (**НОВОЕ**) — очищает httpOnly cookie
   и инвалидирует серверную сессию. Идемпотентен: повторный вызов или
   вызов без cookie — тот же `200`, не палит, была ли сессия валидна.
   После logout `GET /admin/me` возвращает `401 AUTH_NO_SESSION` (см.
   "401 vs 403" ниже — раньше был всегда `403`).
10. **Деактивация/реактивация admin-аккаунта.** `POST
    /admin/accounts/:id/deactivate` / `.../reactivate` (**НОВОЕ**) —
    только super_admin. Деактивация транзакционно меняет статус,
    отзывает все активные admin-сессии этой identity и пишет audit;
    self-deactivation запрещена полностью, последний активный
    super_admin не может быть деактивирован никем.
11. **Отзыв granta.** `POST
    /admin/accounts/:id/grants/:grantId/revoke` (**НОВОЕ**) — только
    super_admin. Append-only (revokedAt/revokedBy/revokeReason, ничего
    не удаляется физически), защищено optimistic concurrency
    (expectedVersion) от гонки двух конкурентных revoke на один grant.

## API-контракты

Полный формальный контракт — `docs/api/v1-first-vertical-slice.yaml`
(создан этой веткой; не существовал в репозитории до
`codex/admin-lifecycle-hardening`, несмотря на многочисленные ссылки на
него в комментариях кода). Все маршруты — под глобальным префиксом
`/api/v1`, защищены `AdminGuard` (требует активный `AdminContext`).

**401 vs 403 (ИЗМЕНЕНО)** — `AdminGuard` раньше всегда бросал `403
FORBIDDEN` для отсутствующего контекста. Теперь различает: `401
AUTH_NO_SESSION`, если запрос вообще не содержит `baza_session` cookie
(нет попытки аутентификации — безопасно раскрыть); `403 FORBIDDEN`, если
cookie присутствует, но не резолвится в валидный `AdminContext`
(мусорный токен, чужой audience, деактивированный аккаунт — причина
намеренно не различается). Это единственное сохранившееся сужение
non-disclosure: после logout cookie реально стёрта, следующий запрос
идёт без неё — нужен именно `401`, не `403`.

| Метод | Путь | Access | Статус |
|---|---|---|---|
| POST | `/auth/login` | публичный | существовал |
| POST | `/auth/logout` | публичный (идемпотентен) | **новый** |
| GET | `/admin/me` | любой admin | существовал |
| GET | `/admin/publications` | scope-ограничен | существовал |
| POST | `/admin/publications/:id/unpublish` | scope-ограничен | существовал |
| GET | `/admin/accounts` | super_admin | существовал |
| POST | `/admin/accounts` | super_admin | существовал |
| POST | `/admin/accounts/:id/deactivate` | super_admin | **новый** |
| POST | `/admin/accounts/:id/reactivate` | super_admin | **новый** |
| POST | `/admin/accounts/:id/grants` | super_admin | существовал |
| GET | `/admin/accounts/:id/grants` | super_admin | **ИЗМЕНЕНО** (включает revoked) |
| POST | `/admin/accounts/:id/grants/:grantId/revoke` | super_admin | **новый** |

### `POST /auth/logout`

```
200 { loggedOut: true }  — всегда, даже без cookie / с уже отозванным токеном
```

Очищает `baza_session` cookie (`clearCookie`, path `/`) и отзывает
серверную сессию (`SessionService.revokeSession` — `updateOne` по хешу
токена, 0 совпадений не считается ошибкой). Не логирует токен/cookie ни
в каком виде.

### `GET /admin/me`

```
200 {
  adminAccountId: string
  isSuperAdmin: boolean
  publicationReadScope: 'all' | Partial<Record<'development'|'unit'|'listing', { global: boolean; cities: string[] }>>
}
401 AUTH_NO_SESSION — нет cookie вообще
403 FORBIDDEN — cookie есть, но не резолвится в валидный AdminContext
```

### `GET /admin/accounts`

Query: `cursor?: string (ObjectId)`, `limit?: number (1..100, default 20)`.

```
200 { items: Array<{ id, identityId, isSuperAdmin, status: 'active'|'deactivated', createdAt }>, nextCursor: string|null }
403 SELF_ESCALATION_BLOCKED — вызвано не super_admin
```

### `POST /admin/accounts/:id/deactivate` / `.../reactivate`

```
200 { status: 'active' | 'deactivated' }
400 — DTO-валидация reason (minLength 10)
403 SELF_ESCALATION_BLOCKED — вызвано не super_admin
403 ADMIN_SELF_DEACTIVATION_BLOCKED — попытка деактивировать себя (только deactivate)
403 ADMIN_LAST_SUPER_ADMIN — последний активный super_admin (только deactivate)
404 NOT_FOUND — аккаунт не существует
```

Транзакционно (`runInTransaction`): status-переход + (для deactivate)
`SessionService.revokeAllAdminSessions(identityId)` + audit-запись
(`admin_account.deactivate`/`admin_account.reactivate`, actor/target/
before/after/reason/correlationId) — одна атомарная операция. Повторный
вызов на аккаунт, уже находящийся в целевом статусе — идемпотентный
no-op (тот же `200`, без повторной audit-записи).

### `GET /admin/accounts/:id/grants` (ИЗМЕНЕНО)

```
200 { items: Array<{ id, resource, action, scope, scopeValue?, version, revokedAt?, revokedBy?, revokeReason? }> }
403 SELF_ESCALATION_BLOCKED — вызвано не super_admin
404 NOT_FOUND — аккаунт не существует
```

Раньше возвращал только активные grants; теперь — полную историю
(включая уже отозванные), с `version` на каждом элементе, обязательным
для последующего revoke (CAS). Метод на уровне сервиса:
`PolicyEvaluatorService.listAllGrantsForSubject`
(`apps/api/src/modules/authorization/policy-evaluator.service.ts`) —
единственный санкционированный способ прочитать полный список grants
subject'а, не нарушая границу модуля (`PermissionGrantRepository`
запрещено импортировать напрямую из другого модуля, см.
`test/architecture/module-boundaries.test.ts`).

### `POST /admin/accounts/:id/grants/:grantId/revoke` (НОВОЕ)

```
200 { revoked: true }
400 — DTO-валидация (reason/expectedVersion)
403 SELF_ESCALATION_BLOCKED — вызвано не super_admin
404 NOT_FOUND — аккаунт/grant не существует, или grant принадлежит другому аккаунту (единый код)
409 VERSION_CONFLICT — grant уже отозван, или expectedVersion устарел
```

Append-only: `PermissionGrantDocument` получает `revokedAt`/`revokedBy`/
`revokeReason`, ничего не удаляется физически. CAS через `version`
(инициализируется `1` при создании, revoke — единственная мутация
существующего гранта): `PermissionGrantRepository.revoke` фильтрует
`updateOne` по `{_id, revokedAt:{$exists:false}, version:expectedVersion}`
— `modifiedCount:0` означает конфликт, переводится в `409
VERSION_CONFLICT` на уровне сервиса. `PermissionGrantRepository.findForSubject`
(путь авторизационных проверок — `evaluate`/`resolveListScope`/
`listGrantsForSubject`) фильтрует `revokedAt:{$exists:false}` — отозванный
grant немедленно перестаёт учитываться, `GET /admin/me` отражает его
исчезновение на следующий же запрос, без отдельного кэша для
инвалидации.

## Модель scope

Реальная модель авторизации (`PermissionGrantDocument.scope`) — это
`'own' | 'position' | 'team' | 'organization' | 'project' | 'city' |
'global' | 'assigned' | 'domain'`. **Значения `'country'` не существует** —
ни в перечислении scope, ни в `MarketplacePublicationDocument.searchProjection`
(там есть только `city`), ни в фильтре списка публикаций
(`admin-publication-scope-filter.ts`).

Задача описывала сценарий как "country/city scope". Проверено явно с
пользователем перед реализацией: город/страна цепочка не строится —
admin-web реализован на реальной модели (**city + global**, per
`sourceType`), а не на придуманной country-иерархии. Расширение домена
до country потребовало бы менять `PermissionScope` enum, схему
публикации и worker-проекцию — то есть выходить за границы владения
этой задачи (`apps/admin-web/**`, `apps/api/src/modules/admin/**`) и
нарушать инструкцию "не расширяй домен ради красивого интерфейса".

Практически: `AdminPolicyService.resolvePublicationReadScope` агрегирует
grants админа по каждому из трёх `sourceType` (`development`/`unit`/
`listing`) независимо; `global`-grant на `sourceType` открывает все
города для этого типа, `city`-grant — только перечисленные города.
super_admin обходит эту проверку целиком (`isSuperAdmin` — булево поле
самого `AdminAccount`, не грант).

## Экраны admin-web

- **`/login`** — форма логина, POST на `/auth/login`, редиректит на
  `/publications` (или на исходный путь, если редирект пришёл от guard'а).
- **`/publications`** — фильтры (`sourceType`, `city`), таблица с
  server-side пагинацией ("Показать ещё"), кнопка "Снять с публикации"
  только у записей в статусе `published`, модальное подтверждение с
  обязательным полем причины (клиентский гейт ≥10 символов — то же
  ограничение, что на сервере, но сервер остаётся источником истины).
  После успешного unpublish строка обновляется данными из **реального
  ответа сервера** (`status`, `unpublishReason`), не оптимистично.
- **`/accounts`** (только super_admin, иначе — экран отказа, не 404)
  — список аккаунтов, форма создания (принимает существующий
  `identityId`), панель "Права доступа" на аккаунт со списком grants и
  формой выдачи нового. UI не даёт отправить `city`/`domain`/`project`
  grant без `scopeValue`, но финальная валидация — всегда на сервере.

Нет кнопки "Выйти" — `POST /auth/logout` не существует в API (см. ниже).
Симулировать логаут на клиенте невозможно и не нужно: cookie httpOnly,
JS не может её прочитать/стереть, а притворная кнопка обманывала бы
пользователя.

## Security — что проверено integration-тестами

`apps/api/test/integration/admin-http.integration-spec.ts` — новый файл,
единственный в кодовой базе, который бьёт по реальным HTTP-маршрутам
через полный `AppModule` с теми же нативными Fastify `onRequest` hooks,
что `main.api.ts` (до этого прохода все admin-тесты вызывали сервисы
напрямую, минуя `AdminGuard`/middleware/маршрутизацию). 15 тестов:

- запрос без cookie → `403 FORBIDDEN`, не 500, не раскрывает наличие
  endpoint'а;
- мусорный токен в cookie → `403 FORBIDDEN`;
- валидная **marketplace**-audience сессия того же человека не проходит
  как admin-сессия (audience изоляция, `ADR-004`);
- логин с audience `admin` для identity без `AdminAccount` отклоняется
  на этапе `login()` (`ProductAccess('admin')` не выдан);
- `GET /admin/me` — корректный `isSuperAdmin`/`publicationReadScope` и
  для super_admin, и для scoped admin;
- `GET /admin/publications` — city-scoped admin видит только свой
  город; admin без единого read-гранта получает пустой список (не
  403/500) — deny-by-default остаётся списком, не ошибкой;
- `POST .../unpublish` — без reason → `400`; scoped admin без
  `unpublish`-гранта на этот `sourceType`/город → `403
  ADMIN_SCOPE_INSUFFICIENT`, запись не меняется; успешный unpublish
  пишет ровно одну audit-запись;
- **privilege escalation**: scoped admin не может создать новый
  `AdminAccount` (`403 SELF_ESCALATION_BLOCKED`), не может выдать grant
  (тот же код), не может листить `/admin/accounts` (**IDOR/enumeration
  prevention** — не 200 с пустым списком, а 403), не может прочитать
  grants чужого аккаунта (тот же принцип).

`apps/api/test/integration/admin-accounts.integration-spec.ts` — новый
файл, service-level против реальной MongoDB (транзакции, реальная
агрегация из `permission_grants`): пагинация `listAdminAccounts`,
`listGrants` end-to-end через реальный `grantPermission` →
`permission_grants` → `listGrants`, self-escalation prevention на
обоих новых методах, `NOT_FOUND` без раскрытия существования аккаунта.

## Ручная проверка в браузере

Прогнана 29.08.2026 против реального `apps/api` (полный `AppModule`,
нативные Fastify hooks, in-memory MongoDB replica set — та же схема
bootstrap, что integration-тесты) и реального dev-сервера `apps/admin-web`
(Vite, порт 3003) через Playwright/Chromium:

- неаутентифицированный переход на `/publications` → редирект на
  `/login`;
- вход scoped admin'ом (grant `development.read`/`development.unpublish`,
  `scope=city`, `scopeValue=batumi`) → видит ровно 3 публикации, все
  `batumi`, из 5 существующих (2 в `tbilisi` не видны); нет пункта
  "Аккаунты" в навигации; прямой переход на `/accounts` — экран отказа,
  не защищённые данные;
- диалог unpublish: короткая причина держит кнопку подтверждения
  disabled; валидная причина → запрос реально уходит на сервер, строка
  обновляется на "Снято с публикации" с показанной причиной;
- вход super_admin'ом → видит все 5 публикаций (**включая** только что
  снятую — admin-список показывает все статусы, не только
  `published`); пункт "Аккаунты" виден; `/accounts` показывает оба
  аккаунта; "Права доступа" на строке scoped admin показывает ровно
  выданные два granta;
- консоль браузера — без ошибок (кроме ожидаемых `403` при попытке
  scoped admin достучаться до `/admin/accounts`/`/admin/me`
  super_admin-ветки — это правильное поведение, не баг).

Скриншоты сохранены в рамках сессии, не закоммичены в репозиторий (не
входят в файлы владения задачи).

## Что не реализовано и почему

Каждый пункт — сознательный вырез, а не забытая часть.

1. **Country-scope** — модель авторизации не поддерживает `country` как
   измерение (см. "Модель scope" выше). Не реализовано намеренно —
   потребовало бы расширения `PermissionScope`/схемы публикации/
   worker-проекции за пределами `apps/admin-web/**` и
   `apps/api/src/modules/admin/**`.
2. **Деактивация admin-аккаунта из UI** — `AdminAccountDocument.status`
   поддерживает `'deactivated'` на уровне схемы, но ни один
   HTTP-путь никогда не переводит аккаунт в это состояние (подтверждено
   аудитом кодовой базы перед реализацией). Не добавлено — при
   уточнении границ задачи с пользователем в этот новый endpoint было
   решено не входить в этот проход (см. "Границы владения" в описании
   задачи).
3. **Отзыв (revoke) grant'а** — `PermissionGrantRepository` не имеет
   метода удаления, используемого где-либо; grants сегодня строго
   add-only. Экран "Права доступа" может только показать текущие
   grants и добавить новый, не отозвать существующий.
4. **Logout** — `POST /auth/logout` не существует нигде в API
   (`SessionService.revokeSession`/`revokeAllErpSessions` — service-level
   методы, не подключены ни к одному контроллеру ни для одного
   audience). UI честно не показывает кнопку "Выйти" вместо того, чтобы
   имитировать её без реального эффекта.
5. **Приглашение admin по email** — `POST /admin/accounts` принимает
   только уже существующий `identityId` (`IsMongoId`). Создание нового
   человека требует отдельного `POST /auth/register` (публичный,
   cross-audience) до того, как super_admin сможет превратить его
   identity в `AdminAccount` — ERP-модуль имеет
   `findOrCreatePendingIdentity`/invite-flow, но он не переиспользован
   для admin-контура ни в этом проходе, ни ранее.
6. **401 vs 403 на клиенте** — `AdminGuard` всегда бросает `403
   FORBIDDEN`, даже когда реальная причина — отсутствие cookie вообще
   (что логичнее было бы 401). admin-web компенсирует это на клиенте:
   любой `403` от `GET /admin/me` трактуется как "не вошёл" →
   `/login`; `403` от других запросов после успешного `/admin/me` —
   реальный отказ доступа, не путается с "сессия истекла", потому что
   `AdminAuthProvider` уже знает, что `/admin/me` только что ответил
   200.
7. **Audit-запись самого логина/логаута** — `audit_events` пишется
   только для `admin_account.create`, `admin_account.grant_permission`,
   `publication.unpublish`. Вход в систему не аудируется отдельно
   (только создание `Session`-документа) — не входило в описанный
   сценарий и не добавлено.
8. **E2E тесты admin-web** (Vitest+jsdom) покрывают auth guard/API
   client/unpublish-flow с реальным fetch-клиентом против мок-сервера
   (`no-mock-data.test.tsx` доказывает отсутствие скрытого
   mock/localStorage-пути) — но не запущены как часть автоматического
   CI/test:e2e таска (в `turbo.json`/`package.json` нет
   Playwright-раннера для admin-web). Браузерная проверка проведена
   вручную (см. выше), не автоматизирована как повторяемый CI-шаг —
   выходило за рамки времени этого прохода.

## Результаты проверок (29.08.2026, ветка `codex/admin-control-plane`)

```
pnpm turbo run typecheck   → 23/23 задач успешно
pnpm turbo run test        → 42/42 задач успешно
                              @baza/api: 404/404 unit-тестов
                              @baza/admin-web: 16/16 тестов
                              @baza/worker: 61/61 тестов
                              @baza/marketplace-web: без изменений, зелёный
pnpm turbo run test:integration → 10/10 задач успешно
                              @baza/api: 167/167 integration-тестов (17 файлов)
                              из них новые: admin-accounts.integration-spec.ts (6),
                              admin-http.integration-spec.ts (15)
pnpm turbo run build       → 14/14 задач успешно (apps/admin-web/dist собран)
```

Ручная browser-проверка (Playwright/Chromium против реального API +
in-memory MongoDB) — описана в разделе выше, без ошибок.

## Локальный dev bootstrap

`.env.example` уже резервирует `CORS_ALLOWED_ORIGIN_ADMIN=http://localhost:3003`
для этого приложения — реальный dev-запуск (`pnpm --filter @baza/admin-web dev`,
порт 3003) работает против реального `apps/api` при поднятой MongoDB/MinIO
инфраструктуре по стандартной схеме проекта (см. `docs/architecture.md`).
Отдельного HTTP bootstrap-эндпоинта для первого super_admin нет и не
добавлено — по тем же причинам, что и у любой RBAC-системы: первый
super_admin создаётся вне HTTP-контура (прямой вызов
`AdminAccountService.createAdminAccount` с synthetic super_admin
`AdminContext`, тот же паттерн, что уже используют integration-тесты
этого модуля — `makeSuperAdminContext()` в `admin-unpublish.integration-spec.ts`
и `admin-accounts.integration-spec.ts`). Это не HTTP backdoor: нет
дополнительного публичного маршрута, секретов, hardcoded credentials —
только внутренний вызов сервиса, доступный лишь тому, у кого уже есть
прямой доступ к процессу/кодовой базе.
