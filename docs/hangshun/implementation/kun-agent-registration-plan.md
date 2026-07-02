# Kun Agent 注册框架设计

## 背景

HangCore Agent 第一版已经完成 `nomiFun` 底座收敛、Windows x64 安装包、Tauri updater 资产和 GitHub Release。下一阶段进入 `M2 本地 Agents 与 Kun Agent 接入框架`。

本阶段只解决一个问题：让 Kun 以“可选本地 Agent”的身份进入 nomiFun 的 Agent Catalog 和本地 Agents 页面。它不复制 Kun Runtime，不实现 Kun 对话事件映射，也不把旧 Kun UI 嵌入 HangCore Agent。

## 目标

- 在本地 Agents 支持列表中增加 `Kun Agent`。
- 让未安装状态下用户能看到 Kun Agent 是一个支持但尚未安装的实验性 Agent。
- 在后端内置 Agent seed 中预留 Kun 的 ACP Agent 行。
- 当未来 `kun-acp-adapter` 出现在 `PATH` 中时，nomiFun 能按已有 AgentRegistry 机制检测为可用。
- 新建会话后续可以通过标准 ACP Agent 链路选择 Kun，而不是走特殊运行时代码。

## 非目标

- 不实现 `kun-acp-adapter`。
- 不调用 Kun HTTP endpoint。
- 不消费 Kun SSE。
- 不映射 reasoning、tool、approval、user input、interrupt 等事件。
- 不做 MCU 编译/烧录闭环。
- 不做一键安装 Kun；adapter 尚未发布前，不能提供虚假的安装命令。

## 架构决策

### 1. Kun 作为 ACP Agent，而不是 nomiFun 内部运行时

Kun 在 HangCore Agent 中的边界是：

```text
nomiFun conversation
-> ACP agent factory
-> kun-acp-adapter --stdio
-> Kun HTTP / SSE / approval workflow
```

本阶段只完成前两段的注册数据。`kun-acp-adapter` 的进程和协议适配在 M3 实施。

### 2. 复用现有 Agent Catalog

nomiFun 已有：

- `agent_metadata` 表。
- `AgentRegistry` 可按命令探测可用性。
- `SUPPORTED_AGENTS` 可展示“支持但未安装”的 Agent。
- `LocalAgents` 页面会把后端未检测到的支持项展示为 not-installed cards。

Kun 应进入这条既有链路，不新增单独的 Kun 设置页。

### 3. 保守安装策略

`kun-acp-adapter` 尚未实现和发布，因此：

- `SUPPORTED_AGENTS.installHint` 保持空字符串。
- 不提供一键安装。
- `website` 指向 HangCore Agent 项目 Release 或文档入口，作为后续 adapter 获取位置。
- 未安装卡片只提供手动查看入口。

### 4. 后端 seed 预留

在 `agent_metadata` 内置行中增加：

```text
id: agent_builtin_kun
name: Kun Agent
backend: kun
agent_type: acp
agent_source: builtin
agent_source_info: {"binary_name":"kun-acp-adapter"}
command: kun-acp-adapter
args: ["--stdio"]
native_skills_dirs: [".kun/skills"]
behavior_policy: {"supports_side_question":false,"supports_team":true}
```

这样未来只要 `kun-acp-adapter` 安装到 `PATH`，`AgentRegistry` 的现有探测逻辑就会把它标记为 available，`/api/agents` 也会自然返回该 Agent。

## 文件变更

- `docs/hangshun/implementation/kun-agent-registration-plan.md`
  - 本设计文档。
- `ui/src/renderer/pages/settings/AgentSettings/supportedAgents.ts`
  - 增加 Kun Agent 支持项。
- `ui/src/renderer/pages/settings/AgentSettings/supportedAgents.test.ts`
  - 覆盖 Kun Agent 不进入一键安装列表，并包含正确的 backend / binary / website。
- `crates/backend/nomifun-db/migrations/001_baseline.sql`
  - 为全新数据库预留 `agent_builtin_kun` 内置 ACP Agent。
- `crates/backend/nomifun-db/migrations/027_seed_kun_agent.sql`
  - 为已经跑过 v0.1.0 baseline 的现有数据库补 seed。

## 验收标准

- `SUPPORTED_AGENTS` 中包含 `backend = "kun"`。
- Kun Agent 的检测 binary 是 `kun-acp-adapter`。
- Kun Agent 没有一键安装命令。
- Kun Agent 在未安装时能出现在本地 Agents 的 not-installed 区域。
- 数据库 baseline 中存在 `agent_builtin_kun`。
- 增量 migration 中存在 `agent_builtin_kun`。
- 后端 seed 使用 `command = "kun-acp-adapter"` 与 `args = ["--stdio"]`。
- `bun test ui/src/renderer/pages/settings/AgentSettings/supportedAgents.test.ts` 通过。
- `bun run typecheck` 通过。

## 后续 M3

M2 完成后进入 `kun-acp-adapter MVP`：

```text
adapter stdio ACP server
-> fake Kun server 测试
-> prompt -> Kun turn
-> Kun SSE text -> ACP stream text
-> cancel / approval / reasoning 逐步补齐
```
