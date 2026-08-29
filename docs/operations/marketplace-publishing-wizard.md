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

1. **Аутентификация и сессия**: Вход / регистрация автора через `POST /api/v1/auth/login` и `/register` с получением HTTP-only сессионной cookie (`baza_session`).
2. **Локация и гео-координаты**: Выбор города (быстрые пресеты Батуми, Тбилиси, Кутаиси), точный адрес и интерактивное указание гео-точки (`[longitude, latitude]`).
3. **Физические характеристики**: Тип недвижимости (`apartment`, `house`, `commercial`, `land`), формат коммерции (`commercialSubtype`), площадь (м²), комнатность, этаж/этажность и телефон представителя (`representativePhone`). На этом шаге создаётся сущность **`PropertyAsset`** (`POST /api/v1/marketplace/property-assets`).
4. **Коммерческие условия**: Тип сделки (`sale`, `rent_long`, `rent_short`), стоимость и валюта (`USD`, `GEL`, `RUB`). Создаётся и активируется сущность **`Listing`** (`POST .../listings` + `PATCH .../activate`).
5. **3-фазная загрузка медиа**: Прямая загрузка фотографий в хранилище (Intent → S3 PUT → Confirm), выбор главной обложки (`role: cover`), удаление и валидация форматов/размеров.
6. **Контроль дубликатов и актуальности**: Проверка кандидатов в дубли (`GET .../duplicate-candidates`). При обнаружении конфликта — форма **Owner Override** с обязательным обоснованием (не менее 10 символов). Подтверждение актуальности (`PATCH .../confirm-actuality`).
7. **Идемпотентная публикация и ожидание проекции**: Отправка запроса на публикацию (`POST .../publish` с заголовком `Idempotency-Key`), поллинг статуса (`publication-status`) до перехода в `published` и открытие публичной карточки (`/listings/:slug`).

---

## 2. API Контракты и Endpoints

Все запросы выполняются с `credentials: 'include'` и используют базовый URL `VITE_API_BASE_URL`.

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

---

## 5. Доступность (A11y) и Тестовое покрытие

- Все элементы форм снабжены семантическими `<label htmlFor="...">`, подсказками и сообщениями об ошибках с `role="alert"`.
- Прогресс заполнения размечен через `<nav aria-label="Прогресс заполнения объявления">` с выделением текущего шага (`aria-current="step"`).
- Все ключевые контролы и шаги покрыты стабильными `data-testid` (`wizard-step-auth`, `wizard-step-location`, `wizard-step-characteristics`, `wizard-step-deal`, `wizard-step-media`, `wizard-step-review`, `wizard-step-published`, `view-published-listing-btn`).
- 100% покрытие сквозных сценариев модульными и функциональными тестами в `apps/marketplace-web/tests/`.
