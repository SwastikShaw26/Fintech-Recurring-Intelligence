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

        {/* User Authentication Panel */}
        <div className="sidebar-auth-card" style={{
          margin: '0.5rem 0.75rem 1rem 0.75rem',
          padding: '0.75rem',
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '10px',
        }}>
          {user ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #0284c7, #38bdf8)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  flexShrink: 0
                }}>
                  {user.full_name ? user.full_name[0].toUpperCase() : 'U'}
                </div>
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {user.full_name}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
                  gap: '0.375rem',
                  padding: '0.35rem',
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  borderRadius: '6px',
                  color: '#f87171',
                  fontSize: '0.75rem',
                  cursor: 'pointer'
                }}
              >
                <LogOut size={13} />
                Sign out
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                Sign in to isolate your Neo4j graph & commitments.
              </div>
              <button
                type="button"
                onClick={() => openAuthModal('login')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.375rem',
                  padding: '0.45rem',
                  background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  borderRadius: '6px',
                  color: '#ffffff',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(2, 132, 199, 0.25)'
                }}
              >
                <LogIn size={14} />
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
