import React, { useState, useEffect, useRef } from 'react';
import { useDisableScroll } from '../../hooks/useDisableScroll';
import { apiService, AppealType, AppealUrgency } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { PhoneInput } from '../common/PhoneInput';
import { useI18n } from '@/i18n';

declare global {
  interface Window {
    grecaptcha: {
      render: (container: HTMLElement, options: {
        sitekey: string;
        callback: (token: string) => void;
        [key: string]: any;
      }) => number;
      reset: (widgetId?: number) => void;
    };
  }
}

interface AskQuestionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AskQuestionModal: React.FC<AskQuestionModalProps> = ({ isOpen, onClose }) => {
  useDisableScroll(isOpen);
  const { user } = useAuth();
  const { t } = useI18n();
  const modalContainerRef = useRef<HTMLDivElement | null>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchStartElement = useRef<HTMLElement | null>(null);
  
  const [feedbackForm, setFeedbackForm] = useState({
    title: '',
    description: '',
    phone: '',
    telegram: '',
  });
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const feedbackFileInputRef = useRef<HTMLInputElement>(null);
  
  const [isReasonDropdownOpen, setIsReasonDropdownOpen] = useState(false);
  const [selectedReason, setSelectedReason] = useState<string>('Проблема с загрузкой данных');
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);
  const recaptchaWidgetId = useRef<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [appealNumber, setAppealNumber] = useState<string | null>(null);
  
  // Маппинг русских названий на типы обращений
  const reasonToAppealTypeMap: Record<string, AppealType> = {
    'Проблема с загрузкой данных': AppealType.TECHNICAL,
    'Ошибка при сохранении': AppealType.BUG_REPORT,
    'Проблема с отображением': AppealType.TECHNICAL,
    'Медленная работа системы': AppealType.TECHNICAL,
    'Предложение по улучшению': AppealType.FEATURE_REQUEST,
    'Другое': AppealType.OTHER,
  };
  
  const reasonOptions = [
    'Проблема с загрузкой данных',
    'Ошибка при сохранении',
    'Проблема с отображением',
    'Медленная работа системы',
    'Предложение по улучшению',
    'Другое',
  ];

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      // Загружаем и инициализируем Google reCAPTCHA
      const loadRecaptcha = () => {
        const recaptchaContainer = document.getElementById('recaptcha-container');
        if (recaptchaContainer && window.grecaptcha && !recaptchaWidgetId.current) {
          try {
            recaptchaWidgetId.current = window.grecaptcha.render(recaptchaContainer, {
              sitekey: '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI', // Test key, замените на свой реальный ключ
              callback: (token: string) => {
                setRecaptchaToken(token);
              },
              'expired-callback': () => {
                setRecaptchaToken(null);
              },
            });
          } catch (error) {
            console.error('Error rendering reCAPTCHA:', error);
          }
        }
      };

      if (window.grecaptcha) {
        loadRecaptcha();
      } else {
        // Если скрипт еще не загружен, ждем его загрузки
        const checkRecaptcha = setInterval(() => {
          if (window.grecaptcha) {
            clearInterval(checkRecaptcha);
            loadRecaptcha();
          }
        }, 100);

        setTimeout(() => clearInterval(checkRecaptcha), 10000); // Таймаут 10 секунд
      }
    } else {
      document.body.style.overflow = 'unset';
      if (recaptchaWidgetId.current !== null && window.grecaptcha) {
        try {
          window.grecaptcha.reset(recaptchaWidgetId.current);
        } catch (error) {
          console.error('Error resetting reCAPTCHA:', error);
        }
        recaptchaWidgetId.current = null;
      }
      setRecaptchaToken(null);
    }

    return () => {
      document.body.style.overflow = 'unset';
      if (recaptchaWidgetId.current !== null && window.grecaptcha) {
        try {
          window.grecaptcha.reset(recaptchaWidgetId.current);
        } catch (error) {
          console.error('Error resetting reCAPTCHA:', error);
        }
      }
    };
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isReasonDropdownOpen) {
        const target = event.target as HTMLElement;
        if (!target.closest('.reason-dropdown-container')) {
          setIsReasonDropdownOpen(false);
        }
      }
    };

    if (isReasonDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isReasonDropdownOpen]);

  const handleCloseModal = () => {
    onClose();
    setFeedbackForm({ title: '', description: '', phone: '', telegram: '' });
    setSelectedFiles([]);
    setIsReasonDropdownOpen(false);
    setSelectedReason('Проблема с загрузкой данных');
    setIsSuccessModalOpen(false);
    setRecaptchaToken(null);
    setAppealNumber(null);
    setIsSubmitting(false);
  };

  const handleSendMessage = async () => {
    // reCAPTCHA опциональна - проверяем только если она загружена и виджет создан
    if (recaptchaWidgetId.current !== null && !recaptchaToken) {
      alert(t('askQuestionModal.errors.captcha'));
      return;
    }

    if (!feedbackForm.description.trim()) {
      alert(t('askQuestionModal.errors.emptyMessage'));
      return;
    }

    if (!user?.id) {
      alert(t('askQuestionModal.errors.notAuthorized'));
      return;
    }

    const userEmail = localStorage.getItem('user_email');
    if (!userEmail) {
      alert(t('askQuestionModal.errors.noEmail'));
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Загружаем файлы через бэкенд (если есть)
      // Формат attachments согласно документации: { cdnUrl: string, filename?: string, size?: number }[]
      const attachments: Array<{
        cdnUrl: string;  // Обязательно - URL файла из POST /appeals/files/upload
        filename?: string;  // Опционально - имя файла
        size?: number;  // Опционально - размер файла в байтах
      }> = [];
      if (selectedFiles.length > 0) {
        for (const file of selectedFiles) {
          try {
            // Используем загрузку через бэкенд
            const uploadResponse = await apiService.uploadAppealFile(file);

            if (!uploadResponse.success || !uploadResponse.data) {
              console.warn(`${t('askQuestionModal.errors.uploadFailed')} ${file.name}:`, uploadResponse.message);
              continue;
            }

            const { url, filename, size } = uploadResponse.data;

            // Добавляем информацию о файле в attachments согласно формату API
            // Только cdnUrl (обязательно), filename и size (опционально)
            attachments.push({
              cdnUrl: url,  // URL файла из ответа uploadAppealFile
              filename: filename || file.name,  // Опционально
              size: size || file.size,  // Опционально
            });
          } catch (error: any) {
            console.warn(`${t('askQuestionModal.errors.uploadFailed')} ${file.name}:`, error.message);
          }
        }
      }

      // 2. Определяем тип обращения
      const appealType = reasonToAppealTypeMap[selectedReason] || AppealType.QUESTION;

      // 3. Формируем текст обращения
      const appealText = feedbackForm.title 
        ? `${feedbackForm.title}\n\n${feedbackForm.description}`
        : feedbackForm.description;

      // 4. Формируем контактную информацию
      const contactInfo: { phone?: string; telegram?: string } = {};
      if (feedbackForm.phone.trim()) {
        contactInfo.phone = feedbackForm.phone.trim();
      }
      if (feedbackForm.telegram.trim()) {
        contactInfo.telegram = feedbackForm.telegram.trim();
      }

      // 5. Создаем обращение
      // Формируем объект данных согласно документации API
      const appealData = {
        type: appealType,
        text: appealText,
        urgency: AppealUrgency.MEDIUM,
        userId: user.id,
        userEmail: userEmail,
      } as {
        type: AppealType;
        text: string;
        attachments?: Array<{
          cdnUrl: string;  // Обязательно - URL файла
          filename?: string;  // Опционально
          size?: number;  // Опционально
        }>;
        contactInfo?: { phone?: string; telegram?: string };
        urgency: AppealUrgency;
        userId: string;
        userEmail: string;
      };
      
      // Добавляем attachments только если есть файлы (не передаем undefined)
      if (attachments.length > 0) {
        appealData.attachments = attachments;
      }
      
      // Добавляем contactInfo только если есть данные (не передаем undefined)
      if (Object.keys(contactInfo).length > 0) {
        appealData.contactInfo = contactInfo;
      }
      
      const response = await apiService.createAppeal(appealData);

      if (response.success && response.data) {
        setAppealNumber(response.data.uniqueNumber);
        setIsSuccessModalOpen(true);
      } else {
        // Обрабатываем ошибку с детальными сообщениями валидации
        let errorMessage = response.message || t('askQuestionModal.errors.createFailed');
        
        // Если есть детали ошибок валидации, добавляем их
        if ((response as any).errors && Array.isArray((response as any).errors)) {
          const validationDetails = (response as any).errors
            .map((err: any) => {
              const field = err.property || t('askQuestionModal.errors.field');
              const constraints = Object.values(err.constraints || {}).join(', ');
              return `• ${field}: ${constraints}`;
            })
            .join('\n');
          
          errorMessage = `${errorMessage}\n\nДетали:\n${validationDetails}`;
        }
        
        alert(errorMessage);
      }
    } catch (error: any) {
      console.error('Ошибка создания обращения:', error);
      
      // Обрабатываем ошибку из catch блока
      const errorData = error?.response?.data || error;
      let errorMessage = t('askQuestionModal.errors.createFailed');
      
      if (errorData) {
        // Проверяем формат ответа API
        if (errorData.success === false) {
          errorMessage = errorData.message || errorMessage;
          
          // Добавляем детали валидации если есть
          if (errorData.errors && Array.isArray(errorData.errors)) {
            const validationDetails = errorData.errors
              .map((err: any) => {
                const field = err.property || t('askQuestionModal.errors.field');
                const constraints = Object.values(err.constraints || {}).join(', ');
                return `• ${field}: ${constraints}`;
              })
              .join('\n');
            
            errorMessage = `${errorMessage}\n\nДетали:\n${validationDetails}`;
          }
        } else if (errorData.message) {
          errorMessage = errorData.message;
        }
      }
      
      console.error('Детали ошибки:', {
        status: error?.response?.status,
        statusText: error?.response?.statusText,
        data: error?.response?.data,
        message: errorMessage,
        fullError: error
      });
      
      alert(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSuccessClose = () => {
    setIsSuccessModalOpen(false);
    handleCloseModal();
  };

  const handleFeedbackFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const filesArray = Array.from(files);
    
    // Проверяем общее количество файлов (включая уже выбранные)
    const totalFiles = selectedFiles.length + filesArray.length;
    if (totalFiles > 10) {
      alert(t('askQuestionModal.errors.maxFiles'));
      return;
    }

    setSelectedFiles(prev => [...prev, ...filesArray]);
    
    // Очищаем input для возможности повторного выбора тех же файлов
    if (event.target) {
      event.target.value = '';
    }
  };

  const handleRemoveFeedbackFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement;
    touchStartElement.current = target;

    const scrollableContainer = target.closest('.overflow-x-auto, .overflow-y-auto');
    if (scrollableContainer) {
      const container = scrollableContainer as HTMLElement;
      const scrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight;
      const clientHeight = container.clientHeight;
      const hasVerticalScroll = scrollHeight > clientHeight;
      const isAtTopEdge = scrollTop <= 1;

      if (hasVerticalScroll && !isAtTopEdge) {
        touchStartX.current = null;
        touchStartY.current = null;
        return;
      }
    }

    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;

    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const diffX = touchEndX - touchStartX.current;
    const diffY = touchEndY - touchStartY.current;

    const minSwipeDistance = 50;

    if (Math.abs(diffY) > Math.abs(diffX) && diffY > minSwipeDistance) {
      let canClose = true;

      if (touchStartElement.current && modalContainerRef.current) {
        let currentElement: HTMLElement | null = touchStartElement.current;

        while (currentElement && currentElement !== modalContainerRef.current) {
          const style = window.getComputedStyle(currentElement);
          const isScrollable = style.overflowY === 'auto' || style.overflowY === 'scroll' ||
                              style.overflow === 'auto' || style.overflow === 'scroll' ||
                              currentElement.classList.contains('overflow-y-auto') ||
                              currentElement.classList.contains('overflow-x-auto');

          if (isScrollable) {
            const scrollTop = currentElement.scrollTop;
            const scrollHeight = currentElement.scrollHeight;
            const clientHeight = currentElement.clientHeight;
            const hasVerticalScroll = scrollHeight > clientHeight;
            const isAtTopEdge = scrollTop <= 1;

            if (hasVerticalScroll && !isAtTopEdge) {
              canClose = false;
              break;
            }
          }

          currentElement = currentElement.parentElement;
        }

        if (canClose && modalContainerRef.current) {
          const modalContent = modalContainerRef.current;
          const scrollTop = modalContent.scrollTop;
          const scrollHeight = modalContent.scrollHeight;
          const clientHeight = modalContent.clientHeight;
          const hasVerticalScroll = scrollHeight > clientHeight;
          const isAtTopEdge = scrollTop <= 1;

          if (hasVerticalScroll && !isAtTopEdge) {
            canClose = false;
          }
        }
      } else if (modalContainerRef.current) {
        const modalContent = modalContainerRef.current;
        const scrollTop = modalContent.scrollTop;
        const scrollHeight = modalContent.scrollHeight;
        const clientHeight = modalContent.clientHeight;
        const hasVerticalScroll = scrollHeight > clientHeight;
        const isAtTopEdge = scrollTop <= 1;

        if (hasVerticalScroll && !isAtTopEdge) {
          canClose = false;
        }
      }

      if (canClose) {
        handleCloseModal();
      }
    }

    touchStartX.current = null;
    touchStartY.current = null;
    touchStartElement.current = null;
  };

  if (!isOpen) return null;

  return (
    <div 
      className="modal-fade-in fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center z-50 pt-4 md:pt-4 pb-0 md:pb-4 px-0 md:px-4 transition-all duration-300 ease-out animate-in fade-in" 
      onClick={handleCloseModal}
    >
      <div 
        className="relative w-full md:w-[70.89%] h-[calc(100vh-1rem)] md:h-[93.89vh] flex flex-col animate-in zoom-in-95 slide-in-from-bottom-4 duration-300"
      >
        <button
          onClick={handleCloseModal}
          className="absolute -top-10 md:-top-10 -right-4 md:-right-10 z-10 flex items-center justify-center hidden md:block"
        >
          <svg width="45" height="45" viewBox="0 0 45 45" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M33.75 11.25L11.25 33.75" stroke="white" strokeWidth="3" strokeLinecap="round"/>
            <path d="M11.25 11.25L33.75 33.75" stroke="white" strokeWidth="3" strokeLinecap="round"/>
          </svg>
        </button>
        <div 
          ref={modalContainerRef}
          className="bg-white flex min-h-0 gap-2 rounded-t-[25px] md:rounded-[25px] p-10 shadow-2xl w-full h-full overflow-hidden"
          onClick={(e) => e.stopPropagation()}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className="flex flex-col w-full gap-8 overflow-y-auto">
            <div className="flex flex-col items-start gap-5">
              <div className="flex items-center gap-2.5 pl-2.5">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M19.2657 12.3217V10.0781C19.2657 6.80522 17.0902 4.0312 14.1094 3.12516V2.10938C14.1094 0.946266 13.1632 0 12.0001 0C10.8369 0 9.89068 0.946266 9.89068 2.10938V3.12516C6.9099 4.0312 4.73443 6.80517 4.73443 10.0781V12.3217C4.73443 15.1966 3.63859 17.9227 1.64879 19.9977C1.45379 20.2011 1.39899 20.5011 1.50952 20.7602C1.62005 21.0194 1.87459 21.1875 2.1563 21.1875H8.55516C8.88179 22.7903 10.3023 24 12.0001 24C13.6979 24 15.1183 22.7903 15.4449 21.1875H21.8438C22.1255 21.1875 22.38 21.0194 22.4905 20.7602C22.6011 20.5011 22.5463 20.2011 22.3513 19.9977C20.3615 17.9227 19.2657 15.1965 19.2657 12.3217ZM11.2969 2.10938C11.2969 1.72167 11.6124 1.40625 12.0001 1.40625C12.3878 1.40625 12.7032 1.72167 12.7032 2.10938V2.84663C12.4718 2.82431 12.2372 2.8125 12.0001 2.8125C11.7629 2.8125 11.5284 2.82431 11.2969 2.84663V2.10938ZM12.0001 22.5938C11.0834 22.5938 10.3019 22.0059 10.0116 21.1875H13.9885C13.6982 22.0059 12.9167 22.5938 12.0001 22.5938ZM3.67177 19.7812C5.27307 17.6348 6.14068 15.0371 6.14068 12.3217V10.0781C6.14068 6.84727 8.7692 4.21875 12.0001 4.21875C15.2309 4.21875 17.8594 6.84727 17.8594 10.0781V12.3217C17.8594 15.0371 18.727 17.6348 20.3284 19.7812H3.67177Z" fill="#151515"/>
                  <path d="M21.141 10.0778C21.141 10.4661 21.4558 10.7809 21.8441 10.7809C22.2324 10.7809 22.5472 10.4661 22.5472 10.0778C22.5472 7.26061 21.4502 4.61204 19.4581 2.61999C19.1836 2.34544 18.7384 2.3454 18.4638 2.61999C18.1892 2.89458 18.1892 3.33976 18.4638 3.61435C20.1902 5.3408 21.141 7.63622 21.141 10.0778Z" fill="#151515"/>
                  <path d="M2.15625 10.7809C2.54456 10.7809 2.85938 10.4661 2.85938 10.0778C2.85938 7.63624 3.81019 5.34082 5.53659 3.61437C5.81119 3.33977 5.81119 2.8946 5.53659 2.62001C5.26205 2.34541 4.81683 2.34541 4.54223 2.62001C2.55019 4.61205 1.45312 7.26059 1.45312 10.0778C1.45312 10.4661 1.76794 10.7809 2.15625 10.7809Z" fill="#151515"/>
                </svg>
                <span className="text-black font-normal text-[28px] leading-[1.5] tracking-[-0.01em]">{t('askQuestionModal.title')}</span>
              </div>
              <span className="text-dream-primary font-medium text-base leading-[30px] tracking-normal">{t('askQuestionModal.description')}</span>
            </div>
            <div className="flex flex-col items-start gap-3.25 relative w-full reason-dropdown-container">
              <span className="font-normal text-[18px] leading-[1.5] tracking-[-0.01em]">{t('askQuestionModal.category')}</span>
              <button
                type="button"
                onClick={() => setIsReasonDropdownOpen(!isReasonDropdownOpen)}
                className="flex items-center justify-between w-full pl-5 pr-3 py-3 border-2 border-dream-primary rounded-full cursor-pointer hover:bg-dream-secondary/50 transition-all duration-200 ease-in-out hover:scale-105 active:scale-95"
              >
                <span className="text-dream-primary">{selectedReason}</span>
                <svg 
                  width="24" 
                  height="24" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  xmlns="http://www.w3.org/2000/svg"
                  className={`transition-transform duration-300 ease-in-out ${isReasonDropdownOpen ? 'rotate-180' : ''}`}
                >
                  <g clipPath="url(#clip0_4261_8275)">
                  <path d="M11.9993 13.1727L16.9493 8.22266L18.3633 9.63666L11.9993 16.0007L5.63528 9.63666L7.04928 8.22266L11.9993 13.1727Z" fill="#169600"/>
                  </g>
                  <defs>
                  <clipPath id="clip0_4261_8275">
                  <rect width="24" height="24" fill="white" transform="translate(24 1.04908e-06) rotate(90)"/>
                  </clipPath>
                  </defs>
                </svg>
              </button>
              
              {isReasonDropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl border-2 border-dream-primary shadow-lg z-10 max-h-60 overflow-y-auto">
                  {reasonOptions.map((reason, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => {
                        setSelectedReason(reason);
                        setIsReasonDropdownOpen(false);
                      }}
                      className={`w-full text-left px-5 py-3 hover:bg-dream-secondary transition-all duration-200 ease-in-out hover:scale-[1.02] active:scale-95 ${
                        selectedReason === reason ? 'bg-dream-secondary' : ''
                      } ${index !== reasonOptions.length - 1 ? 'border-b border-gray-200' : ''}`}
                    >
                      <span className={`${selectedReason === reason ? 'text-dream-primary font-normal' : 'text-gray-700'}`}>
                        {reason}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-5 w-full">
              <div className="relative w-full flex flex-col gap-3.25">
                <span className="font-normal text-[18px] leading-[1.5] tracking-[-0.01em]">{t('askQuestionModal.name')}</span>
                <input
                  type="text"
                  placeholder={t('askQuestionModal.namePlaceholder')}
                  maxLength={48}
                  value={feedbackForm.title}
                  onChange={(e) => setFeedbackForm((prev) => ({ ...prev, title: e.target.value.slice(0, 48) }))}
                  className="w-full flex-1 border-2 border-dream-primary/50 bg-dream-secondary rounded-full pl-5 pr-14 py-3 focus:outline-none"
                />
                <span className="absolute right-4 top-3/4 -translate-y-1/2 text-xs text-gray-500">{feedbackForm.title.length}/48</span>
              </div>
              <div className="relative w-full mt-3">
                <textarea
                  placeholder={t('askQuestionModal.messagePlaceholder')}
                  maxLength={200}
                  value={feedbackForm.description}
                  onChange={(e) => setFeedbackForm((prev) => ({ ...prev, description: e.target.value.slice(0, 200) }))}
                  className="w-full flex-1 h-34 border-2 border-dream-primary/50 bg-dream-secondary rounded-lg pl-5 pr-16 py-2 focus:outline-none resize-none break-words overflow-y-auto"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-500">{feedbackForm.description.length}/200</span>
              </div>
              <div className="flex flex-col gap-5 w-full">
                <div className="relative w-full flex flex-col gap-3.25">
                  <span className="font-normal text-[18px] leading-[1.5] tracking-[-0.01em]">{t('askQuestionModal.phone')}</span>
                  <PhoneInput
                    value={feedbackForm.phone}
                    onChange={(phone) => setFeedbackForm((prev) => ({ ...prev, phone }))}
                    placeholder={t('askQuestionModal.phonePlaceholder')}
                    className="w-full flex-1 border-2 border-dream-primary/50 bg-dream-secondary rounded-full pl-5 pr-5 py-3 focus:outline-none"
                  />
                </div>
                <div className="relative w-full flex flex-col gap-3.25">
                  <span className="font-normal text-[18px] leading-[1.5] tracking-[-0.01em]">{t('askQuestionModal.telegram')}</span>
                  <input
                    type="text"
                    placeholder="@username"
                    value={feedbackForm.telegram}
                    onChange={(e) => setFeedbackForm((prev) => ({ ...prev, telegram: e.target.value }))}
                    className="w-full flex-1 border-2 border-dream-primary/50 bg-dream-secondary rounded-full pl-5 pr-5 py-3 focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex flex-col items-start gap-4">
                <span className="font-normal text-[18px] leading-[1.5] tracking-[-0.01em]">{t('askQuestionModal.attachOptional')}</span>
                <input
                  ref={feedbackFileInputRef}
                  type="file"
                  multiple
                  onChange={handleFeedbackFileSelect}
                  className="hidden"
                />
                
                <button 
                  type="button"
                  onClick={() => feedbackFileInputRef.current?.click()}
                  className="flex items-center py-2 px-3 rounded-full border border-dashed border-gray-300 cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="mr-2">
                    <path d="M18 3H14C12.6744 3.00156 11.4035 3.52885 10.4662 4.46619C9.52885 5.40353 9.00156 6.6744 9 8V28C9 28.2652 9.10536 28.5196 9.29289 28.7071C9.48043 28.8946 9.73478 29 10 29C10.2652 29 10.5196 28.8946 10.7071 28.7071C10.8946 28.5196 11 28.2652 11 28V8C11.0009 7.20462 11.3172 6.44206 11.8796 5.87964C12.4421 5.31722 13.2046 5.00087 14 5H18C18.7954 5.00087 19.5579 5.31722 20.1204 5.87964C20.6828 6.44206 20.9991 7.20462 21 8V24C21 24.7956 20.6839 25.5587 20.1213 26.1213C19.5587 26.6839 18.7956 27 18 27C17.2044 27 16.4413 26.6839 15.8787 26.1213C15.3161 25.5587 15 24.7956 15 24V11C15 10.7348 15.1054 10.4804 15.2929 10.2929C15.4804 10.1054 15.7348 10 16 10C16.2652 10 16.5196 10.1054 16.7071 10.2929C16.8946 10.4804 17 10.7348 17 11V23C17 23.2652 17.1054 23.5196 17.2929 23.7071C17.4804 23.8946 17.7348 24 18 24C18.2652 24 18.5196 23.8946 18.7071 23.7071C18.8946 23.5196 19 23.2652 19 23V11C19 10.2044 18.6839 9.44129 18.1213 8.87868C17.5587 8.31607 16.7956 8 16 8C15.2044 8 14.4413 8.31607 13.8787 8.87868C13.3161 9.44129 13 10.2044 13 11V24C13 25.3261 13.5268 26.5979 14.4645 27.5355C15.4021 28.4732 16.6739 29 18 29C19.3261 29 20.5979 28.4732 21.5355 27.5355C22.4732 26.5979 23 25.3261 23 24V8C22.9984 6.6744 22.4712 5.40353 21.5338 4.46619C20.5965 3.52885 19.3256 3.00156 18 3Z" fill="#555454"/>
                  </svg>
                  <span>{t('askQuestionModal.attachMax')}</span>
                </button>
                
                {selectedFiles.length > 0 && (
                  <div className="w-full flex flex-col gap-2">
                    <p className="text-xs text-gray-500">{t('askQuestionModal.selectedFiles').replace('{{count}}', selectedFiles.length.toString())}</p>
                    {selectedFiles.map((file, index) => (
                      <div key={index} className="flex items-center justify-between bg-gray-50 rounded-lg p-3 border border-gray-200">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M11 1H4a1 1 0 00-1 1v16a1 1 0 001 1h12a1 1 0 001-1V6l-6-5z" fill="#4B5563"/>
                            <path d="M11 1v5h5" fill="#9CA3AF"/>
                          </svg>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-700 truncate">{file.name}</p>
                            <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveFeedbackFile(index)}
                          className="ml-2 p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                          title={t('askQuestionModal.delete')}
                        >
                          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M14 4L4 14M4 4l10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className='flex'>
              <div id="recaptcha-container"></div>
            </div>
            <div className='flex justify-center'>
                <button 
                  onClick={handleSendMessage}
                  disabled={isSubmitting}
                  className='bg-dream-primary text-white px-7 py-3 rounded-full disabled:opacity-50 disabled:cursor-not-allowed'
                >
                  <span className="font-normal text-xl leading-none tracking-normal text-center">
                    {isSubmitting ? t('askQuestionModal.sending') : t('askQuestionModal.sendBtn')}
                  </span>
                </button>
            </div>
          </div>
        </div>
      </div>

      {/* Success Modal */}
      {isSuccessModalOpen && (
        <div 
          className="success-modal-backdrop fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60]" 
          onClick={handleSuccessClose}
        >
          <div 
            className="success-modal-content bg-white rounded-[25px] p-8 pb-10 shadow-2xl max-w-xl w-[90%]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center">
              <svg width="60" height="60" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M56.9454 18.3403L26.3672 48.9185C24.2946 50.9913 21.1963 50.9913 19.1237 48.9077L3.05457 33.3622C0.981811 31.3004 0.981811 28.1804 3.05457 26.1185C5.12719 24.0458 8.23639 24.0458 10.309 26.1185L22.7454 38.0313L49.691 11.0858C51.7636 9.01308 54.8728 9.01308 56.9454 11.0858C59.0182 13.1585 59.0182 16.2676 56.9454 18.3403Z" fill="#169600"/>
              </svg>
            </div>
            <div className="flex flex-col items-center gap-6 mt-5">
              <div className="text-center">
                <span className="text-xl font-normal text-dream-primary leading-none">{t('askQuestionModal.successTitle')}</span>
              </div>
              {appealNumber && (
                <div className="text-center">
                  <span className="text-sm font-normal leading-5 text-dream-primary">{t('askQuestionModal.appealNumber').replace('{{number}}', appealNumber as string)}</span>
                </div>
              )}
              <div className="text-center">
                <span className="text-sm font-normal leading-5 text-gray-500">{t('askQuestionModal.successMessage')}</span>
              </div>
              <button
                onClick={handleSuccessClose}
                className="bg-dream-primary text-white px-7.5 py-3 rounded-full cursor-pointer mt-6.5"
              >
                <span className="text-base font-normal leading-none text-center">{t('askQuestionModal.excellent')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AskQuestionModal;

