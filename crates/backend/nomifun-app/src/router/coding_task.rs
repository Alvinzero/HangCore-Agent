use std::sync::Arc;

use axum::extract::rejection::JsonRejection;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Json, Router};

use nomifun_api_types::{
    ApiResponse, CodingTaskCreateRequest, CodingTaskResponse, ListCodingTasksQuery,
    SpecArtifactResponse, SpecArtifactUpsertRequest,
};
use nomifun_common::AppError;
use nomifun_db::{
    CodingTaskRow, CreateCodingTaskParams, ICodingTaskRepository, SpecArtifactRow,
    UpsertSpecArtifactParams,
};

const DEFAULT_PROFILE: &str = "hs_8bit_mcu";
const DEFAULT_PROJECT_TYPE: &str = "new_code";
const DEFAULT_ARTIFACT_FORMAT: &str = "markdown";
const DEFAULT_ARTIFACT_STATUS: &str = "draft";
const VALID_ARTIFACT_KINDS: &[&str] = &[
    "requirement",
    "spec",
    "plan",
    "tasks",
    "checklist",
    "acceptance",
    "trace",
];

#[derive(Clone)]
pub struct CodingTaskRouterState {
    pub repo: Arc<dyn ICodingTaskRepository>,
}

pub fn coding_task_routes(state: CodingTaskRouterState) -> Router {
    Router::new()
        .route("/api/coding-tasks", post(create_task).get(list_tasks))
        .route("/api/coding-tasks/{id}", get(get_task))
        .route("/api/coding-tasks/{id}/artifacts", get(list_artifacts))
        .route(
            "/api/coding-tasks/{id}/artifacts/{kind}",
            axum::routing::put(upsert_artifact),
        )
        .with_state(state)
}

async fn create_task(
    State(state): State<CodingTaskRouterState>,
    body: Result<Json<CodingTaskCreateRequest>, JsonRejection>,
) -> Result<(StatusCode, Json<ApiResponse<CodingTaskResponse>>), AppError> {
    let Json(req) = body.map_err(|e| AppError::BadRequest(e.to_string()))?;
    if req.title.trim().is_empty() {
        return Err(AppError::BadRequest(
            "coding task title cannot be empty".to_string(),
        ));
    }

    let row = state
        .repo
        .create_task(CreateCodingTaskParams {
            title: req.title.trim().to_string(),
            workspace_path: blank_to_none(req.workspace_path),
            profile: default_blank(req.profile, DEFAULT_PROFILE),
            target_chip: blank_to_none(req.target_chip),
            project_type: default_blank(req.project_type, DEFAULT_PROJECT_TYPE),
            selected_agent_id: blank_to_none(req.selected_agent_id),
            backend: blank_to_none(req.backend),
            conversation_id: req.conversation_id,
            selected_knowledge_scopes: json_string(&req.selected_knowledge_scopes)?,
            metadata: json_string(&req.metadata)?,
        })
        .await?;

    Ok((
        StatusCode::CREATED,
        Json(ApiResponse::ok(task_response(row))),
    ))
}

async fn list_tasks(
    State(state): State<CodingTaskRouterState>,
    Query(query): Query<ListCodingTasksQuery>,
) -> Result<Json<ApiResponse<Vec<CodingTaskResponse>>>, AppError> {
    let rows = state
        .repo
        .list_tasks(query.limit.unwrap_or(50), query.offset.unwrap_or(0))
        .await?;
    Ok(Json(ApiResponse::ok(
        rows.into_iter().map(task_response).collect(),
    )))
}

async fn get_task(
    State(state): State<CodingTaskRouterState>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<CodingTaskResponse>>, AppError> {
    let row = state
        .repo
        .get_task(&id)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("coding task '{id}'")))?;
    Ok(Json(ApiResponse::ok(task_response(row))))
}

async fn upsert_artifact(
    State(state): State<CodingTaskRouterState>,
    Path((task_id, kind)): Path<(String, String)>,
    body: Result<Json<SpecArtifactUpsertRequest>, JsonRejection>,
) -> Result<Json<ApiResponse<SpecArtifactResponse>>, AppError> {
    if !VALID_ARTIFACT_KINDS.contains(&kind.as_str()) {
        return Err(AppError::BadRequest(format!(
            "unknown spec artifact kind '{kind}'"
        )));
    }
    let Json(req) = body.map_err(|e| AppError::BadRequest(e.to_string()))?;

    if state.repo.get_task(&task_id).await?.is_none() {
        return Err(AppError::NotFound(format!("coding task '{task_id}'")));
    }

    let row = state
        .repo
        .upsert_artifact(UpsertSpecArtifactParams {
            coding_task_id: task_id,
            kind,
            title: req.title.trim().to_string(),
            content: req.content,
            format: default_blank(req.format, DEFAULT_ARTIFACT_FORMAT),
            status: default_blank(req.status, DEFAULT_ARTIFACT_STATUS),
            trace_links: json_string(&req.trace_links)?,
            metadata: json_string(&req.metadata)?,
        })
        .await?;
    Ok(Json(ApiResponse::ok(artifact_response(row))))
}

async fn list_artifacts(
    State(state): State<CodingTaskRouterState>,
    Path(task_id): Path<String>,
) -> Result<Json<ApiResponse<Vec<SpecArtifactResponse>>>, AppError> {
    if state.repo.get_task(&task_id).await?.is_none() {
        return Err(AppError::NotFound(format!("coding task '{task_id}'")));
    }
    let rows = state.repo.list_artifacts(&task_id).await?;
    Ok(Json(ApiResponse::ok(
        rows.into_iter().map(artifact_response).collect(),
    )))
}

fn blank_to_none(value: Option<String>) -> Option<String> {
    value.and_then(|v| {
        let trimmed = v.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn default_blank(value: Option<String>, default: &str) -> String {
    blank_to_none(value).unwrap_or_else(|| default.to_string())
}

fn json_string<T: serde::Serialize>(value: &T) -> Result<String, AppError> {
    serde_json::to_string(value)
        .map_err(|e| AppError::BadRequest(format!("failed to serialize request JSON: {e}")))
}

fn parse_json<T>(raw: &str, fallback: T) -> T
where
    T: serde::de::DeserializeOwned,
{
    serde_json::from_str(raw).unwrap_or(fallback)
}

fn task_response(row: CodingTaskRow) -> CodingTaskResponse {
    CodingTaskResponse {
        id: row.id,
        title: row.title,
        workspace_path: row.workspace_path,
        profile: row.profile,
        target_chip: row.target_chip,
        project_type: row.project_type,
        status: row.status,
        selected_agent_id: row.selected_agent_id,
        backend: row.backend,
        conversation_id: row.conversation_id,
        selected_knowledge_scopes: parse_json(&row.selected_knowledge_scopes, Vec::<String>::new()),
        metadata: parse_json(&row.metadata, serde_json::Value::Object(Default::default())),
        created_at: row.created_at,
        updated_at: row.updated_at,
    }
}

fn artifact_response(row: SpecArtifactRow) -> SpecArtifactResponse {
    SpecArtifactResponse {
        id: row.id,
        coding_task_id: row.coding_task_id,
        kind: row.kind,
        title: row.title,
        content: row.content,
        format: row.format,
        status: row.status,
        trace_links: parse_json(&row.trace_links, Vec::<String>::new()),
        metadata: parse_json(&row.metadata, serde_json::Value::Object(Default::default())),
        created_at: row.created_at,
        updated_at: row.updated_at,
    }
}
