import { mapLegacyLeadResponse } from './map-legacy-lead';
import type { RawLegacyLead, RawLegacyHistoryEntry } from './legacy-api-types';

describe('mapLegacyLeadResponse', () => {
  it('маппит полный лид со всеми полями и полной историей', () => {
    const lead: RawLegacyLead = {
      _id: 'lead-1',
      name: 'Иван Иванов',
      phone: '+79990001122',
      email: 'ivan@example.com',
      city: 'Дубай',
      stage: 'new',
      productType: 'sales',
      realtorStage: 'contact',
      curatorStage: 'qualification',
      assignedTo: 'account-1',
      createdBy: 'account-2',
      source: 'website',
      notes: 'важный клиент',
      rejectionReason: 'price',
      rejectionComment: 'дорого',
      dealValue: 150000,
      expectedCloseDate: '2026-10-01',
      budgetValue: 200000,
      budgetCurrency: 'USD',
      tags: ['vip', 'referral'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    };
    const history: RawLegacyHistoryEntry[] = [
      {
        fromStage: 'new',
        toStage: 'contact',
        changedAt: '2026-01-01T10:00:00.000Z',
        changedBy: 'account-1',
        userName: 'Пётр Петров',
        userRole: 'agent',
        comment: 'позвонили',
      },
      {
        type: 'stage_comment',
        stage: 'contact',
        stageName: 'Контакт',
        comment: 'заметка к этапу',
        createdAt: '2026-01-01T11:00:00.000Z',
        updatedAt: '2026-01-01T11:00:00.000Z',
        createdBy: { _id: 'u1', name: 'Пётр Петров', email: 'petr@example.com' },
      },
    ];

    const result = mapLegacyLeadResponse(lead, history);

    expect(result).toEqual({
      _id: 'lead-1',
      name: 'Иван Иванов',
      phone: '+79990001122',
      email: 'ivan@example.com',
      city: 'Дубай',
      stage: 'new',
      productType: 'sales',
      realtorStage: 'contact',
      curatorStage: 'qualification',
      assignedTo: 'account-1',
      createdBy: 'account-2',
      source: 'website',
      notes: 'важный клиент',
      rejectionReason: 'price',
      rejectionComment: 'дорого',
      history: [
        {
          fromStage: 'new',
          toStage: 'contact',
          changedAt: '2026-01-01T10:00:00.000Z',
          changedBy: 'account-1',
          userName: 'Пётр Петров',
          userRole: 'agent',
          comment: 'позвонили',
        },
      ],
      dealValue: 150000,
      expectedCloseDate: '2026-10-01',
      budgetValue: 200000,
      budgetCurrency: 'USD',
      tags: ['vip', 'referral'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
  });

  it('маппит минимальный лид без опциональных полей и с пустой историей', () => {
    const lead: RawLegacyLead = {
      _id: 'lead-2',
      name: 'Мария Сидорова',
      phone: '+79990003344',
      stage: 'new',
      productType: 'network',
      assignedTo: 'account-3',
      createdBy: 'account-3',
      dealValue: 0,
      createdAt: '2026-02-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
    };

    const result = mapLegacyLeadResponse(lead, []);

    expect(result).toEqual({
      _id: 'lead-2',
      name: 'Мария Сидорова',
      phone: '+79990003344',
      email: undefined,
      city: undefined,
      stage: 'new',
      productType: 'network',
      realtorStage: undefined,
      curatorStage: undefined,
      assignedTo: 'account-3',
      createdBy: 'account-3',
      source: undefined,
      notes: undefined,
      rejectionReason: undefined,
      rejectionComment: undefined,
      history: [],
      dealValue: 0,
      expectedCloseDate: undefined,
      budgetValue: undefined,
      budgetCurrency: undefined,
      tags: undefined,
      createdAt: '2026-02-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
    });
  });

  it('отбрасывает записи истории без comment так, чтобы поле не попадало в вывод', () => {
    const lead: RawLegacyLead = {
      _id: 'lead-3',
      name: 'Тест',
      phone: '+70000000000',
      stage: 'new',
      productType: 'owner',
      assignedTo: 'a',
      createdBy: 'a',
      dealValue: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const history: RawLegacyHistoryEntry[] = [
      {
        fromStage: 'new',
        toStage: 'closed',
        changedAt: '2026-01-01T10:00:00.000Z',
        changedBy: 'a',
        userName: 'Кто-то',
        userRole: 'agent',
      },
    ];

    const result = mapLegacyLeadResponse(lead, history);

    expect(result.history).toEqual([
      {
        fromStage: 'new',
        toStage: 'closed',
        changedAt: '2026-01-01T10:00:00.000Z',
        changedBy: 'a',
        userName: 'Кто-то',
        userRole: 'agent',
      },
    ]);
    expect(result.history[0]).not.toHaveProperty('comment');
  });
});
