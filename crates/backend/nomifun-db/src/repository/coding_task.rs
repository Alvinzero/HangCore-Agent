use crate::error::DbError;
use crate::models::{CodingTaskRow, SpecArtifactRow};

#[derive(Debug, Clone)]
pub struct CreateCodingTaskParams {
    pub title: String,
    pub workspace_path: Option<String>,
    pub profile: String,
    pub target_chip: Option<String>,
    pub project_type: String,
    pub selected_agent_id: Option<String>,
    pub backend: Option<String>,
    pub conversation_id: Option<i64>,
    pub selected_knowledge_scopes: String,
    pub metadata: String,
}

#[derive(Debug, Clone)]
pub struct UpsertSpecArtifactParams {
    pub coding_task_id: String,
    pub kind: String,
    pub title: String,
    pub content: String,
    pub format: String,
    pub status: String,
    pub trace_links: String,
    pub metadata: String,
}

#[async_trait::async_trait]
pub trait ICodingTaskRepository: Send + Sync {
    async fn create_task(&self, input: CreateCodingTaskParams) -> Result<CodingTaskRow, DbError>;
    async fn get_task(&self, id: &str) -> Result<Option<CodingTaskRow>, DbError>;
    async fn list_tasks(&self, limit: u32, offset: u32) -> Result<Vec<CodingTaskRow>, DbError>;
    async fn update_task_status(
        &self,
        id: &str,
        status: &str,
    ) -> Result<Option<CodingTaskRow>, DbError>;
    async fn upsert_artifact(
        &self,
        input: UpsertSpecArtifactParams,
    ) -> Result<SpecArtifactRow, DbError>;
    async fn list_artifacts(&self, coding_task_id: &str) -> Result<Vec<SpecArtifactRow>, DbError>;
    async fn delete_task(&self, id: &str) -> Result<bool, DbError>;
}
