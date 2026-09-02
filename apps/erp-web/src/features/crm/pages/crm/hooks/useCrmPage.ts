import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../hooks/useAuth';
import { useSocketConnection } from '../../../hooks/useSocketConnection';
import { useCrmData } from './useCrmData';
import { useCrmLeadOverlay } from './useCrmLeadOverlay';
import { useCrmTaskForm } from './useCrmTaskForm';
import { useCrmModals } from './useCrmModals';
import type { ProductTab } from './types';

/**
 * Composes all CRM page hooks and returns a single object with the same shape
 * expected by PageCrmFullDesign and CrmModals.
 */
export function useCrmPage() {
  const auth = useAuth();
  const { isAuthenticated, isLoading: authLoading, user, logout } = auth;
  const [searchParams, setSearchParams] = useSearchParams();
  const { mode: connectionMode } = useSocketConnection();

  const data = useCrmData({ isAuthenticated });

  const [selectedProductForLibrary, setSelectedProductForLibrary] = useState<ProductTab>('RP');
  const previousProductRef = useRef<ProductTab | null>(null);

  const leadOverlay = useCrmLeadOverlay({
    setSelectedProductForLibrary,
    previousProductRef,
    backendLeads: data.backendLeads,
  });

  const onTaskCreatedRef = useRef<(() => void) | null>(null);
  const onRequestCloseModalRef = useRef<(() => void) | null>(null);

  const taskForm = useCrmTaskForm({
    data,
    user,
    onTaskCreatedRef,
    onRequestCloseModalRef,
  });

  const modals = useCrmModals({
    data,
    taskForm,
    leadOverlay,
    searchParams,
    setSearchParams,
    isAuthenticated,
  });

  useEffect(() => {
    onTaskCreatedRef.current = modals.closeTaskModals;
    onRequestCloseModalRef.current = modals.handleCloseModal;
  }, [modals.closeTaskModals, modals.handleCloseModal]);

  // Баннер о смене режима соединения (websocket/http) намеренно отключён —
  // показывался при каждом подключении сокета и мешал. Состояние оставлено
  // в API хука на случай, если потребуется вернуть, но никогда не выставляется.
  const [showConnectionNotification, setShowConnectionNotification] = useState(false);

  return {
    isAuthenticated,
    authLoading,
    logout,
    user,
    searchParams,
    setSearchParams,
    connectionMode,
    showConnectionNotification,
    setShowConnectionNotification,
    ...data,
    ...leadOverlay,
    ...taskForm,
    ...modals,
    selectedProductForLibrary,
    setSelectedProductForLibrary,
    previousProductRef,
  };
}
