import 'reflect-metadata';
// Тот же side-effect-only импорт, что actuality-expire.command.ts (см. его
// докстринг за причиной) — ts-node типизирует граф ЭТОГО entrypoint'а
// независимо от main.api.ts.
import '@fastify/cookie';
import '@fastify/multipart';
import { readFileSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { AppModule } from '../app.module';
import { LeadMigrationService } from '../modules/crm/lead-migration.service';
import type { LegacyLead } from '../modules/crm/legacy-lead.types';

/**
 * Standalone CLI-инструмент переноса лидов с легаси-backend
 * (`api-crm.baza.sale`) — тот же паттерн bootstrap, что
 * `actuality-expire.command.ts`: `NestFactory.createApplicationContext`
 * (без HTTP-адаптера), `LeadMigrationService` берётся из DI-контейнера,
 * вызывается напрямую.
 *
 * Источник данных — ТОЛЬКО локальный JSON-файл легаси-лидов (см.
 * `legacy-lead.types.ts`), выгруженный из `api-crm.baza.sale` ОТДЕЛЬНЫМ,
 * ещё не реализованным шагом (нужны реальные учётные данные легаси-backend,
 * которых на момент этого прохода нет — owner decision: "работаем
 * независимо", инструмент строится сейчас, реальный перенос выполняется
 * позже). Эта команда НЕ содержит HTTP-клиента к `api-crm.baza.sale` и не
 * пытается его строить.
 *
 * Использование:
 *   pnpm --filter @baza/api run migrate:legacy-leads -- \
 *     <путь-к-leads.json> \
 *     --organization-id <ObjectId> \
 *     --actor-identity-id <ObjectId> \
 *     [--manager-mapping <путь-к-mapping.json>] \
 *     [--dry-run]
 *
 * `--manager-mapping` — JSON-файл `{legacyAccountId: positionId}` (по
 * умолчанию `{}`, ни один лид не получит owner). `--dry-run` — прогон без
 * записи в базу, тот же формат отчёта, что реальный прогон (см.
 * LeadMigrationService.importLegacyLeads докстринг).
 */
interface ParsedArgs {
  leadsFilePath: string;
  organizationId: string;
  actorIdentityId: string;
  managerMappingPath?: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  let dryRun = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg.startsWith('--')) {
      const eqIndex = arg.indexOf('=');
      if (eqIndex !== -1) {
        flags[arg.slice(2, eqIndex)] = arg.slice(eqIndex + 1);
      } else {
        const value = argv[i + 1];
        if (value === undefined) {
          throw new Error(`Флаг ${arg} требует значение`);
        }
        flags[arg.slice(2)] = value;
        i += 1;
      }
      continue;
    }
    positional.push(arg);
  }

  const leadsFilePath = positional[0];
  if (!leadsFilePath) {
    throw new Error('Обязателен путь к JSON-файлу легаси-лидов первым аргументом');
  }
  if (!flags['organization-id']) {
    throw new Error('Обязателен флаг --organization-id');
  }
  if (!flags['actor-identity-id']) {
    throw new Error('Обязателен флаг --actor-identity-id');
  }

  return {
    leadsFilePath,
    organizationId: flags['organization-id'],
    actorIdentityId: flags['actor-identity-id'],
    managerMappingPath: flags['manager-mapping'],
    dryRun,
  };
}

function readJsonFile<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

async function bootstrap(): Promise<void> {
  const logger = new Logger('MigrateLegacyLeadsCommand');
  const args = parseArgs(process.argv.slice(2));

  const leads = readJsonFile<LegacyLead[]>(args.leadsFilePath);
  const managerMapping = args.managerMappingPath
    ? readJsonFile<Record<string, string>>(args.managerMappingPath)
    : {};

  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    const service = app.get(LeadMigrationService);
    const report = await service.importLegacyLeads({
      organizationId: new Types.ObjectId(args.organizationId),
      leads,
      managerMapping,
      defaultActorIdentityId: new Types.ObjectId(args.actorIdentityId),
      dryRun: args.dryRun,
    });

    logger.log(`${args.dryRun ? '[DRY RUN] ' : ''}importLegacyLeads finished: ${JSON.stringify(report, null, 2)}`);
    if (report.errors.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

bootstrap().catch((err) => {
  console.error('Fatal error during legacy leads migration command', err);
  process.exit(1);
});
