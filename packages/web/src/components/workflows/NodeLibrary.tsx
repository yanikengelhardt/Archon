import { useState, useMemo } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { groupCommandsBySource } from '@/lib/command-groups';
import type { CodebaseSkill, CommandEntry } from '@/lib/api';

interface NodeLibraryProps {
  commands: CommandEntry[];
  skills: CodebaseSkill[];
  isLoading: boolean;
}

const NODE_TYPE_COLORS: Record<string, string> = {
  command: 'bg-node-command',
  prompt: 'bg-node-prompt',
  bash: 'bg-node-bash',
  skill: 'bg-node-prompt',
};

function onDragStart(
  e: React.DragEvent,
  type: 'command' | 'prompt' | 'bash' | 'skill',
  name: string
): void {
  e.dataTransfer.setData('application/reactflow-type', type);
  e.dataTransfer.setData('application/reactflow-command', name);
  e.dataTransfer.effectAllowed = 'move';
}

function LoadingSkeleton(): React.ReactElement {
  return (
    <div className="flex flex-col gap-2 p-2">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="h-7 rounded-md bg-surface-elevated animate-pulse" />
      ))}
    </div>
  );
}

function DraggableItem({
  type,
  name,
  displayName,
}: {
  type: 'command' | 'prompt' | 'bash' | 'skill';
  name: string;
  displayName: string;
}): React.ReactElement {
  return (
    <div
      draggable
      onDragStart={(e): void => {
        onDragStart(e, type, name);
      }}
      className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-dashed border-border hover:border-accent hover:bg-accent/5 cursor-grab text-xs text-text-primary"
    >
      <span className={cn('w-2 h-2 rounded-full shrink-0', NODE_TYPE_COLORS[type])} />
      <span className="font-mono truncate">{displayName}</span>
    </div>
  );
}

function CollapsibleSection({
  title,
  count,
  defaultOpen,
  children,
}: {
  title: string;
  count: number;
  defaultOpen: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={(): void => {
          setOpen(!open);
        }}
        className="flex items-center gap-1 px-1 py-1 text-[10px] font-medium text-text-tertiary uppercase tracking-wide hover:text-text-secondary"
      >
        <span className="text-text-tertiary">{open ? '\u25BE' : '\u25B8'}</span>
        <span>{title}</span>
        <span className="text-text-tertiary ml-auto">({count})</span>
      </button>
      {open && <div className="flex flex-col gap-1 pl-1">{children}</div>}
    </div>
  );
}

function groupSkillsByCategory(
  skills: CodebaseSkill[]
): { name: string; skills: CodebaseSkill[] }[] {
  const byCategory = new Map<string, CodebaseSkill[]>();
  for (const skill of skills) {
    const category = skill.category || 'Project Skills';
    const list = byCategory.get(category);
    if (list) {
      list.push(skill);
    } else {
      byCategory.set(category, [skill]);
    }
  }

  return [...byCategory.entries()]
    .map(([name, items]) => ({
      name,
      skills: items.sort((a, b) => a.displayName.localeCompare(b.displayName)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function NodeLibrary({ commands, skills, isLoading }: NodeLibraryProps): React.ReactElement {
  const [search, setSearch] = useState('');

  const groups = useMemo(() => groupCommandsBySource(commands), [commands]);
  const skillCategories = useMemo(() => groupSkillsByCategory(skills), [skills]);

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return groups;
    const term = search.toLowerCase();
    return groups
      .map(group => ({
        ...group,
        commands: group.commands.filter(cmd => cmd.name.toLowerCase().includes(term)),
      }))
      .filter(group => group.commands.length > 0);
  }, [groups, search]);

  const filteredSkillCategories = useMemo(() => {
    if (!search.trim()) return skillCategories;
    const term = search.toLowerCase();
    return skillCategories
      .map(cat => ({
        ...cat,
        skills: cat.skills.filter(
          skill =>
            skill.name.toLowerCase().includes(term) ||
            skill.displayName.toLowerCase().includes(term) ||
            skill.description.toLowerCase().includes(term)
        ),
      }))
      .filter(cat => cat.skills.length > 0);
  }, [skillCategories, search]);

  const showQuickNodes =
    !search.trim() ||
    'prompt'.includes(search.toLowerCase()) ||
    'bash'.includes(search.toLowerCase());

  return (
    <div className="flex flex-col h-full overflow-hidden border-r border-border bg-surface">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border">
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">
          Node Library
        </h3>
        <input
          type="text"
          value={search}
          onChange={(e): void => {
            setSearch(e.target.value);
          }}
          placeholder="Search..."
          className="w-full rounded-md border border-border bg-surface-elevated px-2 py-1 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      {isLoading ? (
        <LoadingSkeleton />
      ) : (
        <ScrollArea className="flex-1 overflow-hidden">
          <div className="flex flex-col gap-2 p-2">
            {/* Quick Nodes */}
            {showQuickNodes && (
              <CollapsibleSection title="Quick Nodes" count={2} defaultOpen>
                <DraggableItem type="prompt" name="Prompt" displayName="Prompt" />
                <DraggableItem type="bash" name="Shell" displayName="Bash" />
              </CollapsibleSection>
            )}

            {/* Skill categories */}
            {filteredSkillCategories.map(category => (
              <CollapsibleSection
                key={`skills-${category.name}`}
                title={`Skills: ${category.name}`}
                count={category.skills.length}
                defaultOpen={category.name === 'Project Skills'}
              >
                {category.skills.map(skill => (
                  <DraggableItem
                    key={skill.name}
                    type="skill"
                    name={skill.name}
                    displayName={skill.displayName}
                  />
                ))}
              </CollapsibleSection>
            ))}

            {/* Command categories */}
            {filteredGroups.map(group => (
              <CollapsibleSection
                key={group.source}
                title={group.label}
                count={group.commands.length}
                defaultOpen={group.source === 'project'}
              >
                {group.commands.map(cmd => (
                  <DraggableItem
                    key={cmd.name}
                    type="command"
                    name={cmd.name}
                    displayName={cmd.name}
                  />
                ))}
              </CollapsibleSection>
            ))}

            {filteredGroups.length === 0 &&
              filteredSkillCategories.length === 0 &&
              !showQuickNodes && (
                <p className="text-xs text-text-tertiary px-2 py-4 text-center">
                  No matching nodes
                </p>
              )}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
