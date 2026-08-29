import { describe, it, expect } from 'vitest'
import { wizardReducer, initialWizardState } from '../src/features/publishing/model/wizard-reducer'

describe('Publishing Wizard Reducer State Machine', () => {
  it('handles auth status update and transitions step', () => {
    const unauthState = { ...initialWizardState, step: 'auth' as const, isAuthenticated: false }
    const nextState = wizardReducer(unauthState, {
      type: 'SET_AUTH_STATUS',
      isAuthenticated: true,
      identityId: 'ident-1',
    })

    expect(nextState.isAuthenticated).toBe(true)
    expect(nextState.identityId).toBe('ident-1')
    expect(nextState.step).toBe('location')
  })

  it('handles location and characteristics updates', () => {
    let state = initialWizardState
    state = wizardReducer(state, {
      type: 'UPDATE_LOCATION',
      payload: { city: 'Tbilisi', address: 'Chavchavadze 20' },
    })
    expect(state.location.city).toBe('Tbilisi')
    expect(state.location.address).toBe('Chavchavadze 20')

    state = wizardReducer(state, {
      type: 'UPDATE_CHARACTERISTICS',
      payload: { propertyType: 'commercial', commercialSubtype: 'retail', area: 120 },
    })
    expect(state.characteristics.propertyType).toBe('commercial')
    expect(state.characteristics.commercialSubtype).toBe('retail')
    expect(state.characteristics.area).toBe(120)
  })

  it('handles duplicate detection block and override reason', () => {
    let state = initialWizardState
    state = wizardReducer(state, {
      type: 'SET_DUPLICATES',
      candidates: [
        {
          id: 'dup-1',
          status: 'detected',
          signals: { phoneMatch: true },
        },
      ],
    })

    expect(state.hasDuplicateBlock).toBe(true)
    expect(state.duplicateCandidates).toHaveLength(1)

    state = wizardReducer(state, {
      type: 'SET_OVERRIDE_REASON',
      reason: 'This is my exclusive mandate with the property owner',
    })
    expect(state.overrideReason).toBe('This is my exclusive mandate with the property owner')
  })

  it('handles publication status updates and slug assignment', () => {
    let state = initialWizardState
    state = wizardReducer(state, {
      type: 'SET_PUBLICATION_STATUS',
      status: 'published',
      slug: 'batumi-flat-lux',
      publicationId: 'pub-99',
    })

    expect(state.publicationStatus).toBe('published')
    expect(state.publishedSlug).toBe('batumi-flat-lux')
    expect(state.publicationId).toBe('pub-99')
    expect(state.step).toBe('published')
  })
})
