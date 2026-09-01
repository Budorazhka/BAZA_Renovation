# client.reassign — dedicated Deal owner reassignment (security review follow-up)

Статус: implemented (31.08.2026)

## Контекст

`{resource:'client', action:'reassign', scope:'organization'}` был выдан owner/director/rop в
`DEFAULT_ROLE_GRANTS` с самого начала CRM-прохода, но до этого коммита ни один HTTP-путь его не
проверял — `PATCH /deals/:dealId` (`deal.edit`) принимал `ownerPositionId` в теле запроса и молча
менял ответственного за сделку без какой-либо проверки `client.reassign`. Для шести встроенных ролей
это не открывало реальную дыру (owner/director/rop и так имеют `deal.edit` со scope `organization`, а
`manager` со scope `own` уже был явно заблокирован сверкой запрошенного `ownerPositionId` со своей
позицией в `DealController.updateDeal`), но платформа поддерживает explicit per-Position
custom grant-наборы (⚙-toggle, `default-role-grants.ts` докстринг) — Position с `deal.edit`, но
БЕЗ `client.reassign`, всё равно могла бы переназначить владельца сделки в обход зафиксированного в
grants намерения. Честный gap, найденный сверкой grants-таблицы с реальными `@RequirePermission`-
проверками, не документа.

Тот же принцип уже применён к Task (`task.reassign` отделён от `task.edit`, owner-подтверждено
30.08.2026) — этот коммит приводит Deal к тому же паттерну.

## Delivered

- `PATCH /deals/:dealId/reassign` (`client.reassign.organization`) — `CrmService.reassignDeal`.
- `UpdateDealDto`/`PATCH /deals/:dealId` (`deal.edit`) **больше не принимает** `ownerPositionId` —
  `forbidNonWhitelisted:true` отклоняет его 400-й, тот же принцип, что уже действует для
  `UpdateTaskDto`/`assignedPositionId`.
- `ownerPositionId` у Deal — **обязательное** поле (в отличие от `Task.assignedPositionId`) —
  `ReassignDealDto` не поддерживает "снять ответственного", только замену на другую существующую
  assignable позицию той же организации (`OrganizationsService.findAssignablePosition`, тот же
  вызов, что уже использовался в `updateDeal`/`reassignTask`).
- No-op reassign (тот же `ownerPositionId`, что уже стоит) — короткий выход до транзакции, без
  инкремента `version` и без audit-записи, тот же принцип, что `CrmService.reassignTask`.
- Audit-запись `action: 'client.reassign'`, `resource: 'deal'` — отдельное, узнаваемое действие в
  audit trail, отличное от общего `deal.edit`.
- `DealController` использует отдельный `ownerFilterForClientReassign` helper (resource `'client'`,
  не `'deal'`) — грант матрицы объявлен на другом resource, чем сама Deal-сущность.

## Verification

- API unit: `deal.controller.spec.ts` (`DealController.reassignDeal`, 2 теста — resource `'client'`
  в `matchingScopes`, own-scope сужение).
- Mongo replica-set integration: `crm-deals.integration-spec.ts`
  (`PATCH /deals/:dealId/reassign — client.reassign`, 6 тестов — успешный reassign с audit,
  403 без гранта, 400 на попытке провести reassign через `deal.edit`, 404 на чужую организацию,
  409 на устаревший `expectedVersion`, no-op без версии/аудита).
- OpenAPI (`PATCH /deals/{dealId}/reassign`, `ReassignDealRequest`) и
  `packages/api-client/src/schema.ts` синхронизированы (`check-stale` проходит).

## Осознанно НЕ реализовано в этом коммите: `lead.reassign`

`{resource:'lead', action:'reassign'}` (director: `organization`, rop: `team`) — такой же "мёртвый"
grant в `DEFAULT_ROLE_GRANTS`, но в отличие от `client.reassign` он функционально ПОЛНОСТЬЮ
перекрывается уже существующим `POST /leads/:leadId/assign` (`lead.assign`, owner/director/rop/
developer, scope `organization`, `CrmService.assignLead`) — тот уже безусловно меняет
`ownerPositionId` лида независимо от текущего значения (не различает "первое назначение" и
"переназначение", докстринг `assignLead` это подтверждает). Добавление отдельного
`lead.reassign`-эндпоинта с идентичной механикой было бы дублирующей поверхностью без нового
поведения — не тот случай, что Deal (где `client.reassign` закрывает реальный, пусть и не
эксплуатируемый шестью встроенными ролями, разрыв). Оставлено как явно задокументированное решение,
не забытый todo.
