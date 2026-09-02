import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { apiService } from '../../services/api';
import { useI18n } from "@/i18n";

const AdminLoginPage: React.FC = () => {
    const { t } = useI18n();
  const [token, setToken] = useState<string>((import.meta as any).env?.VITE_ADMIN_TOKEN || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const cleaned = (token || '').trim();
      if (!cleaned) {
        setError('Введите админский токен');
        setLoading(false);
        return;
      }
      
      const res = await apiService.adminLogin(cleaned);
      if (res.success) {
        // Сохраняем админский токен
        sessionStorage.setItem('admin_token', cleaned);
        localStorage.setItem('admin_token', cleaned);
        
        // Если в ответе есть JWT токен, сохраняем его тоже
        // Согласно документации, ответ имеет структуру: { success: true, data: { message: "OK", token: string } }
        if (res.data?.token) {
          // Убеждаемся, что токен - это строка, а не объект
          const token = res.data.token;
          const tokenString = typeof token === 'string' ? token : (token as any)?.token || String(token);
          
          // Удаляем "Bearer " если он уже есть в токене
          const cleanToken = tokenString.startsWith('Bearer ') ? tokenString.substring(7) : tokenString;
          
          if (cleanToken && cleanToken.trim().length > 0) {
            localStorage.setItem('jwt_token', cleanToken.trim());
          } else {
            console.error('[AdminLogin] Invalid token format received:', typeof token, token);
          }
        }
        
        const from = (location.state as any)?.from?.pathname || '/admin';
        navigate(from, { replace: true });
      } else {
        setError(res.message || 'Неверный админский токен');
      }
    } catch (e: any) {
      const errorMessage = e?.response?.data?.message || e?.message || 'Ошибка при входе в админ-панель';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow p-6">
        <h1 className="text-2xl font-normal mb-4">{t('crm.admin.adminLoginPage.вход_в_админ_панель')}</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm mb-1">{t('crm.admin.adminLoginPage.токен')}</label>
            <input
              type="password"
              className="w-full border rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-dream-primary"
              placeholder={t('crm.admin.adminLoginPage.введите_admin_token')}
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </div>
          {error && <div className="text-red-600 text-sm">{error}</div>}
          <button
            type="submit"
            disabled={loading || !token}
            className="w-full bg-dream-primary text-white rounded-xl py-2 disabled:opacity-60"
          >
            {loading ? 'Вход…' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AdminLoginPage;
