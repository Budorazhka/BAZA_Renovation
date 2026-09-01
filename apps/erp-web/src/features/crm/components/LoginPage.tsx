import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { fetchPortalUserByCode } from '../services/portalAuth';
import type { PortalUser } from '../services/portalAuth';
import '@/features/crm/styles/App.css';
import { useI18n } from "@/i18n";

const parsePortalCode = (search: string, pathname: string) => {
  try {
    const queryCode = new URLSearchParams(search).get('code')?.trim();
    if (queryCode) {
      return queryCode;
    }
  } catch {
    // malformed search string, fall back to path
  }

  const pathMatch = pathname.match(/\/crm\/user\/([^/?#]+)/);
  return pathMatch?.[1]?.trim() || '';
};

const LoginPage: React.FC = () => {
    const { t } = useI18n();
  // Используем window.location вместо useLocation/useNavigate,
  // т.к. компонент рендерится внутри layout через Outlet
  const initialPortalCode = parsePortalCode(window.location.search, window.location.hash);
  const [code, setCode] = useState(initialPortalCode);
  const [hasUserUpdatedCode, setHasUserUpdatedCode] = useState(false);
  const [portalUser, setPortalUser] = useState<PortalUser | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const autoAttemptedCodeRef = useRef('');

  const handlePortalLogin = useCallback(
    async (portalCode: string) => {
      const trimmedCode = portalCode.trim();
      if (!trimmedCode) {
        setError('Введите код, который вы получили на портале baza.sale');
        return;
      }

      setIsLoading(true);
      setError(null);
      setStatusMessage('Получаем данные пользователя...');
      setPortalUser(null);

      try {
        const userInfo = await fetchPortalUserByCode(trimmedCode);
        setPortalUser(userInfo);
        setStatusMessage(`Найден пользователь ${userInfo.name} ${userInfo.surname || ''}`.trim());

        const loginResult = await login(userInfo.email, undefined, { portalCode: trimmedCode });
        if (loginResult.success) {
          setStatusMessage('Авторизация прошла, перенаправляем на CRM...');
          window.location.reload();
          return;
        }

        setError(loginResult.message || 'Не удалось выполнить вход по электронному адресу');
        setStatusMessage(null);
      } catch (err: any) {
        console.error('Portal login failed:', err);
        setError(
          err?.message || 'Не удалось получить пользователя по указанному коду. Попробуйте снова.'
        );
        setStatusMessage(null);
      } finally {
        setIsLoading(false);
      }
    },
    [login]
  );

  useEffect(() => {
    if (initialPortalCode && !hasUserUpdatedCode) {
      setCode(initialPortalCode);
    }
  }, [initialPortalCode, hasUserUpdatedCode]);

  useEffect(() => {
    if (!initialPortalCode) {
      return;
    }

    if (autoAttemptedCodeRef.current === initialPortalCode) {
      return;
    }

    handlePortalLogin(initialPortalCode);
    autoAttemptedCodeRef.current = initialPortalCode;
  }, [initialPortalCode, handlePortalLogin]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    handlePortalLogin(code);
  };

  const handleCodeChange = (value: string) => {
    setCode(value);
    setHasUserUpdatedCode(true);
  };

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-[var(--app-bg)] px-4">
      <div className="bg-[var(--card)] text-[color:var(--foreground)] border border-[color:var(--border)] rounded-[25px] p-8 shadow-2xl w-full max-w-lg mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-normal text-[color:var(--foreground)]">{t('crm.loginPage.вход_через_портал')}</h1>
          <p className="text-[color:var(--muted-foreground)] text-sm">
            {t('crm.loginPage.получите_персональны')}<strong className="text-[color:var(--foreground)]">baza.sale</strong>{t('crm.loginPage.затем_вставьте_его')}</p>
        </div>

        {statusMessage && (
          <div className="bg-[color:color-mix(in_srgb,var(--primary)_15%,var(--card))] border border-[color:var(--primary)]/40 text-[color:var(--foreground)] px-4 py-3 rounded-lg text-sm">
            {statusMessage}
          </div>
        )}

        {error && (
          <div className="bg-[color:color-mix(in_srgb,#dc2626_18%,var(--card))] border border-red-500/40 text-red-200 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="text-sm font-normal text-[color:var(--foreground)]">{t('crm.loginPage.код_из_портала')}</label>
          <input
            type="text"
            value={code}
            onChange={(event) => handleCodeChange(event.target.value)}
            placeholder={t('crm.loginPage.например_0cbedmk9uuy')}
            className="w-full border-2 border-[color:var(--border)] bg-[var(--input)] text-[color:var(--foreground)] placeholder:text-[color:var(--muted-foreground)] rounded-full px-5 py-3 focus:outline-none focus:border-[color:var(--primary)]"
            disabled={isLoading}
          />

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-[color:var(--primary)] text-[color:var(--primary-foreground)] px-7 py-3 rounded-full hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="font-normal text-base">{isLoading ? 'Авторизация...' : 'Авторизоваться'}</span>
          </button>
        </form>

        <div className="flex flex-col gap-3 text-center text-sm text-[color:var(--muted-foreground)]">
          <p>{t('crm.loginPage.если_код_устарел_или')}</p>
          <a
            href="https://baza.sale"
            target="_blank"
            rel="noreferrer"
            className="text-[color:var(--primary)] font-normal hover:underline"
          >
            {t('crm.loginPage.перейти_на_портал_дл')}</a>
        </div>

        {portalUser && (
          <div className="border border-[color:var(--primary)]/30 rounded-xl p-4 flex items-center gap-3">
            {portalUser.image && (
              <img
                src={portalUser.image}
                alt={`${portalUser.name} ${portalUser.surname || ''}`.trim()}
                className="w-12 h-12 rounded-full object-cover"
              />
            )}
            <div className="text-sm text-[color:var(--foreground)]">
              <p className="font-normal">
                {portalUser.name} {portalUser.surname}
              </p>
              <p className="truncate text-[color:var(--muted-foreground)]">{portalUser.email}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LoginPage;

