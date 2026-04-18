import { apiClient, apiClientInstance } from './client'

export interface TranscriptionResult {
  id: string
  rawText: string
  cleanedText: string
  processingTime: number
  wordCount: number
}

export interface Transcription {
  id: string
  userId: string
  rawText: string
  cleanedText: string
  audioUrl?: string
  metadata: {
    duration: number
    language: string
    model: string
    processingTime: number
    wordCount: number
  }
  application?: string
  createdAt: string
}

export interface PaginatedTranscriptions {
  transcriptions: Transcription[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface TranscriptionStats {
  totalTranscriptions: number
  totalWords: number
  avgProcessingTime: number
  plan: string
  wordLimit: number
  wordsRemaining: number
}

class TranscribeService {
  // Transcribe audio file (via backend - slower, for fallback)
  async transcribe(audioBlob: Blob, language = 'en', cleanup = true): Promise<TranscriptionResult> {
    const formData = new FormData()
    formData.append('audio', audioBlob, 'audio.wav')
    formData.append('language', language)
    formData.append('cleanup', cleanup.toString())

    const response = await apiClient.post('/transcribe', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })

    return response.data
  }

  // Save transcription result (after direct Groq calls)
  // processingTime is measured on desktop (whisper + LLM cleanup time)
  // Uses retry logic — losing a transcription is worse than a slight delay
  async save(
    rawText: string,
    cleanedText?: string,
    processingTime?: number,
    language = 'en'
  ): Promise<TranscriptionResult> {
    return apiClientInstance.requestWithRetry<TranscriptionResult>({
      method: 'POST',
      url: '/transcriptions/save',
      data: { rawText, cleanedText, processingTime, language },
    })
  }

  // Get transcription history (paginated)
  async getTranscriptions(page = 1, limit = 5): Promise<PaginatedTranscriptions> {
    const response = await apiClient.get('/transcriptions', {
      params: { page, limit },
    })

    return response.data
  }

  // Get transcription stats
  async getStats(): Promise<TranscriptionStats> {
    const response = await apiClient.get('/transcriptions/stats')
    return response.data
  }
}

export const transcribeService = new TranscribeService()
