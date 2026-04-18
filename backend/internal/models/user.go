package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type User struct {
	ID       primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	GoogleID string             `bson:"googleId" json:"googleId"`
	Email    string             `bson:"email" json:"email"`
	Name     string             `bson:"name" json:"name"`
	Picture  string             `bson:"picture" json:"picture"`
	Plan     string             `bson:"plan" json:"plan"`       // free, pro, enterprise
	Status   string             `bson:"status" json:"status"`   // active, suspended, deleted

	// Usage stats (updated incrementally)
	TotalWords          int64   `bson:"totalWords" json:"totalWords"`
	TotalTranscriptions int64   `bson:"totalTranscriptions" json:"totalTranscriptions"`
	AvgProcessingTime   float64 `bson:"avgProcessingTime" json:"avgProcessingTime"`

	CreatedAt time.Time `bson:"createdAt" json:"createdAt"`
	UpdatedAt time.Time `bson:"updatedAt" json:"updatedAt"`
	LastLogin time.Time `bson:"lastLogin" json:"lastLogin"`
}

type GoogleUserInfo struct {
	ID      string `json:"id"`
	Email   string `json:"email"`
	Name    string `json:"name"`
	Picture string `json:"picture"`
}
