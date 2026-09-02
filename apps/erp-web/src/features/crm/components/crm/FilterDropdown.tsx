import React, { useState, useRef, useEffect } from 'react';

interface FilterDropdownProps {
  title: string;
  options: string[];
  selectedItems: string[];
  onToggle: (item: string) => void;
  placeholder?: string;
}

const FilterDropdown: React.FC<FilterDropdownProps> = ({
  title,
  options,
  selectedItems,
  onToggle,
  placeholder = 'Выберите этапы'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isOpen &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className='flex flex-col items-start gap-3 relative'>
      <span className='text-[rgba(255,255,255,0.72)] font-normal text-base leading-none'>
        {title}
      </span>
      <div ref={dropdownRef} className="relative w-full">
        <div className="border border-[var(--accent)] bg-[var(--secondary)] overflow-hidden transition-all duration-300 ease-in-out rounded-[6px]">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className='flex items-center justify-between w-full min-h-11 py-2 px-4'
          >
            <span className={`flex-1 text-left truncate text-base transition-colors duration-300 ${isOpen ? 'text-[rgba(255,255,255,0.72)]' : selectedItems.length > 0 ? 'text-[rgba(255,255,255,0.92)]' : 'text-[var(--accent)]'}`}>
              {isOpen
                ? placeholder
                : selectedItems.length > 0
                  ? selectedItems.join(', ')
                  : options.join(', ')
              }
            </span>
            <svg
              width="36"
              height="36"
              viewBox="0 0 36 36"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className={`transition-transform duration-300 ease-in-out flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
            >
              <path d="M18.0009 19.757L25.4259 12.332L27.5469 14.453L18.0009 23.999L8.45488 14.453L10.5759 12.332L18.0009 19.757Z" fill="var(--accent)"/>
            </svg>
          </button>
          <div className={`overflow-y-auto transition-all duration-300 ease-in-out ${isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`} style={{ transition: 'max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }}>
            <div className="border-t border-[var(--border)] bg-[var(--muted)] py-1">
              {options.map((option, index) => {
                const isChecked = selectedItems.includes(option);
                return (
                  <label
                    key={option}
                    className="flex items-center gap-3 px-4 py-2 hover:bg-[var(--secondary)] cursor-pointer transition-all duration-200 ease-in-out active:scale-[0.99]"
                    style={{
                      animationDelay: isOpen ? `${index * 30}ms` : '0ms',
                      opacity: isOpen ? 1 : 0,
                      transform: isOpen ? 'translateX(0)' : 'translateX(-10px)',
                      transition: 'opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => onToggle(option)}
                      className="sr-only"
                    />
                    <div>
                      <div className={`w-5 h-5 rounded-[4px] border-2 flex items-center justify-center transition-all duration-300 ease-in-out ${
                        isChecked
                          ? 'bg-[var(--accent)] border-[var(--accent)] scale-110'
                          : 'bg-[var(--secondary)] border-[var(--accent)] scale-100'
                      }`}>
                        {isChecked && (
                          <svg className="w-5 h-5 text-[var(--card)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </div>
                    <span className='text-base text-[rgba(255,255,255,0.92)]'>{option}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FilterDropdown;
