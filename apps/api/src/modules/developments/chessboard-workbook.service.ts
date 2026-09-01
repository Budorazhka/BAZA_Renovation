import { Injectable } from '@nestjs/common';
import { Workbook } from 'exceljs';
import type { Currency } from '@baza/contracts';
import {
  CHESSBOARD_SHEET_NAME,
  chessboardHeaders,
  chessboardRow,
  type ChessboardUnitInput,
} from './chessboard-export';

/**
 * Единственное место в API, которое собирает бинарный XLSX. Отделено от
 * chessboard-export.ts намеренно: там — чистые функции формата (колонки,
 * значения, сортировка, имя файла), покрытые тестами без всякого
 * workbook-рантайма; здесь — только запись готовых строк в лист.
 *
 * exceljs, а НЕ тот же `xlsx` (SheetJS Community 0.18.5), что в
 * bz26-client-erp, откуда взят формат: в npm-версии SheetJS известны
 * prototype pollution (CVE-2023-30533) и ReDoS, а исправленные версии в
 * npm автором не публикуются. На результат замена не влияет — в оригинале
 * стилей нет вообще (SheetJS Community их игнорирует), файл представляет
 * собой плоскую сетку, побайтово воспроизводимую любым writer'ом.
 */
@Injectable()
export class ChessboardWorkbookService {
  async build(params: { currency: Currency; units: ChessboardUnitInput[] }): Promise<Buffer> {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet(CHESSBOARD_SHEET_NAME);

    sheet.addRow(chessboardHeaders(params.currency));
    for (const unit of params.units) {
      sheet.addRow(chessboardRow(unit));
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
