import { describe, test, expect } from 'bun:test';
import { estimateCredits, findModelRates, formatCredits } from './credits';
import type { PricingConfig } from '../config/config-types';

/**
 * The operator's live rate card, in USD per 1M tokens.
 *
 * Every bucket of every model prices at exactly $0.07 per credit, so
 * `creditsPerUsd` is the exact reciprocal — 14.28 is a rounding that yields
 * 4.998 credits per 1M Luna input tokens where the rate card says 5.
 */
const LUNA: PricingConfig = {
  creditsPerUsd: 1 / 0.07,
  models: {
    'gpt-5.6-luna': { cachedInput: 0.035, input: 0.35, output: 2.1 },
    'gpt-5.6-terra': { cachedInput: 0.35, input: 3.5, output: 21 },
    'gpt-5.6-sol': { cachedInput: 0.7, input: 7, output: 35 },
    'gpt-5.4': { cachedInput: 0.4375, input: 4.375, output: 26.25 },
    'gpt-5.4-mini': { cachedInput: 0.13125, input: 1.3125, output: 7.91 },
  },
};

describe('estimateCredits — reproduces the operator rate card', () => {
  // The rate card is published in two units: USD per 1M tokens AND credits per
  // 1M tokens. Only the dollars are configured, so credits must fall out of the
  // conversion exactly. A drift here means the two halves of the card disagree.
  const M = 1_000_000;
  const CREDITS_PER_MILLION: Record<string, [number, number, number]> = {
    'gpt-5.6-luna': [5, 0.5, 30],
    'gpt-5.6-terra': [50, 5, 300],
    'gpt-5.6-sol': [100, 10, 500],
    'gpt-5.4': [62.5, 6.25, 375],
    'gpt-5.4-mini': [18.75, 1.875, 113],
  };

  for (const [model, [input, cached, output]] of Object.entries(CREDITS_PER_MILLION)) {
    test(`${model}: 1M tokens per bucket matches the published credit figures`, () => {
      expect(estimateCredits({ input: M, output: 0 }, model, LUNA)!.credits).toBeCloseTo(input, 9);
      expect(estimateCredits({ input: 0, output: 0, cached: M }, model, LUNA)!.credits).toBeCloseTo(
        cached,
        9
      );
      expect(estimateCredits({ input: 0, output: M }, model, LUNA)!.credits).toBeCloseTo(output, 9);
    });
  }

  test('every model prices at exactly $0.07 per credit', () => {
    for (const model of Object.keys(CREDITS_PER_MILLION)) {
      const e = estimateCredits({ input: 12_345, output: 678, cached: 90_123 }, model, LUNA)!;
      expect(e.usd / e.credits).toBeCloseTo(0.07, 12);
    }
  });
});

describe('estimateCredits — bucket handling', () => {
  test('prices cached tokens at the cached rate, not the input rate', () => {
    const cachedOnly = estimateCredits(
      { input: 0, output: 0, cached: 100_000 },
      'gpt-5.6-luna',
      LUNA
    );
    const freshOnly = estimateCredits({ input: 100_000, output: 0 }, 'gpt-5.6-luna', LUNA);
    // 0.035 vs 0.35 per 1M — exactly a 10x discount across this rate card.
    expect(freshOnly!.usd / cachedOnly!.usd).toBeCloseTo(10, 9);
  });

  test('does not double-charge cached tokens as input', () => {
    // TokenUsage.input is fresh-only by contract, so these are additive, never
    // overlapping. 10k fresh + 90k cached must cost less than 100k fresh.
    const split = estimateCredits(
      { input: 10_000, output: 0, cached: 90_000 },
      'gpt-5.6-luna',
      LUNA
    );
    const allFresh = estimateCredits({ input: 100_000, output: 0 }, 'gpt-5.6-luna', LUNA);
    expect(split!.usd).toBeLessThan(allFresh!.usd);
  });

  test('falls back to the input rate when no cachedInput rate is configured', () => {
    const noCacheRate: PricingConfig = {
      creditsPerUsd: 14.28,
      models: { m: { input: 1, output: 2 } },
    };
    const withCache = estimateCredits({ input: 0, output: 0, cached: 1_000_000 }, 'm', noCacheRate);
    // Conservative default: cached billed as ordinary input ($1/1M).
    expect(withCache!.usd).toBeCloseTo(1, 6);
  });

  test('bills cacheWrite at the input rate by default', () => {
    const e = estimateCredits({ input: 0, output: 0, cacheWrite: 1_000_000 }, 'gpt-5.6-luna', LUNA);
    expect(e!.usd).toBeCloseTo(0.35, 6);
  });

  test('honours an explicit cacheWrite premium', () => {
    const anthropicish: PricingConfig = {
      creditsPerUsd: 10,
      models: { m: { input: 1, output: 2, cachedInput: 0.1, cacheWrite: 1.25 } },
    };
    const e = estimateCredits({ input: 0, output: 0, cacheWrite: 1_000_000 }, 'm', anthropicish);
    expect(e!.usd).toBeCloseTo(1.25, 6);
  });
});

describe('estimateCredits — credits and USD are the same quantity', () => {
  test('usd and credits agree with the stated 1 credit = $0.07 conversion', () => {
    const e = estimateCredits(
      { input: 50_000, output: 3_000, cached: 200_000 },
      'gpt-5.6-luna',
      LUNA
    )!;
    // credits = usd * creditsPerUsd, so dividing back must return the dollars.
    expect(e.credits / LUNA.creditsPerUsd!).toBeCloseTo(e.usd, 10);
    // And one credit is worth exactly $0.07.
    expect(e.usd / e.credits).toBeCloseTo(0.07, 12);
  });

  test('scales linearly, so doubling usage doubles both units', () => {
    const one = estimateCredits({ input: 1_000, output: 100 }, 'gpt-5.6-luna', LUNA)!;
    const two = estimateCredits({ input: 2_000, output: 200 }, 'gpt-5.6-luna', LUNA)!;
    expect(two.usd).toBeCloseTo(one.usd * 2, 10);
    expect(two.credits).toBeCloseTo(one.credits * 2, 10);
  });
});

describe('estimateCredits — refuses to guess', () => {
  test('returns null for an unpriced model rather than a confident zero', () => {
    // Must be a model genuinely absent from the rate card — an unpriced model
    // must never silently borrow a priced one's rates.
    expect(estimateCredits({ input: 100, output: 10 }, 'claude-opus-5', LUNA)).toBeNull();
    expect(estimateCredits({ input: 100, output: 10 }, 'ft/coder', LUNA)).toBeNull();
  });

  test('returns null when pricing is unconfigured', () => {
    expect(estimateCredits({ input: 100, output: 10 }, 'gpt-5.6-luna', undefined)).toBeNull();
  });

  test('returns null when creditsPerUsd is missing', () => {
    const noConversion: PricingConfig = { models: { 'gpt-5.6-luna': { input: 1, output: 2 } } };
    expect(estimateCredits({ input: 100, output: 10 }, 'gpt-5.6-luna', noConversion)).toBeNull();
  });

  test('returns null without usage', () => {
    expect(estimateCredits(undefined, 'gpt-5.6-luna', LUNA)).toBeNull();
  });

  test('returns null when the model is unknown', () => {
    expect(estimateCredits({ input: 100, output: 10 }, undefined, LUNA)).toBeNull();
  });
});

describe('findModelRates — model string matching', () => {
  test('matches an exact key', () => {
    expect(findModelRates('gpt-5.6-luna', LUNA.models)).toBeDefined();
  });

  test("matches Pi's backend-prefixed ref via the last segment", () => {
    expect(findModelRates('openai-codex/gpt-5.6-luna', LUNA.models)).toBeDefined();
  });

  test('matches a multi-segment ref via the last segment', () => {
    const models = { 'qwen3-coder': { input: 1, output: 2 } };
    expect(findModelRates('openrouter/qwen/qwen3-coder', models)).toBeDefined();
  });

  test('is case-insensitive', () => {
    expect(findModelRates('GPT-5.6-Luna', LUNA.models)).toBeDefined();
  });

  test('prefers an exact match over a last-segment match', () => {
    const models = {
      'openai-codex/gpt-5.6-luna': { input: 9, output: 9 },
      'gpt-5.6-luna': { input: 1, output: 1 },
    };
    expect(findModelRates('openai-codex/gpt-5.6-luna', models)?.input).toBe(9);
  });

  test('returns undefined for an unknown model', () => {
    expect(findModelRates('nope', LUNA.models)).toBeUndefined();
  });
});

describe('formatCredits', () => {
  test('scales precision with magnitude so small turns stay legible', () => {
    expect(formatCredits(0.1824)).toBe('0.182');
    expect(formatCredits(1.234)).toBe('1.23');
    expect(formatCredits(12.34)).toBe('12.3');
    expect(formatCredits(123.4)).toBe('123');
  });
});
