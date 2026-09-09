# P0-01 — синхронизация контракта и quality gate

Дата: 07.09.2026. Статус: закрыто в рамках локального quality gate текущего workspace.

## Проблема и изменения

Новые маршруты генерации шахматки, пакетных операций и конвертации брони
присутствовали в OpenAPI, но отсутствовали в сгенерированном клиенте.
`pnpm --filter @baza/api-client generate` обновил `src/schema.ts`;
проверка `check-stale.mjs` после генерации прошла.

Admin-тесты в ограниченной Windows-среде не загружали конфигурацию стандартным
esbuild bundle loader (Access denied при обходе родительского каталога).
Контрольный запуск с `--configLoader runner` прошёл: 8 файлов, 57 тестов.
Этот режим закреплён в `apps/admin-web/package.json`, по образцу marketplace.
Тесты не отключались и разрешения filesystem не расширялись.

Полный lint нашёл 16 ошибок в новых API/worker-тестах: explicit any и один
неиспользуемый аргумент. Убраны лишние casts фабрик, частичные doubles репозиториев
приведены к соответствующим типам, массивы batch-тестов используют параметры
репозиториев и `PublishOutboxEventParams`. Проверки содержимого событий сохраняются;
optional chaining в assert учитывает `noUncheckedIndexedAccess` и при отсутствии
события по-прежнему приводит к провалу сравнения с ожидаемым значением.
Убраны лишние пустые строки EOF в тесте developments и CSS tokens.

Изменения бизнес-логики цен, транзакций и публикации в эту задачу не входят.

## Проверка

Финальная команда после правок:

```powershell
pnpm run typecheck --force --concurrency=4 lint test build
node packages/api-client/scripts/check-stale.mjs
node packages/api-client/scripts/verify-contract-layout.mjs
git diff --check
```

Первый вызов передаёт Turbo четыре задачи: typecheck, lint, test, build.
`--force` исключает принятие прежнего cache hit за новый прогон.
Локальный лог: `p0-01-quality.log` (не обязательный поставляемый файл).

Финальный результат: **55/55 задач успешны, 0 cache hits, 1m36.18s**.
Все 1488 выполненных тестов прошли:

| Пакет | Тестов |
| --- | ---: |
| API | 1057 |
| Worker | 85 |
| Marketplace | 167 |
| Admin | 57 |
| domain-events / tenant-scope / development | 7 / 5 / 15 |
| publication / property-assets / media-storage | 21 / 51 / 22 |
| api-client (node test) | 1 |

Все объявленные workspace typecheck/lint/build задачи прошли в том же запуске.
Отдельно после него прошли `check-stale.mjs`, `verify-contract-layout.mjs`
и `git diff --check`. Установки пакетов и сетевого доступа не потребовалось.

## Границы и остаток

- Это локальный quality gate текущего рабочего дерева, включая ранее
  незакоммиченные изменения. Не утверждение о проверенном удалённом commit/CI.
- ERP исключён из workspace; подключение и воспроизводимая установка из lockfile
  относятся к P0-04. Наличие в Turbo списка пакетов не означает выполнение
  каждой задачи для каждого пакета: у admin/marketplace нет lint-скриптов,
  некоторые инфраструктурные пакеты явно не имеют тестов.
- Integration, runtime E2E, чистая установка зависимостей, Linux CI, визуальная
  приёмка и production в этом проходе не выполнялись.
- Предупреждение Vite о размере marketplace JS bundle остаётся; лимит предупреждения
  не менялся ради зелёной сборки. Оптимизация загрузки требует отдельной задачи.
- Следующая задача: P0-02 — корректность цены/валюты и поисковой проекции;
  P0-03 — конкурентность и HTTP/integration-приёмка новых команд.
