use std::sync::Arc;

use async_trait::async_trait;
use nomi_agent::knowledge_tools::{KnowledgeHit, KnowledgeRetrievalSink};
use nomifun_ai_agent::{
    EnterpriseKnowledgeConfig, EnterpriseKnowledgeMode, EnterpriseKnowledgeRetrievalSink,
};
use wiremock::matchers::{body_json, header, method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

struct LocalSink;

#[async_trait]
impl KnowledgeRetrievalSink for LocalSink {
    async fn search(&self, _kb_ids: &[String], query: &str, _limit: usize) -> Result<Vec<KnowledgeHit>, String> {
        Ok(vec![KnowledgeHit {
            kb_id: "personal".into(),
            handle: "personal-handle".into(),
            kb_name: "个人资料库".into(),
            rel_path: "local.md".into(),
            heading: "Local".into(),
            snippet: format!("local:{query}"),
        }])
    }

    async fn read_document(&self, _kb_ids: &[String], _handle: &str) -> Result<String, String> {
        Ok("local document".into())
    }
}

#[tokio::test]
async fn disabled_mode_returns_no_hits_without_touching_local_sink() {
    let sink = EnterpriseKnowledgeRetrievalSink::for_test(
        Arc::new(LocalSink),
        EnterpriseKnowledgeConfig {
            enabled: false,
            base_url: String::new(),
            workspace_id: String::new(),
            auth_token: String::new(),
            mode: EnterpriseKnowledgeMode::Disabled,
        },
    );

    let hits = sink.search(&["kb1".into()], "回滚流程", 8).await.unwrap();

    assert!(hits.is_empty());
}

#[tokio::test]
async fn personal_mode_uses_local_personal_library() {
    let sink = EnterpriseKnowledgeRetrievalSink::for_test(
        Arc::new(LocalSink),
        EnterpriseKnowledgeConfig {
            enabled: true,
            base_url: String::new(),
            workspace_id: String::new(),
            auth_token: String::new(),
            mode: EnterpriseKnowledgeMode::Personal,
        },
    );

    let hits = sink.search(&["kb1".into()], "回滚流程", 8).await.unwrap();

    assert_eq!(hits[0].kb_id, "personal");
    assert_eq!(hits[0].snippet, "local:回滚流程");
}

#[tokio::test]
async fn enterprise_mode_posts_to_enterprise_search_and_maps_citations() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/api/enterprise/kb/search"))
        .and(header("authorization", "Bearer token-1"))
        .and(header("x-enterprise-workspace-id", "ws-1"))
        .and(body_json(serde_json::json!({
            "query": "航顺流程",
            "conversationId": null,
            "workspacePath": null,
            "selectedKnowledgeScopes": ["kb1"],
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "answerContext": "企业流程上下文",
            "sourceType": "enterprise",
            "permissionFiltered": true,
            "citations": [{
                "id": "doc-1",
                "title": "流程手册",
                "url": "https://kb.local/doc-1",
                "snippet": "审批流需要先校验部门权限"
            }]
        })))
        .mount(&server)
        .await;

    let sink = EnterpriseKnowledgeRetrievalSink::for_test(
        Arc::new(LocalSink),
        EnterpriseKnowledgeConfig {
            enabled: true,
            base_url: server.uri(),
            workspace_id: "ws-1".into(),
            auth_token: "token-1".into(),
            mode: EnterpriseKnowledgeMode::Enterprise,
        },
    );

    let hits = sink.search(&["kb1".into()], "航顺流程", 8).await.unwrap();

    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].kb_id, "enterprise");
    assert_eq!(hits[0].kb_name, "企业知识来源");
    assert_eq!(hits[0].rel_path, "流程手册");
    assert!(hits[0].snippet.contains("审批流"));

    let doc = sink.read_document(&["kb1".into()], &hits[0].handle).await.unwrap();
    assert!(doc.contains("# 流程手册"));
    assert!(doc.contains("Source: https://kb.local/doc-1"));
    assert!(doc.contains("审批流需要先校验部门权限"));
    assert!(doc.contains("Permission filtered: true"));
}

#[tokio::test]
async fn enterprise_mode_falls_back_to_personal_library_when_search_fails() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/api/enterprise/kb/search"))
        .respond_with(ResponseTemplate::new(503))
        .mount(&server)
        .await;

    let sink = EnterpriseKnowledgeRetrievalSink::for_test(
        Arc::new(LocalSink),
        EnterpriseKnowledgeConfig {
            enabled: true,
            base_url: server.uri(),
            workspace_id: "ws-1".into(),
            auth_token: "token-1".into(),
            mode: EnterpriseKnowledgeMode::Enterprise,
        },
    );

    let hits = sink.search(&["kb1".into()], "航顺流程", 8).await.unwrap();

    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].kb_id, "personal");
    assert_eq!(hits[0].snippet, "local:航顺流程");
}
