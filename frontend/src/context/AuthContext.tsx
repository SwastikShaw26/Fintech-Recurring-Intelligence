import { useState, useEffect, createContext, useContext } from 'react'

export interface User {
  user_id: string
  email: string
  full_name: string
  token: string
}

interface AuthContextType {
  user: User | null
  token: string | null
  login: (userData: User) => void
  logout: () => void
  openAuthModal: (mode?: 'login' | 'register') => void
  closeAuthModal: () => void
  isAuthModalOpen: boolean
  modalMode: 'login' | 'register'
  setModalMode: (mode: 'login' | 'register') => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('finsight_user')
    return saved ? JSON.parse(saved) : null
  })
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem('finsight_token')
  })
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'login' | 'register'>('login')

  const login = (userData: User) => {
    setUser(userData)
    setToken(userData.token)
    localStorage.setItem('finsight_user', JSON.stringify(userData))
    localStorage.setItem('finsight_token', userData.token)
    setIsAuthModalOpen(false)
  }

  const logout = () => {
    setUser(null)
    setToken(null)
    localStorage.removeItem('finsight_user')
    localStorage.removeItem('finsight_token')
  }

  const openAuthModal = (mode: 'login' | 'register' = 'login') => {
    setModalMode(mode)
    setIsAuthModalOpen(true)
  }

  const closeAuthModal = () => setIsAuthModalOpen(false)

  // Verify token on mount
  useEffect(() => {
    if (token) {
      fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(res => {
        if (!res.ok) {
          logout()
        }
      })
      .catch(() => {})
    }
  }, [token])

  return (
    <AuthContext.Provider value={{
      user,
      token,
      login,
      logout,
      openAuthModal,
      closeAuthModal,
      isAuthModalOpen,
      modalMode,
      setModalMode
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
