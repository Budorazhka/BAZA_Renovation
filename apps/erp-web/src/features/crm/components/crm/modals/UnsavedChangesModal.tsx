import React from 'react';
import { useI18n } from '@/i18n';

interface UnsavedChangesModalProps {
  isOpen: boolean;
  onDiscard: () => void;
  onSave: () => void;
}

export const UnsavedChangesModal: React.FC<UnsavedChangesModalProps> = ({
  isOpen,
  onDiscard,
  onSave,
}) => {
  const { t } = useI18n();
  if (!isOpen) return null;

  return (
    <div className="modal-fade-in fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] pt-4 md:pt-4 pb-0 md:pb-4 px-0 md:px-4" onClick={onDiscard}>
      <div 
        className="relative flex flex-col bg-white rounded-[25px] shadow-2xl overflow-hidden max-w-md w-full mx-4" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center px-12.5 py-4 border-b border-gray-200">
          <span className="text-dream-primary text-lg font-normal">{t('unsavedChanges.title')}</span>
        </div>
        <div className="flex-1 flex flex-col justify-center items-center px-12.5 py-8">
          <div className="w-full">
            <p className="text-gray-800 text-lg mb-6 text-center">
              {t('unsavedChanges.message')}
            </p>
            <div className="flex gap-4">
              <button
                onClick={onDiscard}
                className="flex-1 bg-gray-200 text-gray-800 rounded-full py-3 px-5 hover:bg-gray-300 transition-colors text-lg font-normal"
              >
                {t('unsavedChanges.no')}
              </button>
              <button
                onClick={onSave}
                className="flex-1 bg-dream-primary text-white rounded-full py-3 px-5 hover:bg-green-700 transition-colors text-lg font-normal"
              >
                {t('unsavedChanges.yes')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

