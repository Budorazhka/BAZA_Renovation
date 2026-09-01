import { useI18n } from '@/i18n';
import React from 'react';

interface ColorModalProps {
  isOpen: boolean;
  onClose: () => void;
  newColorHex: string;
  setNewColorHex: (color: string) => void;
  onAddColor: (color: string) => void;
}

export const ColorModal: React.FC<ColorModalProps> = ({
  isOpen,
  onClose,
  newColorHex,
  setNewColorHex,
  onAddColor,
}) => {
  const { t } = useI18n();
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[9999] p-4" onClick={onClose}>
      <div className="relative w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="bg-white flex flex-col min-h-0 min-w-0 rounded-[20px] px-6 py-4 shadow-2xl w-full overflow-hidden">
          <div className="flex justify-between items-center mb-3">
            <span className="text-dream-primary">{t('colorModal.newColorLabelTitle')}</span>
            <button onClick={onClose} aria-label={t('colorModal.close')}>
              <svg width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.5 7.5L7.5 22.5" stroke="#169600" strokeWidth="3" strokeLinecap="round"/>
                <path d="M7.5 7.5L22.5 22.5" stroke="#169600" strokeWidth="3" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={newColorHex}
              onChange={(e) => setNewColorHex(e.target.value)}
              className="w-12 h-12 p-0 border-0 bg-transparent cursor-pointer"
            />
            <input
              type="text"
              value={newColorHex}
              onChange={(e) => setNewColorHex(e.target.value)}
              className="flex-1 border-2 border-dream-primary bg-dream-secondary rounded-full px-4 py-2 focus:outline-none"
            />
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => {
                const hex = newColorHex.trim();
                if (!hex) return;
                onAddColor(hex);
                onClose();
              }}
              className="bg-dream-primary text-white py-2 px-5 rounded-full"
            >{t('otherModals.color.add')}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

