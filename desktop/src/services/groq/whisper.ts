import { configService } from '../api/config'

export interface WhisperResult {
  text: string
}

class WhisperService {
  private apiUrl = 'https://api.groq.com/openai/v1/audio/transcriptions'

  async transcribe(audioBlob: Blob, language = 'en'): Promise<string> {
    const config = await configService.getConfig()

    const formData = new FormData()
    formData.append('file', audioBlob, 'audio.webm')
    formData.append('model', config.groqWhisperModel || 'whisper-large-v3-turbo')
    formData.append('language', language)
    formData.append('response_format', 'json')

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.groqApiKey}`,
      },
      body: formData,
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Groq API error: ${response.status} - ${error}`)
    }

    const result: WhisperResult = await response.json()
    return result.text
  }
}

export const whisperService = new WhisperService()
