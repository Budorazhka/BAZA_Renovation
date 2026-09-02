export interface LeadSortItem {
  id: string;
  createdAt?: string;
  updatedAt?: string;
  backendIndex?: number;
}

function toTimestamp(value?: string): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function compareLeadListOrder(
  a: LeadSortItem,
  b: LeadSortItem,
  pinnedLeadId: string | null
): number {
  const aIsPinned = a.id === pinnedLeadId;
  const bIsPinned = b.id === pinnedLeadId;

  if (aIsPinned && !bIsPinned) return -1;
  if (!aIsPinned && bIsPinned) return 1;

  const activityA = toTimestamp(a.updatedAt) || toTimestamp(a.createdAt);
  const activityB = toTimestamp(b.updatedAt) || toTimestamp(b.createdAt);
  if (activityA !== activityB) {
    return activityB - activityA;
  }

  const backendIndexA = a.backendIndex ?? Number.MAX_SAFE_INTEGER;
  const backendIndexB = b.backendIndex ?? Number.MAX_SAFE_INTEGER;
  if (backendIndexA !== backendIndexB) {
    return backendIndexA - backendIndexB;
  }

  return a.id.localeCompare(b.id);
}
