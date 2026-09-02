import { BAZA_PUBLIC_API_BASE_URL } from '@/config/backend';

export interface PortalUser {
  email: string;
  name: string;
  surname?: string;
  image?: string;
}

const buildPortalUserUrl = (portalCode: string) =>
  `${BAZA_PUBLIC_API_BASE_URL}/crm/user/${encodeURIComponent(portalCode)}`;

export const fetchPortalUserByCode = async (portalCode: string): Promise<PortalUser> => {
  const response = await fetch(buildPortalUserUrl(portalCode));
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null);
    const message =
      errorPayload?.message || 'Не удалось получить данные пользователя по указанному коду\nПожалуйста, пройдите на портал и перейдите по новой ссылке для входа.';
    throw new Error(message);
  }

  return response.json();
};

