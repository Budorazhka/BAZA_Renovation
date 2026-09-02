/**
 * Утилиты для работы с датами и временем
 * 
 * ВАЖНО: При отправке на бэкенд используй formatLocalDateTime(date) или formatDateForAPI(date)
 * Бэкенд ожидает формат: "YYYY-MM-DDTHH:mm:ss" (без 'Z', без offset)
 * 
 * См. подробную документацию в FRONTEND_API_DOCUMENTATION.md, раздел "4. Даты и часовые пояса"
 */

/**
 * Форматирует локальную дату в ISO строку БЕЗ timezone
 * ИСПОЛЬЗУЙ ЭТУ ФУНКЦИЮ для отправки на бэкенд
 * 
 * @param date - Date объект с локальным временем
 * @returns ISO строка в формате "YYYY-MM-DDTHH:mm:ss" (без timezone)
 * 
 * @example
 * const date = new Date(2025, 11, 28, 14, 30, 0); // 28 декабря 2025, 14:30:00
 * formatLocalDateTime(date); // "2025-12-28T14:30:00"
 */
export function formatLocalDateTime(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

/**
 * Форматирует дату для отправки на API (алиас для formatLocalDateTime)
 * Соответствует рекомендациям из FRONTEND_API_DOCUMENTATION.md
 * 
 * @param date - Date объект с локальным временем
 * @returns ISO строка в формате "YYYY-MM-DDTHH:mm:ss" (без timezone)
 * 
 * @example
 * formatDateForAPI(new Date(2025, 0, 14, 10, 0, 0)); // "2025-01-14T10:00:00"
 */
export function formatDateForAPI(date: Date): string {
  return formatLocalDateTime(date);
}

/**
 * Парсит дату из API в локальную дату для отображения
 * Обрабатывает как строки с timezone (UTC), так и без timezone (локальное время)
 * 
 * @param dateString - ISO строка в формате "YYYY-MM-DDTHH:mm:ss" (с 'Z' или без)
 * @returns Date объект в локальном времени
 * 
 * @example
 * parseDateFromAPI("2025-01-14T10:00:00"); // Date объект в локальном времени
 * parseDateFromAPI("2025-01-14T10:00:00Z"); // Date объект (конвертируется из UTC в локальное время)
 */
export function parseDateFromAPI(dateString: string | null | undefined): Date | null {
  if (!dateString) return null;
  
  // Проверяем, содержит ли строка timezone информацию (Z или offset типа +03:00)
  const hasTimezone = dateString.includes('Z') || /[+-]\d{2}:\d{2}$/.test(dateString);
  
  if (hasTimezone) {
    // Дата с timezone (с бэкенда в UTC) - парсим как есть, JavaScript автоматически конвертирует в локальное время
    return new Date(dateString);
  } else {
    // Локальная дата без timezone - создаем Date объект напрямую из компонентов
    // Формат: "YYYY-MM-DDTHH:mm:ss" или "YYYY-MM-DDTHH:mm"
    const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
    if (match) {
      const [, year, month, day, hours = '0', minutes = '0', seconds = '0'] = match;
      return new Date(
        parseInt(year, 10),
        parseInt(month, 10) - 1,
        parseInt(day, 10),
        parseInt(hours, 10),
        parseInt(minutes, 10),
        parseInt(seconds, 10)
      );
    } else {
      // Fallback на стандартный парсинг
      return new Date(dateString);
    }
  }
}

/**
 * Парсит UTC дату из API в локальную дату для отображения
 * (Устаревшая функция, используйте parseDateFromAPI для лучшей совместимости)
 * 
 * @param utcString - ISO строка в UTC формате (с 'Z' или без)
 * @returns Date объект (автоматически конвертирует в локальное время)
 * 
 * @example
 * parseUtcDate("2025-12-27T19:00:00.000Z"); // Date объект (локальное время будет 00:00 если UTC+5)
 */
export function parseUtcDate(utcString: string): Date {
  const parsed = parseDateFromAPI(utcString);
  return parsed || new Date(utcString); // Fallback для обратной совместимости
}

/**
 * Форматирует дату для input[type="datetime-local"]
 * 
 * @param date - Date объект
 * @returns Строка в формате "YYYY-MM-DDTHH:mm"
 * 
 * @example
 * formatForDateTimeInput(new Date(2025, 11, 28, 14, 30)); // "2025-12-28T14:30"
 */
export function formatForDateTimeInput(date: Date): string {
  return formatLocalDateTime(date).slice(0, 16); // "YYYY-MM-DDTHH:mm"
}

