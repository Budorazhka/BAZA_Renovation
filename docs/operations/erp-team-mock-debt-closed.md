# Мок-долг команды закрыт: реестр читает и пишет только через Platform API

Статус: сделано (03.09.2026)

TEAM-001 (docs/BAZA_MASTER_PLAN.md, разд. 9) был помечен «частично» в
docs/progress-report-2026-09-01.md: «Серверная часть готова; критерий про
фронтенд «без mock/localStorage» проверить нечем — ERP-клиент вендорен, но вне
гейтов». Тот же подход, что для задач
([erp-tasks-live-api.md](erp-tasks-live-api.md),
[erp-tasks-mock-debt-closed.md](erp-tasks-mock-debt-closed.md)): найти, что
реально ходит на мок, и убрать.

## Что было

`teamApi.ts` уже формально был переведён на backend флагами
`USE_MOCK_TEAM_* = false` (create/update/setStatus/move/vacate/assignOccupant
реализованы 26.08.2026), но при этом:

1. **Все write-операции ходили не туда.** Они использовали отдельный
   axios-инстанс с `CRM_API_BASE_URL` и без глобального префикса `/api/v1`.
   В dev это случайно совпадало с `PLATFORM_API_BASE_URL` (оба —
   `localhost:3000`), поэтому вызовы «работали» на глазах у разработчика. В
   production `CRM_API_BASE_URL` резолвится в `api-crm.baza.sale` — другой
   backend, где `/team-users/...` не существует вообще, а даже если бы это
   был тот же backend, путь без `/api/v1` не совпадает ни с одним реальным
   роутом (`apps/api/src/main.api.ts`: `setGlobalPrefix('api/v1', ...)`).
   Значит vacate/assign/setStatus/move/create/remove/uploadAvatar в
   production тихо получали бы 404 даже с выключенными мок-флагами — ровно
   то, что критерий приёмки просил проверить и не мог.
2. **Мок-код на 300+ строк оставался в файле**: `mockSeed`, `mockRead`/
   `mockWrite` (localStorage-ключ `mock_team_accounts_v2`),
   `mockNormalizeAccounts`, `mockBackfillPositions`, `mockEnsureSelf`,
   `mockUploadAvatar`, `isDemoSession`, `isRealId`/`REAL_TEAM_ID_RE` — все
   ветки, использующие это, были недостижимы (флаги уже `false`), но
   создавали риск: любой снова включённый флаг молча вернул бы вымышленных
   сотрудников реальному пользователю.

## Что сделано

**Один HTTP-клиент.** Все методы `teamApi` теперь ходят через единственный
`axios.create({ baseURL: PLATFORM_API_BASE_URL })`, каждый путь — с префиксом
`/api/v1`, ровно как отдаёт `apps/api`. Отдельного `CRM_API_BASE_URL`-инстанса
в файле больше нет.

**Мок и localStorage убраны полностью.** `mockSeed`, `mockRead`/`mockWrite`,
`mockNormalizeAccounts`, `mockBackfillPositions`, `mockEnsureSelf`,
`mockUploadAvatar`, `isDemoSession`, `isRealId`/`REAL_TEAM_ID_RE`,
`USE_MOCK_TEAM*` — удалены. `readCurrentUserPositionId()` оставлен: это чтение
positionId текущей сессии из кэша `AuthContext` (`agency.auth.current-user`),
не бизнес-данные команды, нужен только `uploadAvatar()` для presigned-flow.

**Типы вынесены из мок-файла.** `PersonnelPage.tsx` и
`data/personnel-permissions.ts` импортировали `Employee`/`EmployeeRole`/
`ROLE_LABELS` из `data/personnel-mock.ts` ради одних только типов и
справочной таблицы ролей — реального мок-массива (`MOCK_EMPLOYEES`) они не
использовали. Типы и таблицы (`ROLE_LABELS`, `ROLE_COLORS`) перенесены в новый
`types/personnel.ts`; `personnel-mock.ts` теперь только реэкспортирует их для
обратной совместимости и хранит `MOCK_EMPLOYEES` — но уже явно как фикстуру
только для ещё не переведённого KPI-контура (ниже).

**Guard-тест.** `tests/unit/personnelRegistryNoMock.test.ts` сканирует
исходники `teamApi.ts`, `PersonnelPage.tsx`, `personnel-permissions.ts` и
падает, если там снова появится ссылка на `personnel-mock`/`MOCK_EMPLOYEES` —
тот же принцип, что «мок больше не импортируется нигде» для задач, но как
исполняемая проверка, а не утверждение в тексте коммита.

## Что осталось на мок-данных осознанно (вне TEAM-001)

- **KPI и отчёты по позиции/человеку** (`TeamReportPage.tsx`,
  `MyReportPage.tsx`, `SetPlansModal.tsx`,
  `lib/bi/manager-analytics-adapter.ts`) — backend их не реализует
  (docs/progress-report-2026-09-01.md: «Нет: KPI и отчёты по позиции и
  человеку»). Это отдельная задача этапа 6 мастер-плана; подключать сюда
  несуществующий backend-эндпоинт не входило в задачу. Каждый файл теперь
  явно это документирует комментарием на месте импорта мока.
- **`WidgetTeam.tsx`** использует не `personnel-mock`, а `leads-mock`
  (`INITIAL_LEAD_MANAGERS`) — справочник менеджеров подсистемы лидов,
  используемый в 16 файлах (`LeadsContext`, `DealsKanbanPage`, `BookingsPage`
  и др.), которая целиком ещё не переведена на Platform API. `Lead.managerId`
  в этой подсистеме ссылается на id из `leads-mock` (`'lm-1'` и т.п.), не на
  реальный `positionId` — подменить только справочник имён на `teamApi.list()`
  без миграции самих лидов означало бы потерять связь между лидом и
  менеджером. Миграция возможна только вместе с переводом лидов на Platform
  API — отдельная, значительно более крупная задача.

## Известные пробелы backend (не создавались в этом проходе)

Оба уже были задокументированы в исходном коде `teamApi.ts` до этого прохода
(«ещё не реализованы на backend») — были подтверждены сверкой с
`team.controller.ts` и на момент написания раздела оставались честными 404, не
мок-заглушками. Закрыты тем же днём (`c2676c6`, 03.09.2026) — эта секция
писалась раньше того коммита в рамках одного дня и обновлена не была.

- ~~**`GET /team-users/:id` не существует**~~ — реализован (`c2676c6`):
  `TeamController.getById`, `position.read`, переиспользует приватный
  `TeamService.toView` для одной позиции.
- ~~**`POST /team-users/positions` (пустой слот без occupant'а) не
  существует**~~ — реализован (`c2676c6`): `TeamController.createSlot` →
  `TeamService.createVacantSlot`, делегирует уже существующему
  `OrganizationsService.createVacantPosition`.

Оба описаны в OpenAPI, покрыты `team-users-gaps.integration-spec.ts` (новый
файл того же коммита).

## Проверено

- `tests/unit/teamApi.platformRoutes.test.ts` (существовал) + новый
  `tests/unit/teamApi.writeOperations.test.ts` (10 тестов): все методы
  `teamApi` — один HTTP-клиент, `/api/v1/team-users/...`, ни одна
  write-операция не пишет в `localStorage`.
- `tests/unit/personnelPageLiveApi.test.ts` (3 теста): `PersonnelPage`
  рендерит состав команды из ответа замоканного HTTP-слоя (не `teamApi`
  напрямую), не подставляет вымышленных сотрудников при отказе сервера, не
  читает состав из `localStorage`.
- `tests/unit/personnelRegistryNoMock.test.ts` (4 теста): архитектурный страж.
- Полный прогон клиента: 37 файлов, 229 тестов — зелено.
- `tsc -b` по `apps/erp-web` — чисто.
- `eslint` по изменённым файлам — чисто (кроме двух уже существовавших
  предупреждений/ошибок в `PersonnelPage.tsx`, не связанных с этим проходом:
  `react-hooks/set-state-in-effect` на строках 1731 и 2157, существовали до
  правки, подтверждено сверкой с версией до изменений).
