import { Workbook } from 'exceljs';
import { parseLeadImportFile } from './lead-import-file-parser';

async function buildXlsx(headers: string[], rows: (string | number)[][]): Promise<Buffer> {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet('Лиды');
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('parseLeadImportFile — CSV', () => {
  it('разбирает валидный csv, колонки в любом порядке, заголовок case-insensitive', async () => {
    const csv = 'Name,Phone\nИван,+995500000001\nПётр,+995500000002\n';
    const rows = await parseLeadImportFile(Buffer.from(csv, 'utf8'), 'leads.csv', 'text/csv');

    expect(rows).toEqual([
      { row: 1, name: 'Иван', phone: '+995500000001' },
      { row: 2, name: 'Пётр', phone: '+995500000002' },
    ]);
  });

  it('порядок колонок phone,name — тоже работает (matching по имени заголовка, не позиции)', async () => {
    const csv = 'phone,name\n+995500000001,Иван\n';
    const rows = await parseLeadImportFile(Buffer.from(csv, 'utf8'), 'leads.csv', 'text/csv');

    expect(rows).toEqual([{ row: 1, name: 'Иван', phone: '+995500000001' }]);
  });

  it('колонка name необязательна', async () => {
    const csv = 'phone\n+995500000001\n';
    const rows = await parseLeadImportFile(Buffer.from(csv, 'utf8'), 'leads.csv', 'text/csv');

    expect(rows).toEqual([{ row: 1, name: undefined, phone: '+995500000001' }]);
  });

  it('телефон не превращается в число и не теряет ведущий "+"', async () => {
    const csv = 'phone\n+995500000001\n';
    const rows = await parseLeadImportFile(Buffer.from(csv, 'utf8'), 'leads.csv', 'text/csv');

    expect(rows[0]!.phone).toBe('+995500000001');
    expect(typeof rows[0]!.phone).toBe('string');
  });

  it('без обязательной колонки phone — понятная ошибка, не молчаливый пропуск строк', async () => {
    const csv = 'name\nИван\n';
    await expect(parseLeadImportFile(Buffer.from(csv, 'utf8'), 'leads.csv', 'text/csv')).rejects.toThrow(
      /phone/,
    );
  });

  it('полностью пустые строки не считаются строками данных (не ломают нумерацию)', async () => {
    const csv = 'phone,name\n+995500000001,Иван\n\n+995500000002,Пётр\n';
    const rows = await parseLeadImportFile(Buffer.from(csv, 'utf8'), 'leads.csv', 'text/csv');

    expect(rows).toEqual([
      { row: 1, name: 'Иван', phone: '+995500000001' },
      { row: 2, name: 'Пётр', phone: '+995500000002' },
    ]);
  });

  it('пустой файл — понятная ошибка', async () => {
    await expect(parseLeadImportFile(Buffer.from('', 'utf8'), 'leads.csv', 'text/csv')).rejects.toThrow(
      /пуст/,
    );
  });
});

describe('parseLeadImportFile — XLSX', () => {
  it('разбирает валидный xlsx', async () => {
    const buffer = await buildXlsx(['Phone', 'Name'], [['+995500000001', 'Иван']]);
    const rows = await parseLeadImportFile(buffer, 'leads.xlsx', undefined);

    expect(rows).toEqual([{ row: 1, name: 'Иван', phone: '+995500000001' }]);
  });

  it('неизвестное расширение и mimetype — понятная ошибка', async () => {
    await expect(
      parseLeadImportFile(Buffer.from('irrelevant'), 'leads.txt', 'text/plain'),
    ).rejects.toThrow(/формат/);
  });
});
