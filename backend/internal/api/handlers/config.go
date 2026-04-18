package handlers

import (
	"github.com/gin-gonic/gin"

	"airtype/internal/config"
)

type ConfigHandler struct {
	config *config.Config
}

func NewConfigHandler(cfg *config.Config) *ConfigHandler {
	return &ConfigHandler{
		config: cfg,
	}
}

// GET /api/config
// Returns configuration needed by desktop app (after authentication)
func (h *ConfigHandler) GetConfig(c *gin.Context) {
	c.JSON(200, gin.H{
		"groqApiKey":       h.config.GroqAPIKey,
		"groqWhisperModel": h.config.GroqWhisperModel,
		"groqLLMModel":     h.config.GroqLLMModel,
		"cleanupPrompt":    h.config.CleanupPrompt,
	})
}
