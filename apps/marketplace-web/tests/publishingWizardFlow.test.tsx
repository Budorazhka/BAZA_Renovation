/** @vitest-environment jsdom */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PublishingWizard } from '../src/features/publishing'
import { authApi } from '../src/features/publishing/api/auth-api'
import { publishingApi } from '../src/features/publishing/api/publishing-api'

vi.mock('../src/features/publishing/api/auth-api', () => ({
  authApi: {
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    checkSession: vi.fn(),
  },
  AuthApiError: class extends Error {
    constructor(msg: string, readonly status: number) {
      super(msg)
      this.name = 'AuthApiError'
    }
  },
}))

vi.mock('../src/features/publishing/api/publishing-api', () => ({
  publishingApi: {
    createPropertyAsset: vi.fn(),
    getAsset: vi.fn(),
    createListing: vi.fn(),
    activateListing: vi.fn(),
    createMediaUploadIntent: vi.fn(),
    uploadBinaryFile: vi.fn(),
    confirmMediaUpload: vi.fn(),
    listMedia: vi.fn(),
    deleteMedia: vi.fn(),
    updateMediaItem: vi.fn(),
    getDuplicateCandidates: vi.fn(),
    overrideDuplicate: vi.fn(),
    getActuality: vi.fn(),
    confirmActuality: vi.fn(),
    publishListing: vi.fn(),
    getPublicationStatus: vi.fn(),
  },
  PublishingApiError: class extends Error {
    constructor(msg: string, readonly status: number) {
      super(msg)
      this.name = 'PublishingApiError'
    }
  },
}))

describe('Publishing Wizard End-to-End Functional Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(authApi.checkSession as any).mockResolvedValue(true)
  })

  afterEach(() => {
    cleanup()
  })

  it('walks through all steps: location -> characteristics -> deal -> media -> review -> publish -> published card link', async () => {
    // 1. Mocks
    ;(publishingApi.createPropertyAsset as any).mockResolvedValue({ _id: 'asset-101', version: 0 })
    ;(publishingApi.createListing as any).mockResolvedValue({ _id: 'listing-202', status: 'draft', version: 0 })
    ;(publishingApi.activateListing as any).mockResolvedValue({ _id: 'listing-202', status: 'active', version: 1 })
    ;(publishingApi.createMediaUploadIntent as any).mockResolvedValue({
      mediaAssetId: 'media-303',
      uploadUrl: 'https://storage.test/upload',
    })
    ;(publishingApi.uploadBinaryFile as any).mockResolvedValue(undefined)
    ;(publishingApi.confirmMediaUpload as any).mockResolvedValue([
      { id: 'media-303', mediaAssetId: 'media-303', role: 'cover', url: 'https://cdn.test/p1.jpg', status: 'verified' },
    ])
    ;(publishingApi.getDuplicateCandidates as any).mockResolvedValue([])
    ;(publishingApi.getActuality as any).mockResolvedValue({
      listingId: 'listing-202',
      category: 'sale',
      version: 1,
      status: 'confirmed',
    })
    ;(publishingApi.confirmActuality as any).mockResolvedValue({ version: 2, status: 'confirmed' })
    ;(publishingApi.publishListing as any).mockResolvedValue({
      id: 'pub-404',
      status: 'publication_pending',
      sourceId: 'listing-202',
    })
    ;(publishingApi.getPublicationStatus as any).mockResolvedValue({
      publicationId: 'pub-404',
      status: 'published',
      slug: '2-room-apartment-batumi-center',
      version: 1,
    })

    render(
      <MemoryRouter initialEntries={['/publish']}>
        <PublishingWizard />
      </MemoryRouter>,
    )

    // --- STEP 1: Location ---
    await waitFor(() => {
      expect(screen.getByTestId('wizard-step-location')).toBeDefined()
    })

    fireEvent.change(screen.getByTestId('location-input-address'), { target: { value: 'Rustaveli 25' } })
    fireEvent.click(screen.getByTestId('location-next-btn'))

    // --- STEP 2: Characteristics ---
    await waitFor(() => {
      expect(screen.getByTestId('wizard-step-characteristics')).toBeDefined()
    })

    fireEvent.change(screen.getByTestId('characteristics-input-area'), { target: { value: '75' } })
    fireEvent.change(screen.getByTestId('characteristics-input-rooms'), { target: { value: '2' } })
    fireEvent.change(screen.getByTestId('characteristics-input-phone'), { target: { value: '+995555123456' } })
    fireEvent.click(screen.getByTestId('characteristics-next-btn'))

    // Verify Asset creation API call
    await waitFor(() => {
      expect(publishingApi.createPropertyAsset).toHaveBeenCalledWith(
        expect.objectContaining({
          location: expect.objectContaining({ address: 'Rustaveli 25' }),
          characteristics: expect.objectContaining({ area: 75, rooms: 2, representativePhone: '+995555123456' }),
        }),
        // второй аргумент — Idempotency-Key: повтор шага не должен создавать
        // второй объект (ADR-006)
        expect.any(String),
      )
      expect(screen.getByTestId('wizard-step-deal')).toBeDefined()
    })

    // --- STEP 3: Deal Pricing ---
    fireEvent.click(screen.getByTestId('deal-type-sale'))
    fireEvent.change(screen.getByTestId('deal-input-price'), { target: { value: '95000' } })
    expect(screen.getByTestId('deal-price-preview').textContent).toContain('95')

    fireEvent.click(screen.getByTestId('deal-next-btn'))

    // Verify Listing creation and activation API calls
    await waitFor(() => {
      expect(publishingApi.createListing).toHaveBeenCalledWith('asset-101', expect.objectContaining({ priceAmount: 95000 }), expect.any(String))
      expect(publishingApi.activateListing).toHaveBeenCalledWith('asset-101', 'listing-202')
      expect(screen.getByTestId('wizard-step-media')).toBeDefined()
    })

    // --- STEP 4: Media Upload (3-phase) ---
    const file = new File(['fake-image-bytes'], 'living-room.jpg', { type: 'image/jpeg' })
    const fileInput = screen.getByTestId('media-file-input')
    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(publishingApi.createMediaUploadIntent).toHaveBeenCalledWith('asset-101', 'image/jpeg', expect.any(Number))
      expect(publishingApi.uploadBinaryFile).toHaveBeenCalledWith('https://storage.test/upload', file, 'image/jpeg')
      expect(publishingApi.confirmMediaUpload).toHaveBeenCalledWith('asset-101', 'media-303', expect.any(Object))
      expect(screen.getByTestId('media-cover-badge')).toBeDefined()
    })

    fireEvent.click(screen.getByTestId('media-next-btn'))

    // --- STEP 5: Review & Dedupe ---
    await waitFor(() => {
      expect(publishingApi.getDuplicateCandidates).toHaveBeenCalledWith('asset-101')
      expect(publishingApi.getActuality).toHaveBeenCalledWith('asset-101', 'listing-202')
      expect(screen.getByTestId('wizard-step-review')).toBeDefined()
    })

    expect(screen.getByText('Batumi, Rustaveli 25')).toBeDefined()
    expect(screen.getByText(/95000/)).toBeDefined()

    // Click Publish button
    fireEvent.click(screen.getByTestId('publish-submit-btn'))

    // --- STEP 6: Publishing & Polling ---
    await waitFor(() => {
      expect(publishingApi.publishListing).toHaveBeenCalledWith('asset-101', 'listing-202', expect.stringContaining('pub-listing-202-'))
      expect(publishingApi.getPublicationStatus).toHaveBeenCalledWith('asset-101', 'listing-202')
      expect(screen.getByTestId('wizard-step-published')).toBeDefined()
    })

    const viewListingBtn = screen.getByTestId('view-published-listing-btn') as HTMLAnchorElement
    expect(viewListingBtn.getAttribute('href')).toBe('/listings/2-room-apartment-batumi-center')
  })

  it('handles duplicate detection with owner override before allowing publish', async () => {
    ;(publishingApi.createPropertyAsset as any).mockResolvedValue({ _id: 'asset-dup', version: 0 })
    ;(publishingApi.createListing as any).mockResolvedValue({ _id: 'listing-dup', status: 'draft', version: 0 })
    ;(publishingApi.activateListing as any).mockResolvedValue({ _id: 'listing-dup', status: 'active', version: 1 })
    ;(publishingApi.getDuplicateCandidates as any)
      .mockResolvedValueOnce([
        {
          id: 'dup-candidate-99',
          status: 'detected',
          signals: { phoneMatch: true, addressMatch: true },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'dup-candidate-99',
          status: 'override_not_duplicate',
          signals: { phoneMatch: true, addressMatch: true },
          overrideReason: 'I am the exclusive licensed broker for this property',
        },
      ])
    ;(publishingApi.overrideDuplicate as any).mockResolvedValue({ id: 'dup-candidate-99', status: 'override_not_duplicate' })
    ;(publishingApi.getActuality as any).mockResolvedValue({
      listingId: 'listing-dup',
      category: 'sale',
      version: 1,
      status: 'confirmed',
    })

    render(
      <MemoryRouter initialEntries={['/publish']}>
        <PublishingWizard />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('wizard-step-location')).toBeDefined()
    })

    fireEvent.change(screen.getByTestId('location-input-address'), { target: { value: 'Gorgiladze 10' } })
    fireEvent.click(screen.getByTestId('location-next-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('wizard-step-characteristics')).toBeDefined()
    })

    fireEvent.change(screen.getByTestId('characteristics-input-area'), { target: { value: '55' } })
    fireEvent.change(screen.getByTestId('characteristics-input-phone'), { target: { value: '+995555998877' } })
    fireEvent.click(screen.getByTestId('characteristics-next-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('wizard-step-deal')).toBeDefined()
    })

    fireEvent.change(screen.getByTestId('deal-input-price'), { target: { value: '60000' } })
    fireEvent.click(screen.getByTestId('deal-next-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('wizard-step-media')).toBeDefined()
    })

    fireEvent.click(screen.getByTestId('media-next-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('wizard-step-review')).toBeDefined()
      expect(screen.getByTestId('duplicate-warning-card')).toBeDefined()
    })

    // Publish button is disabled while duplicate block is active
    const publishBtn = screen.getByTestId('publish-submit-btn') as HTMLButtonElement
    expect(publishBtn.disabled).toBe(true)

    // Fill override reason and submit
    fireEvent.change(screen.getByTestId('override-reason-input'), {
      target: { value: 'I am the exclusive licensed broker for this property' },
    })
    fireEvent.click(screen.getByTestId('override-submit-btn'))

    await waitFor(() => {
      expect(publishingApi.overrideDuplicate).toHaveBeenCalledWith(
        'dup-candidate-99',
        'I am the exclusive licensed broker for this property',
      )
      // Duplicate block is resolved, publish button becomes enabled!
      expect(screen.queryByTestId('duplicate-warning-card')).toBeNull()
      expect(publishBtn.disabled).toBe(false)
    })
  })

  async function walkToMediaStep(overrides?: { priceAmount?: string }) {
    ;(publishingApi.createPropertyAsset as any).mockResolvedValue({ _id: 'asset-err', version: 0 })
    ;(publishingApi.createListing as any).mockResolvedValue({ _id: 'listing-err', status: 'draft', version: 0 })
    ;(publishingApi.activateListing as any).mockResolvedValue({ _id: 'listing-err', status: 'active', version: 1 })

    render(
      <MemoryRouter initialEntries={['/publish']}>
        <PublishingWizard />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByTestId('wizard-step-location')).toBeDefined())
    fireEvent.change(screen.getByTestId('location-input-address'), { target: { value: 'Chavchavadze 5' } })
    fireEvent.click(screen.getByTestId('location-next-btn'))

    await waitFor(() => expect(screen.getByTestId('wizard-step-characteristics')).toBeDefined())
    fireEvent.change(screen.getByTestId('characteristics-input-area'), { target: { value: '40' } })
    fireEvent.change(screen.getByTestId('characteristics-input-phone'), { target: { value: '+995555000000' } })
    fireEvent.click(screen.getByTestId('characteristics-next-btn'))

    await waitFor(() => expect(screen.getByTestId('wizard-step-deal')).toBeDefined())
    fireEvent.change(screen.getByTestId('deal-input-price'), { target: { value: overrides?.priceAmount ?? '40000' } })
    fireEvent.click(screen.getByTestId('deal-next-btn'))

    await waitFor(() => expect(screen.getByTestId('wizard-step-media')).toBeDefined())
  }

  async function walkToReviewStep(overrides?: { priceAmount?: string }) {
    ;(publishingApi.getDuplicateCandidates as any).mockResolvedValue([])
    ;(publishingApi.getActuality as any).mockResolvedValue({
      listingId: 'listing-err',
      category: 'sale',
      version: 1,
      status: 'confirmed',
    })

    await walkToMediaStep(overrides)
    fireEvent.click(screen.getByTestId('media-next-btn'))

    await waitFor(() => expect(screen.getByTestId('wizard-step-review')).toBeDefined())
  }

  it('a media upload that fails during the S3 PUT phase retries only that phase, not the whole upload', async () => {
    ;(publishingApi.createMediaUploadIntent as any).mockResolvedValue({
      mediaAssetId: 'media-retry-1',
      uploadUrl: 'https://storage.test/upload-retry',
    })
    ;(publishingApi.uploadBinaryFile as any)
      .mockRejectedValueOnce(new Error('network blip during PUT'))
      .mockResolvedValueOnce(undefined)
    ;(publishingApi.confirmMediaUpload as any).mockResolvedValue([
      {
        id: 'media-retry-1',
        mediaAssetId: 'media-retry-1',
        role: 'cover',
        url: 'https://cdn.test/retry-photo.jpg',
        status: 'verified',
      },
    ])

    await walkToMediaStep()

    const file = new File(['bytes'], 'living-room.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByTestId('media-file-input'), { target: { files: [file] } })

    await waitFor(() => {
      expect(publishingApi.createMediaUploadIntent).toHaveBeenCalledTimes(1)
      expect(publishingApi.uploadBinaryFile).toHaveBeenCalledTimes(1)
    })

    // The failed card shows a retry action (not just delete), scoped to the
    // upload phase that actually failed.
    const mediaCard = await screen.findByTestId('media-grid')
    const retryBtn = mediaCard.querySelector('[data-testid^="media-retry-"]') as HTMLButtonElement
    expect(retryBtn).toBeTruthy()

    fireEvent.click(retryBtn)

    await waitFor(() => {
      expect(screen.getByTestId('media-cover-badge')).toBeDefined()
    })

    // Retrying a phase-2 failure must NOT re-run phase 1 — the file already
    // has a real backend upload-intent from the first attempt.
    expect(publishingApi.createMediaUploadIntent).toHaveBeenCalledTimes(1)
    expect(publishingApi.uploadBinaryFile).toHaveBeenCalledTimes(2)
    expect(publishingApi.confirmMediaUpload).toHaveBeenCalledTimes(1)
  })

  it('a media upload that fails during the intent phase retries from the start on the next attempt', async () => {
    ;(publishingApi.createMediaUploadIntent as any)
      .mockRejectedValueOnce(new Error('server unavailable'))
      .mockResolvedValueOnce({ mediaAssetId: 'media-retry-2', uploadUrl: 'https://storage.test/upload-retry-2' })
    ;(publishingApi.uploadBinaryFile as any).mockResolvedValue(undefined)
    ;(publishingApi.confirmMediaUpload as any).mockResolvedValue([
      {
        id: 'media-retry-2',
        mediaAssetId: 'media-retry-2',
        role: 'cover',
        url: 'https://cdn.test/retry-photo-2.jpg',
        status: 'verified',
      },
    ])

    await walkToMediaStep()

    const file = new File(['bytes'], 'kitchen.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByTestId('media-file-input'), { target: { files: [file] } })

    await waitFor(() => {
      expect(publishingApi.createMediaUploadIntent).toHaveBeenCalledTimes(1)
      expect(publishingApi.uploadBinaryFile).not.toHaveBeenCalled()
    })

    const mediaCard = await screen.findByTestId('media-grid')
    const retryBtn = mediaCard.querySelector('[data-testid^="media-retry-"]') as HTMLButtonElement
    fireEvent.click(retryBtn)

    await waitFor(() => {
      expect(screen.getByTestId('media-cover-badge')).toBeDefined()
    })

    // A phase-1 failure means there was never a real backend intent to
    // resume from — retry correctly starts over from phase 1.
    expect(publishingApi.createMediaUploadIntent).toHaveBeenCalledTimes(2)
    expect(publishingApi.uploadBinaryFile).toHaveBeenCalledTimes(1)
    expect(publishingApi.confirmMediaUpload).toHaveBeenCalledTimes(1)
  })

  it('deleting a media item that failed mid-upload does not resurrect it on a later retry click', async () => {
    ;(publishingApi.createMediaUploadIntent as any).mockResolvedValue({
      mediaAssetId: 'media-delete-1',
      uploadUrl: 'https://storage.test/upload-delete',
    })
    ;(publishingApi.uploadBinaryFile as any).mockRejectedValue(new Error('network blip'))

    await walkToMediaStep()

    const file = new File(['bytes'], 'balcony.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByTestId('media-file-input'), { target: { files: [file] } })

    await waitFor(() => {
      expect(publishingApi.uploadBinaryFile).toHaveBeenCalledTimes(1)
    })

    const mediaCard = await screen.findByTestId('media-grid')
    const deleteBtn = mediaCard.querySelector('[data-testid^="media-delete-"]') as HTMLButtonElement
    fireEvent.click(deleteBtn)

    await waitFor(() => {
      expect(screen.queryByTestId('media-grid')).toBeNull()
    })

    // The rejected item (and its pending File reference) is gone — nothing
    // left in the wizard that a stray retry could act on.
    expect(screen.queryByTestId('media-empty-placeholder')).toBeDefined()
  })

  it('returns the user to the review step (not a dead end) when the publication build fails', async () => {
    ;(publishingApi.publishListing as any).mockResolvedValue({
      id: 'pub-build-fail',
      status: 'publication_pending',
      sourceId: 'listing-err',
    })
    ;(publishingApi.getPublicationStatus as any).mockResolvedValue({
      publicationId: 'pub-build-fail',
      status: 'build_failed',
      version: 1,
    })

    await walkToReviewStep()
    fireEvent.click(screen.getByTestId('publish-submit-btn'))

    // The wizard must not strand the user on the publishing screen forever —
    // it routes back to review with the error visible and publish re-enabled,
    // exactly like the other publish-failure paths (409 duplicate, network).
    await waitFor(() => {
      expect(screen.getByTestId('wizard-step-review')).toBeDefined()
      expect(screen.getByText('Ошибка генерации публикации объявления')).toBeDefined()
    })
    const publishBtn = screen.getByTestId('publish-submit-btn') as HTMLButtonElement
    expect(publishBtn.disabled).toBe(false)
  })

  it('a rapid double-click on Publish before the step transition commits only sends one publish request', async () => {
    let resolvePublish: (value: unknown) => void
    ;(publishingApi.publishListing as any).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePublish = resolve
        }),
    )

    await walkToReviewStep()
    const publishBtn = screen.getByTestId('publish-submit-btn') as HTMLButtonElement
    // Both events are dispatched synchronously, back-to-back, before React
    // commits the step transition to 'publishing' that would otherwise
    // remove this button from the screen — modelling two click events
    // landing in the same task before any re-render is visible.
    fireEvent.click(publishBtn)
    fireEvent.click(publishBtn)

    await waitFor(() => {
      expect(screen.getByTestId('wizard-step-publishing')).toBeDefined()
    })
    expect(publishingApi.publishListing).toHaveBeenCalledTimes(1)

    resolvePublish!({ id: 'pub-1', status: 'publication_pending', sourceId: 'listing-err' })
  })
})
