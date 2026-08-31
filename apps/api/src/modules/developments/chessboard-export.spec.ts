import {
  CHESSBOARD_SHEET_NAME,
  chessboardFileName,
  chessboardHeaders,
  chessboardRow,
  sortChessboardUnits,
  type ChessboardUnitInput,
} from './chessboard-export';

function makeUnit(overrides: Partial<ChessboardUnitInput> = {}): ChessboardUnitInput {
  return {
    buildingName: 'Корпус 1',
    floorNumber: 3,
    number: 'A-0301',
    rooms: 2,
    area: 58,
    priceMinorUnits: 12_180_000,
    status: 'available',
    promotion: undefined,
    ...overrides,
  };
}

describe('chessboardHeaders', () => {
  it('воспроизводит 15 колонок формата bz26-client-erp в том же порядке', () => {
    expect(chessboardHeaders('USD')).toEqual([
      'Корпус',
      'Этаж',
      'Номер',
      'Комнатность',
      'Площадь, м²',
      'Цена за м², $',
      'Цена: Черный каркас, $/м²',
      'Цена: Белый каркас, $/м²',
      'Цена: Зеленый каркас, $/м²',
      'Цена: С ремонтом, $/м²',
      'Цена: Под ключ, $/м²',
      'Базовая цена за м², $',
      'Итого, $',
      'Статус',
      'Акция',
    ]);
  });

  it('подставляет символ валюты в заголовки цен', () => {
    expect(chessboardHeaders('GEL')).toContain('Итого, ₾');
    expect(chessboardHeaders('GEL')).toContain('Цена за м², ₾');
    expect(chessboardHeaders('RUB')).toContain('Итого, ₽');
  });

  it('имя листа совпадает с оригиналом', () => {
    expect(CHESSBOARD_SHEET_NAME).toBe('Шахматка');
  });
});

describe('chessboardRow', () => {
  it('пишет суммы в основных единицах и считает цену за м² из цены и площади', () => {
    const row = chessboardRow(makeUnit());

    expect(row[4]).toBe(58);
    expect(row[5]).toBe(2100);
    expect(row[12]).toBe(121_800);
  });

  it('колонки цен по кондициям и базовая цена всегда пустые — таких данных в BAZA нет', () => {
    const row = chessboardRow(makeUnit());

    expect(row.slice(6, 12)).toEqual(['', '', '', '', '', '']);
  });

  it('переводит статусы юнита в русские подписи оригинала', () => {
    expect(chessboardRow(makeUnit({ status: 'available' }))[13]).toBe('Свободно');
    expect(chessboardRow(makeUnit({ status: 'reserved' }))[13]).toBe('Бронь');
    expect(chessboardRow(makeUnit({ status: 'sold' }))[13]).toBe('Продано');
    expect(chessboardRow(makeUnit({ status: 'hidden' }))[13]).toBe('Снято с продажи');
  });

  it('отсутствующие комнатность и акция становятся пустыми ячейками, а не undefined', () => {
    const row = chessboardRow(makeUnit({ rooms: undefined, promotion: undefined }));

    expect(row[3]).toBe('');
    expect(row[14]).toBe('');
  });

  it('акция пишется как есть', () => {
    expect(chessboardRow(makeUnit({ promotion: 'Рассрочка 0%' }))[14]).toBe('Рассрочка 0%');
  });

  it('нулевая площадь не приводит к делению на ноль — цена за м² пустая', () => {
    expect(chessboardRow(makeUnit({ area: 0 }))[5]).toBe('');
  });

  it('цена за м² округляется до целого, как computeUnitTotalPrice в оригинале', () => {
    // 100 000.00 / 33 = 3030.30…
    expect(chessboardRow(makeUnit({ priceMinorUnits: 10_000_000, area: 33 }))[5]).toBe(3030);
  });
});

describe('sortChessboardUnits', () => {
  it('сортирует корпус → этаж → номер, номера сравниваются numeric-коллацией', () => {
    const sorted = sortChessboardUnits([
      makeUnit({ buildingName: 'Корпус 2', floorNumber: 1, number: 'B-0101' }),
      makeUnit({ buildingName: 'Корпус 1', floorNumber: 10, number: 'A-1001' }),
      makeUnit({ buildingName: 'Корпус 1', floorNumber: 2, number: 'A-0210' }),
      makeUnit({ buildingName: 'Корпус 1', floorNumber: 2, number: 'A-0202' }),
    ]);

    expect(sorted.map((u) => `${u.buildingName}/${u.floorNumber}/${u.number}`)).toEqual([
      'Корпус 1/2/A-0202',
      'Корпус 1/2/A-0210',
      'Корпус 1/10/A-1001',
      'Корпус 2/1/B-0101',
    ]);
  });

  it('не мутирует переданный массив', () => {
    const input = [
      makeUnit({ floorNumber: 5, number: 'A-0501' }),
      makeUnit({ floorNumber: 1, number: 'A-0101' }),
    ];
    sortChessboardUnits(input);

    expect(input[0]!.floorNumber).toBe(5);
  });
});

describe('chessboardFileName', () => {
  it('следует паттерну оригинала: chessboard_<scope>_<дата>.xlsx', () => {
    expect(chessboardFileName('Sea Towers', new Date('2026-08-31T12:00:00.000Z'))).toBe(
      'chessboard_Sea_Towers_2026-08-31.xlsx',
    );
  });

  it('сохраняет кириллицу, включая ё, которую санитайзер оригинала терял', () => {
    expect(chessboardFileName('Зелёный Мыс', new Date('2026-08-31T00:00:00.000Z'))).toBe(
      'chessboard_Зелёный_Мыс_2026-08-31.xlsx',
    );
  });

  it('обрезает слишком длинное имя ЖК до 40 символов', () => {
    const name = 'А'.repeat(80);
    const fileName = chessboardFileName(name, new Date('2026-08-31T00:00:00.000Z'));

    expect(fileName).toBe(`chessboard_${'А'.repeat(40)}_2026-08-31.xlsx`);
  });
});
