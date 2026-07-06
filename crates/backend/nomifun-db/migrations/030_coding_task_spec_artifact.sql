-- CodingTask + SpecArtifact MVP (v0.1.10)
--
-- These tables provide the traceability spine for conversation-bound coding
-- work without changing the existing Agent runtime loop.

CREATE TABLE IF NOT EXISTS coding_tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    workspace_path TEXT,
    profile TEXT NOT NULL DEFAULT 'hs_8bit_mcu'
        CHECK(profile IN ('hs_8bit_mcu', 'generic_coding')),
    target_chip TEXT,
    project_type TEXT NOT NULL DEFAULT 'new_code',
    status TEXT NOT NULL DEFAULT 'created'
        CHECK(status IN (
            'created',
            'clarifying',
            'spec_ready',
            'planning',
            'tasks_ready',
            'generating',
            'verifying',
            'completed',
            'failed',
            'cancelled'
        )),
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
    kind TEXT NOT NULL
        CHECK(kind IN ('requirement', 'spec', 'plan', 'tasks', 'checklist', 'acceptance', 'trace')),
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
