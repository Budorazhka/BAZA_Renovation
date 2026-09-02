/**
 * MVP-масштаб (≤40 пользователей, 8ГБ сервер) — консервативные лимиты,
 * не рассчитанные на видео большого объёма. Пересмотреть при появлении
 * реальной потребности в видео-турах объектов (вне текущего scope Stage C).
 */
export const MAX_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024; // 20 МБ

/**
 * ADR-008: magic-byte проверка — единственный источник истины для MIME.
 * Allowlist того, что вообще допустимо загружать в систему (не всё, что
 * file-type умеет распознавать) — сужает поверхность атаки до реально
 * нужных на MVP форматов (фото объектов, документы верификации агентств,
 * планы этажей).
 */
export const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

export const IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

/**
 * purpose → bucket: явный whitelist, не произвольная строка от клиента
 * (ADR-008 требует физическое разделение приватного/публичного —
 * маппинг не может быть решением клиента, иначе документ с приватными
 * данными мог бы быть заявлен как "публичный" запросом).
 */
export const MEDIA_PURPOSE_BUCKET: Record<string, 'private' | 'public'> = {
  unit_photo: 'public',
  floor_plan: 'public',
  agency_document: 'private',
  profile_avatar: 'public',
  property_photo: 'public',
  task_attachment: 'private',
};

