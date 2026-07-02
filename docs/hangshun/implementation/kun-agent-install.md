# Kun Agent 安装与连接说明

适用版本：HangCore Agent v0.1.2 起。

## 这不是主程序下载入口

设置里的 Kun Agent “手动下载”入口只说明 Kun Agent adapter 的连接方式，不再跳到 HangCore Agent 主项目 Release。HangCore 主程序安装包只是桌面外壳；真正让 Kun Agent 可被 Local Agents 调用的是 `kun-acp-adapter`。

## v0.1.2 的工作方式

- HangCore Local Agents 内置 `Kun Agent`，命令为 `kun-acp-adapter --stdio`。
- Windows 桌面包会随包带上 HangCore 自己实现的 `kun-acp-adapter`。
- adapter 不复制 Kun 运行时代码，只通过 HTTP/SSE 调用本机 Kun runtime。
- Kun runtime 默认地址是 `http://127.0.0.1:18899`，可用 `KUN_RUNTIME_URL` 覆盖。

选择 Kun Agent 后，HangCore 会启动 `kun-acp-adapter --stdio` 作为 ACP 子进程；adapter 创建 Kun thread、发送 prompt，并消费 Kun runtime 的 SSE 事件。因此这不是只套一个 UI 壳，而是把 NomiFun 的 Local Agents 对话流桥接到正在运行的 Kun agent loop。

## 使用步骤

1. 先启动 Kun runtime：

   ```bash
   kun serve --host 127.0.0.1 --port 18899 --data-dir <your-kun-data-dir>
   ```

2. 如果 Kun runtime 设置了 token，在启动 HangCore 前设置：

   ```bash
   KUN_RUNTIME_TOKEN=<token>
   ```

3. 打开 HangCore Agent，进入设置里的 Local Agents，刷新后选择 Kun Agent 开始会话。

## 验证

```bash
kun-acp-adapter --version
kun-acp-adapter --stdio
```

`--stdio` 是 ACP JSON-RPC 模式，正常情况下会等待 HangCore 发送 `initialize`，不会在终端输出普通聊天内容。

## 当前 MVP 边界

- 已支持 ACP `initialize`、`session/new`、`session/prompt`、`session/cancel`。
- 已把 Kun `assistant_text_delta` / `assistant_reasoning_delta` 映射为 ACP 文本与思考流。
- 已把基础工具开始/结束事件映射为 ACP tool call 更新。
- 暂不内置自动拉起 Kun runtime；如果 Kun runtime 未启动，会在会话启动时报出明确连接错误。
