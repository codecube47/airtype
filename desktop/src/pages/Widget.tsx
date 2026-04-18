import { useState, useCallback, useEffect, useRef, CSSProperties } from 'react'
import { whisperService } from '../services/groq/whisper'
import { llmService } from '../services/groq/llm'
import { transcribeService } from '../services/api/transcribe'
import { configService } from '../services/api/config'
import { useRecording } from '../hooks/useRecording'
import { loadSettings } from './Settings'

// Poll interval for checking if word limit was reset (30 seconds)
const LIMIT_CHECK_INTERVAL = 30000

export function Widget() {
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [isLimitReached, setIsLimitReached] = useState(false)

  // Make body/html/root fully transparent for widget overlay
  useEffect(() => {
    // Reset all elements to be fully transparent
    document.documentElement.style.cssText = 'background: transparent !important; margin: 0; padding: 0; min-height: 0; height: auto;'
    document.body.style.cssText = 'background: transparent !important; margin: 0; padding: 0; min-height: 0; height: auto;'
    const root = document.getElementById('root')
    if (root) {
      root.style.cssText = 'background: transparent !important; margin: 0; padding: 0; min-height: 0; height: auto;'
    }
  }, [])

  // Pre-fetch config (Groq API key) AND warm the Groq TCP/TLS connection on
  // widget mount so the first transcription doesn't pay the handshake penalty
  // (~100–200ms on a cold connection).
  useEffect(() => {
    configService.getConfig().catch((err) => {
      console.warn('[Widget] Failed to pre-fetch config:', err)
    })
    // The response doesn't matter — the TCP + TLS handshake is what we're
    // warming up. Fire-and-forget; any subsequent fetch to api.groq.com will
    // reuse the kept-alive connection.
    fetch('https://api.groq.com/openai/v1/models', {
      method: 'HEAD',
      mode: 'no-cors',
    }).catch(() => { /* handshake warmed even if response fails */ })
  }, [])

  // Poll stats when limit is reached to detect when word count is reset
  useEffect(() => {
    if (!isLimitReached) return

    const checkLimitReset = async () => {
      try {
        const stats = await transcribeService.getStats()
        // If words remaining > 0, the limit was reset - allow recording again
        if (stats.wordsRemaining > 0 || stats.wordsRemaining === -1) {
          console.log('[Widget] Word limit reset detected, re-enabling recording')
          setIsLimitReached(false)
        }
      } catch (err) {
        console.warn('[Widget] Failed to check stats:', err)
      }
    }

    // Check immediately
    checkLimitReset()

    // Then poll periodically
    const intervalId = setInterval(checkLimitReset, LIMIT_CHECK_INTERVAL)

    return () => clearInterval(intervalId)
  }, [isLimitReached])

  // Refs to track current state for hotkey callbacks (avoids stale closures)
  const isRecordingRef = useRef(false)
  const isProcessingRef = useRef(false)
  const isTranscribingRef = useRef(isTranscribing)
  // True while startRecording() is awaiting getUserMedia but before state flips
  // to 'recording'. Needed so fn-up during that window cancels the pending start
  // instead of being silently dropped.
  const pendingStartRef = useRef(false)

  const handleRecordingComplete = useCallback(async (audioBlob: Blob) => {
    if (!window.electronAPI) {
      console.error('Widget: electronAPI not available')
      return
    }

    // Block if limit was previously reached
    if (isLimitReached) {
      console.warn('Word limit reached - transcription blocked')
      return
    }

    setIsTranscribing(true)
    const startTime = performance.now()
    const settings = loadSettings()
    try {
      // Step 1: Transcribe directly with Groq Whisper (audio → raw text)
      const rawText = await whisperService.transcribe(audioBlob, settings.language)

      // Step 2: Clean up text with Groq LLM (raw text → cleaned text).
      // Run cleanup whenever the user wants ANY modification: autoFormat,
      // filler-removal override, or a non-empty custom prompt. Skipping cleanup
      // entirely requires all three to be inactive.
      const hasCustomPrompt = !!settings.customPrompt?.trim()
      const shouldCleanup = settings.autoFormat || hasCustomPrompt
      let cleanedText = rawText
      if (shouldCleanup) {
        try {
          cleanedText = await llmService.cleanupText(rawText, {
            removeFillers: settings.removeFillers,
            customPrompt: settings.customPrompt,
            language: settings.language,
          })
        } catch (cleanupErr) {
          console.warn('Text cleanup failed, using raw text:', cleanupErr)
        }
      }

      // Calculate processing time (in seconds)
      const processingTime = (performance.now() - startTime) / 1000

      // Step 3: Paste text immediately (don't wait for save)
      const textToPaste = cleanedText || rawText
      if (textToPaste) {
        await window.electronAPI.pasteText(textToPaste)
      }

      // Step 4: Save to backend asynchronously (fire and forget)
      transcribeService.save(rawText, cleanedText, processingTime, settings.language)
        .then((result) => {
          // Send result to main window after save completes
          window.electronAPI?.sendTranscriptionResult(result)
          // Reset limit flag on successful save (in case limit was reset)
          if (isLimitReached) {
            setIsLimitReached(false)
          }
        })
        .catch((err: { response?: { status?: number; data?: { message?: string } } }) => {
          console.error('Failed to save transcription:', err)
          console.log('[Widget] Error response status:', err.response?.status)
          console.log('[Widget] Error response data:', err.response?.data)
          // Set flag and show alert if word limit reached (403)
          if (err.response?.status === 403) {
            console.log('[Widget] Word limit reached, showing dialog...')
            setIsLimitReached(true)
            const message = err.response?.data?.message || 'You have reached the 3,000 word limit for the free plan. Please upgrade to continue.'
            window.electronAPI?.showDialog('warning', 'Word Limit Reached', message)
              .then(() => console.log('[Widget] Dialog closed'))
              .catch((dialogErr) => console.error('[Widget] Dialog error:', dialogErr))
          }
        })
    } catch (err) {
      console.error('Transcription failed:', err)
    } finally {
      setIsTranscribing(false)
      window.electronAPI.notifyRecordingCompleted()
    }
  }, [isLimitReached])

  const handleRecordingError = useCallback((err: Error) => {
    console.error('Recording error:', err)
  }, [])

  const {
    isRecording,
    isProcessing,
    startRecording,
    stopRecording,
    cancelRecording,
  } = useRecording({
    onRecordingComplete: handleRecordingComplete,
    onError: handleRecordingError,
  })

  // Keep refs in sync with state (for hotkey callbacks)
  useEffect(() => {
    isRecordingRef.current = isRecording
    isProcessingRef.current = isProcessing
    isTranscribingRef.current = isTranscribing
  }, [isRecording, isProcessing, isTranscribing])

  // Store recording functions in refs to avoid dependency changes
  const startRecordingRef = useRef(startRecording)
  const stopRecordingRef = useRef(stopRecording)
  const cancelRecordingRef = useRef(cancelRecording)

  // Keep function refs updated
  useEffect(() => {
    startRecordingRef.current = startRecording
    stopRecordingRef.current = stopRecording
    cancelRecordingRef.current = cancelRecording
  }, [startRecording, stopRecording, cancelRecording])

  // Listen for fn key hotkey events (push-to-talk)
  // Using refs for all state/functions to ensure stable callbacks and prevent listener duplication
  useEffect(() => {
    if (!window.electronAPI) {
      console.error('Widget: electronAPI not available for hotkey listeners')
      return
    }

    const handleHotkeyStart = () => {
      if (
        !isRecordingRef.current &&
        !isProcessingRef.current &&
        !isTranscribingRef.current &&
        !pendingStartRef.current
      ) {
        pendingStartRef.current = true
        const p = startRecordingRef.current()
        Promise.resolve(p).finally(() => {
          pendingStartRef.current = false
        })
      }
    }

    const handleHotkeyStop = () => {
      if (isRecordingRef.current) {
        stopRecordingRef.current()
      } else if (pendingStartRef.current) {
        // fn released before getUserMedia resolved — abort the pending start
        cancelRecordingRef.current()
      }
    }

    const handleHotkeyCancel = () => {
      if (isRecordingRef.current || pendingStartRef.current) {
        cancelRecordingRef.current()
      }
    }

    window.electronAPI.onHotkeyRecordStart(handleHotkeyStart)
    window.electronAPI.onHotkeyRecordStop(handleHotkeyStop)
    window.electronAPI.onHotkeyRecordCancel(handleHotkeyCancel)

    return () => {
      window.electronAPI?.removeHotkeyListeners()
    }
  }, []) // Empty deps - all state accessed via refs

  const showBar = isRecording || isProcessing || isTranscribing

  // Toggle visibility and click-through based on widget state
  useEffect(() => {
    if (!window.electronAPI) return

    // When active (recording/processing), show widget and make interactive
    // When idle, hide widget completely to avoid any visual artifacts
    const updateWidgetState = async () => {
      try {
        // Order matters: set visibility first, then interactivity
        await window.electronAPI.setWidgetVisible(showBar)
        await window.electronAPI.setWidgetInteractive(showBar)
      } catch (err) {
        console.error('Widget: Failed to update visibility state:', err)
      }
    }
    updateWidgetState()
  }, [showBar])

  // Idle state - show nothing (completely transparent and click-through)
  if (!showBar) {
    return <div style={styles.container} />
  }

  // Ocean theme colors for bars and dots
  const barColors = ['#0891b2', '#38bdf8', '#14b8a6', '#22d3ee'] // ocean, sky, teal, cyan
  const dotColors = ['#0891b2', '#38bdf8', '#14b8a6'] // ocean, sky, teal

  // Recording state - modern wave bars
  if (isRecording) {
    return (
      <div style={styles.container}>
        <div style={styles.pill}>
          <div style={styles.barsContainer}>
            {barColors.map((color, i) => (
              <div
                key={i}
                style={{
                  ...styles.bar,
                  background: color,
                  animationDelay: `${i * 0.15}s`,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Processing state - smooth pulsing dots
  return (
    <div style={styles.container}>
      <div style={styles.pill}>
        <div style={styles.dotsContainer}>
          {dotColors.map((color, i) => (
            <div
              key={i}
              style={{
                ...styles.dot,
                background: color,
                animationDelay: `${i * 0.15}s`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

const styles: { [key: string]: CSSProperties } = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
    background: 'transparent',
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
  },
  pill: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '72px',
    height: '40px',
    borderRadius: '20px',
    background: 'rgba(0, 0, 0, 0.65)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
    pointerEvents: 'auto' as const,
  },
  barsContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '3px',
    height: '18px',
  },
  bar: {
    width: '3px',
    height: '18px',
    borderRadius: '2px',
    animationName: 'soundWave',
    animationDuration: '0.8s',
    animationTimingFunction: 'ease-in-out',
    animationIterationCount: 'infinite',
  },
  dotsContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
  },
  dot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    animationName: 'dotPulse',
    animationDuration: '1s',
    animationTimingFunction: 'ease-in-out',
    animationIterationCount: 'infinite',
  },
}
