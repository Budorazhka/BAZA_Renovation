import { useState, useCallback, useRef } from 'react';
import type { Lead } from '../services/api';
import { DataSyncManager } from '../utils/dataSync';

export interface UseLeadSyncOptions {
  autoSync?: boolean;
  syncInterval?: number;
}

export interface UseLeadSyncReturn {
  leads: Lead[];
  isLoading: boolean;
  isSyncing: boolean;
  updateLead: (id: string, updates: Partial<Lead>, modifiedFields: string[]) => void;
  addLead: (lead: Lead) => void;
  removeLead: (id: string) => void;
  syncWithBackend: (backendLeads: Lead[]) => void;
  clearModifications: (id: string) => void;
  updateLeadAfterSync: (id: string, syncedLead: Lead) => void;
  getModifiedFields: (id: string) => string[];
  isModified: (id: string) => boolean;
}

export function useLeadSync(_options: UseLeadSyncOptions = {}): UseLeadSyncReturn {
  const syncManagerRef = useRef(new DataSyncManager<Lead>());
  const isInitializedRef = useRef(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const updateLead = useCallback((id: string, updates: Partial<Lead>, modifiedFields: string[]) => {
    const manager = syncManagerRef.current;
    modifiedFields.forEach(field => {
      manager.trackModification(id, field, updates);
    });
    setLeads(manager.getData());
  }, []);

  const addLead = useCallback((lead: Lead) => {
    syncManagerRef.current.addItem(lead);
    setLeads(syncManagerRef.current.getData());
  }, []);

  const removeLead = useCallback((id: string) => {
    syncManagerRef.current.removeItem(id);
    setLeads(syncManagerRef.current.getData());
  }, []);

  const syncWithBackend = useCallback((backendLeads: Lead[]) => {
    setIsSyncing(true);
    const manager = syncManagerRef.current;
    
    if (!isInitializedRef.current) {
      manager.initialize(backendLeads);
      isInitializedRef.current = true;
      setLeads(manager.getData());
    } else {
      const { data: synced, hasChanges } = manager.syncFromBackend(backendLeads);
      // Обновляем состояние только если есть реальные изменения
      if (hasChanges) {
        setLeads(synced);
      }
    }
    
    setIsSyncing(false);
  }, []);

  const clearModifications = useCallback((id: string) => {
    syncManagerRef.current.clearModifications(id);
    setLeads(syncManagerRef.current.getData());
  }, []);

  const updateLeadAfterSync = useCallback((id: string, syncedLead: Lead) => {
    const hasChanges = syncManagerRef.current.updateItemAfterSync(id, syncedLead);
    // Обновляем состояние только если данные действительно изменились
    if (hasChanges) {
      setLeads(syncManagerRef.current.getData());
    }
  }, []);

  const getModifiedFields = useCallback((id: string): string[] => {
    return syncManagerRef.current.getModifiedFields(id);
  }, []);

  const isModified = useCallback((id: string): boolean => {
    return syncManagerRef.current.isModified(id);
  }, []);

  return {
    leads,
    isLoading,
    isSyncing,
    updateLead,
    addLead,
    removeLead,
    syncWithBackend,
    clearModifications,
    updateLeadAfterSync,
    getModifiedFields,
    isModified,
  };
}
