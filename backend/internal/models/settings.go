package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type UserSettings struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	UserID    primitive.ObjectID `bson:"userId" json:"userId"`
	Settings  Settings           `bson:"settings" json:"settings"`
	UpdatedAt time.Time          `bson:"updatedAt" json:"updatedAt"`
}

type Settings struct {
	Language      string `bson:"language" json:"language"`
	AutoFormat    bool   `bson:"autoFormat" json:"autoFormat"`
	RemoveFillers bool   `bson:"removeFillers" json:"removeFillers"`
	CustomPrompt  string `bson:"customPrompt" json:"customPrompt"`
}
