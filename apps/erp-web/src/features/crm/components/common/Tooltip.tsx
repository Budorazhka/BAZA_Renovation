import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  text: string;
  children: React.ReactElement;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

const Tooltip: React.FC<TooltipProps> = ({ text, children, position = 'bottom' }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const childRef = React.useRef<HTMLDivElement>(null);

  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-gray-800 border-l-transparent border-r-transparent border-b-transparent',
    bottom: 'bottom-full left-[10%] -translate-x-1/2 border-b-gray-800 border-l-transparent border-r-transparent border-t-transparent',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-gray-800 border-t-transparent border-b-transparent border-r-transparent',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-gray-800 border-t-transparent border-b-transparent border-l-transparent',
  };

  const updatePosition = React.useCallback(() => {
    if (childRef.current) {
      const rect = childRef.current.getBoundingClientRect();
      if (position === 'bottom') {
        setTooltipPosition({
          top: rect.bottom + 8,
          left: rect.left - (rect.width * 0.1),
        });
      } else if (position === 'top') {
        setTooltipPosition({
          top: rect.top - 8,
          left: rect.left + rect.width / 2,
        });
      } else if (position === 'left') {
        setTooltipPosition({
          top: rect.top + rect.height / 2,
          left: rect.left - 8,
        });
      } else {
        setTooltipPosition({
          top: rect.top + rect.height / 2,
          left: rect.right + 8,
        });
      }
    }
  }, [position]);

  const handleMouseEnter = () => {
    setIsVisible(true);
    updatePosition();
  };

  const handleMouseLeave = () => {
    setIsVisible(false);
  };

  useEffect(() => {
    if (isVisible) {
      updatePosition();
      
      const handleScroll = () => {
        updatePosition();
      };

      window.addEventListener('scroll', handleScroll, true);
      window.addEventListener('resize', handleScroll, true);
      return () => {
        window.removeEventListener('scroll', handleScroll, true);
        window.removeEventListener('resize', handleScroll, true);
      };
    }
  }, [isVisible, updatePosition]);

  return (
    <>
      <div
        ref={childRef}
        className="relative inline-block"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {children}
      </div>
      {isVisible && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed"
          style={{ 
            top: `${tooltipPosition.top}px`, 
            left: `${tooltipPosition.left}px`,
            zIndex: 99999, 
            pointerEvents: 'none',
            transform: position === 'top' ? 'translate(-50%, -100%)' : position === 'left' ? 'translate(-100%, -50%)' : position === 'right' ? 'translate(0, -50%)' : 'none'
          }}
        >
          <div 
            className="bg-gray-800 text-white text-xs rounded-lg py-1.5 px-2.5 whitespace-nowrap shadow-lg"
            style={{ pointerEvents: 'none' }}
          >
            {text}
          </div>
          <div
            className={`absolute w-0 h-0 border-4 ${arrowClasses[position]}`}
            style={{ pointerEvents: 'none' }}
          />
        </div>,
        document.body
      )}
    </>
  );
};

export default Tooltip;

