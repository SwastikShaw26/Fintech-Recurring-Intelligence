import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
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
  return (
    <div className={layout === 'Redesigned' ? 'app-shell redesigned-shell' : 'app-shell'}>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-name">FinSight</div>
          <div className="brand-subtitle">Payment evidence</div>
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
