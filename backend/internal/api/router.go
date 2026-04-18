package api

import (
	"github.com/gin-gonic/gin"

	"airtype/internal/api/handlers"
	"airtype/internal/api/middleware"
	"airtype/internal/config"
	"airtype/internal/repository"
	"airtype/internal/services/auth"
	"airtype/internal/services/groq"
)

func SetupRouter(
	cfg *config.Config,
	db *repository.MongoDB,
	jwtService *auth.JWTService,
	whisperService *groq.WhisperService,
	llmService *groq.LLMService,
) *gin.Engine {
	// Set Gin mode
	if cfg.Environment == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	router := gin.Default()

	// CORS middleware - allow all origins for desktop app
	router.Use(middleware.CORSMiddleware(nil))

	// Initialize repositories
	userRepo := repository.NewUserRepository(db)
	transcriptionRepo := repository.NewTranscriptionRepository(db)
	settingsRepo := repository.NewSettingsRepository(db)

	// Initialize handlers
	authHandler := handlers.NewAuthHandler(userRepo, jwtService, cfg)
	transcribeHandler := handlers.NewTranscribeHandler(whisperService, llmService, transcriptionRepo, userRepo)
	configHandler := handlers.NewConfigHandler(cfg)
	settingsHandler := handlers.NewSettingsHandler(settingsRepo)

	// Health check — verifies MongoDB connectivity
	router.GET("/health", func(c *gin.Context) {
		if err := db.Ping(); err != nil {
			c.JSON(503, gin.H{
				"status":  "unhealthy",
				"service": "airtype-api",
				"error":   "database unreachable",
			})
			return
		}
		c.JSON(200, gin.H{
			"status":  "ok",
			"service": "airtype-api",
		})
	})

	// API routes
	api := router.Group("/api")
	{
		// Authentication routes (public). /exchange and /refresh are
		// per-IP rate-limited to slow brute-forcing of codes or refresh
		// tokens observed in logs/history. Login endpoints don't need it
		// (they generate new state/nonce on every call).
		authLimit := middleware.IPRateLimitMiddleware(20, 5)
		auth := api.Group("/auth")
		{
			auth.GET("/google/login", authHandler.GoogleLogin)
			auth.GET("/google/callback", authHandler.GoogleCallback)
			auth.POST("/exchange", authLimit, authHandler.Exchange)
			auth.POST("/refresh", authLimit, authHandler.RefreshToken)
		}

		// Protected routes
		protected := api.Group("")
		protected.Use(middleware.AuthMiddleware(jwtService))
		{
			// User routes
			protected.GET("/auth/me", authHandler.GetCurrentUser)

			// Config route (returns Groq API key for direct transcription)
			protected.GET("/config", configHandler.GetConfig)

			// Transcription routes — rate-limited per user to protect Groq credits
			// against abuse. 30 req/min sustained with a burst of 10.
			transcribeLimit := middleware.UserRateLimitMiddleware(30, 10)
			protected.POST("/transcribe", transcribeLimit, transcribeHandler.Transcribe)
			protected.POST("/transcriptions/save", transcribeLimit, transcribeHandler.SaveTranscription)
			protected.GET("/transcriptions", transcribeHandler.GetTranscriptions)
			protected.GET("/transcriptions/stats", transcribeHandler.GetStats)

			// Settings routes
			protected.GET("/settings", settingsHandler.GetSettings)
			protected.PUT("/settings", settingsHandler.UpdateSettings)
		}
	}

	return router
}
