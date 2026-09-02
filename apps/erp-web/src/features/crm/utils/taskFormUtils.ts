export const formatTimeRemaining = (seconds: number): string => {
  if (seconds < 60) return `${Math.ceil(seconds)} сек`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.ceil(seconds % 60);
  if (remainingSeconds === 0) return `${minutes} мин`;
  return `${minutes} мин ${remainingSeconds} сек`;
};

export type TaskFormState = {
  title: string;
  description: string;
  urgency: 'urgent' | 'notUrgent';
  importance: 'important' | 'notImportant';
  colorTag: string;
  subtasks: Array<{ title: string; completed: boolean }>;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  category: string;
  categories: string[];
  taskCategory: 'work' | 'personal';
  leadId: string;
  clientName: string;
  phone: string;
  email: string;
  taskType: 'standard' | 'call' | 'meeting' | undefined;
  reminders: string[];
};

export const createInitialTaskFormState = (): TaskFormState => ({
  title: '',
  description: '',
  urgency: 'urgent',
  importance: 'important',
  colorTag: 'none',
  subtasks: [],
  startDate: '',
  startTime: '09:00',
  endDate: '',
  endTime: '19:00',
  category: 'Личные дела',
  categories: [],
  taskCategory: 'work',
  leadId: '',
  clientName: '',
  phone: '',
  email: '',
  taskType: undefined,
  reminders: ['За 1 час', 'За 15 минут'],
});

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

export const excelColorPalette = [
  '#E6C364', '#D0E8DF', '#C9A14C', '#B58E5F', '#A9B89A',
  '#7FA98F', '#5C9686', '#4A8580', '#3E6B7F', '#6B7BA1',
  '#8A6FA9', '#A47AA7', '#B66E80', '#C9614F', '#D88B4C',
  '#9C7B59', '#E8E0CD', '#A8A8A8', '#5C5C5C', '#2E2E2E',
];
