import { contextBridge, ipcRenderer } from 'electron'

// Expose protected methods to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Authentication
  async openGoogleAuth(url: string) {
    if (typeof url !== 'string' || !/^https:\/\//i.test(url)) {
      throw new Error('openGoogleAuth: only https:// URLs are allowed')
    }
    return await ipcRenderer.invoke('open-external', url)
  },

  // Starts a login flow: main generates a nonce, registers it with the backend,
  // and returns the OAuth URL for the renderer to open.
  async beginLogin(): Promise<{ url: string }> {
    return await ipcRenderer.invoke('begin-login')
  },

  onAuthCallback(callback: (tokens: { accessToken: string; refreshToken: string }) => void) {
    // Remove existing listeners first to prevent duplicates
    ipcRenderer.removeAllListeners('auth-callback')
    ipcRenderer.on('auth-callback', (_event, tokens) => {
      callback(tokens)
    })
  },

  removeAuthCallbackListener() {
    ipcRenderer.removeAllListeners('auth-callback')
  },

  // Token storage (via IPC to main process)
  async saveTokens(accessToken: string, refreshToken: string) {
    return await ipcRenderer.invoke('save-tokens', accessToken, refreshToken)
  },

  async getAccessToken(): Promise<string | null> {
    return await ipcRenderer.invoke('get-access-token')
  },

  async getRefreshToken(): Promise<string | null> {
    return await ipcRenderer.invoke('get-refresh-token')
  },

  async clearTokens() {
    return await ipcRenderer.invoke('clear-tokens')
  },

  // Widget communication
  sendTranscriptionResult(result: unknown) {
    ipcRenderer.send('transcription-result', result)
  },

  onTranscriptionResult(callback: (result: unknown) => void) {
    // Remove existing listeners first to prevent duplicates
    ipcRenderer.removeAllListeners('transcription-result')
    ipcRenderer.on('transcription-result', (_event, result) => {
      callback(result)
    })
  },

  removeTranscriptionResultListener() {
    ipcRenderer.removeAllListeners('transcription-result')
  },

  async showMainWindow() {
    return await ipcRenderer.invoke('show-main-window')
  },

  // Paste text at cursor position
  async pasteText(text: string) {
    return await ipcRenderer.invoke('paste-text', text)
  },

  // Hotkey events for push-to-talk
  // Each function removes existing listeners before adding to prevent duplicates
  onHotkeyRecordStart(callback: () => void) {
    ipcRenderer.removeAllListeners('hotkey-record-start')
    ipcRenderer.on('hotkey-record-start', () => {
      callback()
    })
  },

  onHotkeyRecordStop(callback: () => void) {
    ipcRenderer.removeAllListeners('hotkey-record-stop')
    ipcRenderer.on('hotkey-record-stop', () => {
      callback()
    })
  },

  onHotkeyRecordCancel(callback: () => void) {
    ipcRenderer.removeAllListeners('hotkey-record-cancel')
    ipcRenderer.on('hotkey-record-cancel', () => {
      callback()
    })
  },

  removeHotkeyListeners() {
    ipcRenderer.removeAllListeners('hotkey-record-start')
    ipcRenderer.removeAllListeners('hotkey-record-stop')
    ipcRenderer.removeAllListeners('hotkey-record-cancel')
  },

  // Notify main process that recording/transcription completed (resets hotkey state)
  notifyRecordingCompleted() {
    ipcRenderer.send('recording-completed')
  },

  // Permission checks
  async checkAccessibilityPermission(): Promise<boolean> {
    return await ipcRenderer.invoke('check-accessibility-permission')
  },

  async checkMicrophonePermission(): Promise<boolean> {
    return await ipcRenderer.invoke('check-microphone-permission')
  },

  async requestMicrophonePermission(): Promise<boolean> {
    return await ipcRenderer.invoke('request-microphone-permission')
  },

  openAccessibilitySettings() {
    ipcRenderer.invoke('open-accessibility-settings')
  },

  // Widget click-through control
  async setWidgetInteractive(interactive: boolean) {
    return await ipcRenderer.invoke('set-widget-interactive', interactive)
  },

  // Widget visibility control
  async setWidgetVisible(visible: boolean) {
    return await ipcRenderer.invoke('set-widget-visible', visible)
  },

  // Dialogs
  async showDialog(type: 'info' | 'warning' | 'error', title: string, message: string) {
    return await ipcRenderer.invoke('show-dialog', type, title, message)
  },
})
