export type TeamKpiMock = {
  leadsMonth: number
  dealsMonth: number
  revenue: number
  plan: number
  activeTasks: number
}

/** Моковые KPI по сотрудникам для командных отчетов и карточек. */
export const MOCK_KPI: Record<string, TeamKpiMock> = {
  'emp-owner':    { leadsMonth: 0,  dealsMonth: 0,  revenue: 0,          plan: 100, activeTasks: 3  },
  'emp-director': { leadsMonth: 2,  dealsMonth: 1,  revenue: 12_500_000, plan: 95,  activeTasks: 7  },
  'emp-rop-msk':  { leadsMonth: 8,  dealsMonth: 3,  revenue: 37_000_000, plan: 87,  activeTasks: 12 },
  'emp-rop-spb':  { leadsMonth: 5,  dealsMonth: 2,  revenue: 22_000_000, plan: 74,  activeTasks: 9  },
  'emp-mgr-1':    { leadsMonth: 14, dealsMonth: 2,  revenue: 18_400_000, plan: 92,  activeTasks: 5  },
  'emp-mgr-2':    { leadsMonth: 11, dealsMonth: 1,  revenue: 9_200_000,  plan: 61,  activeTasks: 8  },
  'emp-mgr-3':    { leadsMonth: 9,  dealsMonth: 2,  revenue: 11_000_000, plan: 78,  activeTasks: 4  },
  'emp-mgr-4':    { leadsMonth: 13, dealsMonth: 3,  revenue: 21_500_000, plan: 107, activeTasks: 6  },
  'emp-mgr-5':    { leadsMonth: 7,  dealsMonth: 1,  revenue: 8_700_000,  plan: 58,  activeTasks: 10 },
  'emp-mgr-6':    { leadsMonth: 10, dealsMonth: 2,  revenue: 14_300_000, plan: 83,  activeTasks: 3  },
}
