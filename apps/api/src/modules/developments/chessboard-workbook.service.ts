import { Injectable } from '@nestjs/common';
import type { Currency } from '@baza/contracts';
import { buildWorkbook } from '../../shared/xlsx/build-workbook';
import {
  CHESSBOARD_SHEET_NAME,
  chessboardHeaders,
  chessboardRow,
  type ChessboardUnitInput,
} from './chessboard-export';

/**
 * Сборка XLSX-шахматки. Сам workbook собирает общий
 * shared/xlsx/build-workbook (вынесен туда, когда у него появился второй
 * потребитель — выгрузки CRM по гранту export.run); здесь остаётся только
 * доменная часть: какие колонки и в каком порядке.
 *
 * Формат колонок и значений живёт в chessboard-export.ts и покрыт тестами
 * без workbook-рантайма.
 */
@Injectable()
export class ChessboardWorkbookService {
  async build(params: { currency: Currency; units: ChessboardUnitInput[] }): Promise<Buffer> {
    return buildWorkbook({
      sheetName: CHESSBOARD_SHEET_NAME,
      headers: chessboardHeaders(params.currency),
      rows: params.units.map(chessboardRow),
    });
  }
}
