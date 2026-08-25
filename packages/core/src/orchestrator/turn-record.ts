/**
 * Accumulates the non-prose parts of one direct-chat turn — tool calls and
 * model reasoning — so platforms that cannot render them live can still
 * persist them as message metadata.
 *
 * Why this exists: the web adapter buffers tool calls through its own
 * `MessagePersistence` and streams reasoning over SSE, so a web chat is fully
 * inspectable. Every other platform (Slack, Telegram, Discord, GitHub, CLI)
 * persisted ONLY the final assistant prose, which made those conversations
 * opaque in the Web UI — you could read the answer but never what produced it.
 *
 * The emitted shape is deliberately byte-compatible with the web adapter's
 * metadata (`persistence.ts` → `{ name, input, duration, output? }`) because
 * `mapMessageRow` in the Web UI hydrates both through the same code path.
 * Changing one shape without the other silently breaks tool-card rendering for
 * half the platforms.
 */
import { createLogger } from '@archon/paths';
import type { TokenUsage } from '@archon/providers/types';

let cachedLog: ReturnType<typeof createLogger> | undefined;
function getLog(): ReturnType<typeof createLogger> {
  if (!cachedLog) cachedLog = createLogger('orchestrator.turn-record');
  return cachedLog;
}

/** One tool invocation within a turn. Mirrors the web adapter's metadata shape. */
export interface TurnToolCall {
  name: string;
  input: Record<string, unknown>;
  duration?: number;
  output?: string;
}

/**
 * End-of-turn provider metadata, persisted so a non-web turn shows its model,
 * spend and token counts when reviewed in the Web UI. The web adapter delivers
 * the same fields live over SSE instead.
 */
export interface TurnRunMeta {
  cost?: number;
  tokens?: TokenUsage;
  model?: string;
  stopReason?: string;
  credits?: number;
  /** Credits expressed in USD, from the same configured rates. */
  estimatedUsd?: number;
}

/** Metadata payload handed to `addMessage` for a non-web assistant turn. */
export interface TurnMetadata {
  toolCalls?: TurnToolCall[];
  reasoning?: string;
  runMeta?: TurnRunMeta;
}

/**
 * Cap on persisted reasoning per turn.
 *
 * Tool calls are left uncapped to stay at parity with the web path, and their
 * outputs are bounded on READ by `boundMetadataToolOutputs` — the database is
 * the authoritative record. Reasoning has no such reader-side bound and is the
 * one field that can grow without limit on a long agentic turn, so it is capped
 * here with a visible marker rather than silently dropped.
 */
const MAX_REASONING_CHARS = 32_768;

interface PendingTool extends TurnToolCall {
  startedAt: number;
  toolCallId?: string;
}

export class TurnRecord {
  private tools: PendingTool[] = [];
  private reasoningParts: string[] = [];
  private reasoningChars = 0;
  private reasoningTruncated = false;
  private runMeta: TurnRunMeta | undefined;

  /** Record a tool invocation. `now` is injectable so tests stay deterministic. */
  recordTool(
    name: string,
    input: Record<string, unknown> | undefined,
    toolCallId?: string,
    now: number = Date.now()
  ): void {
    this.tools.push({
      name,
      input: input ?? {},
      startedAt: now,
      ...(toolCallId !== undefined ? { toolCallId } : {}),
    });
  }

  /**
   * Attach a result to its invocation.
   *
   * Prefers the SDK's stable id (correct when several same-named tools run
   * concurrently) and falls back to a reverse scan for the most recent
   * unresolved call of that name — the same two-tier match the web adapter
   * uses. An unmatched result is dropped with a warn rather than inventing a
   * call, so a provider that emits results without invocations is visible in
   * the logs instead of producing phantom tool cards.
   */
  recordToolResult(
    name: string,
    output: string | undefined,
    toolCallId?: string,
    now: number = Date.now()
  ): void {
    const match =
      (toolCallId !== undefined
        ? this.tools.find(t => t.toolCallId === toolCallId && t.output === undefined)
        : undefined) ??
      [...this.tools].reverse().find(t => t.name === name && t.output === undefined);

    if (!match) {
      getLog().warn({ toolName: name, toolCallId }, 'turn_record.tool_result_unmatched');
      return;
    }
    match.output = output ?? '';
    match.duration = now - match.startedAt;
  }

  /**
   * Attach end-of-turn metadata. Fields with no value are dropped so the
   * persisted object never carries explicit `undefined` keys through JSON.
   */
  setRunMeta(meta: TurnRunMeta): void {
    const cleaned: TurnRunMeta = {
      ...(meta.cost !== undefined ? { cost: meta.cost } : {}),
      ...(meta.tokens !== undefined ? { tokens: meta.tokens } : {}),
      ...(meta.model !== undefined ? { model: meta.model } : {}),
      ...(meta.stopReason !== undefined ? { stopReason: meta.stopReason } : {}),
      ...(meta.credits !== undefined ? { credits: meta.credits } : {}),
      ...(meta.estimatedUsd !== undefined ? { estimatedUsd: meta.estimatedUsd } : {}),
    };
    if (Object.keys(cleaned).length > 0) this.runMeta = cleaned;
  }

  /** Append a reasoning delta, stopping at the cap. */
  recordReasoning(content: string): void {
    if (this.reasoningTruncated) return;
    const remaining = MAX_REASONING_CHARS - this.reasoningChars;
    if (content.length <= remaining) {
      this.reasoningParts.push(content);
      this.reasoningChars += content.length;
      return;
    }
    this.reasoningParts.push(content.slice(0, remaining), '\n\n… [reasoning truncated]');
    this.reasoningChars = MAX_REASONING_CHARS;
    this.reasoningTruncated = true;
    getLog().debug({ cap: MAX_REASONING_CHARS }, 'turn_record.reasoning_truncated');
  }

  /**
   * Build the metadata object, omitting empty fields so a turn that used no
   * tools and produced no reasoning still writes `{}` — matching what the
   * previous metadata-less `addMessage` call stored.
   *
   * The `Record<string, unknown>` intersection is what makes the result
   * assignable to `addMessage`'s metadata parameter; a bare interface has no
   * implicit index signature and would be rejected at the call site.
   */
  toMetadata(): TurnMetadata & Record<string, unknown> {
    const toolCalls = this.tools.map(
      ({ startedAt: _startedAt, toolCallId: _toolCallId, ...tc }) => tc
    );
    return {
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
      ...(this.reasoningParts.length > 0 ? { reasoning: this.reasoningParts.join('') } : {}),
      ...(this.runMeta ? { runMeta: this.runMeta } : {}),
    };
  }
}
