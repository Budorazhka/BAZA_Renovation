import { apiService } from '../services/api';

const normalizePhoneDigits = (phone?: string) => {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
};

const normalizeEmail = (email?: string) => {
  if (!email) return '';
  return email.trim().toLowerCase();
};

export interface DuplicateLeadResolution {
  assignedToCurrentUser: boolean;
  message?: string;
  leadId?: string;
}

export async function resolveDuplicateLeadForUser(
  payload: { phone?: string; email?: string },
  currentUserId: string
): Promise<DuplicateLeadResolution> {
  const searchTerm = normalizePhoneDigits(payload.phone) || normalizeEmail(payload.email);
  if (!searchTerm) {
    return { assignedToCurrentUser: false };
  }

  try {
    const response = await apiService.getLeads({
      search: searchTerm,
      limit: 20,
    });

    if (!response.success || !response.data?.items?.length) {
      return { assignedToCurrentUser: false };
    }

    const normalizedPhone = normalizePhoneDigits(payload.phone);
    const normalizedEmail = normalizeEmail(payload.email);

    const matchedLead = response.data.items.find((lead) => {
      const leadPhone = normalizePhoneDigits(lead.phone);
      const leadEmail = normalizeEmail(lead.email);
      const phoneMatches = normalizedPhone && leadPhone === normalizedPhone;
      const emailMatches = normalizedEmail && leadEmail === normalizedEmail;
      return phoneMatches || emailMatches;
    });

    if (!matchedLead) {
      return { assignedToCurrentUser: false };
    }

    if (matchedLead.assignedTo === currentUserId) {
      return {
        assignedToCurrentUser: true,
        message: 'Лид уже привязан к вам в CRM.',
        leadId: matchedLead._id,
      };
    }

    const updateResponse = await apiService.updateLead(matchedLead._id, { assignedTo: currentUserId });
    if (updateResponse.success) {
      return {
        assignedToCurrentUser: true,
        message: 'Лид существовал у другого пользователя и теперь назначен на вас.',
        leadId: matchedLead._id,
      };
    }
  } catch (error) {
    console.error('Duplicate lead resolution failed:', error);
  }

  return { assignedToCurrentUser: false };
}

