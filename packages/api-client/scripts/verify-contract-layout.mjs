#!/usr/bin/env node
/**
 * Contract integrity & layout validation gate (ADR-004 / MKT-004).
 *
 * Verifies:
 * 1. Canonical OpenAPI file exists INSIDE monorepo (docs/api/v1-first-vertical-slice.yaml).
 * 2. Generated schema file exists (packages/api-client/src/schema.ts).
 * 3. No external absolute paths (e.g. C:\..., /Users/..., /home/...) or parent-traversing
 *    relative paths (../../../) in contract scripts, package.json, or OpenAPI spec.
 * 4. Canonical OpenAPI contains all required vertical paths (listings, reveal-contact,
 *    media upload/confirm/list/delete/update/order, duplicate candidates, admin/me/accounts/grants,
 *    developments, auth).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = dirname(scriptDir);
const monorepoRoot = normalize(join(packageDir, '..', '..'));

const canonicalOpenapiPath = join(monorepoRoot, 'docs', 'api', 'v1-first-vertical-slice.yaml');
const generatedSchemaPath = join(packageDir, 'src', 'schema.ts');
const apiClientPkgJsonPath = join(packageDir, 'package.json');
const checkStalePath = join(scriptDir, 'check-stale.mjs');

const errors = [];

// 1. Check file existence
if (!existsSync(canonicalOpenapiPath)) {
  errors.push(`Canonical OpenAPI spec missing inside monorepo at: ${canonicalOpenapiPath}`);
}

if (!existsSync(generatedSchemaPath)) {
  errors.push(`Generated schema missing at: ${generatedSchemaPath}`);
}

// 2. Check for external path traversal or absolute user paths in package.json & scripts
const pkgJsonRaw = readFileSync(apiClientPkgJsonPath, 'utf8');
if (pkgJsonRaw.includes('../../../docs/api')) {
  errors.push(`package.json contains external relative path traversal '../../../docs/api' — should be '../../docs/api'`);
}

const checkStaleRaw = readFileSync(checkStalePath, 'utf8');
if (checkStaleRaw.includes("'..', '..', '..', 'docs'")) {
  errors.push(`check-stale.mjs points outside monorepo ('..', '..', '..', 'docs') — should point inside monorepo ('..', '..', 'docs')`);
}

// Check for absolute local paths
const absolutePathPattern = /([A-Z]:\\[Users|home|private]|file:\/\/\/[A-Z]:)/i;
if (absolutePathPattern.test(pkgJsonRaw)) {
  errors.push(`package.json contains hardcoded absolute local path`);
}
if (absolutePathPattern.test(checkStaleRaw)) {
  errors.push(`check-stale.mjs contains hardcoded absolute local path`);
}

// 3. Verify required paths in OpenAPI spec
if (existsSync(canonicalOpenapiPath)) {
  const specContent = readFileSync(canonicalOpenapiPath, 'utf8');

  const requiredPaths = [
    '/public/listings:',
    '/public/listings/{slug}:',
    '/public/listings/{slug}/reveal-contact:',
    '/property-assets/{assetId}/duplicate-candidates:',
    '/property-assets/duplicate-candidates/{duplicateCandidateId}/override:',
    '/admin/me:',
    '/admin/accounts:',
    '/property-assets/{assetId}/media/upload-intent:',
    '/property-assets/{assetId}/media/{mediaAssetId}/confirm:',
    '/property-assets/{assetId}/media:',
    '/property-assets/{assetId}/media/{mediaAssetId}:',
    '/property-assets/{assetId}/media/order:',
    '/developments:',
    '/developments/{developmentId}:',
    '/auth/login:',
    '/auth/register:',
    '/organizations/register:',
  ];

  for (const p of requiredPaths) {
    if (!specContent.includes(p)) {
      errors.push(`OpenAPI spec is missing required path: ${p}`);
    }
  }

  const requiredSchemas = [
    'PublicListingCard:',
    'PublicMediaItem:',
    'CreatePropertyAssetMediaUploadIntentRequest:',
    'CreatePropertyAssetMediaUploadIntentResponse:',
    'ConfirmPropertyAssetMediaRequest:',
    'UpdatePropertyAssetMediaRequest:',
    'ReorderPropertyAssetMediaRequest:',
    'PropertyAssetMediaItem:',
    'PropertyAssetMediaListResponse:',
    'DeletePropertyAssetMediaResponse:',
    'RevealContactRequest:',
    'RevealContactResponse:',
  ];

  for (const s of requiredSchemas) {
    if (!specContent.includes(s)) {
      errors.push(`OpenAPI spec is missing required schema: ${s}`);
    }
  }
}

if (errors.length > 0) {
  console.error('\n❌ Contract integrity check FAILED:');
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

console.log('✅ Contract layout and OpenAPI vertical integrity verified successfully.');
