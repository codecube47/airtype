export interface ElectronAPI {
  // Authentication
  openGoogleAuth(url: string): Promise<void>
  beginLogin(): Promise<{ url: string }>
  onAuthCallback(callback: (tokens: { accessToken: string; refreshToken: string }) => void): void
  removeAuthCallbackListener(): void

  // Token storage
  saveTokens(accessToken: string, refreshToken: string): Promise<boolean>
  getAccessToken(): Promise<string | null>
  getRefreshToken(): Promise<string | null>
  clearTokens(): Promise<boolean>

  // Widget communication
  sendTranscriptionResult(result: unknown): void
  onTranscriptionResult(callback: (result: unknown) => void): void
  removeTranscriptionResultListener(): void
  showMainWindow(): Promise<void>

  // Text insertion
  pasteText(text: string): Promise<boolean>

  // Hotkey events for push-to-talk
  onHotkeyRecordStart(callback: () => void): void
  onHotkeyRecordStop(callback: () => void): void
  onHotkeyRecordCancel(callback: () => void): void
  removeHotkeyListeners(): void
  notifyRecordingCompleted(): void

  // Permission checks
  checkAccessibilityPermission(): Promise<boolean>
  checkMicrophonePermission(): Promise<boolean>
  requestMicrophonePermission(): Promise<boolean>
  openAccessibilitySettings(): void

  // Widget click-through control
  setWidgetInteractive(interactive: boolean): Promise<void>

  // Widget visibility control
  setWidgetVisible(visible: boolean): Promise<void>

  // Dialogs
  showDialog(type: 'info' | 'warning' | 'error', title: string, message: string): Promise<void>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
