/**
 * @pc-agent/protocol — Unified Tool Schema, Tool Execution, Permissions & Hooks Contracts
 */

import type { CacheControl } from './messages.js';

export interface JsonSchemaProperty {
  type?: string | string[];
  description?: string;
  enum?: Array<string | number | boolean>;
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  additionalProperties?: boolean | JsonSchemaProperty;
  [key: string]: unknown;
}

export interface ToolInputSchema {
  type: 'object';
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
  [key: string]: unknown;
}

export type ToolCategory =
  | 'filesystem'
  | 'shell'
  | 'search'
  | 'agent'
  | 'mcp'
  | 'network'
  | 'custom';

/**
 * Provider-agnostic tool definition schema convertible to GinMsg `input_schema`,
 * OpenAI `function.parameters`, Gemini `FunctionDeclaration`, or Ollama `tools`.
 */
export interface UnifiedToolSchema {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  input_schema?: ToolInputSchema;
  parameters?: ToolInputSchema;
  category?: ToolCategory;
  readOnly?: boolean;
  requiresConfirmation?: boolean;
  dangerous?: boolean;
  cacheControl?: CacheControl;
}

export interface DiffLine {
  type: 'context' | 'add' | 'delete' | 'del' | 'header';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  header: string;
  lines: DiffLine[];
}

export interface FileDiffMetadata {
  filePath: string;
  oldContent?: string;
  newContent?: string;
  unifiedDiff?: string;
  linesAdded?: number;
  linesRemoved?: number;
  hunks?: DiffHunk[];
}

export type FileDiffPreview = FileDiffMetadata;

export type PermissionBehavior = 'allow' | 'deny' | 'ask';
export type PermissionScope = 'once' | 'session' | 'workspace' | 'always';
export type PermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'bypassPermissions'
  | 'plan'
  | 'ask-writes'
  | 'ask-all'
  | 'autonomous';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type ToolSafetyClass = 'read' | 'write' | 'edit' | 'bash' | 'network' | 'mcp' | 'custom';

/**
 * Decision returned by the Permission Gate or `local_exec_consent` UI modal.
 */
export interface PermissionDecision {
  allowed: boolean;
  behavior?: PermissionBehavior;
  scope?: PermissionScope;
  reason?: string;
  updatedInput?: Record<string, unknown>;
  ruleId?: string;
  timestamp?: number;
}

export interface PermissionRequest {
  requestId: string;
  sessionId: string;
  toolCallId: string;
  toolName: string;
  safetyClass?: ToolSafetyClass;
  input: Record<string, unknown>;
  riskLevel: RiskLevel;
  reason: string;
  commandPreview?: string;
  targetPath?: string;
  diffPreview?: FileDiffMetadata;
  createdAt: number;
}

export interface PermissionRule {
  id: string;
  toolName: string | '*';
  behavior: PermissionBehavior;
  scope: PermissionScope;
  safetyClass?: ToolSafetyClass;
  pathPrefix?: string;
  commandPrefix?: string;
  description?: string;
  createdAt?: number;
}

export interface ToolProgressUpdate {
  toolCallId?: string;
  toolName?: string;
  outputChunk?: string;
  stream?: 'stdout' | 'stderr' | 'status';
  statusMessage?: string;
  percent?: number;
}

/**
 * Execution context passed to every local or MCP tool invocation.
 */
export interface ToolExecutionContext {
  workspaceDir: string;
  cwd?: string;
  sessionId?: string;
  toolCallId?: string;
  abortSignal?: AbortSignal;
  env?: Record<string, string | undefined>;
  allowedPaths?: string[];
  permissionMode?: PermissionMode;
  sandboxed?: boolean;
  allowOutsideWorkspace?: boolean;
  onProgress?: (update: string | ToolProgressUpdate) => void;
  requestPermission?: (request: PermissionRequest) => Promise<PermissionDecision>;
  metadata?: Record<string, unknown>;
}

/**
 * Standardized outcome of executing a tool locally or via MCP.
 */
export interface ToolExecutionResult {
  toolCallId?: string;
  toolName?: string;
  output: string;
  content?: string;
  isError?: boolean;
  error?: string;
  exitCode?: number | null;
  durationMs?: number;
  diff?: FileDiffMetadata;
  artifacts?: Array<{
    type: string;
    path?: string;
    title?: string;
    content?: string;
  }>;
  metadata?: Record<string, unknown>;
}

export interface IToolExecutor<TInput = Record<string, unknown>> {
  readonly schema: UnifiedToolSchema;
  execute(input: TInput, context: ToolExecutionContext): Promise<ToolExecutionResult>;
}

export type HookEventName =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'UserPromptSubmit'
  | 'PreCompact'
  | 'SessionStart'
  | 'SessionEnd'
  | 'Stop'
  | 'SubagentStop'
  | 'Notification';

/**
 * Payload dispatched through the Hook System at key lifecycle points in the Agent Loop.
 */
export interface HookEventPayload {
  event: HookEventName;
  sessionId: string;
  timestamp: number;
  workspaceDir?: string;
  toolCallId?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: ToolExecutionResult;
  userPrompt?: string;
  messageCount?: number;
  tokenCount?: number;
  notification?: {
    level: 'info' | 'warning' | 'error';
    title?: string;
    message: string;
  };
  metadata?: Record<string, unknown>;
}

export interface HookExecutionResult {
  proceed: boolean;
  modifiedInput?: Record<string, unknown>;
  modifiedOutput?: string;
  systemMessageInjection?: string;
  reason?: string;
}

export interface IHookHandler {
  readonly id: string;
  readonly events: HookEventName[];
  handle(payload: HookEventPayload): Promise<HookExecutionResult> | HookExecutionResult;
}

/**
 * Helper to construct a normalized PermissionDecision.
 */
export function createPermissionDecision(
  allowed: boolean,
  options: Omit<Partial<PermissionDecision>, 'allowed'> = {},
): PermissionDecision {
  return {
    allowed,
    behavior: options.behavior ?? (allowed ? 'allow' : 'deny'),
    scope: options.scope ?? 'once',
    ...(options.reason !== undefined ? { reason: options.reason } : {}),
    ...(options.updatedInput !== undefined ? { updatedInput: options.updatedInput } : {}),
    ...(options.ruleId !== undefined ? { ruleId: options.ruleId } : {}),
    timestamp: options.timestamp ?? Date.now(),
  };
}

function matchesJsonType(val: unknown, expectedType: string): boolean {
  switch (expectedType) {
    case 'string':
      return typeof val === 'string';
    case 'number':
      return typeof val === 'number' && !Number.isNaN(val);
    case 'integer':
      return typeof val === 'number' && Number.isInteger(val);
    case 'boolean':
      return typeof val === 'boolean';
    case 'array':
      return Array.isArray(val);
    case 'object':
      return val !== null && typeof val === 'object' && !Array.isArray(val);
    case 'null':
      return val === null;
    default:
      return true;
  }
}

function validateSchemaPropertyValue(
  propName: string,
  val: unknown,
  propSchema: JsonSchemaProperty,
  errors: string[],
): void {
  if (propSchema.type !== undefined) {
    const allowedTypes = Array.isArray(propSchema.type) ? propSchema.type : [propSchema.type];
    const typeOk = allowedTypes.some((t) => matchesJsonType(val, t));
    if (!typeOk) {
      errors.push(
        `Invalid type for "${propName}": expected ${allowedTypes.join(' | ')}, received ${val === null ? 'null' : Array.isArray(val) ? 'array' : typeof val}`,
      );
      return;
    }
  }

  if (propSchema.enum && !propSchema.enum.includes(val as string | number | boolean)) {
    errors.push(
      `Invalid value for "${propName}": expected one of [${propSchema.enum.join(', ')}]`,
    );
  }

  if (typeof val === 'string') {
    if (propSchema.minLength !== undefined && val.length < propSchema.minLength) {
      errors.push(
        `String "${propName}" is shorter than minLength (${propSchema.minLength})`,
      );
    }
    if (propSchema.maxLength !== undefined && val.length > propSchema.maxLength) {
      errors.push(
        `String "${propName}" exceeds maxLength (${propSchema.maxLength})`,
      );
    }
    if (propSchema.pattern !== undefined) {
      try {
        const re = new RegExp(propSchema.pattern);
        if (!re.test(val)) {
          errors.push(
            `String "${propName}" does not match pattern "${propSchema.pattern}"`,
          );
        }
      } catch {
        // Ignore invalid regular expression in schema
      }
    }
  }

  if (typeof val === 'number' && !Number.isNaN(val)) {
    if (propSchema.minimum !== undefined && val < propSchema.minimum) {
      errors.push(
        `Number "${propName}" is less than minimum (${propSchema.minimum})`,
      );
    }
    if (propSchema.maximum !== undefined && val > propSchema.maximum) {
      errors.push(
        `Number "${propName}" exceeds maximum (${propSchema.maximum})`,
      );
    }
  }

  if (Array.isArray(val) && propSchema.items) {
    for (let i = 0; i < val.length; i++) {
      validateSchemaPropertyValue(`${propName}[${i}]`, val[i], propSchema.items, errors);
    }
  }

  if (val !== null && typeof val === 'object' && !Array.isArray(val) && propSchema.properties) {
    const nestedRecord = val as Record<string, unknown>;
    for (const reqField of propSchema.required ?? []) {
      if (!(reqField in nestedRecord) || nestedRecord[reqField] === undefined) {
        errors.push(`Missing required parameter "${propName}.${reqField}"`);
      }
    }
    for (const [nestedKey, nestedProp] of Object.entries(propSchema.properties)) {
      if (nestedRecord[nestedKey] !== undefined) {
        validateSchemaPropertyValue(
          `${propName}.${nestedKey}`,
          nestedRecord[nestedKey],
          nestedProp,
          errors,
        );
      }
    }
  }
}

/**
 * Validates properties, types, required fields, enums, bounds, patterns, and nested objects
 * of a tool input object against a UnifiedToolSchema.
 */
export function validateToolInputBasic(
  schema: UnifiedToolSchema,
  input: unknown,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, errors: ['Tool input must be a non-null JSON object'] };
  }

  const rootSchema = schema.inputSchema ?? schema.input_schema ?? schema.parameters;
  if (!rootSchema || typeof rootSchema !== 'object') {
    return { valid: true, errors: [] };
  }

  const record = input as Record<string, unknown>;
  const properties = rootSchema.properties ?? {};
  const requiredFields = rootSchema.required ?? [];

  for (const field of requiredFields) {
    const propSchema = properties[field];
    const allowsNull =
      propSchema?.type === 'null' ||
      (Array.isArray(propSchema?.type) && propSchema.type.includes('null'));
    if (
      !(field in record) ||
      record[field] === undefined ||
      (record[field] === null && !allowsNull)
    ) {
      errors.push(`Missing required parameter "${field}" for tool "${schema.name}"`);
    }
  }

  if (rootSchema.additionalProperties === false) {
    for (const key of Object.keys(record)) {
      if (!(key in properties)) {
        errors.push(`Unexpected additional property "${key}" for tool "${schema.name}"`);
      }
    }
  }

  for (const [key, propSchema] of Object.entries(properties)) {
    const val = record[key];
    if (val === undefined) {
      continue;
    }
    validateSchemaPropertyValue(key, val, propSchema, errors);
  }

  return { valid: errors.length === 0, errors };
}
