use serde::{Deserialize, Serialize};

/// Row mapping for the `coding_tasks` table.
///
/// JSON columns are intentionally kept as strings at the DB layer. API/service
/// layers can deserialize them into typed values without making persistence
/// responsible for schema evolution.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct CodingTaskRow {
    pub id: String,
    pub title: String,
    pub workspace_path: Option<String>,
    pub profile: String,
    pub target_chip: Option<String>,
    pub project_type: String,
    pub status: String,
    pub selected_agent_id: Option<String>,
    pub backend: Option<String>,
    pub conversation_id: Option<i64>,
    pub selected_knowledge_scopes: String,
    pub metadata: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct SpecArtifactRow {
    pub id: String,
    pub coding_task_id: String,
    pub kind: String,
    pub title: String,
    pub content: String,
    pub format: String,
    pub status: String,
    pub trace_links: String,
    pub metadata: String,
    pub created_at: String,
    pub updated_at: String,
}
