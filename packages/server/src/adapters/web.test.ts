import { describe, test, expect, mock, beforeEach } from 'bun:test';

// Mock logger before importing any module that transitively imports @archon/paths
const mockLogger = {
  fatal: mock(() => undefined),
  error: mock(() => undefined),
  warn: mock(() => undefined),
  info: mock(() => undefined),
  debug: mock(() => undefined),
  trace: mock(() => undefined),
  child: mock(function (this: unknown) {
    return this;
  }),
  bindings: mock(() => ({ module: 'test' })),
  isLevelEnabled: mock(() => true),
  level: 'info' as const,
};

mock.module('@archon/paths', () => ({
  createLogger: mock(() => mockLogger),
}));

import { WebAdapter } from './web';
import { MAX_TOOL_OUTPUT_CHARS } from './web/truncate';
import type { SSETransport } from './web/transport';
import type { MessagePersistence } from './web/persistence';
import type { WorkflowEventBridge } from './web/workflow-bridge';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAdapter(): {
  adapter: WebAdapter;
  emitted: string[];
  appendToolResultCalls: unknown[][];
  appendTextCalls: unknown[][];
} {
  const emitted: string[] = [];
  const appendToolResultCalls: unknown[][] = [];
  const appendTextCalls: unknown[][] = [];

  const mockTransport = {
    emit: mock(async (_id: string, event: string) => {
      emitted.push(event);
    }),
  } as unknown as SSETransport;

  const mockPersistence = {
    appendToolResult: mock((_id: string, name: string, output: string, duration: number) => {
      appendToolResultCalls.push([_id, name, output, duration]);
    }),
    appendToolCall: mock(() => {}),
    appendText: mock((...args: unknown[]) => {
      appendTextCalls.push(args);
    }),
    flush: mock(async () => {}),
    finalizeRunningTools: mock(() => {}),
  } as unknown as MessagePersistence;

  const mockBridge = {
    emitOutput: mock(() => {}),
    registerOutputCallback: mock(() => {}),
    removeOutputCallback: mock(() => {}),
    setStepTransitionCallback: mock(() => {}),
    start: mock(() => {}),
    stop: mock(() => {}),
    bridgeWorkerEvents: mock(() => () => {}),
  } as unknown as WorkflowEventBridge;

  const adapter = new WebAdapter(mockTransport, mockPersistence, mockBridge);
  return { adapter, emitted, appendToolResultCalls, appendTextCalls };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockLogger.warn.mockClear();
  mockLogger.error.mockClear();
});

describe('WebAdapter.sendStructuredEvent — tool_result output bounding', () => {
  test('truncates SSE event output when toolOutput exceeds the cap', async () => {
    const { adapter, emitted } = makeAdapter();
    const largeOutput = 'x'.repeat(MAX_TOOL_OUTPUT_CHARS + 50_000);

    await adapter.sendStructuredEvent('conv-1', {
      type: 'tool_result',
      toolName: 'bash',
      toolOutput: largeOutput,
    });

    expect(emitted.length).toBe(1);
    const parsed = JSON.parse(emitted[0]!) as { output: string };
    expect(parsed.output.length).toBeLessThan(largeOutput.length);
    expect(parsed.output).toContain('[truncated');
    expect(parsed.output).toContain('full output preserved on the server');
  });

  test('passes SSE event output through unchanged when within the cap', async () => {
    const { adapter, emitted } = makeAdapter();
    const smallOutput = 'small tool output';

    await adapter.sendStructuredEvent('conv-1', {
      type: 'tool_result',
      toolName: 'bash',
      toolOutput: smallOutput,
    });

    expect(emitted.length).toBe(1);
    const parsed = JSON.parse(emitted[0]!) as { output: string };
    expect(parsed.output).toBe(smallOutput);
  });

  test('persists full untruncated output to DB regardless of the SSE cap', async () => {
    const { adapter, appendToolResultCalls } = makeAdapter();
    const largeOutput = 'z'.repeat(MAX_TOOL_OUTPUT_CHARS + 50_000);

    await adapter.sendStructuredEvent('conv-1', {
      type: 'tool_result',
      toolName: 'bash',
      toolOutput: largeOutput,
    });

    expect(appendToolResultCalls.length).toBe(1);
    // Third argument to appendToolResult is the output — must be the full string
    expect(appendToolResultCalls[0]![2]).toBe(largeOutput);
  });
});

describe('WebAdapter.sendMessage — text event category', () => {
  test('carries the metadata category on the text event', async () => {
    const { adapter, emitted } = makeAdapter();

    await adapter.sendMessage('conv-1', '🚀 Dispatching workflow: **plan**', {
      category: 'workflow_dispatch_status',
      segment: 'new',
    });

    expect(emitted.length).toBe(1);
    const parsed = JSON.parse(emitted[0]!) as { type: string; category?: string };
    expect(parsed.type).toBe('text');
    expect(parsed.category).toBe('workflow_dispatch_status');
  });

  test('omits the category key entirely for agent prose', async () => {
    const { adapter, emitted } = makeAdapter();

    await adapter.sendMessage('conv-1', 'ordinary assistant text');

    expect(emitted.length).toBe(1);
    const parsed = JSON.parse(emitted[0]!) as Record<string, unknown>;
    expect('category' in parsed).toBe(false);
  });

  test('still suppresses structurally-handled categories rather than emitting them', async () => {
    const { adapter, emitted } = makeAdapter();

    await adapter.sendMessage('conv-1', 'formatted tool call', {
      category: 'tool_call_formatted',
    });
    await adapter.sendMessage('conv-1', '📍 repo @ `branch`', {
      category: 'isolation_context',
    });

    expect(emitted.length).toBe(0);
  });
});

describe('WebAdapter.sendStructuredEvent — reasoning', () => {
  test('forwards a thinking chunk as a thinking event', async () => {
    const { adapter, emitted } = makeAdapter();

    await adapter.sendStructuredEvent('conv-1', {
      type: 'thinking',
      content: 'Checking the config first.',
    });

    expect(emitted.length).toBe(1);
    const parsed = JSON.parse(emitted[0]!) as Record<string, unknown>;
    expect(parsed.type).toBe('thinking');
    expect(parsed.content).toBe('Checking the config first.');
  });

  test('does NOT persist reasoning — it is live-only, never part of the transcript', async () => {
    const { adapter, appendTextCalls } = makeAdapter();

    await adapter.sendStructuredEvent('conv-1', { type: 'thinking', content: 'secret thought' });

    expect(appendTextCalls.length).toBe(0);
  });

  test('drops an empty thinking chunk rather than emitting a blank card', async () => {
    const { adapter, emitted } = makeAdapter();

    await adapter.sendStructuredEvent('conv-1', { type: 'thinking', content: '' });

    expect(emitted.length).toBe(0);
  });
});

describe('WebAdapter.sendStructuredEvent — result metadata', () => {
  test('forwards cost, tokens, model, stopReason and numTurns alongside the session id', async () => {
    const { adapter, emitted } = makeAdapter();

    await adapter.sendStructuredEvent('conv-1', {
      type: 'result',
      sessionId: 'sid-1',
      cost: 0.0421,
      tokens: { input: 12000, output: 850 },
      model: 'claude-opus-5',
      stopReason: 'end_turn',
      numTurns: 3,
    });

    expect(emitted.length).toBe(1);
    const parsed = JSON.parse(emitted[0]!) as Record<string, unknown>;
    expect(parsed.type).toBe('session_info');
    expect(parsed.sessionId).toBe('sid-1');
    expect(parsed.cost).toBe(0.0421);
    expect(parsed.tokens).toEqual({ input: 12000, output: 850 });
    expect(parsed.model).toBe('claude-opus-5');
    expect(parsed.stopReason).toBe('end_turn');
    expect(parsed.numTurns).toBe(3);
  });

  test('emits metadata for a result with no sessionId', async () => {
    // Regression: the branch was gated on `chunk.sessionId`, so a provider that
    // omits it (Codex) had its entire result chunk dropped — cost, tokens and
    // stop reason with it.
    const { adapter, emitted } = makeAdapter();

    await adapter.sendStructuredEvent('conv-1', {
      type: 'result',
      cost: 0.01,
      tokens: { input: 100, output: 20 },
    });

    expect(emitted.length).toBe(1);
    const parsed = JSON.parse(emitted[0]!) as Record<string, unknown>;
    expect(parsed.type).toBe('session_info');
    expect('sessionId' in parsed).toBe(false);
    expect(parsed.cost).toBe(0.01);
  });

  test('falls back to resolvedModel.id when the provider sets no flat model', async () => {
    const { adapter, emitted } = makeAdapter();

    await adapter.sendStructuredEvent('conv-1', {
      type: 'result',
      sessionId: 'sid-2',
      resolvedModel: { id: 'anthropic/claude-haiku-4-5' },
    });

    const parsed = JSON.parse(emitted[0]!) as Record<string, unknown>;
    expect(parsed.model).toBe('anthropic/claude-haiku-4-5');
  });

  test('omits a non-finite cost rather than serialising it as null', async () => {
    const { adapter, emitted } = makeAdapter();

    await adapter.sendStructuredEvent('conv-1', {
      type: 'result',
      sessionId: 'sid-3',
      cost: Number.NaN,
    });

    const parsed = JSON.parse(emitted[0]!) as Record<string, unknown>;
    expect('cost' in parsed).toBe(false);
  });
});
