/**
 * Configuration types for Archon YAML config files
 *
 * Two levels:
 * - Global: ~/.archon/config.yaml (user preferences)
 * - Repository: .archon/config.yaml (project settings)
 */

/**
 * Global configuration (non-secret user preferences)
 * Located at ~/.archon/config.yaml
 */

// Provider config defaults — canonical definitions live in @archon/providers/types.
// Imported and re-exported here so existing consumers don't break.
import type {
  ClaudeProviderDefaults,
  CodexProviderDefaults,
  CopilotProviderDefaults,
  PiProviderDefaults,
  ProviderDefaultsMap,
} from '@archon/providers/types';
import type { RawAliasesConfig, RawTiersConfig } from '@archon/workflows/model-validation';

export type {
  ClaudeProviderDefaults,
  CodexProviderDefaults,
  CopilotProviderDefaults,
  PiProviderDefaults,
  ProviderDefaultsMap,
};
export type { RawAliasesConfig, RawTiersConfig };

/**
 * Per-model token rates in USD per 1,000,000 tokens.
 *
 * The buckets mirror `TokenUsage` and are DISJOINT — every provider normalises
 * `input` to fresh (non-cached) tokens, so a cached token is priced once, at
 * `cachedInput`, never also at `input`.
 */
export interface ModelRates {
  /** USD per 1M fresh input tokens. */
  input: number;
  /** USD per 1M output tokens. */
  output: number;
  /**
   * USD per 1M cached input tokens. Defaults to the `input` rate when omitted
   * — conservative, since a provider with no caching discount bills cached
   * tokens as ordinary input. Set it explicitly to claim the discount.
   */
  cachedInput?: number;
  /**
   * USD per 1M cache-write tokens. Defaults to the `input` rate, which is
   * correct for OpenAI-shaped providers (a cache write is ordinary input that
   * happens to get stored). Anthropic charges a premium and should set it.
   */
  cacheWrite?: number;
}

/**
 * Custom token pricing, used to estimate spend in credits for turns whose
 * provider does not report a usable cost — a subscription-backed backend
 * reports ~0, and negotiated rates differ from list price anyway.
 *
 * Rates are authored per model; `creditsPerUsd` converts the resulting dollar
 * figure into credits. Storing dollars plus one conversion factor (rather than
 * a tokens-per-credit column per bucket) keeps the two from drifting apart.
 */
export interface PricingConfig {
  /** Credits per 1 USD. Omitted means credits are not estimated. */
  creditsPerUsd?: number;
  /**
   * Rates keyed by model name. Lookup tries the resolved model string exactly,
   * then the segment after the last `/` — so `gpt-5.6-luna` matches both a
   * bare Codex model and Pi's `openai-codex/gpt-5.6-luna` ref.
   */
  models?: Record<string, ModelRates>;
}

/**
 * Intersection type: generic `ProviderDefaultsMap` (any string key) with
 * typed built-in entries.
 *
 * The built-in entries exist ONLY to give call sites like
 * `config.assistants.claude.model` IDE autocomplete without `as` casts.
 * They do NOT provide parser safety (each provider's `parseXxxConfig`
 * already takes `Record<string, unknown>` and defends itself).
 *
 * Community providers should NOT be added here — they live behind the
 * generic `[string]` index. Adding a new community provider must not
 * require a core-package type change; that's the whole point of Phase 2.
 */
export type AssistantDefaultsConfig = ProviderDefaultsMap & {
  claude?: ClaudeProviderDefaults;
  codex?: CodexProviderDefaults;
};

/**
 * Required variant — built-ins are always present after `loadConfig`.
 *
 * `getDefaults()` seeds every registered provider (built-in + community)
 * with `{}`, so community providers appear in the map too — just typed as
 * `ProviderDefaults` via the generic index rather than a specific shape.
 * `registerBuiltinProviders()` is called before `loadConfig()` at every
 * process entrypoint, so claude/codex are guaranteed present.
 */
export type AssistantDefaults = ProviderDefaultsMap & {
  claude: ClaudeProviderDefaults;
  codex: CodexProviderDefaults;
};

/**
 * Container isolation backend settings (folder projects only). Valid on both
 * global and repo config; repo overrides global per-field. Defaults are applied
 * when the CLI builds the backend config, not here (all fields optional).
 */
export interface ContainerConfig {
  /**
   * Runner image tag. Defaults to `archon-runner:latest` — the `build:runner-image`
   * script tags both `archon-runner:<version>` and `:latest`, and defaulting to
   * `:latest` avoids coupling to the dev-vs-binary version string. Pin an explicit
   * version tag here for reproducibility.
   * @default 'archon-runner:latest'
   */
  image?: string;

  /**
   * Container network mode. `none` disables egress; `bridge` is default NAT.
   * @default 'bridge'
   */
  network?: 'bridge' | 'none';

  /**
   * Hard memory cap in MiB (`docker run --memory <n>m`).
   * @default 4096
   */
  memoryMb?: number;

  /**
   * Process cap (`docker run --pids-limit <n>`) — a fork-bomb guard.
   * @default 512
   */
  pidsLimit?: number;

  /**
   * Opt folder projects into the container backend WITHOUT the `--container`
   * flag. The flag still wins when passed; workflow-level `container.enabled`
   * sits between the flag and this config default.
   * @default false
   */
  enabled?: boolean;
}

export interface GlobalConfig {
  /**
   * Bot display name (shown in messages)
   * @default 'Archon'
   */
  botName?: string;

  /**
   * Default AI assistant when no codebase-specific preference
   * @default 'claude'
   */
  defaultAssistant?: string;

  /**
   * Assistant-specific defaults (model, reasoning effort, etc.)
   */
  assistants?: AssistantDefaultsConfig;

  /**
   * Named model aliases accessible in workflow/node `model:` fields.
   * Keys must use `@<name>` prefix (e.g. `@cheap`) — bare names are not
   * reachable as aliases. Reserved names (enforced at runtime): small, medium, large.
   */
  aliases?: RawAliasesConfig;

  /**
   * Cross-provider model tier presets accessible as small/medium/large in
   * workflow/node `model:` fields.
   */
  tiers?: RawTiersConfig;

  /** Custom token pricing used to estimate credits spent per turn. */
  pricing?: PricingConfig;

  /**
   * Platform streaming preferences (can be overridden per conversation)
   */
  streaming?: {
    telegram?: 'stream' | 'batch';
    discord?: 'stream' | 'batch';
    slack?: 'stream' | 'batch';
  };

  /**
   * Directory preferences (usually not needed - defaults work well)
   */
  paths?: {
    /**
     * Override workspaces directory
     * @default '~/.archon/workspaces'
     */
    workspaces?: string;

    /**
     * Override worktrees directory
     * @default '~/.archon/worktrees'
     */
    worktrees?: string;
  };

  /**
   * Codebase routing rules for automatic project selection in chat conversations.
   * Evaluated when a new conversation has no codebase attached.
   *
   * Example (~/.archon/config.yaml):
   *   routing:
   *     defaultCodebase: seo-research
   *     codebases:
   *       - name: seo-yanik
   *         keywords: [news, artikel, obsidian, wissen]
   */
  routing?: RoutingConfig;

  /**
   * Direct-chat behavior (workflow invocation from chat, …)
   */
  chat?: ChatConfig;

  /**
   * Concurrency limits
   */
  concurrency?: {
    /**
     * Maximum concurrent AI conversations
     * @default 10
     */
    maxConversations?: number;
  };

  /**
   * Container isolation backend defaults (folder projects). Repo config
   * overrides these per-field.
   */
  container?: ContainerConfig;
}

/**
 * Repository configuration (project-specific settings)
 * Located at .archon/config.yaml in any repository
 */
export interface RepoConfig {
  /**
   * AI assistant preference for this repository
   * Overrides global default
   */
  assistant?: string;

  /**
   * Assistant-specific defaults for this repository
   */
  assistants?: AssistantDefaultsConfig;

  /** Repo-level model aliases — override global aliases with same name. */
  aliases?: RawAliasesConfig;

  /** Repo-level model tier presets — override global tiers with same name. */
  tiers?: RawTiersConfig;

  /** Repo-level pricing — overrides global rates per model key. */
  pricing?: PricingConfig;

  /**
   * Commands configuration
   */
  commands?: {
    /**
     * Custom command folder path (relative to repo root)
     * @default '.archon/commands'
     */
    folder?: string;

    /**
     * Auto-load commands on clone
     * @default true
     */
    autoLoad?: boolean;
  };

  /**
   * Worktree settings for this repository
   */
  worktree?: {
    /**
     * Base branch for worktrees (e.g., 'main', 'develop')
     * @default auto-detected from repo
     */
    baseBranch?: string;

    /**
     * Git-ignored files/directories to copy from main repo to new worktrees.
     * Tracked files are already in worktrees — only use this for git-ignored files.
     * @example [".env", ".archon", "data/fixtures/"]
     */
    copyFiles?: string[];

    /**
     * Initialize git submodules in new worktrees.
     * Runs `git submodule update --init --recursive` after worktree creation
     * when the repo contains a `.gitmodules` file. Repos without submodules
     * pay zero cost (the check short-circuits).
     *
     * Set to `false` to skip submodule init (e.g., when submodules are not
     * needed by any workflow or when fetch cost is prohibitive).
     * @default true
     */
    initSubmodules?: boolean;

    /**
     * Per-project worktree directory (relative to repo root). When set,
     * worktrees are created at `<repoRoot>/<path>/<branch>` instead of under
     * `~/.archon/worktrees/` or the workspaces layout.
     *
     * Opt-in — co-locates worktrees with the repo so they appear in the IDE
     * file tree. The user is responsible for adding the directory to their
     * `.gitignore` (no automatic file mutation).
     *
     * Path resolution precedence (highest to lowest):
     *   1. this `worktree.path` (repo-local)
     *   2. global `paths.worktrees` (absolute override in `~/.archon/config.yaml`)
     *   3. auto-detected project-scoped (`~/.archon/workspaces/owner/repo/...`)
     *   4. default global (`~/.archon/worktrees/`)
     *
     * Must be a safe relative path: no leading `/`, no `..` segments. Absolute
     * or escaping values fail loudly at worktree creation (Fail Fast — no silent
     * fallback).
     *
     * @example '.worktrees'
     */
    path?: string;

    /**
     * Git remote name for fetch/push operations.
     *
     * When set, all git operations (fetch, push, branch tracking) use this
     * remote instead of 'origin'. Useful for repos with multiple remotes or
     * non-standard naming conventions.
     *
     * When omitted, auto-detected: 'origin' if it exists, otherwise the sole
     * remote if only one is configured.
     *
     * @example 'upstream'
     */
    remote?: string;
  };

  /**
   * Documentation directory settings
   */
  docs?: {
    /**
     * Path to documentation directory (relative to repo root)
     * @default 'docs/'
     */
    path?: string;
  };

  /**
   * Container isolation backend settings for this repo (folder projects).
   * Overrides global `container` per-field.
   */
  container?: ContainerConfig;

  /**
   * Per-project environment variables injected into Claude SDK subprocess env.
   * Values here override process.env for workflow node execution.
   * Sensitive — do not commit actual secrets to version-controlled repos.
   */
  env?: Record<string, string>;

  /**
   * Direct-chat behavior for this repository. Overrides global `chat`.
   */
  chat?: ChatConfig;

  /**
   * Repo-owner-curated list of recommended workflow names, in display order.
   * Pinned on top of both the Workflows page and the sidebar run dropdown
   * under a "Recommended for this project" header. Names not matching any
   * discovered workflow are silently ignored (advisory).
   */
  recommendedWorkflows?: string[];

  /**
   * Default commands/workflows configuration
   */
  defaults?: {
    /**
     * Copy bundled default commands and workflows on clone
     * Set to false to skip copying defaults
     * @default true
     * @deprecated Use loadDefaultCommands/loadDefaultWorkflows instead
     */
    copyDefaults?: boolean;

    /**
     * Load app's bundled default commands at runtime
     * Set to false to only use repo-specific commands
     * @default true
     */
    loadDefaultCommands?: boolean;

    /**
     * Load app's bundled default workflows at runtime
     * Set to false to only use repo-specific workflows
     * @default true
     */
    loadDefaultWorkflows?: boolean;
  };
}

export interface ChatConfig {
  /**
   * Whether direct chat may start workflows. When false, the chat system
   * prompt omits the workflow catalog and routing rules, `/invoke-workflow`
   * emitted by the model is ignored, and the `manage_run` tool / run-management
   * CLI section are not injected. Deterministic slash commands typed by users
   * (`/workflow run …`) keep working. Repo config overrides global.
   * @default true
   */
  workflowInvocation?: boolean;
}

export interface CodebaseRoutingEntry {
  /** Codebase name as registered in Archon */
  name: string;
  /** Keywords that trigger routing to this codebase (case-insensitive substring match) */
  keywords: string[];
}

export interface RoutingConfig {
  /** Codebase name to use when no other routing rule matches */
  defaultCodebase?: string;
  /** Per-codebase keyword routing rules, evaluated in order */
  codebases?: CodebaseRoutingEntry[];
}

/**
 * Merged configuration (global + repo + env vars)
 * Environment variables take precedence
 */
export interface MergedConfig {
  botName: string;
  assistant: string;
  assistants: AssistantDefaults;
  /**
   * Merged aliases (repo > global). Used by buildAiProfile at execution time.
   * Undefined when no aliases are configured anywhere.
   */
  aliases?: RawAliasesConfig;
  /**
   * Merged model tiers (repo > global). Used by buildAiProfile at execution time.
   * Undefined when no tiers are configured anywhere.
   */
  tiers?: RawTiersConfig;

  /** Merged pricing (repo > global, per model key). */
  pricing?: PricingConfig;
  streaming: {
    telegram: 'stream' | 'batch';
    discord: 'stream' | 'batch';
    slack: 'stream' | 'batch';
  };
  paths: {
    workspaces: string;
    worktrees: string;
  };
  concurrency: {
    maxConversations: number;
  };
  commands: {
    /**
     * Additional command folder to search (relative to repo root)
     * Searched after .archon/commands/ but before .claude/commands/
     */
    folder?: string;
    autoLoad: boolean;
  };
  defaults: {
    copyDefaults: boolean;
    loadDefaultCommands: boolean;
    loadDefaultWorkflows: boolean;
  };
  /**
   * Base branch from repo config (worktree.baseBranch).
   * Used for $BASE_BRANCH substitution in workflow commands.
   * When undefined, workflows referencing $BASE_BRANCH will fail with an error.
   */
  baseBranch?: string;
  /**
   * Git remote name from repo config (worktree.remote).
   * When undefined, callers auto-detect at runtime via getDefaultRemote()
   * or fall back to 'origin'.
   */
  remote?: string;
  /**
   * Docs directory path from repo config (docs.path).
   * Used for $DOCS_DIR substitution in workflow commands.
   * @default 'docs/'
   */
  docsPath?: string;
  /**
   * Merged per-project env vars from .archon/config.yaml env: section.
   * DB env vars (from Web UI) are merged on top by executeWorkflow.
   * Undefined when no env vars are configured.
   */
  envVars?: Record<string, string>;

  /**
   * Codebase routing rules for automatic project selection.
   * Evaluated when a new conversation has no codebase attached.
   */
  routing?: RoutingConfig;

  /**
   * Direct-chat behavior (repo > global). See ChatConfig. The loader always
   * sets it; optional so hand-built partial configs (tests, embedders) keep
   * working — readers default `workflowInvocation` to true.
   */
  chat?: {
    workflowInvocation: boolean;
  };

  /**
   * Merged container backend settings (repo `container` over global `container`,
   * per-field). Raw optional fields — defaults are applied where the container
   * config is consumed (CLI folder branch). Undefined when nothing is configured.
   */
  container?: ContainerConfig;
}

/**
 * Safe subset of MergedConfig suitable for sending to web clients.
 * Excludes filesystem paths and any other server-internal fields.
 */
export interface SafeConfig {
  botName: string;
  assistant: string;
  assistants: ProviderDefaultsMap;
  streaming: {
    telegram: 'stream' | 'batch';
    discord: 'stream' | 'batch';
    slack: 'stream' | 'batch';
  };
  concurrency: {
    maxConversations: number;
  };
  defaults: {
    copyDefaults: boolean;
    loadDefaultCommands: boolean;
    loadDefaultWorkflows: boolean;
  };
  /** Configured small/medium/large tier presets (merged repo > global). */
  tiers?: RawTiersConfig;
  /**
   * Built-in tier presets for the current default provider (from
   * tier-defaults.json via buildAiProfile). Lets the editor show what an
   * unset tier resolves to without the web bundle importing @archon/workflows.
   */
  tierDefaults?: RawTiersConfig;
  /** Configured @custom model aliases (merged repo > global). Not secrets. */
  aliases?: RawAliasesConfig;
}
