package repository

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"airtype/internal/models"
)

type SettingsRepository struct {
	collection *mongo.Collection
}

func NewSettingsRepository(db *MongoDB) *SettingsRepository {
	return &SettingsRepository{
		collection: db.Collection("settings"),
	}
}

func (r *SettingsRepository) GetByUserID(ctx context.Context, userID primitive.ObjectID) (*models.UserSettings, error) {
	var settings models.UserSettings
	err := r.collection.FindOne(ctx, bson.M{"userId": userID}).Decode(&settings)
	if err != nil {
		return nil, err
	}
	return &settings, nil
}

func (r *SettingsRepository) Upsert(ctx context.Context, userID primitive.ObjectID, settings models.Settings) (*models.UserSettings, error) {
	filter := bson.M{"userId": userID}
	update := bson.M{
		"$set": bson.M{
			"settings":  settings,
			"updatedAt": time.Now(),
		},
		"$setOnInsert": bson.M{
			"userId": userID,
		},
	}

	opts := options.FindOneAndUpdate().
		SetUpsert(true).
		SetReturnDocument(options.After)

	var result models.UserSettings
	err := r.collection.FindOneAndUpdate(ctx, filter, update, opts).Decode(&result)
	if err != nil {
		return nil, err
	}
	return &result, nil
}
