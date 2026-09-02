import { LeadStage, ProductType } from '@/features/crm/services/api/types';
import type { Lead as CrmLead, LeadHistory as CrmHistory } from '@/features/crm/services/api/types';
import type { Lead as PokerLead, LeadSource, LeadStageId, LeadEvent } from '@/types/leads';

/**
 * Маппинг ProductType (CRM) -> LeadSource (Poker)
 */
export const CRM_PRODUCT_TO_POKER_SOURCE: Record<ProductType, LeadSource> = {
  [ProductType.SALES]: 'primary',
  [ProductType.NETWORK]: 'secondary',
  [ProductType.OWNER]: 'rent',
  [ProductType.AGENT]: 'ad_campaigns',
};

/**
 * Маппинг LeadSource (Poker) -> ProductType (CRM)
 */
export const POKER_SOURCE_TO_CRM_PRODUCT: Record<LeadSource, ProductType> = {
  primary: ProductType.SALES,
  secondary: ProductType.NETWORK,
  rent: ProductType.OWNER,
  ad_campaigns: ProductType.AGENT,
};

/**
 * Маппинг LeadStage (CRM) -> LeadStageId (Poker)
 * Основано на statusToLeadStageMap в LeadsBlock.tsx для RP (sales)
 */
export const CRM_STAGE_TO_POKER_ID: Record<string, LeadStageId> = {
  [LeadStage.NEEDS_ANALYSIS]: 'new',
  [LeadStage.PRESENTATION]: 'callback',
  [LeadStage.PROPOSAL]: 'presented',
  [LeadStage.NEGOTIATION]: 'country_discussed',
  [LeadStage.DECISION_MAKING]: 'need_identified',
  [LeadStage.CONTRACT_SIGNING]: 'need_adjusted',
  [LeadStage.ONBOARDING]: 'kp_sent',
  [LeadStage.NEEDS_ANALYSIS1]: 'objections',
  [LeadStage.PRESENTATION1]: 'deferred',
  [LeadStage.PROPOSAL1]: 'warmup',
  [LeadStage.NEGOTIATION1]: 'showing',
  [LeadStage.DECISION_MAKING1]: 'deposit',
  [LeadStage.CONTRACT_SIGNING1]: 'deal',
  [LeadStage.DEAL_CLOSED]: 'golden',
  [LeadStage.POST_PURCHASE_FOLLOWUP]: 'check_in',
  [LeadStage.SATISFACTION_CHECK]: 'referral',
  [LeadStage.UPSELL_OPPORTUNITY]: 'new_deals',
  [LeadStage.REJECTED]: 'defective',
  [LeadStage.FIRST_CONTACT]: 'refused',
  [LeadStage.QUALIFICATION]: 'no_answer_3',
  [LeadStage.REJECTED1]: 'no_answer_2',
  [LeadStage.FIRST_CONTACT1]: 'no_answer_1',
};

/**
 * Реверс-маппинг PokerStageId -> LeadStage (CRM)
 */
export const POKER_ID_TO_CRM_STAGE: Record<LeadStageId, LeadStage> = Object.entries(CRM_STAGE_TO_POKER_ID).reduce(
  (acc, [crmStage, pokerId]) => {
    acc[pokerId] = crmStage as LeadStage;
    return acc;
  },
  {} as Record<LeadStageId, LeadStage>
);

/**
 * Адаптер: CRM Lead History -> Poker Lead Event
 */
export function mapCrmHistoryToPokerEvent(h: CrmHistory, index: number): LeadEvent {
  return {
    id: `evt-crm-${index}`,
    type: 'stage_change',
    timestamp: h.changedAt,
    authorId: h.changedBy,
    authorName: h.userName || 'Менеджер',
    payload: {
      fromStage: CRM_STAGE_TO_POKER_ID[h.fromStage],
      toStage: CRM_STAGE_TO_POKER_ID[h.toStage],
      comment: h.comment,
    },
  };
}

/**
 * Адаптер: CRM Lead -> Poker Lead
 */
export function mapCrmLeadToPoker(crmLead: CrmLead): PokerLead {
  return {
    id: crmLead._id,
    name: crmLead.name,
    phone: crmLead.phone,
    createdAt: crmLead.createdAt,
    updatedAt: crmLead.updatedAt,
    source: CRM_PRODUCT_TO_POKER_SOURCE[crmLead.productType] || 'primary',
    stageId: CRM_STAGE_TO_POKER_ID[crmLead.stage] || 'new',
    managerId: typeof crmLead.assignedTo === 'string' ? crmLead.assignedTo : (crmLead.assignedTo as any)?._id || null,
    commissionUsd: crmLead.dealValue || crmLead.budgetValue || 0,
    hasTask: (crmLead as any).hasTask ?? false, 
    taskOverdue: (crmLead as any).taskOverdue ?? false,
    status: 'in_progress',
  };
}

/**
 * Возвращает соответствующую CRM-стадию для этапа покера с учетом типа продукта
 */
export function mapPokerIdToCrmStage(pokerId: string, productType: ProductType): LeadStage | null {
  if (productType === ProductType.SALES) {
    switch (pokerId) {
      case 'new': return LeadStage.NEEDS_ANALYSIS;
      case 'callback': return LeadStage.PRESENTATION;
      case 'presented': return LeadStage.PROPOSAL;
      case 'country_discussed': return LeadStage.NEGOTIATION;
      case 'need_identified': return LeadStage.DECISION_MAKING;
      case 'need_adjusted': return LeadStage.CONTRACT_SIGNING;
      case 'kp_sent': return LeadStage.ONBOARDING;
      case 'objections': return LeadStage.NEEDS_ANALYSIS1;
      case 'deferred': return LeadStage.PRESENTATION1;
      case 'warmup': return LeadStage.PROPOSAL1;
      case 'showing': return LeadStage.NEGOTIATION1;
      case 'deposit': return LeadStage.DECISION_MAKING1;
      case 'deal': return LeadStage.CONTRACT_SIGNING1;
      case 'golden': return LeadStage.DEAL_CLOSED;
      case 'check_in': return LeadStage.POST_PURCHASE_FOLLOWUP;
      case 'referral': return LeadStage.SATISFACTION_CHECK;
      case 'new_deals': return LeadStage.UPSELL_OPPORTUNITY;
      case 'defective': return LeadStage.REJECTED;
      case 'refused': return LeadStage.FIRST_CONTACT;
      case 'no_answer_3': return LeadStage.QUALIFICATION;
      case 'no_answer_2': return LeadStage.REJECTED1;
      case 'no_answer_1': return LeadStage.FIRST_CONTACT1;
    }
  } else if (productType === ProductType.NETWORK) {
    switch (pokerId) {
      case 'new': return LeadStage.NETWORK_NEW_LEAD;
      case 'callback': return LeadStage.NETWORK_CALL_LATER;
      case 'presented': return LeadStage.NETWORK_COMPANY_PRESENTED;
      case 'country_discussed': return LeadStage.NETWORK_PLATFORM_PRESENTED;
      case 'need_identified': return LeadStage.NETWORK_OFFER_GIVEN;
      case 'need_adjusted': return LeadStage.NETWORK_OBJECTIONS;
      case 'kp_sent': return LeadStage.NETWORK_DEFERRED_DEMAND;
      case 'objections': return LeadStage.NETWORK_AGREEMENT;
      case 'deferred': return LeadStage.NETWORK_FORM_FILLED;
      case 'warmup': return LeadStage.NETWORK_ACCOUNT_REGISTERED;
      case 'showing': return LeadStage.NETWORK_OFFER_SIGNED;
      case 'deposit': return LeadStage.NETWORK_WORK_STARTED;
      case 'defective': return LeadStage.NETWORK_REJECTED_DEFECTIVE;
      case 'refused': return LeadStage.NETWORK_REJECTED;
      case 'no_answer_3': return LeadStage.NETWORK_NO_CALL_3;
      case 'no_answer_2': return LeadStage.NETWORK_NO_CALL_2;
      case 'no_answer_1': return LeadStage.NETWORK_NO_CALL_1;
    }
  } else if (productType === ProductType.OWNER) {
    switch (pokerId) {
      case 'new': return LeadStage.OWNER_NEW_OWNER;
      case 'callback': return LeadStage.OWNER_CALL_LATER;
      case 'presented': return LeadStage.OWNER_COMPANY_PRESENTED;
      case 'country_discussed': return LeadStage.OWNER_OBJECT_DISCUSSED;
      case 'need_identified': return LeadStage.OWNER_PHOTO_PROPOSED;
      case 'need_adjusted': return LeadStage.OWNER_EXCLUSIVE_PROPOSED;
      case 'kp_sent': return LeadStage.OWNER_OBJECTIONS;
      case 'objections': return LeadStage.OWNER_AGREED;
      case 'deferred': return LeadStage.OWNER_ACTIVE_FOR_SALE;
      case 'warmup': return LeadStage.OWNER_GET_REFERRAL;
      case 'showing': return LeadStage.OWNER_NEW_OBJECT_INQUIRY;
      case 'defective': return LeadStage.OWNER_REJECTED_DEFECTIVE;
      case 'refused': return LeadStage.OWNER_REJECTED_OWNER;
      case 'no_answer_3': return LeadStage.OWNER_NO_CALL_3;
      case 'no_answer_2': return LeadStage.OWNER_NO_CALL_2;
      case 'no_answer_1': return LeadStage.OWNER_NO_CALL_1;
    }
  } else if (productType === ProductType.AGENT) {
    switch (pokerId) {
      case 'new': return LeadStage.AGENT_NEW_AGENT;
      case 'callback': return LeadStage.AGENT_CALL_LATER;
      case 'presented': return LeadStage.AGENT_COMPANY_PRESENTED;
      case 'country_discussed': return LeadStage.AGENT_FORMAT;
      case 'need_identified': return LeadStage.AGENT_OBJECTIONS;
      case 'need_adjusted': return LeadStage.AGENT_AGREED;
      case 'kp_sent': return LeadStage.AGENT_ACTIVE;
      case 'defective': return LeadStage.AGENT_REJECTED_DEFECTIVE;
      case 'refused': return LeadStage.AGENT_REJECTED;
      case 'no_answer_3': return LeadStage.AGENT_NO_CALL_3;
      case 'no_answer_2': return LeadStage.AGENT_NO_CALL_2;
      case 'no_answer_1': return LeadStage.AGENT_NO_CALL_1;
    }
  }
  return null;
}
