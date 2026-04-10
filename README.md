# hermes-paperclip-adapter

**English** | [中文](./README.zh-CN.md)

Paperclip adapter plugin for connecting to a remote [Hermes Agent](https://github.com/NousResearch/hermes-agent) instance via its OpenAI-compatible API server.

---

## Overview

This adapter enables [Paperclip](https://github.com/paperclipai/paperclip) to manage Hermes Agent instances running on remote machines. Instead of spawning a local CLI process (like the built-in `hermes_local` adapter), it communicates over HTTP with Hermes's gateway API server (`/v1/chat/completions` endpoint, SSE streaming).

### How it works

```
┌─────────────────────┐         HTTP SSE          ┌───────────────────────┐
│  Paperclip Server   │ ──────────────────────────▶│  Hermes Agent         │
│                     │  POST /v1/chat/completions │                       │
│  hermes_remote      │ ◀──────────────────────────│  Gateway API Server   │
│  adapter plugin     │    streaming response      │  (default port 8642)  │
└─────────────────────┘                            └───────────────────────┘
```

1. Paperclip triggers a heartbeat or task assignment for the agent
2. The adapter builds a prompt (with Paperclip task context and JWT auth token)
3. Sends a streaming chat completion request to the remote Hermes API server
4. Streams the response back to Paperclip in real-time (visible in the UI)
5. Supports session continuity across runs via `X-Hermes-Session-Id`

## Background: OpenClaw vs Hermes

### How OpenClaw worked

Paperclip originally used [OpenClaw](https://github.com/nicepkg/openclaw) as its remote agent runtime. OpenClaw exposed a **WebSocket gateway** (default port `18789`) that Paperclip connected to via the built-in `openclaw_gateway` adapter. The protocol was proprietary — a persistent WebSocket connection with device authentication (Ed25519 key pairs), session management, and a custom RPC message format.

```
Paperclip ──WebSocket──▶ OpenClaw Gateway (:18789)
           (proprietary protocol, device auth, persistent connection)
```

### Why Hermes

[Hermes Agent](https://github.com/NousResearch/hermes-agent) is the successor to OpenClaw (with built-in `hermes claw migrate` tooling for migration). Key reasons for the switch:

- **Active development** — Hermes is actively maintained with frequent releases; OpenClaw is no longer updated
- **Richer tooling** — built-in skills system, MCP support, gateway for multiple messaging platforms (Telegram, Discord, etc.)
- **Flexible model routing** — supports multiple providers (OpenRouter, Anthropic, custom endpoints, etc.) with credential pooling and fallback chains
- **Better agent capabilities** — context compression, session persistence, checkpoint/restore, browser automation

### The adapter gap

However, Hermes does not implement OpenClaw's WebSocket gateway protocol. Paperclip's built-in `hermes_local` adapter only works by spawning a local CLI process — it cannot connect to a Hermes instance running on a different machine.

This plugin bridges that gap by connecting to Hermes's **Gateway API Server** — an OpenAI-compatible HTTP endpoint (`/v1/chat/completions`) that Hermes exposes as one of its gateway platforms. This gives us:

- **Standard protocol** — OpenAI chat completions format, SSE streaming (no proprietary protocol)
- **Simpler auth** — Bearer token instead of Ed25519 device key pairs
- **Stateless HTTP** — no persistent WebSocket connection to manage
- **Session continuity** — via `X-Hermes-Session-Id` header across runs

```
Paperclip ──HTTP SSE──▶ Hermes Gateway API Server (:8642)
           (OpenAI-compatible, Bearer auth, stateless)
```

## Prerequisites

- **Hermes Agent** (v0.8.0+) installed on the remote machine
- **Hermes Gateway** running with **API Server** platform enabled
- **Paperclip** instance with external adapter plugin support

## Setup

### 1. Enable Hermes API Server

On the remote Hermes machine, add to `~/.hermes/.env`:

```bash
API_SERVER_ENABLED=true
API_SERVER_HOST=0.0.0.0
API_SERVER_PORT=8642
API_SERVER_KEY=your-secret-key-here
```

Then restart the gateway:

```bash
hermes gateway restart
```

Verify:

```bash
curl http://<hermes-host>:8642/health
# {"status": "ok", "platform": "hermes-agent"}
```

> **Note**: Set `approvals.mode` to `auto` for unattended agent execution:
> ```bash
> hermes config set approvals.mode auto
> hermes gateway restart
> ```

### 2. Install the adapter plugin

Clone this repo to the Paperclip data directory:

```bash
# Inside the Paperclip container or data directory
mkdir -p /path/to/paperclip-data/adapter-plugins
cd /path/to/paperclip-data/adapter-plugins
git clone https://github.com/riancyman/hermes-paperclip-adapter.git hermes-remote-adapter
```

### 3. Register the plugin

Create or edit `~/.paperclip/adapter-plugins.json` (inside the Paperclip container, `~` is the data directory):

```json
[
  {
    "packageName": "hermes-remote-adapter",
    "localPath": "/path/to/paperclip-data/adapter-plugins/hermes-remote-adapter",
    "type": "hermes_remote",
    "installedAt": "2026-04-10T00:00:00.000Z"
  }
]
```

### 4. Restart Paperclip

```bash
docker restart <paperclip-container>
```

Check logs for:
```
Loaded external adapters from plugin store {"count":1,"adapters":["hermes_remote"]}
```

### 5. Configure the agent

Set the agent's `adapter_type` to `hermes_remote` and configure `adapter_config`:

```json
{
  "url": "http://<hermes-host>:8642",
  "apiKey": "your-secret-key-here",
  "model": "hermes-agent",
  "timeoutSec": 600,
  "persistSession": true,
  "paperclipApiUrl": "http://<paperclip-host>:3100"
}
```

## Configuration Reference

| Field | Type | Default | Description |
|---|---|---|---|
| `url` | string | **(required)** | Hermes API server URL |
| `apiKey` | string | `""` | API key for Bearer auth |
| `model` | string | `"hermes-agent"` | Model identifier |
| `timeoutSec` | number | `600` | Max execution time (seconds) |
| `persistSession` | boolean | `true` | Resume sessions across runs |
| `paperclipApiUrl` | string | `"http://127.0.0.1:3100"` | Paperclip API base URL |
| `systemPrompt` | string | `""` | Additional system prompt |
| `promptTemplate` | string | built-in | Custom Mustache prompt template |

## Architecture

```
hermes-remote-adapter/
├── package.json              # Package definition
├── index.js                  # Entry point, exports createServerAdapter()
└── server/
    ├── index.js              # Server entry
    ├── execute.js            # Core: build prompt → POST → stream SSE → return result
    ├── session.js            # Session codec (X-Hermes-Session-Id)
    └── test.js               # Environment test (API reachability)
```

## License

MIT
