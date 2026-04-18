import React from 'react'

interface RecordingBarProps {
  isRecording: boolean
  isProcessing: boolean
  onStart: () => void
  onCancel: () => void
  onStop: () => void
}

export function RecordingBar({
  isRecording,
  isProcessing,
  onStart,
  onCancel,
  onStop
}: RecordingBarProps) {
  // Idle state - show microphone button
  if (!isRecording && !isProcessing) {
    return (
      <div style={styles.container}>
        <button
          style={styles.micButton}
          onClick={onStart}
          title="Start Recording"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
          </svg>
        </button>
      </div>
    )
  }

  // Recording/Processing state - show full bar
  return (
    <div style={styles.container}>
      <div style={styles.bar}>
        {/* Cancel Button */}
        <button
          style={styles.cancelButton}
          onClick={onCancel}
          disabled={isProcessing}
          title="Cancel"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M1 1L13 13M1 13L13 1"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>

        {/* Waveform Indicator */}
        <div style={styles.waveformContainer}>
          {isProcessing ? (
            <span style={styles.processingText}>Processing...</span>
          ) : (
            <div style={styles.waveform}>
              {[...Array(10)].map((_, i) => (
                <div
                  key={i}
                  style={{
                    ...styles.dot,
                    animationDelay: `${i * 0.1}s`,
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Stop Button */}
        <button
          style={{
            ...styles.stopButton,
            ...(isProcessing ? styles.stopButtonDisabled : {}),
          }}
          onClick={onStop}
          disabled={isProcessing}
          title="Stop Recording"
        >
          <div style={styles.stopIcon} />
        </button>
      </div>
    </div>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    position: 'fixed',
    bottom: '32px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 1000,
  },
  micButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '56px',
    height: '56px',
    background: '#1a202c',
    border: 'none',
    borderRadius: '50%',
    color: 'white',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '8px 12px',
    background: 'transparent',
    borderRadius: '28px',
  },
  cancelButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    background: 'transparent',
    border: 'none',
    borderRadius: '50%',
    color: '#a0aec0',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  waveformContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '120px',
    height: '32px',
  },
  waveform: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  dot: {
    width: '4px',
    height: '4px',
    borderRadius: '50%',
    background: '#a0aec0',
    animation: 'pulse 1s ease-in-out infinite',
  },
  processingText: {
    color: '#a0aec0',
    fontSize: '13px',
    fontWeight: 500,
  },
  stopButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    background: '#e57373',
    border: 'none',
    borderRadius: '50%',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  stopButtonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  stopIcon: {
    width: '12px',
    height: '12px',
    background: 'white',
    borderRadius: '2px',
  },
}
