#!/usr/bin/env bash
set -e

# ─── CONFIG ────────────────────────────────────────
GITHUB_USER="iarshman"
GITHUB_REPO="rx"
GITHUB_BRANCH="main"
REPO_URL="https://github.com/${GITHUB_USER}/${GITHUB_REPO}.git"
INSTALL_DIR="$HOME/rexify"
# ────────────────────────────────────────────────────

# Must run as root
[ "$(whoami)" != "root" ] && echo "Run as root: sudo bash install.sh" && exit 1

echo "Installing Coolify..."

# Install Docker if missing
if ! command -v docker &>/dev/null; then
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
fi

# Install git if missing
if ! command -v git &>/dev/null; then
    apt-get install -y git
fi

# Clone or update repo
if [ -d "$INSTALL_DIR" ]; then
    echo "Updating existing repo..."
    cd "$INSTALL_DIR" && git pull origin "$GITHUB_BRANCH"
else
    echo "Cloning repo..."
    git clone -b "$GITHUB_BRANCH" "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# Generate env values
APP_ID=$(cat /proc/sys/kernel/random/uuid)
SECRET_KEY=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 32)
SECRET_KEY_BETTER=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 32)

# Create .env only if it doesn't exist
if [ ! -f ".env" ]; then
    echo "Creating .env..."
    cat > .env << EOF
TAG=latest
COOLIFY_APP_ID=${APP_ID}
COOLIFY_SECRET_KEY=${SECRET_KEY}
COOLIFY_SECRET_KEY_BETTER=${SECRET_KEY_BETTER}
COOLIFY_DATABASE_URL=file:../db/prod.db
COOLIFY_HOSTED_ON=docker
COOLIFY_WHITE_LABELED=false
COOLIFY_WHITE_LABELED_ICON=
COOLIFY_AUTO_UPDATE=false
COOLIFY_REPO_DIR=${INSTALL_DIR}
EOF
    echo ".env created."
else
    echo ".env already exists — skipping."
fi

# Patch docker-compose only if it still has the original image
if grep -q "ghcr.io/coollabsio/coolify" docker-compose.yaml 2>/dev/null; then
    sed -i 's|image: ghcr.io/coollabsio/coolify:${TAG:-latest}|image: coolify:latest|g' docker-compose.yaml
fi

# Create network
docker network create --attachable coolify-infra 2>/dev/null || true

# Build image
echo "Building Docker image (this takes a few minutes)..."
docker build -t coolify:latest .

# Start
echo "Starting rexify..."
docker compose up -d

echo ""
echo "✅ rexify is running!"
echo "👉 Visit: http://$(curl -4s https://ifconfig.io 2>/dev/null || hostname -I | awk '{print $1}'):3000"
