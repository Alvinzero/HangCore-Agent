# CodingTask + SpecArtifact MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `v0.1.10` MVP that stores coding tasks, structured Spec Kit artifacts, and conversation bindings without changing the existing Agent runtime loop.

**Architecture:** Keep NomiFun as the desktop/backend shell and keep 8位MCU Profile as a Kun-backed ACP Agent. Add a small persistence and API layer for CodingTask / SpecArtifact, then surface the saved Spec / Plan / Tasks inside the conversation workflow. This release creates the traceability spine that later MCU toolchain runs, approvals, and 32-bit profiles will reuse.

**Tech Stack:** Tauri 2, Rust 2024, SQLite / sqlx, Axum routes, React 19, TypeScript, Bun, existing conversation and Agent APIs.

---

## Scope

### In `v0.1.10`

- Create durable `coding_tasks` and `spec_artifacts` tables.
- Add Rust API types, repository methods, and app routes.
- Bind a CodingTask to `conversation_id`, `workspace_path`, selected Agent, selected knowledge scopes, and MCU profile metadata.
- Add a minimal conversation-side Spec / Plan / Tasks panel.
- Preserve existing Agent loop behavior: `backend = "kun"` and `agent_builtin_kun` still run through `kun-acp-adapter`.

### Out Of Scope

- No MCU compiler execution.
- No flashing / burning workflow.
- No automatic code repair loop.
- No 32位MCU Profile seed or duplicate `backend = "kun"` Agent.
- No enterprise server-side CodingTask service.

## File Structure

- Modify `crates/backend/nomifun-db/migrations/001_baseline.sql`: add baseline schema for fresh installs.
- Create `crates/backend/nomifun-db/migrations/030_coding_task_spec_artifact.sql`: migrate existing installs.
- Create `crates/backend/nomifun-db/src/models/coding_task.rs`: database row models.
- Create `crates/backend/nomifun-db/src/repository/sqlite_coding_task.rs`: SQLite repository implementation.
- Modify `crates/backend/nomifun-db/src/models/mod.rs`, `crates/backend/nomifun-db/src/repository/mod.rs`, and `crates/backend/nomifun-db/src/lib.rs`: export new modules.
- Create `crates/backend/nomifun-api-types/src/coding_task.rs`: public API request / response structs.
- Modify `crates/backend/nomifun-api-types/src/lib.rs`: export API module.
- Create `crates/backend/nomifun-app/src/coding_task_routes.rs`: Axum route handlers.
- Modify `crates/backend/nomifun-app/src/lib.rs` and route composition files: mount `/api/coding-tasks`.
- Create `crates/backend/nomifun-db/tests/coding_task_repository.rs`: repository tests.
- Create `crates/backend/nomifun-app/tests/coding_task_e2e.rs`: route tests.
- Create `ui/src/common/types/codingTask.ts`: frontend types matching API contracts.
- Create `ui/src/renderer/pages/conversation/components/CodingTaskPanel.tsx`: minimal panel.
- Create `ui/src/renderer/pages/conversation/components/CodingTaskPanel.test.tsx`: rendering and state tests.
- Modify the conversation page shell/header component that owns right-side or auxiliary panels: mount `CodingTaskPanel` without disrupting current chat flow.
- Modify `ui/src/renderer/services/i18n/locales/zh-CN/conversation.json` and `ui/src/renderer/services/i18n/locales/en-US/conversation.json`: add UI copy.

## Data Contract

`coding_tasks.status` values:

```text
created
clarifying
spec_ready
planning
tasks_ready
generating
verifying
completed
failed
cancelled
```

`coding_tasks.profile` values for this release:

```text
hs_8bit_mcu
generic_coding
```

`spec_artifacts.kind` values:

```text
requirement
spec
plan
tasks
checklist
acceptance
trace
```

## Task 1: Database Schema

**Files:**

- Modify: `crates/backend/nomifun-db/migrations/001_baseline.sql`
- Create: `crates/backend/nomifun-db/migrations/030_coding_task_spec_artifact.sql`

- [ ] **Step 1: Add a failing migration test**

Add `crates/backend/nomifun-db/tests/coding_task_repository.rs` with a test that initializes the database and asserts both tables exist.

Run:

```bash
cargo test -p nomifun-db coding_task_schema
```

Expected: fail because `coding_tasks` and `spec_artifacts` do not exist yet.

- [ ] **Step 2: Add migration schema**

Create `030_coding_task_spec_artifact.sql` with:

```sql
CREATE TABLE IF NOT EXISTS coding_tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    workspace_path TEXT,
    profile TEXT NOT NULL DEFAULT 'hs_8bit_mcu',
    target_chip TEXT,
    project_type TEXT NOT NULL DEFAULT 'new_code',
    status TEXT NOT NULL DEFAULT 'created',
    selected_agent_id TEXT,
    backend TEXT,
    conversation_id INTEGER REFERENCES conversations(id) ON DELETE SET NULL,
    selected_knowledge_scopes TEXT NOT NULL DEFAULT '[]',
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_coding_tasks_conversation_id ON coding_tasks(conversation_id);
CREATE INDEX IF NOT EXISTS idx_coding_tasks_status_updated ON coding_tasks(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_coding_tasks_profile ON coding_tasks(profile);

CREATE TABLE IF NOT EXISTS spec_artifacts (
    id TEXT PRIMARY KEY,
    coding_task_id TEXT NOT NULL REFERENCES coding_tasks(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    format TEXT NOT NULL DEFAULT 'markdown',
    status TEXT NOT NULL DEFAULT 'draft',
    trace_links TEXT NOT NULL DEFAULT '[]',
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE(coding_task_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_spec_artifacts_task_kind ON spec_artifacts(coding_task_id, kind);
CREATE INDEX IF NOT EXISTS idx_spec_artifacts_updated ON spec_artifacts(updated_at);
```

- [ ] **Step 3: Mirror schema into baseline**

Add the same tables and indexes to `001_baseline.sql` so fresh installs and migrated installs match.

- [ ] **Step 4: Run schema verification**

Run:

```bash
cargo test -p nomifun-db coding_task_schema
```

Expected: pass.

## Task 2: Repository And Models

**Files:**

- Create: `crates/backend/nomifun-db/src/models/coding_task.rs`
- Create: `crates/backend/nomifun-db/src/repository/sqlite_coding_task.rs`
- Modify: `crates/backend/nomifun-db/src/models/mod.rs`
- Modify: `crates/backend/nomifun-db/src/repository/mod.rs`
- Modify: `crates/backend/nomifun-db/src/lib.rs`
- Test: `crates/backend/nomifun-db/tests/coding_task_repository.rs`

- [ ] **Step 1: Write repository tests**

Cover these cases:

- creating a task with `conversation_id`
- listing tasks by most recent update
- upserting a `spec` artifact
- upserting `tasks` again updates the existing `(coding_task_id, kind)` row
- deleting a task cascades its artifacts

Run:

```bash
cargo test -p nomifun-db coding_task_repository
```

Expected: fail before repository implementation exists.

- [ ] **Step 2: Add row models**

Define `CodingTaskRow` and `SpecArtifactRow` with string JSON columns preserved as strings at the DB layer. Do not parse JSON in the low-level row model.

- [ ] **Step 3: Add repository methods**

Expose methods:

```rust
create_task(input) -> CodingTaskRow
get_task(id) -> Option<CodingTaskRow>
list_tasks(limit, offset) -> Vec<CodingTaskRow>
update_task_status(id, status) -> Option<CodingTaskRow>
upsert_artifact(input) -> SpecArtifactRow
list_artifacts(coding_task_id) -> Vec<SpecArtifactRow>
delete_task(id) -> bool
```

- [ ] **Step 4: Run repository verification**

Run:

```bash
cargo test -p nomifun-db coding_task_repository
```

Expected: pass.

## Task 3: API Types And App Routes

**Files:**

- Create: `crates/backend/nomifun-api-types/src/coding_task.rs`
- Modify: `crates/backend/nomifun-api-types/src/lib.rs`
- Create: `crates/backend/nomifun-app/src/coding_task_routes.rs`
- Modify: `crates/backend/nomifun-app/src/lib.rs`
- Test: `crates/backend/nomifun-app/tests/coding_task_e2e.rs`

- [ ] **Step 1: Write route tests**

Cover:

- `POST /api/coding-tasks`
- `GET /api/coding-tasks`
- `GET /api/coding-tasks/{id}`
- `PUT /api/coding-tasks/{id}/artifacts/{kind}`
- `GET /api/coding-tasks/{id}/artifacts`

Run:

```bash
cargo test -p nomifun-app coding_task
```

Expected: fail before routes are mounted.

- [ ] **Step 2: Add API contracts**

Use request and response types with these fields:

```text
CodingTaskCreateRequest:
title, workspace_path, profile, target_chip, project_type, selected_agent_id,
backend, conversation_id, selected_knowledge_scopes, metadata

CodingTaskResponse:
id, title, workspace_path, profile, target_chip, project_type, status,
selected_agent_id, backend, conversation_id, selected_knowledge_scopes,
metadata, created_at, updated_at

SpecArtifactUpsertRequest:
title, content, format, status, trace_links, metadata
```

- [ ] **Step 3: Add route handlers**

Return normal project response wrappers used elsewhere in `nomifun-app`; keep validation conservative:

- reject empty task title
- reject unknown artifact kind
- default `profile` to `hs_8bit_mcu`
- default `project_type` to `new_code`

- [ ] **Step 4: Run route verification**

Run:

```bash
cargo test -p nomifun-app coding_task
```

Expected: pass.

## Task 4: Conversation Binding

**Files:**

- Modify route or service files that create conversations.
- Modify frontend send / conversation creation integration only where needed.
- Test: `crates/backend/nomifun-app/tests/coding_task_e2e.rs`

- [ ] **Step 1: Add a binding test**

Create a conversation, create a CodingTask with that `conversation_id`, then fetch the task and assert the link remains.

Run:

```bash
cargo test -p nomifun-app coding_task_conversation_binding
```

Expected: fail until binding read/write path is wired.

- [ ] **Step 2: Preserve existing conversation flow**

Do not require every conversation to have a CodingTask. CodingTask is optional and additive.

- [ ] **Step 3: Run binding verification**

Run:

```bash
cargo test -p nomifun-app coding_task_conversation_binding
cargo test -p nomifun-conversation kun_backend
```

Expected: both pass.

## Task 5: Frontend Minimal Panel

**Files:**

- Create: `ui/src/common/types/codingTask.ts`
- Create: `ui/src/renderer/pages/conversation/components/CodingTaskPanel.tsx`
- Create: `ui/src/renderer/pages/conversation/components/CodingTaskPanel.test.tsx`
- Modify: conversation page shell/header owner component
- Modify: `ui/src/renderer/services/i18n/locales/zh-CN/conversation.json`
- Modify: `ui/src/renderer/services/i18n/locales/en-US/conversation.json`

- [ ] **Step 1: Write component tests**

Cover:

- empty state says no coding task is bound
- existing task shows title, status, profile, selected agent
- artifacts render tabs for Spec, Plan, Tasks

Run:

```bash
bun test ui/src/renderer/pages/conversation/components/CodingTaskPanel.test.tsx
```

Expected: fail before component exists.

- [ ] **Step 2: Add types and API helper**

Keep types aligned with `nomifun-api-types/src/coding_task.rs`. Use existing HTTP / IPC bridge conventions rather than adding a new client style.

- [ ] **Step 3: Add panel UI**

Panel requirements:

- no page-level marketing copy
- compact status and profile display
- editable artifact area can be read-only for MVP if API wiring is not ready in this task
- no nested cards

- [ ] **Step 4: Mount without disrupting chat**

Mount as an optional conversation-side panel or toolbar drawer. The default chat experience must still work for normal conversations with no CodingTask.

- [ ] **Step 5: Run frontend verification**

Run:

```bash
bun test ui/src/renderer/pages/conversation/components/CodingTaskPanel.test.tsx
bun run typecheck
bun run check
```

Expected: pass, allowing existing i18n flattened-key warnings if still present.

## Task 6: Release Prep

**Files:**

- Modify: `CHANGELOG.md`
- Modify: `docs/hangshun/implementation/release-policy.md`
- Modify: `任务进度清单.md`
- Modify version files via `bun run bump 0.1.10`

- [ ] **Step 1: Run full targeted verification**

Run:

```bash
cargo test -p nomifun-db coding_task
cargo test -p nomifun-app coding_task
cargo test -p nomifun-conversation kun_backend
bun test ui/src/renderer/pages/conversation/components/CodingTaskPanel.test.tsx
bun run typecheck
bun run check
git diff --check
```

Expected: all pass.

- [ ] **Step 2: Commit implementation**

Use:

```bash
git commit -m "feat(coding-task): 实现 CodingTask 与 SpecArtifact MVP"
```

- [ ] **Step 3: Commit release version**

Use:

```bash
git commit -m "chore(release): 发布 0.1.10 CodingTask MVP"
```

- [ ] **Step 4: Publish release**

Push `main`, create tag `v0.1.10`, then verify Release assets:

- `HangCore.Agent_0.1.10_x64-setup.exe`
- `HangCore.Agent_0.1.10_x64-setup.exe.sig`
- `latest.json`
- `latest.json.version = 0.1.10`

## Acceptance Checklist

- [ ] User can create or bind a CodingTask without breaking normal conversations.
- [ ] User can save and view Spec / Plan / Tasks artifacts.
- [ ] CodingTask records the selected Agent and conversation link.
- [ ] 8位MCU Profile still uses the existing Kun runtime loop.
- [ ] No MCU compile / flash command can run in this version.
- [ ] Windows Release `v0.1.10` publishes `.exe`, `.sig`, and `latest.json`.
