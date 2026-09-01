import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/i18n';
import { useDisableScroll } from '../../hooks/useDisableScroll';
import { apiService, LeadStage } from '../../services/api';

interface LeadStatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  leadEmail?: string;
  leadName?: string;
}

// Порядок этапов продаж для отображения (из воронки RP в LeadsBlock)
// Используем тот же порядок, что и в funnelProperties.RP
const salesStagesOrder: LeadStage[] = [
  // leads (отказы)
  LeadStage.REJECTED,           // t('leadStatsModal.defectiveLead')
  LeadStage.FIRST_CONTACT,      // t('leadStatsModal.categoryLeads')
  LeadStage.QUALIFICATION,       // t('leadStatsModal.didntGetThrough3')
  LeadStage.REJECTED1,          // t('leadStatsModal.didntGetThrough2')
  LeadStage.FIRST_CONTACT1,     // t('leadStatsModal.didntGetThrough1')
  
  // inWork (в работе)
  LeadStage.NEEDS_ANALYSIS,     // t('leadStatsModal.newLead')
  LeadStage.PRESENTATION,        // t('leadStatsModal.askedToContactYouLater')
  LeadStage.PROPOSAL,            // t('leadStatsModal.presentedTheCompany')
  LeadStage.NEGOTIATION,         // t('leadStatsModal.discussedTheSituationInTheCoun')
  LeadStage.DECISION_MAKING,     // t('leadStatsModal.needIdentified')
  LeadStage.CONTRACT_SIGNING,   // t('leadStatsModal.needAdjusted')
  LeadStage.ONBOARDING,          // t('leadStatsModal.sentByKp')
  LeadStage.NEEDS_ANALYSIS1,     // t('leadStatsModal.handlingObjections')
  LeadStage.PRESENTATION1,       // t('leadStatsModal.deferredDemand')
  LeadStage.PROPOSAL1,           // t('leadStatsModal.warmingUp')
  LeadStage.NEGOTIATION1,       // t('leadStatsModal.show')
  LeadStage.DECISION_MAKING1,   // t('leadStatsModal.depositReceived')
  LeadStage.CONTRACT_SIGNING1,   // t('leadStatsModal.anAgreementHasBeenConcluded')
  
  // bought (куплено)
  LeadStage.DEAL_CLOSED,        // t('leadStatsModal.goldFund')
  LeadStage.POST_PURCHASE_FOLLOWUP, // t('leadStatsModal.findOutHowYouAreDoing')
  LeadStage.SATISFACTION_CHECK, // t('leadStatsModal.takeARecommendation')
  LeadStage.UPSELL_OPPORTUNITY,  // t('leadStatsModal.identifyingTheNeedForNewDeals')
];

// Маппинг этапов на категории (из funnelProperties.RP)
const stageToCategory: Record<LeadStage, 'leads' | 'inWork' | 'bought'> = {
  // leads (отказы)
  [LeadStage.REJECTED]: 'leads',
  [LeadStage.FIRST_CONTACT]: 'leads',
  [LeadStage.QUALIFICATION]: 'leads',
  [LeadStage.REJECTED1]: 'leads',
  [LeadStage.FIRST_CONTACT1]: 'leads',
  
  // inWork (в работе)
  [LeadStage.NEEDS_ANALYSIS]: 'inWork',
  [LeadStage.PRESENTATION]: 'inWork',
  [LeadStage.PROPOSAL]: 'inWork',
  [LeadStage.NEGOTIATION]: 'inWork',
  [LeadStage.DECISION_MAKING]: 'inWork',
  [LeadStage.CONTRACT_SIGNING]: 'inWork',
  [LeadStage.ONBOARDING]: 'inWork',
  [LeadStage.NEEDS_ANALYSIS1]: 'inWork',
  [LeadStage.PRESENTATION1]: 'inWork',
  [LeadStage.PROPOSAL1]: 'inWork',
  [LeadStage.NEGOTIATION1]: 'inWork',
  [LeadStage.DECISION_MAKING1]: 'inWork',
  [LeadStage.CONTRACT_SIGNING1]: 'inWork',
  
  // bought (куплено)
  [LeadStage.DEAL_CLOSED]: 'bought',
  [LeadStage.POST_PURCHASE_FOLLOWUP]: 'bought',
  [LeadStage.SATISFACTION_CHECK]: 'bought',
  [LeadStage.UPSELL_OPPORTUNITY]: 'bought',
  
  // Остальные этапы (не используются в продажах, но нужны для типа)
  [LeadStage.REGISTERED]: 'inWork',
  [LeadStage.ADAPTED]: 'inWork',
  [LeadStage.NETWORK_REJECTED_DEFECTIVE]: 'leads',
  [LeadStage.NETWORK_REJECTED]: 'leads',
  [LeadStage.NETWORK_NO_CALL_3]: 'leads',
  [LeadStage.NETWORK_NO_CALL_2]: 'leads',
  [LeadStage.NETWORK_NO_CALL_1]: 'leads',
  [LeadStage.NETWORK_NEW_LEAD]: 'inWork',
  [LeadStage.NETWORK_CALL_LATER]: 'inWork',
  [LeadStage.NETWORK_COMPANY_PRESENTED]: 'inWork',
  [LeadStage.NETWORK_PLATFORM_PRESENTED]: 'inWork',
  [LeadStage.NETWORK_OFFER_GIVEN]: 'inWork',
  [LeadStage.NETWORK_OBJECTIONS]: 'inWork',
  [LeadStage.NETWORK_DEFERRED_DEMAND]: 'inWork',
  [LeadStage.NETWORK_AGREEMENT]: 'inWork',
  [LeadStage.NETWORK_FORM_FILLED]: 'inWork',
  [LeadStage.NETWORK_ACCOUNT_REGISTERED]: 'inWork',
  [LeadStage.NETWORK_OFFER_SIGNED]: 'inWork',
  [LeadStage.NETWORK_WORK_STARTED]: 'inWork',
  [LeadStage.REALTOR_1]: 'inWork',
  [LeadStage.REALTOR_2]: 'inWork',
  [LeadStage.REALTOR_3]: 'inWork',
  [LeadStage.REALTOR_4]: 'inWork',
  [LeadStage.REALTOR_5]: 'inWork',
  [LeadStage.REALTOR_6]: 'inWork',
  [LeadStage.CURATOR_1]: 'inWork',
  [LeadStage.CURATOR_2]: 'inWork',
  [LeadStage.CURATOR_3]: 'inWork',
  [LeadStage.CURATOR_4]: 'inWork',
  [LeadStage.CURATOR_5]: 'inWork',
  [LeadStage.CURATOR_6]: 'inWork',
  [LeadStage.OWNER_REJECTED_DEFECTIVE]: 'leads',
  [LeadStage.OWNER_REJECTED_OWNER]: 'leads',
  [LeadStage.OWNER_NO_CALL_3]: 'leads',
  [LeadStage.OWNER_NO_CALL_2]: 'leads',
  [LeadStage.OWNER_NO_CALL_1]: 'leads',
  [LeadStage.OWNER_NEW_OWNER]: 'inWork',
  [LeadStage.OWNER_CALL_LATER]: 'inWork',
  [LeadStage.OWNER_COMPANY_PRESENTED]: 'inWork',
  [LeadStage.OWNER_OBJECT_DISCUSSED]: 'inWork',
  [LeadStage.OWNER_PHOTO_PROPOSED]: 'inWork',
  [LeadStage.OWNER_EXCLUSIVE_PROPOSED]: 'inWork',
  [LeadStage.OWNER_OBJECTIONS]: 'inWork',
  [LeadStage.OWNER_AGREED]: 'inWork',
  [LeadStage.OWNER_ACTIVE_FOR_SALE]: 'inWork',
  [LeadStage.OWNER_GET_REFERRAL]: 'inWork',
  [LeadStage.OWNER_NEW_OBJECT_INQUIRY]: 'inWork',
  [LeadStage.AGENT_REJECTED_DEFECTIVE]: 'leads',
  [LeadStage.AGENT_REJECTED]: 'leads',
  [LeadStage.AGENT_NO_CALL_3]: 'leads',
  [LeadStage.AGENT_NO_CALL_2]: 'leads',
  [LeadStage.AGENT_NO_CALL_1]: 'leads',
  [LeadStage.AGENT_NEW_AGENT]: 'inWork',
  [LeadStage.AGENT_CALL_LATER]: 'inWork',
  [LeadStage.AGENT_COMPANY_PRESENTED]: 'inWork',
  [LeadStage.AGENT_FORMAT]: 'inWork',
  [LeadStage.AGENT_OBJECTIONS]: 'inWork',
  [LeadStage.AGENT_AGREED]: 'inWork',
  [LeadStage.AGENT_ACTIVE]: 'inWork',
} as Record<LeadStage, 'leads' | 'inWork' | 'bought'>;

// Цвета категорий (из LeadsBlock.tsx)
const categoryColors = {
  leads: 'rgb(53, 140, 210)',      // Синий
  inWork: 'rgb(95, 190, 78)',       // Зеленый
  bought: 'rgb(255, 204, 0)',       // Желтый
};

const LeadStatsModal: React.FC<LeadStatsModalProps> = ({ isOpen, onClose, leadEmail, leadName }) => {
  useDisableScroll(isOpen);
  
  const { t } = useI18n();
  const categoryLabels = useMemo(() => ({
    leads: t('leadStatsModal.categoryLeads'),
    inWork: t('leadStatsModal.categoryInWork'),
    bought: t('leadStatsModal.categoryBought'),
  }), [t]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previousEmailRef = useRef<string | undefined>(undefined);
  const previousIsOpenRef = useRef<boolean>(false);

  const loadStats = useCallback(async () => {
    if (!leadEmail) return;

    setLoading(true);
    setError(null);

    try {
      // Используем новый метод getAllNumbersLeadsForAllCategories для получения статистики по этапам
      const response = await apiService.getAllNumbersLeadsForAllCategories(leadEmail);
      
      if (response.success && response.data) {
        // Преобразуем массив объектов { stage, count } в объект { [stage]: count } для совместимости
        const statsObject: Record<string, number> = {};
        response.data.forEach(({ stage, count }) => {
          statsObject[stage] = count;
        });
        
        // Обновляем состояние только если данные действительно изменились
        setStats(prevStats => {
          const statsString = JSON.stringify(prevStats);
          const newStatsString = JSON.stringify(statsObject);
          if (statsString === newStatsString) {
            return prevStats; // Возвращаем предыдущее состояние, чтобы избежать ре-рендера
          }
          return statsObject;
        });
        setError(null);
      } else {
        // Обрабатываем различные типы ошибок
        const errorMessage = response.message || t('leadStatsModal.errorLoadingStatsFallback');
        setError(errorMessage);
        setStats({});
      }
    } catch (err: any) {
      // Обрабатываем ошибки, которые не были обработаны в API методе
      const errorMessage = err?.response?.data?.message || err?.message || t('leadStatsModal.errorLoadingStats');
      setError(errorMessage);
      setStats({});
    } finally {
      setLoading(false);
    }
  }, [leadEmail, t]);

  useEffect(() => {
    // Загружаем данные только если:
    // 1. Модалка только что открылась (isOpen изменился с false на true)
    // 2. Или изменился leadEmail (открыли другого лида)
    const emailChanged = previousEmailRef.current !== leadEmail;
    const modalJustOpened = !previousIsOpenRef.current && isOpen;
    
    if (isOpen && leadEmail && (emailChanged || modalJustOpened)) {
      previousEmailRef.current = leadEmail;
      loadStats();
    } else if (!isOpen) {
      // Очищаем данные только при закрытии модалки
      setStats({});
      setError(null);
      previousEmailRef.current = undefined;
    }
    
    previousIsOpenRef.current = isOpen;
  }, [isOpen, leadEmail, loadStats]);

  // Показываем все этапы продаж в правильном порядке, даже если count = 0
  // ВАЖНО: хуки должны вызываться до условного возврата
  const allStages = useMemo(() => {
    return salesStagesOrder.map(stage => {
      const stageKey = stage as string;
      const count = stats[stageKey] || 0;
      return {
        stage: stageKey,
        count,
        label: t(`leadStages.${stage}` as any) || stageKey,
      };
    });
  }, [stats, t]);

  const totalLeads = useMemo(() => {
    return Object.values(stats).reduce((sum, count) => sum + count, 0);
  }, [stats]);

  // Подсчитываем лиды по категориям
  const categoryCounts = useMemo(() => {
    const counts = {
      leads: 0,
      inWork: 0,
      bought: 0,
    };
    
    Object.entries(stats).forEach(([stageKey, count]) => {
      const stage = stageKey as LeadStage;
      const category = stageToCategory[stage] || 'inWork';
      counts[category] += count;
    });
    
    return counts;
  }, [stats]);

  // Функция для создания сегмента круга
  const createArc = (startAngle: number, endAngle: number, innerRadius: number, outerRadius: number, centerX: number, centerY: number) => {
    const startAngleRad = (startAngle * Math.PI) / 180;
    const endAngleRad = (endAngle * Math.PI) / 180;
    
    const x1 = centerX + outerRadius * Math.cos(startAngleRad);
    const y1 = centerY + outerRadius * Math.sin(startAngleRad);
    const x2 = centerX + outerRadius * Math.cos(endAngleRad);
    const y2 = centerY + outerRadius * Math.sin(endAngleRad);
    
    const x3 = centerX + innerRadius * Math.cos(endAngleRad);
    const y3 = centerY + innerRadius * Math.sin(endAngleRad);
    const x4 = centerX + innerRadius * Math.cos(startAngleRad);
    const y4 = centerY + innerRadius * Math.sin(startAngleRad);
    
    const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;
    
    return `M ${x1} ${y1} A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${x4} ${y4} Z`;
  };

  // Функция для получения координат текста рядом с сегментом (снаружи диаграммы)
  const getTextPosition = (startAngle: number, endAngle: number, radius: number, centerX: number, centerY: number) => {
    const midAngle = ((startAngle + endAngle) / 2) * (Math.PI / 180);
    // Размещаем текст снаружи диаграммы, на расстоянии от внешнего радиуса
    const x = centerX + (radius + 35) * Math.cos(midAngle);
    const y = centerY + (radius + 35) * Math.sin(midAngle);
    return { x, y };
  };

  // Функция для отображения круговой диаграммы на основе данных
  const renderPieChart = () => {
    if (totalLeads === 0) {
      // Если нет данных, показываем пустой круг
      return (
        <svg width="539" height="377" viewBox="0 0 539 377" fill="none" xmlns="http://www.w3.org/2000/svg">
          <g>
            <path fillRule="evenodd" clipRule="evenodd" d="M268.309 249.741C323.303 249.741 368.241 204.803 368.241 149.809C368.241 93.9373 323.303 49 268.309 49C212.437 49 167.5 93.9373 167.5 149.809C167.5 204.803 212.437 249.741 268.309 249.741Z" fill="#C5C5C5"/>
            <path fillRule="evenodd" clipRule="evenodd" d="M268.5 220C307.16 220 338.5 188.66 338.5 150C338.5 111.34 307.16 80 268.5 80C229.84 80 198.5 111.34 198.5 150C198.5 188.66 229.84 220 268.5 220Z" fill="white"/>
          </g>
        </svg>
      );
    }

    // Параметры круга
    const centerX = 268.309;
    const centerY = 149.809;
    const outerRadius = 100.37; // (249.741 - 49) / 2
    const innerRadius = 70; // (220 - 80) / 2
    const textRadius = (outerRadius + innerRadius) / 2; // Радиус для размещения текста
    
    // Вычисляем проценты для каждой категории
    const leadsPercent = (categoryCounts.leads / totalLeads) * 100;
    const inWorkPercent = (categoryCounts.inWork / totalLeads) * 100;
    const boughtPercent = (categoryCounts.bought / totalLeads) * 100;
    
    // Начальные углы для каждого сегмента (начинаем с -90 градусов, чтобы первый сегмент был сверху)
    let currentAngle = -90;
    
    // Создаем сегменты в порядке: leads, bought, inWork (как в оригинале)
    const segments = [];
    
    // 1. Leads (синий)
    if (categoryCounts.leads > 0) {
      const startAngle = currentAngle;
      const endAngle = currentAngle + (leadsPercent / 100) * 360;
      const textPos = getTextPosition(startAngle, endAngle, textRadius, centerX, centerY);
      segments.push({
        path: createArc(startAngle, endAngle, innerRadius, outerRadius, centerX, centerY),
        fill: categoryColors.leads,
        percent: Math.round(leadsPercent),
        textX: textPos.x,
        textY: textPos.y,
      });
      currentAngle = endAngle;
    }
    
    // 2. Bought (желтый)
    if (categoryCounts.bought > 0) {
      const startAngle = currentAngle;
      const endAngle = currentAngle + (boughtPercent / 100) * 360;
      const textPos = getTextPosition(startAngle, endAngle, textRadius, centerX, centerY);
      segments.push({
        path: createArc(startAngle, endAngle, innerRadius, outerRadius, centerX, centerY),
        fill: categoryColors.bought,
        percent: Math.round(boughtPercent),
        textX: textPos.x,
        textY: textPos.y,
      });
      currentAngle = endAngle;
    }
    
    // 3. InWork (зеленый)
    if (categoryCounts.inWork > 0) {
      const startAngle = currentAngle;
      const endAngle = currentAngle + (inWorkPercent / 100) * 360;
      const textPos = getTextPosition(startAngle, endAngle, textRadius, centerX, centerY);
      segments.push({
        path: createArc(startAngle, endAngle, innerRadius, outerRadius, centerX, centerY),
        fill: categoryColors.inWork,
        percent: Math.round(inWorkPercent),
        textX: textPos.x,
        textY: textPos.y,
      });
    }

    return (
      <svg width="539" height="377" viewBox="0 0 539 377" fill="none" xmlns="http://www.w3.org/2000/svg">
        <g>
          {segments.map((segment, index) => (
            <g key={index}>
              <path
                d={segment.path}
                fill={segment.fill}
              />
              {segment.percent > 0 && (
                <text
                  x={segment.textX}
                  y={segment.textY}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#AB7800"
                  fontSize="11"
                  fontWeight="900"
                  style={{
                    fontFamily: 'var(--font-sans)',
                    stroke: '#AB7800',
                    strokeWidth: '0.8',
                    paintOrder: 'stroke fill',
                  }}
                >
                  {segment.percent}%
                </text>
              )}
            </g>
          ))}
          <path fillRule="evenodd" clipRule="evenodd" d="M268.5 220C307.16 220 338.5 188.66 338.5 150C338.5 111.34 307.16 80 268.5 80C229.84 80 198.5 111.34 198.5 150C198.5 188.66 229.84 220 268.5 220Z" fill="white"/>
        </g>
      </svg>
    );
  };

  if (!isOpen) return null;

  return createPortal(
    <div 
      className="modal-fade-in fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 pt-4 md:pt-4 pb-0 md:pb-4 px-0 md:px-4 transition-all duration-300 ease-out animate-in fade-in" 
      onClick={(e) => {
        // Закрываем только если клик был именно по backdrop (не по дочерним элементам)
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div 
        className="relative flex flex-col bg-white rounded-[25px] shadow-2xl w-full md:w-[90.75%] max-w-2xl h-[calc(100vh-1rem)] md:h-[90.89vh] overflow-hidden max-w-full animate-in zoom-in-95 slide-in-from-bottom-4 duration-300"
        onClick={(e) => e.stopPropagation()}
        style={{ boxSizing: 'border-box' }}
      > 
        <div className="w-full h-full p-4 md:p-10 min-w-0 max-w-full box-border flex flex-col overflow-y-auto relative">
          <button 
            onClick={onClose} 
            aria-label={t('leadStatsModal.close')} 
            className='cursor-pointer absolute top-4 right-4 z-10'
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6L6 18" stroke="#1C1D21" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M6 6L18 18" stroke="#1C1D21" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {/* Заголовок */}
          <div className="mb-6">
            <h2 
              className="text-2xl font-normal mb-2"
              style={{
                fontFamily: 'var(--font-sans)',
                fontWeight: 400,
                fontStyle: 'normal',
                fontSize: '24px',
                lineHeight: '28px',
                letterSpacing: '0px',
              }}
            >{t('leadStatsModal.statisticsBySalesStage')}</h2>
            {leadName && (
              <p 
                className="text-gray-600 mb-1"
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 400,
                  fontSize: '16px',
                  lineHeight: '20px',
                }}
              >
                {leadName}
              </p>
            )}
            {leadEmail && (
              <p 
                className="text-gray-500 text-sm"
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 400,
                  fontSize: '14px',
                  lineHeight: '18px',
                }}
              >
                {leadEmail}
              </p>
            )}
          </div>

          {/* Сообщение об отсутствии почты */}
          {!leadEmail && (
            <div className="mb-6 p-6 bg-yellow-50 border border-yellow-200 rounded-xl">
              <p 
                className="text-center text-gray-700"
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 400,
                  fontSize: '16px',
                  lineHeight: '24px',
                }}
              >{t('leadStatsModal.mailIsNotLinked')}</p>
              <p 
                className="text-center text-gray-500 mt-2"
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 400,
                  fontSize: '14px',
                  lineHeight: '20px',
                }}
              >{t('leadStatsModal.toDisplayStatisticsYouNeedToBi')}</p>
            </div>
          )}

          {/* Круговая диаграмма и информация */}
          {leadEmail && (
          <div>
          <div className="mb-[10px] p-4 bg-gray-50 rounded-xl flex flex-col md:flex-row items-start gap-6">
            {/* Слева от диаграммы - информация "Всего лидов" */}
            <div className="flex-1 flex flex-col items-center justify-center md:justify-start">
              {totalLeads > 0 && (
                <div className="p-4 w-full">
                  <p 
                    className="font-normal mb-4"
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontWeight: 400,
                      fontSize: '20px',
                      lineHeight: '24px',
                    }}
                  >{t('leadStatsModal.totalLeads')}<span className="text-dream-primary">{totalLeads}</span>
                  </p>
                  
                  {/* Информация по каждому этапу из трех категорий */}
                  <div className="flex flex-col gap-3">
                    {/* Отказ (leads) */}
                    {categoryCounts.leads > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <div
                            className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: categoryColors.leads }}
                          />
                          <span
                            className="text-sm font-normal"
                            style={{
                              fontFamily: 'var(--font-sans)',
                              fontWeight: 400,
                              fontSize: '14px',
                            }}
                          >
                            {categoryLabels.leads}: {categoryCounts.leads}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2 ml-6">
                          {allStages
                            .filter(({ stage, count }) => {
                              const stageEnum = stage as LeadStage;
                              return stageToCategory[stageEnum] === 'leads' && count > 0;
                            })
                            .map(({ stage, label, count }) => (
                              <span
                                key={stage}
                                className="text-xs text-gray-600"
                                style={{
                                  fontFamily: 'var(--font-sans)',
                                  fontWeight: 400,
                                  fontSize: '12px',
                                }}
                              >
                                {label}: {count}
                              </span>
                            ))}
                        </div>
                      </div>
                    )}
                    
                    {/* В работе (inWork) */}
                    {categoryCounts.inWork > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <div
                            className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: categoryColors.inWork }}
                          />
                          <span
                            className="text-sm font-normal"
                            style={{
                              fontFamily: 'var(--font-sans)',
                              fontWeight: 400,
                              fontSize: '14px',
                            }}
                          >
                            {categoryLabels.inWork}: {categoryCounts.inWork}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2 ml-6">
                          {allStages
                            .filter(({ stage, count }) => {
                              const stageEnum = stage as LeadStage;
                              return stageToCategory[stageEnum] === 'inWork' && count > 0;
                            })
                            .map(({ stage, label, count }) => (
                              <span
                                key={stage}
                                className="text-xs text-gray-600"
                                style={{
                                  fontFamily: 'var(--font-sans)',
                                  fontWeight: 400,
                                  fontSize: '12px',
                                }}
                              >
                                {label}: {count}
                              </span>
                            ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Купили (bought) */}
                    {categoryCounts.bought > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <div
                            className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: categoryColors.bought }}
                          />
                          <span
                            className="text-sm font-normal"
                            style={{
                              fontFamily: 'var(--font-sans)',
                              fontWeight: 400,
                              fontSize: '14px',
                            }}
                          >
                            {categoryLabels.bought}: {categoryCounts.bought}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2 ml-6">
                          {allStages
                            .filter(({ stage, count }) => {
                              const stageEnum = stage as LeadStage;
                              return stageToCategory[stageEnum] === 'bought' && count > 0;
                            })
                            .map(({ stage, label, count }) => (
                              <span
                                key={stage}
                                className="text-xs text-gray-600"
                                style={{
                                  fontFamily: 'var(--font-sans)',
                                  fontWeight: 400,
                                  fontSize: '12px',
                                }}
                              >
                                {label}: {count}
                              </span>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            
            {/* Диаграмма */}
            <div className="flex-shrink-0 flex flex-col items-center -mt-8">
              <div className="scale-110">
                {renderPieChart()}
              </div>
            </div>
          </div>

          {/* Загрузка */}
          {loading && (
            <div className="text-center py-8 flex-1 flex items-center justify-center">
              <p 
                className="text-gray-500"
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 400,
                  fontSize: '16px',
                }}
              >{t('leadStatsModal.loadingStatistics')}</p>
            </div>
          )}

          {/* Ошибка или пустая статистика */}
          {((error && !loading) || (!loading && !error && totalLeads === 0)) && (
            <div className="mb-6 p-6 bg-yellow-50 border border-yellow-200 rounded-xl">
              <p 
                className="text-center text-gray-700"
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 400,
                  fontSize: '16px',
                  lineHeight: '24px',
                }}
              >
                {error ? t('leadStatsModal.errorLoadingStats') : t('leadStatsModal.noData')}
              </p>
              <p 
                className="text-center text-gray-500 mt-2"
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 400,
                  fontSize: '14px',
                  lineHeight: '20px',
                }}
              >
                {error ? error : t('leadStatsModal.noDataDesc')}
              </p>
            </div>
          )}

          {/* Статистика */}
          {!loading && !error && totalLeads > 0 && (
            <div className="space-y-4 flex-1 -mt-16">
              {allStages.map(({ stage, count, label }) => {
                const percentage = totalLeads > 0 ? Math.round((count / totalLeads) * 100) : 0;
                const category = stageToCategory[stage as LeadStage] || 'inWork';
                const categoryColor = categoryColors[category];

                return (
                  <div 
                    key={stage} 
                    className={`border rounded-xl p-4 transition-colors ${
                      count > 0 ? 'hover:bg-gray-50 bg-white' : 'bg-gray-50 opacity-60'
                    }`}
                    style={{
                      borderLeftWidth: count > 0 ? '4px' : '1px',
                      borderLeftColor: count > 0 ? categoryColor : 'rgb(229, 231, 235)',
                      borderColor: '#000000',
                      borderWidth: '1px',
                    }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: count > 0 ? categoryColor : '#C5C5C5' }}
                        />
                        <span 
                          className={`font-medium ${
                            count > 0 ? 'text-gray-900' : 'text-gray-500'
                          }`}
                          style={{
                            fontFamily: 'var(--font-sans)',
                            fontWeight: 400,
                            fontSize: '16px',
                            lineHeight: '20px',
                          }}
                        >
                          {label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        {totalLeads > 0 && (
                          <span 
                            className="text-sm text-gray-500"
                            style={{
                              fontFamily: 'var(--font-sans)',
                              fontWeight: 400,
                              fontSize: '14px',
                            }}
                          >
                            {percentage}%
                          </span>
                        )}
                        <span 
                          className={`text-lg font-normal ${
                            count > 0 ? 'text-dream-primary' : 'text-gray-400'
                          }`}
                          style={{
                            fontFamily: 'var(--font-sans)',
                            fontWeight: 400,
                            fontSize: '18px',
                          }}
                        >
                          {count}
                        </span>
                      </div>
                    </div>
                    
                    {/* Прогресс-бар для этапа */}
                    <div className="w-full">
                      {(() => {
                        const segmentWidth = 86.6667;
                        const gapWidth = 3;
                        const numStages = salesStagesOrder.length;
                        const totalWidth = (numStages - 1) * (segmentWidth + gapWidth) + segmentWidth;
                        
                        // Находим индекс текущего этапа в порядке воронки
                        const currentStageIndex = salesStagesOrder.findIndex(s => s === stage);
                        
                        return (
                          <svg 
                            width="100%" 
                            height="34" 
                            viewBox={`0 0 ${totalWidth} 34`} 
                            fill="none" 
                            xmlns="http://www.w3.org/2000/svg" 
                            preserveAspectRatio="none" 
                            className="w-full"
                          >
                            {salesStagesOrder.map((s, index) => {
                              const x = index * (segmentWidth + gapWidth);
                              // Отмечаем только текущий этап, если у него есть лиды
                              const isCurrentStage = index === currentStageIndex;
                              const fillColor = (isCurrentStage && count > 0) ? categoryColor : "#C5C5C5";
                              
                              return (
                                <rect
                                  key={s}
                                  x={x}
                                  y="15"
                                  width={segmentWidth}
                                  height="8.5"
                                  fill={fillColor}
                                />
                              );
                            })}
                          </svg>
                        );
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default LeadStatsModal;
