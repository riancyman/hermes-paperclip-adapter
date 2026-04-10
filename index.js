/**
 * Hermes Remote Adapter — main entry point.
 *
 * Exports createServerAdapter() for Paperclip's plugin loader.
 */
import { execute } from "./server/execute.js";
import { testEnvironment } from "./server/test.js";
import { sessionCodec } from "./server/session.js";

export const ADAPTER_TYPE = "hermes_remote";

export const models = [
  { id: "hermes-agent", label: "Hermes Agent" },
];

export const agentConfigurationDoc = `# Hermes Remote Agent Configuration

Adapter: hermes_remote

Connects to a remote Hermes Agent instance via its OpenAI-compatible API server.

## Required fields
- **url** (string): Base URL of the Hermes API server (e.g. \`http://192.168.10.201:8642\`)

## Optional fields
- **apiKey** (string): API key for authentication (sent as Bearer token)
- **timeoutSec** (number, default 600): Maximum execution time in seconds
- **model** (string, default "hermes-agent"): Model identifier
- **persistSession** (boolean, default true): Resume sessions across runs via X-Hermes-Session-Id
- **systemPrompt** (string): Additional system prompt to prepend
- **paperclipApiUrl** (string): Paperclip API base URL for the agent prompt template
- **promptTemplate** (string): Custom prompt template (Mustache-style, same as hermes_local)
`;

/**
 * Factory function required by Paperclip's plugin loader.
 */
export function createServerAdapter() {
  return {
    type: ADAPTER_TYPE,
    execute,
    testEnvironment,
    sessionCodec,
    models,
    supportsLocalAgentJwt: true,
    agentConfigurationDoc,
  };
}
