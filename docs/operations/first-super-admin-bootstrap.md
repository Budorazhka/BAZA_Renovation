# First Super Admin Bootstrap Runbook

**File**: `scripts/ops/bootstrap-super-admin.mjs`  
**Target Collection**: `identities`, `admin_accounts`, `product_accesses`, `audit_events`  
**Security Level**: High (Zero-to-One Platform Initialization)

---

## 1. When This Scenario Is Permitted

The bootstrap script `scripts/ops/bootstrap-super-admin.mjs` is designed **strictly for initial platform deployment** (zero-to-one setup) when no administrators exist in the database.

### Permitted Use Cases:
- **Initial cluster initialization**: After spinning up MongoDB and deploying the backend services for the first time.
- **Disaster recovery environment re-creation**: When initializing a clean, restored database instance from scratch.
- **Local development & CI/CD environments**: Setting up fresh test environments with an initial administrator.

### Strictly Prohibited Use Cases:
- **Day-2 operations**: Creating secondary admin accounts (these must be created via `POST /admin/accounts` by an existing `super_admin` in `apps/admin-web`).
- **Password reset**: Resetting a forgotten password for an existing administrator.
- **Modifying permissions**: Elevating a standard admin account to `super_admin`.

---

## 2. Why This Is NOT an HTTP Endpoint

Bootstrap functionality is intentionally implemented as an **out-of-band operations CLI script** rather than a public or private HTTP endpoint.

1. **Privilege Escalation Surface Reduction**: An HTTP endpoint (even if hidden or protected by a temporary secret) represents a permanent attack vector susceptible to brute-force attacks, timing attacks, misconfigured reverse proxy routes, or leaked token headers.
2. **Zero Blast Radius for Public API**: No HTTP route exists in `apps/api` for super admin bootstrap, guaranteeing that zero vulnerabilities can be exploited externally over the network.
3. **Cluster Access Prerequisite**: The script requires direct access to the MongoDB network/cluster (`MONGO_URI`) and host execution permissions (`kubectl exec`, Docker container execution, or privileged CI runner), enforcing organizational role separation.

---

## 3. Required Environment Variables and Arguments

| Parameter | Environment Variable | CLI Argument | Required | Description |
|-----------|----------------------|--------------|----------|-------------|
| MongoDB Connection URI | `MONGO_URI` | `--mongo-uri <URI>` | **Yes** | Standard MongoDB connection string with replica set support. |
| Super Admin Login | `BOOTSTRAP_SUPER_ADMIN_LOGIN` | `--login <LOGIN>`, `-l` | **Yes** | Login / email for the super admin (normalized to lowercase). |
| Super Admin Password | `BOOTSTRAP_SUPER_ADMIN_PASSWORD` | `--password <PWD>`, `-p`, or `--password-stdin` | **Yes** | Master password (minimum 8 characters). |

---

## 4. Execution Examples

### 4.1 Local Development Environment

```bash
# Set environment variables and execute script
MONGO_URI="mongodb://127.0.0.1:27017/baza_dev?replicaSet=rs0" \
BOOTSTRAP_SUPER_ADMIN_LOGIN="admin@baza.local" \
BOOTSTRAP_SUPER_ADMIN_PASSWORD="super-secret-master-password-123" \
node scripts/ops/bootstrap-super-admin.mjs
```

### 4.2 Production / Kubernetes Environment

In production, avoid putting plaintext passwords into shell history or process arguments. Pass the password via `stdin` or a mounted Kubernetes Secret:

```bash
# Example 1: Piping password via stdin (recommended in CI/CD pipelines)
echo -n "${PROD_SUPERADMIN_PASSWORD}" | node scripts/ops/bootstrap-super-admin.mjs \
  --mongo-uri "${PROD_MONGO_URI}" \
  --login "admin@baza.io" \
  --password-stdin

# Example 2: One-off Kubernetes Job / Pod execution
kubectl exec -i deploy/api-deployment -n baza-prod -- \
  node scripts/ops/bootstrap-super-admin.mjs \
    --login "admin@baza.io" \
    --password-stdin < /var/run/secrets/bootstrap/password.txt
```

### 4.3 Interactive TTY Execution

If the script is executed in an interactive terminal without `--password` or `--password-stdin`, it prompts the operator for a hidden password input (without echoing characters to the terminal):

```bash
MONGO_URI="mongodb://127.0.0.1:27017/baza" node scripts/ops/bootstrap-super-admin.mjs --login "admin@baza.io"
# Output: Enter super_admin password (min 8 chars): [hidden input]
```

---

## 5. Password & Secret Management Rules

1. **Anti-Leakage Guarantee**:
   - The script never writes raw passwords, password hashes (`$argon2id$...`), session tokens, or raw database connection credentials to `stdout` or `stderr`.
   - In case of MongoDB connection errors, connection URIs are automatically redacted (`mongodb://***:***@host:port/db`).
2. **Hashing Algorithm**:
   - Utilizes `argon2` with the default Argon2id configuration, guaranteeing 100% binary compatibility with `AuthService.registerIdentity` and `AuthService.verifyCredentials`.
3. **No Shell History Footprint**:
   - Always prefer `--password-stdin` or environment variables over `--password <value>` in shared bastion hosts to prevent password logging in `.bash_history` or `/proc/$PID/cmdline`.

---

## 6. Atomic Transaction & Safety Invariants

The bootstrap executes within a single **MongoDB multi-document transaction** (`session.withTransaction`):

1. **Pre-flight Check 1 (Active Super Admin Invariant)**:
   - Queries `admin_accounts` for `{ isSuperAdmin: true, status: 'active' }`.
   - If an active `super_admin` already exists, the transaction immediately aborts with error `ACTIVE_SUPER_ADMIN_EXISTS` without making any changes.
2. **Pre-flight Check 2 (Login Uniqueness Invariant)**:
   - Queries `identities` for `{ normalizedLogin }`.
   - If an identity with the requested login already exists, the transaction aborts with `LOGIN_ALREADY_EXISTS`.
3. **Atomic Multi-Collection Insertions**:
   - **`identities`**: Creates active identity record with Argon2id password hash.
   - **`admin_accounts`**: Creates active admin account with `isSuperAdmin: true`.
   - **`product_accesses`**: Grants active access for product `admin`.
   - **`audit_events`**: Records an append-only audit event with `action: 'admin_account.bootstrap_first_super_admin'`.
4. **All-or-Nothing Rollback**:
   - Any unhandled exception, network glitch, or constraint violation rolls back the entire session. No partial writes (e.g. identity without admin account or product access) are ever left in the database.
5. **No Force/Bypass Options**:
   - The script does not accept `--force` or any override flags. Passing `--force` triggers an immediate `FLAG_FORBIDDEN` rejection.

---

## 7. Verifying the Bootstrap

After running the bootstrap script, verify the newly created super admin through the live API:

### Step 1: Login via `POST /auth/login` (Admin Audience)

```bash
curl -i -X POST "http://localhost:3000/auth/login" \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:4174" \
  -d '{
    "login": "admin@baza.io",
    "password": "super-secret-master-password-123"
  }'
```

**Expected Response**:
```http
HTTP/1.1 200 OK
Set-Cookie: baza_session=...; Path=/; HttpOnly; SameSite=Lax
Content-Type: application/json

{"identityId":"...","requires2fa":false}
```

### Step 2: Whoami Check via `GET /admin/me`

Using the session cookie returned from Step 1:

```bash
curl -i -X GET "http://localhost:3000/admin/me" \
  -H "Cookie: baza_session=<SESSION_COOKIE_VALUE>"
```

**Expected Response**:
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "adminAccountId": "...",
  "isSuperAdmin": true,
  "publicationReadScope": "all"
}
```

---

## 8. Rollback & Incident Procedures

If an operational error occurs during deployment or the wrong super admin credentials were submitted:

1. **If bootstrap failed mid-execution**:
   - The transaction has already rolled back automatically. No residual documents exist. Check error logs and retry with corrected parameters.
2. **If wrong credentials were provisioned before cluster release**:
   - If the cluster has not yet handled production traffic, the database administrator can deactivate or remove the test documents inside a maintenance window.
3. **If a secondary super admin needs to be created**:
   - Log into `apps/admin-web` with the first `super_admin` and navigate to `/accounts` to create secondary accounts. **Do not attempt to re-run the bootstrap script.**

---

## 9. Re-run Prohibition

Once an active `super_admin` exists in MongoDB, **all subsequent runs of `bootstrap-super-admin.mjs` will fail with exit code 1**:

```
[bootstrap] FAIL: An active super_admin already exists in the system. Bootstrap is strictly one-time and cannot be re-run.
```

This strict invariant guarantees that the bootstrap tool cannot be misused to hijack or reconfigure existing platform administrative controls.
