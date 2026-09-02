import type { CommerceTierId } from './promotionPackages'

const TIER_KEY = 'developer.sales.commerceTier'
export const SALES_PROJECT_ID_KEY = 'developer.sales.selectedProjectId'

export function loadCommerceTier(): CommerceTierId {
  try {
    const v = localStorage.getItem(TIER_KEY)
    if (v === 'entry' || v === 'pro' || v === 'max') return v
  } catch {
    /* ignore */
  }
  return 'entry'
}

export function saveCommerceTier(tier: CommerceTierId): void {
  try {
    localStorage.setItem(TIER_KEY, tier)
  } catch {
    /* ignore */
  }
}

export function broadcastStorageKey(projectId: string): string {
  return `developer.sales.broadcasts.${projectId}`
}

export function promotionRequestsKey(projectId: string): string {
  return `developer.sales.promoRequests.${projectId}`
}

export function installmentsKey(projectId: string): string {
  return `developer.sales.installments.${projectId}`
}

export function bookingsKey(projectId: string): string {
  return `developer.sales.bookings.v3.${projectId}`
}
