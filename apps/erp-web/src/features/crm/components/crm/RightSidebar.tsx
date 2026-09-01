import React from 'react';
import LeadStageChecklist from './LeadStageChecklist';
import type { LeadStage, ProductType } from '../../services/api';

interface RightSidebarProps {
  leadStageOverlay: { 
    leadId: string; 
    leadName: string; 
    stageLabel: string; 
    stage: LeadStage; 
    productType: ProductType 
  } | null;
  onCloseOverlay: () => void;
  onShowCloseChecklistConfirm: () => void;
  selectedProductForLibrary: 'RP' | 'Net';
}

export const RightSidebar: React.FC<RightSidebarProps> = ({
  leadStageOverlay,
  onCloseOverlay,
  onShowCloseChecklistConfirm,
  selectedProductForLibrary,
}) => {
  return (
    <div className="flex flex-col gap-y-2 w-full crm-right-col">
      {leadStageOverlay && (
        <LeadStageChecklist
          leadId={leadStageOverlay.leadId}
          leadName={leadStageOverlay.leadName}
          stageLabel={leadStageOverlay.stageLabel}
          stage={leadStageOverlay.stage}
          productType={leadStageOverlay.productType}
          selectedProduct={selectedProductForLibrary}
          onClose={() => {
            onShowCloseChecklistConfirm();
          }}
          onDirectClose={() => {
            onCloseOverlay();
          }}
        />
      )}
    </div>
  );
};

