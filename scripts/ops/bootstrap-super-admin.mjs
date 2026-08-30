#!/usr/bin/env node
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import readline from 'node:readline';

// Resolve dependencies from apps/api without requiring root dependencies or lockfile changes
const require = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const mongoose = require('mongoose');
const argon2 = require('argon2');

/**
 * Custom error class for operational bootstrap failures.
 */
export class BootstrapError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'BootstrapError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Redacts credentials (username/password) from a MongoDB URI string for safe logging.
 */
export function redactMongoUri(uri) {
  if (!uri || typeof uri !== 'string') return '<empty>';
  try {
    // Check if URI matches mongodb:// or mongodb+srv://
    const parsed = new URL(uri);
    if (parsed.password) parsed.password = '***';
    if (parsed.username) parsed.username = '***';
    return parsed.toString();
  } catch {
    // Regex fallback for URIs that might fail strict URL parsing
    return uri.replace(/(mongodb(?:\+srv)?:\/\/)([^:]+):([^@]+)@/i, '$1***:***@');
  }
}

/**
 * Reads password securely from standard input (until EOF or newline).
 */
export async function readPasswordFromStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      // Remove trailing newlines / carriage returns
      resolve(data.replace(/[\r\n]+$/, ''));
    });
    process.stdin.on('error', (err) => {
      reject(new BootstrapError('STDIN_ERROR', `Failed to read password from stdin: ${err.message}`));
    });
  });
}

/**
 * Prompts user for hidden input in interactive TTY environments.
 */
export async function promptHidden(promptText) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    process.stdout.write(promptText);

    // Mute output to prevent password echoing
    const originalWrite = rl._writeToOutput;
    rl._writeToOutput = function (stringToWrite) {
      if (stringToWrite.includes('\r') || stringToWrite.includes('\n')) {
        originalWrite.call(this, stringToWrite);
      }
    };

    rl.question('', (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Parses CLI flags and merges with environment variables.
 */
export function parseArguments(args = process.argv.slice(2), env = process.env) {
  const options = {
    mongoUri: env.MONGO_URI || '',
    login: env.BOOTSTRAP_SUPER_ADMIN_LOGIN || env.SUPER_ADMIN_LOGIN || '',
    password: env.BOOTSTRAP_SUPER_ADMIN_PASSWORD || env.SUPER_ADMIN_PASSWORD || '',
    passwordStdin: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--mongo-uri') {
      options.mongoUri = args[++i] || '';
    } else if (arg.startsWith('--mongo-uri=')) {
      options.mongoUri = arg.slice('--mongo-uri='.length);
    } else if (arg === '--login' || arg === '-l') {
      options.login = args[++i] || '';
    } else if (arg.startsWith('--login=')) {
      options.login = arg.slice('--login='.length);
    } else if (arg === '--password' || arg === '-p') {
      options.password = args[++i] || '';
    } else if (arg.startsWith('--password=')) {
      options.password = arg.slice('--password='.length);
    } else if (arg === '--password-stdin') {
      options.passwordStdin = true;
    } else if (arg.startsWith('--force')) {
      throw new BootstrapError(
        'FLAG_FORBIDDEN',
        '--force flag is strictly prohibited. Bootstrap cannot bypass safety checks or mutate existing admin accounts.'
      );
    }
  }

  return options;
}

/**
 * Executes the transactional bootstrap of the first super_admin.
 *
 * @param {Object} params
 * @param {string} params.mongoUri - MongoDB connection URI
 * @param {string} params.login - Raw login string
 * @param {string} params.password - Raw password string (min 8 chars)
 * @param {Object} [params.customConnection] - Optional injected connection (for testing)
 * @returns {Promise<{ identityId: string, adminAccountId: string, productAccessId: string, normalizedLogin: string, isSuperAdmin: true, createdAt: string }>}
 */
export async function bootstrapSuperAdmin({
  mongoUri,
  login,
  password,
  customConnection = null,
} = {}) {
  if (!customConnection && (!mongoUri || typeof mongoUri !== 'string' || !mongoUri.trim())) {
    throw new BootstrapError(
      'CONFIG_MISSING_MONGO_URI',
      'MongoDB connection URI is required. Provide MONGO_URI environment variable or --mongo-uri argument.'
    );
  }

  if (!login || typeof login !== 'string' || !login.trim()) {
    throw new BootstrapError(
      'CONFIG_MISSING_LOGIN',
      'Super admin login is required. Provide BOOTSTRAP_SUPER_ADMIN_LOGIN env or --login argument.'
    );
  }

  if (!password || typeof password !== 'string') {
    throw new BootstrapError(
      'CONFIG_MISSING_PASSWORD',
      'Super admin password is required. Provide BOOTSTRAP_SUPER_ADMIN_PASSWORD env, --password-stdin, or --password argument.'
    );
  }

  if (password.length < 8) {
    throw new BootstrapError(
      'CONFIG_INVALID_PASSWORD',
      'Super admin password must be at least 8 characters long.'
    );
  }

  // Normalize login identical to AuthService.verifyCredentials and registerIdentity
  const normalizedLogin = login.trim().toLowerCase();
  if (normalizedLogin.length === 0) {
    throw new BootstrapError('CONFIG_INVALID_LOGIN', 'Super admin login cannot be empty.');
  }

  let connection = customConnection;
  let shouldCloseConnection = false;

  if (!connection) {
    try {
      connection = await mongoose.createConnection(mongoUri).asPromise();
      shouldCloseConnection = true;
    } catch (err) {
      throw new BootstrapError(
        'MONGO_CONNECTION_FAILED',
        `Failed to connect to MongoDB at ${redactMongoUri(mongoUri)}: ${err.message}`
      );
    }
  }

  const session = await connection.startSession();

  try {
    let result = null;

    await session.withTransaction(async () => {
      const adminAccountsColl = connection.collection('admin_accounts');
      const identitiesColl = connection.collection('identities');
      const productAccessesColl = connection.collection('product_accesses');
      const auditEventsColl = connection.collection('audit_events');

      // Invariant 1: Ensure no active super_admin exists in the database
      const activeSuperAdminCount = await adminAccountsColl.countDocuments(
        { isSuperAdmin: true, status: 'active' },
        { session }
      );

      if (activeSuperAdminCount > 0) {
        throw new BootstrapError(
          'ACTIVE_SUPER_ADMIN_EXISTS',
          'An active super_admin already exists in the system. Bootstrap is strictly one-time and cannot be re-run.'
        );
      }

      // Invariant 2: Ensure login is not already in use by any identity
      const existingIdentity = await identitiesColl.findOne(
        { normalizedLogin },
        { session }
      );

      if (existingIdentity) {
        throw new BootstrapError(
          'LOGIN_ALREADY_EXISTS',
          `Identity with login "${normalizedLogin}" is already registered. Choose another login or resolve the conflict.`
        );
      }

      // Hash password using the same Argon2id configuration as production AuthService
      const passwordHash = await argon2.hash(password);

      const identityId = new mongoose.Types.ObjectId();
      const adminAccountId = new mongoose.Types.ObjectId();
      const productAccessId = new mongoose.Types.ObjectId();
      const now = new Date();

      // 1. Create Identity document
      await identitiesColl.insertOne(
        {
          _id: identityId,
          normalizedLogin,
          passwordHash,
          status: 'active',
          twoFactorMethod: 'none',
          createdAt: now,
        },
        { session }
      );

      // 2. Create AdminAccount document
      await adminAccountsColl.insertOne(
        {
          _id: adminAccountId,
          identityId,
          status: 'active',
          isSuperAdmin: true,
          createdAt: now,
        },
        { session }
      );

      // 3. Create ProductAccess document for Admin audience
      await productAccessesColl.insertOne(
        {
          _id: productAccessId,
          identityId,
          product: 'admin',
          grantedAt: now,
        },
        { session }
      );

      // 4. Record append-only audit event for platform bootstrap
      await auditEventsColl.insertOne(
        {
          _id: new mongoose.Types.ObjectId(),
          actor: { type: 'system' },
          action: 'admin_account.bootstrap_first_super_admin',
          resource: 'admin_account',
          resourceId: adminAccountId,
          after: {
            identityId: identityId.toString(),
            isSuperAdmin: true,
            normalizedLogin,
          },
          correlationId: `bootstrap-${identityId.toString()}`,
          createdAt: now,
        },
        { session }
      );

      result = {
        identityId: identityId.toString(),
        adminAccountId: adminAccountId.toString(),
        productAccessId: productAccessId.toString(),
        normalizedLogin,
        isSuperAdmin: true,
        createdAt: now.toISOString(),
      };
    });

    return result;
  } finally {
    await session.endSession();
    if (shouldCloseConnection && connection) {
      await connection.close();
    }
  }
}

/**
 * Prints help message to stdout.
 */
export function printHelp() {
  console.log(`
BAZA Platform - Initial First Super Admin Bootstrap Script

USAGE:
  node scripts/ops/bootstrap-super-admin.mjs [OPTIONS]

DESCRIPTION:
  Performs a one-time, secure, atomic initialization of the first super_admin in BAZA.
  Connects directly to MongoDB, creates identity + admin_account + product_access in a
  single transaction, and verifies that no active super_admin previously exists.

OPTIONS:
  --mongo-uri <URI>        MongoDB connection URI (can also be set via MONGO_URI env)
  --login, -l <LOGIN>      Super admin login (or BOOTSTRAP_SUPER_ADMIN_LOGIN env)
  --password, -p <PWD>     Super admin password (min 8 chars, or BOOTSTRAP_SUPER_ADMIN_PASSWORD env)
  --password-stdin         Read password securely from standard input (recommended for CI/CD)
  --help, -h               Show this help message

ENVIRONMENT VARIABLES:
  MONGO_URI                        MongoDB connection string
  BOOTSTRAP_SUPER_ADMIN_LOGIN      Super admin login / email
  BOOTSTRAP_SUPER_ADMIN_PASSWORD   Super admin password (min 8 characters)

SECURITY RULES:
  1. Passwords and password hashes are never logged to stdout/stderr.
  2. Mongo connection credentials in URIs are masked in error outputs.
  3. No --force or bypass options exist.
  4. Script fails if an active super_admin is already present in the database.
`);
}

/**
 * CLI Entry point
 */
export async function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2), process.env);
  } catch (err) {
    console.error(`[bootstrap] Error: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  if (options.help) {
    printHelp();
    process.exitCode = 0;
    return;
  }

  try {
    let password = options.password;

    if (options.passwordStdin) {
      password = await readPasswordFromStdin();
    } else if (!password && process.stdin.isTTY) {
      password = await promptHidden('Enter super_admin password (min 8 chars): ');
      process.stdout.write('\n');
    }

    const result = await bootstrapSuperAdmin({
      mongoUri: options.mongoUri,
      login: options.login,
      password,
    });

    console.log('[bootstrap] SUCCESS: First super_admin initialized successfully.');
    console.log(`[bootstrap] Identity ID:       ${result.identityId}`);
    console.log(`[bootstrap] Admin Account ID:  ${result.adminAccountId}`);
    console.log(`[bootstrap] Normalized Login:  ${result.normalizedLogin}`);
    console.log(`[bootstrap] Role:              super_admin`);
    console.log(`[bootstrap] Created At:        ${result.createdAt}`);
    process.exitCode = 0;
  } catch (err) {
    console.error(`[bootstrap] FAIL: ${err.message}`);
    process.exitCode = 1;
  }
}

// Auto-run if executed directly as script
const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  main();
}
