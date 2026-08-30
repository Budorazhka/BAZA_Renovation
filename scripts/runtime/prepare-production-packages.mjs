import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Workspace packages intentionally point at TypeScript sources during local
 * development. Runtime images execute the compiled JavaScript in `dist`, so
 * rewrite only the package metadata inside the image after the build has
 * completed. The source checkout is never modified by this script in Docker.
 */
const packagesDir = path.resolve('packages');

for (const entry of fs.readdirSync(packagesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;

  const packageJsonPath = path.join(packagesDir, entry.name, 'package.json');
  if (!fs.existsSync(packageJsonPath)) continue;

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const tsconfigPath = path.join(packagesDir, entry.name, 'tsconfig.json');

  // Packages extending the shared browser-oriented base config emit ES
  // module syntax with extensionless imports. The API/worker runtime is
  // CommonJS, so re-emit these few libraries as CJS for Node's resolver.
  if (fs.existsSync(tsconfigPath)) {
    const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
    if (tsconfig.extends === '@baza/tsconfig/base.json') {
      execFileSync('pnpm', [
        'exec',
        'tsc',
        '-p',
        tsconfigPath,
        '--module',
        'CommonJS',
        '--moduleResolution',
        'Node',
      ], { stdio: 'inherit', cwd: process.cwd() });
    }
  }

  let changed = false;

  if (packageJson.main === './src/index.ts') {
    packageJson.main = './dist/index.js';
    changed = true;
  }
  if (packageJson.types === './src/index.ts') {
    packageJson.types = './dist/index.d.ts';
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
  }
}
