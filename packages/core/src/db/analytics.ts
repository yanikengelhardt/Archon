import { pool, getDatabase } from './connection';

export type AnalyticsAgent = 'claude' | 'codex';

export interface AnalyticsSessionInput {
  readonly agent: AnalyticsAgent;
  readonly providerSessionId: string;
  readonly sourceFile: string;
  readonly cwd?: string | null;
  readonly model?: string | null;
  readonly startedAt: string;
  readonly endedAt?: string | null;
  readonly lastActivityAt: string;
  readonly messageCount: number;
  readonly rawEvent?: string | null;
}

export interface AnalyticsToolCallInput {
  readonly agent: AnalyticsAgent;
  readonly providerSessionId: string;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly status?: string | null;
  readonly startedAt: string;
  readonly sourceFile: string;
  readonly sourceLine: number;
  readonly rawEvent?: string | null;
}

export interface AnalyticsTokenUsageInput {
  readonly agent: AnalyticsAgent;
  readonly providerSessionId: string;
  readonly model?: string | null;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheCreationInputTokens: number;
  readonly cacheReadInputTokens: number;
  readonly cachedInputTokens: number;
  readonly totalTokens: number;
  readonly costUsd?: number | null;
  readonly eventAt: string;
  readonly sourceFile: string;
  readonly sourceLine: number;
  readonly rawEvent?: string | null;
}

export interface AnalyticsUserMessageInput {
  readonly agent: AnalyticsAgent;
  readonly providerSessionId: string;
  readonly messageId: string;
  readonly content: string;
  readonly createdAt: string;
  readonly sourceFile: string;
  readonly sourceLine: number;
  readonly rawEvent?: string | null;
}

export interface AnalyticsSourceFileInput {
  readonly agent: AnalyticsAgent;
  readonly sourceFile: string;
  readonly sizeBytes: number;
  readonly mtimeMs: number;
}

export interface AnalyticsSyncBatch {
  readonly sessions: readonly AnalyticsSessionInput[];
  readonly toolCalls: readonly AnalyticsToolCallInput[];
  readonly tokenUsages: readonly AnalyticsTokenUsageInput[];
  readonly userMessages: readonly AnalyticsUserMessageInput[];
  readonly scannedSourceFiles: readonly string[];
  readonly sourceFiles: readonly AnalyticsSourceFileInput[];
}

export interface AnalyticsSourceFileState {
  readonly agent: AnalyticsAgent;
  readonly sourceFile: string;
  readonly sizeBytes: number;
  readonly mtimeMs: number;
}

export interface AnalyticsAgentTotals {
  sessions: number;
  toolCalls: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  cachedInputTokens: number;
  totalTokens: number;
  costUsd: number | null;
}

export interface AnalyticsTokenBreakdown {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  cachedInputTokens: number;
  effectiveTokens: number;
}

export interface AnalyticsSummary {
  readonly generatedAt: string;
  readonly periods: readonly AnalyticsPeriodUsage[];
  readonly totals: AnalyticsAgentTotals & {
    readonly byAgent: Record<AnalyticsAgent, AnalyticsAgentTotals>;
  };
  readonly windowBars: readonly AnalyticsWindowBar[];
  readonly cumulativeSeries: readonly AnalyticsCumulativePoint[];
  readonly dailyBars: readonly AnalyticsDailyBar[];
  readonly forecast: {
    readonly projectedMonthTokens: number | null;
    readonly projectedMonthCostUsd: number | null;
    readonly resetAt: string | null;
    readonly daysRemaining: number | null;
  };
  readonly recentSessionPulse: readonly AnalyticsSessionPulse[];
}

export interface AnalyticsPeriodUsage {
  readonly key: 'week' | 'month';
  readonly label: string;
  readonly start: string;
  readonly end: string;
  readonly totals: AnalyticsAgentTotals & {
    readonly byAgent: Record<AnalyticsAgent, AnalyticsAgentTotals>;
  };
}

export interface AnalyticsSessionList {
  readonly generatedAt: string;
  readonly period: 'week' | 'month';
  readonly start: string;
  readonly end: string;
  readonly limit: number;
  readonly offset: number;
  readonly total: number;
  readonly sessions: readonly AnalyticsSessionUsage[];
}

export interface AnalyticsSessionUsage {
  readonly agent: AnalyticsAgent;
  readonly providerSessionId: string;
  readonly cwd: string | null;
  readonly model: string | null;
  readonly startedAt: string;
  readonly lastActivityAt: string;
  readonly durationSeconds: number;
  readonly messageCount: number;
  readonly userMessages: readonly string[];
  readonly toolCalls: number;
  readonly tools: readonly string[];
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheCreationInputTokens: number;
  readonly cacheReadInputTokens: number;
  readonly cachedInputTokens: number;
  readonly totalTokens: number;
  readonly effectiveTokens: number;
  readonly costUsd: number | null;
  readonly tokensPerMessage: number | null;
  readonly outputInputRatio: number | null;
}

export interface AnalyticsWindowBar {
  label: string;
  start: string;
  end: string;
  sessions: number;
  toolCalls: number;
  totalTokens: number;
  costUsd: number | null;
  byAgent: Record<AnalyticsAgent, number>;
}

export interface AnalyticsCumulativePoint {
  readonly date: string;
  readonly totalTokens: number;
  readonly costUsd: number | null;
}

export interface AnalyticsDailyBar {
  date: string;
  sessions: number;
  toolCalls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number | null;
  byAgent: Record<AnalyticsAgent, number>;
  byAgentTokens: Record<AnalyticsAgent, AnalyticsTokenBreakdown>;
}

export interface AnalyticsSessionPulse {
  readonly agent: AnalyticsAgent;
  readonly providerSessionId: string;
  readonly cwd: string | null;
  readonly model: string | null;
  readonly startedAt: string;
  readonly lastActivityAt: string;
  readonly messageCount: number;
  readonly totalTokens: number;
  readonly toolCalls: number;
}

interface SessionRow {
  readonly agent: AnalyticsAgent;
  readonly provider_session_id: string;
  readonly cwd: string | null;
  readonly model: string | null;
  readonly started_at: string;
  readonly last_activity_at: string;
  readonly message_count: number;
}

interface SessionListRow extends SessionRow {
  readonly duration_seconds: number | string | null;
  readonly total_count: number | string | null;
}

interface UsageRow {
  readonly agent: AnalyticsAgent;
  readonly provider_session_id: string;
  readonly input_tokens: number | string | null;
  readonly output_tokens: number | string | null;
  readonly cache_creation_input_tokens: number | string | null;
  readonly cache_read_input_tokens: number | string | null;
  readonly cached_input_tokens: number | string | null;
  readonly total_tokens: number | string | null;
  readonly cost_usd: number | string | null;
  readonly event_at: string;
}

interface NormalizedUsage {
  readonly agent: AnalyticsAgent;
  readonly providerSessionId: string;
  readonly eventAt: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheCreationInputTokens: number;
  readonly cacheReadInputTokens: number;
  readonly cachedInputTokens: number;
  readonly totalTokens: number;
  readonly effectiveTokens: number;
  readonly costUsd: number | string | null;
}

interface ToolRow {
  readonly agent: AnalyticsAgent;
  readonly provider_session_id: string;
  readonly tool_name?: string;
  readonly started_at: string;
}

interface UserMessageRow {
  readonly agent: AnalyticsAgent;
  readonly provider_session_id: string;
  readonly content: string;
  readonly created_at: string;
}

const AGENTS: readonly AnalyticsAgent[] = ['claude', 'codex'];

function realUserMessageExistsSql(sessionAlias: string, dateParam = '$1'): string {
  return `EXISTS (
    SELECT 1 FROM remote_agent_agent_user_messages m
    WHERE m.agent = ${sessionAlias}.agent
      AND m.provider_session_id = ${sessionAlias}.provider_session_id
      AND m.created_at >= ${dateParam}
      AND m.content NOT LIKE '<task-notification>%'
      AND m.content NOT LIKE '<command-message>%'
      AND m.content NOT LIKE '<command-name>%'
      AND m.content NOT LIKE '<local-command-%'
      AND m.content NOT LIKE '<system-reminder>%'
      AND m.content NOT LIKE '# Archon Orchestrator%'
      AND m.content NOT LIKE 'Generate a concise conversation title%'
      AND m.content NOT LIKE 'This session is being continued from a previous conversation%'
      AND m.content NOT LIKE 'Caveat: The messages below were generated by the user while running local commands%'
  )`;
}

function emptyTotals(): AnalyticsAgentTotals {
  return {
    sessions: 0,
    toolCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    cachedInputTokens: 0,
    totalTokens: 0,
    costUsd: null,
  };
}

function emptyTokenBreakdown(): AnalyticsTokenBreakdown {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    cachedInputTokens: 0,
    effectiveTokens: 0,
  };
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function addCost(existing: number | null, next: number | string | null | undefined): number | null {
  if (next === null || next === undefined) return existing;
  return (existing ?? 0) + toNumber(next);
}

function effectiveTokenCount(usage: {
  readonly agent: AnalyticsAgent;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheCreationInputTokens: number;
  readonly cachedInputTokens: number;
}): number {
  if (usage.agent === 'codex') {
    return Math.max(0, usage.inputTokens - usage.cachedInputTokens) + usage.outputTokens;
  }
  return usage.inputTokens + usage.outputTokens;
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function startOfDay(value: Date): Date {
  const result = new Date(value);
  result.setHours(0, 0, 0, 0);
  return result;
}

function startOfWeek(value: Date): Date {
  const result = startOfDay(value);
  const day = result.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + mondayOffset);
  return result;
}

function addDays(value: Date, days: number): Date {
  const result = new Date(value);
  result.setDate(result.getDate() + days);
  return result;
}

function isAnalyticsAgent(value: string): value is AnalyticsAgent {
  return value === 'claude' || value === 'codex';
}

function normalizeUsageRows(rows: readonly UsageRow[]): NormalizedUsage[] {
  const normalized: NormalizedUsage[] = [];
  const seenCodexSnapshots = new Set<string>();

  for (const row of rows) {
    if (!isAnalyticsAgent(row.agent)) continue;

    const inputTokens = toNumber(row.input_tokens);
    const outputTokens = toNumber(row.output_tokens);
    const cacheCreationInputTokens = toNumber(row.cache_creation_input_tokens);
    const cacheReadInputTokens = toNumber(row.cache_read_input_tokens);
    const cachedInputTokens = toNumber(row.cached_input_tokens);
    const totalTokens = toNumber(row.total_tokens);
    const effectiveTokens = effectiveTokenCount({
      agent: row.agent,
      inputTokens,
      outputTokens,
      cacheCreationInputTokens,
      cachedInputTokens,
    });

    if (row.agent === 'codex') {
      const snapshotKey = [
        row.provider_session_id,
        inputTokens,
        outputTokens,
        cacheCreationInputTokens,
        cacheReadInputTokens,
        cachedInputTokens,
        totalTokens,
      ].join(':');
      if (seenCodexSnapshots.has(snapshotKey)) continue;
      seenCodexSnapshots.add(snapshotKey);
    }

    normalized.push({
      agent: row.agent,
      providerSessionId: row.provider_session_id,
      eventAt: row.event_at,
      inputTokens,
      outputTokens,
      cacheCreationInputTokens,
      cacheReadInputTokens,
      cachedInputTokens,
      totalTokens,
      effectiveTokens,
      costUsd: row.cost_usd,
    });
  }

  return normalized;
}

export async function ensureAnalyticsTables(): Promise<void> {
  const db = getDatabase();
  if (db.dialect === 'postgres') {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS remote_agent_agent_sessions (
        id TEXT PRIMARY KEY,
        agent TEXT NOT NULL CHECK (agent IN ('claude', 'codex')),
        provider_session_id TEXT NOT NULL,
        source_file TEXT NOT NULL,
        cwd TEXT,
        model TEXT,
        started_at TIMESTAMP NOT NULL,
        ended_at TIMESTAMP,
        last_activity_at TIMESTAMP NOT NULL,
        message_count INTEGER NOT NULL DEFAULT 0,
        raw_event TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(agent, provider_session_id)
      );

      CREATE TABLE IF NOT EXISTS remote_agent_agent_tool_calls (
        id TEXT PRIMARY KEY,
        agent TEXT NOT NULL CHECK (agent IN ('claude', 'codex')),
        provider_session_id TEXT NOT NULL,
        tool_call_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        status TEXT,
        started_at TIMESTAMP NOT NULL,
        source_file TEXT NOT NULL,
        source_line INTEGER NOT NULL,
        raw_event TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(agent, source_file, source_line, tool_call_id)
      );

      CREATE TABLE IF NOT EXISTS remote_agent_agent_token_usage (
        id TEXT PRIMARY KEY,
        agent TEXT NOT NULL CHECK (agent IN ('claude', 'codex')),
        provider_session_id TEXT NOT NULL,
        model TEXT,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cache_creation_input_tokens INTEGER NOT NULL DEFAULT 0,
        cache_read_input_tokens INTEGER NOT NULL DEFAULT 0,
        cached_input_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        cost_usd DOUBLE PRECISION,
        event_at TIMESTAMP NOT NULL,
        source_file TEXT NOT NULL,
        source_line INTEGER NOT NULL,
        raw_event TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(agent, source_file, source_line)
      );

      CREATE TABLE IF NOT EXISTS remote_agent_agent_user_messages (
        id TEXT PRIMARY KEY,
        agent TEXT NOT NULL CHECK (agent IN ('claude', 'codex')),
        provider_session_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL,
        source_file TEXT NOT NULL,
        source_line INTEGER NOT NULL,
        raw_event TEXT,
        inserted_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(agent, source_file, source_line, message_id)
      );

      CREATE TABLE IF NOT EXISTS remote_agent_agent_source_files (
        id TEXT PRIMARY KEY,
        agent TEXT NOT NULL CHECK (agent IN ('claude', 'codex')),
        source_file TEXT NOT NULL,
        size_bytes BIGINT NOT NULL,
        mtime_ms BIGINT NOT NULL,
        scanned_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(agent, source_file)
      );
    `);
  } else {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS remote_agent_agent_sessions (
        id TEXT PRIMARY KEY,
        agent TEXT NOT NULL CHECK (agent IN ('claude', 'codex')),
        provider_session_id TEXT NOT NULL,
        source_file TEXT NOT NULL,
        cwd TEXT,
        model TEXT,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        last_activity_at TEXT NOT NULL,
        message_count INTEGER NOT NULL DEFAULT 0,
        raw_event TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(agent, provider_session_id)
      );

      CREATE TABLE IF NOT EXISTS remote_agent_agent_tool_calls (
        id TEXT PRIMARY KEY,
        agent TEXT NOT NULL CHECK (agent IN ('claude', 'codex')),
        provider_session_id TEXT NOT NULL,
        tool_call_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        status TEXT,
        started_at TEXT NOT NULL,
        source_file TEXT NOT NULL,
        source_line INTEGER NOT NULL,
        raw_event TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(agent, source_file, source_line, tool_call_id)
      );

      CREATE TABLE IF NOT EXISTS remote_agent_agent_token_usage (
        id TEXT PRIMARY KEY,
        agent TEXT NOT NULL CHECK (agent IN ('claude', 'codex')),
        provider_session_id TEXT NOT NULL,
        model TEXT,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cache_creation_input_tokens INTEGER NOT NULL DEFAULT 0,
        cache_read_input_tokens INTEGER NOT NULL DEFAULT 0,
        cached_input_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL,
        event_at TEXT NOT NULL,
        source_file TEXT NOT NULL,
        source_line INTEGER NOT NULL,
        raw_event TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(agent, source_file, source_line)
      );

      CREATE TABLE IF NOT EXISTS remote_agent_agent_user_messages (
        id TEXT PRIMARY KEY,
        agent TEXT NOT NULL CHECK (agent IN ('claude', 'codex')),
        provider_session_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        source_file TEXT NOT NULL,
        source_line INTEGER NOT NULL,
        raw_event TEXT,
        inserted_at TEXT DEFAULT (datetime('now')),
        UNIQUE(agent, source_file, source_line, message_id)
      );

      CREATE TABLE IF NOT EXISTS remote_agent_agent_source_files (
        id TEXT PRIMARY KEY,
        agent TEXT NOT NULL CHECK (agent IN ('claude', 'codex')),
        source_file TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        mtime_ms INTEGER NOT NULL,
        scanned_at TEXT DEFAULT (datetime('now')),
        UNIQUE(agent, source_file)
      );
    `);
  }

  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_agent_sessions_activity ON remote_agent_agent_sessions(last_activity_at)'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_agent_sessions_agent ON remote_agent_agent_sessions(agent)'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_agent_tool_calls_session ON remote_agent_agent_tool_calls(agent, provider_session_id)'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_agent_tool_calls_started ON remote_agent_agent_tool_calls(started_at)'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_agent_token_usage_event ON remote_agent_agent_token_usage(event_at)'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_agent_token_usage_session ON remote_agent_agent_token_usage(agent, provider_session_id)'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_agent_user_messages_session ON remote_agent_agent_user_messages(agent, provider_session_id)'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_agent_user_messages_created ON remote_agent_agent_user_messages(created_at)'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_agent_source_files_agent ON remote_agent_agent_source_files(agent)'
  );
}

export async function listAnalyticsSourceFileStates(): Promise<
  readonly AnalyticsSourceFileState[]
> {
  await ensureAnalyticsTables();

  const result = await pool.query<{
    agent: AnalyticsAgent;
    source_file: string;
    size_bytes: number | string;
    mtime_ms: number | string;
  }>(
    `SELECT agent, source_file, size_bytes, mtime_ms
     FROM remote_agent_agent_source_files`
  );

  return result.rows
    .filter(row => isAnalyticsAgent(row.agent))
    .map(row => ({
      agent: row.agent,
      sourceFile: row.source_file,
      sizeBytes: Number(row.size_bytes),
      mtimeMs: Number(row.mtime_ms),
    }));
}

export async function upsertAnalyticsBatch(batch: AnalyticsSyncBatch): Promise<void> {
  await ensureAnalyticsTables();

  await getDatabase().withTransaction(async query => {
    for (const session of batch.sessions) {
      await query(
        `INSERT INTO remote_agent_agent_sessions
          (id, agent, provider_session_id, source_file, cwd, model, started_at, ended_at, last_activity_at, message_count, raw_event)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT(agent, provider_session_id) DO UPDATE SET
          source_file = excluded.source_file,
          cwd = COALESCE(excluded.cwd, remote_agent_agent_sessions.cwd),
          model = COALESCE(excluded.model, remote_agent_agent_sessions.model),
          started_at = excluded.started_at,
          ended_at = COALESCE(excluded.ended_at, remote_agent_agent_sessions.ended_at),
          last_activity_at = excluded.last_activity_at,
          message_count = excluded.message_count,
          raw_event = COALESCE(excluded.raw_event, remote_agent_agent_sessions.raw_event),
          updated_at = CURRENT_TIMESTAMP`,
        [
          crypto.randomUUID(),
          session.agent,
          session.providerSessionId,
          session.sourceFile,
          session.cwd ?? null,
          session.model ?? null,
          session.startedAt,
          session.endedAt ?? null,
          session.lastActivityAt,
          session.messageCount,
          session.rawEvent ?? null,
        ]
      );
    }

    for (const toolCall of batch.toolCalls) {
      await query(
        `INSERT INTO remote_agent_agent_tool_calls
          (id, agent, provider_session_id, tool_call_id, tool_name, status, started_at, source_file, source_line, raw_event)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT(agent, source_file, source_line, tool_call_id) DO UPDATE SET
          provider_session_id = excluded.provider_session_id,
          tool_name = excluded.tool_name,
          status = COALESCE(excluded.status, remote_agent_agent_tool_calls.status),
          started_at = excluded.started_at,
          raw_event = COALESCE(excluded.raw_event, remote_agent_agent_tool_calls.raw_event)`,
        [
          crypto.randomUUID(),
          toolCall.agent,
          toolCall.providerSessionId,
          toolCall.toolCallId,
          toolCall.toolName,
          toolCall.status ?? null,
          toolCall.startedAt,
          toolCall.sourceFile,
          toolCall.sourceLine,
          toolCall.rawEvent ?? null,
        ]
      );
    }

    for (const usage of batch.tokenUsages) {
      await query(
        `INSERT INTO remote_agent_agent_token_usage
          (id, agent, provider_session_id, model, input_tokens, output_tokens, cache_creation_input_tokens,
           cache_read_input_tokens, cached_input_tokens, total_tokens, cost_usd, event_at, source_file, source_line, raw_event)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         ON CONFLICT(agent, source_file, source_line) DO UPDATE SET
          provider_session_id = excluded.provider_session_id,
          model = COALESCE(excluded.model, remote_agent_agent_token_usage.model),
          input_tokens = excluded.input_tokens,
          output_tokens = excluded.output_tokens,
          cache_creation_input_tokens = excluded.cache_creation_input_tokens,
          cache_read_input_tokens = excluded.cache_read_input_tokens,
          cached_input_tokens = excluded.cached_input_tokens,
          total_tokens = excluded.total_tokens,
          cost_usd = COALESCE(excluded.cost_usd, remote_agent_agent_token_usage.cost_usd),
          event_at = excluded.event_at,
          raw_event = COALESCE(excluded.raw_event, remote_agent_agent_token_usage.raw_event)`,
        [
          crypto.randomUUID(),
          usage.agent,
          usage.providerSessionId,
          usage.model ?? null,
          usage.inputTokens,
          usage.outputTokens,
          usage.cacheCreationInputTokens,
          usage.cacheReadInputTokens,
          usage.cachedInputTokens,
          usage.totalTokens,
          usage.costUsd ?? null,
          usage.eventAt,
          usage.sourceFile,
          usage.sourceLine,
          usage.rawEvent ?? null,
        ]
      );
    }

    const scannedSourceFiles = [...new Set(batch.scannedSourceFiles)];
    for (const sourceFile of scannedSourceFiles) {
      await query('DELETE FROM remote_agent_agent_user_messages WHERE source_file = $1', [
        sourceFile,
      ]);
    }

    for (const message of batch.userMessages) {
      await query(
        `INSERT INTO remote_agent_agent_user_messages
          (id, agent, provider_session_id, message_id, content, created_at, source_file, source_line, raw_event)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT(agent, source_file, source_line, message_id) DO UPDATE SET
          provider_session_id = excluded.provider_session_id,
          content = excluded.content,
          created_at = excluded.created_at,
          raw_event = COALESCE(excluded.raw_event, remote_agent_agent_user_messages.raw_event)`,
        [
          crypto.randomUUID(),
          message.agent,
          message.providerSessionId,
          message.messageId,
          message.content,
          message.createdAt,
          message.sourceFile,
          message.sourceLine,
          message.rawEvent ?? null,
        ]
      );
    }

    for (const sourceFile of batch.sourceFiles) {
      await query(
        `INSERT INTO remote_agent_agent_source_files
          (id, agent, source_file, size_bytes, mtime_ms)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT(agent, source_file) DO UPDATE SET
          size_bytes = excluded.size_bytes,
          mtime_ms = excluded.mtime_ms,
          scanned_at = CURRENT_TIMESTAMP`,
        [
          crypto.randomUUID(),
          sourceFile.agent,
          sourceFile.sourceFile,
          sourceFile.sizeBytes,
          sourceFile.mtimeMs,
        ]
      );
    }
  });
}

export async function getAnalyticsSummary(days = 30): Promise<AnalyticsSummary> {
  await ensureAnalyticsTables();

  const now = new Date();
  const today = startOfDay(now);
  const clampedDays = Math.max(1, Math.min(days, 90));
  const start = addDays(today, -(clampedDays - 1));
  const startIso = start.toISOString();
  const weekStart = startOfWeek(today);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const [sessionResult, usageResult, toolResult] = await Promise.all([
    pool.query<SessionRow>(
      `SELECT agent, provider_session_id, cwd, model, started_at, last_activity_at, message_count
       FROM remote_agent_agent_sessions s
       WHERE s.last_activity_at >= $1
         AND ${realUserMessageExistsSql('s')}
       ORDER BY last_activity_at DESC`,
      [startIso]
    ),
    pool.query<UsageRow>(
      `SELECT u.agent, u.provider_session_id, u.input_tokens, u.output_tokens,
              u.cache_creation_input_tokens, u.cache_read_input_tokens, u.cached_input_tokens,
              u.total_tokens, u.cost_usd, u.event_at
       FROM remote_agent_agent_token_usage u
       WHERE u.event_at >= $1
         AND ${realUserMessageExistsSql('u')}
       ORDER BY u.event_at ASC`,
      [startIso]
    ),
    pool.query<ToolRow>(
      `SELECT t.agent, t.provider_session_id, t.started_at
       FROM remote_agent_agent_tool_calls t
       WHERE t.started_at >= $1
         AND ${realUserMessageExistsSql('t')}
       ORDER BY t.started_at ASC`,
      [startIso]
    ),
  ]);

  const byAgent: Record<AnalyticsAgent, AnalyticsAgentTotals> = {
    claude: emptyTotals(),
    codex: emptyTotals(),
  };
  const totals = emptyTotals();
  const daily = new Map<string, AnalyticsDailyBar>();
  const sessionKeysByDate = new Map<string, Set<string>>();
  const toolCountsBySession = new Map<string, number>();
  const tokenCountsBySession = new Map<string, number>();
  const billableTokenCountsBySession = new Map<string, number>();
  const normalizedUsages = normalizeUsageRows(usageResult.rows);

  for (let index = 0; index < clampedDays; index += 1) {
    const date = isoDate(addDays(start, index));
    daily.set(date, {
      date,
      sessions: 0,
      toolCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costUsd: null,
      byAgent: { claude: 0, codex: 0 },
      byAgentTokens: { claude: emptyTokenBreakdown(), codex: emptyTokenBreakdown() },
    });
    sessionKeysByDate.set(date, new Set());
  }

  for (const session of sessionResult.rows) {
    if (!isAnalyticsAgent(session.agent)) continue;
    totals.sessions += 1;
    byAgent[session.agent].sessions += 1;
    const date = isoDate(new Date(session.last_activity_at));
    const daySet = sessionKeysByDate.get(date);
    if (daySet) {
      daySet.add(`${session.agent}:${session.provider_session_id}`);
    }
  }

  for (const toolCall of toolResult.rows) {
    if (!isAnalyticsAgent(toolCall.agent)) continue;
    totals.toolCalls += 1;
    byAgent[toolCall.agent].toolCalls += 1;
    const key = `${toolCall.agent}:${toolCall.provider_session_id}`;
    toolCountsBySession.set(key, (toolCountsBySession.get(key) ?? 0) + 1);
    const day = daily.get(isoDate(new Date(toolCall.started_at)));
    if (day) {
      day.toolCalls += 1;
      day.byAgent[toolCall.agent] += 1;
    }
  }

  for (const usage of normalizedUsages) {
    const inputTokens =
      usage.agent === 'codex'
        ? Math.max(0, usage.inputTokens - usage.cachedInputTokens)
        : usage.inputTokens;
    const outputTokens = usage.outputTokens;
    const cacheCreationInputTokens = usage.cacheCreationInputTokens;
    const cacheReadInputTokens = usage.cacheReadInputTokens;
    const cachedInputTokens = usage.cachedInputTokens;
    const totalTokens = usage.effectiveTokens;

    totals.inputTokens += inputTokens;
    totals.outputTokens += outputTokens;
    totals.cacheCreationInputTokens += cacheCreationInputTokens;
    totals.cacheReadInputTokens += cacheReadInputTokens;
    totals.cachedInputTokens += cachedInputTokens;
    totals.totalTokens += totalTokens;
    totals.costUsd = addCost(totals.costUsd, usage.costUsd);

    const agentTotals = byAgent[usage.agent];
    agentTotals.inputTokens += inputTokens;
    agentTotals.outputTokens += outputTokens;
    agentTotals.cacheCreationInputTokens += cacheCreationInputTokens;
    agentTotals.cacheReadInputTokens += cacheReadInputTokens;
    agentTotals.cachedInputTokens += cachedInputTokens;
    agentTotals.totalTokens += totalTokens;
    agentTotals.costUsd = addCost(agentTotals.costUsd, usage.costUsd);

    const sessionKey = `${usage.agent}:${usage.providerSessionId}`;
    tokenCountsBySession.set(sessionKey, (tokenCountsBySession.get(sessionKey) ?? 0) + totalTokens);
    billableTokenCountsBySession.set(
      sessionKey,
      (billableTokenCountsBySession.get(sessionKey) ?? 0) + totalTokens
    );

    const day = daily.get(isoDate(new Date(usage.eventAt)));
    if (day) {
      day.inputTokens += inputTokens;
      day.outputTokens += outputTokens;
      day.totalTokens += totalTokens;
      day.costUsd = addCost(day.costUsd, usage.costUsd);
      day.byAgent[usage.agent] += totalTokens;
      const agentDay = day.byAgentTokens[usage.agent];
      agentDay.inputTokens += inputTokens;
      agentDay.outputTokens += outputTokens;
      agentDay.cacheCreationInputTokens += cacheCreationInputTokens;
      agentDay.cacheReadInputTokens += cacheReadInputTokens;
      agentDay.cachedInputTokens += cachedInputTokens;
      agentDay.effectiveTokens += totalTokens;
    }
  }

  const dailyBars = [...daily.values()].map(day => ({
    ...day,
    sessions: sessionKeysByDate.get(day.date)?.size ?? 0,
  }));

  let cumulativeTokens = 0;
  let cumulativeCost: number | null = null;
  const cumulativeSeries = dailyBars.map(day => {
    cumulativeTokens += day.totalTokens;
    cumulativeCost = day.costUsd === null ? cumulativeCost : (cumulativeCost ?? 0) + day.costUsd;
    return { date: day.date, totalTokens: cumulativeTokens, costUsd: cumulativeCost };
  });

  const windowBars = buildWindowBars(dailyBars);
  const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const monthDaysElapsed = Math.max(1, today.getDate());
  const daysInMonth = Math.max(
    1,
    Math.round((nextMonthStart.getTime() - monthStart.getTime()) / 86400000)
  );
  const currentMonthRows = normalizedUsages.filter(row => new Date(row.eventAt) >= monthStart);
  const currentMonthTokens = currentMonthRows.reduce((sum, row) => sum + row.effectiveTokens, 0);
  const currentMonthCost = currentMonthRows.reduce<number | null>(
    (sum, row) => addCost(sum, row.costUsd),
    null
  );

  const recentSessionPulse = buildRecentSessionPulse(
    sessionResult.rows,
    tokenCountsBySession,
    billableTokenCountsBySession,
    toolCountsBySession
  );

  return {
    generatedAt: now.toISOString(),
    periods: [
      buildPeriodUsage(
        'week',
        'Current week',
        weekStart,
        now,
        normalizedUsages,
        sessionResult.rows,
        toolResult.rows
      ),
      buildPeriodUsage(
        'month',
        'Current month',
        monthStart,
        now,
        normalizedUsages,
        sessionResult.rows,
        toolResult.rows
      ),
    ],
    totals: { ...totals, byAgent },
    windowBars,
    cumulativeSeries,
    dailyBars,
    forecast: {
      projectedMonthTokens: Math.round((currentMonthTokens / monthDaysElapsed) * daysInMonth),
      projectedMonthCostUsd:
        currentMonthCost === null ? null : (currentMonthCost / monthDaysElapsed) * daysInMonth,
      resetAt: nextMonthStart.toISOString(),
      daysRemaining: Math.max(0, daysInMonth - monthDaysElapsed),
    },
    recentSessionPulse,
  };
}

export async function listAnalyticsSessions(
  period: 'week' | 'month' = 'week',
  limit = 10,
  offset = 0
): Promise<AnalyticsSessionList> {
  await ensureAnalyticsTables();

  const now = new Date();
  const start =
    period === 'month' ? new Date(now.getFullYear(), now.getMonth(), 1) : startOfWeek(now);
  const startIso = start.toISOString();
  const clampedLimit = Math.max(1, Math.min(limit, 50));
  const clampedOffset = Math.max(0, offset);
  const db = getDatabase();
  const durationExpr =
    db.dialect === 'postgres'
      ? 'EXTRACT(EPOCH FROM (s.last_activity_at::timestamp - s.started_at::timestamp))'
      : '(julianday(s.last_activity_at) - julianday(s.started_at)) * 86400';

  const [sessionResult, usageResult, toolResult, messageResult] = await Promise.all([
    pool.query<SessionListRow>(
      `SELECT s.agent, s.provider_session_id, s.cwd, s.model, s.started_at, s.last_activity_at, s.message_count,
              ${durationExpr} AS duration_seconds,
              COUNT(*) OVER() AS total_count
       FROM remote_agent_agent_sessions s
       WHERE s.last_activity_at >= $1
         AND ${realUserMessageExistsSql('s')}
       ORDER BY s.last_activity_at DESC
       LIMIT $2 OFFSET $3`,
      [startIso, clampedLimit, clampedOffset]
    ),
    pool.query<UsageRow>(
      `SELECT agent, provider_session_id, input_tokens, output_tokens, cache_creation_input_tokens,
              cache_read_input_tokens, cached_input_tokens, total_tokens, cost_usd, event_at
       FROM remote_agent_agent_token_usage
       WHERE event_at >= $1`,
      [startIso]
    ),
    pool.query<ToolRow>(
      `SELECT agent, provider_session_id, tool_name, started_at
       FROM remote_agent_agent_tool_calls
       WHERE started_at >= $1`,
      [startIso]
    ),
    pool.query<UserMessageRow>(
      `SELECT agent, provider_session_id, content, created_at
       FROM remote_agent_agent_user_messages
       WHERE created_at >= $1
       ORDER BY created_at ASC`,
      [startIso]
    ),
  ]);

  const normalizedUsages = normalizeUsageRows(usageResult.rows);
  const usageBySession = new Map<string, AnalyticsTokenBreakdown & { costUsd: number | null }>();
  const toolsBySession = new Map<string, Set<string>>();
  const toolCountsBySession = new Map<string, number>();
  const messagesBySession = new Map<string, string[]>();
  const messageCountsBySession = new Map<string, number>();

  for (const usage of normalizedUsages) {
    const key = `${usage.agent}:${usage.providerSessionId}`;
    const existing = usageBySession.get(key) ?? {
      ...emptyTokenBreakdown(),
      costUsd: null,
    };
    const inputTokens =
      usage.agent === 'codex'
        ? Math.max(0, usage.inputTokens - usage.cachedInputTokens)
        : usage.inputTokens;
    existing.inputTokens += inputTokens;
    existing.outputTokens += usage.outputTokens;
    existing.cacheCreationInputTokens += usage.cacheCreationInputTokens;
    existing.cacheReadInputTokens += usage.cacheReadInputTokens;
    existing.cachedInputTokens += usage.cachedInputTokens;
    existing.effectiveTokens += usage.effectiveTokens;
    existing.costUsd = addCost(existing.costUsd, usage.costUsd);
    usageBySession.set(key, existing);
  }

  for (const tool of toolResult.rows) {
    if (!isAnalyticsAgent(tool.agent)) continue;
    const key = `${tool.agent}:${tool.provider_session_id}`;
    toolCountsBySession.set(key, (toolCountsBySession.get(key) ?? 0) + 1);
    if (tool.tool_name) {
      const names = toolsBySession.get(key) ?? new Set<string>();
      names.add(tool.tool_name);
      toolsBySession.set(key, names);
    }
  }

  for (const message of messageResult.rows) {
    if (!isAnalyticsAgent(message.agent)) continue;
    if (isSyntheticMessageContent(message.content)) continue;
    const key = `${message.agent}:${message.provider_session_id}`;
    messageCountsBySession.set(key, (messageCountsBySession.get(key) ?? 0) + 1);
    const messages = messagesBySession.get(key) ?? [];
    if (messages.length < 5) messages.push(message.content);
    messagesBySession.set(key, messages);
  }

  const sessions = sessionResult.rows
    .filter(row => isAnalyticsAgent(row.agent))
    .map(row => {
      const key = `${row.agent}:${row.provider_session_id}`;
      const usage = usageBySession.get(key) ?? { ...emptyTokenBreakdown(), costUsd: null };
      const inputTokens = usage.inputTokens;
      const outputTokens = usage.outputTokens;
      const effectiveTokens = usage.effectiveTokens;
      const messageCount = messageCountsBySession.get(key) ?? toNumber(row.message_count);
      return {
        agent: row.agent,
        providerSessionId: row.provider_session_id,
        cwd: row.cwd,
        model: row.model,
        startedAt: row.started_at,
        lastActivityAt: row.last_activity_at,
        durationSeconds: Math.max(0, Math.round(toNumber(row.duration_seconds))),
        messageCount,
        userMessages: messagesBySession.get(key) ?? [],
        toolCalls: toolCountsBySession.get(key) ?? 0,
        tools: [...(toolsBySession.get(key) ?? new Set<string>())].sort().slice(0, 8),
        inputTokens,
        outputTokens,
        cacheCreationInputTokens: usage.cacheCreationInputTokens,
        cacheReadInputTokens: usage.cacheReadInputTokens,
        cachedInputTokens: usage.cachedInputTokens,
        totalTokens: effectiveTokens,
        effectiveTokens,
        costUsd: usage.costUsd,
        tokensPerMessage: messageCount > 0 ? Math.round(effectiveTokens / messageCount) : null,
        outputInputRatio: inputTokens > 0 ? outputTokens / inputTokens : null,
      };
    });

  return {
    generatedAt: now.toISOString(),
    period,
    start: startIso,
    end: now.toISOString(),
    limit: clampedLimit,
    offset: clampedOffset,
    total: toNumber(sessionResult.rows[0]?.total_count),
    sessions,
  };
}

function isSyntheticMessageContent(content: string): boolean {
  const trimmed = content.trim();
  return (
    trimmed.startsWith('<task-notification>') ||
    trimmed.startsWith('<command-message>') ||
    trimmed.startsWith('<command-name>') ||
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

function buildRecentSessionPulse(
  sessions: readonly SessionRow[],
  tokenCountsBySession: ReadonlyMap<string, number>,
  billableTokenCountsBySession: ReadonlyMap<string, number>,
  toolCountsBySession: ReadonlyMap<string, number>
): AnalyticsSessionPulse[] {
  const byAgent: Record<AnalyticsAgent, SessionRow[]> = { claude: [], codex: [] };
  for (const session of sessions) {
    if (isAnalyticsAgent(session.agent)) {
      byAgent[session.agent].push(session);
    }
  }

  const selected: SessionRow[] = [];
  const seen = new Set<string>();
  for (let index = 0; selected.length < 12; index += 1) {
    let added = false;
    for (const agent of AGENTS) {
      const session = byAgent[agent][index];
      if (!session) continue;
      const key = `${session.agent}:${session.provider_session_id}`;
      if (seen.has(key)) continue;
      selected.push(session);
      seen.add(key);
      added = true;
      if (selected.length >= 12) break;
    }
    if (!added) break;
  }

  selected.sort(
    (left, right) =>
      new Date(right.last_activity_at).getTime() - new Date(left.last_activity_at).getTime()
  );

  return selected.map(session => {
    const key = `${session.agent}:${session.provider_session_id}`;
    const billableTokens = billableTokenCountsBySession.get(key) ?? 0;
    return {
      agent: session.agent,
      providerSessionId: session.provider_session_id,
      cwd: session.cwd,
      model: session.model,
      startedAt: session.started_at,
      lastActivityAt: session.last_activity_at,
      messageCount: toNumber(session.message_count),
      totalTokens: billableTokens > 0 ? billableTokens : (tokenCountsBySession.get(key) ?? 0),
      toolCalls: toolCountsBySession.get(key) ?? 0,
    };
  });
}

function buildPeriodUsage(
  key: 'week' | 'month',
  label: string,
  start: Date,
  end: Date,
  usages: readonly NormalizedUsage[],
  sessions: readonly SessionRow[],
  tools: readonly ToolRow[]
): AnalyticsPeriodUsage {
  const startTime = start.getTime();
  const endTime = end.getTime();
  const byAgent: Record<AnalyticsAgent, AnalyticsAgentTotals> = {
    claude: emptyTotals(),
    codex: emptyTotals(),
  };
  const totals = emptyTotals();

  for (const session of sessions) {
    if (!isAnalyticsAgent(session.agent)) continue;
    const activity = new Date(session.last_activity_at).getTime();
    if (activity < startTime || activity > endTime) continue;
    totals.sessions += 1;
    byAgent[session.agent].sessions += 1;
  }

  for (const tool of tools) {
    if (!isAnalyticsAgent(tool.agent)) continue;
    const activity = new Date(tool.started_at).getTime();
    if (activity < startTime || activity > endTime) continue;
    totals.toolCalls += 1;
    byAgent[tool.agent].toolCalls += 1;
  }

  for (const usage of usages) {
    const activity = new Date(usage.eventAt).getTime();
    if (activity < startTime || activity > endTime) continue;
    const inputTokens =
      usage.agent === 'codex'
        ? Math.max(0, usage.inputTokens - usage.cachedInputTokens)
        : usage.inputTokens;
    const agentTotals = byAgent[usage.agent];
    for (const target of [totals, agentTotals]) {
      target.inputTokens += inputTokens;
      target.outputTokens += usage.outputTokens;
      target.cacheCreationInputTokens += usage.cacheCreationInputTokens;
      target.cacheReadInputTokens += usage.cacheReadInputTokens;
      target.cachedInputTokens += usage.cachedInputTokens;
      target.totalTokens += usage.effectiveTokens;
      target.costUsd = addCost(target.costUsd, usage.costUsd);
    }
  }

  return {
    key,
    label,
    start: start.toISOString(),
    end: end.toISOString(),
    totals: { ...totals, byAgent },
  };
}

function buildWindowBars(dailyBars: readonly AnalyticsDailyBar[]): AnalyticsWindowBar[] {
  const windows: AnalyticsWindowBar[] = [];
  for (let index = 0; index < dailyBars.length; index += 7) {
    const days = dailyBars.slice(index, index + 7);
    if (days.length === 0) continue;
    const aggregate: AnalyticsWindowBar = {
      label: `${days[0]?.date ?? ''}..${days[days.length - 1]?.date ?? ''}`,
      start: days[0]?.date ?? '',
      end: days[days.length - 1]?.date ?? '',
      sessions: 0,
      toolCalls: 0,
      totalTokens: 0,
      costUsd: null,
      byAgent: { claude: 0, codex: 0 },
    };
    for (const day of days) {
      aggregate.sessions += day.sessions;
      aggregate.toolCalls += day.toolCalls;
      aggregate.totalTokens += day.totalTokens;
      aggregate.costUsd = addCost(aggregate.costUsd, day.costUsd);
      for (const agent of AGENTS) {
        aggregate.byAgent[agent] += day.byAgent[agent];
      }
    }
    windows.push(aggregate);
  }
  return windows;
}
