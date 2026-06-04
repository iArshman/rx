#!/usr/bin/env bash
set -e

# ─── CONFIG ────────────────────────────────────────
GITHUB_USER="iarshman"
GITHUB_REPO="rexify"
GITHUB_BRANCH="main"
REPO_URL="https://github.com/${GITHUB_USER}/${GITHUB_REPO}.git"
INSTALL_DIR="$HOME/rexify"
# ────────────────────────────────────────────────────

# Must run as root
[ "$(whoami)" != "root" ] && echo "Run as root: sudo bash install.sh" && exit 1

echo "Installing Rexify..."

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

# Create .env if not exists
if [ ! -f ".env" ]; then
    echo "Creating .env..."
    cat > .env << EOF
TAG=latest
COOLIFY_APP_ID=$(cat /proc/sys/kernel/random/uuid)
COOLIFY_SECRET_KEY=$(openssl rand -base64 32)
COOLIFY_SECRET_KEY_BETTER=$(openssl rand -base64 32)
COOLIFY_DATABASE_URL=file:../db/prod.db
COOLIFY_HOSTED_ON=docker
COOLIFY_WHITE_LABELED=false
COOLIFY_WHITE_LABELED_ICON=
COOLIFY_AUTO_UPDATE=false
EOF
fi

# Create network
docker network create --attachable coolify-infra 2>/dev/null || true

# Update docker-compose to use local image
sed -i 's|image: ghcr.io/coollabsio/coolify:${TAG:-latest}|image: coolify:latest|g' docker-compose.yaml

# Build image
echo "Building Docker image (this takes a few minutes)..."
docker build -t coolify:latest .

# Start
echo "Starting Coolify..."
docker compose up -d

echo ""
echo "✅ Coolify is running!"
echo "👉 Visit: http://$(curl -4s https://ifconfig.io 2>/dev/null || hostname -I | awk '{print $1}'):3000"
