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

type TranscriptionRepository struct {
	collection *mongo.Collection
}

func NewTranscriptionRepository(db *MongoDB) *TranscriptionRepository {
	return &TranscriptionRepository{
		collection: db.Collection("transcriptions"),
	}
}

func (r *TranscriptionRepository) Create(ctx context.Context, transcription *models.Transcription) error {
	transcription.ID = primitive.NewObjectID()
	transcription.CreatedAt = time.Now()

	_, err := r.collection.InsertOne(ctx, transcription)
	return err
}

func (r *TranscriptionRepository) FindByID(ctx context.Context, id primitive.ObjectID) (*models.Transcription, error) {
	var transcription models.Transcription
	err := r.collection.FindOne(ctx, bson.M{"_id": id}).Decode(&transcription)
	if err != nil {
		return nil, err
	}
	return &transcription, nil
}

func (r *TranscriptionRepository) FindByUserID(ctx context.Context, userID primitive.ObjectID, limit int64) ([]models.Transcription, error) {
	opts := options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}).SetLimit(limit)

	cursor, err := r.collection.Find(ctx, bson.M{"userId": userID}, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var transcriptions []models.Transcription
	if err := cursor.All(ctx, &transcriptions); err != nil {
		return nil, err
	}

	return transcriptions, nil
}

func (r *TranscriptionRepository) FindByUserIDPaginated(ctx context.Context, userID primitive.ObjectID, page, limit int64) ([]models.Transcription, int64, error) {
	filter := bson.M{"userId": userID}

	// Get total count
	total, err := r.collection.CountDocuments(ctx, filter)
	if err != nil {
		return nil, 0, err
	}

	// Calculate skip
	skip := (page - 1) * limit

	opts := options.Find().
		SetSort(bson.D{{Key: "createdAt", Value: -1}}).
		SetSkip(skip).
		SetLimit(limit)

	cursor, err := r.collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, 0, err
	}
	defer cursor.Close(ctx)

	// Initialize as empty slice (not nil) so JSON returns [] not null
	transcriptions := make([]models.Transcription, 0)
	if err := cursor.All(ctx, &transcriptions); err != nil {
		return nil, 0, err
	}

	return transcriptions, total, nil
}

func (r *TranscriptionRepository) Delete(ctx context.Context, id primitive.ObjectID) error {
	_, err := r.collection.DeleteOne(ctx, bson.M{"_id": id})
	return err
}

type TranscriptionStats struct {
	TotalTranscriptions int64   `bson:"totalTranscriptions" json:"totalTranscriptions"`
	TotalWords          int64   `bson:"totalWords" json:"totalWords"`
	AvgProcessingTime   float64 `bson:"avgProcessingTime" json:"avgProcessingTime"`
}

func (r *TranscriptionRepository) GetStatsByUserID(ctx context.Context, userID primitive.ObjectID) (*TranscriptionStats, error) {
	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: bson.M{"userId": userID}}},
		{{Key: "$group", Value: bson.M{
			"_id":                 nil,
			"totalTranscriptions": bson.M{"$sum": 1},
			"totalWords":          bson.M{"$sum": "$metadata.wordCount"},
			"avgProcessingTime":   bson.M{"$avg": "$metadata.processingTime"},
		}}},
	}

	cursor, err := r.collection.Aggregate(ctx, pipeline)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var results []TranscriptionStats
	if err := cursor.All(ctx, &results); err != nil {
		return nil, err
	}

	if len(results) == 0 {
		return &TranscriptionStats{}, nil
	}

	return &results[0], nil
}
