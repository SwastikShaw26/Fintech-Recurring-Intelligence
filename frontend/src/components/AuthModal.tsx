import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { X, Lock, Mail, User as UserIcon, ArrowRight, ShieldCheck } from 'lucide-react'

export function AuthModal() {
  const { isAuthModalOpen, closeAuthModal, modalMode, setModalMode, login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (!isAuthModalOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const endpoint = modalMode === 'login' ? '/api/auth/login' : '/api/auth/register'
    const payload = modalMode === 'login'
      ? { email, password }
      : { email, password, full_name: fullName }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.detail || 'Authentication failed. Please check your credentials.')
      }
      login(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={closeAuthModal} style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'var(--scrim)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: 'var(--space-4)',
    }}>
      <div 
        className="auth-modal-card" 
        onClick={(e) => e.stopPropagation()} 
        style={{
          width: '100%',
          maxWidth: '440px',
          background: 'var(--paper)',
          border: '1px solid var(--rule-strong)',
          borderRadius: 'var(--radius-panel)',
          boxShadow: 'var(--shadow-dialog)',
          padding: 'var(--space-6)',
          color: 'var(--ink)',
          position: 'relative'
        }}
      >
        <button 
          onClick={closeAuthModal} 
          style={{
            position: 'absolute',
            top: 'var(--space-4)',
            right: 'var(--space-4)',
            background: 'none',
            border: 'none',
            color: 'var(--muted)',
            cursor: 'pointer',
            padding: '4px'
          }}
        >
          <X size={20} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
          <div style={{
            background: 'var(--evergreen-soft)',
            padding: 'var(--space-2)',
            borderRadius: 'var(--radius-control)',
            color: 'var(--evergreen)',
            display: 'flex'
          }}>
            <ShieldCheck size={24} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 'var(--text-xl)', fontFamily: 'var(--font-display)', fontWeight: 400 }}>
              {modalMode === 'login' ? 'Sign in to FinSight' : 'Create an Account'}
            </h2>
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>
              {modalMode === 'login' ? 'Access your private Neo4j financial graph' : 'Isolate your commitments into your own private Aura graph'}
            </p>
          </div>
        </div>

        {error && (
          <div style={{
            background: 'var(--attention-wash)',
            border: '1px solid var(--attention)',
            borderRadius: 'var(--radius-control)',
            padding: 'var(--space-2) var(--space-3)',
            marginBottom: 'var(--space-4)',
            fontSize: 'var(--text-sm)',
            color: 'var(--attention)'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {modalMode === 'register' && (
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--ink)', marginBottom: 'var(--space-1)' }}>Full Name</label>
              <div style={{ position: 'relative' }}>
                <UserIcon size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--muted)' }} />
                <input
                  type="text"
                  required
                  placeholder="Satya Nadella"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px 8px 36px',
                    background: 'var(--canvas)',
                    border: '1px solid var(--rule-strong)',
                    borderRadius: 'var(--radius-control)',
                    color: 'var(--ink)',
                    fontSize: 'var(--text-sm)',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--ink)', marginBottom: 'var(--space-1)' }}>Email Address</label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--muted)' }} />
              <input
                type="email"
                required
                placeholder="analyst@finsight.io"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px 8px 36px',
                  background: 'var(--canvas)',
                  border: '1px solid var(--rule-strong)',
                  borderRadius: 'var(--radius-control)',
                  color: 'var(--ink)',
                  fontSize: 'var(--text-sm)',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--ink)', marginBottom: 'var(--space-1)' }}>Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--muted)' }} />
              <input
                type="password"
                required
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px 8px 36px',
                  background: 'var(--canvas)',
                  border: '1px solid var(--rule-strong)',
                  borderRadius: 'var(--radius-control)',
                  color: 'var(--ink)',
                  fontSize: 'var(--text-sm)',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 'var(--space-2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 'var(--space-2)',
              padding: '10px 16px',
              background: 'var(--evergreen)',
              border: '1px solid var(--evergreen)',
              borderRadius: 'var(--radius-control)',
              color: 'var(--paper)',
              fontSize: 'var(--text-sm)',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            {loading ? 'Authenticating...' : modalMode === 'login' ? 'Sign In' : 'Create Account'}
            {!loading && <ArrowRight size={16} />}
          </button>
        </form>

        <div style={{ marginTop: 'var(--space-4)', textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>
          {modalMode === 'login' ? (
            <>
              Don't have an account?{' '}
              <button
                type="button"
                onClick={() => { setError(null); setModalMode('register'); }}
                style={{ background: 'none', border: 'none', color: 'var(--evergreen)', cursor: 'pointer', padding: 0, fontWeight: 600 }}
              >
                Sign up free
              </button>
            </>
          ) : (
            <>
              Already registered?{' '}
              <button
                type="button"
                onClick={() => { setError(null); setModalMode('login'); }}
                style={{ background: 'none', border: 'none', color: 'var(--evergreen)', cursor: 'pointer', padding: 0, fontWeight: 600 }}
              >
                Sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
