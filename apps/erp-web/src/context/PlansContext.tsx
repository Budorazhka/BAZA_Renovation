import { createContext, useContext, useReducer, type ReactNode } from 'react'

export interface ManagerPlan {
  employeeId: string
  /** Месяц формата YYYY-MM */
  period: string
  revenueTarget: number
  leadsTarget: number
  dealsTarget: number
  callsTarget: number
  meetingsTarget: number
  showingsTarget: number
}

type PlansState = {
  plans: ManagerPlan[]
}

type PlansAction =
  | { type: 'SET_PLAN'; plan: ManagerPlan }
  | { type: 'REMOVE_PLAN'; employeeId: string; period: string }

function plansReducer(state: PlansState, action: PlansAction): PlansState {
  switch (action.type) {
    case 'SET_PLAN': {
      const idx = state.plans.findIndex(
        (p) => p.employeeId === action.plan.employeeId && p.period === action.plan.period,
      )
      const next = [...state.plans]
      if (idx >= 0) next[idx] = action.plan
      else next.push(action.plan)
      return { ...state, plans: next }
    }
    case 'REMOVE_PLAN':
      return {
        ...state,
        plans: state.plans.filter(
          (p) => !(p.employeeId === action.employeeId && p.period === action.period),
        ),
      }
    default:
      return state
  }
}

function currentPeriod(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const INITIAL_PLANS: ManagerPlan[] = [
  { employeeId: 'emp-director', period: currentPeriod(), revenueTarget: 15_000_000, leadsTarget: 5,  dealsTarget: 2, callsTarget: 20, meetingsTarget: 6,  showingsTarget: 4  },
  { employeeId: 'emp-rop-msk',  period: currentPeriod(), revenueTarget: 40_000_000, leadsTarget: 12, dealsTarget: 4, callsTarget: 40, meetingsTarget: 10, showingsTarget: 8  },
  { employeeId: 'emp-rop-spb',  period: currentPeriod(), revenueTarget: 30_000_000, leadsTarget: 8,  dealsTarget: 3, callsTarget: 30, meetingsTarget: 8,  showingsTarget: 6  },
  { employeeId: 'emp-mgr-1',    period: currentPeriod(), revenueTarget: 20_000_000, leadsTarget: 15, dealsTarget: 3, callsTarget: 60, meetingsTarget: 12, showingsTarget: 8  },
  { employeeId: 'emp-mgr-2',    period: currentPeriod(), revenueTarget: 15_000_000, leadsTarget: 12, dealsTarget: 2, callsTarget: 50, meetingsTarget: 10, showingsTarget: 6  },
  { employeeId: 'emp-mgr-3',    period: currentPeriod(), revenueTarget: 14_000_000, leadsTarget: 10, dealsTarget: 2, callsTarget: 45, meetingsTarget: 8,  showingsTarget: 5  },
  { employeeId: 'emp-mgr-4',    period: currentPeriod(), revenueTarget: 22_000_000, leadsTarget: 14, dealsTarget: 4, callsTarget: 55, meetingsTarget: 10, showingsTarget: 7  },
  { employeeId: 'emp-mgr-5',    period: currentPeriod(), revenueTarget: 15_000_000, leadsTarget: 10, dealsTarget: 2, callsTarget: 40, meetingsTarget: 8,  showingsTarget: 5  },
  { employeeId: 'emp-mgr-6',    period: currentPeriod(), revenueTarget: 17_000_000, leadsTarget: 12, dealsTarget: 3, callsTarget: 50, meetingsTarget: 10, showingsTarget: 6  },
]

const INITIAL_STATE: PlansState = { plans: INITIAL_PLANS }

interface PlansContextValue {
  state: PlansState
  dispatch: React.Dispatch<PlansAction>
  getPlan: (employeeId: string, period?: string) => ManagerPlan | undefined
}

const PlansContext = createContext<PlansContextValue | null>(null)

export function PlansProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(plansReducer, INITIAL_STATE)

  const getPlan = (employeeId: string, period?: string) =>
    state.plans.find((p) => p.employeeId === employeeId && p.period === (period ?? currentPeriod()))

  return (
    <PlansContext.Provider value={{ state, dispatch, getPlan }}>
      {children}
    </PlansContext.Provider>
  )
}

export function usePlans(): PlansContextValue {
  const ctx = useContext(PlansContext)
  if (!ctx) throw new Error('usePlans must be used inside PlansProvider')
  return ctx
}

export { currentPeriod }
