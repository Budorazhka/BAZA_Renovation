import * as XLSX from 'xlsx'

import type { FinishType, IBuilding, IUnit, UnitFinishPrices, UnitStatus, UnitStatus2 } from '@/types/core'
import { computeUnitTotalPrice, getCurrencySymbol } from './chessboard'
import { normalizeRooms } from './project-options'
import {
  getPrimaryFinishPrice,
  normalizeFinishPrices,
  UNIT_FINISH_TYPES,
} from './unit-finish-pricing'

export interface ImportedRow {
  /** Может быть пустым: файлы застройщиков часто без колонки корпуса —
   * загрузка всё равно идёт в выбранный в диалоге корпус. */
  building: string
  floor: number
  number: string
  rooms?: string
  area?: number
  livingArea?: number
  balconyArea?: number
  view?: string
  pricePerSqm?: number
  price?: number
  finishPrices?: UnitFinishPrices
  status?: UnitStatus2
}

export interface ImportResult {
  rows: ImportedRow[]
  errors: Array<{ row: number; message: string }>
}

/**
 * Русские подписи кондиций для заголовков Excel: шаблоны для застройщиков
 * остаются русскоязычными, а также совпадают с заголовками ранее выгруженных
 * файлов (до перехода на канонические слаги) — импорт старых файлов работает.
 *
 * Объявлено до EXPORT_HEADERS: заголовки считаются на верхнем уровне модуля,
 * и обращение к const ниже по файлу падало бы в temporal dead zone.
 */
const FINISH_LABEL_RU: Record<FinishType, string> = {
  black_frame: 'Черный каркас',
  white_frame: 'Белый каркас',
  green_frame: 'Зеленый каркас',
  renovation: 'С ремонтом',
  turnkey: 'Под ключ',
}

function finishPriceHeader(finishType: FinishType, currency: string = 'USD'): string {
  const sym = getCurrencySymbol(currency)
  return `Цена: ${FINISH_LABEL_RU[finishType]}, ${sym}/м²`
}

function getExportHeaders(currency: string = 'USD'): string[] {
  const sym = getCurrencySymbol(currency)
  return [
    'Корпус',
    'Этаж',
    'Номер',
    'Комнатность',
    'Площадь, м²',
    `Цена за м², ${sym}`,
    ...UNIT_FINISH_TYPES.map((finishType) => finishPriceHeader(finishType, currency)),
    `Базовая цена за м², ${sym}`,
    `Итого, ${sym}`,
    'Статус',
    'Акция',
  ]
}

function getTemplateHeaders(finishTypes: readonly FinishType[], currency: string = 'USD'): string[] {
  const sym = getCurrencySymbol(currency)
  return [
    'Корпус',
    'Этаж',
    'Номер',
    'Комнатность',
    'Площадь, м²',
    `Цена за м², ${sym}`,
    ...finishTypes.map((finishType) => finishPriceHeader(finishType, currency)),
  ]
}

/** Extra English column names per finish type (API / external spreadsheets). */
function finishColumnAliases(finishType: FinishType): string[] {
  switch (finishType) {
    case 'renovation':
      return ['price per sq m renovated']
    case 'turnkey':
      return ['price per sq m turn key', 'price per sq m turnkey']
    default:
      return []
  }
}

const STATUS_RU: Record<UnitStatus, string> = {
  free: 'Свободно',
  booked: 'Бронь',
  sold: 'Продано',
  withdrawn: 'Снято с продажи',
}

const RU_TO_STATUS2: Record<string, UnitStatus2> = {
  'свободно': 'available',
  'available': 'available',
  'free': 'available',
  'бронь': 'booked',
  'в брони': 'reserved',
  'booked': 'booked',
  'reserved': 'reserved',
  'продано': 'sold',
  'sold': 'sold',
  'снято': 'archived',
  'снято с продажи': 'archived',
  'withdrawn': 'archived',
  'hidden': 'hidden',
  'archived': 'archived',
  // Снят с продажи застройщиком — хранится в БД как есть (см. импорт на API).
  'closed': 'closed',
  'закрыто': 'closed',
  'закрыт': 'closed',
}

/** Map API/spreadsheet status to chessboard UI status. */
export function toUnitStatus(status: UnitStatus2): UnitStatus {
  switch (status) {
    case 'available':
      return 'free'
    case 'booked':
    case 'reserved':
      return 'booked'
    case 'sold':
      return 'sold'
    case 'hidden':
    case 'archived':
    case 'closed':
      return 'withdrawn'
  }
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function exportUnitsToXlsx(
  units: IUnit[],
  buildings: IBuilding[],
  scopeLabel: string,
  currency?: string,
): void {
  const effectiveCurrency = currency || units[0]?.currency || 'USD'
  const sym = getCurrencySymbol(effectiveCurrency)
  const buildingNameById = new Map(buildings.map((b) => [b._id, b.name ?? 'Корпус']))

  const rows = units.map((unit) => ({
    'Корпус': buildingNameById.get(unit.building) ?? unit.building,
    'Этаж': unit.floor,
    'Номер': unit.number,
    'Комнатность': unit.rooms ?? '',
    'Площадь, м²': unit.area ?? '',
    [`Цена за м², ${sym}`]: unit.pricePerSqm ?? '',
    ...Object.fromEntries(
      UNIT_FINISH_TYPES.map((finishType) => [
        finishPriceHeader(finishType, effectiveCurrency),
        unit.finishPrices?.[finishType] ?? '',
      ]),
    ),
    [`Базовая цена за м², ${sym}`]: unit.basePricePerSqm ?? '',
    [`Итого, ${sym}`]: computeUnitTotalPrice(unit) ?? '',
    'Статус': STATUS_RU[unit.status],
    'Акция': unit.promotion?.label ?? '',
  }))

  const headers = getExportHeaders(effectiveCurrency)
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers })
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Шахматка')

  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const scopeSafe = scopeLabel.replace(/[^\wа-яА-Я0-9-]+/g, '_').slice(0, 40)
  triggerDownload(blob, `chessboard_${scopeSafe}_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

export function downloadTemplate(finishTypes: readonly FinishType[] = UNIT_FINISH_TYPES, currency: string = 'USD'): void {
  const sym = getCurrencySymbol(currency)
  const sampleRow = {
    'Корпус': 'Block A',
    'Этаж': 1,
    'Номер': 'A-0101',
    'Комнатность': '1+1',
    'Площадь, м²': 58,
    [`Цена за м², ${sym}`]: 2100,
    ...Object.fromEntries(
      finishTypes.map((finishType, index) => [
        finishPriceHeader(finishType, currency),
        2100 + index * 250,
      ]),
    ),
  }

  const headers = getTemplateHeaders(finishTypes, currency)
  const worksheet = XLSX.utils.json_to_sheet([sampleRow], { header: headers })
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Шаблон')

  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  triggerDownload(blob, `chessboard_template_${currency.toLowerCase()}.xlsx`)
}

export function createServerImportFile(rows: ImportedRow[], originalName: string): File {
  const normalizedRows = rows.map((row) => ({
    'section': row.building,
    'floor': row.floor,
    'apart num': row.number,
    'rooms': row.rooms?.trim() ?? '',
    'area': row.area ?? '',
    'area living': row.livingArea ?? '',
    'area balcony': row.balconyArea ?? '',
    'view': row.view ?? '',
    'price per sq m': row.pricePerSqm ?? getPrimaryFinishPrice(row.finishPrices) ?? '',
    'price': row.price ?? '',
    'status': row.status ?? 'available',
  }))
  const baseName = originalName.replace(/\.(xlsx|xls)$/i, '') || 'chessboard'
  const outputName = `${baseName}_normalized.xlsx`
  const worksheet = XLSX.utils.json_to_sheet(normalizedRows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Checkmate')
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  return new File([buffer], outputName, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '' || trimmed === '-' || trimmed === '—') return undefined
    const cleaned = trimmed.replace(/\s+/g, '').replace(',', '.')
    const parsed = Number(cleaned)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function parseApiStatus(value: unknown): UnitStatus2 | undefined {
  if (typeof value !== 'string') return undefined
  return RU_TO_STATUS2[value.trim().toLowerCase()]
}

/**
 * Trim + lowercase Excel column headers, чтобы «Корпус », «STATUS» и «Floor»
 * матчились без учёта регистра (реальные прайсы застройщиков пишут как угодно).
 */
function normalizeRowKeys(rawRow: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(rawRow)) {
    const trimmed = key.trim().toLowerCase()
    if (trimmed) normalized[trimmed] = value
  }
  return normalized
}

/** Case-insensitive lookup by one of several trimmed column names. */
function getCell(row: Record<string, unknown>, ...aliases: string[]): unknown {
  for (const alias of aliases) {
    const key = alias.trim().toLowerCase()
    if (key in row) return row[key]
  }
  return undefined
}

function isBlankCell(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed === '' || trimmed === '-' || trimmed === '—'
  }
  return false
}

/** Skip trailing blank rows in the sheet (no building, floor, number, or other lot fields). */
function isFullyEmptyImportRow(
  building: string,
  floor: number | undefined,
  number: string,
  rooms: string | undefined,
  area: number | undefined,
  pricePerSqm: number | undefined,
  finishPrices: UnitFinishPrices | undefined,
): boolean {
  if (building || number || rooms) return false
  if (typeof floor === 'number') return false
  if (typeof area === 'number' || typeof pricePerSqm === 'number' || finishPrices) return false
  return true
}

export async function parseImportFile(file: File): Promise<ImportResult> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const firstSheetName = workbook.SheetNames[0]
  if (!firstSheetName) {
    return { rows: [], errors: [{ row: 0, message: 'Файл не содержит листов' }] }
  }

  const worksheet = workbook.Sheets[firstSheetName]
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' })

  console.group(`[parseImportFile] ${file.name} — original sheet «${firstSheetName}» (${raw.length} rows)`)
  console.table(raw)
  console.groupEnd()

  const errors: ImportResult['errors'] = []
  const rows: ImportedRow[] = []

  raw.forEach((rawRow, index) => {
    const rowNumber = index + 2 // с учётом строки заголовков
    const row = normalizeRowKeys(rawRow)

    const building = String(getCell(row, 'Корпус', 'section', 'block') ?? '').trim()
    const floor = parseNumber(getCell(row, 'Этаж', 'floor'))
    const number = String(
      getCell(row, 'Номер', 'apart num', 'number', 'apt num', 'apt number', 'apartment', 'apartment number') ?? '',
    ).trim()
    const roomsRaw = getCell(row, 'Комнатность', 'rooms')
    const rooms = normalizeRooms(String(roomsRaw ?? '').trim()) || undefined
    const areaRaw = getCell(row, 'Площадь, м²', 'Площадь', 'area', 'total area')
    const area = parseNumber(areaRaw)
    const livingAreaRaw = getCell(row, 'area living', 'living area')
    const livingArea = parseNumber(livingAreaRaw)
    const balconyAreaRaw = getCell(row, 'area balcony', 'balcony', 'balcony area')
    const balconyArea = parseNumber(balconyAreaRaw)
    const view = String(getCell(row, 'Вид', 'view') ?? '').trim() || undefined
    const pricePerSqmRaw = getCell(
      row,
      'Цена за м², $',
      'Цена за м², €',
      'Цена за м²',
      'Базовая цена за м², $',
      'Базовая цена за м², €',
      'Базовая цена за м²',
      'price per sq m',
      'price per sq/m',
    )
    const totalPriceRaw = getCell(row, 'Итого, $', 'Итого, €', 'Итого', 'price', 'total price')
    const finishPricesRaw = Object.fromEntries(
      UNIT_FINISH_TYPES.map((finishType) => {
        const rawValue = getCell(
          row,
          finishPriceHeader(finishType, 'USD'),
          finishPriceHeader(finishType, 'EUR'),
          `Цена: ${FINISH_LABEL_RU[finishType]}`,
          `Цена ${FINISH_LABEL_RU[finishType]}, $/м²`,
          `Цена ${FINISH_LABEL_RU[finishType]}, €/м²`,
          `Цена ${FINISH_LABEL_RU[finishType]}`,
          ...finishColumnAliases(finishType),
        )
        return [finishType, { rawValue, parsed: parseNumber(rawValue) }]
      }),
    ) as Record<FinishType, { rawValue: unknown; parsed: number | undefined }>
    const finishPrices = normalizeFinishPrices(
      Object.fromEntries(
        UNIT_FINISH_TYPES.map((finishType) => [finishType, finishPricesRaw[finishType].parsed]),
      ),
    )
    const pricePerSqm = parseNumber(pricePerSqmRaw) ?? getPrimaryFinishPrice(finishPrices)
    const price = parseNumber(totalPriceRaw)
    const statusRaw = getCell(row, 'Статус', 'status')
    const status = parseApiStatus(statusRaw) ?? 'available'
    if (isFullyEmptyImportRow(building, floor, number, rooms, area, pricePerSqm, finishPrices)) {
      return
    }

    // «Корпус» опционален: загрузка идёт в корпус, выбранный в диалоге,
    // а прайсы застройщиков часто вовсе без этой колонки.
    if (typeof floor !== 'number') {
      errors.push({ row: rowNumber, message: 'Этаж должен быть числом' })
      return
    }
    if (!number) {
      errors.push({ row: rowNumber, message: 'Пустой «Номер»' })
      return
    }
    if (!isBlankCell(pricePerSqmRaw) && pricePerSqm === undefined) {
      errors.push({ row: rowNumber, message: 'Цена за м² — не число' })
    }
    if (!isBlankCell(totalPriceRaw) && price === undefined) {
      errors.push({ row: rowNumber, message: 'Цена (price) — не число' })
    }
    UNIT_FINISH_TYPES.forEach((finishType) => {
      const { rawValue, parsed } = finishPricesRaw[finishType]
      if (!isBlankCell(rawValue) && parsed === undefined) {
        errors.push({ row: rowNumber, message: `Цена «${finishType}» за м² — не число` })
      }
    })
    if (!isBlankCell(areaRaw) && area === undefined) {
      errors.push({ row: rowNumber, message: 'Площадь — не число' })
    }

    rows.push({ building, floor, number, rooms, area, livingArea, balconyArea, view, pricePerSqm, price, finishPrices, status })
  })

  // Дубли номеров внутри файла
  const seenNumbers = new Map<string, number>()
  rows.forEach((row, index) => {
    const key = row.number
    if (seenNumbers.has(key)) {
      errors.push({
        row: index + 2,
        message: `Номер «${key}» дублируется (уже был в строке ${seenNumbers.get(key)})`,
      })
    } else {
      seenNumbers.set(key, index + 2)
    }
  })

  console.group(`[parseImportFile] ${file.name} — parsed rows (${rows.length} ok, ${errors.length} errors)`)
  console.table(
    rows.map((row) => ({
      building: row.building,
      floor: row.floor,
      number: row.number,
      rooms: row.rooms ?? '',
      area: row.area ?? '',
      pricePerSqm: row.pricePerSqm ?? '',
      price: row.price ?? '',
      status: row.status ?? '',
      finishPrices: row.finishPrices,
    })),
  )
  if (errors.length > 0) {
    console.table(errors)
  }
  console.groupEnd()

  return { rows, errors }
}
