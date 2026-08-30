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

1. **Map provider configuration**: MapLibre подключён, а координаты приходят из реального `searchProjection.geo`. Для запуска карты задайте `VITE_MAP_STYLE_URL` на OSM-compatible провайдера с production SLA. Шаблоны `.env.example` и `.env.runtime.example` содержат явный placeholder для этой переменной; resolver игнорирует его и пустые значения, поэтому UI показывает конфигурационное состояние вместо сетевой ошибки. Публичный бесплатный OSM tile server намеренно не используется как CDN.
2. **Сортировка каталога (закрыто 2026-08-30)**: `GET /public/listings` поддерживает `newest`, `price_asc`, `price_desc`, `area_asc`, `area_desc`; `GET /public/developments` поддерживает `newest` (другие значения получают 400, потому что цена ЖК не является частью его проекции). Для сортируемых listings используется непрозрачный base64url-cursor с парой `{sortValue, _id}`, а для `newest` сохранена обратная совместимость с legacy ObjectId-cursor. Mongo-составные индексы на `status/sourceType`, цену, площадь и город позволяют выполнять порядок на сервере без in-memory сортировки.
3. **Total каталога (закрыто 2026-08-30)**: ответы `PublicDevelopmentList` и `PublicListingList` теперь содержат точное `total`, полученное через `countDocuments()` с тем же visibility/filter predicate, но без cursor. UI показывает `Показано: текущая страница из total`; оценочные и фейковые значения не используются.
4. **Read-only session check (закрыто 2026-08-30)**: `GET /auth/session` резолвит `productAudience` из настроенного `Origin` и делегирует каноническую проверку token hash/expiry/revocation в `SessionService.getActiveSessionFromRequest`. Ответ всегда минимален: `{ authenticated: boolean }`; отсутствующая, просроченная, отозванная или выданная другому продукту cookie намеренно не различаются и не раскрывают `identityId`. `authApi.checkSession()` использует этот endpoint с `credentials: include`; бизнес-эндпоинт `GET /marketplace/property-assets` больше не используется как auth-проба. Поведение закреплено unit/integration/frontend тестами.
5. **TODO (Favorites / Saved Searches)**: Локальное или серверное сохранение избранных объектов вынесено в отдельный функциональный срез авторизованного покупателя.
