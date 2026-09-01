# Developer Analytics Implementation Plan

## Goal

Build a frontend-only, role-aware developer dashboard and drill-down report using typed mock data. Leadership sees the whole developer portfolio; managers see only their own operational results. Keep the existing backend clients unchanged.

## Non-Goals

- No backend endpoints, API contracts, migrations, or dependency changes.
- No replacement of the global routing or authentication architecture.
- No fabricated claim that mock metrics are production analytics.

## Current System Notes

- The developer workspace already has six bento widgets, but each widget owns hard-coded data.
- `/dashboard/crm/analytics` is the active analytics entry route.
- Manager CRM analytics already redirects to a personal report, but developer account type needs its own report surface.
- The app supports `ru`, `en`, `ka`, `es`, and `tr` dictionaries.

## Tasks

- [ ] Step 1: Add typed developer analytics mock domain and selectors
  - Files: `src/types/developer-analytics.ts`, `src/lib/mock/developer-analytics.ts`, `tests/unit/developer-analytics.test.ts`
  - Change: model projects, inventory, bookings, funnel, sales plan, managers, partners, marketing, periods, and role-scoped selectors.
  - Tests: prove leadership aggregation, manager-only scoping, project filtering, and derived KPI totals.
  - Depends on: none

- [ ] Step 2: Build the developer overview and drill-down report
  - Files: `src/components/analytics-developer/DeveloperAnalyticsPage.tsx`, supporting components in the same folder, `src/features/crm/pages/crm/AnalyticsDashboard.tsx`
  - Change: render developer analytics for `accountType === 'developer'`; provide clickable KPI/panels and report tabs for sales, inventory, bookings, partners, and marketing.
  - Tests: focused render/selector checks where practical, then browser verification.
  - Depends on: Step 1

- [ ] Step 3: Connect the existing developer bento widgets to the shared mock source
  - Files: `src/components/dashboard/ScreenTwo.tsx`, `src/components/dashboard/widgets/WidgetDev*.tsx`, `src/config/widgets-config.ts`
  - Change: remove per-widget hard-coded arrays, apply role scope, add report links, and use only approved visual tokens/status colors.
  - Tests: build plus desktop layout inspection.
  - Depends on: Step 1

- [ ] Step 4: Remove obsolete referral presentation from standard management analytics
  - Files: `src/features/crm/pages/crm/AnalyticsDashboard.tsx`, `src/components/reports/TeamReportPage.tsx` where still reachable
  - Change: standard director/ROP/team views present manager performance rather than referral terminology; referral analytics remains confined to dedicated network/curator surfaces.
  - Tests: existing analytics tests and build.
  - Depends on: Step 2

- [ ] Step 5: Localize all new UI
  - Files: `src/i18n/dictionaries/{ru,en,ka,es,tr}.ts`, i18n tests
  - Change: add complete developer analytics copy in all five languages; avoid new runtime-only Russian strings.
  - Tests: `npm run test:unit -- tests/unit/i18n-dictionaries.test.ts` and dictionary parity checks.
  - Depends on: Steps 2-4

- [ ] Step 6: Verify behavior and visual quality
  - Files: tests/screenshots only if needed
  - Change: no production behavior; validate role scope, drill-down, responsive containment, console errors, build, and focused tests.
  - Tests: `npm run test:unit`, `npm run build`, Browser/Playwright checks at `/dashboard/crm/analytics` for developer leadership and manager scope.
  - Depends on: Steps 1-5

## Verification

- Unit tests prove manager data never contains another manager's records.
- TypeScript/Vite build completes successfully.
- Developer analytics renders at the existing analytics route.
- Every overview card opens the matching detail section.
- Desktop and reduced-width layouts have no horizontal overflow inside the report surface.
- New copy exists in all five dictionaries.

## Risks

- Current authentication uses `developer` as a legacy role for the demo account; the UI must also support future `accountType: developer` users with normal organization roles.
- Existing global app shell enforces a 1280px minimum width, so report responsiveness can be improved internally but true mobile behavior remains constrained by the shell.
- Mock data must remain centralized to avoid divergence between the bento dashboard and detailed report.
