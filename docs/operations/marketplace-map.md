# Marketplace Map & OSM Provider Operations Guide

Этот документ описывает архитектуру, конфигурацию, требования к провайдерам тайлов, правила атрибуции, поведение вьюпорта и чеклист развёртывания интерактивной карты маркетплейса BAZA (`apps/marketplace-web`).

---

## 1. Архитектура и стек карты

- **Рендерер**: MapLibre GL JS (`maplibre-gl` v5.x) — открытый, производительный движок векторных и растровых карт с поддержкой WebGL, аппаратного ускорения и доступности.
- **Интеграция с React**:
  - `MarketplaceMap` (`apps/marketplace-web/src/components/MarketplaceMap.tsx`) управляет жизненным циклом экземпляра MapLibre.
  - Карта синхронизирована с каталогом объектов (`useCatalogue` для ЖК и `useListingsCatalogue` для объявлений).
  - Интерактивные маркеры реализованы через доступные DOM-элементы `<button>` с клавиатурным управлением (`Enter`/`Space`) и фокусом.
  - Нажатие на маркер открывает оверлейную карточку предпросмотра объекта (`MapPreviewCard`), из которой пользователь может перейти к детальной странице объявления (`/listings/:slug`) или ЖК (`/developments/:slug`).
- **Синхронизация с URL**:
  - Параметр `view=map` переключает каталог в режим карты.
  - Изменение границ карты пользователем транслируется в параметр `bbox=minLng,minLat,maxLng,maxLat` с защитой от спама запросов (debounce 300ms).

---

## 2. Переменные окружения

| Переменная | Область | Назначение | Пример |
|---|---|---|---|
| `VITE_MAP_STYLE_URL` | Client (Vite) | URL JSON-стиля MapLibre. Задаёт схему слоёв, векторные тайлы, глифы и спрайты. | `https://api.maptiler.com/maps/streets-v2/style.json?key=...` |
| `TILE_PROVIDER_URL` | Server / Ops | Базовый URL векторного или растрового tile-сервера (если используется прокси/бэкенд). | `https://tiles.baza.sale/data/v3` |
| `TILE_PROVIDER_API_KEY` | Server / Ops | Секретный API-ключ для внешнего tile-провайдера (хранится только на сервере / в секретах CI/CD). | `secret_key_...` |

### Безопасность API-ключей и конфигурации
1. **Никаких захардкоженных ключей в коде**: Клиентский `VITE_MAP_STYLE_URL` инжектируется на этапе сборки/развёртывания.
2. **Ограничение доменов (HTTP Referrer / Origin restriction)**: Для внешних провайдеров (MapTiler, Stadia) API-ключ в консоли провайдера должен быть ограничен доменами `baza.sale`, `*.baza.sale` и `localhost:3001` для dev.
3. **Логирование**: API-ключи никогда не выводятся в консоль браузера или серверные логи.
4. **Ненастроенное состояние**: При отсутствии `VITE_MAP_STYLE_URL` или значении-плейсхолдере (`REPLACE_ME_*`) компонент рендерит понятный баннер `marketplace-map--unconfigured` без сетевых ошибок и без падений.

---

## 3. Провайдеры тайлов (OSM-Compatible)

### Важное ограничение (Tile Usage Policy)
> [!WARNING]
> Публичный сервер `tile.openstreetmap.org` **ЗАПРЕЩЕНО** использовать в качестве production CDN. Это нарушает OpenStreetMap Tile Usage Policy и приводит к блокировке IP-адресов приложения. В продакшене разрешены только собственный TileServer или провайдеры с коммерческим SLA.

### 3.1. Development и Testing

Для локальной разработки и тестовых сред рекомендуются:
1. **MapLibre Demotiles** (только для dev/test):
   - URL: `https://demotiles.maplibre.org/style.json`
   - Не требует API-ключа, подходит для smoke-тестов рендера.
2. **MapTiler Cloud (Free Tier)**:
   - URL: `https://api.maptiler.com/maps/streets-v2/style.json?key=YOUR_KEY`
   - Требуется бесплатный ключ с ограничением домена.
3. **Stadia Maps (Free Tier)**:
   - URL: `https://tiles.stadiamaps.com/styles/alidade_smooth.json?api_key=YOUR_KEY`
4. **Локальный TileServer GL / Docker PMTiles**:
   - `docker run --rm -it -v $(pwd):/data -p 8080:8080 maptiler/tileserver-gl`
   - URL: `http://localhost:8080/styles/basic-preview/style.json`

### 3.2. Production

Для production-окружения BAZA:
1. **Self-hosted Vector Tile Server (Рекомендуется)**:
   - Стек: **TileServer GL** или **Martin** + **OpenMapTiles / PMTiles** на базе среза OpenStreetMap по Грузии/Закавказью.
   - Хостинг: Собственный инстанс или S3/MinIO + Cloudflare Workers (Protomaps PMTiles).
   - URL: `https://tiles.baza.sale/styles/baza-light/style.json`
   - Плюсы: Нулевая зависимость от внешних лимитов и тарифов, полный контроль над стилизацией под бренд BAZA, максимальная приватность данных геолокации пользователей.
2. **Managed Enterprise Tile Provider**:
   - MapTiler Cloud Enterprise / Stadia Maps Organization с SLA 99.9%+.
   - Должен быть настроен fallback и мониторинг квоты запросов.

---

## 4. Формат Style URL и требования к стилю

MapLibre ожидает стиль в формате **Mapbox GL Style Specification (v8)**:
```json
{
  "version": 8,
  "name": "BAZA Light",
  "sources": {
    "openmaptiles": {
      "type": "vector",
      "url": "https://tiles.baza.sale/data/v3.json"
    }
  },
  "glyphs": "https://tiles.baza.sale/fonts/{fontstack}/{range}.pbf",
  "sprite": "https://tiles.baza.sale/sprites/sprite",
  "layers": [ ... ]
}
```

---

## 5. Требования к атрибуции (Legal / Attribution)

Данные OpenStreetMap распространяются по лицензии **Open Database License (ODbL)**.

1. **Обязательная атрибуция OSM**: На карте или в подвале должна присутствовать ссылка:
   `© OpenStreetMap contributors` (со ссылкой на `https://www.openstreetmap.org/copyright`).
2. **Атрибуция провайдера**: Если используется MapTiler, Stadia или Mapbox, дополнительно указывается атрибуция поставщика (`© MapTiler`, `© Stadia Maps`).
3. **MapLibre AttributionControl**: В `MarketplaceMap` включён стандартный контрол атрибуции MapLibre, автоматически отображающий атрибуцию, заданную в `style.json`.

---

## 6. Поведение вьюпорта и обработка данных

1. **Валидация координат**:
   - Допустимые диапазоны: Longitude `[-180, 180]`, Latitude `[-90, 90]`.
   - `getMarketplaceMapPoints` фильтрует `null`, `undefined`, `NaN`, нечисловые и выходящие за диапазон координаты.
   - Объекты без координат не вызывают ошибок рендера.
2. **Fit Bounds на старте**:
   - При наличии объектов с валидными координатами карта автоматически центрируется и подбирает зум (`map.fitBounds`).
   - Программный fitBounds **не** инициирует `onBoundsChange`, исключая зацикливание запросов.
3. **Дебаунс при движении пользователя**:
   - Событие `moveend`, инициированное пользователем (`originalEvent`), вызывает `onBoundsChange` с задержкой 300 мс.
   - Повторные быстрые сдвиги карты сбрасывают таймер, предотвращая лишние запросы к API.
4. **Защита от состояния гонки (Race Conditions)**:
   - Все запросы каталога защищены связкой `requestIdRef` + `AbortController`.
   - Старый ответ при быстром перемещении вьюпорта отменяется и не перезаписывает свежие данные.
5. **Очистка ресурсов (Cleanup)**:
   - При размонтировании компонента все маркеры удаляются (`marker.remove()`), таймеры очищаются, инстанс карты уничтожается (`map.remove()`), исключая утечки памяти и зависшие слушатели.

---

## 7. Production Checklist

Перед выкаткой в продакшен убедитесь, что:
- [ ] Переменная `VITE_MAP_STYLE_URL` задана в CI/CD pipeline и указывает на рабочий production endpoint стиля.
- [ ] Проверено, что стиль не использует незащищённый `http://` в `glyphs` или `sprite` (mixed content block).
- [ ] Настроены CORS-заголовки (`Access-Control-Allow-Origin`) на tile-сервере для домена `baza.sale`.
- [ ] API-ключ провайдера (если используется) ограничен production-доменами и не имеет прав на изменение настроек аккаунта.
- [ ] Экран `marketplace-map--unconfigured` проверен и подтверждён как корректный fallback при отсутствии конфигурации.
- [ ] Атрибуция OpenStreetMap отображается корректно.

---

## 8. Troubleshooting

| Симптом | Причина | Решение |
|---|---|---|
| Экран «Карта пока не подключена» | `VITE_MAP_STYLE_URL` не задан или равен `REPLACE_ME_*` | Задайте корректный URL в `.env` и пересоберите проект. |
| Баннер ошибки «Не удалось загрузить слой карты» | Ошибка загрузки `style.json` (404/403/CORS) | Проверьте доступность URL стиля в браузере, валидность API-ключа и CORS-заголовки. |
| Карта отображается серым фоном без тайлов | Недоступны шрифты (`glyphs`) или векторные тайлы из `sources` | Проверьте консоль Network: пути к `{fontstack}/{range}.pbf` и `{z}/{x}/{y}.pbf` должны возвращать 200 OK. |
| Маркеры не отображаются | У объектов в ответе API отсутствуют координаты `location.geo.coordinates` | Проверьте формат геоданных в ответе каталога (должен быть `[longitude, latitude]`). |
| Утечка памяти при частой смене списка/карты | Отсутствие `map.remove()` или неудалённые маркеры | В `MarketplaceMap` реализован полный цикл cleanup в `useEffect`. |
