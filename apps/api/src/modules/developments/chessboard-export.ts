import type { Currency } from '@baza/contracts';
import type { UnitStatus } from './schemas/unit.schema';

/**
 * Формат выгрузки шахматки воспроизводит уже существующий в bz26-client-erp
 * (`src/lib/chessboard-xlsx.ts`, `exportUnitsToXlsx`) — владелец решил
 * 31.08.2026 брать формат оттуда, чтобы выгрузка из BAZA открывалась и
 * считалась привычным для команды образом и принималась тем же импортёром:
 * лист `Шахматка`, те же 15 колонок в том же порядке, те же русские
 * подписи статусов, никаких стилей/заголовочных строк/итогов (там
 * используется SheetJS Community, который стили игнорирует в принципе).
 *
 * Три сознательных расхождения с оригиналом:
 *
 * 1. Пять колонок цен по кондициям и «Базовая цена за м²» ВСЕГДА пустые —
 *    в доменной модели BAZA (UnitDocument) нет ни finishPrices, ни
 *    basePricePerSqm, у юнита ровно одна цена. Колонки сохранены (владелец
 *    подтвердил 31.08.2026) ради совместимости формы файла с тем ERP.
 * 2. «Цена за м²» ВЫЧИСЛЯЕТСЯ (цена / площадь), а не читается — BAZA хранит
 *    только итоговую цену юнита. Округление до целого — то же поведение,
 *    что computeUnitTotalPrice в оригинале (он считает обратную величину
 *    через Math.round).
 * 3. Строки СОРТИРУЮТСЯ (корпус → этаж → номер). Оригинал не сортирует
 *    вообще (пишет в порядке прихода из стора), что для выгрузки ЖК
 *    целиком, а не одного корпуса, делает файл нечитаемым.
 *
 * Суммы конвертируются из minor units в основные (÷100): API хранит деньги
 * целочисленно (conventions.md разд.1 «Никогда JS float для сумм»), а в
 * выгрузке нужны привычные human-readable числа, как в оригинале.
 */

export const CHESSBOARD_SHEET_NAME = 'Шахматка';

const FINISH_LABELS_RU = [
  'Черный каркас',
  'Белый каркас',
  'Зеленый каркас',
  'С ремонтом',
  'Под ключ',
] as const;

/**
 * hidden → «Снято с продажи»: у оригинала на этом месте `withdrawn`, у BAZA
 * `hidden` — модерационный статус вне продажного цикла (UnitDocument
 * докстринг), то есть та же семантика «в продаже не участвует».
 */
const STATUS_RU: Record<UnitStatus, string> = {
  available: 'Свободно',
  reserved: 'Бронь',
  sold: 'Продано',
  hidden: 'Снято с продажи',
};

const CURRENCY_SYMBOL: Record<Currency, string> = {
  USD: '$',
  GEL: '₾',
  RUB: '₽',
};

export function chessboardHeaders(currency: Currency): string[] {
  const symbol = CURRENCY_SYMBOL[currency];
  return [
    'Корпус',
    'Этаж',
    'Номер',
    'Комнатность',
    'Площадь, м²',
    `Цена за м², ${symbol}`,
    ...FINISH_LABELS_RU.map((label) => `Цена: ${label}, ${symbol}/м²`),
    `Базовая цена за м², ${symbol}`,
    `Итого, ${symbol}`,
    'Статус',
    'Акция',
  ];
}

export interface ChessboardUnitInput {
  buildingName: string;
  floorNumber: number;
  number: string;
  rooms?: number;
  area: number;
  priceMinorUnits: number;
  status: UnitStatus;
  promotion?: string;
}

type CellValue = string | number;

export function chessboardRow(unit: ChessboardUnitInput): CellValue[] {
  const total = unit.priceMinorUnits / 100;
  const pricePerSqm = unit.area > 0 ? Math.round(total / unit.area) : '';

  return [
    unit.buildingName,
    unit.floorNumber,
    unit.number,
    unit.rooms ?? '',
    unit.area,
    pricePerSqm,
    '',
    '',
    '',
    '',
    '',
    '',
    total,
    STATUS_RU[unit.status],
    unit.promotion ?? '',
  ];
}

/**
 * Порядок: корпус → этаж → номер. Номер сравнивается numeric-коллацией,
 * иначе «10» встаёт перед «2» (номера юнитов — строки: «A-0101», «12А»).
 */
export function sortChessboardUnits(units: ChessboardUnitInput[]): ChessboardUnitInput[] {
  return [...units].sort(
    (a, b) =>
      a.buildingName.localeCompare(b.buildingName, 'ru') ||
      a.floorNumber - b.floorNumber ||
      a.number.localeCompare(b.number, 'ru', { numeric: true }),
  );
}

/**
 * Паттерн имени файла — из оригинала (`chessboard_<scope>_<YYYY-MM-DD>.xlsx`),
 * в роли scope здесь имя ЖК: выгрузка всегда по ЖК целиком, а не по корпусу.
 * Санитайзер тот же, но с явно добавленными ё/Ё — в оригинале они выпадали
 * из диапазона [а-яА-Я] и заменялись подчёркиванием.
 */
export function chessboardFileName(developmentName: string, exportedAt: Date): string {
  const scope = developmentName.replace(/[^\wа-яА-ЯёЁ0-9-]+/g, '_').slice(0, 40);
  return `chessboard_${scope}_${exportedAt.toISOString().slice(0, 10)}.xlsx`;
}
