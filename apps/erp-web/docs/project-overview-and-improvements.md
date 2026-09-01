# BZ26 ERP Client — project overview & improvement plan

A snapshot of what this project is, what is real vs mocked, and the most valuable
improvements — based on a codebase audit (June 2026).

---

## 1. What we are building

**`bz26-client-erp`** is the web ERP for the **baza.sale** real-estate platform —
a single SPA serving several roles (realtor/agency, developer, owner) with
role-gated workspaces under `/dashboard`.

### Functional modules

| Area | What it does | Key code |
|---|---|---|
| **New buildings (новостройки)** | Catalog of ЖК, complex cards, promotions, partners, commissions | `src/pages/modules/NewBuildingsListPage.tsx`, `src/components/newbuild/` |
| **Chessboard (шахматка)** | Interactive unit grid per building: statuses, filters, mass edit, Excel import/export, plan views | `src/pages/inventory/InteractiveChessboard.tsx`, `src/components/inventory/` |
| **Floor plans & layouts** | Upload floor images, draw clickable apartment polygons, layout library | `FloorPlanEditor.tsx`, see `docs/creating-floorplans-and-apartment-plans.md` |
| **Bookings (бронирование)** | Realtor booking requests (72h hold), developer confirm/reject/paid panel | `BookingRequestModal.tsx`, `BookingsPanel.tsx`, `docs/booking-apartments-how-works-on-api.md` |
| **Developer sales management** | Bookings, registrations, broadcasts, promotion paid services, installments | `src/components/development/sales/`, `src/pages/development/` |
| **CRM** | Leads, deals (kanban), clients, tasks, calendar, analytics, MLM partner network | `src/features/crm/`, `src/components/deals/`, `src/components/leads/` |
| **Secondary objects (вторичка)** | Agency's own listing base, object cards, reports | `src/components/objects/` |
| **Selections (подборки)** | Curated unit selections shared with clients (`/s/:token` public page) | `src/components/selections/`, `useDevSelectionsStore` |
| **Chats / messenger** | Real-time chat via Socket.IO against `api-msngrs.baza.sale` | `src/pages/modules/ChatsPage.tsx`, `src/services/messenger*` |
| **Community / forum** | Threads, sections, exchange board | `src/components/community/` |
| **Team / personnel / finance / LMS / reports** | Org structure, KPI, access, finance panels, learning, report registry | `src/components/team/`, `finance/`, `lms/`, `reports/` |

### Tech stack

- **React 19 + TypeScript 5.9 + Vite 7**, Tailwind CSS 4 + Radix UI (shadcn-style `src/components/ui/`), lucide icons
- **State:** Zustand stores (`useCoreStore` — projects/buildings/units, plus selections, installments, property, agency stores) + React contexts (`AuthContext`, …)
- **HTTP:** axios services in `src/services/` (`developmentApi`, `messengerApi`, `lmsApi`) with JWT Bearer from `localStorage`
- **Backends:** `api-crm.baza.sale` (CRM/development), `api-msngrs.baza.sale` (chats), `api.baza.sale` (public) — see `src/config/backend.ts`
- **Tests:** Playwright e2e only (4 specs in `tests/e2e/`)

### Scale

- ~**604** TS/TSX files, ~**173k** lines in `src/`
- Largest files: `CalendarViewModal.tsx` (5.6k lines), `LeadViewModal.tsx` (3.9k), `TaskViewModal.tsx` (3.3k), `ChatsPage.tsx` (3.3k)

### What is real API vs mocked today

| Integrated with real API | Still mock / localStorage |
|---|---|
| Complexes, chessboard, units (CRUD, Excel upload) | CRM leads/deals/clients/tasks/calendar (`src/data/*-mock.ts`, 20 mock files) |
| Floor plans, apartment plans, floormaps, layouts | Installments, broadcasts, promo requests (`developer.sales.*` localStorage keys) |
| Promotions (paid services) | Selections, secondary objects, partners, team KPI, finance, community |
| **Bookings** (just migrated; localStorage kept as offline fallback) | Personnel, LMS progress (partially), info/news |
| Messenger (REST + Socket.IO), LMS catalog | |

---

## 2. What we can improve

Ordered roughly by value/effort.

### 2.1 High priority

1. **Finish API migration of localStorage features.** Bookings now talk to the API,
   but installments, broadcasts, promo-requests, registrations and the CRM core still
   live in `localStorage`/mocks. Each of these silently loses data across devices and
   users. Follow the booking pattern: doc the contract → service methods → swap the
   storage layer, keeping the local fallback behind one flag.

2. **Split the giant components.** Files over ~1.5k lines (`CalendarViewModal` 5.6k,
   `LeadViewModal` 3.9k, `TaskViewModal` 3.3k, `LeadsBlock` 3.2k, `ChatsPage` 3.3k,
   `BuildingChessboardWizard` 1.9k) mix data, popups and layout in one place — hard to
   review and a frequent merge-conflict hotspot. Extract sub-panels/hooks per feature.

3. **Adopt a server-state library (TanStack Query).** Data fetching is hand-rolled:
   axios + `useEffect` + Zustand, with no caching, deduplication, retries or
   invalidation. The chessboard refetches everything after each edit
   (`fetchUnits`/`fetchBuildings`), and bookings/chessboard highlights have no
   automatic refresh. Query would remove most of this plumbing and give stale-while-
   revalidate for free.

4. **Stop masking API failures with silent mock fallbacks.** Several store paths
   (`fetchBuildings` → `BUILDINGS_MOCK`, `getBuildings` → `{ success: true, data: [] }`
   on *any* error) turn an outage into "empty but fine" UI. Surface a visible error
   state (toast/banner) and only fall back to demo data in an explicit demo mode.

### 2.2 Medium priority

5. **Remove debug logging from production paths.** ~140 `console.log` matches across
   the app, including hot paths (`useCoreStore.fetchBuildings` logs every floor/unit,
   `UnitDetailModal` logs on each render effect). Replace with a tiny `debug()` util
   gated on `import.meta.env.DEV`, or delete.

6. **Delete dead/duplicated code.**
   - `crm-origin/` (3.5 MB) is a legacy copy of the CRM kept inside the repo;
   - `src/components/analytics-network/` vs `src/features/crm/components/analytics-network/`
     are near-duplicates;
   - duplicated `LeadStageChecklist.tsx` in both trees.
   Pick the canonical location (`src/features/crm/`) and remove the rest.

7. **Tighten types in the API layer.** `getChessboard`/`getLayouts` return
   `ApiResponse<any>`; `features/crm/services/api/leads.ts` alone has 43 `any` hits.
   The chessboard mapping in `useCoreStore` casts through `any` for every unit.
   Define DTOs once (as done for `Booking`) and remove the casts — most runtime
   mapping bugs in this repo (status mapping, plan URLs) would have been caught.

8. **Add tests around the money paths.** Only 4 Playwright specs exist; there are no
   unit tests at all. Highest-value additions: status mapping (API ↔ UI for units and
   bookings), chessboard skeleton building (`buildingSkeletons`), price computation
   (`computeUnitTotalPrice`), Excel import parsing, and a booking happy-path e2e.

9. **Route-level code splitting.** `src/main.tsx` declares ~250 routes with 117 static
   imports and only 3 `lazy()` calls, and the bundle includes heavy deps
   (`three`, `react-globe.gl`, `maplibre-gl`, `recharts`, `xlsx`). Lazy-load each
   workspace (`development`, `crm`, `community`, `lms`, owner) so the first paint of
   `/dashboard` doesn't pay for all of them.

### 2.3 Nice to have

10. **Real-time updates for bookings/chessboard.** The booking countdown and unit
    statuses only refresh on reload. Socket.IO infra already exists for chats — emit
    `booking.updated` / `unit.updated` events (backend §8 of the booking doc) or fall
    back to a 60s poll on the bookings screens.

11. **Consistent styling approach.** Components mix Tailwind classes with large inline
    `style={{...}}` objects (e.g. `BookingRequestModal`) and hard-coded hex colors of
    the same palette (`#c9a84c`, `#fcecc8`, `#10261c` appear hundreds of times).
    Promote the palette to CSS variables/Tailwind tokens (some `--hub-*`/`--theme-*`
    vars already exist — finish the migration).

12. **Auth hardening.** JWT lives in `localStorage` and every service reads it
    directly. Centralize in one auth client, handle 401 refresh/logout in a shared
    axios interceptor, and consider httpOnly cookies if/when the backend supports it.

13. **Single source for role-based UI.** `readOnly = currentUser?.role !== 'developer'`
    style checks are scattered per page; backend roles are not yet enforced for booking
    status changes (doc §8). Add a small `usePermissions()` helper so client UI and
    future backend enforcement stay in sync.

14. **Repo hygiene.** Add a `README.md` (setup, `.env` keys from `src/config/backend.ts`,
    scripts), a `typecheck` npm script (`tsc -b --noEmit`), and CI running
    lint + typecheck + Playwright smoke. Move loose root docs (`api-zapros.md`) into
    `docs/`.

---

## 3. Suggested order of attack

1. Quick wins (≈ a day): strip `console.log`s, delete `crm-origin/` + duplicated
   analytics folder, add `typecheck` script + README.
2. Bookings follow-through: polling/socket refresh + e2e test for the booking flow.
3. Introduce TanStack Query in one module (chessboard) as the pattern, then migrate
   the rest screen by screen.
4. API-ify the next localStorage feature (installments are already returned by the
   chessboard endpoint — closest to done).
5. Break up the top-5 largest components as they get touched (no big-bang refactor).
