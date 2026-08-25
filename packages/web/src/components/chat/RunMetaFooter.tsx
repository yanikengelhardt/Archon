import type { RunMetaDisplay } from '@/lib/types';

/**
 * Stop reasons meaning "the model ended its turn normally".
 *
 * Kept in lockstep with NORMAL_STOP_REASONS in the Slack adapter's blocks.ts —
 * providers spell the same outcome differently (Pi `stop`, Claude `end_turn`),
 * and surfacing either renders a constant, meaningless badge on every healthy
 * turn. Abnormal reasons (`max_tokens`, `aborted`, `refusal`) stay visible
 * because they explain a truncated or missing reply.
 */
const NORMAL_STOP_REASONS = new Set(['stop', 'end_turn']);

/**
 * Render a credit figure. Precision scales with magnitude so small turns —
 * the common case — do not all collapse to "0.0". Kept in step with
 * `formatCredits` in @archon/core; the web package cannot import from core,
 * so the two are duplicated deliberately and must change together.
 */
function formatCreditCount(credits: number): string {
  if (credits >= 100) return credits.toFixed(0);
  if (credits >= 10) return credits.toFixed(1);
  if (credits >= 1) return credits.toFixed(2);
  return credits.toFixed(3);
}

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/**
 * One-line provider metadata for a finished turn: model, cost, output tokens,
 * turn count, and any abnormal stop reason.
 *
 * Only output tokens are shown. The cumulative input count balloons into the
 * millions across an agentic turn (most of it cache reads), which reads as
 * alarming while the cost figure already reflects the cached discount — the
 * same reasoning as the Slack footer.
 *
 * Renders nothing when no field is worth showing.
 */
export function RunMetaFooter({ meta }: { meta: RunMetaDisplay }): React.ReactElement | null {
  const parts: string[] = [];

  if (meta.model) parts.push(meta.model);
  // Credits replace the provider cost when configured rates produced one: on a
  // subscription-backed backend the reported cost is ~0, so showing both would
  // read as a contradiction. Mirrors the Slack footer's precedence.
  if (typeof meta.credits === 'number' && Number.isFinite(meta.credits)) {
    parts.push(`~${formatCreditCount(meta.credits)} cr`);
  } else if (typeof meta.cost === 'number' && Number.isFinite(meta.cost)) {
    parts.push(`$${meta.cost.toFixed(4)}`);
  }
  const out = meta.tokens?.output ?? 0;
  if (out > 0) parts.push(`out: ${formatTokenCount(out)}`);
  if (typeof meta.numTurns === 'number' && meta.numTurns > 1) {
    parts.push(`${String(meta.numTurns)} turns`);
  }
  if (meta.stopReason && !NORMAL_STOP_REASONS.has(meta.stopReason)) {
    parts.push(`stop: ${meta.stopReason}`);
  }

  if (parts.length === 0) return null;

  return <div className="px-1 font-mono text-[10px] text-text-tertiary">{parts.join(' · ')}</div>;
}
