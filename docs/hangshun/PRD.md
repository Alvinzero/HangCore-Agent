# 航顺 AI 系统 PRD

## 1. 文档信息

- 文档版本：v2.0
- 修订日期：2026-07-02
- 产品方向：`nomiFun + Kun Agent + Spec Kit + 航顺 MCU 工具链`
- 修订原因：项目底座从旧桌面框架迁移为 `nomiFun`，Kun 的角色从“运行时参考”升级为“可选本地 ACP Agent”，并重新定义 Spec、知识库、工具链和治理边界。

## 2. 核心架构决策

航顺 AI 系统不再以旧桌面框架作为产品底座。新的系统以 `nomiFun` 作为主应用底座，复用其 Tauri 桌面壳、Rust 后端、React 前端、Agent Catalog、ACP Agent 会话、MCP 注入、知识库、需求管理、定时任务、桌面/浏览器控制和本地权限体系。

Kun 不直接并入 nomiFun 核心，也不复制 Kun 运行时代码。Kun 通过独立的 `kun-acp-adapter` 封装为一个可选本地 Agent，出现在 nomiFun 的“本地 Agents / 在线安装 Agent”体系中。用户安装并启用 Kun Agent 后，可以像选择 Claude Code、Codex CLI、Gemini CLI 一样选择 Kun Agent 开始对话。

Spec Kit 不作为独立产品入口暴露，而作为 Coding 流程的规范驱动方法内嵌在系统中，约束需求澄清、规格生成、计划拆解、任务执行、验证清单和交付审计。

## 3. 背景与目标

航顺内部同时存在两类明确需求：

1. 办公侧：员工希望用 AI 完成知识问答、文档生成、表格处理、PPT 初稿、定时提醒、跨工具自动化等日常任务，但企业需要统一管理模型、知识库、工具权限、智能体模板和审计记录。
2. 研发侧：编程部门希望通过自然语言描述 MCU 研发需求，由 AI 在公司规范、芯片规则、工程模板和工具链约束下生成可编译、可烧录、可追溯的工程代码。

首发目标不是做泛化 SaaS，也不是做一个普通聊天客户端，而是做一个内部可落地的企业智能体桌面工作台。它必须做到：

- 本地优先，企业可控。
- 办公和研发共用同一桌面底座。
- Coding 任务必须被 Spec、工具链和人工审批约束。
- 本地 Agents 可扩展，Kun Agent 作为可选高级 Coding Agent 接入。
- 公司知识库优先走 nomiFun 本地知识体系，Dify / MaxKB 仅作为可选连接器。

## 4. 产品定位

### 4.1 核心定位

航顺 AI 系统是面向航顺内部的企业智能体桌面工作台，覆盖两个主场景：

- `办公`：部门知识问答、文档产物、表格/PPT 辅助、定时任务、受控办公智能体。
- `研发`：MCU 需求澄清、Spec 生成、代码生成、编译修复、烧录审批、工具链审计。

### 4.2 技术定位

系统由四层组成：

1. `nomiFun 底座层`：负责桌面壳、后端服务、前端工作台、会话、Agent Catalog、MCP、知识库、权限、审计和自动化。
2. `本地 Agent 层`：Claude Code、Codex CLI、Gemini CLI、Qwen、OpenCode、Cursor、Kun Agent 等通过 ACP 或适配器作为可选 Agent 接入。
3. `Spec 约束层`：把自然语言需求转换为 Spec、Plan、Tasks、Checklist、验收记录和审计证据。
4. `航顺工具链层`：封装 8 位 MCU 汇编编译、烧录、32 位 Keil 构建、日志解析、模板工程和规则校验。

### 4.3 首发主闭环

Coding 主闭环：

`自然语言需求 -> AI 澄清 -> Spec / 规则约束 -> 生成或修改工程文件 -> 自动编译 -> 日志解析与自动修复 -> 人工确认烧录 -> 查看硬件效果 -> 留痕审计`

办公主闭环：

`选择办公智能体 -> 输入办公任务或知识问题 -> 调用受控模型 / 知识库 / 工具 -> 生成结果 -> 展示引用与执行记录 -> 留痕审计`

Kun Agent 安装闭环：

`进入本地 Agents -> 安装 Kun Agent -> 检测 kun-acp-adapter -> 启用 Agent -> 选择 Kun Agent 新建对话 -> nomiFun 创建 ACP 会话 -> Kun 执行 Coding Loop -> nomiFun 展示流式事件与审批`

## 5. 范围与非目标

### 5.1 MVP 范围

- 基于 `nomifun-tauri-main` 建立航顺 AI 桌面主应用。
- 形成 `办公 / Coding / 知识库 / 本地 Agents / 设置治理` 的主导航。
- 保留并产品化 nomiFun 的 Agent Catalog、Custom ACP Agent、MCP 注入、知识库、定时任务、需求管理能力。
- 新增或定制 `Kun Agent` 安装项，通过 `kun-acp-adapter` 接入 nomiFun ACP 会话。
- Coding 流程内嵌 Spec Kit 风格产物：Spec、Plan、Tasks、Checklist、验收记录。
- 接入航顺 8 位 MCU 工具链，实现汇编生成、编译、日志修复和人工烧录确认闭环。
- 预留 32 位 MCU / Keil 工具链接入。
- 知识库采用 nomiFun 本地优先策略，支持可选连接 Dify / MaxKB。
- 所有模型调用、工具调用、代码变更、编译日志、审批决策进入审计记录。

### 5.2 非目标

- 不把 Kun Runtime 代码直接复制进 nomiFun core。
- 不把 Kun UI 作为主工作台直接嵌入。
- 不在 MVP 阶段重做一个新的 Agent 协议体系。
- 不自研完整 RAG 平台、向量数据库管理后台和文档切分平台。
- 不在 MVP 阶段实现完全无人值守烧录。
- 不承诺所有第三方 Agent 都具备相同能力；能力以 ACP handshake、实际 CLI 支持和 nomiFun 检测结果为准。

## 6. 用户角色

| 角色 | 描述 | 核心权限 |
| --- | --- | --- |
| 系统管理员 | 维护桌面应用、模型、知识库、Agent、权限、审计 | 全局配置、Agent 安装/禁用、模型密钥、审计查看 |
| 部门管理员 | 维护部门办公智能体、部门知识库、模板和成员 | 部门智能体配置、知识库挂载、成员授权 |
| 普通员工 | 使用办公智能体处理日常任务 | 使用已发布办公智能体、查看本人任务 |
| 编程人员 | MCU 研发人员 | 创建 Coding 任务、生成代码、编译、查看 Diff、申请烧录 |
| 审批人员 | 对高风险动作进行确认 | 审批烧录、危险命令、关键文件修改 |

## 7. 产品原则

- `nomiFun 为底座`：会话、Agent、知识库、MCP、权限和审计统一由 nomiFun 承载。
- `Kun 插件化`：Kun 是可安装、可启用、可卸载的本地 Agent，不是主应用内核。
- `Spec 约束优先`：Coding 输出必须绑定需求、规范、计划、任务和验收证据。
- `本地优先`：知识库、工作区、工具链、工程文件优先在本地和企业内网闭环。
- `人类控制高风险动作`：烧录、危险命令、跨目录写入、删除、批量修改必须审批。
- `工具白名单`：Agent 只能通过受控 MCP / Toolchain Adapter 调用能力。
- `事件可追溯`：流式输出、工具调用、审批、Diff、编译日志必须能回放。

## 8. 当前源码理解与职责边界

### 8.1 nomiFun

`nomifun-tauri-main` 是新的产品底座，负责：

- Tauri 桌面应用与本地后端启动。
- Rust 后端服务、SQLite 数据、HTTP API、WebSocket / streaming 通信。
- React 前端工作台、设置页、知识库、任务和 Agent 管理界面。
- `agent_metadata` Agent Catalog，支持内置 Agent 与自定义 ACP Agent。
- `acp_session` 会话状态、Agent 选择、会话恢复和运行状态。
- 通过 ACP factory 启动 CLI Agent，并向 ACP session 注入 requirement、knowledge、open、computer、browser、gateway 等 MCP 能力。
- Custom Agent 创建、检测、保存、启用、禁用、删除。
- 知识库挂载、本地知识检索 MCP、需求 MCP、桌面/浏览器控制 MCP。
- 定时任务、需求管理、AutoWork、渠道扩展和审计能力。

已核对的关键源码入口：

- `nomifun-tauri-main/crates/backend/nomifun-db/src/models/agent_metadata.rs`
- `nomifun-tauri-main/crates/backend/nomifun-db/migrations/001_baseline.sql`
- `nomifun-tauri-main/crates/backend/nomifun-ai-agent/src/factory/acp.rs`
- `nomifun-tauri-main/crates/backend/nomifun-ai-agent/src/factory/acp_assembler.rs`
- `nomifun-tauri-main/crates/backend/nomifun-ai-agent/src/services/custom.rs`

### 8.2 Kun Agent

Kun 在本项目中的角色是可选本地 Coding Agent。它负责提供 Kun 风格的 Coding Agent Loop、流式事件、工具调用、审批体验和任务执行工作流。

Kun 不直接与 nomiFun UI 混写。Kun 通过 `kun-acp-adapter` 暴露为 ACP 兼容 Agent：

- nomiFun 负责创建 ACP session、传入 workspace、注入 MCP、展示消息和审批 UI。
- `kun-acp-adapter` 负责把 ACP 调用转换为 Kun Runtime 的 thread / turn / event / approval 调用。
- Kun Runtime 负责执行具体 Coding Loop。
- 运行时输出回到 nomiFun，由 nomiFun 统一展示、留痕和审计。

已核对的 Kun 关键入口：

- `Kun/src/shared/kun-endpoints.ts`
- `Kun/src/main/runtime-sse-ipc.ts`
- `Kun/src/renderer/src/agent/runtime-client.ts`
- `Kun/src/renderer/src/agent/types.ts`
- `Kun/src/renderer/src/agent/kun-contract.ts`
- `Kun/src/renderer/src/agent/kun-mapper.ts`

### 8.3 Spec Kit

Spec Kit 在本系统中作为规范驱动方法，不作为独立应用入口。它负责约束 Coding 侧产物：

- Constitution / 企业规则。
- Requirements / 需求澄清。
- Spec / 规格说明。
- Plan / 实施计划。
- Tasks / 可执行任务。
- Checklist / 验收清单。
- Trace / 需求、代码变更、编译日志和审批记录的追溯关系。

### 8.4 航顺 Toolchain Adapter

Toolchain Adapter 负责把公司已有 MCU 工具链封装为受控能力：

- 8 位 MCU 汇编编译。
- 8 位 MCU 烧录。
- 8 位 MCU 编译 + 烧录组合工作流。
- 指令集、寄存器、芯片配置、规则文件校验。
- 32 位 C / Keil 工程构建。
- 编译日志结构化解析。
- AI 修复建议回灌。

Agent 不能把工具链命令直接散落在 Prompt 里，也不能自由执行任意 shell。工具必须通过 MCP 或 Toolchain Adapter 暴露，并接受权限、参数和审计约束。

### 8.5 知识库与外部连接器

知识库策略采用 nomiFun 本地优先：

- 本地目录知识库。
- 托管知识库。
- 运行时按会话挂载知识库。
- 通过 knowledge MCP 向 Agent 暴露检索能力。
- 检索结果带来源、路径、引用和时间戳。

Dify / MaxKB 不作为主知识底座，只作为后续可选连接器：

- 外部知识库检索。
- 外部工作流调用。
- 结果注入 nomiFun 会话上下文。
- API Key、Base URL、权限和审计由 nomiFun 统一管理。

## 9. 产品结构

### 9.1 主导航

建议主导航包括：

- `工作台`：最近会话、快速开始、当前任务。
- `办公智能体`：部门模板、知识问答、文档任务、表格/PPT 任务。
- `Coding`：研发任务、Spec、代码 Diff、编译日志、烧录审批。
- `知识库`：本地知识库、托管知识库、外部连接器。
- `本地 Agents`：内置 Agent、自定义 Agent、Kun Agent 安装与启用。
- `自动任务`：定时任务、Webhook、AutoWork。
- `审计`：工具调用、审批、代码变更、模型调用、知识引用。
- `设置`：模型、MCP、权限、系统配置、更新。

### 9.2 Coding 工作区

Coding 页面至少包含：

- 任务标题、状态、负责人、工作区。
- Agent 选择：Codex CLI、Claude Code、Gemini CLI、Kun Agent 等。
- 自然语言输入区。
- Spec / Plan / Tasks 结构化区。
- 文件 Diff 区。
- 编译日志区。
- 工具调用与审批区。
- 烧录确认区。
- 任务审计时间线。

### 9.3 本地 Agents 页面

本地 Agents 页面至少包含：

- 内置 Agent 列表。
- 自定义 ACP Agent 列表。
- Kun Agent 安装卡片。
- Agent 可用性检测。
- 登录/认证提示。
- 启用 / 禁用 / 编辑 / 删除。
- 能力展示：stream、approval、MCP、image、resume、session list 等。

Kun Agent 卡片应明确标注：

- 类型：本地 ACP Agent。
- 状态：未安装 / 已安装未启用 / 已启用 / 不可用。
- 命令：`kun-acp-adapter` 或打包后的等价命令。
- 能力：流式输出、工具调用、审批、工作区、Spec 上下文。
- 风险提示：实验性 Coding Agent，可由管理员控制是否向普通用户开放。

## 10. Kun ACP Adapter 设计

### 10.1 目标

`kun-acp-adapter` 的目标是让 Kun Agent 成为 nomiFun Agent Catalog 中的普通 ACP Agent。nomiFun 不需要理解 Kun 内部 UI，也不需要复制 Kun runtime。适配器承担协议翻译责任。

### 10.2 运行方式

MVP 推荐以独立 CLI 运行：

- 命令：`kun-acp-adapter`
- 参数：`["--stdio"]` 或与 ACP SDK 对齐的启动参数。
- 工作目录：由 nomiFun ACP factory 设置为当前 workspace。
- 运行时连接：自动发现或启动 Kun Runtime，也可读取配置中的 Kun Runtime base URL。
- 安装方式：本地 Agents 页面安装，或管理员预置。

在 nomiFun Agent Catalog 中可表现为：

- `id`: `agent_builtin_kun` 或安装后生成的 `agent_*`
- `name`: `Kun Agent`
- `backend`: `kun`
- `agent_type`: `acp`
- `agent_source`: `builtin` 或 `custom`
- `command`: `kun-acp-adapter`
- `args`: `["--stdio"]`
- `enabled`: 默认可由管理员决定，MVP 建议默认关闭，安装后启用。

### 10.3 协议映射

| ACP / nomiFun 侧 | kun-acp-adapter 行为 | Kun Runtime 侧 |
| --- | --- | --- |
| initialize / authenticate | 返回 Kun Agent 能力、认证方式、MCP 支持情况 | `/health`、`/v1/runtime/info` |
| session/new | 创建或恢复 Kun thread，绑定 workspace | `/v1/threads`、`/v1/sessions/{id}/resume-thread` |
| prompt / user message | 创建 Kun turn，附带上下文、附件、Spec 摘要 | `/v1/threads/{id}/turns` |
| streaming | 订阅 Kun SSE，转换为 ACP 消息/工具/权限事件 | `/v1/threads/{id}/events` |
| permission / approval | 把 nomiFun 审批结果提交给 Kun | `/v1/approvals/{id}` |
| user input | 把 Kun 的用户补充问题映射到 nomiFun 交互 | `/v1/user-inputs/{id}` |
| cancel / interrupt | 中断当前 Kun turn | `/v1/threads/{id}/turns/{turn}/interrupt` |
| resume | 恢复 Kun thread / session | Kun thread/session API |

### 10.4 事件映射

Kun 事件需要映射为 nomiFun 可展示和可审计的统一事件：

- `assistant_text_delta` -> assistant message delta。
- `assistant_reasoning_delta` -> reasoning delta。
- `tool_call / tool_result / command_execution / file_change` -> tool block。
- `approval_requested` -> nomiFun approval card。
- `user_input_requested` -> nomiFun user input card。
- `turn_completed / turn_failed / turn_aborted` -> turn stop reason。
- `usage` -> token / cost / usage snapshot。
- `runtime_error` -> system error block。

实现时应以 Kun 现有 mapper 和 contract 为参考，但适配器输出以 ACP SDK 约定为准。

### 10.5 MCP 与知识注入

nomiFun ACP factory 会在 session/new 时注入 requirement、knowledge、open、computer、browser、gateway 和用户启用的 MCP server。Kun Agent 接入后必须遵守以下规则：

- 能力由 ACP handshake 声明，nomiFun 根据能力注入支持的 MCP transport。
- Kun Agent 不绕过 nomiFun 直接扫描所有本地工具。
- 知识库上下文由 nomiFun knowledge MCP 或首轮 preset context 提供。
- Spec、Plan、Tasks、航顺规则通过 requirement/spec 上下文注入。
- Toolchain Adapter 作为受控 MCP 或后端 API 暴露，不允许 Kun 自行拼接危险 shell。

## 11. Coding 模块需求

### 11.1 Coding 模块定位

Coding 模块面向航顺 MCU 研发人员，核心目标是让 AI 在公司规则约束下完成代码生成、编译修复和人工确认烧录。

它不是普通问答，而是一个受控工程任务系统：

`需求 -> Spec -> Plan -> Tasks -> 文件变更 -> 编译 -> 修复 -> 烧录审批 -> 验收 -> 审计`

### 11.2 Agent 选择

Coding 任务必须允许用户选择本地 Agent：

- Codex CLI。
- Claude Code。
- Gemini CLI。
- Qwen / OpenCode / Cursor 等 nomiFun 已支持 Agent。
- Kun Agent。

不同 Agent 可以执行同一个 Spec 任务，但必须共享 nomiFun 的工作区、知识库、MCP、权限和审计模型。

### 11.3 8 位 MCU Pipeline

输入：

- 用户自然语言需求。
- 公司 8 位 MCU Spec。
- 指令集 JSON / Excel。
- 寄存器 JSON / Excel。
- 汇编规则。
- 模板工程。

流程：

1. 用户创建 8 位 MCU Coding 任务。
2. AI 澄清需求。
3. 系统生成 Spec、Plan、Tasks。
4. Agent 生成或修改汇编文件。
5. Toolchain Adapter 执行编译。
6. 编译失败时，Agent 读取结构化日志并修复。
7. 编译通过后，系统展示 Diff 和产物。
8. 用户确认后执行烧录。
9. 烧录结果和人工验收进入审计。

### 11.4 32 位 MCU / Keil Pipeline

MVP 后续接入：

- C 工程模板。
- Keil 工程构建。
- 编译日志解析。
- 工程配置修复。
- 人工确认烧录或导出。

32 位链路复用同一 CodingTask、SpecArtifact、ToolchainRun、ApprovalRecord 和 AuditEvent 模型。

## 12. 办公模块需求

### 12.1 办公智能体模板

系统应支持部门管理员发布办公智能体模板：

- 模板名称。
- 所属部门。
- 系统提示词。
- 绑定模型。
- 绑定知识库。
- 可用工具。
- 输出格式要求。
- 可见范围。
- 审计策略。

### 12.2 办公能力

办公侧 MVP 能力：

- 知识问答。
- 文档初稿。
- 表格分析。
- PPT 大纲。
- 定时提醒。
- 办公任务记录。
- 引用来源展示。

办公侧不直接暴露高风险文件写入和系统命令能力。需要工具调用时必须走 MCP 权限和审计。

## 13. 知识库需求

### 13.1 本地知识库

支持：

- 创建托管知识库。
- 引用本地文件夹。
- 上传文档。
- 建立索引。
- 会话挂载知识库。
- 通过 knowledge MCP 检索。
- 展示引用来源。

### 13.2 外部知识连接器

预留：

- Dify connector。
- MaxKB connector。
- 企业内部 HTTP knowledge connector。

外部连接器必须符合：

- API Key 加密存储。
- Base URL 可配置。
- 调用日志可审计。
- 结果必须标明来源。
- 不能绕过 nomiFun 权限直接注入 Agent。

## 14. 数据模型

### 14.1 复用 nomiFun 现有模型

优先复用：

- `users`
- `conversations`
- `messages`
- `agent_metadata`
- `acp_session`
- `providers`
- `knowledge_bases`
- `knowledge_bindings`
- `mcp_servers`
- `requirements`
- `cron_jobs`
- `conversation_artifacts`

### 14.2 航顺新增或扩展模型

建议新增或扩展：

- `WorkspaceProject`：研发项目或办公工作区。
- `CodingTask`：Coding 任务主记录。
- `SpecArtifact`：Spec、Plan、Tasks、Checklist、验收记录。
- `CodeChange`：文件变更、Diff、生成来源。
- `ToolchainProfile`：工具链配置。
- `ToolchainRun`：编译、烧录、仿真等运行记录。
- `ApprovalRecord`：危险动作审批。
- `AuditEvent`：统一审计事件。

### 14.3 追溯关系

每个代码变更必须能追溯到：

- 用户原始需求。
- 对应 SpecArtifact。
- 执行 Agent。
- 模型与知识库上下文。
- 工具调用。
- 编译日志。
- 审批记录。
- 最终验收结果。

## 15. 权限与安全

### 15.1 基础权限

| 能力 | 权限策略 |
| --- | --- |
| 查看知识库 | 按部门、角色、个人授权 |
| 使用办公智能体 | 按模板可见范围授权 |
| 创建 Coding 任务 | 编程人员和管理员 |
| 启用 Kun Agent | 管理员控制，MVP 建议默认关闭 |
| 执行编译 | 编程人员可执行，记录日志 |
| 执行烧录 | 必须人工确认 |
| 修改工具链配置 | 管理员 |
| 查看全局审计 | 管理员 / 审计角色 |

### 15.2 Agent 安全边界

- Agent 不能绕过 nomiFun 调用未登记工具。
- Kun Agent 不能直接获得无限制 shell 权限。
- MCP server 必须由 nomiFun 注入或管理员配置。
- 高风险工具调用必须走 approval。
- 所有 Agent 输出的文件变更必须有 Diff。
- 所有烧录动作必须有人工确认。

### 15.3 许可证边界

Kun 以可选 Agent 适配方式接入，避免把 Kun Runtime 直接复制进 nomiFun core。商业化或对外交付前必须完成：

- Kun 源码许可证审查。
- adapter 自有代码许可证确认。
- 第三方依赖清单确认。
- 二进制分发方式确认。

## 16. MVP 验收标准

### 16.1 底座

- 航顺 AI 桌面应用基于 nomiFun 启动。
- 主导航不再以旧底座结构为中心。
- 本地 Agents、知识库、设置、会话可正常使用。
- 可以选择不同 ACP Agent 创建对话。

### 16.2 Kun Agent

- 本地 Agents 页面出现 Kun Agent。
- 用户可以安装或配置 `kun-acp-adapter`。
- 系统可以检测 Kun Agent 是否可用。
- 用户可以启用 Kun Agent。
- 新建对话时可以选择 Kun Agent。
- Kun Agent 可以完成至少一次流式对话。
- 文本、reasoning、工具调用、审批、错误能在 nomiFun UI 中展示。
- 停止、取消、失败状态可正确回收。

### 16.3 Spec Coding

- 用户能创建 Coding 任务。
- 系统能生成并保存 Spec、Plan、Tasks。
- Agent 输出的代码变更能绑定 SpecArtifact。
- 编译失败时能读取日志并至少自动修复 1 轮。
- 编译通过后能展示产物和 Diff。

### 16.4 8 位 MCU

- 系统能读取公司 8 位指令、寄存器、规则和模板工程。
- Agent 能基于规则生成或修改汇编项目。
- Toolchain Adapter 能执行编译并返回结构化结果。
- 烧录必须人工确认。
- 完整链路有审计记录。

### 16.5 办公

- 管理员能创建一个办公智能体模板。
- 普通员工能使用模板完成一次知识问答或文档类任务。
- 输出能展示知识引用。
- 办公任务进入历史记录。

## 17. 里程碑

### 阶段 0：源码评估与架构冻结

- 确认 nomiFun 底座可改造范围。
- 确认 Kun ACP Adapter 接入方式。
- 确认 Spec Kit 产物格式。
- 确认航顺 8 位工具链输入、命令和输出。

### 阶段 1：nomiFun 底座改造

- 建立航顺 AI 品牌、导航、权限和基础数据。
- 保留 nomiFun Agent、知识库、MCP、定时任务能力。
- 移除旧底座产品假设。

### 阶段 2：Kun ACP Adapter MVP

- 实现 adapter handshake。
- 实现 session/new。
- 实现 prompt -> Kun turn。
- 实现 Kun SSE -> ACP stream。
- 实现 approval / interrupt。
- 在 Agent Catalog 注册 Kun Agent。

### 阶段 3：Spec 与 Coding 任务框架

- 建立 CodingTask。
- 建立 SpecArtifact。
- 建立 Coding 页面结构化区。
- 建立 Agent 选择与工作区绑定。

### 阶段 4：8 位 MCU 主链路

- 接入公司规则。
- 接入编译工具。
- 实现日志解析。
- 实现自动修复闭环。
- 实现烧录审批。

### 阶段 5：办公与知识库 MVP

- 办公智能体模板。
- 本地知识库挂载。
- 知识引用展示。
- 办公任务记录。

### 阶段 6：治理与试点交付

- 审计时间线。
- 权限策略。
- Windows 优先打包。
- 内部演示脚本。
- 编程部门试点。

## 18. 优先级

| 优先级 | 内容 |
| --- | --- |
| P0 | nomiFun 底座确认、Kun ACP Adapter、Agent Catalog 注册、Spec/Coding 框架、8 位编译闭环 |
| P1 | 知识库本地挂载、办公智能体模板、烧录审批、审计时间线、32 位 Keil 初版 |
| P2 | Dify / MaxKB 连接器、更多工具链 Profile、更多审批流、研发任务看板、外部 IM/OA |

## 19. 风险与应对

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| Kun 无法直接 ACP 化 | Kun Agent 无法作为标准本地 Agent 接入 | 先做 adapter，必要时 adapter 内部走 Kun HTTP/SSE |
| Kun 许可证限制 | 商业化或对外交付受限 | 不复制 runtime，adapter 隔离，交付前做许可证审查 |
| MCP 能力映射不完整 | Kun Agent 无法使用知识库或工具 | 先支持 requirement / knowledge / toolchain 核心 MCP，再扩展 |
| 8 位汇编生成不稳定 | 编译失败或硬件行为不可控 | 强制 Spec、规则、模板、编译闭环和人工烧录 |
| nomiFun 改造范围过大 | MVP 延期 | 先复用已有 Agent / knowledge / MCP / settings，减少重写 |
| 旧文档和代码假设残留 | 团队执行混乱 | PRD、任务划分、验收标准统一改为 nomiFun+Kun Agent+Spec |

## 20. 结论

航顺 AI 系统的新核心不是把多个开源项目简单拼在一起，而是让 nomiFun 成为统一桌面与智能体底座，让 Kun 作为可选本地 ACP Agent 提供高质量 Coding Loop，让 Spec Kit 成为研发任务的规范约束，让航顺 MCU 工具链成为受控执行能力。

成功标准是：员工能在同一个桌面工作台完成办公智能体任务，研发人员能选择 Kun Agent 或其他本地 Agent 执行 Spec 约束下的 MCU Coding 任务，所有模型、知识、工具、代码、编译、烧录和审批都能被追溯、复查和治理。
