package middleware

import (
	"strings"

	"github.com/gin-gonic/gin"

	"airtype/internal/services/auth"
)

func AuthMiddleware(jwtService *auth.JWTService) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")

		if authHeader == "" {
			c.JSON(401, gin.H{"error": "No authorization header provided"})
			c.Abort()
			return
		}

		// Extract token from "Bearer <token>"
		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			c.JSON(401, gin.H{"error": "Invalid authorization header format"})
			c.Abort()
			return
		}

		token := parts[1]

		// Validate token
		claims, err := jwtService.ValidateToken(token)
		if err != nil {
			c.JSON(401, gin.H{"error": "Invalid or expired token"})
			c.Abort()
			return
		}

		// Set user info in context
		c.Set("userID", claims.UserID.Hex())
		c.Set("userEmail", claims.Email)
		c.Set("userPlan", claims.Plan)

		c.Next()
	}
}
