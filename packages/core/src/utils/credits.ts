/**
 * Estimate what a turn costs, in USD and in credits, from token counts and
 * locally-configured rates.
 *
 * Why estimate at all when providers report a cost: a subscription-backed
 * backend (Pi via `openai-codex`, Claude Pro/Max) reports ~0 because no
 * per-token charge is incurred, and negotiated rates differ from list price.
 * This prices the turn against `pricing:` in config instead, so the number
 * reflects what the operator is actually billed.
 *
 * Pure and side-effect free: rates in, estimate out.
 */
import type { TokenUsage } from '@archon/providers/types';
import type { ModelRates, PricingConfig } from '../config/config-types';

export interface CreditEstimate {
  /** Estimated spend in credits. */
  credits: number;
  /** The same spend in USD, before the credit conversion. */
  usd: number;
}

/**
 * Resolve rates for a resolved model string.
 *
 * Tries the full string first, then the segment after the last `/`, so one
 * `gpt-5.6-luna` entry serves both a bare Codex model and Pi's
 * `openai-codex/gpt-5.6-luna` ref without duplicating the rates. Matching is
 * case-insensitive because model strings reach us from several SDKs.
 */
export function findModelRates(
  model: string | undefined,
  models: Record<string, ModelRates> | undefined
): ModelRates | undefined {
  if (!model || !models) return undefined;

  const lowered = new Map(Object.entries(models).map(([k, v]) => [k.toLowerCase(), v]));
  const key = model.toLowerCase();
  const exact = lowered.get(key);
  if (exact) return exact;

  const lastSegment = key.slice(key.lastIndexOf('/') + 1);
  return lastSegment === key ? undefined : lowered.get(lastSegment);
}

/**
 * Price one turn. Returns `null` — never a zero estimate — whenever the inputs
 * cannot support a real number: no usage, no configured rate for the model, or
 * no `creditsPerUsd`. Callers render nothing in that case rather than showing a
 * confident-looking 0.
 *
 * The token buckets are disjoint by the `TokenUsage` contract (every provider
 * normalises `input` to fresh tokens), so each is priced exactly once.
 */
export function estimateCredits(
  tokens: TokenUsage | undefined,
  model: string | undefined,
  pricing: PricingConfig | undefined
): CreditEstimate | null {
  if (!tokens || !pricing?.creditsPerUsd) return null;

  const rates = findModelRates(model, pricing.models);
  if (!rates) return null;

  // An omitted cached/cache-write rate falls back to the fresh-input rate:
  // conservative, and correct for providers that give no caching discount.
  const cachedRate = rates.cachedInput ?? rates.input;
  const cacheWriteRate = rates.cacheWrite ?? rates.input;

  const usd =
    (tokens.input * rates.input +
      (tokens.cached ?? 0) * cachedRate +
      (tokens.cacheWrite ?? 0) * cacheWriteRate +
      tokens.output * rates.output) /
    1_000_000;

  if (!Number.isFinite(usd)) return null;

  return { usd, credits: usd * pricing.creditsPerUsd };
}

/**
 * Render a credit figure for a one-line footer.
 *
 * Small turns are the common case and would all collapse to "0.0" at one
 * decimal, so the precision scales with magnitude — enough digits to stay
 * informative without implying accuracy the estimate does not have.
 */
export function formatCredits(credits: number): string {
  if (credits >= 100) return credits.toFixed(0);
  if (credits >= 10) return credits.toFixed(1);
  if (credits >= 1) return credits.toFixed(2);
  return credits.toFixed(3);
}
