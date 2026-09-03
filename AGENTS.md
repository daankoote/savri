# ENVAL Execution Contract

## Global inheritance and ENVAL priority

The global golden engineering, orchestration, testing, documentation-governance,
and reporting rules in the effective global `AGENTS.md` apply unchanged. This
repository contract extends them with ENVAL-specific correctness. ENVAL rules may
strengthen the global baseline but never silently weaken or contradict it; the
explicit current task further bounds authorized work.

When ENVAL concerns compete, prioritize in this order:

1. law and official NEa authority;
2. auditability;
3. correctness;
4. security and Auth;
5. contracts;
6. customer/operator journey and UI; and
7. performance and cost.

ENVAL documentation status is explicit: `CURRENT PROVEN`, `TARGET`, `DRAFT`,
`UNKNOWN`, `LEGACY`, and `PROOF ONLY`. A TARGET design becomes CURRENT PROVEN
only after implementation and its required green proof. Documentation wording
alone never promotes implementation status.

## HARD frontend engineering gates

These are architecture gates, not style preferences. A frontend batch is
incomplete when it violates them.

### KISS is the default

- Minimize screens, navigation, tabs, controls, dialogs, statuses, steps,
  explanatory text, duplicated information, and abstractions without a proven
  current need.
- Show an actor only what is needed for the current task, not everything the
  backend knows.
- Customer UI is task/status-first and extremely simple. Tenant Operator UI is
  action/decision-first, not implementation-detail-first. ENVAL Control is
  metadata/platform-health-first, not tenant-data-first.

### Do not invent UI copy

- Do not invent unrequested headings, paragraphs, marketing or explanatory
  copy, helper text, tooltips, microcopy, compliance claims, legal wording, or
  extra status labels.
- Copy priority is: explicitly approved Daan copy; CURRENT canonical existing
  copy; then minimum strictly necessary functional, access, or error wording.
- When new functional wording is technically required, keep it minimal, report
  it explicitly, and never create persuasive, legal, or marketing wording.
- Never silently add text as a UX improvement.

### CRITICAL mandatory modular UI reuse

Before every frontend implementation, inspect the applicable existing
components, modules, helpers, hooks, services, shells, navigation, headers,
footers, forms and fields, buttons, tables/lists, cards, statuses, notices,
errors, empty states, dialogs, document/evidence and upload components, layout
primitives, CSS, tokens, and responsive patterns.

Mandatory order:

1. reuse an existing component/module as-is;
2. extend the shared component through props or configuration;
3. compose existing primitives;
4. add a narrow shared modifier or token; and
5. only then create a component/module for a genuinely new responsibility.

A difference in columns, labels, spacing, state, icon, actions, or responsive
behavior does not justify another near-identical primitive. Do not independently
create another Button, Card, Table, FormRow, input wrapper, StatusPill,
StatusDot, PageHeader, Sidebar, Shell, Notice, EmptyState, ErrorState,
DocumentCard, or UploadCard when an existing primitive can be extended.

Inline CSS and page-local one-off style objects are forbidden. Do not duplicate
a CSS selector family to avoid changing a shared component. Use, in order, an
existing token/class, a modifier, a reusable shared class, and only then new CSS
for a genuinely new reusable responsibility. Arbitrary tenant CSS, JavaScript,
HTML, and per-tenant frontend forks are forbidden.

### Mandatory frontend pre-flight and evidence

Before coding, report:

- `EXISTING_COMPONENTS_INSPECTED`
- `EXISTING_MODULES_INSPECTED`
- `EXISTING_CSS_INSPECTED`
- `EXISTING_TOKENS_INSPECTED`
- `EXISTING_LAYOUT_PATTERNS_INSPECTED`

After implementation, report:

- `REUSED_AS_IS`
- `EXTENDED_EXISTING`, with the reason
- `COMPOSED_EXISTING`
- `NEW_COMPONENTS`, with each genuinely new responsibility
- `NEW_MODULES`, with each genuinely new responsibility
- `NEW_CSS`, including why current reusable CSS was insufficient
- `INLINE_CSS=NONE`
- `NEAR_DUPLICATE_COMPONENT_INTRODUCED=NO`
- `NEAR_DUPLICATE_CSS_INTRODUCED=NO`

Any new table, card, form, button, header, shell, or status primitive additionally
requires `EXISTING_PRIMITIVE_INSUFFICIENT_BECAUSE`; without that justification,
the batch is incomplete.

For material frontend business/data interaction, also report:

- `UI_BUSINESS_LOGIC_ADDED` (`NONE` expected, otherwise justify)
- `DIRECT_DB_COUPLING_ADDED=NO`
- `PROVIDER_SPECIFIC_UI_COUPLING_ADDED=NO`
- `APPLICATION_CONTRACT_REUSED`
- `API_INTEGRATION_READINESS_PRESERVED=YES`

## Source routing

- Start with `docs/app/00_CANON.md`; it is the authority and navigation index.
- Then read only the task-relevant CURRENT contract, `01_SYSTEM_MAP.md`,
  `04_TODO.md` gate, NEa authority, proof, or tool source.
- Current code, schema, migrations, tests, and green proofs outrank stale docs.
- TARGET, DRAFT, PROOF ONLY, UNKNOWN, and LEGACY never become CURRENT by inference.
- This file routes execution; it is not product, legal, security, or architecture canon.

## Inspect before modify

- Before building, inspect existing modules, components, helpers, services, CSS,
  design tokens, layout patterns, callers, and relevant database objects.
- Reuse existing patterns and keep one responsibility per module.
- Do not duplicate helpers, services, business logic, CSS, or near-equivalent modules.
- Do not use inline CSS. Prefer tokens, shared classes, composition, and modifiers.
- Keep a small coherent fileset; avoid cosmetic refactors outside the task.
- Preserve unrelated and dirty worktree changes exactly.

## Desktop-safe repository inspection

- For routine source and documentation inspection, prefer available native
  repository, file, search, and read capabilities for locating files, searching
  symbols or text, reading ranges or docs, and inspecting existing components,
  modules, CSS, tokens, and patterns.
- Do not use shell `rg`, `sed`, pipelines, or compound commands merely for
  repository browsing when an equivalent native capability is available.
- Reserve Terminal for work that genuinely requires command execution, including
  approved verification wrappers, tests, proofs, builds, deterministic Git
  evidence, Docker or local-service safe lanes, and other explicitly approved
  deterministic commands. This routing does not restrict normal in-scope edits.
- Do not perform ceremonial or redundant preflight checks. Optional evidence must
  not create a human interruption when trusted equivalent evidence already exists.

## Execution governance and permission routing

- The sandbox remains the primary execution boundary. Project rules and hooks
  narrow and route commands inside that boundary; they do not replace it.
- Deterministic Bash hooks classify complete commands as `ALLOW`, `DENY`, or
  `DEFER`. `PreToolUse` owns hard deterministic denial before execution.
  `PermissionRequest` approves proven-safe `ALLOW` requests, denies deterministic
  human gates, and leaves residual eligible `DEFER` cases to the normal approval
  flow and Auto-review.
- Hard human gates are never delegated to Auto-review. Coarse exec policy must not
  forbid a mixed command family when a complete proven-safe read in that family
  needs semantic hook classification; ambiguous families remain prompt-gated or
  deferred, while known mutations are denied.
- No generic shell authority, Full Access, danger-full-access, yolo, or approval/
  sandbox bypass is permitted for autonomous ENVAL execution.
- Product implementation batches must not tune permissions, rules, hooks, or
  execution governance in scope. Such changes require a separately authorized
  governance batch.

## Application and integration boundary

- UI consumes explicit typed presentation/application DTOs and mutation command
  contracts. It does not own business decisions, use database rows as domain/UI
  contracts, perform direct browser business writes, or know database, Storage,
  or provider-specific internals.
- Reuse server-authoritative application/domain capabilities through narrow
  ports and adapters where a real responsibility exists. Do not mechanically
  add service layers for static presentation or pre-build unused API machinery.
- Future tenant CRM, ERP, BI, and provider integrations must enter through
  versioned, tenant-bound integration adapters and reuse the same application
  capabilities and provider-neutral core as the UI.
- External integrations never receive direct database access, RLS bypass,
  service-role credentials, cross-data-plane credentials, or another tenant's
  identifiers/data. Server-side tenant resolution precedes business execution.

## Truth and safety boundaries

- Observed, derived, parser, browser, or external data never mutates core truth by itself.
- Preserve provenance; never infer legal, security, evidence, identity, authority,
  eligibility, verification, or acceptance status from convenience data.
- Use forward-only migrations. Do not delete or retire anything without dependency,
  caller, data, migration, rollback, retention, and audit evidence.
- Migration apply, reset, cleanup, deploy, remote mutation, and remote SQL are
  consequential and never autonomous.
- Safe local read-only SQL/catalog/introspection proofs may be autonomous when scoped,
  output-safe, and required. Local mutation remains human-gated.
- Never print secrets, tokens, credentials, JWTs, signed URLs, private identifiers, or PII.

## Git boundary

- Autonomous read-only Git is limited to `status`, `diff`, `diff --stat`,
  `diff --check`, `log`, `show`, `branch`, and `rev-parse`.
- Codex must not autonomously run `git add`, `commit`, `push`, `merge`, `rebase`,
  `cherry-pick`, `revert`, `reset`, `clean`, or `stash`.
- Daan owns staging decisions, commits, pushes, and all consequential history changes.

## Task and iteration shape

- Stable execution governance belongs in `AGENTS.md`, `.codex/rules`,
  `.codex/hooks`, and canonical tooling, not repeated product prompts.
- A future ChatGPT-to-Codex batch handoff contains only its task-specific delta:
  Goal, relevant current state, in/out of scope, acceptance, test tier,
  task-specific human stop conditions, and task-specific return requirements.
- Do not repeatedly restate permanent governance in each batch handoff.
- Default to small bounded batches: one problem or invariant where practical.
- Avoid giant multi-feature changes, broad refactors, and unrelated cleanup.

## Web search boundary

- Ordinary autonomous ENVAL product batches have web search disabled by default
  through the canonical batch launcher.
- A governance or research task may explicitly use cached web search when current
  external documentation is genuinely required. Live web access requires an
  explicit task need.
- Never include secrets, credentials, private customer data, or PII in search
  queries. Hosted web-search capability is separate from shell and sandbox-network
  authority; enabling one never grants the other.

## Bounded batch operations

- `scripts/tools/enval-batch.mjs` is the canonical normal batch launch path. Daan
  supplies only the batch slug; manual branch/worktree/Codex launch composition is
  reserved for explicit recovery or debugging.
- The launcher uses the current clean `main` HEAD, keeps `main` as the protected
  integration worktree, creates one leaf branch and worktree per implementation
  batch, prevents stale governance bases, and starts a separate interactive Codex
  CLI session with Auto-review and product web search disabled.
- The launcher never commits, merges, pushes, deploys, or cleans up a batch.
- Within an approved bounded batch, Codex owns routine deterministic terminal,
  permitted local SQL, test, proof, diff/status, and permitted local-service
  evidence. Daan is not the default relay for those commands.
- Once Daan or ChatGPT approves a bounded batch, Codex may continue autonomously
  through its in-scope inspection, implementation, diagnosis, repair, and
  appropriate Tier A or Tier B checks until acceptance is met or a defined human
  stop condition is reached.
- Every batch stops at its own acceptance boundary. Codex does not automatically
  continue into the next roadmap or product task.
- Daan retains manual browser and product acceptance; material product,
  architecture, security, and permission decisions; and commit, push, merge,
  deploy, remote, and destructive authority.
- Parallel product implementation is not enabled. Before it can be considered,
  one substantive approximately one-to-three-hour autonomous ENVAL product batch
  must complete without routine-execution interruptions. A later Daan or ChatGPT
  pilot may authorize at most two concurrent implementation worktrees: `main`
  remains the protected integration base; each run uses its own branch, Git
  worktree, and Codex session; write and authority cones are sufficiently disjoint;
  mutable local services, ports, databases, and fixtures are isolated; merging is
  never automatic; and combined integration requires a human gate.

## Verification strategy

- Classify verification before running it:
  - Tier A is the default after each small implementation step. Identify changed
    layers, affected shared dependencies/callers and realistic regression risks,
    then run the minimum targeted checks that cover that risk cone.
  - Tier B is the logical-batch gate for a coherent feature or workstream slice.
    Run the relevant broader regression, build, browser, SQL/security and
    integration checks only where that batch changed or depends on them.
  - Tier C is release-grade/full validation. Use it only for release/deploy
    readiness, a major cross-cutting architecture milestone, explicit Daan/ChatGPT
    instruction, or evidence from lower tiers that materially broadens risk.
- A normal local commit is not automatically Tier B or Tier C.
- Documentation-only work uses targeted document/reference/consistency checks and
  no runtime suite unless an executable contract changed.
- Run a build only when bundling, imports, runtime boundaries or a logical frontend
  batch make build coverage useful. Small visual/copy changes use targeted
  frontend/static checks; defer responsive/browser proof to the coherent UI batch
  unless interaction, Auth or data flow requires it earlier.
- RLS, authorization, capabilities, tenant boundaries, signing, OTP,
  finalization/replay, schema/migrations, immutable history, locks, evidence
  independence, corrections, parser authority and platform-support boundaries
  require heavier Tier A coverage or an earlier Tier B gate, not unrelated suites.
- Within one logical batch, reuse a green expensive check while its relevant
  production code, shared dependencies, proof/test, schema/migration and
  configuration/environment remain unchanged. Re-run it when that risk cone changes.
- Never reduce regression quality for speed; reduce latency by selecting checks,
  reusing valid green evidence and avoiding duplicate execution.

## Failure loop guard

- Do not repeat an identical failing command more than twice without a new
  hypothesis or changed condition.
- Every retry must state the hypothesis or condition being tested.
- After bounded attempts, report the exact failure, hypotheses tested, changes
  attempted, likely root cause and recommended next action. Stop for direction
  before materially expanding scope or risk.

## Architecture and documentation sync

- Reconcile architecture/docs only when a canon/invariant, ownership boundary,
  architectural dependency, security/Auth model or CURRENT/TARGET workstream status
  materially changes. Small implementation details do not trigger documentation churn.

## Terminal ownership

- Codex normally verifies branch/HEAD/status, runs targeted tests and typecheck,
  runs a build when required, performs static searches, reviews the scoped diff,
  and reports `diff --check`, diffstat, and final status.
- Do not make Daan copy/paste the same safe deterministic terminal or SQL checks.

## Final evidence

Report compactly:

- changed/new files;
- reused modules and CSS, plus any new module and its reason;
- `TEST_TIER_USED`, changed layers, regression risks, targeted checks and results;
- valid previously-green checks reused, broader checks intentionally excluded, and
  whether Tier B or Tier C is required now with a reason;
- diff-check and diffstat;
- remaining risks and intentionally deferred gates;
- staged state and final Git status.
