#!/bin/bash
# CodeReserve API - Deployment Setup Script
# Run this on your home server

set -e

echo "=========================================="
echo "  CodeReserve API - Setup Script"
echo "=========================================="

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root for nginx setup
check_sudo() {
    if [ "$EUID" -ne 0 ]; then
        echo -e "${YELLOW}Note: Run with sudo for nginx/certbot setup${NC}"
    fi
}

# Step 1: Check prerequisites
echo ""
echo -e "${GREEN}Step 1: Checking prerequisites...${NC}"

command -v docker >/dev/null 2>&1 || { echo -e "${RED}Docker not found. Install it first.${NC}"; exit 1; }
command -v docker-compose >/dev/null 2>&1 || command -v "docker compose" >/dev/null 2>&1 || { echo -e "${RED}Docker Compose not found.${NC}"; exit 1; }

echo "  ✓ Docker installed"
echo "  ✓ Docker Compose installed"

# Step 2: Check for .env.production
echo ""
echo -e "${GREEN}Step 2: Checking environment file...${NC}"

if [ ! -f ".env.production" ]; then
    echo -e "${YELLOW}  ! .env.production not found${NC}"
    echo "    Creating from template..."
    cp .env.production.example .env.production
    echo ""
    echo -e "${RED}  ⚠ IMPORTANT: Edit .env.production with your values before continuing!${NC}"
    echo ""
    echo "    Required values:"
    echo "    - JWT_SECRET (generate with: openssl rand -base64 48)"
    echo "    - ENCRYPTION_KEY (generate with: openssl rand -base64 48)"
    echo "    - GitHub App credentials"
    echo "    - Blockchain signer key"
    echo ""
    echo "    Run this script again after editing .env.production"
    exit 1
else
    echo "  ✓ .env.production found"
fi

# Step 3: Create data directory
echo ""
echo -e "${GREEN}Step 3: Creating data directory...${NC}"
mkdir -p data
echo "  ✓ data/ directory ready"

# Step 4: Build and start
echo ""
echo -e "${GREEN}Step 4: Building and starting API...${NC}"
docker compose build
docker compose up -d

echo ""
echo -e "${GREEN}Step 5: Checking health...${NC}"
sleep 5

if curl -s http://localhost:3001/health | grep -q "ok"; then
    echo "  ✓ API is running and healthy"
else
    echo -e "${RED}  ✗ API health check failed${NC}"
    echo "    Check logs with: docker compose logs"
    exit 1
fi

echo ""
echo "=========================================="
echo -e "${GREEN}  Setup Complete!${NC}"
echo "=========================================="
echo ""
echo "Next steps:"
echo ""
echo "1. Set up Cloudflare (see DEPLOYMENT.md)"
echo ""
echo "2. Configure nginx:"
echo "   sudo cp deploy/nginx-api.conf /etc/nginx/sites-available/api.codereserve.org"
echo "   sudo ln -s /etc/nginx/sites-available/api.codereserve.org /etc/nginx/sites-enabled/"
echo "   sudo nginx -t && sudo systemctl reload nginx"
echo ""
echo "3. Get SSL certificate:"
echo "   sudo certbot --nginx -d api.codereserve.org"
echo ""
echo "4. Update Vercel environment:"
echo "   NEXT_PUBLIC_API_URL=https://api.codereserve.org"
echo ""
echo "Useful commands:"
echo "  docker compose logs -f     # View logs"
echo "  docker compose restart     # Restart API"
echo "  docker compose down        # Stop API"
echo "  docker compose up -d       # Start API"
echo ""
