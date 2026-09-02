import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

export type WorkspaceDeskScreen = 1 | 2

type Value = {
  activeScreen: WorkspaceDeskScreen
  setActiveScreen: (screen: WorkspaceDeskScreen) => void
}

const WorkspaceDeskScreenContext = createContext<Value | null>(null)

export function WorkspaceDeskScreenProvider({ children }: { children: ReactNode }) {
  const [activeScreen, setActiveScreenState] = useState<WorkspaceDeskScreen>(1)
  const setActiveScreen = useCallback((screen: WorkspaceDeskScreen) => {
    setActiveScreenState(screen)
  }, [])
  const value = useMemo(() => ({ activeScreen, setActiveScreen }), [activeScreen, setActiveScreen])
  return <WorkspaceDeskScreenContext.Provider value={value}>{children}</WorkspaceDeskScreenContext.Provider>
}

/** Состояние экрана 1/2 рабочего стола; вне провайдера — безопасные значения по умолчанию. */
export function useWorkspaceDeskScreen(): Value {
  const ctx = useContext(WorkspaceDeskScreenContext)
  if (ctx) return ctx
  return {
    activeScreen: 1,
    setActiveScreen: () => {},
  }
}
