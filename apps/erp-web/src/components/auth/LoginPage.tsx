import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Building2 } from 'lucide-react'
import { useAuth, MOCK_USERS } from '@/context/AuthContext'
import { useFormValidation } from '@/hooks/useFormValidation'
import { loginSchema, type LoginFormData } from '@/lib/validation/schemas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Form, Field, FormActions } from '@/components/ui/Form'
import { ROLE_LABEL, ROLE_COLOR } from '@/lib/permissions'
import { USER_ROLES, type UserRole } from '@/types/auth'
import { cn } from '@/lib/utils'
import { useI18n } from "@/i18n";

const ROLES: UserRole[] = USER_ROLES

function mockUserLabel(user: (typeof MOCK_USERS)[number]) {
  return user.mlsCircleVerified ? `${ROLE_LABEL[user.role]} · MLS` : ROLE_LABEL[user.role]
}

export function LoginPage() {
    const { t } = useI18n();
  const { login, enterAs } = useAuth()
  const navigate = useNavigate()
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null)
  const [showPass, setShowPass] = useState(false)

  const form = useFormValidation(loginSchema, {
    onSubmit: async (data: LoginFormData) => {
      const result = await login(data.login, data.password)
      if (result === 'ok') {
        navigate('/dashboard', { replace: true })
      } else if (result === 'blocked') {
        form.setFieldError('login', 'Аккаунт заблокирован. Обратитесь к руководителю.')
      } else {
        form.setFieldError('login', 'Неверный логин или пароль')
      }
    },
  })

  function handleEnterAs() {
    if (selectedRole) {
      enterAs('agency', selectedRole)
      navigate('/dashboard', { replace: true })
    }
  }

  function handleEnterAsDeveloper() {
    enterAs('developer', 'developer')
    navigate('/dashboard', { replace: true })
  }

  async function quickLogin(userLogin: string) {
    const result = await login(userLogin, '1')
    if (result === 'ok') navigate('/dashboard', { replace: true })
    else if (result === 'blocked') form.setFieldError('login', 'Аккаунт заблокирован. Обратитесь к руководителю.')
  }

  return (
    <div className="min-h-screen bg-background flex flex-col lg:flex-row">
      <div className="flex-1 flex flex-col justify-center p-6 sm:p-8 lg:p-12 border-b lg:border-b-0 lg:border-r border-slate-200/80">
        <div className="w-full max-w-md mx-auto lg:mx-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="flex items-baseline gap-0.5 text-foreground font-normal tracking-tight">
              <span className="text-xl">BAZA</span>
              <span className="text-sm font-normal text-muted-foreground">.sale</span>
            </span>
          </div>
          <h2 className="text-lg font-normal text-foreground mt-6 mb-1">
            {t('auth.loginPage.войти_по_роли_демо')}</h2>
          <p className="text-sm text-muted-foreground mb-6">
            {t('auth.loginPage.агентство_и_кабинет')}</p>

          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-[#0d3d2f]/15 bg-[#0d3d2f]/05 px-4 py-4">
            <div className="flex size-11 items-center justify-center rounded-xl bg-[#0d3d2f]/10 text-[#0d3d2f]">
              <Building2 className="size-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">{t('auth.loginPage.тип_кабинета')}</p>
              <p className="mt-1 text-sm font-normal text-slate-900">{t('auth.loginPage.агентство_застройщик')}</p>
            </div>
          </div>

          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">
            {t('auth.loginPage.роль')}</p>
          <div className="flex flex-wrap gap-2 mb-6">
            {ROLES.map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => setSelectedRole(role)}
                className={cn(
                  'rounded-full border-2 px-4 py-2 text-sm font-medium transition-all',
                  selectedRole === role
                    ? 'border-[#0d3d2f] bg-[#0d3d2f] text-white'
                    : 'border-slate-200 bg-white hover:border-slate-300 text-slate-600',
                )}
              >
                {ROLE_LABEL[role]}
              </button>
            ))}
          </div>

          <Button
            type="button"
            onClick={handleEnterAs}
            disabled={!selectedRole}
            className="w-full bg-[#0d3d2f] hover:bg-[#0a2f24] text-white"
          >
            {t('auth.loginPage.войти_в_кабинет')}</Button>
          <Button
            type="button"
            onClick={handleEnterAsDeveloper}
            variant="outline"
            className="mt-3 w-full border-[#0d3d2f]/25 text-[#0d3d2f] hover:bg-[#0d3d2f]/5"
          >
            {t('auth.loginPage.войти_как_застройщик')}</Button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 sm:p-8 bg-slate-50/50">
        <div className="w-full max-w-sm">
          <h2 className="text-lg font-normal text-foreground mb-1">{t('auth.loginPage.вход_по_логину')}</h2>
          <p className="text-sm text-muted-foreground mb-6">{t('auth.loginPage.логин_и_пароль_для_д')}</p>
          <Form onSubmit={form.handleSubmit}>
            <Field
              label={t('auth.loginPage.логин')}
              description="owner / director / rop / manager / mls-manager / marketer / procurement / administrator / trainee / lawyer / finance / developer"
              error={form.getFieldError('login')}
              className="mb-4"
            >
              <Input
                {...form.register('login')}
                autoComplete="username"
                placeholder="owner / director / rop / manager / mls-manager / marketer / procurement / administrator / trainee / lawyer / finance / developer"
                disabled={form.formState.isSubmitting}
              />
            </Field>
            <Field
              label={t('auth.loginPage.пароль')}
              error={form.getFieldError('password')}
              className="mb-4"
            >
              <div className="relative">
                <Input
                  {...form.register('password')}
                  type={showPass ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder={t('auth.loginPage.пароль')}
                  disabled={form.formState.isSubmitting}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
            <FormActions>
              <Button
                type="submit"
                disabled={form.formState.isSubmitting}
                className="w-full"
              >
                {form.formState.isSubmitting ? 'Вход...' : 'Войти'}
              </Button>
            </FormActions>
          </Form>
          <p className="text-xs text-muted-foreground mt-4">{t('auth.loginPage.пароль_для_демо_поль')}</p>
          <div className="mt-4 pt-4 border-t border-slate-200">
            <p className="text-xs text-muted-foreground mb-2">{t('auth.loginPage.быстрый_вход')}</p>
            <div className="flex flex-wrap gap-2">
              {MOCK_USERS
                .filter((u) => (u.accountType === 'agency' && USER_ROLES.includes(u.role)) || u.role === 'developer')
                .map((u) => (
                <button
                  key={u.id}
                  onClick={() => quickLogin(u.login)}
                  className={cn(
                    'text-xs px-2 py-1 rounded border font-medium transition-colors',
                    ROLE_COLOR[u.role],
                  )}
                >
                  {mockUserLabel(u)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
