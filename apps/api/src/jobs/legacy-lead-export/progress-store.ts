import { appendFileSync, existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import type { LegacyLead } from '../../modules/crm/legacy-lead.types';

/**
 * `[lead-legacy-export-tool]`: инкрементальное сохранение прогресса выгрузки.
 *
 * Выбор механизма — построчный JSONL-файл `${outPath}.progress.jsonl`, по
 * одной строке на КАЖДЫЙ полностью выгруженный лид (лид + история уже
 * получены и смаппены). Append-only: `appendFileSync` после каждого лида —
 * при обрыве сети/процесса теряется не более одного текущего лида, все уже
 * записанные строки целы. JSONL выбран, а не перезапись всего `--out` после
 * каждой N-й записи, потому что append — O(1) относительно уже выгруженного
 * объёма (не нужно ни держать всё в памяти, ни переписывать растущий файл
 * целиком на каждой итерации).
 *
 * `--resume`: читает JSONL, набор `_id` уже выгруженных лидов передаётся
 * наверх, чтобы не повторять для них дорогой N+1 запрос истории (сам список
 * `/crm/leads` при resume перезапрашивается заново постранично — это дёшево
 * по сравнению с историей, и без него нельзя узнать, какие страницы вообще
 * есть).
 *
 * Без `--resume` — предыдущий прогон предыдущего запуска (если он есть)
 * удаляется, чтобы не подмешать в новый экспорт данные из прошлого файла.
 */
export interface ResumeState {
  exportedIds: Set<string>;
  existingLeads: LegacyLead[];
}

export function progressPathFor(outPath: string): string {
  return `${outPath}.progress.jsonl`;
}

export function loadResumeState(outPath: string, resume: boolean): ResumeState {
  const progressPath = progressPathFor(outPath);
  if (!resume) {
    if (existsSync(progressPath)) {
      unlinkSync(progressPath);
    }
    return { exportedIds: new Set(), existingLeads: [] };
  }
  if (!existsSync(progressPath)) {
    return { exportedIds: new Set(), existingLeads: [] };
  }
  const lines = readFileSync(progressPath, 'utf-8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const existingLeads: LegacyLead[] = lines.map((line) => JSON.parse(line) as LegacyLead);
  return { exportedIds: new Set(existingLeads.map((lead) => lead._id)), existingLeads };
}

export function appendProgress(outPath: string, lead: LegacyLead): void {
  appendFileSync(progressPathFor(outPath), `${JSON.stringify(lead)}\n`, 'utf-8');
}

export function writeFinalOutput(outPath: string, leads: LegacyLead[]): void {
  writeFileSync(outPath, JSON.stringify(leads, null, 2), 'utf-8');
}
