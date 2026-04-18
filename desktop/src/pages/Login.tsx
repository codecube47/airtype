import React, { useEffect, useState, useRef } from 'react'
import { authService } from '../services/api/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import logoImg from '/logo.png'

interface LoginProps {
  onLoginSuccess: () => void
}

export function Login({ onLoginSuccess }: LoginProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Use ref to always have latest callback without re-running effect
  const onLoginSuccessRef = useRef(onLoginSuccess)
  useEffect(() => {
    onLoginSuccessRef.current = onLoginSuccess
  }, [onLoginSuccess])

  useEffect(() => {
    console.log('[Login] Setting up auth callback listener')
    window.electronAPI.onAuthCallback(async (tokens) => {
      console.log('[Login] Received auth callback, tokens present:', !!tokens.accessToken, !!tokens.refreshToken)
      const { accessToken, refreshToken } = tokens

      if (!accessToken || !refreshToken) {
        setError('Invalid authentication response')
        setIsLoading(false)
        return
      }

      try {
        console.log('[Login] Saving tokens...')
        const saved = await window.electronAPI.saveTokens(accessToken, refreshToken)
        console.log('[Login] Tokens saved result:', saved)

        // Small delay to ensure tokens are persisted
        await new Promise(resolve => setTimeout(resolve, 100))

        console.log('[Login] Calling onLoginSuccess...')
        setIsLoading(false)
        onLoginSuccessRef.current()
        console.log('[Login] onLoginSuccess called')
      } catch (err) {
        setError('Failed to save authentication tokens')
        setIsLoading(false)
        console.error('[Login] Error saving tokens:', err)
      }
    })

    return () => {
      console.log('[Login] Cleaning up auth callback listener')
      window.electronAPI.removeAuthCallbackListener()
    }
  }, []) // Empty deps - callback accessed via ref

  const handleGoogleLogin = async () => {
    try {
      setIsLoading(true)
      setError(null)
      console.log('[Login] Starting Google login...')
      await authService.loginWithGoogle()
      console.log('[Login] Browser opened for Google auth')

      // Reset loading state after timeout if callback not received
      setTimeout(() => {
        setIsLoading((current) => {
          if (current) {
            console.log('[Login] Timeout - resetting loading state')
          }
          return false
        })
      }, 60000) // 60 second timeout
    } catch (err) {
      setError('Failed to start Google authentication')
      console.error('[Login] Error starting Google login:', err)
      setIsLoading(false)
    }
  }

  return (
    <div
      className="flex items-center justify-center min-h-screen bg-gradient-to-br from-brand-ocean to-brand-dark"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <Card className="w-full max-w-md shadow-2xl" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <img src={logoImg} alt="Airtype" className="h-16 w-auto" />
          </div>
          <CardTitle className="text-3xl font-bold">Welcome to Airtype</CardTitle>
          <CardDescription className="text-base">
            AI-powered voice dictation for your desktop
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {error && (
            <div className="bg-red-100 text-red-700 p-3 rounded-md text-sm">
              {error}
            </div>
          )}

          <Button
            onClick={handleGoogleLogin}
            disabled={isLoading}
            variant="outline"
            className="w-full h-12 text-base font-semibold gap-3"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            {isLoading ? 'Signing in...' : 'Sign in with Google'}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            By signing in, you agree to our Terms of Service and Privacy Policy
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
