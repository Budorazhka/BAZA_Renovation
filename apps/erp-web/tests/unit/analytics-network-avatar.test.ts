/** @vitest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

import { ParticipantCell } from '@/components/analytics-network/participant-cell'

describe('network analytics avatar', () => {
  it('replaces a failed avatar image with participant initials', () => {
    render(
      createElement(ParticipantCell, {
        partner: {
          id: 'partner-1',
          avatarUrl: 'https://example.invalid/avatar.png',
          name: 'Александр Усик',
          isOnline: true,
          lastSeenMinutesAgo: null,
          activityMarker: 'green',
          platformMinutesToday: 12,
          crmMinutesToday: 3,
          level1Count: 0,
          level2Count: 0,
          leadsAdded: 0,
          callClicks: 0,
          chatOpens: 0,
          selectionsCreated: 0,
          activityTotal: 0,
          stageChangesCount: 0,
          onlineDaysLast7: 0,
          onlineWeekMarkers: [],
          commissionUsd: 0,
        },
      }),
    )

    fireEvent.error(screen.getByRole('img', { name: 'Александр Усик' }))

    expect(screen.queryByRole('img', { name: 'Александр Усик' })).toBeNull()
    expect(screen.getByText('АУ')).not.toBeNull()
  })
})
