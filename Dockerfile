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

ENV MONGO_URI=mongodb://mongo:27017/pipeshub \
    PORT=16916 \
    SOCKET_PORT=3000

EXPOSE 16916 3000

CMD ["sh", "-c", "sudo ./aixker-agent & node src/main.js"]
