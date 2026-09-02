import { useEffect, useMemo, useState } from 'react'

import { installmentsKey } from '@/components/development/sales/salesManagementStorage'
import { UnitInstallmentScheduleView } from '@/components/inventory/UnitInstallmentScheduleView'
import {
  loadUnitModalInstallmentRows,
  resolveUnitModalListPrice,
} from '@/lib/installment-display'
import type { IUnit, InstallmentTerm } from '@/types/core'
import type { IInstallmentPlan } from '@/types/installment'

export function UnitSalesInstallmentsSection({
  unit,
  projectId,
  projectPlans,
  projectTerms,
}: {
  unit: IUnit
  projectId: string | undefined
  projectUnits: IUnit[]
  projectPlans?: IInstallmentPlan[] | null
  projectTerms?: InstallmentTerm[] | null
}) {
  const [storageTick, setStorageTick] = useState(0)

  useEffect(() => {
    if (!projectId) return
    const key = installmentsKey(projectId)
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) setStorageTick((t) => t + 1)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [projectId])

  const { allRows, listPrice } = useMemo(
    () => ({
      allRows: loadUnitModalInstallmentRows({
        projectId,
        projectPlans,
        projectTerms,
        unitId: unit._id,
        listPrice: resolveUnitModalListPrice(unit),
      }),
      listPrice: resolveUnitModalListPrice(unit),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, projectPlans, projectTerms, unit._id, storageTick],
  )

  if (!projectId || allRows.length === 0) return null

  return (
    <UnitInstallmentScheduleView
      rows={allRows}
      listPrice={listPrice}
      pricePerSqm={unit.pricePerSqm}
    />
  )
}
