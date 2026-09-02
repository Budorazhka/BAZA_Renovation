import { useI18n } from '@/i18n';
import React, { useState, useMemo } from 'react';
import { TaskStatus, TaskPriority } from '../../services/api';
import type { Task } from '../../services/api';
import TaskCard, { type ModalTaskData } from './TaskCard';
import { parseDateFromAPI } from '../../utils/dateUtils';

interface TasksBlockProps {
  tasks: Task[];
  lastUpdateTime: Date;
  onUpdateTaskStatus: (taskId: string, status: TaskStatus) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onOpenNewTaskModal: () => void;
  onOpenTaskManagementModal: () => void;
  onTaskUpdate?: (updatedTask: Task) => void;
  onUpdateTaskEndDate?: (taskId: string, endDate: string | undefined) => Promise<void>;
  onOpenTaskView?: (taskId: string) => void;
}

const TasksBlock: React.FC<TasksBlockProps> = ({
  tasks,
  lastUpdateTime,
  onUpdateTaskStatus,
  onDeleteTask,
  onOpenNewTaskModal,
  onOpenTaskManagementModal,
  onTaskUpdate: _onTaskUpdate,
  onUpdateTaskEndDate: _onUpdateTaskEndDate,
  onOpenTaskView,
}) => {
  const { t } = useI18n();
  const [selectedTaskForInfo, setSelectedTaskForInfo] = useState<Task | null>(null);
  const [isTaskInfoModalOpen, setIsTaskInfoModalOpen] = useState(false);
  const [isTasksBlockCollapsed, setIsTasksBlockCollapsed] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);

  // Сортируем задачи по дате создания от новых к старым и берем первые 10
  const recentTasks = useMemo(() => {
    const sorted = [...tasks].sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateB - dateA; // Новые сверху
    });
    return sorted.slice(0, 10); // Берем первые 10 задач
  }, [tasks]);

  const handleCloseTaskInfo = () => {
    setSelectedTaskForInfo(null);
    setIsTaskInfoModalOpen(false);
  };

  const handleDeleteTask = (taskId: string) => {
    // Вызываем onDeleteTask без await - задача исчезнет сразу (оптимистичное обновление)
    onDeleteTask(taskId).catch((error) => {
      console.error('Failed to delete task:', error);
    });
    handleCloseTaskInfo();
  };

  const transformTaskToModalData = (task: Task): ModalTaskData => {
    const priorityToUrgencyImportance = (priority: TaskPriority) => {
      switch (priority) {
        case TaskPriority.URGENT_IMPORTANT:
          return { urgency: 'urgent' as const, importance: 'important' as const };
        case TaskPriority.NOT_URGENT_IMPORTANT:
          return { urgency: 'notUrgent' as const, importance: 'important' as const };
        case TaskPriority.URGENT_NOT_IMPORTANT:
          return { urgency: 'urgent' as const, importance: 'notImportant' as const };
        case TaskPriority.NOT_URGENT_NOT_IMPORTANT:
          return { urgency: 'notUrgent' as const, importance: 'notImportant' as const };
        default:
          return { urgency: 'notUrgent' as const, importance: 'notImportant' as const };
      }
    };

    const { urgency, importance } = priorityToUrgencyImportance(task.priority);
    const icons: Array<'redLightning' | 'yellowBookmark'> = [];
    if (urgency === 'urgent') icons.push('redLightning');
    if (importance === 'important') icons.push('yellowBookmark');

    // Получаем имя клиента из clientName или из leadId
    let clientName: string | undefined = task.clientName;
    let phone: string | undefined = undefined;
    if (!clientName && task.leadId && typeof task.leadId === 'object' && task.leadId.name) {
      clientName = task.leadId.name;
      phone = task.leadId.phone;
    } else if (task.leadId && typeof task.leadId === 'object' && task.leadId.phone) {
      phone = task.leadId.phone;
    }

    // Получаем назначенных пользователей
    let assignedUsers: Array<{ name: string; image?: string }> | undefined = undefined;
    if (task.assignedTo) {
      if (typeof task.assignedTo === 'object' && task.assignedTo !== null) {
        const assignedToObj = task.assignedTo as any;
        assignedUsers = [{
          name: assignedToObj.name || '',
          image: assignedToObj.image || assignedToObj.avatar || undefined
        }];
      }
    }

    // Определяем тип задачи и категорию (личная/рабочая) по массиву categories
    let taskType: 'standard' | 'call' | 'meeting' = 'standard';
    let workType: 'work' | 'personal' | undefined = undefined;
    
    // Проверяем новый формат категорий (массив categories)
    if (task.categories && Array.isArray(task.categories)) {
      const hasCall = task.categories.some(cat => 
        cat.toLowerCase().includes('звонок') || cat.toLowerCase().includes('call')
      );
      const hasMeeting = task.categories.some(cat => 
        cat.toLowerCase().includes('встреча') || cat.toLowerCase().includes('meeting')
      );
      const hasWork = task.categories.some(cat => cat.includes('Рабочие задачи'));
      const hasPersonal = task.categories.some(cat => cat.includes('Личные задачи'));
      
      if (hasCall) {
        taskType = 'call';
      } else if (hasMeeting) {
        taskType = 'meeting';
      }
      
      if (hasWork) {
        workType = 'work';
      } else if (hasPersonal) {
        workType = 'personal';
      }
    }

    return {
      id: task._id,
      title: task.title,
      dateTime: task.endDate ? (() => {
        const parsed = parseDateFromAPI(task.endDate);
        return parsed ? parsed.toLocaleDateString('ru-RU') : t('additionalBlocks.tasks.noDeadline');
      })() : t('additionalBlocks.tasks.noDeadline'),
      dateTimeColor: 'gray',
      startDate: task.startDate,
      endDate: task.endDate,
      progress: {
        current: task.subtasks?.filter(s => s.completed).length || 0,
        total: task.subtasks?.length || 0,
        completed: task.status === TaskStatus.COMPLETED
      },
      icons,
      colorLabel: task.colorLabel,
      user: clientName ? { name: clientName, image: '' } : undefined,
      urgency,
      importance,
      taskType,
      workType,
      phone,
      assignedUsers,
      files: task.files?.map(file => ({
        filename: file.filename,
        originalName: file.originalName,
        mimeType: file.mimeType,
        size: file.size,
        url: file.url
      })),
      hasFiles: task.hasFiles || (task.files && task.files.length > 0) || false,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  };

  return (
    <>
      {isTasksBlockCollapsed && (
        <button
          type="button"
          onClick={() => setIsTasksBlockCollapsed(false)}
          className="flex w-full cursor-pointer items-center justify-between rounded-[6px] border border-[var(--border)] bg-[var(--card)] p-5"
        >
          <div className="flex items-center gap-2">
            <svg className="shrink-0 text-[var(--corporate-green)]" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M15.7686 1.539H13.8673V0.78125C13.8673 0.349731 13.5176 0 13.0861 0H6.94C6.50848 0 6.15875 0.349731 6.15875 0.78125V1.539H4.25781C3.18085 1.539 2.30469 2.41516 2.30469 3.49213V18.0469C2.30469 19.1238 3.18085 20 4.25781 20H15.7686C16.8456 20 17.7217 19.1238 17.7217 18.0469V3.49213C17.7217 2.41516 16.8454 1.539 15.7686 1.539ZM12.3048 1.5625V3.07816H7.7211C7.7211 2.5589 7.7211 2.12997 7.7211 1.5625H12.3048ZM16.1592 18.0469C16.1592 18.2623 15.9839 18.4375 15.7686 18.4375H4.25781C4.04236 18.4375 3.86719 18.2623 3.86719 18.0469V3.49213C3.86719 3.27682 4.04236 3.1015 4.25781 3.1015H6.1586V3.85941C6.1586 4.29092 6.50848 4.64066 6.93985 4.64066H13.0861C13.5175 4.64066 13.8673 4.29092 13.8673 3.85941V3.1015H15.7686C15.9839 3.1015 16.1592 3.27682 16.1592 3.49213V18.0469ZM13.6383 9.12186C13.9435 9.42703 13.9435 9.92172 13.6383 10.2267L9.53278 14.3323C9.22775 14.6375 8.73306 14.6375 8.42789 14.3323L6.38763 12.292C6.08261 11.987 6.08261 11.4923 6.38763 11.1871C6.69281 10.8821 7.18735 10.8821 7.49252 11.1871L8.98041 12.675L12.5334 9.12201C12.8386 8.81683 13.3331 8.81683 13.6383 9.12186Z" fill="currentColor"/>
            </svg>
            <span className="text-[var(--foreground)]">{t('additionalBlocks.tasks.tasksLabel')}</span>
          </div>
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="rotate-180 text-[var(--corporate-green)] transition-transform duration-300 ease-in-out"
          >
            <path d="M12.0007 10.8273L7.05072 15.7773L5.63672 14.3633L12.0007 7.99935L18.3647 14.3633L16.9507 15.7773L12.0007 10.8273Z" fill="currentColor"/>
          </svg>
        </button>
      )}
      <div className={`flex h-81 flex-col gap-y-5 overflow-hidden rounded-[6px] border border-[var(--border)] bg-[var(--card)] p-5 pb-5 md:min-w-120 flex-1 ${isTasksBlockCollapsed ? 'hidden md:flex' : 'flex'}`}>
        <button
          type="button"
          onClick={() => setIsTasksBlockCollapsed(!isTasksBlockCollapsed)}
          className="w-full md:hidden flex items-center justify-between cursor-pointer"
        >
          <div className="flex items-center gap-2">
            {/* Убираем возможность открыть управление задачами на мобильных - просто показываем иконку и текст */}
            <div className="flex items-center gap-2">
              <svg className="shrink-0 text-[var(--corporate-green)]" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M15.7686 1.539H13.8673V0.78125C13.8673 0.349731 13.5176 0 13.0861 0H6.94C6.50848 0 6.15875 0.349731 6.15875 0.78125V1.539H4.25781C3.18085 1.539 2.30469 2.41516 2.30469 3.49213V18.0469C2.30469 19.1238 3.18085 20 4.25781 20H15.7686C16.8456 20 17.7217 19.1238 17.7217 18.0469V3.49213C17.7217 2.41516 16.8454 1.539 15.7686 1.539ZM12.3048 1.5625V3.07816H7.7211C7.7211 2.5589 7.7211 2.12997 7.7211 1.5625H12.3048ZM16.1592 18.0469C16.1592 18.2623 15.9839 18.4375 15.7686 18.4375H4.25781C4.04236 18.4375 3.86719 18.2623 3.86719 18.0469V3.49213C3.86719 3.27682 4.04236 3.1015 4.25781 3.1015H6.1586V3.85941C6.1586 4.29092 6.50848 4.64066 6.93985 4.64066H13.0861C13.5175 4.64066 13.8673 4.29092 13.8673 3.85941V3.1015H15.7686C15.9839 3.1015 16.1592 3.27682 16.1592 3.49213V18.0469ZM13.6383 9.12186C13.9435 9.42703 13.9435 9.92172 13.6383 10.2267L9.53278 14.3323C9.22775 14.6375 8.73306 14.6375 8.42789 14.3323L6.38763 12.292C6.08261 11.987 6.08261 11.4923 6.38763 11.1871C6.69281 10.8821 7.18735 10.8821 7.49252 11.1871L8.98041 12.675L12.5334 9.12201C12.8386 8.81683 13.3331 8.81683 13.6383 9.12186Z" fill="currentColor"/>
              </svg>
              <span className="text-[var(--foreground)]">{t('additionalBlocks.tasks.tasksLabel')}</span>
            </div>
            <span
              className="cursor-pointer ml-2 text-dream-primary"
              onClick={(e) => {
                e.stopPropagation();
                onOpenNewTaskModal();
              }}
            >{t('additionalBlocks.tasks.newTask')}</span>
          </div>
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={`text-[var(--corporate-green)] transition-transform duration-300 ease-in-out ${isTasksBlockCollapsed ? 'rotate-180' : ''}`}
          >
            <path d="M12.0007 10.8273L7.05072 15.7773L5.63672 14.3633L12.0007 7.99935L18.3647 14.3633L16.9507 15.7773L12.0007 10.8273Z" fill="currentColor"/>
          </svg>
        </button>
        <div className="hidden md:flex w-full items-center justify-between h-11">
          <div className="flex items-center gap-3">
            <button 
              className="flex items-center gap-2 cursor-pointer hover:text-dream-primary transition-all duration-200 ease-in-out hover:scale-105 active:scale-95"
              onClick={onOpenTaskManagementModal}
            >
              <svg className="shrink-0 text-[var(--corporate-green)]" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M15.7686 1.539H13.8673V0.78125C13.8673 0.349731 13.5176 0 13.0861 0H6.94C6.50848 0 6.15875 0.349731 6.15875 0.78125V1.539H4.25781C3.18085 1.539 2.30469 2.41516 2.30469 3.49213V18.0469C2.30469 19.1238 3.18085 20 4.25781 20H15.7686C16.8456 20 17.7217 19.1238 17.7217 18.0469V3.49213C17.7217 2.41516 16.8454 1.539 15.7686 1.539ZM12.3048 1.5625V3.07816H7.7211C7.7211 2.5589 7.7211 2.12997 7.7211 1.5625H12.3048ZM16.1592 18.0469C16.1592 18.2623 15.9839 18.4375 15.7686 18.4375H4.25781C4.04236 18.4375 3.86719 18.2623 3.86719 18.0469V3.49213C3.86719 3.27682 4.04236 3.1015 4.25781 3.1015H6.1586V3.85941C6.1586 4.29092 6.50848 4.64066 6.93985 4.64066H13.0861C13.5175 4.64066 13.8673 4.29092 13.8673 3.85941V3.1015H15.7686C15.9839 3.1015 16.1592 3.27682 16.1592 3.49213V18.0469ZM13.6383 9.12186C13.9435 9.42703 13.9435 9.92172 13.6383 10.2267L9.53278 14.3323C9.22775 14.6375 8.73306 14.6375 8.42789 14.3323L6.38763 12.292C6.08261 11.987 6.08261 11.4923 6.38763 11.1871C6.69281 10.8821 7.18735 10.8821 7.49252 11.1871L8.98041 12.675L12.5334 9.12201C12.8386 8.81683 13.3331 8.81683 13.6383 9.12186Z" fill="currentColor"/>
              </svg>
              <span 
                className="text-[var(--foreground)]"
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 400,
                  fontStyle: 'normal',
                  fontSize: '18px',
                  lineHeight: '100%',
                  letterSpacing: '0px',
                  leadingTrim: 'none'
                } as React.CSSProperties & { leadingTrim?: string }}
              >
                {t('crm.crm.tasksBlock.задачи')}</span>
            </button>
            {/* Иконка файлов (скрепка) */}
            
          </div>
          <button
            className="cursor-pointer"
            onClick={onOpenNewTaskModal}
          >
            <span 
              className="text-dream-primary"
              style={{
                fontFamily: 'var(--font-sans)',
                fontWeight: 400,
                fontStyle: 'normal',
                fontSize: '16px',
                lineHeight: '100%',
                letterSpacing: '0px',
                leadingTrim: 'none'
              } as React.CSSProperties & { leadingTrim?: string }}
            >{t('additionalBlocks.tasks.newTask')}</span>
          </button>
        </div>
        <div className={`${isTasksBlockCollapsed ? 'hidden md:block' : 'block'}`}>
          <div className="flex items-center justify-between text-xs text-gray-500 mb-2 hidden">
            <span>
              {t('additionalBlocks.tasks.lastUpdate', { time: lastUpdateTime.toLocaleTimeString('ru-RU') })}
            </span>
            <div className="flex items-center gap-1 text-green-600">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-xs">Live</span>
            </div>
          </div>
          <div>
            <div className="flex flex-col gap-2 h-59 overflow-y-auto">
            {recentTasks.map((task, index) => {
              const modalTaskData = transformTaskToModalData(task);
              return (
                <div key={task._id}>
                  <TaskCard
                    task={modalTaskData}
                    index={index}
                    isChecked={task.status === TaskStatus.COMPLETED}
                    onCheckboxChange={(checked) => {
                      onUpdateTaskStatus(
                        task._id,
                        checked ? TaskStatus.COMPLETED : TaskStatus.IN_PROGRESS
                      );
                    }}
                    onShowInfo={() => {
                      if (onOpenTaskView) {
                        onOpenTaskView(task._id);
                      }
                    }}
                    onDelete={() => handleDeleteTask(task._id)}
                    addLeftMargin={true}
                    isFromTasksBlock={true}
                  />
                </div>
              );
            })}

            {tasks.length === 0 && (
              <div className="py-8 text-center text-base text-[rgba(255,255,255,0.72)]">
                <p>{t('additionalBlocks.tasks.noTasks')}</p>
                <p className="mt-1">{t('additionalBlocks.tasks.loadingData')}</p>
              </div>
            )}
          </div>
        </div>
        </div>
      </div>

      {}
      {isTaskInfoModalOpen && selectedTaskForInfo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-[var(--card)] rounded-[6px] p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto border border-[var(--border)]">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-[18px] font-normal text-[var(--foreground)]">{t('additionalBlocks.tasks.taskInfo')}</h3>
              <button
                onClick={handleCloseTaskInfo}
                className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="text-base font-normal text-[rgba(255,255,255,0.72)]">{t('additionalBlocks.tasks.titleLabel')}</h4>
                <p className="text-[var(--muted-foreground)]">{selectedTaskForInfo.title}</p>
              </div>

              {selectedTaskForInfo.description && (
                <div>
                  <h4 className="text-base font-normal text-[rgba(255,255,255,0.72)]">{t('additionalBlocks.tasks.descriptionLabel')}</h4>
                  <p className="text-[var(--muted-foreground)]">{selectedTaskForInfo.description}</p>
                </div>
              )}

              <div>
                <h4 className="text-base font-normal text-[rgba(255,255,255,0.72)]">{t('additionalBlocks.tasks.statusLabel')}</h4>
                <p className="text-[var(--muted-foreground)]">
                  {selectedTaskForInfo.status === TaskStatus.COMPLETED ? t('additionalBlocks.tasks.statusCompleted') :
                   selectedTaskForInfo.status === TaskStatus.IN_PROGRESS ? t('additionalBlocks.tasks.statusInProgress') :
                   selectedTaskForInfo.status === TaskStatus.PENDING ? t('additionalBlocks.tasks.statusPending') : t('additionalBlocks.tasks.statusCancelled')}
                </p>
              </div>

              <div>
                <h4 className="text-base font-normal text-[rgba(255,255,255,0.72)]">{t('additionalBlocks.tasks.priorityLabel')}</h4>
                <p className="text-[var(--muted-foreground)]">
                  {selectedTaskForInfo.priority === TaskPriority.URGENT_IMPORTANT ? t('additionalBlocks.tasks.priorityUrgentImportant') :
                   selectedTaskForInfo.priority === TaskPriority.NOT_URGENT_IMPORTANT ? t('additionalBlocks.tasks.priorityNotUrgentImportant') :
                   selectedTaskForInfo.priority === TaskPriority.URGENT_NOT_IMPORTANT ? t('additionalBlocks.tasks.priorityUrgentNotImportant') : t('additionalBlocks.tasks.priorityNotUrgentNotImportant')}
                </p>
              </div>

              {selectedTaskForInfo.endDate && (
                <div>
                  <h4 className="text-base font-normal text-[rgba(255,255,255,0.72)]">{t('additionalBlocks.tasks.deadlineLabel')}</h4>
                  <p className="text-[var(--muted-foreground)]">
                    {(() => {
                      const parsed = parseDateFromAPI(selectedTaskForInfo.endDate);
                      return parsed ? parsed.toLocaleDateString('ru-RU') : '';
                    })()}
                  </p>
                </div>
              )}

              {selectedTaskForInfo.subtasks && selectedTaskForInfo.subtasks.length > 0 && (
                <div>
                  <h4 className="text-base font-normal text-[rgba(255,255,255,0.72)]">{t('additionalBlocks.tasks.subtasksLabel')}</h4>
                  <ul className="space-y-1">
                    {selectedTaskForInfo.subtasks.map((subtask, index) => (
                      <li key={index} className="flex items-center gap-2">
                        <div className={`flex h-4 w-4 items-center justify-center rounded border-2 ${
                          subtask.completed ? 'border-dream-primary bg-dream-primary' : 'border-[var(--border)]'
                        }`}>
                          {subtask.completed && (
                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <span className={subtask.completed ? 'text-[var(--muted-foreground)] line-through' : 'text-[var(--foreground)]'}>
                          {subtask.title}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => handleDeleteTask(selectedTaskForInfo._id)}
                className="bg-red-500 text-white py-2 px-4 rounded-[4px] hover:bg-red-600 transition-all duration-200 ease-in-out hover:scale-105 active:scale-95"
              >{t('additionalBlocks.tasks.deleteTask')}</button>
              <button
                onClick={handleCloseTaskInfo}
                className="flex-1 rounded-[4px] border border-[var(--border)] bg-[var(--muted)] py-2 px-4 text-[var(--foreground)] transition-all duration-200 ease-in-out hover:bg-[var(--secondary)] hover:scale-105 active:scale-95"
              >{t('additionalBlocks.tasks.close')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default TasksBlock;
