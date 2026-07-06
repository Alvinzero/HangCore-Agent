use nomifun_common::generate_prefixed_id;
use sqlx::SqlitePool;

use crate::error::DbError;
use crate::models::{CodingTaskRow, SpecArtifactRow};
use crate::repository::coding_task::{
    CreateCodingTaskParams, ICodingTaskRepository, UpsertSpecArtifactParams,
};

#[derive(Clone, Debug)]
pub struct SqliteCodingTaskRepository {
    pool: SqlitePool,
}

impl SqliteCodingTaskRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

#[async_trait::async_trait]
impl ICodingTaskRepository for SqliteCodingTaskRepository {
    async fn create_task(&self, input: CreateCodingTaskParams) -> Result<CodingTaskRow, DbError> {
        let id = generate_prefixed_id("ctask");
        sqlx::query(
            "INSERT INTO coding_tasks (\
                id, title, workspace_path, profile, target_chip, project_type, \
                selected_agent_id, backend, conversation_id, selected_knowledge_scopes, metadata\
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&id)
        .bind(&input.title)
        .bind(&input.workspace_path)
        .bind(&input.profile)
        .bind(&input.target_chip)
        .bind(&input.project_type)
        .bind(&input.selected_agent_id)
        .bind(&input.backend)
        .bind(input.conversation_id)
        .bind(&input.selected_knowledge_scopes)
        .bind(&input.metadata)
        .execute(&self.pool)
        .await?;

        self.get_task(&id)
            .await?
            .ok_or_else(|| DbError::NotFound(format!("coding task '{id}'")))
    }

    async fn get_task(&self, id: &str) -> Result<Option<CodingTaskRow>, DbError> {
        let row = sqlx::query_as::<_, CodingTaskRow>("SELECT * FROM coding_tasks WHERE id = ?")
            .bind(id)
            .fetch_optional(&self.pool)
            .await?;
        Ok(row)
    }

    async fn list_tasks(&self, limit: u32, offset: u32) -> Result<Vec<CodingTaskRow>, DbError> {
        let rows = sqlx::query_as::<_, CodingTaskRow>(
            "SELECT * FROM coding_tasks ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?",
        )
        .bind(i64::from(limit.min(200)))
        .bind(i64::from(offset))
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    async fn update_task_status(
        &self,
        id: &str,
        status: &str,
    ) -> Result<Option<CodingTaskRow>, DbError> {
        let row = sqlx::query_as::<_, CodingTaskRow>(
            "UPDATE coding_tasks \
             SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') \
             WHERE id = ? \
             RETURNING *",
        )
        .bind(status)
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row)
    }

    async fn upsert_artifact(
        &self,
        input: UpsertSpecArtifactParams,
    ) -> Result<SpecArtifactRow, DbError> {
        let id = generate_prefixed_id("spec");
        let row = sqlx::query_as::<_, SpecArtifactRow>(
            "INSERT INTO spec_artifacts (\
                id, coding_task_id, kind, title, content, format, status, trace_links, metadata\
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) \
             ON CONFLICT(coding_task_id, kind) DO UPDATE SET \
                title = excluded.title, \
                content = excluded.content, \
                format = excluded.format, \
                status = excluded.status, \
                trace_links = excluded.trace_links, \
                metadata = excluded.metadata, \
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') \
             RETURNING *",
        )
        .bind(&id)
        .bind(&input.coding_task_id)
        .bind(&input.kind)
        .bind(&input.title)
        .bind(&input.content)
        .bind(&input.format)
        .bind(&input.status)
        .bind(&input.trace_links)
        .bind(&input.metadata)
        .fetch_one(&self.pool)
        .await?;
        Ok(row)
    }

    async fn list_artifacts(&self, coding_task_id: &str) -> Result<Vec<SpecArtifactRow>, DbError> {
        let rows = sqlx::query_as::<_, SpecArtifactRow>(
            "SELECT * FROM spec_artifacts \
             WHERE coding_task_id = ? \
             ORDER BY CASE kind \
                WHEN 'requirement' THEN 1 \
                WHEN 'spec' THEN 2 \
                WHEN 'plan' THEN 3 \
                WHEN 'tasks' THEN 4 \
                WHEN 'checklist' THEN 5 \
                WHEN 'acceptance' THEN 6 \
                WHEN 'trace' THEN 7 \
                ELSE 99 \
             END, updated_at DESC",
        )
        .bind(coding_task_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    async fn delete_task(&self, id: &str) -> Result<bool, DbError> {
        let result = sqlx::query("DELETE FROM coding_tasks WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}
