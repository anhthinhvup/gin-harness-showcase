import { performance } from 'node:perf_hooks';
import {
  StreamTurnAccumulator,
  validateToolInputBasic,
  type UnifiedToolSchema,
} from '../packages/protocol/src/index.js';
import {
  stripInvisiblePromptChars,
  detectHiddenPromptInjection,
} from '../packages/security/src/index.js';

function bench(name: string, iterations: number, fn: (i: number) => void): {
  name: string;
  iterations: number;
  totalMs: number;
  opsPerSec: number;
  avgUs: number;
} {
  // Warmup
  for (let i = 0; i < 500; i++) fn(i);

  const t0 = performance.now();
  for (let i = 0; i < iterations; i++) fn(i);
  const totalMs = performance.now() - t0;
  return {
    name,
    iterations,
    totalMs: Number(totalMs.toFixed(2)),
    opsPerSec: Math.round((iterations / totalMs) * 1000),
    avgUs: Number(((totalMs * 1000) / iterations).toFixed(2)),
  };
}

const sampleSchema: UnifiedToolSchema = {
  name: 'patch_file',
  description: 'Apply deterministic diff patch',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['path', 'lineStart', 'mode'],
    properties: {
      path: { type: 'string', minLength: 1 },
      lineStart: { type: 'integer', minimum: 1, maximum: 50000 },
      mode: { type: 'string', enum: ['edit', 'replace'] },
    },
  },
};

const cleanPrompt =
  'Analyze order settlement idempotency ledger and verify zero-drift constraint across 3 warehouse nodes.';
const dirtyPrompt =
  'Review invoice totals\u200B\u200C and validate \u202Edispatch state\u202C before finalizing batch.';

const results = [
  bench('stripInvisiblePromptChars (clean prompt, 20k runs)', 20000, () => {
    stripInvisiblePromptChars(cleanPrompt);
  }),
  bench('detectHiddenPromptInjection (obfuscated prompt, 20k runs)', 20000, () => {
    detectHiddenPromptInjection(dirtyPrompt);
  }),
  bench('validateToolInputBasic (nested schema check, 50k runs)', 50000, () => {
    validateToolInputBasic(sampleSchema, {
      path: 'src/ledger/settle.ts',
      lineStart: 142,
      mode: 'edit',
    });
  }),
  bench('StreamTurnAccumulator (6-event turn build, 20k runs)', 20000, (i) => {
    const acc = new StreamTurnAccumulator();
    acc.apply({ type: 'message_start', messageId: `m_${i}`, model: 'gin-sonnet-4' });
    acc.apply({ type: 'thinking_delta', text: 'Plan' });
    acc.apply({ type: 'text_delta', text: 'Done' });
    acc.apply({ type: 'tool_call_start', toolCallId: 'c1', toolName: 'patch_file' });
    acc.apply({ type: 'tool_call_delta', toolCallId: 'c1', argumentsJsonDelta: '{"ok":true}' });
    acc.apply({ type: 'message_stop', stopReason: 'end_turn' });
    acc.toResult();
  }),
];

console.log(JSON.stringify({ nodeVersion: process.version, results }, null, 2));
