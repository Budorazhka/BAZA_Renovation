import { useEffect, useRef } from 'react';

// Глобальный счетчик открытых модалок
let openModalsCount = 0;
let savedScrollPosition = 0;

/**
 * Хук для отключения скролла основной страницы когда модалка открыта
 * Поддерживает множественные модалки - скролл отключается при первой открытой модалке
 * и восстанавливается только когда все модалки закрыты
 * @param isOpen - состояние открытия модалки
 */
export const useDisableScroll = (isOpen: boolean) => {
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      // Модалка только что открылась
      wasOpenRef.current = true;
      openModalsCount++;
      
      if (openModalsCount === 1) {
        // Первая открытая модалка - отключаем скролл
        savedScrollPosition = window.scrollY;
        document.body.style.overflow = 'hidden';
        document.body.style.position = 'fixed';
        document.body.style.top = `-${savedScrollPosition}px`;
        document.body.style.width = '100%';
      }
    } else if (!isOpen && wasOpenRef.current) {
      // Модалка только что закрылась
      wasOpenRef.current = false;
      openModalsCount = Math.max(0, openModalsCount - 1);
      
      if (openModalsCount === 0) {
        // Все модалки закрыты - восстанавливаем скролл
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        window.scrollTo(0, savedScrollPosition);
      }
    }

    return () => {
      // Cleanup при размонтировании компонента
      if (wasOpenRef.current) {
        wasOpenRef.current = false;
        openModalsCount = Math.max(0, openModalsCount - 1);
        
        if (openModalsCount === 0) {
          document.body.style.overflow = '';
          document.body.style.position = '';
          document.body.style.top = '';
          document.body.style.width = '';
          window.scrollTo(0, savedScrollPosition);
        }
      }
    };
  }, [isOpen]);
};

