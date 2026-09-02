import { useState, useMemo, useEffect, useRef } from 'react';
import { ProductType, apiService } from '../../services/api';
import type { Lead } from '../../services/api';
import LeadStatsModal from './LeadStatsModal';
import { useI18n } from "@/i18n";

interface RealtorCardsGridProps {
  leads?: Lead[];
  selectedPeriod?: string;
}

interface LeadStats {
  networkSize: number | null;
  objectsCount: number | null;
  leadsCount: number | null;
}

const RealtorCardsGrid = ({ leads = [] }: RealtorCardsGridProps) => {
  const { t } = useI18n();
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
  const selectedLeadIdRef = useRef<string | null>(null);
  const [leadStats, setLeadStats] = useState<Record<string, LeadStats>>({});

  // Обновляем selectedLead только если изменился ID или если лид был удален
  useEffect(() => {
    if (selectedLeadIdRef.current && selectedLead) {
      const updatedLead = leads.find(l => l._id === selectedLeadIdRef.current);
      if (updatedLead && updatedLead._id === selectedLead._id) {
        // Обновляем только если это тот же лид (по ID), чтобы избежать дерганья
        setSelectedLead(prevLead => {
          if (!prevLead) return updatedLead;
          // Сравниваем только email и name, чтобы избежать ненужных обновлений
          if (prevLead.email === updatedLead.email && prevLead.name === updatedLead.name) {
            return prevLead; // Возвращаем предыдущее состояние, чтобы избежать ре-рендера
          }
          return updatedLead;
        });
      } else if (!updatedLead) {
        // Лид был удален
        setSelectedLead(null);
        selectedLeadIdRef.current = null;
      }
    }
  }, [leads, selectedLead]);
  
  // Фильтруем лидов из Сети (NETWORK) для отображения карточек
  // Используем useMemo, чтобы избежать лишних пересчетов
  const networkLeadsAtWorkStarted = useMemo(() => {
    return leads.filter(lead => lead.productType === ProductType.NETWORK);
  }, [leads]);

  // Если лидов нет, не отображаем компонент
  if (networkLeadsAtWorkStarted.length === 0) {
    return null;
  }

  // Создаем стабильный ключ из ID лидов для отслеживания изменений
  const leadsIdsKey = useMemo(() => {
    return networkLeadsAtWorkStarted.map(l => l._id).sort().join(',');
  }, [networkLeadsAtWorkStarted]);

  // Загружаем статистику для всех лидов
  useEffect(() => {
    const loadStats = async () => {
      const statsPromises = networkLeadsAtWorkStarted.map(async (lead) => {
        if (!lead.email) {
          return { leadId: lead._id, stats: { networkSize: null, objectsCount: null, leadsCount: null } };
        }

        try {
          // Загружаем все данные параллельно
          // Используем getAllNumbersLeads вместо getLeadsCountByEmail, так как он работает корректно
          const [referralsResponse, objectsResponse, leadsResponse] = await Promise.allSettled([
            apiService.getReferralsCountByEmail(lead.email!),
            apiService.getTotalObjectsCountByEmail(lead.email!),
            apiService.getAllNumbersLeads(lead.email!)
          ]);

          const networkSize = referralsResponse.status === 'fulfilled' && referralsResponse.value.success
            ? referralsResponse.value.data?.totalCount ?? null
            : null;

          const objectsCount = objectsResponse.status === 'fulfilled' && objectsResponse.value.success
            ? objectsResponse.value.data?.totalCount ?? null
            : null;

          // Обрабатываем ответ для количества лидов - извлекаем только число
          let leadsCount: number | null = null;
          if (leadsResponse.status === 'fulfilled') {
            if (leadsResponse.value.success && leadsResponse.value.data) {
              // Убеждаемся, что извлекаем только число, а не весь объект данных
              const countValue = leadsResponse.value.data.count;
              leadsCount = typeof countValue === 'number' ? countValue : null;
            }
            // Если success: false, leadsCount остается null (будет показано "-")
          } else {
            // Если запрос упал с ошибкой, leadsCount остается null (будет показано "-")
          }

          return {
            leadId: lead._id,
            stats: { networkSize, objectsCount, leadsCount }
          };
        } catch (error) {
          console.error(`[RealtorCardsGrid] Error loading stats for lead ${lead._id}:`, error);
          return { leadId: lead._id, stats: { networkSize: null, objectsCount: null, leadsCount: null } };
        }
      });

      const results = await Promise.all(statsPromises);
      const newStats: Record<string, LeadStats> = {};
      results.forEach(({ leadId, stats }) => {
        newStats[leadId] = stats;
      });
      setLeadStats(newStats);
    };

    if (networkLeadsAtWorkStarted.length > 0) {
      loadStats();
    } else {
      // Если лидов нет, очищаем статистику
      setLeadStats({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadsIdsKey]); // Зависимость от ключа ID лидов - будет срабатывать при изменении списка лидов

  return (
    <div className='flex flex-wrap pl-5 py-5 gap-2.5 rounded-[25px] bg-white h-full'>
      {networkLeadsAtWorkStarted.map((lead) => {
        const stats = leadStats[lead._id] || { networkSize: null, objectsCount: null, leadsCount: null };
        const networkSize = stats.networkSize;
        const objectsCount = stats.objectsCount;
        const leadsCount = stats.leadsCount;
        
        return (
          <div 
            key={lead._id} 
            className='flex flex-col gap-3 items-center rounded-md bg-white px-3.75 py-3.75 min-h-[280px] w-62.5 justify-between cursor-pointer hover:bg-[#f0faf6] transition-colors border border-gray-100 relative'
            onClick={() => {
              setSelectedLead(lead);
              selectedLeadIdRef.current = lead._id;
              setIsStatsModalOpen(true);
            }}
          >
            <div className='flex flex-col gap-3 items-center w-full pt-2'>
              {/* Круглая фотография профиля в центре сверху */}
              <div className='h-[90px] w-[90px] rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 relative' style={{ background: '#d0e8df' }}>
                <svg width="90" height="90" viewBox="0 0 90 90" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {/* Голова котика */}
                  <circle cx="45" cy="36" r="22" fill="#4A90E2" stroke="#2E5C8A" strokeWidth="2"/>
                  {/* Ушки */}
                  <path d="M29 22 L36 11 L43 22 Z" fill="#4A90E2" stroke="#2E5C8A" strokeWidth="2" strokeLinejoin="round"/>
                  <path d="M47 22 L54 11 L61 22 Z" fill="#4A90E2" stroke="#2E5C8A" strokeWidth="2" strokeLinejoin="round"/>
                  {/* Внутренняя часть ушек */}
                  <path d="M32 18 L36 13 L40 18 Z" fill="#FFB6C1"/>
                  <path d="M50 18 L54 13 L58 18 Z" fill="#FFB6C1"/>
                  {/* Глаза */}
                  <circle cx="38" cy="32" r="3.5" fill="#2E5C8A"/>
                  <circle cx="52" cy="32" r="3.5" fill="#2E5C8A"/>
                  {/* Носик */}
                  <path d="M45 40 L41 44 L49 44 Z" fill="#FF69B4"/>
                  {/* Рот */}
                  <path d="M41 44 Q45 48 49 44" stroke="#2E5C8A" strokeWidth="2" strokeLinecap="round" fill="none"/>
                  {/* Усы */}
                  <line x1="23" y1="36" x2="32" y2="36" stroke="#2E5C8A" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="23" y1="41" x2="32" y2="40" stroke="#2E5C8A" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="58" y1="36" x2="67" y2="36" stroke="#2E5C8A" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="58" y1="41" x2="67" y2="40" stroke="#2E5C8A" strokeWidth="2" strokeLinecap="round"/>
                  {/* Тело */}
                  <ellipse cx="45" cy="63" rx="18" ry="14" fill="#4A90E2" stroke="#2E5C8A" strokeWidth="2"/>
                  {/* Лапки */}
                  <ellipse cx="32" cy="72" rx="5" ry="7" fill="#4A90E2" stroke="#2E5C8A" strokeWidth="2"/>
                  <ellipse cx="58" cy="72" rx="5" ry="7" fill="#4A90E2" stroke="#2E5C8A" strokeWidth="2"/>
                  {/* Хвостик */}
                  <path d="M63 58 Q70 54 76 63 Q70 72 63 68" fill="#4A90E2" stroke="#2E5C8A" strokeWidth="2" strokeLinejoin="round"/>
                </svg>
              </div>
              
              {/* Имя */}
              <div className='flex items-center gap-2 w-full justify-center'>
                <span className='text-black text-center' style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '16px', lineHeight: '120%', letterSpacing: '0px' }}>
                  {lead.name}
                </span>
              </div>

              {/* Информация об объектах - под именем по центру */}
              <div className='flex items-center justify-center gap-2 w-full'>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M9 0L11.5 6.5H18L12.75 10.5L15.25 17L9 13L2.75 17L5.25 10.5L0 6.5H6.5L9 0Z" fill="#169600"/>
                </svg>
                <span className='text-[#169600]' style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '14px', lineHeight: '100%', letterSpacing: '0px' }}>
                  {objectsCount !== null ? `${objectsCount} объектов` : '-'}
                </span>
              </div>

              {/* Остальная информация */}
              <div className='flex flex-col gap-2 w-full px-2'>
                {/* Размер сети */}
                <div className='flex items-center justify-between w-full'>
                  <span className='text-gray-500' style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '13px', lineHeight: '100%', letterSpacing: '0px' }}>
                    {t('crm.crm.realtorCardsGrid.размер_сети')}</span>
                  <span className='text-black' style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '15px', lineHeight: '100%', letterSpacing: '0px' }}>
                    {networkSize !== null ? networkSize : '-'}
                  </span>
                </div>
                
                {/* Кол-во лидов */}
                <div className='flex items-center justify-between w-full'>
                  <span className='text-gray-500' style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '13px', lineHeight: '100%', letterSpacing: '0px' }}>
                    {t('crm.crm.realtorCardsGrid.кол_во_лидов')}</span>
                  <span className='text-black' style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '15px', lineHeight: '100%', letterSpacing: '0px' }}>
                    {leadsCount !== null ? leadsCount : '-'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
      <div className='flex flex-col gap-3.75 items-center rounded-lg bg-white h-50 w-62.5 border border-gray-100 pt-5'>
        <div className='flex flex-col items-center gap-3.75'>
          <svg width="70" height="70" viewBox="0 0 70 70" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g clipPath="url(#clip0_5173_22703)">
            <path d="M24.5841 54.879L14.1409 60.5755C13.5281 60.9096 12.9773 61.3204 12.4648 61.7681C18.5535 66.9019 26.4133 69.999 35.0009 69.999C43.525 69.999 51.3347 66.9481 57.4062 61.8843C56.8462 61.4115 56.2386 60.9862 55.565 60.6507L44.3822 55.06C42.9373 54.3375 42.0247 52.8609 42.0247 51.2456V46.8581C42.339 46.5002 42.6982 46.0406 43.0826 45.4977C44.6067 43.3449 45.7598 40.9768 46.5588 38.4924C47.9931 38.05 49.0498 36.7253 49.0498 35.1509V30.4675C49.0498 29.4373 48.5914 28.5168 47.8796 27.8723V21.1021C47.8796 21.1021 49.2703 10.5664 35.0022 10.5664C20.7341 10.5664 22.1248 21.1021 22.1248 21.1021V27.8723C21.4116 28.5168 20.9547 29.4373 20.9547 30.4675V35.1509C20.9547 36.3845 21.6031 37.4702 22.5739 38.0975C23.7441 43.1917 26.8082 46.8581 26.8082 46.8581V51.1374C26.8069 52.6958 25.9537 54.1315 24.5841 54.879Z" fill="#C2D9EB"/>
            <path d="M35.5982 0.00521191C16.2716 -0.324977 0.335404 15.075 0.00521536 34.4016C-0.182332 45.3599 4.70182 55.2088 12.4784 61.7584C12.9869 61.3146 13.5324 60.9079 14.1386 60.5777L24.5818 54.8813C25.9514 54.1337 26.8046 52.698 26.8046 51.1369V46.8577C26.8046 46.8577 23.7392 43.1912 22.5703 38.0971C21.6009 37.4697 20.9511 36.3854 20.9511 35.1505V30.4671C20.9511 29.4369 21.4094 28.5163 22.1213 27.8718V21.1016C22.1213 21.1016 20.7305 10.566 34.9986 10.566C49.2667 10.566 47.876 21.1016 47.876 21.1016V27.8718C48.5892 28.5163 49.0462 29.4369 49.0462 30.4671V35.1505C49.0462 36.7248 47.9896 38.0496 46.5552 38.492C45.7562 40.9763 44.6031 43.3445 43.079 45.4973C42.6947 46.0401 42.3354 46.4997 42.0211 46.8577V51.2452C42.0211 52.8605 42.9337 54.3384 44.3786 55.0596L55.5614 60.6503C56.2324 60.9858 56.8386 61.4097 57.3973 61.8813C64.9388 55.5918 69.8111 46.188 69.992 35.5982C70.3248 16.2716 54.9262 0.335401 35.5982 0.00521191Z" fill="#F4F9FD"/>
            </g>
            <defs>
            <clipPath id="clip0_5173_22703">
            <rect width="70" height="70" fill="white"/>
            </clipPath>
            </defs>
          </svg>
          <span className='text-gray-400' style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '14px', lineHeight: '100%', letterSpacing: '0px', textAlign: 'center' }}>
            {t('crm.crm.realtorCardsGrid.пусто')}</span>
        </div>
      </div>
      <div className='flex flex-col gap-3.75 items-center rounded-lg bg-white h-50 w-62.5 border border-gray-100 pt-5'>
        <div className='flex flex-col items-center gap-3.75'>
          <svg width="70" height="70" viewBox="0 0 70 70" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g clipPath="url(#clip0_5173_22703)">
            <path d="M24.5841 54.879L14.1409 60.5755C13.5281 60.9096 12.9773 61.3204 12.4648 61.7681C18.5535 66.9019 26.4133 69.999 35.0009 69.999C43.525 69.999 51.3347 66.9481 57.4062 61.8843C56.8462 61.4115 56.2386 60.9862 55.565 60.6507L44.3822 55.06C42.9373 54.3375 42.0247 52.8609 42.0247 51.2456V46.8581C42.339 46.5002 42.6982 46.0406 43.0826 45.4977C44.6067 43.3449 45.7598 40.9768 46.5588 38.4924C47.9931 38.05 49.0498 36.7253 49.0498 35.1509V30.4675C49.0498 29.4373 48.5914 28.5168 47.8796 27.8723V21.1021C47.8796 21.1021 49.2703 10.5664 35.0022 10.5664C20.7341 10.5664 22.1248 21.1021 22.1248 21.1021V27.8723C21.4116 28.5168 20.9547 29.4373 20.9547 30.4675V35.1509C20.9547 36.3845 21.6031 37.4702 22.5739 38.0975C23.7441 43.1917 26.8082 46.8581 26.8082 46.8581V51.1374C26.8069 52.6958 25.9537 54.1315 24.5841 54.879Z" fill="#C2D9EB"/>
            <path d="M35.5982 0.00521191C16.2716 -0.324977 0.335404 15.075 0.00521536 34.4016C-0.182332 45.3599 4.70182 55.2088 12.4784 61.7584C12.9869 61.3146 13.5324 60.9079 14.1386 60.5777L24.5818 54.8813C25.9514 54.1337 26.8046 52.698 26.8046 51.1369V46.8577C26.8046 46.8577 23.7392 43.1912 22.5703 38.0971C21.6009 37.4697 20.9511 36.3854 20.9511 35.1505V30.4671C20.9511 29.4369 21.4094 28.5163 22.1213 27.8718V21.1016C22.1213 21.1016 20.7305 10.566 34.9986 10.566C49.2667 10.566 47.876 21.1016 47.876 21.1016V27.8718C48.5892 28.5163 49.0462 29.4369 49.0462 30.4671V35.1505C49.0462 36.7248 47.9896 38.0496 46.5552 38.492C45.7562 40.9763 44.6031 43.3445 43.079 45.4973C42.6947 46.0401 42.3354 46.4997 42.0211 46.8577V51.2452C42.0211 52.8605 42.9337 54.3384 44.3786 55.0596L55.5614 60.6503C56.2324 60.9858 56.8386 61.4097 57.3973 61.8813C64.9388 55.5918 69.8111 46.188 69.992 35.5982C70.3248 16.2716 54.9262 0.335401 35.5982 0.00521191Z" fill="#F4F9FD"/>
            </g>
            <defs>
            <clipPath id="clip0_5173_22703">
            <rect width="70" height="70" fill="white"/>
            </clipPath>
            </defs>
          </svg>
          <span className='text-gray-400' style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '14px', lineHeight: '100%', letterSpacing: '0px', textAlign: 'center' }}>
            {t('crm.crm.realtorCardsGrid.пусто')}</span>
        </div>
      </div>
      <div className='flex flex-col gap-3.75 items-center rounded-lg bg-white h-50 w-62.5 border border-gray-100 pt-5'>
        <div className='flex flex-col items-center gap-3.75'>
          <svg width="70" height="70" viewBox="0 0 70 70" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g clipPath="url(#clip0_5173_22703)">
            <path d="M24.5841 54.879L14.1409 60.5755C13.5281 60.9096 12.9773 61.3204 12.4648 61.7681C18.5535 66.9019 26.4133 69.999 35.0009 69.999C43.525 69.999 51.3347 66.9481 57.4062 61.8843C56.8462 61.4115 56.2386 60.9862 55.565 60.6507L44.3822 55.06C42.9373 54.3375 42.0247 52.8609 42.0247 51.2456V46.8581C42.339 46.5002 42.6982 46.0406 43.0826 45.4977C44.6067 43.3449 45.7598 40.9768 46.5588 38.4924C47.9931 38.05 49.0498 36.7253 49.0498 35.1509V30.4675C49.0498 29.4373 48.5914 28.5168 47.8796 27.8723V21.1021C47.8796 21.1021 49.2703 10.5664 35.0022 10.5664C20.7341 10.5664 22.1248 21.1021 22.1248 21.1021V27.8723C21.4116 28.5168 20.9547 29.4373 20.9547 30.4675V35.1509C20.9547 36.3845 21.6031 37.4702 22.5739 38.0975C23.7441 43.1917 26.8082 46.8581 26.8082 46.8581V51.1374C26.8069 52.6958 25.9537 54.1315 24.5841 54.879Z" fill="#C2D9EB"/>
            <path d="M35.5982 0.00521191C16.2716 -0.324977 0.335404 15.075 0.00521536 34.4016C-0.182332 45.3599 4.70182 55.2088 12.4784 61.7584C12.9869 61.3146 13.5324 60.9079 14.1386 60.5777L24.5818 54.8813C25.9514 54.1337 26.8046 52.698 26.8046 51.1369V46.8577C26.8046 46.8577 23.7392 43.1912 22.5703 38.0971C21.6009 37.4697 20.9511 36.3854 20.9511 35.1505V30.4671C20.9511 29.4369 21.4094 28.5163 22.1213 27.8718V21.1016C22.1213 21.1016 20.7305 10.566 34.9986 10.566C49.2667 10.566 47.876 21.1016 47.876 21.1016V27.8718C48.5892 28.5163 49.0462 29.4369 49.0462 30.4671V35.1505C49.0462 36.7248 47.9896 38.0496 46.5552 38.492C45.7562 40.9763 44.6031 43.3445 43.079 45.4973C42.6947 46.0401 42.3354 46.4997 42.0211 46.8577V51.2452C42.0211 52.8605 42.9337 54.3384 44.3786 55.0596L55.5614 60.6503C56.2324 60.9858 56.8386 61.4097 57.3973 61.8813C64.9388 55.5918 69.8111 46.188 69.992 35.5982C70.3248 16.2716 54.9262 0.335401 35.5982 0.00521191Z" fill="#F4F9FD"/>
            </g>
            <defs>
            <clipPath id="clip0_5173_22703">
            <rect width="70" height="70" fill="white"/>
            </clipPath>
            </defs>
          </svg>
          <span className='text-gray-400' style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '14px', lineHeight: '100%', letterSpacing: '0px', textAlign: 'center' }}>
            {t('crm.crm.realtorCardsGrid.пусто')}</span>
        </div>
      </div>
      <div className='flex flex-col gap-3.75 items-center rounded-lg bg-white h-50 w-62.5 border border-gray-100 pt-5'>
        <div className='flex flex-col items-center gap-3.75'>
          <svg width="70" height="70" viewBox="0 0 70 70" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g clipPath="url(#clip0_5173_22703)">
            <path d="M24.5841 54.879L14.1409 60.5755C13.5281 60.9096 12.9773 61.3204 12.4648 61.7681C18.5535 66.9019 26.4133 69.999 35.0009 69.999C43.525 69.999 51.3347 66.9481 57.4062 61.8843C56.8462 61.4115 56.2386 60.9862 55.565 60.6507L44.3822 55.06C42.9373 54.3375 42.0247 52.8609 42.0247 51.2456V46.8581C42.339 46.5002 42.6982 46.0406 43.0826 45.4977C44.6067 43.3449 45.7598 40.9768 46.5588 38.4924C47.9931 38.05 49.0498 36.7253 49.0498 35.1509V30.4675C49.0498 29.4373 48.5914 28.5168 47.8796 27.8723V21.1021C47.8796 21.1021 49.2703 10.5664 35.0022 10.5664C20.7341 10.5664 22.1248 21.1021 22.1248 21.1021V27.8723C21.4116 28.5168 20.9547 29.4373 20.9547 30.4675V35.1509C20.9547 36.3845 21.6031 37.4702 22.5739 38.0975C23.7441 43.1917 26.8082 46.8581 26.8082 46.8581V51.1374C26.8069 52.6958 25.9537 54.1315 24.5841 54.879Z" fill="#C2D9EB"/>
            <path d="M35.5982 0.00521191C16.2716 -0.324977 0.335404 15.075 0.00521536 34.4016C-0.182332 45.3599 4.70182 55.2088 12.4784 61.7584C12.9869 61.3146 13.5324 60.9079 14.1386 60.5777L24.5818 54.8813C25.9514 54.1337 26.8046 52.698 26.8046 51.1369V46.8577C26.8046 46.8577 23.7392 43.1912 22.5703 38.0971C21.6009 37.4697 20.9511 36.3854 20.9511 35.1505V30.4671C20.9511 29.4369 21.4094 28.5163 22.1213 27.8718V21.1016C22.1213 21.1016 20.7305 10.566 34.9986 10.566C49.2667 10.566 47.876 21.1016 47.876 21.1016V27.8718C48.5892 28.5163 49.0462 29.4369 49.0462 30.4671V35.1505C49.0462 36.7248 47.9896 38.0496 46.5552 38.492C45.7562 40.9763 44.6031 43.3445 43.079 45.4973C42.6947 46.0401 42.3354 46.4997 42.0211 46.8577V51.2452C42.0211 52.8605 42.9337 54.3384 44.3786 55.0596L55.5614 60.6503C56.2324 60.9858 56.8386 61.4097 57.3973 61.8813C64.9388 55.5918 69.8111 46.188 69.992 35.5982C70.3248 16.2716 54.9262 0.335401 35.5982 0.00521191Z" fill="#F4F9FD"/>
            </g>
            <defs>
            <clipPath id="clip0_5173_22703">
            <rect width="70" height="70" fill="white"/>
            </clipPath>
            </defs>
          </svg>
          <span className='text-gray-400' style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '14px', lineHeight: '100%', letterSpacing: '0px', textAlign: 'center' }}>
            {t('crm.crm.realtorCardsGrid.пусто')}</span>
        </div>
      </div>
      <div className='flex flex-col gap-3.75 items-center rounded-lg bg-white h-50 w-62.5 border border-gray-100 pt-5'>
        <div className='flex flex-col items-center gap-3.75'>
          <svg width="70" height="70" viewBox="0 0 70 70" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g clipPath="url(#clip0_5173_22703)">
            <path d="M24.5841 54.879L14.1409 60.5755C13.5281 60.9096 12.9773 61.3204 12.4648 61.7681C18.5535 66.9019 26.4133 69.999 35.0009 69.999C43.525 69.999 51.3347 66.9481 57.4062 61.8843C56.8462 61.4115 56.2386 60.9862 55.565 60.6507L44.3822 55.06C42.9373 54.3375 42.0247 52.8609 42.0247 51.2456V46.8581C42.339 46.5002 42.6982 46.0406 43.0826 45.4977C44.6067 43.3449 45.7598 40.9768 46.5588 38.4924C47.9931 38.05 49.0498 36.7253 49.0498 35.1509V30.4675C49.0498 29.4373 48.5914 28.5168 47.8796 27.8723V21.1021C47.8796 21.1021 49.2703 10.5664 35.0022 10.5664C20.7341 10.5664 22.1248 21.1021 22.1248 21.1021V27.8723C21.4116 28.5168 20.9547 29.4373 20.9547 30.4675V35.1509C20.9547 36.3845 21.6031 37.4702 22.5739 38.0975C23.7441 43.1917 26.8082 46.8581 26.8082 46.8581V51.1374C26.8069 52.6958 25.9537 54.1315 24.5841 54.879Z" fill="#C2D9EB"/>
            <path d="M35.5982 0.00521191C16.2716 -0.324977 0.335404 15.075 0.00521536 34.4016C-0.182332 45.3599 4.70182 55.2088 12.4784 61.7584C12.9869 61.3146 13.5324 60.9079 14.1386 60.5777L24.5818 54.8813C25.9514 54.1337 26.8046 52.698 26.8046 51.1369V46.8577C26.8046 46.8577 23.7392 43.1912 22.5703 38.0971C21.6009 37.4697 20.9511 36.3854 20.9511 35.1505V30.4671C20.9511 29.4369 21.4094 28.5163 22.1213 27.8718V21.1016C22.1213 21.1016 20.7305 10.566 34.9986 10.566C49.2667 10.566 47.876 21.1016 47.876 21.1016V27.8718C48.5892 28.5163 49.0462 29.4369 49.0462 30.4671V35.1505C49.0462 36.7248 47.9896 38.0496 46.5552 38.492C45.7562 40.9763 44.6031 43.3445 43.079 45.4973C42.6947 46.0401 42.3354 46.4997 42.0211 46.8577V51.2452C42.0211 52.8605 42.9337 54.3384 44.3786 55.0596L55.5614 60.6503C56.2324 60.9858 56.8386 61.4097 57.3973 61.8813C64.9388 55.5918 69.8111 46.188 69.992 35.5982C70.3248 16.2716 54.9262 0.335401 35.5982 0.00521191Z" fill="#F4F9FD"/>
            </g>
            <defs>
            <clipPath id="clip0_5173_22703">
            <rect width="70" height="70" fill="white"/>
            </clipPath>
            </defs>
          </svg>
          <span className='text-gray-400' style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '14px', lineHeight: '100%', letterSpacing: '0px', textAlign: 'center' }}>
            {t('crm.crm.realtorCardsGrid.пусто')}</span>
        </div>
      </div>
      <div className='flex flex-col gap-3.75 items-center rounded-lg bg-white h-50 w-62.5 border border-gray-100 pt-5'>
        <div className='flex flex-col items-center gap-3.75'>
          <svg width="70" height="70" viewBox="0 0 70 70" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g clipPath="url(#clip0_5173_22703)">
            <path d="M24.5841 54.879L14.1409 60.5755C13.5281 60.9096 12.9773 61.3204 12.4648 61.7681C18.5535 66.9019 26.4133 69.999 35.0009 69.999C43.525 69.999 51.3347 66.9481 57.4062 61.8843C56.8462 61.4115 56.2386 60.9862 55.565 60.6507L44.3822 55.06C42.9373 54.3375 42.0247 52.8609 42.0247 51.2456V46.8581C42.339 46.5002 42.6982 46.0406 43.0826 45.4977C44.6067 43.3449 45.7598 40.9768 46.5588 38.4924C47.9931 38.05 49.0498 36.7253 49.0498 35.1509V30.4675C49.0498 29.4373 48.5914 28.5168 47.8796 27.8723V21.1021C47.8796 21.1021 49.2703 10.5664 35.0022 10.5664C20.7341 10.5664 22.1248 21.1021 22.1248 21.1021V27.8723C21.4116 28.5168 20.9547 29.4373 20.9547 30.4675V35.1509C20.9547 36.3845 21.6031 37.4702 22.5739 38.0975C23.7441 43.1917 26.8082 46.8581 26.8082 46.8581V51.1374C26.8069 52.6958 25.9537 54.1315 24.5841 54.879Z" fill="#C2D9EB"/>
            <path d="M35.5982 0.00521191C16.2716 -0.324977 0.335404 15.075 0.00521536 34.4016C-0.182332 45.3599 4.70182 55.2088 12.4784 61.7584C12.9869 61.3146 13.5324 60.9079 14.1386 60.5777L24.5818 54.8813C25.9514 54.1337 26.8046 52.698 26.8046 51.1369V46.8577C26.8046 46.8577 23.7392 43.1912 22.5703 38.0971C21.6009 37.4697 20.9511 36.3854 20.9511 35.1505V30.4671C20.9511 29.4369 21.4094 28.5163 22.1213 27.8718V21.1016C22.1213 21.1016 20.7305 10.566 34.9986 10.566C49.2667 10.566 47.876 21.1016 47.876 21.1016V27.8718C48.5892 28.5163 49.0462 29.4369 49.0462 30.4671V35.1505C49.0462 36.7248 47.9896 38.0496 46.5552 38.492C45.7562 40.9763 44.6031 43.3445 43.079 45.4973C42.6947 46.0401 42.3354 46.4997 42.0211 46.8577V51.2452C42.0211 52.8605 42.9337 54.3384 44.3786 55.0596L55.5614 60.6503C56.2324 60.9858 56.8386 61.4097 57.3973 61.8813C64.9388 55.5918 69.8111 46.188 69.992 35.5982C70.3248 16.2716 54.9262 0.335401 35.5982 0.00521191Z" fill="#F4F9FD"/>
            </g>
            <defs>
            <clipPath id="clip0_5173_22703">
            <rect width="70" height="70" fill="white"/>
            </clipPath>
            </defs>
          </svg>
          <span className='text-gray-400' style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '14px', lineHeight: '100%', letterSpacing: '0px', textAlign: 'center' }}>
            {t('crm.crm.realtorCardsGrid.пусто')}</span>
        </div>
      </div>
      <div className='flex flex-col gap-3.75 items-center rounded-lg bg-white h-50 w-62.5 border border-gray-100 pt-5'>
        <div className='flex flex-col items-center gap-3.75'>
          <svg width="70" height="70" viewBox="0 0 70 70" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g clipPath="url(#clip0_5173_22703)">
            <path d="M24.5841 54.879L14.1409 60.5755C13.5281 60.9096 12.9773 61.3204 12.4648 61.7681C18.5535 66.9019 26.4133 69.999 35.0009 69.999C43.525 69.999 51.3347 66.9481 57.4062 61.8843C56.8462 61.4115 56.2386 60.9862 55.565 60.6507L44.3822 55.06C42.9373 54.3375 42.0247 52.8609 42.0247 51.2456V46.8581C42.339 46.5002 42.6982 46.0406 43.0826 45.4977C44.6067 43.3449 45.7598 40.9768 46.5588 38.4924C47.9931 38.05 49.0498 36.7253 49.0498 35.1509V30.4675C49.0498 29.4373 48.5914 28.5168 47.8796 27.8723V21.1021C47.8796 21.1021 49.2703 10.5664 35.0022 10.5664C20.7341 10.5664 22.1248 21.1021 22.1248 21.1021V27.8723C21.4116 28.5168 20.9547 29.4373 20.9547 30.4675V35.1509C20.9547 36.3845 21.6031 37.4702 22.5739 38.0975C23.7441 43.1917 26.8082 46.8581 26.8082 46.8581V51.1374C26.8069 52.6958 25.9537 54.1315 24.5841 54.879Z" fill="#C2D9EB"/>
            <path d="M35.5982 0.00521191C16.2716 -0.324977 0.335404 15.075 0.00521536 34.4016C-0.182332 45.3599 4.70182 55.2088 12.4784 61.7584C12.9869 61.3146 13.5324 60.9079 14.1386 60.5777L24.5818 54.8813C25.9514 54.1337 26.8046 52.698 26.8046 51.1369V46.8577C26.8046 46.8577 23.7392 43.1912 22.5703 38.0971C21.6009 37.4697 20.9511 36.3854 20.9511 35.1505V30.4671C20.9511 29.4369 21.4094 28.5163 22.1213 27.8718V21.1016C22.1213 21.1016 20.7305 10.566 34.9986 10.566C49.2667 10.566 47.876 21.1016 47.876 21.1016V27.8718C48.5892 28.5163 49.0462 29.4369 49.0462 30.4671V35.1505C49.0462 36.7248 47.9896 38.0496 46.5552 38.492C45.7562 40.9763 44.6031 43.3445 43.079 45.4973C42.6947 46.0401 42.3354 46.4997 42.0211 46.8577V51.2452C42.0211 52.8605 42.9337 54.3384 44.3786 55.0596L55.5614 60.6503C56.2324 60.9858 56.8386 61.4097 57.3973 61.8813C64.9388 55.5918 69.8111 46.188 69.992 35.5982C70.3248 16.2716 54.9262 0.335401 35.5982 0.00521191Z" fill="#F4F9FD"/>
            </g>
            <defs>
            <clipPath id="clip0_5173_22703">
            <rect width="70" height="70" fill="white"/>
            </clipPath>
            </defs>
          </svg>
          <span className='text-gray-400' style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '14px', lineHeight: '100%', letterSpacing: '0px', textAlign: 'center' }}>
            {t('crm.crm.realtorCardsGrid.пусто')}</span>
        </div>
      </div>
      <div className='flex flex-col gap-3.75 items-center rounded-lg bg-white h-50 w-62.5 border border-gray-100 pt-5'>
        <div className='flex flex-col items-center gap-3.75'>
          <svg width="70" height="70" viewBox="0 0 70 70" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g clipPath="url(#clip0_5173_22703)">
            <path d="M24.5841 54.879L14.1409 60.5755C13.5281 60.9096 12.9773 61.3204 12.4648 61.7681C18.5535 66.9019 26.4133 69.999 35.0009 69.999C43.525 69.999 51.3347 66.9481 57.4062 61.8843C56.8462 61.4115 56.2386 60.9862 55.565 60.6507L44.3822 55.06C42.9373 54.3375 42.0247 52.8609 42.0247 51.2456V46.8581C42.339 46.5002 42.6982 46.0406 43.0826 45.4977C44.6067 43.3449 45.7598 40.9768 46.5588 38.4924C47.9931 38.05 49.0498 36.7253 49.0498 35.1509V30.4675C49.0498 29.4373 48.5914 28.5168 47.8796 27.8723V21.1021C47.8796 21.1021 49.2703 10.5664 35.0022 10.5664C20.7341 10.5664 22.1248 21.1021 22.1248 21.1021V27.8723C21.4116 28.5168 20.9547 29.4373 20.9547 30.4675V35.1509C20.9547 36.3845 21.6031 37.4702 22.5739 38.0975C23.7441 43.1917 26.8082 46.8581 26.8082 46.8581V51.1374C26.8069 52.6958 25.9537 54.1315 24.5841 54.879Z" fill="#C2D9EB"/>
            <path d="M35.5982 0.00521191C16.2716 -0.324977 0.335404 15.075 0.00521536 34.4016C-0.182332 45.3599 4.70182 55.2088 12.4784 61.7584C12.9869 61.3146 13.5324 60.9079 14.1386 60.5777L24.5818 54.8813C25.9514 54.1337 26.8046 52.698 26.8046 51.1369V46.8577C26.8046 46.8577 23.7392 43.1912 22.5703 38.0971C21.6009 37.4697 20.9511 36.3854 20.9511 35.1505V30.4671C20.9511 29.4369 21.4094 28.5163 22.1213 27.8718V21.1016C22.1213 21.1016 20.7305 10.566 34.9986 10.566C49.2667 10.566 47.876 21.1016 47.876 21.1016V27.8718C48.5892 28.5163 49.0462 29.4369 49.0462 30.4671V35.1505C49.0462 36.7248 47.9896 38.0496 46.5552 38.492C45.7562 40.9763 44.6031 43.3445 43.079 45.4973C42.6947 46.0401 42.3354 46.4997 42.0211 46.8577V51.2452C42.0211 52.8605 42.9337 54.3384 44.3786 55.0596L55.5614 60.6503C56.2324 60.9858 56.8386 61.4097 57.3973 61.8813C64.9388 55.5918 69.8111 46.188 69.992 35.5982C70.3248 16.2716 54.9262 0.335401 35.5982 0.00521191Z" fill="#F4F9FD"/>
            </g>
            <defs>
            <clipPath id="clip0_5173_22703">
            <rect width="70" height="70" fill="white"/>
            </clipPath>
            </defs>
          </svg>
          <span className='text-gray-400' style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '14px', lineHeight: '100%', letterSpacing: '0px', textAlign: 'center' }}>
            {t('crm.crm.realtorCardsGrid.пусто')}</span>
        </div>
      </div>
      <div className='flex flex-col gap-3.75 items-center rounded-lg bg-white h-50 w-62.5 border border-gray-100 pt-5'>
        <div className='flex flex-col items-center gap-3.75'>
          <svg width="70" height="70" viewBox="0 0 70 70" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g clipPath="url(#clip0_5173_22703)">
            <path d="M24.5841 54.879L14.1409 60.5755C13.5281 60.9096 12.9773 61.3204 12.4648 61.7681C18.5535 66.9019 26.4133 69.999 35.0009 69.999C43.525 69.999 51.3347 66.9481 57.4062 61.8843C56.8462 61.4115 56.2386 60.9862 55.565 60.6507L44.3822 55.06C42.9373 54.3375 42.0247 52.8609 42.0247 51.2456V46.8581C42.339 46.5002 42.6982 46.0406 43.0826 45.4977C44.6067 43.3449 45.7598 40.9768 46.5588 38.4924C47.9931 38.05 49.0498 36.7253 49.0498 35.1509V30.4675C49.0498 29.4373 48.5914 28.5168 47.8796 27.8723V21.1021C47.8796 21.1021 49.2703 10.5664 35.0022 10.5664C20.7341 10.5664 22.1248 21.1021 22.1248 21.1021V27.8723C21.4116 28.5168 20.9547 29.4373 20.9547 30.4675V35.1509C20.9547 36.3845 21.6031 37.4702 22.5739 38.0975C23.7441 43.1917 26.8082 46.8581 26.8082 46.8581V51.1374C26.8069 52.6958 25.9537 54.1315 24.5841 54.879Z" fill="#C2D9EB"/>
            <path d="M35.5982 0.00521191C16.2716 -0.324977 0.335404 15.075 0.00521536 34.4016C-0.182332 45.3599 4.70182 55.2088 12.4784 61.7584C12.9869 61.3146 13.5324 60.9079 14.1386 60.5777L24.5818 54.8813C25.9514 54.1337 26.8046 52.698 26.8046 51.1369V46.8577C26.8046 46.8577 23.7392 43.1912 22.5703 38.0971C21.6009 37.4697 20.9511 36.3854 20.9511 35.1505V30.4671C20.9511 29.4369 21.4094 28.5163 22.1213 27.8718V21.1016C22.1213 21.1016 20.7305 10.566 34.9986 10.566C49.2667 10.566 47.876 21.1016 47.876 21.1016V27.8718C48.5892 28.5163 49.0462 29.4369 49.0462 30.4671V35.1505C49.0462 36.7248 47.9896 38.0496 46.5552 38.492C45.7562 40.9763 44.6031 43.3445 43.079 45.4973C42.6947 46.0401 42.3354 46.4997 42.0211 46.8577V51.2452C42.0211 52.8605 42.9337 54.3384 44.3786 55.0596L55.5614 60.6503C56.2324 60.9858 56.8386 61.4097 57.3973 61.8813C64.9388 55.5918 69.8111 46.188 69.992 35.5982C70.3248 16.2716 54.9262 0.335401 35.5982 0.00521191Z" fill="#F4F9FD"/>
            </g>
            <defs>
            <clipPath id="clip0_5173_22703">
            <rect width="70" height="70" fill="white"/>
            </clipPath>
            </defs>
          </svg>
          <span className='text-gray-400' style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '14px', lineHeight: '100%', letterSpacing: '0px', textAlign: 'center' }}>
            {t('crm.crm.realtorCardsGrid.пусто')}</span>
        </div>
      </div>
      <div className='flex flex-col gap-3.75 items-center rounded-lg bg-white h-50 w-62.5 border border-gray-100 pt-5'>
        <div className='flex flex-col items-center gap-3.75'>
          <svg width="70" height="70" viewBox="0 0 70 70" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g clipPath="url(#clip0_5173_22703)">
            <path d="M24.5841 54.879L14.1409 60.5755C13.5281 60.9096 12.9773 61.3204 12.4648 61.7681C18.5535 66.9019 26.4133 69.999 35.0009 69.999C43.525 69.999 51.3347 66.9481 57.4062 61.8843C56.8462 61.4115 56.2386 60.9862 55.565 60.6507L44.3822 55.06C42.9373 54.3375 42.0247 52.8609 42.0247 51.2456V46.8581C42.339 46.5002 42.6982 46.0406 43.0826 45.4977C44.6067 43.3449 45.7598 40.9768 46.5588 38.4924C47.9931 38.05 49.0498 36.7253 49.0498 35.1509V30.4675C49.0498 29.4373 48.5914 28.5168 47.8796 27.8723V21.1021C47.8796 21.1021 49.2703 10.5664 35.0022 10.5664C20.7341 10.5664 22.1248 21.1021 22.1248 21.1021V27.8723C21.4116 28.5168 20.9547 29.4373 20.9547 30.4675V35.1509C20.9547 36.3845 21.6031 37.4702 22.5739 38.0975C23.7441 43.1917 26.8082 46.8581 26.8082 46.8581V51.1374C26.8069 52.6958 25.9537 54.1315 24.5841 54.879Z" fill="#C2D9EB"/>
            <path d="M35.5982 0.00521191C16.2716 -0.324977 0.335404 15.075 0.00521536 34.4016C-0.182332 45.3599 4.70182 55.2088 12.4784 61.7584C12.9869 61.3146 13.5324 60.9079 14.1386 60.5777L24.5818 54.8813C25.9514 54.1337 26.8046 52.698 26.8046 51.1369V46.8577C26.8046 46.8577 23.7392 43.1912 22.5703 38.0971C21.6009 37.4697 20.9511 36.3854 20.9511 35.1505V30.4671C20.9511 29.4369 21.4094 28.5163 22.1213 27.8718V21.1016C22.1213 21.1016 20.7305 10.566 34.9986 10.566C49.2667 10.566 47.876 21.1016 47.876 21.1016V27.8718C48.5892 28.5163 49.0462 29.4369 49.0462 30.4671V35.1505C49.0462 36.7248 47.9896 38.0496 46.5552 38.492C45.7562 40.9763 44.6031 43.3445 43.079 45.4973C42.6947 46.0401 42.3354 46.4997 42.0211 46.8577V51.2452C42.0211 52.8605 42.9337 54.3384 44.3786 55.0596L55.5614 60.6503C56.2324 60.9858 56.8386 61.4097 57.3973 61.8813C64.9388 55.5918 69.8111 46.188 69.992 35.5982C70.3248 16.2716 54.9262 0.335401 35.5982 0.00521191Z" fill="#F4F9FD"/>
            </g>
            <defs>
            <clipPath id="clip0_5173_22703">
            <rect width="70" height="70" fill="white"/>
            </clipPath>
            </defs>
          </svg>
          <span className='text-gray-400' style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '14px', lineHeight: '100%', letterSpacing: '0px', textAlign: 'center' }}>
            {t('crm.crm.realtorCardsGrid.пусто')}</span>
        </div>
      </div>
      <div className='flex flex-col gap-3.75 items-center rounded-lg bg-white h-50 w-62.5 border border-gray-100 pt-5'>
        <div className='flex flex-col items-center gap-3.75'>
          <svg width="70" height="70" viewBox="0 0 70 70" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g clipPath="url(#clip0_5173_22703)">
            <path d="M24.5841 54.879L14.1409 60.5755C13.5281 60.9096 12.9773 61.3204 12.4648 61.7681C18.5535 66.9019 26.4133 69.999 35.0009 69.999C43.525 69.999 51.3347 66.9481 57.4062 61.8843C56.8462 61.4115 56.2386 60.9862 55.565 60.6507L44.3822 55.06C42.9373 54.3375 42.0247 52.8609 42.0247 51.2456V46.8581C42.339 46.5002 42.6982 46.0406 43.0826 45.4977C44.6067 43.3449 45.7598 40.9768 46.5588 38.4924C47.9931 38.05 49.0498 36.7253 49.0498 35.1509V30.4675C49.0498 29.4373 48.5914 28.5168 47.8796 27.8723V21.1021C47.8796 21.1021 49.2703 10.5664 35.0022 10.5664C20.7341 10.5664 22.1248 21.1021 22.1248 21.1021V27.8723C21.4116 28.5168 20.9547 29.4373 20.9547 30.4675V35.1509C20.9547 36.3845 21.6031 37.4702 22.5739 38.0975C23.7441 43.1917 26.8082 46.8581 26.8082 46.8581V51.1374C26.8069 52.6958 25.9537 54.1315 24.5841 54.879Z" fill="#C2D9EB"/>
            <path d="M35.5982 0.00521191C16.2716 -0.324977 0.335404 15.075 0.00521536 34.4016C-0.182332 45.3599 4.70182 55.2088 12.4784 61.7584C12.9869 61.3146 13.5324 60.9079 14.1386 60.5777L24.5818 54.8813C25.9514 54.1337 26.8046 52.698 26.8046 51.1369V46.8577C26.8046 46.8577 23.7392 43.1912 22.5703 38.0971C21.6009 37.4697 20.9511 36.3854 20.9511 35.1505V30.4671C20.9511 29.4369 21.4094 28.5163 22.1213 27.8718V21.1016C22.1213 21.1016 20.7305 10.566 34.9986 10.566C49.2667 10.566 47.876 21.1016 47.876 21.1016V27.8718C48.5892 28.5163 49.0462 29.4369 49.0462 30.4671V35.1505C49.0462 36.7248 47.9896 38.0496 46.5552 38.492C45.7562 40.9763 44.6031 43.3445 43.079 45.4973C42.6947 46.0401 42.3354 46.4997 42.0211 46.8577V51.2452C42.0211 52.8605 42.9337 54.3384 44.3786 55.0596L55.5614 60.6503C56.2324 60.9858 56.8386 61.4097 57.3973 61.8813C64.9388 55.5918 69.8111 46.188 69.992 35.5982C70.3248 16.2716 54.9262 0.335401 35.5982 0.00521191Z" fill="#F4F9FD"/>
            </g>
            <defs>
            <clipPath id="clip0_5173_22703">
            <rect width="70" height="70" fill="white"/>
            </clipPath>
            </defs>
          </svg>
          <span className='text-gray-400' style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '14px', lineHeight: '100%', letterSpacing: '0px', textAlign: 'center' }}>
            {t('crm.crm.realtorCardsGrid.пусто')}</span>
        </div>
      </div>
      <div className='flex flex-col gap-3.75 items-center rounded-lg bg-white h-50 w-62.5 border border-gray-100 pt-5'>
        <div className='flex flex-col items-center gap-3.75'>
          <svg width="70" height="70" viewBox="0 0 70 70" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g clipPath="url(#clip0_5173_22703)">
            <path d="M24.5841 54.879L14.1409 60.5755C13.5281 60.9096 12.9773 61.3204 12.4648 61.7681C18.5535 66.9019 26.4133 69.999 35.0009 69.999C43.525 69.999 51.3347 66.9481 57.4062 61.8843C56.8462 61.4115 56.2386 60.9862 55.565 60.6507L44.3822 55.06C42.9373 54.3375 42.0247 52.8609 42.0247 51.2456V46.8581C42.339 46.5002 42.6982 46.0406 43.0826 45.4977C44.6067 43.3449 45.7598 40.9768 46.5588 38.4924C47.9931 38.05 49.0498 36.7253 49.0498 35.1509V30.4675C49.0498 29.4373 48.5914 28.5168 47.8796 27.8723V21.1021C47.8796 21.1021 49.2703 10.5664 35.0022 10.5664C20.7341 10.5664 22.1248 21.1021 22.1248 21.1021V27.8723C21.4116 28.5168 20.9547 29.4373 20.9547 30.4675V35.1509C20.9547 36.3845 21.6031 37.4702 22.5739 38.0975C23.7441 43.1917 26.8082 46.8581 26.8082 46.8581V51.1374C26.8069 52.6958 25.9537 54.1315 24.5841 54.879Z" fill="#C2D9EB"/>
            <path d="M35.5982 0.00521191C16.2716 -0.324977 0.335404 15.075 0.00521536 34.4016C-0.182332 45.3599 4.70182 55.2088 12.4784 61.7584C12.9869 61.3146 13.5324 60.9079 14.1386 60.5777L24.5818 54.8813C25.9514 54.1337 26.8046 52.698 26.8046 51.1369V46.8577C26.8046 46.8577 23.7392 43.1912 22.5703 38.0971C21.6009 37.4697 20.9511 36.3854 20.9511 35.1505V30.4671C20.9511 29.4369 21.4094 28.5163 22.1213 27.8718V21.1016C22.1213 21.1016 20.7305 10.566 34.9986 10.566C49.2667 10.566 47.876 21.1016 47.876 21.1016V27.8718C48.5892 28.5163 49.0462 29.4369 49.0462 30.4671V35.1505C49.0462 36.7248 47.9896 38.0496 46.5552 38.492C45.7562 40.9763 44.6031 43.3445 43.079 45.4973C42.6947 46.0401 42.3354 46.4997 42.0211 46.8577V51.2452C42.0211 52.8605 42.9337 54.3384 44.3786 55.0596L55.5614 60.6503C56.2324 60.9858 56.8386 61.4097 57.3973 61.8813C64.9388 55.5918 69.8111 46.188 69.992 35.5982C70.3248 16.2716 54.9262 0.335401 35.5982 0.00521191Z" fill="#F4F9FD"/>
            </g>
            <defs>
            <clipPath id="clip0_5173_22703">
            <rect width="70" height="70" fill="white"/>
            </clipPath>
            </defs>
          </svg>
          <span className='text-gray-400' style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '14px', lineHeight: '100%', letterSpacing: '0px', textAlign: 'center' }}>
            {t('crm.crm.realtorCardsGrid.пусто')}</span>
        </div>
      </div>
      <div className='flex flex-col gap-3.75 items-center rounded-lg bg-white h-50 w-62.5 border border-gray-100 pt-5'>
        <div className='flex flex-col items-center gap-3.75'>
          <svg width="70" height="70" viewBox="0 0 70 70" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g clipPath="url(#clip0_5173_22703)">
            <path d="M24.5841 54.879L14.1409 60.5755C13.5281 60.9096 12.9773 61.3204 12.4648 61.7681C18.5535 66.9019 26.4133 69.999 35.0009 69.999C43.525 69.999 51.3347 66.9481 57.4062 61.8843C56.8462 61.4115 56.2386 60.9862 55.565 60.6507L44.3822 55.06C42.9373 54.3375 42.0247 52.8609 42.0247 51.2456V46.8581C42.339 46.5002 42.6982 46.0406 43.0826 45.4977C44.6067 43.3449 45.7598 40.9768 46.5588 38.4924C47.9931 38.05 49.0498 36.7253 49.0498 35.1509V30.4675C49.0498 29.4373 48.5914 28.5168 47.8796 27.8723V21.1021C47.8796 21.1021 49.2703 10.5664 35.0022 10.5664C20.7341 10.5664 22.1248 21.1021 22.1248 21.1021V27.8723C21.4116 28.5168 20.9547 29.4373 20.9547 30.4675V35.1509C20.9547 36.3845 21.6031 37.4702 22.5739 38.0975C23.7441 43.1917 26.8082 46.8581 26.8082 46.8581V51.1374C26.8069 52.6958 25.9537 54.1315 24.5841 54.879Z" fill="#C2D9EB"/>
            <path d="M35.5982 0.00521191C16.2716 -0.324977 0.335404 15.075 0.00521536 34.4016C-0.182332 45.3599 4.70182 55.2088 12.4784 61.7584C12.9869 61.3146 13.5324 60.9079 14.1386 60.5777L24.5818 54.8813C25.9514 54.1337 26.8046 52.698 26.8046 51.1369V46.8577C26.8046 46.8577 23.7392 43.1912 22.5703 38.0971C21.6009 37.4697 20.9511 36.3854 20.9511 35.1505V30.4671C20.9511 29.4369 21.4094 28.5163 22.1213 27.8718V21.1016C22.1213 21.1016 20.7305 10.566 34.9986 10.566C49.2667 10.566 47.876 21.1016 47.876 21.1016V27.8718C48.5892 28.5163 49.0462 29.4369 49.0462 30.4671V35.1505C49.0462 36.7248 47.9896 38.0496 46.5552 38.492C45.7562 40.9763 44.6031 43.3445 43.079 45.4973C42.6947 46.0401 42.3354 46.4997 42.0211 46.8577V51.2452C42.0211 52.8605 42.9337 54.3384 44.3786 55.0596L55.5614 60.6503C56.2324 60.9858 56.8386 61.4097 57.3973 61.8813C64.9388 55.5918 69.8111 46.188 69.992 35.5982C70.3248 16.2716 54.9262 0.335401 35.5982 0.00521191Z" fill="#F4F9FD"/>
            </g>
            <defs>
            <clipPath id="clip0_5173_22703">
            <rect width="70" height="70" fill="white"/>
            </clipPath>
            </defs>
          </svg>
          <span className='text-gray-400' style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '14px', lineHeight: '100%', letterSpacing: '0px', textAlign: 'center' }}>
            {t('crm.crm.realtorCardsGrid.пусто')}</span>
        </div>
      </div>
      <div className='flex flex-col gap-3.75 items-center rounded-lg bg-white h-50 w-62.5 border border-gray-100 pt-5'>
        <div className='flex flex-col items-center gap-3.75'>
          <svg width="70" height="70" viewBox="0 0 70 70" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g clipPath="url(#clip0_5173_22703)">
            <path d="M24.5841 54.879L14.1409 60.5755C13.5281 60.9096 12.9773 61.3204 12.4648 61.7681C18.5535 66.9019 26.4133 69.999 35.0009 69.999C43.525 69.999 51.3347 66.9481 57.4062 61.8843C56.8462 61.4115 56.2386 60.9862 55.565 60.6507L44.3822 55.06C42.9373 54.3375 42.0247 52.8609 42.0247 51.2456V46.8581C42.339 46.5002 42.6982 46.0406 43.0826 45.4977C44.6067 43.3449 45.7598 40.9768 46.5588 38.4924C47.9931 38.05 49.0498 36.7253 49.0498 35.1509V30.4675C49.0498 29.4373 48.5914 28.5168 47.8796 27.8723V21.1021C47.8796 21.1021 49.2703 10.5664 35.0022 10.5664C20.7341 10.5664 22.1248 21.1021 22.1248 21.1021V27.8723C21.4116 28.5168 20.9547 29.4373 20.9547 30.4675V35.1509C20.9547 36.3845 21.6031 37.4702 22.5739 38.0975C23.7441 43.1917 26.8082 46.8581 26.8082 46.8581V51.1374C26.8069 52.6958 25.9537 54.1315 24.5841 54.879Z" fill="#C2D9EB"/>
            <path d="M35.5982 0.00521191C16.2716 -0.324977 0.335404 15.075 0.00521536 34.4016C-0.182332 45.3599 4.70182 55.2088 12.4784 61.7584C12.9869 61.3146 13.5324 60.9079 14.1386 60.5777L24.5818 54.8813C25.9514 54.1337 26.8046 52.698 26.8046 51.1369V46.8577C26.8046 46.8577 23.7392 43.1912 22.5703 38.0971C21.6009 37.4697 20.9511 36.3854 20.9511 35.1505V30.4671C20.9511 29.4369 21.4094 28.5163 22.1213 27.8718V21.1016C22.1213 21.1016 20.7305 10.566 34.9986 10.566C49.2667 10.566 47.876 21.1016 47.876 21.1016V27.8718C48.5892 28.5163 49.0462 29.4369 49.0462 30.4671V35.1505C49.0462 36.7248 47.9896 38.0496 46.5552 38.492C45.7562 40.9763 44.6031 43.3445 43.079 45.4973C42.6947 46.0401 42.3354 46.4997 42.0211 46.8577V51.2452C42.0211 52.8605 42.9337 54.3384 44.3786 55.0596L55.5614 60.6503C56.2324 60.9858 56.8386 61.4097 57.3973 61.8813C64.9388 55.5918 69.8111 46.188 69.992 35.5982C70.3248 16.2716 54.9262 0.335401 35.5982 0.00521191Z" fill="#F4F9FD"/>
            </g>
            <defs>
            <clipPath id="clip0_5173_22703">
            <rect width="70" height="70" fill="white"/>
            </clipPath>
            </defs>
          </svg>
          <span className='text-gray-400' style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '14px', lineHeight: '100%', letterSpacing: '0px', textAlign: 'center' }}>
            {t('crm.crm.realtorCardsGrid.пусто')}</span>
        </div>
      </div>
      <div className='flex flex-col gap-3.75 items-center rounded-lg bg-white h-50 w-62.5 border border-gray-100 pt-5'>
        <div className='flex flex-col items-center gap-3.75'>
          <svg width="70" height="70" viewBox="0 0 70 70" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g clipPath="url(#clip0_5173_22703)">
            <path d="M24.5841 54.879L14.1409 60.5755C13.5281 60.9096 12.9773 61.3204 12.4648 61.7681C18.5535 66.9019 26.4133 69.999 35.0009 69.999C43.525 69.999 51.3347 66.9481 57.4062 61.8843C56.8462 61.4115 56.2386 60.9862 55.565 60.6507L44.3822 55.06C42.9373 54.3375 42.0247 52.8609 42.0247 51.2456V46.8581C42.339 46.5002 42.6982 46.0406 43.0826 45.4977C44.6067 43.3449 45.7598 40.9768 46.5588 38.4924C47.9931 38.05 49.0498 36.7253 49.0498 35.1509V30.4675C49.0498 29.4373 48.5914 28.5168 47.8796 27.8723V21.1021C47.8796 21.1021 49.2703 10.5664 35.0022 10.5664C20.7341 10.5664 22.1248 21.1021 22.1248 21.1021V27.8723C21.4116 28.5168 20.9547 29.4373 20.9547 30.4675V35.1509C20.9547 36.3845 21.6031 37.4702 22.5739 38.0975C23.7441 43.1917 26.8082 46.8581 26.8082 46.8581V51.1374C26.8069 52.6958 25.9537 54.1315 24.5841 54.879Z" fill="#C2D9EB"/>
            <path d="M35.5982 0.00521191C16.2716 -0.324977 0.335404 15.075 0.00521536 34.4016C-0.182332 45.3599 4.70182 55.2088 12.4784 61.7584C12.9869 61.3146 13.5324 60.9079 14.1386 60.5777L24.5818 54.8813C25.9514 54.1337 26.8046 52.698 26.8046 51.1369V46.8577C26.8046 46.8577 23.7392 43.1912 22.5703 38.0971C21.6009 37.4697 20.9511 36.3854 20.9511 35.1505V30.4671C20.9511 29.4369 21.4094 28.5163 22.1213 27.8718V21.1016C22.1213 21.1016 20.7305 10.566 34.9986 10.566C49.2667 10.566 47.876 21.1016 47.876 21.1016V27.8718C48.5892 28.5163 49.0462 29.4369 49.0462 30.4671V35.1505C49.0462 36.7248 47.9896 38.0496 46.5552 38.492C45.7562 40.9763 44.6031 43.3445 43.079 45.4973C42.6947 46.0401 42.3354 46.4997 42.0211 46.8577V51.2452C42.0211 52.8605 42.9337 54.3384 44.3786 55.0596L55.5614 60.6503C56.2324 60.9858 56.8386 61.4097 57.3973 61.8813C64.9388 55.5918 69.8111 46.188 69.992 35.5982C70.3248 16.2716 54.9262 0.335401 35.5982 0.00521191Z" fill="#F4F9FD"/>
            </g>
            <defs>
            <clipPath id="clip0_5173_22703">
            <rect width="70" height="70" fill="white"/>
            </clipPath>
            </defs>
          </svg>
          <span className='text-gray-400' style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '14px', lineHeight: '100%', letterSpacing: '0px', textAlign: 'center' }}>
            {t('crm.crm.realtorCardsGrid.пусто')}</span>
        </div>
      </div>
      <div className='flex flex-col gap-3.75 items-center rounded-lg bg-white h-50 w-62.5 border border-gray-100 pt-5'>
        <div className='flex flex-col items-center gap-3.75'>
          <svg width="70" height="70" viewBox="0 0 70 70" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g clipPath="url(#clip0_5173_22703)">
            <path d="M24.5841 54.879L14.1409 60.5755C13.5281 60.9096 12.9773 61.3204 12.4648 61.7681C18.5535 66.9019 26.4133 69.999 35.0009 69.999C43.525 69.999 51.3347 66.9481 57.4062 61.8843C56.8462 61.4115 56.2386 60.9862 55.565 60.6507L44.3822 55.06C42.9373 54.3375 42.0247 52.8609 42.0247 51.2456V46.8581C42.339 46.5002 42.6982 46.0406 43.0826 45.4977C44.6067 43.3449 45.7598 40.9768 46.5588 38.4924C47.9931 38.05 49.0498 36.7253 49.0498 35.1509V30.4675C49.0498 29.4373 48.5914 28.5168 47.8796 27.8723V21.1021C47.8796 21.1021 49.2703 10.5664 35.0022 10.5664C20.7341 10.5664 22.1248 21.1021 22.1248 21.1021V27.8723C21.4116 28.5168 20.9547 29.4373 20.9547 30.4675V35.1509C20.9547 36.3845 21.6031 37.4702 22.5739 38.0975C23.7441 43.1917 26.8082 46.8581 26.8082 46.8581V51.1374C26.8069 52.6958 25.9537 54.1315 24.5841 54.879Z" fill="#C2D9EB"/>
            <path d="M35.5982 0.00521191C16.2716 -0.324977 0.335404 15.075 0.00521536 34.4016C-0.182332 45.3599 4.70182 55.2088 12.4784 61.7584C12.9869 61.3146 13.5324 60.9079 14.1386 60.5777L24.5818 54.8813C25.9514 54.1337 26.8046 52.698 26.8046 51.1369V46.8577C26.8046 46.8577 23.7392 43.1912 22.5703 38.0971C21.6009 37.4697 20.9511 36.3854 20.9511 35.1505V30.4671C20.9511 29.4369 21.4094 28.5163 22.1213 27.8718V21.1016C22.1213 21.1016 20.7305 10.566 34.9986 10.566C49.2667 10.566 47.876 21.1016 47.876 21.1016V27.8718C48.5892 28.5163 49.0462 29.4369 49.0462 30.4671V35.1505C49.0462 36.7248 47.9896 38.0496 46.5552 38.492C45.7562 40.9763 44.6031 43.3445 43.079 45.4973C42.6947 46.0401 42.3354 46.4997 42.0211 46.8577V51.2452C42.0211 52.8605 42.9337 54.3384 44.3786 55.0596L55.5614 60.6503C56.2324 60.9858 56.8386 61.4097 57.3973 61.8813C64.9388 55.5918 69.8111 46.188 69.992 35.5982C70.3248 16.2716 54.9262 0.335401 35.5982 0.00521191Z" fill="#F4F9FD"/>
            </g>
            <defs>
            <clipPath id="clip0_5173_22703">
            <rect width="70" height="70" fill="white"/>
            </clipPath>
            </defs>
          </svg>
          <span className='text-gray-400' style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '14px', lineHeight: '100%', letterSpacing: '0px', textAlign: 'center' }}>
            {t('crm.crm.realtorCardsGrid.пусто')}</span>
        </div>
      </div><div className='flex flex-col gap-3.75 items-center rounded-lg bg-white h-50 w-62.5 border border-gray-100 pt-5'>
        <div className='flex flex-col items-center gap-3.75'>
          <svg width="70" height="70" viewBox="0 0 70 70" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g clipPath="url(#clip0_5173_22703)">
            <path d="M24.5841 54.879L14.1409 60.5755C13.5281 60.9096 12.9773 61.3204 12.4648 61.7681C18.5535 66.9019 26.4133 69.999 35.0009 69.999C43.525 69.999 51.3347 66.9481 57.4062 61.8843C56.8462 61.4115 56.2386 60.9862 55.565 60.6507L44.3822 55.06C42.9373 54.3375 42.0247 52.8609 42.0247 51.2456V46.8581C42.339 46.5002 42.6982 46.0406 43.0826 45.4977C44.6067 43.3449 45.7598 40.9768 46.5588 38.4924C47.9931 38.05 49.0498 36.7253 49.0498 35.1509V30.4675C49.0498 29.4373 48.5914 28.5168 47.8796 27.8723V21.1021C47.8796 21.1021 49.2703 10.5664 35.0022 10.5664C20.7341 10.5664 22.1248 21.1021 22.1248 21.1021V27.8723C21.4116 28.5168 20.9547 29.4373 20.9547 30.4675V35.1509C20.9547 36.3845 21.6031 37.4702 22.5739 38.0975C23.7441 43.1917 26.8082 46.8581 26.8082 46.8581V51.1374C26.8069 52.6958 25.9537 54.1315 24.5841 54.879Z" fill="#C2D9EB"/>
            <path d="M35.5982 0.00521191C16.2716 -0.324977 0.335404 15.075 0.00521536 34.4016C-0.182332 45.3599 4.70182 55.2088 12.4784 61.7584C12.9869 61.3146 13.5324 60.9079 14.1386 60.5777L24.5818 54.8813C25.9514 54.1337 26.8046 52.698 26.8046 51.1369V46.8577C26.8046 46.8577 23.7392 43.1912 22.5703 38.0971C21.6009 37.4697 20.9511 36.3854 20.9511 35.1505V30.4671C20.9511 29.4369 21.4094 28.5163 22.1213 27.8718V21.1016C22.1213 21.1016 20.7305 10.566 34.9986 10.566C49.2667 10.566 47.876 21.1016 47.876 21.1016V27.8718C48.5892 28.5163 49.0462 29.4369 49.0462 30.4671V35.1505C49.0462 36.7248 47.9896 38.0496 46.5552 38.492C45.7562 40.9763 44.6031 43.3445 43.079 45.4973C42.6947 46.0401 42.3354 46.4997 42.0211 46.8577V51.2452C42.0211 52.8605 42.9337 54.3384 44.3786 55.0596L55.5614 60.6503C56.2324 60.9858 56.8386 61.4097 57.3973 61.8813C64.9388 55.5918 69.8111 46.188 69.992 35.5982C70.3248 16.2716 54.9262 0.335401 35.5982 0.00521191Z" fill="#F4F9FD"/>
            </g>
            <defs>
            <clipPath id="clip0_5173_22703">
            <rect width="70" height="70" fill="white"/>
            </clipPath>
            </defs>
          </svg>
          <span className='text-gray-400' style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '14px', lineHeight: '100%', letterSpacing: '0px', textAlign: 'center' }}>
            {t('crm.crm.realtorCardsGrid.пусто')}</span>
        </div>
      </div><div className='flex flex-col gap-3.75 items-center rounded-lg bg-white h-50 w-62.5 border border-gray-100 pt-5'>
        <div className='flex flex-col items-center gap-3.75'>
          <svg width="70" height="70" viewBox="0 0 70 70" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g clipPath="url(#clip0_5173_22703)">
            <path d="M24.5841 54.879L14.1409 60.5755C13.5281 60.9096 12.9773 61.3204 12.4648 61.7681C18.5535 66.9019 26.4133 69.999 35.0009 69.999C43.525 69.999 51.3347 66.9481 57.4062 61.8843C56.8462 61.4115 56.2386 60.9862 55.565 60.6507L44.3822 55.06C42.9373 54.3375 42.0247 52.8609 42.0247 51.2456V46.8581C42.339 46.5002 42.6982 46.0406 43.0826 45.4977C44.6067 43.3449 45.7598 40.9768 46.5588 38.4924C47.9931 38.05 49.0498 36.7253 49.0498 35.1509V30.4675C49.0498 29.4373 48.5914 28.5168 47.8796 27.8723V21.1021C47.8796 21.1021 49.2703 10.5664 35.0022 10.5664C20.7341 10.5664 22.1248 21.1021 22.1248 21.1021V27.8723C21.4116 28.5168 20.9547 29.4373 20.9547 30.4675V35.1509C20.9547 36.3845 21.6031 37.4702 22.5739 38.0975C23.7441 43.1917 26.8082 46.8581 26.8082 46.8581V51.1374C26.8069 52.6958 25.9537 54.1315 24.5841 54.879Z" fill="#C2D9EB"/>
            <path d="M35.5982 0.00521191C16.2716 -0.324977 0.335404 15.075 0.00521536 34.4016C-0.182332 45.3599 4.70182 55.2088 12.4784 61.7584C12.9869 61.3146 13.5324 60.9079 14.1386 60.5777L24.5818 54.8813C25.9514 54.1337 26.8046 52.698 26.8046 51.1369V46.8577C26.8046 46.8577 23.7392 43.1912 22.5703 38.0971C21.6009 37.4697 20.9511 36.3854 20.9511 35.1505V30.4671C20.9511 29.4369 21.4094 28.5163 22.1213 27.8718V21.1016C22.1213 21.1016 20.7305 10.566 34.9986 10.566C49.2667 10.566 47.876 21.1016 47.876 21.1016V27.8718C48.5892 28.5163 49.0462 29.4369 49.0462 30.4671V35.1505C49.0462 36.7248 47.9896 38.0496 46.5552 38.492C45.7562 40.9763 44.6031 43.3445 43.079 45.4973C42.6947 46.0401 42.3354 46.4997 42.0211 46.8577V51.2452C42.0211 52.8605 42.9337 54.3384 44.3786 55.0596L55.5614 60.6503C56.2324 60.9858 56.8386 61.4097 57.3973 61.8813C64.9388 55.5918 69.8111 46.188 69.992 35.5982C70.3248 16.2716 54.9262 0.335401 35.5982 0.00521191Z" fill="#F4F9FD"/>
            </g>
            <defs>
            <clipPath id="clip0_5173_22703">
            <rect width="70" height="70" fill="white"/>
            </clipPath>
            </defs>
          </svg>
          <span className='text-gray-400' style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '14px', lineHeight: '100%', letterSpacing: '0px', textAlign: 'center' }}>
            {t('crm.crm.realtorCardsGrid.пусто')}</span>
        </div>
      </div><div className='flex flex-col gap-3.75 items-center rounded-lg bg-white h-50 w-62.5 border border-gray-100 pt-5'>
        <div className='flex flex-col items-center gap-3.75'>
          <svg width="70" height="70" viewBox="0 0 70 70" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g clipPath="url(#clip0_5173_22703)">
            <path d="M24.5841 54.879L14.1409 60.5755C13.5281 60.9096 12.9773 61.3204 12.4648 61.7681C18.5535 66.9019 26.4133 69.999 35.0009 69.999C43.525 69.999 51.3347 66.9481 57.4062 61.8843C56.8462 61.4115 56.2386 60.9862 55.565 60.6507L44.3822 55.06C42.9373 54.3375 42.0247 52.8609 42.0247 51.2456V46.8581C42.339 46.5002 42.6982 46.0406 43.0826 45.4977C44.6067 43.3449 45.7598 40.9768 46.5588 38.4924C47.9931 38.05 49.0498 36.7253 49.0498 35.1509V30.4675C49.0498 29.4373 48.5914 28.5168 47.8796 27.8723V21.1021C47.8796 21.1021 49.2703 10.5664 35.0022 10.5664C20.7341 10.5664 22.1248 21.1021 22.1248 21.1021V27.8723C21.4116 28.5168 20.9547 29.4373 20.9547 30.4675V35.1509C20.9547 36.3845 21.6031 37.4702 22.5739 38.0975C23.7441 43.1917 26.8082 46.8581 26.8082 46.8581V51.1374C26.8069 52.6958 25.9537 54.1315 24.5841 54.879Z" fill="#C2D9EB"/>
            <path d="M35.5982 0.00521191C16.2716 -0.324977 0.335404 15.075 0.00521536 34.4016C-0.182332 45.3599 4.70182 55.2088 12.4784 61.7584C12.9869 61.3146 13.5324 60.9079 14.1386 60.5777L24.5818 54.8813C25.9514 54.1337 26.8046 52.698 26.8046 51.1369V46.8577C26.8046 46.8577 23.7392 43.1912 22.5703 38.0971C21.6009 37.4697 20.9511 36.3854 20.9511 35.1505V30.4671C20.9511 29.4369 21.4094 28.5163 22.1213 27.8718V21.1016C22.1213 21.1016 20.7305 10.566 34.9986 10.566C49.2667 10.566 47.876 21.1016 47.876 21.1016V27.8718C48.5892 28.5163 49.0462 29.4369 49.0462 30.4671V35.1505C49.0462 36.7248 47.9896 38.0496 46.5552 38.492C45.7562 40.9763 44.6031 43.3445 43.079 45.4973C42.6947 46.0401 42.3354 46.4997 42.0211 46.8577V51.2452C42.0211 52.8605 42.9337 54.3384 44.3786 55.0596L55.5614 60.6503C56.2324 60.9858 56.8386 61.4097 57.3973 61.8813C64.9388 55.5918 69.8111 46.188 69.992 35.5982C70.3248 16.2716 54.9262 0.335401 35.5982 0.00521191Z" fill="#F4F9FD"/>
            </g>
            <defs>
            <clipPath id="clip0_5173_22703">
            <rect width="70" height="70" fill="white"/>
            </clipPath>
            </defs>
          </svg>
          <span className='text-gray-400' style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '14px', lineHeight: '100%', letterSpacing: '0px', textAlign: 'center' }}>
            {t('crm.crm.realtorCardsGrid.пусто')}</span>
        </div>
      </div><div className='flex flex-col gap-3.75 items-center rounded-lg bg-white h-50 w-62.5 border border-gray-100 pt-5'>
        <div className='flex flex-col items-center gap-3.75'>
          <svg width="70" height="70" viewBox="0 0 70 70" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g clipPath="url(#clip0_5173_22703)">
            <path d="M24.5841 54.879L14.1409 60.5755C13.5281 60.9096 12.9773 61.3204 12.4648 61.7681C18.5535 66.9019 26.4133 69.999 35.0009 69.999C43.525 69.999 51.3347 66.9481 57.4062 61.8843C56.8462 61.4115 56.2386 60.9862 55.565 60.6507L44.3822 55.06C42.9373 54.3375 42.0247 52.8609 42.0247 51.2456V46.8581C42.339 46.5002 42.6982 46.0406 43.0826 45.4977C44.6067 43.3449 45.7598 40.9768 46.5588 38.4924C47.9931 38.05 49.0498 36.7253 49.0498 35.1509V30.4675C49.0498 29.4373 48.5914 28.5168 47.8796 27.8723V21.1021C47.8796 21.1021 49.2703 10.5664 35.0022 10.5664C20.7341 10.5664 22.1248 21.1021 22.1248 21.1021V27.8723C21.4116 28.5168 20.9547 29.4373 20.9547 30.4675V35.1509C20.9547 36.3845 21.6031 37.4702 22.5739 38.0975C23.7441 43.1917 26.8082 46.8581 26.8082 46.8581V51.1374C26.8069 52.6958 25.9537 54.1315 24.5841 54.879Z" fill="#C2D9EB"/>
            <path d="M35.5982 0.00521191C16.2716 -0.324977 0.335404 15.075 0.00521536 34.4016C-0.182332 45.3599 4.70182 55.2088 12.4784 61.7584C12.9869 61.3146 13.5324 60.9079 14.1386 60.5777L24.5818 54.8813C25.9514 54.1337 26.8046 52.698 26.8046 51.1369V46.8577C26.8046 46.8577 23.7392 43.1912 22.5703 38.0971C21.6009 37.4697 20.9511 36.3854 20.9511 35.1505V30.4671C20.9511 29.4369 21.4094 28.5163 22.1213 27.8718V21.1016C22.1213 21.1016 20.7305 10.566 34.9986 10.566C49.2667 10.566 47.876 21.1016 47.876 21.1016V27.8718C48.5892 28.5163 49.0462 29.4369 49.0462 30.4671V35.1505C49.0462 36.7248 47.9896 38.0496 46.5552 38.492C45.7562 40.9763 44.6031 43.3445 43.079 45.4973C42.6947 46.0401 42.3354 46.4997 42.0211 46.8577V51.2452C42.0211 52.8605 42.9337 54.3384 44.3786 55.0596L55.5614 60.6503C56.2324 60.9858 56.8386 61.4097 57.3973 61.8813C64.9388 55.5918 69.8111 46.188 69.992 35.5982C70.3248 16.2716 54.9262 0.335401 35.5982 0.00521191Z" fill="#F4F9FD"/>
            </g>
            <defs>
            <clipPath id="clip0_5173_22703">
            <rect width="70" height="70" fill="white"/>
            </clipPath>
            </defs>
          </svg>
          <span className='text-gray-400' style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '14px', lineHeight: '100%', letterSpacing: '0px', textAlign: 'center' }}>
            {t('crm.crm.realtorCardsGrid.пусто')}</span>
        </div>
      </div><div className='flex flex-col gap-3.75 items-center rounded-lg bg-white h-50 w-62.5 border border-gray-100 pt-5'>
        <div className='flex flex-col items-center gap-3.75'>
          <svg width="70" height="70" viewBox="0 0 70 70" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g clipPath="url(#clip0_5173_22703)">
            <path d="M24.5841 54.879L14.1409 60.5755C13.5281 60.9096 12.9773 61.3204 12.4648 61.7681C18.5535 66.9019 26.4133 69.999 35.0009 69.999C43.525 69.999 51.3347 66.9481 57.4062 61.8843C56.8462 61.4115 56.2386 60.9862 55.565 60.6507L44.3822 55.06C42.9373 54.3375 42.0247 52.8609 42.0247 51.2456V46.8581C42.339 46.5002 42.6982 46.0406 43.0826 45.4977C44.6067 43.3449 45.7598 40.9768 46.5588 38.4924C47.9931 38.05 49.0498 36.7253 49.0498 35.1509V30.4675C49.0498 29.4373 48.5914 28.5168 47.8796 27.8723V21.1021C47.8796 21.1021 49.2703 10.5664 35.0022 10.5664C20.7341 10.5664 22.1248 21.1021 22.1248 21.1021V27.8723C21.4116 28.5168 20.9547 29.4373 20.9547 30.4675V35.1509C20.9547 36.3845 21.6031 37.4702 22.5739 38.0975C23.7441 43.1917 26.8082 46.8581 26.8082 46.8581V51.1374C26.8069 52.6958 25.9537 54.1315 24.5841 54.879Z" fill="#C2D9EB"/>
            <path d="M35.5982 0.00521191C16.2716 -0.324977 0.335404 15.075 0.00521536 34.4016C-0.182332 45.3599 4.70182 55.2088 12.4784 61.7584C12.9869 61.3146 13.5324 60.9079 14.1386 60.5777L24.5818 54.8813C25.9514 54.1337 26.8046 52.698 26.8046 51.1369V46.8577C26.8046 46.8577 23.7392 43.1912 22.5703 38.0971C21.6009 37.4697 20.9511 36.3854 20.9511 35.1505V30.4671C20.9511 29.4369 21.4094 28.5163 22.1213 27.8718V21.1016C22.1213 21.1016 20.7305 10.566 34.9986 10.566C49.2667 10.566 47.876 21.1016 47.876 21.1016V27.8718C48.5892 28.5163 49.0462 29.4369 49.0462 30.4671V35.1505C49.0462 36.7248 47.9896 38.0496 46.5552 38.492C45.7562 40.9763 44.6031 43.3445 43.079 45.4973C42.6947 46.0401 42.3354 46.4997 42.0211 46.8577V51.2452C42.0211 52.8605 42.9337 54.3384 44.3786 55.0596L55.5614 60.6503C56.2324 60.9858 56.8386 61.4097 57.3973 61.8813C64.9388 55.5918 69.8111 46.188 69.992 35.5982C70.3248 16.2716 54.9262 0.335401 35.5982 0.00521191Z" fill="#F4F9FD"/>
            </g>
            <defs>
            <clipPath id="clip0_5173_22703">
            <rect width="70" height="70" fill="white"/>
            </clipPath>
            </defs>
          </svg>
          <span className='text-gray-400' style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '14px', lineHeight: '100%', letterSpacing: '0px', textAlign: 'center' }}>
            {t('crm.crm.realtorCardsGrid.пусто')}</span>
        </div>
      </div>
      
      {/* Модалка статистики */}
      <LeadStatsModal
        isOpen={isStatsModalOpen}
        onClose={() => {
          setIsStatsModalOpen(false);
          setSelectedLead(null);
          selectedLeadIdRef.current = null;
        }}
        leadEmail={selectedLead?.email}
        leadName={selectedLead?.name}
      />
    </div>    
  );
};

export default RealtorCardsGrid;
