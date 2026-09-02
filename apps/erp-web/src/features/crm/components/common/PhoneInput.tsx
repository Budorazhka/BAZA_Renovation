import React, { useState, useEffect, useRef } from 'react';

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  id?: string;
  title?: string;
}

// Расширенный список стран с кодами
const COUNTRIES: Array<{ code: string; flag: string; name: string; countryCode: string }> = [
  { code: '+1', flag: '🇺🇸', name: 'США', countryCode: 'US' },
  { code: '+7', flag: '🇷🇺', name: 'Россия', countryCode: 'RU' },
  { code: '+7', flag: '🇰🇿', name: 'Казахстан', countryCode: 'KZ' },
  { code: '+375', flag: '🇧🇾', name: 'Беларусь', countryCode: 'BY' },
  { code: '+380', flag: '🇺🇦', name: 'Украина', countryCode: 'UA' },
  { code: '+1', flag: '🇨🇦', name: 'Канада', countryCode: 'CA' },
  { code: '+44', flag: '🇬🇧', name: 'Великобритания', countryCode: 'GB' },
  { code: '+49', flag: '🇩🇪', name: 'Германия', countryCode: 'DE' },
  { code: '+33', flag: '🇫🇷', name: 'Франция', countryCode: 'FR' },
  { code: '+39', flag: '🇮🇹', name: 'Италия', countryCode: 'IT' },
  { code: '+34', flag: '🇪🇸', name: 'Испания', countryCode: 'ES' },
  { code: '+90', flag: '🇹🇷', name: 'Турция', countryCode: 'TR' },
  { code: '+86', flag: '🇨🇳', name: 'Китай', countryCode: 'CN' },
  { code: '+91', flag: '🇮🇳', name: 'Индия', countryCode: 'IN' },
  { code: '+971', flag: '🇦🇪', name: 'ОАЭ', countryCode: 'AE' },
  { code: '+972', flag: '🇮🇱', name: 'Израиль', countryCode: 'IL' },
  { code: '+81', flag: '🇯🇵', name: 'Япония', countryCode: 'JP' },
  { code: '+82', flag: '🇰🇷', name: 'Южная Корея', countryCode: 'KR' },
  { code: '+61', flag: '🇦🇺', name: 'Австралия', countryCode: 'AU' },
  { code: '+55', flag: '🇧🇷', name: 'Бразилия', countryCode: 'BR' },
  { code: '+52', flag: '🇲🇽', name: 'Мексика', countryCode: 'MX' },
  { code: '+31', flag: '🇳🇱', name: 'Нидерланды', countryCode: 'NL' },
  { code: '+32', flag: '🇧🇪', name: 'Бельгия', countryCode: 'BE' },
  { code: '+41', flag: '🇨🇭', name: 'Швейцария', countryCode: 'CH' },
  { code: '+46', flag: '🇸🇪', name: 'Швеция', countryCode: 'SE' },
  { code: '+47', flag: '🇳🇴', name: 'Норвегия', countryCode: 'NO' },
  { code: '+45', flag: '🇩🇰', name: 'Дания', countryCode: 'DK' },
  { code: '+358', flag: '🇫🇮', name: 'Финляндия', countryCode: 'FI' },
  { code: '+48', flag: '🇵🇱', name: 'Польша', countryCode: 'PL' },
  { code: '+420', flag: '🇨🇿', name: 'Чехия', countryCode: 'CZ' },
  { code: '+36', flag: '🇭🇺', name: 'Венгрия', countryCode: 'HU' },
  { code: '+40', flag: '🇷🇴', name: 'Румыния', countryCode: 'RO' },
  { code: '+351', flag: '🇵🇹', name: 'Португалия', countryCode: 'PT' },
  { code: '+30', flag: '🇬🇷', name: 'Греция', countryCode: 'GR' },
  { code: '+353', flag: '🇮🇪', name: 'Ирландия', countryCode: 'IE' },
  { code: '+995', flag: '🇬🇪', name: 'Грузия', countryCode: 'GE' },
  { code: '+374', flag: '🇦🇲', name: 'Армения', countryCode: 'AM' },
  { code: '+994', flag: '🇦🇿', name: 'Азербайджан', countryCode: 'AZ' },
  { code: '+998', flag: '🇺🇿', name: 'Узбекистан', countryCode: 'UZ' },
  { code: '+996', flag: '🇰🇬', name: 'Кыргызстан', countryCode: 'KG' },
  { code: '+992', flag: '🇹🇯', name: 'Таджикистан', countryCode: 'TJ' },
  { code: '+993', flag: '🇹🇲', name: 'Туркменистан', countryCode: 'TM' },
  { code: '+20', flag: '🇪🇬', name: 'Египет', countryCode: 'EG' },
  { code: '+27', flag: '🇿🇦', name: 'ЮАР', countryCode: 'ZA' },
  { code: '+65', flag: '🇸🇬', name: 'Сингапур', countryCode: 'SG' },
  { code: '+60', flag: '🇲🇾', name: 'Малайзия', countryCode: 'MY' },
  { code: '+66', flag: '🇹🇭', name: 'Таиланд', countryCode: 'TH' },
  { code: '+84', flag: '🇻🇳', name: 'Вьетнам', countryCode: 'VN' },
  { code: '+62', flag: '🇮🇩', name: 'Индонезия', countryCode: 'ID' },
  { code: '+63', flag: '🇵🇭', name: 'Филиппины', countryCode: 'PH' },
];

// Определение страны по номеру
const detectCountryFromPhone = (phone: string): string | null => {
  if (!phone) return null;
  
  const cleanPhone = phone.replace(/[^\d+]/g, '');
  
  // Сортируем страны по длине кода (от большего к меньшему) для правильного определения
  const sortedCountries = [...COUNTRIES].sort((a, b) => b.code.length - a.code.length);
  
  for (const country of sortedCountries) {
    if (cleanPhone.startsWith(country.code)) {
      return country.countryCode;
    }
  }
  
  return null; // Не найдено - возвращаем null вместо 'RU'
};

// Форматирование телефона
const formatPhone = (value: string, countryCode: string = 'US'): string => {
  let cleaned = value.replace(/[^\d+]/g, '');
  
  // Находим страну
  const country = COUNTRIES.find(c => c.countryCode === countryCode) || COUNTRIES[0];
  
  // Если нет + в начале, добавляем код страны
  if (!cleaned.startsWith('+')) {
    if (cleaned.startsWith('8') && (countryCode === 'RU' || countryCode === 'KZ')) {
      cleaned = country.code + cleaned.substring(1);
    } else if (cleaned.startsWith('7') && countryCode === 'RU') {
      cleaned = country.code + cleaned.substring(1);
    } else {
      cleaned = country.code + cleaned;
    }
  }
  
  cleaned = cleaned.replace(/[^\d+]/g, '');
  
  // Форматируем для России и Казахстана
  if (countryCode === 'RU' || countryCode === 'KZ') {
    const match = cleaned.match(/^\+7(\d{0,10})/);
    if (match) {
      const digits = match[1];
      if (digits.length === 0) return '+7';
      if (digits.length <= 3) return `+7 (${digits}`;
      if (digits.length <= 6) return `+7 (${digits.slice(0, 3)}) ${digits.slice(3)}`;
      if (digits.length <= 8) return `+7 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
      return `+7 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8, 10)}`;
    }
  }
  
  // Для других стран форматируем с пробелами
  const digits = cleaned.replace(country.code, '').replace(/[^\d]/g, '');
  if (digits.length === 0) return country.code;
  
  let formatted = country.code + ' ';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && i % 3 === 0) {
      formatted += ' ';
    }
    formatted += digits[i];
  }
  
  return formatted;
};

// Получение чистого номера
const getCleanPhone = (value: string): string => {
  return value.replace(/[^\d+]/g, '');
};

export const PhoneInput: React.FC<PhoneInputProps> = ({
  value,
  onChange,
  placeholder = 'Введите номер телефона',
  disabled = false,
  required = false,
  className = '',
  style,
  onFocus,
  onBlur,
  id,
  title,
}) => {
  const [displayValue, setDisplayValue] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<string>('US');
  const [countryCodeInput, setCountryCodeInput] = useState('+1');
  const [isCountryCodeFocused, setIsCountryCodeFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const countryCodeInputRef = useRef<HTMLInputElement>(null);

  // Инициализация при изменении value
  useEffect(() => {
    // Не обновляем код страны, если пользователь активно редактирует поле кода
    if (isCountryCodeFocused) {
      return;
    }
    
    if (value) {
      const detectedCountry = detectCountryFromPhone(value);
      if (detectedCountry) {
        // Страна найдена - обновляем все
        setSelectedCountry(detectedCountry);
        const formatted = formatPhone(value, detectedCountry);
        setDisplayValue(formatted);
        const country = COUNTRIES.find(c => c.countryCode === detectedCountry) || COUNTRIES[0];
        setCountryCodeInput(country.code);
      } else {
        // Страна не найдена - оставляем введенное значение как есть
        // Пытаемся извлечь код из value
        const codeMatch = value.match(/^\+?\d{1,4}/);
        if (codeMatch && codeMatch[0].startsWith('+')) {
          setCountryCodeInput(codeMatch[0]);
        }
        setDisplayValue(value);
      }
    } else {
      setDisplayValue('');
      setSelectedCountry('US');
      // Обновляем код только если поле не в фокусе
      if (!isCountryCodeFocused) {
        setCountryCodeInput('+1');
      }
    }
  }, [value, isCountryCodeFocused]);

  const selectedCountryData = COUNTRIES.find(c => c.countryCode === selectedCountry) || COUNTRIES[0];

  // Поиск страны по коду
  const findCountryByCode = (code: string) => {
    if (!code || !code.startsWith('+')) return null;
    const cleanCode = code.replace(/[^\d+]/g, '');
    const sortedCountries = [...COUNTRIES].sort((a, b) => b.code.length - a.code.length);
    return sortedCountries.find(c => cleanCode.startsWith(c.code)) || null;
  };

  // Находим страну по текущему введенному коду для подсказки
  const foundCountryByCode = isCountryCodeFocused ? findCountryByCode(countryCodeInput) : null;

  const handleCountryCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    // Позволяем вводить любой текст, включая пустую строку - сразу обновляем состояние
    setCountryCodeInput(inputValue);
    
    // Если поле пустое или только +, не обновляем номер телефона
    if (!inputValue || inputValue.trim() === '' || inputValue === '+') {
      return;
    }
    
    // Ищем страну по введенному коду
    const foundCountry = findCountryByCode(inputValue);
    if (foundCountry) {
      setSelectedCountry(foundCountry.countryCode);
      // Обновляем номер телефона с новым кодом страны, сохраняя введенные цифры
      const currentDigits = displayValue.replace(/[^\d+]/g, '');
      // Удаляем старый код страны
      const digitsOnly = currentDigits.replace(/^\+?\d{1,4}/, '');
      const newPhone = foundCountry.code + digitsOnly;
      const formatted = formatPhone(newPhone, foundCountry.countryCode);
      setDisplayValue(formatted);
      onChange(getCleanPhone(formatted));
    } else if (inputValue.startsWith('+')) {
      // Даже если страна не найдена, обновляем номер телефона с новым кодом
      // Это позволяет вводить любые коды стран
      const currentDigits = displayValue.replace(/[^\d+]/g, '');
      const digitsOnly = currentDigits.replace(/^\+?\d{1,4}/, '');
      const newPhone = inputValue + digitsOnly;
      // Форматируем без привязки к конкретной стране
      const cleaned = newPhone.replace(/[^\d+]/g, '');
      setDisplayValue(cleaned);
      onChange(cleaned);
    }
  };

  const handleCountryCodeFocus = () => {
    setIsCountryCodeFocused(true);
    // При фокусе выделяем весь текст, чтобы можно было легко заменить
    setTimeout(() => {
      if (countryCodeInputRef.current) {
        countryCodeInputRef.current.select();
      }
    }, 0);
  };

  const handleCountryCodeBlur = () => {
    setIsCountryCodeFocused(false);
    
    // Если поле пустое или содержит только +, восстанавливаем код выбранной страны
    if (!countryCodeInput || countryCodeInput.trim() === '' || countryCodeInput === '+') {
      setCountryCodeInput(selectedCountryData.code);
      return;
    }
    
    // Если код не начинается с +, добавляем +
    let finalCode = countryCodeInput;
    if (!countryCodeInput.startsWith('+')) {
      finalCode = '+' + countryCodeInput;
      setCountryCodeInput(finalCode);
    }
    
    // Пытаемся найти страну по коду
    const foundCountry = findCountryByCode(finalCode);
    if (foundCountry) {
      setSelectedCountry(foundCountry.countryCode);
      // Нормализуем код до стандартного формата из списка
      setCountryCodeInput(foundCountry.code);
    }
    // Если код не найден, оставляем как есть - пользователь может вводить свой код
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    
    // Не обновляем код страны, если пользователь активно редактирует поле кода страны
    if (isCountryCodeFocused) {
      // Просто обновляем отображаемое значение без изменения кода страны
      const formatted = formatPhone(inputValue, selectedCountry);
      setDisplayValue(formatted);
      onChange(getCleanPhone(formatted));
      return;
    }
    
    // Если поле пустое, просто очищаем все
    if (!inputValue || inputValue.trim() === '') {
      setDisplayValue('');
      onChange('');
      return;
    }
    
    // Если пользователь вводит код страны в основном поле, определяем страну сразу
    if (inputValue.startsWith('+')) {
      const foundCountry = findCountryByCode(inputValue);
      if (foundCountry) {
        // Если нашли страну по коду, обновляем все сразу
        setSelectedCountry(foundCountry.countryCode);
        setCountryCodeInput(foundCountry.code);
        const formatted = formatPhone(inputValue, foundCountry.countryCode);
        setDisplayValue(formatted);
        onChange(getCleanPhone(formatted));
        return;
      } else {
        // Код начинается с +, но страна не найдена - позволяем вводить любой код
        // Обновляем поле кода страны с введенным значением
        const codeMatch = inputValue.match(/^\+?\d{1,4}/);
        if (codeMatch) {
          setCountryCodeInput(codeMatch[0]);
        }
        setDisplayValue(inputValue);
        onChange(getCleanPhone(inputValue));
        return;
      }
    }
    
    // Если код не найден или номер не начинается с +, используем стандартную логику
    const detectedCountry = detectCountryFromPhone(inputValue);
    
    if (detectedCountry) {
      // Страна найдена - обновляем все
      const detectedCountryData = COUNTRIES.find(c => c.countryCode === detectedCountry) || COUNTRIES[0];
      
      // Обновляем код страны в отдельном поле, если определили страну
      if (detectedCountry !== selectedCountry) {
        setSelectedCountry(detectedCountry);
        setCountryCodeInput(detectedCountryData.code);
      }
      
      const formatted = formatPhone(inputValue, detectedCountry);
      setDisplayValue(formatted);
      onChange(getCleanPhone(formatted));
    } else {
      // Страна не найдена - оставляем введенное значение как есть
      // Не обновляем код страны в отдельном поле, если он не в фокусе
      if (!isCountryCodeFocused) {
        // Пытаемся извлечь код из введенного значения
        const codeMatch = inputValue.match(/^\+?\d{1,4}/);
        if (codeMatch && codeMatch[0].startsWith('+')) {
          setCountryCodeInput(codeMatch[0]);
        }
      }
      // Оставляем значение как есть, без форматирования
      setDisplayValue(inputValue);
      onChange(getCleanPhone(inputValue));
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    // Не подставляем автоматически код страны - позволяем пользователю вводить свой код
    // Если поле пустое, оставляем его пустым
    onFocus?.(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const trimmed = displayValue.trim();
    if (trimmed !== displayValue) {
      setDisplayValue(trimmed);
      onChange(getCleanPhone(trimmed));
    }
    onBlur?.(e);
  };

  return (
    <div className="relative flex items-center">
      {/* Поле ввода кода страны */}
      <div className="relative flex items-center border-r border-gray-300 bg-gray-50 rounded-l-full" style={{ minWidth: '100px' }}>
        <span className="text-lg px-2">{selectedCountryData.flag}</span>
        <input
          ref={countryCodeInputRef}
          type="text"
          value={countryCodeInput}
          onChange={handleCountryCodeChange}
          onFocus={handleCountryCodeFocus}
          onBlur={handleCountryCodeBlur}
          disabled={disabled}
          placeholder="+1"
          className="flex-1 bg-transparent border-0 outline-none px-2 py-2 text-sm font-medium text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ minWidth: '60px', maxWidth: '80px' }}
          onKeyDown={(e) => {
            // Разрешаем удаление всего содержимого
            if (e.key === 'Backspace' || e.key === 'Delete') {
              // Позволяем удаление без ограничений
              return;
            }
          }}
        />
        {foundCountryByCode && (
          <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 px-2 py-1 text-xs text-gray-600">
            {foundCountryByCode.name}
          </div>
        )}
      </div>

      {/* Поле ввода номера */}
      <input
        ref={inputRef}
        id={id}
        type="tel"
        value={displayValue}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        disabled={disabled}
        required={required}
        placeholder={placeholder}
        title={title}
        className={`flex-1 ${className}`}
        style={{
          ...style,
          borderTopLeftRadius: 0,
          borderBottomLeftRadius: 0,
        }}
        autoComplete="tel"
      />
    </div>
  );
};
