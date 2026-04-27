import { readdir, readFile } from 'fs/promises';
import type { Dirent } from 'fs';
import { basename, join, relative, sep } from 'path';

export type SkillSource = 'agents' | 'codex' | 'claude';

export interface CodebaseSkill {
  name: string;
  displayName: string;
  description: string;
  category: string;
  source: SkillSource;
  sources: SkillSource[];
  path: string;
}

interface SkillRoot {
  source: SkillSource;
  path: string;
}

interface DiscoveredSkill extends CodebaseSkill {
  priority: number;
}

const MAX_SKILL_DEPTH = 3;

function titleCaseSegment(segment: string): string {
  return segment
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(part =>
      part.toLowerCase() === 'seo' ? 'SEO' : part.charAt(0).toUpperCase() + part.slice(1)
    )
    .join(' ');
}

function inferCategory(categoryParts: string[]): string {
  if (categoryParts.length > 0) {
    return categoryParts.map(titleCaseSegment).join(' / ');
  }

  return 'Project Skills';
}

function parseFrontmatter(content: string): Record<string, string> {
  if (!content.startsWith('---')) return {};

  const end = content.indexOf('\n---', 3);
  if (end === -1) return {};

  const fields: Record<string, string> = {};
  const block = content.slice(3, end).trim();
  for (const line of block.split('\n')) {
    const match = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(line.trim());
    if (!match) continue;
    fields[match[1]] = match[2].replace(/^["']|["']$/g, '').trim();
  }
  return fields;
}

async function readSkill(
  skillDir: string,
  root: SkillRoot,
  priority: number
): Promise<DiscoveredSkill | null> {
  const skillPath = join(skillDir, 'SKILL.md');
  let content: string;
  try {
    content = await readFile(skillPath, 'utf-8');
  } catch {
    return null;
  }

  const metadata = parseFrontmatter(content);
  const name = metadata.name || basename(skillDir);
  const relDir = relative(root.path, skillDir);
  const parts = relDir.split(sep).filter(Boolean);
  const categoryParts = parts.length > 1 ? parts.slice(0, -1) : [];
  const displayName = titleCaseSegment(name);

  return {
    name,
    displayName,
    description: metadata.description ?? '',
    category: inferCategory(categoryParts),
    source: root.source,
    sources: [root.source],
    path: skillDir,
    priority,
  };
}

async function collectSkillsFromRoot(
  root: SkillRoot,
  dir: string,
  depth: number,
  priority: number,
  out: DiscoveredSkill[]
): Promise<void> {
  const skill = await readSkill(dir, root, priority);
  if (skill) {
    out.push(skill);
    return;
  }

  if (depth >= MAX_SKILL_DEPTH) return;

  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true, encoding: 'utf8' });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    await collectSkillsFromRoot(root, join(dir, entry.name), depth + 1, priority, out);
  }
}

function dedupeSkills(skills: DiscoveredSkill[]): CodebaseSkill[] {
  const byName = new Map<string, DiscoveredSkill>();

  for (const skill of skills) {
    const existing = byName.get(skill.name);
    if (!existing) {
      byName.set(skill.name, skill);
      continue;
    }

    existing.sources = [...new Set([...existing.sources, skill.source])];
    if (skill.priority < existing.priority) {
      byName.set(skill.name, { ...skill, sources: existing.sources });
    }
  }

  return [...byName.values()]
    .map(({ priority: _priority, ...skill }) => skill)
    .sort(
      (a, b) => a.category.localeCompare(b.category) || a.displayName.localeCompare(b.displayName)
    );
}

export async function discoverCodebaseSkills(cwd: string): Promise<CodebaseSkill[]> {
  const roots: SkillRoot[] = [
    { source: 'agents', path: join(cwd, '.agents', 'skills') },
    { source: 'codex', path: join(cwd, '.codex', 'skills') },
    { source: 'claude', path: join(cwd, '.claude', 'skills') },
  ];

  const discovered: DiscoveredSkill[] = [];
  for (const [priority, root] of roots.entries()) {
    await collectSkillsFromRoot(root, root.path, 0, priority, discovered);
  }

  return dedupeSkills(discovered);
}
