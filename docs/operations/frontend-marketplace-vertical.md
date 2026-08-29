# Frontend & Marketplace Vertical Architecture & Acceptance Specification

Документ фиксирует архитектуру, поведение, схему синхронизации состояния, правила доступности, SEO и границы безопасности публичного маркетплейса BAZA (`apps/marketplace-web`).

---

## 1. Маршрутизация и синхронизация состояния с URL

Публичный интерфейс маркетплейса поддерживает полную синхронизацию фильтров и разделов с URL поисковыми параметрами (`useSearchParams`):

| URL Parameter | Допустимые значения | Описание | Поведение при изменении |
|---|---|---|---|
| `tab` | `developments` (default) | `listings` | Активный раздел каталога (Новостройки vs Вторичка/аренда). | Переключение сбрасывает специфичные фильтры сделок и `cursor`. |
| `city` | Текстовая строка (напр. `Batumi`, `Tbilisi`) | Фильтр по городу объекта / ЖК. | Изменение значения сбрасывает `cursor`. Доступна кнопка «Сбросить фильтры». |
| `dealType` | `sale` | `rent_long` | `rent_short` | Тип сделки для вторички/аренды. | Сбрасывает `cursor`. |
| `propertyType` | `apartment` | `house` | `commercial` | `land` | Категория недвижимости. | Сбрасывает `cursor` и `commercialSubtype` при смене категории. |
| `commercialSubtype` | `office` | `retail` | `warehouse` | `free_purpose` | `land_commercial` | Подтип коммерческого объекта. | Отображается только при `propertyType=commercial`. |
| `cursor` | Непрозрачная строка пагинации (base64) | Указатель на следующую страницу выборки. | Генерируется backend; сбрасывается при смене любого фильтра. |
| `view` | `list` (default) / `map` | Переключатель списка и карты. | При переходе в список bbox очищается; при движении карты bbox сохраняется в URL и сбрасывает cursor. |
| `bbox` | `minLng,minLat,maxLng,maxLat` | Текущий viewport карты. | Отправляется на backend только в режиме `view=map`; значения валидируются перед запросом. |

### Навигация Back / Forward и защита от Race Conditions
- **История браузера**: Переключение фильтров и табов создаёт новые записи в истории (`setSearchParams(..., { replace: false })`), обеспечивая бесшовный возврат кнопками «Назад» / «Вперёд» без перезагрузки страницы.
- **Отмена устаревших запросов (Stale Requests)**:
  - Хуки `useCatalogue`, `useListingsCatalogue`, `useListingDetail`, `useDevelopmentDetail` используют `AbortController` для мгновенной отмены in-flight HTTP-запросов при смене параметров или размонтировании компонента.
  - Монотонный `requestIdRef` гарантирует, что ответ предыдущего запроса никогда не перезапишет более свежие данные.

---

## 2. Cursor Pagination & Дедупликация

- **Кнопка «Показать ещё»**:
  - При наличии `nextCursor` внизу сетки отображается кнопка подгрузки следующей порции объектов.
  - **Loading Lock**: Во время выполнения запроса кнопка переходит в состояние `disabled` и `aria-busy="true"`, предотвращая повторные параллельные клики.
  - **Дедупликация**: При добавлении элементов следующей страницы коллекция дедуплицируется по уникальным ключам (`slug` / составной ключ), исключая дублирование карточек при изменении данных на backend.
  - **Завершение пагинации**: Если `nextCursor === null`, кнопка исчезает, отображается уведомление «Все доступные объекты показаны».
  - **Устойчивость к ошибкам (Resilient Pagination)**: Если запрос следующей страницы завершился ошибкой (таймаут, сеть), уже загруженные объекты **не сбрасываются**. Показывается панель ошибки пагинации с кнопкой «Попробовать снова».

---

## 3. SEO, метаданные и Schema.org JSON-LD

При переходе на детальные страницы (`/listings/:slug` и `/developments/:slug`) хук `useSeoMetadata` реактивно обновляет метаданные документа:

1. **Title & Description**:
   - `document.title`: `"${item.seo?.title || itemTitle} — BAZA.sale"`.
   - `<meta name="description" content="...">`: обновляется из `seo.description` или шаблона.
   - `<link rel="canonical" href="...">`: канонический URL карточки.
   - Open Graph: `og:title`, `og:description`, `og:image`, `og:url`.
2. **Schema.org Structured Data (JSON-LD)**:
   - Инжектируется безопасный `<script type="application/ld+json" id="baza-seo-jsonld">` со структурой `RealEstateListing` / `ApartmentComplex`.
   - **Строгий Whitelist безопасности (Non-Disclosure Invariant)**:
     - Разрешены ТОЛЬКО публичные поля: `@context`, `@type`, `name`, `description`, `url`, `image` (публичные CDN URLs), `offers` (`price`, `priceCurrency`, `availability`), `address` (`addressLocality`, `addressCountry`, `streetAddress`).
     - **СТРОГО ЗАПРЕЩЕНО**: Выводить `organizationId`, `sourceId`, `identityId`, `storage keys`, внутренние audit-поля, телефон представителя до подтверждения лида.
3. **Очистка при размонтировании (Cleanup)**:
   - При уходе со страницы или переходе между карточками все созданные метатеги и JSON-LD скрипт удаляются, а заголовок сбрасывается на дефолтный (`"BAZA.sale · каталог объектов недвижимости"`).

---

## 4. Production States & Отказоустойчивость

Интерфейс каталога и детальных карточек обрабатывает все возможные состояния жизненного цикла данных:

| Состояние | Поведение UI |
|---|---|
| **Initial Loading** | Скелетон карточек / панели с `aria-busy="true"` и `role="status"`. |
| **Empty State** | Сообщение об отсутствии объектов по выбранным фильтрам и кнопка «Сбросить фильтры». Никаких фейковых объектов. |
| **404 Not Found / Unpublished** | Информативный блок о том, что объект не найден или был снят с публикации, со ссылкой на возврат в каталог. |
| **429 Rate Limited** | Сообщение о превышении лимита запросов с кнопкой «Повторить попытку». |
| **Network / 500 Error** | Сообщение об ошибке соединения с кнопкой повтора запроса. |
| **Broken Image** | Обработчик `onError` переключает изображение на аккуратный fallback без падения интерфейса. |
| **Empty Media (`media: []`)** | Отображение аккуратного заглушечного блока с иконкой и пояснением. |

---

## 5. Доступность (A11y) и Адаптивность (Responsive)

- **Семантические ориентиры (Landmarks)**:
  - `<header role="banner">` с кнопкой «Перейти к основному содержанию» (`.skip-link`).
  - `<main id="main-content" tabIndex="-1">`.
  - `<nav role="tablist" aria-label="...">`.
  - `<form role="search" aria-label="...">`.
  - `<footer role="contentinfo">`.
- **Иерархия заголовков**: Строго один `<h1>` на страницу, разделы — `<h2>`, вложенные блоки — `<h3>`.
- **Контролы формы**: Все инпуты имеют связанные `<label htmlFor="...">`, кнопки — доступные имена (`aria-label`, `title`).
- **Живые регионы (Live Regions)**: Все асинхронные статусы, ошибки и успехи размечены `aria-live="polite"` / `role="alert"`.
- **Клавиатурная навигация галереи**:
  - `ArrowLeft` / `ArrowRight`: переключение предыдущего / следующего фото.
  - `Home` / `End`: переход к первому / последнему фото.
  - `Escape`: сброс фокуса с галереи.
  - `Enter` / `Space` на миниатюрах: выбор активного кадра.
- **Видимый фокус**: Стилизация `:focus-visible` с контрастным кольцом фокуса.
- **Адаптивность**: Отсутствие горизонтального скролла на мобильных (320px, 375px, 414px), планшетах (768px) и десктопах (1440px).

---

## 6. Форма связи и раскрытия контактов

- **Endpoint**: `POST /api/v1/public/listings/:slug/reveal-contact`.
- **Payload**: `requesterPhone` (обязательный), `requesterName` (опциональный), `utm` (автоматический сбор из URL параметров и `document.referrer`).
- **Double Submit Prevention**: Блокировка кнопки отправки и формы (`isSubmitting`).
- **Раскрытие контактов**: Телефон представителя становится видимым **только после успешного ответа backend (200 OK)** и оформляется в виде кликабельной ссылки `tel:`.

---

## 7. Known Limitations & Backend Gaps (TODOs)

1. **Map provider configuration**: MapLibre подключён, а координаты приходят из реального `searchProjection.geo`. Для запуска карты задайте `VITE_MAP_STYLE_URL` на OSM-compatible провайдера с production SLA. Шаблоны `.env.example` и `.env.runtime.example` содержат явный placeholder для этой переменной; публичный бесплатный OSM tile server намеренно не используется как CDN. Если переменная не задана, UI показывает конфигурационное состояние вместо фальшивой карты.
2. **TODO (Public Listing Sorting)**: В текущей версии контракт `GET /public/listings`/`GET /public/developments` использует фиксированную сортировку по `_id` возрастанию (эквивалент новизны публикации). Сортировка по цене и площади **не является тривиальным добавлением query-параметра** — зафиксировано проверкой контракта 2026-08-30:
   - Курсор-пагинация обеих ручек структурно завязана на этот единственный порядок: `MarketplacePublicationRepository.listPublished(ByFilter)` применяет `filter._id = {$gt: cursor}` вместе с `.sort({_id:1})` (`packages/publication/src/repository/marketplace-publication.repository.ts`). Курсор — это сырой `_id`, не составной ключ. Сортировка по цене/площади потребовала бы составного курсора (`{sortValue, _id}`) с соответствующей валидацией и обратной совместимостью для уже выданных `_id`-курсоров, а не только нового query-параметра.
   - Цена и площадь физически не являются индексированными Mongoose-полями схемы `MarketplacePublicationDocument` — они лежат внутри `denormalizedFields`/`searchProjection` (тип `Object`/Mixed, без статической подсхемы и без индекса). Существующие индексы (`marketplace-publication.schema.ts`) покрывают `status`, `{status,_id}`, `slug`, `{sourceType,sourceId}` и `2dsphere` на `searchProjection.geo` — сортировка по цене сегодня означала бы полный in-memory sort без индекса.
   - Для `Development`/`PublicDevelopmentCard` цена (`priceFrom`) в принципе отсутствует в `searchProjection` — комментарий воркер-маппера (`apps/worker/src/handlers/development-publication.mapper.ts`) явно откладывает это до появления агрегации по Unit-коллекции, которой сегодня нет.

   Это реальная backend-задача (схема, индексы, курсор), не UI-доработка — не реализовано в рамках функционального прохода, чтобы не изобретать несовместимый с текущей пагинацией контракт.
3. **TODO (Public List Total/Count)**: Ни одна `*List`-схема в `docs/api/v1-first-vertical-slice.yaml` (`PublicListingList`, `PublicDevelopmentList` и остальные) не объявляет поле `total`/`count` — только `{items, nextCursor}`. Проверено также, что `countDocuments()` нигде в кодовой базе не применяется ни к `marketplace_publications`, ни к смежным коллекциям листингов; единственный прецедент (`admin-account.repository.ts::countActiveSuperAdmins`) — точечная equality-проверка на маленькой административной коллекции, не аналог фильтрованного публичного поиска. Поля фильтрации `city`/`dealType`/`propertyType`/`commercialSubtype` также не индексированы на `marketplace_publications`, поэтому наивный `countDocuments()` с теми же фильтрами на каждой загрузке каталога означал бы неиндексированный скан при каждом запросе списка. Каталог сегодня честно показывает количество уже загруженных элементов, а не итоговое число по фильтру — не подменено фейковым/оценочным числом.
4. **TODO (Read-only session check without a side-effecting probe)**: `authApi.checkSession()` (`apps/marketplace-web/src/features/publishing/api/auth-api.ts`) определяет статус авторизации вызовом `GET /marketplace/property-assets` и проверкой `res.status === 200` — реального списочного эндпоинта, а не выделенного session-check маршрута. Проверено: в `apps/api/src/modules/identity/auth.controller.ts` есть только `POST /auth/login`, `/register`, `/logout` — GET-маршрута вида `/auth/session`/`/auth/me` нет ни в контроллере, ни в OpenAPI-спеке. `SessionService.getActiveSessionFromRequest` существует, но используется только внутри middleware трёх аудиенсов (`admin-context.middleware.ts`, `tenant-context.middleware.ts`, `marketplace-account-context.middleware.ts`) — не выставлен ни одним HTTP-маршрутом. Среди всех routes под `MarketplaceAccountGuard` (`MarketplacePropertyAssetsController`) `GET /marketplace/property-assets` — уже самый дешёвый вариант (простой indexed-lookup список, без побочных эффектов); более дешёвого read-only маршрута в существующем контракте нет. Не заменено на новый эндпоинт — это добавление новой backend-поверхности, которое эта задача явно не уполномочивала.
5. **TODO (Favorites / Saved Searches)**: Локальное или серверное сохранение избранных объектов вынесено в отдельный функциональный срез авторизованного покупателя.
