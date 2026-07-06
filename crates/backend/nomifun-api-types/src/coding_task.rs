use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
pub struct CodingTaskCreateRequest {
    pub title: String,
    #[serde(default)]
    pub workspace_path: Option<String>,
    #[serde(default)]
    pub profile: Option<String>,
    #[serde(default)]
    pub target_chip: Option<String>,
    #[serde(default)]
    pub project_type: Option<String>,
    #[serde(default)]
    pub selected_agent_id: Option<String>,
    #[serde(default)]
    pub backend: Option<String>,
    #[serde(default)]
    pub conversation_id: Option<i64>,
    #[serde(default)]
    pub selected_knowledge_scopes: Vec<String>,
    #[serde(default)]
    pub metadata: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CodingTaskResponse {
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
    pub selected_knowledge_scopes: Vec<String>,
    pub metadata: serde_json::Value,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ListCodingTasksQuery {
    #[serde(default)]
    pub limit: Option<u32>,
    #[serde(default)]
    pub offset: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SpecArtifactUpsertRequest {
    pub title: String,
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub format: Option<String>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub trace_links: Vec<String>,
    #[serde(default)]
    pub metadata: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SpecArtifactResponse {
    pub id: String,
    pub coding_task_id: String,
    pub kind: String,
    pub title: String,
    pub content: String,
    pub format: String,
    pub status: String,
    pub trace_links: Vec<String>,
    pub metadata: serde_json::Value,
    pub created_at: String,
    pub updated_at: String,
}
