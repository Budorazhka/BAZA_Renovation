import { useReducer, useCallback, useEffect, useRef } from 'react'
import { wizardReducer, initialWizardState } from './wizard-reducer'
import { publishingApi, PublishingApiError } from '../api/publishing-api'
import type {
  LocationFormData,
  CharacteristicsFormData,
  DealFormData,
  WizardStep,
  WizardMediaItem,
} from './types'

export function usePublishingWizard(isAuthenticated: boolean) {
  const [state, dispatch] = useReducer(wizardReducer, {
    ...initialWizardState,
    isAuthenticated,
    step: isAuthenticated ? 'location' : 'auth',
  })

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
      const asset = await publishingApi.createPropertyAsset({
        location: state.location,
        characteristics: state.characteristics,
      })
      dispatch({ type: 'SET_ASSET_ID', assetId: asset._id })
      dispatch({ type: 'SET_STEP', step: 'deal' })
    } catch (err: any) {
      dispatch({ type: 'SET_ERROR', error: err.message || 'Ошибка создания объекта недвижимости' })
    } finally {
      dispatch({ type: 'SET_LOADING', isLoading: false })
    }
  }, [state.location, state.characteristics])

  // Step 3 -> 4: Submit deal terms and create/activate Listing
  const submitDealTerms = useCallback(async () => {
    if (!state.assetId) {
      dispatch({ type: 'SET_ERROR', error: 'Объект недвижимости не создан' })
      return
    }

    dispatch({ type: 'SET_LOADING', isLoading: true })
    dispatch({ type: 'SET_ERROR', error: null })
    try {
      const listing = await publishingApi.createListing(state.assetId, state.deal)
      await publishingApi.activateListing(state.assetId, listing._id)
      dispatch({ type: 'SET_LISTING_ID', listingId: listing._id })
      dispatch({ type: 'SET_STEP', step: 'media' })
    } catch (err: any) {
      dispatch({ type: 'SET_ERROR', error: err.message || 'Ошибка создания коммерческого предложения' })
    } finally {
      dispatch({ type: 'SET_LOADING', isLoading: false })
    }
  }, [state.assetId, state.deal])

  // Media upload (3-phase vertical)
  const uploadPhoto = useCallback(
    async (file: File) => {
      if (!state.assetId) {
        dispatch({ type: 'SET_ERROR', error: 'Объект недвижимости не найден' })
        return
      }

      const tempId = 'temp-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7)
      const isFirst = state.mediaItems.length === 0
      const newMediaItem: WizardMediaItem = {
        id: tempId,
        mediaAssetId: tempId,
        role: isFirst ? 'cover' : 'gallery',
        sortOrder: state.mediaItems.length,
        status: 'uploading',
        progressPercent: 10,
      }

      dispatch({ type: 'ADD_MEDIA_ITEM', item: newMediaItem })
      dispatch({ type: 'SET_UPLOADING_MEDIA', isUploading: true })

      try {
        // Phase 1: Intent
        const intent = await publishingApi.createMediaUploadIntent(state.assetId, file.type, file.size)
        dispatch({
          type: 'UPDATE_MEDIA_ITEM',
          id: tempId,
          payload: { mediaAssetId: intent.mediaAssetId, progressPercent: 40 },
        })

        // Phase 2: Binary S3 PUT
        await publishingApi.uploadBinaryFile(intent.uploadUrl, file, file.type)
        dispatch({
          type: 'UPDATE_MEDIA_ITEM',
          id: tempId,
          payload: { progressPercent: 80 },
        })

        // Phase 3: Confirm
        const confirmedList = await publishingApi.confirmMediaUpload(state.assetId, intent.mediaAssetId, {
          role: isFirst ? 'cover' : 'gallery',
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

        dispatch({ type: 'SET_MEDIA_ITEMS', items: mappedItems })
      } catch (err: any) {
        dispatch({
          type: 'UPDATE_MEDIA_ITEM',
          id: tempId,
          payload: { status: 'rejected' },
        })
        dispatch({ type: 'SET_ERROR', error: err.message || 'Ошибка загрузки фотографии' })
      } finally {
        dispatch({ type: 'SET_UPLOADING_MEDIA', isUploading: false })
      }
    },
    [state.assetId, state.mediaItems.length],
  )

  const deletePhoto = useCallback(
    async (mediaAssetId: string) => {
      if (!state.assetId) return
      dispatch({ type: 'REMOVE_MEDIA_ITEM', id: mediaAssetId })
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
        dispatch({ type: 'SET_ERROR', error: err.message || 'Ошибка удаления фотографии' })
      }
    },
    [state.assetId],
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
        dispatch({ type: 'SET_ERROR', error: err.message || 'Ошибка назначения обложки' })
      }
    },
    [state.assetId],
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
      dispatch({ type: 'SET_ERROR', error: err.message || 'Ошибка получения статуса проверки' })
    } finally {
      dispatch({ type: 'SET_LOADING', isLoading: false })
    }
  }, [state.assetId, state.listingId])

  // Submit Duplicate Override
  const submitDuplicateOverride = useCallback(
    async (duplicateCandidateId: string) => {
      if (!state.overrideReason || state.overrideReason.trim().length < 10) {
        dispatch({ type: 'SET_ERROR', error: 'Укажите причину подтверждения (не менее 10 символов)' })
        return
      }

      dispatch({ type: 'SET_SUBMITTING_OVERRIDE', isSubmitting: true })
      dispatch({ type: 'SET_ERROR', error: null })
      try {
        await publishingApi.overrideDuplicate(duplicateCandidateId, state.overrideReason.trim())
        if (state.assetId) {
          const duplicates = await publishingApi.getDuplicateCandidates(state.assetId)
          dispatch({ type: 'SET_DUPLICATES', candidates: duplicates })
        }
      } catch (err: any) {
        dispatch({ type: 'SET_ERROR', error: err.message || 'Ошибка снятия блокировки дубликата' })
      } finally {
        dispatch({ type: 'SET_SUBMITTING_OVERRIDE', isSubmitting: false })
      }
    },
    [state.overrideReason, state.assetId],
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
  const publishListing = useCallback(async () => {
    if (!state.assetId || !state.listingId) {
      dispatch({ type: 'SET_ERROR', error: 'Идентификаторы объявления не найдены' })
      return
    }

    if (state.hasDuplicateBlock) {
      dispatch({ type: 'SET_ERROR', error: 'Необходимо подтвердить отсутствие дубликата' })
      return
    }

    dispatch({ type: 'SET_PUBLISHING', isPublishing: true })
    dispatch({ type: 'SET_ERROR', error: null })
    dispatch({ type: 'SET_STEP', step: 'publishing' })

    try {
      // Confirm actuality first if needed
      if (state.actualityState && state.actualityState.status !== 'confirmed') {
        await publishingApi.confirmActuality(state.assetId, state.listingId, state.actualityState.version)
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
            dispatch({ type: 'SET_ERROR', error: 'Публикация занимает дольше обычного. Повторите проверку позже.' })
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
            dispatch({ type: 'SET_PUBLISHING', isPublishing: false })
          } else if (statusResult.status === 'build_failed') {
            stopPolling()
            dispatch({
              type: 'SET_PUBLICATION_STATUS',
              status: 'build_failed',
            })
            dispatch({ type: 'SET_ERROR', error: 'Ошибка генерации публикации объявления' })
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
        dispatch({ type: 'SET_ERROR', error: 'Обнаружен возможный дубликат объявления. Заполните подтверждение.' })
      } else {
        dispatch({ type: 'SET_STEP', step: 'review' })
        dispatch({ type: 'SET_ERROR', error: err.message || 'Ошибка публикации объявления' })
      }
      dispatch({ type: 'SET_PUBLISHING', isPublishing: false })
    }
  }, [state.assetId, state.listingId, state.hasDuplicateBlock, state.actualityState, stopPolling])

  const resetWizard = useCallback(() => {
    stopPolling()
    idempotencyKeyRef.current = null
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
    deletePhoto,
    setCoverPhoto,
    prepareReview,
    submitDuplicateOverride,
    publishListing,
    resetWizard,
  }
}
