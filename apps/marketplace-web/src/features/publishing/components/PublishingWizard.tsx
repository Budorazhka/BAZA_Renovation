import React from 'react'
import { useAuthSession } from '../model/useAuthSession'
import { usePublishingWizard } from '../model/usePublishingWizard'
import { AuthStep } from './steps/AuthStep'
import { LocationStep } from './steps/LocationStep'
import { CharacteristicsStep } from './steps/CharacteristicsStep'
import { DealPricingStep } from './steps/DealPricingStep'
import { MediaUploadStep } from './steps/MediaUploadStep'
import { ReviewDedupeStep } from './steps/ReviewDedupeStep'
import { PublicationProgressStep } from './steps/PublicationProgressStep'
import '../styles/publishing.css'

const STEPS_NAV = [
  { id: 'location', label: 'Адрес' },
  { id: 'characteristics', label: 'Параметры' },
  { id: 'deal', label: 'Стоимость' },
  { id: 'media', label: 'Фото' },
  { id: 'review', label: 'Проверка' },
]

export function PublishingWizard() {
  const { isAuthenticated, isChecking, error: authError, login, registerAndLogin, logout } = useAuthSession()
  const {
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
  } = usePublishingWizard(isAuthenticated)

  if (isChecking) {
    return (
      <div className="wizard-container" data-testid="wizard-loading" aria-busy="true">
        <div className="wizard-spinner" />
        <p>Проверка авторизации...</p>
      </div>
    )
  }

  const currentStepIndex = STEPS_NAV.findIndex((s) => s.id === state.step)

  return (
    <div className="wizard-container" data-testid="marketplace-publishing-wizard">
      {/* Wizard Header */}
      <header className="wizard-header">
        <div className="wizard-header__row">
          <div>
            <h1 className="wizard-title">Размещение объявления</h1>
            <p className="wizard-caption">Публикация объекта в открытом каталоге BAZA</p>
          </div>
          {isAuthenticated && (
            <button
              type="button"
              className="wizard-logout-btn"
              onClick={logout}
              data-testid="wizard-logout-btn"
            >
              Выйти
            </button>
          )}
        </div>

        {/* Progress Tracker */}
        {isAuthenticated && state.step !== 'auth' && state.step !== 'published' && (
          <nav
            className="wizard-progress-nav"
            aria-label="Прогресс заполнения объявления"
            data-testid="wizard-progress-nav"
          >
            {STEPS_NAV.map((stepItem, index) => {
              const isCurrent = stepItem.id === state.step
              const isCompleted = currentStepIndex > index
              return (
                <div
                  key={stepItem.id}
                  className={`wizard-progress-nav__item ${isCurrent ? 'is-current' : ''} ${isCompleted ? 'is-completed' : ''}`}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  <span className="wizard-progress-nav__num">{index + 1}</span>
                  <span className="wizard-progress-nav__label">{stepItem.label}</span>
                </div>
              )
            })}
          </nav>
        )}
      </header>

      {/* Step Render */}
      <div className="wizard-body">
        {state.step === 'auth' && (
          <AuthStep
            onLogin={login}
            onRegister={registerAndLogin}
            isLoading={state.isLoading}
            error={authError || state.error}
            onClearError={clearError}
          />
        )}

        {state.step === 'location' && (
          <LocationStep
            data={state.location}
            onChange={updateLocation}
            onNext={() => setStep('characteristics')}
          />
        )}

        {state.step === 'characteristics' && (
          <CharacteristicsStep
            data={state.characteristics}
            onChange={updateCharacteristics}
            onBack={() => setStep('location')}
            onNext={submitCharacteristics}
            isLoading={state.isLoading}
            error={state.error}
          />
        )}

        {state.step === 'deal' && (
          <DealPricingStep
            data={state.deal}
            onChange={updateDeal}
            onBack={() => setStep('characteristics')}
            onNext={submitDealTerms}
            isLoading={state.isLoading}
            error={state.error}
          />
        )}

        {state.step === 'media' && (
          <MediaUploadStep
            mediaItems={state.mediaItems}
            isUploading={state.isUploadingMedia}
            onUploadPhoto={uploadPhoto}
            onDeletePhoto={deletePhoto}
            onSetCover={setCoverPhoto}
            onBack={() => setStep('deal')}
            onNext={prepareReview}
            error={state.error}
          />
        )}

        {state.step === 'review' && (
          <ReviewDedupeStep
            location={state.location}
            characteristics={state.characteristics}
            deal={state.deal}
            mediaItems={state.mediaItems}
            duplicateCandidates={state.duplicateCandidates}
            hasDuplicateBlock={state.hasDuplicateBlock}
            overrideReason={state.overrideReason}
            onOverrideReasonChange={setOverrideReason}
            onSubmitOverride={submitDuplicateOverride}
            isSubmittingOverride={state.isSubmittingOverride}
            actualityState={state.actualityState}
            onBack={() => setStep('media')}
            onPublish={publishListing}
            isPublishing={state.isPublishing}
            error={state.error}
          />
        )}

        {(state.step === 'publishing' || state.step === 'published') && (
          <PublicationProgressStep
            status={state.publicationStatus}
            publishedSlug={state.publishedSlug}
            onRetry={publishListing}
            onReset={resetWizard}
            error={state.error}
          />
        )}
      </div>
    </div>
  )
}
