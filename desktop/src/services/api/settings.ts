import { apiClient } from './client'

export interface ServerSettings {
  language: string
  autoFormat: boolean
  removeFillers: boolean
  customPrompt: string
}

class SettingsService {
  async get(): Promise<ServerSettings> {
    const response = await apiClient.get('/settings')
    return response.data
  }

  async update(settings: ServerSettings): Promise<ServerSettings> {
    const response = await apiClient.put('/settings', settings)
    return response.data
  }
}

export const settingsService = new SettingsService()
