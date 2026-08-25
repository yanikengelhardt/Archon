import { describe, test, expect } from 'bun:test';
import { estimateCredits, findModelRates, formatCredits } from './credits';
import type { PricingConfig } from '../config/config-types';

const LUNA: PricingConfig = {
  creditsPerUsd: 14.28,
  models: {
    'gpt-5.6-luna': { cachedInput: 0.075, input: 0.752, output: 4.513 },
  },
};

describe('estimateCredits — rates reproduce the published tokens-per-credit table', () => {
  // The operator's rate card states tokens-per-credit alongside $/1M. Storing
  // only the dollar rates plus creditsPerUsd must reproduce those figures, or
  // the two halves of the card have drifted.
  const approxOneCredit = (credits: number): void => {
    expect(credits).toBeGreaterThan(0.99);
    expect(credits).toBeLessThan(1.01);
  };

  test('93,065 fresh input tokens ≈ 1 credit', () => {
    const e = estimateCredits({ input: 93_065, output: 0 }, 'gpt-5.6-luna', LUNA);
    approxOneCredit(e!.credits);
  });

  test('930,647 cached input tokens ≈ 1 credit', () => {
    const e = estimateCredits({ input: 0, output: 0, cached: 930_647 }, 'gpt-5.6-luna', LUNA);
    approxOneCredit(e!.credits);
  });

  test('15,511 output tokens ≈ 1 credit', () => {
    const e = estimateCredits({ input: 0, output: 15_511 }, 'gpt-5.6-luna', LUNA);
    approxOneCredit(e!.credits);
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
    // 0.075 vs 0.752 per 1M — roughly a 10x discount.
    expect(freshOnly!.usd / cachedOnly!.usd).toBeCloseTo(0.752 / 0.075, 5);
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
    expect(e!.usd).toBeCloseTo(0.752, 6);
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
    // And one credit is worth 1/14.28 ≈ $0.0700.
    expect(e.usd / e.credits).toBeCloseTo(1 / 14.28, 10);
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
    expect(estimateCredits({ input: 100, output: 10 }, 'gpt-5.6-sol', LUNA)).toBeNull();
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
