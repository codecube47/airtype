import { apiClient, apiClientInstance } from './client'

export interface User {
  id: string
  email: string
  name: string
  picture: string
  plan: string
  status: string
}

class AuthService {
  // Start Google OAuth flow. The Electron main process generates a nonce,
  // registers it with the backend, and returns the OAuth URL. We then open
  // the URL in the system browser; main will validate the callback nonce
  // before exchanging the code for tokens.
  async loginWithGoogle() {
    try {
      const { url } = await window.electronAPI.beginLogin()
      await window.electronAPI.openGoogleAuth(url)
      // Callback handled by Electron main process → sent via onAuthCallback.
    } catch (error) {
      console.error('Failed to start Google login:', error)
      throw error
    }
  }

  // Get current user
  async getCurrentUser(): Promise<User> {
    const response = await apiClient.get('/auth/me')
    return response.data.user
  }

  // Check if user is authenticated
  async isAuthenticated(): Promise<boolean> {
    const token = await window.electronAPI.getAccessToken()
    return !!token
  }

  // Logout
  async logout() {
    apiClientInstance.clearCachedToken()
    await window.electronAPI.clearTokens()
  }
}

export const authService = new AuthService()
