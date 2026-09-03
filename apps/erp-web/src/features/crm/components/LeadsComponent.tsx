import { useState, useEffect } from 'react';
import Markdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import {
  LeadStage,
  ProductType,
  RejectionReason
} from '../services/api';
import { resolveDuplicateLeadForUser } from '../utils/leadDuplicateHelper';
import type {
  Lead,
  CreateLeadDto,
  UpdateLeadDto,
  UpdateLeadStageDto
} from '../services/api';
import { PhoneInput } from './common/PhoneInput';
import { useI18n } from "@/i18n";
import { leadsApiV2, newIdempotencyKey } from '@/services/leadsApiV2';
import { mapLeadV2ToCrmLead, mapProductTypeCrmToV2 } from '@/lib/lead-v2-legacy-adapter';

interface LeadsComponentProps {
  onLeadSelect?: (lead: Lead) => void;
  selectedLead?: Lead | null;
}

const stageLabels: Record<LeadStage, string> = {
  [LeadStage.REJECTED]: 'Отказ',
  [LeadStage.REJECTED1]: 'Отказ 1',
  [LeadStage.FIRST_CONTACT]: 'Первый контакт',
  [LeadStage.FIRST_CONTACT1]: 'Первый контакт 1',
  [LeadStage.QUALIFICATION]: 'Квалификация',
  [LeadStage.NEEDS_ANALYSIS]: 'Анализ потребностей',
  [LeadStage.NEEDS_ANALYSIS1]: 'Анализ потребностей 1',
  [LeadStage.PRESENTATION]: 'Презентация',
  [LeadStage.PRESENTATION1]: 'Презентация 1',
  [LeadStage.PROPOSAL]: 'Предложение',
  [LeadStage.PROPOSAL1]: 'Предложение 1',
  [LeadStage.NEGOTIATION]: 'Переговоры',
  [LeadStage.NEGOTIATION1]: 'Переговоры 1',
  [LeadStage.DECISION_MAKING]: 'Принятие решения',
  [LeadStage.DECISION_MAKING1]: 'Принятие решения 1',
  [LeadStage.CONTRACT_SIGNING]: 'Подписание договора',
  [LeadStage.CONTRACT_SIGNING1]: 'Подписание договора 1',
  [LeadStage.ONBOARDING]: 'Внедрение',
  [LeadStage.DEAL_CLOSED]: 'Сделка закрыта',
  [LeadStage.POST_PURCHASE_FOLLOWUP]: 'Послепродажное сопровождение',
  [LeadStage.SATISFACTION_CHECK]: 'Проверка удовлетворенности',
  [LeadStage.UPSELL_OPPORTUNITY]: 'Возможность допродажи',
  [LeadStage.REGISTERED]: 'Зарегистрирован',
  [LeadStage.ADAPTED]: 'Адаптирован',
  // Воронка СЕТЬ - Отказ
  [LeadStage.NETWORK_REJECTED_DEFECTIVE]: 'Бракованный лид',
  [LeadStage.NETWORK_REJECTED]: 'Отказ',
  [LeadStage.NETWORK_NO_CALL_3]: 'Не дозвонился 3',
  [LeadStage.NETWORK_NO_CALL_2]: 'Не дозвонился 2',
  [LeadStage.NETWORK_NO_CALL_1]: 'Не дозвонился 1',
  // Воронка СЕТЬ - В работе
  [LeadStage.NETWORK_NEW_LEAD]: 'Новый лид',
  [LeadStage.NETWORK_CALL_LATER]: 'Попросил связаться позже',
  [LeadStage.NETWORK_COMPANY_PRESENTED]: 'Презентовали компанию и стратегию',
  [LeadStage.NETWORK_PLATFORM_PRESENTED]: 'Презентовали платформу',
  [LeadStage.NETWORK_OFFER_GIVEN]: 'Вручили оффер',
  [LeadStage.NETWORK_OBJECTIONS]: 'Работа с возражениями',
  [LeadStage.NETWORK_DEFERRED_DEMAND]: 'Отложенный спрос',
  [LeadStage.NETWORK_AGREEMENT]: 'Согласие',
  [LeadStage.NETWORK_FORM_FILLED]: 'Заполнена анкета',
  [LeadStage.NETWORK_ACCOUNT_REGISTERED]: 'Регистрация в личном кабинете',
  [LeadStage.NETWORK_OFFER_SIGNED]: 'Подписание оферты',
  [LeadStage.NETWORK_WORK_STARTED]: 'Начало работы',
  // Воронка СЕТЬ - Риелтор
  [LeadStage.REALTOR_1]: 'Риелтор',
  [LeadStage.REALTOR_2]: 'Риелтор ⭐',
  [LeadStage.REALTOR_3]: 'Риелтор ⭐⭐',
  [LeadStage.REALTOR_4]: 'Риелтор ⭐⭐⭐',
  [LeadStage.REALTOR_5]: 'Риелтор ⭐⭐⭐⭐',
  [LeadStage.REALTOR_6]: 'Риелтор ⭐⭐⭐⭐⭐',
  // Воронка СЕТЬ - Куратор
  [LeadStage.CURATOR_1]: 'Куратор',
  [LeadStage.CURATOR_2]: 'Куратор ⭐',
  [LeadStage.CURATOR_3]: 'Куратор ⭐⭐',
  [LeadStage.CURATOR_4]: 'Куратор ⭐⭐⭐',
  [LeadStage.CURATOR_5]: 'Куратор ⭐⭐⭐⭐',
  [LeadStage.CURATOR_6]: 'Куратор ⭐⭐⭐⭐⭐',
  // Воронка Собственник
  [LeadStage.OWNER_REJECTED_DEFECTIVE]: 'Бракованный контакт',
  [LeadStage.OWNER_REJECTED_OWNER]: 'Отказ собственника',
  [LeadStage.OWNER_NO_CALL_3]: 'Недозвонился 3',
  [LeadStage.OWNER_NO_CALL_2]: 'Недозвонился 2',
  [LeadStage.OWNER_NO_CALL_1]: 'Недозвонился 1',
  [LeadStage.OWNER_NEW_OWNER]: 'Новый собственник',
  [LeadStage.OWNER_CALL_LATER]: 'Попросил связаться позже',
  [LeadStage.OWNER_COMPANY_PRESENTED]: 'Презентовали компанию',
  [LeadStage.OWNER_OBJECT_DISCUSSED]: 'Обсудили объект и условия',
  [LeadStage.OWNER_PHOTO_PROPOSED]: 'Предложили фотосессия',
  [LeadStage.OWNER_EXCLUSIVE_PROPOSED]: 'Предложен эксклюзив',
  [LeadStage.OWNER_OBJECTIONS]: 'Отработали возражения',
  [LeadStage.OWNER_AGREED]: 'Договорились о сотрудничестве',
  [LeadStage.OWNER_ACTIVE_FOR_SALE]: 'Объект активен в продаже',
  [LeadStage.OWNER_GET_REFERRAL]: 'Взять рекомендацию',
  [LeadStage.OWNER_NEW_OBJECT_INQUIRY]: 'Узнать о новом объекте',
  // Воронка Посредник
  [LeadStage.AGENT_REJECTED_DEFECTIVE]: 'Бракованный контакт',
  [LeadStage.AGENT_REJECTED]: 'Отказ',
  [LeadStage.AGENT_NO_CALL_3]: 'Недозвонился 3',
  [LeadStage.AGENT_NO_CALL_2]: 'Недозвонился 2',
  [LeadStage.AGENT_NO_CALL_1]: 'Недозвонился 1',
  [LeadStage.AGENT_NEW_AGENT]: 'Новый посредник',
  [LeadStage.AGENT_CALL_LATER]: 'Попросил связаться позже',
  [LeadStage.AGENT_COMPANY_PRESENTED]: 'Презентовали компанию',
  [LeadStage.AGENT_FORMAT]: 'Формат сотрудничества',
  [LeadStage.AGENT_OBJECTIONS]: 'Работа с возражениями',
  [LeadStage.AGENT_AGREED]: 'Согласие сотрудничать',
  [LeadStage.AGENT_ACTIVE]: 'Активный посредник',
} as Record<LeadStage, string>;

const productTypeLabels = {
  [ProductType.SALES]: 'Продажи',
  [ProductType.NETWORK]: 'Сеть',
  [ProductType.OWNER]: 'Собственник',
  [ProductType.AGENT]: 'Посредник',
};

const rejectionReasonLabels = {
  [RejectionReason.PRICE_TOO_HIGH]: 'Высокая цена',
  [RejectionReason.NOT_INTERESTED]: 'Не интересно',
  [RejectionReason.WRONG_TIMING]: 'Неподходящее время',
  [RejectionReason.COMPETITOR_CHOSEN]: 'Выбрал конкурента',
  [RejectionReason.NO_BUDGET]: 'Нет бюджета',
  [RejectionReason.NO_AUTHORITY]: 'Нет полномочий',
  [RejectionReason.OTHER]: 'Другое',
  [RejectionReason.DEFECTIVE_LEAD]: 'Бракованный лид',
  [RejectionReason.OTHER_REASON]: 'Иная причина',
  [RejectionReason.PARTNERSHIP_TERMINATED]: 'Сотрудничество прекращено',
  [RejectionReason.CANNOT_CONTACT]: 'Нет возможности связаться',
};

const stageColors: Record<LeadStage, string> = {
  [LeadStage.REJECTED]: 'bg-gray-100 text-gray-800',
  [LeadStage.REJECTED1]: 'bg-gray-100 text-gray-800',
  [LeadStage.FIRST_CONTACT]: 'bg-blue-100 text-blue-800',
  [LeadStage.FIRST_CONTACT1]: 'bg-blue-100 text-blue-800',
  [LeadStage.QUALIFICATION]: 'bg-indigo-100 text-indigo-800',
  [LeadStage.NEEDS_ANALYSIS]: 'bg-purple-100 text-purple-800',
  [LeadStage.NEEDS_ANALYSIS1]: 'bg-purple-100 text-purple-800',
  [LeadStage.PRESENTATION]: 'bg-pink-100 text-pink-800',
  [LeadStage.PRESENTATION1]: 'bg-pink-100 text-pink-800',
  [LeadStage.PROPOSAL]: 'bg-red-100 text-red-800',
  [LeadStage.PROPOSAL1]: 'bg-red-100 text-red-800',
  [LeadStage.NEGOTIATION]: 'bg-orange-100 text-orange-800',
  [LeadStage.NEGOTIATION1]: 'bg-orange-100 text-orange-800',
  [LeadStage.DECISION_MAKING]: 'bg-yellow-100 text-yellow-800',
  [LeadStage.DECISION_MAKING1]: 'bg-yellow-100 text-yellow-800',
  [LeadStage.CONTRACT_SIGNING]: 'bg-lime-100 text-lime-800',
  [LeadStage.CONTRACT_SIGNING1]: 'bg-lime-100 text-lime-800',
  [LeadStage.ONBOARDING]: 'bg-green-100 text-green-800',
  [LeadStage.DEAL_CLOSED]: 'bg-emerald-100 text-emerald-800',
  [LeadStage.POST_PURCHASE_FOLLOWUP]: 'bg-teal-100 text-teal-800',
  [LeadStage.SATISFACTION_CHECK]: 'bg-cyan-100 text-cyan-800',
  [LeadStage.UPSELL_OPPORTUNITY]: 'bg-sky-100 text-sky-800',
  [LeadStage.REGISTERED]: 'bg-blue-100 text-blue-800',
  [LeadStage.ADAPTED]: 'bg-green-100 text-green-800',
} as Record<LeadStage, string>;

export const LeadsComponent = ({ onLeadSelect, selectedLead }: LeadsComponentProps) => {
    const { t } = useI18n();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [stageUpdateLead, setStageUpdateLead] = useState<Lead | null>(null);
  const [formData, setFormData] = useState<CreateLeadDto>({
    name: '',
    phone: '',
    email: '',
    productType: ProductType.SALES,
    assignedTo: '690ca643abbceba815ba7090',
    source: '',
    notes: '',
    dealValue: 0,
    expectedCloseDate: '',
  });
  const [stageFormData, setStageFormData] = useState<UpdateLeadStageDto>({
    stage: LeadStage.FIRST_CONTACT,
    comment: '',
  });

  const loadLeads = async () => {
    try {
      setLoading(true);
      const { items, complete } = await leadsApiV2.listAll();
      if (!complete) {
        console.warn('[LeadsComponent] Показаны не все лиды — упёрлись в предел страниц (leadsApiV2.listAll)');
      }
      setLeads(items.map(mapLeadV2ToCrmLead));
    } catch (error) {
      console.error('Failed to load leads:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLeads();
  }, []);

  const handleCreateLead = async () => {
    const currentUserId = localStorage.getItem('userId') || formData.assignedTo || '690ca643abbceba815ba7090';
    const duplicatePayload = {
      phone: formData.phone.trim(),
      email: formData.email?.trim() || undefined,
    };
    const tryAttachDuplicateLead = async () => {
      const resolution = await resolveDuplicateLeadForUser(duplicatePayload, currentUserId);
      if (resolution.assignedToCurrentUser) {
        alert(resolution.message || 'Лид уже существовал у другого пользователя и теперь назначен на вас.');
        setShowCreateModal(false);
        setFormData({
          name: '',
          phone: '',
          email: '',
          productType: ProductType.SALES,
          assignedTo: '690ca643abbceba815ba7090',
          source: '',
          notes: '',
          dealValue: 0,
          expectedCloseDate: '',
        });
        await loadLeads();
        return true;
      }
      return false;
    };
    try {
      // `[phase 4]` POST /leads принимает только
      // requesterName/requesterPhone/productType (см. CreateLeadV2Payload
      // докстринг) — сопутствующие поля добираются отдельным PATCH, а
      // назначение — отдельным assign, тот же приём, что уже применён в
      // LeadsContext.ADD_LEAD и LeadsBlock.tsx. email/source в PATCH не
      // входят — честный пробел (см. UpdateLeadV2Payload).
      const created = await leadsApiV2.create(
        {
          requesterName: formData.name,
          requesterPhone: formData.phone,
          productType: mapProductTypeCrmToV2(formData.productType),
        },
        newIdempotencyKey(),
      );
      await leadsApiV2.update(created.id, {
        notes: formData.notes,
        dealValue: formData.dealValue,
        expectedCloseDate: formData.expectedCloseDate || undefined,
      });
      if (formData.assignedTo) {
        await leadsApiV2.assign(created.id, formData.assignedTo);
      }
      setShowCreateModal(false);
      setFormData({
        name: '',
        phone: '',
        email: '',
        productType: ProductType.SALES,
        assignedTo: '690ca643abbceba815ba7090',
        source: '',
        notes: '',
        dealValue: 0,
        expectedCloseDate: '',
      });
      loadLeads();
    } catch (error: any) {
      console.error('Failed to create lead:', error);
      let errorMessage = error.response?.data?.message || error.message || 'Ошибка при создании лида';
      if (errorMessage.includes('уже существует') || error.response?.status === 409) {
        if (await tryAttachDuplicateLead()) {
          return;
        }
        errorMessage = 'Лид с таким номером телефона или email уже существует. Пожалуйста, проверьте данные или измените телефон/email.';
      }
      alert(errorMessage);
    }
  };

  const handleUpdateLead = async (leadId: string, updates: UpdateLeadDto) => {
    try {
      // `[phase 4]` PATCH /leads/:id (UpdateLeadV2Payload) не принимает
      // name/phone/email/productType/source — честный пробел, эти поля формы
      // редактирования не сохраняются (см. UpdateLeadV2Payload докстринг).
      // stage — отдельный эндпоинт changeStage, здесь не задействован, эта
      // форма его не меняет. assignedTo — отдельный вызов assign.
      const { city, notes, dealValue, expectedCloseDate, budgetValue, budgetCurrency, tags, rejectionReason, rejectionComment, realtorStage, curatorStage, assignedTo } = updates;
      await leadsApiV2.update(leadId, {
        city,
        notes,
        dealValue,
        expectedCloseDate,
        budgetValue,
        budgetCurrency,
        tags,
        rejectionReason,
        rejectionComment,
        realtorStage,
        curatorStage,
      });
      if (assignedTo) {
        await leadsApiV2.assign(leadId, assignedTo);
      }
      loadLeads();
    } catch (error: any) {
      console.error('Failed to update lead:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Ошибка при обновлении лида';
      alert(errorMessage);
    }
  };

  const handleUpdateStage = async () => {
    if (!stageUpdateLead || !stageFormData.stage) return;

    try {
      // `[phase 4]` CAS через expectedVersion — тот же паттерн, что
      // LeadsBlock.updateLeadStage. `(stageUpdateLead as any).version` —
      // расширение mapLeadV2ToCrmLead под CAS (см. lead-v2-legacy-adapter.ts).
      // rejectionReason — сопутствующее поле (PATCH), не входит в changeStage,
      // применяется отдельным update, если задано.
      const expectedVersion = (stageUpdateLead as any).version ?? 0;
      await leadsApiV2.changeStage(
        stageUpdateLead._id,
        stageFormData.stage,
        expectedVersion,
        newIdempotencyKey(),
        stageFormData.comment,
      );
      if (stageFormData.rejectionReason) {
        await leadsApiV2.update(stageUpdateLead._id, { rejectionReason: stageFormData.rejectionReason });
      }
      setStageUpdateLead(null);
      setStageFormData({
        stage: LeadStage.FIRST_CONTACT,
        comment: '',
      });
      loadLeads();
    } catch (error) {
      console.error('Failed to update lead stage:', error);
    }
  };

  const handleDeleteLead = async (leadId: string) => {
    if (confirm('Вы уверены, что хотите удалить этого лид?')) {
      try {
        await leadsApiV2.remove(leadId);
        loadLeads();
      } catch (error) {
        console.error('Failed to delete lead:', error);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-normal text-gray-900">{t('crm.leadsComponent.лиды')}</h2>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          {t('crm.leadsComponent.создать_лида')}</button>
      </div>

      <div className="grid gap-4">
        {leads.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            {t('crm.leadsComponent.лидов_пока_нет')}</div>
        ) : (
          leads.map((lead) => (
            <div
              key={lead._id}
              className={`bg-white rounded-lg shadow-sm border p-4 cursor-pointer transition-colors ${
                selectedLead?._id === lead._id ? 'ring-2 ring-blue-500 bg-blue-50' : 'hover:bg-gray-50'
              }`}
              onClick={() => onLeadSelect?.(lead)}
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-normal text-gray-900">{lead.name}</h3>
                  <p className="text-sm text-gray-600">{lead.phone}</p>
                  {lead.email && <p className="text-sm text-gray-600">{lead.email}</p>}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setStageUpdateLead(lead);
                      setStageFormData({ stage: lead.stage, comment: '' });
                    }}
                    className="text-blue-600 hover:text-blue-800 text-sm"
                  >
                    {t('crm.leadsComponent.этап')}</button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingLead(lead);
                    }}
                    className="text-green-600 hover:text-green-800 text-sm"
                  >
                    {t('crm.leadsComponent.изменить')}</button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteLead(lead._id);
                    }}
                    className="text-red-600 hover:text-red-800 text-sm"
                  >
                    {t('crm.leadsComponent.удалить')}</button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-3">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${stageColors[lead.stage] || 'bg-gray-100 text-gray-800'}`}>
                  {stageLabels[lead.stage] || lead.stage}
                </span>
                <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                  {productTypeLabels[lead.productType]}
                </span>
              </div>

              {lead.notes && (
                <div className="crm-lead-notes text-sm text-gray-600 mb-2"><Markdown rehypePlugins={[rehypeRaw]}>{lead.notes}</Markdown></div>
              )}

              {lead.dealValue > 0 && (
                <p className="text-sm font-medium text-green-600">
                  {t('crm.leadsComponent.сумма_сделки')}{lead.dealValue.toLocaleString('ru-RU')} ₽
                </p>
              )}

              {lead.expectedCloseDate && (
                <p className="text-xs text-gray-500 mt-2">
                  {t('crm.leadsComponent.ожидаемое_закрытие')}{new Date(lead.expectedCloseDate).toLocaleDateString('ru-RU')}
                </p>
              )}
            </div>
          ))
        )}
      </div>

      {}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-normal mb-4">{t('crm.leadsComponent.создать_лида')}</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('crm.leadsComponent.имя')}</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={t('crm.leadsComponent.введите_имя_лида')}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('crm.leadsComponent.телефон')}</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="+7 (999) 123-45-67"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="email@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('crm.leadsComponent.тип_продукта')}</label>
                <select
                  value={formData.productType}
                  onChange={(e) => setFormData({ ...formData, productType: e.target.value as ProductType })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {Object.entries(productTypeLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('crm.leadsComponent.источник')}</label>
                <input
                  type="text"
                  value={formData.source}
                  onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={t('crm.leadsComponent.откуда_пришел_лид')}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('crm.leadsComponent.заметки')}</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={t('crm.leadsComponent.дополнительная_инфор')}
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('crm.leadsComponent.сумма_сделки')}</label>
                <input
                  type="number"
                  value={formData.dealValue}
                  onChange={(e) => setFormData({ ...formData, dealValue: Number(e.target.value) })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('crm.leadsComponent.ожидаемая_дата_закры')}</label>
                <input
                  type="date"
                  value={formData.expectedCloseDate}
                  onChange={(e) => setFormData({ ...formData, expectedCloseDate: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                {t('crm.leadsComponent.отмена')}</button>
              <button
                onClick={handleCreateLead}
                disabled={!formData.name.trim() || !formData.phone.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {t('crm.leadsComponent.создать')}</button>
            </div>
          </div>
        </div>
      )}

      {}
      {stageUpdateLead && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-normal mb-4">{t('crm.leadsComponent.изменить_этап')}</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('crm.leadsComponent.этап')}</label>
                <select
                  value={stageFormData.stage}
                  onChange={(e) => setStageFormData({ ...stageFormData, stage: e.target.value as LeadStage })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {Object.entries(stageLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('crm.leadsComponent.комментарий')}</label>
                <textarea
                  value={stageFormData.comment}
                  onChange={(e) => setStageFormData({ ...stageFormData, comment: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={t('crm.leadsComponent.комментарий_к_измене')}
                  rows={3}
                />
              </div>

              {stageFormData.stage === LeadStage.REJECTED && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('crm.leadsComponent.причина_отказа')}</label>
                  <select
                    value={stageFormData.rejectionReason || ''}
                    onChange={(e) => setStageFormData({ ...stageFormData, rejectionReason: e.target.value as RejectionReason })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">{t('crm.leadsComponent.выберите_причину')}</option>
                    {Object.entries(rejectionReasonLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setStageUpdateLead(null)}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                {t('crm.leadsComponent.отмена')}</button>
              <button
                onClick={handleUpdateStage}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                {t('crm.leadsComponent.сохранить')}</button>
            </div>
          </div>
        </div>
      )}

      {}
      {editingLead && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-normal mb-4">{t('crm.leadsComponent.редактировать_лида')}</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('crm.leadsComponent.имя')}</label>
                <input
                  type="text"
                  value={editingLead.name}
                  onChange={(e) => setEditingLead({ ...editingLead, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('crm.leadsComponent.телефон')}</label>
                <PhoneInput
                  value={editingLead.phone}
                  onChange={(phone) => setEditingLead({ ...editingLead, phone })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={editingLead.email || ''}
                  onChange={(e) => setEditingLead({ ...editingLead, email: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('crm.leadsComponent.тип_продукта')}</label>
                <select
                  value={editingLead.productType}
                  onChange={(e) => setEditingLead({ ...editingLead, productType: e.target.value as ProductType })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {Object.entries(productTypeLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('crm.leadsComponent.источник')}</label>
                <input
                  type="text"
                  value={editingLead.source || ''}
                  onChange={(e) => setEditingLead({ ...editingLead, source: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('crm.leadsComponent.заметки')}</label>
                <textarea
                  value={editingLead.notes || ''}
                  onChange={(e) => setEditingLead({ ...editingLead, notes: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('crm.leadsComponent.сумма_сделки')}</label>
                <input
                  type="number"
                  value={editingLead.dealValue}
                  onChange={(e) => setEditingLead({ ...editingLead, dealValue: Number(e.target.value) })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setEditingLead(null)}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                {t('crm.leadsComponent.отмена')}</button>
              <button
                onClick={async () => {
                  await handleUpdateLead(editingLead._id, {
                    name: editingLead.name,
                    phone: editingLead.phone,
                    email: editingLead.email,
                    productType: editingLead.productType,
                    source: editingLead.source,
                    notes: editingLead.notes,
                    dealValue: editingLead.dealValue,
                  });
                  setEditingLead(null);
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                {t('crm.leadsComponent.сохранить')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
