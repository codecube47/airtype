import React from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Sidebar } from '@/components/Sidebar'
import { HelpCircle, Keyboard, Mic, ShieldCheck, AlertCircle, Github, ExternalLink } from 'lucide-react'

interface HelpProps {
  onLogout: () => void
  onNavigate?: (page: string) => void
}

export function Help({ onLogout, onNavigate }: HelpProps) {
  const openAccessibility = () => {
    window.electronAPI?.openAccessibilitySettings?.()
  }

  const openExternal = (url: string) => {
    // openGoogleAuth is the existing https-only gate on window.electronAPI
    window.electronAPI?.openGoogleAuth?.(url).catch((err) => {
      console.error('[Help] Failed to open URL:', err)
    })
  }

  return (
    <div className="flex h-screen bg-muted/30 p-3 gap-3">
      <Sidebar activeItem="help" onLogout={onLogout} onNavigate={onNavigate} />

      <div className="flex-1 flex flex-col overflow-hidden bg-background rounded-xl border border-border">
        <header
          className="flex items-center px-8 py-4 border-b border-border"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <h1
            className="text-lg font-semibold text-foreground"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            Help &amp; Support
          </h1>
        </header>

        <main className="flex-1 overflow-y-auto p-8 space-y-6">
          {/* Intro / how it works */}
          <Card className="border border-border rounded-xl shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <Keyboard className="w-5 h-5 text-brand-ocean" />
                <CardTitle className="text-lg">How it works</CardTitle>
              </div>
              <CardDescription>Push-to-talk dictation from any app on your Mac.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-foreground leading-relaxed">
                Hold the{' '}
                <kbd className="px-1.5 py-0.5 text-xs font-mono rounded border border-border bg-muted">fn</kbd>{' '}
                key anywhere on your Mac, speak, and release. AirType transcribes what you said and pastes it into the
                currently focused application.
              </p>
              <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside leading-relaxed">
                <li>Click into the app/text field where you want the text to appear.</li>
                <li>Press and hold the <span className="font-medium text-foreground">fn</span> key.</li>
                <li>Speak clearly. A small indicator appears at the bottom of your screen while recording.</li>
                <li>Release <span className="font-medium text-foreground">fn</span>. The cleaned-up text auto-pastes.</li>
              </ol>
            </CardContent>
          </Card>

          {/* Permissions */}
          <Card className="border border-border rounded-xl shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-brand-ocean" />
                <CardTitle className="text-lg">Permissions</CardTitle>
              </div>
              <CardDescription>AirType needs two macOS permissions to work.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <Mic className="w-4 h-4 mt-0.5 shrink-0 text-brand-ocean" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Microphone</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Used to capture your voice while you hold the fn key. macOS will prompt on first use.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Keyboard className="w-4 h-4 mt-0.5 shrink-0 text-brand-ocean" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Accessibility</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Required so AirType can detect the fn key system-wide — even when another app is focused.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={openAccessibility}
                    className="mt-2 gap-2"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open Accessibility settings
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Troubleshooting */}
          <Card className="border border-border rounded-xl shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-brand-ocean" />
                <CardTitle className="text-lg">Troubleshooting</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <dl className="text-sm space-y-4">
                <div>
                  <dt className="font-medium text-foreground">The fn key doesn't trigger recording</dt>
                  <dd className="text-muted-foreground leading-relaxed mt-1">
                    Open System Settings → Privacy &amp; Security → Accessibility and make sure AirType is enabled.
                    Restart the app after granting permission.
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">Text isn't pasted into my app</dt>
                  <dd className="text-muted-foreground leading-relaxed mt-1">
                    The target app must be focused when you release fn. Click once into the text field before recording.
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">Transcription is wrong or in the wrong language</dt>
                  <dd className="text-muted-foreground leading-relaxed mt-1">
                    Change the language in{' '}
                    <button
                      onClick={() => onNavigate?.('settings')}
                      className="text-brand-ocean hover:text-brand-dark underline underline-offset-2"
                    >
                      Settings → Transcription
                    </button>
                    . You can also add custom instructions under Personalization (e.g. &quot;use British spelling&quot;).
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">I've hit the free-plan word limit</dt>
                  <dd className="text-muted-foreground leading-relaxed mt-1">
                    The free plan includes 3,000 words. The limit resets monthly. Upgrade to Pro for unlimited usage.
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">Filler words aren't being removed (or are being removed when I don't want that)</dt>
                  <dd className="text-muted-foreground leading-relaxed mt-1">
                    Toggle{' '}
                    <span className="font-medium text-foreground">Remove filler words</span> in{' '}
                    <button
                      onClick={() => onNavigate?.('settings')}
                      className="text-brand-ocean hover:text-brand-dark underline underline-offset-2"
                    >
                      Settings
                    </button>
                    .
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {/* Contact */}
          <Card className="border border-border rounded-xl shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-brand-ocean" />
                <CardTitle className="text-lg">Contact &amp; feedback</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                Found a bug or have a feature request? File an issue on GitHub — I read everything.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => openExternal('https://github.com/codecube47/airtype/issues')}
                className="gap-2"
              >
                <Github className="w-3.5 h-3.5" />
                Open GitHub issues
              </Button>
            </CardContent>
          </Card>

          {/* About footer */}
          <div className="text-center pt-4">
            <p className="text-xs text-muted-foreground">AirType · v1.0.0</p>
          </div>
        </main>
      </div>
    </div>
  )
}
