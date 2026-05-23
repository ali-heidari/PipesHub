# PipesHub

NodeJS service to make other services communicate through it.

Run the server and derive class from client. **Clients available in JavaScript, Java and Python**

JavaScript: [PipesClientJS](https://github.com/ali-heidari/PipesClientJS)

Python: [PipesClientPython](https://github.com/ali-heidari/PipesClientPython)

Java: [PipesClientJava](https://github.com/ali-heidari/PipesClientJava)

## Usage client

1. request
    - Invoke an operation on the end-side without expecting a return.
2. ask
    - Invoke an operation on the end-side with expecting a return.
3. persist
    - Invoke an operation on end-side no immediate return but receives for incoming messages at any time.

## Process

1. The client connects to REST API of server and gets a JWT with a valid secret key
2. The Client handshakes with socket part of the server with JWT as an authorization header
3. The client use one of 3 types of communication. Described in the Usage Client section

## Run with Docker Compose

The included `docker-compose.yml` runs a **3-node PipesHub cluster** where each node has an embedded [AIxKer](https://github.com/ali-heidari/AION-Agent) agent. AIxKer is an AI-driven L4 load balancer — it monitors local CPU/memory load and, when a node is busy, redirects incoming TCP connections to a free peer at the kernel level using eBPF/XDP. No proxy, no extra hop.

### Requirements

- Linux kernel ≥ 5.4
- Docker with `--privileged` support (needed for eBPF/BPF syscall)

### Start the cluster

```bash
docker compose up -d --build
```

This starts:

| Service | REST (auth) | Socket.io hub | Role |
| --- | --- | --- | --- |
| `pipeshub-1` | `localhost:16916` | `localhost:3000` | Node 1 + AIxKer agent |
| `pipeshub-2` | `localhost:16917` | `localhost:3001` | Node 2 + AIxKer agent |
| `pipeshub-3` | `localhost:16918` | `localhost:3002` | Node 3 + AIxKer agent |
| `mongo` | — | — | Shared unit/user registry |

AIxKer agents discover each other automatically via UDP multicast gossip — no configuration needed. Connect your clients to any node; the cluster self-balances.

### Connect a client

Point your client at any node. Example using the REST auth endpoint on node 1:

```bash
# Get a JWT
curl -X POST http://localhost:16916/auth \
     -d "name=myservice"

# Then connect your Socket.io client to ws://localhost:3000
# with the returned token in the Authorization header
```

### Stop the cluster

```bash
docker compose down
```

> **Production:** For full XDP NIC-bypass performance, deploy one container per physical host using `network_mode: host`. All nodes on the same machine share one NIC, which limits XDP redirect to virtual interfaces only.

## Standards

This project follows [`ai-agent-standards`](https://github.com/ali-heidari/ai-agent-standards). See [`.agent/agent-instructions.md`](.agent/agent-instructions.md) for project-specific AI agent guidance.
