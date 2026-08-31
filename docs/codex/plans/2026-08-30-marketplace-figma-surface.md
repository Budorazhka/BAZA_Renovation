# Marketplace Figma Surface Plan

## Goal

Bring the implemented marketplace presentation layer into a coherent, responsive
Figma-aligned surface for the approved catalogue, detail, map, and publishing
wizard flows, while preserving the existing real API behavior and security
boundaries.

## Progress (2026-08-30)

- Route/DOM inventory completed against the local Figma handoff and current
  marketplace tests.
- Home surface aligned to the selected `Home page` composition: hero/search is
  a dedicated section and the two real BAZA promos form a separate responsive
  two-column section on desktop, stacking on mobile.
- Catalogue/list/map, detail/reveal-contact, and publishing wizard surfaces were
  reviewed against the approved references and kept on their existing real
  stateful implementations; no speculative Figma-only screens were added.
- `PRODUCT.md` and `DESIGN.md` now capture the approved product scope, tokens,
  responsive rules and accessibility constraints for the remaining parity work.

## Non-Goals

- No backend, OpenAPI, worker, persistence, or authorization changes.
- No new product flows from Figma that are outside the approved marketplace
  scope (CRM, realtor ratings, requests, or unused full-page frames).
- No fake listing data, mock authentication, or visual-only replacement of real
  loading/error/empty states.

## Current System Notes

- The integration branch already contains the home Figma pass, marketplace
  functional hardening, and resumable media retry.
- Exact local Figma references and tokens are recorded in
  `docs/discovery/figma-local-handoff.md`.
- Catalogue, map, listing detail, contact reveal, and publishing wizard are real
  React flows consuming existing hooks/API clients.

## Tasks

- [x] Step 1: Audit the current routes and visual primitives
  - Files: `apps/marketplace-web/src/App.tsx`, `src/components/**`,
    `src/features/publishing/**`, `src/styles/**`.
  - Change: Identify the existing DOM contracts and preserve selectors/ARIA
    semantics used by tests while grouping shared visual primitives.
  - Tests: existing marketplace test suite remains green.
  - Depends on: none.

- [x] Step 2: Align catalogue/list/map presentation
  - Files: `src/App.tsx`, `src/components/MarketplaceMap.tsx`,
    `src/styles/app.css`, `src/styles/tokens.css`.
  - Change: Implement the approved Figma catalogue hierarchy: compact header,
    filter/sort toolbar, responsive card grid, map/list split behavior, stable
    empty/loading/error panels, and mobile controls. Keep bbox/query behavior,
    cursor pagination, and real state transitions unchanged.
  - Tests: add or update DOM tests for filters, map toggle, loading/error/empty,
    and 320/375/414px layout assumptions where useful.
  - Depends on: Step 1.

- [x] Step 3: Align listing/development cards and detail surfaces
  - Files: `src/App.tsx`, `src/components/ListingMediaGallery.tsx`,
    `src/components/ListingContactForm.tsx`, `src/styles/app.css`.
  - Change: Match the selected Figma card/detail proportions, typography,
    media gallery, metadata chips, CTA hierarchy, and contact-reveal states.
    Preserve the public-field whitelist and do not expose phone/internal data
    before a successful reveal response.
  - Tests: existing gallery/reveal/SEO tests plus focused responsive DOM checks.
  - Depends on: Step 2.

- [x] Step 4: Align publishing wizard shell and states
  - Files: `src/features/publishing/components/PublishingWizard.tsx`,
    `src/features/publishing/components/steps/**`,
    `src/features/publishing/styles/publishing.css`.
  - Change: Apply the approved desktop/mobile wizard hierarchy, progress rail,
    form spacing, media cards, review, failure, and published states without
    changing reducer/API behavior or logout/PII protections.
  - Tests: existing publishing auth/flow/reducer tests plus focused mobile
    semantics checks.
  - Depends on: Step 1.

- [x] Step 5: Browser visual QA and regression pass
  - Files: tests/docs only as needed.
  - Change: Run the built app in a local static/dev server and inspect desktop
    and mobile routes. Capture screenshots and record any infrastructure-only
    limitations. Fix only verified layout/overflow/accessibility regressions.
  - Tests: `pnpm --filter @baza/marketplace-web test --run`, typecheck, build,
    and browser smoke at 1440px and 375px.
  - Depends on: Steps 2–4.

- [x] Step 6: Verify and commit
  - Change: Run the full repository checks, inspect the diff for accidental API
    or backend changes, and create one focused local commit. Do not push.
  - Depends on: Step 5.

## Verification

- `pnpm --filter @baza/marketplace-web test --run`
- `pnpm typecheck`
- `pnpm build`
- `git diff --check`
- Browser smoke with screenshots at desktop and mobile widths.

## Risks

- The local Figma file contains multiple versions; only the exact refs in the
  handoff document are in scope.
- The API may be unavailable during browser smoke, so API error states must be
  distinguished from layout failures.
- Existing tests rely on accessible labels and route behavior; CSS/DOM changes
  must not weaken those contracts.
