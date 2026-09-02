import { apiService } from '../services/api';

// Хранилище таймеров для каждого лида
const historyTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
// Хранилище данных для записи в историю
const pendingHistoryEntries: Map<string, { message: string; comment?: string }> = new Map();

const HISTORY_DELAY = 30000; // 30 секунд

/**
 * Отложенная запись в историю лида
 * Запись происходит через 30 секунд после последнего изменения
 * Если в течение 30 секунд приходит новый запрос для того же лида, предыдущий отменяется
 */
export const addLeadHistoryEntryDebounced = (
  leadId: string,
  data: { message: string; comment?: string }
): void => {
  // Отменяем предыдущий таймер для этого лида, если он есть
  const existingTimer = historyTimers.get(leadId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  // Сохраняем данные для записи
  pendingHistoryEntries.set(leadId, data);

  // Устанавливаем новый таймер на 30 секунд
  const timer = setTimeout(async () => {
    const entry = pendingHistoryEntries.get(leadId);
    if (entry) {
      try {
        await apiService.addLeadHistoryEntry(leadId, entry);
      } catch (error) {
        console.error(`[leadHistoryDebounce] Failed to add history entry for lead ${leadId}:`, error);
      } finally {
        // Очищаем данные после записи
        pendingHistoryEntries.delete(leadId);
        historyTimers.delete(leadId);
      }
    }
  }, HISTORY_DELAY);

  historyTimers.set(leadId, timer);
};

/**
 * Немедленная запись в историю (без задержки)
 * Используется когда нужно записать сразу, например при закрытии модалки
 */
export const flushLeadHistory = async (leadId: string): Promise<void> => {
  const timer = historyTimers.get(leadId);
  if (timer) {
    clearTimeout(timer);
    historyTimers.delete(leadId);
  }

  const entry = pendingHistoryEntries.get(leadId);
  if (entry) {
    try {
      await apiService.addLeadHistoryEntry(leadId, entry);
    } catch (error) {
      console.error(`[leadHistoryDebounce] Failed to flush history entry for lead ${leadId}:`, error);
    } finally {
      pendingHistoryEntries.delete(leadId);
    }
  }
};

/**
 * Отмена отложенной записи в историю
 */
export const cancelLeadHistoryEntry = (leadId: string): void => {
  const timer = historyTimers.get(leadId);
  if (timer) {
    clearTimeout(timer);
    historyTimers.delete(leadId);
  }
  pendingHistoryEntries.delete(leadId);
};

