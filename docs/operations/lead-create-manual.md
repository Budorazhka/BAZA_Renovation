# lead.create — manual CRM lead creation (security review follow-up)

Статус: implemented (31.08.2026)

## Контекст

`{resource:'lead', action:'create'}` был выдан ВСЕМ ролям (owner/director/rop/manager/administrator/developer)
в `DEFAULT_ROLE_GRANTS` с самого начала CRM-прохода, но до этого коммита не существовало ни одного HTTP-пути
завести лид вручную — единственным источником Lead был `CrmService.createLeadForReveal`, вызываемый только из
анонимного публичного `reveal-contact` потока. Агент физически не мог занести walk-in-клиента или лид с
телефонного звонка в CRM. Честный gap, найденный чтением кода (grep по имени action не находил ни одного
`@RequirePermission('lead', 'create')` в контроллерах), не документа.

## Delivered

- `POST /api/v1/leads` (`lead.create.organization`) — `CrmService.createLead`.
- Ровно один способ указать контакт: `contactId` (уже существующий, tenant-scoped lookup) ИЛИ
  `requesterPhone`+опционально `requesterName` (find-or-create по телефону в этой организации —
  `CrmService.resolveContact`, тот же tenant-local dedupe, что уже используется reveal-contact потоком).
- `ownerPositionId` **не проставляется автоматически на создателя** — лид стартует `unassigned` (`null`),
  тот же старт, что и лид с сайта. `LeadDocument.ownerPositionId` докстринг фиксирует это как owner decision:
  "Изначально null... назначается explicit командой assignLead, НЕ auto-assignment по умолчанию" (master plan:
  "Новый лид назначается РОПом, Директором или Собственником"). Назначение — отдельный вызов
  `POST /leads/{leadId}/assign`, та же дисциплина для обоих источников лида (сайт и ручной ввод).
- `source: { route: 'manual' }` — отличает вручную заведённые лиды от `/developments/:slug`/`/listings/:slug`
  (reveal-flow) в аналитике/фильтрах, использующих `source.route`.
- `LeadEvent` (`stage: 'new'`, `changedBy: {type:'position', positionId: actorPositionId}`) и
  `audit_events` (`action: 'lead.create'`, `actor: {type:'identity', ...}`) пишутся в той же транзакции —
  тот же паттерн, что `createLeadForReveal` (там `changedBy`/`actor` — `system`, здесь конкретный сотрудник).
- Idempotency-Key НЕ требуется — `lead.create` не входит в ADR-006 critical-command список
  (`publish`/`book`/`cancel`/`manual-ledger`), тот же паттерн, что уже принят для `createDeal`.

## Verification

- API unit: `crm.service.spec.ts` (`CrmService.createLead`, 5 тестов), `lead.controller.spec.ts`
  (`LeadController.createLead`, 2 теста).
- Mongo replica-set integration: `lead-management.integration-spec.ts` (`createLead` describe, 4 теста —
  find-by-phone reuse, create-new-contact, cross-org contactId non-disclosure, missing-both-fields
  validation).
- OpenAPI (`POST /leads`, `LeadListItem` response schema) и `packages/api-client/src/schema.ts`
  синхронизированы (`check-stale` проходит).
