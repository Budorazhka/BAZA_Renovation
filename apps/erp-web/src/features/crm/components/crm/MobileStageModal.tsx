import { useI18n } from '@/i18n';
import React from 'react';
import { createPortal } from 'react-dom';

interface MobileStageModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPosition: number;
  statusLabels: string[];
  statusGroups: Array<{
    startIndex: number;
    endIndex: number;
    leftColor: string;
    rightColor: string;
  }>;
  onStageChange: (position: number) => void;
  leadName: string;
  isWorkStarted?: boolean;
}

const MobileStageModal: React.FC<MobileStageModalProps> = ({
  isOpen,
  onClose,
  currentPosition,
  statusLabels,
  statusGroups,
  onStageChange,
  leadName,
  isWorkStarted = false,
}) => {
  const { t } = useI18n();
  const [tempPosition, setTempPosition] = React.useState(currentPosition);

  React.useEffect(() => {
    setTempPosition(currentPosition);
  }, [currentPosition, isOpen]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    onStageChange(tempPosition);
    onClose();
  };

  return createPortal(
    <div className="modal-fade-in fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
        {/* Заголовок */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-normal text-gray-800">{t('mobileStageModal.selectStageTitle')}</h3>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 transition-colors"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
          <p className="text-sm text-gray-600 mt-1">{leadName}</p>
        </div>

        {/* Контент с вертикальным слайдером */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex justify-center">
            <div className="relative" style={{ paddingLeft: '18.5px', paddingRight: '18.5px' }}>
              {/* Вертикальный слайдер */}
              <div className="relative w-[12px] rounded-full overflow-hidden" style={{ height: '400px' }}>
                {statusLabels.length > 0 && statusLabels.map((_: string, index: number) => {
                  if (index >= statusLabels.length - 1) return null;
                  
                  const nextPosition = index + 2;
                  const topPercent = (index / (statusLabels.length - 1)) * 100;
                  const heightPercent = 100 / (statusLabels.length - 1);
                  
                  const targetIndex = index + 1;
                  const group = statusGroups.find(g => targetIndex >= g.startIndex && targetIndex <= g.endIndex);
                  if (!group) return null;
                  
                  const isPartBeforeSlider = tempPosition >= nextPosition;
                  const nextStageLabel = statusLabels[index + 1];
                  const isWorkStartedStage = nextStageLabel === t('mobileStageModal.gettingStarted');
                  
                  const segmentColor = isWorkStartedStage
                    ? (isPartBeforeSlider ? 'rgb(255, 204, 0)' : 'rgb(255, 240, 179)')
                    : (isPartBeforeSlider ? group.leftColor : group.rightColor);
                  
                  return (
                    <div
                      key={index}
                      className="absolute left-0 w-full border-b-3 border-white last:border-b-0"
                      style={{
                        top: `${topPercent}%`,
                        height: `${heightPercent}%`,
                        backgroundColor: segmentColor,
                        transition: 'background-color 0.3s ease-out'
                      }}
                    />
                  );
                })}
                
                <input
                  type="range"
                  min="1"
                  max={statusLabels.length}
                  step="1"
                  value={tempPosition}
                  onChange={(e) => setTempPosition(Number(e.target.value))}
                  className="absolute top-0 left-0 w-full h-full opacity-0 z-30 cursor-pointer"
                  style={{
                    WebkitAppearance: 'slider-vertical' as any,
                    appearance: 'none',
                    background: 'transparent',
                    writingMode: 'bt-lr' as any,
                  }}
                />
              </div>
              
              {/* Ползунок */}
              {(() => {
                const currentIndex = tempPosition - 1;
                const currentGroup = statusGroups.find(g => currentIndex >= g.startIndex && currentIndex <= g.endIndex);
                
                const currentStatusLabel = statusLabels[currentIndex];
                const isCurrentWorkStarted = isWorkStarted || currentStatusLabel === t('mobileStageModal.gettingStarted');
                
                const sliderColor = isCurrentWorkStarted
                  ? 'rgb(255, 204, 0)'
                  : currentGroup 
                    ? (currentGroup.startIndex === 0 ? currentGroup.rightColor : currentGroup.leftColor)
                    : '#52B041';
                
                const rgbMatch = sliderColor.match(/\d+/g);
                const strokeColor = rgbMatch 
                  ? `rgba(${rgbMatch[0]}, ${rgbMatch[1]}, ${rgbMatch[2]}, 0.6)`
                  : isCurrentWorkStarted
                    ? 'rgba(255, 240, 179, 0.6)'
                    : 'rgba(165, 225, 165, 0.6)';
                
                return (
                  <svg
                    width="50"
                    height="22"
                    viewBox="0 0 50 22"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="absolute pointer-events-none z-20"
                    style={{
                      top: `calc(${((tempPosition - 1) / (statusLabels.length - 1)) * 100}% - 11px)`,
                      left: '50%',
                      transform: 'translateX(-50%) translateZ(0) rotate(90deg)',
                      transition: 'top 0.3s ease-out',
                      willChange: 'top'
                    }}
                  >
                    <path 
                      d="M11 0.5C12.7696 0.5 14.4743 1.20344 16.2308 2.59152C17.9923 3.98364 19.754 6.00754 21.3445 8.54762C24.5237 13.6246 27 20.6683 27 28.5C27 36.3317 24.5237 43.3754 21.3445 48.4524C19.754 50.9925 17.9923 53.0164 16.2308 54.4085C14.4743 55.7966 12.7696 56.5 11 56.5C9.23042 56.5 7.52574 55.7966 5.76924 54.4085C4.00769 53.0164 2.24599 50.9925 0.655479 48.4524C-2.52366 43.3754 -5 36.3317 -5 28.5C-5 20.6683 -2.52366 13.6246 0.655479 8.54762C2.24599 6.00754 4.00769 3.98364 5.76924 2.59152C7.52574 1.20344 9.23042 0.5 11 0.5Z" 
                      fill={sliderColor} 
                      stroke={strokeColor}
                      strokeWidth="1"
                      style={{
                        transition: 'fill 0.3s ease-out, stroke 0.3s ease-out'
                      }}
                    />
                  </svg>
                );
              })()}

              {/* Метки этапов */}
              <div className="absolute left-16 top-0 bottom-0 flex flex-col justify-between">
                {statusLabels.map((label, index) => (
                  <div
                    key={index}
                    className={`text-sm font-medium transition-all duration-300 ${
                      index === tempPosition - 1
                        ? 'text-dream-primary text-base font-normal'
                        : 'text-gray-600'
                    }`}
                    style={{
                      transform: index === tempPosition - 1 ? 'translateX(8px)' : 'translateX(0)',
                    }}
                  >
                    {label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Кнопки действий */}
        <div className="p-4 border-t border-gray-200 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 px-4 bg-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-300 transition-colors"
          >{t('mobileStageModal.cancel')}</button>
          <button
            onClick={handleConfirm}
            className="flex-1 py-3 px-4 bg-dream-primary text-white rounded-xl font-medium hover:bg-dream-primary/90 transition-colors"
          >{t('mobileStageModal.apply')}</button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default MobileStageModal;
