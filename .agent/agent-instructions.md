# AI Agent Instructions — PipesHub

## Base standard

This file extends the canonical base instructions at
[`ai-agent-standards/instructions.md`](https://github.com/ali-heidari/ai-agent-standards/blob/master/instructions.md).
Read that file first. Everything there applies here; the sections below are
PipesHub-specific additions and overrides.

## Project purpose

PipesHub is a Node.js message-broker hub that lets microservices (called **units**)
communicate through a central relay without knowing each other's locations.
It exposes two transports:

| Transport | Port | Purpose |
|---|---|---|
| Express REST | `16916` (config-driven) | JWT authentication (`POST /auth`) |
| Socket.io | `3000` (default) | Real-time message routing between units |

Units connect, register by name, then exchange messages via three modes:
`request` (fire-and-forget), `ask` (request/response), `persist` (streaming).

## Key files

| File | Role |
|---|---|
| `src/main.js` | Entry point — wires Express, Socket.io hub, and auth |
| `src/modules/connection_manager.js` | Core router — maps unit names → socket IDs, forwards messages |
| `src/services/authenticator.js` | RSA-2048 JWT sign/verify (jose); middleware for Express and Socket.io |
| `src/modules/data.js` | MongoDB access via Mongoose — unit and user CRUD |
| `src/modules/route.js` | Express middleware stack and route registration |
| `src/modules/logger.js` | Hash-chained tamper-evident logger; optional cluster mode |
| `src/clients/client.js` | Reference JS client (`Unit` class) — used by test harness |
| `src/configs/config.yaml` | Runtime config (REST port; overridable via `PORT` env var) |
| `Dockerfile` | Multi-stage build: AIxKer agent + PipesHub node image |
| `docker-compose.yml` | 3-node AIxKer load-balanced cluster + MongoDB |
| `models/protocol.js` | Protocol model stub (not yet implemented) |

## Build and run

Only steps backed by files in this repo:

```bash
# Install dependencies
npm install               # package.json present

# Start server (requires MongoDB at MONGO_URI or localhost:27017)
node src/main.js

# Docker cluster (3 nodes + MongoDB)
docker compose up -d --build
```

Environment variables respected at runtime:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `16916` | REST API listen port |
| `SOCKET_PORT` | `3000` | Socket.io listen port |
| `MONGO_URI` | `mongodb://localhost/test` | MongoDB connection string |

## Core rule — do not invent build or CI steps

Do not suggest, generate, or run build commands, CI workflows, test scripts,
or lint steps unless an explicit file exists in this repo that defines them
(e.g. `package.json` scripts, a `Makefile`, `.github/workflows/`).
No CI is currently configured; do not create workflow files unless asked.

## How to use these standards

**Option A — copy:** Copy `instructions.md` and the convention markdown files
from [`ai-agent-standards`](https://github.com/ali-heidari/ai-agent-standards)
into the project root. Update this file to reference them locally.

**Option B — submodule/template:** Add `ai-agent-standards` as a git submodule
and point agents to `ai-agent-standards/instructions.md` for the base rules.

## Conventions in force

- **Commits:** `type(scope): short summary` — types: `feat fix chore docs ci style refactor test`
- **Docs:** Update `README.md` when code or behaviour changes
- **Dependencies:** All runtime deps in `package.json`; no undeclared globals
- **Security:** Validate type at all HTTP/socket entry points; never pass raw user input to Mongoose queries
