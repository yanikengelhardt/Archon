import { readdir, readFile, stat } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { createLogger } from '@archon/paths';
import type {
  AnalyticsAgent,
  AnalyticsSessionInput,
  AnalyticsSyncBatch,
  AnalyticsTokenUsageInput,
  AnalyticsToolCallInput,
  AnalyticsUserMessageInput,
} from '@archon/core/db/analytics';
import { ensureAnalyticsTables, upsertAnalyticsBatch } from '@archon/core/db/analytics';

/** Lazy-initialized logger (deferred so test mocks can intercept createLogger) */
let cachedLog: ReturnType<typeof createLogger> | undefined;
function getLog(): ReturnType<typeof createLogger> {
  if (!cachedLog) cachedLog = createLogger('analytics-syncer');
  return cachedLog;
}

interface AnalyticsSyncer {
  readonly runNow: () => Promise<void>;
  readonly stop: () => void;
}

interface JsonObject {
  readonly [key: string]: JsonValue;
}

type JsonValue = string | number | boolean | null | JsonObject | readonly JsonValue[];

interface SessionAccumulator {
  agent: AnalyticsAgent;
  providerSessionId: string;
  sourceFile: string;
  cwd: string | null;
  model: string | null;
  startedAt: string;
  lastActivityAt: string;
  hasRealTimestamp: boolean;
  messageCount: number;
  rawEvent: string | null;
}

interface ParsedUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheCreationInputTokens: number;
  readonly cacheReadInputTokens: number;
  readonly cachedInputTokens: number;
  readonly totalTokens: number;
  readonly costUsd: number | null;
}

interface ParsedUserMessage {
  readonly messageId: string;
  readonly content: string;
}

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

export async function startAnalyticsSyncer(
  intervalMs = DEFAULT_INTERVAL_MS
): Promise<AnalyticsSyncer> {
  try {
    await ensureAnalyticsTables();
  } catch (error) {
    getLog().warn({ err: error as Error }, 'analytics.schema_init_failed');
    return {
      runNow: async () => undefined,
      stop: () => undefined,
    };
  }

  let running = false;
  const runNow = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      const batch = await scanAnalyticsLogs();
      await upsertAnalyticsBatch(batch);
      getLog().debug(
        {
          sessions: batch.sessions.length,
          toolCalls: batch.toolCalls.length,
          tokenUsages: batch.tokenUsages.length,
          userMessages: batch.userMessages.length,
        },
        'analytics.sync_completed'
      );
    } catch (error) {
      getLog().warn({ err: error as Error }, 'analytics.sync_failed');
    } finally {
      running = false;
    }
  };

  runNow().catch((error: unknown) => {
    getLog().warn({ err: error as Error }, 'analytics.initial_sync_failed');
  });

  const timer = setInterval(() => {
    runNow().catch((error: unknown) => {
      getLog().warn({ err: error as Error }, 'analytics.periodic_sync_failed');
    });
  }, intervalMs);

  return {
    runNow,
    stop: (): void => {
      clearInterval(timer);
    },
  };
}

async function scanAnalyticsLogs(): Promise<AnalyticsSyncBatch> {
  const roots: readonly { agent: AnalyticsAgent; root: string }[] = [
    { agent: 'claude', root: join(homedir(), '.claude', 'projects') },
    { agent: 'codex', root: join(homedir(), '.codex', 'sessions') },
  ];

  const sessions: AnalyticsSessionInput[] = [];
  const toolCalls: AnalyticsToolCallInput[] = [];
  const tokenUsages: AnalyticsTokenUsageInput[] = [];
  const userMessages: AnalyticsUserMessageInput[] = [];
  const scannedSourceFiles: string[] = [];

  for (const root of roots) {
    const files = await findJsonlFiles(root.root);
    for (const file of files) {
      scannedSourceFiles.push(file);
      const parsed = await parseJsonlFile(root.agent, file);
      if (parsed.session) sessions.push(parsed.session);
      toolCalls.push(...parsed.toolCalls);
      tokenUsages.push(...parsed.tokenUsages);
      userMessages.push(...parsed.userMessages);
    }
  }

  return { sessions, toolCalls, tokenUsages, userMessages, scannedSourceFiles };
}

async function findJsonlFiles(root: string): Promise<string[]> {
  try {
    const rootStat = await stat(root);
    if (!rootStat.isDirectory()) return [];
  } catch {
    return [];
  }

  const results: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    let entries: { name: string; isDirectory(): boolean; isFile(): boolean }[];
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      getLog().debug({ err: error as Error, path: current }, 'analytics.scan_dir_failed');
      continue;
    }

    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(path);
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        results.push(path);
      }
    }
  }
  return results;
}

async function parseJsonlFile(
  agent: AnalyticsAgent,
  sourceFile: string
): Promise<{
  readonly session: AnalyticsSessionInput | null;
  readonly toolCalls: readonly AnalyticsToolCallInput[];
  readonly tokenUsages: readonly AnalyticsTokenUsageInput[];
  readonly userMessages: readonly AnalyticsUserMessageInput[];
}> {
  let content: string;
  let fileTimestamp = new Date(0).toISOString();
  try {
    const fileStat = await stat(sourceFile);
    if (fileStat.size > MAX_FILE_BYTES) {
      getLog().debug({ sourceFile, bytes: fileStat.size }, 'analytics.large_file_skipped');
      return { session: null, toolCalls: [], tokenUsages: [], userMessages: [] };
    }
    fileTimestamp = fileStat.mtime.toISOString();
    content = await readFile(sourceFile, 'utf-8');
  } catch (error) {
    getLog().debug({ err: error as Error, sourceFile }, 'analytics.read_file_failed');
    return { session: null, toolCalls: [], tokenUsages: [], userMessages: [] };
  }

  const toolCalls: AnalyticsToolCallInput[] = [];
  const tokenUsages: AnalyticsTokenUsageInput[] = [];
  const userMessages: AnalyticsUserMessageInput[] = [];
  const seenUsageKeys = new Set<string>();
  let session: SessionAccumulator | null = null;
  let lineNumber = 0;

  for (const line of content.split('\n')) {
    lineNumber += 1;
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;

    const event = parseJsonLine(trimmed);
    if (!event) continue;

    const timestamp = extractTimestamp(event);
    const eventAt = timestamp ?? fileTimestamp;
    const extractedSessionId = extractSessionId(event);
    const providerSessionId: string =
      extractedSessionId ?? session?.providerSessionId ?? sourceFile;
    const model =
      extractString(event, ['model']) ??
      extractString(event, ['message', 'model']) ??
      extractString(event, ['payload', 'model']);
    const cwd = extractString(event, ['cwd']) ?? extractString(event, ['payload', 'cwd']);

    if (!session) {
      session = {
        agent,
        providerSessionId,
        sourceFile,
        cwd: cwd ?? null,
        model: model ?? null,
        startedAt: eventAt,
        lastActivityAt: eventAt,
        hasRealTimestamp: timestamp !== undefined,
        messageCount: 0,
        rawEvent: trimmed,
      };
    }

    if (extractedSessionId && session.providerSessionId === sourceFile) {
      session.providerSessionId = extractedSessionId;
    }
    if (timestamp) {
      if (session.hasRealTimestamp) {
        session.startedAt = minIso(session.startedAt, timestamp);
        session.lastActivityAt = maxIso(session.lastActivityAt, timestamp);
      } else {
        session.startedAt = timestamp;
        session.lastActivityAt = timestamp;
        session.hasRealTimestamp = true;
      }
    }
    session.cwd = session.cwd ?? cwd ?? null;
    session.model = session.model ?? model ?? null;

    const userMessage = extractUserMessage(agent, event);
    if (userMessage) {
      session.messageCount += 1;
      userMessages.push({
        agent,
        providerSessionId,
        messageId: userMessage.messageId,
        content: userMessage.content,
        createdAt: eventAt,
        sourceFile,
        sourceLine: lineNumber,
        rawEvent: trimmed,
      });
    }

    const usage = extractUsage(event);
    if (usage) {
      const usageKey = buildUsageDedupeKey(agent, event, sourceFile, lineNumber);
      if (!seenUsageKeys.has(usageKey)) {
        seenUsageKeys.add(usageKey);
        tokenUsages.push({
          agent,
          providerSessionId,
          model: model ?? session.model,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cacheCreationInputTokens: usage.cacheCreationInputTokens,
          cacheReadInputTokens: usage.cacheReadInputTokens,
          cachedInputTokens: usage.cachedInputTokens,
          totalTokens: usage.totalTokens,
          costUsd: usage.costUsd,
          eventAt,
          sourceFile,
          sourceLine: lineNumber,
          rawEvent: trimmed,
        });
      }
    }

    toolCalls.push(
      ...extractToolCalls(agent, providerSessionId, eventAt, sourceFile, lineNumber, event, trimmed)
    );
  }

  return {
    session: session
      ? {
          agent: session.agent,
          providerSessionId: session.providerSessionId,
          sourceFile: session.sourceFile,
          cwd: session.cwd,
          model: session.model,
          startedAt: session.startedAt,
          endedAt: null,
          lastActivityAt: session.lastActivityAt,
          messageCount: session.messageCount,
          rawEvent: session.rawEvent,
        }
      : null,
    toolCalls,
    tokenUsages,
    userMessages,
  };
}

function parseJsonLine(line: string): JsonObject | null {
  try {
    const parsed: unknown = JSON.parse(line);
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getAtPath(value: JsonObject, path: readonly string[]): JsonValue | undefined {
  let current: JsonValue | undefined = value;
  for (const segment of path) {
    if (!isObject(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function extractString(value: JsonObject, path: readonly string[]): string | undefined {
  const found = getAtPath(value, path);
  return typeof found === 'string' && found.length > 0 ? found : undefined;
}

function extractNumber(value: JsonObject, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const found = value[key];
    if (typeof found === 'number' && Number.isFinite(found)) return found;
    if (typeof found === 'string') {
      const parsed = Number(found);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function extractTimestamp(event: JsonObject): string | undefined {
  const value =
    extractString(event, ['timestamp']) ??
    extractString(event, ['created_at']) ??
    extractString(event, ['time']) ??
    extractString(event, ['payload', 'timestamp']);
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function extractSessionId(event: JsonObject): string | undefined {
  const eventType = extractString(event, ['type']);
  return (
    extractString(event, ['sessionId']) ??
    extractString(event, ['session_id']) ??
    extractString(event, ['conversationId']) ??
    extractString(event, ['thread_id']) ??
    (eventType === 'session_meta' ? extractString(event, ['payload', 'id']) : undefined) ??
    extractString(event, ['payload', 'session_id']) ??
    extractString(event, ['payload', 'thread_id'])
  );
}

function extractUsage(event: JsonObject): ParsedUsage | null {
  const candidates = [
    getAtPath(event, ['usage']),
    getAtPath(event, ['message', 'usage']),
    getAtPath(event, ['payload', 'usage']),
    getAtPath(event, ['payload', 'info', 'last_token_usage']),
  ];
  const usage = candidates.find(isObject);
  if (!usage) return null;

  const inputTokens =
    extractNumber(usage, ['input_tokens', 'inputTokens', 'prompt_tokens', 'promptTokens']) ?? 0;
  const outputTokens =
    extractNumber(usage, [
      'output_tokens',
      'outputTokens',
      'completion_tokens',
      'completionTokens',
    ]) ?? 0;
  const cacheCreationInputTokens =
    extractNumber(usage, ['cache_creation_input_tokens', 'cacheCreationInputTokens']) ?? 0;
  const cacheReadInputTokens =
    extractNumber(usage, ['cache_read_input_tokens', 'cacheReadInputTokens']) ?? 0;
  const cachedInputTokens = extractNumber(usage, ['cached_input_tokens', 'cachedInputTokens']) ?? 0;
  const explicitTotal = extractNumber(usage, ['total_tokens', 'totalTokens']);
  const totalTokens =
    explicitTotal ??
    inputTokens +
      outputTokens +
      cacheCreationInputTokens +
      cacheReadInputTokens +
      cachedInputTokens;
  const costUsd =
    extractNumber(event, ['cost_usd', 'costUSD']) ?? extractNumber(usage, ['cost_usd', 'costUSD']);

  if (totalTokens <= 0 && inputTokens <= 0 && outputTokens <= 0) return null;

  return {
    inputTokens,
    outputTokens,
    cacheCreationInputTokens,
    cacheReadInputTokens,
    cachedInputTokens,
    totalTokens,
    costUsd: costUsd ?? null,
  };
}

function extractUserMessage(agent: AnalyticsAgent, event: JsonObject): ParsedUserMessage | null {
  if (agent === 'codex') {
    const type = extractString(event, ['type']);
    const payloadType = extractString(event, ['payload', 'type']);
    const message = extractString(event, ['payload', 'message']);
    if (type !== 'event_msg' || payloadType !== 'user_message' || !message) return null;
    if (isSyntheticUserText(message)) return null;
    return {
      messageId: extractString(event, ['payload', 'id']) ?? extractString(event, ['id']) ?? message,
      content: truncateMessage(message),
    };
  }

  const type = extractString(event, ['type']);
  const role = extractString(event, ['message', 'role']);
  if (type !== 'user' || role !== 'user') return null;

  const content = getAtPath(event, ['message', 'content']);
  const text = extractUserContentText(content);
  if (!text || isSyntheticUserText(text)) return null;
  return {
    messageId:
      extractString(event, ['uuid']) ??
      extractString(event, ['message', 'id']) ??
      extractString(event, ['promptId']) ??
      text,
    content: truncateMessage(text),
  };
}

function isSyntheticUserText(text: string): boolean {
  const trimmed = text.trim();
  return (
    trimmed.startsWith('<task-notification>') ||
    trimmed.startsWith('<command-message>') ||
    trimmed.startsWith('<local-command-') ||
    trimmed.startsWith('<system-reminder>') ||
    trimmed.startsWith('# Archon Orchestrator') ||
    trimmed.startsWith('Generate a concise conversation title') ||
    trimmed.startsWith('This session is being continued from a previous conversation') ||
    trimmed.startsWith(
      'Caveat: The messages below were generated by the user while running local commands'
    )
  );
}

function extractUserContentText(content: JsonValue | undefined): string | null {
  if (typeof content === 'string') {
    const trimmed = content.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (!Array.isArray(content)) return null;
  const parts: string[] = [];
  for (const block of content) {
    if (!isObject(block)) continue;
    if (extractString(block, ['tool_use_id']) || extractString(block, ['type']) === 'tool_result') {
      return null;
    }
    const text =
      extractString(block, ['text']) ??
      extractString(block, ['content']) ??
      extractString(block, ['input_text']);
    if (text) parts.push(text);
  }
  const joined = parts.join('\n').trim();
  return joined.length > 0 ? joined : null;
}

function truncateMessage(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 4000 ? `${trimmed.slice(0, 3997)}...` : trimmed;
}

function buildUsageDedupeKey(
  agent: AnalyticsAgent,
  event: JsonObject,
  sourceFile: string,
  sourceLine: number
): string {
  if (agent === 'claude') {
    const requestId = extractString(event, ['requestId']);
    const messageId = extractString(event, ['message', 'id']);
    if (requestId || messageId) return `${agent}:${requestId ?? ''}:${messageId ?? ''}`;
  }
  return `${agent}:${sourceFile}:${String(sourceLine)}`;
}

function extractToolCalls(
  agent: AnalyticsAgent,
  providerSessionId: string,
  eventAt: string,
  sourceFile: string,
  sourceLine: number,
  event: JsonObject,
  rawEvent: string
): AnalyticsToolCallInput[] {
  const calls: AnalyticsToolCallInput[] = [];
  const content = getAtPath(event, ['message', 'content']) ?? getAtPath(event, ['content']);
  if (Array.isArray(content)) {
    for (const block of content) {
      if (!isObject(block)) continue;
      const type = extractString(block, ['type']);
      const name = extractString(block, ['name']);
      if (type === 'tool_use' && name) {
        calls.push({
          agent,
          providerSessionId,
          toolCallId: extractString(block, ['id']) ?? `${sourceLine}:${name}:${calls.length}`,
          toolName: name,
          status: null,
          startedAt: eventAt,
          sourceFile,
          sourceLine,
          rawEvent,
        });
      }
    }
  }

  const item = getAtPath(event, ['item']);
  if (isObject(item)) {
    const itemType = extractString(item, ['type']);
    const name = extractString(item, ['name']) ?? itemType;
    if (
      name &&
      (itemType === 'function_call' || itemType === 'tool_call' || itemType === 'web_search')
    ) {
      calls.push({
        agent,
        providerSessionId,
        toolCallId: extractString(item, ['id']) ?? `${sourceLine}:${name}`,
        toolName: name,
        status: extractString(event, ['type']),
        startedAt: eventAt,
        sourceFile,
        sourceLine,
        rawEvent,
      });
    }
  }

  const payload = getAtPath(event, ['payload']);
  if (isObject(payload)) {
    const payloadType = extractString(payload, ['type']);
    const name = extractString(payload, ['name']) ?? payloadType;
    if (
      name &&
      (payloadType === 'function_call' ||
        payloadType === 'custom_tool_call' ||
        payloadType === 'web_search_call')
    ) {
      calls.push({
        agent,
        providerSessionId,
        toolCallId:
          extractString(payload, ['call_id']) ??
          extractString(payload, ['id']) ??
          `${sourceLine}:${name}`,
        toolName: name,
        status: extractString(event, ['type']),
        startedAt: eventAt,
        sourceFile,
        sourceLine,
        rawEvent,
      });
    }
  }

  return calls;
}

function minIso(left: string, right: string): string {
  return new Date(left).getTime() <= new Date(right).getTime() ? left : right;
}

function maxIso(left: string, right: string): string {
  return new Date(left).getTime() >= new Date(right).getTime() ? left : right;
}
