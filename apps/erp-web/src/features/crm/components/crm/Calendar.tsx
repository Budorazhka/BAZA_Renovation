import { useState, useImperativeHandle, forwardRef, useRef } from 'react';

export const monthNames = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

export const weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export interface CalendarRef {
  goToPreviousMonth: () => void;
  goToNextMonth: () => void;
}

interface CalendarProps {
  initialDate?: Date;
  selectedDate?: Date; // Алиас для initialDate (для обратной совместимости)
  onDayClick?: (day: number, date: Date) => void;
  onDateChange?: (date: Date) => void;
  showHeader?: boolean;
  headerClassName?: string;
  bodyClassName?: string;
  onHeaderClick?: (e: React.MouseEvent) => void;
  isCollapsed?: boolean;
  events?: Array<{ startTime: string }>; // Массив событий для отображения точек
}

const Calendar = forwardRef<CalendarRef, CalendarProps>(({
  initialDate,
  selectedDate,
  onDayClick,
  onDateChange,
  showHeader = true,
  headerClassName = '',
  bodyClassName = '',
  onHeaderClick,
  isCollapsed = false,
  events = [],
}, ref) => {
  // Используем selectedDate если задан, иначе initialDate, иначе текущую дату
  const [currentDate, setCurrentDate] = useState(selectedDate || initialDate || new Date());
  
  // Флаг для отслеживания, что календарь был проинициализирован
  const hasUserNavigated = useRef(false);

  const goToPreviousMonth = () => {
    hasUserNavigated.current = true;
    const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    setCurrentDate(newDate);
  };

  const goToNextMonth = () => {
    hasUserNavigated.current = true;
    const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    setCurrentDate(newDate);
  };

  useImperativeHandle(ref, () => ({
    goToPreviousMonth,
    goToNextMonth,
  }));

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = (firstDay.getDay() + 6) % 7;

    const prevMonthLastDay = new Date(year, month, 0).getDate();

    const days: Array<{ day: number; isCurrentMonth: boolean }> = [];

    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      days.push({ day: prevMonthLastDay - i, isCurrentMonth: false });
    }

    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ day: i, isCurrentMonth: true });
    }

    const totalDays = days.length;
    const remainingInWeek = totalDays % 7;
    if (remainingInWeek > 0) {
      const daysToAdd = 7 - remainingInWeek;
      for (let i = 1; i <= daysToAdd; i++) {
        days.push({ day: i, isCurrentMonth: false });
      }
    }

    return days;
  };

  const days = getDaysInMonth(currentDate);

  const handleDayClick = (dayInfo: { day: number; isCurrentMonth: boolean }, dayIndex: number) => {
    if (!onDayClick && !onDateChange) return;
    
    let clickedDate: Date;
    
    if (!dayInfo.isCurrentMonth) {
      hasUserNavigated.current = true;
      // Если кликнули на день из предыдущего месяца
      if (dayIndex < 7) {
        clickedDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, dayInfo.day);
      } else {
        // Если кликнули на день из следующего месяца
        clickedDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, dayInfo.day);
      }
      // Переключаем календарь на соответствующий месяц
      setCurrentDate(clickedDate);
    } else {
      // Клик на день текущего месяца
      clickedDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), dayInfo.day);
    }
    
    // Вызываем оба коллбэка если они определены
    if (onDayClick) {
      onDayClick(clickedDate.getDate(), clickedDate);
    }
    if (onDateChange) {
      onDateChange(clickedDate);
    }
  };

  return (
    <>
      {showHeader && (
        <div 
          className={`flex items-center justify-between ${headerClassName}`}
          onClick={onHeaderClick}
        >
          <div className="flex items-center gap-2">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <mask id="mask0_3067_69894" style={{ maskType: 'alpha' }} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
                <rect width="24" height="24" fill="#D9D9D9"/>
              </mask>
              <g mask="url(#mask0_3067_69894)">
                <path d="M9 16.5C8.3 16.5 7.70833 16.2583 7.225 15.775C6.74167 15.2917 6.5 14.7 6.5 14C6.5 13.3 6.74167 12.7083 7.225 12.225C7.70833 11.7417 8.3 11.5 9 11.5C9.7 11.5 10.2917 11.7417 10.775 12.225C11.2583 12.7083 11.5 13.3 11.5 14C11.5 14.7 11.2583 15.2917 10.775 15.775C10.2917 16.2583 9.7 16.5 9 16.5ZM5 22C4.45 22 3.97917 21.8042 3.5875 21.4125C3.19583 21.0208 3 20.55 3 20V6C3 5.45 3.19583 4.97917 3.5875 4.5875C3.97917 4.19583 4.45 4 5 4H6V3C6 2.71667 6.09583 2.47917 6.2875 2.2875C6.47917 2.09583 6.71667 2 7 2C7.28333 2 7.52083 2.09583 7.7125 2.2875C7.90417 2.47917 8 2.71667 8 3V4H16V3C16 2.71667 16.0958 2.47917 16.2875 2.2875C16.4792 2.09583 16.7167 2 17 2C17.2833 2 17.5208 2.09583 17.7125 2.2875C17.9042 2.47917 18 2.71667 18 3V4H19C19.55 4 20.0208 4.19583 20.4125 4.5875C20.8042 4.97917 21 5.45 21 6V20C21 20.55 20.8042 21.0208 20.4125 21.4125C20.0208 21.8042 19.55 22 19 22H5ZM5 20H19V10H5V20ZM5 8H19V6H5V8Z" fill="#169600"/>
              </g>
            </svg>
            <span className="text-lg font-normal">
              {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div
              onClick={(e) => {
                e.stopPropagation();
                goToPreviousMonth();
              }}
              className="p-1 hover:bg-gray-100 rounded transition-colors cursor-pointer"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div
              onClick={(e) => {
                e.stopPropagation();
                goToNextMonth();
              }}
              className="p-1 hover:bg-gray-100 rounded transition-colors cursor-pointer"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            {onHeaderClick && (
              <svg 
                width="24" 
                height="24" 
                viewBox="0 0 24 24" 
                fill="none" 
                xmlns="http://www.w3.org/2000/svg"
                className={`transition-transform duration-200 ${isCollapsed ? 'rotate-180' : ''}`}
              >
                <path d="M12.0007 10.8273L7.05072 15.7773L5.63672 14.3633L12.0007 7.99935L18.3647 14.3633L16.9507 15.7773L12.0007 10.8273Z" fill="#169600"/>
              </svg>
            )}
          </div>
        </div>
      )}

      <div className={bodyClassName}>
        <div className="grid grid-cols-7 gap-1 mb-2">
          {weekDays.map((day) => (
            <div key={day} className="text-center text-xs font-normal text-gray-600 py-1.5">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {days.map((dayInfo, index) => {
            const today = new Date();
            const isToday = dayInfo.isCurrentMonth &&
              dayInfo.day === today.getDate() &&
              currentDate.getMonth() === today.getMonth() &&
              currentDate.getFullYear() === today.getFullYear();

            const dayOfWeek = index % 7;
            const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;

            // Проверяем, есть ли события на этот день
            const dayDate = dayInfo.isCurrentMonth 
              ? new Date(currentDate.getFullYear(), currentDate.getMonth(), dayInfo.day)
              : null;
            const hasEvents = dayDate && events.some(event => {
              const eventDate = new Date(event.startTime);
              return eventDate.getDate() === dayDate.getDate() &&
                     eventDate.getMonth() === dayDate.getMonth() &&
                     eventDate.getFullYear() === dayDate.getFullYear();
            });

            const isClickable = (onDayClick || onDateChange);

            return (
              <div
                key={index}
                onClick={() => handleDayClick(dayInfo, index)}
                className={`
                  aspect-square flex items-center justify-center text-sm font-medium rounded-full relative transition-all
                  ${!dayInfo.isCurrentMonth ? 'text-gray-400 cursor-pointer hover:bg-gray-50' : isWeekend ? 'text-gray-700' : 'text-gray-900'}
                  ${isToday ? 'bg-dream-primary text-white font-normal shadow-lg' : ''}
                  ${isClickable ? 'cursor-pointer' : ''}
                  ${isClickable && !isToday && dayInfo.isCurrentMonth ? 'hover:bg-dream-secondary/30 hover:scale-110' : ''}
                `}
              >
                <span className="relative z-10">{dayInfo.day}</span>
                {hasEvents && !isToday && dayInfo.isCurrentMonth && (
                  <div className="absolute bottom-0.5 w-1 h-1 rounded-full bg-red-500" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
});

Calendar.displayName = 'Calendar';

export default Calendar;

