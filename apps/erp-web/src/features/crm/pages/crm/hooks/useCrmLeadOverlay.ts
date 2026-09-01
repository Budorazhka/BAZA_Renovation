import { useState, useCallback, useRef, useEffect } from 'react';
import { LeadStage, ProductType } from '../../../services/api';
import type { Lead } from '../../../services/api';
import type { LeadStageOverlayState, ProductTab } from './types';

export interface UseCrmLeadOverlayParams {
  setSelectedProductForLibrary: (product: ProductTab) => void;
  previousProductRef: React.MutableRefObject<ProductTab | null>;
  backendLeads: Lead[];
}

export function useCrmLeadOverlay({
  setSelectedProductForLibrary,
  previousProductRef,
  backendLeads,
}: UseCrmLeadOverlayParams) {
  const [leadStageOverlay, setLeadStageOverlay] = useState<LeadStageOverlayState | null>(null);
  const [showCloseChecklistConfirm, setShowCloseChecklistConfirm] = useState(false);
  const leadStageOverlayTimeoutRef = useRef<number | null>(null);

  const handleLeadStageChange = useCallback((leadId: string, leadName: string, stageLabel: string, stage: LeadStage, productType: ProductType) => {
    // Только явное 'false' в localStorage отключает открытие чеклиста (см. LeadsBlock).
    const checklistOff = (localStorage.getItem('leadsShowChecklist') ?? '').trim() === 'false';
    if (checklistOff) return;
    if (leadStageOverlayTimeoutRef.current) {
      clearTimeout(leadStageOverlayTimeoutRef.current);
      leadStageOverlayTimeoutRef.current = null;
    }
    const productForLibrary: ProductTab = productType === ProductType.NETWORK ? 'Net' : productType === ProductType.OWNER ? 'Owner' : productType === ProductType.AGENT ? 'Agent' : 'RP';
    setSelectedProductForLibrary(productForLibrary);
    previousProductRef.current = productForLibrary;
    setLeadStageOverlay({ leadId, leadName, stageLabel, stage, productType });
  }, [setSelectedProductForLibrary, previousProductRef]);

  const handleCloseOverlay = useCallback(() => {
    if (leadStageOverlayTimeoutRef.current) {
      clearTimeout(leadStageOverlayTimeoutRef.current);
      leadStageOverlayTimeoutRef.current = null;
    }
    setLeadStageOverlay(null);
  }, []);

  const handleConfirmCloseChecklist = useCallback(() => {
    if (leadStageOverlayTimeoutRef.current) {
      clearTimeout(leadStageOverlayTimeoutRef.current);
      leadStageOverlayTimeoutRef.current = null;
    }
    setLeadStageOverlay(null);
    setShowCloseChecklistConfirm(false);
  }, []);

  const handleCancelCloseChecklist = useCallback(() => {
    setShowCloseChecklistConfirm(false);
  }, []);

  useEffect(() => {
    if (!leadStageOverlay) return;
    const leadExists = backendLeads.some((lead) => lead._id === leadStageOverlay.leadId);
    if (!leadExists) {
      if (leadStageOverlayTimeoutRef.current) {
        clearTimeout(leadStageOverlayTimeoutRef.current);
        leadStageOverlayTimeoutRef.current = null;
      }
      setLeadStageOverlay(null);
    }
  }, [backendLeads, leadStageOverlay]);

  useEffect(() => {
    return () => {
      if (leadStageOverlayTimeoutRef.current) {
        clearTimeout(leadStageOverlayTimeoutRef.current);
      }
    };
  }, []);

  return {
    leadStageOverlay,
    setLeadStageOverlay,
    showCloseChecklistConfirm,
    setShowCloseChecklistConfirm,
    handleLeadStageChange,
    handleCloseOverlay,
    handleConfirmCloseChecklist,
    handleCancelCloseChecklist,
    leadStageOverlayTimeoutRef,
  };
}

export type UseCrmLeadOverlayReturn = ReturnType<typeof useCrmLeadOverlay>;
