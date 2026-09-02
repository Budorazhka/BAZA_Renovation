import { useState, useRef, useCallback } from 'react';
import type { Task } from '../services/api';
import { DataSyncManager } from '../utils/dataSync';

export interface UseTaskSyncOptions {
  autoSync?: boolean;
  syncInterval?: number;
}

export interface UseTaskSyncReturn {
  tasks: Task[];
  isLoading: boolean;
  isSyncing: boolean;
  updateTask: (id: string, updates: Partial<Task>, modifiedFields: string[]) => void;
  addTask: (task: Task) => void;
  removeTask: (id: string) => void;
  syncWithBackend: (backendTasks: Task[]) => void;
  clearModifications: (id: string) => void;
  updateTaskAfterSync: (id: string, syncedTask: Task) => void;
  getModifiedFields: (id: string) => string[];
  isModified: (id: string) => boolean;
}

export function useTaskSync(_options: UseTaskSyncOptions = {}): UseTaskSyncReturn {
  const syncManagerRef = useRef(new DataSyncManager<Task>());
  const isInitializedRef = useRef(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const updateTask = useCallback((id: string, updates: Partial<Task>, modifiedFields: string[]) => {
    const manager = syncManagerRef.current;
    // Обновляем все поля сразу, а не по одному
    modifiedFields.forEach(field => {
      manager.trackModification(id, field, updates);
    });
    // Принудительно обновляем состояние после всех изменений
    const updatedData = manager.getData();
    setTasks(updatedData);
  }, []);

  const addTask = useCallback((task: Task) => {
    syncManagerRef.current.addItem(task);
    setTasks(syncManagerRef.current.getData());
  }, []);

  const removeTask = useCallback((id: string) => {
    syncManagerRef.current.removeItem(id);
    setTasks(syncManagerRef.current.getData());
  }, []);

  const syncWithBackend = useCallback((backendTasks: Task[]) => {
    setIsSyncing(true);
    const manager = syncManagerRef.current;
    
    if (!isInitializedRef.current) {
      manager.initialize(backendTasks);
      isInitializedRef.current = true;
      setTasks(manager.getData());
    } else {
      const { data: synced, hasChanges } = manager.syncFromBackend(backendTasks);
      // Обновляем состояние только если есть реальные изменения
      if (hasChanges) {
        setTasks(synced);
      }
    }
    
    setIsSyncing(false);
  }, []);

  const clearModifications = useCallback((id: string) => {
    syncManagerRef.current.clearModifications(id);
    setTasks(syncManagerRef.current.getData());
  }, []);

  const updateTaskAfterSync = useCallback((id: string, syncedTask: Task) => {
    const hasChanges = syncManagerRef.current.updateItemAfterSync(id, syncedTask);
    // Обновляем состояние только если данные действительно изменились
    if (hasChanges) {
      setTasks(syncManagerRef.current.getData());
    }
  }, []);

  const getModifiedFields = useCallback((id: string): string[] => {
    return syncManagerRef.current.getModifiedFields(id);
  }, []);

  const isModified = useCallback((id: string): boolean => {
    return syncManagerRef.current.isModified(id);
  }, []);

  return {
    tasks,
    isLoading,
    isSyncing,
    updateTask,
    addTask,
    removeTask,
    syncWithBackend,
    clearModifications,
    updateTaskAfterSync,
    getModifiedFields,
    isModified,
  };
}
