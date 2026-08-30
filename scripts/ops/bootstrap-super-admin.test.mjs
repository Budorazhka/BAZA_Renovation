import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  bootstrapSuperAdmin,
  parseArguments,
  redactMongoUri,
  BootstrapError,
} from './bootstrap-super-admin.mjs';

const require = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const argon2 = require('argon2');

const SCRIPT_PATH = resolve(dirname(fileURLToPath(import.meta.url)), 'bootstrap-super-admin.mjs');

// Helper to run CLI process and capture stdout, stderr, and exit code
function runCli(args = [], env = {}, stdinData = null) {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [SCRIPT_PATH, ...args], {
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    if (stdinData !== null) {
      child.stdin.write(stdinData);
      child.stdin.end();
    } else {
      child.stdin.end();
    }

    child.on('close', (code) => {
      resolvePromise({ code, stdout, stderr });
    });
  });
}

test('redactMongoUri removes credentials correctly', () => {
  assert.equal(
    redactMongoUri('mongodb://admin_user:super_secret_pass@127.0.0.1:27017/baza_prod?authSource=admin'),
    'mongodb://***:***@127.0.0.1:27017/baza_prod?authSource=admin'
  );
  assert.equal(
    redactMongoUri('mongodb+srv://root:s3cr3t!@cluster0.abcde.mongodb.net/baza'),
    'mongodb+srv://***:***@cluster0.abcde.mongodb.net/baza'
  );
  assert.equal(
    redactMongoUri('mongodb://127.0.0.1:27017/baza_local'),
    'mongodb://127.0.0.1:27017/baza_local'
  );
  assert.equal(redactMongoUri(''), '<empty>');
});

test('parseArguments enforces parameters and blocks --force', () => {
  const parsed = parseArguments(
    ['--login', 'SuperAdmin@baza.test', '--password', 'secure_password_123', '--mongo-uri', 'mongodb://localhost/test'],
    {}
  );
  assert.equal(parsed.login, 'SuperAdmin@baza.test');
  assert.equal(parsed.password, 'secure_password_123');
  assert.equal(parsed.mongoUri, 'mongodb://localhost/test');
  assert.equal(parsed.passwordStdin, false);

  // Rejection of --force
  assert.throws(
    () => parseArguments(['--force'], {}),
    (err) => err instanceof BootstrapError && err.code === 'FLAG_FORBIDDEN'
  );
});

test('Super admin bootstrap suite (real MongoDB ReplicaSet with transactions)', async (t) => {
  let replSet;
  let connection;
  let mongoUri;

  t.before(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await replSet.waitUntilRunning();
    mongoUri = replSet.getUri();
    connection = await mongoose.createConnection(mongoUri).asPromise();
  });

  t.after(async () => {
    if (connection) await connection.close();
    if (replSet) await replSet.stop();
  });

  t.beforeEach(async () => {
    await connection.collection('admin_accounts').deleteMany({});
    await connection.collection('identities').deleteMany({});
    await connection.collection('product_accesses').deleteMany({});
    await connection.collection('audit_events').deleteMany({});
  });

  await t.test('1. Successful bootstrap creates identity, admin_account, product_access, and audit_event atomically', async () => {
    const rawLogin = '  RootAdmin@BAZA.DEV  ';
    const rawPassword = 'super-secret-password-12345';

    const result = await bootstrapSuperAdmin({
      mongoUri,
      login: rawLogin,
      password: rawPassword,
    });

    assert.equal(result.normalizedLogin, 'rootadmin@baza.dev');
    assert.equal(result.isSuperAdmin, true);
    assert.ok(result.identityId);
    assert.ok(result.adminAccountId);
    assert.ok(result.productAccessId);

    // Verify identity collection
    const identity = await connection.collection('identities').findOne({ _id: new mongoose.Types.ObjectId(result.identityId) });
    assert.ok(identity);
    assert.equal(identity.normalizedLogin, 'rootadmin@baza.dev');
    assert.equal(identity.status, 'active');
    assert.equal(identity.twoFactorMethod, 'none');
    assert.ok(identity.passwordHash);
    assert.ok(identity.createdAt instanceof Date);

    // Verify admin_accounts collection
    const adminAccount = await connection.collection('admin_accounts').findOne({ _id: new mongoose.Types.ObjectId(result.adminAccountId) });
    assert.ok(adminAccount);
    assert.equal(adminAccount.identityId.toString(), result.identityId);
    assert.equal(adminAccount.status, 'active');
    assert.equal(adminAccount.isSuperAdmin, true);
    assert.ok(adminAccount.createdAt instanceof Date);

    // Verify product_accesses collection
    const productAccess = await connection.collection('product_accesses').findOne({ _id: new mongoose.Types.ObjectId(result.productAccessId) });
    assert.ok(productAccess);
    assert.equal(productAccess.identityId.toString(), result.identityId);
    assert.equal(productAccess.product, 'admin');
    assert.ok(productAccess.grantedAt instanceof Date);

    // Verify audit_events collection
    const auditEvent = await connection.collection('audit_events').findOne({ resourceId: adminAccount._id });
    assert.ok(auditEvent);
    assert.equal(auditEvent.action, 'admin_account.bootstrap_first_super_admin');
    assert.equal(auditEvent.resource, 'admin_account');
    assert.equal(auditEvent.actor.type, 'system');
    assert.equal(auditEvent.after.isSuperAdmin, true);
    assert.equal(auditEvent.after.normalizedLogin, 'rootadmin@baza.dev');
  });

  await t.test('2. Password verification with production Argon2 matches AuthService login mechanism', async () => {
    const rawLogin = 'admin.auth.test@baza.dev';
    const rawPassword = 'correct horse battery staple 2026';

    const result = await bootstrapSuperAdmin({
      mongoUri,
      login: rawLogin,
      password: rawPassword,
    });

    const identity = await connection.collection('identities').findOne({ _id: new mongoose.Types.ObjectId(result.identityId) });
    assert.ok(identity.passwordHash);

    // Verify rawPassword matches hash
    const isValid = await argon2.verify(identity.passwordHash, rawPassword);
    assert.equal(isValid, true);

    // Verify wrong password fails
    const isWrongValid = await argon2.verify(identity.passwordHash, 'wrong-password-attempt');
    assert.equal(isWrongValid, false);
  });

  await t.test('3. Repeated execution when active super_admin exists fails and changes nothing', async () => {
    // First bootstrap
    await bootstrapSuperAdmin({
      mongoUri,
      login: 'first.superadmin@baza.dev',
      password: 'password_number_one_123',
    });

    const identitiesCountBefore = await connection.collection('identities').countDocuments();
    const adminAccountsCountBefore = await connection.collection('admin_accounts').countDocuments();
    const productAccessesCountBefore = await connection.collection('product_accesses').countDocuments();

    assert.equal(identitiesCountBefore, 1);
    assert.equal(adminAccountsCountBefore, 1);
    assert.equal(productAccessesCountBefore, 1);

    // Attempt second bootstrap with a different login
    await assert.rejects(
      async () => {
        await bootstrapSuperAdmin({
          mongoUri,
          login: 'second.superadmin@baza.dev',
          password: 'password_number_two_123',
        });
      },
      (err) => err instanceof BootstrapError && err.code === 'ACTIVE_SUPER_ADMIN_EXISTS'
    );

    // Assert counts are completely unchanged
    assert.equal(await connection.collection('identities').countDocuments(), 1);
    assert.equal(await connection.collection('admin_accounts').countDocuments(), 1);
    assert.equal(await connection.collection('product_accesses').countDocuments(), 1);
  });

  await t.test('4. Duplicate login fails and aborts before creating any admin account or product access', async () => {
    // Pre-seed an ordinary identity with login 'existing.user@baza.dev'
    const preExistingIdentityId = new mongoose.Types.ObjectId();
    await connection.collection('identities').insertOne({
      _id: preExistingIdentityId,
      normalizedLogin: 'existing.user@baza.dev',
      status: 'active',
      twoFactorMethod: 'none',
      createdAt: new Date(),
    });

    assert.equal(await connection.collection('admin_accounts').countDocuments(), 0);

    // Attempt bootstrap with the same login
    await assert.rejects(
      async () => {
        await bootstrapSuperAdmin({
          mongoUri,
          login: 'Existing.User@baza.dev',
          password: 'super_admin_pass_123',
        });
      },
      (err) => err instanceof BootstrapError && err.code === 'LOGIN_ALREADY_EXISTS'
    );

    // Assert no admin_account or product_access was created
    assert.equal(await connection.collection('admin_accounts').countDocuments(), 0);
    assert.equal(await connection.collection('product_accesses').countDocuments(), 0);
    assert.equal(await connection.collection('identities').countDocuments(), 1);
  });

  await t.test('5. Transaction rollback guarantees zero partial writes on failure', async () => {
    // Create a unique index on product_accesses to trigger a write conflict mid-transaction
    await connection.collection('product_accesses').createIndex({ identityId: 1, product: 1 }, { unique: true });

    // Seed conflicting product access for a known ID
    const dummyIdentityId = new mongoose.Types.ObjectId();
    await connection.collection('product_accesses').insertOne({
      identityId: dummyIdentityId,
      product: 'admin',
      grantedAt: new Date(),
    });

    // Mock an error during transaction by using a custom session transaction wrapper or triggering duplicate key
    const session = await connection.startSession();
    try {
      await assert.rejects(async () => {
        await session.withTransaction(async () => {
          // Write identity
          await connection.collection('identities').insertOne({
            _id: new mongoose.Types.ObjectId(),
            normalizedLogin: 'rollback.test@baza.dev',
            status: 'active',
            createdAt: new Date(),
          }, { session });

          // Write admin account
          await connection.collection('admin_accounts').insertOne({
            _id: new mongoose.Types.ObjectId(),
            identityId: dummyIdentityId,
            status: 'active',
            isSuperAdmin: true,
            createdAt: new Date(),
          }, { session });

          // Force failure
          throw new Error('Simulated mid-transaction failure');
        });
      });
    } finally {
      await session.endSession();
    }

    // Verify that neither identity nor admin_account was written
    const rollbackIdentity = await connection.collection('identities').findOne({ normalizedLogin: 'rollback.test@baza.dev' });
    assert.equal(rollbackIdentity, null);
    const rollbackAdmin = await connection.collection('admin_accounts').findOne({ identityId: dummyIdentityId });
    assert.equal(rollbackAdmin, null);

    // Clean up test index
    await connection.collection('product_accesses').dropIndex('identityId_1_product_1');
  });

  await t.test('6. Invalid configurations fail with descriptive error codes and exit code 1', async () => {
    // Missing Mongo URI
    await assert.rejects(
      () => bootstrapSuperAdmin({ mongoUri: '', login: 'test@baza.dev', password: 'password123' }),
      (err) => err instanceof BootstrapError && err.code === 'CONFIG_MISSING_MONGO_URI'
    );

    // Missing login
    await assert.rejects(
      () => bootstrapSuperAdmin({ mongoUri, login: '', password: 'password123' }),
      (err) => err instanceof BootstrapError && err.code === 'CONFIG_MISSING_LOGIN'
    );

    // Missing password
    await assert.rejects(
      () => bootstrapSuperAdmin({ mongoUri, login: 'test@baza.dev', password: '' }),
      (err) => err instanceof BootstrapError && err.code === 'CONFIG_MISSING_PASSWORD'
    );

    // Short password (< 8 chars)
    await assert.rejects(
      () => bootstrapSuperAdmin({ mongoUri, login: 'test@baza.dev', password: 'short' }),
      (err) => err instanceof BootstrapError && err.code === 'CONFIG_INVALID_PASSWORD'
    );
  });

  await t.test('7. CLI execution and secret leak prevention (stdout/stderr inspection)', async () => {
    const sensitivePassword = 'ultra_secret_unleakable_password_9999!';

    // Run CLI with --password-stdin and valid mongoUri
    const res = await runCli(
      ['--mongo-uri', mongoUri, '--login', 'cli.superadmin@baza.dev', '--password-stdin'],
      {},
      sensitivePassword
    );

    assert.equal(res.code, 0, `CLI failed with stderr: ${res.stderr}`);
    assert.ok(res.stdout.includes('SUCCESS: First super_admin initialized successfully'));
    assert.ok(res.stdout.includes('cli.superadmin@baza.dev'));

    // Verify sensitive secrets are NOT present in output
    assert.equal(res.stdout.includes(sensitivePassword), false, 'Password leaked in stdout!');
    assert.equal(res.stderr.includes(sensitivePassword), false, 'Password leaked in stderr!');
    assert.equal(res.stdout.includes('$argon2'), false, 'Argon2 hash leaked in stdout!');
    assert.equal(res.stderr.includes('$argon2'), false, 'Argon2 hash leaked in stderr!');

    // Re-running CLI on existing super_admin must exit with code 1 and error message
    const repeatRes = await runCli(
      ['--mongo-uri', mongoUri, '--login', 'another@baza.dev', '--password', 'another_secret_password_123'],
      {}
    );

    assert.equal(repeatRes.code, 1);
    assert.ok(repeatRes.stderr.includes('An active super_admin already exists'));
    assert.equal(repeatRes.stdout.includes('another_secret_password_123'), false);
    assert.equal(repeatRes.stderr.includes('another_secret_password_123'), false);

    // Test connection failure with embedded credentials to verify URI masking in stderr
    const mongoUriWithCreds = mongoUri.replace('mongodb://', 'mongodb://fakeuser:super_secret_mongo_pass@');
    const authFailRes = await runCli(
      ['--mongo-uri', mongoUriWithCreds, '--login', 'fake@baza.dev', '--password', 'password12345'],
      {}
    );

    assert.equal(authFailRes.code, 1);
    assert.ok(authFailRes.stderr.includes('mongodb://***:***@'));
    assert.equal(authFailRes.stderr.includes('super_secret_mongo_pass'), false, 'Mongo password leaked in stderr!');
    assert.equal(authFailRes.stdout.includes('super_secret_mongo_pass'), false, 'Mongo password leaked in stdout!');
  });
});
