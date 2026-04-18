package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"airtype/internal/api"
	"airtype/internal/config"
	"airtype/internal/repository"
	"airtype/internal/services/auth"
	"airtype/internal/services/groq"
	"airtype/pkg/logger"
)

func main() {
	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// Initialize logger
	if err := logger.Init(cfg.Environment); err != nil {
		log.Fatalf("Failed to initialize logger: %v", err)
	}
	defer logger.Sync()

	logger.Log.Infow("Starting Airtype API server",
		"port", cfg.Port,
		"environment", cfg.Environment,
	)

	// Connect to MongoDB
	db, err := repository.NewMongoDB(cfg.MongoDBURI, cfg.MongoDBDB)
	if err != nil {
		logger.Log.Fatalw("Failed to connect to MongoDB", "error", err)
	}
	defer db.Close()
	logger.Log.Info("Connected to MongoDB")

	if err := db.EnsureIndexes(); err != nil {
		logger.Log.Fatalw("Failed to create MongoDB indexes", "error", err)
	}
	logger.Log.Info("MongoDB indexes ensured")

	// Initialize services
	jwtService, err := auth.NewJWTService(cfg.JWTSecret)
	if err != nil {
		logger.Log.Fatalw("Failed to initialize JWT service", "error", err)
	}
	whisperService := groq.NewWhisperService(cfg.GroqAPIKey, cfg.GroqWhisperModel)
	llmService := groq.NewLLMService(cfg.GroqAPIKey, cfg.GroqLLMModel, cfg.CleanupPrompt)

	// Setup router
	router := api.SetupRouter(cfg, db, jwtService, whisperService, llmService)

	// Start server
	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: router,
	}

	// Graceful shutdown
	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Log.Fatalw("Server failed to start", "error", err)
		}
	}()

	logger.Log.Info(fmt.Sprintf("Server started on port %s", cfg.Port))
	logger.Log.Info(fmt.Sprintf("Health check: http://localhost:%s/health", cfg.Port))
	logger.Log.Info(fmt.Sprintf("API docs: http://localhost:%s/api", cfg.Port))

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Log.Info("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		logger.Log.Fatalw("Server forced to shutdown", "error", err)
	}

	logger.Log.Info("Server exited")
}
