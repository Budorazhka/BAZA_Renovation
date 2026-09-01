// @ts-nocheck
import React, { useState, useRef } from 'react';
import Calendar from '../Calendar';
import { ColorPaletteModal } from './ColorPaletteModal';
import { ColorModal } from './ColorModal';
import TimePickerDropdown from '../common/TimePickerDropdown';
import { PhoneInput } from '../../common/PhoneInput';
import { useI18n } from '@/i18n';

export interface CallMeetingTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  taskType: 'call' | 'meeting';
  taskForm: any;
  setTaskForm: (form: any) => void;
  handleCreateTask: () => void;
  backendLeads: any[];
  selectedTaskFiles: File[];
  setSelectedTaskFiles: (files: File[]) => void;
  handleTaskFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleRemoveTaskFile: (index: number) => void;
  formatFileSize: (size: number) => string;
  taskFileInputRef: React.RefObject<HTMLInputElement | null>;
  colorPalette: string[];
  setColorPalette: (palette: string[]) => void;
  isColorModalOpen: boolean;
  setIsColorModalOpen: (open: boolean) => void;
  isColorPaletteModalOpen: boolean;
  setIsColorPaletteModalOpen: (open: boolean) => void;
  newColorHex: string;
  setNewColorHex: (hex: string) => void;
  isDraftLoaded: boolean;
  setIsDraftLoaded: (loaded: boolean) => void;
}

export const CallMeetingTaskModal: React.FC<CallMeetingTaskModalProps> = ({
  isOpen,
  onClose,
  taskType,
  taskForm,
  setTaskForm,
  handleCreateTask,
  backendLeads,
  selectedTaskFiles,
  setSelectedTaskFiles,
  handleTaskFileSelect,
  handleRemoveTaskFile,
  formatFileSize,
  taskFileInputRef,
  colorPalette,
  setColorPalette,
  isColorModalOpen,
  setIsColorModalOpen,
  isColorPaletteModalOpen,
  setIsColorPaletteModalOpen,
  newColorHex,
  setNewColorHex,
  isDraftLoaded,
  setIsDraftLoaded,
}) => {
  const { t } = useI18n();

  if (!isOpen) return null;

  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const [isStartDateExpanded, setIsStartDateExpanded] = useState(false);
  const [isEndDateExpanded, setIsEndDateExpanded] = useState(false);
  const [phoneSearch, setPhoneSearch] = useState('');
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  const [reminders, setReminders] = useState<string[]>([]);
  const [taskCategory, setTaskCategory] = useState<'work' | 'personal'>('work');
  const [editingSubtaskIndex, setEditingSubtaskIndex] = useState<number | 'new' | null>(null);
  const [editingSubtaskTitle, setEditingSubtaskTitle] = useState<string>('');
  
  const clientDropdownRef = useRef<HTMLDivElement>(null);
  const startDateRef = useRef<HTMLDivElement>(null);
  const endDateRef = useRef<HTMLDivElement>(null);
  const searchFieldRef = useRef<HTMLDivElement>(null);

  const taskTypeLabel = taskType === 'call' ? 'Звонок' : 'Встреча';

  const filteredLeads = backendLeads.filter(lead => 
    lead.name?.toLowerCase().includes(phoneSearch.toLowerCase()) ||
    lead.phone?.includes(phoneSearch)
  );

  const toggleReminder = (reminder: string) => {
    setReminders(prev => 
      prev.includes(reminder) 
        ? prev.filter(r => r !== reminder)
        : [...prev, reminder]
    );
  };

  // Инициализация reminders при открытии модального окна
  React.useEffect(() => {
    if (isOpen) {
      // Используем reminders из taskForm, если они есть, иначе значения по умолчанию
      const defaultReminders = [t('newTask.remindersList.1h'), t('newTask.remindersList.15m')];
      setReminders(taskForm?.reminders && taskForm.reminders.length > 0 
        ? taskForm.reminders 
        : defaultReminders);
    } else {
      // Сбрасываем при закрытии
      setReminders([t('newTask.remindersList.1h'), t('newTask.remindersList.15m')]); // Возвращаем к значениям по умолчанию
    }
  }, [isOpen, taskForm?.reminders, t]);

  const handleStartEditSubtask = (index: number) => {
    setEditingSubtaskIndex(index);
    setEditingSubtaskTitle(taskForm.subtasks[index].title);
  };

  const handleStartAddSubtask = () => {
    setEditingSubtaskIndex('new');
    setEditingSubtaskTitle('');
  };

  const handleSaveEditSubtask = (index: number | 'new') => {
    if (editingSubtaskTitle.trim()) {
      if (index === 'new') {
        // Добавление новой подзадачи
        setTaskForm(prev => ({
          ...prev,
          subtasks: [...(prev.subtasks || []), { title: editingSubtaskTitle.trim(), completed: false }]
        }));
      } else {
        // Редактирование существующей подзадачи
        setTaskForm(prev => ({
          ...prev,
          subtasks: prev.subtasks.map((subtask, i) => 
            i === index ? { ...subtask, title: editingSubtaskTitle.trim() } : subtask
          )
        }));
      }
    }
    setEditingSubtaskIndex(null);
    setEditingSubtaskTitle('');
  };

  const handleCancelEditSubtask = () => {
    setEditingSubtaskIndex(null);
    setEditingSubtaskTitle('');
  };

  const handleSubmit = () => {
    // Формируем массив категорий для отправки на бэкенд
    const taskTypeName = taskType === 'call' ? 'Звонок' : 'Встреча';
    const categoryName = taskCategory === 'work' ? 'Рабочие задачи' : 'Личные задачи';
    
    // Обновляем taskForm с правильными категориями перед отправкой
    // Важно: сохраняем urgency, importance и taskCategory из формы
    const updatedTaskForm = {
      ...taskForm,
      categories: [taskTypeName, categoryName],
      taskType: taskType,
      taskCategory: taskCategory, // Передаем taskCategory для правильной обработки
      // urgency и importance уже должны быть в taskForm, но убеждаемся что они есть
      urgency: taskForm.urgency || 'urgent',
      importance: taskForm.importance || 'important'
    };
    
    // Обновляем состояние
    setTaskForm(updatedTaskForm);
    
    // Передаём данные напрямую в handleCreateTask
    handleCreateTask(updatedTaskForm);
  };

  // Автоматическое заполнение email и ФИО при выборе лида
  const selectedLead = backendLeads.find(l => l._id === taskForm.leadId);
  
  React.useEffect(() => {
    if (selectedLead) {
      setTaskForm(prev => ({
        ...prev,
        email: selectedLead.email || prev.email,
        phone: selectedLead.phone || prev.phone,
        clientName: selectedLead.name || prev.clientName
      }));
    }
  }, [selectedLead]);

  // Инициализация категории задачи при открытии (для редактирования)
  React.useEffect(() => {
    if (taskForm.categories && Array.isArray(taskForm.categories)) {
      if (taskForm.categories.includes('Личные задачи')) {
        setTaskCategory('personal');
      } else if (taskForm.categories.includes('Рабочие задачи')) {
        setTaskCategory('work');
      }
    }
  }, []);

  // Закрытие выпадающего списка клиентов при клике вне его
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(event.target as Node)) {
        setIsClientDropdownOpen(false);
      }
    };

    if (isClientDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isClientDropdownOpen]);

  // Закрытие поискового выпадающего списка при клике вне его
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchFieldRef.current && !searchFieldRef.current.contains(event.target as Node)) {
        setIsSearchDropdownOpen(false);
      }
    };

    if (isSearchDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isSearchDropdownOpen]);

  // Автоскрытие уведомления о черновике через 3 секунды
  React.useEffect(() => {
    if (isDraftLoaded) {
      const timer = setTimeout(() => {
        setIsDraftLoaded(false);
      }, 3000); // 3 секунды

      return () => clearTimeout(timer);
    }
  }, [isDraftLoaded]);

  return (
    <div className="modal-fade-in fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center z-[60] pt-[15px] md:pt-4 pb-0 md:pb-4 px-0 md:px-4" onClick={onClose}>
      {/* Toast-уведомление о загрузке черновика */}
      {isDraftLoaded && (
        <div className="fixed top-4 right-4 z-[100] max-w-[400px]" onClick={(e) => e.stopPropagation()}>
          <div className="transform transition-all duration-300 ease-out translate-x-0 opacity-100">
            <div className="rounded-lg shadow-lg p-4 flex items-start gap-3" style={{ background: '#112d1c', boxShadow: 'inset 0 0 0 1px rgba(201,168,76,0.18)', color: '#d0e8df' }}>
              <div className="flex-shrink-0 mt-0.5">
                <svg className="w-5 h-5" fill="none" stroke="#e6c364" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base leading-5" style={{ color: '#d0e8df' }}>{t('callMeetingTask.draftLoaded')}</p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation(); // Предотвращаем всплытие события, чтобы не закрывать модалку
                  setIsDraftLoaded(false);
                }}
                className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
                aria-label={t('callMeetingTask.cancel')}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
      <div 
        className="relative w-full md:w-[85%] md:max-w-[1200px] h-[85vh] md:h-[90.89vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col flex-1 border border-gray-200 rounded-t-[25px] md:rounded-2xl p-5 pb-20 md:pb-0 overflow-hidden bg-white">
          {/* Заголовок */}
          <div className="relative flex justify-center">
            <span className="text-dream-primary" style={{
              fontFamily: 'var(--font-sans)',
              fontWeight: 400,
              fontSize: '28px',
              lineHeight: '100%',
            }}>
              {taskType === 'call' ? t('callMeetingTask.titleCall') : t('callMeetingTask.titleMeeting')}
            </span>
            <div className="absolute -right-3 -top-2 md:block">
              <button type="button" onClick={onClose} aria-label={t('callMeetingTask.cancel')} className="hidden md:block">
                <svg width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.5 7.5L7.5 22.5" stroke="#169600" strokeWidth="3" strokeLinecap="round"/>
                  <path d="M7.5 7.5L22.5 22.5" stroke="#169600" strokeWidth="3" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
            {/* Крестик для мобильных */}
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 md:hidden p-2 bg-white/90 rounded-full shadow-lg z-10"
              aria-label={t('callMeetingTask.cancel')}
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
                    <div className="flex items-center gap-1 mb-1">
                      <span className="text-black" style={{
                        fontFamily: 'var(--font-sans)',
                        fontWeight: 400,
                        fontSize: '18px',
                        lineHeight: '150%',
                        letterSpacing: '-0.01em',
                      }}>{t('callMeetingTask.formTitle')}</span>
                      <span className="text-red-600 text-lg font-normal">*</span>
                    </div>
                    <div className="relative w-full">
                      <input
                        placeholder={t('callMeetingTask.formTitlePlaceholder')}
                        maxLength={48}
                        className="w-full flex-1 h-9 border-2 border-dream-primary/50 bg-dream-secondary rounded-full pl-5 pr-14 py-2 focus:outline-none"
                        type="text"
                        value={taskForm.title}
                        onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
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
                  <div className="w-full">
                    <div className="flex items-center gap-1 mb-1">
                      <span className="text-black" style={{
                        fontFamily: 'var(--font-sans)',
                        fontWeight: 400,
                        fontSize: '18px',
                        lineHeight: '150%',
                        letterSpacing: '-0.01em',
                      }}>
                        Email
                      </span>
                    </div>
                    <div className="relative w-full">
                      <input
                        placeholder="Email"
                        className="w-full flex-1 h-9 border-2 border-dream-primary/50 bg-dream-secondary rounded-full pl-5 pr-5 py-2 focus:outline-none"
                        type="email"
                        value={taskForm.email || selectedLead?.email || ''}
                        onChange={(e) => setTaskForm({ ...taskForm, email: e.target.value })}
                        style={{
                          fontFamily: 'var(--font-sans)',
                          fontWeight: 100,
                          fontSize: '18px',
                          lineHeight: '100%',
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Правая колонка */}
                <div className="flex flex-col gap-3 flex-1 pt-[14px]">
                  <div className="w-full">
                    <div className="flex items-center gap-1 mb-1">
                      <span className="text-black" style={{
                        fontFamily: 'var(--font-sans)',
                        fontWeight: 400,
                        fontSize: '18px',
                        lineHeight: '100%',
                      }}>{t('callMeetingTask.searchLead')}</span>
                    </div>
                    <div className="relative w-full" ref={searchFieldRef}>
                      <input
                        placeholder={t('callMeetingTask.searchLeadPlaceholder')}
                        className="w-full flex-1 h-9 border-2 border-dream-primary/50 bg-dream-secondary rounded-full pl-5 pr-5 py-2 focus:outline-none"
                        type="text"
                        value={taskForm.leadId && taskForm.clientName ? taskForm.clientName : phoneSearch}
                        onChange={(e) => {
                          setPhoneSearch(e.target.value);
                          setTaskForm({ ...taskForm, leadId: '', clientName: '' });
                          setIsSearchDropdownOpen(e.target.value.length > 0);
                        }}
                        onFocus={() => {
                          if (!taskForm.leadId && phoneSearch.length > 0) {
                            setIsSearchDropdownOpen(true);
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
                      {isSearchDropdownOpen && !taskForm.leadId && phoneSearch && filteredLeads.length > 0 && (
                        <div className="absolute top-full mt-2 w-full bg-white border-2 border-dream-primary rounded-[20px] shadow-lg max-h-60 overflow-y-auto z-50">
                          {filteredLeads.slice(0, 10).map((lead) => (
                            <button
                              key={lead._id}
                              type="button"
                              onClick={() => {
                                setTaskForm({ 
                                  ...taskForm, 
                                  leadId: lead._id,
                                  clientName: lead.name,
                                  phone: lead.phone,
                                  email: lead.email
                                });
                                setPhoneSearch(lead.name);
                                setIsSearchDropdownOpen(false);
                              }}
                              className="w-full px-5 py-3 text-left hover:bg-dream-secondary transition-colors border-b border-gray-100 last:border-b-0"
                            >
                              <div className="font-normal text-dream-primary">{lead.name}</div>
                              {lead.phone && <div className="text-sm text-gray-600">{lead.phone}</div>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="w-full">
                    <div className="flex items-center gap-1 mb-1">
                      <span className="text-black" style={{
                        fontFamily: 'var(--font-sans)',
                        fontWeight: 400,
                        fontSize: '18px',
                        lineHeight: '150%',
                        letterSpacing: '-0.01em',
                      }}>{t('callMeetingTask.phone')}</span>
                    </div>
                    <div className="relative w-full">
                      <PhoneInput
                        value={taskForm.phone || selectedLead?.phone || ''}
                        onChange={(phone) => setTaskForm({ ...taskForm, phone })}
                        placeholder={t('callMeetingTask.phonePlaceholder')}
                        className="w-full flex-1 h-9 border-2 border-dream-primary/50 bg-dream-secondary rounded-full pl-5 pr-5 py-2 focus:outline-none"
                        style={{
                          fontFamily: 'var(--font-sans)',
                          fontWeight: 100,
                          fontSize: '18px',
                          lineHeight: '100%',
                        }}
                      />
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
                }}>{t('callMeetingTask.description')}</span>
                <textarea
                  placeholder={t('callMeetingTask.descriptionPlaceholder')}
                  className="w-full min-h-[120px] border-2 border-dream-primary/50 bg-dream-secondary rounded-[20px] px-5 py-3 focus:outline-none resize-none"
                  value={taskForm.description || ''}
                  onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
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
                }}>{t('callMeetingTask.reminders')}</span>
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
                  }}>{t('callMeetingTask.taskCategory')}</span>
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
                      }}>
                        {taskType === 'call' ? t('callMeetingTask.workCategoryCall') : t('callMeetingTask.workCategoryMeeting')}
                      </span>
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
                      }}>
                        {taskType === 'call' ? t('callMeetingTask.personalCategoryCall') : t('callMeetingTask.personalCategoryMeeting')}
                      </span>
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
                  }}>{t('callMeetingTask.urgency')}</span>
                  <span className="text-black pl-[145px]" style={{
                    fontFamily: 'var(--font-sans)',
                    fontWeight: 400,
                    fontSize: '18px',
                    lineHeight: '150%',
                    letterSpacing: '-0.01em',
                  }}>{t('callMeetingTask.importance')}</span>
                </div>

                {/* Кнопки в одну строку */}
                <div className="flex items-center gap-6">
                  {/* Срочность */}
                  <div className="flex items-center gap-2">
                    <div
                      onClick={() => setTaskForm({ ...taskForm, urgency: 'urgent' })}
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
                      }}>{t('callMeetingTask.priorityUrgent')}</span>
                    </div>
                    <div
                      onClick={() => setTaskForm({ ...taskForm, urgency: 'notUrgent' })}
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
                      }}>{t('callMeetingTask.priorityNotUrgent')}</span>
                    </div>
                  </div>

                  {/* Важность */}
                  <div className="flex items-center gap-2">
                    <div
                      onClick={() => setTaskForm({ ...taskForm, importance: 'important' })}
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
                      }}>{t('callMeetingTask.priorityImportant')}</span>
                    </div>
                    <div
                      onClick={() => setTaskForm({ ...taskForm, importance: 'notImportant' })}
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
                      }}>{t('callMeetingTask.priorityNotImportant')}</span>
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
                  }}>{t('callMeetingTask.colorLabel')}</span>
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
                    >{t('callMeetingTask.selectColor')}</button>
                  </div>
                </div>
              </div>
            </div>

            {/* Третья строка: Срок начала и Срок окончания */}
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
                  {t('callMeetingTask.startDate')} <span className="text-red-600 text-xl font-normal">*</span>
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
                          {taskForm.startDate ? new Date(taskForm.startDate).toLocaleDateString('ru-RU') : t('callMeetingTask.selectDate')}
                        </span>
                      </button>
                      {isStartDateExpanded && (
                        <>
                          <div 
                            className="fixed inset-0 z-[65]" 
                            onClick={() => setIsStartDateExpanded(false)}
                          />
                          <div className="absolute top-full mt-2 z-[70] bg-white rounded-2xl shadow-2xl border border-gray-200 p-4">
                            <Calendar
                              selectedDate={taskForm.startDate ? new Date(taskForm.startDate) : new Date()}
                              onDateChange={(date) => {
                                const newStartDate = date.toISOString();
                                // Автоматически устанавливаем дату конца на дату начала, если она не установлена
                                const shouldUpdateEndDate = !taskForm.endDate || taskForm.endDate === taskForm.startDate;
                                setTaskForm({
                                  ...taskForm,
                                  startDate: newStartDate,
                                  endDate: shouldUpdateEndDate ? newStartDate : taskForm.endDate,
                                });
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
                        onChange={(val) => setTaskForm({ ...taskForm, startTime: val })}
                        placeholder={t('callMeetingTask.time')}
                        ariaLabel={t('callMeetingTask.startTimeLabel')}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Правая колонка - Срок окончания */}
              <div className="flex-1 flex flex-col items-start gap-3">
                <span className="text-black" style={{
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 400,
                  fontSize: '18px',
                  lineHeight: '150%',
                  letterSpacing: '-0.01em',
                }}>{t('callMeetingTask.endDate')}</span>
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
                          {taskForm.endDate ? new Date(taskForm.endDate).toLocaleDateString('ru-RU') : t('callMeetingTask.selectDate')}
                        </span>
                      </button>
                      {isEndDateExpanded && (
                        <>
                          <div 
                            className="fixed inset-0 z-[65]" 
                            onClick={() => setIsEndDateExpanded(false)}
                          />
                          <div className="absolute top-full mt-2 z-[70] bg-white rounded-2xl shadow-2xl border border-gray-200 p-4">
                            <Calendar
                              selectedDate={taskForm.endDate ? new Date(taskForm.endDate) : new Date()}
                              onDateChange={(date) => {
                                const newEndDate = date.toISOString();
                                setTaskForm({
                                  ...taskForm,
                                  endDate: newEndDate,
                                });
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
                        onChange={(val) => setTaskForm({ ...taskForm, endTime: val })}
                        placeholder={t('callMeetingTask.time')}
                        ariaLabel={t('callMeetingTask.endTimeLabel')}
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
              {/* Подзадачи */}

              {(taskForm.subtasks && taskForm.subtasks.length > 0) ? (
                <>
                  <div className="flex flex-col gap-4 mt-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-normal text-[18px] leading-[150%] tracking-[-0.01em] text-black">{t('callMeetingTask.subtasks')}</span>
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
                            setTaskForm({ ...taskForm, subtasks: updatedSubtasks });
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
                              placeholder={t('callMeetingTask.subtaskPlaceholder')}
                              className="flex-1 font-normal text-[16px] leading-[24px] tracking-[0px] border-2 border-dream-primary rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-dream-primary"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveEditSubtask(index)}
                              className="p-1.5 bg-dream-primary text-white rounded-lg hover:bg-green-700 transition-colors flex-shrink-0"
                              title={t('callMeetingTask.save')}
                            >
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12"></polyline>
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCancelEditSubtask()}
                              className="p-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors flex-shrink-0"
                              title={t('callMeetingTask.cancel')}
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
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap shadow-lg z-50">{t('callMeetingTask.editSubtask')}<div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
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
                                    setTaskForm({ ...taskForm, subtasks: updatedSubtasks });
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
                                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap shadow-lg z-50">{t('callMeetingTask.deleteSubtask')}<div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
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
                          placeholder={t('callMeetingTask.subtaskPlaceholder')}
                          className="flex-1 font-normal text-[16px] leading-[24px] tracking-[0px] border-2 border-dream-primary rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-dream-primary"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveEditSubtask('new')}
                          className="p-1.5 bg-dream-primary text-white rounded-lg hover:bg-green-700 transition-colors flex-shrink-0"
                          title={t('callMeetingTask.save')}
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCancelEditSubtask()}
                          className="p-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors flex-shrink-0"
                          title={t('callMeetingTask.cancel')}
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
                      <span className="font-normal text-[16px] leading-[100%] tracking-[0px] text-dream-primary">{t('callMeetingTask.newSubtaskBtn')}</span>
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
                  >{t('callMeetingTask.subtasks')}</span>
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
                          placeholder={t('callMeetingTask.subtaskPlaceholder')}
                          className="flex-1 font-normal text-[16px] leading-[24px] tracking-[0px] border-2 border-dream-primary rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-dream-primary"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveEditSubtask('new')}
                          className="p-1.5 bg-dream-primary text-white rounded-lg hover:bg-green-700 transition-colors flex-shrink-0"
                          title={t('callMeetingTask.save')}
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCancelEditSubtask()}
                          className="p-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors flex-shrink-0"
                          title={t('callMeetingTask.cancel')}
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
                      >{t('callMeetingTask.addSubtaskBtn')}</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Клиент */}
            

            {/* Файлы */}
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
                <span>{t('callMeetingTask.attachFiles')}</span>
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

            {/* Кнопка добавить */}
            <div className="flex justify-center">
              <button
                type="button"
                onClick={handleSubmit}
                className="bg-dream-primary text-white py-5.5 px-25 rounded-full disabled:bg-gray-400 flex items-center gap-2 shadow-[0_4px_10px_rgba(22,150,0,0.5)]"
              >
                <span className="font-normal text-[20px] leading-[100%] tracking-[0px]">{t('callMeetingTask.addTaskBtn')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Модалки выбора цвета */}
      {isColorPaletteModalOpen && (
        <ColorPaletteModal
          isOpen={isColorPaletteModalOpen}
          onClose={() => setIsColorPaletteModalOpen(false)}
          colorPalette={colorPalette}
          selectedColor={taskForm.colorTag || ''}
          onSelectColor={(color) => {
            setTaskForm({ ...taskForm, colorTag: color });
            setIsColorPaletteModalOpen(false);
          }}
          onOpenColorModal={() => {
            setIsColorPaletteModalOpen(false);
            setIsColorModalOpen(true);
          }}
        />
      )}

      {isColorModalOpen && (
        <ColorModal
          isOpen={isColorModalOpen}
          onClose={() => setIsColorModalOpen(false)}
          newColorHex={newColorHex}
          setNewColorHex={setNewColorHex}
          onAddColor={(hex) => {
            if (!hex) return;
            setColorPalette((prev) => prev.includes(hex) ? prev : [...prev, hex]);
            setTaskForm({ ...taskForm, colorTag: hex });
            setIsColorModalOpen(false);
          }}
        />
      )}
      
    </div>
  );
};
