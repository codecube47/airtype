#!/bin/bash

# =============================================================================
# AirType Backend Deployment Script
# Deploys Go backend + MongoDB to Railway
# =============================================================================

set -e

# =============================================================================
# Load .env.prod if exists
# =============================================================================

ENV_FILE=".env.prod"
if [ -f "$ENV_FILE" ]; then
    echo "Loading environment from $ENV_FILE..."
    set -a  # automatically export all variables
    source "$ENV_FILE"
    set +a
else
    echo "Warning: $ENV_FILE not found. Using defaults or Railway variables."
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_step() {
    echo -e "${BLUE}==>${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}!${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# =============================================================================
# Check Prerequisites
# =============================================================================

print_step "Checking prerequisites..."

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    print_error "Railway CLI not found. Install with: brew install railway"
    exit 1
fi
print_success "Railway CLI found"

# Check if logged in
if ! railway whoami &> /dev/null; then
    print_warning "Not logged in to Railway. Opening login..."
    railway login
fi
print_success "Logged in to Railway"

# =============================================================================
# Project Setup
# =============================================================================

print_step "Setting up Railway project..."

# Check if already linked to a project
if railway status &> /dev/null 2>&1; then
    PROJECT_NAME=$(railway status 2>/dev/null | grep "Project:" | awk '{print $2}')
    print_success "Already linked to project: $PROJECT_NAME"
else
    # Initialize new project
    print_step "Creating new Railway project..."
    railway init --name airtype-backend
    print_success "Project created"
fi

# =============================================================================
# Deploy Backend
# =============================================================================

print_step "Deploying backend..."
# First deployment creates the service automatically
railway up --detach

print_success "Backend deployment started"

# =============================================================================
# Link to Backend Service (Interactive)
# =============================================================================

print_step "Linking to backend service..."

# Check if a service is already linked
if ! railway status 2>/dev/null | grep -q "Service:"; then
    print_warning "No service linked. Please select your backend service."
    echo ""
    echo "Running 'railway service' - select your backend service from the list:"
    echo ""
    railway service
    echo ""
fi

# Verify service is now linked
if ! railway status 2>/dev/null | grep -q "Service:"; then
    print_error "No service linked. Cannot continue."
    print_warning "Please run: railway service"
    print_warning "Then re-run this script."
    exit 1
fi
print_success "Service linked"

# =============================================================================
# Add MongoDB (if not exists)
# =============================================================================

print_step "Checking for MongoDB..."

# Check if MongoDB already exists by looking for MongoDB-related variables
if railway variables 2>/dev/null | grep -qi "MONGO"; then
    print_success "MongoDB already exists in project"
else
    print_step "Adding MongoDB database..."

    # Try different Railway CLI commands for adding MongoDB
    if railway add --database mongo 2>/dev/null; then
        print_success "MongoDB added successfully"
        # Wait for MongoDB to provision
        print_step "Waiting for MongoDB to be ready..."
        sleep 10
    elif railway add --plugin mongodb 2>/dev/null; then
        print_success "MongoDB plugin added successfully"
        sleep 10
    else
        print_warning "Could not add MongoDB automatically."
        print_warning "Please add MongoDB manually:"
        echo ""
        echo "  Option 1: railway add  (then select MongoDB)"
        echo "  Option 2: railway open (then click '+ New' -> 'Database' -> 'MongoDB')"
        echo ""
        read -p "Press Enter after adding MongoDB to continue, or Ctrl+C to abort..."
    fi
fi

# =============================================================================
# Set Environment Variables
# =============================================================================

print_step "Setting environment variables from .env.prod..."

# Use values from .env.prod, with sensible defaults
JWT_SECRET=${JWT_SECRET:-$(openssl rand -base64 32)}
MONGODB_DB=${MONGODB_DB:-airtype}
GROQ_WHISPER_MODEL=${GROQ_WHISPER_MODEL:-whisper-large-v3-turbo}
GROQ_LLM_MODEL=${GROQ_LLM_MODEL:-llama-3.3-70b-versatile}
DESKTOP_CALLBACK_URL=${DESKTOP_CALLBACK_URL:-airtype://auth/callback}

# Set all variables - production overrides for localhost values
railway variables \
    --set "PORT=3001" \
    --set "ENV=production" \
    --set "JWT_SECRET=$JWT_SECRET" \
    --set 'MONGODB_URI=${{MongoDB.MONGO_URL}}' \
    --set "MONGODB_DB=$MONGODB_DB" \
    --set "GROQ_WHISPER_MODEL=$GROQ_WHISPER_MODEL" \
    --set "GROQ_LLM_MODEL=$GROQ_LLM_MODEL" \
    --set "DESKTOP_CALLBACK_URL=$DESKTOP_CALLBACK_URL"

# Set secrets from .env.prod if available
if [ -n "$GROQ_API_KEY" ]; then
    railway variables --set "GROQ_API_KEY=$GROQ_API_KEY"
    print_success "GROQ_API_KEY set from .env.prod"
fi

if [ -n "$GOOGLE_CLIENT_ID" ]; then
    railway variables --set "GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID"
    print_success "GOOGLE_CLIENT_ID set from .env.prod"
fi

if [ -n "$GOOGLE_CLIENT_SECRET" ]; then
    railway variables --set "GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET"
    print_success "GOOGLE_CLIENT_SECRET set from .env.prod"
fi

print_success "Environment variables set"

# =============================================================================
# Generate Domain and Set GOOGLE_REDIRECT_URL
# =============================================================================

print_step "Generating Railway domain..."
railway domain 2>/dev/null || true

# Try to get the domain and set GOOGLE_REDIRECT_URL automatically
print_step "Setting GOOGLE_REDIRECT_URL..."
RAILWAY_DOMAIN=$(railway domain 2>/dev/null | grep -oE 'https://[^ ]+' | head -1)

if [ -n "$RAILWAY_DOMAIN" ]; then
    REDIRECT_URL="${RAILWAY_DOMAIN}/api/auth/google/callback"
    railway variables --set "GOOGLE_REDIRECT_URL=$REDIRECT_URL"
    print_success "GOOGLE_REDIRECT_URL set to: $REDIRECT_URL"
else
    print_warning "Could not detect Railway domain automatically."
    print_warning "Set GOOGLE_REDIRECT_URL manually after deployment:"
    echo "  railway variables --set \"GOOGLE_REDIRECT_URL=https://YOUR-APP.railway.app/api/auth/google/callback\""
fi

# =============================================================================
# Done
# =============================================================================

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Deployment initiated successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

if [ -n "$RAILWAY_DOMAIN" ]; then
    echo "Your API is deploying to: $RAILWAY_DOMAIN"
    echo ""
    echo -e "${YELLOW}IMPORTANT: Add this redirect URL to Google Cloud Console:${NC}"
    echo "  $REDIRECT_URL"
    echo ""
    echo "Next steps:"
    echo "  1. Wait for deployment to complete (check with: railway logs)"
    echo "  2. Add the redirect URL above to Google OAuth credentials"
    echo "  3. Update desktop/.env with VITE_API_URL=${RAILWAY_DOMAIN}/api"
else
    echo "Next steps:"
    echo "  1. Wait for deployment to complete (check with: railway logs)"
    echo "  2. Get your Railway URL from the dashboard"
    echo "  3. Set GOOGLE_REDIRECT_URL in Railway variables"
    echo "  4. Add the redirect URL to Google OAuth credentials"
    echo "  5. Update desktop/.env with VITE_API_URL=https://YOUR-APP.railway.app/api"
fi
echo ""
echo "Useful commands:"
echo "  railway logs        - View deployment logs"
echo "  railway status      - Check deployment status"
echo "  railway open        - Open Railway dashboard"
echo "  railway up          - Redeploy after changes"
echo ""
