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

  it('clears all identity-scoped data on logout so a second user in the same tab never sees it', () => {
    // Simulate a first identity mid-flow: real address, phone, price and an
    // uploaded photo already attached to their own backend PropertyAsset.
    let state = wizardReducer(initialWizardState, {
      type: 'SET_AUTH_STATUS',
      isAuthenticated: true,
      identityId: 'ident-user-a',
    })
    state = wizardReducer(state, {
      type: 'UPDATE_LOCATION',
      payload: { city: 'Tbilisi', address: 'Chavchavadze 20' },
    })
    state = wizardReducer(state, {
      type: 'UPDATE_CHARACTERISTICS',
      payload: { representativePhone: '+995500000001' },
    })
    state = wizardReducer(state, {
      type: 'UPDATE_DEAL',
      payload: { priceAmount: 150000 },
    })
    state = wizardReducer(state, { type: 'SET_ASSET_ID', assetId: 'asset-user-a' })
    state = wizardReducer(state, { type: 'SET_LISTING_ID', listingId: 'listing-user-a' })
    state = wizardReducer(state, {
      type: 'ADD_MEDIA_ITEM',
      item: {
        id: 'media-1',
        mediaAssetId: 'media-1',
        url: 'https://cdn.example/user-a-photo.jpg',
        role: 'cover',
        sortOrder: 0,
        status: 'verified',
      },
    })

    // Sanity check the fixture actually holds User A's data before logout.
    expect(state.location.address).toBe('Chavchavadze 20')
    expect(state.characteristics.representativePhone).toBe('+995500000001')
    expect(state.assetId).toBe('asset-user-a')
    expect(state.mediaItems).toHaveLength(1)

    // User A logs out (or the session is detected as expired).
    const loggedOut = wizardReducer(state, { type: 'SET_AUTH_STATUS', isAuthenticated: false })

    expect(loggedOut.step).toBe('auth')
    expect(loggedOut.isAuthenticated).toBe(false)
    expect(loggedOut.assetId).toBeUndefined()
    expect(loggedOut.listingId).toBeUndefined()
    expect(loggedOut.location).toEqual(initialWizardState.location)
    expect(loggedOut.characteristics.representativePhone).toBe('')
    expect(loggedOut.deal).toEqual(initialWizardState.deal)
    expect(loggedOut.mediaItems).toEqual([])

    // A second identity logging in on the same tab starts from a clean slate.
    const loggedInAsB = wizardReducer(loggedOut, {
      type: 'SET_AUTH_STATUS',
      isAuthenticated: true,
      identityId: 'ident-user-b',
    })
    expect(loggedInAsB.step).toBe('location')
    expect(loggedInAsB.location.address).toBe('')
    expect(loggedInAsB.characteristics.representativePhone).toBe('')
    expect(loggedInAsB.mediaItems).toEqual([])
  })

  it('SET_AUTH_STATUS(true) does not reset in-progress step data mid-flow', () => {
    // A silent session re-affirmation (e.g. a background re-check) while the
    // user is authenticated must not be treated as a fresh login and must not
    // discard whatever step/form data they already have.
    let state = wizardReducer(initialWizardState, {
      type: 'SET_AUTH_STATUS',
      isAuthenticated: true,
      identityId: 'ident-1',
    })
    state = wizardReducer(state, { type: 'SET_STEP', step: 'characteristics' })
    state = wizardReducer(state, {
      type: 'UPDATE_LOCATION',
      payload: { address: 'Rustaveli 1' },
    })

    const reaffirmed = wizardReducer(state, {
      type: 'SET_AUTH_STATUS',
      isAuthenticated: true,
      identityId: 'ident-1',
    })

    expect(reaffirmed.step).toBe('characteristics')
    expect(reaffirmed.location.address).toBe('Rustaveli 1')
  })
})
