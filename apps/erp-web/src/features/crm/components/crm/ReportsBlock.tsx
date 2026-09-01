import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useI18n } from '@/i18n';
import type { Translate } from '@/i18n';
import { CRM_ANALYTICS_BASE } from '@/features/crm/crmAnalyticsPaths';
import { TaskStatus, LeadStage, ProductType } from '../../services/api';
import type { Task, Lead } from '../../services/api';
import { apiService } from '../../services/api';
import CircularProgress from './CircularProgress';
import RealtorCardsGrid from './RealtorCardsGrid';
import { Area, AreaChart, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';

interface ReportsBlockProps {
  tasks: Task[];
  leads?: Lead[];
  onModalOpen?: () => void;
}

// Данные чеклиста для подсчета общего количества (импортируем структуру из LeadStageChecklist)
// Переменная зарезервирована для будущего использования
// @ts-expect-error - переменная зарезервирована для будущего использования
const _checklistDataForCount: Record<LeadStage, { correct: number; incorrect: number }> = {
  [LeadStage.NEEDS_ANALYSIS]: { correct: 8, incorrect: 5 },
  [LeadStage.PRESENTATION]: { correct: 5, incorrect: 5 },
  [LeadStage.PROPOSAL]: { correct: 4, incorrect: 5 },
  [LeadStage.NEGOTIATION]: { correct: 4, incorrect: 5 },
  [LeadStage.DECISION_MAKING]: { correct: 7, incorrect: 5 },
  [LeadStage.CONTRACT_SIGNING]: { correct: 5, incorrect: 5 },
  [LeadStage.ONBOARDING]: { correct: 6, incorrect: 5 },
  [LeadStage.NEEDS_ANALYSIS1]: { correct: 5, incorrect: 6 },
  [LeadStage.PRESENTATION1]: { correct: 6, incorrect: 5 },
  [LeadStage.PROPOSAL1]: { correct: 6, incorrect: 5 },
  [LeadStage.NEGOTIATION1]: { correct: 6, incorrect: 5 },
  [LeadStage.DECISION_MAKING1]: { correct: 6, incorrect: 5 },
  [LeadStage.CONTRACT_SIGNING1]: { correct: 7, incorrect: 5 },
  [LeadStage.REJECTED]: { correct: 0, incorrect: 0 },
  [LeadStage.FIRST_CONTACT]: { correct: 0, incorrect: 0 },
  [LeadStage.QUALIFICATION]: { correct: 0, incorrect: 0 },
  [LeadStage.REJECTED1]: { correct: 0, incorrect: 0 },
  [LeadStage.FIRST_CONTACT1]: { correct: 0, incorrect: 0 },
  [LeadStage.DEAL_CLOSED]: { correct: 0, incorrect: 0 },
  [LeadStage.POST_PURCHASE_FOLLOWUP]: { correct: 0, incorrect: 0 },
  [LeadStage.SATISFACTION_CHECK]: { correct: 0, incorrect: 0 },
  [LeadStage.UPSELL_OPPORTUNITY]: { correct: 0, incorrect: 0 },
  [LeadStage.REGISTERED]: { correct: 0, incorrect: 0 },
  [LeadStage.ADAPTED]: { correct: 0, incorrect: 0 },
};

// Функция для подсчета закрытых чекбоксов из localStorage
const getChecklistStats = () => {
  let checkedCount = 0;
  const uniqueKeys = new Set<string>();

  // Подсчитываем закрытые чекбоксы и собираем все уникальные ключи
  // Ключи имеют формат: checklist_{leadId}_{stage}_{type}_{index}
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('checklist_')) {
      uniqueKeys.add(key);
      const value = localStorage.getItem(key);
      if (value === 'true') {
        checkedCount++;
      }
    }
  }

  // Общее количество = все уникальные ключи чекбоксов, которые были созданы
  // (т.е. для которых пользователь открывал чеклист)
  const totalCount = uniqueKeys.size;

  return { checkedCount, totalCount };
};

// Функция для генерации стабильных данных на основе периода и уровня
const cyrb53 = (str: string, seed = 0) => {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
};

// Интерфейс для хранения исторических данных
interface HistoricalData {
  period: string;
  date: string; // ISO date string
  referralCountLevel1: number;
  referralCountLevel2: number;
  networkRating: number;
}

// Функция для получения исторических данных из localStorage
const getHistoricalData = (period: string): HistoricalData[] => {
  try {
    const key = `reports_historical_${period}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.warn('[ReportsBlock] Error reading historical data:', error);
  }
  return [];
};

// Функция для сохранения исторических данных
const saveHistoricalData = (period: string, data: HistoricalData[]) => {
  try {
    const key = `reports_historical_${period}`;
    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.warn('[ReportsBlock] Error saving historical data:', error);
  }
};

// Функция для получения меток периода
const getPeriodLabels = (period: string, t: Translate): string[] => {
  if (period === t('reportsBlock.month')) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const endOfMonth = new Date(year, month + 1, 0);
    const daysInMonth = endOfMonth.getDate();
    const count = 10;
    const labels: string[] = [];
    
    for (let i = 0; i < count; i++) {
      const day = Math.round(1 + (i / (count - 1)) * (daysInMonth - 1));
      const finalDay = Math.max(1, Math.min(day, daysInMonth));
      labels.push(finalDay.toString());
    }
    
    labels[0] = '1';
    labels[labels.length - 1] = daysInMonth.toString();
    return labels;
  }
  
  const periodConfig: Record<string, string[]> = {
    [t('reportsBlock.yesterday')]: ['00:00', '02:00', '04:00', '06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00'],
    [t('reportsBlock.today')]: ['00:00', '02:00', '04:00', '06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00'],
    [t('reportsBlock.week')]: [t('reportsBlock.mon'), t('reportsBlock.tue'), t('reportsBlock.wed'), t('reportsBlock.thu'), t('reportsBlock.fri'), t('reportsBlock.sat'), t('reportsBlock.sun')]
  };
  
  return periodConfig[period] || periodConfig[t('reportsBlock.week')];
};

// Функция для расчета темпа роста (процент изменения)
// @ts-ignore TS6133 - функция зарезервирована для будущего использования
const _calculateGrowthRate = (current: number, previous: number): number => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
};

// Функция для получения дат периода
const getPeriodDates = (period: string, t: Translate): Date[] => {
  const labels = getPeriodLabels(period, t);
  const now = new Date();
  const dates: Date[] = [];
  
  if (period === t('reportsBlock.month')) {
    const year = now.getFullYear();
    const month = now.getMonth();
    const endOfMonth = new Date(year, month + 1, 0);
    const daysInMonth = endOfMonth.getDate();
    
    labels.forEach((label) => {
      const day = parseInt(label, 10);
      if (!isNaN(day) && day >= 1 && day <= daysInMonth) {
        const date = new Date(year, month, day, 0, 0, 0, 0);
        dates.push(date);
      }
    });
  } else if (period === t('reportsBlock.week')) {
    const dayOfWeek = now.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Понедельник = 1
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    
    labels.forEach((_, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      date.setHours(0, 0, 0, 0);
      dates.push(date);
    });
  } else if (period === t('reportsBlock.today') || period === t('reportsBlock.yesterday')) {
    const baseDate = period === t('reportsBlock.yesterday') 
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0)
      : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    
    labels.forEach((label) => {
      const parts = label.split(':');
      const hours = parseInt(parts[0], 10);
      const minutes = parts[1] ? parseInt(parts[1], 10) : 0;
      
      if (!isNaN(hours) && hours >= 0 && hours < 24) {
        const date = new Date(baseDate);
        date.setHours(hours, minutes, 0, 0);
        dates.push(date);
      }
    });
  }
  
  return dates;
};

// Функция для группировки лидов по датам и вычисления накопленного количества
const getCumulativeCountsByDate = (leads: Lead[], period: string, dates: Date[], t: Translate): number[] => {
  // Фильтруем лиды сети
  const networkLeads = leads.filter(lead => lead.productType === ProductType.NETWORK);
  
  if (networkLeads.length === 0) {
    return dates.map(() => 0);
  }
  
  // Сортируем лиды по дате создания
  const sortedLeads = [...networkLeads].sort((a, b) => 
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  
  const cumulativeCounts: number[] = [];
  
  dates.forEach((date) => {
    // Подсчитываем количество лидов, созданных до или в эту дату/время
    const count = sortedLeads.filter(lead => {
      const leadDate = new Date(lead.createdAt);
      const comparisonDate = new Date(date);
      
      if (period === t('reportsBlock.month') || period === t('reportsBlock.week')) {
        // Для месяца и недели сравниваем только дату (без времени)
        // Приводим к началу дня для корректного сравнения
        const leadDateOnly = new Date(leadDate.getFullYear(), leadDate.getMonth(), leadDate.getDate());
        const comparisonDateOnly = new Date(comparisonDate.getFullYear(), comparisonDate.getMonth(), comparisonDate.getDate());
        return leadDateOnly.getTime() <= comparisonDateOnly.getTime();
      } else {
        // Для дня (Сегодня/Вчера) сравниваем с точностью до часа
        const leadDateOnly = new Date(leadDate.getFullYear(), leadDate.getMonth(), leadDate.getDate());
        const comparisonDateOnly = new Date(comparisonDate.getFullYear(), comparisonDate.getMonth(), comparisonDate.getDate());
        
        // Если даты разные, сравниваем только даты
        if (leadDateOnly.getTime() !== comparisonDateOnly.getTime()) {
          return leadDateOnly.getTime() < comparisonDateOnly.getTime();
        }
        
        // Если даты одинаковые, сравниваем время с точностью до часа
        // Для периода t('reportsBlock.today')/t('reportsBlock.yesterday') метки показывают начало часа (00:00, 02:00 и т.д.)
        // Поэтому считаем лиды, созданные до начала этого часа включительно
        const leadHour = leadDate.getHours();
        const comparisonHour = comparisonDate.getHours();
        
        // Сравниваем часы: лид должен быть создан в этот час или раньше
        return leadHour <= comparisonHour;
      }
    }).length;
    
    cumulativeCounts.push(count);
  });
  
  return cumulativeCounts;
};

// Функция для группировки дат присоединения рефералов 2 уровня по датам и вычисления накопленного количества
const getCumulativeCountsByDateLevel2 = (joinDates: string[], period: string, dates: Date[], t: Translate): number[] => {
  if (joinDates.length === 0) {
    return dates.map(() => 0);
  }
  
  // Парсим даты присоединения и сортируем их
  const parsedDates = joinDates
    .map(dateStr => {
      // Парсим дату в формате DD.MM.YYYY
      const parts = dateStr.trim().split('.');
      if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; // месяцы в JS начинаются с 0
        const year = parseInt(parts[2], 10);
        if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
          return new Date(year, month, day);
        }
      }
      return null;
    })
    .filter((date): date is Date => date !== null)
    .sort((a, b) => a.getTime() - b.getTime());
  
  const cumulativeCounts: number[] = [];
  
  dates.forEach((date) => {
    // Подсчитываем количество рефералов, присоединившихся до или в эту дату/время
    const count = parsedDates.filter(joinDate => {
      const comparisonDate = new Date(date);
      
      if (period === t('reportsBlock.month') || period === t('reportsBlock.week')) {
        // Для месяца и недели сравниваем только дату (без времени)
        const joinDateOnly = new Date(joinDate.getFullYear(), joinDate.getMonth(), joinDate.getDate());
        const comparisonDateOnly = new Date(comparisonDate.getFullYear(), comparisonDate.getMonth(), comparisonDate.getDate());
        return joinDateOnly.getTime() <= comparisonDateOnly.getTime();
      } else {
        // Для дня (Сегодня/Вчера) сравниваем с точностью до часа
        const joinDateOnly = new Date(joinDate.getFullYear(), joinDate.getMonth(), joinDate.getDate());
        const comparisonDateOnly = new Date(comparisonDate.getFullYear(), comparisonDate.getMonth(), comparisonDate.getDate());
        
        if (joinDateOnly.getTime() !== comparisonDateOnly.getTime()) {
          return joinDateOnly.getTime() < comparisonDateOnly.getTime();
        }
        
        const joinHour = joinDate.getHours();
        const comparisonHour = comparisonDate.getHours();
        return joinHour <= comparisonHour;
      }
    }).length;
    
    cumulativeCounts.push(count);
  });
  
  return cumulativeCounts;
};

// Функция для генерации данных темпа роста рефералов 1 уровня на основе реальных данных
const getReferralGrowthRateLevel1 = (
  period: string, 
  _currentReferralCount: number, // Префикс _ указывает, что параметр намеренно не используется
  leads: Lead[],
  t: Translate
): { data: number[]; labels: string[] } => {
  const labels = getPeriodLabels(period, t);
  const dates = getPeriodDates(period, t);
  const data: number[] = [];
  
  // Убеждаемся, что количество дат соответствует количеству меток
  if (dates.length === labels.length && dates.length > 0) {
    // Получаем накопленные количества по датам
    const cumulativeCounts = getCumulativeCountsByDate(leads, period, dates, t);
    
    
    // Вычисляем темп роста для каждой точки
    for (let i = 0; i < cumulativeCounts.length; i++) {
      const current = cumulativeCounts[i];
      const previous = i > 0 ? cumulativeCounts[i - 1] : 0;
      
      // Если предыдущее значение 0, а текущее больше 0 - это 100% рост
      // Если оба 0 - рост 0%
      // Иначе вычисляем процент изменения
      let growthRate = 0;
      if (previous === 0) {
        growthRate = current > 0 ? 100 : 0;
      } else {
        growthRate = ((current - previous) / previous) * 100;
      }
      
      data.push(Math.max(-100, Math.min(100, growthRate)));
    }
  } else {
    // Если нет данных или несоответствие дат, генерируем демо-данные
    const baseValue = 5;
    for (let i = 0; i < labels.length; i++) {
      const seed = cyrb53(`growth_level1_${period}_${i}`);
      const variation = (seed % 20) - 10;
      const value = baseValue + variation;
      data.push(Math.max(-50, Math.min(50, value)));
    }
  }
  
  return { data, labels };
};

// Функция для генерации данных темпа роста рефералов 2 уровня на основе реальных данных
const getReferralGrowthRateLevel2 = (
  period: string, 
  _currentReferralCount: number, // Префикс _ указывает, что параметр намеренно не используется
  joinDates: string[],
  t: Translate
): { data: number[]; labels: string[] } => {
  const labels = getPeriodLabels(period, t);
  const dates = getPeriodDates(period, t);
  const data: number[] = [];
  
  // Убеждаемся, что количество дат соответствует количеству меток
  if (dates.length === labels.length && dates.length > 0) {
    // Получаем накопленные количества по датам
    const cumulativeCounts = getCumulativeCountsByDateLevel2(joinDates, period, dates, t);
    
    
    // Вычисляем темп роста для каждой точки
    for (let i = 0; i < cumulativeCounts.length; i++) {
      const current = cumulativeCounts[i];
      const previous = i > 0 ? cumulativeCounts[i - 1] : 0;
      
      // Если предыдущее значение 0, а текущее больше 0 - это 100% рост
      // Если оба 0 - рост 0%
      // Иначе вычисляем процент изменения
      let growthRate = 0;
      if (previous === 0) {
        growthRate = current > 0 ? 100 : 0;
      } else {
        growthRate = ((current - previous) / previous) * 100;
      }
      
      data.push(Math.max(-100, Math.min(100, growthRate)));
    }
  } else {
    // Если нет данных или несоответствие дат, генерируем демо-данные
    const baseValue = 3; // Базовый темп роста 3%
    for (let i = 0; i < labels.length; i++) {
      const seed = cyrb53(`growth_level2_${period}_${i}`);
      const variation = (seed % 15) - 7.5;
      const value = baseValue + variation;
      data.push(Math.max(-50, Math.min(50, value)));
    }
  }
  
  return { data, labels };
};

// Функция для расчета рейтинга сети (комбинация метрик)
const calculateNetworkRating = (
  referralCountLevel1: number,
  referralCountLevel2: number,
  totalLeads: number,
  completedTasks: number,
  totalTasks: number
): number => {
  // Формула рейтинга: взвешенная сумма различных метрик
  const referralScore = (referralCountLevel1 * 2 + referralCountLevel2) * 10; // Рефералы важны
  const leadsScore = totalLeads * 5; // Лиды важны
  const tasksScore = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0; // Процент выполнения задач
  
  // Нормализуем до 0-100
  const totalScore = referralScore + leadsScore + tasksScore;
  return Math.min(100, Math.max(0, totalScore / 10));
};

// Функция для генерации данных роста рейтинга сети на основе реальных данных
const getNetworkRatingGrowth = (
  period: string,
  referralCountLevel1: number,
  referralCountLevel2: number,
  totalLeads: number,
  completedTasks: number,
  totalTasks: number,
  leads: Lead[],
  t: Translate
): { data: number[]; labels: string[] } => {
  const labels = getPeriodLabels(period, t);
  const dates = getPeriodDates(period, t);
  const data: number[] = [];
  
  // Убеждаемся, что количество дат соответствует количеству меток
  if (dates.length === labels.length && dates.length > 0) {
    // Получаем накопленные количества лидов по датам
    const cumulativeCounts = getCumulativeCountsByDate(leads, period, dates, t);
    
    
    // Вычисляем рейтинг для каждой точки на основе накопленного количества
    const maxLeads = Math.max(...cumulativeCounts, 1);
    
    cumulativeCounts.forEach((cumulativeLeads) => {
      // Вычисляем рейтинг на основе накопленного количества лидов
      // Используем более осмысленную формулу: рейтинг растет с количеством лидов
      // но не просто нормализация, а более плавный рост
      let rating = 0;
      
      if (maxLeads > 0) {
        // Нормализуем количество лидов (0-100)
        const normalizedLeads = (cumulativeLeads / maxLeads) * 100;
        
        // Применяем нелинейное масштабирование для более плавного роста
        // Используем квадратный корень для более плавного роста при малых значениях
        rating = Math.min(100, Math.max(0, normalizedLeads));
      } else {
        // Если нет лидов, рейтинг 0
        rating = 0;
      }
      
      data.push(rating);
    });
  } else {
    // Если нет данных или несоответствие дат, используем текущий рейтинг
    const currentRating = calculateNetworkRating(
      referralCountLevel1,
      referralCountLevel2,
      totalLeads,
      completedTasks,
      totalTasks
    );
    
    const baseRating = currentRating || 50;
    for (let i = 0; i < labels.length; i++) {
      const seed = cyrb53(`rating_${period}_${i}`);
      const variation = (seed % 20) - 10;
      const progress = i / (labels.length - 1);
      const value = baseRating * 0.7 + (baseRating * 0.3 * progress) + variation;
      data.push(Math.max(0, Math.min(100, value)));
    }
  }
  
  return { data, labels };
};

const ReportsBlock = ({ tasks, leads = [], onModalOpen }: ReportsBlockProps) => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isReportsBlockCollapsed, setIsReportsBlockCollapsed] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const [isReportsModalOpen, setIsReportsModalOpen] = useState(() => {
    return searchParams.get('modal') === 'reports';
  });
  const [selectedPeriod, setSelectedPeriod] = useState(t('reportsBlock.yesterday'));
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);
  const [selectedSort, setSelectedSort] = useState(t('reportsBlock.newFirst'));
  const [selectedViewType, setSelectedViewType] = useState('grid'); // 'grid' или 'list'
  const [showClock, setShowClock] = useState(false);
  const [clockType, setClockType] = useState<'text' | 'circular'>('text'); // 'text' или 'circular'
  const [currentTime, setCurrentTime] = useState(new Date());

  // Состояние для общего количества лидов
  const [totalLeadsCount, setTotalLeadsCount] = useState<number | null>(null);
  const [isLoadingTotalLeads, setIsLoadingTotalLeads] = useState(false);

  // Состояние для объектов сети
  const [networkObjectsLevel1, setNetworkObjectsLevel1] = useState<number>(0);
  const [networkObjectsLevel2, setNetworkObjectsLevel2] = useState<number>(0);
  const [isLoadingNetworkObjects, setIsLoadingNetworkObjects] = useState(false);

  // Состояние для дат присоединения рефералов 2 уровня
  const [referralsLevel2JoinDates, setReferralsLevel2JoinDates] = useState<string[]>([]);
  const [isLoadingReferralsJoinDates, setIsLoadingReferralsJoinDates] = useState(false);

  // Восстановление состояния из URL
  useEffect(() => {
    const modalParam = searchParams.get('modal');
    if (modalParam === 'reports' && !isReportsModalOpen) {
      setIsReportsModalOpen(true);
    } else if (modalParam !== 'reports' && isReportsModalOpen) {
      setIsReportsModalOpen(false);
    }
  }, [searchParams]);

  // Сбрасываем данные при закрытии модального окна отчетов
  useEffect(() => {
    if (!isReportsModalOpen) {
      // Сбрасываем все данные отчетов при закрытии модального окна
      setTotalLeadsCount(null);
      setIsLoadingTotalLeads(false);
      setNetworkObjectsLevel1(0);
      setNetworkObjectsLevel2(0);
      setIsLoadingNetworkObjects(false);
      setReferralsLevel2JoinDates([]);
      setIsLoadingReferralsJoinDates(false);
    }
  }, [isReportsModalOpen]);

  // Подсчитываем текущие метрики
  const completedTasksCount = tasks.filter(t => t.status === TaskStatus.COMPLETED).length;
  const totalTasksCount = tasks.length;
  const completionPercentage = totalTasksCount > 0 ? (completedTasksCount / totalTasksCount) * 100 : 0;
  
  const referralCountLevel1 = useMemo(() => {
    return leads.filter(lead => lead.productType === ProductType.NETWORK).length;
  }, [leads]);
  
  // Количество рефералов L2 = сумма по API getJoinDate по каждому партнёру (длина массива date для каждого email)
  const referralCountLevel2 = useMemo(() => referralsLevel2JoinDates.length, [referralsLevel2JoinDates]);

  // Вычисляем прирост рефералов для выбранного периода
  const referralsGrowthLevel1 = useMemo(() => {
    const networkLeads = leads.filter(lead => lead.productType === ProductType.NETWORK);
    const dates = getPeriodDates(selectedPeriod, t);
    
    if (dates.length === 0) return 0;
    
    // Создаем копии дат, чтобы не изменять оригиналы
    const periodStart = new Date(dates[0]);
    const periodEnd = new Date(dates[dates.length - 1]);
    
    // Для периода t('reportsBlock.today') или t('reportsBlock.yesterday') берем конец последнего часа
    if (selectedPeriod === t('reportsBlock.today') || selectedPeriod === t('reportsBlock.yesterday')) {
      periodEnd.setHours(periodEnd.getHours() + 1, 59, 59, 999);
    } else {
      // Для недели и месяца берем конец последнего дня
      periodEnd.setHours(23, 59, 59, 999);
    }
    
    // Подсчитываем количество рефералов 1 уровня, созданных в выбранном периоде
    const growthCount = networkLeads.filter(lead => {
      const leadDate = new Date(lead.createdAt);
      return leadDate >= periodStart && leadDate <= periodEnd;
    }).length;
    
    return growthCount;
  }, [leads, selectedPeriod, t]);

  const referralsGrowthLevel2 = useMemo(() => {
    if (referralsLevel2JoinDates.length === 0) return 0;
    
    const dates = getPeriodDates(selectedPeriod, t);
    
    if (dates.length === 0) return 0;
    
    // Создаем копии дат, чтобы не изменять оригиналы
    const periodStart = new Date(dates[0]);
    const periodEnd = new Date(dates[dates.length - 1]);
    
    // Для периода t('reportsBlock.today') или t('reportsBlock.yesterday') берем конец последнего часа
    if (selectedPeriod === t('reportsBlock.today') || selectedPeriod === t('reportsBlock.yesterday')) {
      periodEnd.setHours(periodEnd.getHours() + 1, 59, 59, 999);
    } else {
      // Для недели и месяца берем конец последнего дня
      periodEnd.setHours(23, 59, 59, 999);
    }
    
    // Парсим даты присоединения и подсчитываем количество в выбранном периоде
    const growthCount = referralsLevel2JoinDates.filter(dateStr => {
      const parts = dateStr.trim().split('.');
      if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; // месяцы в JS начинаются с 0
        const year = parseInt(parts[2], 10);
        if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
          const joinDate = new Date(year, month, day, 0, 0, 0, 0);
          return joinDate >= periodStart && joinDate <= periodEnd;
        }
      }
      return false;
    }).length;
    
    return growthCount;
  }, [referralsLevel2JoinDates, selectedPeriod, t]);

  const totalReferralsGrowth = useMemo(() => {
    return referralsGrowthLevel1 + referralsGrowthLevel2;
  }, [referralsGrowthLevel1, referralsGrowthLevel2]);
  
  // Данные для трех графиков
  const growthRateLevel1Data = getReferralGrowthRateLevel1(selectedPeriod, referralCountLevel1, leads, t);
  const growthRateLevel2Data = getReferralGrowthRateLevel2(selectedPeriod, referralCountLevel2, referralsLevel2JoinDates, t);
  const networkRatingData = getNetworkRatingGrowth(
    selectedPeriod,
    referralCountLevel1,
    referralCountLevel2,
    totalLeadsCount ?? 0,
    completedTasksCount,
    totalTasksCount,
    leads,
    t
  );
  
  // Используем метки из первого графика (все должны быть одинаковыми)
  // const chartLabels = growthRateLevel1Data.labels; // Зарезервировано для будущего использования
  
  // Сохраняем текущие данные в историю при изменении периода или данных
  useEffect(() => {
    const currentRating = calculateNetworkRating(
      referralCountLevel1,
      referralCountLevel2,
      totalLeadsCount ?? 0,
      completedTasksCount,
      totalTasksCount
    );
    
    const historicalData: HistoricalData[] = getHistoricalData(selectedPeriod);
    const newDataPoint: HistoricalData = {
      period: selectedPeriod,
      date: new Date().toISOString(),
      referralCountLevel1,
      referralCountLevel2,
      networkRating: currentRating
    };
    
    // Добавляем новую точку данных, ограничиваем до последних 10 точек
    const updatedData = [...historicalData, newDataPoint].slice(-10);
    saveHistoricalData(selectedPeriod, updatedData);
  }, [selectedPeriod, referralCountLevel1, referralCountLevel2, totalLeadsCount, completedTasksCount, totalTasksCount]);

  // Сортировка лидов по дате создания
  const sortedLeads = useMemo(() => {
    const leadsCopy = [...leads];
    if (selectedSort === t('reportsBlock.newFirst')) {
      // Сортировка по убыванию (новые сначала)
      return leadsCopy.sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateB - dateA;
      });
    } else {
      // Сортировка по возрастанию (старые сначала)
      return leadsCopy.sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateA - dateB;
      });
    }
  }, [leads, selectedSort]);

  // Собираем email адреса рефералов (лидов из Сети, все этапы)
  // Используем email из лидов для запроса количества лидов из продаж
  const referralEmails = useMemo(() => {
    const networkLeadsAtWorkStarted = leads.filter(lead => 
      lead.productType === ProductType.NETWORK
    );
    
    // Собираем email адреса рефералов (только валидные email)
    const emails = new Set<string>();
    networkLeadsAtWorkStarted.forEach(lead => {
      if (lead.email && lead.email.trim()) {
        const email = lead.email.trim().toLowerCase();
        // Простая проверка формата email
        if (email.includes('@') && email.length > 3) {
          emails.add(email);
        } else {
          console.warn('[ReportsBlock] Invalid email format in lead:', lead.email, lead._id);
        }
      } else {
        console.warn('[ReportsBlock] Lead without email:', lead._id, lead.name);
      }
    });
    
    return Array.from(emails);
  }, [leads]);

  // Загружаем общее количество лидов в сети - сумма всех лидов всех рефералов
  // Используем getLeadsStatsByEmail для получения статистики по этапам и суммируем все лиды
  // ВАЖНО: Загружаем только когда модалка открыта, чтобы не делать лишние запросы
  useEffect(() => {
    // Не загружаем данные, если модалка закрыта
    if (!isReportsModalOpen) {
      return;
    }

    const loadTotalLeads = async () => {
      if (referralEmails.length === 0) {
        setTotalLeadsCount(0);
        return;
      }

      setIsLoadingTotalLeads(true);
      try {
        // Для каждого email реферала получаем все лиды из продаж и считаем их
        let totalCount = 0;
        const emailCounts: Record<string, number> = {};
        
        // Для каждого email реферала получаем общее количество лидов из продаж
        // Используем новый метод getAllNumbersLeads, который возвращает точное количество
        for (const email of referralEmails) {
          try {
            // Проверяем валидность email перед запросом
            if (!email || !email.trim() || !email.includes('@')) {
              console.warn(`[ReportsBlock] Invalid email format: ${email}`);
              emailCounts[email] = 0;
              continue;
            }
            
            const response = await apiService.getAllNumbersLeads(email.trim());

            if (response.success && response.data) {
              // Согласно документации, если пользователь не найден, метод возвращает count: 0
              const count = response.data.count;
              emailCounts[email] = count;
              totalCount += count;
            } else {
              console.warn(`[ReportsBlock] Failed to get leads count for ${email}:`, response.message);
              // Если запрос не удался, считаем 0
              emailCounts[email] = 0;
            }
          } catch (error: any) {
            // Обрабатываем ошибку более детально
            const errorMessage = error?.response?.data?.message || error?.message || 'Unknown error';
            const errorData = error?.response?.data;
            console.error(`[ReportsBlock] Error loading leads stats for ${email}:`, errorMessage);
            console.error(`[ReportsBlock] Error response data:`, errorData);
            
            // Если это ошибка t('reportsBlock.userNotFound') или t('reportsBlock.noAccess'), это нормально - считаем 0
            if (errorMessage.includes(t('reportsBlock.notFound')) || 
                errorMessage.includes('not found') ||
                errorMessage.includes(t('reportsBlock.noAccess')) ||
                errorMessage.includes('Forbidden')) {
              console.warn(`[ReportsBlock] User not found or no access for ${email}, counting as 0`);
              emailCounts[email] = 0;
            } 
            // Если это ошибка невалидного ID в токене, это критическая ошибка
            else if (errorMessage.includes(t('reportsBlock.invalidIdFormat')) || 
                     errorMessage.includes('ObjectId') ||
                     errorMessage.includes('12 bytes') ||
                     errorMessage.includes('24 hex') ||
                     errorMessage.includes(t('reportsBlock.reauthorization'))) {
              console.error(`[ReportsBlock] Invalid user ID in JWT token. This is a critical error.`);
              console.error(`[ReportsBlock] User may need to re-login. Counting as 0 for now.`);
              emailCounts[email] = 0;
            } 
            // Для других ошибок тоже считаем 0, но логируем
            else {
              console.warn(`[ReportsBlock] Unknown error for ${email}, counting as 0`);
              emailCounts[email] = 0;
            }
          }
        }
        
        setTotalLeadsCount(totalCount);
      } catch (error) {
        console.error('[ReportsBlock] Error loading total network leads:', error);
        setTotalLeadsCount(null);
      } finally {
        setIsLoadingTotalLeads(false);
      }
    };

    loadTotalLeads();
  }, [referralEmails, isReportsModalOpen]);

  // Загружаем объекты сети (1 и 2 уровень)
  useEffect(() => {
    // Не загружаем данные, если модалка закрыта
    if (!isReportsModalOpen) {
      return;
    }

    const loadNetworkObjects = async () => {
      if (referralEmails.length === 0) {
        setNetworkObjectsLevel1(0);
        setNetworkObjectsLevel2(0);
        return;
      }

      setIsLoadingNetworkObjects(true);
      try {
        let totalLevel1 = 0;
        let totalLevel2 = 0;
        
        // Для каждого реферала получаем его объекты (1 уровень) и объекты его рефералов (2 уровень)
        for (const email of referralEmails) {
          try {
            // Проверяем валидность email перед запросом
            if (!email || !email.trim() || !email.includes('@')) {
              console.warn(`[ReportsBlock] Invalid email format: ${email}`);
              continue;
            }
            
            const normalizedEmail = email.trim();
            
            // Получаем объекты реферала (1 уровень)
            const objectsLevel1Response = await apiService.getTotalObjectsCountByEmail(normalizedEmail);

            if (objectsLevel1Response.success && objectsLevel1Response.data) {
              const count = objectsLevel1Response.data.totalCount || 0;
              totalLevel1 += count;
            } else {
              console.warn(`[ReportsBlock] Failed to get objects count (level 1) for ${normalizedEmail}:`, objectsLevel1Response.message);
            }
            
            // Получаем объекты рефералов реферала (2 уровень)
            const objectsLevel2Response = await apiService.getReferralsTotalObjects(normalizedEmail);

            if (objectsLevel2Response.success && objectsLevel2Response.data) {
              const count = objectsLevel2Response.data.total || 0;
              totalLevel2 += count;
            } else {
              console.warn(`[ReportsBlock] Failed to get objects count (level 2) for ${normalizedEmail}:`, objectsLevel2Response.message);
            }
          } catch (error: any) {
            const errorMessage = error?.response?.data?.message || error?.message || 'Unknown error';
            console.error(`[ReportsBlock] Error loading objects for ${email}:`, errorMessage);
          }
        }
        
        setNetworkObjectsLevel1(totalLevel1);
        setNetworkObjectsLevel2(totalLevel2);
      } catch (error) {
        console.error('[ReportsBlock] Error loading network objects:', error);
        setNetworkObjectsLevel1(0);
        setNetworkObjectsLevel2(0);
      } finally {
        setIsLoadingNetworkObjects(false);
      }
    };

    loadNetworkObjects();
  }, [referralEmails, isReportsModalOpen]);

  // Загружаем даты присоединения рефералов 2 уровня
  useEffect(() => {
    // Не загружаем данные, если модалка закрыта
    if (!isReportsModalOpen) {
      return;
    }

    const loadReferralsJoinDates = async () => {
      if (referralEmails.length === 0) {
        setReferralsLevel2JoinDates([]);
        return;
      }

      setIsLoadingReferralsJoinDates(true);
      try {
        const allJoinDates: string[] = [];
        
        // Для каждого реферала получаем даты присоединения его рефералов (2 уровень)
        for (const email of referralEmails) {
          try {
            // Проверяем валидность email перед запросом
            if (!email || !email.trim() || !email.includes('@')) {
              console.warn(`[ReportsBlock] Invalid email format: ${email}`);
              continue;
            }
            
            const normalizedEmail = email.trim();
            
            // Получаем даты присоединения рефералов 2 уровня
            const joinDatesResponse = await apiService.getReferralsJoinDate(normalizedEmail);

            if (joinDatesResponse.success && joinDatesResponse.data && joinDatesResponse.data.date) {
              const dates = Array.isArray(joinDatesResponse.data.date)
                ? joinDatesResponse.data.date
                : [];
              allJoinDates.push(...dates);
            } else {
              console.warn(`[ReportsBlock] Failed to get join dates for ${normalizedEmail}:`, joinDatesResponse.message);
            }
          } catch (error: any) {
            const errorMessage = error?.response?.data?.message || error?.message || 'Unknown error';
            console.error(`[ReportsBlock] Error loading join dates for ${email}:`, errorMessage);
          }
        }
        
        setReferralsLevel2JoinDates(allJoinDates);
      } catch (error) {
        console.error('[ReportsBlock] Error loading referrals join dates:', error);
        setReferralsLevel2JoinDates([]);
      } finally {
        setIsLoadingReferralsJoinDates(false);
      }
    };

    loadReferralsJoinDates();
  }, [referralEmails, isReportsModalOpen]);

  // Вычисляем прогресс для лидов из Сети
  const networkLeadsAtWorkStarted = Math.min(
    leads.filter(lead => 
      lead.productType === ProductType.NETWORK && 
      lead.stage === LeadStage.NETWORK_WORK_STARTED
    ).length,
    30
  );
  const totalNetworkLeads = 30;

  // Подсчитываем статистику чеклиста
  const [, setChecklistStats] = useState(() => getChecklistStats());

  // Обновляем статистику при открытии блока отчетов
  useEffect(() => {
    if (!isReportsBlockCollapsed) {
      // Используем setTimeout, чтобы обновление произошло после рендеринга
      const timeoutId = setTimeout(() => {
        setChecklistStats(getChecklistStats());
      }, 0);
      return () => clearTimeout(timeoutId);
    }
  }, [isReportsBlockCollapsed]);

  // Обновляем статистику при изменении localStorage
  useEffect(() => {
    const handleStorageChange = () => {
      // Используем setTimeout, чтобы обновление произошло после рендеринга
      setTimeout(() => {
        setChecklistStats(getChecklistStats());
      }, 0);
    };

    // Слушаем изменения в localStorage (событие storage срабатывает только в других вкладках)
    window.addEventListener('storage', handleStorageChange);
    
    // Для обновления в текущей вкладке используем кастомное событие
    // которое будет срабатывать при изменении чекбоксов в LeadStageChecklist
    window.addEventListener('checklistUpdated', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('checklistUpdated', handleStorageChange);
    };
  }, []);

  // Отключаем скролл основной страницы при открытии модалки
  useEffect(() => {
    if (isReportsModalOpen) {
      // Сохраняем текущее значение overflow
      const originalOverflow = document.body.style.overflow;
      // Отключаем скролл
      document.body.style.overflow = 'hidden';
      
      return () => {
        // Восстанавливаем скролл при закрытии модалки
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isReportsModalOpen]);

  // Закрываем выпадающий список при клике вне его
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (isSortDropdownOpen && !target.closest('.sort-dropdown-container')) {
        setIsSortDropdownOpen(false);
      }
    };

    if (isSortDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isSortDropdownOpen]);

  // Обновление времени каждую секунду
  useEffect(() => {
    if (!showClock) return;
    
    const timeInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => {
      clearInterval(timeInterval);
    };
  }, [showClock]);

  return (
    <>
      <div className="flex flex-col items-center rounded-lg bg-[var(--card)] px-4 py-5 md:px-4 md:pt-6 md:pb-8 gap-y-2 shadow-[inset_0_0_0_1px_rgba(201,168,76,0.12)]" style={{ marginTop: '17px' }}>
        <button
          type="button"
          onClick={() => setIsReportsBlockCollapsed(!isReportsBlockCollapsed)}
          className="w-full md:hidden flex items-center justify-between cursor-pointer text-[rgba(255,255,255,0.92)]"
        >
          <div className="flex items-center gap-2">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-[var(--accent)] shrink-0">
              <path d="M2.75 2C2.75 1.58579 2.41421 1.25 2 1.25C1.58579 1.25 1.25 1.58579 1.25 2V12.0574C1.24999 14.3658 1.24998 16.1748 1.43975 17.5863C1.63399 19.031 2.03933 20.1711 2.93414 21.0659C3.82895 21.9607 4.96897 22.366 6.41371 22.5603C7.82519 22.75 9.63423 22.75 11.9426 22.75H22C22.4142 22.75 22.75 22.4142 22.75 22C22.75 21.5858 22.4142 21.25 22 21.25H12C9.62178 21.25 7.91356 21.2484 6.61358 21.0736C5.33517 20.9018 4.56445 20.5749 3.9948 20.0052C3.42514 19.4355 3.09825 18.6648 2.92637 17.3864C2.75159 16.0864 2.75 14.3782 2.75 12V2Z" fill="currentColor"/>
              <path d="M19.5875 7.46641C19.8451 7.14204 19.791 6.67026 19.4666 6.41267C19.1422 6.15508 18.6704 6.20921 18.4128 6.53359L15.2948 10.46C15.0496 10.7688 14.8887 10.9708 14.7561 11.1162C14.6265 11.2585 14.5657 11.2989 14.538 11.3137C14.3272 11.4264 14.0754 11.4319 13.8599 11.3285C13.8316 11.3149 13.7691 11.2772 13.6333 11.1407C13.4946 11.0011 13.3251 10.8063 13.0666 10.5085L13.0505 10.4899C12.8126 10.2157 12.6098 9.98188 12.4308 9.80184C12.2448 9.6147 12.0414 9.4401 11.7894 9.31918C11.143 9.00898 10.3875 9.02541 9.75518 9.36342C9.50872 9.49518 9.31307 9.67845 9.13536 9.87351C8.96441 10.0612 8.77192 10.3036 8.54619 10.5878L5.41267 14.5336C5.15508 14.8579 5.20921 15.3297 5.53358 15.5873C5.85795 15.8449 6.32973 15.7908 6.58733 15.4664L9.70551 11.54C9.95077 11.2311 10.1116 11.0292 10.2442 10.8837C10.3738 10.7414 10.4347 10.7011 10.4623 10.6863C10.6731 10.5736 10.925 10.5681 11.1404 10.6715C11.1687 10.6851 11.2313 10.7228 11.367 10.8593C11.5057 10.9989 11.6752 11.1936 11.9337 11.4915L11.9498 11.5101C12.1877 11.7843 12.3906 12.0181 12.5695 12.1981C12.7555 12.3853 12.9589 12.5599 13.2109 12.6808C13.8573 12.991 14.6129 12.9746 15.2452 12.6365C15.4916 12.5048 15.6873 12.3215 15.865 12.1264C16.0359 11.9388 16.2284 11.6964 16.4541 11.4122L19.5875 7.46641Z" fill="currentColor"/>
            </svg>
            <span className="text-base">{t('reportsBlock.reportsTitle')}</span>
          </div>
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={`transition-transform duration-200 text-[var(--accent)] shrink-0 ${isReportsBlockCollapsed ? 'rotate-180' : ''}`}
          >
            <path d="M12.0007 10.8273L7.05072 15.7773L5.63672 14.3633L12.0007 7.99935L18.3647 14.3633L16.9507 15.7773L12.0007 10.8273Z" fill="currentColor"/>
          </svg>
        </button>
        <div className={`${isReportsBlockCollapsed ? 'hidden md:block' : 'block'}`}>
          <div className="flex items-center justify-center gap-10">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                // Циклическое переключение: если показываются круглые часы -> текстовое время, если текстовое время -> прогресс задач, если прогресс задач -> круглые часы
                if (showClock) {
                  if (clockType === 'circular') {
                    setClockType('text');
                  } else {
                    setShowClock(false);
                  }
                } else {
                  setShowClock(true);
                  setClockType('circular');
                }
              }}
              className="cursor-pointer p-1 rounded-md hover:bg-[var(--secondary)] transition-colors"
              aria-label={t('reportsBlock.previous')}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-[var(--accent)]">
                <path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <div className="flex flex-col items-center justify-center" style={{ width: '140px', height: '198px', minHeight: '198px', maxHeight: '198px' }}>
              {showClock ? (
                clockType === 'circular' ? (
                  /* Круглые часы */
                  <div className="flex items-center justify-center w-full h-full">
                    <div className="relative" style={{ width: '140px', height: '140px' }}>
                      <svg width="140" height="140" viewBox="0 0 140 140" className="absolute inset-0">
                        {/* Циферблат */}
                        <circle cx="70" cy="70" r="65" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="2"/>
                        {/* Метки часов */}
                        {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((hour) => {
                          const angle = (hour * 30 - 90) * (Math.PI / 180);
                          const x1 = 70 + 55 * Math.cos(angle);
                          const y1 = 70 + 55 * Math.sin(angle);
                          const x2 = 70 + 60 * Math.cos(angle);
                          const y2 = 70 + 60 * Math.sin(angle);
                          return (
                            <line
                              key={hour}
                              x1={x1}
                              y1={y1}
                              x2={x2}
                              y2={y2}
                              stroke="rgba(255,255,255,0.5)"
                              strokeWidth="2"
                              strokeLinecap="round"
                            />
                          );
                        })}
                        {/* Минутные метки */}
                        {Array.from({ length: 60 }, (_, i) => {
                          if (i % 5 === 0) return null; // Пропускаем часовые метки
                          const angle = (i * 6 - 90) * (Math.PI / 180);
                          const x1 = 70 + 57 * Math.cos(angle);
                          const y1 = 70 + 57 * Math.sin(angle);
                          const x2 = 70 + 60 * Math.cos(angle);
                          const y2 = 70 + 60 * Math.sin(angle);
                          return (
                            <line
                              key={i}
                              x1={x1}
                              y1={y1}
                              x2={x2}
                              y2={y2}
                              stroke="rgba(255,255,255,0.28)"
                              strokeWidth="1"
                              strokeLinecap="round"
                            />
                          );
                        })}
                        {/* Центр часов */}
                        <circle cx="70" cy="70" r="4" fill="var(--accent)"/>
                        {/* Часовая стрелка */}
                        {(() => {
                          const hours = currentTime.getHours() % 12;
                          const minutes = currentTime.getMinutes();
                          const hourAngle = (hours * 30 + minutes * 0.5 - 90) * (Math.PI / 180);
                          const hourLength = 25;
                          const x2 = 70 + hourLength * Math.cos(hourAngle);
                          const y2 = 70 + hourLength * Math.sin(hourAngle);
                          return (
                            <line
                              x1="70"
                              y1="70"
                              x2={x2}
                              y2={y2}
                              stroke="rgba(255,255,255,0.92)"
                              strokeWidth="3"
                              strokeLinecap="round"
                            />
                          );
                        })()}
                        {/* Минутная стрелка */}
                        {(() => {
                          const minutes = currentTime.getMinutes();
                          const seconds = currentTime.getSeconds();
                          const minuteAngle = (minutes * 6 + seconds * 0.1 - 90) * (Math.PI / 180);
                          const minuteLength = 40;
                          const x2 = 70 + minuteLength * Math.cos(minuteAngle);
                          const y2 = 70 + minuteLength * Math.sin(minuteAngle);
                          return (
                            <line
                              x1="70"
                              y1="70"
                              x2={x2}
                              y2={y2}
                              stroke="rgba(255,255,255,0.85)"
                              strokeWidth="2"
                              strokeLinecap="round"
                            />
                          );
                        })()}
                        {/* Секундная стрелка */}
                        {(() => {
                          const seconds = currentTime.getSeconds();
                          const secondAngle = (seconds * 6 - 90) * (Math.PI / 180);
                          const secondLength = 45;
                          const x2 = 70 + secondLength * Math.cos(secondAngle);
                          const y2 = 70 + secondLength * Math.sin(secondAngle);
                          return (
                            <line
                              x1="70"
                              y1="70"
                              x2={x2}
                              y2={y2}
                              stroke="#ffb4ab"
                              strokeWidth="1"
                              strokeLinecap="round"
                            />
                          );
                        })()}
                      </svg>
                    </div>
                  </div>
                ) : (
                  /* Текстовое время */
                  <div className="flex items-center justify-center w-full h-full">
                    <span
                      className="text-[rgba(255,255,255,0.92)] tabular-nums tracking-tight"
                      style={{
                        fontSize: '62px',
                        fontWeight: 400,
                        lineHeight: '1',
                      }}
                    >
                      {currentTime.toLocaleTimeString('ru-RU', { 
                        hour: '2-digit', 
                        minute: '2-digit',
                        hour12: false 
                      })}
                    </span>
                  </div>
                )
              ) : (
                <div className="flex flex-col items-center w-full h-full justify-center">
                  <CircularProgress
                    percentage={completionPercentage}
                    strokeWidth={25}
                    size={140}
                    startAngle={-80}
                  />
                  <div className="flex flex-col items-center text-center mt-2">
                    <span className="text-lg font-normal text-[rgba(255,255,255,0.92)]">
                      {completedTasksCount}
                      <span className="text-base text-[rgba(255,255,255,0.72)]">/{totalTasksCount}</span>
                    </span>
                    <span className="text-base text-[rgba(255,255,255,0.72)]">{t('reportsBlock.tasksCompleted')}</span>
                  </div>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                // Циклическое переключение: прогресс задач -> текстовое время -> круглые часы -> прогресс задач
                if (!showClock) {
                  setShowClock(true);
                  setClockType('text');
                } else if (clockType === 'text') {
                  setClockType('circular');
                } else {
                  // Если круглые часы, переходим обратно к прогрессу задач
                  setShowClock(false);
                }
              }}
              className="cursor-pointer p-1 rounded-md hover:bg-[var(--secondary)] transition-colors"
              aria-label={t('reportsBlock.next')}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-[var(--accent)]">
                <path d="M7.5 15L12.5 10L7.5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              onModalOpen?.();
              navigate(CRM_ANALYTICS_BASE);
            }}
            className="flex text-base text-[rgba(255,255,255,0.72)] hover:text-[var(--accent)] items-center justify-center w-full cursor-pointer mt-2 transition-colors"
          >
            <span>{t('reportsBlock.seeAllReports')}</span>
          </button>
        </div>
      </div>

      {}
      {isReportsModalOpen && (
        <div className="modal-fade-in fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => {
          setIsReportsModalOpen(false);
          const newParams = new URLSearchParams(searchParams);
          newParams.delete('modal');
          setSearchParams(newParams, { replace: true });
        }}>
          <div className="relative w-48/49 h-28/29">
            <button
              onClick={() => {
                setIsReportsModalOpen(false);
                const newParams = new URLSearchParams(searchParams);
                newParams.delete('modal');
                setSearchParams(newParams, { replace: true });
              }}
              className="absolute -top-8 -right-9 z-10 flex items-center justify-center "
              aria-label={t('reportsBlock.closeReports')}
            >
              <svg width="45" height="45" viewBox="0 0 45 45" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M33.75 11.25L11.25 33.75" stroke="white" strokeWidth="3" strokeLinecap="round"/>
                <path d="M11.25 11.25L33.75 33.75" stroke="white" strokeWidth="3" strokeLinecap="round"/>
              </svg>
            </button>
            <div className="reports-font-larger bg-reports-page flex flex-col min-h-0 rounded-[25px] px-10 py-6 shadow-2xl w-full h-full overflow-hidden" onClick={(e) => e.stopPropagation()}>

              <div className="overflow-y-auto max-h-[85vh] hidden">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M17.435 2.9043H11.7014C11.3896 2.9043 11.1364 3.15707 11.1364 3.46926V4.61043C11.1364 4.92227 11.3896 5.17539 11.7014 5.17539H14.1233L9.1677 10.1307L7.06676 8.02973C6.62309 7.58641 5.90414 7.58641 5.46047 8.02973L0.165586 13.3253C-0.0551953 13.5457 -0.0551953 13.9036 0.165586 14.1241L0.972422 14.9313C1.19285 15.1517 1.55074 15.1517 1.77117 14.9313L6.26379 10.4386L8.36438 12.5396C8.80801 12.9833 9.52706 12.9835 9.97066 12.5396L15.7289 6.78133V9.20324C15.7289 9.51508 15.9817 9.7682 16.2939 9.7682H17.435C17.7472 9.7682 18 9.51508 18 9.20324V3.46926C18 3.15707 17.7472 2.9043 17.435 2.9043Z" fill="#169600"/>
                    </svg>
                    <span className="text-2xl font-normal text-dream-primary">{t('reportsBlock.reportsTitle')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="p-5 py-1 border border-dream-primary rounded-full">{t('reportsBlock.last7Days')}</div>
                    <div className="p-5 py-1 border border-dream-primary rounded-full">{t('reportsBlock.myData')}</div>
                    <div className="p-5 py-1 border border-dream-primary rounded-full">{t('reportsBlock.allProducts')}</div>
                    <div className="p-5 py-1 border border-dream-primary rounded-full">{t('reportsBlock.allSources')}</div>
                  </div>
                  <div className="text-base text-white bg-dream-primary rounded-full px-4 py-1">{t('reportsBlock.exportUnavailable')}</div>
                </div>
                <div className="flex flex-col md:flex-row gap-x-5 gap-y-5 items-start crm-menu-row">
                  <div className="flex flex-col items-start gap-5 px-2 py-5 bg-dream-secondary rounded-xl">
                    <div className="flex flex-col items-start gap-2">
                      <span className="text-base font-normal">{t('reportsBlock.sales')}</span>
                      <span className="text-base text-gray-500">{t('reportsBlock.salesFunnel')}</span>
                      <span className="text-base text-gray-500">{t('reportsBlock.relationshipHistory')}</span>
                      <span className="text-base text-gray-500">{t('reportsBlock.leadProcessingSpeed')}</span>
                      <span className="text-base text-gray-500">{t('reportsBlock.sourcesRoi')}</span>
                      <span className="text-base text-gray-500">{t('reportsBlock.deferredDeals')}</span>
                      <span className="text-base text-gray-500">{t('reportsBlock.stageConversion')}</span>
                      <span className="text-base text-gray-500">{t('reportsBlock.activity')}</span>
                      <span className="text-base text-gray-500">{t('reportsBlock.cycleDuration')}</span>
                      <span className="text-base text-gray-500">{t('reportsBlock.mentorKpi')}</span>
                    </div>
                    <div className="flex flex-col items-start gap-2">
                      <span className="text-base font-normal">{t('reportsBlock.networkManagement')}</span>
                      <span className="text-base text-gray-500">{t('reportsBlock.networkStructure')}</span>
                      <span className="text-base text-gray-500">{t('reportsBlock.agentsActivity')}</span>
                      <span className="text-base text-gray-500">{t('reportsBlock.incomeByLevels')}</span>
                      <span className="text-base text-gray-500">{t('reportsBlock.dealsSpeedInNetwork')}</span>
                      <span className="text-base text-gray-500">{t('reportsBlock.agentRating')}</span>
                      <span className="text-base text-gray-500">{t('reportsBlock.taskBalance')}</span>
                      <span className="text-base text-gray-500">{t('reportsBlock.leadProcessingSpeed')}</span>
                      <span className="text-base text-gray-500">{t('reportsBlock.cycleDuration')}</span>
                      <span className="text-base text-gray-500">{t('reportsBlock.mentorKpi')}</span>
                    </div>
                    <div className="flex flex-col items-start gap-2">
                      <span className="text-base font-normal">{t('reportsBlock.networkDevelopment')}</span>
                      <span className="text-base text-gray-500">{t('reportsBlock.networkGrowth')}</span>
                      <span className="text-base text-gray-500">{t('reportsBlock.newcomersActivity')}</span>
                      <span className="text-base text-gray-500">{t('reportsBlock.attractionRating')}</span>
                    </div>
                  </div>
                  <div className="flex justify-between flex-1 items-start">
                    <div className="flex justify-start">
                      {(() => {
                        const greenValue = 45;
                        const yellowValue = 30;
                        const blueValue = 25;
                        const total = Math.max(1, greenValue + yellowValue + blueValue);
                        const r = 60;
                        const c = 2 * Math.PI * r;
                        const greenLen = c * (greenValue / total);
                        const yellowLen = c * (yellowValue / total);
                        const blueLen = c * (blueValue / total);

                        const offYellow = 0;
                        const offGreen = -yellowLen;
                        const offBlue = -(yellowLen + greenLen);
                        const gp = Math.round((greenValue / total) * 100);
                        return (
                          <div className="p-4 rounded-xl flex flex-col items-center gap-6 shadow-sm h-auto">
                            <span>{t('reportsBlock.salesFunnel')}</span>
                            <svg width="180" height="180" viewBox="0 0 180 180" xmlns="http://www.w3.org/2000/svg">
                              <g transform="rotate(-90 90 90)">
                                <circle cx="90" cy="90" r="60" fill="none" stroke="#E5E7EB" strokeWidth="20" />
                                  <circle cx="90" cy="90" r="60" fill="none" stroke="#FFD15C" strokeWidth="20" strokeLinecap="butt"
                                    strokeDasharray={`${yellowLen} ${c - yellowLen}`} strokeDashoffset={offYellow} />
                                  <circle cx="90" cy="90" r="60" fill="none" stroke="#169600" strokeWidth="20" strokeLinecap="butt"
                                    strokeDasharray={`${greenLen} ${c - greenLen}`} strokeDashoffset={offGreen} />
                                  <circle cx="90" cy="90" r="60" fill="none" stroke="#246BFD" strokeWidth="20" strokeLinecap="butt"
                                    strokeDasharray={`${blueLen} ${c - blueLen}`} strokeDashoffset={offBlue} />
                              </g>
                                <circle cx="90" cy="90" r="42" fill="white" />
                                <text x="90" y="94" textAnchor="middle" fontSize="22" fill="#169600" fontFamily="sans-serif">{gp}%</text>
                            </svg>
                            <div className="flex items-center gap-2">
                                <div className="flex flex-col items-center gap-2">
                                  <span>{greenValue}</span>
                                  <div className="flex items-center gap-2">
                                  <span className="w-3 h-3 rounded-full" style={{background:'#169600'}}></span>
                                  <span className="text-base">{t('reportsBlock.newLeads')}</span>
                                  </div>
                                </div>
                                <div className="flex flex-col items-center gap-2">
                                  <span>{yellowValue}</span>
                                  <div className="flex items-center gap-2">
                                  <span className="w-3 h-3 rounded-full" style={{background:'#FFD15C'}}></span>
                                  <span className="text-base">{t('reportsBlock.inProgress')}</span>
                                  </div>
                                </div>
                                <div className="flex flex-col items-center gap-2">
                                  <span>{blueValue}</span>
                                  <div className="flex items-center gap-2">
                                  <span className="w-3 h-3 rounded-full" style={{background:'#246BFD'}}></span>
                                  <span className="text-base">{t('reportsBlock.bought')}</span>
                                  </div>
                                </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    <div className="p-2 bg-dream-secondary flex flex-col items-center">
                      <div className="p-2 rounded-xl flex items-center justify-between gap-10 bg-white w-full">
                        <div className="flex flex-col items-start h-18 justify-between">
                          <span>{t('reportsBlock.inProgress')}</span>
                          <span>112</span>
                        </div>
                        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path opacity="0.21" d="M37 0C49.7025 0 60 10.2975 60 23V37C60 49.7025 49.7025 60 37 60H23C10.2975 60 0 49.7025 0 37V23C0 10.2975 10.2975 0 23 0H37Z" fill="#F4BE5E"/>
                          <path d="M19.1111 40.8889H42.4444C43.3036 40.8889 44 41.5853 44 42.4444C44 43.3036 43.3036 44 42.4444 44H17.5556C16.6964 44 16 43.3036 16 42.4444V17.5556C16 16.6964 16.6964 16 17.5556 16C18.4147 16 19.1111 16.6964 19.1111 17.5556V40.8889Z" fill="#F4BE5E"/>                        <path opacity="0.5" d="M24.9131 34.176C24.3255 34.8027 23.3411 34.8345 22.7143 34.2469C22.0876 33.6593 22.0558 32.6749 22.6434 32.0481L28.4767 25.8259C29.045 25.2198 29.9893 25.1672 30.6213 25.7065L35.2253 29.6353L41.224 22.037C41.7563 21.3627 42.7345 21.2477 43.4088 21.78C44.0831 22.3123 44.1982 23.2905 43.6658 23.9648L36.6658 32.8315C36.1191 33.524 35.1063 33.6237 34.4351 33.0509L29.7311 29.0367L24.9131 34.176Z" fill="#F4BE5E"/>
                        </svg>
                      </div>
                      <span className="text-dream-primary">35%</span>
                      <span className="text-red-500">35%</span>
                      <div className="p-2 rounded-xl flex items-center justify-start gap-10 bg-white w-full">
                        <span>22</span>
                        <div className="flex items-center gap-2">
                          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M13.3993 18C12.0283 18 10.3464 17.3688 8.49341 16.1249C4.74695 13.6109 0.362634 8.45135 0.0228264 4.96506C-0.0858286 3.85005 0.193774 2.95038 0.854053 2.2901L3.14416 0L7.80731 4.66315L7.43443 5.03603C6.83963 5.63094 5.86492 6.60356 5.16806 7.2957C5.80911 8.23712 7.04662 9.62832 7.95969 10.5414C8.82399 11.4049 9.82407 12.191 10.7254 12.793C11.3747 12.1395 12.2486 11.2629 12.9634 10.5466L13.3368 10.1734L18 14.8375L15.7377 17.0998C15.1356 17.7019 14.341 18 13.3993 18Z" fill="#555454"/>
                          </svg>
                          <span className="text-base">{t('reportsBlock.noAnswer')}</span>
                          <span className="text-red-500">35%</span>
                        </div>
                      </div>
                      <div className="p-2 rounded-xl flex items-center justify-start gap-10 bg-white w-full">
                        <span>86</span>
                        <div className="flex items-center gap-2">
                          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M13.3993 18C12.0283 18 10.3464 17.3688 8.49341 16.1249C4.74695 13.6109 0.362634 8.45135 0.0228264 4.96506C-0.0858286 3.85005 0.193774 2.95038 0.854053 2.2901L3.14416 0L7.80731 4.66315L7.43443 5.03603C6.83963 5.63094 5.86492 6.60356 5.16806 7.2957C5.80911 8.23712 7.04662 9.62832 7.95969 10.5414C8.82399 11.4049 9.82407 12.191 10.7254 12.793C11.3747 12.1395 12.2486 11.2629 12.9634 10.5466L13.3368 10.1734L18 14.8375L15.7377 17.0998C15.1356 17.7019 14.341 18 13.3993 18Z" fill="#555454"/>
                          </svg>
                          <span className="text-base">{t('reportsBlock.need')}</span>
                        </div>
                      </div>
                      <span className="text-dream-primary">35%</span>
                      <div className="p-2 rounded-xl flex items-center justify-start gap-10 bg-white w-full">
                        <span>63</span>
                        <div className="flex items-center gap-2">
                          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M9 0C4.05352 0 0 4.05352 0 9C0 13.9465 4.05352 18 9 18C13.9465 18 18 13.9465 18 9C18 4.05352 13.9465 0 9 0ZM3.09379 12.4593C2.49261 11.4469 2.14453 10.2656 2.14453 9C2.14453 5.23477 5.18203 2.15508 8.97887 2.14453C10.2551 2.14453 11.4363 2.49254 12.4594 3.09371C12.7652 3.27305 12.8285 3.67383 12.5859 3.92695C10.9723 5.54059 5.54059 10.9723 3.92695 12.5859C3.67383 12.8285 3.27305 12.7652 3.09379 12.4593ZM9.02113 15.8555C7.74492 15.8555 6.56367 15.5074 5.54063 14.9062C5.2348 14.727 5.17152 14.3156 5.42461 14.073L14.073 5.42461C14.3156 5.17148 14.727 5.23477 14.9062 5.54063C15.5074 6.55313 15.8555 7.73438 15.8555 9C15.8555 12.7863 12.7968 15.8449 9.02113 15.8555Z" fill="#555353"/>
                          </svg>

                          <span className="text-base">{t('reportsBlock.presentation')}</span>
                        </div>
                      </div>
                      <span className="text-dream-primary">35%</span>
                      <div className="p-2 rounded-xl flex items-center justify-start gap-10 bg-white w-full">
                        <span>63</span>
                        <div className="flex items-center gap-2">
                          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M9 0C4.05352 0 0 4.05352 0 9C0 13.9465 4.05352 18 9 18C13.9465 18 18 13.9465 18 9C18 4.05352 13.9465 0 9 0ZM3.09379 12.4593C2.49261 11.4469 2.14453 10.2656 2.14453 9C2.14453 5.23477 5.18203 2.15508 8.97887 2.14453C10.2551 2.14453 11.4363 2.49254 12.4594 3.09371C12.7652 3.27305 12.8285 3.67383 12.5859 3.92695C10.9723 5.54059 5.54059 10.9723 3.92695 12.5859C3.67383 12.8285 3.27305 12.7652 3.09379 12.4593ZM9.02113 15.8555C7.74492 15.8555 6.56367 15.5074 5.54063 14.9062C5.2348 14.727 5.17152 14.3156 5.42461 14.073L14.073 5.42461C14.3156 5.17148 14.727 5.23477 14.9062 5.54063C15.5074 6.55313 15.8555 7.73438 15.8555 9C15.8555 12.7863 12.7968 15.8449 9.02113 15.8555Z" fill="#555353"/>
                          </svg>

                          <span className="text-base">{t('reportsBlock.commercialProposal')}</span>
                        </div>
                      </div>
                      <span className="text-dream-primary">35%</span>
                      <div className="p-2 rounded-xl flex items-center justify-start gap-10 bg-white w-full">
                        <span>63</span>
                        <div className="flex items-center gap-2">
                          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                           <path d="M9 0C4.05352 0 0 4.05352 0 9C0 13.9465 4.05352 18 9 18C13.9465 18 18 13.9465 18 9C18 4.05352 13.9465 0 9 0ZM3.09379 12.4593C2.49261 11.4469 2.14453 10.2656 2.14453 9C2.14453 5.23477 5.18203 2.15508 8.97887 2.14453C10.2551 2.14453 11.4363 2.49254 12.4594 3.09371C12.7652 3.27305 12.8285 3.67383 12.5859 3.92695C10.9723 5.54059 5.54059 10.9723 3.92695 12.5859C3.67383 12.8285 3.27305 12.7652 3.09379 12.4593ZM9.02113 15.8555C7.74492 15.8555 6.56367 15.5074 5.54063 14.9062C5.2348 14.727 5.17152 14.3156 5.42461 14.073L14.073 5.42461C14.3156 5.17148 14.727 5.23477 14.9062 5.54063C15.5074 6.55313 15.8555 7.73438 15.8555 9C15.8555 12.7863 12.7968 15.8449 9.02113 15.8555Z" fill="#555353"/>
                          </svg>

                          <span className="text-base">{t('reportsBlock.feedback')}</span>
                        </div>
                      </div>
                      <span className="text-dream-primary">35%</span>
                      <div className="p-2 rounded-xl flex items-center justify-start gap-10 bg-white w-full">
                        <span>63</span>
                        <div className="flex items-center gap-2">
                          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                           <path d="M9 0C4.05352 0 0 4.05352 0 9C0 13.9465 4.05352 18 9 18C13.9465 18 18 13.9465 18 9C18 4.05352 13.9465 0 9 0ZM3.09379 12.4593C2.49261 11.4469 2.14453 10.2656 2.14453 9C2.14453 5.23477 5.18203 2.15508 8.97887 2.14453C10.2551 2.14453 11.4363 2.49254 12.4594 3.09371C12.7652 3.27305 12.8285 3.67383 12.5859 3.92695C10.9723 5.54059 5.54059 10.9723 3.92695 12.5859C3.67383 12.8285 3.27305 12.7652 3.09379 12.4593ZM9.02113 15.8555C7.74492 15.8555 6.56367 15.5074 5.54063 14.9062C5.2348 14.727 5.17152 14.3156 5.42461 14.073L14.073 5.42461C14.3156 5.17148 14.727 5.23477 14.9062 5.54063C15.5074 6.55313 15.8555 7.73438 15.8555 9C15.8555 12.7863 12.7968 15.8449 9.02113 15.8555Z" fill="#555353"/>
                          </svg>

                          <span className="text-base">{t('reportsBlock.deferredDemand')}</span>
                        </div>
                      </div>
                      <span className="text-dream-primary">35%</span>
                      <div className="p-2 rounded-xl flex items-center justify-start gap-10 bg-white w-full">
                        <span>63</span>
                        <div className="flex items-center gap-2">
                          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                           <path d="M9 0C4.05352 0 0 4.05352 0 9C0 13.9465 4.05352 18 9 18C13.9465 18 18 13.9465 18 9C18 4.05352 13.9465 0 9 0ZM3.09379 12.4593C2.49261 11.4469 2.14453 10.2656 2.14453 9C2.14453 5.23477 5.18203 2.15508 8.97887 2.14453C10.2551 2.14453 11.4363 2.49254 12.4594 3.09371C12.7652 3.27305 12.8285 3.67383 12.5859 3.92695C10.9723 5.54059 5.54059 10.9723 3.92695 12.5859C3.67383 12.8285 3.27305 12.7652 3.09379 12.4593ZM9.02113 15.8555C7.74492 15.8555 6.56367 15.5074 5.54063 14.9062C5.2348 14.727 5.17152 14.3156 5.42461 14.073L14.073 5.42461C14.3156 5.17148 14.727 5.23477 14.9062 5.54063C15.5074 6.55313 15.8555 7.73438 15.8555 9C15.8555 12.7863 12.7968 15.8449 9.02113 15.8555Z" fill="#555353"/>
                          </svg>

                          <span className="text-base">{t('reportsBlock.showing')}</span>
                        </div>
                      </div>
                    </div>
                    <div className="p-2 bg-dream-secondary flex flex-col items-center">
                      <div className="p-2 rounded-xl flex items-center justify-between gap-10 bg-white w-full">
                        <div className="flex flex-col items-start h-18 justify-between">
                          <span>{t('reportsBlock.bought')}</span>
                          <span>445</span>
                        </div>
                        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path opacity="0.3" d="M37 0C49.7025 0 60 10.2975 60 23V37C60 49.7025 49.7025 60 37 60H23C10.2975 60 0 49.7025 0 37V23C0 10.2975 10.2975 0 23 0H37Z" fill="#4EABF5"/>
                          <path opacity="0.78" fillRule="evenodd" clipRule="evenodd" d="M28.6299 23.8074C28.65 23.5469 28.8672 23.3457 29.1285 23.3457H29.5463C29.8032 23.3457 30.0183 23.5404 30.0438 23.796L30.6655 30.0124L35.0802 32.5351C35.236 32.6241 35.3321 32.7898 35.3321 32.9692V33.3577C35.3321 33.6874 35.0186 33.9269 34.7006 33.8401L28.3974 32.1211C28.1661 32.058 28.0121 31.8395 28.0305 31.6004L28.6299 23.8074Z" fill="#4EABF5"/>
                          <path opacity="0.901274" d="M21.8525 15.1895C21.9479 14.7899 22.4575 14.6688 22.7217 14.9834L24.5205 17.1279C26.2036 16.4113 28.0552 16.0127 30 16.0127C37.7319 16.0127 43.9998 22.2809 44 30.0127C44 37.7447 37.732 44.0127 30 44.0127C22.268 44.0127 16 37.7447 16 30.0127C16 28.6997 16.1805 27.4287 16.5186 26.2236L19.0859 26.9443C18.8086 27.9332 18.667 28.9622 18.667 30.0127C18.667 36.2719 23.7408 41.3467 30 41.3467C36.2592 41.3467 41.333 36.2719 41.333 30.0127C41.3328 23.7536 36.2591 18.6797 30 18.6797C28.7318 18.6797 27.4968 18.8881 26.332 19.2861L28.1328 21.4326C28.3974 21.7479 28.1892 22.2296 27.7783 22.2529L20.7334 22.6523C20.3992 22.6712 20.1411 22.3627 20.2188 22.0371L21.8525 15.1895Z" fill="#4EABF5"/>
                        </svg>
                      </div>
                      <span className="text-red-500">35%</span>
                      <div className="p-2 rounded-xl flex items-center justify-start gap-10 bg-white w-full">
                        <span>86</span>
                        <div className="flex items-center gap-2">
                          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M13.3993 18C12.0283 18 10.3464 17.3688 8.49341 16.1249C4.74695 13.6109 0.362634 8.45135 0.0228264 4.96506C-0.0858286 3.85005 0.193774 2.95038 0.854053 2.2901L3.14416 0L7.80731 4.66315L7.43443 5.03603C6.83963 5.63094 5.86492 6.60356 5.16806 7.2957C5.80911 8.23712 7.04662 9.62832 7.95969 10.5414C8.82399 11.4049 9.82407 12.191 10.7254 12.793C11.3747 12.1395 12.2486 11.2629 12.9634 10.5466L13.3368 10.1734L18 14.8375L15.7377 17.0998C15.1356 17.7019 14.341 18 13.3993 18Z" fill="#555454"/>
                          </svg>
                          <span className="text-base">{t('reportsBlock.need')}</span>
                        </div>
                      </div>
                      <span className="text-red-500">35%</span>
                      <div className="p-2 rounded-xl flex items-center justify-start gap-10 bg-white w-full">
                        <span>63</span>
                        <div className="flex items-center gap-2">
                          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M9 0C4.05352 0 0 4.05352 0 9C0 13.9465 4.05352 18 9 18C13.9465 18 18 13.9465 18 9C18 4.05352 13.9465 0 9 0ZM3.09379 12.4593C2.49261 11.4469 2.14453 10.2656 2.14453 9C2.14453 5.23477 5.18203 2.15508 8.97887 2.14453C10.2551 2.14453 11.4363 2.49254 12.4594 3.09371C12.7652 3.27305 12.8285 3.67383 12.5859 3.92695C10.9723 5.54059 5.54059 10.9723 3.92695 12.5859C3.67383 12.8285 3.27305 12.7652 3.09379 12.4593ZM9.02113 15.8555C7.74492 15.8555 6.56367 15.5074 5.54063 14.9062C5.2348 14.727 5.17152 14.3156 5.42461 14.073L14.073 5.42461C14.3156 5.17148 14.727 5.23477 14.9062 5.54063C15.5074 6.55313 15.8555 7.73438 15.8555 9C15.8555 12.7863 12.7968 15.8449 9.02113 15.8555Z" fill="#555353"/>
                          </svg>

                          <span className="text-base">{t('reportsBlock.presentation')}</span>
                        </div>
                      </div>
                      <span className="text-red-500">35%</span>
                      <div className="p-2 rounded-xl flex items-center justify-start gap-10 bg-white w-full">
                        <span>63</span>
                        <div className="flex items-center gap-2">
                          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M9 0C4.05352 0 0 4.05352 0 9C0 13.9465 4.05352 18 9 18C13.9465 18 18 13.9465 18 9C18 4.05352 13.9465 0 9 0ZM3.09379 12.4593C2.49261 11.4469 2.14453 10.2656 2.14453 9C2.14453 5.23477 5.18203 2.15508 8.97887 2.14453C10.2551 2.14453 11.4363 2.49254 12.4594 3.09371C12.7652 3.27305 12.8285 3.67383 12.5859 3.92695C10.9723 5.54059 5.54059 10.9723 3.92695 12.5859C3.67383 12.8285 3.27305 12.7652 3.09379 12.4593ZM9.02113 15.8555C7.74492 15.8555 6.56367 15.5074 5.54063 14.9062C5.2348 14.727 5.17152 14.3156 5.42461 14.073L14.073 5.42461C14.3156 5.17148 14.727 5.23477 14.9062 5.54063C15.5074 6.55313 15.8555 7.73438 15.8555 9C15.8555 12.7863 12.7968 15.8449 9.02113 15.8555Z" fill="#555353"/>
                          </svg>

                          <span className="text-base">{t('reportsBlock.commercialProposal')}</span>
                        </div>
                      </div>
                      <span className="text-red-500">35%</span>
                      <div className="p-2 rounded-xl flex items-center justify-start gap-10 bg-white w-full">
                        <span>63</span>
                        <div className="flex items-center gap-2">
                          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                           <path d="M9 0C4.05352 0 0 4.05352 0 9C0 13.9465 4.05352 18 9 18C13.9465 18 18 13.9465 18 9C18 4.05352 13.9465 0 9 0ZM3.09379 12.4593C2.49261 11.4469 2.14453 10.2656 2.14453 9C2.14453 5.23477 5.18203 2.15508 8.97887 2.14453C10.2551 2.14453 11.4363 2.49254 12.4594 3.09371C12.7652 3.27305 12.8285 3.67383 12.5859 3.92695C10.9723 5.54059 5.54059 10.9723 3.92695 12.5859C3.67383 12.8285 3.27305 12.7652 3.09379 12.4593ZM9.02113 15.8555C7.74492 15.8555 6.56367 15.5074 5.54063 14.9062C5.2348 14.727 5.17152 14.3156 5.42461 14.073L14.073 5.42461C14.3156 5.17148 14.727 5.23477 14.9062 5.54063C15.5074 6.55313 15.8555 7.73438 15.8555 9C15.8555 12.7863 12.7968 15.8449 9.02113 15.8555Z" fill="#555353"/>
                          </svg>

                          <span className="text-base">{t('reportsBlock.feedback')}</span>
                        </div>
                      </div>
                    </div>
                    <div className="p-2 bg-dream-secondary flex flex-col items-center">
                      <div className="p-2 rounded-xl flex items-center justify-between gap-10 bg-white w-full">
                        <div className="flex flex-col items-start h-18 justify-between">
                          <span>{t('reportsBlock.refusals')}</span>
                          <span>54</span>
                        </div>
                        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path opacity="0.21" d="M37 0C49.7025 0 60 10.2975 60 23V37C60 49.7025 49.7025 60 37 60H23C10.2976 59.9999 0 49.7025 0 37V23C0 10.2975 10.2976 0.000127767 23 0H37Z" fill="#A5E1A5"/>
                          <path opacity="0.587821" d="M38.0029 24.668C40.2121 24.668 42.0029 26.4588 42.0029 28.668C42.0029 30.8771 40.2121 32.668 38.0029 32.668C35.7939 32.6678 34.0029 30.877 34.0029 28.668C34.0029 26.4589 35.7939 24.6681 38.0029 24.668ZM26.002 18C28.9473 18.0001 31.3348 20.3877 31.335 23.333C31.335 26.2785 28.9474 28.6669 26.002 28.667C23.0564 28.667 20.668 26.2785 20.668 23.333C20.6681 20.3876 23.0565 18 26.002 18Z" fill="#169600"/>
                          <path d="M25.9775 31.332C32.3612 31.332 37.6062 34.3895 37.9971 40.9316C38.0126 41.1923 37.9967 41.999 36.9951 41.999H14.9697C14.6353 41.9989 13.9728 41.2773 14.001 40.9307C14.5179 34.5673 19.6824 31.3321 25.9775 31.332ZM37.4814 33.999C42.0215 34.0501 45.7278 36.3447 46.0068 41.1963C46.0181 41.3919 46.0067 41.9957 45.2842 41.9961H40.1475C40.1472 38.9955 39.1545 36.2269 37.4814 33.999Z" fill="#169600"/>
                        </svg>

                      </div>
                      <span className="text-red-500">35%</span>
                      <div className="p-2 rounded-xl flex items-center justify-start gap-10 bg-white w-full">
                        <span>63</span>
                        <div className="flex items-center gap-2">
                          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M9 0C4.05352 0 0 4.05352 0 9C0 13.9465 4.05352 18 9 18C13.9465 18 18 13.9465 18 9C18 4.05352 13.9465 0 9 0ZM3.09379 12.4593C2.49261 11.4469 2.14453 10.2656 2.14453 9C2.14453 5.23477 5.18203 2.15508 8.97887 2.14453C10.2551 2.14453 11.4363 2.49254 12.4594 3.09371C12.7652 3.27305 12.8285 3.67383 12.5859 3.92695C10.9723 5.54059 5.54059 10.9723 3.92695 12.5859C3.67383 12.8285 3.27305 12.7652 3.09379 12.4593ZM9.02113 15.8555C7.74492 15.8555 6.56367 15.5074 5.54063 14.9062C5.2348 14.727 5.17152 14.3156 5.42461 14.073L14.073 5.42461C14.3156 5.17148 14.727 5.23477 14.9062 5.54063C15.5074 6.55313 15.8555 7.73438 15.8555 9C15.8555 12.7863 12.7968 15.8449 9.02113 15.8555Z" fill="#555353"/>
                          </svg>
                          <span className="text-base">{t('reportsBlock.notInterested')}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex flex-col w-full gap-y-5 h-full overflow-y-auto min-w-0">
                  <div className="flex items-center justify-start flex-wrap gap-2">
                    <div className="flex items-center gap-13 min-w-0">
                      <button className='flex items-center gap-1 cursor-pointer h-10 pl-2.5 pr-5'>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M10.8273 11.9993L15.7773 16.9493L14.3633 18.3633L7.99934 11.9993L14.3633 5.63528L15.7773 7.04928L10.8273 11.9993Z" fill="#169600"/>
                        </svg>
                      <span className="text-dream-primary" style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '20px', lineHeight: '100%', letterSpacing: '0px' }}>{t('reportsBlock.goBack')}</span>
                      </button>
                    <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '30px', lineHeight: '100%', letterSpacing: '0%', color: 'rgba(255,255,255,0.92)' }}>{t('reportsBlock.networkReport')}</span>
                    </div>
                  </div>
                  <div className="flex p-5 gap-5 min-w-0 flex-wrap">
                    {/* Левая часть: 4 блока в два ряда */}
                    <div className="flex flex-col gap-5 flex-[0.7] min-w-0">
                      {/* Первый ряд: Рефералы и Прирост */}
                      <div className="flex gap-2.5 min-w-0">
                        <div className="flex-1 h-40 rounded-[6px] bg-[var(--secondary)] border border-[var(--border)] flex items-center justify-between px-5 gap-4 min-w-0">
                          <div className="flex flex-col items-start gap-y-4 min-w-0">
                            <div className="flex flex-col gap-2 min-w-0">
                              <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '20px', lineHeight: '100%', letterSpacing: '0px', color: 'rgba(255,255,255,0.72)' }}>{t('reportsBlock.referrals1')}</span>
                              <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '36px', lineHeight: '100%', letterSpacing: '1px', color: 'rgba(255,255,255,0.92)' }}>
                                {referralCountLevel1}
                              </span>
                            </div>
                            <div className="flex flex-col gap-2 min-w-0">
                              <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '20px', lineHeight: '100%', letterSpacing: '0px', color: 'rgba(255,255,255,0.72)' }}>{t('reportsBlock.referrals2')}</span>
                              <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '36px', lineHeight: '100%', letterSpacing: '1px', color: 'rgba(255,255,255,0.92)' }}>
                                {isLoadingReferralsJoinDates ? '...' : referralCountLevel2}
                              </span>
                            </div>
                          </div>
                            <svg width="75" height="75" viewBox="0 0 75 75" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <g clipPath="url(#clip0_3760_58716)">
                              <path d="M22.1239 8.15918C22.1239 3.66021 18.4637 0 13.9647 0C3.14042 0.448242 3.1435 15.8719 13.9647 16.3184C18.4639 16.3184 22.1239 12.6582 22.1239 8.15918Z" fill="#3F8CFF" fillOpacity="0.5"/>
                              <path d="M27.9297 32.7932V30.2835C27.1604 11.7525 0.762451 11.7669 0 30.2834V32.7931C0 34.0066 0.983789 34.9904 2.19727 34.9904H25.7325C26.9459 34.9905 27.9297 34.0067 27.9297 32.7932Z" fill="#3F8CFF" fillOpacity="0.5"/>
                              <path d="M69.1942 8.15918C69.1942 3.66021 65.534 0 61.0351 0C50.2107 0.448242 50.2138 15.8719 61.0351 16.3184C65.534 16.3184 69.1942 12.6582 69.1942 8.15918Z" fill="#3F8CFF" fillOpacity="0.5"/>
                              <path d="M61.0351 16.3184C53.3349 16.3184 47.0703 22.5831 47.0703 30.2832V32.7929C47.0703 34.0063 48.0541 34.9901 49.2676 34.9901H72.8026C74.0161 34.9901 74.9999 34.0063 74.9999 32.7929V30.2832C74.9999 22.5831 68.7353 16.3184 61.0351 16.3184Z" fill="#3F8CFF" fillOpacity="0.5"/>
                              <path d="M13.8095 39.8535C13.8095 39.6968 13.8125 39.5408 13.8154 39.3848H9.42087C9.24597 48.8037 13.8119 57.3133 20.8824 62.4953C21.514 61.1544 22.3033 59.9021 23.2261 58.7617C17.5062 54.4368 13.8095 47.5772 13.8095 39.8535Z" fill="#3F8CFF" fillOpacity="0.5"/>
                              <path d="M27.8033 18.2314C33.6475 15.4945 41.3525 15.4945 47.1967 18.2314C48.2388 17.0362 49.4326 15.9768 50.7482 15.0836C42.9706 10.7038 32.0295 10.704 24.252 15.0836C25.5674 15.9768 26.7612 17.0364 27.8033 18.2314Z" fill="#3F8CFF" fillOpacity="0.5"/>
                              <path d="M61.1861 39.3848C61.3568 47.2347 57.6119 54.3653 51.7754 58.7617C52.6982 59.902 53.4874 61.1544 54.1191 62.4953C61.1894 57.3137 65.7557 48.8034 65.5807 39.3848H61.1861Z" fill="#3F8CFF" fillOpacity="0.5"/>
                              <path d="M45.6591 48.1689C45.6591 43.67 41.9989 40.0098 37.4999 40.0098C26.6756 40.458 26.6787 55.8816 37.4999 56.3281C41.9989 56.3281 45.6591 52.6681 45.6591 48.1689Z" fill="#3F8CFF" fillOpacity="0.5"/>
                              <path d="M37.5 56.3281C29.7997 56.3281 23.5352 62.5928 23.5352 70.2929V72.8028C23.5352 74.0163 24.5189 75 25.7324 75H49.2676C50.4811 75 51.4649 74.0163 51.4649 72.8028V70.2931C51.4647 62.5928 45.2002 56.3281 37.5 56.3281Z" fill="#3F8CFF" fillOpacity="0.5"/>
                              </g>
                              <defs>
                              <clipPath id="clip0_3760_58716">
                              <rect width="75" height="75" fill="white"/>
                              </clipPath>
                              </defs>
                            </svg>
                        </div>
                        <div className="flex-1 h-40 rounded-[6px] bg-[var(--secondary)] border border-[var(--border)] flex items-center justify-between px-5 gap-4 min-w-0">
                          <div className="flex flex-col items-start gap-y-4 min-w-0">
                            <div className="flex flex-col gap-2 min-w-0">
                              <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '20px', lineHeight: '100%', letterSpacing: '0px', color: 'rgba(255,255,255,0.72)' }}>{t('reportsBlock.referralsGrowth')}</span>
                              <div className="flex flex-col gap-1.5">
                                <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '30px', lineHeight: '100%', letterSpacing: '1px', color: 'rgba(255,255,255,0.92)' }}>
                                  {totalReferralsGrowth > 0 ? `+${totalReferralsGrowth}` : totalReferralsGrowth}
                                </span>
                                <div className="flex items-center gap-2">
                                  <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 500, fontSize: '16px', lineHeight: '100%', letterSpacing: '0px', color: 'rgba(255,255,255,0.72)' }}>
                                    I: {referralsGrowthLevel1 > 0 ? `+${referralsGrowthLevel1}` : referralsGrowthLevel1}
                                  </span>
                                  <span className="text-[rgba(255,255,255,0.30)]">|</span>
                                  <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 500, fontSize: '16px', lineHeight: '100%', letterSpacing: '0px', color: 'rgba(255,255,255,0.72)' }}>
                                    II: {referralsGrowthLevel2 > 0 ? `+${referralsGrowthLevel2}` : referralsGrowthLevel2}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                          <svg width="75" height="75" viewBox="0 0 75 75" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <g opacity="0.5" clipPath="url(#clip0_3760_58732)">
                            <path d="M55.078 26.5137C44.1734 26.5137 35.3027 35.3842 35.3027 46.2888C35.3027 57.1934 44.1732 66.0639 55.0778 66.0639C65.9824 66.0639 74.9994 57.1934 74.9994 46.2888C74.9994 35.3842 65.9826 26.5137 55.078 26.5137ZM57.333 56.878C57.3139 56.885 57.294 56.8818 57.275 56.8884V59.4722C57.275 60.6867 56.2922 61.6695 55.0777 61.6695C53.8632 61.6695 52.8804 60.6867 52.8804 59.4722V56.8734C51.4333 56.3845 50.0467 55.4566 48.8613 54.0435C48.0803 53.1144 48.2004 51.7282 49.1317 50.9493C50.0609 50.1683 51.4513 50.2884 52.2259 51.2197C53.3889 52.6037 54.7043 53.153 55.8287 52.7496C56.6934 52.4342 57.275 51.6038 57.275 50.6833C57.275 49.471 56.29 48.486 55.0777 48.486C51.4428 48.486 48.486 45.5291 48.486 41.8944C48.486 39.2401 50.0653 36.8561 52.5094 35.822C52.6304 35.7708 52.7585 35.7737 52.8806 35.73V33.1055C52.8806 31.891 53.8633 30.9082 55.0778 30.9082C56.2923 30.9082 57.2751 31.891 57.2751 33.1055V35.734C58.4128 36.1184 59.5223 36.7293 60.513 37.6888C61.3841 38.5321 61.4057 39.9226 60.5602 40.7959C59.7168 41.667 58.3242 41.6864 57.4531 40.8431C56.3845 39.8067 55.2022 39.4504 54.2237 39.8689C53.4083 40.2144 52.8804 41.0083 52.8804 41.8945C52.8804 43.1068 53.8654 44.0918 55.0777 44.0918C58.7125 44.0918 61.6693 47.0487 61.6693 50.6834C61.6696 53.4448 59.9272 55.9339 57.333 56.878Z" fill="#169600"/>
                            <path d="M2.19727 48.4863C0.982764 48.4863 0 49.4691 0 50.6836V72.8024C0 74.0169 0.982764 74.9997 2.19727 74.9997H8.78892V48.4863H2.19727Z" fill="#169600"/>
                            <path d="M52.1121 13.7145L36.7314 0.531079C35.9116 -0.177026 34.6929 -0.177026 33.8732 0.531079L18.4926 13.7145C17.7931 14.311 17.5421 15.2809 17.8617 16.1435C18.1793 17.0062 19.001 17.5791 19.9217 17.5791H26.5133C26.5133 36.575 26.5133 56.0031 26.5133 75.0002C32.1738 75.0002 36.0871 75.0002 41.8941 75.0002C43.1086 75.0002 44.0913 74.0175 44.0913 72.803V67.7911C36.2776 63.782 30.9079 55.6594 30.9079 46.2897C30.9079 36.9201 36.2777 28.7974 44.0913 24.7883V17.5792H50.683C51.6035 17.5792 52.4254 17.0063 52.743 16.1437C53.0628 15.2809 52.8117 14.311 52.1121 13.7145Z" fill="#169600"/>
                            <path d="M15.5273 30.9082C14.3128 30.9082 13.3301 31.891 13.3301 33.1055V48.4862V74.9993C16.5396 74.9993 19.0028 74.9993 22.119 74.9993V30.9082H15.5273Z" fill="#169600"/>
                            </g>
                            <defs>
                            <clipPath id="clip0_3760_58732">
                            <rect width="75" height="75" fill="white"/>
                            </clipPath>
                            </defs>
                          </svg>
                        </div>
                      </div>
                      {/* Второй ряд: Объекты и Всего лидов */}
                      <div className="flex gap-2.5 min-w-0">
                        <div className="flex-1 h-40 rounded-[6px] bg-[var(--secondary)] border border-[var(--border)] flex items-center justify-between px-5 gap-4 min-w-0">
                          <div className="flex flex-col items-start gap-y-4 min-w-0">
                            <div className="flex flex-col gap-2 min-w-0">
                              <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '20px', lineHeight: '100%', letterSpacing: '0px', color: 'rgba(255,255,255,0.72)' }}>{t('reportsBlock.networkProperties')}</span>
                              <div className="flex flex-col gap-1.5">
                                <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '30px', lineHeight: '100%', letterSpacing: '1px', color: 'rgba(255,255,255,0.92)' }}>
                                  {isLoadingNetworkObjects ? '...' : (networkObjectsLevel1 + networkObjectsLevel2)}
                                </span>
                                <div className="flex items-center gap-2">
                                  <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 500, fontSize: '16px', lineHeight: '100%', letterSpacing: '0px', color: 'rgba(255,255,255,0.72)' }}>
                                    I: {isLoadingNetworkObjects ? '...' : networkObjectsLevel1}
                                  </span>
                                  <span className="text-[rgba(255,255,255,0.30)]">|</span>
                                  <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 500, fontSize: '16px', lineHeight: '100%', letterSpacing: '0px', color: 'rgba(255,255,255,0.72)' }}>
                                    II: {isLoadingNetworkObjects ? '...' : networkObjectsLevel2}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                          <svg width="75" height="75" viewBox="0 0 75 75" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <g opacity="0.5">
                            <path d="M70.3125 56.25V62.1094C70.3125 65.3414 67.6828 67.9688 64.4531 67.9688H14.0625C8.89219 67.9688 4.6875 63.7641 4.6875 58.5938C4.6875 58.5938 4.6875 18.7852 4.6875 18.75C4.6875 13.5797 8.89219 9.375 14.0625 9.375H57.4219C59.3648 9.375 60.9375 10.95 60.9375 12.8906C60.9375 14.8313 59.3648 16.4062 57.4219 16.4062H14.0625C12.7711 16.4062 11.7188 17.4563 11.7188 18.75C11.7188 20.0437 12.7711 21.0938 14.0625 21.0938H64.4531C67.6828 21.0938 70.3125 23.7211 70.3125 26.9531V32.8125H58.5938C52.132 32.8125 46.875 38.0695 46.875 44.5312C46.875 50.993 52.132 56.25 58.5938 56.25H70.3125Z" fill="#AC7EFA"/>
                            <path d="M70.3125 37.5V51.5625H58.5938C54.7102 51.5625 51.5625 48.4148 51.5625 44.5312C51.5625 40.6477 54.7102 37.5 58.5938 37.5H70.3125Z" fill="#AC7EFA"/>
                            </g>
                          </svg>
                        </div>
                        <div className="flex-1 h-40 rounded-[6px] bg-[var(--secondary)] border border-[var(--border)] flex items-center justify-between px-5 gap-4 min-w-0">
                          <div className="flex flex-col items-start gap-y-4 min-w-0">
                            <div className="flex flex-col gap-2 min-w-0">
                              <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '20px', lineHeight: '100%', letterSpacing: '0px', color: 'rgba(255,255,255,0.72)' }}>{t('reportsBlock.totalNetworkLeads')}</span>
                              <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '36px', lineHeight: '100%', letterSpacing: '1px', color: 'rgba(255,255,255,0.92)' }}>
                                {isLoadingTotalLeads ? '...' : (totalLeadsCount ?? 0)}
                              </span>
                            </div>
                          </div>
                          <svg width="75" height="75" viewBox="0 0 75 75" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <g opacity="0.5" clipPath="url(#clip0_3760_58732)">
                            <path d="M55.078 26.5137C44.1734 26.5137 35.3027 35.3842 35.3027 46.2888C35.3027 57.1934 44.1732 66.0639 55.0778 66.0639C65.9824 66.0639 74.9994 57.1934 74.9994 46.2888C74.9994 35.3842 65.9826 26.5137 55.078 26.5137ZM57.333 56.878C57.3139 56.885 57.294 56.8818 57.275 56.8884V59.4722C57.275 60.6867 56.2922 61.6695 55.0777 61.6695C53.8632 61.6695 52.8804 60.6867 52.8804 59.4722V56.8734C51.4333 56.3845 50.0467 55.4566 48.8613 54.0435C48.0803 53.1144 48.2004 51.7282 49.1317 50.9493C50.0609 50.1683 51.4513 50.2884 52.2259 51.2197C53.3889 52.6037 54.7043 53.153 55.8287 52.7496C56.6934 52.4342 57.275 51.6038 57.275 50.6833C57.275 49.471 56.29 48.486 55.0777 48.486C51.4428 48.486 48.486 45.5291 48.486 41.8944C48.486 39.2401 50.0653 36.8561 52.5094 35.822C52.6304 35.7708 52.7585 35.7737 52.8806 35.73V33.1055C52.8806 31.891 53.8633 30.9082 55.0778 30.9082C56.2923 30.9082 57.2751 31.891 57.2751 33.1055V35.734C58.4128 36.1184 59.5223 36.7293 60.513 37.6888C61.3841 38.5321 61.4057 39.9226 60.5602 40.7959C59.7168 41.667 58.3242 41.6864 57.4531 40.8431C56.3845 39.8067 55.2022 39.4504 54.2237 39.8689C53.4083 40.2144 52.8804 41.0083 52.8804 41.8945C52.8804 43.1068 53.8654 44.0918 55.0777 44.0918C58.7125 44.0918 61.6693 47.0487 61.6693 50.6834C61.6696 53.4448 59.9272 55.9339 57.333 56.878Z" fill="#169600"/>
                            <path d="M2.19727 48.4863C0.982764 48.4863 0 49.4691 0 50.6836V72.8024C0 74.0169 0.982764 74.9997 2.19727 74.9997H8.78892V48.4863H2.19727Z" fill="#169600"/>
                            <path d="M52.1121 13.7145L36.7314 0.531079C35.9116 -0.177026 34.6929 -0.177026 33.8732 0.531079L18.4926 13.7145C17.7931 14.311 17.5421 15.2809 17.8617 16.1435C18.1793 17.0062 19.001 17.5791 19.9217 17.5791H26.5133C26.5133 36.575 26.5133 56.0031 26.5133 75.0002C32.1738 75.0002 36.0871 75.0002 41.8941 75.0002C43.1086 75.0002 44.0913 74.0175 44.0913 72.803V67.7911C36.2776 63.782 30.9079 55.6594 30.9079 46.2897C30.9079 36.9201 36.2777 28.7974 44.0913 24.7883V17.5792H50.683C51.6035 17.5792 52.4254 17.0063 52.743 16.1437C53.0628 15.2809 52.8117 14.311 52.1121 13.7145Z" fill="#169600"/>
                            <path d="M15.5273 30.9082C14.3128 30.9082 13.3301 31.891 13.3301 33.1055V48.4862V74.9993C16.5396 74.9993 19.0028 74.9993 22.119 74.9993V30.9082H15.5273Z" fill="#169600"/>
                            </g>
                            <defs>
                            <clipPath id="clip0_3760_58732">
                            <rect width="75" height="75" fill="white"/>
                            </clipPath>
                            </defs>
                          </svg>
                        </div>
                      </div>
                    </div>
                    {/* Правая часть: графики в два ряда */}
                    <div className="flex-[1.3] min-w-0 overflow-hidden flex-shrink-0 flex flex-col justify-center">
                      {/* Компонент для отображения графиков */}
                      {(() => {
                          // Преобразование данных в формат Recharts
                          const prepareChartData = (
                            data1: { data: number[]; labels: string[] },
                            data2?: { data: number[]; labels: string[] }
                          ) => {
                            const maxLength = Math.max(data1.labels.length, data2?.labels.length || 0);
                            const chartData = [];
                            
                            for (let i = 0; i < maxLength; i++) {
                              const item: any = {
                                name: data1.labels[i] || '',
                                level1: data1.data[i] || 0
                              };
                              
                              if (data2) {
                                item.level2 = data2.data[i] || 0;
                              } else {
                                item.value = data1.data[i] || 0;
                              }
                              
                              chartData.push(item);
                            }
                            
                            return chartData;
                          };
                          
                          // Вычисление domain для Y оси (чтобы графики начинались снизу)
                          const getYDomain = (data1: { data: number[]; labels: string[] }, data2?: { data: number[]; labels: string[] }) => {
                            const allValues = [...data1.data, ...(data2?.data || [])].filter(v => !isNaN(v) && isFinite(v));
                            if (allValues.length === 0) return [0, 100];
                            
                            const min = Math.min(...allValues);
                            const max = Math.max(...allValues);
                            
                            if (min === max) {
                              const baseValue = Math.max(0, min);
                              return [baseValue - 10, baseValue + 10];
                            }
                            
                            const dataRange = max - min;
                            const padding = Math.max(dataRange * 0.08, dataRange * 0.05);
                            
                            return [Math.max(0, min - padding), max + padding];
                          };

                        // Функция для отображения графика с двумя линиями (рефералы)
                        const renderReferralsChart = (
                          title: string,
                          data1: { data: number[]; labels: string[] },
                          data2: { data: number[]; labels: string[] },
                          color1: string,
                          color2: string,
                          gradientId1: string,
                          gradientId2: string
                        ) => {
                          const chartData = prepareChartData(data1, data2);
                          const yDomain = getYDomain(data1, data2);

                          return (
                            <div className="flex flex-col rounded-[6px] bg-[var(--secondary)] border border-[var(--border)] flex-1 h-full overflow-hidden min-w-0">
                              <div className='px-4 pt-2.5 pb-1.5 flex-shrink-0 flex flex-col gap-1.5'>
                                <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '16px', lineHeight: '20px', letterSpacing: '0px', color: 'rgba(255,255,255,0.72)' }}>
                                  {title}
                                </span>
                                {/* Легенда */}
                                <div className="flex items-center gap-3 flex-wrap">
                                  <div className="flex items-center gap-1.5">
                                    <div style={{ width: '14px', height: '2.5px', backgroundColor: color1, borderRadius: '1px' }}></div>
                                    <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '16px', lineHeight: '20px', letterSpacing: '0px', color: 'rgba(255,255,255,0.72)' }}>{t('reportsBlock.level1')}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <div style={{ width: '14px', height: '2.5px', backgroundColor: color2, borderRadius: '1px' }}></div>
                                    <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '16px', lineHeight: '20px', letterSpacing: '0px', color: 'rgba(255,255,255,0.72)' }}>{t('reportsBlock.level2')}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex-1 flex items-end w-full min-h-0 relative overflow-hidden px-2 pb-3">
                                <ResponsiveContainer width="100%" height="100%">
                                  <AreaChart
                                    data={chartData}
                                    margin={{ top: 8, right: 0, left: 0, bottom: 0 }}
                                  >
                                    <defs>
                                      <linearGradient id={gradientId1} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={color1} stopOpacity={0.2} />
                                        <stop offset="40%" stopColor={color1} stopOpacity={0.1} />
                                        <stop offset="70%" stopColor={color1} stopOpacity={0.05} />
                                        <stop offset="100%" stopColor={color1} stopOpacity={0} />
                                      </linearGradient>
                                      <linearGradient id={gradientId2} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={color2} stopOpacity={0.2} />
                                        <stop offset="40%" stopColor={color2} stopOpacity={0.1} />
                                        <stop offset="70%" stopColor={color2} stopOpacity={0.05} />
                                        <stop offset="100%" stopColor={color2} stopOpacity={0} />
                                      </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="2 2" stroke="rgba(255,255,255,0.08)" vertical={true} horizontal={false} />
                                    <XAxis 
                                      dataKey="name" 
                                      axisLine={false}
                                      tickLine={false}
                                      tick={false}
                                      hide={true}
                                    />
                                    <YAxis 
                                      domain={yDomain}
                                      axisLine={false}
                                      tickLine={false}
                                      tick={false}
                                      hide={true}
                                    />
                                    <Area
                                      type="monotone"
                                      dataKey="level1"
                                      stroke={color1}
                                      strokeWidth={2}
                                      fill={`url(#${gradientId1})`}
                                      connectNulls={false}
                                      baseValue={yDomain[0]}
                                    />
                                    <Area
                                      type="monotone"
                                      dataKey="level2"
                                      stroke={color2}
                                      strokeWidth={2}
                                      fill={`url(#${gradientId2})`}
                                      connectNulls={false}
                                      baseValue={yDomain[0]}
                                    />
                                  </AreaChart>
                                </ResponsiveContainer>
                                
                                {/* Подписи */}
                                <div className="absolute bottom-0 left-0 right-0 flex justify-around items-end pb-2 min-w-0 overflow-hidden px-2">
                                  {data1.labels.map((label, index) => (
                                    <span
                                      key={index}
                                      className="flex-shrink-0 text-center"
                                      style={{ 
                                        fontFamily: 'var(--font-sans)',
                                        fontWeight: 400,
                                        fontSize: '12px',
                                        lineHeight: '14px',
                                        letterSpacing: '0px',
                                        color: 'rgba(255,255,255,0.72)'
                                      }}
                                    >
                                      {label}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          );
                        };

                        // Функция для отображения одного графика (рейтинг)
                        const renderChart = (
                          title: string,
                          data: { data: number[]; labels: string[] },
                          color: string,
                          gradientId: string
                        ) => {
                          const chartData = prepareChartData(data);
                          const yDomain = getYDomain(data);

                          return (
                            <div className="flex flex-col rounded-[6px] bg-[var(--secondary)] border border-[var(--border)] flex-1 h-full overflow-hidden min-w-0">
                              <div className='px-4 pt-2.5 pb-1.5 flex-shrink-0'>
                                <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '16px', lineHeight: '20px', letterSpacing: '0px', color: 'rgba(255,255,255,0.72)' }}>
                                  {title}
                                </span>
                              </div>
                              <div className="flex-1 flex items-end w-full min-h-0 relative overflow-hidden px-2 pb-3">
                                <ResponsiveContainer width="100%" height="100%">
                                  <AreaChart
                                    data={chartData}
                                    margin={{ top: 8, right: 0, left: 0, bottom: 0 }}
                                  >
                                    <defs>
                                      <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={color} stopOpacity={0.2} />
                                        <stop offset="40%" stopColor={color} stopOpacity={0.1} />
                                        <stop offset="70%" stopColor={color} stopOpacity={0.05} />
                                        <stop offset="100%" stopColor={color} stopOpacity={0} />
                                      </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="2 2" stroke="rgba(255,255,255,0.08)" vertical={true} horizontal={false} />
                                    <XAxis 
                                      dataKey="name" 
                                      axisLine={false}
                                      tickLine={false}
                                      tick={false}
                                      hide={true}
                                    />
                                    <YAxis 
                                      domain={yDomain}
                                      axisLine={false}
                                      tickLine={false}
                                      tick={false}
                                      hide={true}
                                    />
                                    <Area
                                      type="monotone"
                                      dataKey="value"
                                      stroke={color}
                                      strokeWidth={2}
                                      fill={`url(#${gradientId})`}
                                      connectNulls={false}
                                      baseValue={yDomain[0]}
                                    />
                                  </AreaChart>
                                </ResponsiveContainer>
                                
                                {/* Подписи */}
                                <div className="absolute bottom-0 left-0 right-0 flex justify-around items-end pb-2 min-w-0 overflow-hidden px-2">
                                  {data.labels.map((label, index) => (
                                    <span
                                      key={index}
                                      className="flex-shrink-0 text-center"
                                      style={{ 
                                        fontFamily: 'var(--font-sans)',
                                        fontWeight: 400,
                                        fontSize: '12px',
                                        lineHeight: '14px',
                                        letterSpacing: '0px',
                                        color: 'rgba(255,255,255,0.72)'
                                      }}
                                    >
                                      {label}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          );
                        };

                        // Вычисляем высоту: два блока по h-40 + gap-5 между ними
                        // h-40 = 160px, gap-5 = 20px, итого = 160 + 20 + 160 = 340px
                        const totalHeight = 340; // 2 * 160px + 20px gap
                        
                        return (
                          <>
                            {/* Два графика в ряд с высотой как у двух левых блоков */}
                            <div className="flex gap-2.5" style={{ height: `${totalHeight}px` }}>
                              {renderReferralsChart(
                                t('reportsBlock.referralsTitle'),
                                growthRateLevel1Data,
                                growthRateLevel2Data,
                                '#169600',
                                '#EF4444',
                                `chartGradientLevel1_${selectedPeriod}`,
                                `chartGradientLevel2_${selectedPeriod}`
                              )}
                              {renderChart(
                                t('reportsBlock.networkRatingGrowth'),
                                networkRatingData,
                                '#3F8CFF',
                                `chartGradientRating_${selectedPeriod}`
                              )}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                <div className="flex flex-col gap-5.75 p-5 bg-[var(--secondary)] rounded-[6px] border border-[var(--border)] h-full">
                  <div className='flex items-center gap-2.5'>
                    <div className="relative flex-1">
                      <div className="absolute left-5 top-1/2 transform -translate-y-1/2">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M11.5 21C16.7467 21 21 16.7467 21 11.5C21 6.25329 16.7467 2 11.5 2C6.25329 2 2 6.25329 2 11.5C2 16.7467 6.25329 21 11.5 21Z" stroke="#169600" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M22 22L20 20" stroke="#169600" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <input
                        type="text"
                        placeholder={t('reportsBlock.searchPlaceholder')}
                        className="w-full pl-15 pr-4 flex items-center h-13.5 rounded-[4px] border-2 focus:border-dream-primary focus:outline-none"
                        style={{
                          borderColor: 'var(--color-dream-primary)',
                          fontFamily: 'var(--font-sans)',
                          fontWeight: 400,
                          fontSize: '20px',
                          lineHeight: '100%',
                          letterSpacing: '0px'
                        }}
                      />
                    </div>
                    <div className="relative sort-dropdown-container">
                      <div 
                        className='flex items-center gap-2 cursor-pointer h-13.5 border-2 border-dream-primary rounded-[4px] px-5'
                        onClick={() => setIsSortDropdownOpen(!isSortDropdownOpen)}
                      >
                        <span className='text-dream-primary' style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '20px', lineHeight: '100%', letterSpacing: '0px' }}>
                          {selectedSort}
                        </span>
                        <svg 
                          width="24" 
                          height="24" 
                          viewBox="0 0 24 24" 
                          fill="none" 
                          xmlns="http://www.w3.org/2000/svg"
                          className={`transition-all duration-200 ease-in-out ${isSortDropdownOpen ? 'rotate-180' : 'rotate-0'}`}
                        >
                          <path d="M11.9993 13.1727L16.9493 8.22266L18.3633 9.63666L11.9993 16.0007L5.63528 9.63666L7.04928 8.22266L11.9993 13.1727Z" fill="#169600"/>
                        </svg>
                      </div>
                      {isSortDropdownOpen && (
                        <div className="absolute top-full left-0 mt-2 w-full bg-[var(--card)] border-2 border-dream-primary rounded-[6px] shadow-lg z-10 overflow-hidden">
                          {[t('reportsBlock.newFirst'), t('reportsBlock.oldFirst')].map((option) => (
                            <div
                              key={option}
                              className={`px-5 py-3 cursor-pointer hover:bg-dream-secondary ${
                                selectedSort === option ? 'bg-dream-secondary' : ''
                              }`}
                              onClick={() => {
                                setSelectedSort(option);
                                setIsSortDropdownOpen(false);
                              }}
                            >
                              <span 
                                className={selectedSort === option ? 'text-dream-primary' : 'text-dream-primary'}
                                style={{ 
                                  fontFamily: 'var(--font-sans)', 
                                  fontWeight: 400, 
                                  fontSize: '20px', 
                                  lineHeight: '100%', 
                                  letterSpacing: '0px' 
                                }}
                              >
                                {option}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className='relative flex items-center gap-2.5 px-2.5 h-12.5 cursor-pointer bg-dream-primary rounded-[4px]'>
                      <span className='text-white' style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '20px', lineHeight: '100%', letterSpacing: '0px' }}>{t('reportsBlock.filters')}</span>
                      <svg width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path fillRule="evenodd" clipRule="evenodd" d="M12.6009 23.2402H4.72461C4.20711 23.2402 3.78711 22.8202 3.78711 22.3027C3.78711 21.7852 4.20711 21.3652 4.72461 21.3652H12.6009C13.1184 21.3652 13.5384 21.7852 13.5384 22.3027C13.5384 22.8202 13.1184 23.2402 12.6009 23.2402Z" fill="white"/>
                        <path fillRule="evenodd" clipRule="evenodd" d="M23.9883 11.125H16.1133C15.5958 11.125 15.1758 10.705 15.1758 10.1875C15.1758 9.67 15.5958 9.25 16.1133 9.25H23.9883C24.5058 9.25 24.9258 9.67 24.9258 10.1875C24.9258 10.705 24.5058 11.125 23.9883 11.125Z" fill="white"/>
                        <mask id="mask0_5173_13555" style={{ maskType: 'luminance' }} maskUnits="userSpaceOnUse" x="3" y="6" width="9" height="8">
                        <path fillRule="evenodd" clipRule="evenodd" d="M3.75 6.25H11.5322V13.9895H3.75V6.25Z" fill="white"/>
                        </mask>
                        <g mask="url(#mask0_5173_13555)">
                        <path fillRule="evenodd" clipRule="evenodd" d="M7.64125 8.125C6.53 8.125 5.625 9.02 5.625 10.1213C5.625 11.2213 6.53 12.115 7.64125 12.115C8.75375 12.115 9.6575 11.2213 9.6575 10.1213C9.6575 9.02 8.75375 8.125 7.64125 8.125ZM7.64125 13.99C5.49625 13.99 3.75 12.255 3.75 10.1213C3.75 7.9875 5.49625 6.25 7.64125 6.25C9.7875 6.25 11.5325 7.9875 11.5325 10.1213C11.5325 12.255 9.7875 13.99 7.64125 13.99Z" fill="white"/>
                        </g>
                        <path fillRule="evenodd" clipRule="evenodd" d="M21.7343 20.2598C20.6218 20.2598 19.7168 21.1548 19.7168 22.2548C19.7168 23.356 20.6218 24.2498 21.7343 24.2498C22.8455 24.2498 23.7493 23.356 23.7493 22.2548C23.7493 21.1548 22.8455 20.2598 21.7343 20.2598ZM21.7343 26.1248C19.588 26.1248 17.8418 24.3885 17.8418 22.2548C17.8418 20.121 19.588 18.3848 21.7343 18.3848C23.8793 18.3848 25.6243 20.121 25.6243 22.2548C25.6243 24.3885 23.8793 26.1248 21.7343 26.1248Z" fill="white"/>
                      </svg>
                      <div className='absolute top-[2px] right-[5px] size-2.5 rounded-full bg-[#8edb8e]'/>
                    </div>
                    <div className='flex items-center gap-2'>
                      {[t('reportsBlock.yesterday'), t('reportsBlock.today'), t('reportsBlock.week'), t('reportsBlock.month')].map((period) => {
                        const isSelected = selectedPeriod === period;
                        return (
                          <label
                            key={period}
                            className={`flex items-center px-2 h-10 rounded-[4px] cursor-pointer ${
                              isSelected
                                ? 'border border-[var(--border)] bg-[var(--card)]'
                                : ''
                            }`}
                          >
                            <input
                              type="radio"
                              name="period"
                              value={period}
                              checked={isSelected}
                              onChange={(e) => setSelectedPeriod(e.target.value)}
                              className="hidden"
                            />
                            <span
                              className={isSelected ? 'text-[rgba(255,255,255,0.92)]' : 'text-[rgba(255,255,255,0.45)]'}
                              style={{ 
                                fontFamily: 'var(--font-sans)', 
                                fontWeight: 400, 
fontSize: '16px',
                                lineHeight: '23px',
                                letterSpacing: '0px', 
                                textAlign: 'center' 
                              }}
                            >
                              {period}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  <div className='flex items-center justify-between'>
                    <div className='flex items-center gap-2'>
                      <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '26px', lineHeight: '100%', letterSpacing: '0%', color: 'rgba(255,255,255,0.72)' }}>{t('reportsBlock.yourProgress')}</span>
                      <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '26px', lineHeight: '100%', letterSpacing: '0%', color: 'rgba(255,255,255,0.92)' }}>
                        {networkLeadsAtWorkStarted}<span style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '26px', lineHeight: '100%', letterSpacing: '0%', color: 'rgba(255,255,255,0.72)' }}>/{totalNetworkLeads}</span>
                      </span>
                    </div>
                    <div className='flex items-center gap-5.75 hidden'>
                      <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '22px', lineHeight: '22px', letterSpacing: '0px', color: 'rgba(255,255,255,0.72)' }}>{t('reportsBlock.displayType')}</span>
                      <div className='flex items-center gap-2.5'>
                        <label className="cursor-pointer">
                          <input
                            type="radio"
                            name="viewType"
                            value="grid"
                            checked={selectedViewType === 'grid'}
                            onChange={(e) => setSelectedViewType(e.target.value)}
                            className="hidden"
                          />
                          <svg width="40" height="30" viewBox="0 0 40 30" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <rect width="40" height="29.9686" rx="10" fill={selectedViewType === 'grid' ? '#169600' : 'white'}/>
                            <path d="M23.0032 11.9962H16.997C16.997 10.3378 18.3426 8.9936 20 8.9936C21.6576 8.9936 23.0032 10.3378 23.0032 11.9962ZM21.9968 6.9968C21.9968 5.894 21.1026 5 20 5C18.8974 5 18.0032 5.8942 18.0032 6.9968C18.0032 8.0994 18.8972 8.9936 20 8.9936C21.1028 8.9936 21.9968 8.0994 21.9968 6.9968ZM13.0032 21.966C11.3456 21.966 10 23.31 10 24.9686H16.0062C16.0062 23.31 14.6608 21.966 13.0032 21.966ZM15 19.9692C15 18.8662 14.106 17.9722 13.0032 17.9722C11.9004 17.9722 11.0062 18.8664 11.0062 19.9692C11.0062 21.072 11.9004 21.966 13.0032 21.966C14.106 21.966 15 21.0718 15 19.9692ZM26.9968 21.966C25.3394 21.966 23.9936 23.31 23.9936 24.9686H30C30 23.31 28.6544 21.966 26.9968 21.966ZM28.9938 19.9692C28.9938 18.8662 28.0996 17.9722 26.997 17.9722C25.8944 17.9722 25 18.8662 25 19.9692C25 21.072 25.8942 21.966 26.9968 21.966C28.0994 21.966 28.9938 21.0718 28.9938 19.9692ZM18.4156 13.2442L17.5594 12.7304L14.564 17.7224L15.4202 18.2364L18.4156 13.2442ZM21.5534 13.2442L24.5488 18.2364L25.4048 17.7224L22.4094 12.7304L21.5534 13.2442ZM15.9908 21.474H23.9782V20.4756H15.9908V21.474Z" fill={selectedViewType === 'grid' ? 'white' : '#169600'}/>
                          </svg>
                        </label>
                        <label className="cursor-pointer">
                          <input
                            type="radio"
                            name="viewType"
                            value="list"
                            checked={selectedViewType === 'list'}
                            onChange={(e) => setSelectedViewType(e.target.value)}
                            className="hidden"
                          />
                          <svg width="38" height="30" viewBox="0 0 38 30" fill="none" xmlns="http://www.w3.org/2000/svg" className="bg-white rounded-[10px]">
                            <g opacity="1">
                            <rect width="37.4712" height="29.9686" rx="10" fill={selectedViewType === 'list' ? '#169600' : 'white'}/>
                            <path d="M6.24869 8.49738H31.2225C31.5537 8.49738 31.8713 8.36582 32.1055 8.13165C32.3397 7.89747 32.4712 7.57987 32.4712 7.24869C32.4712 6.91752 32.3397 6.59991 32.1055 6.36573C31.8713 6.13156 31.5537 6 31.2225 6H6.24869C5.91752 6 5.59991 6.13156 5.36573 6.36573C5.13156 6.59991 5 6.91752 5 7.24869C5 7.57987 5.13156 7.89747 5.36573 8.13165C5.59991 8.36582 5.91752 8.49738 6.24869 8.49738Z" fill={selectedViewType === 'list' ? 'white' : '#169600'}/>
                            <path d="M31.2225 13.498H6.24869C5.91752 13.498 5.59991 13.6296 5.36573 13.8638C5.13156 14.098 5 14.4156 5 14.7467C5 15.0779 5.13156 15.3955 5.36573 15.6297C5.59991 15.8639 5.91752 15.9954 6.24869 15.9954H31.2225C31.5537 15.9954 31.8713 15.8639 32.1055 15.6297C32.3397 15.3955 32.4712 15.0779 32.4712 14.7467C32.4712 14.4156 32.3397 14.098 32.1055 13.8638C31.8713 13.6296 31.5537 13.498 31.2225 13.498Z" fill={selectedViewType === 'list' ? 'white' : '#169600'}/>
                            <path d="M31.2225 20.9941H6.24869C5.91752 20.9941 5.59991 21.1257 5.36573 21.3599C5.13156 21.594 5 21.9117 5 22.2428C5 22.574 5.13156 22.8916 5.36573 23.1258C5.59991 23.36 5.91752 23.4915 6.24869 23.4915H31.2225C31.5537 23.4915 31.8713 23.36 32.1055 23.1258C32.3397 22.8916 32.4712 22.574 32.4712 22.2428C32.4712 21.9117 32.3397 21.594 32.1055 21.3599C31.8713 21.1257 31.5537 20.9941 31.2225 20.9941Z" fill={selectedViewType === 'list' ? 'white' : '#169600'}/>
                            </g>
                          </svg>
                        </label>
                      </div>
                    </div>
                  </div>  
                  <RealtorCardsGrid leads={sortedLeads} selectedPeriod={selectedPeriod} />
                  
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ReportsBlock;
