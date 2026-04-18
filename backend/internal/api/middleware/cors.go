package middleware

import (
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"

	"airtype/pkg/logger"
)

func CORSMiddleware(allowedOrigins []string) gin.HandlerFunc {
	var validOrigins []string
	for _, origin := range allowedOrigins {
		if origin != "" {
			validOrigins = append(validOrigins, origin)
		}
	}

	config := cors.Config{
		AllowMethods:  []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:  []string{"Origin", "Content-Type", "Accept", "Authorization"},
		ExposeHeaders: []string{"Content-Length"},
	}

	if len(validOrigins) == 0 {
		// Dev-only fallback: AllowAllOrigins and AllowCredentials are mutually
		// exclusive per the CORS spec. Browser-based cookie auth will NOT work
		// in this mode; the desktop client sends Authorization headers which
		// do not require credentials mode, so it continues to work.
		logger.Log.Warn("CORS: no ALLOWED_ORIGINS configured — falling back to AllowAllOrigins without credentials. Set ALLOWED_ORIGINS in production.")
		config.AllowAllOrigins = true
		config.AllowCredentials = false
	} else {
		config.AllowOrigins = validOrigins
		config.AllowCredentials = true
	}

	return cors.New(config)
}
