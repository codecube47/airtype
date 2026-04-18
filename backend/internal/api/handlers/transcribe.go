package handlers

import (
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"airtype/internal/models"
	"airtype/internal/repository"
	"airtype/internal/services/groq"
	"airtype/pkg/logger"
)

const (
	FreePlanWordLimit = 3000
	MaxUploadSize    = 25 << 20 // 25 MB
)

type TranscribeHandler struct {
	whisperService    *groq.WhisperService
	llmService        *groq.LLMService
	transcriptionRepo *repository.TranscriptionRepository
	userRepo          *repository.UserRepository
}

func NewTranscribeHandler(
	whisperService *groq.WhisperService,
	llmService *groq.LLMService,
	transcriptionRepo *repository.TranscriptionRepository,
	userRepo *repository.UserRepository,
) *TranscribeHandler {
	return &TranscribeHandler{
		whisperService:    whisperService,
		llmService:        llmService,
		transcriptionRepo: transcriptionRepo,
		userRepo:          userRepo,
	}
}

// POST /api/transcribe
func (h *TranscribeHandler) Transcribe(c *gin.Context) {
	startTime := time.Now()

	// Get user ID from context (set by auth middleware)
	userID := c.GetString("userID")
	userObjID, err := primitive.ObjectIDFromHex(userID)
	if err != nil {
		c.JSON(400, gin.H{"error": "Invalid user ID"})
		return
	}

	// Fetch user (includes stats for limit check)
	user, err := h.userRepo.FindByID(c.Request.Context(), userObjID)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to fetch user"})
		return
	}

	// Check word limit for free plan users
	if user.Plan == "" || user.Plan == "free" {
		totalWords := user.TotalWords

		// Fallback to aggregation for users without migrated stats
		if user.TotalTranscriptions == 0 {
			stats, err := h.transcriptionRepo.GetStatsByUserID(c.Request.Context(), userObjID)
			if err == nil {
				totalWords = stats.TotalWords
			}
		}

		if totalWords >= FreePlanWordLimit {
			c.JSON(403, gin.H{
				"error":      "Word limit reached",
				"message":    "You have reached the 3,000 word limit for the free plan. Please upgrade to continue transcribing.",
				"limit":      FreePlanWordLimit,
				"used":       totalWords,
				"plan":       "free",
				"upgradeUrl": "/settings?tab=billing",
			})
			return
		}
	}

	// Get audio file from form
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, MaxUploadSize)
	file, err := c.FormFile("audio")
	if err != nil {
		c.JSON(400, gin.H{"error": "No audio file provided or file exceeds 25MB limit"})
		return
	}

	if file.Size > MaxUploadSize {
		c.JSON(400, gin.H{"error": "Audio file exceeds 25MB limit"})
		return
	}

	// Get optional parameters
	language := c.DefaultPostForm("language", "en")
	cleanup := c.DefaultPostForm("cleanup", "true") == "true"

	// Read audio file
	audioFile, err := file.Open()
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to open audio file"})
		return
	}
	defer audioFile.Close()

	audioData, err := io.ReadAll(audioFile)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to read audio file"})
		return
	}

	// Transcribe with Groq Whisper
	rawText, err := h.whisperService.Transcribe(c.Request.Context(), audioData, language)
	if err != nil {
		logger.Log.Errorw("Transcription failed", "error", err, "userID", userID)
		c.JSON(500, gin.H{"error": "Transcription failed"})
		return
	}

	// Clean up text with Groq LLM (if requested)
	cleanedText := rawText
	cleaned := false
	if cleanup && len(rawText) > 0 {
		cleanedResult, cleanupErr := h.llmService.CleanupText(c.Request.Context(), rawText)
		if cleanupErr != nil {
			logger.Log.Warnw("LLM cleanup failed, falling back to raw text", "error", cleanupErr, "userID", userID)
		} else {
			cleanedText = cleanedResult
			cleaned = true
		}
	}

	processingTime := time.Since(startTime).Seconds()
	wordCount := len(strings.Fields(cleanedText))

	transcriptionID := primitive.NewObjectID()

	// Save transcription before incrementing stats so we never bill for lost records.
	transcription := &models.Transcription{
		ID:          transcriptionID,
		UserID:      userObjID,
		RawText:     rawText,
		CleanedText: cleanedText,
		Metadata: models.TranscriptionMeta{
			Duration:       0, // TODO: Extract from audio file
			Language:       language,
			Model:          "whisper-large-v3-turbo",
			ProcessingTime: processingTime,
			WordCount:      wordCount,
		},
	}
	if err := h.transcriptionRepo.Create(c.Request.Context(), transcription); err != nil {
		logger.Log.Errorw("Failed to save transcription", "transcriptionID", transcriptionID.Hex(), "error", err)
		c.JSON(500, gin.H{"error": "Failed to save transcription"})
		return
	}

	if err := h.userRepo.IncrementStats(c.Request.Context(), userObjID, wordCount, processingTime); err != nil {
		logger.Log.Errorw("Failed to update user stats", "userID", userObjID.Hex(), "error", err)
	}

	c.JSON(200, gin.H{
		"id":             transcriptionID,
		"rawText":        rawText,
		"cleanedText":    cleanedText,
		"cleaned":        cleaned,
		"processingTime": processingTime,
		"wordCount":      wordCount,
	})
}

// POST /api/transcriptions/save
// Saves transcription from direct Groq calls
// processingTime is measured on desktop (whisper + LLM cleanup time)
func (h *TranscribeHandler) SaveTranscription(c *gin.Context) {
	userID := c.GetString("userID")
	userObjID, err := primitive.ObjectIDFromHex(userID)
	if err != nil {
		c.JSON(400, gin.H{"error": "Invalid user ID"})
		return
	}

	var req struct {
		RawText        string  `json:"rawText" binding:"required"`
		CleanedText    string  `json:"cleanedText"`
		ProcessingTime float64 `json:"processingTime"`
		Language       string  `json:"language"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request body"})
		return
	}

	if req.Language == "" {
		req.Language = "en"
	}

	// Check user plan and word limit
	user, err := h.userRepo.FindByID(c.Request.Context(), userObjID)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to fetch user"})
		return
	}

	if user.Plan == "" || user.Plan == "free" {
		totalWords := user.TotalWords

		// Fallback to aggregation for users without migrated stats
		if user.TotalTranscriptions == 0 {
			stats, err := h.transcriptionRepo.GetStatsByUserID(c.Request.Context(), userObjID)
			if err == nil {
				totalWords = stats.TotalWords
			}
		}

		if totalWords >= FreePlanWordLimit {
			c.JSON(403, gin.H{
				"error":   "Word limit reached",
				"message": "You have reached the 3,000 word limit for the free plan.",
				"limit":   FreePlanWordLimit,
				"used":    totalWords,
				"plan":    "free",
			})
			return
		}
	}

	// Use pre-cleaned text if provided, otherwise use raw text
	cleanedText := req.CleanedText
	if cleanedText == "" {
		cleanedText = req.RawText
	}

	// Use processing time from desktop (where actual processing happened)
	processingTime := req.ProcessingTime
	wordCount := len(strings.Fields(cleanedText))

	transcriptionID := primitive.NewObjectID()

	transcription := &models.Transcription{
		ID:          transcriptionID,
		UserID:      userObjID,
		RawText:     req.RawText,
		CleanedText: cleanedText,
		Metadata: models.TranscriptionMeta{
			Duration:       0,
			Language:       req.Language,
			Model:          "whisper-large-v3-turbo",
			ProcessingTime: processingTime,
			WordCount:      wordCount,
		},
	}
	if err := h.transcriptionRepo.Create(c.Request.Context(), transcription); err != nil {
		logger.Log.Errorw("Failed to save transcription", "transcriptionID", transcriptionID.Hex(), "error", err)
		c.JSON(500, gin.H{"error": "Failed to save transcription"})
		return
	}

	if err := h.userRepo.IncrementStats(c.Request.Context(), userObjID, wordCount, processingTime); err != nil {
		logger.Log.Errorw("Failed to update user stats", "userID", userObjID.Hex(), "error", err)
	}

	c.JSON(200, gin.H{
		"id":             transcriptionID,
		"rawText":        req.RawText,
		"cleanedText":    cleanedText,
		"processingTime": processingTime,
		"wordCount":      wordCount,
	})
}

// GET /api/transcriptions
func (h *TranscribeHandler) GetTranscriptions(c *gin.Context) {
	userID := c.GetString("userID")
	userObjID, err := primitive.ObjectIDFromHex(userID)
	if err != nil {
		c.JSON(400, gin.H{"error": "Invalid user ID"})
		return
	}

	// Get pagination params from query
	page := int64(1)
	limit := int64(5)

	if pageStr := c.Query("page"); pageStr != "" {
		if p, err := strconv.ParseInt(pageStr, 10, 64); err == nil && p > 0 {
			page = p
		}
	}

	if limitStr := c.Query("limit"); limitStr != "" {
		if l, err := strconv.ParseInt(limitStr, 10, 64); err == nil && l > 0 && l <= 1000 {
			limit = l
		}
	}

	transcriptions, total, err := h.transcriptionRepo.FindByUserIDPaginated(c.Request.Context(), userObjID, page, limit)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to fetch transcriptions"})
		return
	}

	totalPages := (total + limit - 1) / limit

	c.JSON(200, gin.H{
		"transcriptions": transcriptions,
		"total":          total,
		"page":           page,
		"limit":          limit,
		"totalPages":     totalPages,
	})
}

// GET /api/transcriptions/stats
func (h *TranscribeHandler) GetStats(c *gin.Context) {
	userID := c.GetString("userID")
	userObjID, err := primitive.ObjectIDFromHex(userID)
	if err != nil {
		c.JSON(400, gin.H{"error": "Invalid user ID"})
		return
	}

	// Get user (includes stats)
	user, err := h.userRepo.FindByID(c.Request.Context(), userObjID)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to fetch user"})
		return
	}

	// Use stats from user document (fast lookup)
	totalWords := user.TotalWords
	totalTranscriptions := user.TotalTranscriptions
	avgProcessingTime := user.AvgProcessingTime

	// Fallback to aggregation for existing users without migrated stats
	if totalTranscriptions == 0 {
		stats, err := h.transcriptionRepo.GetStatsByUserID(c.Request.Context(), userObjID)
		if err == nil && stats.TotalTranscriptions > 0 {
			totalWords = stats.TotalWords
			totalTranscriptions = stats.TotalTranscriptions
			avgProcessingTime = stats.AvgProcessingTime
		}
	}

	plan := user.Plan
	if plan == "" {
		plan = "free"
	}

	// Calculate word limit based on plan
	var wordLimit int64 = -1 // -1 means unlimited
	if plan == "free" {
		wordLimit = FreePlanWordLimit
	}

	wordsRemaining := wordLimit - totalWords
	if wordLimit == -1 {
		wordsRemaining = -1 // unlimited
	} else if wordsRemaining < 0 {
		wordsRemaining = 0
	}

	c.JSON(200, gin.H{
		"totalTranscriptions": totalTranscriptions,
		"totalWords":          totalWords,
		"avgProcessingTime":   avgProcessingTime,
		"plan":                plan,
		"wordLimit":           wordLimit,
		"wordsRemaining":      wordsRemaining,
	})
}
