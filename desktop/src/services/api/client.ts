import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
const MAX_RETRIES = 3
const RETRY_BASE_DELAY = 1000 // 1 second

function isRetryable(error: AxiosError): boolean {
  // Retry on network errors (no response)
  if (!error.response) return true
  // Retry on 5xx server errors and 429 rate limit
  const status = error.response.status
  return status >= 500 || status === 429
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

class APIClient {
  private client: AxiosInstance
  private isRefreshing = false
  private failedQueue: Array<{
    resolve: (value?: unknown) => void
    reject: (reason?: unknown) => void
  }> = []
  // Cache token in memory to avoid IPC call on every request
  private cachedAccessToken: string | null = null

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      timeout: 60000, // 60s timeout for transcription requests
    })

    // Request interceptor: Add auth token (use cached token when available)
    this.client.interceptors.request.use(
      async (config) => {
        // Use cached token if available, otherwise fetch from keychain
        if (!this.cachedAccessToken) {
          this.cachedAccessToken = await window.electronAPI.getAccessToken()
        }

        if (this.cachedAccessToken) {
          config.headers.Authorization = `Bearer ${this.cachedAccessToken}`
        }

        return config
      },
      (error) => Promise.reject(error)
    )

    // Response interceptor: Handle token refresh
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as any

        // For retryable errors (network/5xx), don't go through refresh logic
        if (!error.response || error.response.status !== 401) {
          return Promise.reject(error)
        }

        // Already retried, redirect to login
        if (originalRequest._retry) {
          this.cachedAccessToken = null
          await window.electronAPI.clearTokens()
          window.location.href = '/login'
          return Promise.reject(error)
        }

        // If already refreshing, queue this request
        if (this.isRefreshing) {
          return new Promise((resolve, reject) => {
            this.failedQueue.push({ resolve, reject })
          })
            .then((token) => {
              originalRequest.headers.Authorization = `Bearer ${token}`
              return this.client(originalRequest)
            })
            .catch((err) => {
              return Promise.reject(err)
            })
        }

        originalRequest._retry = true
        this.isRefreshing = true
        // Clear cached token since it's invalid
        this.cachedAccessToken = null

        try {
          // Get refresh token
          const refreshToken = await window.electronAPI.getRefreshToken()

          if (!refreshToken) {
            throw new Error('No refresh token available')
          }

          // Refresh token. Explicit timeout: without it, a hung refresh
          // request blocks every queued 401-retry indefinitely.
          const response = await axios.post(
            `${API_URL}/auth/refresh`,
            { refreshToken },
            { timeout: 15000 }
          )

          const { accessToken } = response.data

          // Save new token and update cache
          this.cachedAccessToken = accessToken
          await window.electronAPI.saveTokens(accessToken, refreshToken)

          // Retry all queued requests with new token
          this.failedQueue.forEach(({ resolve }) => {
            resolve(accessToken)
          })
          this.failedQueue = []

          // Retry original request
          originalRequest.headers.Authorization = `Bearer ${accessToken}`
          return this.client(originalRequest)
        } catch (refreshError: unknown) {
          // Refresh failed - clear queue and redirect to login
          this.failedQueue.forEach(({ reject }) => {
            reject(refreshError)
          })
          this.failedQueue = []

          // Clear tokens, cache, and redirect to login
          this.cachedAccessToken = null
          await window.electronAPI.clearTokens()
          window.location.href = '/login'
          return Promise.reject(refreshError)
        } finally {
          this.isRefreshing = false
        }
      }
    )
  }

  clearCachedToken() {
    this.cachedAccessToken = null
  }

  getInstance() {
    return this.client
  }

  async requestWithRetry<T>(config: AxiosRequestConfig, retries = MAX_RETRIES): Promise<T> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await this.client.request<T>(config)
        return response.data
      } catch (err) {
        const error = err as AxiosError
        if (attempt < retries && isRetryable(error)) {
          const waitTime = RETRY_BASE_DELAY * Math.pow(2, attempt)
          console.warn(`[API] Request failed, retrying in ${waitTime}ms (attempt ${attempt + 1}/${retries})`)
          await delay(waitTime)
          continue
        }
        throw error
      }
    }
    throw new Error('Unreachable')
  }
}

const apiClientInstance = new APIClient()
export const apiClient = apiClientInstance.getInstance()
export { apiClientInstance }
