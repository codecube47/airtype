.PHONY: help install \
	docker-up docker-down \
	dev dev-backend dev-desktop \
	build-backend build-desktop \
	package-desktop package-mac package-mac-x64 package-win \
	native native-x64 \
	test-backend test-desktop \
	clean

help:
	@echo "AirType — make targets"
	@echo ""
	@echo "Setup"
	@echo "  make install         Install backend (go mod) and desktop (npm) dependencies"
	@echo "  make docker-up       Start MongoDB (waits until it accepts connections)"
	@echo "  make docker-down     Stop docker-compose services"
	@echo ""
	@echo "Development"
	@echo "  make dev-backend     Run Go backend in dev mode (port 3001)"
	@echo "  make dev-desktop     Run Electron desktop app via Vite"
	@echo "  make dev             Run both in a split tmux session (requires tmux)"
	@echo ""
	@echo "Build (compile only, no packaging)"
	@echo "  make build-backend   Compile Go binary to backend/bin/server"
	@echo "  make build-desktop   Vite production build of the renderer"
	@echo ""
	@echo "Native fn-key module"
	@echo "  make native          Rebuild fn_key.node for the host arch"
	@echo "  make native-x64      Rebuild fn_key.node for Intel x64"
	@echo ""
	@echo "Package (distributable installers)"
	@echo "  make package-mac     DMG + zip for Apple Silicon"
	@echo "  make package-mac-x64 DMG for Intel macOS"
	@echo "  make package-win     NSIS installer (requires Windows or Wine)"
	@echo "  make package-desktop electron-builder default (multi-platform)"
	@echo ""
	@echo "Test"
	@echo "  make test-backend    go test ./..."
	@echo "  make test-desktop    npm test"
	@echo ""
	@echo "Cleanup"
	@echo "  make clean           Remove all build artifacts"
	@echo ""

install:
	@echo "Installing backend dependencies..."
	cd backend && go mod tidy
	@echo "Installing desktop dependencies..."
	cd desktop && npm install
	@echo "Done!"

docker-up:
	@echo "Starting MongoDB..."
	docker-compose up -d mongodb
	@echo "Waiting for MongoDB to accept connections..."
	@for i in $$(seq 1 30); do \
		if docker-compose exec -T mongodb mongosh --quiet --eval 'db.adminCommand({ping:1}).ok' > /dev/null 2>&1; then \
			echo "MongoDB ready on :27017 (took $$i s)"; exit 0; \
		fi; \
		sleep 1; \
	done; \
	echo "MongoDB did not become ready within 30s — check 'docker-compose logs mongodb'"; exit 1

docker-down:
	@echo "Stopping Docker services..."
	docker-compose down

dev-backend:
	@echo "Starting backend server..."
	cd backend && go run cmd/server/main.go

dev-desktop:
	@echo "Starting desktop app..."
	cd desktop && npm run dev

dev:
	@command -v tmux > /dev/null 2>&1 || { \
		echo "Error: 'make dev' requires tmux. Install with 'brew install tmux', or run backend + desktop in separate terminals:"; \
		echo "  Terminal 1:  make dev-backend"; \
		echo "  Terminal 2:  make dev-desktop"; \
		exit 1; \
	}
	@echo "Starting backend and desktop in tmux session 'airtype'..."
	tmux new-session -d -s airtype \; \
		send-keys 'cd backend && go run cmd/server/main.go' C-m \; \
		split-window -h \; \
		send-keys 'cd desktop && npm run dev' C-m \; \
		attach
	@echo "Use Ctrl+B then D to detach from tmux session"

clean:
	@echo "Cleaning build artifacts..."
	rm -rf backend/bin backend/tmp
	rm -rf desktop/dist desktop/dist-electron desktop/build desktop/release desktop/out
	rm -f desktop/*.tsbuildinfo
	@echo "Done!"

build-backend:
	@echo "Building backend..."
	cd backend && go build -o bin/server cmd/server/main.go
	@echo "Binary: backend/bin/server"

build-desktop:
	@echo "Building desktop app..."
	cd desktop && npm run build
	@echo "Done!"

package-desktop:
	@echo "Packaging desktop app..."
	cd desktop && npm run package
	@echo "Packages in desktop/dist/"

package-mac: native
	@echo "Building and packaging desktop app for macOS..."
	@echo "Step 1: Cleaning old builds..."
	rm -rf desktop/dist desktop/dist-electron
	@echo "Step 2: Building React app with Vite (production mode)..."
	cd desktop && npm run package:mac
	@echo ""
	@echo "Build complete!"
	@echo "App location: desktop/dist/"
	@echo ""
	@echo "To run: open desktop/dist/mac-arm64/AirType.app"

package-mac-x64: native-x64
	@echo "Building and packaging desktop app for macOS (Intel)..."
	rm -rf desktop/dist desktop/dist-electron
	cd desktop && npm run package:mac -- --x64
	@echo ""
	@echo "Build complete! (Intel x64)"
	@echo "App location: desktop/dist/"

native:
	@echo "Building native fn-key module..."
	cd desktop/native/fn-key && npm run build

native-x64:
	@echo "Building native fn-key module (x64)..."
	cd desktop/native/fn-key && npm run build -- --arch=x64

package-win:
	@echo "Building and packaging desktop app for Windows..."
	@echo "Step 1: Cleaning old builds..."
	rm -rf desktop/dist desktop/dist-electron
	@echo "Step 2: Building React app with Vite (production mode)..."
	cd desktop && npm run package:win
	@echo ""
	@echo "Build complete!"
	@echo "Installer location: desktop/dist/"
	@echo ""
	@echo "Note: Windows build requires Windows or Wine on macOS/Linux"

test-backend:
	@echo "Running backend tests..."
	cd backend && go test ./...

test-desktop:
	@echo "Running desktop tests..."
	cd desktop && npm test
