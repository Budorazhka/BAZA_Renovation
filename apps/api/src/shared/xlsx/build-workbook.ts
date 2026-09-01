import { Workbook } from 'exceljs';

export type XlsxCell = string | number;

/**
 * Единственное место в API, которое собирает бинарный XLSX.
 *
 * Появилось при добавлении export.run: до этого точно такой же код жил
 * внутри ChessboardWorkbookService, и второй потребитель сделал бы его
 * копипастой. Функция намеренно тупая — лист, заголовки, строки; вся
 * доменная логика (какие колонки, как форматировать значения) остаётся в
 * вызывающем коде и покрывается тестами отдельно от workbook-рантайма.
 *
 * exceljs, а НЕ `xlsx` (SheetJS): в npm-версии последнего известны
 * prototype pollution (CVE-2023-30533) и ReDoS, а исправленные версии
 * автором в npm не публикуются.
 */
export async function buildWorkbook(params: {
  sheetName: string;
  headers: string[];
  rows: XlsxCell[][];
}): Promise<Buffer> {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet(params.sheetName);

  sheet.addRow(params.headers);
  for (const row of params.rows) {
    sheet.addRow(row);
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
