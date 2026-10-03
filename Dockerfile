FROM node:20-bookworm-slim

# Chromium runtime libraries required by Puppeteer's bundled browser, plus
# Ghostscript for Compress PDF and Python for PDF to Word.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    ghostscript \
    python3 \
    python3-venv \
    fonts-liberation \
    libasound2 \
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
    libxshmfence1 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# PDF to Word runs pdf2docx in its own virtualenv.
COPY requirements.txt ./
RUN python3 -m venv /opt/pdf2docx \
  && /opt/pdf2docx/bin/pip install --no-cache-dir -r requirements.txt
ENV PDF2DOCX_PYTHON=/opt/pdf2docx/bin/python

# Install dependencies first for better layer caching. The puppeteer install
# script downloads the matching Chromium build into the image at this step.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
# Render (and most PaaS) inject their own PORT; server.js honours it.
EXPOSE 3000

CMD ["node", "server.js"]
