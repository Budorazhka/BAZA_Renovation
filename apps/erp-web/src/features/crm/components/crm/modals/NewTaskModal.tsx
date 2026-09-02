// @ts-nocheck
import React from 'react';
import { useI18n } from '@/i18n';
import Tooltip from '../../common/Tooltip';
import TaskCard, { type ModalTaskData } from '../TaskCard';
import { TaskStatus, TaskPriority, type Task, type Lead } from '../../../services/api';
import Calendar from '../Calendar';
import TimePickerDropdown from '../common/TimePickerDropdown';
import TasksArchiveModal from './TasksArchiveModal';
import { CalendarDays, CheckSquare, PhoneCall, X } from 'lucide-react';

export interface NewTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  [key: string]: any;
}

export const NewTaskModal: React.FC<any> = (props) => {
  const { t } = useI18n();
  const { isOpen } = props;
  if (!isOpen) return null;

  // Распаковываем все пропсы
  const [isCreating, setIsCreating] = React.useState(false);
  const [isArchiveModalOpen, setIsArchiveModalOpen] = React.useState(false);
  const handleCloseModal = props.onClose;
  const taskForm = props.taskForm;
  const setTaskForm = props.setTaskForm;
  const backendTasks = props.backendTasks;
  const backendLeads = props.backendLeads;
  const modalTasksData = props.modalTasksData;
  const modalTaskChecked = props.modalTaskChecked;
  const setModalTaskChecked = props.setModalTaskChecked;
  const taskViewMode = props.taskViewMode;
  const setTaskViewMode = props.setTaskViewMode;
  const taskCategoryFilter = props.taskCategoryFilter;
  const setTaskCategoryFilter = props.setTaskCategoryFilter;
  const isSearchChecked = props.isSearchChecked;
  const setIsSearchChecked = props.setIsSearchChecked;
  const selectedTaskFilter = props.selectedTaskFilter;
  const setSelectedTaskFilter = props.setSelectedTaskFilter;
  const showCreateTask = props.showCreateTask;
  const setShowCreateTask = props.setShowCreateTask;
  const isTaskManagementOpened = props.isTaskManagementOpened;
  const setIsTaskManagementOpened = props.setIsTaskManagementOpened;
  const showTaskTypeSelection = props.showTaskTypeSelection;
  const setShowTaskTypeSelection = props.setShowTaskTypeSelection;
  const handleTaskTypeSelected = props.handleTaskTypeSelected;
  const handleCreateTask = props.handleCreateTask;
  const handleOpenTaskView = props.handleOpenTaskView;
  const handleDeleteTask = props.handleDeleteTask;
  const updateTaskStatus = props.updateTaskStatus;
  const updateTaskPriority = props.updateTaskPriority;
  const resetTaskForm = props.resetTaskForm;
  const selectedTaskFiles = props.selectedTaskFiles;
  const setSelectedTaskFiles = props.setSelectedTaskFiles;
  const isUploadingFiles = props.isUploadingFiles;
  const handleTaskFileSelect = props.handleTaskFileSelect;
  const handleRemoveTaskFile = props.handleRemoveTaskFile;
  const formatFileSize = props.formatFileSize;
  const taskFileInputRef = props.taskFileInputRef;
  const handleAddSubtask = props.handleAddSubtask;
  const handleToggleSubtask = props.handleToggleSubtask;
  const handleRemoveSubtask = props.handleRemoveSubtask;
  const editingSubtaskIndex = props.editingSubtaskIndex;
  const setEditingSubtaskIndex = props.setEditingSubtaskIndex;
  const editingSubtaskTitle = props.editingSubtaskTitle;
  const setEditingSubtaskTitle = props.setEditingSubtaskTitle;
  const handleStartEditSubtask = props.handleStartEditSubtask;
  const handleStartAddSubtask = props.handleStartAddSubtask || (() => {
    setEditingSubtaskIndex('new');
    setEditingSubtaskTitle('');
  });
  const handleSaveEditSubtask = props.handleSaveEditSubtask;
  const handleCancelEditSubtask = props.handleCancelEditSubtask;
  const isSubtaskInputVisible = props.isSubtaskInputVisible;
  const setIsSubtaskInputVisible = props.setIsSubtaskInputVisible;
  const newSubtaskTitle = props.newSubtaskTitle;
  const setNewSubtaskTitle = props.setNewSubtaskTitle;
  const showDescriptionField = props.showDescriptionField;
  const setShowDescriptionField = props.setShowDescriptionField;
  const isClientDropdownOpen = props.isClientDropdownOpen;
  const setIsClientDropdownOpen = props.setIsClientDropdownOpen;
  const isCategoryDropdownOpen = props.isCategoryDropdownOpen;
  const setIsCategoryDropdownOpen = props.setIsCategoryDropdownOpen;
  const clientDropdownRef = props.clientDropdownRef;
  const categoryDropdownRef = props.categoryDropdownRef;
  const colorPalette = props.colorPalette;
  const setColorPalette = props.setColorPalette;
  const isColorModalOpen = props.isColorModalOpen;
  const setIsColorModalOpen = props.setIsColorModalOpen;
  const isColorPaletteModalOpen = props.isColorPaletteModalOpen;
  const setIsColorPaletteModalOpen = props.setIsColorPaletteModalOpen;
  const newColorHex = props.newColorHex;
  const setNewColorHex = props.setNewColorHex;
  const draftNotice: boolean = props.draftNotice;
  const onDismissDraftNotice: (() => void) | undefined = props.onDismissDraftNotice;

  // Состояние для напоминаний
  const [reminders, setReminders] = React.useState<string[]>([]);
  
  // Состояние для категории задачи (Личная/Рабочая)
  const [taskCategory, setTaskCategory] = React.useState<'work' | 'personal'>('work');

  // Инициализация reminders при открытии модального окна
  React.useEffect(() => {
    if (isOpen) {
      // Используем reminders из taskForm, если они есть, иначе значения по умолчанию
      const defaultReminders = [t('newTask.remindersList.1h'), t('newTask.remindersList.15m')];
      setReminders(taskForm?.reminders && taskForm.reminders.length > 0 
        ? taskForm.reminders 
        : defaultReminders);
      // Инициализация категории из taskForm, если есть
      if (taskForm?.taskCategory) {
        setTaskCategory(taskForm.taskCategory);
      } else {
        setTaskCategory('work');
      }
    } else {
      // Сбрасываем при закрытии
      setReminders([t('newTask.remindersList.1h'), t('newTask.remindersList.15m')]); // Возвращаем к значениям по умолчанию
      setTaskCategory('work');
    }
  }, [isOpen, taskForm?.reminders, taskForm?.taskCategory, t]);

  // Автоматическое заполнение email, phone и clientName при выборе лида
  const selectedLead = backendLeads?.find((l: Lead) => l._id === taskForm?.leadId);
  
  React.useEffect(() => {
    if (selectedLead && taskForm) {
      setTaskForm((prev: any) => ({
        ...prev,
        email: selectedLead.email || prev.email,
        phone: selectedLead.phone || prev.phone,
        clientName: selectedLead.name || prev.clientName
      }));
    }
  }, [selectedLead, setTaskForm]);

  // Функция для переключения напоминания
  const toggleReminder = (reminder: string) => {
    setReminders(prev => 
      prev.includes(reminder) 
        ? prev.filter(r => r !== reminder)
        : [...prev, reminder]
    );
  };

  // Автоскрытие уведомления о черновике через 3 секунды
  React.useEffect(() => {
    if (draftNotice && onDismissDraftNotice) {
      const timer = setTimeout(() => {
        onDismissDraftNotice();
      }, 3000); // 3 секунды

      return () => clearTimeout(timer);
    }
  }, [draftNotice, onDismissDraftNotice]);

  const handleCreateTaskClick = async () => {
    if (isCreating || isUploadingFiles) return;
    setIsCreating(true);
    try {
      // Создаем обновленную версию формы с напоминаниями и категорией
      const updatedTaskForm = {
        ...taskForm,
        reminders: reminders,
        taskCategory: taskCategory
      };
      
      // Обновляем состояние формы
      setTaskForm(updatedTaskForm);
      
      // Вызываем handleCreateTask - если функция принимает параметр, передаем обновленную форму
      // Иначе она будет использовать обновленный taskForm из пропсов при следующем рендере
      await handleCreateTask(updatedTaskForm);
    } catch (error) {
      console.error('Failed to create task:', error);
      alert(t('newTask.createFailed'));
    } finally {
      setIsCreating(false);
    }
  };
  const carouselSlide = props.carouselSlide;
  const setCarouselSlide = props.setCarouselSlide;
  const modalContainerRef = props.modalContainerRef;
  const handleTouchStart = props.handleTouchStart;
  const handleTouchEnd = props.handleTouchEnd;
  const handleTaskDragStart = props.handleTaskDragStart;
  const handleTaskDrop = props.handleTaskDrop;
  const handleTaskDragEnd = props.handleTaskDragEnd;
  const allowDrop = props.allowDrop;
  const draggedOverQuadrant = props.draggedOverQuadrant;
  const setDraggedOverQuadrant = props.setDraggedOverQuadrant;
  const modalTaskCategories = props.modalTaskCategories;
  const taskCategoryById = props.taskCategoryById;
  const setTaskCategoryById = props.setTaskCategoryById;
  const isStartDateExpanded = props.isStartDateExpanded;
  const setIsStartDateExpanded = props.setIsStartDateExpanded;
  const isStartTimeExpanded = props.isStartTimeExpanded;
  const setIsStartTimeExpanded = props.setIsStartTimeExpanded;
  const isEndDateExpanded = props.isEndDateExpanded;
  const setIsEndDateExpanded = props.setIsEndDateExpanded;
  const isEndTimeExpanded = props.isEndTimeExpanded;
  const setIsEndTimeExpanded = props.setIsEndTimeExpanded;
  const startDateRef = props.startDateRef;
  const startTimeRef = props.startTimeRef;
  const endDateRef = props.endDateRef;
  const endTimeRef = props.endTimeRef;
  const filteredModalTasksData = props.filteredModalTasksData;
  
  // Недостающие переменные
  const isDragOperation = { current: false };
  const isDragging = { current: false };
  const isPhoneSearchOpen = props.isPhoneSearchOpen || false;
  const setIsPhoneSearchOpen = props.setIsPhoneSearchOpen || (() => {});
  const phoneSearchRef = props.phoneSearchRef || { current: null };

  // Линейный вид: фильтры и вспомогательные состояния
  const [listDateFrom, setListDateFrom] = React.useState<string>('');
  const [listDateTo, setListDateTo] = React.useState<string>('');
  const [showOverdueModal, setShowOverdueModal] = React.useState(false);
  const [showNoDateModal, setShowNoDateModal] = React.useState(false);
  const [isListFromOpen, setIsListFromOpen] = React.useState(false);
  const [isListToOpen, setIsListToOpen] = React.useState(false);
  const listFromRef = React.useRef<HTMLDivElement | null>(null);
  const listToRef = React.useRef<HTMLDivElement | null>(null);
  const [isListSettingsOpen, setIsListSettingsOpen] = React.useState(false);
  const [showWithDate, setShowWithDate] = React.useState(true);
  const [showOverdueBlock, setShowOverdueBlock] = React.useState(true);
  const [showNoDateBlock, setShowNoDateBlock] = React.useState(true);

  const listViewData = React.useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const parseDate = (value?: string | null) => {
      if (!value) return null;
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return null;
      d.setHours(0, 0, 0, 0);
      return d;
    };
    const fromDate = parseDate(listDateFrom);
    const toDate = parseDate(listDateTo);

    const filteredTasks = modalTasksData
      .map((task, index) => ({ task, index }))
      .filter(({ index }) => !isSearchChecked || !modalTaskChecked[index]);

    const tasksWithDate = filteredTasks
      .filter(({ task }) => !!task.endDate)
      .filter(({ task }) => {
        const d = new Date(task.endDate!);
        d.setHours(0, 0, 0, 0);
        if (fromDate && d < fromDate) return false;
        if (toDate && d > toDate) return false;
        return true;
      });

    const sortedTasksWithDate = [...tasksWithDate].sort(
      (a, b) => new Date(a.task.endDate!).getTime() - new Date(b.task.endDate!).getTime()
    );

    const overdueTasks = sortedTasksWithDate.filter(({ task }) => {
      const d = new Date(task.endDate!);
      d.setHours(0, 0, 0, 0);
      return d < today;
    });

    const noDateTasks = filteredTasks.filter(({ task }) => !task.endDate);

    const groupsMap = new Map<string, { date: Date; label: string; items: typeof tasksWithDate }>();
    sortedTasksWithDate.forEach(({ task, index }) => {
      const d = new Date(task.endDate!);
      d.setHours(0, 0, 0, 0);
      const key = d.toISOString();
      const label = d.toLocaleDateString('ru-RU');
      if (!groupsMap.has(key)) {
        groupsMap.set(key, { date: d, label, items: [] });
      }
      groupsMap.get(key)!.items.push({ task, index });
    });
    const grouped = Array.from(groupsMap.values()).sort((a, b) => a.date.getTime() - b.date.getTime());

    return { grouped, overdueTasks, noDateTasks };
  }, [modalTasksData, modalTaskChecked, isSearchChecked, listDateFrom, listDateTo]);

  const { grouped, overdueTasks, noDateTasks } = listViewData;

  const formatDisplayDate = (value: string | null | undefined) => {
    if (!value) return t('newTask.selectDate');
    const [y, m, d] = value.split('-');
    return `${d}.${m}.${y}`;
  };

  return (
    <div className="modal-fade-in fixed inset-0 z-[60] flex items-end justify-center overflow-hidden bg-black/50 px-0 pb-0 pt-[15px] backdrop-blur-sm md:items-center md:px-4 md:py-4" onClick={handleCloseModal}>
      {/* Toast-уведомление о загрузке черновика */}
      {draftNotice && (
        <div className="fixed top-4 right-4 z-[100] max-w-[400px]" onClick={(e) => e.stopPropagation()}>
          <div className="transform transition-all duration-300 ease-out translate-x-0 opacity-100">
            <div className="rounded-lg shadow-lg p-4 flex items-start gap-3" style={{ background: '#112d1c', boxShadow: 'inset 0 0 0 1px rgba(201,168,76,0.18)', color: '#d0e8df' }}>
              <div className="flex-shrink-0 mt-0.5">
                <svg className="w-5 h-5" fill="none" stroke="#e6c364" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base leading-5" style={{ color: '#d0e8df' }}>{t('newTask.draftLoaded')}</p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDismissDraftNotice?.();
                }}
                className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
                aria-label={t('newTask.cancel')}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
      {showTaskTypeSelection && !isTaskManagementOpened ? (
        <div
          className="w-full max-w-[660px] overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.48)] md:max-h-[calc(100dvh-2rem)] md:p-5"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-[21px] font-normal leading-tight text-[color:var(--foreground)]">
                {t('newTask.createTitle')}
              </h2>
              <p className="mt-1 text-[13px] leading-5 text-[color:var(--muted-foreground)]">
                {t('newTask.createDescription')}
              </p>
            </div>
            <button
              type="button"
              onClick={handleCloseModal}
              className="flex size-9 shrink-0 items-center justify-center rounded-md border border-[color:var(--border)] text-[color:var(--muted-foreground)] transition-colors hover:bg-[color:var(--secondary)] hover:text-[color:var(--foreground)]"
              aria-label={t('newTask.cancel')}
            >
              <X size={18} />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <button
              type="button"
              onClick={() => handleTaskTypeSelected('standard')}
              className="group flex min-h-[118px] flex-col items-center justify-center rounded-lg border border-[color:var(--border)] bg-[color:var(--secondary)] p-3.5 text-center transition-all hover:-translate-y-0.5 hover:border-[color:var(--primary)] hover:bg-[color:var(--muted)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]"
            >
              <span className="flex size-10 items-center justify-center rounded-md bg-[rgba(201,168,76,0.14)] text-[#d8b957]">
                <CheckSquare size={21} />
              </span>
              <span className="mt-3 block text-base font-normal text-[color:var(--foreground)]">{t('newTask.typeStandard')}</span>
              <span className="mt-1 block text-xs leading-5 text-[color:var(--muted-foreground)]">{t('newTask.typeStandardDesc')}</span>
            </button>

            <button
              type="button"
              onClick={() => handleTaskTypeSelected('call')}
              className="group flex min-h-[118px] flex-col items-center justify-center rounded-lg border border-[color:var(--border)] bg-[color:var(--secondary)] p-3.5 text-center transition-all hover:-translate-y-0.5 hover:border-[color:var(--primary)] hover:bg-[color:var(--muted)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]"
            >
              <span className="flex size-10 items-center justify-center rounded-md bg-[rgba(74,222,128,0.12)] text-[#6ee78e]">
                <PhoneCall size={21} />
              </span>
              <span className="mt-3 block text-base font-normal text-[color:var(--foreground)]">{t('newTask.typeCall')}</span>
              <span className="mt-1 block text-xs leading-5 text-[color:var(--muted-foreground)]">{t('newTask.typeCallDesc')}</span>
            </button>

            <button
              type="button"
              onClick={() => handleTaskTypeSelected('meeting')}
              className="group flex min-h-[118px] flex-col items-center justify-center rounded-lg border border-[color:var(--border)] bg-[color:var(--secondary)] p-3.5 text-center transition-all hover:-translate-y-0.5 hover:border-[color:var(--primary)] hover:bg-[color:var(--muted)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]"
            >
              <span className="flex size-10 items-center justify-center rounded-md bg-[rgba(96,165,250,0.13)] text-[#8bbdff]">
                <CalendarDays size={21} />
              </span>
              <span className="mt-3 block text-base font-normal text-[color:var(--foreground)]">{t('newTask.typeMeeting')}</span>
              <span className="mt-1 block text-xs leading-5 text-[color:var(--muted-foreground)]">{t('newTask.typeMeetingDesc')}</span>
            </button>
          </div>
        </div>
      ) : (
      <div
      className={`relative w-full ${showCreateTask ? 'md:w-[85%] md:max-w-[1200px]' : 'md:w-[88%] md:max-w-[1200px]'} h-[85vh] ${taskViewMode === 'columns' ? 'md:h-[calc(100vh-2rem)]' : 'md:h-[88vh] md:max-h-[800px]'} flex flex-col overflow-hidden`}
      >
        {}
        <button
          onClick={handleCloseModal}
          className="absolute -top-10 md:-top-10 -right-4 md:-right-10 z-10 flex items-center justify-center md:block"
        >
          <svg width="45" height="45" viewBox="0 0 45 45" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M33.75 11.25L11.25 33.75" stroke="white" strokeWidth="3" strokeLinecap="round"/>
            <path d="M11.25 11.25L33.75 33.75" stroke="white" strokeWidth="3" strokeLinecap="round"/>
          </svg>
        </button>
        {/* Крестик для мобильных */}
        <button
          onClick={handleCloseModal}
          className="absolute top-4 right-4 z-10 flex items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)]/95 p-2 shadow-lg md:hidden"
          aria-label={t('newTask.cancel')}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M18 6L6 18M6 6l12 12" stroke="#169600" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div
          ref={modalContainerRef}
          className={`flex min-h-0 flex-1 bg-[var(--card)] text-[var(--card-foreground)] ${showCreateTask ? 'gap-0' : 'gap-2'} rounded-t-[25px] md:rounded-[25px] ${showCreateTask ? '' : 'md:px-12.5 md:py-1'} w-full shadow-2xl ${taskViewMode === 'columns' ? 'overflow-visible md:overflow-visible' : 'overflow-hidden'} md:flex-row`}
          onClick={(e) => e.stopPropagation()}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {}
          <div className="flex md:contents relative w-full md:w-auto min-h-0 overflow-hidden md:overflow-visible">
            <div className={`absolute inset-0 mt-0 flex min-h-0 min-w-0 flex-1 flex-col gap-5 rounded-lg p-5 pb-25 pd:px-5 transition-transform duration-300 md:relative md:inset-auto md:min-h-full md:self-stretch md:translate-x-0 md:pb-0 md:py-4 ${taskViewMode === 'columns' ? 'flex-1 min-h-0 overflow-hidden' : 'h-full overflow-y-auto'} ${
              carouselSlide === 0 ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
            } ${showCreateTask && !isTaskManagementOpened ? 'md:hidden' : ''}`}>
            <div className="flex justify-between ">
              <div className="flex gap-2 items-center">
                <span
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontWeight: 400,
                    fontStyle: 'normal',
                    fontSize: '28px',
                    lineHeight: '150%',
                    letterSpacing: '-0.01em',
                    leadingTrim: 'cap-height'
                  } as React.CSSProperties & { leadingTrim?: string }}
                >
                  {t('newTask.managementTitle')}
                </span>
              </div>
              <div className="flex gap-3 items-center">
                <button
                  type="button"
                  onClick={() => setTaskCategoryFilter('work')}
                  className={`px-4 py-2 rounded-full transition-all cursor-pointer ${
                    taskCategoryFilter === 'work'
                      ? 'bg-dream-primary text-white'
                      : 'bg-[var(--muted)] text-[var(--foreground)] hover:bg-[var(--secondary)]'
                  }`}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontWeight: 400,
                      fontStyle: 'normal',
                      fontSize: '14px',
                      lineHeight: '100%',
                      letterSpacing: '0px',
                      leadingTrim: 'none'
                    } as React.CSSProperties & { leadingTrim?: string }}
                  >{t('newTask.categoryWork')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTaskCategoryFilter('personal')}
                  className={`px-4 py-2 rounded-full transition-all cursor-pointer ${
                    taskCategoryFilter === 'personal'
                      ? 'bg-dream-primary text-white'
                      : 'bg-[var(--muted)] text-[var(--foreground)] hover:bg-[var(--secondary)]'
                  }`}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontWeight: 400,
                      fontStyle: 'normal',
                      fontSize: '14px',
                      lineHeight: '100%',
                      letterSpacing: '0px',
                      leadingTrim: 'none'
                    } as React.CSSProperties & { leadingTrim?: string }}
                  >{t('newTask.categoryPersonal')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTaskCategoryFilter('all')}
                  className={`px-4 py-2 rounded-full transition-all cursor-pointer ${
                    taskCategoryFilter === 'all'
                      ? 'bg-dream-primary text-white'
                      : 'bg-[var(--muted)] text-[var(--foreground)] hover:bg-[var(--secondary)]'
                  }`}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontWeight: 400,
                      fontStyle: 'normal',
                      fontSize: '14px',
                      lineHeight: '100%',
                      letterSpacing: '0px',
                      leadingTrim: 'none'
                    } as React.CSSProperties & { leadingTrim?: string }}
                  >{t('newTask.categoryAll')}</span>
                </button>
              </div>
              <div className="flex gap-2 items-center">
                <Tooltip text={t('newTask.completedTasks')} position="bottom">
                <button
                  type="button"
                  onClick={() => setIsSearchChecked(!isSearchChecked)}
                  className="cursor-pointer"
                  aria-label={t('newTask.completedTasks')}
                >
                  <svg width="40" height="25" viewBox="0 0 40 25" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ opacity: isSearchChecked ? 1 : 0.5 }}>
                    <rect x="0.5" y="0.5" width="39.0001" height="23.2684" rx="11.6342" stroke="#169600"/>
                    <path d="M26.3952 18.0095L13.6038 5.21853L13.6011 5.2154C13.5318 5.14671 13.4497 5.09234 13.3594 5.05538C13.2692 5.01842 13.1725 4.99961 13.075 5.00001C12.9774 5.00041 12.8809 5.02001 12.791 5.05771C12.701 5.0954 12.6194 5.15045 12.5507 5.2197C12.482 5.28895 12.4276 5.37105 12.3906 5.46132C12.3537 5.55158 12.3349 5.64825 12.3353 5.74578C12.3361 5.94277 12.4151 6.13137 12.555 6.27009L13.6749 7.39001C12.3167 8.32019 11.1477 9.49996 10.23 10.8666C10.0801 11.0878 10 11.3489 10 11.6162C10 11.8834 10.0801 12.1445 10.23 12.3658C12.5725 15.833 16.2862 17.8642 19.9999 17.8388C21.2028 17.8432 22.3977 17.6429 23.5335 17.2466L25.3464 19.0595C25.4861 19.1947 25.6732 19.2697 25.8675 19.2684C26.0619 19.267 26.248 19.1895 26.3858 19.0525C26.5237 18.9154 26.6022 18.7297 26.6046 18.5354C26.607 18.341 26.5331 18.1535 26.3987 18.0131L26.3952 18.0095ZM19.9999 15.8228C19.2963 15.8226 18.604 15.646 17.9862 15.3092C17.3685 14.9724 16.845 14.4862 16.4635 13.8949C16.0821 13.3037 15.855 12.6263 15.8029 11.9246C15.7507 11.223 15.8753 10.5194 16.1651 9.87829L17.335 11.0482C17.2408 11.4923 17.259 11.9528 17.388 12.3881C17.517 12.8233 17.7527 13.2194 18.0737 13.5404C18.3947 13.8614 18.7908 14.0971 19.226 14.2261C19.6613 14.3551 20.1218 14.3733 20.5659 14.2791L21.7358 15.449C21.1905 15.6962 20.5986 15.8237 19.9999 15.8228Z" fill="#169600"/>
                    <path d="M29.7703 10.8639C27.4277 7.39477 23.7141 5.36352 20.0004 5.38891C18.7975 5.38455 17.6026 5.5848 16.4668 5.98109L18.2637 7.77797C19.0434 7.42511 19.9121 7.31826 20.7541 7.47167C21.5961 7.62507 22.3713 8.03144 22.9765 8.63661C23.5817 9.24178 23.9881 10.017 24.1415 10.859C24.2949 11.701 24.188 12.5697 23.8352 13.3495L26.325 15.8393C27.6834 14.9093 28.8526 13.7295 29.7703 12.3627C29.9201 12.1415 30.0001 11.8805 30.0001 11.6133C30.0001 11.3462 29.9201 11.0851 29.7703 10.8639Z" fill="#169600"/>
                    <path d="M19.9996 8.89062C19.8094 8.89065 19.6197 8.91055 19.4336 8.95L22.6645 12.1805C22.7487 11.7836 22.7432 11.3728 22.6484 10.9783C22.5536 10.5838 22.3719 10.2154 22.1165 9.90013C21.8611 9.58484 21.5385 9.33058 21.1722 9.15592C20.806 8.98127 20.4054 8.89063 19.9996 8.89062Z" fill="#169600"/>
                  </svg>
                </button>
                </Tooltip>
                <Tooltip text={t('newTask.gridMode')} position="bottom">
                  <button
                    type="button"
                    onClick={() => setTaskViewMode('grid')}
                    className="cursor-pointer"
                    aria-label={t('newTask.gridMode')}
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <g opacity={taskViewMode === 'grid' ? 1 : 0.5}>
                        <path d="M2 6.5C2 4.37868 2 3.31802 2.65901 2.65901C3.31802 2 4.37868 2 6.5 2C8.62132 2 9.68198 2 10.341 2.65901C11 3.31802 11 4.37868 11 6.5C11 8.62132 11 9.68198 10.341 10.341C9.68198 11 8.62132 11 6.5 11C4.37868 11 3.31802 11 2.65901 10.341C2 9.68198 2 8.62132 2 6.5Z" fill="#169600"/>
                        <path d="M13 17.5C13 15.3787 13 14.318 13.659 13.659C14.318 13 15.3787 13 17.5 13C19.6213 13 20.682 13 21.341 13.659C22 14.318 22 15.3787 22 17.5C22 19.6213 22 20.682 21.341 21.341C20.682 22 19.6213 22 17.5 22C15.3787 22 14.318 22 13.659 21.341C13 20.682 13 19.6213 13 17.5Z" fill="#169600"/>
                        <path d="M2 17.5C2 15.3787 2 14.318 2.65901 13.659C3.31802 13 4.37868 13 6.5 13C8.62132 13 9.68198 13 10.341 13.659C11 14.318 11 15.3787 11 17.5C11 19.6213 11 20.682 10.341 21.341C9.68198 22 8.62132 22 6.5 22C4.37868 22 3.31802 22 2.65901 21.341C2 20.682 2 19.6213 2 17.5Z" fill="#169600"/>
                        <path d="M13 6.5C13 4.37868 13 3.31802 13.659 2.65901C14.318 2 15.3787 2 17.5 2C19.6213 2 20.682 2 21.341 2.65901C22 3.31802 22 4.37868 22 6.5C22 8.62132 22 9.68198 21.341 10.341C20.682 11 19.6213 11 17.5 11C15.3787 11 14.318 11 13.659 10.341C13 9.68198 13 8.62132 13 6.5Z" fill="#169600"/>
                      </g>
                    </svg>
                  </button>
                </Tooltip>
                <Tooltip text={t('newTask.columnsMode')} position="bottom">
                  <button
                    type="button"
                    onClick={() => setTaskViewMode('columns')}
                    className="cursor-pointer"
                    aria-label={t('newTask.columnsMode')}
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <g opacity={taskViewMode === 'columns' ? 1 : 0.5}>
                        <path d="M10.5 4.1V19.9C10.5 21.4 9.86249 22 8.26874 22H4.23126C2.63751 22 2 21.4 2 19.9V4.1C2 2.6 2.63751 2 4.23126 2H8.26874C9.86249 2 10.5 2.6 10.5 4.1ZM19.7687 2H15.7313C14.1375 2 13.5 2.6 13.5 4.1V12.9C13.5 14.4 14.1375 15 15.7313 15H19.7687C21.3625 15 22 14.4 22 12.9V4.1C22 2.6 21.3625 2 19.7687 2Z" fill="#169600"/>
                      </g>
                    </svg>
                  </button>
                </Tooltip>
                <Tooltip text={t('newTask.listMode')} position="bottom">
                  <button
                    type="button"
                    onClick={() => setTaskViewMode('list')}
                    className="cursor-pointer"
                    aria-label={t('newTask.listMode')}
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ opacity: taskViewMode === 'list' ? 1 : 0.5 }}>
                      <path d="M2 7H22C22.2652 7 22.5196 6.89464 22.7071 6.70711C22.8946 6.51957 23 6.26522 23 6C23 5.73478 22.8946 5.48043 22.7071 5.29289C22.5196 5.10536 22.2652 5 22 5H2C1.73478 5 1.48043 5.10536 1.29289 5.29289C1.10536 5.48043 1 5.73478 1 6C1 6.26522 1.10536 6.51957 1.29289 6.70711C1.48043 6.89464 1.73478 7 2 7Z" fill="#169600"/>
                      <path d="M22 11H2C1.73478 11 1.48043 11.1054 1.29289 11.2929C1.10536 11.4804 1 11.7348 1 12C1 12.2652 1.10536 12.5196 1.29289 12.7071C1.48043 12.8946 1.73478 13 2 13H22C22.2652 13 22.5196 12.8946 22.7071 12.7071C22.8946 12.5196 23 12.2652 23 12C23 11.7348 22.8946 11.4804 22.7071 11.2929C22.5196 11.1054 22.2652 11 22 11Z" fill="#169600"/>
                      <path d="M22 17H2C1.73478 17 1.48043 17.1054 1.29289 17.2929C1.10536 17.4804 1 17.7348 1 18C1 18.2652 1.10536 18.5196 1.29289 18.7071C1.48043 18.8946 1.73478 19 2 19H22C22.2652 19 22.5196 18.8946 22.7071 18.7071C22.8946 18.5196 23 18.2652 23 18C23 17.7348 22.8946 17.4804 22.7071 17.2929C22.5196 17.1054 22.2652 17 22 17Z" fill="#169600"/>
                    </svg>
                  </button>
                </Tooltip>
                <Tooltip text={t('newTask.archiveDeletedTasks')} position="bottom">
                  <button
                    type="button"
                    onClick={() => setIsArchiveModalOpen(true)}
                    className="cursor-pointer"
                    aria-label={t('newTask.archiveDeletedTasks')}
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M20.54 5.23L19.15 3.55C18.88 3.21 18.47 3 18 3H6C5.53 3 5.12 3.21 4.85 3.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V6.5C21 6.02 20.83 5.57 20.54 5.23ZM12 17.5L6.5 12H10V8H14V12H17.5L12 17.5Z" fill="#169600"/>
                    </svg>
                  </button>
                </Tooltip>
                {!showCreateTask && (
                  <Tooltip text={t('newTask.newTaskButton')} position="bottom">
                    <button
                      type="button"
                      onClick={() => {
                        setShowTaskTypeSelection(true);
                        setIsTaskManagementOpened(false);
                      }}
                      className="hidden md:flex size-8 items-center justify-center cursor-pointer"
                      aria-label={t('newTask.newTaskButton')}
                    >
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 5V19M5 12H19" stroke="#169600" strokeWidth="2.5" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </Tooltip>
                )}
              </div>
            </div>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {/* Фильтры для list скрыты по требованию */}
            {taskViewMode === 'grid' ? (
              <div className="flex flex-col gap-2.5  overflow-y-auto pr-2">
                {}
                <div className="flex flex-col gap-2.5">
                  {}
                  <div className="hidden md:grid gap-5 flex-1" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
                    <div className="flex w-full items-center justify-start gap-2 rounded-lg border border-red-900/40 bg-red-950/45 py-2 pl-2 text-lg font-normal text-red-100">
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M14.0723 6.1734C14.0231 6.06779 13.9172 6.00001 13.8005 6.00001H10.2455L13.754 0.460512C13.8125 0.368121 13.8161 0.251121 13.7633 0.155426C13.7105 0.0594141 13.6097 0 13.5005 0H8.70051C8.58682 0 8.483 0.0641953 8.43202 0.165902L3.93202 9.1659C3.88551 9.25861 3.89061 9.369 3.94521 9.45749C4.00012 9.54598 4.09642 9.59998 4.20051 9.59998H7.2854L3.9239 17.5836C3.8666 17.7201 3.91761 17.8785 4.04389 17.9559C4.09248 17.9856 4.14648 18 4.2002 18C4.28629 18 4.3712 17.9631 4.43001 17.8935L14.03 6.49346C14.1053 6.4041 14.1215 6.27929 14.0723 6.1734Z" fill="#FF070B"/>
                      </svg>
                      <span 
                        className="text-red-500"
                        style={{
                          fontFamily: 'var(--font-sans)',
                          fontWeight: 500,
                          fontStyle: 'normal',
                          fontSize: '14px',
                          lineHeight: '24px',
                          letterSpacing: '0px',
                          textAlign: 'center',
                          leadingTrim: 'none'
                        } as React.CSSProperties & { leadingTrim?: string }}
                      >{t('newTask.priorityUrgent')}</span>
                    </div>
                    <div className="flex w-full items-center justify-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--muted)] py-2 pl-2 text-lg font-normal text-[var(--foreground)]">
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <g clipPath="url(#clip0_3211_43524)">
                        <path d="M14.0168 6.52885C13.9411 6.47204 13.8489 6.44135 13.7542 6.44135H10.4023L13.7192 0.656385C13.8401 0.44708 13.7684 0.17948 13.5591 0.0586234C13.4933 0.0206761 13.4188 0.000451265 13.3429 0H8.68694C8.51763 0.00127175 8.3642 0.10014 8.29311 0.253816L3.84721 9.57448C3.74571 9.79379 3.84122 10.0539 4.06053 10.1554C4.11715 10.1816 4.17868 10.1954 4.24104 10.1958H7.58421L5.17745 17.4598C5.13536 17.6627 5.24133 17.8672 5.43127 17.95C5.62035 18.0491 5.85333 17.9973 5.98263 17.8274L14.1043 7.14147C14.2493 6.94812 14.2101 6.67383 14.0168 6.52885ZM6.87532 15.2369L8.64317 9.86325C8.7205 9.63429 8.59759 9.38597 8.36863 9.30864C8.32453 9.29375 8.27838 9.286 8.23182 9.28563H4.96741L8.95823 0.831393H12.599L9.2733 6.66009C9.15244 6.8694 9.22415 7.137 9.43345 7.25785C9.49922 7.2958 9.57372 7.31602 9.64961 7.31648H12.879L6.87532 15.2369Z" fill="#2E2E2E"/>
                        </g>
                        <defs>
                        <clipPath id="clip0_3211_43524">
                        <rect width="18" height="18" fill="white"/>
                        </clipPath>
                        </defs>
                      </svg>
                      <span 
                        className="text-[var(--muted-foreground)]"
                        style={{
                          fontFamily: 'var(--font-sans)',
                          fontWeight: 400,
                          fontStyle: 'normal',
                          fontSize: '14px',
                          lineHeight: '24px',
                          letterSpacing: '0px',
                          leadingTrim: 'none'
                        } as React.CSSProperties & { leadingTrim?: string }}
                      >{t('newTask.priorityNotUrgent')}</span>
                    </div>
                  </div>
                  {}
                  <div className="flex flex-col md:grid gap-5" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
                    <div
                      className={`mt-5 flex min-h-[250px] min-w-0 flex-col rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--secondary)_88%,var(--card))] p-4 transition-all ${draggedOverQuadrant === 'do' ? 'bg-[var(--muted)] ring-2 ring-[var(--primary)]' : ''}`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                      }}
                      onDragEnter={() => setDraggedOverQuadrant('do')}
                      onDragLeave={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                          setDraggedOverQuadrant(null);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDraggedOverQuadrant(null);
                        const taskId = e.dataTransfer.getData('taskId');
                        if (taskId) {
                          updateTaskPriority(taskId, TaskPriority.URGENT_IMPORTANT);
                        }
                      }}
                    >
                      <div className="mb-3 text-center flex md:block items-center justify-between text-base font-normal text-[var(--foreground)]">
                        <span 
                          style={{
                            fontFamily: 'var(--font-sans)',
                            fontWeight: 400,
                            fontStyle: 'normal',
                            fontSize: '14px',
                            lineHeight: '24px',
                            letterSpacing: '0px',
                            leadingTrim: 'none'
                          } as React.CSSProperties & { leadingTrim?: string }}
                        >{t('newTask.quadrantDo')}</span>
                        <div className="md:hidden flex items-center gap-2">
                          <div className="flex items-center gap-2 rounded-lg bg-red-950/50 px-2 py-1 text-red-300 ring-1 ring-red-800/40">
                            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M14.0723 6.1734C14.0231 6.06779 13.9172 6.00001 13.8005 6.00001H10.2455L13.754 0.460512C13.8125 0.368121 13.8161 0.251121 13.7633 0.155426C13.7105 0.0594141 13.6097 0 13.5005 0H8.70051C8.58682 0 8.483 0.0641953 8.43202 0.165902L3.93202 9.1659C3.88551 9.25861 3.89061 9.369 3.94521 9.45749C4.00012 9.54598 4.09642 9.59998 4.20051 9.59998H7.2854L3.9239 17.5836C3.8666 17.7201 3.91761 17.8785 4.04389 17.9559C4.09248 17.9856 4.14648 18 4.2002 18C4.28629 18 4.3712 17.9631 4.43001 17.8935L14.03 6.49346C14.1053 6.4041 14.1215 6.27929 14.0723 6.1734Z" fill="#FF070B"/>
                            </svg>
                            <span className="text-sm text-red-300">{t('newTask.priorityUrgent')}</span>
                          </div>
                          <div className="flex items-center gap-2 rounded-lg bg-amber-950/45 px-2 py-1 text-amber-200 ring-1 ring-amber-800/35">
                            <svg width="17" height="17" viewBox="0 0 17 17" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <g clipPath="url(#clip0_3640_60923)">
                              <path d="M13.4582 0H3.59461C2.79129 0 2.08594 0.660855 2.08594 1.44309V16.0343C2.08594 16.2962 2.15881 16.5144 2.27627 16.683C2.41673 16.8846 2.64289 17.0001 2.88541 17C3.1147 17 3.35882 16.8979 3.58427 16.7054L7.99723 12.9585C8.13353 12.8421 8.32931 12.7754 8.53286 12.7754C8.73634 12.7754 8.93172 12.8421 9.06841 12.9589L13.4666 16.7048C13.6929 16.8979 13.9202 17.0001 14.149 17.0001C14.5361 17.0001 14.9134 16.7015 14.9134 16.0344V1.44309C14.9134 0.660855 14.2615 0 13.4582 0Z" fill="#F6B000"/>
                              </g>
                              <defs>
                              <clipPath id="clip0_3640_60923">
                              <rect width="17" height="17" fill="white"/>
                              </clipPath>
                              </defs>
                            </svg>
                            <span className="text-sm text-amber-200">{t('newTask.priorityImportant')}</span>
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-2 flex-1 overflow-y-auto auto-rows-min">
                        {modalTasksData
                          .map((task, index) => ({ task, index }))
                          .filter(({ task }) => {
                            const isUrgent = task.urgency === 'urgent';
                            const isImportant = task.importance === 'important';
                            return isUrgent && isImportant;
                          })
                          .filter(({ index }) => !isSearchChecked || !modalTaskChecked[index])
                          .map(({ task, index }) => (
                            <div key={task.id} className="w-full">
                              <TaskCard
                                task={task}
                                index={index}
                                isChecked={!!modalTaskChecked[index]}
                                viewMode="grid"
                                isFromTaskManagement
                                onCheckboxChange={(checked) => {
                                  const newChecked = [...modalTaskChecked];
                                  newChecked[index] = checked;
                                  setModalTaskChecked(newChecked);
                                  const backendTask: Task | undefined = backendTasks.find(t => t._id === task.id);
                                  if (backendTask) {
                                    updateTaskStatus(
                                      backendTask._id,
                                      checked ? TaskStatus.COMPLETED : TaskStatus.IN_PROGRESS
                                    );
                                  }
                                }}
                                onShowInfo={() => handleOpenTaskView(task.id)}
                                onEdit={() => handleOpenTaskView(task.id)}
                                onDelete={() => handleDeleteTask(task.id)}
                              />
                            </div>
                          ))}
                      </div>
                    </div>
                    <div 
                      className={`mt-5 flex min-h-[250px] min-w-0 flex-col rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--secondary)_82%,var(--card))] p-4 transition-all ${draggedOverQuadrant === 'plan' ? 'bg-[var(--muted)] ring-2 ring-[var(--primary)]' : ''}`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                      }}
                      onDragEnter={() => setDraggedOverQuadrant('plan')}
                      onDragLeave={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                          setDraggedOverQuadrant(null);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDraggedOverQuadrant(null);
                        const taskId = e.dataTransfer.getData('taskId');
                        if (taskId) {
                          updateTaskPriority(taskId, TaskPriority.NOT_URGENT_IMPORTANT);
                        }
                      }}
                    >
                      <div className="mb-3 text-center flex md:block items-center justify-between text-base font-normal text-[var(--foreground)]">
                        <span 
                          style={{
                            fontFamily: 'var(--font-sans)',
                            fontWeight: 400,
                            fontStyle: 'normal',
                            fontSize: '14px',
                            lineHeight: '24px',
                            letterSpacing: '0px',
                            leadingTrim: 'none'
                          } as React.CSSProperties & { leadingTrim?: string }}
                        >{t('newTask.quadrantPlan')}</span>
                        <div className="md:hidden flex items-center gap-2">
                          <div className="flex items-center gap-2 rounded-lg bg-red-950/40 px-2 py-1 text-red-300 ring-1 ring-red-800/35">
                            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <g clipPath="url(#clip0_3640_61022)">
                              <path d="M14.0168 6.52885C13.9411 6.47204 13.8489 6.44135 13.7542 6.44135H10.4023L13.7192 0.656385C13.8401 0.44708 13.7684 0.17948 13.5591 0.0586234C13.4933 0.0206761 13.4188 0.000451265 13.3429 0H8.68694C8.51763 0.00127175 8.3642 0.10014 8.29311 0.253816L3.84721 9.57448C3.74571 9.79379 3.84122 10.0539 4.06053 10.1554C4.11715 10.1816 4.17868 10.1954 4.24104 10.1958H7.58421L5.17745 17.4598C5.13536 17.6627 5.24133 17.8672 5.43127 17.95C5.62035 18.0491 5.85333 17.9973 5.98263 17.8274L14.1043 7.14147C14.2493 6.94812 14.2101 6.67383 14.0168 6.52885ZM6.87532 15.2369L8.64317 9.86325C8.7205 9.63429 8.59759 9.38597 8.36863 9.30864C8.32453 9.29375 8.27838 9.286 8.23182 9.28563H4.96741L8.95823 0.831393H12.599L9.2733 6.66009C9.15244 6.8694 9.22415 7.137 9.43345 7.25785C9.49922 7.2958 9.57372 7.31602 9.64961 7.31648H12.879L6.87532 15.2369Z" fill="#2E2E2E"/>
                              </g>
                              <defs>
                              <clipPath id="clip0_3640_61022">
                              <rect width="18" height="18" fill="white"/>
                              </clipPath>
                              </defs>
                            </svg>
                          </div>
                          <div className="flex items-center gap-2 rounded-lg bg-amber-950/45 px-2 py-1 text-amber-200 ring-1 ring-amber-800/35">
                            <svg width="17" height="17" viewBox="0 0 17 17" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <g clipPath="url(#clip0_3640_60923)">
                              <path d="M13.4582 0H3.59461C2.79129 0 2.08594 0.660855 2.08594 1.44309V16.0343C2.08594 16.2962 2.15881 16.5144 2.27627 16.683C2.41673 16.8846 2.64289 17.0001 2.88541 17C3.1147 17 3.35882 16.8979 3.58427 16.7054L7.99723 12.9585C8.13353 12.8421 8.32931 12.7754 8.53286 12.7754C8.73634 12.7754 8.93172 12.8421 9.06841 12.9589L13.4666 16.7048C13.6929 16.8979 13.9202 17.0001 14.149 17.0001C14.5361 17.0001 14.9134 16.7015 14.9134 16.0344V1.44309C14.9134 0.660855 14.2615 0 13.4582 0Z" fill="#F6B000"/>
                              </g>
                              <defs>
                              <clipPath id="clip0_3640_60923">
                              <rect width="17" height="17" fill="white"/>
                              </clipPath>
                              </defs>
                            </svg>
                            <span className="text-sm text-amber-200">{t('newTask.priorityImportant')}</span>
                          </div>
                        </div>

                      </div>
                      <div className="grid grid-cols-1 gap-2 flex-1 overflow-y-auto auto-rows-min">
                        {modalTasksData
                          .map((task, index) => ({ task, index }))
                          .filter(({ task }) => {
                            const isNotUrgent = task.urgency === 'notUrgent';
                            const isImportant = task.importance === 'important';
                            return isNotUrgent && isImportant;
                          })
                          .filter(({ index }) => !isSearchChecked || !modalTaskChecked[index])
                          .map(({ task, index }) => (
                            <div key={task.id} className="w-full">
                              <TaskCard
                                task={task}
                                index={index}
                                isChecked={!!modalTaskChecked[index]}
                                viewMode="grid"
                                isFromTaskManagement
                                onCheckboxChange={(checked) => {
                                  const newChecked = [...modalTaskChecked];
                                  newChecked[index] = checked;
                                  setModalTaskChecked(newChecked);
                                  const backendTask: Task | undefined = backendTasks.find(t => t._id === task.id);
                                  if (backendTask) {
                                    updateTaskStatus(
                                      backendTask._id,
                                      checked ? TaskStatus.COMPLETED : TaskStatus.IN_PROGRESS
                                    );
                                  }
                                }}
                                onShowInfo={() => handleOpenTaskView(task.id)}
                                onEdit={() => handleOpenTaskView(task.id)}
                                onDelete={() => handleDeleteTask(task.id)}
                              />
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                  {}
                  <div className="flex flex-col md:grid gap-5" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
                    <div
                      className={`flex min-h-[250px] min-w-0 flex-col rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--secondary)_75%,var(--card))] p-4 transition-all ${draggedOverQuadrant === 'delegate' ? 'bg-[var(--muted)] ring-2 ring-[var(--primary)]' : ''}`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                      }}
                      onDragEnter={() => setDraggedOverQuadrant('delegate')}
                      onDragLeave={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                          setDraggedOverQuadrant(null);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDraggedOverQuadrant(null);
                        const taskId = e.dataTransfer.getData('taskId');
                        if (taskId) {
                          updateTaskPriority(taskId, TaskPriority.URGENT_NOT_IMPORTANT);
                        }
                      }}
                    >
                      <div className="mb-3 text-center flex md:block items-center justify-between text-base font-normal text-[var(--foreground)]">
                        <span 
                          style={{
                            fontFamily: 'var(--font-sans)',
                            fontWeight: 400,
                            fontStyle: 'normal',
                            fontSize: '14px',
                            lineHeight: '24px',
                            letterSpacing: '0px',
                            leadingTrim: 'none'
                          } as React.CSSProperties & { leadingTrim?: string }}
                        >{t('newTask.quadrantDelegate')}</span>
                        <div className="md:hidden flex items-center gap-2">
                          <div className="flex items-center gap-2 rounded-lg bg-red-950/50 px-2 py-1 text-red-300 ring-1 ring-red-800/40">
                            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M14.0723 6.1734C14.0231 6.06779 13.9172 6.00001 13.8005 6.00001H10.2455L13.754 0.460512C13.8125 0.368121 13.8161 0.251121 13.7633 0.155426C13.7105 0.0594141 13.6097 0 13.5005 0H8.70051C8.58682 0 8.483 0.0641953 8.43202 0.165902L3.93202 9.1659C3.88551 9.25861 3.89061 9.369 3.94521 9.45749C4.00012 9.54598 4.09642 9.59998 4.20051 9.59998H7.2854L3.9239 17.5836C3.8666 17.7201 3.91761 17.8785 4.04389 17.9559C4.09248 17.9856 4.14648 18 4.2002 18C4.28629 18 4.3712 17.9631 4.43001 17.8935L14.03 6.49346C14.1053 6.4041 14.1215 6.27929 14.0723 6.1734Z" fill="#FF070B"/>
                            </svg>
                            <span className="text-sm text-red-300">{t('newTask.priorityUrgent')}</span>
                          </div>
                          <div className="flex items-center gap-2 rounded-lg bg-amber-950/35 px-2 py-1 text-amber-200 ring-1 ring-amber-800/30">
                            <svg width="17" height="17" viewBox="0 0 17 17" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <g clipPath="url(#clip0_3640_61117)">
                              <path d="M13.301 0L3.6979 0C2.85159 0 2.13281 0.682579 2.13281 1.56509L2.13281 15.7649C2.1353 16.885 3.50345 17.4106 4.28126 16.6243L7.94171 12.9649C8.23505 12.6589 8.76389 12.6589 9.05723 12.9649L12.7177 16.6243C13.4958 17.4109 14.8638 16.8845 14.8661 15.7649L14.8661 1.56509C14.8661 0.682579 14.1474 0 13.301 0ZM13.87 15.7649C13.8687 16.0021 13.5739 16.0804 13.4214 15.9193C12.6896 15.1864 10.6028 13.1002 9.76229 12.2612C9.10106 11.5697 7.89888 11.5695 7.23795 12.2599C6.65731 12.8394 5.52074 13.9757 4.62478 14.8714L3.58245 15.9132C3.43226 16.0726 3.13377 16.0194 3.12895 15.774L3.12895 1.56509C3.12895 1.24691 3.38686 0.996176 3.6979 0.996176L13.301 0.996176C13.6116 0.996176 13.87 1.24651 13.87 1.56509L13.87 15.7649Z" fill="#2E2E2E"/>
                              </g>
                              <defs>
                              <clipPath id="clip0_3640_61117">
                              <rect width="17" height="17" fill="white"/>
                              </clipPath>
                              </defs>
                            </svg>
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-2 flex-1 overflow-y-auto auto-rows-min">
                        {modalTasksData
                          .map((task, index) => ({ task, index }))
                          .filter(({ task }) => {
                            const isUrgent = task.urgency === 'urgent';
                            const isNotImportant = task.importance === 'notImportant';
                            return isUrgent && isNotImportant;
                          })
                          .filter(({ index }) => !isSearchChecked || !modalTaskChecked[index])
                          .map(({ task, index }) => (
                            <div key={task.id} className="w-full">
                              <TaskCard
                                task={task}
                                index={index}
                                isChecked={!!modalTaskChecked[index]}
                                viewMode="grid"
                                isFromTaskManagement
                                onCheckboxChange={(checked) => {
                                  const newChecked = [...modalTaskChecked];
                                  newChecked[index] = checked;
                                  setModalTaskChecked(newChecked);
                                  const backendTask: Task | undefined = backendTasks.find(t => t._id === task.id);
                                  if (backendTask) {
                                    updateTaskStatus(
                                      backendTask._id,
                                      checked ? TaskStatus.COMPLETED : TaskStatus.IN_PROGRESS
                                    );
                                  }
                                }}
                                onShowInfo={() => handleOpenTaskView(task.id)}
                                onEdit={() => handleOpenTaskView(task.id)}
                                onDelete={() => handleDeleteTask(task.id)}
                              />
                            </div>
                          ))}
                      </div>
                    </div>
                    <div 
                      className={`flex min-h-[250px] min-w-0 flex-col rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--secondary)_68%,var(--card))] p-4 transition-all ${draggedOverQuadrant === 'eliminate' ? 'bg-[var(--muted)] ring-2 ring-[var(--primary)]' : ''}`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                      }}
                      onDragEnter={() => setDraggedOverQuadrant('eliminate')}
                      onDragLeave={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                          setDraggedOverQuadrant(null);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDraggedOverQuadrant(null);
                        const taskId = e.dataTransfer.getData('taskId');
                        if (taskId) {
                          updateTaskPriority(taskId, TaskPriority.NOT_URGENT_NOT_IMPORTANT);
                        }
                      }}
                    >
                    <div className="mb-3 text-center flex md:block items-center justify-between text-base font-normal text-[var(--foreground)]">
                        <span 
                          style={{
                            fontFamily: 'var(--font-sans)',
                            fontWeight: 400,
                            fontStyle: 'normal',
                            fontSize: '14px',
                            lineHeight: '24px',
                            letterSpacing: '0px',
                            leadingTrim: 'none'
                          } as React.CSSProperties & { leadingTrim?: string }}
                        >{t('newTask.quadrantEliminate')}</span>
                        <div className="md:hidden flex items-center gap-2">
                          <div className="flex items-center gap-2 rounded-lg bg-red-950/40 px-2 py-1 text-red-300 ring-1 ring-red-800/35">
                            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <g clipPath="url(#clip0_3640_61022)">
                              <path d="M14.0168 6.52885C13.9411 6.47204 13.8489 6.44135 13.7542 6.44135H10.4023L13.7192 0.656385C13.8401 0.44708 13.7684 0.17948 13.5591 0.0586234C13.4933 0.0206761 13.4188 0.000451265 13.3429 0H8.68694C8.51763 0.00127175 8.3642 0.10014 8.29311 0.253816L3.84721 9.57448C3.74571 9.79379 3.84122 10.0539 4.06053 10.1554C4.11715 10.1816 4.17868 10.1954 4.24104 10.1958H7.58421L5.17745 17.4598C5.13536 17.6627 5.24133 17.8672 5.43127 17.95C5.62035 18.0491 5.85333 17.9973 5.98263 17.8274L14.1043 7.14147C14.2493 6.94812 14.2101 6.67383 14.0168 6.52885ZM6.87532 15.2369L8.64317 9.86325C8.7205 9.63429 8.59759 9.38597 8.36863 9.30864C8.32453 9.29375 8.27838 9.286 8.23182 9.28563H4.96741L8.95823 0.831393H12.599L9.2733 6.66009C9.15244 6.8694 9.22415 7.137 9.43345 7.25785C9.49922 7.2958 9.57372 7.31602 9.64961 7.31648H12.879L6.87532 15.2369Z" fill="#2E2E2E"/>
                              </g>
                              <defs>
                              <clipPath id="clip0_3640_61022">
                              <rect width="18" height="18" fill="white"/>
                              </clipPath>
                              </defs>
                            </svg>
                          </div>
                          <div className="flex items-center gap-2 rounded-lg bg-amber-950/35 px-2 py-1 text-amber-200 ring-1 ring-amber-800/30">
                            <svg width="17" height="17" viewBox="0 0 17 17" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <g clipPath="url(#clip0_3640_61117)">
                              <path d="M13.301 0L3.6979 0C2.85159 0 2.13281 0.682579 2.13281 1.56509L2.13281 15.7649C2.1353 16.885 3.50345 17.4106 4.28126 16.6243L7.94171 12.9649C8.23505 12.6589 8.76389 12.6589 9.05723 12.9649L12.7177 16.6243C13.4958 17.4109 14.8638 16.8845 14.8661 15.7649L14.8661 1.56509C14.8661 0.682579 14.1474 0 13.301 0ZM13.87 15.7649C13.8687 16.0021 13.5739 16.0804 13.4214 15.9193C12.6896 15.1864 10.6028 13.1002 9.76229 12.2612C9.10106 11.5697 7.89888 11.5695 7.23795 12.2599C6.65731 12.8394 5.52074 13.9757 4.62478 14.8714L3.58245 15.9132C3.43226 16.0726 3.13377 16.0194 3.12895 15.774L3.12895 1.56509C3.12895 1.24691 3.38686 0.996176 3.6979 0.996176L13.301 0.996176C13.6116 0.996176 13.87 1.24651 13.87 1.56509L13.87 15.7649Z" fill="#2E2E2E"/>
                              </g>
                              <defs>
                              <clipPath id="clip0_3640_61117">
                              <rect width="17" height="17" fill="white"/>
                              </clipPath>
                              </defs>
                            </svg>
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-2 flex-1 overflow-y-auto auto-rows-min">
                        {modalTasksData
                          .map((task, index) => ({ task, index }))
                          .filter(({ task }) => {
                            const isNotUrgent = task.urgency === 'notUrgent';
                            const isNotImportant = task.importance === 'notImportant';
                            return isNotUrgent && isNotImportant;
                          })
                          .filter(({ index }) => !isSearchChecked || !modalTaskChecked[index])
                          .map(({ task, index }) => (
                            <div key={task.id} className="w-full">
                              <TaskCard
                                task={task}
                                index={index}
                                isChecked={!!modalTaskChecked[index]}
                                viewMode="grid"
                                isFromTaskManagement
                                onCheckboxChange={(checked) => {
                                  const newChecked = [...modalTaskChecked];
                                  newChecked[index] = checked;
                                  setModalTaskChecked(newChecked);
                                  const backendTask: Task | undefined = backendTasks.find(t => t._id === task.id);
                                  if (backendTask) {
                                    updateTaskStatus(
                                      backendTask._id,
                                      checked ? TaskStatus.COMPLETED : TaskStatus.IN_PROGRESS
                                    );
                                  }
                                }}
                                onShowInfo={() => handleOpenTaskView(task.id)}
                                onEdit={() => handleOpenTaskView(task.id)}
                                onDelete={() => handleDeleteTask(task.id)}
                              />
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : taskViewMode === 'list' ? (() => {
                const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

                const formatScheduleDate = (date: Date) => {
                  return `${dayNames[date.getDay()]}, ${date.getDate()} ${monthNames[date.getMonth()]}`;
                };

                const formatTime = (dateStr?: string) => {
                  if (!dateStr) return t('newTask.noTime');
                  const date = new Date(dateStr);
                  if (Number.isNaN(date.getTime())) return t('newTask.noTime');
                  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                };

                const renderCard = ({ task, index }: { task: ModalTaskData; index: number }) => {
                  return (
                    <div key={task.id} className="relative pl-10">
                      <div className="absolute left-5 top-0 bottom-0 w-px bg-gray-200" aria-hidden />
                      <div className="absolute left-[14px] top-4 w-2.5 h-2.5 rounded-full border-2 border-white bg-dream-primary shadow-sm" aria-hidden />
                      <div className="flex-1 min-w-0">
                        <TaskCard
                          task={task}
                          index={index}
                          isChecked={!!modalTaskChecked[index]}
                          viewMode="list"
                          isFromTaskManagement
                          onCheckboxChange={(checked) => {
                            const newChecked = [...modalTaskChecked];
                            newChecked[index] = checked;
                            setModalTaskChecked(newChecked);
                            const backendTask: Task | undefined = backendTasks.find(t => t._id === task.id);
                            if (backendTask) {
                              updateTaskStatus(
                                backendTask._id,
                                checked ? TaskStatus.COMPLETED : TaskStatus.IN_PROGRESS
                              );
                            }
                          }}
                          onShowInfo={() => handleOpenTaskView(task.id)}
                          onEdit={() => handleOpenTaskView(task.id)}
                          onDelete={() => handleDeleteTask(task.id)}
                        />
                      </div>
                    </div>
                  );
                };

                return (
                  <>
                  <div className="flex flex-col gap-3 md:max-h-[90vh] pr-2">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap gap-3">
                        <div ref={listFromRef} className="relative">
                          <span className="text-sm text-gray-600 mr-2">{t('newTask.dateFrom')}</span>
                          <button
                            type="button"
                            className="h-10 rounded-full border border-gray-300 px-4 text-sm bg-white hover:border-dream-primary transition"
                            onClick={() => {
                              setIsListFromOpen(!isListFromOpen);
                              setIsListToOpen(false);
                            }}
                          >
                            {formatDisplayDate(listDateFrom)}
                          </button>
                          {isListFromOpen && (
                            <div className="absolute z-[70] mt-2 w-[280px] bg-white rounded-2xl shadow-xl border border-gray-200 p-3">
                              <Calendar
                                initialDate={listDateFrom ? new Date(listDateFrom) : new Date()}
                                onDayClick={(day, date) => {
                                  const year = date.getFullYear();
                                  const month = String(date.getMonth() + 1).padStart(2, '0');
                                  const dayStr = String(day).padStart(2, '0');
                                  setListDateFrom(`${year}-${month}-${dayStr}`);
                                  setIsListFromOpen(false);
                                }}
                                showHeader
                              />
                            </div>
                          )}
                        </div>

                        <div ref={listToRef} className="relative">
                          <span className="text-sm text-gray-600 mr-2">{t('newTask.dateTo')}</span>
                          <button
                            type="button"
                            className="h-10 rounded-full border border-gray-300 px-4 text-sm bg-white hover:border-dream-primary transition"
                            onClick={() => {
                              setIsListToOpen(!isListToOpen);
                              setIsListFromOpen(false);
                            }}
                          >
                            {formatDisplayDate(listDateTo)}
                          </button>
                          {isListToOpen && (
                            <div className="absolute z-[70] mt-2 w-[280px] bg-white rounded-2xl shadow-xl border border-gray-200 p-3">
                              <Calendar
                                initialDate={listDateTo ? new Date(listDateTo) : new Date()}
                                onDayClick={(day, date) => {
                                  const year = date.getFullYear();
                                  const month = String(date.getMonth() + 1).padStart(2, '0');
                                  const dayStr = String(day).padStart(2, '0');
                                  setListDateTo(`${year}-${month}-${dayStr}`);
                                  setIsListToOpen(false);
                                }}
                                showHeader
                              />
                            </div>
                          )}
                        </div>

                        {(listDateFrom || listDateTo) && (
                          <button
                            type="button"
                            onClick={() => {
                              setListDateFrom('');
                              setListDateTo('');
                              setIsListFromOpen(false);
                              setIsListToOpen(false);
                            }}
                            className="h-10 rounded-full border border-gray-300 px-4 text-sm bg-white hover:border-dream-primary transition text-gray-700"
                            title={t('newTask.resetDate')}
                          >{t('newTask.resetDate')}</button>
                        )}
                      </div>

                      <div className="relative">
                        <button
                          type="button"
                          className="flex items-center gap-2 px-3 py-2 rounded-full border border-gray-300 bg-white hover:border-dream-primary transition"
                          onClick={() => setIsListSettingsOpen(!isListSettingsOpen)}
                          aria-label={t('newTask.settings')}
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M19.14 12.94C19.18 12.64 19.2 12.33 19.2 12C19.2 11.67 19.18 11.36 19.14 11.06L20.89 9.65C21.05 9.52 21.1 9.29 21.02 9.09L19.32 5.51C19.22 5.31 18.99 5.22 18.79 5.29L16.64 6.16C16.2 5.82 15.72 5.53 15.21 5.3L14.91 3.04C14.88 2.82 14.69 2.66 14.47 2.66H9.53C9.31 2.66 9.12 2.82 9.09 3.04L8.79 5.3C8.28 5.53 7.8 5.82 7.36 6.16L5.21 5.29C5.01 5.21 4.78 5.31 4.68 5.51L2.98 9.09C2.9 9.29 2.95 9.52 3.11 9.65L4.86 11.06C4.82 11.36 4.8 11.68 4.8 12C4.8 12.32 4.82 12.64 4.86 12.94L3.11 14.35C2.95 14.48 2.9 14.71 2.98 14.91L4.68 18.49C4.78 18.69 5.01 18.78 5.21 18.71L7.36 17.84C7.8 18.18 8.28 18.47 8.79 18.7L9.09 20.96C9.12 21.18 9.31 21.34 9.53 21.34H14.47C14.69 21.34 14.88 21.18 14.91 20.96L15.21 18.7C15.72 18.47 16.2 18.18 16.64 17.84L18.79 18.71C18.99 18.79 19.22 18.69 19.32 18.49L21.02 14.91C21.1 14.71 21.05 14.48 20.89 14.35L19.14 12.94ZM12 15.6C10.01 15.6 8.4 13.99 8.4 12C8.4 10.01 10.01 8.4 12 8.4C13.99 8.4 15.6 10.01 15.6 12C15.6 13.99 13.99 15.6 12 15.6Z" fill="#4B5563"/>
                          </svg>
                          <span className="text-sm text-[var(--foreground)]">{t('newTask.settings')}</span>
                        </button>
                        {isListSettingsOpen && (
                          <div className="absolute right-0 z-50 mt-2 flex w-56 flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-xl">
                            <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--foreground)]">
                              <input
                                type="checkbox"
                                checked={showWithDate}
                                onChange={(e) => setShowWithDate(e.target.checked)}
                              />
                              <span>{t('newTask.tasksWithDate')}</span>
                            </label>
                            <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--foreground)]">
                              <input
                                type="checkbox"
                                checked={showOverdueBlock}
                                onChange={(e) => setShowOverdueBlock(e.target.checked)}
                              />
                              <span>{t('newTask.overdue')}</span>
                            </label>
                            <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--foreground)]">
                              <input
                                type="checkbox"
                                checked={showNoDateBlock}
                                onChange={(e) => setShowNoDateBlock(e.target.checked)}
                              />
                              <span>{t('newTask.noDate')}</span>
                            </label>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-4 min-h-[260px] max-h-[75vh]">
                      {/* Колонка: задачи с датой */}
                      {showWithDate && (
                      <div className="flex-1 min-w-0 flex flex-col">
                        <div className="flex-1 overflow-y-auto flex flex-col gap-4">
                          {grouped.length === 0 ? (
                            <div className="py-6 text-center text-[var(--muted-foreground)]">{t('newTask.noTasksInRange')}</div>
                          ) : (
                            grouped.map((group) => {
                              const isTodayGroup = group.date.toDateString() === new Date().toDateString();
                              return (
                                <div
                                  key={group.date.toISOString()}
                                  className="flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm"
                                >
                                  <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-2xl border-b border-[var(--border)] bg-[var(--muted)] px-4 py-3">
                                    <div className="flex items-center gap-3">
                                      <span className="px-3 py-1 rounded-full bg-dream-secondary text-dream-primary font-normal">
                                        {formatScheduleDate(group.date)}
                                      </span>
                                      {isTodayGroup && (
                                        <span className="rounded-full bg-emerald-950/50 px-2 py-1 text-xs font-medium text-emerald-200 ring-1 ring-emerald-800/40">{t('newTask.today')}</span>
                                      )}
                                    </div>
                                    <span className="text-sm text-[var(--muted-foreground)]">
                                      {group.items.length} {group.items.length === 1 ? t('newTask.taskCount_1') : group.items.length < 5 ? t('newTask.taskCount_2') : t('newTask.taskCount_0')}
                                    </span>
                                  </div>
                                  <div className="relative px-2 pb-4 pt-1">
                                    <div className="absolute bottom-0 left-6 top-0 w-px bg-[var(--border)]" aria-hidden />
                                    <div className="flex flex-col gap-3 pt-1">
                                      {group.items.map(renderCard)}
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                      )}

                      {/* Колонка: просроченные */}
                      {showOverdueBlock && (
                      <div className="hidden min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-red-900/35 bg-[var(--card)] shadow-sm md:flex">
                        <div className="flex items-center justify-between border-b border-red-900/30 bg-red-950/35 px-4 py-3">
                          <span className="font-normal text-red-300">{t('newTask.overdue')}</span>
                          <span className="text-sm text-red-400">{overdueTasks.length}</span>
                        </div>
                        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
                          {overdueTasks.length === 0 ? (
                            <div className="text-sm text-[var(--muted-foreground)]">{t('newTask.noOverdueTasks')}</div>
                          ) : (
                            overdueTasks
                              .sort((a, b) => new Date(a.task.endDate!).getTime() - new Date(b.task.endDate!).getTime())
                              .map(renderCard)
                          )}
                        </div>
                      </div>
                      )}

                      {/* Колонка: без даты */}
                      {showNoDateBlock && (
                      <div className="hidden min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm md:flex">
                        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--muted)] px-4 py-3">
                          <span className="font-normal text-[var(--foreground)]">{t('newTask.noDate')}</span>
                          <span className="text-sm text-[var(--muted-foreground)]">{noDateTasks.length}</span>
                        </div>
                        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
                          {noDateTasks.length === 0 ? (
                            <div className="text-sm text-[var(--muted-foreground)]">{t('newTask.noNoDateTasks')}</div>
                          ) : (
                            noDateTasks.map(renderCard)
                          )}
                        </div>
                      </div>
                      )}

                      {!showWithDate && !showOverdueBlock && !showNoDateBlock && (
                        <div className="flex min-w-0 flex-1 items-center justify-center text-sm text-[var(--muted-foreground)]">
                          {t('newTask.allBlocksHidden')}
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Модалки внутри линейного вида, чтобы иметь доступ к данным */}
                  {showOverdueModal && (
                    <div className="fixed inset-0 bg-black/30 z-[9999] flex items-center justify-center p-4">
                      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
                        <div className="flex items-center justify-between p-4 border-b">
                          <span className="font-normal text-lg text-red-600">{t('newTask.overdueTasksTitle')}</span>
                          <button onClick={() => setShowOverdueModal(false)} aria-label={t('newTask.cancel')}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
                          {overdueTasks.length === 0 ? (
                            <div className="text-gray-500 text-sm">{t('newTask.noOverdueTasks')}</div>
                          ) : (
                            overdueTasks
                              .sort((a, b) => new Date(a.task.endDate!).getTime() - new Date(b.task.endDate!).getTime())
                              .map(renderCard)
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {showNoDateModal && (
                    <div className="fixed inset-0 bg-black/30 z-[9999] flex items-center justify-center p-4">
                      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
                        <div className="flex items-center justify-between p-4 border-b">
                          <span className="font-normal text-lg text-gray-700">{t('newTask.noDateTasksTitle')}</span>
                          <button onClick={() => setShowNoDateModal(false)} aria-label={t('newTask.cancel')}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
                          {noDateTasks.length === 0 ? (
                            <div className="text-gray-500 text-sm">{t('newTask.noNoDateTasks')}</div>
                          ) : (
                            noDateTasks.map(renderCard)
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  </>
                );
              })()
            : (
              <div className={`
                flex gap-4 flex-nowrap w-full max-w-full min-w-0 ${taskViewMode === 'columns' ? 'overflow-x-auto pb-1' : 'overflow-y-auto'} pr-2 ${taskViewMode === 'columns' ? 'items-stretch flex-1 min-h-0' : 'h-full'}`}
                style={taskViewMode === 'columns' ? { alignSelf: 'stretch', height: '100%' } : {}}
                >
                {modalTaskCategories.filter(col => col.key !== 'all').map((col) => {
                  const tasksInColumn = modalTasksData
                    .filter(task => taskCategoryById[task.id] === col.key)
                    .filter((task) => {
                      const originalIndex = modalTasksData.findIndex(t => t.id === task.id);
                      return !isSearchChecked || !modalTaskChecked[originalIndex];
                    });
                  const tasksCount = tasksInColumn.length;

                  return (
                    <div
                    key={col.key}
                    className="flex min-h-0 min-w-[min(100%,260px)] flex-1 basis-1/2 flex-col rounded-[32px] border border-[var(--border)] bg-gradient-to-br from-[var(--secondary)] to-[var(--card)] p-2.5 shadow-sm"
                    style={{ height: '100%', alignSelf: 'stretch', maxWidth: '50%' }}
                    >
                      <div className="mb-1 flex shrink-0 items-center justify-between">
                        <div className="flex items-center gap-1 font-normal text-[var(--foreground)]">
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg" className="mr-1 shrink-0 text-[var(--primary)]">
                            <rect x="1" y="1" width="8" height="8" rx="4" fill="currentColor"/>
                          </svg>
                          <span
                            className="text-[var(--foreground)]"
                            style={{
                              fontFamily: 'var(--font-sans)',
                              fontWeight: 400,
                              fontStyle: 'normal',
                              fontSize: '20px',
                              lineHeight: '28px',
                              letterSpacing: '-0.01em',
                              leadingTrim: 'none'
                            } as React.CSSProperties & { leadingTrim?: string }}
                          >
                            {col.label}
                          </span>
                          <span
                            className="text-[var(--muted-foreground)]"
                            style={{
                              fontFamily: 'var(--font-sans)',
                              fontWeight: 400,
                              fontStyle: 'normal',
                              fontSize: '20px',
                              lineHeight: '28px',
                              letterSpacing: '-0.01em',
                              leadingTrim: 'none'
                            } as React.CSSProperties & { leadingTrim?: string }}
                          >
                            ({tasksCount})
                          </span>
                        </div>
                      </div>
                      <div
                        className="mt-2 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-xl border border-[var(--border)]/60 bg-[color-mix(in_srgb,var(--muted)_40%,transparent)] p-2"
                        onDragOver={allowDrop}
                        onDrop={(e) => handleTaskDrop(e, col.key)}
                        onDragEnter={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                      >
                        {tasksInColumn.length === 0 ? (
                          <div className="flex flex-1 flex-col items-center justify-center gap-1 py-10 text-center text-sm text-[var(--muted-foreground)]">
                            <span>{t('newTask.noTasks')}</span>
                            <span className="text-xs opacity-80">{t('newTask.dragHere')}</span>
                          </div>
                        ) : (
                          tasksInColumn.map((task) => {
                            const originalIndex = modalTasksData.findIndex(t => t.id === task.id);
                            return (
                              <div
                                key={task.id}
                                draggable
                                onDragStart={(e) => handleTaskDragStart(e, task.id)}
                                onDragEnd={handleTaskDragEnd}
                                className="cursor-move"
                                style={{ userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'none' }}
                              >
                                <TaskCard
                                  task={task}
                                  index={originalIndex}
                                  isChecked={!!modalTaskChecked[originalIndex]}
                                  viewMode="columns"
                                  isFromTaskManagement
                                  onCheckboxChange={(checked) => {
                                    if (isDragOperation.current || isDragging.current) {
                                      return;
                                    }
                                    const newChecked = [...modalTaskChecked];
                                    newChecked[originalIndex] = checked;
                                    setModalTaskChecked(newChecked);
                                    const backendTask: Task | undefined = backendTasks.find(t => t._id === task.id);
                                    if (backendTask) {
                                      updateTaskStatus(
                                        backendTask._id,
                                        checked ? TaskStatus.COMPLETED : TaskStatus.IN_PROGRESS
                                      );
                                    }
                                  }}
                                  onShowInfo={() => handleOpenTaskView(task.id)}
                                  onEdit={() => handleOpenTaskView(task.id)}
                                  onDelete={() => handleDeleteTask(task.id)}
                                />
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            </div>

            </div>
            <div className={`absolute inset-0 flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-t-[25px] border border-[var(--border)] bg-[var(--card)] p-5 pb-20 text-[var(--card-foreground)] transition-transform duration-300 md:relative md:inset-auto md:translate-x-0 md:rounded-2xl md:pb-0 md:self-stretch ${
              carouselSlide === 1 ? 'translate-x-0' : 'translate-x-full md:translate-x-0'
            } ${!showCreateTask ? 'md:hidden' : ''}`}>
            {/* Заголовок */}
            <div className="relative flex justify-center">
              <span className="text-dream-primary" style={{
                fontFamily: 'var(--font-sans)',
                fontWeight: 400,
                fontSize: '28px',
                lineHeight: '100%',
              }}>{t('newTask.newTaskButton')}</span>
              <div className="absolute -right-3 -top-2 md:block">
                <button type="button" onClick={() => {
                  setShowCreateTask(false);
                }} aria-label={t('newTask.cancel')} className="hidden md:block">
                  <svg width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22.5 7.5L7.5 22.5" stroke="#169600" strokeWidth="3" strokeLinecap="round"/>
                    <path d="M7.5 7.5L22.5 22.5" stroke="#169600" strokeWidth="3" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>
              {/* Крестик для мобильных */}
              <button
                type="button"
                onClick={() => setShowCreateTask(false)}
                className="absolute top-4 right-4 md:hidden p-2 bg-white/90 rounded-full shadow-lg z-10"
                aria-label={t('newTask.cancel')}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18 6L6 18M6 6l12 12" stroke="#169600" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>

            {/* Контент */}
            <div className="flex flex-col gap-5 overflow-y-auto pr-2 md:pr-0 md:pb-5">
              {/* Поля ввода */}
              <div className="flex flex-col gap-3 mt-5">
                <div className="flex gap-3 flex-col md:flex-row items-start">
                  {/* Левая колонка */}
                  <div className="flex flex-col gap-3 flex-1">
                    <div className="w-full">
                      <div className="flex items-baseline gap-1 mb-1">
                        <span className="text-black" style={{
                          fontFamily: 'var(--font-sans)',
                          fontWeight: 400,
                          fontSize: '18px',
                          lineHeight: '150%',
                          letterSpacing: '-0.01em',
                        }}>{t('newTask.formTitle')}</span>
                        <span className="text-red-600 text-lg font-normal leading-none">*</span>
                      </div>
                      <div className="relative w-full">
                        <input
                          placeholder={t('newTask.formTitlePlaceholder')}
                          maxLength={48}
                          className="w-full flex-1 h-9 border-2 border-dream-primary/50 bg-dream-secondary rounded-full pl-5 pr-14 py-2 focus:outline-none"
                          type="text"
                          value={taskForm.title}
                          onChange={(e) => setTaskForm((prev) => ({ ...prev, title: e.target.value.slice(0, 48) }))}
                          style={{
                            fontFamily: 'var(--font-sans)',
                            fontWeight: 100,
                            fontSize: '18px',
                            lineHeight: '100%',
                          }}
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-500">
                          {taskForm.title.length}/48
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Правая колонка */}
                  <div className="flex flex-col gap-3 flex-1">
                    <div className="w-full">
                      <div className="flex items-center gap-1 mb-1">
                        <span className="text-black" style={{
                          fontFamily: 'var(--font-sans)',
                          fontWeight: 400,
                          fontSize: '18px',
                          lineHeight: '150%',
                          letterSpacing: '-0.01em',
                        }}>{t('newTask.searchLead')}</span>
                      </div>
                      <div className="relative w-full" ref={phoneSearchRef}>
                        <input
                          placeholder={t('newTask.searchLeadPlaceholder')}
                          className="w-full flex-1 h-9 border-2 border-dream-primary/50 bg-dream-secondary rounded-full pl-5 pr-5 py-2 focus:outline-none"
                          type="text"
                          value={taskForm.leadId && taskForm.clientName ? taskForm.clientName : (taskForm.phoneSearch || '')}
                          onChange={(e) => {
                            setTaskForm((prev) => ({ ...prev, phoneSearch: e.target.value, leadId: '', clientName: '' }));
                            setIsPhoneSearchOpen(e.target.value.length > 0);
                          }}
                          onFocus={() => {
                            const searchValue = taskForm.leadId ? '' : taskForm.phoneSearch;
                            if (searchValue && searchValue.length > 0) {
                              setIsPhoneSearchOpen(true);
                            }
                          }}
                          style={{
                            fontFamily: 'var(--font-sans)',
                            fontWeight: 100,
                            fontSize: '18px',
                            lineHeight: '100%',
                          }}
                        />
                      
                        {/* Выпадающий список результатов поиска */}
                        {isPhoneSearchOpen && !taskForm.leadId && taskForm.phoneSearch && (() => {
                          const filteredLeads = backendLeads.filter(lead => 
                            lead.name?.toLowerCase().includes(taskForm.phoneSearch?.toLowerCase() || '') ||
                            lead.phone?.includes(taskForm.phoneSearch || '')
                          );
                          return filteredLeads.length > 0 && (
                            <div className="absolute top-full mt-2 w-full bg-white border-2 border-dream-primary rounded-[20px] shadow-lg max-h-60 overflow-y-auto z-50">
                              {filteredLeads.slice(0, 10).map((lead) => (
                                <button
                                  key={lead._id}
                                  type="button"
                                  onClick={() => {
                                    setTaskForm((prev) => ({ 
                                      ...prev, 
                                      leadId: lead._id,
                                      clientName: lead.name,
                                      phone: lead.phone,
                                      email: lead.email,
                                      phoneSearch: lead.name
                                    }));
                                    setIsPhoneSearchOpen(false);
                                  }}
                                  className="w-full px-5 py-3 text-left hover:bg-dream-secondary transition-colors border-b border-gray-100 last:border-b-0"
                                >
                                  <div className="font-normal text-dream-primary">{lead.name}</div>
                                  {lead.phone && <div className="text-sm text-gray-600">{lead.phone}</div>}
                                </button>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Описание - растянуто на два столбца */}
                <div className="flex flex-col gap-3 mt-2">
                  <span className="text-black" style={{
                    fontFamily: 'var(--font-sans)',
                    fontWeight: 400,
                    fontSize: '18px',
                    lineHeight: '150%',
                    letterSpacing: '-0.01em',
                  }}>{t('newTask.description')}</span>
                  <textarea
                    placeholder={t('newTask.descriptionPlaceholder')}
                    maxLength={1000}
                    className="w-full min-h-[120px] border-2 border-dream-primary/50 bg-dream-secondary rounded-[20px] px-5 py-3 focus:outline-none resize-none"
                    value={taskForm.description || ''}
                    onChange={(e) => setTaskForm((prev) => ({ ...prev, description: e.target.value.slice(0, 1000) }))}
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontWeight: 400,
                      fontSize: '16px',
                      lineHeight: '150%',
                    }}
                  />
                </div>
              </div>

            {/* Первая строка: Напоминания и Срочность/Важность */}
            <div className="flex gap-4 flex-col md:flex-row">
              {/* Левая колонка - Напоминания */}
              <div className="flex-1 flex flex-col gap-2 items-start">
                <span className="text-black" style={{
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 400,
                  fontSize: '18px',
                  lineHeight: '150%',
                  letterSpacing: '-0.01em',
                }}>{t('newTask.reminders')}</span>
                <div className="flex flex-wrap gap-1.5">
                  {[t('newTask.remindersList.24h'), t('newTask.remindersList.6h'), t('newTask.remindersList.1h'), t('newTask.remindersList.30m'), t('newTask.remindersList.15m')].map((reminder) => (
                    <label
                      key={reminder}
                      className={`flex items-center gap-1.5 px-[18px] py-2.5 rounded-lg border-2 cursor-pointer transition-all ${
                        reminders.includes(reminder)
                          ? 'bg-dream-primary text-white border-dream-primary'
                          : 'bg-dream-secondary border-dream-primary/50 text-dream-primary hover:bg-dream-primary/10'
                      }`}
                    >
                      <input
                        className="sr-only"
                        type="checkbox"
                        checked={reminders.includes(reminder)}
                        onChange={() => toggleReminder(reminder)}
                      />
                      <span className="text-xs font-medium">{reminder}</span>
                    </label>
                  ))}
                </div>
                
                {/* Категория задачи */}
                <div className="flex flex-col gap-2 items-start w-full mt-7">
                  <span className="text-black" style={{
                    fontFamily: 'var(--font-sans)',
                    fontWeight: 400,
                    fontSize: '18px',
                    lineHeight: '150%',
                    letterSpacing: '-0.01em',
                  }}>{t('newTask.taskCategory')}</span>
                  <div className="flex items-center gap-2 w-full">
                    <button
                      type="button"
                      onClick={() => setTaskCategory('work')}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border-2 cursor-pointer transition-all ${
                        taskCategory === 'work'
                          ? 'bg-dream-primary text-white border-dream-primary'
                          : 'bg-dream-secondary border-dream-primary/50 text-dream-primary hover:bg-dream-primary/10'
                      }`}
                    >
                      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M16 6H14V4C14 2.9 13.1 2 12 2H8C6.9 2 6 2.9 6 4V6H4C2.9 6 2 6.9 2 8V16C2 17.1 2.9 18 4 18H16C17.1 18 18 17.1 18 16V8C18 6.9 17.1 6 16 6ZM8 4H12V6H8V4ZM16 16H4V8H16V16Z" fill={taskCategory === 'work' ? 'white' : '#169600'}/>
                      </svg>
                      <span className="font-medium" style={{
                        fontFamily: 'var(--font-sans)',
                        fontSize: '14px',
                      }}>{t('newTask.workCategory')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTaskCategory('personal')}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border-2 cursor-pointer transition-all ${
                        taskCategory === 'personal'
                          ? 'bg-dream-primary text-white border-dream-primary'
                          : 'bg-dream-secondary border-dream-primary/50 text-dream-primary hover:bg-dream-primary/10'
                      }`}
                    >
                      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M10 2C6.69 2 4 4.69 4 8C4 11.54 7.05 15.24 9.41 17.93C9.74 18.31 10.26 18.31 10.59 17.93C12.95 15.24 16 11.54 16 8C16 4.69 13.31 2 10 2ZM10 10C8.9 10 8 9.1 8 8C8 6.9 8.9 6 10 6C11.1 6 12 6.9 12 8C12 9.1 11.1 10 10 10Z" fill={taskCategory === 'personal' ? 'white' : '#169600'}/>
                      </svg>
                      <span className="font-medium" style={{
                        fontFamily: 'var(--font-sans)',
                        fontSize: '14px',
                      }}>{t('newTask.personalCategory')}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Правая колонка - Срочность и Важность */}
              <div className="flex-1 flex flex-col gap-1 mt-1">
                {/* Заголовки в одну строку */}
                <div className="flex items-center gap-6">
                  <span className="text-black" style={{
                    fontFamily: 'var(--font-sans)',
                    fontWeight: 400,
                    fontSize: '18px',
                    lineHeight: '150%',
                    letterSpacing: '-0.01em',
                  }}>{t('newTask.urgency')}</span>
                  <span className="text-black pl-[145px]" style={{
                    fontFamily: 'var(--font-sans)',
                    fontWeight: 400,
                    fontSize: '18px',
                    lineHeight: '150%',
                    letterSpacing: '-0.01em',
                  }}>{t('newTask.importance')}</span>
                </div>

                {/* Кнопки в одну строку */}
                <div className="flex items-center gap-6">
                  {/* Срочность */}
                  <div className="flex items-center gap-2">
                    <div
                      onClick={() => setTaskForm((prev) => ({ ...prev, urgency: 'urgent' }))}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer ${
                        taskForm.urgency === 'urgent'
                          ? 'bg-red-100 ring-2 ring-red-300 md:ring-0'
                          : 'bg-gray-100'
                      }`}
                    >
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M14.0723 6.1734C14.0231 6.06779 13.9172 6.00001 13.8005 6.00001H10.2455L13.754 0.460512C13.8125 0.368121 13.8161 0.251121 13.7633 0.155426C13.7105 0.0594141 13.6097 0 13.5005 0H8.70051C8.58682 0 8.483 0.0641953 8.43202 0.165902L3.93202 9.1659C3.88551 9.25861 3.89061 9.369 3.94521 9.45749C4.00012 9.54598 4.09642 9.59998 4.20051 9.59998H7.2854L3.9239 17.5836C3.8666 17.7201 3.91761 17.8785 4.04389 17.9559C4.09248 17.9856 4.14648 18 4.2002 18C4.28629 18 4.3712 17.9631 4.43001 17.8935L14.03 6.49346C14.1053 6.4041 14.1215 6.27929 14.0723 6.1734Z" fill={taskForm.urgency === 'urgent' ? '#FF070B' : '#9CA3AF'}/>
                      </svg>
                      <span className={taskForm.urgency === 'urgent' ? 'text-red-600' : 'text-gray-600'} style={{
                        fontFamily: 'var(--font-sans)',
                        fontWeight: 500,
                        fontSize: '14px',
                        lineHeight: '24px',
                      }}>{t('newTask.priorityUrgent')}</span>
                    </div>
                    <div
                      onClick={() => setTaskForm((prev) => ({ ...prev, urgency: 'notUrgent' }))}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${taskForm.urgency === 'notUrgent' ? 'bg-red-50 ring-2 ring-red-200 md:ring-0' : 'bg-gray-100'} cursor-pointer`}
                    >
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M14.0168 6.52885C13.9411 6.47204 13.8489 6.44135 13.7542 6.44135H10.4023L13.7192 0.656385C13.8401 0.44708 13.7684 0.17948 13.5591 0.0586234C13.4933 0.0206761 13.4188 0.000451265 13.3429 0H8.68694C8.51763 0.00127175 8.3642 0.10014 8.29311 0.253816L3.84721 9.57448C3.74571 9.79379 3.84122 10.0539 4.06053 10.1554C4.11715 10.1816 4.17868 10.1954 4.24104 10.1958H7.58421L5.17745 17.4598C5.13536 17.6627 5.24133 17.8672 5.43127 17.95C5.62035 18.0491 5.85333 17.9973 5.98263 17.8274L14.1043 7.14147C14.2493 6.94812 14.2101 6.67383 14.0168 6.52885ZM6.87532 15.2369L8.64317 9.86325C8.7205 9.63429 8.59759 9.38597 8.36863 9.30864C8.32453 9.29375 8.27838 9.286 8.23182 9.28563H4.96741L8.95823 0.831393H12.599L9.2733 6.66009C9.15244 6.8694 9.22415 7.137 9.43345 7.25785C9.49922 7.2958 9.57372 7.31602 9.64961 7.31648H12.879L6.87532 15.2369Z" fill={taskForm.urgency === 'notUrgent' ? '#FCA5A5' : '#9CA3AF'}/>
                      </svg>
                      <span className={taskForm.urgency === 'notUrgent' ? 'text-red-400' : 'text-gray-600'} style={{
                        fontFamily: 'var(--font-sans)',
                        fontWeight: 500,
                        fontSize: '14px',
                        lineHeight: '24px',
                      }}>{t('newTask.priorityNotUrgent')}</span>
                    </div>
                  </div>

                  {/* Важность */}
                  <div className="flex items-center gap-2">
                    <div
                      onClick={() => setTaskForm((prev) => ({ ...prev, importance: 'important' }))}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer ${
                        taskForm.importance === 'important'
                          ? 'bg-yellow-100 ring-2 ring-yellow-300 md:ring-0'
                          : 'bg-gray-100'
                      }`}
                    >
                      <svg width="27" height="27" viewBox="0 0 27 27" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M18.4582 5H8.59461C7.79129 5 7.08594 5.66085 7.08594 6.44309V21.0343C7.08594 21.2962 7.15881 21.5144 7.27627 21.683C7.41673 21.8846 7.64289 22.0001 7.88541 22C8.1147 22 8.35882 21.8979 8.58427 21.7054L12.9972 17.9585C13.1335 17.8421 13.3293 17.7754 13.5329 17.7754C13.7363 17.7754 13.9317 17.8421 14.0684 17.9589L18.4666 21.7048C18.6929 21.8979 18.9202 22.0001 19.149 22.0001C19.5361 22.0001 19.9134 21.7015 19.9134 21.0344V6.44309C19.9134 5.66085 19.2615 5 18.4582 5Z" fill={taskForm.importance === 'important' ? '#F6B000' : '#9CA3AF'}/>
                      </svg>
                      <span className={taskForm.importance === 'important' ? 'text-yellow-600' : 'text-gray-600'} style={{
                        fontFamily: 'var(--font-sans)',
                        fontWeight: 500,
                        fontSize: '14px',
                        lineHeight: '24px',
                      }}>{t('newTask.priorityImportant')}</span>
                    </div>
                    <div
                      onClick={() => setTaskForm((prev) => ({ ...prev, importance: 'notImportant' }))}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${taskForm.importance === 'notImportant' ? 'bg-yellow-50 ring-2 ring-yellow-200 md:ring-0' : 'bg-gray-100'} cursor-pointer`}
                    >
                      <svg width="17" height="17" viewBox="0 0 13 17" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M11.1682 0H1.56509C0.718774 0 0 0.682579 0 1.56509V15.7649C0.00249044 16.885 1.37064 17.4106 2.14845 16.6243L5.8089 12.9649C6.10224 12.6589 6.63107 12.6589 6.92442 12.9649L10.5849 16.6243C11.363 17.4109 12.731 16.8845 12.7333 15.7649V1.56509C12.7333 0.682579 12.0145 0 11.1682 0ZM11.7371 15.7649C11.7359 16.0021 11.4411 16.0804 11.2886 15.9193C10.5568 15.1864 8.47001 13.1002 7.62948 12.2612C6.96825 11.5697 5.76606 11.5695 5.10513 12.2599C4.5245 12.8394 3.38793 13.9757 2.49197 14.8714L1.44963 15.9132C1.29944 16.0726 1.00096 16.0194 0.996142 15.774V1.56509C0.996142 1.24691 1.25405 0.996176 1.56509 0.996176H11.1682C11.4788 0.996176 11.7371 1.24651 11.7371 1.56509V15.7649Z" fill={taskForm.importance === 'notImportant' ? '#FCD34D' : '#9CA3AF'}/>
                      </svg>
                      <span className={taskForm.importance === 'notImportant' ? 'text-yellow-400' : 'text-gray-600'} style={{
                        fontFamily: 'var(--font-sans)',
                        fontWeight: 500,
                        fontSize: '14px',
                        lineHeight: '24px',
                      }}>{t('newTask.priorityNotImportant')}</span>
                    </div>
                  </div>
                </div>
                
                {/* Цветовая метка */}
                <div className="flex flex-col items-start gap-3 mt-8">
                  <span className="text-black" style={{
                    fontFamily: 'var(--font-sans)',
                    fontWeight: 400,
                    fontSize: '18px',
                    lineHeight: '150%',
                    letterSpacing: '-0.01em',
                  }}>{t('newTask.colorLabel')}</span>
                  <div className="flex items-center gap-2">
                    <button type="button" className="ring-2 ring-green-300 rounded-md">
                      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <rect x="0.5" y="0.5" width="27" height="27" rx="2.5" fill={taskForm.colorTag && taskForm.colorTag !== 'none' ? taskForm.colorTag : 'transparent'} stroke="#A5E1A5"/>
                        {(!taskForm.colorTag || taskForm.colorTag === 'none') && (
                          <path d="M14 5.5625C12.3312 5.5625 10.6999 6.05735 9.31238 6.98448C7.92484 7.9116 6.84338 9.22936 6.20477 10.7711C5.56616 12.3129 5.39907 14.0094 5.72463 15.6461C6.05019 17.2828 6.85378 18.7862 8.03379 19.9662C9.2138 21.1462 10.7172 21.9498 12.3539 22.2754C13.9906 22.6009 15.6871 22.4338 17.2289 21.7952C18.7706 21.1566 20.0884 20.0752 21.0155 18.6876C21.9427 17.3001 22.4375 15.6688 22.4375 14C22.4375 11.7622 21.5486 9.61612 19.9662 8.03379C18.3839 6.45145 16.2378 5.5625 14 5.5625ZM14 6.6875C15.7505 6.68642 17.4424 7.31765 18.7644 8.465L8.42563 18.7194C7.52653 17.6552 6.95011 16.3564 6.76422 14.9757C6.57833 13.5951 6.7907 12.19 7.37633 10.926C7.96197 9.66195 8.8965 8.59149 10.0699 7.8406C11.2434 7.08972 12.6069 6.68966 14 6.6875ZM14 21.3125C12.2418 21.312 10.5432 20.6745 9.21875 19.5181L19.5575 9.25813C20.4626 10.3207 21.0448 11.6201 21.2351 13.0029C21.4254 14.3857 21.216 15.794 20.6316 17.0616C20.0472 18.3292 19.1122 19.4031 17.9371 20.1563C16.762 20.9096 15.3958 21.3108 14 21.3125Z" fill="#8C8C8C"/>
                        )}
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsColorPaletteModalOpen(true)}
                      className="px-3 py-1.5 border border-dream-primary rounded-lg text-dream-primary text-sm hover:bg-dream-secondary transition-colors"
                    >{t('newTask.selectColor')}</button>
                  </div>
                </div>
              </div>
            </div>

            {/* Третья строка: Срок начала и {t('newTask.endDate')} */}
            <div className="flex gap-4 flex-col md:flex-row">
              {/* Левая колонка - Срок начала */}
              <div className="flex-1 flex flex-col items-start gap-3">
                <span className="text-black" style={{
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 400,
                  fontSize: '18px',
                  lineHeight: '150%',
                  letterSpacing: '-0.01em',
                }}>
                  {t('newTask.startDate')} <span className="text-red-600 text-xl font-normal">*</span>
                </span>
                <div className="flex flex-col gap-2 w-full">
                  <div className="flex items-start gap-2 w-full">
                    <div className="relative flex-1 transition-all duration-300 w-4/5" ref={startDateRef}>
                      <button
                        type="button"
                        onClick={() => setIsStartDateExpanded(!isStartDateExpanded)}
                        className="w-full flex items-center h-9 justify-center px-5 py-2 rounded-full border-2 border-dream-primary/30 text-dream-primary cursor-pointer hover:bg-dream-secondary transition-colors"
                      >
                        <span style={{
                          fontFamily: 'Montserrat, sans-serif',
                          fontWeight: 400,
                          fontSize: '16px',
                          lineHeight: '100%',
                        }}>
                          {taskForm.startDate ? new Date(taskForm.startDate).toLocaleDateString('ru-RU') : t('newTask.selectDate')}
                        </span>
                      </button>
                      {isStartDateExpanded && (
                        <>
                          <div 
                            className="fixed inset-0 z-[65]" 
                            onClick={() => setIsStartDateExpanded(false)}
                          />
                          <div className="absolute bottom-full mb-2 z-[70] bg-white rounded-2xl shadow-2xl border border-gray-200 p-4">
                            <Calendar
                              selectedDate={taskForm.startDate ? new Date(taskForm.startDate) : new Date()}
                              onDateChange={(date) => {
                                const newStartDate = date.toISOString();
                                // Автоматически устанавливаем дату конца на дату начала, если она не установлена
                                const shouldUpdateEndDate = !taskForm.endDate || taskForm.endDate === taskForm.startDate;
                                setTaskForm((prev) => ({
                                  ...prev,
                                  startDate: newStartDate,
                                  endDate: shouldUpdateEndDate ? newStartDate : prev.endDate,
                                }));
                                setIsStartDateExpanded(false);
                              }}
                            />
                          </div>
                        </>
                      )}
                    </div>
                    <div className="relative transition-all duration-300 w-2/5">
                      <TimePickerDropdown
                        value={taskForm.startTime || ''}
                        onChange={(val) => setTaskForm((prev) => ({ ...prev, startTime: val }))}
                        placeholder={t('newTask.time')}
                        ariaLabel={t('newTask.startTimeLabel')}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Правая колонка - {t('newTask.endDate')} */}
              <div className="flex-1 flex flex-col items-start gap-3">
                <span className="text-black" style={{
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 400,
                  fontSize: '18px',
                  lineHeight: '150%',
                  letterSpacing: '-0.01em',
                }}>
                  {t('newTask.endDate')}
                </span>
                <div className="flex flex-col gap-2 w-full">
                  <div className="flex items-start gap-2 w-full">
                    <div className="relative flex-1 transition-all duration-300 w-4/5" ref={endDateRef}>
                      <button
                        type="button"
                        onClick={() => setIsEndDateExpanded(!isEndDateExpanded)}
                        className="w-full flex h-9 items-center justify-center px-5 py-2 rounded-full border-2 border-dream-primary/30 text-dream-primary cursor-pointer hover:bg-dream-secondary transition-colors"
                      >
                        <span style={{
                          fontFamily: 'Montserrat, sans-serif',
                          fontWeight: 400,
                          fontSize: '16px',
                          lineHeight: '100%',
                        }}>
                          {taskForm.endDate ? new Date(taskForm.endDate).toLocaleDateString('ru-RU') : t('newTask.selectDate')}
                        </span>
                      </button>
                      {isEndDateExpanded && (
                        <>
                          <div 
                            className="fixed inset-0 z-[65]" 
                            onClick={() => setIsEndDateExpanded(false)}
                          />
                          <div className="absolute bottom-full mb-2 z-[70] bg-white rounded-2xl shadow-2xl border border-gray-200 p-4">
                            <Calendar
                              selectedDate={taskForm.endDate ? new Date(taskForm.endDate) : new Date()}
                              onDateChange={(date) => {
                                const newEndDate = date.toISOString();
                                setTaskForm((prev) => ({
                                  ...prev,
                                  endDate: newEndDate,
                                }));
                                setIsEndDateExpanded(false);
                              }}
                            />
                          </div>
                        </>
                      )}
                    </div>
                    <div className="relative transition-all duration-300 w-2/5">
                      <TimePickerDropdown
                        value={taskForm.endTime || ''}
                        onChange={(val) => setTaskForm((prev) => ({ ...prev, endTime: val }))}
                        placeholder={t('newTask.time')}
                        ariaLabel={t('newTask.endTimeLabel')}
                        disableBefore={taskForm.startTime || undefined}
                        showDurationFrom={taskForm.startTime || undefined}
                        startDate={taskForm.startDate || undefined}
                        endDate={taskForm.endDate || undefined}
                        scrollToValue={taskForm.startTime || undefined}
                        quickAddMinutes={[15, 30, 45]}
                        quickAddBase={taskForm.startTime || undefined}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Четвертая строка: Подзадачи */}
              <div className="flex flex-col gap-4">
                {(taskForm.subtasks && taskForm.subtasks.length > 0) ? (
                  <>
                    <div className="flex flex-col gap-4 mt-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-normal text-[18px] leading-[150%] tracking-[-0.01em] text-black">{t('newTask.subtasks')}</span>
                        <div className="flex items-center gap-2">
                          {taskForm.subtasks.length > 0 && taskForm.subtasks.every(s => s.completed) ? (
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M10 1.875C8.39303 1.875 6.82214 2.35152 5.486 3.24431C4.14985 4.1371 3.10844 5.40605 2.49348 6.8907C1.87852 8.37535 1.71762 10.009 2.03112 11.5851C2.34463 13.1612 3.11846 14.6089 4.25476 15.7452C5.39106 16.8815 6.8388 17.6554 8.41489 17.9689C9.99099 18.2824 11.6247 18.1215 13.1093 17.5065C14.594 16.8916 15.8629 15.8502 16.7557 14.514C17.6485 13.1779 18.125 11.607 18.125 10C18.1227 7.84581 17.266 5.78051 15.7427 4.25727C14.2195 2.73403 12.1542 1.87727 10 1.875ZM13.5672 8.56719L9.19219 12.9422C9.13414 13.0003 9.06521 13.0464 8.98934 13.0778C8.91347 13.1093 8.83214 13.1255 8.75 13.1255C8.66787 13.1255 8.58654 13.1093 8.51067 13.0778C8.43479 13.0464 8.36586 13.0003 8.30782 12.9422L6.43282 11.0672C6.31554 10.9499 6.24966 10.7909 6.24966 10.625C6.24966 10.4591 6.31554 10.3001 6.43282 10.1828C6.55009 10.0655 6.70915 9.99965 6.875 9.99965C7.04086 9.99965 7.19992 10.0655 7.31719 10.1828L8.75 11.6164L12.6828 7.68281C12.7409 7.62474 12.8098 7.57868 12.8857 7.54725C12.9616 7.51583 13.0429 7.49965 13.125 7.49965C13.2071 7.49965 13.2884 7.51583 13.3643 7.54725C13.4402 7.57868 13.5091 7.62474 13.5672 7.68281C13.6253 7.74088 13.6713 7.80982 13.7027 7.88569C13.7342 7.96156 13.7504 8.04288 13.7504 8.125C13.7504 8.20712 13.7342 8.28844 13.7027 8.36431C13.6713 8.44018 13.6253 8.50912 13.5672 8.56719Z" fill="#169600"/>
                            </svg>
                          ) : (
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M10 1.875C8.39303 1.875 6.82214 2.35152 5.486 3.24431C4.14985 4.1371 3.10844 5.40605 2.49348 6.8907C1.87852 8.37535 1.71762 10.009 2.03112 11.5851C2.34463 13.1612 3.11846 14.6089 4.25476 15.7452C5.39106 16.8815 6.8388 17.6554 8.41489 17.9689C9.99099 18.2824 11.6247 18.1215 13.1093 17.5065C14.594 16.8916 15.8629 15.8502 16.7557 14.514C17.6485 13.1779 18.125 11.607 18.125 10C18.1227 7.84581 17.266 5.78051 15.7427 4.25727C14.2195 2.73403 12.1542 1.87727 10 1.875ZM13.5672 8.56719L9.19219 12.9422C9.13414 13.0003 9.06521 13.0464 8.98934 13.0778C8.91347 13.1093 8.83214 13.1255 8.75 13.1255C8.66787 13.1255 8.58654 13.1093 8.51067 13.0778C8.43479 13.0464 8.36586 13.0003 8.30782 12.9422L6.43282 11.0672C6.31554 10.9499 6.24966 10.7909 6.24966 10.625C6.24966 10.4591 6.31554 10.3001 6.43282 10.1828C6.55009 10.0655 6.70915 9.99965 6.875 9.99965C7.04086 9.99965 7.19992 10.0655 7.31719 10.1828L8.75 11.6164L12.6828 7.68281C12.7409 7.62474 12.8098 7.57868 12.8857 7.54725C12.9616 7.51583 13.0429 7.49965 13.125 7.49965C13.2071 7.49965 13.2884 7.51583 13.3643 7.54725C13.4402 7.57868 13.5091 7.62474 13.5672 7.68281C13.6253 7.74088 13.6713 7.80982 13.7027 7.88569C13.7342 7.96156 13.7504 8.04288 13.7504 8.125C13.7504 8.20712 13.7342 8.28844 13.7027 8.36431C13.6713 8.44018 13.6253 8.50912 13.5672 8.56719Z" fill="#B4BBC0"/>
                            </svg>
                          )}
                          <span>{taskForm.subtasks.filter(s => s.completed).length}/{taskForm.subtasks.length}</span>
                        </div>
                      </div>
                      {taskForm.subtasks.map((subtask, index) => (
                        <div 
                          key={index} 
                          className={`flex items-center gap-2 px-5 py-3 rounded-lg ${
                            subtask.completed 
                              ? 'bg-gray-100 border border-gray-300' 
                              : 'bg-dream-secondary'
                          }`}
                        >
                          <button 
                            type="button"
                            className={`cursor-pointer flex items-center justify-center rounded-sm size-6 ${
                              subtask.completed 
                                ? 'bg-dream-primary' 
                                : 'border-2 border-dream-primary'
                            }`} 
                            onClick={() => {
                              const updatedSubtasks = [...taskForm.subtasks];
                              updatedSubtasks[index].completed = !updatedSubtasks[index].completed;
                              setTaskForm((prev) => ({ ...prev, subtasks: updatedSubtasks }));
                            }}
                          >
                            {subtask.completed && (
                              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </button>
                          {editingSubtaskIndex === index ? (
                            <div className="flex-1 flex items-center gap-2">
                              <input
                                type="text"
                                value={editingSubtaskTitle}
                                onChange={(e) => setEditingSubtaskTitle(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleSaveEditSubtask(index);
                                  } else if (e.key === 'Escape') {
                                    e.preventDefault();
                                    handleCancelEditSubtask();
                                  }
                                }}
                                placeholder={t('newTask.subtaskPlaceholder')}
                                className="flex-1 font-normal text-[16px] leading-[24px] tracking-[0px] border-2 border-dream-primary rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-dream-primary"
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveEditSubtask(index)}
                                className="p-1.5 bg-dream-primary text-white rounded-lg hover:bg-green-700 transition-colors flex-shrink-0"
                                title={t('newTask.save')}
                              >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCancelEditSubtask()}
                                className="p-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors flex-shrink-0"
                                title={t('newTask.cancel')}
                              >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <line x1="18" y1="6" x2="6" y2="18"></line>
                                  <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                              </button>
                            </div>
                          ) : (
                            <>
                              <span className={`flex-1 ${subtask.completed ? 'text-gray-500' : 'text-black'}`}>
                                {subtask.completed ? <s>{subtask.title}</s> : subtask.title}
                              </span>
                              <div className="flex items-center gap-2 ml-auto">
                                <div className="relative group">
                                  <button 
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleStartEditSubtask(index);
                                    }} 
                                    className="cursor-pointer p-2 hover:bg-dream-primary/10 rounded-lg transition-all duration-200 flex-shrink-0 group-hover:scale-110"
                                  >
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="group-hover:scale-110 transition-transform duration-200">
                                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="#169600" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:stroke-[#0d7a00] transition-colors duration-200"/>
                                      <path d="m18.5 2.5 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="#169600" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:stroke-[#0d7a00] transition-colors duration-200"/>
                                    </svg>
                                  </button>
                                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap shadow-lg z-50">{t('newTask.editSubtask')}<div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
                                      <div className="border-4 border-transparent border-t-gray-900"></div>
                                    </div>
                                  </div>
                                </div>
                                <div className="relative group">
                                  <button 
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const updatedSubtasks = taskForm.subtasks.filter((_, i) => i !== index);
                                      setTaskForm((prev) => ({ ...prev, subtasks: updatedSubtasks }));
                                    }} 
                                    className="cursor-pointer p-2 hover:bg-red-50 rounded-lg transition-all duration-200 flex-shrink-0 group-hover:scale-110"
                                  >
                                <svg width="20" height="20" viewBox="0 0 25 25" fill="none" xmlns="http://www.w3.org/2000/svg" className="group-hover:scale-110 transition-transform duration-200">
                                  <path d="M19.793 7.29102C19.5167 7.29102 19.2517 7.40076 19.0564 7.59611C18.861 7.79146 18.7513 8.05642 18.7513 8.33268V19.99C18.7214 20.5167 18.4846 21.0103 18.0924 21.3633C17.7003 21.7162 17.1845 21.8999 16.6576 21.8743H8.34505C7.81807 21.8999 7.30233 21.7162 6.91016 21.3633C6.518 21.0103 6.28118 20.5167 6.2513 19.99V8.33268C6.2513 8.05642 6.14156 7.79146 5.9462 7.59611C5.75085 7.40076 5.4859 7.29102 5.20964 7.29102C4.93337 7.29102 4.66842 7.40076 4.47307 7.59611C4.27772 7.79146 4.16797 8.05642 4.16797 8.33268V19.99C4.1977 21.0694 4.65399 22.093 5.43691 22.8367C6.21982 23.5804 7.26554 23.9834 8.34505 23.9577H16.6576C17.7371 23.9834 18.7828 23.5804 19.5657 22.8367C20.3486 22.093 20.8049 21.0694 20.8346 19.99V8.33268C20.8346 8.05642 20.7249 7.79146 20.5295 7.59611C20.3342 7.40076 20.0692 7.29102 19.793 7.29102Z" fill="#ffb4ab" className="group-hover:fill-[#2a6fa5] transition-colors duration-200"/>
                                  <path d="M20.8333 4.16602H16.6667V2.08268C16.6667 1.80642 16.5569 1.54146 16.3616 1.34611C16.1662 1.15076 15.9013 1.04102 15.625 1.04102H9.375C9.09873 1.04102 8.83378 1.15076 8.63843 1.34611C8.44308 1.54146 8.33333 1.80642 8.33333 2.08268V4.16602H4.16667C3.8904 4.16602 3.62545 4.27576 3.4301 4.47111C3.23475 4.66646 3.125 4.93142 3.125 5.20768C3.125 5.48395 3.23475 5.7489 3.4301 5.94425C3.62545 6.1396 3.8904 6.24935 4.16667 6.24935H20.8333C21.1096 6.24935 21.3746 6.1396 21.5699 5.94425C21.7653 5.7489 21.875 5.48395 21.875 5.20768C21.875 4.93142 21.7653 4.66646 21.5699 4.47111C21.3746 4.27576 21.1096 4.16602 20.8333 4.16602ZM10.4167 4.16602V3.12435H14.5833V4.16602H10.4167Z" fill="#ffb4ab" className="group-hover:fill-[#2a6fa5] transition-colors duration-200"/>
                                  <path d="M11.4583 17.7083V10.4167C11.4583 10.1404 11.3486 9.87545 11.1532 9.6801C10.9579 9.48475 10.6929 9.375 10.4167 9.375C10.1404 9.375 9.87545 9.48475 9.6801 9.6801C9.48475 9.87545 9.375 10.1404 9.375 10.4167V17.7083C9.375 17.9846 9.48475 18.2496 9.6801 18.4449C9.87545 18.6403 10.1404 18.75 10.4167 18.75C10.6929 18.75 10.9579 18.6403 11.1532 18.4449C11.3486 18.2496 11.4583 17.9846 11.4583 17.7083Z" fill="#ffb4ab" className="group-hover:fill-[#2a6fa5] transition-colors duration-200"/>
                                  <path d="M15.6263 17.7083V10.4167C15.6263 10.1404 15.5166 9.87545 15.3212 9.6801C15.1259 9.48475 14.8609 9.375 14.5846 9.375C14.3084 9.375 14.0434 9.48475 13.8481 9.6801C13.6527 9.87545 13.543 10.1404 13.543 10.4167V17.7083C13.543 17.9846 13.6527 18.2496 13.8481 18.4449C14.0434 18.6403 14.3084 18.75 14.5846 18.75C14.8609 18.75 15.1259 18.6403 15.3212 18.4449C15.5166 18.2496 15.6263 17.9846 15.6263 17.7083Z" fill="#ffb4ab" className="group-hover:fill-[#2a6fa5] transition-colors duration-200"/>
                                </svg>
                                  </button>
                                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap shadow-lg z-50">{t('newTask.deleteSubtask')}<div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
                                      <div className="border-4 border-transparent border-t-gray-900"></div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                    {/* Новая подзадача в режиме редактирования */}
                    {editingSubtaskIndex === 'new' && (
                      <div className="flex items-center gap-2 px-5 py-3 rounded-lg bg-dream-secondary">
                        <button 
                          type="button"
                          className="cursor-pointer flex items-center justify-center rounded-sm size-6 border-2 border-dream-primary"
                          disabled
                        />
                        <div className="flex-1 flex items-center gap-2">
                          <input
                            type="text"
                            value={editingSubtaskTitle}
                            onChange={(e) => setEditingSubtaskTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSaveEditSubtask('new');
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                handleCancelEditSubtask();
                              }
                            }}
                            placeholder={t('newTask.subtaskPlaceholder')}
                            className="flex-1 font-normal text-[16px] leading-[24px] tracking-[0px] border-2 border-dream-primary rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-dream-primary"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveEditSubtask('new')}
                            className="p-1.5 bg-dream-primary text-white rounded-lg hover:bg-green-700 transition-colors flex-shrink-0"
                            title={t('newTask.save')}
                          >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCancelEditSubtask()}
                            className="p-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors flex-shrink-0"
                            title={t('newTask.cancel')}
                          >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="18" y1="6" x2="6" y2="18"></line>
                              <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                          </button>
                        </div>
                      </div>
                    )}
                    {/* Кнопка добавления новой подзадачи */}
                    {editingSubtaskIndex !== 'new' && (
                      <button 
                        type="button" 
                        className="flex cursor-pointer" 
                        onClick={handleStartAddSubtask}
                      >
                        <span className="font-normal text-[16px] leading-[100%] tracking-[0px] text-dream-primary">{t('newTask.newSubtaskBtn')}</span>
                      </button>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col gap-4 mt-2.5">
                    <span 
                      className="text-black"
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontWeight: 400,
                        fontStyle: 'normal',
                        fontSize: '18px',
                        lineHeight: '150%',
                        letterSpacing: '-0.01em',
                        leadingTrim: 'none'
                      } as React.CSSProperties & { leadingTrim?: string }}
                    >{t('newTask.subtasks')}</span>
                    {/* Новая подзадача в режиме редактирования когда нет подзадач */}
                    {editingSubtaskIndex === 'new' ? (
                      <div className="flex items-center gap-2 px-5 py-3 rounded-lg bg-dream-secondary">
                        <button 
                          type="button"
                          className="cursor-pointer flex items-center justify-center rounded-sm size-6 border-2 border-dream-primary"
                          disabled
                        />
                        <div className="flex-1 flex items-center gap-2">
                          <input
                            type="text"
                            value={editingSubtaskTitle}
                            onChange={(e) => setEditingSubtaskTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSaveEditSubtask('new');
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                handleCancelEditSubtask();
                              }
                            }}
                            placeholder={t('newTask.subtaskPlaceholder')}
                            className="flex-1 font-normal text-[16px] leading-[24px] tracking-[0px] border-2 border-dream-primary rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-dream-primary"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveEditSubtask('new')}
                            className="p-1.5 bg-dream-primary text-white rounded-lg hover:bg-green-700 transition-colors flex-shrink-0"
                            title={t('newTask.save')}
                          >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCancelEditSubtask()}
                            className="p-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors flex-shrink-0"
                            title={t('newTask.cancel')}
                          >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="18" y1="6" x2="6" y2="18"></line>
                              <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button 
                        type="button" 
                        className="flex cursor-pointer" 
                        onClick={handleStartAddSubtask}
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
                        >{t('newTask.addSubtaskBtn')}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

            {/* Пятая строка: Файлы */}
            <div className="flex flex-col items-start gap-4 mb-4">
              <input
                ref={taskFileInputRef}
                multiple
                className="hidden"
                accept="*/*"
                type="file"
                onChange={handleTaskFileSelect}
              />
              <button
                type="button"
                onClick={() => taskFileInputRef.current?.click()}
                className="flex items-center py-2 px-3 rounded-full border border-dashed border-gray-300 cursor-pointer hover:border-dream-primary hover:bg-dream-secondary/50 transition-colors"
              >
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18 3H14C12.6744 3.00156 11.4035 3.52885 10.4662 4.46619C9.52885 5.40353 9.00156 6.6744 9 8V28C9 28.2652 9.10536 28.5196 9.29289 28.7071C9.48043 28.8946 9.73478 29 10 29C10.2652 29 10.5196 28.8946 10.7071 28.7071C10.8946 28.5196 11 28.2652 11 28V8C11.0009 7.20462 11.3172 6.44206 11.8796 5.87964C12.4421 5.31722 13.2046 5.00087 14 5H18C18.7954 5.00087 19.5579 5.31722 20.1204 5.87964C20.6828 6.44206 20.9991 7.20462 21 8V24C21 24.7956 20.6839 25.5587 20.1213 26.1213C19.5587 26.6839 18.7956 27 18 27C17.2044 27 16.4413 26.6839 15.8787 26.1213C15.3161 25.5587 15 24.7956 15 24V11C15 10.7348 15.1054 10.4804 15.2929 10.2929C15.4804 10.1054 15.7348 10 16 10C16.2652 10 16.5196 10.1054 16.7071 10.2929C16.8946 10.4804 17 10.7348 17 11V23C17 23.2652 17.1054 23.5196 17.2929 23.7071C17.4804 23.8946 17.7348 24 18 24C18.2652 24 18.5196 23.8946 18.7071 23.7071C18.8946 23.5196 19 23.2652 19 23V11C19 10.2044 18.6839 9.44129 18.1213 8.87868C17.5587 8.31607 16.7956 8 16 8C15.2044 8 14.4413 8.31607 13.8787 8.87868C13.3161 9.44129 13 10.2044 13 11V24C13 25.3261 13.5268 26.5979 14.4645 27.5355C15.4021 28.4732 16.6739 29 18 29C19.3261 29 20.5979 28.4732 21.5355 27.5355C22.4732 26.5979 23 25.3261 23 24V8C22.9984 6.6744 22.4712 5.40353 21.5338 4.46619C20.5965 3.52885 19.3256 3.00156 18 3Z" fill="#555454"/>
                </svg>
                <span>{t('newTask.attachFiles')}</span>
              </button>
              
              {selectedTaskFiles.length > 0 && (
                <div className="w-full space-y-2">
                  {selectedTaskFiles.map((file, index) => (
                    <div key={index} className="flex items-center justify-between bg-dream-secondary p-3 rounded-lg">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <span className="text-sm truncate">{file.name}</span>
                        <span className="text-xs text-gray-500">{formatFileSize(file.size)}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveTaskFile(index)}
                        className="text-red-500 hover:text-red-700 ml-3"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
              
              {isColorModalOpen && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[70] p-4" onClick={() => setIsColorModalOpen(false)}>
                  <div className="relative w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
                    <div className="bg-white flex flex-col min-h-0 min-w-0 rounded-[20px] px-6 py-4 shadow-2xl w-full overflow-hidden">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-dream-primary">{t('newTask.newColorLabel')}</span>
                        <button onClick={() => setIsColorModalOpen(false)} aria-label={t('newTask.cancel')}>
                          <svg width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M22.5 7.5L7.5 22.5" stroke="#169600" strokeWidth="3" strokeLinecap="round"/>
                            <path d="M7.5 7.5L22.5 22.5" stroke="#169600" strokeWidth="3" strokeLinecap="round"/>
                          </svg>
                        </button>
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          value={newColorHex}
                          onChange={(e) => setNewColorHex(e.target.value)}
                          className="w-12 h-12 p-0 border-0 bg-transparent cursor-pointer"
                        />
                        <input
                          type="text"
                          value={newColorHex}
                          onChange={(e) => setNewColorHex(e.target.value)}
                          className="flex-1 border-2 border-dream-primary bg-dream-secondary rounded-full px-4 py-2 focus:outline-none"
                        />
                      </div>
                      <div className="mt-4 flex justify-end">
                        <button
                          onClick={() => {
                            const hex = newColorHex.trim();
                            if (!hex) return;
                            setColorPalette((prev) => prev.includes(hex) ? prev : [...prev, hex]);
                            setTaskForm((prev) => ({ ...prev, colorTag: hex }));
                            setIsColorModalOpen(false);
                          }}
                          className="bg-dream-primary text-white py-2 px-5 rounded-full"
                        >{t('newTask.add')}</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {isColorPaletteModalOpen && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[70] p-4" onClick={() => setIsColorPaletteModalOpen(false)}>
                  <div className="relative bg-white rounded-[25px] shadow-2xl p-6 max-w-lg w-full border border-gray-100" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-200">
                      <span 
                        className="text-dream-primary"
                        style={{
                          fontFamily: 'var(--font-sans)',
                          fontWeight: 400,
                          fontStyle: 'normal',
                          fontSize: '20px',
                          lineHeight: '100%',
                          letterSpacing: '0px',
                          leadingTrim: 'none'
                        } as React.CSSProperties & { leadingTrim?: string }}
                      >{t('newTask.chooseColor')}</span>
                      <button 
                        onClick={() => setIsColorPaletteModalOpen(false)} 
                        aria-label={t('newTask.cancel')}
                        className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                      >
                        <svg width="24" height="24" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M22.5 7.5L7.5 22.5" stroke="#169600" strokeWidth="2.5" strokeLinecap="round"/>
                          <path d="M7.5 7.5L22.5 22.5" stroke="#169600" strokeWidth="2.5" strokeLinecap="round"/>
                        </svg>
                      </button>
                    </div>
                    <div className="rounded-[20px] p-4 mb-4">
                      <div className="grid grid-cols-5 gap-3 p-2">
                        {colorPalette.map((hex) => (
                          <button
                            key={hex}
                            type="button"
                            onClick={() => {
                              setTaskForm((prev) => ({ ...prev, colorTag: hex }));
                              setIsColorPaletteModalOpen(false);
                            }}
                            className={`w-14 h-14 rounded-lg border-2 transition-all duration-200 ${
                              taskForm.colorTag === hex
                                ? 'ring-2 ring-[var(--ring)] ring-offset-2 border-[var(--ring)] scale-105'
                                : 'border-[rgba(255,255,255,0.18)] hover:border-[var(--ring)] hover:scale-105'
                            }`}
                            style={{ backgroundColor: hex }}
                            title={hex}
                          >
                            {taskForm.colorTag === hex && (
                              <div className="w-full h-full flex items-center justify-center">
                                <svg className="w-6 h-6 text-white drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex justify-end pt-4 border-t border-gray-200">
                      <button
                        type="button"
                        onClick={() => {
                          setIsColorPaletteModalOpen(false);
                          setIsColorModalOpen(true);
                        }}
                        className="px-6 py-2.5 border-2 border-dream-primary text-dream-primary rounded-full hover:bg-dream-primary hover:text-white transition-all duration-200 font-medium"
                        style={{
                          fontFamily: 'var(--font-sans)',
                        }}
                      >{t('newTask.otherColors')}</button>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Кнопка добавить задачу внизу */}
              <div className="flex justify-center mt-6">
                <button 
                  onClick={handleCreateTaskClick} 
                  className={`bg-dream-primary text-white py-5.5 px-25 rounded-full disabled:bg-gray-400 flex items-center gap-2 ${taskForm.title.trim() && !isUploadingFiles ? 'shadow-[0_4px_10px_rgba(22,150,0,0.5)]' : ''}`} 
                  disabled={!taskForm.title.trim() || isUploadingFiles || isCreating}
                >
                  {isUploadingFiles || isCreating ? (
                    <>
                      <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span className="font-normal text-[20px] leading-[100%] tracking-[0px]">{t('newTask.creating')}</span>
                    </>
                  ) : (
                    <span className="font-normal text-[20px] leading-[100%] tracking-[0px]">{t('newTask.addTaskBtn')}</span>
                  )}
                </button>
              </div>
            </div>
            </div>
          </div>
        </div>
      </div>
      )}
      
      
      {/* Модалка архива задач */}
      <TasksArchiveModal
        isOpen={isArchiveModalOpen}
        onClose={() => setIsArchiveModalOpen(false)}
        onTaskRestored={async (task) => {
          // Используем специальный обработчик для восстановленных задач
          if (props.onTaskRestored) {
            await props.onTaskRestored(task);
          } else if (props.onTaskUpdate) {
            // Fallback на onTaskUpdate, если onTaskRestored не передан
            await props.onTaskUpdate(task);
            if (props.loadTasks) {
              await props.loadTasks();
            }
          }
        }}
      />
    </div>
  );
};
