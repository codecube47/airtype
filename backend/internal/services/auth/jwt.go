package auth

import (
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"airtype/internal/models"
)

// MinJWTSecretLength is the minimum byte length for HS256 JWT signing secrets
// (256 bits, per RFC 7518 §3.2).
const MinJWTSecretLength = 32

type JWTService struct {
	secretKey []byte
}

type Claims struct {
	UserID  primitive.ObjectID `json:"sub"`
	Email   string             `json:"email"`
	Name    string             `json:"name"`
	Plan    string             `json:"plan"`
	Picture string             `json:"picture"`
	jwt.RegisteredClaims
}

func NewJWTService(secretKey string) (*JWTService, error) {
	if len(secretKey) < MinJWTSecretLength {
		return nil, fmt.Errorf("JWT secret must be at least %d bytes (got %d) — HS256 requires 256-bit minimum", MinJWTSecretLength, len(secretKey))
	}
	return &JWTService{
		secretKey: []byte(secretKey),
	}, nil
}

func (s *JWTService) GenerateAccessToken(user *models.User) (string, error) {
	claims := Claims{
		UserID:  user.ID,
		Email:   user.Email,
		Name:    user.Name,
		Plan:    user.Plan,
		Picture: user.Picture,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(15 * time.Minute)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Subject:   user.ID.Hex(),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(s.secretKey)
}

func (s *JWTService) GenerateRefreshToken(userID primitive.ObjectID) (string, error) {
	claims := jwt.RegisteredClaims{
		Subject:   userID.Hex(),
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(30 * 24 * time.Hour)),
		IssuedAt:  jwt.NewNumericDate(time.Now()),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(s.secretKey)
}

func (s *JWTService) ValidateToken(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(
		tokenString,
		&Claims{},
		func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, errors.New("invalid signing method")
			}
			return s.secretKey, nil
		},
	)

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(*Claims); ok && token.Valid {
		return claims, nil
	}

	return nil, errors.New("invalid token")
}

func (s *JWTService) ValidateRefreshToken(tokenString string) (string, error) {
	token, err := jwt.ParseWithClaims(
		tokenString,
		&jwt.RegisteredClaims{},
		func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, errors.New("invalid signing method")
			}
			return s.secretKey, nil
		},
	)

	if err != nil {
		return "", err
	}

	if claims, ok := token.Claims.(*jwt.RegisteredClaims); ok && token.Valid {
		return claims.Subject, nil
	}

	return "", errors.New("invalid refresh token")
}
