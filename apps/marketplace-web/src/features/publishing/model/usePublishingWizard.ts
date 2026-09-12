import { useReducer, useCallback, useEffect, useRef } from 'react'
import { wizardReducer, initialWizardState } from './wizard-reducer'
import { publishingApi, PublishingApiError } from '../api/publishing-api'
import { useI18n } from '../../../i18n'
import type {
  LocationFormData,
  CharacteristicsFormData,
  DealFormData,
  WizardStep,
  WizardMediaItem,
} from './types'

export function usePublishingWizard(isAuthenticated: boolean) {
  const { t } = useI18n()
  const [state, dispatch] = useReducer(wizardReducer, {
    ...initialWizardState,
    isAuthenticated,
    step: isAuthenticated ? 'location' : 'auth',
  })

  /** Ключи создания объекта и листинга: стабильны при повторе шага, обнуляются при сбросе мастера. */
  const assetKeyRef = useRef<string | null>(null)
  const listingKeyRef = useRef<string | null>(null)

  // Sync auth state
  useEffect(() => {
    dispatch({ type: 'SET_AUTH_STATUS', isAuthenticated })
  }, [isAuthenticated])

  const setStep = useCallback((step: WizardStep) => {
    dispatch({ type: 'SET_STEP', step })
  }, [])

  const updateLocation = useCallback((payload: Partial<LocationFormData>) => {
    dispatch({ type: 'UPDATE_LOCATION', payload })
  }, [])

  const updateCharacteristics = useCallback((payload: Partial<CharacteristicsFormData>) => {
    dispatch({ type: 'UPDATE_CHARACTERISTICS', payload })
  }, [])

  const updateDeal = useCallback((payload: Partial<DealFormData>) => {
    dispatch({ type: 'UPDATE_DEAL', payload })
  }, [])

  const setOverrideReason = useCallback((reason: string) => {
    dispatch({ type: 'SET_OVERRIDE_REASON', reason })
  }, [])

  const clearError = useCallback(() => {
    dispatch({ type: 'SET_ERROR', error: null })
  }, [])

  // Step 2 -> 3: Submit characteristics and create PropertyAsset
  const submitCharacteristics = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', isLoading: true })
    dispatch({ type: 'SET_ERROR', error: null })
    try {
      // Ключ живёт в ref, а не создаётся на каждый вызов: при повторной
      // попытке того же шага (сеть отвалилась, ответ потерян) должен уйти
      // ТОТ ЖЕ ключ — иначе сервер создаст второй объект. Сбрасывается вместе
      // с мастером, как и ключ публикации ниже.
      if (!assetKeyRef.current) assetKeyRef.current = crypto.randomUUID()
      const asset = await publishingApi.createPropertyAsset(
        {
          location: state.location,
          characteristics: state.characteristics,
        },
        assetKeyRef.current,
      )
      dispatch({ type: 'SET_ASSET_ID', assetId: asset._id })
      dispatch({ type: 'SET_STEP', step: 'deal' })
    } catch (err: any) {
      dispatch({ type: 'SET_ERROR', error: err.message || t('publishingWizard.errorCreateAsset') })
    } finally {
      dispatch({ type: 'SET_LOADING', isLoading: false })
    }
  }, [state.location, state.characteristics, t])

  // Step 3 -> 4: Submit deal terms and create/activate Listing
  const submitDealTerms = useCallback(async () => {
    if (!state.assetId) {
      dispatch({ type: 'SET_ERROR', error: t('publishingWizard.errorAssetMissing') })
      return
    }

    dispatch({ type: 'SET_LOADING', isLoading: true })
    dispatch({ type: 'SET_ERROR', error: null })
    try {
      if (!listingKeyRef.current) listingKeyRef.current = crypto.randomUUID()
      const listing = await publishingApi.createListing(state.assetId, state.deal, listingKeyRef.current)
      await publishingApi.activateListing(state.assetId, listing._id)
      dispatch({ type: 'SET_LISTING_ID', listingId: listing._id })
      dispatch({ type: 'SET_STEP', step: 'media' })
    } catch (err: any) {
      dispatch({ type: 'SET_ERROR', error: err.message || t('publishingWizard.errorCreateListing') })
    } finally {
      dispatch({ type: 'SET_LOADING', isLoading: false })
    }
  }, [state.assetId, state.deal, t])

  // Media upload (3-phase vertical): intent -> binary PUT -> confirm.
  // pendingUploadsRef keeps the browser-only File and the phase-1 intent
  // result (once obtained) out of the plain, serializable reducer state, so
  // a retry after a phase-2/3 failure can resume from that point instead of
  // re-running phase 1 for a file the backend already issued an intent for.
  const pendingUploadsRef = useRef(
    new Map<string, { file: File; role: 'cover' | 'gallery'; intent?: { mediaAssetId: string; uploadUrl: string } }>(),
  )

  const runUploadPhases = useCallback(
    async (tempId: string, fromPhase: 'intent' | 'upload' | 'confirm') => {
      const pending = pendingUploadsRef.current.get(tempId)
      if (!state.assetId || !pending) {
        dispatch({ type: 'SET_ERROR', error: t('publishingWizard.errorAssetNotFound') })
        return
      }
      const { file, role } = pending
      const assetId = state.assetId
      // Updated immediately before each phase's own await, so the catch
      // block below always knows exactly which phase actually threw —
      // no inference from before/after state needed.
      let currentPhase: 'intent' | 'upload' | 'confirm' = fromPhase

      dispatch({ type: 'UPDATE_MEDIA_ITEM', id: tempId, payload: { status: 'uploading', failedPhase: undefined } })
      dispatch({ type: 'SET_UPLOADING_MEDIA', isUploading: true })

      try {
        let intent = pending.intent

        if (fromPhase === 'intent' || !intent) {
          currentPhase = 'intent'
          intent = await publishingApi.createMediaUploadIntent(assetId, file.type, file.size)
          pendingUploadsRef.current.set(tempId, { file, role, intent })
          dispatch({
            type: 'UPDATE_MEDIA_ITEM',
            id: tempId,
            payload: { mediaAssetId: intent.mediaAssetId, progressPercent: 40 },
          })
        }

        if (fromPhase !== 'confirm') {
          currentPhase = 'upload'
          await publishingApi.uploadBinaryFile(intent.uploadUrl, file, file.type)
          dispatch({ type: 'UPDATE_MEDIA_ITEM', id: tempId, payload: { progressPercent: 80 } })
        }

        currentPhase = 'confirm'
        const confirmedList = await publishingApi.confirmMediaUpload(assetId, intent.mediaAssetId, {
          role,
          alt: file.name,
        })

        // Map confirmed list from backend
        const mappedItems: WizardMediaItem[] = confirmedList.map((item) => ({
          id: item.id || item.mediaAssetId,
          mediaAssetId: item.mediaAssetId,
          url: item.url,
          role: item.role,
          sortOrder: item.sortOrder,
          alt: item.alt,
          status: 'verified',
          progressPercent: 100,
        }))

        pendingUploadsRef.current.delete(tempId)
        dispatch({ type: 'SET_MEDIA_ITEMS', items: mappedItems })
      } catch (err: any) {
        dispatch({
          type: 'UPDATE_MEDIA_ITEM',
          id: tempId,
          payload: { status: 'rejected', failedPhase: currentPhase },
        })
        dispatch({ type: 'SET_ERROR', error: err.message || t('publishingWizard.errorUploadPhoto') })
      } finally {
        dispatch({ type: 'SET_UPLOADING_MEDIA', isUploading: false })
      }
    },
    [state.assetId, t],
  )

  const uploadPhoto = useCallback(
    async (file: File) => {
      if (!state.assetId) {
        dispatch({ type: 'SET_ERROR', error: t('publishingWizard.errorAssetNotFound') })
        return
      }

      const tempId = 'temp-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7)
      const isFirst = state.mediaItems.length === 0
      const role: 'cover' | 'gallery' = isFirst ? 'cover' : 'gallery'
      const newMediaItem: WizardMediaItem = {
        id: tempId,
        mediaAssetId: tempId,
        role,
        sortOrder: state.mediaItems.length,
        status: 'uploading',
        progressPercent: 10,
      }

      pendingUploadsRef.current.set(tempId, { file, role })
      dispatch({ type: 'ADD_MEDIA_ITEM', item: newMediaItem })
      await runUploadPhases(tempId, 'intent')
    },
    [state.assetId, state.mediaItems.length, runUploadPhases, t],
  )

  const retryPhoto = useCallback(
    async (tempId: string) => {
      const pending = pendingUploadsRef.current.get(tempId)
      if (!pending) {
        dispatch({ type: 'SET_ERROR', error: t('publishingWizard.errorRetryFile') })
        return
      }
      const item = state.mediaItems.find((i) => i.id === tempId)
      await runUploadPhases(tempId, item?.failedPhase || 'intent')
    },
    [state.mediaItems, runUploadPhases, t],
  )

  const deletePhoto = useCallback(
    async (mediaAssetId: string) => {
      if (!state.assetId) return
      // The item's stable `id` (its React key, assigned once as the tempId
      // and never reassigned — see UPDATE_MEDIA_ITEM) is what pendingUploadsRef
      // is keyed by, not `mediaAssetId`, which is replaced once phase 1
      // succeeds. Deleting by either field must still find and drop the
      // matching pending-upload entry so an abandoned retry can't resurrect
      // a File the user just removed.
      const targetItem = state.mediaItems.find((i) => i.id === mediaAssetId || i.mediaAssetId === mediaAssetId)
      pendingUploadsRef.current.delete(targetItem?.id ?? mediaAssetId)

      dispatch({ type: 'REMOVE_MEDIA_ITEM', id: mediaAssetId })
      // A client-only placeholder id means phase 1 (upload-intent) never
      // reached the backend, so there is nothing there to delete — calling
      // the API would only produce a spurious 404 after the local removal
      // already succeeded.
      if (mediaAssetId.startsWith('temp-')) return
      try {
        await publishingApi.deleteMedia(state.assetId, mediaAssetId)
        const updatedList = await publishingApi.listMedia(state.assetId)
        const mappedItems: WizardMediaItem[] = updatedList.map((item) => ({
          id: item.id || item.mediaAssetId,
          mediaAssetId: item.mediaAssetId,
          url: item.url,
          role: item.role,
          sortOrder: item.sortOrder,
          alt: item.alt,
          status: 'verified',
        }))
        dispatch({ type: 'SET_MEDIA_ITEMS', items: mappedItems })
      } catch (err: any) {
        dispatch({ type: 'SET_ERROR', error: err.message || t('publishingWizard.errorDeletePhoto') })
      }
    },
    [state.assetId, state.mediaItems, t],
  )

  const setCoverPhoto = useCallback(
    async (mediaAssetId: string) => {
      if (!state.assetId) return
      try {
        await publishingApi.updateMediaItem(state.assetId, mediaAssetId, { role: 'cover' })
        const updatedList = await publishingApi.listMedia(state.assetId)
        const mappedItems: WizardMediaItem[] = updatedList.map((item) => ({
          id: item.id || item.mediaAssetId,
          mediaAssetId: item.mediaAssetId,
          url: item.url,
          role: item.role,
          sortOrder: item.sortOrder,
          alt: item.alt,
          status: 'verified',
        }))
        dispatch({ type: 'SET_MEDIA_ITEMS', items: mappedItems })
      } catch (err: any) {
        dispatch({ type: 'SET_ERROR', error: err.message || t('publishingWizard.errorSetCover') })
      }
    },
    [state.assetId, t],
  )

  // Step 4 -> 5: Load duplicates and actuality before review
  const prepareReview = useCallback(async () => {
    if (!state.assetId || !state.listingId) return
    dispatch({ type: 'SET_LOADING', isLoading: true })
    dispatch({ type: 'SET_ERROR', error: null })
    try {
      const [duplicates, actuality] = await Promise.all([
        publishingApi.getDuplicateCandidates(state.assetId),
        publishingApi.getActuality(state.assetId, state.listingId),
      ])
      dispatch({ type: 'SET_DUPLICATES', candidates: duplicates })
      dispatch({ type: 'SET_ACTUALITY', actuality })
      dispatch({ type: 'SET_STEP', step: 'review' })
    } catch (err: any) {
      dispatch({ type: 'SET_ERROR', error: err.message || t('publishingWizard.errorActualityStatus') })
    } finally {
      dispatch({ type: 'SET_LOADING', isLoading: false })
    }
  }, [state.assetId, state.listingId, t])

  // Submit Duplicate Override
  const isOverrideInFlightRef = useRef(false)
  const submitDuplicateOverride = useCallback(
    async (duplicateCandidateId: string) => {
      // Guards against a double-click firing two override requests before
      // the `isSubmittingOverride`-driven `disabled` prop commits.
      if (isOverrideInFlightRef.current) return

      if (!state.overrideReason || state.overrideReason.trim().length < 10) {
        dispatch({ type: 'SET_ERROR', error: t('reviewDedupe.errorReason') })
        return
      }

      isOverrideInFlightRef.current = true
      dispatch({ type: 'SET_SUBMITTING_OVERRIDE', isSubmitting: true })
      dispatch({ type: 'SET_ERROR', error: null })
      try {
        await publishingApi.overrideDuplicate(duplicateCandidateId, state.overrideReason.trim())
        if (state.assetId) {
          const duplicates = await publishingApi.getDuplicateCandidates(state.assetId)
          dispatch({ type: 'SET_DUPLICATES', candidates: duplicates })
        }
      } catch (err: any) {
        dispatch({ type: 'SET_ERROR', error: err.message || t('publishingWizard.errorOverride') })
      } finally {
        isOverrideInFlightRef.current = false
        dispatch({ type: 'SET_SUBMITTING_OVERRIDE', isSubmitting: false })
      }
    },
    [state.overrideReason, state.assetId, t],
  )

  // Polling ref
  const pollingTimerRef = useRef<any>(null)
  const pollingStartedAtRef = useRef<number | null>(null)
  const idempotencyKeyRef = useRef<{ listingId: string; key: string } | null>(null)

  const stopPolling = useCallback(() => {
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current)
      pollingTimerRef.current = null
    }
    pollingStartedAtRef.current = null
  }, [])

  useEffect(() => {
    return () => {
      stopPolling()
    }
  }, [stopPolling])

  // Submit Publication and Poll
  const isPublishInFlightRef = useRef(false)
  const publishListing = useCallback(async () => {
    // Guards against a double-click firing two publish/confirm-actuality
    // requests before the `isPublishing`-driven `disabled` prop commits.
    if (isPublishInFlightRef.current) return

    if (!state.assetId || !state.listingId) {
      dispatch({ type: 'SET_ERROR', error: t('publishingWizard.errorIdsMissing') })
      return
    }

    if (state.hasDuplicateBlock) {
      dispatch({ type: 'SET_ERROR', error: t('publishingWizard.errorConfirmNoDuplicate') })
      return
    }

    isPublishInFlightRef.current = true
    dispatch({ type: 'SET_PUBLISHING', isPublishing: true })
    dispatch({ type: 'SET_ERROR', error: null })
    dispatch({ type: 'SET_STEP', step: 'publishing' })

    try {
      // Confirm actuality first if needed
      const actuality = state.actualityState
      const actualityNeedsConfirmation =
        actuality &&
        (actuality.status === 'expired' || actuality.status === 'needs_confirmation' || actuality.state === 'needs_update')
      if (actualityNeedsConfirmation && actuality) {
        await publishingApi.confirmActuality(state.assetId, state.listingId, actuality.version)
      }

      const existingKey = idempotencyKeyRef.current
      const idempotencyKey =
        existingKey?.listingId === state.listingId
          ? existingKey.key
          : `pub-${state.listingId}-${Date.now()}`
      idempotencyKeyRef.current = { listingId: state.listingId, key: idempotencyKey }

      const pubResult = await publishingApi.publishListing(state.assetId, state.listingId, idempotencyKey)
      dispatch({
        type: 'SET_PUBLICATION_STATUS',
        status: (pubResult.status as any) || 'publication_pending',
        publicationId: pubResult.id,
      })

      // Start polling
      stopPolling()
      const assetId = state.assetId
      const listingId = state.listingId

      const poll = async () => {
        try {
          if (pollingStartedAtRef.current && Date.now() - pollingStartedAtRef.current > 60_000) {
            stopPolling()
            dispatch({ type: 'SET_PUBLICATION_STATUS', status: 'publication_pending' })
            dispatch({ type: 'SET_STEP', step: 'review' })
            dispatch({ type: 'SET_ERROR', error: t('publishingWizard.errorTimeout') })
            isPublishInFlightRef.current = false
            dispatch({ type: 'SET_PUBLISHING', isPublishing: false })
            return
          }

          const statusResult = await publishingApi.getPublicationStatus(assetId, listingId)
          if (statusResult.status === 'published') {
            stopPolling()
            dispatch({
              type: 'SET_PUBLICATION_STATUS',
              status: 'published',
              slug: statusResult.slug,
              publicationId: statusResult.publicationId,
            })
            isPublishInFlightRef.current = false
            dispatch({ type: 'SET_PUBLISHING', isPublishing: false })
          } else if (statusResult.status === 'build_failed') {
            stopPolling()
            dispatch({
              type: 'SET_PUBLICATION_STATUS',
              status: 'build_failed',
            })
            dispatch({ type: 'SET_STEP', step: 'review' })
            dispatch({ type: 'SET_ERROR', error: t('publishingWizard.errorBuildFailed') })
            isPublishInFlightRef.current = false
            dispatch({ type: 'SET_PUBLISHING', isPublishing: false })
          }
        } catch {
          // Retry on next interval
        }
      }

      pollingStartedAtRef.current = Date.now()
      pollingTimerRef.current = setInterval(poll, 1500)
      poll()
    } catch (err: any) {
      if (err instanceof PublishingApiError && err.status === 409) {
        // Duplicate detected on backend during publish!
        if (state.assetId) {
          const duplicates = await publishingApi.getDuplicateCandidates(state.assetId)
          dispatch({ type: 'SET_DUPLICATES', candidates: duplicates })
        }
        dispatch({ type: 'SET_STEP', step: 'review' })
        dispatch({ type: 'SET_ERROR', error: t('publishingWizard.errorDuplicateOnPublish') })
      } else {
        dispatch({ type: 'SET_STEP', step: 'review' })
        dispatch({ type: 'SET_ERROR', error: err.message || t('publishingWizard.errorPublish') })
      }
      isPublishInFlightRef.current = false
      dispatch({ type: 'SET_PUBLISHING', isPublishing: false })
    }
  }, [state.assetId, state.listingId, state.hasDuplicateBlock, state.actualityState, stopPolling, t])

  // A logout mid-publish must not let the in-flight status poll keep running
  // against the just-cleared session and later dispatch a stale result (e.g.
  // a delayed "published" response) into the next identity's fresh wizard,
  // nor leave the reentrancy locks permanently held for that next identity.
  useEffect(() => {
    if (!isAuthenticated) {
      stopPolling()
      idempotencyKeyRef.current = null
    assetKeyRef.current = null
    listingKeyRef.current = null
      isPublishInFlightRef.current = false
      isOverrideInFlightRef.current = false
      pendingUploadsRef.current.clear()
    }
  }, [isAuthenticated, stopPolling])

  const resetWizard = useCallback(() => {
    stopPolling()
    idempotencyKeyRef.current = null
    assetKeyRef.current = null
    listingKeyRef.current = null
    isPublishInFlightRef.current = false
    isOverrideInFlightRef.current = false
    pendingUploadsRef.current.clear()
    dispatch({ type: 'RESET_WIZARD' })
  }, [stopPolling])

  return {
    state,
    setStep,
    updateLocation,
    updateCharacteristics,
    updateDeal,
    setOverrideReason,
    clearError,
    submitCharacteristics,
    submitDealTerms,
    uploadPhoto,
    retryPhoto,
    deletePhoto,
    setCoverPhoto,
    prepareReview,
    submitDuplicateOverride,
    publishListing,
    resetWizard,
  }
}
