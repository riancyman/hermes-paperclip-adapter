# hermes-paperclip-adapter

[English](./README.md) | **中文**

通过 OpenAI 兼容 API 连接远程 [Hermes Agent](https://github.com/NousResearch/hermes-agent) 的 [Paperclip](https://github.com/paperclipai/paperclip) 适配器插件。

---

## 概述

本适配器让 Paperclip 能够管理运行在远程设备上的 Hermes Agent 实例。不同于内置的 `hermes_local` 适配器（在本地 spawn CLI 进程），它通过 HTTP 与 Hermes 的 Gateway API Server 通信（`/v1/chat/completions` 端点，SSE 流式传输）。

### 工作原理

```
┌─────────────────────┐         HTTP SSE          ┌───────────────────────┐
│  Paperclip Server   │ ──────────────────────────▶│  Hermes Agent         │
│                     │  POST /v1/chat/completions │                       │
│  hermes_remote      │ ◀──────────────────────────│  Gateway API Server   │
│  adapter plugin     │    streaming response      │  (默认端口 8642)       │
└─────────────────────┘                            └───────────────────────┘
```

1. Paperclip 触发心跳或分配任务给 agent
2. 适配器构建 prompt（包含 Paperclip 任务上下文和 JWT 认证 token）
3. 向远程 Hermes API Server 发送流式 chat completion 请求
4. 实时将响应流回 Paperclip（在 UI 中可见）
5. 通过 `X-Hermes-Session-Id` 支持跨次运行的 session 续接

## 背景：OpenClaw 与 Hermes

### OpenClaw 的工作方式

Paperclip 最初使用 [OpenClaw](https://github.com/nicepkg/openclaw) 作为远程 agent 运行时。OpenClaw 暴露一个 **WebSocket 网关**（默认端口 `18789`），Paperclip 通过内置的 `openclaw_gateway` 适配器连接。协议是私有的 —— 持久 WebSocket 连接，配合设备认证（Ed25519 密钥对）、会话管理和自定义 RPC 消息格式。

```
Paperclip ──WebSocket──▶ OpenClaw Gateway (:18789)
           (私有协议, 设备认证, 持久连接)
```

### 为什么迁移到 Hermes

[Hermes Agent](https://github.com/NousResearch/hermes-agent) 是 OpenClaw 的继任者（内置 `hermes claw migrate` 迁移工具）。迁移的主要原因：

- **活跃开发** — Hermes 持续维护，频繁发布新版本；OpenClaw 已停止更新
- **更丰富的工具** — 内置 skills 系统、MCP 支持、多平台消息网关（Telegram、Discord 等）
- **灵活的模型路由** — 支持多个推理提供商（OpenRouter、Anthropic、自定义端点等），具备凭证池和降级链
- **更强的 agent 能力** — 上下文压缩、会话持久化、检查点/恢复、浏览器自动化

### 适配器的空白

但 Hermes 并未实现 OpenClaw 的 WebSocket 网关协议。Paperclip 内置的 `hermes_local` 适配器只能通过 spawn 本地 CLI 进程来工作 —— 无法连接到运行在其他设备上的 Hermes 实例。

本插件填补了这一空白，它连接到 Hermes 的 **Gateway API Server** —— 一个 OpenAI 兼容的 HTTP 端点（`/v1/chat/completions`），由 Hermes 作为网关平台之一暴露。这带来了：

- **标准协议** — OpenAI chat completions 格式，SSE 流式传输（无私有协议）
- **更简单的认证** — Bearer token 替代 Ed25519 设备密钥对
- **无状态 HTTP** — 无需管理持久 WebSocket 连接
- **会话续接** — 通过 `X-Hermes-Session-Id` 头实现跨次运行的会话延续

```
Paperclip ──HTTP SSE──▶ Hermes Gateway API Server (:8642)
           (OpenAI 兼容, Bearer 认证, 无状态)
```

## 前提条件

- 远程设备上安装 **Hermes Agent**（v0.8.0+）
- **Hermes Gateway** 已运行且启用了 **API Server** 平台
- **Paperclip** 实例支持外部适配器插件

## 安装步骤

### 1. 启用 Hermes API Server

在远程 Hermes 设备上，添加到 `~/.hermes/.env`：

```bash
API_SERVER_ENABLED=true
API_SERVER_HOST=0.0.0.0
API_SERVER_PORT=8642
API_SERVER_KEY=你的密钥
```

重启 Gateway：

```bash
hermes gateway restart
```

验证：

```bash
curl http://<hermes主机>:8642/health
# {"status": "ok", "platform": "hermes-agent"}
```

> **注意**：需要将 `approvals.mode` 设为 `auto` 以支持无人值守执行：
> ```bash
> hermes config set approvals.mode auto
> hermes gateway restart
> ```

### 2. 安装适配器插件

将此仓库克隆到 Paperclip 数据目录：

```bash
# 在 Paperclip 容器或数据目录内
mkdir -p /path/to/paperclip-data/adapter-plugins
cd /path/to/paperclip-data/adapter-plugins
git clone https://github.com/riancyman/hermes-paperclip-adapter.git hermes-remote-adapter
```

### 3. 注册插件

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

### 4. 重启 Paperclip

```bash
docker restart <paperclip容器名>
```

检查日志确认加载成功：
```
Loaded external adapters from plugin store {"count":1,"adapters":["hermes_remote"]}
```

### 5. 配置 Agent

将 agent 的 `adapter_type` 设为 `hermes_remote`，配置 `adapter_config`：

```json
{
  "url": "http://<hermes主机>:8642",
  "apiKey": "你的密钥",
  "model": "hermes-agent",
  "timeoutSec": 600,
  "persistSession": true,
  "paperclipApiUrl": "http://<paperclip主机>:3100"
}
```

## 配置参考

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `url` | string | **必填** | Hermes API 服务器地址 |
| `apiKey` | string | `""` | Bearer 认证密钥 |
| `model` | string | `"hermes-agent"` | 模型标识 |
| `timeoutSec` | number | `600` | 最大执行时间（秒） |
| `persistSession` | boolean | `true` | 跨次运行续接 session |
| `paperclipApiUrl` | string | `"http://127.0.0.1:3100"` | Paperclip API 地址 |
| `systemPrompt` | string | `""` | 额外系统提示词 |
| `promptTemplate` | string | 内置模板 | 自定义 Mustache 提示词模板 |

## 架构

```
hermes-remote-adapter/
├── package.json              # 包定义
├── index.js                  # 入口，导出 createServerAdapter()
└── server/
    ├── index.js              # 服务端入口
    ├── execute.js            # 核心：构建prompt → POST请求 → 流式读取SSE → 返回结果
    ├── session.js            # Session 编解码器（X-Hermes-Session-Id）
    └── test.js               # 环境测试（API 可达性检查）
```

## 许可证

MIT
