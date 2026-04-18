package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type Transcription struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	UserID      primitive.ObjectID `bson:"userId" json:"userId"`
	RawText     string             `bson:"rawText" json:"rawText"`
	CleanedText string             `bson:"cleanedText" json:"cleanedText"`
	AudioURL    string             `bson:"audioUrl,omitempty" json:"audioUrl,omitempty"`
	Metadata    TranscriptionMeta  `bson:"metadata" json:"metadata"`
	Application string             `bson:"application,omitempty" json:"application,omitempty"`
	CreatedAt   time.Time          `bson:"createdAt" json:"createdAt"`
}

type TranscriptionMeta struct {
	Duration       float64 `bson:"duration" json:"duration"`             // seconds
	Language       string  `bson:"language" json:"language"`
	Model          string  `bson:"model" json:"model"`
	ProcessingTime float64 `bson:"processingTime" json:"processingTime"` // seconds
	WordCount      int     `bson:"wordCount" json:"wordCount"`
}
