import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Loader2 } from 'lucide-react';
import {
  getHubStats,
  listWorkflows,
  listCommands,
  listDashboardRuns,
  createConversation,
  runWorkflow,
  sendMessage,
  deleteConversation,
  type HubStats,
  type DashboardRunResponse,
} from '@/lib/api';
import type { WorkflowListEntry } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useProject } from '@/contexts/ProjectContext';
import {
  CATEGORIES,
  getWorkflowCategory,
  getWorkflowDisplayName,
  type WorkflowCategory,
} from '@/lib/workflow-metadata';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function statusDot(status: DashboardRunResponse['status']): React.ReactElement {
  const cls =
    status === 'running' || status === 'pending'
      ? 'bg-primary animate-pulse'
      : status === 'completed'
        ? 'bg-emerald-500'
        : status === 'paused'
          ? 'bg-amber-400'
          : 'bg-error';
  return <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${cls}`} />;
}

// ─── Stats Cards ─────────────────────────────────────────────────────────────

function StatsCards({ stats }: { stats: HubStats | undefined }): React.ReactElement {
  const today = stats?.today;
  const week = stats?.week;

  const successRate =
    week && week.completed + week.failed > 0
      ? Math.round((week.completed / (week.completed + week.failed)) * 100)
      : null;

  const todayTokens = today ? today.tokens_input + today.tokens_output : 0;
  const weekTokens = week ? week.tokens_input + week.tokens_output : 0;

  const cards = [
    {
      label: 'Today',
      primary: today ? String(today.runs) : '—',
      secondary: todayTokens > 0 ? `${formatTokens(todayTokens)} tokens` : 'no runs yet',
    },
    {
      label: 'This Week',
      primary: week ? String(week.runs) : '—',
      secondary: weekTokens > 0 ? `${formatTokens(weekTokens)} tokens` : 'no runs yet',
    },
    {
      label: 'Success Rate',
      primary: successRate !== null ? `${successRate}%` : '—',
      secondary:
        week && week.completed + week.failed > 0
          ? `${week.completed} completed, ${week.failed} failed`
          : 'no data',
    },
    {
      label: 'Active Now',
      primary: stats ? String(stats.today.runs - stats.today.completed - stats.today.failed) : '—',
      secondary: 'running / pending',
    },
  ];

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
      {cards.map(card => (
        <div
          key={card.label}
          className="rounded-lg border border-border bg-surface-elevated p-4 flex flex-col gap-1"
        >
          <span className="text-xs font-medium text-text-tertiary uppercase tracking-wide">
            {card.label}
          </span>
          <span className="text-2xl font-semibold text-text-primary">{card.primary}</span>
          <span className="text-xs text-text-tertiary">{card.secondary}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Recent Runs Sidebar ──────────────────────────────────────────────────────

function RecentRuns({ runs }: { runs: DashboardRunResponse[] }): React.ReactElement {
  const navigate = useNavigate();

  if (runs.length === 0) {
    return <p className="text-xs text-text-tertiary px-1 py-2">No recent runs yet.</p>;
  }

  return (
    <div className="space-y-1">
      {runs.map(run => (
        <button
          key={run.id}
          onClick={(): void => {
            if (run.conversation_id) void navigate(`/chat/${run.conversation_id}`);
          }}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-elevated transition-colors group"
        >
          {statusDot(run.status)}
          <span className="flex-1 min-w-0 text-xs text-text-primary truncate">
            {getWorkflowDisplayName(run.workflow_name)}
          </span>
          <span className="shrink-0 text-[10px] text-text-tertiary">{timeAgo(run.started_at)}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Quick Launch Section ─────────────────────────────────────────────────────

type SelectionType = 'workflow' | 'skill';
interface Selection {
  name: string;
  type: SelectionType;
  displayName: string;
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
}): React.ReactElement {
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
    if (selected?.name === name && selected?.type === type) {
      onSelect(null);
    } else {
      onSelect({ name, type, displayName });
    }
  }

  return (
    <div className="space-y-4">
      {/* Workflows */}
      {categories.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
            Workflows
          </p>
          <div className="space-y-2">
            {categories.map(cat => {
              const items = workflowsByCategory.get(cat) ?? [];
              return (
                <div key={cat} className="flex flex-wrap gap-1.5 items-center">
                  <span className="text-[10px] text-text-tertiary w-20 shrink-0">{cat}</span>
                  {items.map(entry => {
                    const displayName = getWorkflowDisplayName(entry.workflow.name);
                    const isSelected =
                      selected?.name === entry.workflow.name && selected?.type === 'workflow';
                    return (
                      <button
                        key={entry.workflow.name}
                        onClick={(): void => {
                          toggle(entry.workflow.name, 'workflow', displayName);
                        }}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                          isSelected
                            ? 'bg-primary text-white'
                            : 'bg-surface-elevated text-text-secondary hover:text-text-primary hover:bg-surface-inset'
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

      {/* Skills */}
      {commands.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
            Skills
          </p>
          <div className="flex flex-wrap gap-1.5">
            {commands.map(name => {
              const isSelected = selected?.name === name && selected?.type === 'skill';
              return (
                <button
                  key={name}
                  onClick={(): void => {
                    toggle(name, 'skill', name);
                  }}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    isSelected
                      ? 'bg-primary text-white'
                      : 'bg-surface-elevated text-text-secondary hover:text-text-primary hover:bg-surface-inset'
                  }`}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {workflows.length === 0 && commands.length === 0 && (
        <p className="text-xs text-text-tertiary">
          No workflows or skills found. Add definitions to{' '}
          <code className="text-[10px] bg-surface-inset px-1 py-0.5 rounded">
            .archon/workflows/
          </code>{' '}
          or{' '}
          <code className="text-[10px] bg-surface-inset px-1 py-0.5 rounded">
            .archon/commands/
          </code>
          .
        </p>
      )}
    </div>
  );
}

// ─── Hub Page ─────────────────────────────────────────────────────────────────

export function HubPage(): React.ReactElement {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { codebases, selectedProjectId } = useProject();
  const [localProjectId, setLocalProjectId] = useState<string | null>(selectedProjectId);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [runMessage, setRunMessage] = useState('');
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalProjectId(selectedProjectId);
  }, [selectedProjectId]);

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

  const { data: stats } = useQuery({
    queryKey: ['hubStats'],
    queryFn: getHubStats,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const { data: workflows = [] } = useQuery({
    queryKey: ['workflows', selectedCwd ?? null],
    queryFn: () => listWorkflows(selectedCwd),
  });

  const { data: commandEntries = [] } = useQuery({
    queryKey: ['commands', selectedCwd ?? null],
    queryFn: () => listCommands(selectedCwd),
  });
  const commands = useMemo(() => commandEntries.map(e => e.name), [commandEntries]);

  const { data: runsData } = useQuery({
    queryKey: ['dashboardRuns', { limit: 15, forHub: true }],
    queryFn: () => listDashboardRuns({ limit: 15 }),
    refetchInterval: 5_000,
  });
  const recentRuns = runsData?.runs ?? [];

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
      void queryClient.invalidateQueries({ queryKey: ['hubStats'] });
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
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Header */}
        <h1 className="text-lg font-semibold text-text-primary">Hub</h1>

        {/* Stats row */}
        <StatsCards stats={stats} />

        {/* Main content: Quick Launch + Recent Runs */}
        <div className="flex gap-6 min-h-0">
          {/* Quick Launch */}
          <div className="flex-1 min-w-0 rounded-lg border border-border bg-surface p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                Quick Launch
              </p>
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

          {/* Recent Runs */}
          <div className="w-64 shrink-0 rounded-lg border border-border bg-surface p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Recent Runs
            </p>
            <RecentRuns runs={recentRuns} />
          </div>
        </div>
      </div>

      {/* Sticky run bar */}
      {selected && (
        <div className="shrink-0 border-t border-accent/40 bg-surface-elevated px-4 py-3 animate-slide-up shadow-[0_-4px_20px_rgba(59,130,246,0.15)]">
          <div className="flex items-center gap-3">
            {/* Selection name + dismiss */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-text-tertiary">
                {selected.type === 'skill' ? 'Skill' : 'Workflow'}
              </span>
              <span className="text-sm font-medium text-text-primary">{selected.displayName}</span>
              <button
                onClick={(): void => {
                  setSelected(null);
                  setRunMessage('');
                  setRunError(null);
                }}
                className="p-0.5 rounded text-text-tertiary hover:text-text-primary transition-colors"
                title="Dismiss"
              >
                <X className="size-3.5" />
              </button>
            </div>

            {/* Project picker */}
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

            {/* Message input */}
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
              className="flex-1 min-w-0 px-3 py-1.5 rounded-md border border-border bg-surface text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
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
              {running ? <Loader2 className="size-3.5 animate-spin" /> : 'Run'}
            </Button>
          </div>
          {runError && <p className="text-xs text-error mt-1">{runError}</p>}
        </div>
      )}
    </div>
  );
}
