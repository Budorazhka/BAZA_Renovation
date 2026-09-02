/** Нормализует номер перед отправкой на API мессенджеров. */
export function normalizePhoneInput(raw: string): string {
  let phone = String(raw || '').trim().replace(/[\s\-()]/g, '');

  if (!phone) return '';

  if (phone.startsWith('00')) {
    phone = `+${phone.slice(2)}`;
  } else if (!phone.startsWith('+')) {
    if (phone.startsWith('8') && phone.length === 11) {
      phone = `+7${phone.slice(1)}`;
    } else if (phone.startsWith('7') && phone.length === 11) {
      phone = `+${phone}`;
    } else {
      phone = `+${phone}`;
    }
  }

  return phone;
}

export function extractMessengerApiError(error: unknown, fallback: string): string {
  const err = error as { response?: { data?: { error?: string; errors?: Array<{ msg?: string }> } }; message?: string };
  return (
    err?.response?.data?.error ||
    err?.response?.data?.errors?.[0]?.msg ||
    err?.message ||
    fallback
  );
}
