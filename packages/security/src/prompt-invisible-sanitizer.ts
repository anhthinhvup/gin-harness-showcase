/**
 * @pc-agent/agent-core — Invisible Unicode Prompt Sanitizer
 *
 * GIN Native implementation of `ginflag_prompt_invisible_strip` (GIN CLI).
 * Detects, decodes, and strips invisible Unicode ranges commonly abused for
 * hidden prompt injection, steganographic ASCII tag smuggling (`U+E0000..U+E007F`),
 * bidirectional Trojan Source overrides (`U+202A..U+202E`, `U+2066..U+2069`),
 * zero-width characters (`U+200B..U+200F`, `U+2060..U+2064`, `U+FEFF`), and
 * variation selector steganography (`U+FE00..U+FE0F`, `U+E0100..U+E01EF`).
 */

export type InvisibleCharCategory =
  | 'unicode_tag'
  | 'zero_width'
  | 'bidi_override'
  | 'variation_selector';

export interface InvisibleUnicodeRange {
  name: string;
  category: InvisibleCharCategory;
  startCodePoint: number;
  endCodePoint: number;
}

/**
 * Canonical catalog of invisible Unicode code point ranges stripped from user
 * prompts, pasted clipboard fragments, and tool outputs.
 */
export const INVISIBLE_UNICODE_RANGES: readonly InvisibleUnicodeRange[] = [
  {
    name: 'Zero-Width Spaces & Joiners (U+200B..U+200F)',
    category: 'zero_width',
    startCodePoint: 0x200b,
    endCodePoint: 0x200f,
  },
  {
    name: 'Bidirectional Embedding & Override Controls (U+202A..U+202E)',
    category: 'bidi_override',
    startCodePoint: 0x202a,
    endCodePoint: 0x202e,
  },
  {
    name: 'Word Joiner & Invisible Math Operators (U+2060..U+2064)',
    category: 'zero_width',
    startCodePoint: 0x2060,
    endCodePoint: 0x2064,
  },
  {
    name: 'Bidirectional Isolate Controls (U+2066..U+2069)',
    category: 'bidi_override',
    startCodePoint: 0x2066,
    endCodePoint: 0x2069,
  },
  {
    name: 'Variation Selectors (U+FE00..U+FE0F)',
    category: 'variation_selector',
    startCodePoint: 0xfe00,
    endCodePoint: 0xfe0f,
  },
  {
    name: 'Zero-Width No-Break Space / BOM (U+FEFF)',
    category: 'zero_width',
    startCodePoint: 0xfeff,
    endCodePoint: 0xfeff,
  },
  {
    name: 'Unicode Tags Block (U+E0000..U+E007F)',
    category: 'unicode_tag',
    startCodePoint: 0xe0000,
    endCodePoint: 0xe007f,
  },
  {
    name: 'Variation Selectors Supplement (U+E0100..U+E01EF)',
    category: 'variation_selector',
    startCodePoint: 0xe0100,
    endCodePoint: 0xe01ef,
  },
] as const;

export interface InvisibleCharFinding {
  codePoint: number;
  hexCode: string;
  index: number;
  category: InvisibleCharCategory;
  name: string;
  decodedAsciiChar?: string;
}

export interface PromptSanitizeResult {
  sanitizedText: string;
  originalLength: number;
  sanitizedLength: number;
  strippedCount: number;
  hadInvisibleChars: boolean;
  decodedHiddenTagPayload: string;
  findings: InvisibleCharFinding[];
}

const SUSPICIOUS_INJECTION_PATTERNS: readonly RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|rules)/i,
  /disregard\s+(all\s+)?(previous|prior|above)/i,
  /system\s*prompt/i,
  /<\s*\/?\s*system\s*>/i,
  /\b(system|developer|admin)\s*override\b/i,
  /\byou\s+are\s+now\b/i,
  /\bnew\s+instructions?\s*:/i,
  /\bexecute\s+(shell|bash|command|tool)\b/i,
  /\bexfiltrate\b/i,
];

/**
 * Formats a Unicode code point as a canonical `U+XXXX` hex identifier.
 */
export function formatCodePointHex(codePoint: number): string {
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
}

/**
 * Looks up whether a Unicode code point falls inside any registered
 * `INVISIBLE_UNICODE_RANGES` entry.
 */
export function matchInvisibleUnicodeRange(
  codePoint: number,
): InvisibleUnicodeRange | undefined {
  for (const range of INVISIBLE_UNICODE_RANGES) {
    if (codePoint >= range.startCodePoint && codePoint <= range.endCodePoint) {
      return range;
    }
  }
  return undefined;
}

/**
 * Scans `text` by Unicode code points, strips all characters matching
 * `INVISIBLE_UNICODE_RANGES`, and decodes hidden ASCII payloads smuggled via
 * the Unicode Tags block (`U+E0000..U+E007F`).
 */
export function stripInvisiblePromptChars(text: string): PromptSanitizeResult {
  if (!text) {
    return {
      sanitizedText: '',
      originalLength: 0,
      sanitizedLength: 0,
      strippedCount: 0,
      hadInvisibleChars: false,
      decodedHiddenTagPayload: '',
      findings: [],
    };
  }

  const keptChars: string[] = [];
  const hiddenTagChars: string[] = [];
  const findings: InvisibleCharFinding[] = [];
  let utf16Offset = 0;

  for (const ch of text) {
    const codePoint = ch.codePointAt(0);
    const currentIndex = utf16Offset;
    utf16Offset += ch.length;

    if (codePoint === undefined) {
      continue;
    }

    const matchedRange = matchInvisibleUnicodeRange(codePoint);
    if (!matchedRange) {
      keptChars.push(ch);
      continue;
    }

    let decodedAsciiChar: string | undefined;
    if (codePoint >= 0xe0000 && codePoint <= 0xe007f) {
      const asciiCode = codePoint - 0xe0000;
      if (asciiCode >= 0x20 && asciiCode <= 0x7e) {
        decodedAsciiChar = String.fromCharCode(asciiCode);
        hiddenTagChars.push(decodedAsciiChar);
      }
    }

    const finding: InvisibleCharFinding = {
      codePoint,
      hexCode: formatCodePointHex(codePoint),
      index: currentIndex,
      category: matchedRange.category,
      name: matchedRange.name,
      ...(decodedAsciiChar !== undefined ? { decodedAsciiChar } : {}),
    };
    findings.push(finding);
  }

  const sanitizedText = keptChars.join('');
  return {
    sanitizedText,
    originalLength: text.length,
    sanitizedLength: sanitizedText.length,
    strippedCount: findings.length,
    hadInvisibleChars: findings.length > 0,
    decodedHiddenTagPayload: hiddenTagChars.join(''),
    findings,
  };
}

/**
 * Evaluates a prompt string for hidden Unicode prompt-injection risks,
 * including Unicode Tag ASCII smuggling, Trojan Source bidirectional overrides,
 * and zero-width / variation-selector obfuscation clusters.
 */
export function detectHiddenPromptInjection(text: string): {
  safe: boolean;
  findings: InvisibleCharFinding[];
  riskScore: number;
  decodedPayload?: string;
  reasons: string[];
} {
  const result = stripInvisiblePromptChars(text);
  const { findings, decodedHiddenTagPayload, sanitizedText } = result;
  const reasons: string[] = [];
  let riskScore = 0;

  if (findings.length === 0) {
    return {
      safe: true,
      findings: [],
      riskScore: 0,
      reasons: [],
    };
  }

  const tagCount = findings.filter((f) => f.category === 'unicode_tag').length;
  const bidiCount = findings.filter((f) => f.category === 'bidi_override').length;
  const zeroWidthCount = findings.filter((f) => f.category === 'zero_width').length;
  const variationCount = findings.filter(
    (f) => f.category === 'variation_selector',
  ).length;

  if (tagCount > 0) {
    riskScore += Math.min(60, 35 + tagCount * 2);
    reasons.push(
      `Detected ${tagCount} Unicode Tag character(s) (U+E0000..U+E007F) commonly used for hidden prompt smuggling.`,
    );
  }

  if (bidiCount > 0) {
    riskScore += Math.min(50, 30 + bidiCount * 5);
    reasons.push(
      `Detected ${bidiCount} bidirectional override/isolate control character(s) capable of Trojan Source display spoofing.`,
    );
  }

  if (zeroWidthCount > 0) {
    riskScore += zeroWidthCount >= 2 ? Math.min(35, 20 + zeroWidthCount * 3) : 10;
    reasons.push(
      `Detected ${zeroWidthCount} zero-width character(s) that may split or obfuscate sensitive tokens.`,
    );
  }

  if (variationCount > 0) {
    riskScore +=
      variationCount >= 2 ? Math.min(35, 20 + variationCount * 3) : 10;
    reasons.push(
      `Detected ${variationCount} variation selector character(s) that may encode steganographic payloads.`,
    );
  }

  const matchedPayloadPattern =
    decodedHiddenTagPayload.length > 0 &&
    SUSPICIOUS_INJECTION_PATTERNS.some((re) => re.test(decodedHiddenTagPayload));
  if (matchedPayloadPattern) {
    riskScore += 40;
    reasons.push(
      `Decoded Unicode Tag payload matches prompt-injection directive pattern: "${decodedHiddenTagPayload}".`,
    );
  }

  const matchedSanitizedAfterStrip =
    findings.length > 0 &&
    !SUSPICIOUS_INJECTION_PATTERNS.some((re) => re.test(text)) &&
    SUSPICIOUS_INJECTION_PATTERNS.some((re) => re.test(sanitizedText));
  if (matchedSanitizedAfterStrip) {
    riskScore += 35;
    reasons.push(
      'Stripping invisible characters revealed an obfuscated prompt-injection phrase in visible text.',
    );
  }

  const clampedScore = Math.min(100, riskScore);
  const safe = findings.length === 0 && clampedScore < 25;

  return {
    safe,
    findings,
    riskScore: clampedScore,
    ...(decodedHiddenTagPayload.length > 0
      ? { decodedPayload: decodedHiddenTagPayload }
      : {}),
    reasons,
  };
}

/**
 * Sanitizes an array of conversation messages in a non-mutating manner,
 * stripping invisible Unicode characters from each message's `content` string
 * and aggregating all findings.
 */
export function sanitizeConversationMessages<
  T extends { role: string; content: string },
>(messages: T[]): {
  messages: T[];
  totalStrippedChars: number;
  findings: InvisibleCharFinding[];
} {
  const sanitizedMessages: T[] = [];
  const allFindings: InvisibleCharFinding[] = [];
  let totalStrippedChars = 0;

  for (const message of messages) {
    if (typeof message.content !== 'string' || message.content.length === 0) {
      sanitizedMessages.push({ ...message });
      continue;
    }

    const sanitized = stripInvisiblePromptChars(message.content);
    totalStrippedChars += sanitized.strippedCount;
    if (sanitized.findings.length > 0) {
      allFindings.push(...sanitized.findings);
    }

    sanitizedMessages.push({
      ...message,
      content: sanitized.sanitizedText,
    });
  }

  return {
    messages: sanitizedMessages,
    totalStrippedChars,
    findings: allFindings,
  };
}
