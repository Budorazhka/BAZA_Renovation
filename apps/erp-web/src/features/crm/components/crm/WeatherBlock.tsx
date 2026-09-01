import { useI18n } from '@/i18n';
import { useState, useEffect, useCallback, useMemo } from 'react';

interface WeatherData {
  temperature: number;
  description: string;
  humidity: number;
  windSpeed: number;
  icon: string;
  city: string;
}

type WeatherStatus = 'loading' | 'success' | 'error' | 'permission-denied';

const WeatherBlock = () => {
  const { t } = useI18n();
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [status, setStatus] = useState<WeatherStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [currentTime, setCurrentTime] = useState<number>(Date.now());

  // wttr.in API - бесплатный, без ключей, работает через веб-интерфейс
  // Используем формат JSON через специальный endpoint

  const getWeatherIcon = (weatherCode: number, isDay: boolean): string => {
    // WMO Weather interpretation codes (WW)
    // https://open-meteo.com/en/docs
    const iconMap: Record<number, string> = {
      0: isDay ? '☀️' : '🌙', // Clear sky
      1: isDay ? '🌤️' : '☁️', // Mainly clear
      2: '⛅', // Partly cloudy
      3: '☁️', // Overcast
      45: '🌫️', // Fog
      48: '🌫️', // Depositing rime fog
      51: '🌦️', // Light drizzle
      53: '🌦️', // Moderate drizzle
      55: '🌧️', // Dense drizzle
      56: '🌨️', // Light freezing drizzle
      57: '🌨️', // Dense freezing drizzle
      61: '🌦️', // Slight rain
      63: '🌧️', // Moderate rain
      65: '🌧️', // Heavy rain
      66: '🌨️', // Light freezing rain
      67: '🌨️', // Heavy freezing rain
      71: '🌨️', // Slight snow fall
      73: '❄️', // Moderate snow fall
      75: '❄️', // Heavy snow fall
      77: '❄️', // Snow grains
      80: '🌦️', // Slight rain showers
      81: '🌧️', // Moderate rain showers
      82: '🌧️', // Violent rain showers
      85: '🌨️', // Slight snow showers
      86: '❄️', // Heavy snow showers
      95: '⛈️', // Thunderstorm
      96: '⛈️', // Thunderstorm with slight hail
      99: '⛈️', // Thunderstorm with heavy hail
    };
    return iconMap[weatherCode] || '🌤️';
  };

  const getWeatherDescription = (weatherCode: number): string => {
    const descMap: Record<number, string> = {
      0: t('weatherBlock.clear'),
      1: t('weatherBlock.mostlyClear'),
      2: t('additionalBlocks.weather.partlyCloudy'),
      3: t('weatherBlock.overcast'),
      45: t('weatherBlock.fog'),
      48: t('weatherBlock.rimeFog'),
      51: t('weatherBlock.lightDrizzle'),
      53: t('weatherBlock.moderateDrizzle'),
      55: t('weatherBlock.denseDrizzle'),
      56: t('weatherBlock.lightFreezingDrizzle'),
      57: t('weatherBlock.denseFreezingDrizzle'),
      61: t('weatherBlock.slightRain'),
      63: t('weatherBlock.moderateRain'),
      65: t('weatherBlock.heavyRain'),
      66: t('weatherBlock.lightFreezingRain'),
      67: t('weatherBlock.heavyFreezingRain'),
      71: t('weatherBlock.slightSnow'),
      73: t('weatherBlock.moderateSnow'),
      75: t('weatherBlock.heavySnow'),
      77: t('weatherBlock.snowGrains'),
      80: t('weatherBlock.slightRainShowers'),
      81: t('weatherBlock.moderateRainShowers'),
      82: t('weatherBlock.violentRainShowers'),
      85: t('weatherBlock.slightSnowShowers'),
      86: t('weatherBlock.heavySnowShowers'),
      95: t('weatherBlock.thunderstorm'),
      96: t('weatherBlock.thunderstormSlightHail'),
      99: t('weatherBlock.thunderstormHeavyHail'),
    };
    return descMap[weatherCode] || t('additionalBlocks.weather.partlyCloudy');
  };

  const fetchWeather = useCallback(async (lat: number, lon: number) => {
    try {
      setStatus('loading');
      
      // Сначала пробуем быстрый вариант - wttr.in без координат (по IP) - быстрее
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 секунд таймаут для быстрого ответа
        
        const ipResponse = await fetch(
          `https://wttr.in?format=j1&lang=ru`,
          {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
            },
            signal: controller.signal,
          }
        );
        
        clearTimeout(timeoutId);
        
        if (ipResponse.ok) {
          const text = await ipResponse.text();
          if (text.trim().startsWith('{')) {
            try {
              const data = JSON.parse(text);
              
              if (data.current_condition && data.current_condition[0]) {
                const current = data.current_condition[0];
                const location = data.nearest_area?.[0];
                
                const weatherCode = parseInt(current.weatherCode) || 0;
                
                setWeather({
                  temperature: parseInt(current.temp_C) || 20,
                  description: current.lang_ru && current.lang_ru[0] ? current.lang_ru[0].value : (current.weatherDesc && current.weatherDesc[0] ? current.weatherDesc[0].value : t('additionalBlocks.weather.partlyCloudy')),
                  humidity: parseInt(current.humidity) || 60,
                  windSpeed: Math.round(parseFloat(current.windspeedKmph) || 10),
                  icon: weatherCode.toString(),
                  city: location && location.areaName && location.areaName[0] ? location.areaName[0].value : t('additionalBlocks.weather.currentLocation'),
                });
                setStatus('success');
                return;
              }
            } catch (parseError) {
              console.error('Ошибка парсинга wttr.in по IP JSON:', parseError);
            }
          }
        }
      } catch (ipError: any) {
        if (ipError.name !== 'AbortError') {
          // ignore
        }
      }

      // Используем wttr.in API с правильным форматом для координат
      // Формат: wttr.in/lat,lon?format=j1
      const wttrUrl = `https://wttr.in/${lat},${lon}?format=j1&lang=ru`;
      
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 секунд таймаут
        
        const response = await fetch(wttrUrl, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const text = await response.text();

          // Иногда wttr.in возвращает HTML с ошибкой, проверяем
          if (text.trim().startsWith('{')) {
            try {
              const data = JSON.parse(text);
              
              if (data.current_condition && data.current_condition[0]) {
                const current = data.current_condition[0];
                const location = data.nearest_area?.[0];
                
                // Преобразуем код погоды wttr.in в наш формат
                const weatherCode = parseInt(current.weatherCode) || 0;
                
                setWeather({
                  temperature: parseInt(current.temp_C) || 20,
                  description: current.lang_ru && current.lang_ru[0] ? current.lang_ru[0].value : (current.weatherDesc && current.weatherDesc[0] ? current.weatherDesc[0].value : t('additionalBlocks.weather.partlyCloudy')),
                  humidity: parseInt(current.humidity) || 60,
                  windSpeed: Math.round(parseFloat(current.windspeedKmph) || 10),
                  icon: weatherCode.toString(),
                  city: location && location.areaName && location.areaName[0] ? location.areaName[0].value : t('additionalBlocks.weather.currentLocation'),
                });
                setStatus('success');
                return;
              } else {
                console.warn('wttr.in: нет current_condition в ответе');
              }
            } catch (parseError) {
              console.error('Ошибка парсинга wttr.in JSON:', parseError);
            }
          } else {
            console.warn('wttr.in вернул не JSON:', text.substring(0, 100));
          }
        } else {
          console.warn('wttr.in вернул статус:', response.status);
        }
      } catch (_wttrError: any) {
        // ignore
      }
      
      // Fallback: используем другой бесплатный API - 7timer! (без ключей)
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const timerResponse = await fetch(
          `https://www.7timer.info/bin/api.pl?lon=${lon}&lat=${lat}&product=civillight&output=json`,
          { signal: controller.signal }
        );
        
        clearTimeout(timeoutId);
        
        if (timerResponse.ok) {
          const text = await timerResponse.text();

          // 7timer возвращает JSONP-подобный формат, нужно извлечь JSON
          let timerData;
          try {
            // Пытаемся найти JSON объект в ответе
            // 7timer может возвращать данные в формате callback({...})
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const jsonStr = jsonMatch[0];
              // Пытаемся исправить невалидный JSON
              // Заменяем проблемные места
              let cleanedJson = jsonStr
                .replace(/,\s*}/g, '}') // Убираем запятые перед закрывающими скобками
                .replace(/,\s*]/g, ']'); // Убираем запятые перед закрывающими квадратными скобками
              
              timerData = JSON.parse(cleanedJson);
            } else {
              // Пробуем обычный парсинг
              timerData = JSON.parse(text);
            }
          } catch (parseError) {
            console.error('Ошибка парсинга 7timer JSON:', parseError);
            // Пробуем извлечь данные вручную через регулярные выражения
            const dataseriesMatch = text.match(/"dataseries"\s*:\s*\[([\s\S]*?)\]/);
            if (dataseriesMatch) {
              const firstItemMatch = dataseriesMatch[1].match(/\{([^}]+)\}/);
              if (firstItemMatch) {
                const itemStr = '{' + firstItemMatch[1] + '}';
                try {
                  const item = JSON.parse(itemStr);
                  // Создаем минимальную структуру данных
                  timerData = {
                    dataseries: [{
                      weather: item.weather || 0,
                      temp2m: item.temp2m || { max: 20, min: 15 },
                      wind10m_max: item.wind10m_max || { speed: 10 }
                    }]
                  };
                } catch (e) {
                  throw parseError;
                }
              } else {
                throw parseError;
              }
            } else {
              throw parseError;
            }
          }
          
          if (timerData && timerData.dataseries && timerData.dataseries[0]) {
            const today = timerData.dataseries[0];
            
            // Преобразуем код 7timer в наш формат
            const weatherCode = today.weather || 0;
            const temp = today.temp2m?.max || today.temp2m?.min || (today.temp2m && typeof today.temp2m === 'number' ? today.temp2m : 20);
            
            setWeather({
              temperature: temp,
              description: getWeatherDescription(weatherCode),
              humidity: 60, // 7timer не предоставляет влажность
              windSpeed: today.wind10m_max?.speed || today.wind10m?.speed || (today.wind10m && typeof today.wind10m === 'number' ? today.wind10m : 10),
              icon: weatherCode.toString(),
              city: t('additionalBlocks.weather.currentLocation'),
            });
            setStatus('success');
            return;
          }
        }
      } catch (_timerError: any) {
        // ignore
      }
      
      // Последний fallback: используем простой API через прокси или демо-данные
      // Используем wttr.in без координат (определит по IP)
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        
        const ipResponse = await fetch(
          `https://wttr.in?format=j1&lang=ru`,
          {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
            },
            signal: controller.signal,
          }
        );
        
        clearTimeout(timeoutId);
        
        if (ipResponse.ok) {
          const text = await ipResponse.text();
          if (text.trim().startsWith('{')) {
            const data = JSON.parse(text);
            
            if (data.current_condition && data.current_condition[0]) {
              const current = data.current_condition[0];
              const location = data.nearest_area?.[0];
              
              const weatherCode = parseInt(current.weatherCode) || 0;
              
              setWeather({
                temperature: parseInt(current.temp_C) || 20,
                description: current.lang_ru && current.lang_ru[0] ? current.lang_ru[0].value : (current.weatherDesc && current.weatherDesc[0] ? current.weatherDesc[0].value : t('additionalBlocks.weather.partlyCloudy')),
                humidity: parseInt(current.humidity) || 60,
                windSpeed: Math.round(parseFloat(current.windspeedKmph) || 10),
                icon: weatherCode.toString(),
                city: location && location.areaName && location.areaName[0] ? location.areaName[0].value : t('additionalBlocks.weather.currentLocation'),
              });
              setStatus('success');
              return;
            }
          }
        }
      } catch (_ipError: any) {
        // ignore
      }

      // Если оба API не сработали, показываем ошибку
      throw new Error('Не удалось получить данные о погоде');
    } catch (error) {
      console.error('Ошибка при получении погоды:', error);
      setErrorMessage(t('additionalBlocks.weather.fetchError'));
      setStatus('error');
    }
  }, []);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      console.error('Геолокация не поддерживается');
      setErrorMessage(t('additionalBlocks.weather.geoNotSupported'));
      setStatus('error');
      return;
    }

    setStatus('loading');
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        fetchWeather(latitude, longitude);
      },
      (error) => {
        console.error('Ошибка геолокации:', error);
        if (error.code === error.PERMISSION_DENIED) {
          setErrorMessage(t('additionalBlocks.weather.permissionDenied'));
          setStatus('permission-denied');
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          setErrorMessage(t('additionalBlocks.weather.locationUnavailable'));
          setStatus('error');
        } else {
          setErrorMessage(t('additionalBlocks.weather.locationError'));
          setStatus('error');
        }
      },
      {
        enableHighAccuracy: false, // Упрощаем для более быстрого ответа
        timeout: 15000, // Увеличиваем таймаут до 15 секунд
        maximumAge: 300000, // кеш на 5 минут
      }
    );
  }, [fetchWeather]);

  // Обновление времени для правильного отображения иконок (солнце/луна)
  useEffect(() => {
    // Обновляем сразу при монтировании
    setCurrentTime(Date.now());
    
    // Затем обновляем каждые 30 секунд для более быстрой реакции
    const timeInterval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 30000); // Обновляем каждые 30 секунд

    return () => {
      clearInterval(timeInterval);
    };
  }, []);

  useEffect(() => {
    requestLocation();

    // Автоматическое обновление каждые 10 минут
    const interval = setInterval(() => {
      if (status !== 'permission-denied' && status !== 'loading') {
        requestLocation();
      }
    }, 600000); // 10 минут

    return () => {
      clearInterval(interval);
    };
  }, [requestLocation]);

  const getBackgroundColor = (): string => {
    // Используем цвет dream-secondary как в блоках заметок и задач
    return 'bg-dream-secondary';
  };

  // Вычисляем, день ли сейчас, на основе текущего времени
  const isDay = useMemo(() => {
    const date = new Date(currentTime);
    const hour = date.getHours();
    return hour >= 6 && hour < 20;
  }, [currentTime]);

  return (
    <div className={`flex flex-col rounded-[6px] p-4 py-7.5 pr-7 gap-7.5 h-full md:h-auto transition-all duration-500 ${getBackgroundColor()}`}>
      {status === 'loading' && (
        <div className="flex flex-col gap-2 justify-center md:justify-start h-full items-center">
          <div className="animate-spin w-8 h-8 border-4 border-[var(--border)] border-t-[var(--accent)] rounded-full"></div>
          <span className="text-base text-[rgba(255,255,255,0.72)]">{t('additionalBlocks.weather.loading')}</span>
        </div>
      )}

      {status === 'permission-denied' && (
        <div className="flex flex-col gap-4 justify-center md:justify-start h-full">
          <div className="flex items-center gap-3">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" fill="#e6c364"/>
            </svg>
            <div className="flex flex-col">
              <span className="text-[18px] text-[rgba(255,255,255,0.92)]">{t('additionalBlocks.weather.permissionNotGranted')}</span>
              <span className="text-base text-[rgba(255,255,255,0.72)]">{errorMessage}</span>
            </div>
          </div>
          <button
            onClick={requestLocation}
            className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-[4px] hover:bg-[#e2c97e] transition-colors"
          >{t('additionalBlocks.weather.tryAgain')}</button>
        </div>
      )}

      {status === 'error' && (
        <div className="flex flex-col gap-4 justify-center md:justify-start h-full">
          <div className="flex items-center gap-3">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" fill="#ffb4ab"/>
            </svg>
            <div className="flex flex-col">
              <span className="text-[18px] text-[rgba(255,255,255,0.92)]">{t('additionalBlocks.weather.error')}</span>
              <span className="text-base text-[rgba(255,255,255,0.72)]">{errorMessage}</span>
            </div>
          </div>
          <button
            onClick={requestLocation}
            className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-[4px] hover:bg-[#e2c97e] transition-colors"
          >{t('additionalBlocks.weather.tryAgain')}</button>
        </div>
      )}

      {status === 'success' && weather && (
        <div className="flex flex-col gap-2 justify-center md:justify-start h-full">
          <div className="flex justify-between items-center">
            <div className="text-8xl">
              {getWeatherIcon(parseInt(weather.icon), isDay)}
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[60px] leading-none font-normal text-[rgba(255,255,255,0.92)]">
                {weather.temperature}°
              </span>
              <span className="text-[18px] font-normal text-[rgba(255,255,255,0.92)]">
                {weather.description}
              </span>
              <span className="text-base text-[rgba(255,255,255,0.72)]">
                {weather.city}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-3 mt-4">
            <div className="flex justify-between text-[rgba(255,255,255,0.72)] px-2 bg-[var(--secondary)] border border-[var(--border)] rounded-[6px] py-2">
              <div className="flex items-center gap-2">
                <svg width="22" height="18" viewBox="0 0 22 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18.7 2.93359C16.8813 2.93359 15.4 4.41493 15.4 6.23359C15.4 6.63693 15.73 6.96693 16.1333 6.96693C16.5367 6.96693 16.8667 6.63693 16.8667 6.23359C16.8667 5.22159 17.688 4.40026 18.7 4.40026C19.712 4.40026 20.5333 5.22159 20.5333 6.23359C20.5333 7.24559 19.712 8.06693 18.7 8.06693H0.733333C0.33 8.06693 0 8.39693 0 8.80026C0 9.20359 0.33 9.53359 0.733333 9.53359H18.7C20.5187 9.53359 22 8.05226 22 6.23359C22 4.41493 20.5187 2.93359 18.7 2.93359Z" fill="currentColor"/>
                  <path d="M5.13372 6.6H11.3671C13.1857 6.6 14.6671 5.11867 14.6671 3.3C14.6671 1.48133 13.1857 0 11.3671 0C9.54839 0 8.06706 1.48133 8.06706 3.3C8.06706 3.70333 8.39706 4.03333 8.80039 4.03333C9.20372 4.03333 9.53372 3.70333 9.53372 3.3C9.53372 2.288 10.3551 1.46667 11.3671 1.46667C12.3791 1.46667 13.2004 2.288 13.2004 3.3C13.2004 4.312 12.3791 5.13333 11.3671 5.13333H5.13372C4.73039 5.13333 4.40039 5.46333 4.40039 5.86667C4.40039 6.27 4.73039 6.6 5.13372 6.6Z" fill="currentColor"/>
                  <path d="M15.0326 11H2.93255C2.52922 11 2.19922 11.33 2.19922 11.7333C2.19922 12.1367 2.52922 12.4667 2.93255 12.4667H15.0326C16.0446 12.4667 16.8659 13.288 16.8659 14.3C16.8659 15.312 16.0446 16.1333 15.0326 16.1333C14.0206 16.1333 13.1992 15.312 13.1992 14.3C13.1992 13.8967 12.8692 13.5667 12.4659 13.5667C12.0626 13.5667 11.7326 13.8967 11.7326 14.3C11.7326 16.1187 13.2139 17.6 15.0326 17.6C16.8512 17.6 18.3326 16.1187 18.3326 14.3C18.3326 12.4813 16.8512 11 15.0326 11Z" fill="currentColor"/>
                </svg>
                <span className="text-base">{t('additionalBlocks.weather.wind')}</span>
              </div>
              <span className="text-base text-[rgba(255,255,255,0.92)]">{weather.windSpeed} {t('crm.crm.weatherBlock.км_ч')}</span>
            </div>
            <div className="flex justify-between text-[rgba(255,255,255,0.72)] px-2 bg-[var(--secondary)] border border-[var(--border)] rounded-[6px] py-2">
              <div className="flex items-center gap-2">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <g clipPath="url(#clip0_weather_humidity)">
                    <path fillRule="evenodd" clipRule="evenodd" d="M10.4875 0.859375C10.3694 0.71125 10.19 0.625 10 0.625C9.81 0.625 9.63063 0.71125 9.5125 0.859375C9.5125 0.859375 6.40938 4.73375 4.5475 8.25688C3.70313 9.85375 3.125 11.3906 3.125 12.5C3.125 16.2944 6.20563 19.375 10 19.375C13.7944 19.375 16.875 16.2944 16.875 12.5C16.875 11.3906 16.2969 9.85375 15.4525 8.25688C13.5906 4.73375 10.4875 0.859375 10.4875 0.859375ZM10 2.26688C10.9288 3.47938 12.9812 6.25688 14.3475 8.84063C15.0781 10.2238 15.625 11.5394 15.625 12.5C15.625 15.6044 13.1044 18.125 10 18.125C6.89563 18.125 4.375 15.6044 4.375 12.5C4.375 11.5394 4.92187 10.2238 5.6525 8.84063C7.01875 6.25688 9.07125 3.47938 10 2.26688ZM12.5 12.5C12.5 13.88 11.38 15 10 15C9.655 15 9.375 15.28 9.375 15.625C9.375 15.97 9.655 16.25 10 16.25C12.0694 16.25 13.75 14.5694 13.75 12.5C13.75 12.155 13.47 11.875 13.125 11.875C12.78 11.875 12.5 12.155 12.5 12.5Z" fill="currentColor"/>
                  </g>
                  <defs>
                    <clipPath id="clip0_weather_humidity">
                      <rect width="20" height="20" fill="white"/>
                    </clipPath>
                  </defs>
                </svg>
                <span className="text-base">{t('additionalBlocks.weather.humidity')}</span>
              </div>
              <span className="text-base text-[rgba(255,255,255,0.92)]">{weather.humidity}%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WeatherBlock;
