/**
 * Минимальный CRM API клиент для интеграции с мессенджером.
 * Вызывается из ChatsPage при получении crm:action_required.
 *
 * CRM API base: https://api-crm.baza.sale (prod) / http://localhost:3000 (dev)
 */

import axios from 'axios';
import { CRM_API_BASE_URL } from '@/config/backend';
import { normalizePhoneInput } from '@/lib/phone';

const api = axios.create({
  baseURL: CRM_API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

function getAuthQuery(): { userId?: string; userRole?: string } {
  try {
    const stored = localStorage.getItem('user_data');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed?.id && parsed?.role) {
        return { userId: parsed.id, userRole: parsed.role };
      }
    }
  } catch {}
  return {};
}

function normalizePhone(raw: string): string {
  return normalizePhoneInput(raw);
}

export type LeadStage =
  | 'rejected' | 'first_contact' | 'qualification'
  | 'needs_analysis' | 'presentation' | 'proposal'
  | 'negotiation' | 'decision_making' | 'contract_signing'
  | 'onboarding' | 'deal_closed';

export type ProductType = 'sales' | 'network' | 'owner' | 'agent';

export interface CreateLeadPayload {
  name: string;
  phone: string;
  email?: string;
  city?: string;
  productType: ProductType;
  assignedTo: string;
  source?: string;
  notes?: string;
  dealValue?: number;
  expectedCloseDate?: string;
  budgetValue?: number;
  budgetCurrency?: 'USD' | 'EUR' | 'RUB' | 'KZT';
}

export interface CrmLead {
  _id: string;
  name: string;
  phone: string;
  email?: string;
  city?: string;
  stage: LeadStage;
  productType: ProductType;
  assignedTo: string;
  createdBy: string;
  source?: string;
  notes?: string;
  dealValue: number;
  tags?: string[];
  history: unknown[];
  createdAt: string;
  updatedAt: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
}

export const crmApi = {
  async createLead(data: CreateLeadPayload): Promise<ApiResponse<CrmLead>> {
    const auth = getAuthQuery();
    const sanitized = {
      name: String(data.name || '').trim(),
      phone: normalizePhone(String(data.phone || '')),
      productType: data.productType,
      assignedTo: String(data.assignedTo || '').trim(),
      ...(data.email && { email: String(data.email).trim() }),
      ...(data.city && { city: String(data.city).trim() }),
      ...(data.source && { source: String(data.source).trim() }),
      ...(data.notes && { notes: String(data.notes).trim() }),
      ...(data.dealValue != null && { dealValue: Number(data.dealValue) }),
      ...(data.expectedCloseDate && { expectedCloseDate: String(data.expectedCloseDate).trim() }),
      ...(data.budgetValue != null && { budgetValue: Number(data.budgetValue) }),
      ...(data.budgetCurrency && { budgetCurrency: data.budgetCurrency }),
    };
    try {
      const r = await api.post('/crm/leads', sanitized, { params: auth });
      return r.data;
    } catch (e: any) {
      if (e.response?.status === 409) {
        return {
          success: false,
          message: e.response?.data?.message || 'Лид с таким номером телефона или email уже существует',
        };
      }
      throw e;
    }
  },

  async getLead(id: string): Promise<ApiResponse<CrmLead>> {
    const auth = getAuthQuery();
    const r = await api.get(`/crm/leads/${id}`, { params: auth });
    return r.data;
  },

  async searchLeadByPhone(phone: string): Promise<ApiResponse<{ items: CrmLead[]; total: number }>> {
    const auth = getAuthQuery();
    const normalized = normalizePhone(phone);
    const r = await api.get('/crm/leads', { params: { search: normalized || phone, ...auth } });
    return r.data;
  },

  async searchLeadByEmail(email: string): Promise<ApiResponse<{ items: CrmLead[]; total: number }>> {
    const auth = getAuthQuery();
    const r = await api.get('/crm/leads', { params: { search: email, ...auth } });
    return r.data;
  },

  async moveLeadStage(leadId: string, stage: string, comment?: string): Promise<ApiResponse<CrmLead>> {
    const auth = getAuthQuery();
    const body: Record<string, unknown> = { stage };
    if (comment) body.comment = comment;
    const r = await api.patch(`/crm/leads/${leadId}/stage`, body, { params: auth });
    return r.data;
  },

  async addLeadHistory(leadId: string, message: string, comment?: string): Promise<ApiResponse<unknown>> {
    const auth = getAuthQuery();
    const body: Record<string, unknown> = { message };
    if (comment) body.comment = comment;
    const r = await api.post(`/crm/leads/${leadId}/history`, body, { params: auth });
    return r.data;
  },

  async updateLeadNotes(leadId: string, notes: string): Promise<ApiResponse<CrmLead>> {
    const auth = getAuthQuery();
    const r = await api.patch(`/crm/leads/${leadId}`, { notes }, { params: auth });
    return r.data;
  },

  async updateLead(leadId: string, data: Record<string, unknown>): Promise<ApiResponse<CrmLead>> {
    const auth = getAuthQuery();
    const allowed = [
      'name', 'phone', 'email', 'city', 'source', 'notes',
      'tags', 'productType', 'assignedTo', 'dealValue',
      'expectedCloseDate', 'budgetValue', 'budgetCurrency',
    ];
    const sanitized: Record<string, unknown> = {};
    for (const k of allowed) {
      if (!(k in data)) continue;
      const v = data[k];
      if (k === 'tags' && Array.isArray(v)) {
        sanitized[k] = v.slice(0, 2).map((s: unknown) => String(s).trim().slice(0, 128)).filter(Boolean);
      } else if (v !== undefined && v !== null) {
        if (['name', 'phone', 'email', 'city', 'source', 'notes', 'expectedCloseDate', 'budgetCurrency'].includes(k)) {
          sanitized[k] = String(v).trim();
        } else if (['dealValue', 'budgetValue'].includes(k)) {
          sanitized[k] = Number(v);
        } else {
          sanitized[k] = v;
        }
      }
    }
    try {
      const r = await api.patch(`/crm/leads/${leadId}`, sanitized, { params: auth });
      return r.data;
    } catch (e: any) {
      if (e.response?.status === 409) {
        return {
          success: false,
          message: e.response?.data?.message || 'Лид с таким номером телефона или email уже существует',
        };
      }
      throw e;
    }
  },
};
