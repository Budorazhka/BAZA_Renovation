/**
 * Central place resolving every runtime URL/credential this suite needs,
 * all overridable via env var so the same specs can run against either
 * orchestration path documented in docs/operations/d07-runtime-e2e-gate.md
 * (compose.runtime.yml nginx-fronted apps on 4173/4174, or bare `pnpm dev`
 * processes on whatever ports were chosen for that lighter path).
 */
export const env = {
  apiUrl: process.env.RUNTIME_API_URL || 'http://localhost:3000',
  apiBasePath: process.env.RUNTIME_API_BASE_PATH || '/api/v1',
  marketplaceUrl: process.env.RUNTIME_MARKETPLACE_URL || 'http://localhost:4173',
  marketplaceOrigin: process.env.RUNTIME_MARKETPLACE_ORIGIN || process.env.RUNTIME_MARKETPLACE_URL || 'http://localhost:4173',
  adminUrl: process.env.RUNTIME_ADMIN_URL || 'http://localhost:4174',
  adminOrigin: process.env.RUNTIME_ADMIN_ORIGIN || process.env.RUNTIME_ADMIN_URL || 'http://localhost:4174',
  mongoUri: process.env.RUNTIME_MONGO_URI || 'mongodb://localhost:27017/baza?replicaSet=rs0',
};

export function apiUrl(path: string): string {
  return `${env.apiUrl}${env.apiBasePath}${path}`;
}
