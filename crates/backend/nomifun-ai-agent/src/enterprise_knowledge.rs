//! Phase-1 enterprise knowledge retrieval adapter.
//!
//! The agent layer still sees one `KnowledgeRetrievalSink`; this adapter decides
//! at call time whether to search the enterprise service, fall back to the local
//! personal library, or expose no results.

use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use nomi_agent::knowledge_tools::{KnowledgeHit, KnowledgeRetrievalSink};
use nomifun_db::IClientPreferenceRepository;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tracing::warn;

const PREF_ENTERPRISE_ENABLED: &str = "enterprise.enabled";
const PREF_ENTERPRISE_BASE_URL: &str = "enterprise.baseUrl";
const PREF_ENTERPRISE_WORKSPACE_ID: &str = "enterprise.workspaceId";
const PREF_ENTERPRISE_AUTH_TOKEN: &str = "enterprise.authToken";
const PREF_ENTERPRISE_KNOWLEDGE_MODE: &str = "enterprise.knowledgeMode";

const ENTERPRISE_HANDLE_PREFIX: &str = "enterprise_kdoc_";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EnterpriseKnowledgeMode {
    Enterprise,
    Personal,
    Disabled,
}

impl EnterpriseKnowledgeMode {
    fn from_pref(value: Option<&str>) -> Self {
        match value.map(str::trim) {
            Some("enterprise") => Self::Enterprise,
            Some("disabled") => Self::Disabled,
            _ => Self::Personal,
        }
    }

    pub fn is_personal(self) -> bool {
        matches!(self, Self::Personal)
    }

    pub fn is_disabled(self) -> bool {
        matches!(self, Self::Disabled)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EnterpriseKnowledgeConfig {
    pub enabled: bool,
    pub base_url: String,
    pub workspace_id: String,
    pub auth_token: String,
    pub mode: EnterpriseKnowledgeMode,
}

impl Default for EnterpriseKnowledgeConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            base_url: String::new(),
            workspace_id: String::new(),
            auth_token: String::new(),
            mode: EnterpriseKnowledgeMode::Personal,
        }
    }
}

impl EnterpriseKnowledgeConfig {
    pub async fn load_from_repo(repo: Option<&Arc<dyn IClientPreferenceRepository>>) -> Self {
        let Some(repo) = repo else {
            return Self::default();
        };
        let keys = [
            PREF_ENTERPRISE_ENABLED,
            PREF_ENTERPRISE_BASE_URL,
            PREF_ENTERPRISE_WORKSPACE_ID,
            PREF_ENTERPRISE_AUTH_TOKEN,
            PREF_ENTERPRISE_KNOWLEDGE_MODE,
        ];
        let rows = match repo.get_by_keys(&keys).await {
            Ok(rows) => rows,
            Err(err) => {
                warn!(error = %err, "enterprise knowledge config: failed to read client preferences");
                return Self::default();
            }
        };
        let values: HashMap<String, Value> = rows
            .into_iter()
            .filter_map(|row| {
                serde_json::from_str::<Value>(&row.value)
                    .ok()
                    .map(|value| (row.key, value))
            })
            .collect();

        Self {
            enabled: pref_bool(values.get(PREF_ENTERPRISE_ENABLED)).unwrap_or(false),
            base_url: pref_string(values.get(PREF_ENTERPRISE_BASE_URL)).unwrap_or_default(),
            workspace_id: pref_string(values.get(PREF_ENTERPRISE_WORKSPACE_ID)).unwrap_or_default(),
            auth_token: pref_string(values.get(PREF_ENTERPRISE_AUTH_TOKEN)).unwrap_or_default(),
            mode: EnterpriseKnowledgeMode::from_pref(
                pref_string(values.get(PREF_ENTERPRISE_KNOWLEDGE_MODE)).as_deref(),
            ),
        }
    }

    fn has_enterprise_endpoint(&self) -> bool {
        self.enabled && !self.base_url.trim().is_empty()
    }
}

fn pref_bool(value: Option<&Value>) -> Option<bool> {
    match value? {
        Value::Bool(v) => Some(*v),
        Value::String(v) => match v.trim() {
            "true" => Some(true),
            "false" => Some(false),
            _ => None,
        },
        _ => None,
    }
}

fn pref_string(value: Option<&Value>) -> Option<String> {
    match value? {
        Value::String(v) => Some(v.trim().to_owned()).filter(|v| !v.is_empty()),
        Value::Bool(v) => Some(v.to_string()),
        Value::Number(v) => Some(v.to_string()),
        _ => None,
    }
}

pub struct EnterpriseKnowledgeRetrievalSink {
    local: Arc<dyn KnowledgeRetrievalSink>,
    client_prefs: Option<Arc<dyn IClientPreferenceRepository>>,
    http_client: reqwest::Client,
    fixed_config: Option<EnterpriseKnowledgeConfig>,
}

impl EnterpriseKnowledgeRetrievalSink {
    pub fn new(
        local: Arc<dyn KnowledgeRetrievalSink>,
        client_prefs: Option<Arc<dyn IClientPreferenceRepository>>,
        http_client: reqwest::Client,
    ) -> Self {
        Self {
            local,
            client_prefs,
            http_client,
            fixed_config: None,
        }
    }

    pub fn for_test(
        local: Arc<dyn KnowledgeRetrievalSink>,
        config: EnterpriseKnowledgeConfig,
    ) -> Self {
        Self {
            local,
            client_prefs: None,
            http_client: reqwest::Client::new(),
            fixed_config: Some(config),
        }
    }

    async fn load_config(&self) -> EnterpriseKnowledgeConfig {
        if let Some(config) = self.fixed_config.as_ref() {
            return config.clone();
        }
        EnterpriseKnowledgeConfig::load_from_repo(self.client_prefs.as_ref()).await
    }

    async fn search_enterprise(
        &self,
        config: &EnterpriseKnowledgeConfig,
        kb_ids: &[String],
        query: &str,
    ) -> Result<Vec<KnowledgeHit>, String> {
        let url = enterprise_search_url(&config.base_url)?;
        let mut request = self.http_client.post(url).json(&EnterpriseSearchRequest {
            query,
            conversation_id: None,
            workspace_path: None,
            selected_knowledge_scopes: kb_ids,
        });
        if !config.auth_token.trim().is_empty() {
            request = request.bearer_auth(config.auth_token.trim());
        }
        if !config.workspace_id.trim().is_empty() {
            request = request.header("x-enterprise-workspace-id", config.workspace_id.trim());
        }

        let response = request.send().await.map_err(|err| err.to_string())?;
        if !response.status().is_success() {
            return Err(format!(
                "enterprise knowledge search returned {}",
                response.status()
            ));
        }
        let body: EnterpriseSearchResponse =
            response.json().await.map_err(|err| err.to_string())?;
        Ok(map_enterprise_hits(body))
    }
}

#[async_trait]
impl KnowledgeRetrievalSink for EnterpriseKnowledgeRetrievalSink {
    async fn search(
        &self,
        kb_ids: &[String],
        query: &str,
        limit: usize,
    ) -> Result<Vec<KnowledgeHit>, String> {
        let config = self.load_config().await;
        match config.mode {
            EnterpriseKnowledgeMode::Disabled => Ok(Vec::new()),
            EnterpriseKnowledgeMode::Personal => self.local.search(kb_ids, query, limit).await,
            EnterpriseKnowledgeMode::Enterprise => {
                if !config.has_enterprise_endpoint() {
                    return self.local.search(kb_ids, query, limit).await;
                }
                match self.search_enterprise(&config, kb_ids, query).await {
                    Ok(hits) => Ok(hits.into_iter().take(limit).collect()),
                    Err(err) => {
                        warn!(error = %err, "enterprise knowledge search failed; falling back to personal library");
                        self.local.search(kb_ids, query, limit).await
                    }
                }
            }
        }
    }

    async fn read_document(&self, kb_ids: &[String], handle: &str) -> Result<String, String> {
        if let Some(doc) = decode_enterprise_handle(handle) {
            return Ok(doc.to_markdown());
        }
        self.local.read_document(kb_ids, handle).await
    }
}

fn enterprise_search_url(base_url: &str) -> Result<String, String> {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("enterprise base URL is empty".to_owned());
    }
    Ok(format!("{trimmed}/api/enterprise/kb/search"))
}

#[derive(Serialize)]
struct EnterpriseSearchRequest<'a> {
    query: &'a str,
    #[serde(rename = "conversationId")]
    conversation_id: Option<&'a str>,
    #[serde(rename = "workspacePath")]
    workspace_path: Option<&'a str>,
    #[serde(rename = "selectedKnowledgeScopes")]
    selected_knowledge_scopes: &'a [String],
}

#[derive(Debug, Deserialize)]
struct EnterpriseSearchResponse {
    #[serde(rename = "answerContext", default)]
    answer_context: String,
    #[serde(default)]
    citations: Vec<EnterpriseCitation>,
    #[serde(rename = "sourceType", default)]
    source_type: String,
    #[serde(rename = "permissionFiltered", default)]
    permission_filtered: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct EnterpriseCitation {
    #[serde(default)]
    id: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    url: String,
    #[serde(default)]
    snippet: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct EnterpriseDocumentHandle {
    citation: EnterpriseCitation,
    answer_context: String,
    source_type: String,
    permission_filtered: bool,
}

impl EnterpriseDocumentHandle {
    fn to_markdown(&self) -> String {
        let mut out = String::new();
        if !self.citation.title.trim().is_empty() {
            out.push_str("# ");
            out.push_str(self.citation.title.trim());
            out.push_str("\n\n");
        }
        if !self.citation.url.trim().is_empty() {
            out.push_str("Source: ");
            out.push_str(self.citation.url.trim());
            out.push_str("\n\n");
        }
        if !self.citation.snippet.trim().is_empty() {
            out.push_str(self.citation.snippet.trim());
        } else {
            out.push_str(self.answer_context.trim());
        }
        if self.permission_filtered {
            out.push_str("\n\nPermission filtered: true");
        }
        out
    }
}

fn map_enterprise_hits(response: EnterpriseSearchResponse) -> Vec<KnowledgeHit> {
    let answer_context = response.answer_context;
    response
        .citations
        .into_iter()
        .map(|citation| {
            let rel_path = first_non_empty([&citation.title, &citation.url, &citation.id])
                .unwrap_or("enterprise result")
                .to_owned();
            let snippet = first_non_empty([&citation.snippet, &answer_context])
                .unwrap_or("")
                .to_owned();
            let handle = encode_enterprise_handle(&EnterpriseDocumentHandle {
                citation: citation.clone(),
                answer_context: answer_context.clone(),
                source_type: response.source_type.clone(),
                permission_filtered: response.permission_filtered,
            });
            KnowledgeHit {
                kb_id: "enterprise".to_owned(),
                handle,
                kb_name: "企业知识来源".to_owned(),
                rel_path,
                heading: citation.id,
                snippet,
            }
        })
        .collect()
}

fn first_non_empty<'a>(values: impl IntoIterator<Item = &'a String>) -> Option<&'a str> {
    values.into_iter().map(|v| v.trim()).find(|v| !v.is_empty())
}

fn encode_enterprise_handle(doc: &EnterpriseDocumentHandle) -> String {
    let raw = serde_json::to_vec(doc).unwrap_or_default();
    format!("{ENTERPRISE_HANDLE_PREFIX}{}", URL_SAFE_NO_PAD.encode(raw))
}

fn decode_enterprise_handle(handle: &str) -> Option<EnterpriseDocumentHandle> {
    let body = handle.strip_prefix(ENTERPRISE_HANDLE_PREFIX)?;
    let bytes = URL_SAFE_NO_PAD.decode(body.as_bytes()).ok()?;
    serde_json::from_slice(&bytes).ok()
}
