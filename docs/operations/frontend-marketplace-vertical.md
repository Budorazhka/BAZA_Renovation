# Frontend & Marketplace Vertical Audit Matrix

Документ фиксирует результаты аудита существующих frontend-маршрутов, источников данных и API-контрактов для вертикального сценария вторички и аренды (PropertyAsset → Listing → Publication → Public Marketplace).

## 1. Матрица маршрутов и источников данных

| UI / Route | Текущий источник данных | Реальный Backend Endpoint | Необходимые изменения |
|---|---|---|---|
| **ERP: Объекты (каталог/список)**<br>`/dashboard/objects/list` | `secondaryObjectsApi` (обращается к устаревшим `/estate-apartments` и `/search/v3`, использует fallback `DEMO_APARTMENTS` и `DEMO_AUTHOR_ID`). | `GET /api/v1/property-assets`<br>`GET /api/v1/property-assets/:assetId/listings` | Заменить legacy-клиент на реальный `propertyAssetsApi`. Загружать реальные `PropertyAsset` организации и их связанные `Listing`. Отображать реальные статусы, цену, характеристики. Поддержать loading, error + retry, empty state. |
| **ERP: Карточка объекта**<br>`/dashboard/objects/:propertyId` | `secondaryObjectsApi.getEstateApartment(id)` с fallback-объектами и моковыми флагами MLS. | `GET /api/v1/property-assets/:assetId`<br>`GET /api/v1/property-assets/:assetId/listings`<br>`GET /api/v1/property-assets/:assetId/listings/:listingId/publication-status`<br>`GET /api/v1/property-assets/:assetId/listings/:listingId/actuality`<br>`PATCH .../activate`<br>`POST .../publish`<br>`POST .../unpublish`<br>`PATCH .../confirm-actuality`<br>`POST /api/v1/property-assets/duplicate-candidates/:id/override` | Читать реальный актив и листинги. Отображать реальный статус публикации (`published`, `publication_pending`, `build_failed`, `unpublished`), состояние актуальности (пороги, дата подтверждения), действия активации, публикации (с `Idempotency-Key`), снятия с публикации (с `reason`), подтверждения актуальности и снятия дубль-блокировки (owner override). |
| **ERP: Мои объекты**<br>`/dashboard/my-properties` | `window.localStorage.getItem('agency.product.properties')` + fallback на `mockProperties`. | `GET /api/v1/property-assets`<br>`GET /api/v1/property-assets/:assetId/listings` | Полностью убрать `localStorage` и моковые данные. Подключить реальный `propertyAssetsApi` с поддержкой фильтрации по категориям, статусам, вызову действий публикации и актуализации. |
| **ERP: Визард создания/редактирования**<br>`ObjectEditWizard` | Локальный state в памяти, генерация фейкового ID `obj-${Date.now()}`. | `POST /api/v1/property-assets`<br>`POST /api/v1/property-assets/:assetId/listings`<br>`PATCH /api/v1/property-assets/:assetId/listings/:listingId/activate`<br>`POST /api/v1/property-assets/:assetId/listings/:listingId/publish` | Собрать валидный DTO: `propertyType`, `commercialSubtype`, `location` (GeoJSON `Point`), `characteristics` (`area`, `rooms`, `floor`, `totalFloors`), `representativePhone`. Создавать PropertyAsset, затем Listing (`dealType`, `price`), активировать и публиковать. Корректно обрабатывать 409 (дубли/конфликты), 422, 401/403. |
| **Public Marketplace: Каталог**<br>`/` и `/listings` (marketplace-web) | `marketplaceApi.listDevelopments` (`GET /api/v1/public/developments`) — поддерживал только ЖК. | `GET /api/v1/public/listings`<br>(query: `dealType`, `propertyType`, `commercialSubtype`, `city`, `bbox`, `cursor`, `limit`) | Расширить `marketplace-web`: добавить вкладки/фильтры по типу недвижимости (ЖК vs вторичка/аренда: продажа, долгосрочная/посуточная аренда), фильтр по городу, cursor-пагинацию `nextCursor`, индикаторы загрузки, ошибок и пустого каталога. Не ломать существующий каталог новостроек. |
| **Public Marketplace: Карточка листинга**<br>`/listings/:slug` (marketplace-web) | Отсутствовал (был только `/developments/:slug`). | `GET /api/v1/public/listings/:slug` | Добавить страницу детального просмотра опубликованного листинга: цена, валюта, локация, характеристики (площадь, комнатность, этаж/этажность), SEO-заголовки. Обработать 404 (объект не найден или снят с публикации) и сетевые ошибки. |

---

## 2. Архитектурный анализ и границы безопасности

1. **ERP Security & Isolation**:
   - Все запросы в ERP авторизуются через сессионную cookie с `TenantGuard` и `PermissionGuard` (`property_asset.create/read`, `listing.create/edit/read`).
   - Изоляция организаций обеспечивается backend (`organizationId` из сессии, `publisherScope: { type: 'organization', organizationId }`).
   - Защита от несанкционированного доступа: чужие активы возвращают 404 (non-disclosure).

2. **Idempotency & Concurrency**:
   - Публикация листинга (`POST .../publish`) требует заголовок `Idempotency-Key`.
   - Ключ генерируется на каждую пользовательскую попытку публикации и сбрасывается после явного результата или повторного клика.
   - CAS-контроль версий на backend исключает гонки состояний.

3. **Deduplication & Owner Override**:
   - Если сервер обнаруживает дублирующий актив (`signals.phoneMatch` или `signals.addressMatch` + `roomsAreaFloorMatch`), публикация блокируется (`ConflictException` 409).
   - Фронтенд не пытается обойти запрет, а запрашивает информацию о кандидате-дубле и предоставляет пользователю форму «Owner Override» с обязательным указанием причины (не менее 10 символов) только если статус кандидата — `detected` (серверный гейт).

4. **Actuality Confirmation**:
   - Листинги требуют подтверждения актуальности согласно SLA категорий (`ACT-001`).
   - Фронтенд отображает состояние актуальности (`getActualityState`) и позволяет вызвать `confirmActuality` с передачей `expectedVersion`.

5. **Public Projection & Lead Form Verification**:
   - `GET /public/listings` и `GET /public/listings/:slug` отдают только whitelist полей из `MarketplacePublication` (`denormalizedFields`, `seo`).
   - **Проверка лид-формы для листинга**: На текущий момент backend-контракт `reveal-contact` / создание лида существует только для `developments` (`POST /api/v1/public/developments/:slug/reveal-contact`). Для вторички/аренды (`listings`) endpoint регистрации лида с публичной карточки в API пока не реализован. **Фейковая форма не создаётся**, функциональность честно зафиксирована как следующий вертикальный срез.

---

## 3. План реализации

1. **Backend / API Contracts**:
   - Добавить эндпоинт получения кандидатов-дублей для актива: `GET /property-assets/:assetId/duplicate-candidates` (и зеркало в `/marketplace/property-assets/:assetId/duplicate-candidates`) с проверкой владения активом.
   - Обновить OpenAPI-спецификацию `docs/api/v1-first-vertical-slice.yaml` и сгенерировать типы в `@baza/api-client`.
   - Добавить integration-тесты для новых эндпоинтов.

2. **ERP Web**:
   - Создать `propertyAssetsApi.ts` в `apps/erp-web/src/services/` с полной поддержкой CRUD для PropertyAsset/Listing, publish, unpublish, publication-status, actuality, duplicate-override.
   - Интегрировать `ObjectEditWizard` с реальным API.
   - Обновить `ObjectsListPage`, `ObjectCardPage`, `MyPropertiesPage` для работы с реальными данными вместо mock/localStorage.

3. **Marketplace Web**:
   - Расширить `marketplace-api.ts` методами `listListings` и `getListing`.
   - Добавить хуки `useListingsCatalogue` и `useListingDetail`.
   - Добавить каталог листингов и карточку `/listings/:slug` в `App.tsx` с сохранением единого дизайн-стиля.
   - Добавить unit/компонентные тесты.

4. **Верификация**:
   - Запустить `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm build`.
