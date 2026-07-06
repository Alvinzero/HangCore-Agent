mod common;

use axum::http::StatusCode;
use serde_json::json;
use tower::ServiceExt;

use common::{body_json, get_with_token, json_with_token, setup_and_login};

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
async fn coding_task_conversation_binding_create_list_get_and_manage_artifacts() {
    let (mut app, services) = common::build_app().await;
    let (token, csrf) = setup_and_login(&mut app, &services, "admin", "StrongP@ss1").await;
    let conversation_id = insert_conversation(services.database.pool()).await;

    let create_req = json_with_token(
        "POST",
        "/api/coding-tasks",
        json!({
            "title": "实现 HK64S8x 定时器初始化",
            "workspace_path": "/work/hk64-demo",
            "target_chip": "HK64S8x",
            "selected_agent_id": "agent_builtin_kun",
            "backend": "kun",
            "conversation_id": conversation_id,
            "selected_knowledge_scopes": ["datasheet"],
            "metadata": {"source": "e2e"}
        }),
        &token,
        &csrf,
    );
    let create_resp = app.clone().oneshot(create_req).await.unwrap();
    assert_eq!(create_resp.status(), StatusCode::CREATED);
    let create_json = body_json(create_resp).await;
    assert_eq!(create_json["success"], true);
    assert_eq!(create_json["data"]["profile"], "hs_8bit_mcu");
    assert_eq!(create_json["data"]["project_type"], "new_code");
    assert_eq!(
        create_json["data"]["selected_knowledge_scopes"][0],
        "datasheet"
    );
    let task_id = create_json["data"]["id"].as_str().unwrap().to_string();

    let list_resp = app
        .clone()
        .oneshot(get_with_token("/api/coding-tasks", &token))
        .await
        .unwrap();
    assert_eq!(list_resp.status(), StatusCode::OK);
    let list_json = body_json(list_resp).await;
    assert_eq!(list_json["data"][0]["id"], task_id);

    let get_resp = app
        .clone()
        .oneshot(get_with_token(
            &format!("/api/coding-tasks/{task_id}"),
            &token,
        ))
        .await
        .unwrap();
    assert_eq!(get_resp.status(), StatusCode::OK);
    let get_json = body_json(get_resp).await;
    assert_eq!(get_json["data"]["conversation_id"], conversation_id);
    assert_eq!(get_json["data"]["selected_agent_id"], "agent_builtin_kun");
    assert_eq!(get_json["data"]["backend"], "kun");

    let upsert_req = json_with_token(
        "PUT",
        &format!("/api/coding-tasks/{task_id}/artifacts/spec"),
        json!({
            "title": "规格",
            "content": "配置 Timer0 为 1ms tick",
            "status": "draft",
            "trace_links": [],
            "metadata": {"source": "manual"}
        }),
        &token,
        &csrf,
    );
    let upsert_resp = app.clone().oneshot(upsert_req).await.unwrap();
    assert_eq!(upsert_resp.status(), StatusCode::OK);
    let upsert_json = body_json(upsert_resp).await;
    assert_eq!(upsert_json["data"]["kind"], "spec");
    assert_eq!(upsert_json["data"]["format"], "markdown");

    let artifacts_resp = app
        .oneshot(get_with_token(
            &format!("/api/coding-tasks/{task_id}/artifacts"),
            &token,
        ))
        .await
        .unwrap();
    assert_eq!(artifacts_resp.status(), StatusCode::OK);
    let artifacts_json = body_json(artifacts_resp).await;
    assert_eq!(artifacts_json["data"][0]["kind"], "spec");
}

#[tokio::test]
async fn coding_task_routes_reject_empty_title_and_unknown_artifact_kind() {
    let (mut app, services) = common::build_app().await;
    let (token, csrf) = setup_and_login(&mut app, &services, "admin", "StrongP@ss1").await;

    let empty_title_req = json_with_token(
        "POST",
        "/api/coding-tasks",
        json!({"title": "   "}),
        &token,
        &csrf,
    );
    let empty_title_resp = app.clone().oneshot(empty_title_req).await.unwrap();
    assert_eq!(empty_title_resp.status(), StatusCode::BAD_REQUEST);

    let create_req = json_with_token(
        "POST",
        "/api/coding-tasks",
        json!({"title": "占位任务"}),
        &token,
        &csrf,
    );
    let create_resp = app.clone().oneshot(create_req).await.unwrap();
    let create_json = body_json(create_resp).await;
    let task_id = create_json["data"]["id"].as_str().unwrap();

    let bad_kind_req = json_with_token(
        "PUT",
        &format!("/api/coding-tasks/{task_id}/artifacts/bad_kind"),
        json!({"title": "bad", "content": ""}),
        &token,
        &csrf,
    );
    let bad_kind_resp = app.oneshot(bad_kind_req).await.unwrap();
    assert_eq!(bad_kind_resp.status(), StatusCode::BAD_REQUEST);
}
