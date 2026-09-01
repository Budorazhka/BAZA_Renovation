import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { TaskStatus, TaskPriority } from '../../../services/api';
import type { Task } from '../../../services/api';
import TaskCard, { type ModalTaskData } from '../TaskCard';
import TaskViewModal from '../TaskViewModal';
import { useDisableScroll } from '../../../hooks/useDisableScroll';
import { useI18n } from '@/i18n';

interface TasksGridModalProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: Task[];
  onUpdateTaskStatus: (taskId: string, status: TaskStatus) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onTaskUpdate?: (updatedTask: Task) => void;
  onUpdateTaskEndDate?: (taskId: string, endDate: string | undefined) => Promise<void>;
  title?: string;
  initialViewMode?: 'grid' | 'columns' | 'list';
  forceViewMode?: 'grid' | 'columns' | 'list';
}

const TasksGridModal: React.FC<TasksGridModalProps> = ({
  isOpen,
  onClose,
  tasks,
  onUpdateTaskStatus,
  onDeleteTask,
  onTaskUpdate,
  onUpdateTaskEndDate,
  title,
  initialViewMode = 'list',
  forceViewMode,
}) => {
  const { t } = useI18n();
  const [selectedTaskForView, setSelectedTaskForView] = useState<string | null>(null);
  const [isTaskViewModalOpen, setIsTaskViewModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'columns' | 'list'>(initialViewMode);
  
  // Обновляем viewMode при изменении initialViewMode или forceViewMode
  useEffect(() => {
    if (forceViewMode) {
      setViewMode(forceViewMode);
    } else if (initialViewMode) {
      setViewMode(initialViewMode);
    }
  }, [forceViewMode, initialViewMode]);
  
  // Состояние для хранения порядка задач (для drag and drop)
  const [workTasksOrder, setWorkTasksOrder] = useState<string[]>([]);
  const [personalTasksOrder, setPersonalTasksOrder] = useState<string[]>([]);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [draggedTaskCategory, setDraggedTaskCategory] = useState<'work' | 'personal' | null>(null);
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<'above' | 'below' | null>(null);

  useDisableScroll(isOpen);

  const [currentTaskForModal, setCurrentTaskForModal] = useState<Task | undefined>(undefined);

  useEffect(() => {
    if (!selectedTaskForView || !isTaskViewModalOpen) {
      setCurrentTaskForModal(undefined);
      return;
    }
    const task = tasks.find(t => t._id === selectedTaskForView);
    setCurrentTaskForModal(task);
  }, [selectedTaskForView, isTaskViewModalOpen, tasks]);

  const handleOpenTaskView = (taskId: string) => {
    setSelectedTaskForView(taskId);
    setIsTaskViewModalOpen(true);
  };

  const handleCloseTaskView = () => {
    setSelectedTaskForView(null);
    setIsTaskViewModalOpen(false);
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

    let clientName: string | undefined = task.clientName;
    let phone: string | undefined = undefined;
    if (!clientName && task.leadId && typeof task.leadId === 'object' && task.leadId.name) {
      clientName = task.leadId.name;
      phone = task.leadId.phone;
    } else if (task.leadId && typeof task.leadId === 'object' && task.leadId.phone) {
      phone = task.leadId.phone;
    }

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

    let taskType: 'standard' | 'call' | 'meeting' = 'standard';
    let workType: 'work' | 'personal' | undefined = undefined;
    
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
      } else {
        // Если категория не определена, считаем личной
        workType = 'personal';
      }
    } else {
      // Если категорий нет, считаем личной
      workType = 'personal';
    }

    return {
      id: task._id,
      title: task.title,
      dateTime: task.endDate ? new Date(task.endDate).toLocaleDateString('ru-RU') : t('leadCard.noDeadline'),
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

  // Группируем задачи по категориям (Рабочие/Личные) и сортируем от новых к старым
  const workTasksRaw = useMemo(() => {
    return tasks.filter(task => {
      if (task.categories && Array.isArray(task.categories)) {
        return task.categories.some(cat => cat.includes('Рабочие задачи'));
      }
      return false;
    }).sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateB - dateA; // Новые сверху
    });
  }, [tasks]);

  const personalTasksRaw = useMemo(() => {
    return tasks.filter(task => {
      if (task.categories && Array.isArray(task.categories)) {
        const hasWork = task.categories.some(cat => cat.includes('Рабочие задачи'));
        const hasPersonal = task.categories.some(cat => cat.includes('Личные задачи'));
        // Если есть категория "Личные задачи", или нет категории "Рабочие задачи"
        return hasPersonal || !hasWork;
      }
      // Если категории нет, считаем личной
      return true;
    }).sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateB - dateA; // Новые сверху
    });
  }, [tasks]);

  // Используем ref для отслеживания предыдущих ID задач
  const prevWorkIdsRef = useRef<string[]>([]);
  const prevPersonalIdsRef = useRef<string[]>([]);

  // Инициализируем порядок задач при первой загрузке или при изменении списка задач
  useEffect(() => {
    const workIds = workTasksRaw.map(t => t._id);
    const personalIds = personalTasksRaw.map(t => t._id);
    
    // Обновляем порядок только если он пустой или если появились новые задачи
    if (workTasksOrder.length === 0) {
      setWorkTasksOrder(workIds);
      prevWorkIdsRef.current = workIds;
    } else {
      // Добавляем новые задачи в начало списка
      const newWorkIds = workIds.filter(id => !prevWorkIdsRef.current.includes(id));
      const removedWorkIds = prevWorkIdsRef.current.filter(id => !workIds.includes(id));
      
      if (newWorkIds.length > 0 || removedWorkIds.length > 0) {
        setWorkTasksOrder(prev => {
          const filtered = prev.filter(id => workIds.includes(id));
          return [...newWorkIds, ...filtered];
        });
        prevWorkIdsRef.current = workIds;
      }
    }

    if (personalTasksOrder.length === 0) {
      setPersonalTasksOrder(personalIds);
      prevPersonalIdsRef.current = personalIds;
    } else {
      const newPersonalIds = personalIds.filter(id => !prevPersonalIdsRef.current.includes(id));
      const removedPersonalIds = prevPersonalIdsRef.current.filter(id => !personalIds.includes(id));
      
      if (newPersonalIds.length > 0 || removedPersonalIds.length > 0) {
        setPersonalTasksOrder(prev => {
          const filtered = prev.filter(id => personalIds.includes(id));
          return [...newPersonalIds, ...filtered];
        });
        prevPersonalIdsRef.current = personalIds;
      }
    }
  }, [workTasksRaw, personalTasksRaw, workTasksOrder.length, personalTasksOrder.length]);

  // Сортируем задачи согласно сохраненному порядку
  const workTasks = useMemo(() => {
    const taskMap = new Map(workTasksRaw.map(t => [t._id, t]));
    return workTasksOrder
      .map(id => taskMap.get(id))
      .filter((task): task is Task => task !== undefined);
  }, [workTasksRaw, workTasksOrder]);

  const personalTasks = useMemo(() => {
    const taskMap = new Map(personalTasksRaw.map(t => [t._id, t]));
    return personalTasksOrder
      .map(id => taskMap.get(id))
      .filter((task): task is Task => task !== undefined);
  }, [personalTasksRaw, personalTasksOrder]);

  // Обработчики для drag and drop
  const handleDragStart = (e: React.DragEvent, taskId: string, category: 'work' | 'personal') => {
    setDraggedTaskId(taskId);
    setDraggedTaskCategory(category);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', taskId);
  };

  const handleDragOver = (e: React.DragEvent, targetTaskId: string, category: 'work' | 'personal') => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    
    if (!draggedTaskId || !draggedTaskCategory || draggedTaskId === targetTaskId) {
      return;
    }
    
    // Для режимов list и grid разрешаем перетаскивание между всеми задачами
    // Для режима columns разрешаем только в пределах одной категории
    if (viewMode === 'columns' && draggedTaskCategory !== category) {
      return;
    }
    
    // Определяем позицию относительно целевого элемента
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const mouseY = e.clientY;
    const elementCenterY = rect.top + rect.height / 2;
    
    const position = mouseY < elementCenterY ? 'above' : 'below';
    setDragOverTaskId(targetTaskId);
    setDragOverPosition(position);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Проверяем, что мы действительно покидаем элемент (не переходим к дочернему)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    
    // Если курсор все еще в пределах элемента, не сбрасываем состояние
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      return;
    }
    
    setDragOverTaskId(null);
    setDragOverPosition(null);
  };

  const handleDrop = (e: React.DragEvent, targetTaskId: string, category: 'work' | 'personal') => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!draggedTaskId || !draggedTaskCategory) {
      setDragOverTaskId(null);
      setDragOverPosition(null);
      return;
    }
    
    // Для режимов list и grid используем единый порядок
    if (viewMode === 'list' || viewMode === 'grid') {
      const draggedIndex = allTasksOrder.indexOf(draggedTaskId);
      const targetIndex = allTasksOrder.indexOf(targetTaskId);
      
      if (draggedIndex === -1 || targetIndex === -1 || draggedIndex === targetIndex) {
        setDraggedTaskId(null);
        setDraggedTaskCategory(null);
        setDragOverTaskId(null);
        setDragOverPosition(null);
        return;
      }
      
      // Используем сохраненную позицию из dragOverPosition, если она есть, иначе определяем по координатам
      let position = dragOverPosition;
      if (!position) {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const mouseY = e.clientY;
        const elementCenterY = rect.top + rect.height / 2;
        position = mouseY < elementCenterY ? 'above' : 'below';
      }
      
      const newOrder = [...allTasksOrder];
      
      // Определяем позицию вставки до удаления элемента
      let insertIndex: number;
      if (position === 'above') {
        insertIndex = targetIndex;
      } else {
        insertIndex = targetIndex + 1;
      }
      
      // Удаляем элемент из текущей позиции
      newOrder.splice(draggedIndex, 1);
      
      // Корректируем индекс вставки, если элемент был удален до целевой позиции
      if (draggedIndex < insertIndex) {
        insertIndex -= 1;
      }
      
      // Вставляем элемент в новую позицию
      newOrder.splice(insertIndex, 0, draggedTaskId);
      
      
      // Помечаем, что пользователь изменил порядок
      hasUserOrderRef.current = true;
      
      // Принудительно обновляем состояние
      setAllTasksOrder([...newOrder]);
    } else {
      // Для режима columns используем отдельные порядки для каждой категории
      if (draggedTaskCategory === category) {
        const order = category === 'work' ? workTasksOrder : personalTasksOrder;
        const draggedIndex = order.indexOf(draggedTaskId);
        const targetIndex = order.indexOf(targetTaskId);
        
        if (draggedIndex === -1 || targetIndex === -1 || draggedIndex === targetIndex) {
          setDraggedTaskId(null);
          setDraggedTaskCategory(null);
          setDragOverTaskId(null);
          setDragOverPosition(null);
          return;
        }
        
        // Используем сохраненную позицию из dragOverPosition, если она есть, иначе определяем по координатам
        let position = dragOverPosition;
        if (!position) {
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const mouseY = e.clientY;
          const elementCenterY = rect.top + rect.height / 2;
          position = mouseY < elementCenterY ? 'above' : 'below';
        }
        
        const newOrder = [...order];
        
        // Определяем позицию вставки до удаления элемента
        let insertIndex: number;
        if (position === 'above') {
          insertIndex = targetIndex;
        } else {
          insertIndex = targetIndex + 1;
        }
        
        // Удаляем элемент из текущей позиции
        newOrder.splice(draggedIndex, 1);
        
        // Корректируем индекс вставки, если элемент был удален до целевой позиции
        if (draggedIndex < insertIndex) {
          insertIndex -= 1;
        }
        
        // Вставляем элемент в новую позицию
        newOrder.splice(insertIndex, 0, draggedTaskId);
        
        // Принудительно обновляем состояние
        if (category === 'work') {
          setWorkTasksOrder([...newOrder]);
        } else {
          setPersonalTasksOrder([...newOrder]);
        }
      }
    }
    
    setDraggedTaskId(null);
    setDraggedTaskCategory(null);
    setDragOverTaskId(null);
    setDragOverPosition(null);
  };

  const handleDragEnd = () => {
    setDraggedTaskId(null);
    setDraggedTaskCategory(null);
    setDragOverTaskId(null);
    setDragOverPosition(null);
  };

  // Функция рендеринга задачи с drag-and-drop
  const renderTaskWithDragDrop = (
    task: Task,
    index: number,
    category: 'work' | 'personal',
    showTimeline: boolean = false
  ) => {
    const modalTaskData = transformTaskToModalData(task);
    // В режимах list/grid не проверяем категорию для isDragging и isDragOver
    const isDragging = draggedTaskId === task._id && (viewMode === 'list' || viewMode === 'grid' ? true : draggedTaskCategory === category);
    const isDragOver = dragOverTaskId === task._id && (viewMode === 'list' || viewMode === 'grid' ? true : draggedTaskCategory === category);
    const showDropIndicatorAbove = isDragOver && dragOverPosition === 'above';
    const showDropIndicatorBelow = isDragOver && dragOverPosition === 'below';
    
    const taskWrapper = (
      <React.Fragment key={`${task._id}-${index}`}>
        {showDropIndicatorAbove && (
          <div key={`indicator-above-${task._id}`} className="h-1 bg-dream-primary rounded-full mx-4 my-1" />
        )}
        <div
          key={`task-${task._id}`}
          className={`transition-all ${isDragging ? 'opacity-50' : 'opacity-100'} ${isDragOver ? 'scale-[1.02]' : ''} ${showTimeline ? 'relative pl-10' : ''}`}
          draggable
          onDragStart={(e) => {
            e.stopPropagation();
            handleDragStart(e, task._id, category);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleDragOver(e, task._id, category);
          }}
          onDragLeave={(e) => {
            e.stopPropagation();
            handleDragLeave(e);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleDrop(e, task._id, category);
          }}
          onDragEnd={(e) => {
            e.stopPropagation();
            handleDragEnd();
          }}
          style={{ cursor: 'grab' }}
        >
          {showTimeline && (
            <>
              <div className="absolute bottom-0 left-5 top-0 w-px bg-[var(--border)]" aria-hidden />
              <div className="absolute left-[14px] top-4 h-2.5 w-2.5 rounded-full border-2 border-[var(--card)] bg-[var(--primary)] shadow-sm" aria-hidden />
            </>
          )}
          <div 
            className={showTimeline ? "flex-1 min-w-0" : ""}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleDragOver(e, task._id, category);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleDrop(e, task._id, category);
            }}
          >
            <TaskCard
              task={modalTaskData}
              index={index}
              isChecked={task.status === TaskStatus.COMPLETED}
              viewMode={viewMode}
              isFromTaskManagement
              onCheckboxChange={(checked) => {
                onUpdateTaskStatus(
                  task._id,
                  checked ? TaskStatus.COMPLETED : TaskStatus.IN_PROGRESS
                );
              }}
              onShowInfo={() => handleOpenTaskView(task._id)}
              onDelete={() => onDeleteTask(task._id)}
            />
          </div>
        </div>
        {showDropIndicatorBelow && (
          <div key={`indicator-below-${task._id}`} className="h-1 bg-dream-primary rounded-full mx-4 my-1" />
        )}
      </React.Fragment>
    );
    
    return taskWrapper;
  };

  // Состояние для единого порядка задач в режимах list и grid
  const [allTasksOrder, setAllTasksOrder] = useState<string[]>([]);

  // Объединенные задачи для режимов list и grid
  const allTasks = useMemo(() => {
    return [...workTasksRaw, ...personalTasksRaw];
  }, [workTasksRaw, personalTasksRaw]);

  // Используем ref для отслеживания предыдущих ID задач в режимах list/grid
  const prevAllIdsRef = useRef<string[]>([]);
  const hasUserOrderRef = useRef<boolean>(false);

  // Инициализируем единый порядок для режимов list и grid
  useEffect(() => {
    if (viewMode === 'list' || viewMode === 'grid') {
      const allIds = allTasks.map(t => t._id);
      
      // Если порядок пустой, инициализируем
      if (allTasksOrder.length === 0) {
        setAllTasksOrder(allIds);
        prevAllIdsRef.current = allIds;
        hasUserOrderRef.current = false;
      } else if (!hasUserOrderRef.current) {
        // Добавляем новые задачи в начало списка только если пользователь еще не менял порядок
        const newIds = allIds.filter(id => !prevAllIdsRef.current.includes(id));
        const removedIds = prevAllIdsRef.current.filter(id => !allIds.includes(id));
        
        if (newIds.length > 0 || removedIds.length > 0) {
          setAllTasksOrder(prev => {
            const filtered = prev.filter(id => allIds.includes(id));
            return [...newIds, ...filtered];
          });
          prevAllIdsRef.current = allIds;
        }
      } else {
        // Если пользователь уже менял порядок, только удаляем удаленные задачи
        const removedIds = prevAllIdsRef.current.filter(id => !allIds.includes(id));
        if (removedIds.length > 0) {
          setAllTasksOrder(prev => prev.filter(id => allIds.includes(id)));
        }
        // Добавляем новые задачи в конец
        const newIds = allIds.filter(id => !prevAllIdsRef.current.includes(id));
        if (newIds.length > 0) {
          setAllTasksOrder(prev => [...prev, ...newIds]);
        }
        prevAllIdsRef.current = allIds;
      }
    } else {
      // При переключении режима сбрасываем флаг
      hasUserOrderRef.current = false;
    }
  }, [allTasks, viewMode]);

  // Сортируем все задачи согласно порядку
  const sortedAllTasks = useMemo(() => {
    if (viewMode !== 'list' && viewMode !== 'grid') return [];
    if (allTasksOrder.length === 0) {
      // Если порядок еще не инициализирован, возвращаем исходный порядок (от новых к старым)
      return [...allTasks].sort((a, b) => {
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      });
    }
    const taskMap = new Map(allTasks.map(t => [t._id, t]));
    const sorted = allTasksOrder
      .map(id => taskMap.get(id))
      .filter((task): task is Task => task !== undefined);
    // Добавляем задачи, которых нет в порядке (на случай, если они появились после инициализации)
    const missingTasks = allTasks.filter(t => !allTasksOrder.includes(t._id));
    return [...sorted, ...missingTasks];
  }, [allTasks, allTasksOrder, viewMode]);

  if (!isOpen) return null;

  return createPortal(
    <div 
      className="modal-fade-in fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] pt-4 md:pt-4 pb-0 md:pb-4 px-0 md:px-4 transition-all duration-300 ease-out animate-in fade-in" 
      onClick={onClose}
    >
      <div 
        className="relative flex w-full max-h-[calc(100vh-1rem)] flex-col overflow-hidden rounded-t-[25px] border border-[var(--border)] bg-[var(--card)] text-[var(--card-foreground)] shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 md:max-h-[90vh] md:w-[90%] md:rounded-[25px] md:pb-0" 
        onClick={(e) => e.stopPropagation()}
      >
        {/* Заголовок */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4 md:px-8">
          <h2 className="text-xl font-normal text-[var(--foreground)] md:text-2xl">
            {title || t('tasksGrid.title')}
          </h2>
          <div className="flex items-center gap-3">
            {/* Переключатель режимов просмотра - скрыт если forceViewMode установлен */}
            {!forceViewMode && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`rounded-lg p-2 transition-all duration-200 ${viewMode === 'grid' ? 'bg-[var(--muted)]' : 'hover:bg-[var(--secondary)]'}`}
                  title={t('tasksGrid.matrixView')}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <g className="text-[var(--corporate-green)]" opacity={viewMode === 'grid' ? 1 : 0.5}>
                      <path d="M3 3H10V10H3V3Z" fill="currentColor"/>
                      <path d="M14 3H21V10H14V3Z" fill="currentColor"/>
                      <path d="M3 14H10V21H3V14Z" fill="currentColor"/>
                      <path d="M14 14H21V21H14V14Z" fill="currentColor"/>
                    </g>
                  </svg>
                </button>
                <button
                  onClick={() => setViewMode('columns')}
                  className={`rounded-lg p-2 transition-all duration-200 ${viewMode === 'columns' ? 'bg-[var(--muted)]' : 'hover:bg-[var(--secondary)]'}`}
                  title={t('tasksGrid.columnsView')}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <g className="text-[var(--corporate-green)]" opacity={viewMode === 'columns' ? 1 : 0.5}>
                      <path d="M10.5 4.1V19.9C10.5 21.4 9.86249 22 8.26874 22H4.23126C2.63751 22 2 21.4 2 19.9V4.1C2 2.6 2.63751 2 4.23126 2H8.26874C9.86249 2 10.5 2.6 10.5 4.1ZM19.7687 2H15.7313C14.1375 2 13.5 2.6 13.5 4.1V19.9C13.5 21.4 14.1375 22 15.7313 22H19.7687C21.3625 22 22 21.4 22 19.9V4.1C22 2.6 21.3625 2 19.7687 2Z" fill="currentColor"/>
                    </g>
                  </svg>
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`rounded-lg p-2 transition-all duration-200 ${viewMode === 'list' ? 'bg-[var(--muted)]' : 'hover:bg-[var(--secondary)]'}`}
                  title={t('tasksGrid.listView')}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <g className="text-[var(--corporate-green)]" opacity={viewMode === 'list' ? 1 : 0.5}>
                      <path d="M3 6H21M3 12H21M3 18H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </g>
                  </svg>
                </button>
              </div>
            )}
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-[var(--foreground)] transition-all duration-200 hover:bg-[var(--muted)]"
              title={t('tasksGrid.close')}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Содержимое */}
        <div className="flex-1 overflow-y-auto px-5 md:px-8 py-6">
          {tasks.length === 0 ? (
            <div className="flex h-full items-center justify-center text-[var(--muted-foreground)]">
              <div className="text-center">
                <p className="mb-2 text-lg font-medium">{t('tasksGrid.noTasksTitle')}</p>
                <p className="text-sm">{t('tasksGrid.noTasksDesc')}</p>
              </div>
            </div>
          ) : viewMode === 'columns' ? (
            <div className="flex gap-4 flex-nowrap w-full max-w-full min-w-0 overflow-x-auto pr-2 items-stretch flex-1" style={{ alignSelf: 'stretch', height: '100%' }}>
              {/* Колонка: Рабочие задачи */}
              <div className="flex min-w-0 flex-1 basis-1/2 flex-col rounded-[32px] border border-[var(--border)] bg-gradient-to-br from-[var(--secondary)] to-[var(--card)] p-2.5" style={{ height: '100%', alignSelf: 'stretch', maxWidth: '50%' }}>
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-1 font-normal">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg" className="mr-1">
                      <rect x="1" y="1" width="8" height="8" rx="4" fill="var(--primary)"/>
                    </svg>
                    <span className="text-xl font-normal text-[var(--foreground)]">{t('tasksGrid.workTasks')}</span>
                    <span className="ml-2 font-normal text-[var(--muted-foreground)]">({workTasks.length})</span>
                  </div>
                </div>
                <div 
                  key={`work-tasks-${workTasksOrder.join('-')}`}
                  className="flex-1 overflow-y-auto flex flex-col gap-3"
                  onDragOver={(e) => {
                    if (draggedTaskCategory === 'work') {
                      e.preventDefault();
                      e.stopPropagation();
                    }
                  }}
                >
                  {workTasks.length === 0 ? (
                    <div className="py-6 text-center text-sm text-[var(--muted-foreground)]">{t('tasksGrid.noWorkTasks')}</div>
                  ) : (
                    workTasks.map((task, index) => {
                      const modalTaskData = transformTaskToModalData(task);
                      const isDragging = draggedTaskId === task._id && draggedTaskCategory === 'work';
                      const isDragOver = dragOverTaskId === task._id && draggedTaskCategory === 'work';
                      const showDropIndicatorAbove = isDragOver && dragOverPosition === 'above';
                      const showDropIndicatorBelow = isDragOver && dragOverPosition === 'below';
                      
                      return (
                        <React.Fragment key={task._id}>
                          {showDropIndicatorAbove && (
                            <div className="h-1 bg-dream-primary rounded-full mx-4 my-1" />
                          )}
                          <div
                            className={`relative pl-10 transition-all ${isDragging ? 'opacity-50' : 'opacity-100'} ${isDragOver ? 'scale-[1.02]' : ''}`}
                            draggable
                            onDragStart={(e) => {
                              e.stopPropagation();
                              handleDragStart(e, task._id, 'work');
                            }}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDragOver(e, task._id, 'work');
                            }}
                            onDragLeave={(e) => {
                              e.stopPropagation();
                              handleDragLeave(e);
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDrop(e, task._id, 'work');
                            }}
                            onDragEnd={(e) => {
                              e.stopPropagation();
                              handleDragEnd();
                            }}
                            style={{ cursor: 'grab' }}
                          >
                            <div className="absolute bottom-0 left-5 top-0 w-px bg-[var(--border)]" aria-hidden />
                            <div className="absolute left-[14px] top-4 h-2.5 w-2.5 rounded-full border-2 border-[var(--card)] bg-[var(--primary)] shadow-sm" aria-hidden />
                            <div 
                              className="min-w-0 flex-1"
                              onDragOver={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleDragOver(e, task._id, 'work');
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleDrop(e, task._id, 'work');
                              }}
                            >
                              <TaskCard
                                task={modalTaskData}
                                index={index}
                                isChecked={task.status === TaskStatus.COMPLETED}
                                viewMode={viewMode}
                                isFromTaskManagement
                                onCheckboxChange={(checked) => {
                                  onUpdateTaskStatus(
                                    task._id,
                                    checked ? TaskStatus.COMPLETED : TaskStatus.IN_PROGRESS
                                  );
                                }}
                                onShowInfo={() => handleOpenTaskView(task._id)}
                                onDelete={() => onDeleteTask(task._id)}
                              />
                            </div>
                          </div>
                          {showDropIndicatorBelow && (
                            <div className="h-1 bg-dream-primary rounded-full mx-4 my-1" />
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Колонка: Личные задачи */}
              <div className="flex min-w-0 flex-1 basis-1/2 flex-col rounded-[32px] border border-[var(--border)] bg-gradient-to-br from-[var(--secondary)] to-[var(--card)] p-2.5" style={{ height: '100%', alignSelf: 'stretch', maxWidth: '50%' }}>
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-1 font-normal">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg" className="mr-1">
                      <rect x="1" y="1" width="8" height="8" rx="4" fill="var(--primary)"/>
                    </svg>
                    <span className="text-xl font-normal text-[var(--foreground)]">{t('tasksGrid.personalTasks')}</span>
                    <span className="ml-2 font-normal text-[var(--muted-foreground)]">({personalTasks.length})</span>
                  </div>
                </div>
                <div 
                  key={`personal-tasks-${personalTasksOrder.join('-')}`}
                  className="flex-1 overflow-y-auto flex flex-col gap-3"
                  onDragOver={(e) => {
                    if (draggedTaskCategory === 'personal') {
                      e.preventDefault();
                      e.stopPropagation();
                    }
                  }}
                >
                  {personalTasks.length === 0 ? (
                    <div className="py-6 text-center text-sm text-[var(--muted-foreground)]">{t('tasksGrid.noPersonalTasks')}</div>
                  ) : (
                    personalTasks.map((task, index) => {
                      const modalTaskData = transformTaskToModalData(task);
                      const isDragging = draggedTaskId === task._id && draggedTaskCategory === 'personal';
                      const isDragOver = dragOverTaskId === task._id && draggedTaskCategory === 'personal';
                      const showDropIndicatorAbove = isDragOver && dragOverPosition === 'above';
                      const showDropIndicatorBelow = isDragOver && dragOverPosition === 'below';
                      
                      return (
                        <React.Fragment key={task._id}>
                          {showDropIndicatorAbove && (
                            <div className="h-1 bg-dream-primary rounded-full mx-4 my-1" />
                          )}
                          <div
                            className={`relative pl-10 transition-all ${isDragging ? 'opacity-50' : 'opacity-100'} ${isDragOver ? 'scale-[1.02]' : ''}`}
                            draggable
                            onDragStart={(e) => {
                              e.stopPropagation();
                              handleDragStart(e, task._id, 'personal');
                            }}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDragOver(e, task._id, 'personal');
                            }}
                            onDragLeave={(e) => {
                              e.stopPropagation();
                              handleDragLeave(e);
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDrop(e, task._id, 'personal');
                            }}
                            onDragEnd={(e) => {
                              e.stopPropagation();
                              handleDragEnd();
                            }}
                            style={{ cursor: 'grab' }}
                          >
                            <div className="absolute bottom-0 left-5 top-0 w-px bg-[var(--border)]" aria-hidden />
                            <div className="absolute left-[14px] top-4 h-2.5 w-2.5 rounded-full border-2 border-[var(--card)] bg-[var(--primary)] shadow-sm" aria-hidden />
                            <div 
                              className="flex-1 min-w-0"
                              onDragOver={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleDragOver(e, task._id, 'personal');
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleDrop(e, task._id, 'personal');
                              }}
                            >
                              <TaskCard
                                task={modalTaskData}
                                index={index}
                                isChecked={task.status === TaskStatus.COMPLETED}
                                viewMode={viewMode}
                                isFromTaskManagement
                                onCheckboxChange={(checked) => {
                                  onUpdateTaskStatus(
                                    task._id,
                                    checked ? TaskStatus.COMPLETED : TaskStatus.IN_PROGRESS
                                  );
                                }}
                                onShowInfo={() => handleOpenTaskView(task._id)}
                                onDelete={() => onDeleteTask(task._id)}
                              />
                            </div>
                          </div>
                          {showDropIndicatorBelow && (
                            <div className="h-1 bg-dream-primary rounded-full mx-4 my-1" />
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          ) : viewMode === 'list' ? (
            <div 
              key={`list-${allTasksOrder.join('-')}`}
              className="flex flex-col gap-3"
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              {sortedAllTasks.length === 0 ? (
                <div className="py-6 text-center text-sm text-[var(--muted-foreground)]">{t('tasksGrid.noTasksTitle')}</div>
              ) : (
                sortedAllTasks.map((task, index) => {
                  const category = workTasksRaw.some(t => t._id === task._id) ? 'work' : 'personal';
                  return renderTaskWithDragDrop(task, index, category, true);
                })
              )}
            </div>
          ) : viewMode === 'grid' ? (
            <div 
              key={`grid-${allTasksOrder.join('-')}`}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              {sortedAllTasks.length === 0 ? (
                <div className="col-span-full py-6 text-center text-sm text-[var(--muted-foreground)]">{t('tasksGrid.noTasksTitle')}</div>
              ) : (
                sortedAllTasks.map((task, index) => {
                  const category = workTasksRaw.some(t => t._id === task._id) ? 'work' : 'personal';
                  return renderTaskWithDragDrop(task, index, category, false);
                })
              )}
            </div>
          ) : null}
        </div>

        {/* Информация о количестве задач */}
        <div className="border-t border-[var(--border)] px-5 py-3 text-sm text-[var(--muted-foreground)] md:px-8">
          {t('tasksGrid.totalTasks', { count: String(tasks.length) })}
        </div>
      </div>

      {/* Модалка просмотра задачи */}
      {isTaskViewModalOpen && (
        <TaskViewModal
          key={selectedTaskForView}
          task={currentTaskForModal}
          isOpen={isTaskViewModalOpen}
          onClose={handleCloseTaskView}
          onUpdateTaskStatus={onUpdateTaskStatus}
          onDeleteTask={onDeleteTask}
          onTaskUpdate={(updatedTask) => {
            setCurrentTaskForModal(updatedTask);
            if (onTaskUpdate) {
              onTaskUpdate(updatedTask);
            }
          }}
          onUpdateTaskEndDate={onUpdateTaskEndDate}
        />
      )}
    </div>,
    document.body
  );
};

export default TasksGridModal;
