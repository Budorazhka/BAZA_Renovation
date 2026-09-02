import React, { useState } from 'react';
import { useI18n } from '@/i18n';
import { useDisableScroll } from '../../hooks/useDisableScroll';

interface AddSubtaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (title: string) => void;
}

export const AddSubtaskModal: React.FC<AddSubtaskModalProps> = ({
  isOpen,
  onClose,
  onAdd,
}) => {
  useDisableScroll(isOpen);
  const [title, setTitle] = useState('');
  const { t } = useI18n();

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim()) {
      onAdd(title.trim());
      setTitle('');
      onClose();
    }
  };

  const handleClose = () => {
    setTitle('');
    onClose();
  };

  return (
    <div 
      className="modal-fade-in fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 pt-4 md:pt-4 pb-0 md:pb-4 px-0 md:px-4 transition-all duration-300 ease-out animate-in fade-in" 
      onClick={handleClose}
    >
      <div 
        className="relative flex flex-col bg-white rounded-[25px] shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center px-12.5 py-4 border-b border-gray-200">
          <span className="text-dream-primary text-lg font-normal">{t('addSubtaskModal.title')}</span>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label={t('addSubtaskModal.close')}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6L6 18M6 6l12 12" stroke="#169600" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        <div className="flex-1 flex flex-col justify-center items-center px-12.5 py-8">
          <form onSubmit={handleSubmit} className="w-full max-w-lg">
            <div className="relative w-full mb-6">
              <input
                id="subtask-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('addSubtaskModal.placeholder')}
                className="w-85 border-2 border-dream-primary bg-dream-secondary rounded-full pl-5 pr-5 py-3 focus:outline-none text-lg"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (title.trim()) {
                      onAdd(title.trim());
                      setTitle('');
                      onClose();
                    }
                  }
                }}
              />
            </div>
            <button
              type="submit"
              disabled={!title.trim()}
              className="w-full bg-dream-primary text-white rounded-full py-3 px-5 hover:bg-green-700 transition-all duration-200 ease-in-out text-lg font-normal disabled:bg-gray-400 disabled:cursor-not-allowed hover:scale-105 active:scale-95 disabled:hover:scale-100"
            >{t('otherModals.addSubtask.add')}</button>
          </form>
        </div>
      </div>
    </div>
  );
};
