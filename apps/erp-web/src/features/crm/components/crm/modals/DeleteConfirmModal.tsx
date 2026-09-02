import React from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/i18n';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  title,
  message,
  onCancel,
  onConfirm,
}) => {
  const { t } = useI18n();
  if (!isOpen) return null;

  return createPortal(
    <div 
      className="modal-fade-in fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[80] pt-4 md:pt-4 pb-0 md:pb-4 px-0 md:px-4" 
      onClick={onCancel}
    >
      <div 
        className="relative flex flex-col bg-white rounded-[25px] shadow-2xl overflow-hidden max-w-md w-full mx-4" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
          <span className="text-dream-primary text-lg font-normal">{title}</span>
        </div>
        <div className="flex-1 flex flex-col justify-center items-center px-6 py-8">
          <div className="w-full">
            <p className="text-gray-800 text-base mb-6 text-center">
              {message}
            </p>
            <div className="flex gap-4">
              <button
                onClick={onCancel}
                className="flex-1 bg-gray-200 text-gray-800 rounded-full py-3 px-5 hover:bg-gray-300 transition-colors text-lg font-normal"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={onConfirm}
                className="flex-1 bg-red-600 text-white rounded-full py-3 px-5 hover:bg-red-700 transition-colors text-lg font-normal"
              >
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

