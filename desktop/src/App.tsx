import { useEffect, useState, useCallback } from 'react'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { Settings } from './pages/Settings'
import { Widget } from './pages/Widget'
import { Permissions } from './pages/Permissions'
import { Help } from './pages/Help'
import { ErrorBoundary } from './components/ErrorBoundary'
import { authService } from './services/api/auth'
import { configService } from './services/api/config'
import { ThemeProvider } from './lib/theme-provider'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [permissionsGranted, setPermissionsGranted] = useState<boolean | null>(null)
  const [currentPage, setCurrentPage] = useState<'dashboard' | 'settings' | 'help'>('dashboard')

  // Check if this is the widget window (hash-based routing)
  const isWidgetWindow = window.location.hash === '#/widget'

  const checkAuth = useCallback(async () => {
    const authenticated = await authService.isAuthenticated()
    console.log('[App] Auth check result:', authenticated)
    setIsAuthenticated(authenticated)
  }, [])

  useEffect(() => {
    // Widget window doesn't need auth or permission check
    if (isWidgetWindow) return

    checkPermissions()
  }, [isWidgetWindow])

  const checkPermissions = async () => {
    // Check current permission status
    const accessibility = await window.electronAPI?.checkAccessibilityPermission()
    const microphone = await window.electronAPI?.checkMicrophonePermission()
    console.log('[App] Permissions check:', { accessibility, microphone })

    if (accessibility && microphone) {
      setPermissionsGranted(true)
      checkAuth()
      return
    }

    // Need to show permissions page
    setPermissionsGranted(false)
  }

  const handlePermissionsGranted = () => {
    setPermissionsGranted(true)
    checkAuth()
  }

  // Called after successful login - verify tokens and update state
  const handleLoginSuccess = useCallback(async () => {
    console.log('[App] handleLoginSuccess called, verifying auth...')
    // Double-check that tokens were actually saved
    const authenticated = await authService.isAuthenticated()
    console.log('[App] Auth verification result:', authenticated)
    if (authenticated) {
      setIsAuthenticated(true)
      // Pre-fetch config (Groq API key) so first transcription is faster
      configService.getConfig().catch((err) => {
        console.warn('[App] Failed to pre-fetch config:', err)
      })
    } else {
      console.error('[App] handleLoginSuccess called but no valid tokens found')
    }
  }, [])

  // Called after logout
  const handleLogout = useCallback(async () => {
    console.log('[App] Logout, clearing auth')
    await authService.logout()
    configService.clearCache() // Clear cached API key
    setIsAuthenticated(false)
  }, [])

  const handleNavigate = useCallback((page: string) => {
    setCurrentPage(page as 'dashboard' | 'settings' | 'help')
  }, [])

  // Render widget window (no auth needed, transparent background)
  if (isWidgetWindow) {
    return <Widget />
  }

  // Show loading while checking permissions
  if (permissionsGranted === null) {
    return (
      <ThemeProvider defaultTheme="system" storageKey="airtype-ui-theme">
        <div className="flex flex-col items-center justify-center min-h-screen gap-4 bg-background">
          <div className="w-10 h-10 border-4 border-muted border-t-primary rounded-full animate-spin" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </ThemeProvider>
    )
  }

  // Show permissions page if not granted
  if (!permissionsGranted) {
    return (
      <ThemeProvider defaultTheme="system" storageKey="airtype-ui-theme">
        <Permissions onPermissionsGranted={handlePermissionsGranted} />
      </ThemeProvider>
    )
  }

  // Show loading while checking auth
  if (isAuthenticated === null) {
    return (
      <ThemeProvider defaultTheme="system" storageKey="airtype-ui-theme">
        <div className="flex flex-col items-center justify-center min-h-screen gap-4 bg-background">
          <div className="w-10 h-10 border-4 border-muted border-t-primary rounded-full animate-spin" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </ThemeProvider>
    )
  }

  // Show login if not authenticated
  if (!isAuthenticated) {
    return (
      <ThemeProvider defaultTheme="system" storageKey="airtype-ui-theme">
        <Login onLoginSuccess={handleLoginSuccess} />
      </ThemeProvider>
    )
  }

  // Show authenticated app
  return (
    <ThemeProvider defaultTheme="system" storageKey="airtype-ui-theme">
      <ErrorBoundary>
        {currentPage === 'settings' ? (
          <Settings onLogout={handleLogout} onNavigate={handleNavigate} />
        ) : currentPage === 'help' ? (
          <Help onLogout={handleLogout} onNavigate={handleNavigate} />
        ) : (
          <Dashboard onLogout={handleLogout} onNavigate={handleNavigate} />
        )}
      </ErrorBoundary>
    </ThemeProvider>
  )
}

export default App
