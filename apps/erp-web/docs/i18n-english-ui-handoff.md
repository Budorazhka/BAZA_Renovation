# English UI Translation Handoff

## Goal

Add English as a second interface language for the ERP without translating business data.

The application now has a minimal local i18n layer in `src/i18n`. Continue using it. Do not add an external i18n package unless a maintainer explicitly asks for it.

## Existing Pattern

Use:

```tsx
import { useI18n } from '@/i18n'

const { t } = useI18n()

return <button>{t('common.save')}</button>
```

Language is stored in `localStorage` under `erp.language`.

English dictionary keys are type-checked with:

```ts
export const en = { ... } satisfies TranslationSchema<typeof ru>
```

This is intentional. Every key added to `ru` must also be added to `en`.

## Translate Only Visible UI

Translate:

- page titles and section headings;
- buttons and links;
- navigation labels;
- tabs;
- filters and sorting controls;
- input labels and placeholders;
- form helper text;
- validation and error messages;
- empty states;
- tooltips;
- toast messages;
- modal titles and actions;
- table headers.

Do not translate:

- mock records and seeded content;
- client names, manager names, partner names;
- property names, residential complex names, addresses;
- deal, lead, task, comment, note, and history content;
- enum/status values used for logic, filtering, sorting, routing, storage, or API payloads;
- files under `src/data/*` unless the value is clearly a UI label/config, not sample content.

## Rule For Enums And Statuses

Never change the stored value.

Correct:

```tsx
const statusLabel = t(`deals.status.${deal.status}`, deal.status)
```

Wrong:

```ts
deal.status = t(`deals.status.${deal.status}`)
```

The original value must remain available for logic and API calls.

## Suggested Work Order

1. Shell and common controls.
2. CRM shell, classic CRM, poker table.
3. CRM modals: lead view, task view, checklist, client creation, notes.
4. Clients, deals, tasks.
5. Objects, selections, bookings.
6. New buildings, development, inventory.
7. Finance, reports, team, partners.
8. LMS, forum/community, chats.
9. Settings, info/news/reminders.
10. Public pages.

Complete one module at a time. Run `npm run build` after each module.

## How To Find Remaining UI Text

Use:

```powershell
rg -n "[А-Яа-яЁё]" src --glob "*.tsx" --glob "*.ts"
```

Then classify each match:

- UI text: move to `src/i18n/dictionaries/ru.ts` and `en.ts`.
- Data/mock/user content: leave unchanged.
- Comment: leave unchanged unless it is shown in the UI.

Do not run blind search-and-replace.

## Naming Keys

Prefer stable namespaces:

```ts
common.save
common.cancel
nav.crm
shell.notifications
crm.leadCard.title
crm.tasks.create
objects.filters.rooms
settings.profile.title
```

Avoid keys based on the Russian phrase:

```ts
// Bad
t('sozdatZadachu')
```

Use domain and purpose instead:

```ts
// Good
t('tasks.createTask')
```

## Verification For Each Batch

Run:

```powershell
npm run build
```

Then manually check both languages on the touched routes:

- language switch changes text without reload;
- refresh keeps the selected language;
- Russian still renders correctly;
- English does not overflow buttons, tabs, cards, sidebars, or modals;
- filters, sorting, route guards, and saved data still use original internal values.

## Current First Batch

The first batch adds:

- `src/i18n/LanguageProvider.tsx`
- `src/i18n/dictionaries/ru.ts`
- `src/i18n/dictionaries/en.ts`
- `src/i18n/types.ts`
- `src/i18n/index.ts`
- `RU / ENG` switch in `DashboardTopHeader`
- translated app shell labels in the top header, app rail, back button, and access denied page

Continue from these patterns.

## Current Second Batch

The second batch covers the CRM poker table shell:

- `src/components/leads/LeadsPokerPage.tsx`
- `src/components/leads/LeadsCardTableView.tsx`
- `crmPoker.*` dictionary namespace for poker controls, filters, stage labels, stats, transfer confirmation, and access-denied state

Important: the poker stage arrays still keep Russian `name` values as internal fallback/data. Visible stage labels should go through:

```tsx
t(`crmPoker.stages.${selectedProduct}.${stage.id}`, stage.name)
```

Do not mutate stage ids, product ids, lead payloads, or CRM history content. The next practical CRM batch is the lead detail modal and related CRM dialogs.
