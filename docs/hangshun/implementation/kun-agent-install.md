# Kun Agent 安装与连接说明

适用版本：HangCore Agent v0.1.2 起；真实 Kun approval / user-input 闭环需使用 v0.1.5 或后续安装包。

## 这不是主程序下载入口

设置里的 Kun Agent “手动下载”入口只说明 Kun Agent adapter 的连接方式，不再跳到 HangCore Agent 主项目 Release。HangCore 主程序安装包只是桌面外壳；真正让 Kun Agent 可被 Local Agents 调用的是 `kun-acp-adapter`。

## 工作方式

- HangCore Local Agents 内置 `Kun Agent`，命令为 `kun-acp-adapter --stdio`。
- Windows 桌面包会随包带上 HangCore 自己实现的 `kun-acp-adapter`。
- adapter 不复制 Kun 运行时代码，只通过 HTTP/SSE 调用本机 Kun runtime。
- Kun runtime 默认地址是 `http://127.0.0.1:18899`，可用 `KUN_RUNTIME_URL` 覆盖。
- 当默认地址不可达时，adapter 会自动尝试执行 `kun serve --host 127.0.0.1 --port 18899` 拉起本机 runtime。

选择 Kun Agent 后，HangCore 会启动 `kun-acp-adapter --stdio` 作为 ACP 子进程；adapter 创建 Kun thread、发送 prompt，并消费 Kun runtime 的 SSE 事件。因此这不是只套一个 UI 壳，而是把 NomiFun 的 Local Agents 对话流桥接到正在运行的 Kun agent loop。

## 使用步骤

1. 确认本机已安装 Kun CLI，并且 `kun` 命令在系统 PATH 中可用。

2. 打开 HangCore Agent，进入设置里的 Local Agents，刷新后选择 Kun Agent 开始会话。

正常情况下不需要手动启动 Kun runtime；首次对话时 adapter 会先探测 `/health`，如果默认 runtime 未启动，会自动拉起。

如果自动拉起失败，可以手动启动 Kun runtime：

   ```bash
   kun serve --host 127.0.0.1 --port 18899 --data-dir <your-kun-data-dir>
   ```

如果 Kun runtime 设置了 token，在启动 HangCore 前设置：

   ```bash
   KUN_RUNTIME_TOKEN=<token>
   ```

如果不希望 adapter 自动拉起 Kun runtime，可设置：

```bash
KUN_RUNTIME_AUTO_START=0
```

如果 Kun CLI 不叫 `kun` 或需要额外启动参数，可设置：

```bash
KUN_RUNTIME_COMMAND=<your-kun-command>
KUN_RUNTIME_ARGS="serve --host 127.0.0.1 --port 18899"
```

## 验证

```bash
kun-acp-adapter --version
kun-acp-adapter --stdio
```

`--stdio` 是 ACP JSON-RPC 模式，正常情况下会等待 HangCore 发送 `initialize`，不会在终端输出普通聊天内容。

## 当前 MVP 边界

- 已支持 ACP `initialize`、`session/new`、`session/prompt`、`session/cancel`。
- 已把 Kun `assistant_text_delta` / `assistant_reasoning_delta` 映射为 ACP 文本与思考流。
- 已把 `tool_call_ready`、工具开始/结束和 tool item 生命周期映射为 ACP tool call 更新。
- v0.1.5 起，已把 Kun `approval_requested` 转成 NomiFun 现有权限卡，并把用户选择 POST 回 Kun `/v1/approvals/{approvalId}`。
- v0.1.5 起，adapter 核心支持 Kun `user_input_requested` 回调并 POST 回 `/v1/user-inputs/{inputId}`；ACP stdio 默认实现使用权限卡承载单题选项输入。
- 默认只对 `http://127.0.0.1:18899` 自动拉起本机 runtime；如果通过 `KUN_RUNTIME_URL` 指向自定义地址，adapter 不会擅自启动本机进程，除非显式设置 `KUN_RUNTIME_AUTO_START=1` 并配置合适的命令参数。
- 如果 Kun CLI 未安装或不在 PATH 中，会在会话启动时报出明确的自动启动失败原因。
- 系统模型服务商配置会注入给 Kun runtime 使用，但默认不会绕过 Kun runtime 直连模型服务商；只有显式设置 `KUN_PROVIDER_FALLBACK=1` 时，才允许 provider-only 诊断 fallback。
- 自由文本或多题 user-input 尚未有专用表单 UI，会保守取消，后续可切到 ACP elicitation 或自建弹窗。
