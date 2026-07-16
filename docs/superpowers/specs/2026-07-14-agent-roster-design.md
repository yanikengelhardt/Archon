# Agent Roster — Design Spec

**Date:** 2026-07-14
**Status:** Approved by Yanik (brainstorming session)
**Scope:** Sub-project B of the "agent factory" program. Defines the consistent, named
agents (model shortcuts + personas) that all later factory workflows consume.

## Program context

The larger goal is a personal "factory": agentic workflows that write and test tools
(e.g. Python SEO analysis scripts) via a build-agent → deterministic-validator loop,
with Archon as the harness. The program is decomposed into four specs:

- **A — Factory core:** the reusable build→validate Archon workflow (next spec; consumes this roster)
- **B — Agent roster:** THIS spec
- **C — Herdr integration:** interactive orchestration surface (deferred; Herdr can only be
  controlled from inside a Herdr pane — Archon cannot ping it from outside)
- **D — semantic-drift-analyzer:** the Finanztip taxonomy/classification system (own spec later)

## Decisions made during brainstorming

1. Roster first, workflows second — no workflow wiring in this spec.
2. **Pi is the AI backend** for the chore lane (`ft/coder`); Archon is the harness
   (orchestration, isolation, approval gates, audit). `@fable`/`@opus` run on the
   native `claude` provider (Claude models are not usable through Pi on this machine).
   **Amended during implementation:** `@sol`/`@terra`/`@luna-low` run on the native
   `codex` provider — Archon embeds the Pi SDK as an in-process library (pinned
   `^0.79.1`), NOT the installed `pi` CLI (0.80.6), and 0.79.x has no `openai-codex`
   backend. Revisit Pi-managed codex lanes when Archon's Pi SDK reaches ≥0.80.
   Bonus: alias-level `effort` routes correctly for the codex provider.
3. Feasibility verified on this machine (pi 0.80.6): `anthropic/claude-fable-5`,
   `anthropic/claude-opus-4-8`, `openai-codex/gpt-5.6-{sol,terra,luna}` (rides the
   Codex subscription via Pi's `openai-codex` backend), and `ft/coder` (Finanztip-hosted
   model registered in `~/.pi/agent/models.json`) are all available.
4. Three orchestrator shortcuts (Fable 5, Codex 5.6 Sol, Opus 4.8) — pick per invocation.
5. Teamleads are domain-scoped and all run `gpt-5.6-terra`; specialists are the workers
   and all run `gpt-5.6-luna` effort low; `ft/coder` is the chore lane.
6. backoffice ≠ wordpress: backoffice = internal Finanztip pages (PHP, Symfony, HTML);
   wordpress = PSR-4 plugin work. Separate specialists.
7. SEO code vs. data split: `agent-seo-coder` writes scripts and never interprets results;
   `agent-seo-analyst` interprets results and never writes code.
8. **No `.archon/` folders inside project repos.** Everything lives under `~/.archon/`.
   Repo knowledge comes from each repo's existing `AGENTS.md`, which Pi reads natively.

## Architecture

An "agent" = **model shortcut** + **persona**, combined at the point of use.

1. **Model shortcuts** — Archon `@aliases` in `~/.archon/config.yaml`, each mapping a
   memorable name to a Pi model ref (+ effort). Usable anywhere a model can be set:
   workflow YAML, per-node overrides, chat, CLI.
2. **Personas** — markdown command files in `~/.archon/commands/`, one per agent,
   carrying identity, scope, hard rules, and output expectations. Loaded automatically
   by Archon for every repo (home-scoped commands).

A workflow node becomes an agent by pairing both:
`command: agent-lead-seo` + `model: "@terra"`.

There is deliberately **no orchestrator agent in headless workflows** — Archon's DAG
engine is the orchestrator. The `@fable`/`@sol`/`@opus` shortcuts exist for interactive
and chat use, and for the later Herdr spec (C).

Pi ownership boundary: Pi owns model access and auth (`~/.pi/agent/auth.json`,
`~/.pi/agent/models.json`, `settings.json`). Archon reads Pi config, never writes it.
The `pi` TUI keeps working unchanged.

## Footprint (complete)

```
~/.archon/config.yaml            # + aliases: and tiers: blocks
~/.archon/commands/agent-*.md    # 9 persona files
seo-research/.archon/workflows/agent-roster-smoke.yaml   # one-time smoke test
```

Project repos stay untouched — with one discovered exception: **home-scoped
(global) workflows reject `@custom` aliases** (Archon portability rule: global
workflows may only use `small`/`medium`/`large` tiers or literal model strings).
The smoke test therefore lives in seo-research (which already had
`.archon/workflows/`). Consequence for spec A: factory workflows either live in
a project `.archon/workflows/` (full `@alias` access) or, if home-scoped, use
tier keywords — which is why the tiers above mirror the alias lanes.

## Model shortcuts (`~/.archon/config.yaml`)

```yaml
aliases:   # AS IMPLEMENTED (verified refs)
  "@fable":    { provider: claude, model: claude-fable-5 }           # orchestrator — verified live ("OK fable")
  "@sol":      { provider: codex, model: gpt-5.6-sol, effort: high } # orchestrator
  "@opus":     { provider: claude, model: claude-opus-4-8 }          # orchestrator
  "@terra":    { provider: codex, model: gpt-5.6-terra, effort: high }  # all teamleads
  "@luna-low": { provider: codex, model: gpt-5.6-luna, effort: low }    # all specialists
  "@chore":    { provider: pi, model: ft/coder }                     # chore lane (endpoint is VPN-only)

tiers:   # tier keywords resolve to the same lanes; ALSO the only model refs
         # allowed in home-scoped workflows (see constraint below)
  small:  { provider: pi, model: ft/coder }
  medium: { provider: codex, model: gpt-5.6-luna }
  large:  { provider: codex, model: gpt-5.6-terra, effort: high }
```

Implementation caveats to verify:

- Whether `effort` values are accepted for the `pi` provider by Archon's alias
  validation (`isEffortValidForProvider`). If not, effort moves to the node level
  (`thinking:`/`effort:`) and the alias carries model only.
- `ft/coder` has `supportsReasoningEffort: false` in `models.json` — `@chore`
  must never carry an effort setting.
- Exact claude model ref strings for `@fable`/`@opus` (`fable-5` vs `claude-fable-5`,
  `opus-4-8` vs `claude-opus-4-8`) — verify what Archon's claude provider accepts.

## Personas (`~/.archon/commands/`)

All nine files are home-scoped (available in every repo). Naming: `agent-*.md`.

### Template

```markdown
# Agent: <name>

## Identity
You are <name>, the <role> for <domain>. You are always this agent when invoked —
consistent behavior across sessions is your core property.

## Scope
- What this agent does.
- What this agent explicitly does NOT do (hand back instead).

## Hard rules
- Domain rules (standards, conventions, forbidden actions).
- Always follow the repository's AGENTS.md — it overrides anything here on conflict.

## Output expectations
- What a finished result looks like (format, artifacts, done-criteria).

## Task
$ARGUMENTS
```

### Roster

**Teamleads** (model: `@terra`) — break a goal into tasks, review specialist output,
act as quality gate. They do not implement.

| File | Domain |
|---|---|
| `agent-lead-seo.md` | Local/SEO development: seo-research, semantic-drift-analyzer, seo.text-network-analysis, seo-yanik vault |
| `agent-lead-backoffice.md` | Internal Finanztip pages: PHP, Symfony, HTML (ds.backoffice-chatbot, web.experience-portal, backoffice repos) |
| `agent-lead-ds.md` | datascience.chatbot backend: Django, Python |

**Specialists = the workers** (model: `@luna-low`) — implement tasks handed to them.

| File | Identity |
|---|---|
| `agent-seo-coder.md` | Writes/fixes Python analysis scripts (pandas/polars, clustering, API data wrangling). Never interprets results. |
| `agent-seo-analyst.md` | Interprets data and results, writes findings/reports. Never writes code. |
| `agent-wordpress.md` | PSR-4-compliant WordPress plugin implementations. Rarely used, always identical rules. |
| `agent-backoffice.md` | PHP/Symfony/HTML implementations for internal Finanztip pages. |
| `agent-ds-chatbot.md` | datascience.chatbot specialist. Thin persona: defers to that repo's AGENTS.md for structure/rules; carries only stable identity + review posture. |
| `agent-ui-design.md` | UI implementations under the fixed design rules + colorsets (rules referenced/embedded in the persona file — single place to update). |

**Chore lane** (model: `@chore`, Pi `ft/coder`) — boilerplate, renames, scaffolding,
formatting. No dedicated persona file needed initially; workflows use `@chore` with
inline prompts. Add `agent-chore.md` later only if repeated instructions emerge (YAGNI).

Persona bodies are first drafts, written during implementation and refined over time —
they are plain markdown files owned by Yanik.

## Usage

Workflow node (primary surface; what spec A consumes):

```yaml
nodes:
  - id: breakdown
    command: agent-lead-seo      # persona
    model: "@terra"              # shortcut → pi openai-codex/gpt-5.6-terra, effort high
    args: ["$ARGUMENTS"]

  - id: implement
    depends_on: [breakdown]
    command: agent-seo-coder
    model: "@luna-low"
    args: ["$breakdown.output"]
```

Chat/CLI: `@aliases` work anywhere a model can be set; personas are invocable as commands.

## Validation & error handling

- `bun run cli validate commands` and `bun run cli validate workflows` must pass
  after files land.
- **Smoke test:** `~/.archon/workflows/agent-roster-smoke.yaml` — one trivial node per
  lane (`@terra`, `@luna-low`, `@chore`, one orchestrator alias), run once to prove
  alias resolution + Pi auth per backend (anthropic, openai-codex, ft).
- Missing Pi credentials surface as `pi.auth_missing` breadcrumbs in the run log.
- Fail-fast stance: a typo'd alias fails at workflow load; no silent fallback to a
  default model.

## Addendum (2026-07-15): personas moved to Pi-native home

Course correction after re-scoping the program: **ad-hoc daily work happens in
Herdr + Pi directly; Archon is only for deterministic, unattended pipelines.**
Consequences, implemented same day:

- **Personas now live in `~/.pi/agent/personas/agent-*.md`** (migrated 1:1 from
  `~/.archon/commands/`, minus the Archon `$ARGUMENTS` footer). Global — zero
  per-repo maintenance; repo rules still come from each repo's AGENTS.md, which
  Pi auto-discovers.
- **Launcher: `pia <agent>` shell function** (in `~/.zshrc`) — spawns a
  persona-bound Pi with the right model+thinking, e.g. `pia seo-coder` →
  `pi --model "openai-codex/gpt-5.6-luna:low" --append-system-prompt
  ~/.pi/agent/personas/agent-seo-coder.md`. Extra lanes: `pia chore` (ft/coder),
  `pia orc` (gpt-5.6-sol:high, orchestrator). Persona injection smoke-verified
  via ft backend ("I am seo-coder … I never interpret results").
- **`pi-herdr` installed globally** (`npm:@andrewjacop/pi-herdr`): a Pi session
  becomes the orchestrator that spawns/drives agents in visible Herdr panes
  (herdr_start_agent / send_prompt / wait / delegate). End-to-end pane test is
  done inside a Herdr session (macOS: launch herdr from the terminal, not
  brew services — PATH issue).
- The Archon files (aliases/tiers, `~/.archon/commands/`, smoke workflow) stay
  as-is — they serve the pipeline use case only (spec A), and Archon does NOT
  consume the Pi personas.

## Out of scope

- The build→validate factory workflow (spec A — next).
- Herdr integration (spec C).
- semantic-drift-analyzer taxonomy/classification design (spec D).
- Per-repo `.archon/` setups, Pi extensions/skills per agent, and an `agent-chore.md`
  persona — all deferred until a concrete need appears.

## Open items — resolution log (implementation, 2026-07-14)

1. ~~Confirm `effort` validity for `pi` aliases~~ **Resolved:** pi alias effort is
   accepted at write time but dropped at runtime with a `dag.preset_effort_unsupported`
   warning (`routePresetEffort` routes only claude/codex). Moot for the final setup:
   the codex-provider aliases carry effort natively; `@chore` (pi) carries none.
2. ~~Confirm Anthropic auth path~~ **Resolved:** `@fable` runs on the native claude
   provider (binary at `/opt/homebrew/bin/claude`, global auth) — smoke-verified live.
3. Claude model refs: `claude-fable-5` verified working; `claude-opus-4-8` assumed
   by pattern (same scheme), not yet smoke-tested.

## Final verification (2026-07-14) — ALL LANES GREEN

`agent-roster-smoke` completed successfully: `OK fable` (13.3s), `OK terra` (12.8s),
`OK luna` (10.1s), `OK chore` (10.2s, on VPN — the ft endpoint is VPN-only).

Two environment fixes were needed along the way:
- The bun-linked `archon` CLI runs repo source; merge conflicts in the working tree
  take the whole CLI down until resolved.
- After merging upstream, `bun install` must be re-run: a stale `node_modules`
  (`@openai/codex-sdk` 0.139 vs lockfile 0.144.4) made the codex provider spawn an
  old client, which the API rejects for gpt-5.6 models ("requires a newer version
  of Codex") even though the system `codex` binary was current — in dev mode the
  SDK uses its node_modules-bundled binary, never the system one.
