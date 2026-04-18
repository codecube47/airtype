package handlers

import (
	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"

	"airtype/internal/models"
	"airtype/internal/repository"
)

type SettingsHandler struct {
	settingsRepo *repository.SettingsRepository
}

func NewSettingsHandler(settingsRepo *repository.SettingsRepository) *SettingsHandler {
	return &SettingsHandler{settingsRepo: settingsRepo}
}

// GET /api/settings
func (h *SettingsHandler) GetSettings(c *gin.Context) {
	userID := c.GetString("userID")
	userObjID, err := primitive.ObjectIDFromHex(userID)
	if err != nil {
		c.JSON(400, gin.H{"error": "Invalid user ID"})
		return
	}

	userSettings, err := h.settingsRepo.GetByUserID(c.Request.Context(), userObjID)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			// Return defaults if no settings saved yet
			c.JSON(200, models.Settings{
				Language:      "en",
				AutoFormat:    true,
				RemoveFillers: true,
				CustomPrompt:  "",
			})
			return
		}
		c.JSON(500, gin.H{"error": "Failed to fetch settings"})
		return
	}

	c.JSON(200, userSettings.Settings)
}

// PUT /api/settings
func (h *SettingsHandler) UpdateSettings(c *gin.Context) {
	userID := c.GetString("userID")
	userObjID, err := primitive.ObjectIDFromHex(userID)
	if err != nil {
		c.JSON(400, gin.H{"error": "Invalid user ID"})
		return
	}

	var settings models.Settings
	if err := c.ShouldBindJSON(&settings); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request body"})
		return
	}

	// Validate language (basic check)
	if settings.Language == "" {
		settings.Language = "en"
	}

	result, err := h.settingsRepo.Upsert(c.Request.Context(), userObjID, settings)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to save settings"})
		return
	}

	c.JSON(200, result.Settings)
}
