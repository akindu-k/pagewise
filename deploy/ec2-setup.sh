#!/usr/bin/env bash
#
# One-shot setup for running md-to-pdf on a fresh Ubuntu 24.04 EC2 instance.
# Installs Node 20, the Chromium runtime libraries Puppeteer needs, Ghostscript
# (Compress PDF), clones the
# repo, installs dependencies, and registers an always-on systemd service.
#
# Usage (on the instance):
#   # public repo:
#   curl -fsSL https://raw.githubusercontent.com/akindu-k/md-to-pdf/main/deploy/ec2-setup.sh | bash
#
#   # private repo — provide a GitHub token with read access first:
#   export GITHUB_TOKEN=github_pat_xxx
#   curl -fsSL https://<token>@raw.githubusercontent.com/akindu-k/md-to-pdf/main/deploy/ec2-setup.sh | bash
#
# Re-running is safe (idempotent): it pulls latest and restarts the service.
set -euo pipefail

REPO_OWNER="akindu-k"
REPO_NAME="md-to-pdf"
APP_USER="${SUDO_USER:-ubuntu}"
APP_HOME="/home/${APP_USER}"
APP_DIR="${APP_HOME}/${REPO_NAME}"
PORT="${PORT:-3000}"

echo "==> Installing base packages, Chromium runtime libraries and Ghostscript"
sudo apt-get update -y
sudo apt-get install -y --no-install-recommends \
  ca-certificates curl git \
  ghostscript \
  fonts-liberation \
  libasound2t64 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcairo2 \
  libcups2 \
  libdbus-1-3 \
  libdrm2 \
  libexpat1 \
  libgbm1 \
  libglib2.0-0 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libpango-1.0-0 \
  libx11-6 \
  libxcb1 \
  libxcomposite1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxkbcommon0 \
  libxrandr2 \
  libxshmfence1

echo "==> Installing Node.js 20 (NodeSource)"
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -v

echo "==> Fetching source into ${APP_DIR}"
CLONE_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}.git"
if [ -n "${GITHUB_TOKEN:-}" ]; then
  CLONE_URL="https://${GITHUB_TOKEN}@github.com/${REPO_OWNER}/${REPO_NAME}.git"
fi
if [ -d "${APP_DIR}/.git" ]; then
  sudo -u "${APP_USER}" git -C "${APP_DIR}" pull --ff-only
else
  sudo -u "${APP_USER}" git clone "${CLONE_URL}" "${APP_DIR}"
fi

echo "==> Installing dependencies (downloads matching Chromium)"
sudo -u "${APP_USER}" bash -c "cd '${APP_DIR}' && npm ci --omit=dev"

echo "==> Installing systemd service"
sudo tee /etc/systemd/system/md-to-pdf.service >/dev/null <<UNIT
[Unit]
Description=md-to-pdf (Markdown to PDF converter)
After=network.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
Environment=PORT=${PORT}
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable md-to-pdf
sudo systemctl restart md-to-pdf

sleep 2
echo "==> Service status"
sudo systemctl --no-pager --lines=5 status md-to-pdf || true

PUBLIC_DNS="$(curl -fsSL http://169.254.169.254/latest/meta-data/public-hostname 2>/dev/null || echo '<your-ec2-public-dns>')"
echo ""
echo "==> Done. App is running on port ${PORT}."
echo "    Open:  http://${PUBLIC_DNS}:${PORT}"
echo "    (Make sure the security group allows inbound TCP ${PORT}.)"
