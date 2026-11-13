/**
 * @pc-agent/protocol — Unified Message, ContentBlock & Streaming Event Contracts
 */

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface CacheControl {
  type: 'ephemeral';
  ttl?: '5m' | '1h';
}

export interface TextContentBlock {
  type: 'text';
  text: string;
  cacheControl?: CacheControl;
}

export interface ThinkingContentBlock {
  type: 'thinking';
  text: string;
  thinking?: string;
  signature?: string;
}

export interface ToolUseContentBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultContentBlock {
  type: 'tool_result';
  toolUseId: string;
  tool_use_id?: string;
  toolCallId?: string;
  toolName?: string;
  content: string | Record<string, unknown> | Array<TextContentBlock | Record<string, unknown>>;
  isError?: boolean;
  is_error?: boolean;
  cacheControl?: CacheControl;
}

export interface ImageContentBlock {
  type: 'image';
  mediaType: string;
  data: string;
}

export type ContentBlock =
  | TextContentBlock
  | ThinkingContentBlock
  | ToolUseContentBlock
  | ToolResultContentBlock
  | ImageContentBlock;

export type CacheControlEphemeral = CacheControl;
export type UnifiedTextBlock = TextContentBlock;
export type UnifiedThinkingBlock = ThinkingContentBlock;
export type UnifiedToolUseBlock = ToolUseContentBlock;
export type UnifiedToolResultBlock = ToolResultContentBlock;
export type UnifiedImageBlock = ImageContentBlock;
export type UnifiedContentBlock = ContentBlock;

export interface UnifiedToolCallItem {
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  arguments?: string | Record<string, unknown>;
  toolCallId?: string;
  toolName?: string;
  rawArgumentsJson?: string;
  parsedInput?: Record<string, unknown>;
  status?: string;
  output?: string;
  isError?: boolean;
  durationMs?: number;
  diffRecordId?: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  cacheCreationTokens?: number;
}

export interface UnifiedMessage {
  id?: string;
  role: MessageRole;
  content: string | ContentBlock[];
  thinking?: string;
  toolCalls?: UnifiedToolCallItem[];
  timestamp?: number;
  createdAt?: number;
  name?: string;
  toolCallId?: string;
  toolName?: string;
  isError?: boolean;
  model?: string;
  providerId?: string;
  usage?: TokenUsage;
  cacheControl?: CacheControl;
  metadata?: Record<string, unknown>;
}

export type StopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'aborted' | 'error';

/**
 * Normalized streaming events emitted by any `IAgentModelProvider` or `IRemoteAgentBridge`.
 */
export type UnifiedStreamEvent =
  | { type: 'message_start'; messageId: string; model: string; providerId?: string }
  | { type: 'thinking_delta'; text: string; signature?: string }
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call_start'; toolCallId: string; toolName: string }
  | { type: 'tool_call_delta'; toolCallId: string; argumentsJsonDelta: string }
  | {
      type: 'tool_call_end';
      toolCallId: string;
      toolName: string;
      parsedInput: Record<string, unknown>;
    }
  | {
      type: 'remote_tool_request';
      requestId: string;
      toolCallId: string;
      toolName: string;
      input: Record<string, unknown>;
      requiresConsent?: boolean;
    }
  | {
      type: 'tool_execution_start';
      toolCallId: string;
      toolName: string;
      input: Record<string, unknown>;
    }
  | {
      type: 'tool_execution_end';
      toolCallId: string;
      toolName: string;
      output: string;
      isError?: boolean;
      durationMs?: number;
      diffRecord?: unknown;
    }
  | {
      type: 'usage';
      inputTokens: number;
      outputTokens: number;
      cachedTokens?: number;
      cacheCreationTokens?: number;
    }
  | {
      type: 'error';
      message: string;
      code?: string;
      retryable?: boolean;
    }
  | {
      type: 'message_stop';
      stopReason: StopReason;
      errorMessage?: string;
    };

export function isTextBlock(block: ContentBlock): block is TextContentBlock {
  return block.type === 'text';
}

export function isThinkingBlock(block: ContentBlock): block is ThinkingContentBlock {
  return block.type === 'thinking';
}

export function isToolUseBlock(block: ContentBlock): block is ToolUseContentBlock {
  return block.type === 'tool_use';
}

export function isToolResultBlock(block: ContentBlock): block is ToolResultContentBlock {
  return block.type === 'tool_result';
}

export function isImageBlock(block: ContentBlock): block is ImageContentBlock {
  return block.type === 'image';
}

/**
 * Normalizes a string or ContentBlock[] message payload into a ContentBlock array.
 */
export function normalizeMessageContent(content: string | ContentBlock[]): ContentBlock[] {
  if (typeof content === 'string') {
    return content.length > 0 ? [{ type: 'text', text: content }] : [];
  }
  if (!Array.isArray(content)) {
    return [];
  }
  return content;
}

/**
 * Extracts concatenated plain text from a UnifiedMessage.
 */
export function extractMessageText(message: Pick<UnifiedMessage, 'content'>): string {
  if (typeof message.content === 'string') {
    return message.content;
  }
  if (!Array.isArray(message.content)) {
    return '';
  }
  return message.content
    .filter(isTextBlock)
    .map((block) => block.text)
    .join('');
}

/**
 * Extracts concatenated thinking text from a UnifiedMessage.
 */
export function extractThinkingText(message: Pick<UnifiedMessage, 'content'>): string {
  if (typeof message.content === 'string' || !Array.isArray(message.content)) {
    return '';
  }
  return message.content
    .filter(isThinkingBlock)
    .map((block) => block.text || block.thinking || '')
    .join('');
}

/**
 * Extracts all ToolUseContentBlock entries from a UnifiedMessage.
 */
export function extractToolUseBlocks(
  message: Pick<UnifiedMessage, 'content'>,
): ToolUseContentBlock[] {
  if (typeof message.content === 'string' || !Array.isArray(message.content)) {
    return [];
  }
  return message.content.filter(isToolUseBlock);
}

/**
 * Safely parses accumulated JSON tool call arguments into a plain object.
 */
export function safeParseToolArguments(rawJson: string): Record<string, unknown> {
  const trimmed = rawJson.trim();
  if (!trimmed) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { value: parsed };
  } catch {
    return { _raw: rawJson };
  }
}

interface PendingToolCall {
  toolCallId: string;
  toolName: string;
  jsonBuffer: string;
  parsedInput?: Record<string, unknown>;
  completed: boolean;
}

/**
 * Stateful accumulator that consumes `UnifiedStreamEvent` chunks from any provider
 * and builds a finalized assistant `UnifiedMessage` + `TokenUsage` + `StopReason`.
 */
export class StreamTurnAccumulator {
  private messageId = '';
  private model = '';
  private thinkingBuffer = '';
  private thinkingSignature?: string;
  private textBuffer = '';
  private readonly toolCalls = new Map<string, PendingToolCall>();
  private usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
  private stopReason: StopReason = 'end_turn';
  private errorMessage?: string;

  public apply(event: UnifiedStreamEvent): void {
    switch (event.type) {
      case 'message_start': {
        this.messageId = event.messageId;
        this.model = event.model;
        break;
      }
      case 'thinking_delta': {
        this.thinkingBuffer += event.text;
        if (event.signature) {
          this.thinkingSignature = event.signature;
        }
        break;
      }
      case 'text_delta': {
        this.textBuffer += event.text;
        break;
      }
      case 'tool_call_start': {
        this.toolCalls.set(event.toolCallId, {
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          jsonBuffer: '',
          completed: false,
        });
        break;
      }
      case 'tool_call_delta': {
        const existing = this.toolCalls.get(event.toolCallId);
        if (existing) {
          existing.jsonBuffer += event.argumentsJsonDelta;
        } else {
          this.toolCalls.set(event.toolCallId, {
            toolCallId: event.toolCallId,
            toolName: 'unknown_tool',
            jsonBuffer: event.argumentsJsonDelta,
            completed: false,
          });
        }
        break;
      }
      case 'tool_call_end': {
        const existing = this.toolCalls.get(event.toolCallId);
        if (existing) {
          existing.toolName = event.toolName || existing.toolName;
          existing.parsedInput = event.parsedInput;
          existing.completed = true;
        } else {
          this.toolCalls.set(event.toolCallId, {
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            jsonBuffer: JSON.stringify(event.parsedInput ?? {}),
            parsedInput: event.parsedInput,
            completed: true,
          });
        }
        break;
      }
      case 'remote_tool_request': {
        this.toolCalls.set(event.toolCallId, {
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          jsonBuffer: JSON.stringify(event.input ?? {}),
          parsedInput: event.input,
          completed: true,
        });
        break;
      }
      case 'usage': {
        this.usage = {
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
          cachedTokens: event.cachedTokens ?? this.usage.cachedTokens,
          cacheCreationTokens: event.cacheCreationTokens ?? this.usage.cacheCreationTokens,
        };
        break;
      }
      case 'error': {
        this.stopReason = 'error';
        this.errorMessage = event.message;
        break;
      }
      case 'message_stop': {
        this.stopReason = event.stopReason;
        if (event.errorMessage) {
          this.errorMessage = event.errorMessage;
        }
        break;
      }
      case 'tool_execution_start':
      case 'tool_execution_end': {
        break;
      }
    }
  }

  public toResult(): {
    messageId: string;
    model: string;
    message: UnifiedMessage;
    usage: TokenUsage;
    stopReason: StopReason;
    errorMessage?: string;
  } {
    const blocks: ContentBlock[] = [];

    if (this.thinkingBuffer.length > 0) {
      blocks.push({
        type: 'thinking',
        text: this.thinkingBuffer,
        thinking: this.thinkingBuffer,
        ...(this.thinkingSignature ? { signature: this.thinkingSignature } : {}),
      });
    }

    if (this.textBuffer.length > 0) {
      blocks.push({
        type: 'text',
        text: this.textBuffer,
      });
    }

    for (const call of this.toolCalls.values()) {
      const input = call.parsedInput ?? safeParseToolArguments(call.jsonBuffer);
      blocks.push({
        type: 'tool_use',
        id: call.toolCallId,
        name: call.toolName,
        input,
      });
    }

    return {
      messageId: this.messageId || `msg_${Date.now()}`,
      model: this.model,
      message: {
        id: this.messageId || undefined,
        role: 'assistant',
        content: blocks,
        timestamp: Date.now(),
      },
      usage: { ...this.usage },
      stopReason: this.stopReason,
      ...(this.errorMessage ? { errorMessage: this.errorMessage } : {}),
    };
  }
}
