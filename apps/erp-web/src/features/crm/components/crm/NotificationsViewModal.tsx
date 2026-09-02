import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useI18n } from '@/i18n';
import { createPortal } from 'react-dom';
import { apiService, NotificationType, TaskStatus, TaskPriority } from '../../services/api';
import type { Notification, NotificationAttachment, Task } from '../../services/api';
import { useDisableScroll } from '../../hooks/useDisableScroll';
import TasksGridModal from './modals/TasksGridModal';
import { useToast } from '../common/Toast';
import { useAuth } from '../../hooks/useAuth';

interface OptimizationSuggestion {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'suggestion';
  createdAt: Date;
  taskIds?: string[];
}

interface NotificationsViewModalProps {
  activeTab: 'notifications' | 'reminders' | 'news';
  isOpen: boolean;
  onClose: () => void;
  onTabChange?: (tab: 'notifications' | 'reminders' | 'news') => void;
  onOpenTaskView?: (taskId: string) => void;
}

const NotificationsViewModal: React.FC<NotificationsViewModalProps> = ({
  activeTab,
  isOpen,
  onClose,
  onTabChange,
  onOpenTaskView,
}) => {
  const { t } = useI18n();
  const { showToast, ToastContainer } = useToast();
  const { user } = useAuth();
  useDisableScroll(isOpen);
  const [selectedView, setSelectedView] = useState<'notifications' | 'reminders' | 'news'>(activeTab);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Notification | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [optimizationSuggestions, setOptimizationSuggestions] = useState<OptimizationSuggestion[]>([]);
  // Карусель изображений
  const [imageIndex, setImageIndex] = useState(0);
  // Состояния для модального окна с сеткой задач
  const [isTasksGridModalOpen, setIsTasksGridModalOpen] = useState(false);
  const [tasksForModal, setTasksForModal] = useState<Task[]>([]);
  const [tasksGridModalTitle, setTasksGridModalTitle] = useState(t('notificationsViewModal.tasks'));
  const [expandedNews, setExpandedNews] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelectedView(activeTab);
  }, [activeTab]);

  // обновлять индекс при смене выбранного уведомления
  useEffect(() => {
    setImageIndex(0);
  }, [selectedItem?._id]);

  // Хелперы для вложений и декодирования имён
  const getImageAttachments = (notif: Notification | null): NotificationAttachment[] => {
    if (!notif?.attachments) return [];
    return notif.attachments.filter((a) => (a?.mimeType || '').startsWith('image/') && a.url);
  };
  const getVideoAttachments = (notif: Notification | null): NotificationAttachment[] => {
    if (!notif?.attachments) return [];
    return notif.attachments.filter((a) => (a?.mimeType || '').startsWith('video/') && a.url);
  };
  const getOtherAttachments = (notif: Notification | null): NotificationAttachment[] => {
    if (!notif?.attachments) return [];
    return notif.attachments.filter((a) => {
      const m = a?.mimeType || '';
      return !m.startsWith('image/') && !m.startsWith('video/') && a.url;
    });
  };
  const decodeFilename = (name?: string): string => {
    if (!name) return '';
    try {
      return decodeURIComponent(escape(name)) || name;
    } catch {
      return name;
    }
  };

  // Форматирование времени для отображения
  const formatTime = (date: Date | string): string => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    const now = new Date();
    const diffMs = now.getTime() - dateObj.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t('notificationsViewModal.justNow');
    if (diffMins < 60) return t('notificationsViewModal.minsAgo').replace('{{mins}}', diffMins.toString());
    if (diffHours < 24) return t('notificationsViewModal.hoursAgo').replace('{{hours}}', diffHours.toString());
    if (diffDays === 1) return t('notificationsViewModal.yesterday');
    if (diffDays < 7) return t('notificationsViewModal.daysAgo').replace('{{days}}', diffDays.toString());
    
    return dateObj.toLocaleDateString('ru-RU', { 
      day: 'numeric', 
      month: 'short',
      ...(dateObj.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {})
    });
  };

  // Форматирование времени до напоминания (через сколько случится)
  const formatTimeUntilReminder = (reminderDate: Date): string => {
    const now = new Date();
    const diffMs = reminderDate.getTime() - now.getTime();
    
    if (diffMs < 0) return t('notificationsViewModal.alreadyPassed');
    
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t('notificationsViewModal.now');
    if (diffMins < 60) {
      const lastDigit = diffMins % 10;
      const lastTwoDigits = diffMins % 100;
      if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
        return t('notificationsViewModal.inMins5').replace('{{mins}}', diffMins.toString());
      }
      if (lastDigit === 1) {
        return t('notificationsViewModal.inMins1').replace('{{mins}}', diffMins.toString());
      }
      if (lastDigit >= 2 && lastDigit <= 4) {
        return t('notificationsViewModal.inMins24').replace('{{mins}}', diffMins.toString());
      }
      return t('notificationsViewModal.inMins5').replace('{{mins}}', diffMins.toString());
    }
    if (diffHours < 24) {
      const lastDigit = diffHours % 10;
      const lastTwoDigits = diffHours % 100;
      if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
        return t('notificationsViewModal.inHours5').replace('{{hours}}', diffHours.toString());
      }
      if (lastDigit === 1) {
        return t('notificationsViewModal.inHours1').replace('{{hours}}', diffHours.toString());
      }
      if (lastDigit >= 2 && lastDigit <= 4) {
        return t('notificationsViewModal.inHours24').replace('{{hours}}', diffHours.toString());
      }
      return t('notificationsViewModal.inHours5').replace('{{hours}}', diffHours.toString());
    }
    if (diffDays < 7) {
      const lastDigit = diffDays % 10;
      const lastTwoDigits = diffDays % 100;
      if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
        return t('notificationsViewModal.inDays5').replace('{{days}}', diffDays.toString());
      }
      if (lastDigit === 1) {
        return t('notificationsViewModal.inDays1').replace('{{days}}', diffDays.toString());
      }
      if (lastDigit >= 2 && lastDigit <= 4) {
        return t('notificationsViewModal.inDays24').replace('{{days}}', diffDays.toString());
      }
      return t('notificationsViewModal.inDays5').replace('{{days}}', diffDays.toString());
    }
    const weeks = Math.floor(diffDays / 7);
    const lastDigit = weeks % 10;
    const lastTwoDigits = weeks % 100;
    if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
      return t('notificationsViewModal.inWeeks5').replace('{{weeks}}', weeks.toString());
    }
    if (lastDigit === 1) {
      return t('notificationsViewModal.inWeeks1').replace('{{weeks}}', weeks.toString());
    }
    if (lastDigit >= 2 && lastDigit <= 4) {
      return t('notificationsViewModal.inWeeks24').replace('{{weeks}}', weeks.toString());
    }
    return t('notificationsViewModal.inWeeks5').replace('{{weeks}}', weeks.toString());
  };

  // Функция анализа планов на сегодня (рекомендации)
  const analyzeTodayPlansData = useCallback(async (): Promise<OptimizationSuggestion[]> => {
    if (!user?.id) return [];

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Загружаем задачи на сегодня
      const tasksResponse = await apiService.getTasks({
        page: 1,
        limit: 100,
        assignedTo: user.id,
      });

      const suggestions: OptimizationSuggestion[] = [];
      const now = new Date();
      
      if (tasksResponse.success && tasksResponse.data) {
        const tasks = tasksResponse.data.items || [];
        const todayTasks = tasks.filter(task => {
          if (!task.startDate && !task.endDate) return false;
          const taskDate = task.startDate ? new Date(task.startDate) : new Date(task.endDate!);
          return taskDate >= today && taskDate < tomorrow;
        });

        const activeTasks = todayTasks.filter(t => t.status !== TaskStatus.COMPLETED && t.status !== TaskStatus.CANCELLED);
        const urgentAndImportantTasks = activeTasks.filter(t => t.priority === TaskPriority.URGENT_IMPORTANT);

        // Только одно предложение "Планы на сегодня" с информацией о задачах
        if (activeTasks.length > 0) {
          // Форматируем дату в формат DD.MM.YYYY
          const dateStr = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
          suggestions.push({
            id: 'today-plans',
            title: t('notificationsViewModal.plansFor').replace('{{date}}', dateStr),
            message: `${t('notificationsViewModal.tasksCount').replace('{{count}}', activeTasks.length.toString())}\n${t('notificationsViewModal.urgentAndImportantTasks').replace('{{count}}', urgentAndImportantTasks.length.toString())}`,
            type: 'info',
            createdAt: now,
            taskIds: activeTasks.map(t => t._id),
          });
        }
      }

      return suggestions;
    } catch (error) {
      console.error('Failed to analyze today plans:', error);
      return [];
    }
  }, [user?.id]);

  const reload = async (view: 'notifications' | 'reminders' | 'news' = selectedView) => {
    setLoading(true);
    try {
      const typeFilter = view === 'reminders' ? NotificationType.REMINDER : view === 'news' ? NotificationType.NEWS : undefined;
      const res = await apiService.getNotifications({ page: 1, limit: 50, ...(typeFilter ? { type: typeFilter } : {}) });
      if (res.success && res.data) {
        let list = res.data.items || [];
        if (view === 'notifications') {
          list = list.filter(n => n.type !== NotificationType.REMINDER && n.type !== NotificationType.NEWS);
        }
        // Для новостей исключаем элементы с упоминанием "Планы на" (любую дату)
        if (view === 'news') {
          list = list.filter(n => {
            const title = (n.title || '').toLowerCase();
            const message = (n.message || '').toLowerCase();
            // Исключаем любые уведомления, начинающиеся с t('notificationsViewModal.plansFor')
            return !title.startsWith(t('notificationsViewModal.plansFor')) && !message.includes(t('notificationsViewModal.plansFor'));
          });
        }

        // Загружаем задачи для напоминаний, чтобы показать их названия
        const reminderNotifications = list.filter(n => n.type === NotificationType.REMINDER && n.taskId);
        if (reminderNotifications.length > 0) {
          const taskIds: string[] = [];
          reminderNotifications.forEach(n => {
            const taskId = normalizeTaskId(n.taskId);
            if (taskId) taskIds.push(taskId);
          });

          if (taskIds.length > 0) {
            try {
              const tasksResponse = await apiService.getTasks({ page: 1, limit: 100 });
              if (tasksResponse.success && tasksResponse.data) {
                const tasksMap = new Map<string, string>();
                tasksResponse.data.items.forEach(task => {
                  tasksMap.set(task._id, task.title);
                });

                // Обновляем title для напоминаний с задачами
                list = list.map(n => {
                  if (n.type === NotificationType.REMINDER && n.taskId) {
                    const taskId = normalizeTaskId(n.taskId);
                    if (taskId) {
                      const taskTitle = tasksMap.get(taskId);
                      if (taskTitle) {
                        const truncatedTitle = taskTitle.length > 50 ? taskTitle.substring(0, 50) + '...' : taskTitle;
                        return {
                          ...n,
                          title: t('notificationsViewModal.reminderAbout').replace('{{title}}', truncatedTitle),
                        };
                      }
                    }
                  }
                  return n;
                });
              }
            } catch (error) {
              console.error('Failed to load tasks for reminder notifications:', error);
            }
          }
        }

        // Сортируем по дате создания (новые первыми)
        list.sort((a, b) => {
          const dateA = new Date(a.createdAt || 0).getTime();
          const dateB = new Date(b.createdAt || 0).getTime();
          return dateB - dateA; // Убывание: новые первыми
        });
        setItems(list);
      } else {
        setItems([]);
      }
      
      // Загружаем рекомендации для вкладки уведомлений
      if (view === 'notifications') {
        const suggestions = await analyzeTodayPlansData();
        setOptimizationSuggestions(suggestions);
      } else {
        setOptimizationSuggestions([]);
      }
    } catch (e) {
      console.error('Failed to load notifications:', e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) reload(selectedView);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, selectedView]);

  const handleViewChange = (view: 'notifications' | 'reminders' | 'news') => {
    setSelectedView(view);
    if (onTabChange) {
      onTabChange(view);
    }
  };

  const openTasksModal = async (taskIds: string[] | undefined, title: string) => {
    if (!taskIds || taskIds.length === 0) {
      return;
    }

    try {
      // Загружаем полные данные задач
      const tasksResponse = await apiService.getTasks({
        page: 1,
        limit: 100,
      });

      if (tasksResponse.success && tasksResponse.data) {
        const allTasks = tasksResponse.data.items || [];
        const filteredTasks = allTasks.filter(t => taskIds.includes(t._id));
        setTasksForModal(filteredTasks);
        setTasksGridModalTitle(title);
        setIsTasksGridModalOpen(true);
      }
    } catch (error) {
      console.error('Failed to load tasks for modal:', error);
      showToast(t('notificationsViewModal.errorLoadingTasks'), 'error');
    }
  };

  // Функция нормализации taskId - извлекает строку из объекта или возвращает строку
  const normalizeTaskId = (taskId: string | { _id?: string } | undefined): string | null => {
    if (!taskId) return null;
    if (typeof taskId === 'string') {
      // Убираем префикс task_ если он есть
      return taskId.startsWith('task_') ? taskId.replace(/^task_/, '') : taskId;
    }
    if (typeof taskId === 'object' && taskId._id) {
      return taskId._id;
    }
    return null;
  };

  const openDetails = async (item: Notification) => {
    // Если это напоминание с taskId, сразу открываем задачу
    if (item.type === NotificationType.REMINDER && item.taskId && onOpenTaskView) {
      try {
        // Пытаемся получить taskId из разных источников
        let taskId: string | { _id?: string } | undefined = item.taskId 
          || item.metadata?.taskId 
          || item.metadata?.eventId
          || item.metadata?.event?.taskId
          || item.metadata?.event?.id;
        
        // Если taskId нет в полях, пытаемся извлечь из actionUrl
        if (!taskId && item.actionUrl) {
          const urlMatch = item.actionUrl.match(/\/tasks\/([^/?#]+)/);
          if (urlMatch) {
            taskId = urlMatch[1];
          } else {
            const paramsMatch = item.actionUrl.match(/[?&]taskId=([^&]+)/);
            if (paramsMatch) {
              taskId = paramsMatch[1];
            }
          }
        }
        
        if (taskId) {
          // Нормализуем taskId: извлекаем строку из объекта или убираем префикс task_
          const normalizedTaskId = normalizeTaskId(taskId);
          if (!normalizedTaskId) {
            console.error('Invalid taskId:', taskId);
            return;
          }
          
          await onOpenTaskView(normalizedTaskId);
          
          // Помечаем как прочитанное
          if (!item.isRead) {
            try {
              await apiService.markNotificationRead(item._id, true);
              setItems(prev => prev.map(n => n._id === item._id ? { ...n, isRead: true } : n));
            } catch (error) {
              console.error('Failed to mark reminder as read:', error);
            }
          }
          return;
        }
      } catch (error) {
        console.error('Failed to open task:', error);
      }
    }
    
    // На мобильных запрещаем открытие модалки управления
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    if (isMobile) {
      // Помечаем как прочитанное даже на мобильных, если еще не прочитано
      if (!item.isRead) {
        try {
          await apiService.markNotificationRead(item._id, true);
          setItems(prev => prev.map(n => n._id === item._id ? { ...n, isRead: true } : n));
        } catch (error) {
          console.error('Failed to mark notification as read:', error);
        }
      }
      return; // Просто возвращаемся, не открываем детальную модалку
    }
    
    setDetailLoading(true);
    try {
      let full: Notification | null = null;
      try {
        const res = await apiService.getNotification(item._id);
        if (res.success && res.data) full = res.data;
      } catch (e) {
        full = item;
      }
      const next = full || item;
      setSelectedItem(next);
      setIsDetailModalOpen(true);
      // помечаем как прочитанное
      if (!next.isRead) {
        try {
          await apiService.markNotificationRead(next._id, true);
          setItems(prev => prev.map(n => n._id === next._id ? { ...n, isRead: true } : n));
          setSelectedItem(si => (si && si._id === next._id) ? { ...si, isRead: true } as Notification : si);
        } catch {}
      }
    } finally {
      setDetailLoading(false);
    }
  };

  const markAllAsRead = async () => {
    try {
      const ids = selectedView === 'notifications'
        ? items.filter(n => !n.isRead && n.type !== NotificationType.REMINDER && n.type !== NotificationType.NEWS).map(n => n._id)
        : items.filter(n => !n.isRead).map(n => n._id);
      if (ids.length === 0) return;
      const res = await apiService.bulkMarkNotificationsAsRead({ notificationIds: ids });
      if (res.success) {
        setItems(prev => prev.map(n => ids.includes(n._id) ? { ...n, isRead: true } : n));
      }
    } catch (e) {
      console.error('Failed to bulk mark read:', e);
    }
  };

  const viewOptions = [
    { key: 'notifications' as const, label: t('notificationsViewModal.tabNotifications') },
    { key: 'reminders' as const, label: t('notificationsViewModal.tabReminders') },
    { key: 'news' as const, label: t('notificationsViewModal.tabNews') },
  ];
  const modalContainerRef = useRef<HTMLDivElement | null>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchStartElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen || isDetailModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, isDetailModalOpen]);

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

    if (touchStartElement.current) {
      const scrollableContainer = touchStartElement.current.closest('.overflow-x-auto, .overflow-y-auto');
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
          touchStartElement.current = null;
          return;
        }
      }
    }

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
        onClose();
      }
    }

    touchStartX.current = null;
    touchStartY.current = null;
    touchStartElement.current = null;
  };

  useEffect(() => {
    if (!isOpen) return;

    const container = modalContainerRef.current;
    if (!container) return;

    const handleTouchMoveNative = (e: TouchEvent) => {
      if (touchStartX.current === null || touchStartY.current === null) {
        return;
      }

      const touchCurrentX = e.touches[0].clientX;
      const touchCurrentY = e.touches[0].clientY;
      const diffX = touchCurrentX - touchStartX.current;
      const diffY = touchCurrentY - touchStartY.current;

      if (Math.abs(diffX) < 5 && Math.abs(diffY) < 5) {
        return;
      }

      if (touchStartElement.current) {
        const scrollableContainer = touchStartElement.current.closest('.overflow-x-auto, .overflow-y-auto');
        if (scrollableContainer) {
          const container = scrollableContainer as HTMLElement;
          const scrollTop = container.scrollTop;
          const scrollHeight = container.scrollHeight;
          const clientHeight = container.clientHeight;
          const hasVerticalScroll = scrollHeight > clientHeight;
          const isAtTopEdge = scrollTop <= 1;

          if (hasVerticalScroll) {
            if (Math.abs(diffY) > Math.abs(diffX)) {
              return;
            }

            if (!isAtTopEdge) {
              return;
            }
          }
        }
      }

      if (Math.abs(diffY) > Math.abs(diffX)) {
        return;
      }

      if (Math.abs(diffX) > 10 && Math.abs(diffX) > Math.abs(diffY) && e.cancelable) {
        e.preventDefault();
      }
    };

    container.addEventListener('touchmove', handleTouchMoveNative, { passive: false });

    return () => {
      container.removeEventListener('touchmove', handleTouchMoveNative);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const modalContent = (
    <div className="modal-fade-in fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center z-50 pt-[15px] md:pt-4 pb-0 md:pb-4 px-0 md:px-4 transition-all duration-300 ease-out animate-in fade-in" onClick={onClose}>
      <div 
        ref={modalContainerRef}
        className="relative flex flex-col bg-white md:pb-0 rounded-t-[25px] md:rounded-[25px] shadow-2xl overflow-hidden w-full md:w-[70%] md:max-w-4xl h-[85vh] md:max-h-[90vh] overflow-y-auto animate-in zoom-in-95 slide-in-from-bottom-4 duration-300" 
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className='py-5 px-12.5'>
          <div className='py-2.5 px-5 rounded-[6px] border border-[var(--border)] flex flex-col gap-5 w-full max-w-full min-w-0'>
            <div className="flex justify-between items-center">
              <div className='flex items-center gap-2.5 p-2.5'>
                {/* Заголовок и переключатели вкладок */}
                <h2 className="text-[20px] font-normal flex-1 text-[rgba(255,255,255,0.92)]">
                  {selectedView === 'notifications' ? t('notificationsViewModal.tabNotifications') : selectedView === 'reminders' ? t('notificationsViewModal.tabReminders') : t('notificationsViewModal.tabNews')}
                </h2>
              </div>
            </div>
            <div className='flex justify-between items-center gap-4'>
              <div className='flex items-center p-1 rounded-[6px] border-2 border-dream-primary flex-1'>
                {viewOptions.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => handleViewChange(option.key)}
                    className={`flex-1 py-2.5 px-5 rounded-[4px] transition-all duration-200 ease-in-out cursor-pointer hover:scale-105 active:scale-95 ${
                      selectedView === option.key
                        ? 'bg-dream-primary text-white'
                        : 'text-gray-700 hover:bg-dream-secondary/50'
                    }`}
                  >
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
              <button 
                onClick={markAllAsRead}
                className="flex items-center justify-center relative group"
                title={t('notificationsViewModal.markAllAsRead')}
              >
                <svg 
                  width="24" 
                  height="24" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  xmlns="http://www.w3.org/2000/svg"
                  className="text-dream-primary"
                >
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="white"/>
                  <path d="M9 12L11 14L15 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {/* Tooltip */}
                <div className="absolute bottom-full right-0 mb-2 px-3 py-1.5 bg-gray-900 text-white text-sm rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">{t('notificationsViewModal.markAllAsRead')}<div className="absolute top-full right-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                </div>
              </button>
            </div>
            <div className="flex flex-col p-5 gap-5 pb-20">
              {loading && (
                <div className="p-3 border border-[var(--border)] rounded-[6px] text-base text-[rgba(255,255,255,0.72)]">{t('notificationsViewModal.loading')}</div>
              )}
              {!loading && selectedView === 'notifications' && items.length === 0 && optimizationSuggestions.length === 0 && (
                <div className="p-3 border border-[var(--border)] rounded-[6px] text-base text-[rgba(255,255,255,0.72)]">{t('notificationsViewModal.noData')}</div>
              )}
              {!loading && selectedView !== 'notifications' && items.length === 0 && (
                <div className="p-3 border border-[var(--border)] rounded-[6px] text-base text-[rgba(255,255,255,0.72)]">{t('notificationsViewModal.noData')}</div>
              )}
              {!loading && selectedView === 'notifications' && optimizationSuggestions.length > 0 && (
                <>
                  {optimizationSuggestions.map((suggestion) => (
                    <div 
                      key={suggestion.id} 
                      onClick={() => {
                        if (suggestion.taskIds && suggestion.taskIds.length > 0) {
                          openTasksModal(suggestion.taskIds, suggestion.title);
                        }
                      }}
                      className="min-h-17.5 px-5 pr-4 rounded-[6px] flex flex-col gap-2 cursor-pointer bg-[var(--secondary)] border border-[var(--border)] hover:bg-[color-mix(in_srgb,var(--primary)_8%,var(--secondary))] transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex items-center pt-0.5">
                          {suggestion.type === 'warning' ? (
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M8 0L0 16h16L8 0zm0 4v6h1V4H8zm0 8v-1h1v1H8z" fill="#F59E0B"/>
                            </svg>
                          ) : suggestion.type === 'suggestion' ? (
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zm0 12a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm0-4V4h1v4H8z" fill="#3B82F6"/>
                            </svg>
                          ) : (
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zm3.5 6L7 10.5 4.5 8l1-1L7 8.5l3.5-3.5 1 1z" fill="#10B981"/>
                            </svg>
                          )}
                        </div>
                        <div className="flex-1 flex flex-col gap-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-base text-[rgba(255,255,255,0.92)]">{suggestion.title}</span>
                            <span className="text-base text-[rgba(255,255,255,0.72)] whitespace-nowrap">{formatTime(suggestion.createdAt)}</span>
                          </div>
                          <span className="text-base text-[rgba(255,255,255,0.72)] whitespace-pre-line">{suggestion.message}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
              {!loading && items.length > 0 && (
                <>
                  {items.map((n) => {
                    const isReminder = n.type === NotificationType.REMINDER;
                    const isNews = n.type === NotificationType.NEWS;
                    const isExpanded = expandedNews.has(n._id);
                    
                    return (
                      <div 
                        key={n._id} 
                        onClick={async (e) => {
                          // Если у напоминания есть taskId, открываем задачу через глобальный обработчик
                          if (isReminder && n.taskId && onOpenTaskView) {
                            try {
                              const normalizedTaskId = normalizeTaskId(n.taskId);
                              if (!normalizedTaskId) {
                                console.error('Invalid taskId:', n.taskId);
                                return;
                              }
                              await onOpenTaskView(normalizedTaskId);
                              // Помечаем как прочитанное только если задача успешно открыта
                              if (!n.isRead) {
                                try {
                                  await apiService.markNotificationRead(n._id, true);
                                  setItems(prev => prev.map(item => item._id === n._id ? { ...item, isRead: true } : item));
                                } catch (error) {
                                  console.error('Failed to mark reminder as read:', error);
                                }
                              }
                            } catch (error) {
                              // Ошибка уже обработана в handleOpenTaskView
                              console.error('Failed to open task:', error);
                            }
                          } else if (isNews) {
                            // Для новостей в модалке "Все" только разворачиваем/сворачиваем содержимое
                            e.stopPropagation();
                            setExpandedNews(prev => {
                              const newSet = new Set(prev);
                              if (newSet.has(n._id)) {
                                newSet.delete(n._id);
                              } else {
                                newSet.add(n._id);
                                // Помечаем как прочитанное при первом разворачивании
                                if (!n.isRead) {
                                  apiService.markNotificationRead(n._id, true).then(() => {
                                    setItems(prev => prev.map(item => item._id === n._id ? { ...item, isRead: true } : item));
                                  }).catch(error => {
                                    console.error('Failed to mark news as read:', error);
                                  });
                                }
                              }
                              return newSet;
                            });
                          } else {
                            // Для обычных уведомлений открываем детали
                            openDetails(n);
                          }
                        }}
                        className={`min-h-17.5 px-5 pr-4 ${n.isRead ? 'border border-[var(--border)] bg-[var(--secondary)]' : 'bg-[color-mix(in_srgb,var(--primary)_10%,var(--secondary))] border border-[var(--border)]'} rounded-[6px] flex flex-col ${isNews && isExpanded ? '' : 'justify-center'} transition-colors hover:bg-[color-mix(in_srgb,var(--primary)_12%,var(--secondary))] cursor-pointer`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex items-center mt-1 flex-shrink-0">
                            <div className={`h-3 w-3 rounded-full ${n.isRead ? 'bg-dream-primary/30' : 'bg-dream-primary shadow-[0_0_10px_var(--color-dream-primary)]'}`}></div>
                          </div>
                          <div className="flex-1 flex flex-col gap-2 min-w-0 overflow-hidden">
                            <div className="flex items-start justify-between gap-2 min-w-0">
                              {isNews ? (
                                <span 
                                  className="font-normal text-gray-900 flex-1 min-w-0 line-clamp-2"
                                  style={{
                                    display: '-webkit-box',
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                    wordBreak: 'break-word'
                                  }}
                                >
                                  {n.title}
                                </span>
                              ) : (
                                <span className="font-normal text-gray-900 flex-1 min-w-0 line-clamp-1">
                                  {isReminder && n.metadata?.eventStartTime ? (() => {
                                    const eventDate = new Date(n.metadata.eventStartTime);
                                    const timeUntil = formatTimeUntilReminder(eventDate);
                                    return `${n.title} (${timeUntil})`;
                                  })() : n.title}
                                </span>
                              )}
                              <span className="text-base text-[rgba(255,255,255,0.72)] whitespace-nowrap flex-shrink-0">{formatTime(n.createdAt)}</span>
                            </div>
                            {/* Для новостей показываем содержимое при разворачивании */}
                            {isNews && isExpanded && n.message && (
                              <div className="mt-2 text-base text-[rgba(255,255,255,0.72)] whitespace-pre-line break-words overflow-wrap-anywhere">
                                {n.message}
                              </div>
                            )}
                            {/* Для обычных уведомлений показываем message на плашке */}
                            {!isNews && !isReminder && n.message && <span className="text-base text-[rgba(255,255,255,0.72)] line-clamp-2">{n.message}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // Удаляю дубликаты хелперов ниже (они перенесены выше)
  const detailModalContent = isDetailModalOpen ? (
    <div 
      className="modal-fade-in fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center z-[60] pt-[15px] md:pt-4 pb-0 md:pb-4 px-0 md:px-4 transition-all duration-300 ease-out animate-in fade-in" 
      onClick={() => { setIsDetailModalOpen(false); setSelectedItem(null); }}
    >
      <div 
        className="relative flex flex-col bg-white md:pb-0 rounded-t-[25px] md:rounded-[25px] shadow-2xl overflow-hidden w-full md:w-[70%] md:max-w-4xl h-[85vh] md:max-h-[90vh] overflow-y-auto animate-in zoom-in-95 slide-in-from-bottom-4 duration-300" 
        onClick={(e) => e.stopPropagation()}
      >
          <div className='py-2.5 px-5 rounded-[6px] border border-[var(--border)] flex flex-col gap-5 w-full max-w-full min-w-0'>
            <div className="flex justify-center items-center w-full min-w-0">
              <div className='flex items-center gap-2.5 p-2.5 w-full min-w-0'>
                <h2 className="text-xl font-normal flex-1 text-black break-words overflow-wrap-anywhere min-w-0" title={selectedItem?.title || ''}>
                  {detailLoading ? t('notificationsViewModal.loading') : (selectedItem?.title || t('notificationsViewModal.noTitle'))}
                </h2>
              </div>
            </div>

            {/* Карусель изображений */}
            {(() => {
              const images = getImageAttachments(selectedItem);
              if (images.length === 0) return null;
              const goPrev = () => setImageIndex(prev => (prev - 1 + images.length) % images.length);
              const goNext = () => setImageIndex(prev => (prev + 1) % images.length);
              return (
                <div className='relative w-full h-[308px] rounded-[6px] overflow-hidden bg-[var(--secondary)]'>
                  <div
                    className='flex h-full transition-transform duration-500 ease-in-out'
                    style={{ transform: `translateX(-${imageIndex * 100}%)` }}
                  >
                    {images.map((img: NotificationAttachment, idx: number) => (
                      <div key={img.url + idx} className='min-w-full h-full'>
                        <img src={img.url} alt={img.originalName || 'image'} className='w-full h-full object-cover' />
                      </div>
                    ))}
                  </div>
                  {images.length > 1 && (
                    <>
                      <button
                        type='button'
                        onClick={goPrev}
                        aria-label={t('notificationsViewModal.prev')}
                        className='absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full w-9 h-9 flex items-center justify-center'
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </button>
                      <button
                        type='button'
                        onClick={goNext}
                        aria-label={t('notificationsViewModal.next')}
                        className='absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full w-9 h-9 flex items-center justify-center'
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </button>
                    </>
                  )}
                </div>
              );
            })()}

            <div className='flex flex-col gap-y-4 pb-2 w-full min-w-0'>
              {selectedItem?.message ? (
                <div className="whitespace-pre-line break-words overflow-wrap-anywhere w-full min-w-0">{selectedItem.message}</div>
              ) : (
                !detailLoading && <span className="text-gray-500">{t('notificationsViewModal.noContent')}</span>
              )}
              {selectedItem?.type === NotificationType.REMINDER && (
                <button
                  onClick={async () => {
                    if (!onOpenTaskView) return;
                    
                    // Пытаемся получить taskId из разных источников
                    let taskId = selectedItem.taskId 
                      || selectedItem.metadata?.taskId 
                      || selectedItem.metadata?.eventId
                      || selectedItem.metadata?.event?.taskId
                      || selectedItem.metadata?.event?.id;
                    
                    // Если taskId нет в полях, пытаемся извлечь из actionUrl
                    if (!taskId && selectedItem.actionUrl) {
                      // Пытаемся найти taskId в URL (например, /tasks/123 или ?taskId=123)
                      const urlMatch = selectedItem.actionUrl.match(/\/tasks\/([^/?#]+)/);
                      if (urlMatch) {
                        taskId = urlMatch[1];
                      } else {
                        const paramsMatch = selectedItem.actionUrl.match(/[?&]taskId=([^&]+)/);
                        if (paramsMatch) {
                          taskId = paramsMatch[1];
                        }
                      }
                    }
                    
                    if (!taskId) {
                      showToast(t('notificationsViewModal.taskNotFound'), 'error');
                      return;
                    }
                    
                    // Нормализуем taskId: убираем префикс task_ если он есть
                    const normalizedTaskId = taskId.startsWith('task_') 
                      ? taskId.replace(/^task_/, '') 
                      : taskId;
                    
                    // Используем глобальный обработчик для открытия задачи
                    try {
                      await onOpenTaskView(normalizedTaskId);
                    } catch (error) {
                      // Ошибка уже обработана в handleOpenTaskView
                      console.error('Failed to open task:', error);
                    }
                  }}
                  className="text-dream-primary hover:text-dream-primary/80 underline text-left"
                >{t('notificationsViewModal.openTask')}</button>
              )}
              {selectedItem?.metadata?.taskIds && Array.isArray(selectedItem.metadata.taskIds) && selectedItem.metadata.taskIds.length > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (selectedItem?.metadata?.taskIds) {
                      openTasksModal(selectedItem.metadata.taskIds, selectedItem.title || t('notificationsViewModal.tasks'));
                    }
                  }}
                  className="self-start text-base text-[var(--accent)] hover:text-[var(--primary)] transition-all duration-200 hover:underline active:scale-95 flex items-center gap-2"
                >
                  {selectedItem.metadata.taskIds.length === 1 ? t('notificationsViewModal.viewTask1').replace('{{count}}', selectedItem.metadata.taskIds.length.toString()) : selectedItem.metadata.taskIds.length < 5 ? t('notificationsViewModal.viewTask24').replace('{{count}}', selectedItem.metadata.taskIds.length.toString()) : t('notificationsViewModal.viewTask5').replace('{{count}}', selectedItem.metadata.taskIds.length.toString())}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M13 7l5 5-5 5M6 7l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              )}
            </div>

            {/* Видео-вложения */}
            {(() => {
              const videos = getVideoAttachments(selectedItem);
              if (videos.length === 0) return null;
              return (
                <div className='flex flex-col gap-3'>
                  {videos.map((v: NotificationAttachment, idx: number) => (
                    <video key={v.url + idx} controls className='w-full rounded-2xl bg-black'>
                      <source src={v.url} type={v.mimeType} />{t('notificationsViewModal.videoNotSupported')}</video>
                  ))}
                </div>
              );
            })()}

            {/* Прочие файлы для скачивания */}
            {(() => {
              const others = getOtherAttachments(selectedItem);
              if (others.length === 0) return null;
              return (
                <div className='flex flex-col gap-2 pb-6'>
                  <span className='font-medium'>{t('notificationsViewModal.attachments')}</span>
                  <ul className='list-disc list-inside space-y-1'>
                    {others.map((f: NotificationAttachment, idx: number) => (
                      <li key={f.url + idx}>
                        <a href={f.url} target='_blank' rel='noreferrer' className='text-dream-primary underline'>
                          {decodeFilename(f.originalName || f.filename)}
                        </a>
                        {f.size ? <span className='text-base text-[rgba(255,255,255,0.72)] ml-2'>({Math.round(f.size/1024)} KB)</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}
          </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      {createPortal(modalContent, document.body)}
      {isDetailModalOpen && createPortal(detailModalContent, document.body)}
      {isTasksGridModalOpen && (
        <TasksGridModal
          isOpen={isTasksGridModalOpen}
          onClose={() => {
            setIsTasksGridModalOpen(false);
            setTasksForModal([]);
          }}
          tasks={tasksForModal}
          onUpdateTaskStatus={async (taskId, status) => {
            try {
              await apiService.updateTask(taskId, { status });
            } catch (error) {
              console.error('Failed to update task status:', error);
            }
          }}
          onDeleteTask={async (taskId) => {
            try {
              await apiService.deleteTask(taskId);
              setTasksForModal(prev => prev.filter(t => t._id !== taskId));
            } catch (error) {
              console.error('Failed to delete task:', error);
            }
          }}
          onTaskUpdate={(updatedTask) => {
            setTasksForModal(prev => 
              prev.map(t => t._id === updatedTask._id ? updatedTask : t)
            );
          }}
          title={tasksGridModalTitle}
          forceViewMode="columns"
        />
      )}
      <ToastContainer />
    </>
  );
};

export default NotificationsViewModal;

