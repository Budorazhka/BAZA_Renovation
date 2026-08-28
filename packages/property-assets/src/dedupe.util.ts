import type { PropertyAssetDocument } from './schemas/property-asset.schema';
import type { DuplicateSignals } from './repository/duplicate-candidate.repository';

/**
 * DEDUPE-001 (owner decision xlsx #58): "признаки дубля — телефон
 * собственника, адрес, включая этаж и площадь и комнатность". Чистая
 * функция — не знает про Mongo/repository, тестируется без единого мока
 * (тот же принцип, что admin-publication-scope-filter.ts).
 *
 * normalizePhone/normalizeAddress — минимальная нормализация (убрать
 * пробелы/регистр/пунктуацию для адреса, оставить только цифры для
 * телефона) — не полноценный geocoding/phone-parsing (libphonenumber и
 * т.п. не подключены, вне scope этой задачи, не устанавливать зависимости
 * без разрешения). Технически упрощённое решение первого прохода, не
 * owner decision — зафиксировано явно.
 */
export function normalizePhone(phone: string): string {
  return phone.replace(/[^\d]/g, '');
}

export function normalizeAddress(address: string): string {
  return address.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * "Явный дубль" (master plan разд.2.3) — определяется как СОВПАДЕНИЕ
 * телефона представителя ИЛИ (нормализованный адрес + этаж/площадь/
 * комнатность) — не любое частичное совпадение. Один только совпадающий
 * адрес без совпадения этажа/площади/комнатности — разные квартиры в
 * одном доме, не дубль. Один только совпадающий телефон без совпадения
 * адреса — тот же человек продаёт РАЗНЫЕ объекты, тоже не дубль сам по
 * себе (но phoneMatch=true само по себе уже сильный сигнал — см.
 * computeIsBlockingDuplicate ниже).
 */
export function computeDuplicateSignals(
  candidate: Pick<PropertyAssetDocument, 'representativePhone' | 'location' | 'characteristics'>,
  other: Pick<PropertyAssetDocument, 'representativePhone' | 'location' | 'characteristics'>,
): DuplicateSignals {
  const phoneMatch = normalizePhone(candidate.representativePhone) === normalizePhone(other.representativePhone);
  const addressMatch =
    candidate.location.city.trim().toLowerCase() === other.location.city.trim().toLowerCase() &&
    normalizeAddress(candidate.location.address) === normalizeAddress(other.location.address);
  const roomsAreaFloorMatch =
    addressMatch &&
    candidate.characteristics.area === other.characteristics.area &&
    candidate.characteristics.rooms === other.characteristics.rooms &&
    candidate.characteristics.floor === other.characteristics.floor;

  return { phoneMatch, addressMatch, roomsAreaFloorMatch };
}

/**
 * "Явный дубль блокирует публикацию" (master plan разд.2.3) — граница
 * между "стоит показать admin'у для проверки" (detected, не блокирует
 * САМО ОБНАРУЖЕНИЕ создания) и "достаточно явно, чтобы блокировать
 * publish без ручного подтверждения". Explicit signal (не совпадение
 * одного слабого признака): phoneMatch ИЛИ (addressMatch И
 * roomsAreaFloorMatch) — тот же физический адрес с теми же характеристиками
 * почти наверняка тот же объект, даже если телефон представителя другой
 * (например, один и тот же объект выставлен и собственником, и его
 * риэлтором с разными номерами).
 */
export function isExplicitDuplicateSignal(signals: DuplicateSignals): boolean {
  return signals.phoneMatch || (signals.addressMatch && signals.roomsAreaFloorMatch);
}
