# =============================================================================
# Build stage - compile Go binary with optimizations
# =============================================================================
FROM golang:1.21-alpine AS builder

WORKDIR /app

# Install build dependencies (git for private repos if needed)
RUN apk add --no-cache git ca-certificates tzdata

# Copy go mod files first (better layer caching)
COPY go.mod go.sum ./
RUN go mod download && go mod verify

# Copy source code
COPY . .

# Build optimized binary
# -ldflags: strip debug info, reduce binary size
# -trimpath: remove file system paths from binary
# -s: disable symbol table
# -w: disable DWARF generation
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-s -w -extldflags '-static'" \
    -trimpath \
    -o server \
    cmd/server/main.go

# =============================================================================
# Runtime stage - minimal production image
# =============================================================================
FROM alpine:3.19

# Install runtime dependencies
RUN apk --no-cache add ca-certificates tzdata && \
    rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

WORKDIR /app

# Copy binary from builder
COPY --from=builder /app/server .

# Set ownership
RUN chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

# Run server
CMD ["./server"]
