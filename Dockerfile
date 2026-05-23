# ── Stage 1: Build AIxKer agent ──────────────────────────────────────────────
# Clones AION-Agent and compiles the Rust binary.
# The eBPF library (libebpf.so) is pre-built and checked into the repo.
FROM rust:1-bookworm AS agentbuilder

RUN apt-get update && apt-get install -y --no-install-recommends \
    git clang llvm libelf-dev \
    && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 https://github.com/ali-heidari/AION-Agent.git /aion
WORKDIR /aion
RUN cargo build --release

# ── Stage 2: Build PipesHub ───────────────────────────────────────────────────
FROM node:20-bookworm-slim AS appbuilder

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src/ ./src/

# ── Final runtime image ───────────────────────────────────────────────────────
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends sudo \
    && rm -rf /var/lib/apt/lists/* \
    && echo "node ALL=(ALL) NOPASSWD: /app/aixker-agent" >> /etc/sudoers

WORKDIR /app

# PipesHub application
COPY --from=appbuilder /app ./

# AIxKer agent binary (keep these lines as required by AIxKer docs)
COPY --from=agentbuilder /aion/target/release/agent  ./aixker-agent
COPY --from=agentbuilder /aion/agent/models          ./models
COPY --from=agentbuilder /aion/agent/src/libebpf.so  ./libebpf.so

RUN chmod +x ./aixker-agent

# Required by the AIxKer eBPF loader
ENV LIBEBPF_PATH=/app/libebpf.so

# Overridable at runtime
ENV MONGO_URI=mongodb://mongo:27017/pipeshub \
    PORT=16916 \
    SOCKET_PORT=3000

# REST auth API + Socket.io hub
EXPOSE 16916 3000

# Start AIxKer agent first (needs CAP_BPF/NET_ADMIN), then PipesHub
CMD ["sh", "-c", "sudo ./aixker-agent & node src/main.js"]
