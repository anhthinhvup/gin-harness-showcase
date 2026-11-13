/**
 * @pc-agent/protocol — Multi-Provider LLM Adapter & Remote Agent Bridge Contracts
 */

import type { CacheControl, UnifiedMessage, UnifiedStreamEvent } from './messages.js';
import type { UnifiedToolSchema } from './tools.js';

export type CanonicalProviderKind =
  | 'ginmsg'
  | 'openai-compatible'
  | 'gemini'
  | 'ollama'
  | 'custom-agent-bridge';

export type ProviderKind =
  | CanonicalProviderKind
  | 'openai-compat'
  | 'remote-agent'
  | 'custom-agent';

export const SUPPORTED_PROVIDER_KINDS: readonly CanonicalProviderKind[] = [
  'ginmsg',
  'openai-compatible',
  'gemini',
  'ollama',
  'custom-agent-bridge',
] as const;

export interface SystemPromptBlock {
  text: string;
  cacheControl?: CacheControl | boolean;
}

export interface WorkspaceContextSnapshot {
  workspaceDir?: string;
  gitBranch?: string;
  gitStatus?: string;
  openFiles?: string[];
  activeFiles?: string[];
  activeFile?: string;
  osPlatform?: string;
  shellType?: string;
  projectMemory?: string;
  metadata?: Record<string, unknown>;
}

export interface StreamTurnParams {
  systemPrompt: string | SystemPromptBlock[];
  messages: UnifiedMessage[];
  tools: UnifiedToolSchema[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  thinkingBudgetTokens?: number;
  thinking?: {
    enabled: boolean;
    budgetTokens?: number;
  };
  enablePromptCaching?: boolean;
  workspaceContext?: WorkspaceContextSnapshot;
  abortSignal?: AbortSignal;
}

export interface ProviderConnectionStatus {
  ok: boolean;
  latencyMs?: number;
  error?: string;
  models?: string[];
}

/**
 * Mode 1 Adapter Contract: Local Agent Loop powered by any pluggable LLM API
 * (GinMsg, OpenAI-Compatible, Google Gemini, Ollama/Local LLM).
 */
export interface IAgentModelProvider {
  readonly providerId: string;
  readonly modelId?: string;
  readonly providerKind?: ProviderKind;
  streamTurn(params: StreamTurnParams): AsyncGenerator<UnifiedStreamEvent, void, unknown>;
  countTokens?(params: {
    systemPrompt?: string;
    messages: UnifiedMessage[];
    tools?: UnifiedToolSchema[];
  }): Promise<number>;
  validateConnection?(): Promise<ProviderConnectionStatus>;
}

export type IAgentProvider = IAgentModelProvider;

export type RemoteAgentTransport =
  | 'sse'
  | 'websocket'
  | 'acp-jsonrpc'
  | 'jsonrpc'
  | 'http-stream'
  | 'rest';

export interface RemoteToolRequestEvent {
  type: 'remote_tool_request';
  requestId: string;
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
  requiresConsent?: boolean;
}

export interface RemoteStatusEvent {
  type: 'remote_status';
  status: string;
  detail?: string;
}

export type RemoteAgentEvent =
  | UnifiedStreamEvent
  | RemoteToolRequestEvent
  | RemoteStatusEvent;

export interface RemoteToolResultPayload {
  sessionId: string;
  requestId?: string;
  toolCallId: string;
  toolName: string;
  output: string;
  isError?: boolean;
  permissionDenied?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Mode 2 Adapter Contract: External / Custom Agent Backend Bridge
 * (LangGraph, CrewAI, AutoGen, Dify, or Custom Enterprise Agent over SSE/WS/ACP)
 * where the PC App acts as UI + Local Sandboxed Tool Executor.
 */
export interface IRemoteAgentBridge {
  readonly bridgeId: string;
  readonly transport: RemoteAgentTransport;
  connect?(abortSignal?: AbortSignal): Promise<void>;
  disconnect?(): Promise<void>;
  sendTurn(params: {
    sessionId: string;
    prompt: string;
    messages?: UnifiedMessage[];
    workspaceContext: WorkspaceContextSnapshot;
    availableTools?: UnifiedToolSchema[];
    abortSignal?: AbortSignal;
  }): AsyncGenerator<RemoteAgentEvent, void, unknown>;
  submitToolResult(result: RemoteToolResultPayload): Promise<void>;
}

export interface McpServerConfig {
  id: string;
  name: string;
  transport: 'stdio' | 'sse' | 'streamable-http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  enabled: boolean;
}

export interface SubagentProfileConfig {
  id: string;
  name: string;
  description: string;
  systemPromptTemplate?: string;
  providerProfileId?: string;
  allowedTools?: string[];
  maxTurns?: number;
}

/**
 * Configuration profile for hot-swapping between API providers in Desktop & CLI.
 * Supports: `ginmsg`, `openai-compatible`, `gemini`, `ollama`, `custom-agent-bridge`.
 */
export interface ProviderProfileConfig {
  id: string;
  name: string;
  kind: ProviderKind;
  provider?: ProviderKind;
  type?: ProviderKind;
  baseUrl?: string;
  apiKey?: string;
  apiKeyEnvVar?: string;
  modelId: string;
  model?: string;
  maxOutputTokens?: number;
  maxTokens?: number;
  contextWindowTokens?: number;
  temperature?: number;
  thinkingEnabled?: boolean;
  thinkingBudgetTokens?: number;
  enablePromptCaching?: boolean;
  customHeaders?: Record<string, string>;
  headers?: Record<string, string>;
  organizationId?: string;
  apiVersion?: string;
  remoteTransport?: RemoteAgentTransport;
  agentProtocol?: RemoteAgentTransport;
  timeoutMs?: number;
  isDefault?: boolean;
  metadata?: Record<string, unknown>;
}

export const DEFAULT_PROVIDER_PROFILES: readonly ProviderProfileConfig[] = [
  {
    id: 'ginmsg-gin-sonnet',
    name: 'GinMsg Gin Sonnet 4',
    kind: 'ginmsg',
    baseUrl: 'https://api.ginmsg.com',
    apiKeyEnvVar: 'GINMSG_API_KEY',
    modelId: 'gin-sonnet-4-20250514',
    maxOutputTokens: 8192,
    contextWindowTokens: 200000,
    enablePromptCaching: true,
    isDefault: true,
  },
  {
    id: 'openai-compatible-default',
    name: 'OpenAI / OpenRouter / DeepSeek (OpenAI-Compatible)',
    kind: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    apiKeyEnvVar: 'OPENAI_API_KEY',
    modelId: 'gpt-4.1',
    maxOutputTokens: 8192,
    contextWindowTokens: 128000,
  },
  {
    id: 'google-gemini-pro',
    name: 'Google Gemini 2.5 Pro',
    kind: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiKeyEnvVar: 'GEMINI_API_KEY',
    modelId: 'gemini-2.5-pro',
    maxOutputTokens: 8192,
    contextWindowTokens: 1000000,
  },
  {
    id: 'ollama-local-qwen',
    name: 'Ollama Local (Qwen 2.5 Coder)',
    kind: 'ollama',
    baseUrl: 'http://127.0.0.1:11434',
    modelId: 'qwen2.5-coder:32b',
    maxOutputTokens: 4096,
    contextWindowTokens: 32768,
  },
  {
    id: 'custom-agent-bridge-sse',
    name: 'Custom Remote Agent Bridge (SSE / WebSocket)',
    kind: 'custom-agent-bridge',
    baseUrl: 'http://127.0.0.1:8080/agent',
    apiKeyEnvVar: 'CUSTOM_AGENT_API_KEY',
    modelId: 'remote-agent-v1',
    remoteTransport: 'sse',
    timeoutMs: 120000,
  },
] as const;

/**
 * Normalizes provider kind aliases (e.g. 'openai-compat' -> 'openai-compatible',
 * 'remote-agent' / 'custom-agent' -> 'custom-agent-bridge').
 */
export function normalizeProviderKind(kind: string): CanonicalProviderKind | null {
  if (kind === 'openai-compat') {
    return 'openai-compatible';
  }
  if (kind === 'remote-agent' || kind === 'custom-agent') {
    return 'custom-agent-bridge';
  }
  if ((SUPPORTED_PROVIDER_KINDS as readonly string[]).includes(kind)) {
    return kind as CanonicalProviderKind;
  }
  return null;
}

/**
 * Validates a ProviderProfileConfig object and returns normalized errors if invalid.
 */
export function validateProviderProfile(
  profile: Partial<ProviderProfileConfig> | null | undefined,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!profile || typeof profile !== 'object') {
    return { valid: false, errors: ['Provider profile must be an object'] };
  }

  if (!profile.id || typeof profile.id !== 'string' || !profile.id.trim()) {
    errors.push('Provider profile "id" is required');
  }
  if (!profile.name || typeof profile.name !== 'string' || !profile.name.trim()) {
    errors.push('Provider profile "name" is required');
  }

  const rawKind = profile.kind ?? profile.provider ?? profile.type;
  const normalizedKind = typeof rawKind === 'string' ? normalizeProviderKind(rawKind) : null;
  if (!normalizedKind) {
    errors.push(
      `Invalid provider kind "${String(rawKind)}". Supported: ${SUPPORTED_PROVIDER_KINDS.join(', ')}`,
    );
  }

  const modelId = profile.modelId ?? profile.model;
  if (!modelId || typeof modelId !== 'string' || !modelId.trim()) {
    errors.push('Provider profile "modelId" is required');
  }

  if (
    normalizedKind === 'custom-agent-bridge' &&
    (!profile.baseUrl || typeof profile.baseUrl !== 'string' || !profile.baseUrl.trim())
  ) {
    errors.push('Provider profile "baseUrl" is required for custom-agent-bridge');
  }

  const maxTokens = profile.maxOutputTokens ?? profile.maxTokens;
  if (maxTokens !== undefined && (typeof maxTokens !== 'number' || !Number.isFinite(maxTokens) || maxTokens <= 0)) {
    errors.push('Provider profile "maxOutputTokens" must be a positive number');
  }

  if (
    profile.temperature !== undefined &&
    (typeof profile.temperature !== 'number' || !Number.isFinite(profile.temperature) || profile.temperature < 0)
  ) {
    errors.push('Provider profile "temperature" must be a non-negative number');
  }

  return { valid: errors.length === 0, errors };
}
