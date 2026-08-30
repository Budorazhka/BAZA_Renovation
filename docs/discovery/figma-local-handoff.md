# Figma local handoff — Batumi Real Estate Project

Источник: `Batumi Real Estate Project.fig`, переданный владельцем проекта 30.08.2026. Файл разобран локально из `canvas.fig`; это handoff для реализации marketplace, а не новая дизайн-концепция.

## Выбранные экраны

| User flow | Figma node | Размер | Реализация |
| --- | --- | ---: | --- |
| Главная / поиск | `1035:13357` — `Home page` | 1920×1263 | `CataloguePage` при вкладке новостроек |
| Главная mobile | `1035:18101` — `mob_home` | 375×3461 | responsive layout |
| Каталог списком | `236:27197` — `search result (2 page) full width` | 1920×1216 | catalogue list |
| Каталог с картой | `236:26596` — `search result (2 page) open map` | 1920×1216 | MapLibre/OSM-compatible style |
| Вторичка | `3314:205664` — `квартиры вторичка поиск` | 1920×1414 | listings filters + cards |
| Аренда | `3340:51651` — `квартира аренда` | 1920×1464 | listings filters + cards |
| Карточка вторички | `3314:206822` — `квартира во вторичке средняя карточка` | 1920×4722 | listing detail |
| Карточка ЖК | `3314:196358` — `big card ЖК` | 1084×581.4 | development card |
| Публикация: первый шаг desktop | `3304:49485` — `Добавление объекта` | 1920×1080 | wizard shell |
| Публикация: первый шаг mobile | `3304:47390` — `mob_add object_1` | 375×850 | wizard responsive shell |
| Публикация: ошибка | `3304:50308` — `Добавление объекта_error` | 1920×1080 | validation/error state |

Не использовать без отдельного решения владельца: `3314:200742` (`ЖК целая страница (не используется)`) и `3314:209035` (`Проект целая страница (не используется)`).

## Design tokens, снятые из UI kit

- Main green: `rgb(22,150,0)` / `#169600` (hover/darker variant: `#107d07`).
- Dark text: `rgb(21,21,21)` / `#151515`.
- Muted text: `rgb(85,84,84)` / `#555454`; disabled grey: `#8c8c8c`.
- Light element background: `rgb(241,247,235)` / `#f1f7eb`.
- Page background in catalogue frames: `rgb(241,247,235)` / `#f1f7eb`; mobile shells use `#fcfcfc`.
- Card surfaces: `#ffffff`; standard card radius: 10px; hero/promotional radius: 30px.
- Typography: Comfortaa for controls/body labels; Plus Jakarta Sans for headings and large numeric values. Captured examples: Comfortaa 14/16/18/20/22; Plus Jakarta Sans 20/24/28/30/60.

## Implementation rule

API, real loading/error/empty states, filters, map bounds and publication wizard behavior stay unchanged. This handoff only replaces the presentation layer and records the exact Figma references used for parity review.
