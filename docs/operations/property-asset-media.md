# Property Asset Media: Upload Flow, Storage Model & Public Gallery (MKT-004)

## 1. Архитектурное решение: каноническое место хранения

Каноническое место хранения медиа-файлов — **`PropertyAsset.media`**.

### Обоснование выбора (PropertyAsset vs Listing)
1. **Физическая сущность**: фотографии отражают физические характеристики реального объекта недвижимости (фасад, планировка, интерьер комнат, вид из окна).
2. **Отсутствие дублирования**: один физический объект (`PropertyAsset`) может иметь одновременно несколько коммерческих предложений (`Listing`, например, продажа и долгосрочная аренда). Хранение на уровне `PropertyAsset` исключает дублирование файлов в S3 и записей в базе данных.
3. **Безопасность и жизненный цикл**: управление медиа привязано к правам владения объектом недвижимости (`property_asset:edit`), а публикация на витрину проецирует медиа в снимок `MarketplacePublication`.

---

## 2. Модель данных медиа

Каждая запись в массиве `PropertyAsset.media` имеет следующую структуру:
```typescript
export type PropertyAssetMediaRole = 'cover' | 'gallery';

export interface PropertyAssetMediaItem {
  id: string;
  mediaAssetId: Types.ObjectId;
  role: PropertyAssetMediaRole;
  sortOrder: number;
  alt?: string;
  isPrivate: boolean;
  createdAt: Date;
}
```

### Инварианты:
- **Единственный cover**: ровно один не приватный элемент имеет `role: 'cover'`. При назначении нового `cover` предыдущий автоматически понижается до `gallery`.
- **Авто-промоушен при удалении**: если удаляется `cover`, первый оставшийся публичный элемент автоматически назначается `cover`.
- **Скрытие storage keys**: внутренние ключи хранилища MinIO/S3 (`storageKey`, `originalPath`, `bucket`) никогда не раскрываются наружу.

---

## 3. Авторизованный Upload Flow (3-фазный)

### Фаза 1: Запрос Intent (`POST /property-assets/:assetId/media/upload-intent`)
- Проверяет tenant ownership и разрешения (`@RequirePermission('property_asset', 'edit')` для CRM или `MarketplaceAccountGuard` для витрины).
- Валидирует MIME-тип (только `image/jpeg`, `image/png`, `image/webp`) и размер (до 20 МБ).
- Генерирует presigned upload URL в MinIO/S3 с детерминированным путём.

### Фаза 2: Прямая загрузка клиентом
- Клиент отправляет бинарные данные напрямую в S3/MinIO по выданному presigned URL.

### Фаза 3: Подтверждение (`POST /property-assets/:assetId/media/:mediaAssetId/confirm`)
- Синхронно проверяет magic-byte MIME через `MediaMimeVerifierService`.
- Проверяет соответствие заявленного и реального MIME.
- Идемпотентно привязывает `mediaAssetId` к `PropertyAsset.media`.
- Генерирует outbox-событие `MediaVerified` для асинхронного создания derivative-вариантов (`thumbnail`, `card`, `detail`) воркером.

### Управление медиа:
- `GET /property-assets/:assetId/media` — получение списка с публичными URL и метаданными.
- `PATCH /property-assets/:assetId/media/:mediaAssetId` — обновление `role`, `alt`, `sortOrder`, `isPrivate`.
- `PUT /property-assets/:assetId/media/order` — пакетное изменение порядка.
- `DELETE /property-assets/:assetId/media/:mediaAssetId` — удаление медиа с авто-коррекцией обложки.

---

## 4. Публикация и проекция на витрину (Worker & Public API)

1. **Worker Publication Mapper (`listing-publication.mapper.ts`)**:
   - При публикации листинга воркер считывает `PropertyAsset.media`.
   - Отбирает только проверенные (`status: 'verified'`), публичные (`!item.isPrivate`) медиа-файлы с готовыми вариантами.
   - Сортирует: `cover` первым, затем `gallery` по возрастанию `sortOrder` и `createdAt`.
   - Формирует публичный массив `media` в `MarketplacePublication.denormalizedFields`.

2. **Public Listing API (`GET /public/listings/:slug` & `GET /public/listings`)**:
   - Возвращает только безопасный whitelist:
     ```typescript
     {
       url: string;
       role: 'cover' | 'gallery';
       sortOrder: number;
       alt?: string;
     }
     ```
   - Никакие служебные поля (`organizationId`, `identityId`, `storageKey`, приватные метаданные) не утекают в публичный API.
   - При отсутствии фотографий возвращается пустой массив `media: []` без fake/placeholder URL.

---

## 5. Marketplace Web UI

1. **Каталог (`/`)**:
   - В карточке объявления отображается реальная обложка (`role === 'cover'`).
   - Поддержаны fallback на `BuildingPlaceholder` при отсутствии фото или ошибке загрузки (`onError`).

2. **Детальная страница (`/listings/:slug`)**:
   - Полноценная интерактивная галерея (`ListingMediaGallery`):
     - Большой активный слайд с плавным появлением (`opacity transition`).
     - Skeleton shimmer индикатор во время загрузки фото.
     - Корректная обработка broken image с иконкой и сообщением об ошибке.
     - Кнопки «Вперёд» / «Назад» с циклическим переключением и счетчиком (`1 / N`).
     - Навигация с клавиатуры (стрелки `←` / `→`).
     - Лента миниатюр с активной рамкой и кликабельностью.
     - Адаптивный мобильный лейаут.
     - Доступный Alt-текст.
