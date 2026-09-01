import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiService, NotificationPriority, NotificationType, ProductType, UserRole, type CreateLeadDto, type Notification, type LeadFile } from '../../services/api';
import { PhoneInput } from '../../components/common/PhoneInput';
import { useI18n } from "@/i18n";

const Section: React.FC<{title: string, children: React.ReactNode}> = ({ title, children }) => (
  <div className="border border-gray-200 rounded-2xl p-4 space-y-4">
    <h2 className="text-lg font-normal">{title}</h2>
    {children}
  </div>
);

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
const ALLOWED_TYPES = [
  'image/jpeg', 'image/jpg', 'image/png',
  'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
];

// Функция для декодирования JWT токена
const decodeJWT = (token: string): { id?: string; role?: string; email?: string } | null => {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
};

// Функция для получения информации о текущем пользователе
const getCurrentUserInfo = (): { id?: string; role?: string; email?: string } => {
  const info: { id?: string; role?: string; email?: string } = {};
  
  // Пытаемся получить из JWT токена
  const jwtToken = localStorage.getItem('jwt_token');
  if (jwtToken) {
    const decoded = decodeJWT(jwtToken);
    if (decoded) {
      info.id = decoded.id;
      info.role = decoded.role;
      info.email = decoded.email;
    }
  }
  
  // Если нет в токене, пытаемся получить из localStorage
  if (!info.id) {
    const userId = localStorage.getItem('userId');
    if (userId) info.id = userId;
  }
  
  if (!info.role) {
    const userData = localStorage.getItem('user_data');
    if (userData) {
      try {
        const parsed = JSON.parse(userData);
        if (parsed.role) info.role = parsed.role;
        if (parsed.id && !info.id) info.id = parsed.id;
      } catch (e) {
        // ignore
      }
    }
  }
  
  if (!info.email) {
    const userEmail = localStorage.getItem('user_email');
    if (userEmail) info.email = userEmail;
  }
  
  return info;
};

const AdminDashboardPage: React.FC = () => {
    const { t } = useI18n();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<string>('');
  const [currentUser, setCurrentUser] = useState<{ id?: string; role?: string; email?: string }>({});

  useEffect(() => {
    const userInfo = getCurrentUserInfo();
    setCurrentUser(userInfo);
  }, []);

  // Notification form
  const [notif, setNotif] = useState({
    title: '',
    message: '',
    type: NotificationType.SYSTEM as NotificationType,
    priority: NotificationPriority.MEDIUM as NotificationPriority,
    userId: '',
  });
  const [notifFiles, setNotifFiles] = useState<File[]>([]);
  const [notifError, setNotifError] = useState<string | null>(null);

  // News form (для всех пользователей)
  const [newsTitle, setNewsTitle] = useState('');
  const [newsMessage, setNewsMessage] = useState('');
  const [newsFiles, setNewsFiles] = useState<File[]>([]);
  const [newsError, setNewsError] = useState<string | null>(null);

  // Daily task notification
  const [dailyTaskNotificationResult, setDailyTaskNotificationResult] = useState<string>('');
  const [sendingDailyTaskNotification, setSendingDailyTaskNotification] = useState(false);

  // Синхронизация рефералов (воронка СЕТЬ)
  const [referralsSyncResult, setReferralsSyncResult] = useState<string>('');
  const [referralsSyncLoading, setReferralsSyncLoading] = useState(false);

  // Lead form
  const [lead, setLead] = useState<CreateLeadDto>({
    name: '',
    phone: '',
    email: '',
    city: '',
    productType: ProductType.SALES,
    assignedTo: '',
    source: 'admin',
    notes: '',
  });

  // Auto-generate leads
  const [autoForAll, setAutoForAll] = useState(false);

  // User role management
  const [userEmail, setUserEmail] = useState('');
  const [userRole, setUserRole] = useState('agent');
  const [userInfo, setUserInfo] = useState<any>(null);
  const [batchUpdates, setBatchUpdates] = useState<Array<{ email: string; role: string }>>([{ email: '', role: 'agent' }]);
  const [roleResult, setRoleResult] = useState<string>('');

  const disabledNotif = useMemo(() => !notif.title || !notif.userId, [notif]);
  const disabledNews = useMemo(() => !newsTitle || !newsMessage, [newsTitle, newsMessage]);
  const disabledLead = useMemo(() => !lead.name || !lead.phone || !lead.assignedTo, [lead]);

  const validateFiles = (files: File[]) => {
    for (const f of files) {
      if (f.size > MAX_FILE_SIZE) return `Файл ${f.name} превышает 25MB`;
      if (!ALLOWED_TYPES.includes(f.type)) return `Неподдерживаемый тип файла: ${f.name}`;
    }
    return null;
  };

  const onNotifFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const err = validateFiles(files);
    setNotifError(err);
    if (!err) setNotifFiles(files);
  };
  const onNewsFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const err = validateFiles(files);
    setNewsError(err);
    if (!err) setNewsFiles(files);
  };

  const uploadFilesToNotification = async (notificationId: string, files: File[]) => {
    if (!files.length) return { ok: true } as const;
    try {
      if (files.length === 1) {
        const res = await apiService.uploadNotificationFile(notificationId, files[0]);
        return { ok: !!res.success, data: res.data } as const;
      } else {
        const res = await apiService.uploadNotificationFilesBulk(notificationId, files);
        return { ok: !!res.success, data: res.data } as const;
      }
    } catch (e) {
      return { ok: false } as const;
    }
  };

  const verifyAttachments = async (notificationId: string, beforeCount: number, expectedAdded: number) => {
    try {
      const res = await apiService.getNotification(notificationId);
      const newCount = res?.data?.attachments?.length ?? 0;
      const ok = res.success && newCount >= beforeCount + expectedAdded;
      return { ok, newCount } as const;
    } catch {
      return { ok: false, newCount: beforeCount } as const;
    }
  };

  const createNotification = async () => {
    setCreating(true); setResult(''); setNotifError(null);
    try {
      // Шаг 1: создаём уведомление без файлов
      const res = await apiService.adminCreateNotification({
        title: notif.title,
        message: notif.message,
        type: notif.type,
        priority: notif.priority,
        userId: notif.userId,
      });
      if (!res.success || !res.data) {
        setResult(res.message || 'Ошибка');
        return;
      }
      const created = res.data as Notification;
      const before = (created.attachments?.length) || 0;
      let summary = 'Уведомление создано';

      // Шаг 2: загружаем файлы, если есть
      if (notifFiles.length) {
        const up = await uploadFilesToNotification(created._id, notifFiles);
        const ver = await verifyAttachments(created._id, before, notifFiles.length);
        if (!up.ok) {
          summary += ' (ошибка загрузки вложений)';
        } else if (!ver.ok) {
          summary += ` (загружено вложений: ${ver.newCount - before} из ${notifFiles.length})`;
        } else {
          summary += ` (+${notifFiles.length} вложений)`;
        }
      }

      setResult(summary);
      setNotifFiles([]);
      // Очищаем форму после успешного создания
      setNotif({
        title: '',
        message: '',
        type: NotificationType.SYSTEM,
        priority: NotificationPriority.MEDIUM,
        userId: '',
      });
    } catch (e: any) {
      setResult(e?.response?.data?.message || 'Ошибка');
    } finally { setCreating(false); }
  };

  const createNews = async () => {
    setCreating(true); setResult(''); setNewsError(null);
    try {
      const res = await apiService.adminCreateNews({
        title: newsTitle,
        message: newsMessage,
      });
      if (!res.success) {
        setResult(res.message || 'Ошибка');
        return;
      }
      
      // Согласно документации, ответ имеет структуру { created: number, items: Notification[] }
      const data = res.data;
      const created = data?.created || 0;
      const arr = data?.items || [];

      let uploadedOk = 0;
      let verifiedOk = 0;
      let total = arr.length;

      if (arr.length && newsFiles.length) {
        for (const n of arr) {
          const before = (n.attachments?.length) || 0;
          const up = await uploadFilesToNotification(n._id, newsFiles);
          if (up.ok) uploadedOk++;
          const ver = await verifyAttachments(n._id, before, newsFiles.length);
          if (ver.ok) verifiedOk++;
        }
      }

      const base = `Новости разосланы (создано: ${created}, всего: ${total})`;
      let suffix = '';
      if (newsFiles.length) {
        suffix = `; загрузка: ${uploadedOk}/${total}, проверка: ${verifiedOk}/${total}`;
      }

      setResult(base + suffix);
      setNewsFiles([]);
      setNewsTitle('');
      setNewsMessage('');
    } catch (e: any) {
      setResult(e?.response?.data?.message || 'Ошибка');
    } finally { setCreating(false); }
  };

  const sendDailyTaskNotification = async () => {
    setSendingDailyTaskNotification(true);
    setDailyTaskNotificationResult('');
    try {
      const res = await apiService.adminSendDailyTaskNotification();
      if (res.success && res.data) {
        const { message, notification } = res.data;
        if (notification) {
          setDailyTaskNotificationResult(`Успешно: ${message}. Уведомление создано (ID: ${notification._id})`);
        } else {
          setDailyTaskNotificationResult(`Информация: ${message || 'Нет задач на сегодня'}`);
        }
      } else {
        setDailyTaskNotificationResult(res.message || 'Ошибка при отправке уведомления');
      }
    } catch (e: any) {
      setDailyTaskNotificationResult(e?.response?.data?.message || e?.message || 'Ошибка при отправке уведомления');
    } finally {
      setSendingDailyTaskNotification(false);
    }
  };

  const triggerReferralsSync = async () => {
    setReferralsSyncLoading(true);
    setReferralsSyncResult('');
    try {
      const res = await apiService.adminReferralsSync();
      if (res.success && res.data) {
        setReferralsSyncResult(res.data.message || 'Синхронизация запущена');
      } else {
        setReferralsSyncResult(res.message || 'Ошибка');
      }
    } catch (e: any) {
      setReferralsSyncResult(e?.response?.data?.message || e?.message || 'Ошибка запроса');
    } finally {
      setReferralsSyncLoading(false);
    }
  };

  const createLead = async () => {
    setCreating(true); setResult('');
    try {
      const res = await apiService.adminCreateLeadManual(lead, false);
      if (res.success) {
        setResult('Лид создан успешно');
        // Очищаем форму после успешного создания
        setLead({
          name: '',
          phone: '',
          email: '',
          city: '',
          productType: ProductType.SALES,
          assignedTo: '',
          source: 'admin',
          notes: '',
        });
      } else {
        setResult(res.message || 'Ошибка');
      }
    } catch (e: any) {
      setResult(e?.response?.data?.message || 'Ошибка');
    } finally { setCreating(false); }
  };

  // Генерация случайных данных для лида
  const generateRandomLeadData = (): { name: string; phone: string; email: string } => {
    const firstNames = ['Иван', 'Петр', 'Сергей', 'Александр', 'Дмитрий', 'Андрей', 'Михаил', 'Николай', 'Владимир', 'Алексей'];
    const lastNames = ['Иванов', 'Петров', 'Сидоров', 'Смирнов', 'Кузнецов', 'Попов', 'Соколов', 'Лебедев', 'Козлов', 'Новиков'];
    const domains = ['gmail.com', 'mail.ru', 'yandex.ru', 'outlook.com'];
    
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const name = `${firstName} ${lastName}`;
    
    const phone = `+7${Math.floor(9000000000 + Math.random() * 999999999)}`;
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${Math.floor(Math.random() * 1000)}@${domains[Math.floor(Math.random() * domains.length)]}`;
    
    return { name, phone, email };
  };

  const autoGenerateLeads = async () => {
    setCreating(true); 
    setResult('');
    
    try {
      // Определяем, для скольких пользователей создавать лиды
      const userIds: string[] = [];
      
      if (autoForAll) {
        // Если "для всех", создаем по одному лиду (в реальности нужно получить список всех пользователей)
        // Пока создаем один лид с случайным assignedTo
        const currentUserId = localStorage.getItem('userId') || '690ca643abbceba815ba7090';
        userIds.push(currentUserId);
      } else {
        // Для конкретного пользователя
        if (lead.assignedTo) {
          userIds.push(lead.assignedTo);
        } else {
          setResult('Ошибка: не указан пользователь для назначения');
          setCreating(false);
          return;
        }
      }
      
      let created = 0;
      let failed = 0;
      const errors: string[] = [];
      
      // Создаем лиды используя обычный метод createLead (как в разделе лидов)
      for (const userId of userIds) {
        try {
          const randomData = generateRandomLeadData();
          
          const createLeadDto = {
            name: randomData.name,
            phone: randomData.phone,
            email: randomData.email,
            productType: ProductType.SALES,
            assignedTo: userId,
            source: 'admin-auto',
            notes: 'Автоматически сгенерированный лид',
          };
          
          const response = await apiService.createLead(createLeadDto);
          
          if (response.success) {
            created++;
          } else {
            failed++;
            errors.push(response.message || 'Неизвестная ошибка');
          }
        } catch (error: any) {
          failed++;
          const errorMsg = error?.response?.data?.message || error?.message || 'Ошибка при создании';
          errors.push(errorMsg);
          console.error('Error creating lead:', error);
        }
      }
      
      if (created > 0) {
        setResult(`Успешно создано лидов: ${created}${failed > 0 ? `, ошибок: ${failed}` : ''}`);
        if (errors.length > 0) {
          console.error('Errors:', errors);
        }
      } else {
        setResult(`Ошибка: не удалось создать лиды. ${errors[0] || 'Неизвестная ошибка'}`);
      }
    } catch (e: any) {
      setResult(e?.response?.data?.message || e?.message || 'Ошибка при генерации лидов');
    } finally { 
      setCreating(false); 
    }
  };

  const getUserInfo = async () => {
    if (!userEmail.trim()) {
      setRoleResult('Введите email адрес');
      return;
    }
    setCreating(true);
    setRoleResult('');
    try {
      const res = await apiService.adminGetUserInfo(userEmail.trim());
      if (res.success && res.data) {
        setUserInfo(res.data);
        setUserRole(res.data.role);
        setRoleResult(`Пользователь найден: ${res.data.name} (${res.data.role})`);
      } else {
        setRoleResult(res.message || 'Пользователь не найден');
        setUserInfo(null);
      }
    } catch (e: any) {
      setRoleResult(e?.response?.data?.message || e?.message || 'Ошибка при получении информации');
      setUserInfo(null);
    } finally {
      setCreating(false);
    }
  };

  const updateUserRole = async () => {
    if (!userEmail.trim()) {
      setRoleResult('Введите email адрес');
      return;
    }
    setCreating(true);
    setRoleResult('');
    try {
      const res = await apiService.adminUpdateUserRole(userEmail.trim(), userRole);
      if (res.success && res.data) {
        setRoleResult(`Успешно: ${res.data.message}`);
        setUserInfo({ ...userInfo, role: res.data.newRole });
      } else {
        setRoleResult(res.message || 'Ошибка при обновлении роли');
      }
    } catch (e: any) {
      setRoleResult(e?.response?.data?.message || e?.message || 'Ошибка при обновлении роли');
    } finally {
      setCreating(false);
    }
  };

  const updateBatchRoles = async () => {
    const validUpdates = batchUpdates.filter(u => u.email.trim() && u.role);
    if (validUpdates.length === 0) {
      setRoleResult('Добавьте хотя бы одно обновление');
      return;
    }
    setCreating(true);
    setRoleResult('');
    try {
      const res = await apiService.adminUpdateUsersRoles(validUpdates.map(u => ({
        email: u.email.trim(),
        role: u.role
      })));
      if (res.success && res.data) {
        const { updated, total, results, errors } = res.data;
        let message = `Обновлено: ${updated} из ${total}`;
        if (results.length > 0) {
          message += '\nУспешно:\n' + results.map(r => `  - ${r.email}: ${r.oldRole} → ${r.newRole}`).join('\n');
        }
        if (errors.length > 0) {
          message += '\nОшибки:\n' + errors.map(e => `  - ${e}`).join('\n');
        }
        setRoleResult(message);
        // Очищаем форму после успешного обновления
        setBatchUpdates([{ email: '', role: 'agent' }]);
      } else {
        setRoleResult(res.message || 'Ошибка при массовом обновлении');
      }
    } catch (e: any) {
      setRoleResult(e?.response?.data?.message || e?.message || 'Ошибка при массовом обновлении');
    } finally {
      setCreating(false);
    }
  };

  const addBatchUpdate = () => {
    setBatchUpdates([...batchUpdates, { email: '', role: 'agent' }]);
  };

  const removeBatchUpdate = (index: number) => {
    setBatchUpdates(batchUpdates.filter((_, i) => i !== index));
  };

  const updateBatchUpdate = (index: number, field: 'email' | 'role', value: string) => {
    const updated = [...batchUpdates];
    updated[index] = { ...updated[index], [field]: value };
    setBatchUpdates(updated);
  };

  // Base Files Management
  const [baseFiles, setBaseFiles] = useState<LeadFile[]>([]);
  const [baseFilesProductType, setBaseFilesProductType] = useState<ProductType>(ProductType.SALES);
  const [baseFilesLoading, setBaseFilesLoading] = useState(false);
  const [baseFilesUploading, setBaseFilesUploading] = useState(false);
  const [baseFilesDeleting, setBaseFilesDeleting] = useState<string | null>(null);
  const [baseFilesError, setBaseFilesError] = useState<string | null>(null);
  const [baseFilesSelected, setBaseFilesSelected] = useState<File[]>([]);
  const [baseFilesResult, setBaseFilesResult] = useState<string>('');

  const loadBaseFiles = async () => {
    setBaseFilesLoading(true);
    setBaseFilesError(null);
    try {
      const response = await apiService.getBaseFiles(baseFilesProductType);
      if (response.success && response.data) {
        setBaseFiles(response.data.files || []);
      } else {
        setBaseFilesError(response.message || 'Ошибка при загрузке файлов');
        setBaseFiles([]);
      }
    } catch (e: any) {
      setBaseFilesError(e?.response?.data?.message || e?.message || 'Ошибка при загрузке файлов');
      setBaseFiles([]);
    } finally {
      setBaseFilesLoading(false);
    }
  };

  useEffect(() => {
    loadBaseFiles();
  }, [baseFilesProductType]);

  const onBaseFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 10) {
      setBaseFilesError('Максимум 10 файлов за раз');
      return;
    }
    setBaseFilesError(null);
    setBaseFilesSelected(files);
  };

  const uploadBaseFiles = async () => {
    if (baseFilesSelected.length === 0) {
      setBaseFilesError('Выберите файлы для загрузки');
      return;
    }
    
    const adminToken = localStorage.getItem('admin_token') || sessionStorage.getItem('admin_token');
    if (!adminToken) {
      setBaseFilesError('Токен админки не найден. Пожалуйста, войдите заново.');
      return;
    }
    setBaseFilesUploading(true);
    setBaseFilesError(null);
    setBaseFilesResult('');
    try {
      const response = await apiService.uploadBaseFiles(baseFilesSelected, baseFilesProductType, adminToken);
      if (response.success && response.data) {
        setBaseFilesResult(`Успешно загружено ${response.data.uploadedCount} файлов`);
        setBaseFilesSelected([]);
        // Очищаем input
        const fileInput = document.getElementById('baseFilesInput') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
        // Перезагружаем список файлов
        await loadBaseFiles();
      } else {
        setBaseFilesError(response.message || 'Ошибка при загрузке файлов');
      }
    } catch (e: any) {
      // Обработка ошибки 413 (Content Too Large) - если сервер вернет эту ошибку
      if (e?.response?.status === 413) {
        const calculatedTotalSize = baseFilesSelected.reduce((sum, file) => sum + file.size, 0);
        const totalSizeMB = (calculatedTotalSize / (1024 * 1024)).toFixed(2);
        setBaseFilesError(`Файлы слишком большие для загрузки (общий размер: ${totalSizeMB}MB). Пожалуйста, уменьшите размер файлов или загрузите их по частям.`);
      } else {
        setBaseFilesError(e?.response?.data?.message || e?.message || 'Ошибка при загрузке файлов');
      }
    } finally {
      setBaseFilesUploading(false);
    }
  };

  const deleteBaseFile = async (fileId: string) => {
    if (!confirm('Вы уверены, что хотите удалить этот файл?')) {
      return;
    }
    const adminToken = localStorage.getItem('admin_token') || sessionStorage.getItem('admin_token');
    if (!adminToken) {
      setBaseFilesError('Токен админки не найден. Пожалуйста, войдите заново.');
      return;
    }
    setBaseFilesDeleting(fileId);
    setBaseFilesError(null);
    try {
      const response = await apiService.deleteBaseFile(fileId, adminToken);
      if (response.success) {
        setBaseFilesResult('Файл успешно удален');
        // Перезагружаем список файлов
        await loadBaseFiles();
      } else {
        setBaseFilesError(response.message || 'Ошибка при удалении файла');
      }
    } catch (e: any) {
      setBaseFilesError(e?.response?.data?.message || e?.message || 'Ошибка при удалении файла');
    } finally {
      setBaseFilesDeleting(null);
    }
  };

  const decodeFilename = (name?: string): string => {
    if (!name) return '';
    try {
      return decodeURIComponent(escape(name)) || name;
    } catch {
      return name;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const logout = () => {
    sessionStorage.removeItem('admin_token');
    localStorage.removeItem('admin_token');
    // Очищаем JWT токен, если он был получен через админский логин
    // (опционально, можно оставить для других запросов)
    // localStorage.removeItem('jwt_token');
    navigate('/admin/login', { replace: true });
  };

  const getRoleLabel = (role?: string): string => {
    if (!role) return 'Неизвестно';
    const roleMap: Record<string, string> = {
      [UserRole.AGENT]: 'Агент',
      [UserRole.MENTOR]: 'Ментор',
      [UserRole.MANAGER]: 'Менеджер',
      [UserRole.ADMIN]: 'Администратор',
    };
    return roleMap[role] || role;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-normal">{t('crm.admin.adminDashboardPage.админ_панель')}</h1>
            {(currentUser.id || currentUser.email || currentUser.role) && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm">
                <span className="text-gray-600">{t('crm.admin.adminDashboardPage.аккаунт')}</span>
                {currentUser.email && (
                  <span className="font-medium text-gray-800">{currentUser.email}</span>
                )}
                {currentUser.role && (
                  <span className="text-gray-500">
                    ({getRoleLabel(currentUser.role)})
                  </span>
                )}
                {currentUser.id && !currentUser.email && (
                  <span className="text-gray-500 text-xs">ID: {currentUser.id.substring(0, 8)}...</span>
                )}
              </div>
            )}
          </div>
          <button className="text-red-600" onClick={logout}>{t('crm.admin.adminDashboardPage.выйти')}</button>
        </div>

        <Section title={t('crm.admin.adminDashboardPage.создать_уведомление')}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input 
              className="border rounded-xl px-3 py-2" 
              placeholder={t('crm.admin.adminDashboardPage.заголовок')} 
              value={notif.title} 
              onChange={e=>setNotif({...notif,title:e.target.value})} 
            />
            <input 
              className="border rounded-xl px-3 py-2" 
              placeholder={t('crm.admin.adminDashboardPage.пользователь_id')} 
              value={notif.userId} 
              onChange={e=>setNotif({...notif,userId:e.target.value})} 
            />
            <textarea 
              className="border rounded-xl px-3 py-2 md:col-span-2" 
              placeholder={t('crm.admin.adminDashboardPage.сообщение')} 
              rows={3}
              value={notif.message} 
              onChange={e=>setNotif({...notif,message:e.target.value})} 
            />
            <div className="flex gap-2">
              <select 
                className="border rounded-xl px-3 py-2 flex-1" 
                value={notif.type} 
                onChange={e=>setNotif({...notif,type:e.target.value as NotificationType})}
              >
                {Object.values(NotificationType).map(v=> <option key={v} value={v}>{v}</option>)}
              </select>
              <select 
                className="border rounded-xl px-3 py-2 flex-1" 
                value={notif.priority} 
                onChange={e=>setNotif({...notif,priority:e.target.value as NotificationPriority})}
              >
                {Object.values(NotificationPriority).map(v=> <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div className='md:col-span-2'>
              <label className='block text-sm mb-1'>{t('crm.admin.adminDashboardPage.вложения_изображения')}</label>
              <input type='file' multiple onChange={onNotifFilesChange} />
              <div className='text-xs text-gray-500 mt-1'>{t('crm.admin.adminDashboardPage.допустимые_типы_jpg')}</div>
              {notifError && <div className='text-red-600 text-sm mt-1'>{notifError}</div>}
              {notifFiles.length > 0 && (
                <div className='mt-2 text-sm text-gray-600'>{t('crm.admin.adminDashboardPage.выбрано_файлов')}{notifFiles.length}</div>
              )}
            </div>
          </div>
          <button disabled={creating || disabledNotif} className="bg-dream-primary text-white rounded-xl px-4 py-2 disabled:opacity-60" onClick={createNotification}>{t('crm.admin.adminDashboardPage.создать')}</button>
        </Section>

        <Section title={t('crm.admin.adminDashboardPage.разослать_новости_вс')}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input className="border rounded-xl px-3 py-2" placeholder={t('crm.admin.adminDashboardPage.заголовок')} value={newsTitle} onChange={e=>setNewsTitle(e.target.value)} />
            <textarea className="border rounded-xl px-3 py-2 md:col-span-2" placeholder={t('crm.admin.adminDashboardPage.текст')} value={newsMessage} onChange={e=>setNewsMessage(e.target.value)} />
            <div className='md:col-span-2'>
              <label className='block text-sm mb-1'>{t('crm.admin.adminDashboardPage.вложения_к_новости_и')}</label>
              <input type='file' multiple onChange={onNewsFilesChange} />
              <div className='text-xs text-gray-500 mt-1'>{t('crm.admin.adminDashboardPage.допустимые_типы_jpg')}</div>
              {newsError && <div className='text-red-600 text-sm mt-1'>{newsError}</div>}
              {newsFiles.length > 0 && (
                <div className='mt-2 text-sm text-gray-600'>{t('crm.admin.adminDashboardPage.выбрано_файлов')}{newsFiles.length}</div>
              )}
            </div>
          </div>
          <button disabled={creating || disabledNews} className="bg-dream-primary text-white rounded-xl px-4 py-2 disabled:opacity-60" onClick={createNews}>{t('crm.admin.adminDashboardPage.отправить')}</button>
        </Section>

        <Section title={t('crm.admin.adminDashboardPage.принудительная_отпра')}>
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              {t('crm.admin.adminDashboardPage.отправляет_уведомлен')}</p>
            <button
              disabled={sendingDailyTaskNotification}
              className="bg-dream-primary text-white rounded-xl px-4 py-2 disabled:opacity-60"
              onClick={sendDailyTaskNotification}
            >
              {sendingDailyTaskNotification ? 'Отправка...' : 'Отправить уведомление о задачах'}
            </button>
            {dailyTaskNotificationResult && (
              <div className={`p-3 border rounded-xl text-sm ${
                dailyTaskNotificationResult.includes('Успешно') 
                  ? 'bg-green-50 text-green-700 border-green-200' 
                  : dailyTaskNotificationResult.includes('Ошибка')
                  ? 'bg-red-50 text-red-700 border-red-200'
                  : 'bg-blue-50 text-blue-700 border-blue-200'
              }`}>
                {dailyTaskNotificationResult}
              </div>
            )}
          </div>
        </Section>

        <Section title={t('crm.admin.adminDashboardPage.синхронизация_рефера')}>
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              {t('crm.admin.adminDashboardPage.запускает_принудител')}</p>
            <button
              disabled={referralsSyncLoading}
              className="bg-dream-primary text-white rounded-xl px-4 py-2 disabled:opacity-60"
              onClick={triggerReferralsSync}
            >
              {referralsSyncLoading ? 'Запуск...' : 'Запустить синхронизацию'}
            </button>
            {referralsSyncResult && (
              <div className={`p-3 border rounded-xl text-sm ${
                referralsSyncResult.includes('Ошибка') ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'
              }`}>
                {referralsSyncResult}
              </div>
            )}
          </div>
        </Section>

        <Section title={t('crm.admin.adminDashboardPage.создать_лид')}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input className="border rounded-xl px-3 py-2" placeholder={t('crm.admin.adminDashboardPage.имя')} value={lead.name} onChange={e=>setLead({...lead,name:e.target.value})} />
            <PhoneInput className="border rounded-xl px-3 py-2" placeholder={t('crm.admin.adminDashboardPage.телефон')} value={lead.phone} onChange={(phone)=>setLead({...lead,phone})} />
            <input className="border rounded-xl px-3 py-2" placeholder="Email" value={lead.email || ''} onChange={e=>setLead({...lead,email:e.target.value})} />
            <input className="border rounded-xl px-3 py-2" placeholder={t('crm.admin.adminDashboardPage.город')} value={lead.city || ''} onChange={e=>setLead({...lead,city:e.target.value})} />
            <input className="border rounded-xl px-3 py-2" placeholder="AssignedTo (userId)" value={lead.assignedTo} onChange={e=>setLead({...lead,assignedTo:e.target.value})} />
            <select className="border rounded-xl px-3 py-2" value={lead.productType} onChange={e=>setLead({...lead,productType:e.target.value as any})}>
              {Object.values(ProductType).map(v=> <option key={v} value={v}>{v}</option>)}
            </select>
            <textarea className="border rounded-xl px-3 py-2 md:col-span-2" placeholder={t('crm.admin.adminDashboardPage.заметки')} value={lead.notes || ''} onChange={e=>setLead({...lead,notes:e.target.value})} />
          </div>
          <div className="flex items-center gap-3">
            <button disabled={creating || disabledLead} className="bg-dream-primary text-white rounded-xl px-4 py-2 disabled:opacity-60" onClick={createLead}>{t('crm.admin.adminDashboardPage.создать')}</button>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={autoForAll} onChange={e=>setAutoForAll(e.target.checked)} /> {t('crm.admin.adminDashboardPage.для_всех')}</label>
              <button disabled={creating || (!autoForAll && !lead.assignedTo)} className="bg-emerald-600 text-white rounded-xl px-4 py-2 disabled:opacity-60" onClick={autoGenerateLeads}>{t('crm.admin.adminDashboardPage.авто_создание')}</button>
            </div>
          </div>
        </Section>

        <Section title={t('crm.admin.adminDashboardPage.управление_ролями_по')}>
          <div className="space-y-6">
            {/* Получение информации о пользователе и обновление роли */}
            <div className="border-b pb-4">
              <h3 className="text-md font-normal mb-3">{t('crm.admin.adminDashboardPage.обновление_роли_одно')}</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  className="border rounded-xl px-3 py-2"
                  placeholder={t('crm.admin.adminDashboardPage.email_пользователя')}
                  value={userEmail}
                  onChange={e => setUserEmail(e.target.value)}
                />
                <select
                  className="border rounded-xl px-3 py-2"
                  value={userRole}
                  onChange={e => setUserRole(e.target.value)}
                >
                  <option value="agent">{t('crm.admin.adminDashboardPage.агент')}</option>
                  <option value="mentor">{t('crm.admin.adminDashboardPage.ментор')}</option>
                  <option value="manager">{t('crm.admin.adminDashboardPage.менеджер')}</option>
                  <option value="admin">{t('crm.admin.adminDashboardPage.администратор')}</option>
                </select>
                <div className="flex gap-2">
                  <button
                    disabled={creating || !userEmail.trim()}
                    className="bg-blue-600 text-white rounded-xl px-4 py-2 disabled:opacity-60 flex-1"
                    onClick={getUserInfo}
                  >
                    {t('crm.admin.adminDashboardPage.найти')}</button>
                  <button
                    disabled={creating || !userEmail.trim()}
                    className="bg-dream-primary text-white rounded-xl px-4 py-2 disabled:opacity-60 flex-1"
                    onClick={updateUserRole}
                  >
                    {t('crm.admin.adminDashboardPage.обновить')}</button>
                </div>
              </div>
              {userInfo && (
                <div className="mt-3 p-3 bg-gray-50 rounded-xl text-sm">
                  <div><strong>{t('crm.admin.adminDashboardPage.имя')}</strong> {userInfo.name}</div>
                  <div><strong>Email:</strong> {userInfo.email}</div>
                  <div><strong>{t('crm.admin.adminDashboardPage.текущая_роль')}</strong> {userInfo.role}</div>
                  {userInfo.phone && <div><strong>{t('crm.admin.adminDashboardPage.телефон')}</strong> {userInfo.phone}</div>}
                </div>
              )}
            </div>

            {/* Массовое обновление ролей */}
            <div>
              <h3 className="text-md font-normal mb-3">{t('crm.admin.adminDashboardPage.массовое_обновление')}</h3>
              <div className="space-y-2">
                {batchUpdates.map((update, index) => (
                  <div key={index} className="grid grid-cols-1 md:grid-cols-4 gap-2">
                    <input
                      className="border rounded-xl px-3 py-2"
                      placeholder={t('crm.admin.adminDashboardPage.email_пользователя')}
                      value={update.email}
                      onChange={e => updateBatchUpdate(index, 'email', e.target.value)}
                    />
                    <select
                      className="border rounded-xl px-3 py-2"
                      value={update.role}
                      onChange={e => updateBatchUpdate(index, 'role', e.target.value)}
                    >
                      <option value="agent">{t('crm.admin.adminDashboardPage.агент')}</option>
                      <option value="mentor">{t('crm.admin.adminDashboardPage.ментор')}</option>
                      <option value="manager">{t('crm.admin.adminDashboardPage.менеджер')}</option>
                      <option value="admin">{t('crm.admin.adminDashboardPage.администратор')}</option>
                    </select>
                    <button
                      className="bg-red-500 text-white rounded-xl px-3 py-2 disabled:opacity-60"
                      onClick={() => removeBatchUpdate(index)}
                      disabled={batchUpdates.length === 1}
                    >
                      {t('crm.admin.adminDashboardPage.удалить')}</button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  className="bg-gray-500 text-white rounded-xl px-4 py-2"
                  onClick={addBatchUpdate}
                >
                  {t('crm.admin.adminDashboardPage.добавить_еще')}</button>
                <button
                  disabled={creating}
                  className="bg-dream-primary text-white rounded-xl px-4 py-2 disabled:opacity-60"
                  onClick={updateBatchRoles}
                >
                  {t('crm.admin.adminDashboardPage.обновить_все')}</button>
              </div>
            </div>
          </div>
          {roleResult && (
            <div className="mt-4 p-3 border rounded-xl bg-white whitespace-pre-line text-sm">
              {roleResult}
            </div>
          )}
        </Section>

        <Section title={t('crm.admin.adminDashboardPage.управление_базовыми')}>
          <div className="space-y-4">
            {/* Выбор типа продукта */}
            <div>
              <label className="block text-sm font-normal mb-2">{t('crm.admin.adminDashboardPage.тип_продукта')}</label>
              <select
                className="border rounded-xl px-3 py-2"
                value={baseFilesProductType}
                onChange={(e) => setBaseFilesProductType(e.target.value as ProductType)}
              >
                <option value={ProductType.SALES}>{t('crm.admin.adminDashboardPage.продажи_sales')}</option>
                <option value={ProductType.NETWORK}>{t('crm.admin.adminDashboardPage.сеть_network')}</option>
              </select>
            </div>

            {/* Загрузка файлов */}
            <div>
              <label className="block text-sm font-normal mb-2">{t('crm.admin.adminDashboardPage.загрузить_файлы')}</label>
              <div className="space-y-2">
                <input
                  id="baseFilesInput"
                  type="file"
                  multiple
                  onChange={onBaseFilesChange}
                  className="border rounded-xl px-3 py-2 w-full"
                  accept="*/*"
                />
                <div className="text-xs text-gray-500">
                  {t('crm.admin.adminDashboardPage.максимум_10_файлов_з')}</div>
                {baseFilesSelected.length > 0 && (
                  <div className="mt-2 p-2 bg-gray-50 rounded-lg">
                    <div className="text-sm font-medium mb-1">{t('crm.admin.adminDashboardPage.выбрано_файлов')}{baseFilesSelected.length}</div>
                    <ul className="text-xs text-gray-600 space-y-1">
                      {baseFilesSelected.map((file, index) => (
                        <li key={index}>
                          • {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {baseFilesError && (
                  <div className="text-red-600 text-sm mt-1 whitespace-pre-line">{baseFilesError}</div>
                )}
                <button
                  disabled={baseFilesUploading || baseFilesSelected.length === 0}
                  className="bg-dream-primary text-white rounded-xl px-4 py-2 disabled:opacity-60"
                  onClick={uploadBaseFiles}
                >
                  {baseFilesUploading ? 'Загрузка...' : 'Загрузить файлы'}
                </button>
              </div>
            </div>

            {/* Список файлов */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-normal">{t('crm.admin.adminDashboardPage.список_файлов')}</label>
                <button
                  onClick={loadBaseFiles}
                  disabled={baseFilesLoading}
                  className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-60"
                >
                  {baseFilesLoading ? 'Загрузка...' : 'Обновить'}
                </button>
              </div>
              {baseFilesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <svg className="animate-spin h-6 w-6 text-dream-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span className="ml-2 text-gray-600">{t('crm.admin.adminDashboardPage.загрузка')}</span>
                </div>
              ) : baseFiles.length > 0 ? (
                <div className="space-y-2 max-h-96 overflow-y-auto border rounded-xl p-3">
                  {baseFiles.map((file, index) => {
                      const { t } = useI18n();
                    const fileId = (file as any)._id || file.filename;
                    return (
                      <div
                        key={fileId || index}
                        className="flex items-center justify-between gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {(() => {
                            if (file.mimeType?.includes('pdf')) {
                              return (
                                <svg width="24" height="24" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path fillRule="evenodd" clipRule="evenodd" d="M5.12197 0H11.8154L17.4796 5.91241V17.3942C17.4796 18.8321 16.3191 20 14.8811 20H5.12197C3.69131 20 2.52344 18.8321 2.52344 17.3942V2.59853C2.52341 1.16788 3.69131 0 5.12197 0Z" fill="#E2574C"/>
                                  <path d="M7 11H8V14H7V11ZM9 11H11V12H10V14H9V11ZM12 11H14V12H13V13H14V14H12V11Z" fill="white"/>
                                </svg>
                              );
                            } else if (file.mimeType?.includes('image')) {
                              return (
                                <svg width="24" height="24" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path fillRule="evenodd" clipRule="evenodd" d="M5.12197 0H11.8154L17.4796 5.91241V17.3942C17.4796 18.8321 16.3191 20 14.8811 20H5.12197C3.69131 20 2.52344 18.8321 2.52344 17.3942V2.59853C2.52341 1.16788 3.69131 0 5.12197 0Z" fill="#F4B400"/>
                                  <circle cx="10" cy="10" r="2" fill="white"/>
                                </svg>
                              );
                            }
                            return (
                              <svg width="24" height="24" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path fillRule="evenodd" clipRule="evenodd" d="M5.12197 0H11.8154L17.4796 5.91241V17.3942C17.4796 18.8321 16.3191 20 14.8811 20H5.12197C3.69131 20 2.52344 18.8321 2.52344 17.3942V2.59853C2.52341 1.16788 3.69131 0 5.12197 0Z" fill="#777"/>
                              </svg>
                            );
                          })()}
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-sm font-medium truncate">{decodeFilename(file.originalName)}</span>
                            <span className="text-xs text-gray-500">{formatFileSize(file.size || 0)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <a
                            href={file.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 hover:bg-gray-200 rounded"
                            title={t('crm.admin.adminDashboardPage.открыть')}
                          >
                            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M9 12L5 8h3V3h2v5h3l-4 4z" fill="#169600"/>
                              <path d="M15 13v2H3v-2H1v2c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-2h-2z" fill="#169600"/>
                            </svg>
                          </a>
                          <button
                            onClick={() => deleteBaseFile(fileId)}
                            disabled={baseFilesDeleting === fileId}
                            className="p-1 hover:bg-red-100 rounded text-red-600 disabled:opacity-60"
                            title={t('crm.admin.adminDashboardPage.удалить')}
                          >
                            {baseFilesDeleting === fileId ? (
                              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                            ) : (
                              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M4.5 4.5H13.5M4.5 4.5V15C4.5 15.4142 4.83579 15.75 5.25 15.75H12.75C13.1642 15.75 13.5 15.4142 13.5 15V4.5M4.5 4.5H3M13.5 4.5H15M11.25 4.5V3.75C11.25 3.33579 10.9142 3 10.5 3H7.5C7.08579 3 6.75 3.33579 6.75 3.75V4.5M7.5 8.25V12.75M10.5 8.25V12.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-gray-500 text-sm text-center py-8">{t('crm.admin.adminDashboardPage.нет_файлов_для_выбра')}</div>
              )}
            </div>

            {baseFilesResult && (
              <div className="p-3 border rounded-xl bg-green-50 text-green-700 text-sm">{baseFilesResult}</div>
            )}
          </div>
        </Section>

        {result && <div className="p-3 border rounded-xl bg-white">{result}</div>}
      </div>
    </div>
  );
};

export default AdminDashboardPage;
