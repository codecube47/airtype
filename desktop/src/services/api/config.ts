import { apiClient } from './client'

export interface AppConfig {
  groqApiKey: string
  groqWhisperModel: string
  groqLLMModel: string
  cleanupPrompt: string
}

class ConfigService {
  // In-memory cache only — keeps API key out of localStorage
  private cachedConfig: AppConfig | null = null

  private async isAuthenticated(): Promise<boolean> {
    if (!window.electronAPI) return false
    const token = await window.electronAPI.getAccessToken()
    return !!token
  }

  async getConfig(): Promise<AppConfig> {
    // Verify user is authenticated before returning config
    const authenticated = await this.isAuthenticated()
    if (!authenticated) {
      console.log('[ConfigService] User not authenticated, clearing cache')
      this.clearCache()
      throw new Error('User not authenticated')
    }

    // Check in-memory cache first
    if (this.cachedConfig) {
      console.log('[ConfigService] Using cached config (no API call)')
      return this.cachedConfig
    }

    console.log('[ConfigService] Fetching config from backend...')
    const response = await apiClient.get('/config')
    this.cachedConfig = response.data
    console.log('[ConfigService] Config fetched and cached in memory')
    return response.data
  }

  clearCache() {
    console.log('[ConfigService] Cache cleared')
    this.cachedConfig = null
    // Clean up any previously stored config from localStorage
    try { localStorage.removeItem('airtype-config') } catch { /* ignore */ }
  }
}

export const configService = new ConfigService()
