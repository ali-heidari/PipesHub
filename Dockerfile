# ── Stage 1: Build PipesHub ───────────────────────────────────────────────────
FROM node:20-bookworm-slim AS appbuilder

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src/ ./src/

# ── Final: AIxKer image with PipesHub embedded ────────────────────────────────
FROM ghcr.io/ali-heidari/aixker-agent:latest

# Install Node.js 20
RUN apt-get update && apt-get install -y --no-install-recommends curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    rm -rf /var/lib/apt/lists/*

# Copy PipesHub into the existing /app alongside AIxKer files
COPY --from=appbuilder /app/node_modules ./node_modules
COPY --from=appbuilder /app/src          ./src
COPY --from=appbuilder /app/package.json ./package.json

# Obtain a Let's Encrypt certificate and embed it in the image.
# Requirements at build time:
#   - port 80 must be free on the host
#   - DNS for DOMAIN must resolve to this host
#   - build with: docker build --network=host .
ARG DOMAIN=aixker.com
ARG CERTBOT_EMAIL=ali-heidari@outlook.com

RUN apt-get update && apt-get install -y --no-install-recommends certbot && \
    certbot certonly --standalone --non-interactive --agree-tos --no-eff-email \
      --email "${CERTBOT_EMAIL}" -d "${DOMAIN}" && \
    mkdir -p /app/certs && \
    cp /etc/letsencrypt/live/${DOMAIN}/fullchain.pem /app/certs/fullchain.pem && \
    cp /etc/letsencrypt/live/${DOMAIN}/privkey.pem   /app/certs/privkey.pem  && \
    chmod 644 /app/certs/privkey.pem && \
    apt-get purge -y certbot && apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/* /etc/letsencrypt

ENV MONGO_URI=mongodb://mongo:27017/pipeshub \
    PORT=16916 \
    HTTPS_PORT=16917 \
    SOCKET_PORT=3000 \
    SSL_CERT=/app/certs/fullchain.pem \
    SSL_KEY=/app/certs/privkey.pem

EXPOSE 16916 16917 3000

CMD ["sh", "-c", "sudo ./aixker-agent & node src/main.js"]
