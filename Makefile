SHELL := /usr/bin/env bash

ROOT := $(shell pwd)
BIN  := $(ROOT)/bin
VERSION ?= 0.1.0-dev
LDFLAGS := -s -w -X main.version=$(VERSION)

.PHONY: all build web-build server-build embed-prepare clean dev fmt vet tidy

all: build

# Full release build: web -> embed -> single Go binary with frontend baked in.
build: embed-prepare server-build

web-build:
	cd web && npm install --no-audit --no-fund --silent && npm run build

embed-prepare: web-build
	rm -rf server/internal/static/dist
	cp -r web/dist server/internal/static/dist

server-build:
	mkdir -p $(BIN)
	cd server && go build -trimpath -ldflags '$(LDFLAGS)' -o $(BIN)/mochan ./cmd/mochan
	@echo "built $(BIN)/mochan"

# Cross-compile for the typical VPS target (linux/amd64). Override with GOOS/GOARCH.
GOOS ?= linux
GOARCH ?= amd64
.PHONY: release
release: embed-prepare
	mkdir -p $(BIN)
	cd server && GOOS=$(GOOS) GOARCH=$(GOARCH) CGO_ENABLED=0 \
		go build -trimpath -ldflags '$(LDFLAGS)' \
		-o $(BIN)/mochan-$(GOOS)-$(GOARCH) ./cmd/mochan
	@echo "built $(BIN)/mochan-$(GOOS)-$(GOARCH)"

dev:
	@echo "Run two terminals:"
	@echo "  1) cd web && npm run dev    # Vite on http://localhost:5173"
	@echo "  2) cd server && go run ./cmd/mochan run"
	@echo "Set MOCHAN_PASSWORD_HASH and MOCHAN_JWT_SECRET in your shell first."

fmt:
	cd server && go fmt ./...

vet:
	cd server && go vet ./...

tidy:
	cd server && go mod tidy

clean:
	rm -rf bin web/dist server/internal/static/dist
	# keep the embed placeholder so go build still works
	mkdir -p server/internal/static/dist
	@echo "cleaned"
