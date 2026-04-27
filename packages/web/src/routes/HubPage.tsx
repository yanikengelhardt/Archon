import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bot,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  MessageSquareText,
  Play,
  TerminalSquare,
  X,
} from 'lucide-react';
import {
  createConversation,
  deleteConversation,
  getAnalyticsSummary,
  listAnalyticsSessions,
  listCommands,
  listDashboardRuns,
  listWorkflows,
  runWorkflow,
  sendMessage,
  type AnalyticsAgent,
  type AnalyticsAgentTotals,
  type AnalyticsPeriod,
  type AnalyticsSessionUsage,
  type AnalyticsSummary,
  type DashboardRunResponse,
  type WorkflowListEntry,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useProject } from '@/contexts/ProjectContext';
import {
  CATEGORIES,
  getWorkflowCategory,
  getWorkflowDisplayName,
  type WorkflowCategory,
} from '@/lib/workflow-metadata';

type SelectionType = 'workflow' | 'skill';

interface Selection {
  name: string;
  type: SelectionType;
  displayName: string;
}

const SESSION_PAGE_SIZE = 10;

function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(Math.round(value));
}

function formatRatio(value: number | null): string {
  return value === null || !Number.isFinite(value) ? '-' : `${value.toFixed(2)}x`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${String(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${String(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0
    ? `${String(hours)}h ${String(remainingMinutes)}m`
    : `${String(hours)}h`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'now';
  if (m < 60) return `${String(m)}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${String(h)}h`;
  return `${String(Math.floor(h / 24))}d`;
}

function agentLabel(agent: AnalyticsAgent): string {
  return agent === 'claude' ? 'Claude' : 'Codex';
}

function shortPath(path: string | null): string {
  if (!path) return 'No project path';
  const parts = path.split('/').filter(Boolean);
  if (parts.length <= 3) return path;
  return `.../${parts.slice(-3).join('/')}`;
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

function totalsFor(
  summary: AnalyticsSummary | undefined,
  period: AnalyticsPeriod,
  agent: AnalyticsAgent
): AnalyticsAgentTotals {
  return summary?.periods.find(item => item.key === period)?.totals.byAgent[agent] ?? emptyTotals();
}

function statusDot(status: DashboardRunResponse['status']): ReactElement {
  const cls =
    status === 'running' || status === 'pending'
      ? 'bg-primary animate-pulse'
      : status === 'completed'
        ? 'bg-emerald-500'
        : status === 'paused'
          ? 'bg-amber-400'
          : 'bg-error';
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${cls}`} />;
}

function UsageSummary({ summary }: { summary: AnalyticsSummary | undefined }): ReactElement {
  const cards: { period: AnalyticsPeriod; agent: AnalyticsAgent; label: string }[] = [
    { period: 'week', agent: 'claude', label: 'This Week' },
    { period: 'week', agent: 'codex', label: 'This Week' },
    { period: 'month', agent: 'claude', label: 'This Month' },
    { period: 'month', agent: 'codex', label: 'This Month' },
  ];

  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
      {cards.map(card => {
        const totals = totalsFor(summary, card.period, card.agent);
        const cacheTokens =
          totals.cacheCreationInputTokens + totals.cacheReadInputTokens + totals.cachedInputTokens;
        return (
          <div
            key={`${card.period}-${card.agent}`}
            className="rounded-lg border border-border bg-surface p-3"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                  {card.label}
                </p>
                <h2 className="text-sm font-medium text-text-primary">{agentLabel(card.agent)}</h2>
              </div>
              <span className="rounded border border-border px-2 py-1 text-[10px] text-text-tertiary">
                {String(totals.sessions)} sessions
              </span>
            </div>
            <p className="text-2xl font-semibold text-text-primary">
              {formatCompact(totals.totalTokens)}
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
              <Metric label="Input" value={formatCompact(totals.inputTokens)} />
              <Metric label="Output" value={formatCompact(totals.outputTokens)} />
              <Metric label="Cache" value={formatCompact(cacheTokens)} />
            </div>
            <p className="mt-2 text-[11px] text-text-tertiary">
              {String(totals.toolCalls)} tools
              {totals.costUsd !== null ? ` · $${totals.costUsd.toFixed(2)}` : ''}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="rounded border border-border bg-surface-elevated px-2 py-1.5">
      <p className="text-text-tertiary">{label}</p>
      <p className="mt-0.5 font-mono text-text-secondary">{value}</p>
    </div>
  );
}

function SessionEffectiveness({ sessions }: { sessions: AnalyticsSessionUsage[] }): ReactElement {
  const totals = sessions.reduce(
    (acc, session) => ({
      messages: acc.messages + session.messageCount,
      inputTokens: acc.inputTokens + session.inputTokens,
      outputTokens: acc.outputTokens + session.outputTokens,
      durationSeconds: acc.durationSeconds + session.durationSeconds,
      effectiveTokens: acc.effectiveTokens + session.effectiveTokens,
    }),
    { messages: 0, inputTokens: 0, outputTokens: 0, durationSeconds: 0, effectiveTokens: 0 }
  );
  const count = Math.max(1, sessions.length);
  const tokensPerMessage =
    totals.messages > 0 ? Math.round(totals.effectiveTokens / totals.messages) : null;
  const outputInputRatio = totals.inputTokens > 0 ? totals.outputTokens / totals.inputTokens : null;

  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <CompactStat label="User Messages" value={String(totals.messages)} />
      <CompactStat
        label="Tokens / Msg"
        value={tokensPerMessage === null ? '-' : formatCompact(tokensPerMessage)}
      />
      <CompactStat label="Output / Input" value={formatRatio(outputInputRatio)} />
      <CompactStat
        label="Avg Duration"
        value={formatDuration(Math.round(totals.durationSeconds / count))}
      />
    </div>
  );
}

function CompactStat({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-text-primary">{value}</p>
    </div>
  );
}

function SessionTable({ sessions }: { sessions: AnalyticsSessionUsage[] }): ReactElement {
  if (sessions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-surface/60 p-6 text-center text-xs text-text-tertiary">
        No Claude or Codex sessions found for this period.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="grid grid-cols-[7rem_minmax(14rem,1fr)_8rem_8rem_8rem_8rem] gap-3 border-b border-border px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
        <span>Agent</span>
        <span>Messages / Project</span>
        <span>Tools</span>
        <span>Tokens</span>
        <span>Efficiency</span>
        <span>Time</span>
      </div>
      {sessions.map(session => (
        <div
          key={`${session.agent}-${session.providerSessionId}`}
          className="grid grid-cols-[7rem_minmax(14rem,1fr)_8rem_8rem_8rem_8rem] gap-3 border-b border-border/70 px-3 py-3 last:border-b-0"
        >
          <div className="min-w-0">
            <p className="text-xs font-medium text-text-primary">{agentLabel(session.agent)}</p>
            <p className="mt-1 truncate text-[10px] text-text-tertiary">
              {session.model ?? 'unknown model'}
            </p>
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs text-text-secondary" title={session.cwd ?? undefined}>
              {shortPath(session.cwd)}
            </p>
            <div className="mt-1 space-y-1">
              {session.userMessages.map((message, index) => (
                <p
                  key={`${session.providerSessionId}-${String(index)}`}
                  className="truncate text-[11px] text-text-primary"
                >
                  {message}
                </p>
              ))}
            </div>
          </div>
          <div className="min-w-0 text-xs text-text-secondary">
            <p>{String(session.toolCalls)} calls</p>
            <p className="mt-1 truncate text-[10px] text-text-tertiary">
              {session.tools.length > 0 ? session.tools.join(', ') : 'No tools'}
            </p>
          </div>
          <div className="text-xs text-text-secondary">
            <p>{formatCompact(session.effectiveTokens)}</p>
            <p className="mt-1 text-[10px] text-text-tertiary">
              {formatCompact(session.inputTokens)} in / {formatCompact(session.outputTokens)} out
            </p>
          </div>
          <div className="text-xs text-text-secondary">
            <p>
              {session.tokensPerMessage === null ? '-' : formatCompact(session.tokensPerMessage)}
              /msg
            </p>
            <p className="mt-1 text-[10px] text-text-tertiary">
              {formatRatio(session.outputInputRatio)}
            </p>
          </div>
          <div className="text-xs text-text-secondary">
            <p>{formatDuration(session.durationSeconds)}</p>
            <p className="mt-1 text-[10px] text-text-tertiary">
              {timeAgo(session.lastActivityAt)} ago
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function RecentRuns({ runs }: { runs: DashboardRunResponse[] }): ReactElement {
  const navigate = useNavigate();

  if (runs.length === 0) {
    return <p className="px-1 py-2 text-xs text-text-tertiary">No recent runs yet.</p>;
  }

  return (
    <div className="space-y-1">
      {runs.map(run => (
        <button
          key={run.id}
          type="button"
          onClick={(): void => {
            if (run.conversation_id) void navigate(`/chat/${run.conversation_id}`);
          }}
          className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-elevated"
        >
          {statusDot(run.status)}
          <span className="min-w-0 flex-1 truncate text-xs text-text-primary">
            {getWorkflowDisplayName(run.workflow_name)}
          </span>
          <span className="shrink-0 text-[10px] text-text-tertiary">{timeAgo(run.started_at)}</span>
        </button>
      ))}
    </div>
  );
}

function QuickLaunch({
  workflows,
  commands,
  onSelect,
  selected,
}: {
  workflows: WorkflowListEntry[];
  commands: string[];
  onSelect: (s: Selection | null) => void;
  selected: Selection | null;
}): ReactElement {
  const workflowsByCategory = useMemo(() => {
    const map = new Map<WorkflowCategory, WorkflowListEntry[]>();
    for (const entry of workflows) {
      const cat = getWorkflowCategory(entry.workflow.name, entry.workflow.description ?? '');
      const existing = map.get(cat);
      if (existing) {
        existing.push(entry);
      } else {
        map.set(cat, [entry]);
      }
    }
    return map;
  }, [workflows]);

  const categories = CATEGORIES.filter(
    c => c !== 'All' && (workflowsByCategory.get(c)?.length ?? 0) > 0
  );

  function toggle(name: string, type: SelectionType, displayName: string): void {
    if (selected?.name === name && selected.type === type) {
      onSelect(null);
    } else {
      onSelect({ name, type, displayName });
    }
  }

  return (
    <div className="space-y-4">
      {categories.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
            Workflows
          </p>
          <div className="space-y-2">
            {categories.map(cat => {
              const items = workflowsByCategory.get(cat) ?? [];
              return (
                <div key={cat} className="flex flex-wrap items-center gap-1.5">
                  <span className="w-20 shrink-0 text-[10px] text-text-tertiary">{cat}</span>
                  {items.map(entry => {
                    const displayName = getWorkflowDisplayName(entry.workflow.name);
                    const isSelected =
                      selected?.name === entry.workflow.name && selected.type === 'workflow';
                    return (
                      <button
                        key={entry.workflow.name}
                        type="button"
                        onClick={(): void => {
                          toggle(entry.workflow.name, 'workflow', displayName);
                        }}
                        className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                          isSelected
                            ? 'bg-primary text-white'
                            : 'bg-surface-elevated text-text-secondary hover:bg-surface-inset hover:text-text-primary'
                        }`}
                      >
                        {displayName}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {commands.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
            Skills
          </p>
          <div className="flex flex-wrap gap-1.5">
            {commands.map(name => {
              const isSelected = selected?.name === name && selected.type === 'skill';
              return (
                <button
                  key={name}
                  type="button"
                  onClick={(): void => {
                    toggle(name, 'skill', name);
                  }}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    isSelected
                      ? 'bg-primary text-white'
                      : 'bg-surface-elevated text-text-secondary hover:bg-surface-inset hover:text-text-primary'
                  }`}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function HubPage(): ReactElement {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { codebases, selectedProjectId } = useProject();
  const [localProjectId, setLocalProjectId] = useState<string | null>(selectedProjectId);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [runMessage, setRunMessage] = useState('');
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [period, setPeriod] = useState<AnalyticsPeriod>('week');
  const [offset, setOffset] = useState(0);
  const messageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalProjectId(selectedProjectId);
  }, [selectedProjectId]);

  useEffect(() => {
    setOffset(0);
  }, [period]);

  useEffect(() => {
    if (selected) {
      requestAnimationFrame(() => {
        messageInputRef.current?.focus();
      });
    }
  }, [selected]);

  const selectedCwd = localProjectId
    ? codebases?.find(cb => cb.id === localProjectId)?.default_cwd
    : undefined;

  const {
    data: analytics,
    isLoading: analyticsLoading,
    isError: analyticsError,
  } = useQuery({
    queryKey: ['analyticsSummary'],
    queryFn: getAnalyticsSummary,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const { data: sessionData, isLoading: sessionsLoading } = useQuery({
    queryKey: ['analyticsSessions', period, offset],
    queryFn: () => listAnalyticsSessions(period, offset, SESSION_PAGE_SIZE),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const { data: allWorkflows = [] } = useQuery({
    queryKey: ['workflows', selectedCwd ?? null],
    queryFn: () => listWorkflows(selectedCwd),
  });

  const workflows = useMemo(
    () => (localProjectId ? allWorkflows.filter(e => e.source === 'project') : allWorkflows),
    [allWorkflows, localProjectId]
  );

  const { data: commandEntries = [] } = useQuery({
    queryKey: ['commands', selectedCwd ?? null],
    queryFn: () => listCommands(selectedCwd),
  });

  const commands = useMemo(
    () =>
      commandEntries.filter(e => (localProjectId ? e.source === 'project' : true)).map(e => e.name),
    [commandEntries, localProjectId]
  );

  const { data: runsData } = useQuery({
    queryKey: ['dashboardRuns', { limit: 10, forHub: true }],
    queryFn: () => listDashboardRuns({ limit: 10 }),
    refetchInterval: 5_000,
  });
  const recentRuns = runsData?.runs ?? [];
  const sessions = sessionData?.sessions ?? [];
  const canGoBack = offset > 0;
  const canGoForward = sessionData ? offset + SESSION_PAGE_SIZE < sessionData.total : false;

  async function handleRun(): Promise<void> {
    if (!selected || !runMessage.trim() || running) return;
    setRunning(true);
    setRunError(null);

    let conversationId: string | undefined;
    let started = false;
    try {
      ({ conversationId } = await createConversation(localProjectId ?? undefined));

      if (selected.type === 'workflow') {
        await runWorkflow(selected.name, conversationId, runMessage.trim());
      } else {
        await sendMessage(conversationId, `/${selected.name} ${runMessage.trim()}`);
      }

      started = true;
      setRunMessage('');
      setSelected(null);
      void queryClient.invalidateQueries({ queryKey: ['dashboardRuns'] });
      void queryClient.invalidateQueries({ queryKey: ['analyticsSummary'] });
      void queryClient.invalidateQueries({ queryKey: ['analyticsSessions'] });
      void navigate(`/chat/${conversationId}`);
    } catch (error) {
      setRunError(
        error instanceof Error ? `Failed to start: ${error.message}` : 'Failed to start.'
      );
      if (conversationId !== undefined && !started) {
        void deleteConversation(conversationId).catch(() => undefined);
      }
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-auto bg-background p-4 md:p-6">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-4">
          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
            <div>
              <h1 className="text-2xl font-semibold text-text-primary">Stats</h1>
              <p className="mt-1 text-sm text-text-tertiary">
                Claude and Codex usage, latest chats, and launch controls in one view.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text-tertiary">
              <Bot className="size-4 text-text-secondary" />
              {analytics?.generatedAt
                ? `Updated ${timeAgo(analytics.generatedAt)} ago`
                : 'Awaiting analytics'}
            </div>
          </div>

          {analyticsError && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
              Analytics is not available yet. The syncer will populate this after it scans Claude
              and Codex logs.
            </div>
          )}

          <UsageSummary summary={analytics} />

          <div className="rounded-lg border border-border bg-surface p-3">
            <div className="mb-3 flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
              <div className="flex items-center gap-2">
                <MessageSquareText className="size-4 text-text-tertiary" />
                <div>
                  <h2 className="text-sm font-medium text-text-primary">Latest Chats</h2>
                  <p className="text-xs text-text-tertiary">
                    User prompts only, with model, tools, token split, project path, and duration.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="grid grid-cols-2 rounded-md border border-border bg-surface-elevated p-0.5">
                  {(['week', 'month'] as const).map(value => (
                    <button
                      key={value}
                      type="button"
                      onClick={(): void => {
                        setPeriod(value);
                      }}
                      className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                        period === value
                          ? 'bg-primary text-primary-foreground'
                          : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                      }`}
                    >
                      {value === 'week' ? 'Week' : 'Month'}
                    </button>
                  ))}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!canGoBack}
                  onClick={(): void => {
                    setOffset(Math.max(0, offset - SESSION_PAGE_SIZE));
                  }}
                >
                  <ChevronLeft className="size-3.5" />
                </Button>
                <span className="min-w-24 text-center text-xs text-text-tertiary">
                  {sessionData
                    ? `${String(offset + 1)}-${String(Math.min(offset + SESSION_PAGE_SIZE, sessionData.total))} / ${String(sessionData.total)}`
                    : '0 / 0'}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!canGoForward}
                  onClick={(): void => {
                    setOffset(offset + SESSION_PAGE_SIZE);
                  }}
                >
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            </div>
            <SessionEffectiveness sessions={sessions} />
            <div className="mt-3">
              {sessionsLoading || analyticsLoading ? (
                <div className="flex min-h-32 items-center justify-center rounded-lg border border-border bg-surface-elevated text-xs text-text-tertiary">
                  <Loader2 className="mr-2 size-3.5 animate-spin" />
                  Loading sessions
                </div>
              ) : (
                <SessionTable sessions={sessions} />
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="mb-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2">
                  <TerminalSquare className="size-4 text-text-tertiary" />
                  <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                    Quick Launch
                  </p>
                </div>
                <select
                  value={localProjectId ?? ''}
                  onChange={(e): void => {
                    setLocalProjectId(e.target.value || null);
                    setSelected(null);
                  }}
                  className="rounded-md border border-border bg-surface-elevated px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value="">All (global + bundled)</option>
                  {codebases?.map(cb => (
                    <option key={cb.id} value={cb.id}>
                      {cb.name}
                    </option>
                  ))}
                </select>
              </div>
              <QuickLaunch
                workflows={workflows}
                commands={commands}
                onSelect={s => {
                  setSelected(s);
                  setRunMessage('');
                  setRunError(null);
                }}
                selected={selected}
              />
            </div>

            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="mb-3 flex items-center gap-2">
                <Clock className="size-4 text-text-tertiary" />
                <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Recent Runs
                </p>
              </div>
              <RecentRuns runs={recentRuns} />
            </div>
          </div>
        </div>
      </div>

      {selected && (
        <div className="shrink-0 animate-slide-up border-t border-accent/40 bg-surface-elevated px-4 py-3 shadow-[0_-4px_20px_rgba(59,130,246,0.15)]">
          <div className="flex items-center gap-3">
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-xs text-text-tertiary">
                {selected.type === 'skill' ? 'Skill' : 'Workflow'}
              </span>
              <span className="text-sm font-medium text-text-primary">{selected.displayName}</span>
              <button
                type="button"
                onClick={(): void => {
                  setSelected(null);
                  setRunMessage('');
                  setRunError(null);
                }}
                className="rounded p-0.5 text-text-tertiary transition-colors hover:text-text-primary"
                title="Dismiss"
              >
                <X className="size-3.5" />
              </button>
            </div>

            <select
              value={localProjectId ?? ''}
              onChange={(e): void => {
                setLocalProjectId(e.target.value || null);
              }}
              className="w-40 shrink-0 rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="">No project</option>
              {codebases?.map(cb => (
                <option key={cb.id} value={cb.id}>
                  {cb.name}
                </option>
              ))}
            </select>

            <input
              ref={messageInputRef}
              type="text"
              value={runMessage}
              onChange={(e): void => {
                setRunMessage(e.target.value);
              }}
              placeholder={
                selected.type === 'skill'
                  ? `Arguments for /${selected.name}...`
                  : 'Enter a message for this workflow...'
              }
              className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
              onKeyDown={(e): void => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleRun();
                }
              }}
              disabled={running}
            />

            <Button
              size="sm"
              onClick={(): void => {
                void handleRun();
              }}
              disabled={running || !runMessage.trim()}
            >
              {running ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Play className="size-3.5" />
              )}
              Run
            </Button>
          </div>
          {runError && <p className="mt-1 text-xs text-error">{runError}</p>}
        </div>
      )}
    </div>
  );
}
