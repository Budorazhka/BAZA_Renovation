import { useEffect, useRef, useCallback } from 'react';
import { compareArrays, compareObjects } from '../utils/dataComparison';

interface AutoRefreshOptions<T> {
  fetchData: () => Promise<T>;
  onDataUpdate: (data: T) => void;
  compareFn?: (oldData: T, newData: T) => boolean;
  interval?: number; // в миллисекундах
  enabled?: boolean;
  keyField?: string; // для массивов
  compareFields?: string[]; // для объектов
}

/**
 * Хук для автоматического обновления данных с умным сравнением
 * Обновляет состояние только если данные действительно изменились
 */
export function useAutoRefresh<T>(options: AutoRefreshOptions<T>) {
  const {
    fetchData,
    onDataUpdate,
    compareFn,
    interval = 1500, // 1.5 секунды по умолчанию
    enabled = true,
    keyField = '_id',
    compareFields,
  } = options;

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentDataRef = useRef<T | null>(null);
  const isUpdatingRef = useRef(false);

  const defaultCompareFn = useCallback((oldData: T, newData: T): boolean => {
    if (!oldData || !newData) {
      return oldData === newData;
    }

    // Если это массивы
    if (Array.isArray(oldData) && Array.isArray(newData)) {
      return compareArrays(oldData as any[], newData as any[], keyField, compareFields);
    }

    // Если это объекты
    if (typeof oldData === 'object' && typeof newData === 'object') {
      return compareObjects(oldData as any, newData as any, compareFields);
    }

    // Для примитивов
    return oldData === newData;
  }, [keyField, compareFields]);

  const refreshData = useCallback(async () => {
    if (isUpdatingRef.current) return; // Предотвращаем параллельные обновления
    
    try {
      isUpdatingRef.current = true;
      const newData = await fetchData();
      
      const compare = compareFn || defaultCompareFn;
      const hasChanged = !currentDataRef.current || !compare(currentDataRef.current, newData);
      
      if (hasChanged) {
        currentDataRef.current = newData;
        onDataUpdate(newData);
      }
    } catch (error) {
      console.error('Auto-refresh error:', error);
    } finally {
      isUpdatingRef.current = false;
    }
  }, [fetchData, onDataUpdate, compareFn, defaultCompareFn]);

  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Первая загрузка
    refreshData();

    // Устанавливаем интервал
    intervalRef.current = setInterval(() => {
      refreshData();
    }, interval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, interval, refreshData]);

  return {
    refresh: refreshData,
    stop: () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    },
  };
}

