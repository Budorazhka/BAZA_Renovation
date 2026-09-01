import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from "@/i18n";

const timeFormatter = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const formatPickerLabel = (value: string) => {
  if (!value) return '';
  const date = new Date(`1970-01-01T${value}:00`);
  if (Number.isNaN(date.getTime())) return value;
  return timeFormatter.format(date);
};

const timeToMinutes = (value: string): number => {
  const [h, m] = value.split(':').map((v) => Number.parseInt(v, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
};

const formatDurationFromStart = (
  startValue: string | undefined, 
  targetValue: string, 
  startDate?: string, 
  endDate?: string
): string => {
  if (!startValue) return '';
  
  let diff = timeToMinutes(targetValue) - timeToMinutes(startValue);
  const timeCrossedMidnight = diff < 0;
  if (timeCrossedMidnight) {
    diff += 24 * 60; // поддержка перехода через полночь
  }
  
  // Если есть даты и они разные, вычисляем количество дней
  let days = 0;
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    const diffTime = end.getTime() - start.getTime();
    days = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    // Если время перешло через полночь и есть дни, уменьшаем дни на 1
    // (так как это означает, что прошло меньше 24 часов с начала последнего дня)
    if (timeCrossedMidnight && days > 0) {
      days--;
    }
  }
  
  if (days === 0 && diff === 0) return '0 мин.';
  
  const hours = Math.floor(diff / 60);
  const minutes = diff % 60;
  
  // Формируем строку с днями, часами и минутами
  const parts: string[] = [];
  if (days > 0) {
    const dayWord = days === 1 ? 'день' : days < 5 ? 'дня' : 'дней';
    parts.push(`${days} ${dayWord}`);
  }
  if (hours > 0) {
    parts.push(`${hours} ч.`);
  }
  if (minutes > 0 && days === 0) {
    parts.push(`${minutes} мин.`);
  }
  
  return parts.join(' ') || '0 мин.';
};

const TIME_OPTIONS = Array.from({ length: 96 }, (_, index) => {
  const hours = Math.floor(index / 4);
  const minutes = (index % 4) * 15;
  const value = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  return {
    value,
    label: formatPickerLabel(value),
  };
});

export interface TimePickerDropdownProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  disableBefore?: string;
  showDurationFrom?: string;
  startDate?: string;
  endDate?: string;
  ariaLabel?: string;
  className?: string;
  scrollToValue?: string;
  quickAddMinutes?: number[];
  quickAddBase?: string;
}

export const TimePickerDropdown: React.FC<TimePickerDropdownProps> = ({
  value,
  onChange,
  placeholder = 'Время',
  disabled = false,
  disableBefore,
  showDurationFrom,
  startDate,
  endDate,
  ariaLabel,
  className = '',
  scrollToValue,
  quickAddMinutes,
  quickAddBase,
}) => {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const lastScrollTopRef = useRef<number | null>(null);

  const toggleOpen = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (disabled) return;
      setIsOpen((prev) => !prev);
    },
    [disabled],
  );

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !listRef.current) return;
    const listEl = listRef.current;
    requestAnimationFrame(() => {
      if (lastScrollTopRef.current !== null) {
        listEl.scrollTop = lastScrollTopRef.current;
        return;
      }
      const anchorValue = scrollToValue || value;
      const selectedIndex = TIME_OPTIONS.findIndex((option) => option.value === anchorValue);
      if (selectedIndex >= 0) {
        listEl.scrollTop = Math.max(selectedIndex * 40 - 80, 0);
      }
    });
  }, [isOpen, value, scrollToValue]);

  const disableBeforeMinutes = useMemo(() => (disableBefore ? timeToMinutes(disableBefore) : null), [disableBefore]);

  const handleSelect = (newValue: string) => {
    onChange(newValue);
    lastScrollTopRef.current = listRef.current?.scrollTop ?? null;
    setIsOpen(false);
  };

  const handleQuickAdd = (minutes: number) => {
    if (!quickAddBase) return;
    const baseMinutes = timeToMinutes(quickAddBase);
    if (Number.isNaN(baseMinutes)) return;
    const total = (baseMinutes + minutes) % (24 * 60);
    const hours = Math.floor(total / 60);
    const mins = total % 60;
    const newValue = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    handleSelect(newValue);
  };

  const quickButtons = quickAddMinutes?.length ? (
    <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3">
      <div className="grid grid-cols-3 gap-3">
        {quickAddMinutes.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => handleQuickAdd(m)}
            disabled={!quickAddBase}
            className={`w-full min-w-[68px] text-center rounded-lg px-3 py-1.5 text-dream-primary bg-dream-secondary font-normal text-xs border border-dream-primary/15 transition-colors ${
              quickAddBase ? 'hover:bg-dream-secondary/80' : 'opacity-60 cursor-not-allowed'
            }`}
          >
            {m} {t('crm.crm.common.timePickerDropdown.мин')}</button>
        ))}
      </div>
    </div>
  ) : null;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        aria-label={ariaLabel || placeholder}
        onClick={toggleOpen}
        disabled={disabled}
        className={`w-full h-9 px-5 py-2 border-2 border-dream-primary/30 bg-white rounded-full focus:outline-none focus:ring-2 focus:ring-dream-primary transition-all flex items-center justify-center relative ${
          disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-dream-secondary'
        }`}
      >
        <span className={value ? 'text-dream-primary' : 'text-gray-400'}>
          {value ? formatPickerLabel(value) : placeholder}
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          className={`absolute right-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute bottom-full mb-2 z-[110] w-[110%] left-1/2 -translate-x-1/2 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
          <div
            ref={listRef}
            className="max-h-72 md:max-h-80 overflow-y-auto"
            onScroll={(e) => {
              lastScrollTopRef.current = (e.target as HTMLDivElement).scrollTop;
            }}
          >
            {quickButtons}
            {TIME_OPTIONS.map((option) => {
              const optionMinutes = timeToMinutes(option.value);
              // Если даты начала и окончания разные (задача длится больше суток), не блокируем время
              let isMultiDay = false;
              if (startDate && endDate) {
                const start = new Date(startDate);
                const end = new Date(endDate);
                start.setHours(0, 0, 0, 0);
                end.setHours(0, 0, 0, 0);
                isMultiDay = start.getTime() !== end.getTime();
              }
              const isDisabled = !isMultiDay && disableBeforeMinutes !== null && optionMinutes < disableBeforeMinutes;
              const durationLabel = showDurationFrom ? formatDurationFromStart(showDurationFrom, option.value, startDate, endDate) : '';
              const isSelected = value === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => handleSelect(option.value)}
                  className={`w-full flex items-center justify-between px-4 py-2 text-left transition-colors ${
                    isSelected ? 'bg-dream-secondary text-dream-primary font-normal' : 'hover:bg-dream-secondary/60'
                  } ${isDisabled ? 'text-gray-400 cursor-not-allowed hover:bg-white' : 'text-gray-900'}`}
                >
                  <span>{option.label}</span>
                  {durationLabel && (
                    <span className={`text-sm ${isDisabled ? 'text-gray-400' : 'text-gray-600'}`}>
                      {durationLabel}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default TimePickerDropdown;

