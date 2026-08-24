import { useState } from 'react';
import { Brain, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ReasoningCardProps {
  /** Accumulated reasoning deltas for the turn. */
  content: string;
  /** True while the turn is still in flight. */
  isStreaming?: boolean;
}

/**
 * Collapsible reasoning panel, shown above the assistant bubble.
 *
 * Collapsed by default so a long chain of thought never pushes the reply off
 * screen; the header carries the last non-empty line as a live preview so the
 * turn still reads as "working on X" without expanding. Mirrors ToolCallCard's
 * shape deliberately — reasoning and tool calls are the two halves of the same
 * "what did it actually do" surface and should look like siblings.
 */
export function ReasoningCard({ content, isStreaming }: ReasoningCardProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false);

  const lines = content.split('\n');
  const preview = [...lines]
    .reverse()
    .map(line => line.trim())
    .find(line => line.length > 0)
    ?.slice(0, 80);

  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-surface transition-colors hover:border-border-bright',
        isStreaming && 'border-l-2 border-l-accent-bright'
      )}
    >
      <button
        onClick={(): void => {
          setExpanded(!expanded);
        }}
        className="flex h-9 w-full items-center gap-2 px-3 text-left"
      >
        <ChevronRight
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-text-tertiary transition-transform duration-150',
            expanded && 'rotate-90'
          )}
        />
        <Brain
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-text-secondary',
            isStreaming && 'animate-pulse text-accent-bright'
          )}
        />
        <span className="shrink-0 font-mono text-xs text-text-secondary">Reasoning</span>
        {!expanded && preview ? (
          <span className="truncate text-xs text-text-tertiary">{preview}</span>
        ) : null}
        <span className="ml-auto shrink-0 rounded-full bg-surface-elevated px-2 py-0.5 text-[10px] text-text-secondary">
          {lines.length > 1 ? `${String(lines.length)} lines` : `${String(content.length)} chars`}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-border px-3 py-2">
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-text-secondary">
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}
