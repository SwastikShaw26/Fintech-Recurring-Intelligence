import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { LogIn, LogOut } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import './AppShell.css'

export type Layout = 'Redesigned' | 'Classic'
type NavItem = { name: string; icon: LucideIcon }

export function AppShell({ page, pageLabel, navItems, onNavigate, commitmentCount, privateMode, layout, onLayoutChange, children }: {
  page: string
  pageLabel: string
  navItems: NavItem[]
  onNavigate: (page: string) => void
  commitmentCount: number
  privateMode: boolean
  layout: Layout
  onLayoutChange: (mode: Layout) => void
  children: ReactNode
}) {
  const { user, logout, openAuthModal } = useAuth()

  return (
    <div className={layout === 'Redesigned' ? 'app-shell redesigned-shell' : 'app-shell'}>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-name">FinSight</div>
          <div className="brand-subtitle">Payment evidence</div>
        </div>

        {/* User Authentication Panel matching Editorial Warm Canvas palette */}
        <div className="sidebar-auth-card" style={{
          margin: '0 var(--space-2) var(--space-6) var(--space-2)',
          padding: 'var(--space-3)',
          background: 'var(--inset)',
          border: '1px solid var(--rule)',
          borderRadius: 'var(--radius-panel)',
        }}>
          {user ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: 'var(--radius-control)',
                  background: 'var(--evergreen)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--paper)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 700,
                  flexShrink: 0
                }}>
                  {user.full_name ? user.full_name[0].toUpperCase() : 'U'}
                </div>
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {user.full_name}
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {user.email}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={logout}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 'var(--space-1)',
                  padding: 'var(--space-1) var(--space-2)',
                  background: 'var(--paper)',
                  border: '1px solid var(--rule-strong)',
                  borderRadius: 'var(--radius-control)',
                  color: 'var(--ink)',
                  fontSize: 'var(--text-xs)',
                  cursor: 'pointer'
                }}
              >
                <LogOut size={12} />
                Sign out
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', lineHeight: 1.4 }}>
                Private Aura graph isolation enabled with sign in.
              </div>
              <button
                type="button"
                onClick={() => openAuthModal('login')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 'var(--space-1)',
                  padding: 'var(--space-2) var(--space-3)',
                  background: 'var(--evergreen)',
                  border: '1px solid var(--evergreen)',
                  borderRadius: 'var(--radius-control)',
                  color: 'var(--paper)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <LogIn size={13} />
                Sign In / Register
              </button>
            </div>
          )}
        </div>

        <nav className="navigation" aria-label="Main navigation">
          {navItems.map(({ name, icon: Icon }) => (
            <button key={name} type="button"
              className={page === name ? 'nav-item active' : 'nav-item'}
              aria-current={page === name ? 'page' : undefined}
              onClick={() => onNavigate(name)}>
              <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
              <span>{name === 'Evaluation & Audit' ? 'Evaluation & audit' : name}</span>
              {name === 'Recurring payments' && commitmentCount > 0 && (
                <span className="nav-count">{commitmentCount}</span>
              )}
            </button>
          ))}
        </nav>
        <p className="sidebar-note">
          {privateMode ? 'Private workspace' : 'Demo workspace'}<br />
          {privateMode ? 'Statement in this tab' : 'Synthetic transaction records'}
        </p>
      </aside>

      <main className="main-area" id="main-content" tabIndex={-1}>
        <header className="topbar layout-topbar">
          <div className="breadcrumb"><span>Workspace</span><strong>{pageLabel}</strong></div>
          <div className="layout-controls">
            <span className="data-source">{privateMode ? 'Private statement data' : 'Synthetic transaction data'}</span>
            <div className="layout-switch" role="group" aria-label="Workspace layout">
              <button type="button" aria-pressed={layout === 'Redesigned'} onClick={() => onLayoutChange('Redesigned')}>
                Redesigned
              </button>
              <button type="button" aria-pressed={layout === 'Classic'} onClick={() => onLayoutChange('Classic')}>
                Classic
              </button>
            </div>
          </div>
        </header>
        {children}
      </main>
    </div>
  )
}
