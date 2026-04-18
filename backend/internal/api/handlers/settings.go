package handlers

import (
	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"

	"airtype/internal/models"
	"airtype/internal/repository"
)

// supportedLanguages is the set of ISO-639-1 codes officially validated on
// Llama 4 Scout — mirrors desktop/src/lib/languages.ts. Keep in sync.
var supportedLanguages = map[string]struct{}{
	"en": {}, "ar": {}, "fr": {}, "de": {}, "hi": {}, "id": {},
	"it": {}, "pt": {}, "es": {}, "tl": {}, "th": {}, "vi": {},
}

// Cap custom prompts to limit prompt-token cost and prevent users
// from pasting arbitrarily large blobs into the system message.
const maxCustomPromptLen = 500

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

	if settings.Language == "" {
		settings.Language = "en"
	}
	if _, ok := supportedLanguages[settings.Language]; !ok {
		c.JSON(400, gin.H{"error": "Unsupported language code"})
		return
	}
	if len(settings.CustomPrompt) > maxCustomPromptLen {
		c.JSON(400, gin.H{"error": "customPrompt exceeds 500 character limit"})
		return
	}

	result, err := h.settingsRepo.Upsert(c.Request.Context(), userObjID, settings)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to save settings"})
		return
	}

	c.JSON(200, result.Settings)
}
