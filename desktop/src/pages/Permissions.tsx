import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Shield, CheckCircle2, ExternalLink, RefreshCw } from 'lucide-react'
import logoImg from '/logo.png'

interface PermissionsProps {
  onPermissionsGranted: () => void
}

export function Permissions({ onPermissionsGranted }: PermissionsProps) {
  const [accessibilityGranted, setAccessibilityGranted] = useState(false)
  const [microphoneGranted, setMicrophoneGranted] = useState(false)
  const [checking, setChecking] = useState(false)

  const checkPermissions = async () => {
    setChecking(true)
    try {
      const accessibility = await window.electronAPI?.checkAccessibilityPermission()
      const microphone = await window.electronAPI?.checkMicrophonePermission()

      setAccessibilityGranted(accessibility ?? false)
      setMicrophoneGranted(microphone ?? false)

      if (accessibility && microphone) {
        // Small delay to show the success state
        setTimeout(() => {
          onPermissionsGranted()
        }, 500)
      }
    } catch (error) {
      console.error('Failed to check permissions:', error)
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    checkPermissions()
  }, [])

  const openAccessibilitySettings = () => {
    window.electronAPI?.openAccessibilitySettings()
  }

  const requestMicrophonePermission = async () => {
    const granted = await window.electronAPI?.requestMicrophonePermission()
    if (granted) {
      setMicrophoneGranted(true)
      checkPermissions()
    }
  }

  const allGranted = accessibilityGranted && microphoneGranted

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-cyan/20 via-white to-brand-sky/20 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 flex items-center justify-center p-8">
      <div className="max-w-lg w-full">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex justify-center mb-4">
            <img src={logoImg} alt="AirType" className="h-16 w-auto" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Welcome to AirType</h1>
          <p className="text-muted-foreground mt-1">Let's set up a few things first</p>
        </div>

        {/* Permissions Card */}
        <Card className="border border-border shadow-xl">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg bg-brand-cyan/30 dark:bg-brand-ocean/20">
                <Shield className="w-5 h-5 text-brand-ocean dark:text-brand-ocean" />
              </div>
              <div>
                <h2 className="font-semibold text-foreground">Permissions Required</h2>
                <p className="text-sm text-muted-foreground">AirType needs these permissions to work</p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Accessibility Permission */}
              <div className={`p-4 rounded-xl border transition-all ${
                accessibilityGranted
                  ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-900/20'
                  : 'border-border bg-muted/30'
              }`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {accessibilityGranted ? (
                        <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30" />
                      )}
                      <h3 className="font-medium text-foreground">Accessibility</h3>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 ml-7">
                      Required to detect the fn key for push-to-talk recording
                    </p>
                  </div>
                  {!accessibilityGranted && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={openAccessibilitySettings}
                      className="ml-4 shrink-0"
                    >
                      <ExternalLink className="w-4 h-4 mr-1" />
                      Open Settings
                    </Button>
                  )}
                </div>
              </div>

              {/* Microphone Permission */}
              <div className={`p-4 rounded-xl border transition-all ${
                microphoneGranted
                  ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-900/20'
                  : 'border-border bg-muted/30'
              }`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {microphoneGranted ? (
                        <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30" />
                      )}
                      <h3 className="font-medium text-foreground">Microphone</h3>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 ml-7">
                      Required to record your voice for transcription
                    </p>
                  </div>
                  {!microphoneGranted && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={requestMicrophonePermission}
                      className="ml-4 shrink-0"
                    >
                      Grant Access
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Instructions for Accessibility */}
            {!accessibilityGranted && (
              <div className="mt-6 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900">
                <h4 className="font-medium text-amber-800 dark:text-amber-200 text-sm">How to enable Accessibility:</h4>
                <ol className="mt-2 text-sm text-amber-700 dark:text-amber-300 space-y-1 list-decimal list-inside">
                  <li>Click "Open Settings" above</li>
                  <li>Find "AirType" in the list</li>
                  <li>Toggle the switch to enable</li>
                  <li>Come back here and click "Check Again"</li>
                </ol>
              </div>
            )}

            {/* Check Again Button */}
            <div className="mt-6 flex justify-center">
              {allGranted ? (
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="font-medium">All permissions granted!</span>
                </div>
              ) : (
                <Button
                  onClick={checkPermissions}
                  disabled={checking}
                  className="bg-gradient-to-r from-brand-ocean to-brand-dark hover:from-brand-dark hover:to-brand-dark"
                >
                  {checking ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Checking...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Check Again
                    </>
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Skip for now */}
        <p className="text-center text-sm text-muted-foreground mt-4">
          You can also grant permissions later in System Settings
        </p>
      </div>
    </div>
  )
}
