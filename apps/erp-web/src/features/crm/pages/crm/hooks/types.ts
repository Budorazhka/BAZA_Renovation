import type { LeadStage, ProductType } from '../../../services/api';

export type ModalTaskCategory = 'personal' | 'work' | 'all' | string;

export interface LeadStageOverlayState {
  leadId: string;
  leadName: string;
  stageLabel: string;
  stage: LeadStage;
  productType: ProductType;
}

export type ProductTab = 'RP' | 'Net' | 'Owner' | 'Agent';
