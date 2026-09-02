import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from "@/i18n";

const ClearCachePage = () => {
    const { t } = useI18n();
  const navigate = useNavigate();

  useEffect(() => {
    // Очистка всех данных из localStorage
    try {
      localStorage.clear();
    } catch (error) {
      console.error('Ошибка при очистке localStorage:', error);
    }

    // Очистка всех данных из sessionStorage
    try {
      sessionStorage.clear();
    } catch (error) {
      console.error('Ошибка при очистке sessionStorage:', error);
    }

    // Очистка кэша IndexedDB (если используется)
    if ('indexedDB' in window) {
      indexedDB.databases().then(databases => {
        databases.forEach(db => {
          if (db.name) {
            indexedDB.deleteDatabase(db.name);
          }
        });
      }).catch(error => {
        console.error('Ошибка при очистке IndexedDB:', error);
      });
    }

    // Очистка кэша Service Workers (если есть)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        registrations.forEach(registration => {
          registration.unregister();
        });
      }).catch(error => {
        console.error('Ошибка при очистке Service Workers:', error);
      });
    }

    // Очистка кэша через Cache API (если используется)
    if ('caches' in window) {
      caches.keys().then(cacheNames => {
        cacheNames.forEach(cacheName => {
          caches.delete(cacheName);
        });
      }).catch(error => {
        console.error('Ошибка при очистке Cache API:', error);
      });
    }

    // Перенаправление на главную страницу через небольшую задержку
    setTimeout(() => {
      // Полная перезагрузка для очистки всего состояния приложения
      window.location.href = '/';
    }, 1000);
  }, [navigate]);

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-blue-50 to-white flex items-center justify-center">
      <div className="text-center">
        <div className="text-2xl font-normal text-gray-800 mb-4">
          {t('crm.clearCachePage.очистка_кэша')}</div>
        <div className="text-gray-600 mb-4">
          {t('crm.clearCachePage.все_данные_кэша_удал')}</div>
        <div className="text-sm text-gray-500">
          {t('crm.clearCachePage.перенаправление_на_г')}</div>
      </div>
    </div>
  );
};

export default ClearCachePage;

