# ── Stage 1: Build PipesHub ───────────────────────────────────────────────────
FROM node:20-bookworm-slim AS appbuilder

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src/ ./src/

# ── Final: AIxKer image with PipesHub embedded ────────────────────────────────
FROM ghcr.io/ali-heidari/aixker-agent:latest

# Copy Node.js 20 runtime from the builder stage (avoids apt/nodesource on AIxKer base)
COPY --from=appbuilder /usr/local/bin/node          /usr/local/bin/node
COPY --from=appbuilder /usr/local/lib/node_modules  /usr/local/lib/node_modules
COPY --from=appbuilder /usr/local/bin/npm           /usr/local/bin/npm

# Copy PipesHub into the existing /app alongside AIxKer files
COPY --from=appbuilder /app/node_modules ./node_modules
COPY --from=appbuilder /app/src          ./src
COPY --from=appbuilder /app/package.json ./package.json

# Create empty log file so logger.js doesn't crash on first read
RUN touch /app/system.log

# TLS certificate — run get-cert.sh before building to populate ./certs/
COPY certs/fullchain.pem /app/certs/fullchain.pem
COPY certs/privkey.pem   /app/certs/privkey.pem

ENV MONGO_URI=mongodb://pipeshub:pjfFy9uMqKyJYB@ac-aushobo-shard-00-00.0p3foic.mongodb.net:27017,ac-aushobo-shard-00-01.0p3foic.mongodb.net:27017,ac-aushobo-shard-00-02.0p3foic.mongodb.net:27017/?ssl=true&replicaSet=atlas-300gj9-shard-0&authSource=admin&appName=Cluster0 \
    PORT=16916 \
    HTTPS_PORT=16917 \
    SOCKET_PORT=3000 \
    SSL_KEY=/app/certs/privkey.pem \
    SSL_CERT=/app/certs/fullchain.pem

EXPOSE 16916 16917 3000

CMD ["sh", "-c", "./aixker-agent & node src/main.js"]