import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const dynamicKpiSource = readFileSync(
  resolve(process.cwd(), 'src/features/crm/components/analytics-network/dynamic-kpi-cards.tsx'),
  'utf8',
)

describe('network analytics i18n', () => {
  it('uses language-neutral keys for dynamic KPI copy', () => {
    expect(dynamicKpiSource).toContain("dynamic-kpi-cards.period")
    expect(dynamicKpiSource).toContain("dynamic-kpi-cards.forToday")
    expect(dynamicKpiSource).toContain("dynamic-kpi-cards.for")
    expect(dynamicKpiSource).not.toContain("analytics-network.dynamic-kpi-cards")
    expect(dynamicKpiSource).not.toContain("crm.analytics-network.dynamic-kpi-cards")
  })
})
