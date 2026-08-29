import React, { ChangeEvent, useState } from 'react'
import type { WizardMediaItem } from '../../model/types'

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
  const [fileError, setFileError] = useState<string | null>(null)

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    setFileError(null)
    const files = e.target.files
    if (!files || files.length === 0) return

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        setFileError('Поддерживаются только форматы JPEG, PNG и WebP')
        continue
      }
      if (file.size > 20 * 1024 * 1024) {
        setFileError('Размер файла не должен превышать 20 МБ')
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
        <h2 id="media-heading">Шаг 4: Фотографии объекта</h2>
        <p className="wizard-step__subtitle">
          Загрузите реальные фотографии объекта (до 20 МБ, JPEG/PNG/WebP). Первое фото станет обложкой.
        </p>
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
          <strong>{isUploading ? 'Загрузка...' : 'Нажмите для выбора фотографий'}</strong>
          <span>или перетащите файлы сюда (JPEG, PNG, WebP до 20 МБ)</span>
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
                  <img src={item.url} alt={item.alt || `Фото ${index + 1}`} loading="lazy" />
                ) : (
                  <div className="wizard-media-card__placeholder">
                    {item.status === 'uploading' ? 'Загрузка...' : 'Фотография'}
                  </div>
                )}
                {item.role === 'cover' && (
                  <span className="wizard-media-card__badge" data-testid="media-cover-badge">
                    Обложка
                  </span>
                )}
              </div>

              {item.status === 'rejected' && (
                <p className="wizard-field-error" role="alert" data-testid={`media-error-${item.id}`}>
                  Не удалось загрузить фото{item.failedPhase === 'upload' ? ' (передача файла)' : item.failedPhase === 'confirm' ? ' (подтверждение)' : ''}.
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
                    Сделать обложкой
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
                    Повторить
                  </button>
                )}
                <button
                  type="button"
                  className="wizard-btn-link wizard-btn-link--danger"
                  onClick={() => onDeletePhoto(item.mediaAssetId)}
                  data-testid={`media-delete-${item.id}`}
                >
                  Удалить
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="wizard-empty-media" data-testid="media-empty-placeholder">
          <p>Пока не загружено ни одной фотографии объекта.</p>
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
          ← Назад
        </button>
        <button
          type="button"
          className="wizard-btn wizard-btn--primary"
          onClick={onNext}
          disabled={isUploading}
          data-testid="media-next-btn"
        >
          Далее: Проверка и публикация →
        </button>
      </div>
    </section>
  )
}
