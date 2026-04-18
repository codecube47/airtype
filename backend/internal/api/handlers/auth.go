package handlers

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"

	"airtype/internal/config"
	"airtype/internal/models"
	"airtype/internal/repository"
	"airtype/internal/services/auth"
	"airtype/pkg/logger"
)

type oauthState struct {
	expiry      time.Time
	clientNonce string // echoed back in the airtype:// redirect for client-side CSRF validation
}

type exchangeEntry struct {
	accessToken  string
	refreshToken string
	expiry       time.Time
}

type AuthHandler struct {
	userRepo   *repository.UserRepository
	jwtService *auth.JWTService
	config     *config.Config

	// In-memory store for OAuth state tokens (CSRF protection)
	oauthStates   map[string]oauthState
	oauthStatesMu sync.Mutex

	// One-time codes that trade for tokens. Keeps tokens out of the redirect URL
	// so they don't land in browser history or server access logs.
	exchangeCodes   map[string]exchangeEntry
	exchangeCodesMu sync.Mutex
}

func NewAuthHandler(
	userRepo *repository.UserRepository,
	jwtService *auth.JWTService,
	cfg *config.Config,
) *AuthHandler {
	h := &AuthHandler{
		userRepo:      userRepo,
		jwtService:    jwtService,
		config:        cfg,
		oauthStates:   make(map[string]oauthState),
		exchangeCodes: make(map[string]exchangeEntry),
	}

	// Periodically clean up expired OAuth states and exchange codes.
	go func() {
		ticker := time.NewTicker(1 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			now := time.Now()

			h.oauthStatesMu.Lock()
			for state, s := range h.oauthStates {
				if now.After(s.expiry) {
					delete(h.oauthStates, state)
				}
			}
			h.oauthStatesMu.Unlock()

			h.exchangeCodesMu.Lock()
			for code, e := range h.exchangeCodes {
				if now.After(e.expiry) {
					delete(h.exchangeCodes, code)
				}
			}
			h.exchangeCodesMu.Unlock()
		}
	}()

	return h
}

// GET /api/auth/google/login
// Optional query param `clientNonce` is echoed back in the airtype:// redirect
// so the desktop app can verify the callback came from a login flow it started
// (defense against a malicious app triggering the custom protocol with an
// attacker-controlled exchange code).
func (h *AuthHandler) GoogleLogin(c *gin.Context) {
	state := generateRandomState()
	clientNonce := c.Query("clientNonce")

	h.oauthStatesMu.Lock()
	h.oauthStates[state] = oauthState{
		expiry:      time.Now().Add(10 * time.Minute),
		clientNonce: clientNonce,
	}
	h.oauthStatesMu.Unlock()

	// We don't store or use Google's refresh token — we mint our own JWT access
	// + refresh tokens from GoogleCallback. So no need for AccessTypeOffline or
	// ApprovalForce, both of which were just forcing a re-consent screen on
	// every sign-in without any benefit.
	url := h.config.GoogleOAuth.AuthCodeURL(state)

	c.JSON(200, gin.H{
		"url": url,
	})
}

// GET /api/auth/google/callback
func (h *AuthHandler) GoogleCallback(c *gin.Context) {
	code := c.Query("code")
	state := c.Query("state")

	if code == "" {
		c.JSON(400, gin.H{"error": "No authorization code provided"})
		return
	}

	// Validate state for CSRF protection
	h.oauthStatesMu.Lock()
	s, exists := h.oauthStates[state]
	if exists {
		delete(h.oauthStates, state) // Single-use: remove immediately
	}
	h.oauthStatesMu.Unlock()

	if !exists || time.Now().After(s.expiry) {
		c.JSON(400, gin.H{"error": "Invalid or expired OAuth state"})
		return
	}

	// Exchange code for token
	token, err := h.config.GoogleOAuth.Exchange(c.Request.Context(), code)
	if err != nil {
		logger.Log.Errorw("Failed to exchange OAuth token", "error", err)
		c.JSON(500, gin.H{"error": "Failed to exchange token"})
		return
	}

	// Get user info from Google
	client := h.config.GoogleOAuth.Client(c.Request.Context(), token)
	resp, err := client.Get("https://www.googleapis.com/oauth2/v2/userinfo")
	if err != nil {
		logger.Log.Errorw("Failed to get Google user info", "error", err)
		c.JSON(500, gin.H{"error": "Failed to get user info"})
		return
	}
	defer resp.Body.Close()

	var googleUser models.GoogleUserInfo
	if err := json.NewDecoder(resp.Body).Decode(&googleUser); err != nil {
		logger.Log.Errorw("Failed to decode Google user info", "error", err)
		c.JSON(500, gin.H{"error": "Failed to decode user info"})
		return
	}

	// Find or create user in MongoDB
	user, err := h.userRepo.FindByGoogleID(c.Request.Context(), googleUser.ID)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			// User doesn't exist, create new user
			user = &models.User{
				GoogleID:  googleUser.ID,
				Email:     googleUser.Email,
				Name:      googleUser.Name,
				Picture:   googleUser.Picture,
				Plan:      "free",
				Status:    "active",
				CreatedAt: time.Now(),
				UpdatedAt: time.Now(),
				LastLogin: time.Now(),
			}

			if err := h.userRepo.Create(c.Request.Context(), user); err != nil {
				logger.Log.Errorw("Failed to create user", "error", err, "email", googleUser.Email)
				c.JSON(500, gin.H{"error": "Failed to create user"})
				return
			}
		} else {
			logger.Log.Errorw("Database error finding user", "error", err, "googleID", googleUser.ID)
			c.JSON(500, gin.H{"error": "Database error"})
			return
		}
	} else {
		// Update last login
		user.LastLogin = time.Now()
		if err := h.userRepo.Update(c.Request.Context(), user); err != nil {
			logger.Log.Errorw("Failed to update last login", "error", err, "userID", user.ID.Hex())
		}
	}

	// Generate JWT tokens
	accessToken, err := h.jwtService.GenerateAccessToken(user)
	if err != nil {
		logger.Log.Errorw("Failed to generate access token", "error", err, "userID", user.ID.Hex())
		c.JSON(500, gin.H{"error": "Failed to generate access token"})
		return
	}

	refreshToken, err := h.jwtService.GenerateRefreshToken(user.ID)
	if err != nil {
		logger.Log.Errorw("Failed to generate refresh token", "error", err, "userID", user.ID.Hex())
		c.JSON(500, gin.H{"error": "Failed to generate refresh token"})
		return
	}

	// Generate a one-time exchange code and stash the tokens. The desktop app
	// will POST this code to /api/auth/exchange to retrieve the actual tokens,
	// which keeps them out of browser history and server access logs.
	exchangeCode := generateRandomState()
	h.exchangeCodesMu.Lock()
	h.exchangeCodes[exchangeCode] = exchangeEntry{
		accessToken:  accessToken,
		refreshToken: refreshToken,
		expiry:       time.Now().Add(2 * time.Minute),
	}
	h.exchangeCodesMu.Unlock()

	redirectURL := fmt.Sprintf(
		"%s?code=%s&nonce=%s",
		h.config.DesktopCallbackURL,
		url.QueryEscape(exchangeCode),
		url.QueryEscape(s.clientNonce),
	)

	c.Redirect(http.StatusTemporaryRedirect, redirectURL)
}

// POST /api/auth/exchange
// One-time redemption of an exchange code for the access + refresh tokens.
func (h *AuthHandler) Exchange(c *gin.Context) {
	var req struct {
		Code string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request"})
		return
	}

	h.exchangeCodesMu.Lock()
	entry, exists := h.exchangeCodes[req.Code]
	if exists {
		delete(h.exchangeCodes, req.Code) // single-use
	}
	h.exchangeCodesMu.Unlock()

	if !exists || time.Now().After(entry.expiry) {
		c.JSON(400, gin.H{"error": "Invalid or expired exchange code"})
		return
	}

	c.JSON(200, gin.H{
		"accessToken":  entry.accessToken,
		"refreshToken": entry.refreshToken,
	})
}

// POST /api/auth/refresh
func (h *AuthHandler) RefreshToken(c *gin.Context) {
	var req struct {
		RefreshToken string `json:"refreshToken" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request"})
		return
	}

	// Validate refresh token
	userIDStr, err := h.jwtService.ValidateRefreshToken(req.RefreshToken)
	if err != nil {
		c.JSON(401, gin.H{"error": "Invalid refresh token"})
		return
	}

	// Get user from DB
	userID, err := primitive.ObjectIDFromHex(userIDStr)
	if err != nil {
		c.JSON(400, gin.H{"error": "Invalid user ID"})
		return
	}

	user, err := h.userRepo.FindByID(c.Request.Context(), userID)
	if err != nil {
		c.JSON(404, gin.H{"error": "User not found"})
		return
	}

	if user.Status != "" && user.Status != "active" {
		c.JSON(403, gin.H{"error": "Account is not active", "status": user.Status})
		return
	}

	// Generate new access token
	accessToken, err := h.jwtService.GenerateAccessToken(user)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to generate token"})
		return
	}

	c.JSON(200, gin.H{
		"accessToken": accessToken,
	})
}

// GET /api/auth/me (protected route)
func (h *AuthHandler) GetCurrentUser(c *gin.Context) {
	// User ID is set by auth middleware
	userID := c.GetString("userID")

	objID, err := primitive.ObjectIDFromHex(userID)
	if err != nil {
		c.JSON(400, gin.H{"error": "Invalid user ID"})
		return
	}

	user, err := h.userRepo.FindByID(c.Request.Context(), objID)
	if err != nil {
		c.JSON(404, gin.H{"error": "User not found"})
		return
	}

	c.JSON(200, gin.H{
		"user": user,
	})
}

// Helper function to generate random state
func generateRandomState() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic("crypto/rand failed: " + err.Error())
	}
	return base64.URLEncoding.EncodeToString(b)
}
