import type { LegacyLead } from '../modules/crm/legacy-lead.types';
import { createLegacyApiClient, sleep } from './legacy-lead-export/legacy-api-client';
import { mapLegacyLeadResponse } from './legacy-lead-export/map-legacy-lead';
import { appendProgress, loadResumeState, writeFinalOutput } from './legacy-lead-export/progress-store';

/**
 * `[lead-legacy-export-tool]`: чистый Node/TS-скрипт, СКАЧИВАЮЩИЙ лиды с
 * легаси-backend (`api-crm.baza.sale`, реальный, работающий в проде сервис)
 * в JSON-файл формата `legacy-lead.types.ts::LegacyLead[]` — того же, что
 * уже понимает `migrate-legacy-leads.command.ts`/`LeadMigrationService`.
 *
 * НЕ NestJS-приложение — не использует `NestFactory.createApplicationContext`
 * (нет доступа к БД, только HTTP-клиент и запись файла), в отличие от
 * `migrate-legacy-leads.command.ts`.
 *
 * СТРОГО READ-ONLY: единственные HTTP-вызовы — GET (`legacy-api-client.ts`).
 * Гарантия проверена `export-legacy-leads.readonly-guard.spec.ts` (grep
 * исходников этого файла и `legacy-lead-export/*` на мутирующие методы).
 *
 * Инкрементальное сохранение и `--resume` — см. `progress-store.ts`
 * докстринг.
 *
 * Использование:
 *   pnpm --filter @baza/api run export:legacy-leads -- \
 *     --base-url https://api-crm.baza.sale \
 *     --out ./legacy-leads.json \
 *     [--token <JWT> | env LEGACY_API_TOKEN] \
 *     [--page-size 100] [--delay-ms 200] [--resume]
 *
 * Токен: приоритет у переменной окружения `LEGACY_API_TOKEN` (не оседает в
 * истории шелла) — если она задана, `--token` игнорируется.
 */
export interface ExportOptions {
  baseUrl: string;
  token: string;
  outPath: string;
  pageSize: number;
  delayMs: number;
  resume: boolean;
}

export interface ExportReport {
  totalLeads: number;
  totalPages: number;
  exported: number;
  failedLeads: Array<{ id: string; reason: string }>;
  failedPages: Array<{ page: number; reason: string }>;
  outPath: string;
}

export async function runExport(options: ExportOptions): Promise<ExportReport> {
  const client = createLegacyApiClient({ baseUrl: options.baseUrl, token: options.token });
  const { exportedIds, existingLeads } = loadResumeState(options.outPath, options.resume);
  const leads: LegacyLead[] = [...existingLeads];
  const failedLeads: Array<{ id: string; reason: string }> = [];
  const failedPages: Array<{ page: number; reason: string }> = [];

  let page = 1;
  let totalPages = 1;
  let totalLeads = 0;

  while (page <= totalPages) {
    let pageResult;
    try {
      pageResult = await client.fetchLeadsPage(page, options.pageSize);
    } catch (error) {
      // Первая страница не получена — без неё неизвестно, сколько всего
      // страниц, безопасно продолжить нельзя. Дальнейшие страницы (когда
      // totalPages уже известен) при неудаче просто пропускаются.
      if (page === 1) {
        throw new Error(`Не удалось получить первую страницу лидов: ${errorMessage(error)}`);
      }
      failedPages.push({ page, reason: errorMessage(error) });
      page += 1;
      await sleep(options.delayMs);
      continue;
    }

    totalPages = pageResult.totalPages;
    totalLeads = pageResult.total;

    for (const rawLead of pageResult.items) {
      if (options.resume && exportedIds.has(rawLead._id)) {
        continue;
      }
      await sleep(options.delayMs);
      try {
        const history = await client.fetchLeadHistory(rawLead._id);
        const mapped = mapLegacyLeadResponse(rawLead, history);
        appendProgress(options.outPath, mapped);
        exportedIds.add(rawLead._id);
        leads.push(mapped);
      } catch (error) {
        failedLeads.push({ id: rawLead._id, reason: errorMessage(error) });
      }
    }

    page += 1;
    if (page <= totalPages) {
      await sleep(options.delayMs);
    }
  }

  writeFinalOutput(options.outPath, leads);

  return {
    totalLeads,
    totalPages,
    exported: leads.length,
    failedLeads,
    failedPages,
    outPath: options.outPath,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface ParsedArgs {
  baseUrl: string;
  token: string;
  outPath: string;
  pageSize: number;
  delayMs: number;
  resume: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const flags: Record<string, string> = {};
  let resume = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--resume') {
      resume = true;
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
    }
  }

  if (!flags['base-url']) {
    throw new Error('Обязателен флаг --base-url');
  }
  if (!flags['out']) {
    throw new Error('Обязателен флаг --out');
  }
  const token = process.env.LEGACY_API_TOKEN || flags['token'];
  if (!token) {
    throw new Error('Нужен токен: переменная окружения LEGACY_API_TOKEN или флаг --token');
  }

  return {
    baseUrl: flags['base-url'],
    token,
    outPath: flags['out'],
    pageSize: flags['page-size'] ? Number(flags['page-size']) : 100,
    delayMs: flags['delay-ms'] ? Number(flags['delay-ms']) : 200,
    resume,
  };
}

async function bootstrap(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const report = await runExport(args);

  console.log(`Выгружено лидов: ${report.exported} из ${report.totalLeads}`);
  console.log(`Страниц обработано: ${report.totalPages}`);
  console.log(`Файл: ${report.outPath}`);
  if (report.failedPages.length > 0) {
    console.log(`Failed страниц: ${report.failedPages.length}`);
    for (const failure of report.failedPages) {
      console.log(`  - страница ${failure.page}: ${failure.reason}`);
    }
  }
  if (report.failedLeads.length > 0) {
    console.log(`Failed лидов: ${report.failedLeads.length}`);
    for (const failure of report.failedLeads) {
      console.log(`  - ${failure.id}: ${failure.reason}`);
    }
  }
  if (report.failedLeads.length > 0 || report.failedPages.length > 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  bootstrap().catch((err) => {
    console.error('Fatal error during legacy leads export', err);
    process.exit(1);
  });
}
