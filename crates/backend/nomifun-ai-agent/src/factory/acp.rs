use std::collections::HashMap;
use std::sync::Arc;

use crate::agent_task::AgentInstance;
use crate::factory::AgentFactoryDeps;
use crate::factory::acp_assembler::{WorkspaceInfo, assemble_acp_params};
use crate::factory::context::FactoryContext;
use crate::factory::provider_config::{ResolvedProviderFields, resolve_provider_fields};
use crate::manager::acp::{AcpAgentManager, CatalogForwarder};
use crate::shared_kernel::ModelId;
use crate::types::BuildTaskOptions;
use agent_client_protocol::schema::{
    EnvVariable, HttpHeader, McpServer, McpServerHttp, McpServerSse, McpServerStdio, ModelInfo,
    SessionModelState,
};
use nomifun_api_types::{AcpBuildExtra, SessionMcpServer, SessionMcpTransport};
use nomifun_common::{AppError, CommandSpec, EnvVar};
use nomifun_db::models::{McpServerRow, Provider};
use nomifun_db::{IMcpServerRepository, IProviderRepository};
use nomifun_mcp::{AcpMcpCapabilities, parse_acp_mcp_capabilities};
use nomifun_runtime::{managed_kun_runtime_dir, resolve_command_path};
use tracing::{info, warn};

pub(super) async fn build(
    deps: Arc<AgentFactoryDeps>,
    options: BuildTaskOptions,
    ctx: FactoryContext,
) -> Result<AgentInstance, AppError> {
    let mut config: AcpBuildExtra = serde_json::from_value(options.extra)
        .map_err(|e| AppError::BadRequest(format!("Invalid ACP build options: {e}")))?;

    // Resolve the catalog row — prefer explicit agent_id, fall
    // back to a vendor-label match for legacy payloads.
    let meta = if let Some(ref agent_id) = config.agent_id {
        deps.agent_registry.get(agent_id).await
    } else if let Some(ref vendor) = config.backend {
        deps.agent_registry.find_builtin_by_backend(vendor).await
    } else {
        None
    }
    .ok_or_else(|| {
        AppError::BadRequest("ACP agent requires either agent_id or backend in extra".into())
    })?;

    // Trust the catalog row over the client-supplied `backend` when an
    // `agent_id` was provided. The frontend collapses row-scoped rows
    // (custom ACP / remote) to a shared `custom`/`remote` slot string,
    // which downstream consumers (MCP injection, preset-context
    // composition) would mis-interpret. When the caller only supplied a
    // vendor label (builtin path), we preserve it as-is.
    if config.agent_id.is_some() || config.backend.is_none() {
        config.backend.clone_from(&meta.backend);
    }

    // Inject the requirement MCP config so AutoWork-driven ACP sessions expose
    // the requirement_complete / requirement_update_status declaration tools.
    // Independent of team membership (AutoWork can drive any ACP session); the
    // tools are inert until the AutoWork prompt references a requirement id. The
    // bootstrap flag `OrchestratorDeps::requirement_mcp_enabled` is kept in
    // lock-step with `deps.requirement_mcp_config` so the prompt never names a
    // tool the session lacks.
    if config.requirement_mcp_config.is_none() {
        config
            .requirement_mcp_config
            .clone_from(&deps.requirement_mcp_config);
    }

    // Inject the scoped knowledge-search MCP config ONLY when the session has
    // bound knowledge bases. Gated on `!knowledge_mounts.is_empty()` — NOT on
    // `desktop_gateway` (the knowledge server reaches only its own port/token,
    // never the gateway). A session with no mounted bases never gets the
    // knowledge_search tool, so the model cannot reach the retrieval gateway.
    if config.knowledge_mcp_config.is_none() && !config.knowledge_mounts.is_empty() {
        config
            .knowledge_mcp_config
            .clone_from(&deps.knowledge_mcp_config);
    }

    // Inject the reliable-launch (`open`) MCP config unconditionally (like the
    // requirement MCP): it gives every session a dependable URL/file/app open
    // path instead of fragile `cmd /c start`. `deps.open_mcp_config` is `Some`
    // only on Windows, so this is a no-op on macOS/Linux.
    if config.open_mcp_config.is_none() {
        config.open_mcp_config.clone_from(&deps.open_mcp_config);
    }

    // Inject the computer-use discrete-tool MCP config unconditionally too —
    // no vendor allowlist: every ACP backend (builtin claude/codex/gemini/
    // codebuddy and custom-registered ACP agents alike) gets it. `deps.
    // computer_mcp_config` is `Some` on every desktop OS built with the
    // `computer-use` feature, `None` on web/headless, so this is a no-op there.
    if config.computer_mcp_config.is_none() {
        config
            .computer_mcp_config
            .clone_from(&deps.computer_mcp_config);
    }

    // Inject the browser-use discrete-tool MCP config unconditionally too —
    // symmetric with computer-use (裁决①). Every ACP backend gets it; `deps.
    // browser_mcp_config` is `Some` on every desktop OS built with the
    // `browser-use` feature, `None` on web/headless, so this is a no-op there.
    // The bridge is stateless fail-safe (R2: no per-pet context).
    if config.browser_mcp_config.is_none() {
        config
            .browser_mcp_config
            .clone_from(&deps.browser_mcp_config);
    }

    // Inject the Desktop Gateway MCP config for sessions that carry the
    // backend-set `desktopGateway` extra flag (channel master-agent sessions,
    // companion companion threads). Unlike the requirement MCP this is NOT injected
    // unconditionally — the gateway grants full desktop control.
    if config.desktop_gateway && config.gateway_mcp_config.is_none() {
        config
            .gateway_mcp_config
            .clone_from(&deps.gateway_mcp_config);
        info!(
            ctx.conversation_id,
            gateway_mcp_port = deps.gateway_mcp_config.as_ref().map(|c| c.port),
            "gateway_mcp: injected into desktopGateway session"
        );
    }

    // Registry resolved the spawn command via `which()` at
    // hydrate time. A missing `resolved_command` means either the
    // CLI was uninstalled between hydrate and now, or the row
    // never had a command (e.g. remote-only). Either way the
    // caller needs to see a BadRequest, not a confusing
    // spawn-time error.
    let (command, args, mut env, cwd) = (
        meta.resolved_command.clone().ok_or_else(|| {
            AppError::BadRequest(format!("Agent '{}' CLI not found in PATH", meta.name))
        })?,
        meta.args.clone(),
        meta.env
            .iter()
            .map(|e| nomifun_common::EnvVar {
                name: e.name.clone(),
                value: e.value.clone(),
            })
            .collect::<Vec<_>>(),
        Some(ctx.workspace.clone()),
    );
    if meta.backend.as_deref() == Some("claude") {
        let cc_switch_env = crate::cc_switch::read_claude_provider_env();
        if !cc_switch_env.is_empty() {
            let keys: Vec<&str> = cc_switch_env.keys().map(|k| k.as_str()).collect();
            for (name, value) in &cc_switch_env {
                env.push(nomifun_common::EnvVar {
                    name: name.clone(),
                    value: value.clone(),
                });
            }
            tracing::info!(?keys, "cc-switch: env vars injected");
        }
    }
    let mut session_snapshot = deps
        .acp_agent_service
        .load_snapshot_state(&ctx.conversation_id)
        .await;
    let mut synthetic_model_state: Option<SessionModelState> = None;

    if meta.backend.as_deref() == Some("kun") {
        if let Some(runtime_dir) =
            append_managed_kun_runtime_env(&mut env, managed_kun_runtime_dir())
        {
            info!(
                runtime_dir = %runtime_dir.display(),
                "kun: managed runtime env injected"
            );
        }
        let requested_model_id = session_snapshot
            .as_ref()
            .and_then(|s| s.current_model_id.as_ref())
            .map(|m| m.as_str())
            .or(config.current_model_id.as_deref());
        match inject_kun_provider_env(
            &deps.provider_repo,
            &deps.encryption_key,
            requested_model_id,
            &mut env,
        )
        .await?
        {
            Some(injection) => {
                let selected_model_id = encode_kun_provider_model_id(
                    &injection.selection.provider_id,
                    &injection.selection.model,
                );
                config.current_model_id = Some(selected_model_id.clone());
                if let Some(snapshot) = session_snapshot.as_mut() {
                    snapshot.current_model_id = Some(ModelId::new(selected_model_id));
                }
                synthetic_model_state = Some(injection.model_state);
                info!(
                    provider_id = %injection.selection.provider_id,
                    model = %injection.selection.model,
                    "kun: system provider env injected"
                );
            }
            None => {
                info!("kun: no enabled system provider/model found; using Kun runtime defaults");
            }
        }
    }

    let command_spec = CommandSpec {
        command,
        args,
        env,
        cwd,
    };

    // Load user-configured MCP servers from the DB so they reach
    // ACP `session/new` mcpServers payload. Without this the agent
    // starts with zero MCP tools even when the user configured them
    // via Settings → MCP (ELECTRON-1JG).
    let mcp_capabilities = meta
        .handshake
        .agent_capabilities
        .as_ref()
        .map(parse_acp_mcp_capabilities)
        .unwrap_or_default();

    let user_mcp_servers = match deps.mcp_server_repo.as_ref() {
        Some(repo) => {
            load_user_mcp_servers(
                repo.as_ref(),
                config.mcp_server_ids.as_deref(),
                &ctx.conversation_id,
                &mcp_capabilities,
            )
            .await
        }
        None => Vec::new(),
    };
    let mut session_mcp_servers = user_mcp_servers;
    for server in &config.session_mcp_servers {
        if !session_server_supported_by_capabilities(server, &mcp_capabilities) {
            warn!(
                ctx.conversation_id,
                server_id = %server.id,
                server_name = %server.name,
                "session_mcp: transport unsupported by ACP agent; skipping"
            );
            continue;
        }
        match session_server_to_sdk_mcp_server(server) {
            Ok(server) => session_mcp_servers.push(server),
            Err(err) => {
                warn!(
                    ctx.conversation_id,
                    server_id = %server.id,
                    server_name = %server.name,
                    error = %err,
                    "session_mcp: failed to convert session snapshot; skipping"
                );
            }
        }
    }

    let mut params = assemble_acp_params(
        ctx.conversation_id.clone(),
        WorkspaceInfo {
            path: ctx.workspace,
            is_custom: ctx.is_custom_workspace,
        },
        meta,
        command_spec,
        config,
        session_mcp_servers,
        session_snapshot,
        deps.data_dir.clone(),
    )
    .await;
    params.synthetic_model_state = synthetic_model_state;
    let params = Arc::new(params);

    let skill_mgr = deps.skill_manager.clone();
    let catalog_tx = deps.agent_registry.catalog_sender();

    let (agent, domain_rx, notification_rx) =
        AcpAgentManager::build(params, skill_mgr, &catalog_tx).await?;

    let arc = Arc::new(agent);
    arc.start_permission_handler();
    arc.start_session_event_tracker(notification_rx);
    CatalogForwarder::spawn(
        arc.agent_id().to_owned(),
        crate::IAgentTask::subscribe(arc.as_ref()),
        catalog_tx,
    );

    // Desired (mode/model/config) are seeded from `params.session_snapshot`
    // inside `AcpAgentManager::new`. The CLI-assigned session id is still
    // loaded here so the first turn after a task rebuild takes the resume
    // path.
    if let Some(sid) = deps
        .acp_agent_service
        .load_session_id(&ctx.conversation_id)
        .await
    {
        arc.set_session_id(sid).await;
    }

    // Open the ACP session eagerly so `POST /warmup` returns only after
    // session/new (or claude-meta-resume / session/load) and the first
    // reconcile pass have completed. Matches nomi factory behaviour:
    // the caller sees "warmed up" == "ready for PUT /mode | /model".
    arc.warmup_session().await?;

    let instance = AgentInstance::Acp(Arc::clone(&arc));

    // Hand the service the domain event receiver so it can
    // persist user intent changes without reverse-engineering
    // them from CLI observations.
    deps.acp_agent_service
        .attach(ctx.conversation_id, domain_rx)
        .await;

    Ok(instance)
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct KunProviderSelection {
    provider_id: String,
    model: String,
}

#[derive(Debug, Clone)]
struct KunProviderInjection {
    selection: KunProviderSelection,
    model_state: SessionModelState,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct KunProviderModelEntry {
    provider_id: String,
    model: String,
    encoded_id: String,
    label: String,
}

const KUN_PROVIDER_MODEL_PREFIX: &str = "provider:";

async fn inject_kun_provider_env(
    provider_repo: &Arc<dyn IProviderRepository>,
    encryption_key: &[u8; 32],
    requested_model_id: Option<&str>,
    env: &mut Vec<EnvVar>,
) -> Result<Option<KunProviderInjection>, AppError> {
    let providers = provider_repo
        .list()
        .await
        .map_err(|e| AppError::Internal(format!("failed to list providers for Kun Agent: {e}")))?;
    let Some(selection) = select_kun_provider_model(&providers, requested_model_id) else {
        return Ok(None);
    };
    let selected_model_id = encode_kun_provider_model_id(&selection.provider_id, &selection.model);
    let Some(model_state) = build_kun_provider_model_state(&providers, Some(&selected_model_id))
    else {
        return Ok(None);
    };
    let fields = resolve_provider_fields(
        provider_repo,
        encryption_key,
        &selection.provider_id,
        &selection.model,
    )
    .await?;
    append_kun_provider_env(env, &selection.provider_id, &fields);
    Ok(Some(KunProviderInjection {
        selection,
        model_state,
    }))
}

#[cfg(test)]
fn select_default_kun_provider_model(providers: &[Provider]) -> Option<KunProviderSelection> {
    select_kun_provider_model(providers, None)
}

fn encode_kun_provider_model_id(provider_id: &str, model: &str) -> String {
    format!("{KUN_PROVIDER_MODEL_PREFIX}{provider_id}:{model}")
}

fn decode_kun_provider_model_id(model_id: &str) -> Option<KunProviderSelection> {
    let raw = model_id.strip_prefix(KUN_PROVIDER_MODEL_PREFIX)?;
    let (provider_id, model) = raw.split_once(':')?;
    let provider_id = provider_id.trim();
    let model = model.trim();
    if provider_id.is_empty() || model.is_empty() {
        return None;
    }
    Some(KunProviderSelection {
        provider_id: provider_id.to_owned(),
        model: model.to_owned(),
    })
}

fn select_kun_provider_model(
    providers: &[Provider],
    requested_model_id: Option<&str>,
) -> Option<KunProviderSelection> {
    let entries = kun_provider_model_entries(providers);
    if entries.is_empty() {
        return None;
    }

    if let Some(requested) = requested_model_id.filter(|value| !value.trim().is_empty()) {
        if let Some(decoded) = decode_kun_provider_model_id(requested)
            && entries.iter().any(|entry| {
                entry.provider_id == decoded.provider_id && entry.model == decoded.model
            })
        {
            return Some(decoded);
        }

        // Legacy compatibility: older builds persisted just the model name.
        if let Some(entry) = entries.iter().find(|entry| entry.model == requested) {
            return Some(KunProviderSelection {
                provider_id: entry.provider_id.clone(),
                model: entry.model.clone(),
            });
        }
    }

    entries.first().map(|entry| KunProviderSelection {
        provider_id: entry.provider_id.clone(),
        model: entry.model.clone(),
    })
}

fn build_kun_provider_model_state(
    providers: &[Provider],
    requested_model_id: Option<&str>,
) -> Option<SessionModelState> {
    let entries = kun_provider_model_entries(providers);
    if entries.is_empty() {
        return None;
    }
    let selection = select_kun_provider_model(providers, requested_model_id)?;
    let current_model_id = encode_kun_provider_model_id(&selection.provider_id, &selection.model);
    let available_models = entries
        .into_iter()
        .map(|entry| ModelInfo::new(entry.encoded_id, entry.label))
        .collect();
    Some(SessionModelState::new(current_model_id, available_models))
}

fn kun_provider_model_entries(providers: &[Provider]) -> Vec<KunProviderModelEntry> {
    providers
        .iter()
        .filter(|provider| provider.enabled)
        .flat_map(|provider| {
            enabled_kun_models(provider)
                .into_iter()
                .map(move |model| (provider, model))
        })
        .map(|(provider, model)| KunProviderModelEntry {
            provider_id: provider.id.clone(),
            encoded_id: encode_kun_provider_model_id(&provider.id, &model),
            label: format!("{} / {}", provider.name, model),
            model,
        })
        .collect()
}

fn enabled_kun_models(provider: &Provider) -> Vec<String> {
    let models = serde_json::from_str::<Vec<String>>(&provider.models).unwrap_or_default();
    let enabled = provider
        .model_enabled
        .as_deref()
        .and_then(|raw| serde_json::from_str::<HashMap<String, bool>>(raw).ok())
        .unwrap_or_default();

    models
        .into_iter()
        .map(|model| model.trim().to_owned())
        .filter(|model| !model.is_empty())
        .filter(|model| enabled.get(model).copied().unwrap_or(true))
        .collect()
}

fn append_kun_provider_env(
    env: &mut Vec<EnvVar>,
    provider_id: &str,
    fields: &ResolvedProviderFields,
) {
    push_env(env, "KUN_PROVIDER_ID", provider_id);
    push_env(env, "KUN_PROVIDER", &fields.provider);
    push_env(env, "KUN_THREAD_MODEL", &fields.model);
    push_env(env, "KUN_MODEL", &fields.model);
    push_env(env, "KUN_API_KEY", &fields.api_key);
    push_env(env, "API_KEY", &fields.api_key);
    push_env(env, "MODEL", &fields.model);
    if let Some(base_url) = fields.base_url.as_deref().filter(|value| !value.is_empty()) {
        let api_path = fields
            .compat_overrides
            .api_path
            .as_deref()
            .unwrap_or("/v1/chat/completions");
        push_env(env, "KUN_BASE_URL", base_url);
        push_env(env, "KUN_API_PATH", api_path);
        push_env(env, "BASE_URL", base_url);
        push_env(
            env,
            "OPENAI_BASE_URL",
            &openai_sdk_base_url(base_url, api_path),
        );
        if fields.provider == "anthropic" {
            push_env(env, "ANTHROPIC_BASE_URL", base_url);
        }
    }
    if fields.provider == "anthropic" {
        push_env(env, "ANTHROPIC_API_KEY", &fields.api_key);
        push_env(env, "ANTHROPIC_MODEL", &fields.model);
    } else {
        push_env(env, "OPENAI_API_KEY", &fields.api_key);
    }
}

fn append_managed_kun_runtime_env(
    env: &mut Vec<EnvVar>,
    runtime_dir: Option<std::path::PathBuf>,
) -> Option<std::path::PathBuf> {
    if has_nonempty_env(env, "HANGCORE_MANAGED_KUN_RUNTIME_DIR")
        || has_nonempty_env(env, "KUN_SOURCE_DIR")
    {
        return None;
    }
    let runtime_dir = runtime_dir?;
    let value = runtime_dir.to_string_lossy().into_owned();
    push_env(env, "HANGCORE_MANAGED_KUN_RUNTIME_DIR", &value);
    Some(runtime_dir)
}

fn has_nonempty_env(env: &[EnvVar], name: &str) -> bool {
    env.iter()
        .any(|item| item.name == name && !item.value.trim().is_empty())
}

fn push_env(env: &mut Vec<EnvVar>, name: &str, value: &str) {
    if value.is_empty() {
        return;
    }
    if let Some(existing) = env.iter_mut().find(|item| item.name == name) {
        existing.value = value.to_owned();
    } else {
        env.push(EnvVar {
            name: name.to_owned(),
            value: value.to_owned(),
        });
    }
}

fn openai_sdk_base_url(base_url: &str, api_path: &str) -> String {
    let trimmed = base_url.trim_end_matches('/');
    if api_path == "/v1/chat/completions" && !trimmed.ends_with("/v1") {
        format!("{trimmed}/v1")
    } else {
        trimmed.to_owned()
    }
}

/// Load the operator's enabled MCP servers from the DB, log+skip any rows
/// whose `transport_config` JSON fails to parse (better to start without one
/// MCP tool than fail the whole session), and return them in SDK shape ready
/// for `NewSessionRequest::mcp_servers`.
///
/// When `selected_ids` is present, those rows define the session snapshot and
/// are injected regardless of the current global `enabled` flag. Legacy
/// conversations without a snapshot still fall back to "all enabled rows".
/// Builtins are wired through other paths and are not loaded from the user MCP table.
async fn load_user_mcp_servers(
    repo: &dyn IMcpServerRepository,
    selected_ids: Option<&[String]>,
    conversation_id: &str,
    capabilities: &AcpMcpCapabilities,
) -> Vec<McpServer> {
    // MCP server ids are i64 since the primary-key rework. The build-extra
    // carries them as a JSON string array (written by the conversation
    // service), so parse to i64 here; unparseable entries can never match a
    // row and are dropped.
    let selected_ids: Option<Vec<i64>> =
        selected_ids.map(|ids| ids.iter().filter_map(|id| id.parse::<i64>().ok()).collect());
    let rows_result = match selected_ids.as_deref() {
        Some(ids) => repo.list_by_ids_any(ids).await,
        None => repo.list().await,
    };
    let rows = match rows_result {
        Ok(r) => r,
        Err(err) => {
            warn!(
                conversation_id,
                error = %err,
                "user_mcp: list() failed; skipping injection"
            );
            return Vec::new();
        }
    };

    let mut servers = Vec::with_capacity(rows.len());
    for row in rows {
        let selected = selected_ids
            .as_deref()
            .map(|ids| ids.iter().any(|id| *id == row.id))
            .unwrap_or(row.enabled);
        if !selected || row.builtin {
            continue;
        }
        if !row_supported_by_capabilities(&row, capabilities) {
            warn!(
                conversation_id,
                server_id = %row.id,
                server_name = %row.name,
                transport_type = %row.transport_type,
                "user_mcp: transport unsupported by ACP agent; skipping"
            );
            continue;
        }
        match row_to_sdk_mcp_server(&row) {
            Ok(server) => servers.push(server),
            Err(err) => {
                warn!(
                    conversation_id,
                    server_id = %row.id,
                    server_name = %row.name,
                    error = %err,
                    "user_mcp: failed to convert row; skipping"
                );
            }
        }
    }

    if !servers.is_empty() {
        info!(
            conversation_id,
            count = servers.len(),
            "user_mcp: injected into session/new"
        );
    }
    servers
}

/// Convert an `McpServerRow` into the SDK `McpServer` shape used by
/// `NewSessionRequest::mcp_servers`. Returns an error string when
/// `transport_config` is malformed or required fields are missing.
fn row_to_sdk_mcp_server(row: &McpServerRow) -> Result<McpServer, String> {
    let value: serde_json::Value = serde_json::from_str(&row.transport_config)
        .map_err(|e| format!("invalid transport_config JSON: {e}"))?;

    match row.transport_type.as_str() {
        "stdio" => {
            let command = value
                .get("command")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "stdio: missing command".to_owned())?;
            let resolved_command = resolve_stdio_command(command);
            let args: Vec<String> = value
                .get("args")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect()
                })
                .unwrap_or_default();
            let env: Vec<EnvVariable> = value
                .get("env")
                .and_then(|v| v.as_object())
                .map(|obj| {
                    let mut entries: Vec<(String, String)> = obj
                        .iter()
                        .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_owned())))
                        .collect();
                    // Sort for deterministic ordering across runs.
                    entries.sort_by(|a, b| a.0.cmp(&b.0));
                    entries
                        .into_iter()
                        .map(|(k, v)| EnvVariable::new(k, v))
                        .collect()
                })
                .unwrap_or_default();

            let stdio = McpServerStdio::new(row.name.clone(), resolved_command)
                .args(args)
                .env(env);
            Ok(McpServer::Stdio(stdio))
        }
        "http" | "streamable_http" => {
            let url = value
                .get("url")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "http: missing url".to_owned())?;
            let headers = parse_headers(value.get("headers"));
            Ok(McpServer::Http(
                McpServerHttp::new(row.name.clone(), url).headers(headers),
            ))
        }
        "sse" => {
            let url = value
                .get("url")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "sse: missing url".to_owned())?;
            let headers = parse_headers(value.get("headers"));
            Ok(McpServer::Sse(
                McpServerSse::new(row.name.clone(), url).headers(headers),
            ))
        }
        other => Err(format!("unknown transport type: {other}")),
    }
}

fn parse_headers(value: Option<&serde_json::Value>) -> Vec<HttpHeader> {
    let Some(obj) = value.and_then(|v| v.as_object()) else {
        return Vec::new();
    };
    let mut entries: Vec<(String, String)> = obj
        .iter()
        .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_owned())))
        .collect();
    entries.sort_by(|a, b| a.0.cmp(&b.0));
    entries
        .into_iter()
        .map(|(k, v)| HttpHeader::new(k, v))
        .collect()
}

fn session_server_to_sdk_mcp_server(server: &SessionMcpServer) -> Result<McpServer, String> {
    match &server.transport {
        SessionMcpTransport::Stdio { command, args, env } => {
            if command.is_empty() {
                return Err("stdio: missing command".to_owned());
            }
            let mut entries: Vec<(String, String)> =
                env.iter().map(|(k, v)| (k.clone(), v.clone())).collect();
            entries.sort_by(|a, b| a.0.cmp(&b.0));
            let env = entries
                .into_iter()
                .map(|(k, v)| EnvVariable::new(k, v))
                .collect();
            Ok(McpServer::Stdio(
                McpServerStdio::new(server.name.clone(), resolve_stdio_command(command))
                    .args(args.clone())
                    .env(env),
            ))
        }
        SessionMcpTransport::Http { url, headers }
        | SessionMcpTransport::StreamableHttp { url, headers } => {
            if url.is_empty() {
                return Err("http: missing url".to_owned());
            }
            let mut entries: Vec<(String, String)> = headers
                .iter()
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect();
            entries.sort_by(|a, b| a.0.cmp(&b.0));
            let headers = entries
                .into_iter()
                .map(|(k, v)| HttpHeader::new(k, v))
                .collect();
            Ok(McpServer::Http(
                McpServerHttp::new(server.name.clone(), url).headers(headers),
            ))
        }
        SessionMcpTransport::Sse { url, headers } => {
            if url.is_empty() {
                return Err("sse: missing url".to_owned());
            }
            let mut entries: Vec<(String, String)> = headers
                .iter()
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect();
            entries.sort_by(|a, b| a.0.cmp(&b.0));
            let headers = entries
                .into_iter()
                .map(|(k, v)| HttpHeader::new(k, v))
                .collect();
            Ok(McpServer::Sse(
                McpServerSse::new(server.name.clone(), url).headers(headers),
            ))
        }
    }
}

fn resolve_stdio_command(command: &str) -> String {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return command.to_owned();
    }

    let path = std::path::Path::new(trimmed);
    if path.is_absolute()
        || trimmed.contains(std::path::MAIN_SEPARATOR)
        || trimmed.contains('/')
        || trimmed.contains('\\')
    {
        return trimmed.to_owned();
    }

    resolve_command_path(trimmed)
        .map(|path| path.to_string_lossy().into_owned())
        .unwrap_or_else(|| trimmed.to_owned())
}

fn row_supported_by_capabilities(row: &McpServerRow, capabilities: &AcpMcpCapabilities) -> bool {
    match row.transport_type.as_str() {
        "stdio" => capabilities.stdio,
        "http" | "streamable_http" => capabilities.http,
        "sse" => capabilities.sse,
        _ => false,
    }
}

fn session_server_supported_by_capabilities(
    server: &SessionMcpServer,
    capabilities: &AcpMcpCapabilities,
) -> bool {
    match server.transport {
        SessionMcpTransport::Stdio { .. } => capabilities.stdio,
        SessionMcpTransport::Http { .. } | SessionMcpTransport::StreamableHttp { .. } => {
            capabilities.http
        }
        SessionMcpTransport::Sse { .. } => capabilities.sse,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_row(
        id: i64,
        name: &str,
        transport_type: &str,
        transport_config: &str,
        enabled: bool,
        builtin: bool,
    ) -> McpServerRow {
        McpServerRow {
            id,
            name: name.to_owned(),
            description: None,
            enabled,
            transport_type: transport_type.into(),
            transport_config: transport_config.into(),
            tools: None,
            last_test_status: "disconnected".into(),
            last_connected: None,
            original_json: None,
            builtin,
            deleted_at: None,
            created_at: 0,
            updated_at: 0,
        }
    }

    #[test]
    fn row_to_sdk_stdio_roundtrip() {
        let row = make_row(
            1,
            "ctx7",
            "stdio",
            r#"{"command":"npx","args":["-y","@upstash/context7-mcp"],"env":{"K":"V"}}"#,
            true,
            false,
        );
        let server = row_to_sdk_mcp_server(&row).expect("convert");
        match server {
            McpServer::Stdio(s) => {
                assert_eq!(s.name, "ctx7");
                // `resolve_command_path` may resolve to an absolute path; on
                // Windows that includes the `.cmd`/`.exe` extension.
                let command = s
                    .command
                    .to_string_lossy()
                    .replace('\\', "/")
                    .to_lowercase();
                assert!(
                    command == "npx" || command.ends_with("/npx") || command.ends_with("/npx.cmd"),
                    "unexpected stdio command path: {command}",
                );
                assert_eq!(
                    s.args,
                    vec!["-y".to_owned(), "@upstash/context7-mcp".to_owned()]
                );
                assert_eq!(s.env.len(), 1);
                assert_eq!(s.env[0].name, "K");
                assert_eq!(s.env[0].value, "V");
            }
            _ => panic!("expected Stdio"),
        }
    }

    #[test]
    fn row_to_sdk_http_with_headers() {
        let row = make_row(
            2,
            "remote",
            "http",
            r#"{"url":"https://example.com/mcp","headers":{"Authorization":"Bearer tok"}}"#,
            true,
            false,
        );
        let server = row_to_sdk_mcp_server(&row).expect("convert");
        match server {
            McpServer::Http(h) => {
                assert_eq!(h.name, "remote");
                assert_eq!(h.url, "https://example.com/mcp");
                assert_eq!(h.headers.len(), 1);
                assert_eq!(h.headers[0].name, "Authorization");
                assert_eq!(h.headers[0].value, "Bearer tok");
            }
            _ => panic!("expected Http"),
        }
    }

    #[test]
    fn row_to_sdk_unknown_transport_type_errors() {
        let row = make_row(3, "bad", "websocket", "{}", true, false);
        assert!(row_to_sdk_mcp_server(&row).is_err());
    }

    #[test]
    fn row_to_sdk_invalid_json_errors() {
        let row = make_row(4, "bad", "stdio", "not-json", true, false);
        assert!(row_to_sdk_mcp_server(&row).is_err());
    }

    #[test]
    fn row_to_sdk_stdio_missing_command_errors() {
        let row = make_row(5, "bad", "stdio", r#"{"args":[]}"#, true, false);
        assert!(row_to_sdk_mcp_server(&row).is_err());
    }

    #[test]
    fn kun_default_model_selects_first_enabled_provider_model() {
        let rows = vec![
            provider_row("disabled", "openai", false, r#"["off-model"]"#, None),
            provider_row(
                "enabled",
                "custom",
                true,
                r#"["disabled-model","usable-model"]"#,
                Some(r#"{"disabled-model":false}"#),
            ),
        ];

        let selected = select_default_kun_provider_model(&rows).expect("enabled provider/model");

        assert_eq!(selected.provider_id, "enabled");
        assert_eq!(selected.model, "usable-model");
    }

    #[test]
    fn kun_provider_model_id_round_trips_model_with_colon() {
        let encoded = encode_kun_provider_model_id("deepseek", "deepseek:chat");
        let decoded = decode_kun_provider_model_id(&encoded).expect("encoded provider model id");

        assert_eq!(decoded.provider_id, "deepseek");
        assert_eq!(decoded.model, "deepseek:chat");
    }

    #[test]
    fn kun_provider_model_selects_requested_system_model() {
        let rows = vec![
            provider_row("openai", "openai", true, r#"["gpt-4o"]"#, None),
            provider_row("deepseek", "openai", true, r#"["deepseek-chat"]"#, None),
        ];
        let requested = encode_kun_provider_model_id("deepseek", "deepseek-chat");

        let selected =
            select_kun_provider_model(&rows, Some(&requested)).expect("requested provider/model");

        assert_eq!(selected.provider_id, "deepseek");
        assert_eq!(selected.model, "deepseek-chat");
    }

    #[test]
    fn kun_provider_model_state_exposes_enabled_system_models() {
        let rows = vec![
            provider_row(
                "disabled-provider",
                "openai",
                false,
                r#"["off-model"]"#,
                None,
            ),
            provider_row(
                "deepseek",
                "openai",
                true,
                r#"["disabled-model","deepseek-chat"]"#,
                Some(r#"{"disabled-model":false}"#),
            ),
        ];
        let requested = encode_kun_provider_model_id("deepseek", "deepseek-chat");

        let state = build_kun_provider_model_state(&rows, Some(&requested))
            .expect("system provider models");

        assert_eq!(state.current_model_id.to_string(), requested);
        assert_eq!(state.available_models.len(), 1);
        assert_eq!(state.available_models[0].model_id.to_string(), requested);
        assert_eq!(
            state.available_models[0].name,
            "Provider deepseek / deepseek-chat"
        );
    }

    #[test]
    fn kun_provider_env_exposes_system_provider_to_adapter_and_runtime() {
        let fields = crate::factory::provider_config::ResolvedProviderFields {
            provider: "openai".to_owned(),
            api_key: "sk-test".to_owned(),
            model: "gpt-4o".to_owned(),
            base_url: Some("https://api.example.com/v1".to_owned()),
            compat_overrides: Default::default(),
            bedrock_config: None,
            context_limit: None,
        };
        let mut env = Vec::new();

        append_kun_provider_env(&mut env, "prov-1", &fields);

        assert_env(&env, "KUN_PROVIDER_ID", "prov-1");
        assert_env(&env, "KUN_THREAD_MODEL", "gpt-4o");
        assert_env(&env, "KUN_MODEL", "gpt-4o");
        assert_env(&env, "KUN_PROVIDER", "openai");
        assert_env(&env, "KUN_API_KEY", "sk-test");
        assert_env(&env, "KUN_BASE_URL", "https://api.example.com/v1");
        assert_env(&env, "OPENAI_API_KEY", "sk-test");
        assert_env(&env, "OPENAI_BASE_URL", "https://api.example.com/v1");
        assert_env(&env, "API_KEY", "sk-test");
        assert_env(&env, "BASE_URL", "https://api.example.com/v1");
        assert_env(&env, "MODEL", "gpt-4o");
    }

    #[test]
    fn kun_runtime_env_injects_managed_runtime_dir_when_resolved() {
        let managed_dir = tempfile::TempDir::new().unwrap();
        let expected = managed_dir.path().to_string_lossy().into_owned();
        let mut env = Vec::new();

        append_managed_kun_runtime_env(&mut env, Some(managed_dir.path().to_path_buf()));

        assert_env(&env, "HANGCORE_MANAGED_KUN_RUNTIME_DIR", &expected);
    }

    #[test]
    fn kun_runtime_env_keeps_explicit_catalog_value() {
        let mut env = vec![nomifun_common::EnvVar {
            name: "HANGCORE_MANAGED_KUN_RUNTIME_DIR".to_owned(),
            value: "C:/custom/kun-runtime".to_owned(),
        }];

        append_managed_kun_runtime_env(
            &mut env,
            Some(std::path::PathBuf::from("C:/bundled/kun-runtime")),
        );

        assert_env(
            &env,
            "HANGCORE_MANAGED_KUN_RUNTIME_DIR",
            "C:/custom/kun-runtime",
        );
    }

    fn provider_row(
        id: &str,
        platform: &str,
        enabled: bool,
        models: &str,
        model_enabled: Option<&str>,
    ) -> nomifun_db::models::Provider {
        nomifun_db::models::Provider {
            id: id.to_owned(),
            platform: platform.to_owned(),
            name: format!("Provider {id}"),
            base_url: "https://api.example.com/v1".to_owned(),
            api_key_encrypted: "encrypted".to_owned(),
            models: models.to_owned(),
            enabled,
            capabilities: "[]".to_owned(),
            context_limit: None,
            model_context_limits: None,
            model_protocols: None,
            model_descriptions: None,
            model_enabled: model_enabled.map(str::to_owned),
            model_health: None,
            bedrock_config: None,
            is_full_url: false,
            created_at: 1,
            updated_at: 1,
        }
    }

    fn assert_env(env: &[nomifun_common::EnvVar], name: &str, value: &str) {
        assert_eq!(
            env.iter()
                .find(|item| item.name == name)
                .map(|item| item.value.as_str()),
            Some(value),
            "expected {name}={value}, got {env:?}"
        );
    }

    // -- load_user_mcp_servers integration -----------------------------------

    use async_trait::async_trait;
    use std::sync::Arc;

    struct MockRepo {
        rows: Vec<McpServerRow>,
        fail: bool,
    }

    #[async_trait]
    impl IMcpServerRepository for MockRepo {
        async fn list(&self) -> Result<Vec<McpServerRow>, nomifun_db::DbError> {
            if self.fail {
                Err(nomifun_db::DbError::Init("simulated".into()))
            } else {
                Ok(self.rows.clone())
            }
        }
        async fn find_by_id(&self, _id: i64) -> Result<Option<McpServerRow>, nomifun_db::DbError> {
            unimplemented!()
        }
        async fn find_by_name(
            &self,
            _name: &str,
        ) -> Result<Option<McpServerRow>, nomifun_db::DbError> {
            unimplemented!()
        }
        async fn list_by_ids_any(
            &self,
            ids: &[i64],
        ) -> Result<Vec<McpServerRow>, nomifun_db::DbError> {
            if self.fail {
                return Err(nomifun_db::DbError::Init("simulated".into()));
            }
            Ok(ids
                .iter()
                .filter_map(|id| self.rows.iter().find(|row| row.id == *id).cloned())
                .collect())
        }
        async fn create(
            &self,
            _params: nomifun_db::CreateMcpServerParams<'_>,
        ) -> Result<McpServerRow, nomifun_db::DbError> {
            unimplemented!()
        }
        async fn update(
            &self,
            _id: i64,
            _params: nomifun_db::UpdateMcpServerParams<'_>,
        ) -> Result<McpServerRow, nomifun_db::DbError> {
            unimplemented!()
        }
        async fn delete(&self, _id: i64) -> Result<(), nomifun_db::DbError> {
            unimplemented!()
        }
        async fn batch_upsert(
            &self,
            _servers: &[nomifun_db::CreateMcpServerParams<'_>],
        ) -> Result<Vec<McpServerRow>, nomifun_db::DbError> {
            unimplemented!()
        }
        async fn update_status(
            &self,
            _id: i64,
            _status: &str,
            _last_connected: Option<nomifun_common::TimestampMs>,
        ) -> Result<(), nomifun_db::DbError> {
            unimplemented!()
        }
        async fn update_tools(
            &self,
            _id: i64,
            _tools: Option<&str>,
        ) -> Result<(), nomifun_db::DbError> {
            unimplemented!()
        }
    }

    #[tokio::test]
    async fn load_user_mcp_servers_skips_disabled_and_builtin() {
        let caps = AcpMcpCapabilities {
            stdio: true,
            http: true,
            sse: true,
        };
        let repo: Arc<dyn IMcpServerRepository> = Arc::new(MockRepo {
            rows: vec![
                make_row(
                    10,
                    "user-enabled",
                    "stdio",
                    r#"{"command":"npx","args":[],"env":{}}"#,
                    true,
                    false,
                ),
                make_row(
                    11,
                    "user-disabled",
                    "stdio",
                    r#"{"command":"npx","args":[],"env":{}}"#,
                    false,
                    false,
                ),
                make_row(
                    12,
                    "builtin",
                    "stdio",
                    r#"{"command":"img-gen","args":[],"env":{}}"#,
                    true,
                    true,
                ),
            ],
            fail: false,
        });
        let servers = load_user_mcp_servers(repo.as_ref(), None, "conv-1", &caps).await;
        assert_eq!(servers.len(), 1);
        match &servers[0] {
            McpServer::Stdio(s) => assert_eq!(s.name, "user-enabled"),
            _ => panic!("expected stdio"),
        }
    }

    #[tokio::test]
    async fn load_user_mcp_servers_returns_empty_on_repo_failure() {
        let caps = AcpMcpCapabilities {
            stdio: true,
            http: true,
            sse: true,
        };
        let repo: Arc<dyn IMcpServerRepository> = Arc::new(MockRepo {
            rows: vec![],
            fail: true,
        });
        let servers = load_user_mcp_servers(repo.as_ref(), None, "conv-1", &caps).await;
        assert!(servers.is_empty());
    }

    #[tokio::test]
    async fn load_user_mcp_servers_skips_malformed_rows_but_keeps_others() {
        let caps = AcpMcpCapabilities {
            stdio: true,
            http: true,
            sse: true,
        };
        let repo: Arc<dyn IMcpServerRepository> = Arc::new(MockRepo {
            rows: vec![
                make_row(
                    20,
                    "good",
                    "stdio",
                    r#"{"command":"npx","args":[],"env":{}}"#,
                    true,
                    false,
                ),
                make_row(21, "bad", "stdio", "not-json", true, false),
            ],
            fail: false,
        });
        let servers = load_user_mcp_servers(repo.as_ref(), None, "conv-1", &caps).await;
        assert_eq!(servers.len(), 1);
        match &servers[0] {
            McpServer::Stdio(s) => assert_eq!(s.name, "good"),
            _ => panic!("expected stdio"),
        }
    }

    #[tokio::test]
    async fn load_user_mcp_servers_uses_selected_snapshot_over_enabled_state() {
        let caps = AcpMcpCapabilities {
            stdio: true,
            http: true,
            sse: true,
        };
        let repo: Arc<dyn IMcpServerRepository> = Arc::new(MockRepo {
            rows: vec![
                make_row(
                    30,
                    "enabled",
                    "stdio",
                    r#"{"command":"npx","args":[],"env":{}}"#,
                    true,
                    false,
                ),
                make_row(
                    31,
                    "disabled-picked",
                    "stdio",
                    r#"{"command":"uvx","args":[],"env":{}}"#,
                    false,
                    false,
                ),
            ],
            fail: false,
        });

        let selected = vec!["31".to_owned()];
        let servers = load_user_mcp_servers(repo.as_ref(), Some(&selected), "conv-1", &caps).await;

        assert_eq!(servers.len(), 1);
        match &servers[0] {
            McpServer::Stdio(s) => assert_eq!(s.name, "disabled-picked"),
            _ => panic!("expected stdio"),
        }
    }

    #[tokio::test]
    async fn load_user_mcp_servers_skips_rows_unsupported_by_capabilities() {
        let caps = AcpMcpCapabilities {
            stdio: false,
            http: true,
            sse: false,
        };
        let repo: Arc<dyn IMcpServerRepository> = Arc::new(MockRepo {
            rows: vec![make_row(
                40,
                "stdio-only",
                "stdio",
                r#"{"command":"npx","args":[],"env":{}}"#,
                true,
                false,
            )],
            fail: false,
        });

        let servers = load_user_mcp_servers(repo.as_ref(), None, "conv-1", &caps).await;
        assert!(servers.is_empty());
    }
}
