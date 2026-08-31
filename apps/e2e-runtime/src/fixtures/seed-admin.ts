/**
 * TEST/E2E FIXTURE ONLY — never run against a real production database.
 *
 * Why this exists (CRITICAL GAP, confirmed by reading AdminAccountService in
 * full): there is NO HTTP path to create the first super_admin AdminAccount.
 * `AdminAccountService.createAdminAccount()` always requires an
 * already-authenticated super_admin `AdminContext` (see
 * apps/api/src/modules/admin/admin-account.service.ts —
 * `this.requireSuperAdmin(requestedBy)` is the very first line). That is
 * correct production behavior (ADR-009: only a super_admin may create admin
 * accounts, no self-bootstrap escalation path) — but it means an
 * environment with zero admin accounts has no HTTP-only way to create its
 * first one, ever. Something has to insert the first row directly.
 *
 * This script connects DIRECTLY to the runtime MongoDB (bypassing the API
 * process entirely, the same way a one-time ops runbook/migration would)
 * and inserts documents that mirror EXACTLY what
 * `AdminAccountService.createAdminAccount` + `AuthService.registerIdentity`
 * + `AuthService.grantAdminAccess` would together have produced, across the
 * three collections involved:
 *
 *   - `identities`      (apps/api/src/modules/identity/schemas/identity.schema.ts)
 *   - `admin_accounts`  (apps/api/src/modules/admin/schemas/admin-account.schema.ts)
 *   - `product_accesses`(apps/api/src/modules/identity/schemas/product-access.schema.ts)
 *
 * Password hashing uses the SAME mechanism as the real Identity schema/
 * AuthService (argon2, library defaults — see AuthService.registerIdentity
 * comment: "argon2id — библиотечный дефолт"), via the same `argon2` package
 * apps/api itself depends on. This means the seeded admin can log in
 * through the REAL, unmodified `POST /auth/login` HTTP endpoint afterward —
 * this script does NOT bypass login, it only bypasses the (nonexistent)
 * HTTP bootstrap path for the very first admin account.
 *
 * Collections are written with a plain `mongoose` connection using ad-hoc
 * schemas mirroring the real ones (not importing apps/api's NestJS modules
 * directly — this package intentionally has no dependency on `@baza/*`
 * app-internal packages, to keep it a standalone, deploy-independent test
 * fixture). Field-for-field shape is kept in sync by hand with the schemas
 * above; if those schemas change, this file must be updated to match.
 */
import mongoose, { Schema, Types, type Model, type Connection } from 'mongoose';
import * as argon2 from 'argon2';

export interface SeededAdmin {
  identityId: string;
  adminAccountId: string;
  login: string;
  password: string;
  isSuperAdmin: boolean;
}

interface E2eIdentityDoc {
  _id: Types.ObjectId;
  normalizedLogin: string;
  passwordHash?: string;
  status: 'active' | 'deactivated' | 'pending_invite';
  twoFactorMethod: 'none' | 'telegram_bot' | 'totp';
  deactivatedAt?: Date;
}

interface E2eAdminAccountDoc {
  _id: Types.ObjectId;
  identityId: Types.ObjectId;
  status: 'active' | 'deactivated';
  isSuperAdmin: boolean;
}

interface E2eProductAccessDoc {
  _id: Types.ObjectId;
  identityId: Types.ObjectId;
  product: 'erp' | 'admin';
  grantedAt: Date;
  revokedAt?: Date;
}

const identitySchema = new Schema<E2eIdentityDoc>(
  {
    normalizedLogin: { type: String, required: true, unique: true },
    passwordHash: { type: String, select: false },
    status: { type: String, required: true, enum: ['active', 'deactivated', 'pending_invite'], default: 'active' },
    twoFactorMethod: { type: String, required: true, enum: ['none', 'telegram_bot', 'totp'], default: 'none' },
    deactivatedAt: Date,
  },
  { collection: 'identities', timestamps: { createdAt: 'createdAt', updatedAt: false } },
);

const adminAccountSchema = new Schema<E2eAdminAccountDoc>(
  {
    identityId: { type: Schema.Types.ObjectId, required: true, unique: true },
    status: { type: String, required: true, enum: ['active', 'deactivated'], default: 'active' },
    isSuperAdmin: { type: Boolean, required: true, default: false },
  },
  { collection: 'admin_accounts', timestamps: { createdAt: 'createdAt', updatedAt: false } },
);

const productAccessSchema = new Schema<E2eProductAccessDoc>(
  {
    identityId: { type: Schema.Types.ObjectId, required: true },
    product: { type: String, required: true, enum: ['erp', 'admin'] },
    grantedAt: { type: Date, required: true, default: () => new Date() },
    revokedAt: Date,
  },
  { collection: 'product_accesses', timestamps: false },
);

function getOrCreateModel<T>(connection: Connection, name: string, schema: Schema<T>): Model<T> {
  return (connection.models[name] as Model<T> | undefined) ?? connection.model<T>(name, schema);
}

function models(connection: Connection) {
  return {
    Identity: getOrCreateModel(connection, 'E2eIdentity', identitySchema),
    AdminAccount: getOrCreateModel(connection, 'E2eAdminAccount', adminAccountSchema),
    ProductAccess: getOrCreateModel(connection, 'E2eProductAccess', productAccessSchema),
  };
}

/**
 * Inserts one admin_account (+ backing identity + product_access grant),
 * mirroring AdminAccountService.createAdminAccount's three-write shape
 * (without its transaction/audit-log side effects, which are HTTP/API
 * concerns not needed for a test fixture — audit trail assertions in the
 * admin specs are made against actions taken THROUGH the real HTTP API
 * after login, never against this seed step itself).
 */
export async function seedAdminAccount(
  mongoUri: string,
  params: { login: string; password: string; isSuperAdmin: boolean },
): Promise<SeededAdmin> {
  const connection = await mongoose.createConnection(mongoUri).asPromise();
  try {
    const { Identity, AdminAccount, ProductAccess } = models(connection);

    const normalizedLogin = params.login.trim().toLowerCase();
    const passwordHash = await argon2.hash(params.password);

    const identity = await Identity.create({
      normalizedLogin,
      passwordHash,
      status: 'active',
      twoFactorMethod: 'none',
    });

    const adminAccount = await AdminAccount.create({
      identityId: identity._id,
      status: 'active',
      isSuperAdmin: params.isSuperAdmin,
    });

    await ProductAccess.create({
      identityId: identity._id,
      product: 'admin',
      grantedAt: new Date(),
    });

    return {
      identityId: identity._id.toString(),
      adminAccountId: adminAccount._id.toString(),
      login: normalizedLogin,
      password: params.password,
      isSuperAdmin: params.isSuperAdmin,
    };
  } finally {
    await connection.close();
  }
}

const isMain = process.argv[1]?.endsWith('seed-admin.ts') || process.argv[1]?.endsWith('seed-admin.js');
if (isMain) {
  const mongoUri = process.env.RUNTIME_MONGO_URI || 'mongodb://localhost:27017/baza?replicaSet=rs0&directConnection=true';
  const login = process.argv[2] || `manual-seed-${Date.now()}@e2e.baza.test`;
  const password = process.argv[3] || 'Manual-Seed-Password-1!';
  const isSuperAdmin = process.argv[4] !== 'scoped';

  seedAdminAccount(mongoUri, { login, password, isSuperAdmin })
    .then((result) => {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error('[seed-admin] failed:', error);
      process.exitCode = 1;
    });
}
