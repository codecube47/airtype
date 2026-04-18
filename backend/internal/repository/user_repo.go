package repository

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"

	"airtype/internal/models"
)

type UserRepository struct {
	collection *mongo.Collection
}

func NewUserRepository(db *MongoDB) *UserRepository {
	return &UserRepository{
		collection: db.Collection("users"),
	}
}

func (r *UserRepository) Create(ctx context.Context, user *models.User) error {
	user.ID = primitive.NewObjectID()
	user.CreatedAt = time.Now()
	user.UpdatedAt = time.Now()

	_, err := r.collection.InsertOne(ctx, user)
	return err
}

func (r *UserRepository) FindByEmail(ctx context.Context, email string) (*models.User, error) {
	var user models.User
	err := r.collection.FindOne(ctx, bson.M{"email": email}).Decode(&user)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *UserRepository) FindByGoogleID(ctx context.Context, googleID string) (*models.User, error) {
	var user models.User
	err := r.collection.FindOne(ctx, bson.M{"googleId": googleID}).Decode(&user)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *UserRepository) FindByID(ctx context.Context, id primitive.ObjectID) (*models.User, error) {
	var user models.User
	err := r.collection.FindOne(ctx, bson.M{"_id": id}).Decode(&user)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *UserRepository) Update(ctx context.Context, user *models.User) error {
	user.UpdatedAt = time.Now()
	_, err := r.collection.UpdateOne(
		ctx,
		bson.M{"_id": user.ID},
		bson.M{"$set": user},
	)
	return err
}

func (r *UserRepository) Delete(ctx context.Context, id primitive.ObjectID) error {
	_, err := r.collection.DeleteOne(ctx, bson.M{"_id": id})
	return err
}

// ResetStats resets user stats to zero (for testing or plan changes)
func (r *UserRepository) ResetStats(ctx context.Context, userID primitive.ObjectID) error {
	_, err := r.collection.UpdateOne(
		ctx,
		bson.M{"_id": userID},
		bson.M{
			"$set": bson.M{
				"totalWords":          0,
				"totalTranscriptions": 0,
				"avgProcessingTime":   0,
				"updatedAt":           time.Now(),
			},
		},
	)
	return err
}

// IncrementStats atomically increments user stats when a transcription is saved.
// Uses a MongoDB aggregation pipeline update to compute the new average in a single
// atomic operation, avoiding race conditions from concurrent transcriptions.
func (r *UserRepository) IncrementStats(ctx context.Context, userID primitive.ObjectID, wordCount int, processingTime float64) error {
	// $ifNull guards new users whose stat fields haven't been written yet —
	// without it, $add/$multiply on a missing field yields null and corrupts
	// the document.
	totalWords := bson.M{"$ifNull": bson.A{"$totalWords", 0}}
	totalTx := bson.M{"$ifNull": bson.A{"$totalTranscriptions", 0}}
	avgTime := bson.M{"$ifNull": bson.A{"$avgProcessingTime", 0}}

	_, err := r.collection.UpdateOne(
		ctx,
		bson.M{"_id": userID},
		mongo.Pipeline{
			{{Key: "$set", Value: bson.M{
				"totalWords":          bson.M{"$add": bson.A{totalWords, wordCount}},
				"totalTranscriptions": bson.M{"$add": bson.A{totalTx, 1}},
				"avgProcessingTime": bson.M{
					"$divide": bson.A{
						bson.M{"$add": bson.A{
							bson.M{"$multiply": bson.A{avgTime, totalTx}},
							processingTime,
						}},
						bson.M{"$add": bson.A{totalTx, 1}},
					},
				},
				"updatedAt": time.Now(),
			}}},
		},
	)
	return err
}
