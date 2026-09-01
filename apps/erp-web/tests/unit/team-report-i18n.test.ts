import { describe, expect, it } from 'vitest'

import { en } from '@/i18n/dictionaries/en'
import { es } from '@/i18n/dictionaries/es'
import { ka } from '@/i18n/dictionaries/ka'
import { ru } from '@/i18n/dictionaries/ru'
import { tr } from '@/i18n/dictionaries/tr'

describe('team report translations', () => {
  it('contains the report shell copy in every supported language', () => {
    const dictionaries = { ru, en, ka, es, tr } as Record<string, Record<string, unknown>>
    const requiredKeys = [
      'teamReport.title',
      'teamReport.managerTitle',
      'teamReport.searchPlaceholder',
      'teamReport.riskZone',
      'teamReport.activeManagers',
      'teamReport.analytics',
      'teamReport.teamDescription',
      'teamReport.managerDescription',
      'teamReport.allManagers',
      'teamReport.team',
      'teamReport.employee',
      'teamReport.notSelected',
      'teamReport.revenue',
      'teamReport.averagePlan',
      'teamReport.activity',
      'teamReport.onlineDays',
      'teamReport.noStableActivity',
      'teamReport.managerSummary',
      'teamReport.managerFocus',
      'teamReport.plan',
      'teamReport.onlineLast7Days',
      'teamReport.leads',
      'teamReport.filters',
      'teamReport.reset',
      'teamReport.onlyOnline',
      'teamReport.inactiveLast7Days',
      'teamReport.found',
      'teamReport.manager',
      'teamReport.managers',
      'teamReport.activeTasks',
      'teamReport.activityDistribution',
      'teamReport.managersAtRisk',
      'teamReport.riskWeekDescription',
      'teamReport.riskPeriodDescription',
      'teamReport.selectedManagerLeads',
      'teamReport.topManagersLeads',
      'teamReport.topLeads',
      'teamReport.managerCard',
      'teamReport.managerRating',
      'teamReport.revenueMillions',
      'teamReport.branchAll',
      'teamReport.branchMsk',
      'teamReport.branchSpb',
      'teamReport.newListings',
      'teamReport.newLeads',
      'teamReport.calls',
      'teamReport.chats',
      'teamReport.selections',
      'teamReport.deals',
    ]

    for (const [language, dictionary] of Object.entries(dictionaries)) {
      for (const key of requiredKeys) {
        const value = key.split('.').reduce<unknown>((current, part) => {
          if (!current || typeof current !== 'object') return undefined
          return (current as Record<string, unknown>)[part]
        }, dictionary)

        expect(value, `Missing ${key} in ${language}`).toEqual(expect.any(String))
        expect((value as string).trim(), `Empty ${key} in ${language}`).not.toBe('')
        expect(value as string, 'Encoding placeholder').not.toContain('?')
      }
    }
  })
})
