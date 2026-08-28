import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { useAdminAuth } from './hooks/useAdminAuth'
import { RequireAdmin, RequireSuperAdmin } from './hooks/RequireAdmin'
import { LoginPage } from './pages/LoginPage'
import { PublicationsPage } from './pages/PublicationsPage'
import { AccountsPage } from './pages/AccountsPage'

function Shell({ children }: { children: React.ReactNode }) {
  const { state } = useAdminAuth()
  const isSuperAdmin = state.status === 'signed-in' && state.me.isSuperAdmin

  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="wordmark" to="/publications">
          BAZA<span>.admin</span>
        </Link>
        {state.status === 'signed-in' ? (
          <nav className="site-nav">
            <Link to="/publications">Публикации</Link>
            {isSuperAdmin ? <Link to="/accounts">Аккаунты</Link> : null}
            <span className="session-role">{isSuperAdmin ? 'super_admin' : 'admin'}</span>
            {/*
              Нет кнопки "Выйти" — POST /auth/logout не существует в API
              (см. docs/operations/admin-control-plane.md "Не реализовано").
              Симулировать logout удалением cookie на клиенте невозможно —
              cookie httpOnly, JS её не видит и не может стереть; притворная
              кнопка, которая ничего не делает на сервере, была бы обманом
              пользователя, поэтому её здесь нет.
            */}
          </nav>
        ) : null}
      </header>
      <main>{children}</main>
    </div>
  )
}

export default function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/publications"
          element={
            <RequireAdmin>
              <PublicationsPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/accounts"
          element={
            <RequireSuperAdmin>
              <AccountsPage />
            </RequireSuperAdmin>
          }
        />
        <Route path="/" element={<Navigate to="/publications" replace />} />
        <Route path="*" element={<Navigate to="/publications" replace />} />
      </Routes>
    </Shell>
  )
}
