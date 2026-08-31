# Marketplace Listing Publishing Wizard Specification

Документ описывает архитектуру, структуру состояний, протокол взаимодействия с API и правила безопасности функционального ядра мастера публикации объявлений маркетплейса (`apps/marketplace-web/src/features/publishing/**`).

---

## 1. Обзор архитектуры и пользовательского сценария

Мастер публикации реализует непрерывный пользовательский сценарий размещения объектов недвижимости в открытом каталоге BAZA.sale:

```
[1. Auth & Session] ──> [2. Location & Geo] ──> [3. Characteristics] ──> [4. Deal & Pricing]
                                                                                │
[7. Public Card] <── [6. Publishing & Polling] <── [5. Dedupe & Review] <───────┘
  (/listings/:slug)      (Idempotency-Key)        (Owner Override / Actuality)
```

1. **Аутентификация и сессия**: Вход / регистрация автора через `POST /api/v1/auth/login` и `/register` с получением HTTP-only сессионной cookie (`baza_session`). Клиент также поддерживает `POST /api/v1/auth/logout`; локальное состояние сбрасывается даже при сетевой ошибке, а серверный logout идемпотентен.
2. **Локация и гео-координаты**: Выбор города (быстрые пресеты Батуми, Тбилиси, Кутаиси), точный адрес и интерактивное указание гео-точки (`[longitude, latitude]`) через настоящий MapLibre picker. Клик по карте и перетаскивание маркера синхронизируют координаты с формой; стиль карты берётся только из `VITE_MAP_STYLE_URL`.
3. **Физические характеристики**: Тип недвижимости (`apartment`, `house`, `commercial`, `land`), формат коммерции (`commercialSubtype`), площадь (м²), комнатность, этаж/этажность и телефон представителя (`representativePhone`). На этом шаге создаётся сущность **`PropertyAsset`** (`POST /api/v1/marketplace/property-assets`).
4. **Коммерческие условия**: Тип сделки (`sale`, `rent_long`, `rent_short`), стоимость и валюта (`USD`, `GEL`, `RUB`). Создаётся и активируется сущность **`Listing`** (`POST .../listings` + `PATCH .../activate`).
5. **3-фазная загрузка медиа**: Прямая загрузка фотографий в хранилище (Intent → S3 PUT → Confirm), выбор главной обложки (`role: cover`), удаление и валидация форматов/размеров. **Возобновляемый retry**: при сбое клиент запоминает, на какой именно фазе оборвалась загрузка (`failedPhase: 'intent' | 'upload' | 'confirm'`), и кнопка «Повторить» продолжает именно с неё — сбой на S3 PUT или Confirm не повторяет уже успешную фазу Intent (не создаёт лишний upload-intent на backend); сбой на самой фазе Intent запускает загрузку заново. Файл и результат Intent хранятся в памяти клиента на время шага «Медиа», удаление отклонённого элемента корректно убирает и его из очереди на повтор.
6. **Контроль дубликатов и актуальности**: Проверка кандидатов в дубли (`GET .../duplicate-candidates`). При обнаружении конфликта — форма **Owner Override** с обязательным обоснованием (не менее 10 символов). Подтверждение актуальности (`PATCH .../confirm-actuality`).
7. **Идемпотентная публикация и ожидание проекции**: Отправка запроса на публикацию (`POST .../publish` с заголовком `Idempotency-Key`), поллинг статуса (`publication-status`) до перехода в `published` и открытие публичной карточки (`/listings/:slug`). Ключ сохраняется на время текущего объявления и переиспользуется после сетевого повтора; поллинг ограничен 60 секундами и завершается честным сообщением, если worker не ответил.

---

## 2. API Контракты и Endpoints

Все запросы выполняются с `credentials: 'include'` и используют базовый URL `VITE_API_BASE_URL`. Клиент нормализует как относительное значение (`/api/v1`), так и origin (`https://api.example.com`), добавляя ровно один суффикс `/api/v1`; поэтому комбинация `/api/v1/api/v1/...` невозможна.

### 2.1. Авторизация (`apps/api/src/modules/identity/auth.controller.ts`)
| Маршрут | Метод | Тело запроса / Заголовки | Описание |
|---|---|---|---|
| `/api/v1/auth/login` | `POST` | `{ login, password }` | Устанавливает cookie `baza_session` (httpOnly, sameSite: lax). |
| `/api/v1/auth/register` | `POST` | `{ login, password }` | Создаёт identity. Клиент сразу вызывает `/login` для получения сессии. |
| `/api/v1/auth/logout` | `POST` | — | Отзывает токен сессии и очищает cookie `baza_session`. |

### 2.2. Управление активами и листингами (`MarketplacePropertyAssetsController`)
| Маршрут | Метод | Заголовки / Тело | Описание |
|---|---|---|---|
| `/api/v1/marketplace/property-assets` | `POST` | `CreatePropertyAssetDto` | Создание актива с `publisherScope: { type: 'marketplace_account', identityId }`. |
| `/api/v1/marketplace/property-assets/:assetId` | `GET` | — | Проверка владения активом (чужой получает 404). |
| `/api/v1/marketplace/property-assets/:assetId/listings` | `POST` | `CreateListingDto` | Создание чернового листинга (`status: draft`). |
| `/api/v1/marketplace/property-assets/:assetId/listings/:listingId/activate` | `PATCH` | — | Активация листинга (`status: active`). Гарантирует единственный активный листинг на тип сделки. |

### 2.3. 3-фазная загрузка медиа (`MKT-004`)
| Фаза | Маршрут / Действие | Описание |
|---|---|---|
| **Фаза 1: Intent** | `POST /api/v1/marketplace/property-assets/:assetId/media/upload-intent` | Валидация MIME (JPEG, PNG, WebP) и размера (до 20 МБ). Возвращает `mediaAssetId` и presigned `uploadUrl`. |
| **Фаза 2: Direct PUT** | `PUT ${uploadUrl}` | Прямая отправка бинарных байтов файла в MinIO/S3. |
| **Фаза 3: Confirm** | `POST /api/v1/marketplace/property-assets/:assetId/media/:mediaAssetId/confirm` | Проверка magic-byte MIME на сервере, привязка к `PropertyAsset.media`, назначение роли (`cover` / `gallery`). |
| **Управление** | `DELETE .../media/:mediaAssetId`<br>`PATCH .../media/:mediaAssetId` | Удаление фото (с авто-промоушеном обложки) и смена роли/alt. |

### 2.4. Дедупликация и актуальность (`DEDUPE-001 / ACT-001`)
| Маршрут | Метод | Тело | Описание |
|---|---|---|---|
| `/api/v1/marketplace/property-assets/:assetId/duplicate-candidates` | `GET` | — | Получение списка кандидатов в дубли с сигналами совпадения (`phoneMatch`, `addressMatch`). |
| `/api/v1/marketplace/property-assets/duplicate-candidates/:id/override` | `POST` | `{ reason }` | Снятие блокировки дубля владельцем (причина >= 10 символов). |
| `/api/v1/marketplace/property-assets/:assetId/listings/:listingId/actuality` | `GET` | — | Получение состояния актуальности (`category`, `version`, `status`). |
| `/api/v1/marketplace/property-assets/:assetId/listings/:listingId/confirm-actuality` | `PATCH` | `{ expectedVersion }` | Подтверждение актуальности листинга. |

### 2.5. Публикация и поллинг
| Маршрут | Метод | Заголовки / Ответ | Описание |
|---|---|---|---|
| `/api/v1/marketplace/property-assets/:assetId/listings/:listingId/publish` | `POST` | `Idempotency-Key: pub-...`<br>Ответ: `202 Accepted` | Идемпотентный запуск публикации. Создаёт запись `MarketplacePublication` со статусом `publication_pending`. |
| `/api/v1/marketplace/property-assets/:assetId/listings/:listingId/publication-status` | `GET` | Ответ: `{ status, slug, ... }` | Опрос состояния публикации. При переходе в `published` отдаёт канонический `slug` объекта. |

---

## 3. Архитектура состояния и State Machine

Состояние мастера публикации изолировано в `wizard-reducer.ts` и управляется хуком `usePublishingWizard`:

```typescript
export interface WizardState {
  step: 'auth' | 'location' | 'characteristics' | 'deal' | 'media' | 'review' | 'publishing' | 'published';
  isAuthenticated: boolean;
  identityId?: string;

  // Формы шагов
  location: LocationFormData;
  characteristics: CharacteristicsFormData;
  deal: DealFormData;

  // Backend сущности
  assetId?: string;
  listingId?: string;
  publicationId?: string;
  publishedSlug?: string;

  // Медиа
  mediaItems: WizardMediaItem[];
  isUploadingMedia: boolean;

  // Дубликаты и актуальность
  duplicateCandidates: DuplicateCandidate[];
  hasDuplicateBlock: boolean;
  overrideReason: string;
  isSubmittingOverride: boolean;
  actualityState?: ActualityState;

  // Публикация и опрос
  isPublishing: boolean;
  publicationStatus?: 'publication_pending' | 'published' | 'build_failed' | 'unpublished';

  isLoading: boolean;
  error: string | null;
}
```

---

## 4. Гарантии безопасности и изоляции данных

1. **Host-only HTTP Cookie**: Никакие токены аутентификации не хранятся в `localStorage` или `sessionStorage`.
2. **Изоляция по Identity**: Все запросы к `/api/v1/marketplace/property-assets/**` проверяются через `MarketplaceAccountGuard`. Попытка доступа к чужим активам или листингам возвращает единый `404 Not Found` (принцип неразглашения).
3. **Idempotency Guard**: Запрос публикации листинга сопровождается уникальным ключом идемпотентности, исключая дублирование публикаций при сетевых сбоях и повторных кликах.
4. **Non-Disclosure Public Projection**: Внутренние поля (`identityId`, `storageKey`, внутренние статусы) никогда не проецируются в публичные карточки каталога.

5. **Граница lead-flow**: публикация из независимого marketplace-auth контура создаёт `publisherScope: marketplace_account` и не привязывает объект к ERP-организации. Публичный `reveal-contact` и создание CRM-лида по плану LEAD-001 работают для объявлений, принадлежащих организации; для identity-only публикации API возвращает единый `404`, не раскрывая внутреннего владельца. Это сознательная граница доменной модели, а не UI-fallback или скрытая потеря данных.
6. **401 vs 403 на `MarketplaceAccountGuard`** (production acceptance проход, 2026-08-30): гость без единой `baza_session` cookie получает `401 AUTH_NO_SESSION`; cookie есть, но не резолвится в валидный `MarketplaceAccountContext` (истёкшая/отозванная/чужой-audience сессия) — `403 FORBIDDEN`, non-disclosure причины. Зеркалирует уже существующее поведение `AdminGuard` — до этого прохода `MarketplaceAccountGuard` (и `TenantGuard` для ERP-контура) всегда бросал generic 403 независимо от наличия cookie, что означало нечестный ответ на следующий запрос после `POST /auth/logout`.
7. **CAS на `PropertyAsset.media[]` (MKT-004-MEDIA-RACE-001, production acceptance проход, 2026-08-30)**: все четыре мутации (confirm/delete/update-item/reorder) над media-массивом asset'а теперь атомарны относительно друг друга через оптимистичную блокировку на поле `version` (`PropertyAssetRepository.mutateMedia` — читает текущий массив+version, применяет чистую функцию-трансформацию, пишет `updateOne({_id,version},{$set,$inc:{version:1}})`, при проигранной гонке повторяет цикл против уже актуального состояния, до 5 попыток). До фикса два подлинно конкурентных запроса на одном asset (например, wizard параллельно подтверждает confirm двух фото — реалистичный сценарий при multi-file выборе с параллельными XHR) могли тихо потерять одно из двух изменений: оба читали один и тот же стартовый массив, чей `updateOne({_id},{$set:{media}})` без версии коммитился последним — тот и выигрывал целиком, без ошибки ни одной из сторон. Подтверждено реальными HTTP-интеграционными тестами с настоящим `Promise.all` против MongoDB (не мок) — `apps/api/test/integration/property-asset-media.integration-spec.ts`.

---

## 5. Доступность (A11y) и Тестовое покрытие

- Все элементы форм снабжены семантическими `<label htmlFor="...">`, подсказками и сообщениями об ошибках с `role="alert"`.
- Прогресс заполнения размечен через `<nav aria-label="Прогресс заполнения объявления">` с выделением текущего шага (`aria-current="step"`).
- Все ключевые контролы и шаги покрыты стабильными `data-testid` (`wizard-step-auth`, `wizard-step-location`, `wizard-step-characteristics`, `wizard-step-deal`, `wizard-step-media`, `wizard-step-review`, `wizard-step-published`, `view-published-listing-btn`).
- Реальный MapLibre picker покрыт тестами на отсутствие конфигурации, клик по карте и drag маркера; API-base — тестами на relative/origin варианты.
- Критические сценарии модуля wizard покрыты модульными и функциональными тестами в `apps/marketplace-web/tests/`; HTTP-транзакция публикации и публичный lead-reveal покрыты интеграционными сьютами `apps/api/test/integration/`.
