import { app, BrowserWindow, ipcMain, shell, screen, clipboard, systemPreferences, Tray, Menu, nativeImage, dialog, net } from 'electron'
import { autoUpdater } from 'electron-updater'
import { exec } from 'child_process'
import { promisify } from 'util'
import crypto from 'crypto'

const execAsync = promisify(exec)

// Derive the backend origin from VITE_API_URL so both the main process and
// the renderer share a single source of truth at build time. Vite substitutes
// import.meta.env.VITE_* constants into the bundled main.js, so this works in
// packaged builds where process.env vars aren't available.
const BACKEND_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api').replace(/\/api\/?$/, '')
import path from 'path'
import Store from 'electron-store'

// Initialize store in main process.
// `projectName` is a valid runtime option but missing from the bundled types in
// this version — required because the store is instantiated before app is ready.
// encryptionKey is obfuscation, not true encryption — the key ships in the
// binary, so anyone with the .app can read the store. Acceptable for a
// single-user desktop app; see README "Security Notes".
const store = new Store({
  projectName: 'airtype',
  name: 'airtype-auth',
  encryptionKey: 'airtype-secure-key-2024',
} as ConstructorParameters<typeof Store>[0])

// --- Window state persistence ---
interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  isMaximized?: boolean
}

function loadWindowState(): WindowState {
  const saved = store.get('windowState') as WindowState | undefined
  return saved || { width: 1200, height: 800 }
}

function saveWindowState(win: BrowserWindow) {
  if (win.isDestroyed()) return
  const isMaximized = win.isMaximized()
  const bounds = win.getNormalBounds()
  store.set('windowState', {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    isMaximized,
  })
}

// --- Auto-updater setup ---
function setupAutoUpdater() {
  if (app.isPackaged) {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('update-available', (info) => {
      console.log('[Airtype] Update available:', info.version)
    })

    autoUpdater.on('update-downloaded', (info) => {
      console.log('[Airtype] Update downloaded:', info.version)
      if (mainWindow && !mainWindow.isDestroyed()) {
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'Update Ready',
          message: `Version ${info.version} has been downloaded and will be installed when you quit.`,
          buttons: ['Restart Now', 'Later'],
        }).then(({ response }) => {
          if (response === 0) {
            autoUpdater.quitAndInstall()
          }
        })
      }
    })

    autoUpdater.on('error', (err) => {
      console.error('[Airtype] Auto-update error:', err.message)
    })

    autoUpdater.checkForUpdatesAndNotify()
  }
}

// Native fn key listener - loaded lazily after app is ready
type FnKeyStartResult = { ok: true } | { ok: false; code: string; message?: string }
type FnKeyStatus = { listening: boolean; trusted: boolean; available: boolean }
let fnKeyListener: {
  startListening: (cb: (state: string) => void) => FnKeyStartResult
  stopListening: () => void
  isTrusted: () => boolean
  getStatus: () => FnKeyStatus
} | null = null

function loadNativeModule() {
  try {
    const isDev = !app.isPackaged
    const nativeModulePath = isDev
      ? path.join(__dirname, '../native/fn-key')
      : path.join(process.resourcesPath, 'app.asar.unpacked/native/fn-key')
    fnKeyListener = require(nativeModulePath)
  } catch (e: any) {
    console.error('[Airtype] Failed to load fn-key native module:', e)
  }
}

let mainWindow: BrowserWindow | null = null
let widgetWindow: BrowserWindow | null = null
let tray: Tray | null = null

// Store pending auth tokens if callback arrives before window is ready.
// Hydrated from electron-store on startup so tokens survive an app quit
// that happens mid-OAuth (e.g. user closes the app before the window opens).
type PendingTokens = { accessToken: string; refreshToken: string }
let pendingAuthTokens: PendingTokens | null = (store.get('pendingAuthTokens', null) as PendingTokens | null)

function clearPersistedPendingTokens() {
  store.delete('pendingAuthTokens')
}

// Helper to send auth callback - waits for webContents to be ready
function sendAuthCallback(tokens: PendingTokens) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    pendingAuthTokens = tokens
    store.set('pendingAuthTokens', tokens)
    return
  }

  if (mainWindow.webContents.isLoading()) {
    // Persist while we wait — if the app is killed before delivery, the next
    // launch picks these up via hydration on startup.
    pendingAuthTokens = tokens
    store.set('pendingAuthTokens', tokens)
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow?.webContents.send('auth-callback', tokens)
      mainWindow?.show()
      mainWindow?.focus()
      pendingAuthTokens = null
      clearPersistedPendingTokens()
    })
  } else {
    mainWindow.webContents.send('auth-callback', tokens)
    mainWindow.show()
    mainWindow.focus()
    pendingAuthTokens = null
    clearPersistedPendingTokens()
  }
}

// Register custom protocol for OAuth callback
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('airtype', process.execPath, [
      path.resolve(process.argv[1]),
    ])
  }
} else {
  app.setAsDefaultProtocolClient('airtype')
}

function createMainWindow() {
  const windowState = loadWindowState()

  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Required for keytar
    },
    titleBarStyle: 'hiddenInset',
    show: false, // Don't show until ready
  })

  if (windowState.isMaximized) {
    mainWindow.maximize()
  }

  mainWindow.on('resize', () => { if (mainWindow) saveWindowState(mainWindow) })
  mainWindow.on('move', () => { if (mainWindow) saveWindowState(mainWindow) })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.once('did-finish-load', () => {
    if (pendingAuthTokens) {
      mainWindow?.webContents.send('auth-callback', pendingAuthTokens)
      mainWindow?.show()
      mainWindow?.focus()
      pendingAuthTokens = null
      clearPersistedPendingTokens()
    }
  })

  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('close', () => {
    if (mainWindow) saveWindowState(mainWindow)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function createWidgetWindow(): Promise<void> {
  return new Promise((resolve) => {
    const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize

    widgetWindow = new BrowserWindow({
      width: 220,
      height: 70,
      x: Math.round((screenWidth - 220) / 2),
      y: screenHeight - 100,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: false,
      show: false, // Start hidden, show when recording
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    })

    // Wait for content to be ready before resolving
    widgetWindow.webContents.once('dom-ready', () => {
      resolve()
    })

    // Load widget page
    if (!app.isPackaged) {
      widgetWindow.loadURL('http://localhost:5173/#/widget')
    } else {
      widgetWindow.loadFile(path.join(__dirname, '../dist/index.html'), {
        hash: '/widget'
      })
    }

    widgetWindow.on('closed', () => {
      widgetWindow = null
    })

    // Make widget click-through by default (clicks pass to windows behind)
    widgetWindow.setIgnoreMouseEvents(true, { forward: true })
  })
}

// Create tray icon in menu bar
function createTray() {
  // Use logo for tray icon
  // In dev: public/logo.png, in prod: dist/logo.png (vite copies public to dist)
  const isDev = !app.isPackaged
  const iconPath = isDev
    ? path.join(__dirname, '../public/logo.png')
    : path.join(__dirname, '../dist/logo.png')

  // Create tray icon - resize to appropriate size for menu bar
  let icon = nativeImage.createFromPath(iconPath)
  if (icon.isEmpty()) {
    console.error('[Airtype] Failed to load tray icon from:', iconPath)
    return
  }
  icon = icon.resize({ width: 18, height: 18 })

  // On macOS, set as template image for proper light/dark mode support
  if (process.platform === 'darwin') {
    icon.setTemplateImage(true)
  }

  tray = new Tray(icon)
  tray.setToolTip('Airtype')

  const showOrCreateMainWindow = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
      mainWindow.focus()
    } else {
      // Window was closed, recreate it
      createMainWindow()
    }
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Airtype',
      click: showOrCreateMainWindow,
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit()
      },
    },
  ])

  tray.setContextMenu(contextMenu)

  // Click on tray icon shows the main window (macOS)
  tray.on('click', showOrCreateMainWindow)
}

async function promptAccessibilityPermission() {
  if (process.platform !== 'darwin') return
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    title: 'Accessibility Permission Required',
    message: 'Airtype needs Accessibility access to detect the fn key.',
    detail: 'Open System Settings → Privacy & Security → Accessibility and enable Airtype, then restart the app.',
    buttons: ['Open Settings', 'Later'],
    defaultId: 0,
    cancelId: 1,
  })
  if (response === 0) {
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility')
  }
}

// Setup fn key push-to-talk (hold fn to record, release to stop)
async function setupFnKeyListener() {
  if (!fnKeyListener) {
    console.error('fn-key native module not available')
    return
  }

  if (process.platform === 'darwin' && !fnKeyListener.isTrusted()) {
    console.warn('[Airtype] Accessibility permission not granted — fn key will not work')
    await promptAccessibilityPermission()
    return
  }

  // Ignore "down" events that arrive within FN_DEBOUNCE_MS of the previous one
  // to absorb key-bounce and accidental double-taps. "up" and "cancel" always
  // pass through so we never strand a recording.
  const FN_DEBOUNCE_MS = 50
  let lastFnDownAt = 0

  const result = fnKeyListener.startListening((state: string) => {
    if (!widgetWindow || widgetWindow.isDestroyed()) return

    if (state === 'down') {
      const now = Date.now()
      if (now - lastFnDownAt < FN_DEBOUNCE_MS) return
      lastFnDownAt = now
      widgetWindow.webContents.send('hotkey-record-start')
    } else if (state === 'up') {
      widgetWindow.webContents.send('hotkey-record-stop')
    } else if (state === 'cancel') {
      widgetWindow.webContents.send('hotkey-record-cancel')
    }
  })

  if (!result.ok) {
    console.error('[Airtype] Failed to initialize fn key listener:', result.code, result.message || '')
    if (result.code === 'EACCESS_DENIED') {
      await promptAccessibilityPermission()
    }
  }
}

// ---- OAuth callback handling (exchange-code flow with client nonce) ----
// Flow:
// 1. Renderer calls `begin-login` → main generates clientNonce, persists it,
//    fetches the Google OAuth URL from backend (nonce passed along), returns URL.
// 2. Renderer opens URL in browser. User authenticates with Google.
// 3. Backend redirects to airtype://auth/callback?code=<exchangeCode>&nonce=<clientNonce>.
// 4. Main receives open-url, validates the nonce (defends against a malicious
//    app or reflected URL triggering the protocol), POSTs /auth/exchange to
//    redeem the one-time code, and forwards the tokens to the renderer.

const PENDING_NONCE_KEY = 'pendingLoginNonce'

async function exchangeCodeForTokens(code: string): Promise<PendingTokens | null> {
  return new Promise((resolve) => {
    const req = net.request({
      method: 'POST',
      url: `${BACKEND_URL}/api/auth/exchange`,
    })
    req.setHeader('Content-Type', 'application/json')
    let body = ''
    req.on('response', (res) => {
      res.on('data', (chunk) => { body += chunk.toString() })
      res.on('end', () => {
        if (res.statusCode !== 200) {
          console.error('[Airtype] /auth/exchange failed:', res.statusCode, body)
          resolve(null)
          return
        }
        try {
          const parsed = JSON.parse(body)
          if (parsed.accessToken && parsed.refreshToken) {
            resolve({ accessToken: parsed.accessToken, refreshToken: parsed.refreshToken })
          } else {
            resolve(null)
          }
        } catch (e) {
          console.error('[Airtype] /auth/exchange: invalid JSON response', e)
          resolve(null)
        }
      })
    })
    req.on('error', (err) => {
      console.error('[Airtype] /auth/exchange network error:', err)
      resolve(null)
    })
    req.write(JSON.stringify({ code }))
    req.end()
  })
}

async function handleOAuthCallback(rawUrl: string) {
  if (!rawUrl.startsWith('airtype://auth/callback')) return

  const urlObj = new URL(rawUrl)
  const code = urlObj.searchParams.get('code')
  const nonce = urlObj.searchParams.get('nonce')

  // Legacy fallback: if a prior login somehow emitted accessToken/refreshToken,
  // accept them so in-flight flows during the upgrade don't strand users.
  const legacyAccess = urlObj.searchParams.get('accessToken')
  const legacyRefresh = urlObj.searchParams.get('refreshToken')
  if (legacyAccess && legacyRefresh) {
    console.warn('[Airtype] Received legacy token-in-URL callback; accepting once')
    sendAuthCallback({ accessToken: legacyAccess, refreshToken: legacyRefresh })
    return
  }

  if (!code) {
    console.error('[Airtype] OAuth callback missing code')
    return
  }

  const expectedNonce = store.get(PENDING_NONCE_KEY, null) as string | null
  if (!expectedNonce || expectedNonce !== nonce) {
    console.error('[Airtype] OAuth callback nonce mismatch — refusing to exchange. expected:', !!expectedNonce, 'got:', !!nonce)
    return
  }
  // Single-use: clear the nonce before exchange so a replay can't re-trigger.
  store.delete(PENDING_NONCE_KEY)

  const tokens = await exchangeCodeForTokens(code)
  if (!tokens) {
    console.error('[Airtype] Failed to exchange code for tokens')
    return
  }
  sendAuthCallback(tokens)
}

// Handle OAuth callback from custom protocol (macOS/Windows)
app.on('open-url', (event, url) => {
  // Do not log `url` — it contains the OAuth exchange code + client nonce.
  event.preventDefault()
  handleOAuthCallback(url).catch((err) => console.error('[Airtype] open-url handler error:', err))
})

// Handle second instance (Windows)
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
    // Check for OAuth callback in command line (Windows)
    const url = commandLine.find((arg) => arg.startsWith('airtype://'))
    if (url && url.includes('auth/callback')) {
      handleOAuthCallback(url).catch((err) =>
        console.error('[Airtype] second-instance OAuth handler error:', err)
      )
    }
  })

  app.whenReady().then(async () => {
    // Load native module after app is ready (for reliable app.isPackaged detection)
    loadNativeModule()

    createMainWindow()
    createTray()
    setupAutoUpdater()
    // Wait for widget content to load before setting up fn key listener
    await createWidgetWindow()
    await setupFnKeyListener()

    app.on('activate', async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow()
        await createWidgetWindow()
        await setupFnKeyListener()
      }
    })
  })
}

// Stop fn key listener when app quits
app.on('will-quit', () => {
  fnKeyListener?.stopListening()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// IPC Handlers
ipcMain.handle('open-external', async (_event, url: string) => {
  // Whitelist https:// only. Without this, a compromised renderer could pass
  // file://, javascript:, or custom-scheme URLs and we'd happily open them.
  if (typeof url !== 'string' || !/^https:\/\//i.test(url)) {
    throw new Error('open-external: only https:// URLs are allowed')
  }
  await shell.openExternal(url)
})

// IPC to send transcription result from widget to main window
ipcMain.on('transcription-result', (_event, result) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('transcription-result', result)
  }
})

ipcMain.on('recording-completed', () => {
  // Currently a no-op on the main side; kept as a hook for future state mgmt.
})

// IPC to show/hide main window
ipcMain.handle('show-main-window', async () => {
  if (mainWindow) {
    mainWindow.show()
    mainWindow.focus()
  }
})

// IPC to paste text at cursor position
ipcMain.handle('paste-text', async (_event, text: string) => {
  const previousClipboard = clipboard.readText()
  clipboard.writeText(text)

  // Small delay to ensure clipboard is ready
  await new Promise(resolve => setTimeout(resolve, 50))

  try {
    if (process.platform === 'darwin') {
      await execAsync(`osascript -e 'tell application "System Events" to keystroke "v" using command down'`)
    } else if (process.platform === 'win32') {
      await execAsync('powershell -command "$wshell = New-Object -ComObject wscript.shell; $wshell.SendKeys(\'^v\')"')
    } else {
      await execAsync('xdotool key ctrl+v')
    }
  } catch (err: any) {
    console.error('[Airtype] Paste keystroke failed:', err?.message || err)
    clipboard.writeText(previousClipboard)
    return false
  }

  // Target app receives keystroke asynchronously; wait before restoring clipboard.
  setTimeout(() => {
    clipboard.writeText(previousClipboard)
  }, 500)

  return true
})

// Permission check handlers
ipcMain.handle('check-accessibility-permission', async () => {
  if (process.platform === 'darwin') {
    return systemPreferences.isTrustedAccessibilityClient(false)
  }
  return true // Windows/Linux don't need this permission
})

ipcMain.handle('check-microphone-permission', async () => {
  if (process.platform === 'darwin') {
    const status = systemPreferences.getMediaAccessStatus('microphone')
    return status === 'granted'
  }
  return true // Windows/Linux handle this differently
})

ipcMain.handle('request-microphone-permission', async () => {
  if (process.platform === 'darwin') {
    const granted = await systemPreferences.askForMediaAccess('microphone')
    return granted
  }
  return true
})

ipcMain.handle('open-accessibility-settings', async () => {
  if (process.platform === 'darwin') {
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility')
  }
})

// Widget mouse events control (for click-through behavior)
ipcMain.handle('set-widget-interactive', async (_event, interactive: boolean) => {
  if (widgetWindow) {
    if (interactive) {
      widgetWindow.setIgnoreMouseEvents(false)
    } else {
      widgetWindow.setIgnoreMouseEvents(true, { forward: true })
    }
  }
})

// Widget visibility control (hide when idle to avoid any visual artifacts)
ipcMain.handle('set-widget-visible', async (_event, visible: boolean) => {
  if (widgetWindow) {
    if (visible) {
      // Use showInactive() to display without stealing focus from active app
      widgetWindow.showInactive()
    } else {
      widgetWindow.hide()
    }
  }
})

// Begin a Google login: generate + persist a client nonce, ask the backend
// for the OAuth URL (tagging it with our nonce), and return that URL to the
// renderer so it can open the system browser. The nonce is validated in
// handleOAuthCallback to reject callbacks we didn't initiate.
ipcMain.handle('begin-login', async () => {
  const clientNonce = crypto.randomBytes(24).toString('base64url')
  store.set(PENDING_NONCE_KEY, clientNonce)

  return new Promise<{ url: string }>((resolve, reject) => {
    const req = net.request({
      method: 'GET',
      url: `${BACKEND_URL}/api/auth/google/login?clientNonce=${encodeURIComponent(clientNonce)}`,
    })
    let body = ''
    req.on('response', (res) => {
      res.on('data', (chunk) => { body += chunk.toString() })
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`begin-login: backend returned ${res.statusCode}`))
          return
        }
        try {
          const parsed = JSON.parse(body)
          if (typeof parsed.url !== 'string') {
            reject(new Error('begin-login: missing url in response'))
            return
          }
          resolve({ url: parsed.url })
        } catch (e) {
          reject(new Error('begin-login: invalid JSON response'))
        }
      })
    })
    req.on('error', (err) => reject(err))
    req.end()
  })
})

// Token storage handlers (using electron-store instead of keychain)
ipcMain.handle('save-tokens', async (_event, accessToken: string, refreshToken: string) => {
  try {
    store.set('accessToken', accessToken)
    store.set('refreshToken', refreshToken)
    return true
  } catch (error) {
    console.error('Failed to save tokens:', error)
    return false
  }
})

ipcMain.handle('get-access-token', async () => {
  try {
    return store.get('accessToken', null) as string | null
  } catch (error) {
    console.error('Failed to get access token:', error)
    return null
  }
})

ipcMain.handle('get-refresh-token', async () => {
  try {
    return store.get('refreshToken', null) as string | null
  } catch (error) {
    console.error('Failed to get refresh token:', error)
    return null
  }
})

ipcMain.handle('clear-tokens', async () => {
  try {
    store.delete('accessToken')
    store.delete('refreshToken')
    return true
  } catch (error) {
    console.error('Failed to clear tokens:', error)
    return false
  }
})

ipcMain.handle('show-dialog', async (_event, type: 'info' | 'warning' | 'error', title: string, message: string) => {
  const parentWindow = mainWindow || BrowserWindow.getFocusedWindow()
  if (parentWindow) {
    await dialog.showMessageBox(parentWindow, {
      type,
      title,
      message,
      buttons: ['OK'],
    })
  } else {
    await dialog.showMessageBox({
      type,
      title,
      message,
      buttons: ['OK'],
    })
  }
})
