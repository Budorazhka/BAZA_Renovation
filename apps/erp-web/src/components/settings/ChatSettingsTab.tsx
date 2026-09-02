import { useState, useEffect, useRef } from 'react'
import { X, CheckCircle2, AlertTriangle, Plus, Trash2, Zap } from 'lucide-react'
import type { Toast } from '@/hooks/useToasts'
import telegramLogo from '@/assets/telegram.svg'
import whatsappLogo from '@/assets/whatsapp.svg'
import {
  messengerApi,
  type Account,
  type AiPermissionsMap,
  type AiPermissionKey,
  isWhatsAppConnected,
  isTelegramConnected,
} from '@/services/messengerApi'
import { authenticateMessengerSocket, getMessengerSocket } from '@/services/messengerSocket'
import { useToasts } from '@/hooks/useToasts'
import { extractMessengerApiError, normalizePhoneInput } from '@/lib/phone'
import { useI18n } from "@/i18n";

export function ChatSettingsTab() {
    const { t } = useI18n();
  const { toasts, addToast, removeToast } = useToasts()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [hasMessengerAuth, setHasMessengerAuth] = useState(() => !!localStorage.getItem('msgr_jwt_token'))

  const [showConnectModal, setShowConnectModal] = useState<'telegram' | 'whatsapp' | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [tgAccountName, setTgAccountName] = useState('')
  const [tgPhone, setTgPhone] = useState('')
  const [tgCode, setTgCode] = useState('')
  const [tgPassword, setTgPassword] = useState('')
  const [tgPendingAccountId, setTgPendingAccountId] = useState<string | null>(null)
  const [tgAuthStep, setTgAuthStep] = useState<'phone' | 'code' | 'password'>('phone')
  const [waPendingAccountId, setWaPendingAccountId] = useState<string | null>(null)
  const [waAccountName, setWaAccountName] = useState('')
  const [agreedToTerms, setAgreedToTerms] = useState<boolean | null>(null)
  const [personalPhone, setPersonalPhone] = useState('')
  const [personalTelegram, setPersonalTelegram] = useState('')
  const [isSavingContacts, setIsSavingContacts] = useState(false)
  const [aiPermissions, setAiPermissions] = useState<AiPermissionsMap | null>(null)
  const [aiPermissionsLabels, setAiPermissionsLabels] = useState<Record<string, string> | null>(null)
  const [aiPermissionsLoading, setAiPermissionsLoading] = useState(true)
  const [aiPermissionsSaving, setAiPermissionsSaving] = useState(false)

  const whatsappAccounts = accounts.filter((a) => a.platform === 'whatsapp')
  const telegramAccounts = accounts.filter((a) => a.platform === 'telegram')

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [accRes, agrRes, profileRes] = await Promise.all([
          messengerApi.getAccounts(),
          messengerApi.getAgreementStatus(),
          messengerApi.getChatProfile().catch(() => null),
        ])
        const accountsData = accRes.accounts || []
        setAccounts(Array.isArray(accountsData) ? accountsData : [])
        setAgreedToTerms(!!agrRes.agreedToTerms)
        if (profileRes?.user) {
          if (profileRes.user.personalPhoneNumber !== undefined) {
            setPersonalPhone(profileRes.user.personalPhoneNumber)
          }
          if (profileRes.user.personalTelegramUsername !== undefined) {
            setPersonalTelegram(profileRes.user.personalTelegramUsername)
          }
        }
      } catch (error) {
        console.error('Failed to load initial messenger data:', error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchInitialData()
  }, [])

  useEffect(() => {
    if (!hasMessengerAuth) return
    setAiPermissionsLoading(true)
    messengerApi.getAiPermissions()
      .then((res) => {
        const clean: Record<string, boolean> = {}
        for (const [k, v] of Object.entries(res.data.general)) {
          if (typeof v === 'boolean') clean[k] = v
        }
        setAiPermissions(clean as AiPermissionsMap)
        setAiPermissionsLabels(res.data.labels)
      })
      .catch(() => {})
      .finally(() => setAiPermissionsLoading(false))
  }, [hasMessengerAuth])

  const [isGeneratingQr, setIsGeneratingQr] = useState(false)
  const lastWaAuthToastAtRef = useRef(0)

  useEffect(() => {
    const socket = getMessengerSocket()

    const handleQr = (data: any) => {
      setIsGeneratingQr(false)
      
      // Бэкенд возвращает объект: { accountId: '...', qrCode: 'data:image/png;base64,...' }
      let qrString = '';
      if (typeof data === 'string') {
        qrString = data;
      } else if (data && typeof data.qrCode === 'string') {
        qrString = data.qrCode;
      } else if (data && typeof data.qr === 'string') {
        qrString = data.qr;
      } else {
        console.warn('Unknown QR format:', data)
        return;
      }

      setQrCode(qrString)
    }

    const handleAuth = () => {
      const now = Date.now()
      if (now - lastWaAuthToastAtRef.current < 5000) return
      lastWaAuthToastAtRef.current = now

      setQrCode(null)
      setWaPendingAccountId(null)
      setShowConnectModal(null)
      addToast('WhatsApp успешно подключен', 'success')
      messengerApi.getAccounts().then((res) => {
        setAccounts(res.accounts || [])
      })
    }

    const handleWhatsappError = (payload: { accountId?: string; message?: string }) => {
      console.error('[Socket] WhatsApp error:', payload)
      setIsGeneratingQr(false)
      addToast(payload?.message || 'Ошибка при подключении WhatsApp', 'error')
    }

    const handleWhatsappDisconnected = (payload: { accountId: string }) => {
      console.warn('[Socket] WhatsApp disconnected:', payload.accountId);
      addToast('Сессия WhatsApp разорвана', 'error');
      messengerApi.getAccounts().then((res) => {
        setAccounts(res.accounts || [])
      })
    }

    const handleAccountUpdated = (account: Account) => {
      setAccounts(prev => prev.map(a => a._id === account._id ? account : a));
      if (!account.isActive) {
        addToast(`Аккаунт ${account.name}: сессия истекла`, 'error');
      }
    }

    const handleTelegramAuth = () => {
      setShowConnectModal(null)
      setTgAuthStep('phone')
      setTgPendingAccountId(null)
      setTgCode('')
      setTgPassword('')
      addToast('Telegram успешно подключен', 'success')
      messengerApi.getAccounts().then((res) => {
        setAccounts(res.accounts || [])
      })
    }

    socket.off('whatsapp:qr', handleQr)
    socket.off('whatsapp:authenticated', handleAuth)
    socket.off('whatsapp:error', handleWhatsappError)
    socket.off('whatsapp:disconnected', handleWhatsappDisconnected)
    socket.off('account:updated', handleAccountUpdated)
    socket.off('telegram:authenticated', handleTelegramAuth)

    socket.on('whatsapp:qr', handleQr)
    socket.on('whatsapp:authenticated', handleAuth)
    socket.on('whatsapp:error', handleWhatsappError)
    socket.on('whatsapp:disconnected', handleWhatsappDisconnected)
    socket.on('account:updated', handleAccountUpdated)
    socket.on('telegram:authenticated', handleTelegramAuth)

    return () => {
      socket.off('whatsapp:qr', handleQr)
      socket.off('whatsapp:authenticated', handleAuth)
      socket.off('whatsapp:error', handleWhatsappError)
      socket.off('whatsapp:disconnected', handleWhatsappDisconnected)
      socket.off('account:updated', handleAccountUpdated)
      socket.off('telegram:authenticated', handleTelegramAuth)
    }
  }, [addToast])

  // Timeout for QR code expiration
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (qrCode) {
      timeout = setTimeout(() => {
        setQrCode(null)
        addToast('Время ожидания QR-кода истекло. Пожалуйста, сгенерируйте новый.', 'error')
      }, 120000) // 2 minutes
    }
    return () => clearTimeout(timeout)
  }, [qrCode, addToast])

  const hasPendingTelegram = telegramAccounts.some((a) => a.telegramAuthStatus === 'pending')
  const hasPendingWhatsapp = whatsappAccounts.some((a) => a.whatsappAuthStatus === 'pending')

  const resumeTelegramConnection = (account: Account) => {
    setHasMessengerAuth(!!localStorage.getItem('msgr_jwt_token'))
    authenticateMessengerSocket()
    setTgPendingAccountId(account._id)
    setTgAccountName(account.name)
    setTgPhone(account.telegramPhoneNumber || '')
    setTgAuthStep('code')
    setShowConnectModal('telegram')
  }

  const openTelegramConnect = () => {
    const pendingAccount = telegramAccounts.find((a) => a.telegramAuthStatus === 'pending')
    if (pendingAccount) {
      resumeTelegramConnection(pendingAccount)
      return
    }
    setHasMessengerAuth(!!localStorage.getItem('msgr_jwt_token'))
    authenticateMessengerSocket()
    resetTelegramModal()
    setTgAccountName(
      telegramAccounts.length > 0
        ? `Telegram ${telegramAccounts.length + 1}`
        : 'Мой Telegram'
    )
    setShowConnectModal('telegram')
  }

  const openWhatsappConnect = () => {
    if (hasPendingWhatsapp) {
      addToast('Сначала завершите или отмените подключение WhatsApp в списке выше', 'info')
      return
    }
    setHasMessengerAuth(!!localStorage.getItem('msgr_jwt_token'))
    authenticateMessengerSocket()
    setWaAccountName(
      whatsappAccounts.length > 0
        ? `WhatsApp ${whatsappAccounts.length + 1}`
        : 'Мой WhatsApp'
    )
    setWaPendingAccountId(null)
    setQrCode(null)
    setIsGeneratingQr(false)
    lastWaAuthToastAtRef.current = 0
    setShowConnectModal('whatsapp')
  }

  const handleConnectWhatsapp = async () => {
    if (!hasMessengerAuth) {
      addToast('Сессия мессенджеров не найдена. Перезайдите в систему.', 'error')
      return
    }

    const name = waAccountName.trim()
    if (!name) {
      addToast('Укажите название аккаунта', 'info')
      return
    }

    try {
      setIsGeneratingQr(true)
      const res = await messengerApi.addWhatsApp(name)
      if (res.account?._id) {
        setWaPendingAccountId(res.account._id)
        setAccounts((prev) => {
          const without = prev.filter((a) => a._id !== res.account!._id)
          return [...without, res.account!]
        })
      }
      addToast('Инициализация WhatsApp...', 'info')
    } catch (error: any) {
      console.error('Failed to initiate WhatsApp connection:', error)
      if (error?.response?.status === 401) {
        setHasMessengerAuth(false)
        addToast('Сессия мессенджеров истекла. Перезайдите в систему.', 'error')
      } else {
        addToast('Ошибка при инициализации WhatsApp', 'error')
      }
      setIsGeneratingQr(false)
    }
  }

  const handleCloseConnectModal = async () => {
    if (showConnectModal === 'whatsapp' && waPendingAccountId) {
      const pending = accounts.find((a) => a._id === waPendingAccountId)
      if (pending && pending.whatsappAuthStatus === 'pending') {
        try {
          await messengerApi.deleteAccount(waPendingAccountId)
          setAccounts((prev) => prev.filter((a) => a._id !== waPendingAccountId))
        } catch (error) {
          console.error('Failed to cancel pending WhatsApp account:', error)
        }
      }
    }

    if (showConnectModal === 'telegram' && tgPendingAccountId) {
      const pending = accounts.find((a) => a._id === tgPendingAccountId)
      if (pending && pending.telegramAuthStatus === 'pending') {
        try {
          await messengerApi.deleteAccount(tgPendingAccountId)
          setAccounts((prev) => prev.filter((a) => a._id !== tgPendingAccountId))
        } catch (error) {
          console.error('Failed to cancel pending Telegram account:', error)
        }
      }
    }

    setShowConnectModal(null)
    setQrCode(null)
    setIsGeneratingQr(false)
    setWaPendingAccountId(null)
    setWaAccountName('')
    resetTelegramModal()
  }

  const resumeWhatsAppConnection = async (accountId: string) => {
    setWaPendingAccountId(accountId)
    setHasMessengerAuth(!!localStorage.getItem('msgr_jwt_token'))
    authenticateMessengerSocket()
    setShowConnectModal('whatsapp')
    setIsGeneratingQr(true)

    try {
      const status = await messengerApi.getWhatsAppStatus(accountId)
      if (status.qrCode) {
        setQrCode(status.qrCode)
        setIsGeneratingQr(false)
      } else if (status.status !== 'authenticated') {
        await messengerApi.addWhatsApp('My WhatsApp')
      }
    } catch (error) {
      console.error('Failed to resume WhatsApp connection:', error)
      setIsGeneratingQr(false)
    }
  }

  const accountStatusLabel = (account: Account) => {
    if (account.platform === 'whatsapp') {
      if (account.whatsappAuthStatus === 'authenticated') return 'Подключён'
      if (account.whatsappAuthStatus === 'pending') return 'Ожидание QR-кода'
      return 'Не подключён'
    }
    if (account.platform === 'telegram') {
      if (isTelegramConnected(account)) return 'Подключён'
      if (account.telegramAuthStatus === 'pending') return 'Ожидание кода'
      return 'Не подключён'
    }
    return ''
  }

  const resetTelegramModal = () => {
    setTgAuthStep('phone')
    setTgPendingAccountId(null)
    setTgAccountName('')
    setTgPhone('')
    setTgCode('')
    setTgPassword('')
  }

  const handleStartTelegramAuth = async () => {
    if (!tgAccountName || !tgPhone) return
    const phone = normalizePhoneInput(tgPhone)
    if (!phone) {
      addToast('Укажите номер телефона', 'error')
      return
    }
    if (!hasMessengerAuth) {
      addToast('Сессия мессенджеров не найдена. Перезайдите в систему.', 'error')
      return
    }

    try {
      setIsConnecting(true)
      setTgPhone(phone)
      const res = await messengerApi.startTelegramUserAuth(tgAccountName.trim(), phone)
      setTgPendingAccountId(res.account._id)
      setTgAuthStep('code')
      setAccounts((prev) => {
        const without = prev.filter((a) => a._id !== res.account._id)
        return [...without, res.account]
      })
      addToast(res.message || 'Код отправлен в Telegram', 'info')
    } catch (error: any) {
      console.error('Failed to start Telegram auth:', error)
      if (error?.response?.status === 401) {
        setHasMessengerAuth(false)
      }
      addToast(extractMessengerApiError(error, 'Ошибка при отправке кода'), 'error')
    } finally {
      setIsConnecting(false)
    }
  }

  const handleResendTelegramCode = async () => {
    if (!tgAccountName || !tgPhone) return
    await handleStartTelegramAuth()
  }

  const handleVerifyTelegramCode = async () => {
    if (!tgPendingAccountId || !tgCode) return

    try {
      setIsConnecting(true)
      const res = await messengerApi.verifyTelegramCode(tgPendingAccountId, tgCode.trim())
      if (res.needsPassword) {
        setTgAuthStep('password')
        addToast('Введите пароль двухфакторной аутентификации', 'info')
        return
      }
      setShowConnectModal(null)
      resetTelegramModal()
      const accountsRes = await messengerApi.getAccounts()
      setAccounts(accountsRes.accounts || [])
      addToast('Telegram успешно подключен. Синхронизация чатов...', 'success')
    } catch (error: any) {
      addToast(extractMessengerApiError(error, 'Неверный код'), 'error')
    } finally {
      setIsConnecting(false)
    }
  }

  const handleVerifyTelegramPassword = async () => {
    if (!tgPendingAccountId || !tgPassword) return

    try {
      setIsConnecting(true)
      await messengerApi.verifyTelegramPassword(tgPendingAccountId, tgPassword)
      setShowConnectModal(null)
      resetTelegramModal()
      const accountsRes = await messengerApi.getAccounts()
      setAccounts(accountsRes.accounts || [])
      addToast('Telegram успешно подключен. Синхронизация чатов...', 'success')
    } catch (error: any) {
      addToast(error?.response?.data?.error || 'Неверный пароль', 'error')
    } finally {
      setIsConnecting(false)
    }
  }

  const handleDeleteAccount = async (accountId: string) => {
    if (!window.confirm('Вы уверены, что хотите отключить этот аккаунт?')) return;
    try {
      await messengerApi.deleteAccount(accountId)
      addToast('Аккаунт успешно отключен', 'success')
      setAccounts(prev => prev.filter(a => a._id !== accountId))
    } catch (error) {
      console.error('Failed to delete account:', error)
      addToast('Ошибка при отключении аккаунта', 'error')
    }
  }

  const handleSaveAlertContacts = async () => {
    if (!hasMessengerAuth) {
      addToast('Сессия мессенджеров не найдена. Перезайдите в систему.', 'error')
      return
    }

    try {
      setIsSavingContacts(true)
      await messengerApi.updateChatProfile({
        personalPhoneNumber: personalPhone.trim(),
        personalTelegramUsername: personalTelegram.trim(),
      })
      addToast('Контакты для срочных уведомлений сохранены', 'success')
    } catch (error: any) {
      console.error('Failed to save alert contacts:', error)
      if (error?.response?.status === 401) {
        setHasMessengerAuth(false)
        addToast('Сессия мессенджеров истекла. Перезайдите в систему.', 'error')
      } else {
        addToast('Не удалось сохранить контакты', 'error')
      }
    } finally {
      setIsSavingContacts(false)
    }
  }

  const handleUpdateAgreement = async (agree: boolean) => {
    if (!hasMessengerAuth) {
      addToast('Сессия мессенджеров не найдена. Перезайдите в систему.', 'error')
      return
    }

    try {
      setIsConnecting(true)
      await messengerApi.updateAgreementStatus(agree)
      setAgreedToTerms(agree)
      if (!agree) {
        setShowConnectModal(null)
        addToast('Для подключения WhatsApp необходимо согласие', 'info')
        return
      }

      addToast('Согласие сохранено. Генерируем QR-код...', 'success')
      await handleConnectWhatsapp()
    } catch (error: any) {
      console.error('Failed to update agreement:', error)
      if (error?.response?.status === 401) {
        setHasMessengerAuth(false)
        addToast('Сессия мессенджеров истекла. Перезайдите в систему.', 'error')
      } else {
        addToast('Ошибка при сохранении согласия', 'error')
      }
    } finally {
      setIsConnecting(false)
    }
  }

  const handleToggleAiPermission = (key: string) => {
    if (!aiPermissions) return
    setAiPermissions((prev) => prev ? { ...prev, [key]: !prev[key as keyof AiPermissionsMap] } : prev)
  }

  const handleSaveAiPermissions = async () => {
    if (!hasMessengerAuth || !aiPermissions) {
      addToast('Сессия мессенджеров не найдена', 'error')
      return
    }
    try {
      setAiPermissionsSaving(true)
      const clean: Record<string, boolean> = {}
      for (const [k, v] of Object.entries(aiPermissions)) {
        if (typeof v === 'boolean') clean[k] = v
      }
      await messengerApi.updateAiPermissionsGeneral(clean as AiPermissionsMap)
      addToast('Настройки разрешений ИИ сохранены', 'success')
    } catch (error: any) {
      console.error('Failed to save AI permissions:', error)
      if (error?.response?.status === 401) {
        setHasMessengerAuth(false)
        addToast('Сессия мессенджеров истекла', 'error')
      } else {
        addToast('Не удалось сохранить настройки разрешений', 'error')
      }
    } finally {
      setAiPermissionsSaving(false)
    }
  }

  const handleApplyAiPermissionsToAll = async () => {
    if (!hasMessengerAuth) {
      addToast('Сессия мессенджеров не найдена', 'error')
      return
    }
    try {
      setAiPermissionsSaving(true)
      if (aiPermissions) {
        const clean: Record<string, boolean> = {}
        for (const [k, v] of Object.entries(aiPermissions)) {
          if (typeof v === 'boolean') clean[k] = v
        }
        await messengerApi.updateAiPermissionsGeneral(clean as AiPermissionsMap)
      }
      await messengerApi.applyAiPermissionsToAll()
      addToast('Общие настройки применены ко всем чатам', 'success')
    } catch (error: any) {
      console.error('Failed to apply AI permissions:', error)
      if (error?.response?.status === 401) {
        setHasMessengerAuth(false)
        addToast('Сессия мессенджеров истекла', 'error')
      } else {
        addToast('Не удалось применить настройки', 'error')
      }
    } finally {
      setAiPermissionsSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-medium text-[color:var(--app-text)]">{t('settings.chatSettingsTab.настройки_чатов')}</h2>
        <p className="text-sm text-[color:var(--app-text-muted)]">
          {t('settings.chatSettingsTab.управляйте_аккаунтам')}</p>
      </div>

      <div className="rounded-xl border border-[color:var(--hub-card-border)] bg-[var(--green-card)] p-5 flex flex-col gap-4 max-w-lg">
        <div>
          <h3 className="text-sm font-medium text-[color:var(--app-text)] m-0">{t('settings.chatSettingsTab.срочные_уведомления')}</h3>
          <p className="text-xs text-[color:var(--app-text-muted)] mt-1 mb-0">
            {t('settings.chatSettingsTab.если_клиент_напишет')}</p>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="personal-phone" className="text-sm font-medium text-[color:var(--app-text)]">
            {t('settings.chatSettingsTab.личный_номер')}</label>
          <input
            id="personal-phone"
            type="tel"
            value={personalPhone}
            onChange={(e) => setPersonalPhone(e.target.value)}
            placeholder="+7 999 123-45-67"
            className="w-full p-3 bg-[rgba(3,29,22,0.5)] border border-[color:var(--green-border)] rounded-lg text-white outline-none focus:border-[color:var(--gold)]"
          />
          <p className="text-xs text-[color:var(--app-text-muted)] m-0">
            {t('settings.chatSettingsTab.пересылка_в_whatsapp')}</p>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="personal-telegram" className="text-sm font-medium text-[color:var(--app-text)]">
            Telegram
          </label>
          <input
            id="personal-telegram"
            type="text"
            value={personalTelegram}
            onChange={(e) => setPersonalTelegram(e.target.value)}
            placeholder="username"
            className="w-full p-3 bg-[rgba(3,29,22,0.5)] border border-[color:var(--green-border)] rounded-lg text-white outline-none focus:border-[color:var(--gold)]"
          />
          <p className="text-xs text-[color:var(--app-text-muted)] m-0">
            {t('settings.chatSettingsTab.username_для_пересыл')}</p>
        </div>

        <button
          type="button"
          onClick={handleSaveAlertContacts}
          disabled={isSavingContacts}
          className="self-start px-4 py-2 rounded-lg border border-[color:var(--gold)] text-[color:var(--gold)] hover:bg-[color:var(--gold)] hover:text-[#1a1a1a] transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSavingContacts ? 'Сохранение...' : 'Сохранить'}
        </button>
      </div>

      <div className="rounded-xl border border-[color:var(--hub-card-border)] bg-[var(--green-card)] p-5 flex flex-col gap-4 max-w-lg">
        <div>
          <h3 className="text-sm font-medium text-[color:var(--app-text)] m-0 flex items-center gap-2">
            <Zap size={16} className="text-[color:var(--gold)]" />
            {t('settings.chatSettingsTab.разрешения_действий')}</h3>
          <p className="text-xs text-[color:var(--app-text-muted)] mt-1 mb-0">
            {t('settings.chatSettingsTab.вкл_требует_разрешен')}</p>
        </div>

        {aiPermissionsLoading ? (
          <div className="text-sm text-[color:var(--app-text-muted)]">{t('settings.chatSettingsTab.загрузка')}</div>
        ) : aiPermissions ? (
          <>
            <div className="flex flex-col gap-3">
              {Object.entries(aiPermissionsLabels || {}).filter(([key]) => key in aiPermissions).map(([key, label]) => {
                const value = aiPermissions[key as AiPermissionKey]
                return (
                  <div key={key} className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-sm text-[color:var(--app-text)]">{label}</span>
                      <span className="text-xs text-[color:var(--app-text-muted)]">
                        {value ? 'Требует разрешения' : 'Автоматически'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleAiPermission(key)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${value ? 'bg-[color:var(--gold)]' : 'bg-gray-600'}`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`}
                      />
                    </button>
                  </div>
                )
              })}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleSaveAiPermissions}
                disabled={aiPermissionsSaving}
                className="px-4 py-2 rounded-lg border border-[color:var(--gold)] text-[color:var(--gold)] hover:bg-[color:var(--gold)] hover:text-[#1a1a1a] transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {aiPermissionsSaving ? 'Сохранение...' : 'Сохранить'}
              </button>
              <button
                type="button"
                onClick={handleApplyAiPermissionsToAll}
                disabled={aiPermissionsSaving}
                className="px-4 py-2 rounded-lg border border-[color:var(--green-border)] text-[color:var(--app-text-muted)] hover:text-[color:var(--app-text)] hover:border-[color:var(--app-text-muted)] transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('settings.chatSettingsTab.применить_ко_всем_ча')}</button>
            </div>
          </>
        ) : (
          <div className="text-sm text-[color:var(--app-text-muted)]">
            {t('settings.chatSettingsTab.не_удалось_загрузить')}</div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Карточка Telegram */}
        <div className="rounded-xl border border-[color:var(--hub-card-border)] bg-[var(--green-card)] p-5 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <img src={telegramLogo} alt="Telegram" className="size-10 shrink-0" />
            <div>
              <h3 className="font-medium text-[color:var(--app-text)]">Telegram</h3>
              <p className="text-xs text-[color:var(--app-text-muted)]">{t('settings.chatSettingsTab.аккаунт_пользователя')}</p>
            </div>
          </div>
          
          <div className="flex flex-col gap-2">
            {isLoading ? (
              <div className="text-sm text-[color:var(--app-text-muted)]">{t('settings.chatSettingsTab.загрузка')}</div>
            ) : telegramAccounts.length > 0 ? (
              telegramAccounts.map((acc) => {
                const connected = isTelegramConnected(acc)
                const pending = acc.telegramAuthStatus === 'pending'
                return (
                <div key={acc._id} className="flex items-center justify-between bg-[color:var(--app-bg)] p-3 rounded-lg border border-[color:var(--hub-card-border)]">
                  <div className="flex items-center gap-2 min-w-0">
                    {connected ? (
                      <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                    ) : pending ? (
                      <AlertTriangle size={16} className="text-amber-500 shrink-0" />
                    ) : (
                      <AlertTriangle size={16} className="text-red-400 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <span className="text-sm text-[color:var(--app-text)] block truncate">{acc.name}</span>
                      <span className="text-xs text-[color:var(--app-text-muted)]">{accountStatusLabel(acc)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteAccount(acc._id)}
                    className="p-1.5 text-[color:var(--app-text-muted)] hover:text-red-500 transition-colors rounded-md hover:bg-red-500/10 shrink-0"
                    title={t('settings.chatSettingsTab.отключить_аккаунт')}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                )
              })
            ) : (
              <div className="text-sm text-[color:var(--app-text-muted)] flex items-center gap-2">
                <AlertTriangle size={14} className="text-amber-500" />
                {t('settings.chatSettingsTab.не_подключено')}</div>
            )}
          </div>

          <p className="text-xs text-[color:var(--app-text-muted)] m-0 leading-relaxed">
            {t('settings.chatSettingsTab.можно_подключить_нес')}</p>

          <button
            type="button"
            onClick={openTelegramConnect}
            disabled={isLoading}
            className="mt-auto flex items-center justify-center gap-2 w-full py-2.5 rounded-lg border border-[#229ED9] text-[#229ED9] hover:bg-[#229ED9] hover:text-white transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus size={16} />
            {hasPendingTelegram ? 'Продолжить подключение' : telegramAccounts.length === 0 ? 'Подключить Telegram' : 'Добавить аккаунт'}
          </button>
        </div>

        {/* Карточка WhatsApp */}
        <div className="rounded-xl border border-[color:var(--hub-card-border)] bg-[var(--green-card)] p-5 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <img src={whatsappLogo} alt="WhatsApp" className="size-10 shrink-0" />
            <div>
              <h3 className="font-medium text-[color:var(--app-text)]">WhatsApp</h3>
              <p className="text-xs text-[color:var(--app-text-muted)]">Web/Device API</p>
            </div>
          </div>
          
          <div className="flex flex-col gap-2">
            {isLoading ? (
              <div className="text-sm text-[color:var(--app-text-muted)]">{t('settings.chatSettingsTab.загрузка')}</div>
            ) : whatsappAccounts.length > 0 ? (
              whatsappAccounts.map((acc) => {
                const connected = isWhatsAppConnected(acc)
                const pending = acc.whatsappAuthStatus === 'pending'
                return (
                <div key={acc._id} className="flex items-center justify-between bg-[color:var(--app-bg)] p-3 rounded-lg border border-[color:var(--hub-card-border)]">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {connected ? (
                      <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                    ) : pending ? (
                      <AlertTriangle size={16} className="text-amber-500 shrink-0" />
                    ) : (
                      <AlertTriangle size={16} className="text-red-400 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <span className="text-sm text-[color:var(--app-text)] block truncate">{acc.name}</span>
                      <span className="text-xs text-[color:var(--app-text-muted)]">{accountStatusLabel(acc)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {pending && (
                      <button
                        type="button"
                        onClick={() => resumeWhatsAppConnection(acc._id)}
                        className="px-2 py-1 text-xs text-[#25D366] border border-[#25D366] rounded hover:bg-[#25D366]/10"
                      >
                        QR
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteAccount(acc._id)}
                      className="p-1.5 text-[color:var(--app-text-muted)] hover:text-red-500 transition-colors rounded-md hover:bg-red-500/10"
                      title={t('settings.chatSettingsTab.отключить_аккаунт')}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                )
              })
            ) : (
              <div className="text-sm text-[color:var(--app-text-muted)] flex items-center gap-2">
                <AlertTriangle size={14} className="text-amber-500" />
                {t('settings.chatSettingsTab.не_подключено')}</div>
            )}
          </div>

          <p className="text-xs text-[color:var(--app-text-muted)] m-0 leading-relaxed">
            {t('settings.chatSettingsTab.можно_подключить_нес')}</p>

          <button
            type="button"
            onClick={openWhatsappConnect}
            disabled={isLoading || hasPendingWhatsapp}
            className="mt-auto flex items-center justify-center gap-2 w-full py-2.5 rounded-lg border border-[#25D366] text-[#25D366] hover:bg-[#25D366] hover:text-white transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus size={16} />
            {whatsappAccounts.length === 0 ? 'Добавить WhatsApp' : 'Добавить аккаунт'}
          </button>
        </div>
      </div>

      {showConnectModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-[400px] bg-[var(--app-bg)] border border-[color:var(--green-border)] rounded-xl p-6 relative shadow-2xl">
            <button
              onClick={() => { void handleCloseConnectModal() }}
              className="absolute top-4 right-4 bg-transparent border-none text-[color:var(--app-text-muted)] hover:text-white cursor-pointer"
            >
              <X size={20} />
            </button>
            <h3 className="text-xl m-0 mb-5 text-[color:var(--gold)] font-medium">
              {t('settings.chatSettingsTab.подключение')}{showConnectModal === 'telegram' ? 'Telegram' : 'WhatsApp'}
            </h3>
            
            {showConnectModal === 'telegram' ? (
              <div className="flex flex-col gap-4">
                {!hasMessengerAuth ? (
                  <p className="text-sm text-red-400 m-0">
                    {t('settings.chatSettingsTab.сессия_мессенджеров')}</p>
                ) : tgAuthStep === 'phone' ? (
                  <>
                    <p className="text-sm text-[color:var(--app-text-muted)] m-0">
                      {t('settings.chatSettingsTab.подключите_свой_tele')}</p>
                    <input
                      value={tgAccountName}
                      onChange={(e) => setTgAccountName(e.target.value)}
                      placeholder={t('settings.chatSettingsTab.название_например_мо')}
                      className="w-full p-3 bg-[rgba(3,29,22,0.5)] border border-[color:var(--green-border)] rounded-lg text-white outline-none focus:border-[color:var(--gold)]"
                    />
                    <input
                      value={tgPhone}
                      onChange={(e) => setTgPhone(e.target.value)}
                      placeholder={t('settings.chatSettingsTab.номер_телефона_79991')}
                      className="w-full p-3 bg-[rgba(3,29,22,0.5)] border border-[color:var(--green-border)] rounded-lg text-white outline-none focus:border-[color:var(--gold)]"
                    />
                    <button
                      onClick={handleStartTelegramAuth}
                      disabled={isConnecting || !tgAccountName || !tgPhone}
                      className="mt-2 py-3 bg-[color:var(--gold)] text-[#1a1a1a] border-none rounded-lg cursor-pointer font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110"
                    >
                      {isConnecting ? 'Отправка кода...' : 'Получить код'}
                    </button>
                  </>
                ) : tgAuthStep === 'code' ? (
                  <>
                    <p className="text-sm text-[color:var(--app-text-muted)] m-0">
                      {t('settings.chatSettingsTab.введите_код_из_teleg')}</p>
                    <input
                      value={tgCode}
                      onChange={(e) => setTgCode(e.target.value)}
                      placeholder={t('settings.chatSettingsTab.код_подтверждения')}
                      className="w-full p-3 bg-[rgba(3,29,22,0.5)] border border-[color:var(--green-border)] rounded-lg text-white outline-none focus:border-[color:var(--gold)]"
                    />
                    <button
                      onClick={handleVerifyTelegramCode}
                      disabled={isConnecting || !tgCode}
                      className="mt-2 py-3 bg-[color:var(--gold)] text-[#1a1a1a] border-none rounded-lg cursor-pointer font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110"
                    >
                      {isConnecting ? 'Проверка...' : 'Подтвердить'}
                    </button>
                    <button
                      type="button"
                      onClick={handleResendTelegramCode}
                      disabled={isConnecting || !tgPhone}
                      className="py-2 text-sm text-[color:var(--gold)] bg-transparent border-none cursor-pointer disabled:opacity-50"
                    >
                      {t('settings.chatSettingsTab.отправить_код_повтор')}</button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-[color:var(--app-text-muted)] m-0">
                      {t('settings.chatSettingsTab.у_аккаунта_включена')}</p>
                    <input
                      type="password"
                      value={tgPassword}
                      onChange={(e) => setTgPassword(e.target.value)}
                      placeholder={t('settings.chatSettingsTab.пароль_2fa')}
                      className="w-full p-3 bg-[rgba(3,29,22,0.5)] border border-[color:var(--green-border)] rounded-lg text-white outline-none focus:border-[color:var(--gold)]"
                    />
                    <button
                      onClick={handleVerifyTelegramPassword}
                      disabled={isConnecting || !tgPassword}
                      className="mt-2 py-3 bg-[color:var(--gold)] text-[#1a1a1a] border-none rounded-lg cursor-pointer font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110"
                    >
                      {isConnecting ? 'Проверка...' : 'Войти'}
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-4 items-center text-center">
                {!hasMessengerAuth ? (
                  <p className="text-sm text-red-400 m-0">
                    {t('settings.chatSettingsTab.сессия_мессенджеров')}</p>
                ) : !agreedToTerms ? (
                  <div className="flex flex-col gap-5">
                    <p className="text-base text-[color:var(--app-text)] m-0 leading-relaxed">
                      {t('settings.chatSettingsTab.нажмите_на_кнопку_со')}</p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleUpdateAgreement(false)}
                        disabled={isConnecting}
                        className="flex-1 py-3 bg-[rgba(255,255,255,0.05)] border border-[color:var(--green-border)] text-white rounded-lg cursor-pointer font-medium hover:bg-[rgba(255,255,255,0.1)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {t('settings.chatSettingsTab.не_согласен')}</button>
                      <button
                        onClick={() => handleUpdateAgreement(true)}
                        disabled={isConnecting}
                        className="flex-1 py-3 bg-[color:var(--gold)] text-[#1a1a1a] border-none rounded-lg cursor-pointer font-semibold hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isConnecting ? 'Сохранение...' : 'Согласен'}
                      </button>
                    </div>
                  </div>
                ) : !qrCode ? (
                  <>
                    <p className="text-sm text-[color:var(--app-text-muted)] m-0">
                      {isGeneratingQr
                        ? 'Пожалуйста, подождите. Генерация QR-кода может занять до 30 секунд...'
                        : 'Укажите название и получите QR-код для привязки WhatsApp.'}
                    </p>
                    <input
                      value={waAccountName}
                      onChange={(e) => setWaAccountName(e.target.value)}
                      placeholder={t('settings.chatSettingsTab.название_например_ра')}
                      disabled={isGeneratingQr}
                      className="w-full p-3 bg-[rgba(3,29,22,0.5)] border border-[color:var(--green-border)] rounded-lg text-white outline-none focus:border-[color:var(--gold)] disabled:opacity-60"
                    />
                    <button
                      onClick={handleConnectWhatsapp}
                      disabled={isGeneratingQr || !waAccountName.trim()}
                      className="mt-2 py-3 w-full bg-[color:var(--gold)] text-[#1a1a1a] border-none rounded-lg cursor-pointer font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110"
                    >
                      {isGeneratingQr ? 'Генерация...' : 'Получить QR-код'}
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-[color:var(--app-text-muted)] m-0">
                      {t('settings.chatSettingsTab.откройте_whatsapp_на')}</p>
                    <div className="bg-white p-3 rounded-lg shadow-inner inline-flex items-center justify-center">
                      <img src={qrCode} alt="WhatsApp QR Code" style={{ width: 220, height: 220, display: 'block' }} />
                    </div>
                    <p className="text-xs text-[color:var(--gold)] animate-pulse m-0">
                      {t('settings.chatSettingsTab.ожидание_сканировани')}</p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="fixed bottom-6 right-6 z-[10001] flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <ChatToastItem key={toast.id} toast={toast} onRemove={removeToast} />
        ))}
      </div>
    </div>
  )
}

function ChatToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onRemove(toast.id), 5000)
    return () => clearTimeout(timer)
  }, [toast.id, onRemove])

  const bg =
    toast.type === 'success' ? '#064e3b' : toast.type === 'error' ? '#7f1d1d' : '#1e3a8a'
  const border =
    toast.type === 'success' ? '#059669' : toast.type === 'error' ? '#dc2626' : '#3b82f6'

  return (
    <div
      onClick={() => onRemove(toast.id)}
      className="pointer-events-auto cursor-pointer min-w-[220px] px-5 py-3 rounded-md text-white text-sm font-medium shadow-lg flex items-center justify-between gap-3"
      style={{ background: bg, border: `1px solid ${border}` }}
    >
      {toast.message}
      <X size={14} className="opacity-70 shrink-0" />
    </div>
  )
}
