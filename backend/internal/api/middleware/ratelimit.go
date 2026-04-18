package middleware

import (
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// Token bucket per key. Simple, in-memory. Adequate for a single-instance
// backend; swap for Redis if we scale horizontally.
type bucket struct {
	tokens   float64
	lastSeen time.Time
}

type rateLimiter struct {
	mu         sync.Mutex
	buckets    map[string]*bucket
	ratePerSec float64
	burst      float64
}

func newRateLimiter(ratePerSec, burst float64) *rateLimiter {
	rl := &rateLimiter{
		buckets:    make(map[string]*bucket),
		ratePerSec: ratePerSec,
		burst:      burst,
	}
	// Periodic cleanup of stale buckets so an attacker can't drive memory growth
	// by rotating through fake keys. Any bucket untouched for 10 minutes is dropped.
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			cutoff := time.Now().Add(-10 * time.Minute)
			rl.mu.Lock()
			for k, b := range rl.buckets {
				if b.lastSeen.Before(cutoff) {
					delete(rl.buckets, k)
				}
			}
			rl.mu.Unlock()
		}
	}()
	return rl
}

func (rl *rateLimiter) allow(key string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	b, ok := rl.buckets[key]
	if !ok {
		rl.buckets[key] = &bucket{tokens: rl.burst - 1, lastSeen: now}
		return true
	}

	elapsed := now.Sub(b.lastSeen).Seconds()
	b.tokens = min(rl.burst, b.tokens+elapsed*rl.ratePerSec)
	b.lastSeen = now

	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

func min(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}

// UserRateLimitMiddleware limits requests per authenticated user. Must run
// AFTER AuthMiddleware so userID is populated on the context.
// ratePerMinute is the sustained rate; burst is how many requests can arrive
// in a short spike before throttling kicks in.
func UserRateLimitMiddleware(ratePerMinute, burst float64) gin.HandlerFunc {
	rl := newRateLimiter(ratePerMinute/60.0, burst)
	return func(c *gin.Context) {
		key := c.GetString("userID")
		if key == "" {
			// Unauthenticated requests shouldn't reach here, but be defensive.
			key = c.ClientIP()
		}
		if !rl.allow(key) {
			c.Header("Retry-After", "60")
			c.AbortWithStatusJSON(429, gin.H{"error": "Rate limit exceeded. Try again in a moment."})
			return
		}
		c.Next()
	}
}
