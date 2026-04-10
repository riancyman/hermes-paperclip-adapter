# hermes-paperclip-adapter

Paperclip adapter plugin for connecting to a remote [Hermes Agent](https://github.com/NousResearch/hermes-agent) instance via its OpenAI-compatible API server.

通过 OpenAI 兼容 API 连接远程 [Hermes Agent](https://github.com/NousResearch/hermes-agent) 的 [Paperclip](https://github.com/paperclipai/paperclip) 适配器插件。

---

## Overview / 概述

This adapter enables [Paperclip](https://github.com/paperclipai/paperclip) to manage Hermes Agent instances running on remote machines. Instead of spawning a local CLI process (like the built-in `hermes_local` adapter), it communicates over HTTP with Hermes's gateway API server (`/v1/chat/completions` endpoint, SSE streaming).

本适配器让 Paperclip 能够管理运行在远程设备上的 Hermes Agent。不同于内置的 `hermes_local`（在本地 spawn CLI 进程），它通过 HTTP 与 Hermes 的 gateway API server 通信（`/v1/chat/completions`，SSE 流式传输）。

### How it works / 工作原理

```
┌─────────────────────┐         HTTP SSE          ┌───────────────────────┐
│  Paperclip (200)    │ ──────────────────────────▶│  Hermes Agent (201)   │
│                     │  POST /v1/chat/completions │                       │
│  hermes_remote      │ ◀──────────────────────────│  Gateway API Server   │
│  adapter plugin     │    streaming response      │  (port 8642)          │
└─────────────────────┘                            └───────────────────────┘
```

1. Paperclip triggers a heartbeat or task assignment for the agent
2. The adapter builds a prompt (with Paperclip task context and JWT auth token)
3. Sends a streaming chat completion request to the remote Hermes API server
4. Streams the response back to Paperclip in real-time (visible in the UI)
5. Supports session continuity across runs via `X-Hermes-Session-Id`

---

1. Paperclip 触发心跳或分配任务给 agent
2. 适配器构建 prompt（包含 Paperclip 任务上下文和 JWT 认证 token）
3. 向远程 Hermes API server 发送流式 chat completion 请求
4. 实时将响应流回 Paperclip（在 UI 中可见）
5. 通过 `X-Hermes-Session-Id` 支持跨次运行的 session 续接

## Prerequisites / 前提条件

- **Hermes Agent** (v0.8.0+) installed on the remote machine
- **Hermes Gateway** running with **API Server** platform enabled
- **Paperclip** instance with external adapter plugin support

---

- 远程设备上安装 **Hermes Agent**（v0.8.0+）
- **Hermes Gateway** 已运行且启用了 **API Server** 平台
- **Paperclip** 实例支持外部适配器插件

## Setup / 安装

### 1. Enable Hermes API Server / 启用 Hermes API Server

On the remote Hermes machine, add to `~/.hermes/.env`:

在远程 Hermes 设备上，添加到 `~/.hermes/.env`：

```bash
API_SERVER_ENABLED=true
API_SERVER_HOST=0.0.0.0
API_SERVER_PORT=8642
API_SERVER_KEY=your-secret-key-here
```

Then restart the gateway / 然后重启 gateway：

```bash
hermes gateway restart
```

Verify / 验证：

```bash
curl http://<hermes-host>:8642/health
# {"status": "ok", "platform": "hermes-agent"}
```

> **Note / 注意**: Set `approvals.mode` to `auto` for unattended agent execution:
> 设置 `approvals.mode` 为 `auto` 以支持无人值守执行：
> ```bash
> hermes config set approvals.mode auto
> hermes gateway restart
> ```

### 2. Install the adapter plugin / 安装适配器插件

Clone this repo to the Paperclip data directory:

将此仓库克隆到 Paperclip 数据目录：

```bash
# Inside the Paperclip container or data directory
# 在 Paperclip 容器或数据目录内
mkdir -p /path/to/paperclip-data/adapter-plugins
cd /path/to/paperclip-data/adapter-plugins
git clone https://github.com/riancyman/hermes-paperclip-adapter.git hermes-remote-adapter
```

### 3. Register the plugin / 注册插件

Create or edit `~/.paperclip/adapter-plugins.json` (inside the Paperclip container, `~` is the data directory):

创建或编辑 `~/.paperclip/adapter-plugins.json`（在 Paperclip 容器内，`~` 是数据目录）：

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

### 4. Restart Paperclip / 重启 Paperclip

```bash
docker restart docker-paperclip-1
```

Check logs for / 检查日志确认：
```
Loaded external adapters from plugin store {"count":1,"adapters":["hermes_remote"]}
```

### 5. Configure the agent / 配置 Agent

Set the agent's `adapter_type` to `hermes_remote` and configure `adapter_config`:

将 agent 的 `adapter_type` 设为 `hermes_remote`，配置 `adapter_config`：

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

## Configuration Reference / 配置参考

| Field / 字段 | Type / 类型 | Default / 默认值 | Description / 说明 |
|---|---|---|---|
| `url` | string | **(required / 必填)** | Hermes API server URL / Hermes API 服务器地址 |
| `apiKey` | string | `""` | API key for Bearer auth / Bearer 认证密钥 |
| `model` | string | `"hermes-agent"` | Model identifier / 模型标识 |
| `timeoutSec` | number | `600` | Max execution time (seconds) / 最大执行时间（秒） |
| `persistSession` | boolean | `true` | Resume sessions across runs / 跨次运行续接 session |
| `paperclipApiUrl` | string | `"http://127.0.0.1:3100"` | Paperclip API base URL / Paperclip API 地址 |
| `systemPrompt` | string | `""` | Additional system prompt / 额外系统提示词 |
| `promptTemplate` | string | built-in | Custom Mustache prompt template / 自定义 Mustache 模板 |

## Architecture / 架构

```
hermes-remote-adapter/
├── package.json              # Package definition / 包定义
├── index.js                  # Entry point, exports createServerAdapter()
│                             # 入口，导出 createServerAdapter()
└── server/
    ├── index.js              # Server entry / 服务端入口
    ├── execute.js            # Core: build prompt → POST → stream SSE → return result
    │                         # 核心：构建prompt → POST请求 → 流式读取SSE → 返回结果
    ├── session.js            # Session codec (X-Hermes-Session-Id)
    │                         # Session 编解码器
    └── test.js               # Environment test (API reachability)
                              # 环境测试（API 可达性检查）
```

## License / 许可

MIT
