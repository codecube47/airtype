# Airtype Setup Guide

Complete step-by-step guide to get Airtype running on your machine.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Go 1.21+** - [Download](https://golang.org/dl/)
- **Node.js 18+** - [Download](https://nodejs.org/)
- **Docker Desktop** - [Download](https://www.docker.com/products/docker-desktop)
- **Make** (optional, for convenience commands)

## Step 1: Clone the Repository

```bash
git clone https://github.com/yourusername/airtype.git
cd airtype
```

## Step 2: Get API Credentials

### 2.1 Get Groq API Key

1. Go to [https://console.groq.com](https://console.groq.com)
2. Sign up or log in
3. Navigate to API Keys
4. Create a new API key
5. Copy the key (starts with `gsk_`)

### 2.2 Setup Google OAuth

1. Go to [https://console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project called "Airtype"
3. Enable the **Google+ API**:
   - Go to "APIs & Services" > "Library"
   - Search for "Google+ API"
   - Click "Enable"

4. Create OAuth 2.0 credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - Choose "Web application"
   - Set name: "Airtype Desktop"
   - Add authorized redirect URI:
     ```
     http://localhost:3001/api/auth/google/callback
     ```
   - Click "Create"
   - Copy the **Client ID** and **Client Secret**

### 2.3 Generate JWT Secret

Generate a secure JWT secret:

```bash
# On macOS/Linux
openssl rand -base64 48
```

> **Enforced**: the backend refuses to start if `JWT_SECRET` is under 32 bytes (HS256 requires 256-bit minimum per RFC 7518). Weaker secrets fail fast at startup with a clear error, not silently.

## Step 3: Configure Backend

```bash
cd backend

# Copy environment template
cp .env.example .env

# Edit .env with your credentials
nano .env  # or use your preferred editor
```

Update the following in `backend/.env`:

```bash
# JWT Secret (from Step 2.3)
JWT_SECRET=your-generated-jwt-secret-here

# Google OAuth (from Step 2.2)
GOOGLE_CLIENT_ID=123456789-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-secret-here

# Groq API Key (from Step 2.1)
GROQ_API_KEY=gsk_your_groq_api_key_here
```

## Step 4: Configure Desktop App

```bash
cd ../desktop

# Copy environment template
cp .env.example .env

# The default settings should work for local development
```

## Step 5: Start Services

### Option A: Using Docker (Recommended)

Start MongoDB:

```bash
# From project root
docker-compose up -d mongodb

# Verify services are running
docker-compose ps
```

### Option B: Manual Setup

If you prefer to run MongoDB locally without Docker:

**MongoDB:**
```bash
# macOS (using Homebrew)
brew install mongodb-community
brew services start mongodb-community

# Ubuntu/Debian
sudo apt-get install mongodb
sudo systemctl start mongodb
```

## Step 6: Install Dependencies

### Backend Dependencies

```bash
cd backend
go mod download
```

### Desktop Dependencies

```bash
cd ../desktop
npm install
```

## Step 7: Run the Application

You'll need two terminal windows:

### Terminal 1: Backend Server

```bash
cd backend
go run cmd/server/main.go
```

You should see:
```
INFO    Starting Airtype API server    port=3001 environment=development
INFO    Connected to MongoDB
INFO    Server started on port 3001
```

### Terminal 2: Desktop App

```bash
cd desktop
npm run dev
```

You should see:
```
VITE v5.0.8  ready in 500 ms

➜  Local:   http://localhost:5173/
```

The Electron app window should open automatically.

## Step 8: Test the Setup

1. Click **"Sign in with Google"** in the desktop app
2. Your browser should open with Google OAuth
3. Sign in with your Google account
4. You should be redirected back to the app and see the Dashboard

## Troubleshooting

### Backend Issues

**MongoDB connection error:**
```bash
# Check if MongoDB is running
docker-compose ps mongodb

# View MongoDB logs
docker-compose logs mongodb
```

**Port 3001 already in use:**
```bash
# Find process using port 3001
lsof -i :3001

# Kill the process
kill -9 <PID>
```

### Desktop App Issues

**`TypeError: Cannot read properties of undefined (reading 'setAsDefaultProtocolClient')` or `require('electron')` returns a string:**

Check whether `ELECTRON_RUN_AS_NODE=1` is set in your shell. This env var forces Electron to run as plain Node.js, which breaks *everything* (the `app`, `BrowserWindow`, etc. are all undefined). Find and remove it from your shell config:

```bash
env | grep ELECTRON_RUN_AS_NODE
grep -r ELECTRON_RUN_AS_NODE ~/.zshrc ~/.bashrc ~/.profile ~/.config 2>/dev/null

# Temporary workaround while debugging
env -u ELECTRON_RUN_AS_NODE npm run dev
```

**Dev build silently exits immediately after Vite finishes building:**

Usually means another instance of Airtype (often the packaged `/Applications/Airtype.app`) is running and holding the single-instance lock, so `app.requestSingleInstanceLock()` returns `false` and the dev build calls `app.quit()`. Quit the installed version, or give the dev build a distinct `productName`.

**Native fn-key module fails to load or silently does nothing:**

The module needs macOS Accessibility permission. The app now shows an explicit dialog on denial, but you can check the state from DevTools:

```js
// In the renderer DevTools console
await window.electronAPI.checkAccessibilityPermission()
```

If `false`, open System Settings → Privacy & Security → Accessibility, enable Airtype/Electron, then restart the app.

**"Cannot find module" errors:**
```bash
cd desktop
rm -rf node_modules package-lock.json
npm install
```

**Rebuild the native fn-key module (e.g. after Node/Electron upgrade):**
```bash
cd desktop/native/fn-key
npx node-gyp rebuild
```

### Google OAuth Issues

**"Redirect URI mismatch":**
- Ensure the redirect URI in Google Console exactly matches:
  ```
  http://localhost:3001/api/auth/google/callback
  ```
- No trailing slash
- Must use `http://` for localhost (not `https://`)

**"Access blocked: This app's request is invalid":**
- Make sure Google+ API is enabled
- Wait a few minutes after enabling the API

## Development Tips

### Hot Reload

**Backend (using Air):**
```bash
# Install Air
go install github.com/cosmtrek/air@latest

# Run with hot reload
cd backend
air
```

**Desktop:**
```bash
# Already has hot reload with Vite
cd desktop
npm run dev
```

### View Logs

**Backend logs:**
- Logs appear in the terminal where you ran `go run cmd/server/main.go`

**Desktop logs:**
- Open DevTools in the Electron app: `Cmd+Option+I` (Mac) or `Ctrl+Shift+I` (Windows)
- View Console tab

**Database:**
```bash
# With docker-compose's MongoDB (auth-enabled)
docker exec -it airtype-mongodb mongosh mongodb://admin:admin123@localhost:27017/airtype?authSource=admin

# With a bare mongo container (no auth)
docker exec -it <container-name> mongosh
use airtype

# View users
db.users.find().pretty()

# View transcriptions
db.transcriptions.find().limit(5).pretty()

# View per-user settings
db.settings.find().pretty()
```

> If your `MONGODB_URI` in `.env` doesn't match the auth settings of your running container, the backend will fail with `AuthenticationFailed`. Align the URI with the container: strip `admin:password@...?authSource=admin` when using an auth-disabled container.

## Using Make Commands

If you have `make` installed, you can use these shortcuts:

```bash
# Install all dependencies
make install

# Start MongoDB
make docker-up

# Run backend
make dev-backend

# Run desktop app
make dev-desktop

# Run both (requires tmux)
make dev

# Clean build artifacts
make clean
```

## Next Steps

- Read the full [README.md](./README.md) for architecture details
- Check [API documentation](./docs/API.md) for API endpoints
- See [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution guidelines

## Getting Help

- **Issues**: https://github.com/yourusername/airtype/issues
- **Discussions**: https://github.com/yourusername/airtype/discussions
- **Email**: support@airtype.com

## Production Deployment

For production deployment instructions, see the [Production Deployment section in README.md](./README.md#production-deployment).
