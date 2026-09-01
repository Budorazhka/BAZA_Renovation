import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Tooltip from '../common/Tooltip';
import { useI18n } from "@/i18n";

interface ModalTaskData {
  id: string;
  title: string;
  dateTime?: string;
  dateTimeColor?: 'gray' | 'red';
  startDate?: string;
  endDate?: string;
  progress?: {
    current: number;
    total: number;
    completed: boolean;
  };
  icons?: Array<'redLightning' | 'yellowBookmark'>;
  colorLabel?: string;
  user?: {
    name: string;
    image: string;
  };
  leadName?: string;
  urgency?: 'urgent' | 'notUrgent';
  importance?: 'important' | 'notImportant';
  taskType?: 'standard' | 'call' | 'meeting';
  workType?: 'work' | 'personal';
  phone?: string;
  assignedUsers?: Array<{
    name: string;
    image?: string;
  }>;
  files?: Array<{
    filename: string;
    originalName?: string;
    mimeType?: string;
    size?: number;
    url?: string;
  }>;
  hasFiles?: boolean; // Индикатор наличия файлов
  createdAt?: string; // Дата создания задачи
  updatedAt?: string; // Дата последнего редактирования задачи
}

interface TaskCardProps {
  task: ModalTaskData;
  index: number;
  isChecked: boolean;
  viewMode?: 'grid' | 'columns' | 'list';
  onCheckboxChange: (checked: boolean) => void;
  onShowInfo?: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  addLeftMargin?: boolean;
  isFromTasksBlock?: boolean;
  /** Светлые плашки как в блоке «Задачи» (модал управления / сетка задач) */
  isFromTaskManagement?: boolean;
}

const TaskCard: React.FC<TaskCardProps> = ({
  task,
  index,
  isChecked,
  viewMode,
  onCheckboxChange,
  onShowInfo,
  onDelete,
  onEdit: _onEdit,
  addLeftMargin: _addLeftMargin = false,
  isFromTasksBlock = false,
  isFromTaskManagement: _isFromTaskManagement = false,
}) => {
    const { t } = useI18n();
  const taskIndex = index;
  const isMatrixMode = viewMode === 'grid' || viewMode === 'columns' || viewMode === 'list';
  const isListMatrix = viewMode === 'list';
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isDraggable = (viewMode === 'grid' || viewMode === 'columns') && !isChecked;

  /** Геометрия как в crm-origin (TaskCard): светлые плашки → токены тёмно-зелёной темы CRM */
  const gridColumnsClasses = `${isMatrixMode
    ? `bg-[var(--card)] border border-[var(--border)] w-full ${isListMatrix ? 'px-4 py-3 rounded-2xl' : 'min-h-17.5 px-5 pr-4 rounded-lg flex-col items-center justify-center gap-1'}`
    : 'bg-[var(--card)] border border-[var(--border)] rounded-2xl px-5 pr-4'
  } ${isDraggable ? 'cursor-move cursor-pointer' : onShowInfo ? 'cursor-pointer' : ''}`;

  const matrixClasses = isChecked
    ? 'bg-[var(--muted)] h-12 rounded-[25px] border border-[var(--border)] px-5 pr-4'
    : gridColumnsClasses;

  const nonMatrixClasses = isChecked
    ? 'min-h-9 px-5 pr-4 opacity-75'
    : 'bg-[var(--secondary)] rounded-lg min-h-12 border border-[var(--border)] px-5 pr-4';

  const hasTaskMeta =
    !!(task.dateTime || (task.progress && task.progress.total > 0));
  const showTaskMetaRow =
    hasTaskMeta && isMatrixMode && isListMatrix;
  const taskMetaLine = [
    task.progress && task.progress.total > 0
      ? `Подзадачи: ${task.progress.current}/${task.progress.total}`
      : null,
    task.dateTime ?? null,
  ]
    .filter(Boolean)
    .join(' · ');

  const rootOverflowClass = 'overflow-hidden';

  return (
    <div 
      draggable={isDraggable}
      onDragStart={(e) => {
        if (isDraggable) {
          setIsDragging(true);
          e.dataTransfer.setData('taskId', task.id);
          e.dataTransfer.effectAllowed = 'move';
          (e.target as HTMLElement).style.opacity = '0.5';
        }
      }}
      onDragEnd={(e) => {
        (e.target as HTMLElement).style.opacity = '1';
        // Небольшая задержка, чтобы предотвратить случайный клик после drag
        setTimeout(() => setIsDragging(false), 100);
      }}
      title={onShowInfo && !isDraggable ? 'Просмотр информации о задаче' : undefined}
      className={`${isMatrixMode
        ? `flex ${isListMatrix ? 'items-center' : 'items-center'} transition-all duration-300 ease-out hover:shadow-md hover:scale-y-[1.01] ${matrixClasses}`
        : `flex justify-between items-center transition-all duration-300 ease-out ${rootOverflowClass} hover:shadow-md hover:scale-y-[1.01] ${nonMatrixClasses}`
      }`}
      onClick={(e) => {
        // Проверяем, что клик не был по интерактивным элементам
        const target = e.target as HTMLElement;
        const clickedButton = target.closest('button');
        const clickedLabel = target.closest('label');
        const clickedInput = target.closest('input');
        const clickedLink = target.closest('a');
        const clickedInteractive = target.closest('[role="button"]');
        
        const isInteractiveElement = clickedButton || clickedLabel || clickedInput || clickedLink || clickedInteractive ||
                                     target.tagName === 'BUTTON' || 
                                     target.tagName === 'INPUT' || 
                                     target.tagName === 'LABEL' ||
                                     target.tagName === 'A' ||
                                     target.tagName === 'SVG' ||
                                     target.tagName === 'PATH';
        
        if (onShowInfo && !isDragging && !isDeleteModalOpen && !isInteractiveElement) {
          onShowInfo();
        }
      }}
    >
      <div className={`flex ${isListMatrix ? 'flex-row items-center gap-3 w-full' : isMatrixMode ? 'flex-col items-center justify-center w-full h-full gap-1' : 'h-flex gap-2'} ${isMatrixMode && !isListMatrix ? 'justify-between' : ''}`}>
          {!isMatrixMode && !isFromTasksBlock && (
            <label className={`relative flex items-center cursor-pointer ${(viewMode === 'list' && isMobile) ? 'hidden' : ''}`}>
              <input
                type="checkbox"
                checked={!!isChecked}
                onChange={(e) => onCheckboxChange(e.target.checked)}
                className="sr-only"
              />
              <div className={`w-6.5 h-6.5 rounded-lg border-2 flex items-center justify-center transition-all duration-200 ${
                isChecked
                  ? 'bg-dream-primary border-dream-primary'
                  : 'border-dream-primary bg-[var(--card)]'
              }`}>
                {isChecked && (
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            </label>
          )}
        <div className={`flex flex-col ${isMatrixMode && !isListMatrix ? 'items-start justify-center w-full flex-1 gap-0.5 pt-2' : 'justify-between h-flex gap-2.5 flex-1 min-w-0'} ${isMatrixMode && !isListMatrix ? 'gap-0' : 'gap-0'}  `}>

          <div className={`flex ${isMatrixMode ? 'w-full items-center' : ''} justify-between items-center  ${isChecked ? 'gap-2' : 'gap-2'}`}>
          {/* Чекбокс для режима grid и columns - показываем всегда, не только на мобильных */}
          {(isMatrixMode) || !viewMode ? (
            <label className="relative flex items-center cursor-pointer" onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={!!isChecked}
                onChange={(e) => {
                  e.stopPropagation();
                  onCheckboxChange(e.target.checked);
                }}
                className="sr-only"
              />
              <div className={`w-6 h-6 ${viewMode === 'grid' || viewMode === 'columns' ? 'w-5 h-5' : ''} rounded-lg border-2 flex items-center justify-center transition-all duration-200 ${
                isChecked
                  ? 'bg-dream-primary border-dream-primary'
                  : 'border-dream-primary bg-[var(--card)]'
              }`}>
                {isChecked && (
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            </label>
          ) : null}
            <div
              className={`flex min-w-0 flex-1 flex-col ${showTaskMetaRow ? 'gap-1' : ''} ${isMatrixMode ? 'w-full' : ''}`}
            >
            <div
              className={`flex w-full items-center ${isListMatrix ? 'gap-3' : ''} ${isFromTasksBlock && !isMatrixMode ? 'min-w-0 flex-nowrap gap-2' : !isMatrixMode ? 'flex-1' : ''}`}
            >
              <span 
                className={`${isMatrixMode ? 'font-normal line-clamp-1 flex-1' : isFromTasksBlock && !isMatrixMode ? 'min-w-0 max-w-full shrink truncate' : 'flex-1 min-w-0'} transition-all duration-300 ${isFromTasksBlock && !isMatrixMode ? '' : 'text-wrap'} ${
                  isChecked ? 'line-through text-[var(--muted-foreground)]' : 'text-[var(--foreground)]'
                }`}
                style={isMatrixMode ? {
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 400,
                  fontStyle: 'normal',
                  fontSize: '13px',
                  lineHeight: '15px',
                  letterSpacing: '0px',
                  leadingTrim: 'cap-height'
                } as React.CSSProperties & { leadingTrim?: string } : isFromTasksBlock ? {
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 400,
                  fontStyle: 'normal',
                  fontSize: '12px',
                  lineHeight: '18px',
                  letterSpacing: '0px',
                  leadingTrim: 'cap-height'
                } as React.CSSProperties & { leadingTrim?: string } : {
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 400,
                  fontStyle: 'normal',
                  fontSize: '18px',
                  lineHeight: '24px',
                  letterSpacing: '0px',
                  textDecoration: isChecked ? 'line-through' : 'none',
                  leadingTrim: 'none'
                } as React.CSSProperties & { leadingTrim?: string }}
              >
                {viewMode === 'grid' || viewMode === 'columns'
                  ? (task.title.length > 50 ? `${task.title.substring(0, 50)}...` : task.title)
                  : viewMode === 'list'
                  ? (task.title.length > 50 ? `${task.title.substring(0, 50)}...` : task.title)
                  : isFromTasksBlock
                    ? (task.title.length > 50 ? `${task.title.substring(0, 50)}...` : task.title)
                    : task.title
                }
              </span>
              {isMatrixMode && !isChecked && (
                <div className="flex items-center justify-end ml-2 gap-1 md:gap-2 flex-shrink-0 overflow-hidden max-w-[45%] md:max-w-none">
                  {/* Файлы */}
                  {task.files && task.files.length > 0 && (
                    <Tooltip text="Имеются файлы">
                      <div className="flex items-center justify-center flex-shrink-0">
                        <svg width={isMobile ? "8" : "12"} height={isMobile ? "14" : "20"} viewBox="0 0 14 26" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M9 0H5C3.6744 0.00156145 2.40353 0.528847 1.46619 1.46619C0.528847 2.40353 0.00156145 3.6744 0 5V25C0 25.2652 0.105357 25.5196 0.292893 25.7071C0.48043 25.8946 0.734784 26 1 26C1.26522 26 1.51957 25.8946 1.70711 25.7071C1.89464 25.5196 2 25.2652 2 25V5C2.00087 4.20462 2.31722 3.44206 2.87964 2.87964C3.44206 2.31722 4.20462 2.00087 5 2H9C9.79538 2.00087 10.5579 2.31722 11.1204 2.87964C11.6828 3.44206 11.9991 4.20462 12 5V21C12 21.7956 11.6839 22.5587 11.1213 23.1213C10.5587 23.6839 9.79565 24 9 24C8.20435 24 7.44129 23.6839 6.87868 23.1213C6.31607 22.5587 6 21.7956 6 21V8C6 7.73478 6.10536 7.48043 6.29289 7.29289C6.48043 7.10536 6.73478 7 7 7C7.26522 7 7.51957 7.10536 7.70711 7.29289C7.89464 7.48043 8 7.73478 8 8V20C8 20.2652 8.10536 20.5196 8.29289 20.7071C8.48043 20.8946 8.73478 21 9 21C9.26522 21 9.51957 20.8946 9.70711 20.7071C9.89464 20.5196 10 20.2652 10 20V8C10 7.20435 9.68393 6.44129 9.12132 5.87868C8.55871 5.31607 7.79565 5 7 5C6.20435 5 5.44129 5.31607 4.87868 5.87868C4.31607 6.44129 4 7.20435 4 8V21C4 22.3261 4.52678 23.5979 5.46447 24.5355C6.40215 25.4732 7.67392 26 9 26C10.3261 26 11.5979 25.4732 12.5355 24.5355C13.4732 23.5979 14 22.3261 14 21V5C13.9984 3.6744 13.4712 2.40353 12.5338 1.46619C11.5965 0.528847 10.3256 0.00156145 9 0Z" fill="#555454"/>
                        </svg>
                      </div>
                    </Tooltip>
                  )}
                  {/* Тип задачи (звонок/встреча) */}
                  {task.taskType === 'call' && (
                    <Tooltip text="Звонок">
                      <div className="flex-shrink-0">
                        <svg width={isMobile ? "16" : "20"} height={isMobile ? "16" : "20"} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M20.01 15.38C18.78 15.38 17.59 15.18 16.45 14.82C16.3 14.75 16.13 14.72 15.96 14.72C15.75 14.72 15.54 14.78 15.35 14.88L12.8 16.53C10.07 15.24 8.76 13.93 7.47 11.2L9.12 8.65C9.32 8.46 9.47 8.22 9.54 7.96C9.62 7.7 9.61 7.42 9.52 7.17C9.16 6.03 8.96 4.84 8.96 3.62C8.96 3.13 8.56 2.73 8.07 2.73H4.28C3.79 2.73 3 2.73 3 3.62C3 13.61 10.39 21 20.38 21C21.27 21 21.27 20.21 21.27 19.72V15.93C21.27 15.44 20.87 15.04 20.38 15.04L20.01 15.38Z" fill="#666666"/>
                        </svg>
                      </div>
                    </Tooltip>
                  )}
                  {task.taskType === 'meeting' && (
                    <Tooltip text="Встреча">
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        {task.assignedUsers && task.assignedUsers.length > 0 ? (
                          <>
                            {task.assignedUsers.slice(0, 2).map((_user, idx) => (
                              <div key={idx} className="flex-shrink-0">
                                <svg width={isMobile ? "16" : "20"} height={isMobile ? "16" : "20"} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12ZM12 14C9.33 14 4 15.34 4 18V20H20V18C20 15.34 14.67 14 12 14Z" fill="#666666"/>
                                  <path d="M18 10C19.1 10 20 9.1 20 8C20 6.9 19.1 6 18 6C16.9 6 16 6.9 16 8C16 9.1 16.9 10 18 10ZM18 12C16.34 12 13 12.68 13 14.33V16H23V14.33C23 12.68 19.66 12 18 12Z" fill="#666666"/>
                                </svg>
                              </div>
                            ))}
                            {task.assignedUsers.length > 2 && (
                              <div className="flex-shrink-0 text-xs font-medium text-[var(--muted-foreground)]">
                                +{task.assignedUsers.length - 2}
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="flex-shrink-0">
                            <svg width={isMobile ? "16" : "20"} height={isMobile ? "16" : "20"} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12ZM12 14C9.33 14 4 15.34 4 18V20H20V18C20 15.34 14.67 14 12 14Z" fill="#666666"/>
                              <path d="M18 10C19.1 10 20 9.1 20 8C20 6.9 19.1 6 18 6C16.9 6 16 6.9 16 8C16 9.1 16.9 10 18 10ZM18 12C16.34 12 13 12.68 13 14.33V16H23V14.33C23 12.68 19.66 12 18 12Z" fill="#666666"/>
                            </svg>
                          </div>
                        )}
                      </div>
                    </Tooltip>
                  )}
                  {/* Бейдж типа задачи (Личная/Рабочая) - отображается для всех задач */}
                  {task.workType && (
                    <Tooltip text={task.workType === 'work' ? 'Рабочая' : 'Личная'}>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
                        task.workType === 'work'
                          ? 'bg-emerald-950/55 text-emerald-100 ring-1 ring-emerald-700/40'
                          : 'bg-violet-950/45 text-violet-100 ring-1 ring-violet-700/35'
                      }`}>
                        {task.workType === 'work' ? 'Р' : 'Л'}
                      </span>
                    </Tooltip>
                  )}
                </div>
              )}
                {isFromTasksBlock && !isMatrixMode && !isChecked && (
                  <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-x-1.5 gap-y-1">
                  {(task.files && task.files.length > 0) || task.hasFiles ? (
                    <Tooltip text="Имеются файлы">
                      <div className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center sm:h-[24px] sm:w-[24px]">
                        <svg className="h-[18px] w-[14px] sm:h-5 sm:w-3.5" viewBox="0 0 14 26" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M9 0H5C3.6744 0.00156145 2.40353 0.528847 1.46619 1.46619C0.528847 2.40353 0.00156145 3.6744 0 5V25C0 25.2652 0.105357 25.5196 0.292893 25.7071C0.48043 25.8946 0.734784 26 1 26C1.26522 26 1.51957 25.8946 1.70711 25.7071C1.89464 25.5196 2 25.2652 2 25V5C2.00087 4.20462 2.31722 3.44206 2.87964 2.87964C3.44206 2.31722 4.20462 2.00087 5 2H9C9.79538 2.00087 10.5579 2.31722 11.1204 2.87964C11.6828 3.44206 11.9991 4.20462 12 5V21C12 21.7956 11.6839 22.5587 11.1213 23.1213C10.5587 23.6839 9.79565 24 9 24C8.20435 24 7.44129 23.6839 6.87868 23.1213C6.31607 22.5587 6 21.7956 6 21V8C6 7.73478 6.10536 7.48043 6.29289 7.29289C6.48043 7.10536 6.73478 7 7 7C7.26522 7 7.51957 7.10536 7.70711 7.29289C7.89464 7.48043 8 7.73478 8 8V20C8 20.2652 8.10536 20.5196 8.29289 20.7071C8.48043 20.8946 8.73478 21 9 21C9.26522 21 9.51957 20.8946 9.70711 20.7071C9.89464 20.5196 10 20.2652 10 20V8C10 7.20435 9.68393 6.44129 9.12132 5.87868C8.55871 5.31607 7.79565 5 7 5C6.20435 5 5.44129 5.31607 4.87868 5.87868C4.31607 6.44129 4 7.20435 4 8V21C4 22.3261 4.52678 23.5979 5.46447 24.5355C6.40215 25.4732 7.67392 26 9 26C10.3261 26 11.5979 25.4732 12.5355 24.5355C13.4732 23.5979 14 22.3261 14 21V5C13.9984 3.6744 13.4712 2.40353 12.5338 1.46619C11.5965 0.528847 10.3256 0.00156145 9 0Z" fill="#555454"/>
                        </svg>
                      </div>
                    </Tooltip>
                  ) : null}
                  {task.taskType === 'call' ? (
                    <Tooltip text="Звонок">
                      <div className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center sm:h-6 sm:w-6">
                        <svg className="h-[18px] w-[18px] sm:h-5 sm:w-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M20.01 15.38C18.78 15.38 17.59 15.18 16.45 14.82C16.3 14.75 16.13 14.72 15.96 14.72C15.75 14.72 15.54 14.78 15.35 14.88L12.8 16.53C10.07 15.24 8.76 13.93 7.47 11.2L9.12 8.65C9.32 8.46 9.47 8.22 9.54 7.96C9.62 7.7 9.61 7.42 9.52 7.17C9.16 6.03 8.96 4.84 8.96 3.62C8.96 3.13 8.56 2.73 8.07 2.73H4.28C3.79 2.73 3 2.73 3 3.62C3 13.61 10.39 21 20.38 21C21.27 21 21.27 20.21 21.27 19.72V15.93C21.27 15.44 20.87 15.04 20.38 15.04L20.01 15.38Z" fill="#666666"/>
                        </svg>
                      </div>
                    </Tooltip>
                  ) : null}
                  {task.taskType === 'meeting' ? (
                    <Tooltip text="Встреча">
                      <div className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center sm:h-6 sm:w-6">
                        <svg className="h-[18px] w-[18px] sm:h-5 sm:w-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12ZM12 14C9.33 14 4 15.34 4 18V20H20V18C20 15.34 14.67 14 12 14Z" fill="#666666"/>
                          <path d="M18 10C19.1 10 20 9.1 20 8C20 6.9 19.1 6 18 6C16.9 6 16 6.9 16 8C16 9.1 16.9 10 18 10ZM18 12C16.34 12 13 12.68 13 14.33V16H23V14.33C23 12.68 19.66 12 18 12Z" fill="#666666"/>
                        </svg>
                      </div>
                    </Tooltip>
                  ) : null}
                  {task.workType ? (
                    <Tooltip text={task.workType === 'work' ? 'Рабочая' : 'Личная'}>
                      <span
                        className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                          task.workType === 'work'
                            ? 'bg-emerald-950/55 text-emerald-100 ring-1 ring-emerald-700/40'
                            : 'bg-violet-950/45 text-violet-100 ring-1 ring-violet-700/35'
                        }`}
                      >
                        {task.workType === 'work' ? 'Р' : 'Л'}
                      </span>
                    </Tooltip>
                  ) : null}
                  {task.icons?.includes('redLightning') ? (
                    <Tooltip text="Срочно">
                      <div className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center sm:h-6 sm:w-6">
                        <svg className="h-[18px] w-[18px] sm:h-[22px] sm:w-[22px]" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M19.0723 11.1734C19.0231 11.0678 18.9172 11 18.8005 11H15.2455L18.754 5.46051C18.8125 5.36812 18.8161 5.25112 18.7633 5.15543C18.7105 5.05941 18.6097 5 18.5005 5H13.7005C13.5868 5 13.483 5.0642 13.432 5.1659L8.93202 14.1659C8.88551 14.2586 8.89061 14.369 8.94521 14.4575C9.00012 14.546 9.09642 14.6 9.20051 14.6H12.2854L8.9239 22.5836C8.8666 22.7201 8.91761 22.8785 9.04389 22.9559C9.09248 22.9856 9.14648 23 9.2002 23C9.28629 23 9.3712 22.9631 9.43001 22.8935L19.03 11.4935C19.1053 11.4041 19.1215 11.2793 19.0723 11.1734Z" fill="#FF070B"/>
                        </svg>
                      </div>
                    </Tooltip>
                  ) : null}
                  {task.icons?.includes('yellowBookmark') ? (
                    <Tooltip text="Важно">
                      <div className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center sm:h-6 sm:w-6">
                        <svg className="h-[18px] w-[18px] sm:h-[22px] sm:w-[22px]" viewBox="0 0 27 27" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <g clipPath={`url(#clip0_tasks_${taskIndex}_${task.id})`}>
                            <path d="M18.4582 5H8.59461C7.79129 5 7.08594 5.66085 7.08594 6.44309V21.0343C7.08594 21.2962 7.15881 21.5144 7.27627 21.683C7.41673 21.8846 7.64289 22.0001 7.88541 22C8.1147 22 8.35882 21.8979 8.58427 21.7054L12.9972 17.9585C13.1335 17.8421 13.3293 17.7754 13.5329 17.7754C13.7363 17.7754 13.9317 17.8421 14.0684 17.9589L18.4666 21.7048C18.6929 21.8979 18.9202 22.0001 19.149 22.0001C19.5361 22.0001 19.9134 21.7015 19.9134 21.0344V6.44309C19.9134 5.66085 19.2615 5 18.4582 5Z" fill="#F6B000"/>
                          </g>
                          <defs>
                            <clipPath id={`clip0_tasks_${taskIndex}_${task.id}`}>
                              <rect width="17" height="17" fill="white" transform="translate(5 5)" />
                            </clipPath>
                          </defs>
                        </svg>
                      </div>
                    </Tooltip>
                  ) : null}
                  {task.colorLabel ? (
                    <Tooltip text="Цветовая метка">
                      <div className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full bg-[var(--muted)] shadow-sm ring-1 ring-[var(--border)] sm:h-6 sm:w-6">
                        <svg className="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <circle cx="13" cy="13" r="8" fill={task.colorLabel} />
                        </svg>
                      </div>
                    </Tooltip>
                  ) : null}
                  </div>
                )}
              {/* ФИО лида - скрываем полностью на мобильных, аватарка убрана */}
              {task.user && task.user.name && (
                <div className="hidden md:flex shrink-0 items-center">
                    <span 
                      className="text-nowrap text-[var(--muted-foreground)]"
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontWeight: 500,
                        fontStyle: 'normal',
                        fontSize: '12px',
                        lineHeight: '20px',
                        letterSpacing: '0px',
                        leadingTrim: 'none'
                      } as React.CSSProperties & { leadingTrim?: string }}
                    >
                      {task.user.name}
                    </span>
                </div>
              )}
            </div>
            {showTaskMetaRow && taskMetaLine ? (
              <div
                className={`w-full min-w-0 ${isMatrixMode && !isListMatrix ? 'text-center' : ''}`}
              >
                <span
                  className={`text-xs font-medium text-[var(--muted-foreground)] ${task.dateTimeColor === 'red' && task.dateTime ? '!text-red-400' : ''}`}
                >
                  {taskMetaLine}
                </span>
              </div>
            ) : null}
            </div>
          </div>
          {/* В режиме grid и columns скрываем кнопки управления */}
          {viewMode !== 'grid' && viewMode !== 'columns' && (
            <div className="flex items-center hidden">
              <svg width="35" height="39" viewBox="0 0 35 39" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M24.7018 14.3229L26.1747 12.8499L24.7253 11.4001L23.1497 12.9758C21.7102 11.9557 20.0305 11.327 18.275 11.1513V9.05H20.325V7H14.175V9.05H16.225V11.1513C14.4695 11.327 12.7898 11.9557 11.3504 12.9758L9.77468 11.4001L8.32533 12.8499L9.79826 14.3229C8.42337 15.7786 7.50496 17.6051 7.15645 19.5769C6.80794 21.5487 7.0446 23.5793 7.83719 25.4182C8.62977 27.257 9.94359 28.8233 11.6164 29.9239C13.2892 31.0244 15.2477 31.6109 17.25 31.6109C19.2524 31.6109 21.2109 31.0244 22.8836 29.9239C24.5564 28.8233 25.8702 27.257 26.6628 25.4182C27.4554 23.5793 27.6921 21.5487 27.3436 19.5769C26.9951 17.6051 26.0766 15.7786 24.7018 14.3229ZM17.25 29.55C15.6282 29.55 14.0428 29.0691 12.6943 28.1681C11.3458 27.267 10.2948 25.9864 9.67419 24.488C9.05356 22.9897 8.89117 21.3409 9.20757 19.7503C9.52397 18.1596 10.3049 16.6985 11.4517 15.5517C12.5985 14.4049 14.0596 13.624 15.6503 13.3076C17.2409 12.9912 18.8897 13.1536 20.388 13.7742C21.8864 14.3948 23.167 15.4458 24.0681 16.7943C24.9691 18.1428 25.45 19.7282 25.45 21.35C25.4476 23.524 24.5829 25.6083 23.0456 27.1456C21.5083 28.6829 19.424 29.5476 17.25 29.55Z" fill="#169600"/>
                <path d="M17.2535 15.209V21.359H11.1035C11.1035 22.5753 11.4642 23.7644 12.14 24.7757C12.8157 25.7871 13.7762 26.5754 14.9 27.0408C16.0238 27.5063 17.2603 27.6281 18.4533 27.3908C19.6463 27.1535 20.7421 26.5678 21.6022 25.7077C22.4623 24.8476 23.0481 23.7518 23.2853 22.5588C23.5226 21.3658 23.4009 20.1292 22.9354 19.0055C22.4699 17.8817 21.6816 16.9212 20.6703 16.2454C19.6589 15.5697 18.4699 15.209 17.2535 15.209Z" fill="#169600"/>
              </svg>
              <button 
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onDelete) {
                    setIsDeleteModalOpen(true);
                  }
                }}
                className='flex items-center justify-center cursor-pointer'
              >
                <svg width="39" height="39" viewBox="0 0 39 39" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M26.791 14.291C26.5147 14.291 26.2498 14.4008 26.0544 14.5961C25.8591 14.7915 25.7493 15.0564 25.7493 15.3327V26.99C25.7195 27.5167 25.4827 28.0103 25.0905 28.3633C24.6983 28.7162 24.1826 28.8999 23.6556 28.8743H15.3431C14.8161 28.8999 14.3004 28.7162 13.9082 28.3633C13.516 28.0103 13.2792 27.5167 13.2493 26.99V15.3327C13.2493 15.0564 13.1396 14.7915 12.9443 14.5961C12.7489 14.4008 12.4839 14.291 12.2077 14.291C11.9314 14.291 11.6665 14.4008 11.4711 14.5961C11.2758 14.7915 11.166 15.0564 11.166 15.3327V26.99C11.1957 28.0694 11.652 29.093 12.435 29.8367C13.2179 30.5804 14.2636 30.9834 15.3431 30.9577H23.6556C24.7351 30.9834 25.7808 30.5804 26.5637 29.8367C27.3467 29.093 27.8029 28.0694 27.8327 26.99V15.3327C27.8327 15.0564 27.7229 14.7915 27.5276 14.5961C27.3322 14.4008 27.0673 14.291 26.791 14.291Z" fill="#169600"/>
                  <path d="M27.8333 11.166H23.6667V9.08268C23.6667 8.80642 23.5569 8.54146 23.3616 8.34611C23.1662 8.15076 22.9013 8.04102 22.625 8.04102H16.375C16.0987 8.04102 15.8338 8.15076 15.6384 8.34611C15.4431 8.54146 15.3333 8.80642 15.3333 9.08268V11.166H11.1667C10.8904 11.166 10.6254 11.2758 10.4301 11.4711C10.2347 11.6665 10.125 11.9314 10.125 12.2077C10.125 12.4839 10.2347 12.7489 10.4301 12.9443C10.6254 13.1396 10.8904 13.2493 11.1667 13.2493H27.8333C28.1096 13.2493 28.3746 13.1396 28.5699 12.9443C28.7653 12.7489 28.875 12.4839 28.875 12.2077C28.875 11.9314 28.7653 11.6665 28.5699 11.4711C28.3746 11.2758 28.1096 11.166 27.8333 11.166ZM17.4167 11.166V10.1243H21.5833V11.166H17.4167Z" fill="#169600"/>
                  <path d="M18.4583 24.7083V17.4167C18.4583 17.1404 18.3486 16.8754 18.1532 16.6801C17.9579 16.4847 17.6929 16.375 17.4167 16.375C17.1404 16.375 16.8754 16.4847 16.6801 16.6801C16.4847 16.8754 16.375 17.1404 16.375 17.4167V24.7083C16.375 24.9846 16.4847 25.2496 16.6801 25.4449C16.8754 25.6403 17.1404 25.75 17.4167 25.75C17.6929 25.75 17.9579 25.6403 18.1532 25.4449C18.3486 25.2496 18.4583 24.9846 18.4583 24.7083Z" fill="#169600"/>
                  <path d="M22.6243 24.7083V17.4167C22.6243 17.1404 22.5146 16.8754 22.3193 16.6801C22.1239 16.4847 21.8589 16.375 21.5827 16.375C21.3064 16.375 21.0415 16.4847 20.8461 16.6801C20.6508 16.8754 20.541 17.1404 20.541 17.4167V24.7083C20.541 24.9846 20.6508 25.2496 20.8461 25.4449C21.0415 25.6403 21.3064 25.75 21.5827 25.75C21.8589 25.75 22.1239 25.6403 22.3193 25.4449C22.5146 25.2496 22.6243 24.9846 22.6243 24.7083Z" fill="#169600"/>
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
      {isDeleteModalOpen && onDelete && typeof document !== 'undefined' && createPortal(
        <div 
          className="modal-fade-in fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] pt-4 md:pt-4 pb-0 md:pb-4 px-0 md:px-4 cursor-default" 
          onClick={(e) => {
            e.stopPropagation();
            setIsDeleteModalOpen(false);
          }}
        >
          <div 
            className="relative flex flex-col overflow-hidden rounded-[25px] border border-[var(--border)] bg-[var(--card)] shadow-2xl max-w-md w-full mx-4" 
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center border-b border-[var(--border)] px-12.5 py-4">
              <span className="text-lg font-normal text-[var(--primary)]">{t('crm.crm.taskCard.подтверждение_удален')}</span>
            </div>
            <div className="flex flex-1 flex-col items-center justify-center px-12.5 py-8">
              <div className="w-full max-w-md">
                <div className="mb-6 text-center">
                  <p className="text-lg text-[var(--foreground)]">
                    {t('crm.crm.taskCard.удалить_задачу')}<span className="font-normal">"{task.title}"</span>?
                  </p>
                </div>
                <div className="flex gap-4">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsDeleteModalOpen(false);
                      // Вызываем onDelete без ожидания - задача исчезнет сразу
                      if (onDelete) {
                        onDelete();
                      }
                    }}
                    className="flex-1 cursor-pointer rounded-full border-2 border-[var(--primary)] bg-transparent py-3 px-5 text-lg font-normal text-[var(--primary)]"
                  >
                    {t('crm.crm.taskCard.да')}</button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsDeleteModalOpen(false);
                    }}
                    className="flex-1 cursor-pointer rounded-full bg-[var(--primary)] py-3 px-5 text-lg font-normal text-[var(--primary-foreground)]"
                  >
                    {t('crm.crm.taskCard.нет')}</button>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default TaskCard;
export type { ModalTaskData };

