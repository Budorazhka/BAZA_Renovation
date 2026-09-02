# Investigation: "Why can a user see leads that aren't theirs?"

A step-by-step playbook to find the **real** cause of the lead-visibility problem in `/crm/leads`, before changing any code.

**Related:** [`docs/api-crm-leads.md`](./api-crm-leads.md)

> **Goal:** Prove *where* the access control breaks — frontend, the `userId`/`userRole` query params, or the backend's JWT handling. Don't guess; collect evidence first.

---

## TL;DR — the one question that matters

Authorization is currently driven by client-supplied `userId` / `userRole` query params (read from `localStorage.user_data`). The whole investigation boils down to **one question:**

> Does the backend trust the `userId` / `userRole` query params, or does it re-derive identity and role from the verified JWT?

Every step below is designed to answer that.

---

## Phase 0 — Prep (5 min)

1. Pick a **low-privilege test account** (role `agent`) that owns a small, known set of leads. Write down:
   - its `userId` (Mongo ObjectId)
   - the `_id` of **its own** lead (call it `OWN_LEAD_ID`)
   - the `_id` of a lead owned by **someone else** (call it `OTHER_LEAD_ID`)
2. Have a second account (e.g. a manager) ready for comparison.
3. Open the app, log in as the agent, open **DevTools → Network** and **Console**.

---

## Phase 1 — Observe what the frontend actually sends

We need to see the exact request the browser makes (params + headers).

### 1.1 Inspect the outgoing request

1. DevTools → **Network** tab → filter by `leads`.
2. Trigger a leads load (open the CRM funnel).
3. Click the `GET /crm/leads?...` request and check:
   - **Query String Parameters** — is `userId` present? `userRole`? what values?
   - **Request Headers** → `Authorization: Bearer <jwt>` — is it present?

Record the answer:

| Question | Yes/No | Value observed |
|----------|--------|----------------|
| `userId` sent? | | |
| `userRole` sent? | | |
| `Authorization` header sent? | | |

### 1.2 See what the client thinks the user is

In the **Console**:

```js
// What identity the frontend will attach as query params:
JSON.parse(localStorage.getItem('user_data'))

// The raw token (decode payload only — do NOT paste anywhere public):
JSON.parse(atob(localStorage.getItem('jwt_token').split('.')[1]))
```

Compare the two:

- Does `user_data.id` match the JWT's `sub` / `userId` claim?
- Does `user_data.role` match the JWT's `role` claim?
- **If they can differ, that's the exploit surface.** The query param is the weak link; the JWT is the trustworthy one.

### 1.3 Check for a build-time override

If `userId`/`userRole` look "stuck" regardless of who logs in, an env override may be baked into the bundle:

```js
// In Console — these are inlined at build time by Vite:
import.meta.env.VITE_USER_ID
import.meta.env.VITE_USER_ROLE
```

(Or grep the deployed bundle for `VITE_USER_ID`.) If set, the app ignores the logged-in user entirely — that alone explains "wrong leads."

---

## Phase 2 — The decisive test: does the backend trust the query params?

This is the key experiment. We send the **same JWT** but **tamper with the query params**, and watch the response.

### 2.1 Capture a clean request as `curl`

In DevTools → Network → right-click the `GET /crm/leads` request → **Copy → Copy as cURL**. Paste it into a terminal. You now have a reproducible request with the real JWT.

### 2.2 Run the tamper matrix

Run each variant with the **same Bearer token** and compare `total` / `items` in the response.

| # | Test | What you change | Expected if backend is SECURE | Indicates a BUG if... |
|---|------|-----------------|-------------------------------|------------------------|
| A | Baseline | nothing | returns only the agent's leads | — |
| B | **Role escalation** | `userRole=agent` → `userRole=admin` | identical to A (param ignored) | returns *more* leads → backend trusts `userRole` |
| C | **Role = developer** | `userRole=developer` | identical to A | more leads → role mapping abused |
| D | **Drop scope params** | remove `userId` & `userRole` entirely | returns only agent's leads (or `403`) | returns *all* leads → default-allow bug |
| E | **Impersonation** | `userId=<other_user_id>` | identical to A | returns the other user's leads → trusts `userId` |
| F | **assignedTo probe** | add `assignedTo=<other_manager_id>` | empty / `403` | returns that manager's leads → filter not authorized |
| G | **Direct read by id** | `GET /crm/leads/OTHER_LEAD_ID` | `403` / `404` | returns the lead → IDOR on single-read |
| H | **Search probe** | `GET /crm/leads?search=<someone_elses_phone>` | empty / only own | returns others' leads → search unscoped |

Example for test B:

```bash
curl -G 'https://api-crm.baza.sale/crm/leads' \
  -H 'Authorization: Bearer <SAME_AGENT_JWT>' \
  --data-urlencode 'page=1' \
  --data-urlencode 'limit=100' \
  --data-urlencode 'userId=<agent_user_id>' \
  --data-urlencode 'userRole=admin'   # <-- the only change
```

Example for test D (no scope params at all):

```bash
curl -G 'https://api-crm.baza.sale/crm/leads' \
  -H 'Authorization: Bearer <SAME_AGENT_JWT>' \
  --data-urlencode 'limit=100'
```

> **Interpretation:** If **any** of B–H returns data the agent shouldn't see, the backend is doing authorization from the **query params (or not at all)** instead of the JWT. That is the root cause.

### 2.3 Confirm the JWT is even validated

Tamper the token to be sure auth is real and not bypassed:

```bash
# Garbage token — must return 401:
curl -G 'https://api-crm.baza.sale/crm/leads' -H 'Authorization: Bearer not-a-real-token' --data-urlencode 'limit=10'

# No token at all — must return 401:
curl -G 'https://api-crm.baza.sale/crm/leads' --data-urlencode 'limit=10'
```

If either returns `200` with data, authentication itself is broken (worse than a scoping bug).

---

## Phase 3 — Backend-side evidence

Front-end tests tell you *what* leaks; backend logs/code tell you *why*.

### 3.1 Logs to add / look for

Add temporary structured logging on the `GET /crm/leads` handler that records, per request:

- `jwt.userId` and `jwt.role` (from the **verified** token)
- `query.userId` and `query.role` (from the request)
- the **Mongo filter** actually executed (e.g. the `{ assignedTo: ... }` / `{ createdBy: ... }` object)
- `result.total`

Then watch the log while running the Phase 2 tests. The smoking gun is one of:

- The Mongo filter is built from `query.userRole` / `query.userId` (trusts client). ❌
- The filter is empty `{}` when params are missing (default-allow). ❌
- `jwt.role !== query.role` but the handler used `query.role`. ❌

The healthy pattern is: filter is built **only** from `jwt.userId` / `jwt.role`, and the query params are logged but never used for access decisions.

### 3.2 Code review checklist (backend repo)

Search the leads controller/service for:

- [ ] `req.query.userRole` / `req.query.userId` used in any **authorization** or **filter** logic (should be: not used for auth).
- [ ] The list query when role is non-privileged — does it always add `{ $or: [{ createdBy }, { assignedTo }] }`?
- [ ] `GET /crm/leads/:id` — is there an ownership/role check, or does it just `findById`?
- [ ] `search` branch — is the ownership filter still applied alongside the text match?
- [ ] `assignedTo` query param — is it validated against the caller's permission to view that manager?
- [ ] Role source — is `role` read from the JWT claims or from the request body/query?
- [ ] Default case — when no role resolves, does it **deny** or **return all**?

---

## Phase 4 — Decision table (mapping evidence → cause)

| Evidence | Root cause | Fix owner |
|----------|------------|-----------|
| Test B/C returns more leads | Backend trusts `userRole` query param | Backend |
| Test D returns all leads | Default-allow when scope missing | Backend |
| Test E returns other user's leads | Backend trusts `userId` query param | Backend |
| Test F returns manager's leads | `assignedTo` filter not authorized | Backend |
| Test G returns the lead | IDOR on `GET /crm/leads/:id` | Backend |
| Test H returns others' leads | Search not scoped | Backend |
| `VITE_USER_ID` set in bundle | Wrong identity baked into frontend | Frontend / deploy config |
| `user_data.role` editable & honored | Frontend treats localStorage as authority | Backend (must use JWT) |
| Garbage token returns 200 | Auth middleware not enforced | Backend (critical) |

In almost every realistic case the conclusion is: **the backend must derive identity + role from the verified JWT and ignore the client-supplied `userId`/`userRole` for authorization.** The frontend params should remain only as non-authoritative hints/telemetry.

---

## Phase 5 — Reproduce & report

When you find the cause, capture:

1. The exact `curl` that leaks data (with token redacted).
2. The response `total` for the legitimate vs. tampered request (e.g. `12` vs `2,431`).
3. The relevant backend log line / code reference.
4. The matching row from the Phase 4 table.

That package is enough to open a precise bug ticket and verify the fix (re-run the Phase 2 matrix; all of B–H must stop leaking).

---

## Appendix — Quick Console snippets

```js
// Simulate role escalation from the app itself (test account only!):
const u = JSON.parse(localStorage.getItem('user_data'));
console.log('before:', u);
u.role = 'admin';
localStorage.setItem('user_data', JSON.stringify(u));
// reload, load leads, compare counts, then restore:
// localStorage.setItem('user_data', JSON.stringify({ ...u, role: 'agent' }));
```

```js
// Decode JWT payload to compare claims vs localStorage:
const [, p] = localStorage.getItem('jwt_token').replace(/^Bearer /, '').split('.');
console.table(JSON.parse(atob(p)));
```

> Only run tampering tests against **staging / a disposable test account**, never a real customer's data.
