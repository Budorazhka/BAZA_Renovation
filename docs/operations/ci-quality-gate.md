# CI Fast Quality Gate

**Workflow File**: `.github/workflows/quality-gate.yml`
**Execution Environment**: `ubuntu-latest` (Node 22, pnpm 11.23.0)
**Target Duration**: ~2–3 minutes (Timeout: 15 minutes)

---

## 1. Overview & Purpose

The **Fast Quality Gate** (`quality-gate.yml`) provides immediate, deterministic feedback on code correctness, contract integrity, and build stability on every Pull Request and branch push.

### Separation of CI Concerns

BAZA maintains three tiered CI gates:

1. **Fast Quality Gate (`quality-gate.yml`)**:
   - Pure workspace verification (TypeScript typecheck, unit tests, production build, OpenAPI contract drift checks, Git whitespace validation).
   - Zero container or database dependencies.
   - Fast feedback loop (~2 minutes) to unblock code reviews immediately.

2. **Integration Gate (`integration-gate.yml`)**:
   - Full HTTP and cross-module integration tests (`pnpm test:integration`).
   - Runs against in-memory MongoDB ReplicaSet (`mongodb-memory-server`) with multi-document transactions.
   - Fast execution (~2 minutes) without Docker or external network dependencies.

3. **Runtime Release Gate (`runtime-release-gate.yml`)**:
   - Heavy release gate deploying Docker Compose (`compose.runtime.yml`), standalone services (API, Worker, Nginx web SPAs), Redis, MinIO, and MongoDB ReplicaSet.
   - Executes the full 45-minute Playwright end-to-end browser test suite (`apps/e2e-runtime`).

---

## 2. Trigger Rules & Concurrency

### Triggers
- **`pull_request`**: Executes on any PR opened or updated against any branch.
- **`push`**: Executes on pushes to `main` and `codex/integration`.
- **`workflow_dispatch`**: Allows manual on-demand triggering via GitHub Actions UI / CLI.

### Concurrency Policy
```yaml
concurrency:
  group: quality-gate-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```
If a developer pushes multiple commits in rapid succession to the same PR or branch, pending and in-progress runs are immediately cancelled in favor of the newest commit, saving CI runner minutes.

---

## 3. Dependency & Environment Setup Architecture

### Strict Setup Order Requirement

```yaml
- name: Set up pnpm
  uses: pnpm/action-setup@v4
  with:
    version: 11.23.0

- name: Set up Node.js
  uses: actions/setup-node@v4
  with:
    node-version: 22
    cache: pnpm
    cache-dependency-path: pnpm-lock.yaml
```

> [!IMPORTANT]
> `pnpm/action-setup@v4` **must always precede** `actions/setup-node@v4`.
> When `setup-node` is configured with `cache: pnpm`, it requires the `pnpm` binary to already be present in `PATH` to resolve the global store path (`pnpm store path`). Invoking `setup-node` before `action-setup` causes an immediate runner error: `Unable to find package manager binary: pnpm`.

### Pinned Versions
- **pnpm**: `11.23.0` (matching root `package.json` packageManager field).
- **Node.js**: `22.x` (LTS baseline for BAZA runtime).

---

## 4. Pipeline Stages & Verification Commands

The quality gate executes the following sequence of commands in order:

| Step | Command | Purpose |
|------|---------|---------|
| 1. Install | `pnpm install --frozen-lockfile` | Restores workspace dependencies strictly matching `pnpm-lock.yaml`. Fails if lockfile is out of date. |
| 2. Typecheck | `pnpm typecheck` | Runs Turbo typecheck across all 17 workspace packages and apps (`tsc --noEmit` / `tsc -b`). |
| 3. Unit Tests | `pnpm test` | Runs Jest unit tests across backend services and frontend packages. |
| 4. Build | `pnpm build` | Compiles backend NestJS modules, shared packages, and builds Vite frontend bundles (`admin-web`, `marketplace-web`). |
| 5. OpenAPI Sync Check | `node packages/api-client/scripts/check-stale.mjs` | Regenerates TypeScript client types from `docs/api/v1-first-vertical-slice.yaml` and asserts zero drift with `packages/api-client/src/schema.ts`. |
| 6. Contract Layout Check | `node packages/api-client/scripts/verify-contract-layout.mjs` | Validates OpenAPI schema paths, required endpoints, and checks for prohibited absolute paths or directory traversal patterns. |
| 7. Git Whitespace Check | `git diff --check` | Detects trailing whitespace, carriage return artifacts, and unresolved merge conflict markers. |

---

## 5. Local Reproduction

Before pushing changes to GitHub or opening a PR, developers can run the exact quality gate sequence locally:

```bash
# 1. Verify dependencies and lockfile
pnpm install --frozen-lockfile

# 2. Run TypeScript checks
pnpm typecheck

# 3. Run unit tests
pnpm test

# 4. Build all packages and apps
pnpm build

# 5. Verify OpenAPI client synchronization
node packages/api-client/scripts/check-stale.mjs

# 6. Verify OpenAPI schema and contract layout
node packages/api-client/scripts/verify-contract-layout.mjs

# 7. Check for whitespace and git issues
git diff --check
```

### Cross-platform generated SDK check

The `@baza/api-client` stale-output check compares generated
`packages/api-client/src/schema.ts` with the committed file after normalising
CRLF/CR to LF. This keeps the contract gate strict on content while avoiding a
false failure when Git materialises the same generated source with Windows line
endings (`core.autocrlf`). A direct Node test for the normalisation helper runs
before the OpenAPI layout and stale checks.
