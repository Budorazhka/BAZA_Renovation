# media_asset.upload — право проверялось, но не было выдано никому

Статус: fixed (01.09.2026)

## Что было сломано

`MediaController` требует `media_asset.upload` на двух эндпоинтах:

- `POST /api/v1/media/upload-intent`
- `POST /api/v1/media/:assetId/confirm`

Этого права **не было ни у одной роли** в `DEFAULT_ROLE_GRANTS`. При deny-by-default
`PolicyEvaluatorService` это значит ровно одно: **оба эндпоинта отвечали 403 всем и всегда**.

### Почему это не мёртвый код, который можно было удалить

Из пяти назначений загрузки (`MEDIA_PURPOSE_BUCKET`) только одно закрыто альтернативным путём:

| Назначение | Другой путь |
|---|---|
| `property_photo` | `POST /property-assets/:id/media/upload-intent` (`property_asset.edit`) — работает |
| `floor_plan` | нет |
| `unit_photo` | нет |
| `agency_document` | нет |
| `profile_avatar` | нет |

То есть план этажа, фото юнита, документ агентства и аватар загрузить было **нельзя никак**.

### Почему не поймали раньше

- `typecheck` и `lint` такое не видят: код корректен, просто право никому не выдано.
- Единственная media-спека (`media-confirm-upload.integration-spec.ts`) зовёт `MediaService`
  **напрямую**, минуя `PermissionGuard`, — она проверяет транзакционность подтверждения загрузки,
  а не доступ.
- Автор `MediaController` проблему предвидел и записал в докстринге: «permission-matrix.md не
  специфицирует media-права явно… при следующем ревью этот раздел должен быть добавлен туда как
  источник истины, а не только жить в коде». Ревью не случилось.

Найдено сверкой всех `@RequirePermission(...)` в коде со всеми грантами в `DEFAULT_ROLE_GRANTS`.

## Что сделано

**1. Грант выдан** — `{resource:'media_asset', action:'upload', scope:'organization'}` ролям
owner, director, rop, manager, developer: ровно тем, у кого уже есть `property_asset.edit`.

Это не расширяет ничьих реальных возможностей — перечисленные роли и так загружают медиа через
путь property-assets; грант разблокирует остальные назначения. `administrator` и `marketer` не
получают: у них нет ни `property_asset.edit`, ни `development.edit`, с медиа объектов они не
работают.

**2. Заведён автоматический страж** — `test/architecture/permission-grants.test.ts`. Сверяет два
списка в обе стороны:

- каждое проверяемое право выдано хотя бы одной роли (иначе эндпоинт мёртв для всех) — ловит
  ровно этот баг;
- каждый выданный грант либо проверяется в коде, либо **явно** записан как нереализованный с
  указанием причины — ловит обратный класс («мёртвые» гранты, каким были `chessboard.export`,
  `client.reassign`, `export.run`);
- список нереализованных не устаревает: попадание в него реализованного права роняет тест.

Сейчас в списке осознанно нереализованных три записи: `finance.read`, `manual_ledger.read`
(финансового модуля не существует) и `lead.reassign` (полностью перекрыт `lead.assign`, см.
`deal-client-reassign.md`).

## Важная оговорка: гранты не бэкфилятся

`DEFAULT_ROLE_GRANTS` применяется **при создании Position**. Миграционной инфраструктуры в
кодовой базе нет — тот же прецедент, что и у всех прочих записей этого файла (см. его докстринг
про `position.read`). Значит **уже существующие Position прав на загрузку не получат**, пока им не
выдадут грант отдельно или не пересоздадут позицию.

Для новых организаций всё работает сразу.

> Обновление 11.09.2026: доливка появилась — команда
> `pnpm --filter @baza/api run grants:backfill-defaults` выдаёт существующим
> Position недостающие стартовые гранты, включая `media_asset.upload`. См.
> [default-grants-backfill.md](default-grants-backfill.md).

## Verification

- `permission-grants.test.ts` — 4 проверки, включая обе стороны сверки.
- `media-upload-grant.integration-spec.ts` — 6 тестов через **настоящий HTTP и настоящие гранты**:
  владелец и менеджер создают upload-intent (раньше здесь был 403 у всех), маркетолог и
  администратор получают 403, без сессии 401, созданный `media_asset` привязан к организации
  вызывающего.
- Перепроверены соседние спеки: `property-asset-media` 3/3, `media-confirm-upload` 4/4,
  `marketplace-property-assets` 25/25, `organization-onboarding` 4/4.
- typecheck 25/25, unit 763, build 15/15.
