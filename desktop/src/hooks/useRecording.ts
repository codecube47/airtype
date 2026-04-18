import { useState, useRef, useCallback } from 'react'

export type RecordingState = 'idle' | 'recording' | 'processing'

// Cap recordings so a stuck fn key doesn't accumulate an unbounded blob.
const MAX_RECORDING_MS = 5 * 60 * 1000

interface UseRecordingOptions {
  onRecordingComplete?: (audioBlob: Blob) => void
  onError?: (error: Error) => void
}

interface UseRecordingReturn {
  state: RecordingState
  isRecording: boolean
  isProcessing: boolean
  startRecording: () => Promise<void>
  stopRecording: () => void
  cancelRecording: () => void
  audioBlob: Blob | null
}

export function useRecording(options: UseRecordingOptions = {}): UseRecordingReturn {
  const { onRecordingComplete, onError } = options

  const [state, setState] = useState<RecordingState>('idle')
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const isCancelledRef = useRef(false)
  // Session ID to prevent old callbacks from affecting new recordings
  const sessionIdRef = useRef(0)
  const maxDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearMaxDurationTimer = useCallback(() => {
    if (maxDurationTimerRef.current) {
      clearTimeout(maxDurationTimerRef.current)
      maxDurationTimerRef.current = null
    }
  }, [])

  const cleanup = useCallback(() => {
    try {
      clearMaxDurationTimer()
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }
      mediaRecorderRef.current = null
      audioChunksRef.current = []
    } catch {
      // Ignore cleanup errors
    }
  }, [clearMaxDurationTimer])

  const startRecording = useCallback(async () => {
    // Prevent starting if already recording
    if (state === 'recording' || state === 'processing') {
      return
    }

    try {
      // Increment session ID to invalidate any pending callbacks from previous recordings
      const currentSession = ++sessionIdRef.current
      isCancelledRef.current = false

      // Clear previous state
      setAudioBlob(null)
      audioChunksRef.current = []

      // Cleanup any existing stream/recorder
      cleanup()

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          // Whisper resamples to 16kHz internally; recording at 16kHz mono
          // cuts upload size ~3x vs 44.1kHz stereo with zero quality loss
          // for speech.
          sampleRate: 16000,
          channelCount: 1,
        },
      })

      // Check if session is still valid (user might have cancelled during getUserMedia)
      if (sessionIdRef.current !== currentSession) {
        stream.getTracks().forEach(track => track.stop())
        return
      }

      streamRef.current = stream

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4'

      const mediaRecorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = mediaRecorder

      // Capture chunks for this specific session
      const sessionChunks: Blob[] = []

      mediaRecorder.ondataavailable = (event) => {
        // Only collect data if this is still the active session
        if (sessionIdRef.current === currentSession && event.data.size > 0) {
          sessionChunks.push(event.data)
          audioChunksRef.current = sessionChunks
        }
      }

      mediaRecorder.onstop = () => {
        // Only process if this is still the active session and not cancelled
        if (sessionIdRef.current !== currentSession) {
          return
        }

        if (!isCancelledRef.current && sessionChunks.length > 0) {
          const blob = new Blob(sessionChunks, { type: mimeType })
          setAudioBlob(blob)
          onRecordingComplete?.(blob)
        }

        cleanup()
        setState('idle')
      }

      mediaRecorder.onerror = () => {
        if (sessionIdRef.current !== currentSession) {
          return
        }
        const error = new Error('Recording error occurred')
        onError?.(error)
        cleanup()
        setAudioBlob(null)
        setState('idle')
      }

      mediaRecorder.start(100)
      setState('recording')

      maxDurationTimerRef.current = setTimeout(() => {
        if (
          sessionIdRef.current === currentSession &&
          mediaRecorderRef.current?.state === 'recording'
        ) {
          console.warn('[useRecording] Max recording duration reached, auto-stopping')
          mediaRecorderRef.current.stop()
          setState('processing')
        }
      }, MAX_RECORDING_MS)
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Failed to start recording')
      onError?.(err)
      cleanup()
      setState('idle')
    }
  }, [state, cleanup, onRecordingComplete, onError])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      setState('processing')
      mediaRecorderRef.current.stop()
    }
  }, [])

  const cancelRecording = useCallback(() => {
    // Increment session ID to invalidate any pending callbacks
    sessionIdRef.current++
    isCancelledRef.current = true
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
    cleanup()
    setAudioBlob(null)
    setState('idle')
  }, [cleanup])

  return {
    state,
    isRecording: state === 'recording',
    isProcessing: state === 'processing',
    startRecording,
    stopRecording,
    cancelRecording,
    audioBlob,
  }
}
