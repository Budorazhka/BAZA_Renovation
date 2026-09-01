import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { fetchPortalUserByCode } from '../services/portalAuth';
import type { PortalUser } from '../services/portalAuth';
import { useI18n } from "@/i18n";

export default function AuthPage() {
    const { t } = useI18n();
  const { code } = useParams<{ code?: string }>();
  const normalizedCode = code?.trim() ?? '';
  const { login } = useAuth();
  const navigate = useNavigate();
  const [portalUser, setPortalUser] = useState<PortalUser | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const autoAttemptedCodeRef = useRef('');

  useEffect(() => {
    if (!normalizedCode) {
      setError('Код в ссылке отсутствует. Перейдите на стандартную форму входа.');
      setStatusMessage(null);
      setPortalUser(null);
      setIsLoading(false);
      return;
    }

    if (autoAttemptedCodeRef.current === normalizedCode) {
      return;
    }

    autoAttemptedCodeRef.current = normalizedCode;
    let active = true;

    const attemptLogin = async () => {
      setIsLoading(true);
      setError(null);
      setStatusMessage('Получаем данные пользователя...');
      setPortalUser(null);

      try {
        const userInfo = await fetchPortalUserByCode(normalizedCode);
        if (!active) {
          return;
        }

        setPortalUser(userInfo);
        setStatusMessage(`Найден пользователь ${userInfo.name} ${userInfo.surname || ''}`.trim());

        const loginResult = await login(userInfo.email, undefined, {
          portalCode: normalizedCode
        });
        if (!active) {
          return;
        }

        if (loginResult.success) {
          setStatusMessage('Авторизация прошла, загружаем систему...');
          // Используем полную перезагрузку страницы для гарантированного обновления состояния аутентификации
          window.location.href = '/';
          return;
        }

        setError(loginResult.message || 'Не удалось выполнить вход по электронному адресу');
        setStatusMessage(null);
      } catch (err: any) {
        if (!active) {
          return;
        }
        console.error('Portal auth failed:', err);
        setError(
          err?.message || 'Не удалось получить пользователя по указанному коду. Попробуйте снова.'
        );
        setStatusMessage(null);
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    attemptLogin();

    return () => {
      active = false;
    };
  }, [normalizedCode, login, navigate]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--app-bg)] px-4 text-[var(--app-text)]">
      <div className="w-full max-w-lg space-y-6 rounded-md bg-[var(--green-card)] p-8 shadow-[inset_0_0_0_1px_rgba(230,195,100,0.18),0_8px_32px_rgba(0,0,0,0.45)]">
        <div className="space-y-2 text-center">
          <h1 className="text-[24px] font-normal tracking-[-0.02em] text-[var(--gold)]">{t('crm.authPage.автоматическая_автор')}</h1>
          <p className="text-[16px] leading-6 text-[var(--app-text-muted)]">
            {t('crm.authPage.используем_код_из_сс')}</p>
        </div>

        <div className="space-y-1 text-center text-[16px] text-[var(--app-text-muted)]">
          <p>{t('crm.authPage.код_в_ссылке')}</p>
          <p className="truncate font-normal text-[var(--app-text)]">{normalizedCode || '—'}</p>
        </div>

        {statusMessage && (
          <div className="rounded-md bg-[rgba(208,232,223,0.12)] px-4 py-3 text-[16px] text-[var(--workspace-text)] shadow-[inset_0_0_0_1px_rgba(208,232,223,0.22)]">
            {statusMessage}
          </div>
        )}

        {error && (
          <div className="rounded-md bg-[rgba(255,180,171,0.12)] px-4 py-3 text-[16px] text-[#ffb4ab] shadow-[inset_0_0_0_1px_rgba(255,180,171,0.24)]">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-1 text-center text-[16px] text-[var(--app-text-muted)]">
          {!isLoading && (
            <Link to="/" className="font-normal text-[var(--gold)] transition-colors hover:text-[var(--gold-light)]">
              {t('crm.authPage.вернуться_к_стандарт')}</Link>
          )}
          {isLoading && (
            <span className="text-[var(--app-text-muted)]">{t('crm.authPage.пожалуйста_подождите')}</span>
          )}
        </div>

        {portalUser && (
          <div className="flex items-center gap-3 rounded-md bg-[var(--green-bg)] p-4 shadow-[inset_0_0_0_1px_rgba(230,195,100,0.18)]">
            {portalUser.image && (
              <img
                src={portalUser.image}
                alt={`${portalUser.name} ${portalUser.surname || ''}`.trim()}
                className="h-12 w-12 rounded-md object-cover"
              />
            )}
            <div className="text-[16px] text-[var(--app-text-muted)]">
              <p className="font-normal">
                {portalUser.name} {portalUser.surname}
              </p>
              <p className="truncate">{portalUser.email}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
