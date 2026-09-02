import { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import CalendarViewModal from './CalendarViewModal';
import Calendar, { type CalendarRef } from './Calendar';
import { useAuth } from '../../hooks/useAuth';
import { apiService, type CalendarEvent, EventType } from '../../services/api';
import { compareArrays } from '../../utils/dataComparison';
import { useCalendarRealtimeSync } from '../../hooks/useCalendarRealtimeSync';

interface CalendarBlockProps {
  onModalOpen?: () => void;
}

const CalendarBlock = ({ onModalOpen }: CalendarBlockProps = {}) => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(() => {
    return searchParams.get('modal') === 'calendar';
  });
  const [isMobile, setIsMobile] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const calendarRef = useRef<CalendarRef>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedDateForEvent, setSelectedDateForEvent] = useState<Date | null>(null);
  const [_shouldOpenCreateModal, setShouldOpenCreateModal] = useState(false); // Зарезервировано для будущего использования

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Восстановление состояния из URL
  useEffect(() => {
    const modalParam = searchParams.get('modal');
    if (modalParam === 'calendar' && !isCalendarModalOpen) {
      setIsCalendarModalOpen(true);
    } else if (modalParam !== 'calendar' && isCalendarModalOpen) {
      setIsCalendarModalOpen(false);
    }
  }, [searchParams]);


  // Функция загрузки событий (использует новый unified API)
  const loadEvents = useCallback(async (): Promise<CalendarEvent[]> => {
    if (!user?.id) return [];

    try {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const start = new Date(year, month, 1, 0, 0, 0);
      const end = new Date(year, month + 1, 0, 23, 59, 59);
      
      // Используем новый unified API для получения событий и задач вместе
      const unifiedResponse = await apiService.getCalendarUnified({
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        userId: user.id,
        userRole: user.role,
      });
      
      let allEvents: CalendarEvent[] = [];
      
      if (unifiedResponse.success && unifiedResponse.data) {
        // Добавляем события календаря
        const calendarEvents = unifiedResponse.data.events || [];
        allEvents = [...calendarEvents];
        
        // Получаем ID задач, которые уже представлены как события календаря
        // (чтобы избежать дублирования)
        const taskIdsInEvents = new Set<string>();
        calendarEvents.forEach(event => {
          if (event.type === EventType.TASK && event.taskId) {
            const taskId = typeof event.taskId === 'string' ? event.taskId : event.taskId._id;
            taskIdsInEvents.add(taskId);
          }
        });
        
        // Преобразуем только те задачи, которые еще не представлены как события
        if (unifiedResponse.data.tasks && unifiedResponse.data.tasks.length > 0) {
          const taskEvents = unifiedResponse.data.tasks
            .filter(task => {
              // Исключаем задачи, которые уже есть в событиях календаря
              // Исключаем задачи без startDate (не могут быть отображены в календаре)
              if (!task.startDate) return false;
              return !taskIdsInEvents.has(task._id) && !taskIdsInEvents.has(task.taskId);
            })
            .map(task => {
              // Проверяем валидность startDate
              const startDate = new Date(task.startDate!);
              if (isNaN(startDate.getTime())) {
                return null; // Пропускаем задачи с невалидной датой начала
              }
              
              // Вычисляем endDate: используем реальную дату окончания из задачи
              let endDate: Date;
              if (task.endDate) {
                endDate = new Date(task.endDate);
                if (isNaN(endDate.getTime())) {
                  // endDate невалиден, используем дефолтную длительность (1 час)
                  endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
                } else {
                  // Используем реальную дату окончания, даже если она совпадает с началом
                  // Это позволяет отображать задачи с реальной длительностью
                  // Если endDate раньше startDate, это ошибка данных - используем дефолт
                  if (endDate.getTime() < startDate.getTime()) {
                    console.warn('[CalendarBlock] Task endDate is before startDate, using default duration:', {
                      taskId: task._id,
                      taskTitle: task.title,
                      startDate: task.startDate,
                      endDate: task.endDate
                    });
                    endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
                  }
                  // Если endDate равен startDate, используем реальную дату (задача может быть без указанной длительности)
                }
              } else {
                // endDate отсутствует, используем дефолтную длительность (1 час)
                endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
              }
              
              return {
                _id: task._id,
                title: task.title,
                description: task.description,
                startTime: startDate.toISOString(),
                endTime: endDate.toISOString(),
                type: EventType.TASK,
                status: task.status === 'completed' ? 'completed' as any : 'scheduled' as any,
                isAllDay: false,
                taskId: task.taskId || task._id,
              } as CalendarEvent;
            })
            .filter((event): event is CalendarEvent => event !== null); // Убираем null значения
          
          allEvents = [...allEvents, ...taskEvents];
        }
      }
      
      return allEvents;
    } catch (err) {
      console.error('Error loading calendar events:', err);
      // Fallback на старый метод при ошибке
      try {
        const eventsResponse = await apiService.getCalendarEventsView({
          startDate: new Date(currentDate.getFullYear(), currentDate.getMonth(), 1, 0, 0, 0).toISOString(),
          endDate: new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59).toISOString(),
          userId: user.id,
          userRole: user.role,
        });
        return eventsResponse.success && eventsResponse.data ? eventsResponse.data : [];
      } catch (fallbackErr) {
        console.error('Fallback error:', fallbackErr);
        return [];
      }
    }
  }, [currentDate, user?.id, user?.role]);

  // Реалтайм синхронизация календаря
  useCalendarRealtimeSync({
    userId: user?.id,
    userRole: user?.role,
    currentDate,
    onEventsUpdated: (newEvents) => {
      setEvents(prevEvents => {
        // Обновляем только если данные изменились
        if (compareArrays(prevEvents, newEvents, '_id', ['title', 'startTime', 'endTime', 'type', 'status'])) {
          return prevEvents; // Возвращаем старое для предотвращения ререндера
        }
        return newEvents;
      });
    },
    fallbackInterval: 5000,
  });

  // Загружаем события при открытии компонента и изменении месяца
  useEffect(() => {
    if (user?.id) {
      loadEvents().then(newEvents => {
        setEvents(prevEvents => {
          // Обновляем только если данные изменились
          if (compareArrays(prevEvents, newEvents, '_id', ['title', 'startTime', 'endTime', 'type', 'status'])) {
            return prevEvents; // Возвращаем старое для предотвращения ререндера
          }
          return newEvents;
        });
      });
    }
  }, [user?.id, currentDate, loadEvents]);

  const handleHeaderClick = (e: React.MouseEvent) => {
    if (isMobile) {
      e.stopPropagation();
      setIsCollapsed(!isCollapsed);
    }
  };

  return (
    <div className="rounded-lg overflow-hidden bg-[var(--card)] shadow-[inset_0_0_0_1px_rgba(201,168,76,0.12)]">
      {}
      
      <div 
        className="bg-dream-secondary block cursor-pointer"
        onClick={() => {
          if (!isMobile) {
            onModalOpen?.();
            setIsCalendarModalOpen(true);
            const newParams = new URLSearchParams(searchParams);
            newParams.set('modal', 'calendar');
            setSearchParams(newParams, { replace: true });
          }
        }}
      >
        <Calendar
          ref={calendarRef}
          initialDate={currentDate}
          showHeader={isMobile}
          headerClassName={isMobile ? "bg-[var(--secondary)] p-4 cursor-pointer rounded-t-lg text-[rgba(255,255,255,0.92)]" : ""}
          onHeaderClick={isMobile ? handleHeaderClick : undefined}
          isCollapsed={isMobile ? isCollapsed : false}
          bodyClassName={isMobile && isCollapsed ? "hidden" : "p-4 pb-6"}
          onDateChange={setCurrentDate}
          onDayClick={(_day, _date) => {
            if (!isMobile) {
              // Просто открываем календарь без создания события
              onModalOpen?.();
              setIsCalendarModalOpen(true);
              const newParams = new URLSearchParams(searchParams);
              newParams.set('modal', 'calendar');
              setSearchParams(newParams, { replace: true });
            }
          }}
          events={events}
        />
      </div>
      {isCalendarModalOpen && (
        <CalendarViewModal
          isOpen={isCalendarModalOpen}
          onClose={() => {
            setIsCalendarModalOpen(false);
            setSelectedDateForEvent(null);
            setShouldOpenCreateModal(false);
            const newParams = new URLSearchParams(searchParams);
            newParams.delete('modal');
            setSearchParams(newParams, { replace: true });
          }}
          initialDate={selectedDateForEvent || undefined}
        />
      )}
    </div>
  );
};

export default CalendarBlock;
