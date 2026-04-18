import React, { useEffect, useState, useRef, useCallback } from 'react'
import { authService, User } from '../services/api/auth'
import { settingsService } from '../services/api/settings'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sidebar } from '@/components/Sidebar'
import { Globe, Keyboard, Info, MessageSquare } from 'lucide-react'
import { LANGUAGES } from '@/lib/languages'

interface SettingsProps {
  onLogout: () => void
  onNavigate?: (page: string) => void
}

export interface AppSettings {
  language: string
  autoFormat: boolean
  removeFillers: boolean
  customPrompt: string
}

export const DEFAULT_SETTINGS: AppSettings = {
  language: 'en',
  autoFormat: true,
  removeFillers: true,
  customPrompt: '',
}

export function loadSettings(): AppSettings {
  try {
    const stored = localStorage.getItem('airtype-settings')
    if (stored) {
      const merged = { ...DEFAULT_SETTINGS, ...JSON.parse(stored) }
      // Guard against a stale language code that was dropped from LANGUAGES
      // (e.g. users who had Japanese selected before we narrowed the list).
      if (!LANGUAGES.some((l) => l.code === merged.language)) {
        merged.language = DEFAULT_SETTINGS.language
      }
      return merged
    }
  } catch { /* ignore */ }
  return DEFAULT_SETTINGS
}

function saveSettings(settings: AppSettings) {
  localStorage.setItem('airtype-settings', JSON.stringify(settings))
}

export function Settings({ onLogout, onNavigate }: SettingsProps) {
  const [user, setUser] = useState<User | null>(null)
  const [settings, setSettings] = useState<AppSettings>(loadSettings)
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load user and settings from server on mount
  useEffect(() => {
    authService.getCurrentUser()
      .then(setUser)
      .catch((err) => console.warn('Failed to load user:', err))

    settingsService.get()
      .then((serverSettings) => {
        const merged = { ...DEFAULT_SETTINGS, ...serverSettings }
        setSettings(merged)
        saveSettings(merged)
      })
      .catch((err) => console.warn('Failed to load settings from server:', err))
  }, [])

  // Debounced sync to server (avoids spamming on every keystroke)
  const syncToServer = useCallback((newSettings: AppSettings) => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    syncTimerRef.current = setTimeout(() => {
      settingsService.update(newSettings)
        .catch((err) => console.warn('Failed to sync settings:', err))
    }, 500)
  }, [])

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value }
      saveSettings(next)
      syncToServer(next)
      return next
    })
  }

  return (
    <div className="flex h-screen bg-muted/30 p-3 gap-3">
      <Sidebar activeItem="settings" onLogout={onLogout} onNavigate={onNavigate} />

      <div className="flex-1 flex flex-col overflow-hidden bg-background rounded-xl border border-border">
        <header className="flex items-center px-8 py-4 border-b border-border" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
          <h1 className="text-lg font-semibold text-foreground" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>Settings</h1>
        </header>

        <main className="flex-1 overflow-y-auto p-8 space-y-6">
          {/* Account */}
          <Card className="border border-border rounded-xl shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Account</CardTitle>
            </CardHeader>
            <CardContent>
              {user ? (
                <div className="flex items-center gap-4">
                  <Avatar className="w-14 h-14">
                    <AvatarImage src={user.picture} alt={user.name} />
                    <AvatarFallback>{user.name?.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="text-base font-semibold text-foreground">{user.name}</p>
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                  </div>
                  <Badge variant="secondary" className="capitalize">
                    {user.plan || 'Free'} Plan
                  </Badge>
                </div>
              ) : (
                <div className="h-14 flex items-center">
                  <div className="w-6 h-6 border-2 border-muted border-t-primary rounded-full animate-spin" />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Transcription Settings */}
          <Card className="border border-border rounded-xl shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-brand-ocean" />
                <CardTitle className="text-lg">Transcription</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Language */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Language</p>
                  <p className="text-xs text-muted-foreground">Primary language for transcription</p>
                </div>
                <select
                  value={settings.language}
                  onChange={(e) => updateSetting('language', e.target.value)}
                  className="px-3 py-1.5 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>{lang.name}</option>
                  ))}
                </select>
              </div>

              {/* Auto-format */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Auto-format</p>
                  <p className="text-xs text-muted-foreground">Clean up punctuation and capitalization</p>
                </div>
                <button
                  onClick={() => updateSetting('autoFormat', !settings.autoFormat)}
                  className={`relative w-10 h-6 rounded-full transition-colors ${
                    settings.autoFormat ? 'bg-brand-ocean' : 'bg-muted-foreground/30'
                  }`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    settings.autoFormat ? 'translate-x-4' : ''
                  }`} />
                </button>
              </div>

              {/* Remove fillers */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Remove filler words</p>
                  <p className="text-xs text-muted-foreground">Remove "um", "uh", "like" from transcriptions</p>
                </div>
                <button
                  onClick={() => updateSetting('removeFillers', !settings.removeFillers)}
                  className={`relative w-10 h-6 rounded-full transition-colors ${
                    settings.removeFillers ? 'bg-brand-ocean' : 'bg-muted-foreground/30'
                  }`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    settings.removeFillers ? 'translate-x-4' : ''
                  }`} />
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Custom Prompt */}
          <Card className="border border-border rounded-xl shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-brand-ocean" />
                <CardTitle className="text-lg">Personalization</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-sm font-medium text-foreground mb-1">Custom instructions</p>
                <p className="text-xs text-muted-foreground mb-3">
                  Add extra instructions for how your transcriptions should be cleaned up. For example: "Use British English spelling", "Keep technical jargon as-is", "Format as bullet points".
                </p>
                <textarea
                  value={settings.customPrompt}
                  onChange={(e) => updateSetting('customPrompt', e.target.value)}
                  placeholder="e.g. Always use formal tone. Keep code-related terms unchanged."
                  rows={3}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
              </div>
            </CardContent>
          </Card>

          {/* Keyboard Shortcut */}
          <Card className="border border-border rounded-xl shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <Keyboard className="w-5 h-5 text-brand-ocean" />
                <CardTitle className="text-lg">Keyboard Shortcut</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Push-to-talk</p>
                  <p className="text-xs text-muted-foreground">Hold to record, release to transcribe</p>
                </div>
                <kbd className="px-3 py-1.5 text-sm font-mono rounded-lg border border-border bg-muted text-foreground">
                  fn
                </kbd>
              </div>
            </CardContent>
          </Card>

          {/* About */}
          <Card className="border border-border rounded-xl shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <Info className="w-5 h-5 text-brand-ocean" />
                <CardTitle className="text-lg">About</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Version</p>
                <p className="text-sm text-foreground">1.0.0</p>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Model</p>
                <p className="text-sm text-foreground">Whisper Large V3 Turbo</p>
              </div>
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="border border-destructive/30 rounded-xl shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Sign out</p>
                  <p className="text-xs text-muted-foreground">Sign out of your account on this device</p>
                </div>
                <Button variant="outline" size="sm" onClick={onLogout} className="text-destructive border-destructive/30 hover:bg-destructive/10">
                  Sign Out
                </Button>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  )
}
