# Kun ACP Adapter 真实 Runtime 闭环设计

适用版本：HangCore Agent v0.1.5 起。

## 边界

HangCore 不复制 Kun runtime 源码，也不把 Kun agent loop 改写进 nomiFun core。Kun 继续作为外部本地 runtime 运行，HangCore 只通过自有 `kun-acp-adapter --stdio` 接入：

```text
NomiFun ACP session
-> kun-acp-adapter --stdio
-> Kun HTTP runtime
-> Kun original AgentLoop
-> Kun SSE runtime events
```

这条边界保证 M3 只完成协议适配和用户体验闭环；后续 M4 的 CodingTask / SpecArtifact 不需要依赖 Kun 内部实现。

## Runtime 契约

adapter 使用 Kun 原 runtime 的 HTTP/SSE 契约：

- `GET /health`：探测 runtime 是否可用。
- `POST /v1/threads`：创建 Kun thread，传入 workspace、model、mode、approvalPolicy、sandboxMode。
- `POST /v1/threads/{threadId}/turns`：把 ACP prompt 发送给 Kun original AgentLoop。
- `GET /v1/threads/{threadId}/events?since_seq={seq}`：消费 runtime SSE 事件。
- `POST /v1/threads/{threadId}/turns/{turnId}/interrupt`：转发 ACP cancel。
- `POST /v1/approvals/{approvalId}`：把 NomiFun 权限卡选择回填给 Kun approval gate。
- `POST /v1/user-inputs/{inputId}`：把用户输入或取消回填给 Kun user-input gate。

默认 runtime URL 是 `http://127.0.0.1:18899`。当默认地址不可达时，adapter 会尝试执行：

```bash
kun serve --host 127.0.0.1 --port 18899
```

可通过 `KUN_RUNTIME_URL`、`KUN_RUNTIME_COMMAND`、`KUN_RUNTIME_ARGS`、`KUN_RUNTIME_AUTO_START` 覆盖。

系统模型服务商配置可以通过 `KUN_PROVIDER`、`KUN_API_KEY`、`KUN_BASE_URL`、`KUN_API_PATH` 注入给 Kun runtime 使用，但这不等于 HangCore 可以绕过 Kun runtime。默认模式下，Kun Agent 必须连上 Kun HTTP/SSE runtime 才能完成会话；只有显式设置 `KUN_PROVIDER_FALLBACK=1` 时，adapter 才允许 provider-only 诊断 fallback。provider-only fallback 不具备 Kun 原生 AgentLoop、思考流、工具流和审批链路能力，不能作为“真实 Kun runtime 闭环”验收依据。

## 事件映射

| Kun runtime event | HangCore / ACP 行为 |
| --- | --- |
| `assistant_text_delta` | `session/update` 的 `agent_message_chunk` |
| `assistant_reasoning_delta` | `session/update` 的 `agent_thought_chunk` |
| `tool_call_ready` | 创建 ACP `tool_call`，状态为 `pending` |
| `tool_call_started` / `item_created` / `item_updated` tool_call | 创建或刷新 ACP `tool_call`，状态为 `in_progress` |
| `tool_call_finished` / `item_completed` tool_call | 发送 ACP `tool_call_update`，状态为 `completed` 或 `failed` |
| `approval_requested` | adapter 向 NomiFun 发 `session/request_permission`，等待用户选择后 POST `/v1/approvals/{approvalId}` |
| `user_input_requested` | adapter 通过注入回调 POST `/v1/user-inputs/{inputId}`；ACP stdio 模式下暂用现有权限卡承载单题选项输入 |
| `turn_completed` | ACP prompt 返回 `end_turn` |
| `turn_aborted` | ACP prompt 返回 `cancelled` |
| `turn_failed` / `error` | ACP prompt 返回 `refusal` |

## JSON-RPC 方向

`kun-acp-adapter` 现在是双向 JSON-RPC peer：

- NomiFun -> adapter：`initialize`、`authenticate`、`session/new`、`session/prompt`、`session/cancel`。
- adapter -> NomiFun：`session/update` notification 和 `session/request_permission` request。
- NomiFun -> adapter：对 `session/request_permission` 的 JSON-RPC response。

这让 Kun original AgentLoop 可以在审批点暂停，NomiFun UI 决策返回后再继续执行。

## User Input 当前边界

ACP 稳定权限通道已经可用，所以 Kun approval 可以完整复用 NomiFun 权限 UI。ACP elicitation 在当前后端依赖中仍属于 unstable 能力，HangCore 尚未启用专门表单 UI，因此 v0.1.5 的 stdio 模式对 Kun `user_input_requested` 采用保守桥接：

- adapter 核心支持 `requestUserInput` 回调并能 POST 回 Kun `/v1/user-inputs/{inputId}`。
- ACP stdio 默认实现会把第一道带选项的问题转成 `session/request_permission` 单选卡。
- 没有选项、自由文本、多题表单会返回 cancelled，避免 Kun loop 无限等待。

后续如果启用 ACP `elicitation/create` 或自建输入弹窗，可在不改 Kun runtime 的情况下替换这层回调。

## 验证命令

```bash
bun test adapters/kun-acp-adapter/test
cargo test -p nomifun-ai-agent
git diff --check
```

真实 runtime 验证流程：

1. 启动或自动拉起 Kun runtime。
2. 在 HangCore 选择 Kun Agent 创建会话。
3. 发送需要工具调用和审批的 prompt。
4. 确认 NomiFun 权限卡出现，选择 Allow once。
5. 确认 adapter POST 回 Kun approval endpoint，SSE 继续到 `turn_completed`。
