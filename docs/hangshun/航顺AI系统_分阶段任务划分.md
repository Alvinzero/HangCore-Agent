# 航顺 AI 系统分阶段任务划分

## 1. 总体目标

本任务划分基于新的架构决策：项目从旧底座方案迁移为 `nomiFun + Kun Agent + Spec Kit`。

新的执行目标是：

- 以 `nomifun-tauri-main` 作为航顺 AI 系统主底座。
- 复用 nomiFun 已有桌面壳、Rust 后端、React 前端、Agent Catalog、ACP Agent、MCP、知识库、需求管理、定时任务、审计能力。
- 将 Kun 封装为可选本地 ACP Agent，而不是把 Kun Runtime 复制进 nomiFun core。
- 通过 `kun-acp-adapter` 把 nomiFun ACP session 转换为 Kun thread / turn / SSE event / approval。
- 把 Spec Kit 风格产物内嵌到 Coding 流程中。
- 接入航顺 8 位 MCU 工具链，实现自然语言到汇编生成、编译修复、人工烧录确认和审计闭环。
- 预留 32 位 C / Keil 链路、Dify / MaxKB 连接器和更多工具链 Profile。

每个阶段都必须包含：阶段目标、具体任务、产出物、验收标准。

## 2. 当前源码职责边界

### 2.1 nomiFun

nomiFun 是新的主应用底座，负责：

- 桌面应用启动和本地后端。
- 会话、消息、模型、设置、知识库、定时任务。
- Agent Catalog：`agent_metadata`。
- ACP 会话：`acp_session`。
- 内置和自定义 ACP Agent。
- MCP 注入：requirement、knowledge、open、computer、browser、gateway、用户配置 MCP。
- Custom Agent 检测、保存、启用、禁用。
- 本地知识库和知识检索 MCP。
- 需求管理、AutoWork、审计和工作区能力。

关键源码：

- `nomifun-tauri-main/crates/backend/nomifun-db/src/models/agent_metadata.rs`
- `nomifun-tauri-main/crates/backend/nomifun-db/migrations/001_baseline.sql`
- `nomifun-tauri-main/crates/backend/nomifun-ai-agent/src/factory/acp.rs`
- `nomifun-tauri-main/crates/backend/nomifun-ai-agent/src/factory/acp_assembler.rs`
- `nomifun-tauri-main/crates/backend/nomifun-ai-agent/src/services/custom.rs`

### 2.2 Kun Agent

Kun 是可选 Coding Agent，负责：

- Kun 风格 Coding Agent Loop。
- 流式文本和 reasoning。
- 工具调用状态。
- 审批体验。
- 用户补充输入。
- 任务中断、恢复和运行状态。

Kun 的接入边界：

- 不直接复制 Kun Runtime 代码进 nomiFun core。
- 不把 Kun UI 作为主工作台嵌入。
- 新建 `kun-acp-adapter`，把 Kun 封装成 ACP Agent。
- nomiFun 通过 Agent Catalog 启动 Kun Agent。
- nomiFun 统一管理工作区、知识库、MCP、权限、审计和 UI 展示。

关键源码：

- `Kun/src/shared/kun-endpoints.ts`
- `Kun/src/main/runtime-sse-ipc.ts`
- `Kun/src/renderer/src/agent/runtime-client.ts`
- `Kun/src/renderer/src/agent/types.ts`
- `Kun/src/renderer/src/agent/kun-contract.ts`
- `Kun/src/renderer/src/agent/kun-mapper.ts`

### 2.3 Spec Kit

Spec Kit 负责提供规范驱动方法：

- Constitution。
- Requirements。
- Spec。
- Plan。
- Tasks。
- Checklist。
- Traceability。

在航顺系统中，Spec Kit 不单独作为产品入口，而是内嵌到 Coding 任务流程里。

### 2.4 航顺 MCU 工具链

航顺工具链负责提供真实执行能力：

- 8 位 MCU 汇编编译。
- 8 位 MCU 烧录。
- 8 位编译 + 烧录组合流程。
- 指令集、寄存器、芯片配置、规则校验。
- 32 位 C / Keil 编译链路。
- 编译日志解析。

关键输入：

- `hk64s8x-compiler-cli-source-pack`
- `Standards _rules`
- `instruction_set.json`
- `register_set.json`
- `REG825.INC`

## 3. 阶段 0：源码评估与架构冻结

### 3.1 阶段目标

确认 nomiFun、Kun、Spec Kit、航顺工具链的真实边界，冻结新的系统架构，避免后续继续沿用旧底座假设。

### 3.2 具体任务

- 梳理 nomiFun 桌面启动、后端服务、前端入口和打包流程。
- 梳理 nomiFun Agent Catalog、ACP session、Custom Agent、MCP 注入能力。
- 梳理 nomiFun 知识库、需求管理、定时任务、审计能力。
- 梳理 Kun Runtime 的 HTTP endpoint、SSE、thread、turn、approval、user input、interrupt 能力。
- 梳理 Kun 事件类型和 mapper。
- 梳理 Spec Kit 的核心产物格式。
- 梳理航顺 8 位 MCU 工具链命令、输入、输出、错误日志。
- 确定 Kun Agent 采用方案一：`kun-acp-adapter`。
- 确定 Dify / MaxKB 仅作为后续可选连接器。

### 3.3 产出物

- 新版 `PRD.md`。
- 新版 `航顺AI系统_分阶段任务划分.md`。
- 技术复用清单。
- Kun ACP Adapter 协议映射草案。
- 工具链命令清单。

### 3.4 验收标准

- 文档中不再把旧底座描述为主应用底座。
- 文档明确 nomiFun 是主底座。
- 文档明确 Kun 是可选 ACP Agent。
- 文档明确 Spec Kit 是 Coding 规范驱动层。
- 文档明确知识库本地优先，Dify / MaxKB 可选。
- 文档明确首批可落地任务。

## 4. 阶段 1：nomiFun 底座启动与航顺产品化

### 4.1 阶段目标

让航顺 AI 系统以 nomiFun 为基础跑起来，并形成航顺自己的产品结构、导航和基础配置。

### 4.2 具体任务

- 启动 `nomifun-tauri-main` 开发环境。
- 确认桌面端、Web UI、后端服务端口和数据目录。
- 梳理前端主导航、设置页、知识库页、Agent 管理页。
- 建立航顺 AI 产品命名、图标、标题、关于页。
- 调整主导航，形成：
  - 工作台
  - 办公智能体
  - Coding
  - 知识库
  - 本地 Agents
  - 自动任务
  - 审计
  - 设置
- 保留 nomiFun 已有核心功能，不做无关大重构。
- 确认 Windows 优先打包路径。

### 4.3 产出物

- 可启动的航顺 AI 桌面应用。
- 航顺产品化导航。
- 基础设置页。
- 关于页和版本信息。
- 底座启动说明。

### 4.4 验收标准

- 本地能启动桌面应用。
- 后端 API 正常。
- 主导航出现航顺 AI 产品结构。
- Agent 管理、知识库、设置入口可访问。
- 没有旧底座主产品名称残留在核心 UI。

## 5. 阶段 2：本地 Agents 与 Kun Agent 接入框架

### 5.1 阶段目标

复用 nomiFun 的 Agent Catalog 和 Custom ACP Agent 能力，新增 Kun Agent 安装/启用路径。

### 5.2 具体任务

- 阅读并验证 `agent_metadata` 表结构。
- 阅读并验证 `acp_session` 会话结构。
- 确认内置 Agent seed 方式。
- 确认 Custom Agent create / update / try-connect 流程。
- 在本地 Agents 页面中保留现有 Agent：
  - Claude Code
  - Codex CLI
  - Gemini CLI
  - Qwen
  - OpenCode
  - Cursor
  - 其他已有 ACP Agent
- 设计 Kun Agent 卡片：
  - 未安装
  - 已安装
  - 已启用
  - 不可用
  - 实验性提示
- 设计 Kun Agent 的 catalog row：
  - `backend = kun`
  - `agent_type = acp`
  - `command = kun-acp-adapter`
  - `args = ["--stdio"]`
  - `agent_source = builtin` 或安装后 `custom`
- 实现或预留 Kun Agent 检测逻辑。
- 实现管理员启用 / 禁用 Kun Agent。

### 5.3 产出物

- 本地 Agents 页面方案。
- Kun Agent catalog 配置。
- Kun Agent 可用性检测方案。
- Kun Agent 安装/启用交互方案。

### 5.4 验收标准

- 用户能在本地 Agents 中看到 Kun Agent。
- 系统能检测 `kun-acp-adapter` 是否存在。
- 管理员能启用 / 禁用 Kun Agent。
- 启用后新建会话可选择 Kun Agent。
- 禁用后普通用户不能选择 Kun Agent。

## 6. 阶段 3：kun-acp-adapter MVP

### 6.1 阶段目标

实现最小可用的 Kun ACP Adapter，使 Kun 可以作为 nomiFun ACP Agent 启动并完成一次流式对话。

### 6.2 具体任务

- 新建 `kun-acp-adapter` 包或 CLI。
- 确定实现语言和分发方式：
  - 优先 TypeScript / Bun，贴合 Kun 和 nomiFun 现有 Agent 启动方式。
  - 输出独立 CLI，避免和 nomiFun core 编译强绑定。
- 实现 ACP initialize / handshake。
- 声明能力：
  - streaming
  - approval
  - interrupt
  - workspace
  - MCP transport 支持情况
  - session resume 支持情况
- 实现 session/new：
  - 接收 workspace。
  - 创建或恢复 Kun thread。
  - 保存 ACP session 与 Kun thread 的映射。
- 实现 prompt：
  - 接收用户消息。
  - 注入 Spec / knowledge / requirement context。
  - 调用 Kun turn API。
- 实现 streaming：
  - 订阅 Kun `/v1/threads/{id}/events`。
  - 处理 since_seq / Last-Event-ID。
  - 转换为 ACP stream events。
- 实现 approval：
  - 接收 nomiFun 审批结果。
  - 调用 Kun `/v1/approvals/{id}`。
- 实现 interrupt：
  - 调用 Kun turn interrupt endpoint。
- 实现错误处理：
  - Kun Runtime 离线。
  - SSE 超时。
  - thread 不存在。
  - approval 已过期。
  - adapter 崩溃。
- 编写 fake Kun server 测试。

### 6.3 产出物

- `kun-acp-adapter` CLI。
- ACP handshake 实现。
- session/new 实现。
- prompt/turn 实现。
- SSE event mapper。
- approval mapper。
- interrupt 实现。
- 单元测试和最小集成测试。

### 6.4 验收标准

- nomiFun 可以启动 `kun-acp-adapter`。
- ACP initialize 成功。
- 新建 Kun Agent 会话成功。
- 用户发送一句话后能看到流式文本。
- reasoning 能映射显示。
- 工具调用事件能显示为 tool block。
- approval 请求能显示并提交。
- interrupt 可以停止当前 turn。
- Kun Runtime 不可用时给出明确错误。

## 7. 阶段 4：Spec 与 CodingTask 框架

### 7.1 阶段目标

建立 Coding 任务和 Spec 产物框架，让任意本地 Agent 都在同一规范流程下执行。

### 7.2 具体任务

- 设计 CodingTask 数据模型：
  - id
  - title
  - workspace
  - pipeline_type
  - selected_agent_id
  - status
  - owner
  - created_at
  - updated_at
- 设计 SpecArtifact 数据模型：
  - requirement
  - spec
  - plan
  - tasks
  - checklist
  - acceptance
  - trace links
- 设计 Coding 状态机：
  - created
  - clarifying
  - spec_ready
  - planning
  - tasks_ready
  - generating
  - compiling
  - fixing
  - compile_passed
  - awaiting_flash_approval
  - flashing
  - completed
  - failed
  - cancelled
- 实现 Coding 页面：
  - 输入区
  - Agent 选择
  - Spec 区
  - Plan 区
  - Tasks 区
  - Diff 区
  - 编译日志区
  - 审批区
  - 审计时间线
- 设计 Spec prompt 模板。
- 将 SpecArtifact 与 conversation / messages / artifacts 关联。
- 让 Kun Agent、Codex CLI、Claude Code 等 Agent 共享同一 CodingTask 上下文。

### 7.3 产出物

- CodingTask schema / service。
- SpecArtifact schema / service。
- Coding 页面 MVP。
- Spec prompt 模板。
- 状态机定义。

### 7.4 验收标准

- 用户能创建 Coding 任务。
- 用户能选择 Kun Agent 或其他 ACP Agent。
- 系统能生成并保存 Spec、Plan、Tasks。
- 页面能展示 Spec / Plan / Tasks。
- 会话消息能关联 CodingTask。
- 后续代码变更能追溯到 SpecArtifact。

## 8. 阶段 5：航顺 8 位 MCU 工具链 Adapter

### 8.1 阶段目标

把公司 8 位 MCU 编译、烧录和规则校验能力封装为受控工具，供 Agent 调用。

### 8.2 具体任务

- 梳理 `hk64s8x-compiler-cli-source-pack`：
  - `asmc_compile.py`
  - `flash_run.py`
  - `workflow_run.py`
  - `company_core`
  - `rules`
  - examples
- 梳理 `Standards _rules`：
  - `instruction_set.json`
  - `register_set.json`
  - `REG825.INC`
- 设计 ToolchainProfile：
  - profile id
  - MCU type
  - compiler path
  - rules path
  - template path
  - output path
  - allowed commands
- 设计 ToolchainRun：
  - run id
  - task id
  - command type
  - arguments
  - stdout
  - stderr
  - json result
  - duration
  - status
- 实现 8 位编译 Adapter：
  - 输入 asm 文件或项目目录。
  - 调用编译 CLI。
  - 返回结构化成功/失败。
- 实现日志解析：
  - error code
  - line
  - file
  - message
  - suggestion context
- 实现规则加载：
  - 指令集。
  - 寄存器。
  - 芯片配置。
  - 禁止伪造未确认寄存器或伪指令。
- 将 Adapter 暴露给 Agent：
  - 后端 API 或 MCP tool。
  - 参数白名单。
  - 审计记录。

### 8.3 产出物

- ToolchainProfile schema。
- ToolchainRun schema。
- 8 位编译 Adapter。
- 日志解析器。
- 规则加载器。
- 工具调用审计。

### 8.4 验收标准

- 系统能识别 8 位工具链路径。
- 能对示例工程执行编译。
- 编译成功时返回产物路径。
- 编译失败时返回结构化错误。
- Agent 无法绕过 Adapter 执行任意 shell。
- 每次工具链调用都有审计记录。

## 9. 阶段 6：8 位 MCU Coding 主闭环

### 9.1 阶段目标

完成自然语言到 8 位 MCU 汇编工程的最小研发闭环。

### 9.2 具体任务

- 创建 8 位 MCU Coding 任务入口。
- 绑定公司 8 位 Spec、指令、寄存器、模板工程。
- 选择 Agent：
  - 优先验证 Kun Agent。
  - 同时保留 Codex CLI 等 Agent 可选。
- AI 澄清需求。
- 生成 Spec。
- 生成 Plan。
- 生成 Tasks。
- Agent 生成或修改汇编文件。
- 展示 Diff。
- 执行编译 Adapter。
- 编译失败时：
  - 结构化日志注入 Agent 上下文。
  - Agent 修复文件。
  - 再次编译。
- 编译通过后：
  - 展示 hex / bin / map 等产物。
  - 进入烧录审批。
- 人工确认后执行烧录。
- 记录烧录结果。
- 用户填写硬件验收结果。

### 9.3 产出物

- 8 位 Coding 页面完整闭环。
- 自动编译修复流程。
- Diff 展示。
- 烧录审批。
- 验收记录。
- 审计时间线。

### 9.4 验收标准

- 用户能创建 8 位 MCU 任务。
- AI 能生成 Spec / Plan / Tasks。
- Agent 能生成或修改汇编文件。
- 编译失败时至少完成 1 轮自动修复。
- 编译通过后能展示产物。
- 烧录必须人工确认。
- 最终结果可追溯到需求和 Spec。

## 10. 阶段 7：办公智能体与本地知识库 MVP

### 10.1 阶段目标

完成办公侧最小闭环：部门管理员发布一个办公智能体，员工基于本地知识库完成一次问答或文档任务。

### 10.2 具体任务

- 复用 nomiFun 知识库页面。
- 支持创建本地知识库。
- 支持引用本地文件夹。
- 支持会话挂载知识库。
- 支持 knowledge MCP 注入。
- 设计办公智能体模板：
  - 名称
  - 部门
  - system prompt
  - 模型
  - 知识库
  - 工具权限
  - 输出格式
- 实现办公智能体列表。
- 实现办公任务会话。
- 展示知识引用。
- 保存办公任务历史。

### 10.3 产出物

- 办公智能体模板管理。
- 办公任务执行页。
- 本地知识库挂载。
- 引用来源展示。
- 办公任务历史。

### 10.4 验收标准

- 管理员能创建一个办公智能体模板。
- 普通员工能使用该模板提问。
- Agent 能检索绑定知识库。
- 输出带引用来源。
- 办公任务进入历史记录。

## 11. 阶段 8：32 位 C / Keil 辅链路

### 11.1 阶段目标

在 8 位主链路稳定后，接入 32 位 C / Keil 工程辅助链路。

### 11.2 具体任务

- 梳理 32 位 MCU 工程模板。
- 梳理 Keil 编译命令。
- 设计 32 位 ToolchainProfile。
- 支持 C 文件生成和修改。
- 支持工程配置变更。
- 解析 Keil 编译日志。
- 编译失败时允许 Agent 修复 C 代码或工程配置。
- 编译通过后展示产物。
- 预留烧录或导出流程。

### 11.3 产出物

- 32 位 ToolchainProfile。
- Keil 编译 Adapter。
- C 工程 Diff。
- Keil 日志解析。

### 11.4 验收标准

- 能选择 32 位 Pipeline。
- 能生成或修改 C 代码。
- 能调用 Keil 编译。
- 编译失败时能解析错误并回灌 Agent。
- 编译通过后有产物和审计记录。

## 12. 阶段 9：治理、安全与审计增强

### 12.1 阶段目标

把系统从“能跑”提升到“可控、可审计、可试点”。

### 12.2 具体任务

- 完善用户角色：
  - 系统管理员
  - 部门管理员
  - 普通员工
  - 编程人员
  - 审批人员
- 完善权限策略：
  - Agent 启用权限
  - 知识库权限
  - 工具链权限
  - 烧录权限
  - 审计查看权限
- 实现高风险动作审批：
  - 烧录
  - 删除文件
  - 跨目录写入
  - 执行外部命令
  - 修改工具链配置
- 完善 AuditEvent：
  - 用户输入
  - Agent 输出
  - 工具调用
  - 文件 Diff
  - 编译日志
  - 审批结果
  - 烧录结果
  - 知识引用
- 增加导出审计记录能力。
- 增加错误诊断页面。

### 12.3 产出物

- 权限矩阵。
- 审批策略。
- 审计时间线。
- 审计导出。
- 错误诊断页。

### 12.4 验收标准

- 不同角色看到不同入口。
- Kun Agent 可由管理员禁用。
- 高风险动作必须审批。
- 每次工具调用都能追溯。
- 每次代码变更都有 Diff。
- 每次烧录都有审批和结果。

## 13. 阶段 10：MVP 打包、演示与试点交付

### 13.1 阶段目标

完成 Windows 优先 MVP 打包，准备给内部编程部门和办公试点用户演示。

### 13.2 具体任务

- 确认 Windows 打包脚本。
- 确认应用版本号。
- 确认安装包名称。
- 确认数据目录和升级策略。
- 编写演示脚本。
- 准备演示数据：
  - 本地知识库。
  - 办公智能体模板。
  - 8 位 MCU 示例任务。
  - 编译失败示例。
  - 编译修复示例。
  - 烧录审批示例。
- 执行完整演示。
- 收集试点反馈。

### 13.3 产出物

- Windows 安装包。
- 演示脚本。
- 示例工作区。
- 示例知识库。
- 试点反馈表。

### 13.4 验收标准

- Windows 安装包可安装。
- 首次启动可进入系统。
- 能创建办公任务。
- 能创建 Coding 任务。
- 能选择 Kun Agent。
- 能完成 8 位 MCU 编译修复演示。
- 能展示审计记录。

## 14. 第一批可落地开发任务

### 任务 1：验证 nomiFun 启动和核心页面

输入：

- `nomifun-tauri-main`

任务：

- 安装依赖。
- 启动后端和前端。
- 打开桌面或 Web UI。
- 确认 Agent 管理、知识库、设置页。
- 记录启动命令、端口、数据目录。

产出：

- `docs/nomifun-bringup.md` 或等价记录。

验收：

- 本地可启动。
- 页面可访问。
- 关键 API 正常。

### 任务 2：建立 Kun ACP Adapter 技术设计

输入：

- Kun endpoint。
- Kun SSE IPC。
- Kun mapper。
- nomiFun ACP factory。

任务：

- 定义 adapter command。
- 定义 session 映射。
- 定义 event 映射。
- 定义 approval 映射。
- 定义错误码。
- 定义 fake server 测试方案。

产出：

- `kun-acp-adapter-design.md`。

验收：

- 能指导直接实现 adapter。
- 不依赖复制 Kun runtime。

### 任务 3：实现 kun-acp-adapter 骨架

输入：

- Agent Client Protocol SDK。
- Kun Runtime HTTP/SSE API。

任务：

- 新建 CLI 包。
- 实现 initialize。
- 实现 session/new。
- 实现 prompt stub。
- 实现 fake server 测试。

产出：

- `kun-acp-adapter` 可执行命令。

验收：

- nomiFun try-connect 能检测通过。

### 任务 4：实现 Kun SSE 到 ACP Stream 映射

输入：

- Kun event。
- ACP stream event。

任务：

- 映射 assistant text。
- 映射 reasoning。
- 映射 tool block。
- 映射 approval。
- 映射 user input。
- 映射 turn complete / failed / aborted。

产出：

- event mapper。
- 单元测试。

验收：

- fake Kun server 推送事件后，nomiFun UI 能显示对应消息块。

### 任务 5：注册 Kun Agent

输入：

- `agent_metadata`。
- Custom Agent service。
- 本地 Agents UI。

任务：

- 增加 Kun Agent 安装项。
- 增加检测逻辑。
- 增加启用/禁用逻辑。
- 新建会话时可选择 Kun Agent。

产出：

- Kun Agent 卡片。
- Kun Agent catalog row。

验收：

- 用户可以启用 Kun Agent 并开始对话。

### 任务 6：实现 CodingTask 和 SpecArtifact

输入：

- Spec Kit 产物。
- nomiFun conversation / artifacts。

任务：

- 设计 schema。
- 实现 service。
- 实现 API。
- 实现前端展示。
- 绑定 Agent 会话。

产出：

- CodingTask。
- SpecArtifact。
- Coding 页面。

验收：

- 能生成并保存 Spec / Plan / Tasks。

### 任务 7：验证 8 位工具链

输入：

- `hk64s8x-compiler-cli-source-pack`
- `Standards _rules`

任务：

- 编译示例工程。
- 收集成功输出。
- 制造失败样例。
- 解析错误日志。

产出：

- 工具链验证报告。
- 日志样例。

验收：

- 编译命令可重复运行。
- 成功/失败结果可结构化。

### 任务 8：实现 8 位 Toolchain Adapter

输入：

- 工具链验证报告。

任务：

- 封装编译。
- 封装日志解析。
- 封装产物路径。
- 限制命令参数。
- 记录审计。

产出：

- Toolchain Adapter。
- ToolchainRun。

验收：

- Agent 可通过受控工具触发编译。
- 不能直接执行任意 shell。

### 任务 9：实现 8 位自动修复循环

输入：

- CodingTask。
- SpecArtifact。
- ToolchainRun。
- Agent 会话。

任务：

- 编译失败后提取错误。
- 注入 Agent 上下文。
- 要求 Agent 修改文件。
- 展示 Diff。
- 再次编译。

产出：

- 自动修复闭环。

验收：

- 至少完成 1 轮失败 -> 修复 -> 再编译。

### 任务 10：实现烧录审批

输入：

- 编译产物。
- flash tool。
- 用户权限。

任务：

- 展示烧录参数。
- 要求人工确认。
- 执行烧录。
- 记录结果。

产出：

- 烧录确认 UI。
- ApprovalRecord。
- Flash ToolchainRun。

验收：

- 未审批不能烧录。
- 审批后烧录结果可追溯。

## 15. MVP 演示闭环

演示路径：

1. 启动航顺 AI 桌面应用。
2. 进入本地 Agents。
3. 检测并启用 Kun Agent。
4. 进入知识库。
5. 挂载本地航顺规范。
6. 创建办公智能体模板。
7. 用办公智能体完成一次知识问答。
8. 进入 Coding。
9. 创建 8 位 MCU 任务。
10. 选择 Kun Agent。
11. 输入自然语言需求。
12. AI 澄清需求。
13. 生成 Spec / Plan / Tasks。
14. 生成或修改汇编代码。
15. 展示 Diff。
16. 执行编译。
17. 编译失败时自动修复。
18. 编译通过后展示产物。
19. 人工确认烧录。
20. 记录烧录结果。
21. 查看完整审计时间线。

## 16. 关键风险与应对

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| kun-acp-adapter 实现复杂 | Kun Agent 接入延期 | 先做最小 handshake + prompt + stream，再补 approval / resume |
| Kun Runtime API 与 ACP 不完全匹配 | 事件或状态丢失 | adapter 内维护映射层和兼容状态机 |
| MCP 注入到 Kun Agent 不完整 | 知识库或工具不可用 | 先保证 requirement、knowledge、toolchain 三类核心能力 |
| 许可证不明确 | 商业化风险 | 不复制 runtime，adapter 隔离，交付前审查 |
| 8 位汇编生成质量不稳定 | 编译失败多 | 强制 Spec、规则、模板、日志修复闭环 |
| nomiFun 改造面过大 | MVP 延期 | 复用已有功能，先做航顺必要路径 |
| 旧架构残留 | 团队执行混乱 | 文档、导航、任务命名统一为 nomiFun+Kun Agent+Spec |

## 17. 建议开发顺序

1. 阶段 0：源码评估与架构冻结。
2. 阶段 1：nomiFun 底座启动与航顺产品化。
3. 阶段 2：本地 Agents 与 Kun Agent 接入框架。
4. 阶段 3：kun-acp-adapter MVP。
5. 阶段 4：Spec 与 CodingTask 框架。
6. 阶段 5：航顺 8 位 MCU 工具链 Adapter。
7. 阶段 6：8 位 MCU Coding 主闭环。
8. 阶段 7：办公智能体与本地知识库 MVP。
9. 阶段 8：32 位 C / Keil 辅链路。
10. 阶段 9：治理、安全与审计增强。
11. 阶段 10：MVP 打包、演示与试点交付。

阶段 2、阶段 3、阶段 4 可以部分并行：

- 阶段 2 负责 nomiFun Agent Catalog 和 UI。
- 阶段 3 负责 Kun ACP Adapter。
- 阶段 4 负责 CodingTask / SpecArtifact。

阶段 5 必须在阶段 6 前完成，因为真实 Coding 闭环依赖工具链 Adapter。

## 18. 结论

新的任务划分把项目核心收敛为三件事：

1. `nomiFun` 做统一底座。
2. `Kun Agent` 通过 `kun-acp-adapter` 作为可选本地 Agent 接入。
3. `Spec Kit + 航顺工具链` 约束 Coding 任务从需求到代码、编译、烧录、审计的完整闭环。

后续开发必须优先保证边界清晰：nomiFun 管平台，Kun Agent 管 Coding Loop，Spec 管规范，Toolchain Adapter 管真实执行。只有这个边界稳定，系统才能既可扩展，又能在企业内部安全落地。
