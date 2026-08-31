/**
 * docs/architecture/domain-model.md & DEAL-001.
 * Fixed stages for Deal lifecycle in BAZA CRM.
 */
export const DEAL_STAGES = [
  'showing',
  'deposit',
  'deal',
  'golden',
  'check_in',
  'referral',
  'closed_lost',
] as const;

export type DealStage = (typeof DEAL_STAGES)[number];

/**
 * Valid stage transitions for Deal lifecycle.
 * - showing -> deposit, closed_lost
 * - deposit -> showing, deal, closed_lost
 * - deal -> golden, closed_lost
 * - golden -> check_in, closed_lost
 * - check_in -> referral, closed_lost
 * - referral -> closed_lost
 * - closed_lost -> [] (terminal stage, cannot transition out)
 */
export const DEAL_STAGE_TRANSITIONS: Record<DealStage, readonly DealStage[]> = {
  showing: ['deposit', 'closed_lost'],
  deposit: ['showing', 'deal', 'closed_lost'],
  deal: ['golden', 'closed_lost'],
  golden: ['check_in', 'closed_lost'],
  check_in: ['referral', 'closed_lost'],
  referral: ['closed_lost'],
  closed_lost: [],
};
