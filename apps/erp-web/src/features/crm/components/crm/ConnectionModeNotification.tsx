import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ConnectionMode } from '../../hooks/useSocketConnection';
import { useI18n } from "@/i18n";

interface ConnectionModeNotificationProps {
  mode: ConnectionMode;
  isVisible: boolean;
  onClose?: () => void;
}

const ConnectionModeNotification: React.FC<ConnectionModeNotificationProps> = ({
  mode,
  isVisible,
  onClose,
}) => {
    const { t } = useI18n();
  const [shouldRender, setShouldRender] = useState(isVisible);
  const [isExiting, setIsExiting] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (isVisible) {
      setShouldRender(true);
      setIsExiting(false);
    } else {
      // Запускаем анимацию выхода
      setIsExiting(true);
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 300); // Время анимации
      return () => clearTimeout(timer);
    }
  }, [isVisible]);

  /** Скрыть уведомление само через 5 с после появления */
  useEffect(() => {
    if (!isVisible) return;
    const id = window.setTimeout(() => {
      onCloseRef.current?.();
    }, 5000);
    return () => window.clearTimeout(id);
  }, [isVisible]);

  if (!shouldRender) return null;

  const message =
    mode === 'http'
      ? 'Режим работы переключен на HTTP. Данные могут обновляться не моментально.'
      : 'Режим работы: WebSocket. Данные обновляются в реальном времени.';

  const bgColor = mode === 'http' ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200';
  const textColor = mode === 'http' ? 'text-yellow-800' : 'text-green-800';
  const iconColor = mode === 'http' ? 'text-yellow-600' : 'text-green-600';

  return createPortal(
    <div
      className={`fixed top-4 right-4 z-[9999] transition-all duration-300 ease-out ${
        isExiting
          ? 'translate-x-full opacity-0 pointer-events-none'
          : 'translate-x-0 opacity-100'
      }`}
      style={{ maxWidth: '400px' }}
    >
      <div className={`${bgColor} border-2 rounded-xl shadow-lg p-4 flex items-start gap-3`}>
        <div className="flex-shrink-0 mt-0.5">
          {mode === 'http' ? (
            <svg
              className={`w-5 h-5 ${iconColor}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          ) : (
            <svg
              className={`w-5 h-5 ${iconColor}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium leading-5 ${textColor}`}>{message}</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className={`flex-shrink-0 ${mode === 'http' ? 'text-yellow-400 hover:text-yellow-600' : 'text-green-400 hover:text-green-600'} transition-colors`}
            aria-label={t('crm.crm.connectionModeNotification.закрыть')}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>
    </div>,
    document.body
  );
};

export default ConnectionModeNotification;

