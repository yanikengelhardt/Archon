import { describe, test, expect, mock } from 'bun:test';

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
};

mock.module('@archon/paths', () => ({
  createLogger: mock(() => mockLogger),
}));

import { TurnRecord } from './turn-record';

describe('TurnRecord — tool calls', () => {
  test('records a call and pairs its result with a duration', () => {
    const record = new TurnRecord();
    record.recordTool('read_file', { path: 'a.ts' }, 'tc-1', 1000);
    record.recordToolResult('read_file', 'file contents', 'tc-1', 1250);

    expect(record.toMetadata()).toEqual({
      toolCalls: [
        { name: 'read_file', input: { path: 'a.ts' }, output: 'file contents', duration: 250 },
      ],
    });
  });

  test('emits the exact shape the web adapter persists', () => {
    // mapMessageRow hydrates both paths identically, so the keys must match
    // persistence.ts byte-for-byte: name, input, duration, output.
    const record = new TurnRecord();
    record.recordTool('bash', { command: 'ls' }, undefined, 0);
    record.recordToolResult('bash', 'out', undefined, 5);

    const [tc] = record.toMetadata().toolCalls ?? [];
    expect(Object.keys(tc).sort()).toEqual(['duration', 'input', 'name', 'output']);
  });

  test('pairs by stable id when same-named tools run concurrently', () => {
    const record = new TurnRecord();
    record.recordTool('grep', { q: 'first' }, 'tc-1', 100);
    record.recordTool('grep', { q: 'second' }, 'tc-2', 200);
    record.recordToolResult('grep', 'second result', 'tc-2', 250);
    record.recordToolResult('grep', 'first result', 'tc-1', 400);

    expect(record.toMetadata().toolCalls).toEqual([
      { name: 'grep', input: { q: 'first' }, output: 'first result', duration: 300 },
      { name: 'grep', input: { q: 'second' }, output: 'second result', duration: 50 },
    ]);
  });

  test('falls back to a name reverse-scan when the provider supplies no id', () => {
    const record = new TurnRecord();
    record.recordTool('grep', { q: 'first' }, undefined, 100);
    record.recordTool('grep', { q: 'second' }, undefined, 200);
    record.recordToolResult('grep', 'matched', undefined, 260);

    const calls = record.toMetadata().toolCalls ?? [];
    // Reverse scan resolves the most recent unresolved call of that name.
    expect(calls[1].output).toBe('matched');
    expect(calls[1].duration).toBe(60);
    expect(calls[0].output).toBeUndefined();
  });

  test('drops an unmatched result rather than inventing a phantom tool card', () => {
    const record = new TurnRecord();
    record.recordToolResult('never_called', 'orphan output', 'tc-9', 100);

    expect(record.toMetadata()).toEqual({});
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  test('records an undefined output as an empty string, keeping the card complete', () => {
    const record = new TurnRecord();
    record.recordTool('write', {}, 'tc-1', 0);
    record.recordToolResult('write', undefined, 'tc-1', 10);

    expect(record.toMetadata().toolCalls?.[0]).toEqual({
      name: 'write',
      input: {},
      output: '',
      duration: 10,
    });
  });

  test('defaults a missing input to an empty object', () => {
    const record = new TurnRecord();
    record.recordTool('noargs', undefined, undefined, 0);

    expect(record.toMetadata().toolCalls?.[0].input).toEqual({});
  });
});

describe('TurnRecord — reasoning', () => {
  test('concatenates deltas in order', () => {
    const record = new TurnRecord();
    record.recordReasoning('First. ');
    record.recordReasoning('Second. ');
    record.recordReasoning('Third.');

    expect(record.toMetadata().reasoning).toBe('First. Second. Third.');
  });

  test('caps runaway reasoning with a visible marker', () => {
    const record = new TurnRecord();
    record.recordReasoning('x'.repeat(40_000));
    record.recordReasoning('this should be ignored');

    const { reasoning } = record.toMetadata();
    expect(reasoning).toContain('… [reasoning truncated]');
    // Cap (32768) + marker, and nothing appended after the cap was hit.
    expect(reasoning?.startsWith('x'.repeat(32_768))).toBe(true);
    expect(reasoning).not.toContain('this should be ignored');
  });
});

describe('TurnRecord — metadata shape', () => {
  test('an empty turn produces {}, matching the previous metadata-less write', () => {
    expect(new TurnRecord().toMetadata()).toEqual({});
  });

  test('omits toolCalls when only reasoning was recorded', () => {
    const record = new TurnRecord();
    record.recordReasoning('just thinking');

    const meta = record.toMetadata();
    expect('toolCalls' in meta).toBe(false);
    expect(meta.reasoning).toBe('just thinking');
  });

  test('omits reasoning when only tools were recorded', () => {
    const record = new TurnRecord();
    record.recordTool('ls', {}, undefined, 0);

    const meta = record.toMetadata();
    expect('reasoning' in meta).toBe(false);
    expect(meta.toolCalls).toHaveLength(1);
  });

  test('never leaks internal bookkeeping fields into metadata', () => {
    const record = new TurnRecord();
    record.recordTool('ls', {}, 'tc-1', 500);

    const [tc] = record.toMetadata().toolCalls ?? [];
    expect('startedAt' in tc).toBe(false);
    expect('toolCallId' in tc).toBe(false);
  });
});
