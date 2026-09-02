import type { AccountType, UserRole } from '@/types/auth'

type PasswordManager = {
  role: UserRole
  accountType: AccountType
} | null | undefined

/**
 * Пароль сотрудника меняет только владелец своего кабинета.
 * Директор управляет командой, но не получает доступ к учётным данным.
 */
export function canManageTeamPasswords(user: PasswordManager): boolean {
  return (
    (user?.accountType === 'agency' && user.role === 'owner') ||
    (user?.accountType === 'developer' && user.role === 'developer')
  )
}
