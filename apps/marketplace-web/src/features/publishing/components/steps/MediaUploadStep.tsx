import React, { ChangeEvent, useState } from 'react'
import type { WizardMediaItem } from '../../model/types'
import { useI18n } from '../../../../i18n'

interface MediaUploadStepProps {
  mediaItems: WizardMediaItem[]
  isUploading: boolean
  onUploadPhoto: (file: File) => Promise<void>
  onRetryPhoto: (tempId: string) => Promise<void>
  onDeletePhoto: (mediaAssetId: string) => Promise<void>
  onSetCover: (mediaAssetId: string) => Promise<void>
  onBack: () => void
  onNext: () => Promise<void>
  error: string | null
}

export function MediaUploadStep({
  mediaItems,
  isUploading,
  onUploadPhoto,
  onRetryPhoto,
  onDeletePhoto,
  onSetCover,
  onBack,
  onNext,
  error,
}: MediaUploadStepProps) {
  const { t } = useI18n()
  const [fileError, setFileError] = useState<string | null>(null)

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    setFileError(null)
    const files = e.target.files
    if (!files || files.length === 0) return

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        setFileError(t('mediaUpload.errorFormat'))
        continue
      }
      if (file.size > 20 * 1024 * 1024) {
        setFileError(t('mediaUpload.errorSize'))
        continue
      }
      await onUploadPhoto(file)
    }

    // Clear input
    e.target.value = ''
  }

  return (
    <section className="wizard-step wizard-step--media" data-testid="wizard-step-media" aria-labelledby="media-heading">
      <div className="wizard-step__header">
        <h2 id="media-heading">{t('mediaUpload.heading')}</h2>
        <p className="wizard-step__subtitle">{t('mediaUpload.subtitle')}</p>
      </div>

      {(fileError || error) && (
        <div className="wizard-alert wizard-alert--error" role="alert">
          <span>{fileError || error}</span>
        </div>
      )}

      {/* Upload Zone */}
      <div className="wizard-upload-dropzone">
        <input
          id="wizard-file-input"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={handleFileSelect}
          disabled={isUploading}
          className="wizard-upload-dropzone__input"
          data-testid="media-file-input"
        />
        <label htmlFor="wizard-file-input" className="wizard-upload-dropzone__label">
          <span className="wizard-upload-dropzone__icon">📷</span>
          <strong>{isUploading ? t('mediaUpload.uploading') : t('mediaUpload.clickToSelect')}</strong>
          <span>{t('mediaUpload.dragHint')}</span>
        </label>
      </div>

      {/* Media Grid */}
      {mediaItems.length > 0 ? (
        <div className="wizard-media-grid" data-testid="media-grid">
          {mediaItems.map((item, index) => (
            <div
              key={item.id}
              className={`wizard-media-card ${item.role === 'cover' ? 'is-cover' : ''}`}
              data-testid={`media-card-${item.id}`}
            >
              <div className="wizard-media-card__preview">
                {item.url ? (
                  <img src={item.url} alt={item.alt || t('mediaUpload.photoAlt', { index: index + 1 })} loading="lazy" />
                ) : (
                  <div className="wizard-media-card__placeholder">
                    {item.status === 'uploading' ? t('mediaUpload.uploading') : t('mediaUpload.photo')}
                  </div>
                )}
                {item.role === 'cover' && (
                  <span className="wizard-media-card__badge" data-testid="media-cover-badge">
                    {t('mediaUpload.cover')}
                  </span>
                )}
              </div>

              {item.status === 'rejected' && (
                <p className="wizard-field-error" role="alert" data-testid={`media-error-${item.id}`}>
                  {t('mediaUpload.uploadFailed', {
                    phase:
                      item.failedPhase === 'upload'
                        ? t('mediaUpload.phaseUpload')
                        : item.failedPhase === 'confirm'
                          ? t('mediaUpload.phaseConfirm')
                          : '',
                  })}
                </p>
              )}

              <div className="wizard-media-card__actions">
                {item.role !== 'cover' && item.status === 'verified' && (
                  <button
                    type="button"
                    className="wizard-btn-link"
                    onClick={() => onSetCover(item.mediaAssetId)}
                    data-testid={`media-set-cover-${item.id}`}
                  >
                    {t('mediaUpload.makeCover')}
                  </button>
                )}
                {item.status === 'rejected' && (
                  <button
                    type="button"
                    className="wizard-btn-link"
                    onClick={() => onRetryPhoto(item.id)}
                    disabled={isUploading}
                    data-testid={`media-retry-${item.id}`}
                  >
                    {t('common.tryAgain')}
                  </button>
                )}
                <button
                  type="button"
                  className="wizard-btn-link wizard-btn-link--danger"
                  onClick={() => onDeletePhoto(item.mediaAssetId)}
                  data-testid={`media-delete-${item.id}`}
                >
                  {t('mediaUpload.delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="wizard-empty-media" data-testid="media-empty-placeholder">
          <p>{t('mediaUpload.empty')}</p>
        </div>
      )}

      <div className="wizard-actions">
        <button
          type="button"
          className="wizard-btn wizard-btn--secondary"
          onClick={onBack}
          disabled={isUploading}
          data-testid="media-back-btn"
        >
          {t('wizard.back')}
        </button>
        <button
          type="button"
          className="wizard-btn wizard-btn--primary"
          onClick={onNext}
          disabled={isUploading}
          data-testid="media-next-btn"
        >
          {t('mediaUpload.next')}
        </button>
      </div>
    </section>
  )
}
