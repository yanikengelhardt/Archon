/**
 * Zod schemas for analytics API endpoints.
 */
import { z } from '@hono/zod-openapi';

export const analyticsAgentTotalsSchema = z.object({
  sessions: z.number(),
  toolCalls: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheCreationInputTokens: z.number(),
  cacheReadInputTokens: z.number(),
  cachedInputTokens: z.number(),
  totalTokens: z.number(),
  costUsd: z.number().nullable(),
});

export const analyticsSummarySchema = z
  .object({
    generatedAt: z.string(),
    periods: z.array(
      z.object({
        key: z.enum(['week', 'month']),
        label: z.string(),
        start: z.string(),
        end: z.string(),
        totals: analyticsAgentTotalsSchema.extend({
          byAgent: z.object({
            claude: analyticsAgentTotalsSchema,
            codex: analyticsAgentTotalsSchema,
          }),
        }),
      })
    ),
    totals: analyticsAgentTotalsSchema.extend({
      byAgent: z.object({
        claude: analyticsAgentTotalsSchema,
        codex: analyticsAgentTotalsSchema,
      }),
    }),
    windowBars: z.array(
      z.object({
        label: z.string(),
        start: z.string(),
        end: z.string(),
        sessions: z.number(),
        toolCalls: z.number(),
        totalTokens: z.number(),
        costUsd: z.number().nullable(),
        byAgent: z.object({ claude: z.number(), codex: z.number() }),
      })
    ),
    cumulativeSeries: z.array(
      z.object({
        date: z.string(),
        totalTokens: z.number(),
        costUsd: z.number().nullable(),
      })
    ),
    dailyBars: z.array(
      z.object({
        date: z.string(),
        sessions: z.number(),
        toolCalls: z.number(),
        inputTokens: z.number(),
        outputTokens: z.number(),
        totalTokens: z.number(),
        costUsd: z.number().nullable(),
        byAgent: z.object({ claude: z.number(), codex: z.number() }),
      })
    ),
    forecast: z.object({
      projectedMonthTokens: z.number().nullable(),
      projectedMonthCostUsd: z.number().nullable(),
      resetAt: z.string().nullable(),
      daysRemaining: z.number().nullable(),
    }),
    recentSessionPulse: z.array(
      z.object({
        agent: z.enum(['claude', 'codex']),
        providerSessionId: z.string(),
        cwd: z.string().nullable(),
        model: z.string().nullable(),
        startedAt: z.string(),
        lastActivityAt: z.string(),
        messageCount: z.number(),
        totalTokens: z.number(),
        toolCalls: z.number(),
      })
    ),
  })
  .openapi('AnalyticsSummary');

export const analyticsSummaryQuerySchema = z.object({
  days: z.string().optional(),
});

export const analyticsSessionUsageSchema = z.object({
  agent: z.enum(['claude', 'codex']),
  providerSessionId: z.string(),
  cwd: z.string().nullable(),
  model: z.string().nullable(),
  startedAt: z.string(),
  lastActivityAt: z.string(),
  durationSeconds: z.number(),
  messageCount: z.number(),
  userMessages: z.array(z.string()),
  toolCalls: z.number(),
  tools: z.array(z.string()),
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheCreationInputTokens: z.number(),
  cacheReadInputTokens: z.number(),
  cachedInputTokens: z.number(),
  totalTokens: z.number(),
  effectiveTokens: z.number(),
  costUsd: z.number().nullable(),
  tokensPerMessage: z.number().nullable(),
  outputInputRatio: z.number().nullable(),
});

export const analyticsSessionsSchema = z
  .object({
    generatedAt: z.string(),
    period: z.enum(['week', 'month']),
    start: z.string(),
    end: z.string(),
    limit: z.number(),
    offset: z.number(),
    total: z.number(),
    sessions: z.array(analyticsSessionUsageSchema),
  })
  .openapi('AnalyticsSessions');

export const analyticsSessionsQuerySchema = z.object({
  period: z.enum(['week', 'month']).optional(),
  limit: z.string().optional(),
  offset: z.string().optional(),
});
