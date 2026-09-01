import React from 'react';
import { useI18n } from "@/i18n";

interface ColorPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  colorPalette: string[];
  selectedColor: string;
  onSelectColor: (color: string) => void;
  onOpenColorModal: () => void;
}

export const ColorPaletteModal: React.FC<ColorPaletteModalProps> = ({
  isOpen,
  onClose,
  colorPalette,
  selectedColor,
  onSelectColor,
  onOpenColorModal,
}) => {
    const { t } = useI18n();
  
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[9999] p-4" onClick={onClose}>
      <div className="relative bg-white rounded-[25px] shadow-2xl p-6 max-w-lg w-full border border-gray-100" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-200">
          <span 
            className="text-dream-primary"
            style={{
              fontFamily: 'var(--font-sans)',
              fontWeight: 400,
              fontStyle: 'normal',
              fontSize: '20px',
              lineHeight: '100%',
              letterSpacing: '0px',
              leadingTrim: 'none'
            } as React.CSSProperties & { leadingTrim?: string }}
          >
            {t('crm.crm.modals.colorPaletteModal.выберите_цвет')}</span>
          <button 
            onClick={onClose} 
            aria-label={t('crm.crm.modals.colorPaletteModal.закрыть')}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors"
          >
            <svg width="24" height="24" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.5 7.5L7.5 22.5" stroke="#169600" strokeWidth="2.5" strokeLinecap="round"/>
              <path d="M7.5 7.5L22.5 22.5" stroke="#169600" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        <div className="rounded-[20px] p-4 mb-4">
          <div className="grid grid-cols-5 gap-3 p-2">
            {colorPalette.map((hex) => (
              <button
                key={hex}
                type="button"
                onClick={() => {
                  onSelectColor(hex);
                  onClose();
                }}
                className={`w-14 h-14 rounded-lg border-2 transition-all duration-200 ${
                  selectedColor === hex
                    ? 'ring-2 ring-[var(--ring)] ring-offset-2 border-[var(--ring)] scale-105'
                    : 'border-[rgba(255,255,255,0.18)] hover:border-[var(--ring)] hover:scale-105'
                }`}
                style={{ backgroundColor: hex }}
                title={hex}
              >
                {selectedColor === hex && (
                  <div className="w-full h-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-white drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-end pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenColorModal();
            }}
            className="px-6 py-2.5 border-2 border-dream-primary text-dream-primary rounded-full hover:bg-dream-primary hover:text-white transition-all duration-200 font-medium"
            style={{
              fontFamily: 'var(--font-sans)',
            }}
          >
            {t('crm.crm.modals.colorPaletteModal.другие_цвета')}</button>
        </div>
      </div>
    </div>
  );
};

