use nomifun_db::{
    CreateCodingTaskParams, ICodingTaskRepository, SqliteCodingTaskRepository,
    UpsertSpecArtifactParams, init_database_memory,
};

async fn insert_conversation(pool: &sqlx::SqlitePool) -> i64 {
    let result = sqlx::query(
        "INSERT INTO conversations (user_id, name, type, extra, status, created_at, updated_at)
         VALUES ('system_default_user', 'Coding Task Conversation', 'acp', '{}', 'pending', 1000, 1000)",
    )
    .execute(pool)
    .await
    .unwrap();
    result.last_insert_rowid()
}

#[tokio::test]
async fn coding_task_schema_creates_required_tables() {
    let db = init_database_memory().await.unwrap();

    let task_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM coding_tasks")
        .fetch_one(db.pool())
        .await
        .expect("coding_tasks table should exist");
    assert_eq!(task_count.0, 0);

    let artifact_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM spec_artifacts")
        .fetch_one(db.pool())
        .await
        .expect("spec_artifacts table should exist");
    assert_eq!(artifact_count.0, 0);
}

#[tokio::test]
async fn coding_task_repository_creates_lists_upserts_and_cascades() {
    let db = init_database_memory().await.unwrap();
    let conversation_id = insert_conversation(db.pool()).await;
    let repo = SqliteCodingTaskRepository::new(db.pool().clone());

    let created = repo
        .create_task(CreateCodingTaskParams {
            title: "实现 HK64S8x 定时器初始化".to_string(),
            workspace_path: Some("/work/hk64-demo".to_string()),
            profile: "hs_8bit_mcu".to_string(),
            target_chip: Some("HK64S8x".to_string()),
            project_type: "new_code".to_string(),
            selected_agent_id: Some("agent_builtin_kun".to_string()),
            backend: Some("kun".to_string()),
            conversation_id: Some(conversation_id),
            selected_knowledge_scopes: r#"["datasheet"]"#.to_string(),
            metadata: r#"{"source":"test"}"#.to_string(),
        })
        .await
        .unwrap();

    assert!(!created.id.is_empty());
    assert_eq!(created.title, "实现 HK64S8x 定时器初始化");
    assert_eq!(created.conversation_id, Some(conversation_id));
    assert_eq!(
        created.selected_agent_id.as_deref(),
        Some("agent_builtin_kun")
    );
    assert_eq!(created.backend.as_deref(), Some("kun"));

    let listed = repo.list_tasks(10, 0).await.unwrap();
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].id, created.id);

    let spec = repo
        .upsert_artifact(UpsertSpecArtifactParams {
            coding_task_id: created.id.clone(),
            kind: "spec".to_string(),
            title: "规格".to_string(),
            content: "配置 Timer0 为 1ms tick".to_string(),
            format: "markdown".to_string(),
            status: "draft".to_string(),
            trace_links: "[]".to_string(),
            metadata: "{}".to_string(),
        })
        .await
        .unwrap();
    assert_eq!(spec.kind, "spec");

    let tasks = repo
        .upsert_artifact(UpsertSpecArtifactParams {
            coding_task_id: created.id.clone(),
            kind: "tasks".to_string(),
            title: "任务".to_string(),
            content: "- 初始化寄存器".to_string(),
            format: "markdown".to_string(),
            status: "draft".to_string(),
            trace_links: "[]".to_string(),
            metadata: "{}".to_string(),
        })
        .await
        .unwrap();

    let updated_tasks = repo
        .upsert_artifact(UpsertSpecArtifactParams {
            coding_task_id: created.id.clone(),
            kind: "tasks".to_string(),
            title: "任务拆解".to_string(),
            content: "- 初始化寄存器\n- 增加验收清单".to_string(),
            format: "markdown".to_string(),
            status: "ready".to_string(),
            trace_links: r#"["spec"]"#.to_string(),
            metadata: r#"{"version":2}"#.to_string(),
        })
        .await
        .unwrap();
    assert_eq!(
        updated_tasks.id, tasks.id,
        "upsert should preserve the artifact row"
    );
    assert_eq!(updated_tasks.title, "任务拆解");
    assert_eq!(updated_tasks.status, "ready");

    let artifacts = repo.list_artifacts(&created.id).await.unwrap();
    assert_eq!(artifacts.len(), 2);

    assert!(repo.delete_task(&created.id).await.unwrap());
    assert!(repo.get_task(&created.id).await.unwrap().is_none());
    assert!(repo.list_artifacts(&created.id).await.unwrap().is_empty());
}
