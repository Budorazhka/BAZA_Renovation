import { AuthForm, type AuthFormProps } from '../../../auth/components/AuthForm'

export type AuthStepProps = Omit<AuthFormProps, 'variant' | 'initialMode'>

/**
 * Шаг авторизации мастера публикации.
 *
 * Разметка и валидация вынесены в `AuthForm`: та же форма обслуживает и
 * самостоятельные страницы `/auth/login` и `/auth/register` (MKT-SCR-013).
 * Держать две формы авторизации в одном приложении означало бы рано или поздно
 * разойтись в правилах пароля.
 */
export function AuthStep(props: AuthStepProps) {
  return <AuthForm {...props} variant="wizard" />
}
