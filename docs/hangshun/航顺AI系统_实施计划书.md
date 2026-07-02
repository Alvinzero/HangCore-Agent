# 航顺 AI 系统实施计划 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 `nomiFun + Kun Agent + Spec Kit + 航顺 MCU 工具链` 架构，把当前源码包实施为可启动、可接入 Kun Agent、可执行 Spec 约束 Coding 任务的航顺 AI 桌面系统。

**Architecture:** nomiFun 作为主应用底座，统一负责桌面壳、后端、前端、Agent Catalog、ACP session、MCP、知识库、权限与审计。Kun 通过独立 `kun-acp-adapter` 作为可选本地 ACP Agent 接入，不复制 Kun Runtime 到 nomiFun core。Spec Kit 产物内嵌到 Coding 流程，航顺 MCU 工具链通过受控 Adapter 或 MCP 暴露给 Agent。

**Tech Stack:** Tauri 2、Rust 2024、SQLite / sqlx、React 19、TypeScript、Bun、Agent Client Protocol、MCP、Python MCU 工具链、Spec Kit 风格 Markdown 产物。

---

## 1. 执行原则

本计划书是实施总计划，不把十个阶段混成一次提交。每个阶段必须满足：

- 有明确输入、输出和验收标准。
- 先验证现有能力，再改造。
- 每次只改一个清晰边界：底座、Agent、Adapter、Spec、工具链、治理分开推进。
- 所有代码阶段开始前，先写阶段级执行计划。
- 所有实现必须有最小验证命令。
- 高风险动作保留人工审批，尤其是 shell、文件写入、烧录和工具链配置。

## 2. 当前事实基线

### 2.1 已确认文档

- `PRD.md`：新版 PRD，已明确 nomiFun 为主底座。
- `航顺AI系统_分阶段任务划分.md`：新版阶段任务表。
- `docs/superpowers/specs/PRD_副本.md`：已同步为新版 PRD。

### 2.2 已确认 nomiFun 接入点

- `nomifun-tauri-main/package.json`
  - `bun run dev`
  - `bun run dev:web`
  - `bun run typecheck`
  - `bun run check`
  - `bun run test`
- `nomifun-tauri-main/crates/backend/nomifun-db/src/models/agent_metadata.rs`
- `nomifun-tauri-main/crates/backend/nomifun-db/migrations/001_baseline.sql`
- `nomifun-tauri-main/crates/backend/nomifun-ai-agent/src/factory/acp.rs`
- `nomifun-tauri-main/crates/backend/nomifun-ai-agent/src/factory/acp_assembler.rs`
- `nomifun-tauri-main/crates/backend/nomifun-ai-agent/src/services/custom.rs`
- `nomifun-tauri-main/ui/src/renderer/pages/settings/AgentSettings/LocalAgents.tsx`
- `nomifun-tauri-main/ui/src/renderer/pages/settings/AgentSettings/AgentCard.tsx`
- `nomifun-tauri-main/ui/src/renderer/pages/settings/AgentSettings/supportedAgents.ts`
- `nomifun-tauri-main/ui/src/renderer/hooks/agent/useAgents.ts`
- `nomifun-tauri-main/ui/src/renderer/utils/model/agentTypes.ts`

### 2.3 已确认 Kun 接入点

- `Kun/src/shared/kun-endpoints.ts`
- `Kun/src/main/runtime-sse-ipc.ts`
- `Kun/src/renderer/src/agent/runtime-client.ts`
- `Kun/src/renderer/src/agent/types.ts`
- `Kun/src/renderer/src/agent/kun-contract.ts`
- `Kun/src/renderer/src/agent/kun-mapper.ts`

### 2.4 已确认工具链输入

- `hk64s8x-compiler-cli-source-pack`
- `Standards _rules/instruction_set.json`
- `Standards _rules/register_set.json`
- `Standards _rules/REG825.INC`

## 3. 总体里程碑

| 里程碑 | 名称 | 目标 | 完成信号 |
| --- | --- | --- | --- |
| M0 | 架构冻结 | 文档统一为 nomiFun + Kun Agent + Spec Kit | PRD、任务划分、计划书一致 |
| M1 | nomiFun 跑通 | 能本地启动、验证核心页面和 API | `dev:web` 或 `dev` 成功，Agent/知识库/设置可访问 |
| M2 | Kun Agent 注册框架 | Kun Agent 能出现在本地 Agents 中 | 可检测、可启用、可被会话选择 |
| M3 | kun-acp-adapter MVP | Kun 作为 ACP Agent 完成一次流式对话 | 文本、reasoning、tool、approval 可映射 |
| M4 | CodingTask + SpecArtifact | Coding 任务能生成和保存 Spec/Plan/Tasks | 任务状态机和结构化区可用 |
| M5 | 8 位工具链 Adapter | 8 位示例工程可编译并结构化返回日志 | 成功/失败编译结果可审计 |
| M6 | 8 位 Coding 闭环 | 自然语言到汇编、编译、修复、烧录审批 | 完整演示链路可跑 |
| M7 | 办公与知识库 MVP | 办公智能体能挂载知识库完成任务 | 问答/文档任务有引用和记录 |
| M8 | 试点交付 | Windows 优先安装包和演示材料 | 可安装、可演示、可收集反馈 |

## 4. 实施顺序

优先顺序固定如下：

1. `M1 nomiFun 跑通`
2. `M2 Kun Agent 注册框架`
3. `M3 kun-acp-adapter MVP`
4. `M4 CodingTask + SpecArtifact`
5. `M5 8 位工具链 Adapter`
6. `M6 8 位 Coding 闭环`
7. `M7 办公与知识库 MVP`
8. `M8 试点交付`

不建议先做 UI 大改，也不建议先接 MCU 工具链。Kun Agent 能不能作为 nomiFun 的普通 ACP Agent 被启动，是整个新架构最关键的早期验证点。

## 5. 目录与文件规划

### 5.1 文档与验证记录

- Create: `docs/implementation/nomifun-bringup.md`
  - 记录 nomiFun 启动命令、端口、数据目录、核心页面、失败处理。
- Create: `docs/implementation/kun-acp-adapter-design.md`
  - 记录 ACP 到 Kun HTTP/SSE 的协议映射。
- Create: `docs/implementation/toolchain-verification.md`
  - 记录 8 位 MCU 工具链验证命令和日志样例。

### 5.2 nomiFun 后端

- Modify: `nomifun-tauri-main/crates/backend/nomifun-db/migrations/001_baseline.sql`
  - 如采用内置种子方式，增加 `agent_builtin_kun`。
- Modify: `nomifun-tauri-main/crates/backend/nomifun-ai-agent/src/services/custom.rs`
  - 如需要特殊检测标记，扩展 Kun Agent 检测提示；优先复用现有 Custom Agent probe。
- Test: `nomifun-tauri-main/crates/backend/nomifun-app/tests/custom_agent_e2e.rs`
  - 验证自定义 ACP Agent 创建、检测、启用路径不被破坏。

### 5.3 nomiFun 前端

- Modify: `nomifun-tauri-main/ui/src/renderer/pages/settings/AgentSettings/LocalAgents.tsx`
  - 增加 Kun Agent 安装卡片或内置 Agent 显示逻辑。
- Modify: `nomifun-tauri-main/ui/src/renderer/pages/settings/AgentSettings/supportedAgents.ts`
  - 增加 Kun Agent 元数据。
- Modify: `nomifun-tauri-main/ui/src/renderer/services/i18n/locales/zh-CN/settings.json`
  - 增加 Kun Agent 中文文案。
- Modify: `nomifun-tauri-main/ui/src/renderer/services/i18n/locales/en-US/settings.json`
  - 增加 Kun Agent 英文文案。
- Test: `nomifun-tauri-main/ui/src/renderer/pages/settings/AgentSettings/supportedAgents.test.ts`
  - 验证 Kun Agent 元数据完整。

### 5.4 Kun ACP Adapter

推荐新增独立目录：

- Create: `kun-acp-adapter/package.json`
- Create: `kun-acp-adapter/src/index.ts`
- Create: `kun-acp-adapter/src/acpServer.ts`
- Create: `kun-acp-adapter/src/kunClient.ts`
- Create: `kun-acp-adapter/src/eventMapper.ts`
- Create: `kun-acp-adapter/src/sessionStore.ts`
- Create: `kun-acp-adapter/tests/eventMapper.test.ts`
- Create: `kun-acp-adapter/tests/fakeKunServer.ts`

职责划分：

- `index.ts`：CLI 入口，解析参数并启动 ACP stdio server。
- `acpServer.ts`：处理 ACP initialize、session/new、prompt、cancel、approval。
- `kunClient.ts`：封装 Kun HTTP endpoint 和 SSE 订阅。
- `eventMapper.ts`：把 Kun event 转成 ACP stream event。
- `sessionStore.ts`：维护 ACP session 与 Kun thread / turn 的映射。
- `fakeKunServer.ts`：测试用 Kun HTTP/SSE stub。

### 5.5 Coding 与 Spec

阶段 M4 开始前再生成细化计划，预计触达：

- `nomifun-tauri-main/crates/backend/nomifun-db/migrations/*`
- `nomifun-tauri-main/crates/backend/nomifun-app/src/router/routes.rs`
- `nomifun-tauri-main/crates/backend/nomifun-api-types/src/*`
- `nomifun-tauri-main/ui/src/renderer/pages/*`
- `nomifun-tauri-main/ui/src/renderer/services/i18n/locales/*`

### 5.6 工具链 Adapter

阶段 M5 开始前再生成细化计划，预计触达：

- `hk64s8x-compiler-cli-source-pack/cli/asmc/scripts/asmc_compile.py`
- `hk64s8x-compiler-cli-source-pack/cli/flash/scripts/flash_run.py`
- `hk64s8x-compiler-cli-source-pack/cli/workflow/scripts/workflow_run.py`
- `nomifun-tauri-main/crates/backend/*`

## 6. 任务分解

### Task 1: nomiFun 启动与基线验证

**Files:**

- Create: `docs/implementation/nomifun-bringup.md`
- Read: `nomifun-tauri-main/package.json`
- Read: `nomifun-tauri-main/docs/contributing/development.zh.md`

- [ ] **Step 1: 记录当前仓库状态**

Run:

```bash
git status --short
```

Expected:

```text
显示当前未跟踪源码包和已修改文档；不要求工作树干净。
```

- [ ] **Step 2: 检查基础工具**

Run:

```bash
cd nomifun-tauri-main
bun --version
rustc --version
cargo --version
```

Expected:

```text
bun、rustc、cargo 均能输出版本号。
```

- [ ] **Step 3: 安装依赖**

Run:

```bash
cd nomifun-tauri-main
bun install
```

Expected:

```text
依赖安装完成，命令退出码为 0。
```

- [ ] **Step 4: 执行编译级检查**

Run:

```bash
cd nomifun-tauri-main
cargo check --workspace
```

Expected:

```text
Rust workspace check 通过；若失败，记录 crate、错误信息和是否与当前改造无关。
```

- [ ] **Step 5: 执行前端类型检查**

Run:

```bash
cd nomifun-tauri-main
bun run typecheck
```

Expected:

```text
TypeScript 类型检查通过；若失败，记录首个错误文件和错误码。
```

- [ ] **Step 6: 启动 Web 联调模式**

Run:

```bash
cd nomifun-tauri-main
NOMIFUN_DATA_DIR=/tmp/hangshun-nomifun-dev bun run dev:web
```

Expected:

```text
API 与 UI 同时启动，UI 默认在 localhost:5173，API 默认在 8787。
```

- [ ] **Step 7: 验证核心页面**

打开浏览器访问：

```text
http://localhost:5173
```

检查：

- 设置页可进入。
- 本地 Agents 页面可进入。
- 知识库页面可进入。
- 会话页面可进入。
- 若首次启动需要初始化，记录初始化步骤。

- [ ] **Step 8: 写入 bring-up 记录**

Create: `docs/implementation/nomifun-bringup.md`

Content:

````markdown
# nomiFun Bring-up 记录

## 环境

- 日期：2026-07-02
- 工作目录：/Users/mac/Documents/航顺AI智能体_副本/nomifun-tauri-main
- 数据目录：/tmp/hangshun-nomifun-dev

## 验证命令

```bash
bun install
cargo check --workspace
bun run typecheck
NOMIFUN_DATA_DIR=/tmp/hangshun-nomifun-dev bun run dev:web
```

## 页面检查

- 设置页：
- 本地 Agents：
- 知识库：
- 会话：

## 发现的问题

- 无阻塞问题时填写：未发现阻塞问题。

## 下一步

- 进入 Kun Agent 注册框架设计。
````

- [ ] **Step 9: 提交验证记录**

Run:

```bash
git add docs/implementation/nomifun-bringup.md
git commit -m "docs: record nomifun bring-up baseline"
```

Expected:

```text
生成一条只包含 bring-up 记录的提交。
```

### Task 2: Kun ACP Adapter 技术设计

**Files:**

- Create: `docs/implementation/kun-acp-adapter-design.md`
- Read: `Kun/src/shared/kun-endpoints.ts`
- Read: `Kun/src/renderer/src/agent/kun-contract.ts`
- Read: `Kun/src/renderer/src/agent/kun-mapper.ts`
- Read: `nomifun-tauri-main/crates/backend/nomifun-ai-agent/src/factory/acp.rs`
- Read: `nomifun-tauri-main/crates/backend/nomifun-ai-agent/src/factory/acp_assembler.rs`

- [ ] **Step 1: 提取 Kun endpoint 映射**

在设计文档中写入：

```markdown
## Kun Runtime Endpoint

| 能力 | Kun endpoint |
| --- | --- |
| health | GET /health |
| runtime info | GET /v1/runtime/info |
| create/list thread | /v1/threads |
| thread detail | /v1/threads/{id} |
| create turn | /v1/threads/{id}/turns |
| stream events | /v1/threads/{id}/events |
| interrupt turn | /v1/threads/{id}/turns/{turn}/interrupt |
| approval | /v1/approvals/{id} |
| user input | /v1/user-inputs/{id} |
```

- [ ] **Step 2: 定义 ACP 到 Kun 的 session 映射**

写入：

```markdown
## Session 映射

- ACP session id：由 nomiFun / ACP SDK 管理。
- Kun thread id：由 Kun Runtime 创建。
- adapter 本地映射：`{ acpSessionId, kunThreadId, workspace, latestTurnId, latestSeq }`。
- 工作区来源：nomiFun ACP `session/new` 的 workspace。
- 恢复策略：优先使用 adapter 映射；映射不存在时创建新的 Kun thread。
```

- [ ] **Step 3: 定义事件映射表**

写入：

```markdown
## Event 映射

| Kun event | ACP / nomiFun 表现 |
| --- | --- |
| assistant_text_delta | assistant message delta |
| assistant_reasoning_delta | reasoning delta |
| item_created/tool_call | tool block running |
| item_updated/tool_result | tool block success/error |
| approval_requested | approval card |
| user_input_requested | user input card |
| turn_completed | turn complete |
| turn_failed | turn failed |
| turn_aborted | turn aborted |
| runtime_error | system error |
| usage | usage snapshot |
```

- [ ] **Step 4: 定义失败模式**

写入：

```markdown
## 失败模式

- Kun Runtime offline：initialize 或 session/new 返回明确错误。
- SSE start timeout：adapter 返回 stream error，并允许 nomiFun 停止会话。
- approval expired：返回 approval error，不重复提交。
- turn interrupted：映射为 turn_aborted。
- event seq gap：重新以 last seq 订阅，仍失败则提示用户重开会话。
```

- [ ] **Step 5: 保存并提交设计文档**

Run:

```bash
git add docs/implementation/kun-acp-adapter-design.md
git commit -m "docs: design kun acp adapter"
```

Expected:

```text
设计文档提交成功。
```

### Task 3: Kun ACP Adapter MVP 骨架

**Files:**

- Create: `kun-acp-adapter/package.json`
- Create: `kun-acp-adapter/tsconfig.json`
- Create: `kun-acp-adapter/src/index.ts`
- Create: `kun-acp-adapter/src/sessionStore.ts`
- Create: `kun-acp-adapter/src/kunClient.ts`
- Create: `kun-acp-adapter/src/eventMapper.ts`
- Create: `kun-acp-adapter/tests/eventMapper.test.ts`

- [ ] **Step 1: 创建 adapter package**

Create: `kun-acp-adapter/package.json`

```json
{
  "name": "@hangshun/kun-acp-adapter",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": {
    "kun-acp-adapter": "./src/index.ts"
  },
  "scripts": {
    "test": "bun test",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@agentclientprotocol/sdk": "^0.18.2",
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "typescript": "^5.8.3"
  }
}
```

- [ ] **Step 2: 创建 TypeScript 配置**

Create: `kun-acp-adapter/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "types": ["bun-types"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 3: 写 session store 测试**

Create: `kun-acp-adapter/tests/eventMapper.test.ts`

```ts
import { describe, expect, it } from 'bun:test';
import { mapKunEvent } from '../src/eventMapper';

describe('mapKunEvent', () => {
  it('maps assistant text delta', () => {
    const events = mapKunEvent({
      kind: 'assistant_text_delta',
      text: 'hello',
      turnId: 'turn-1',
      seq: 1
    });

    expect(events).toEqual([
      {
        type: 'assistant_delta',
        text: 'hello',
        turnId: 'turn-1',
        seq: 1
      }
    ]);
  });

  it('maps reasoning delta', () => {
    const events = mapKunEvent({
      kind: 'assistant_reasoning_delta',
      text: 'thinking',
      turnId: 'turn-1',
      seq: 2
    });

    expect(events).toEqual([
      {
        type: 'reasoning_delta',
        text: 'thinking',
        turnId: 'turn-1',
        seq: 2
      }
    ]);
  });
});
```

- [ ] **Step 4: 写最小 event mapper**

Create: `kun-acp-adapter/src/eventMapper.ts`

```ts
export type KunRuntimeEvent = {
  kind?: string;
  text?: string;
  turnId?: string;
  seq?: number;
  itemId?: string;
  approvalId?: string;
  summary?: string;
  message?: string;
};

export type AdapterEvent =
  | { type: 'assistant_delta'; text: string; turnId?: string; seq?: number }
  | { type: 'reasoning_delta'; text: string; turnId?: string; seq?: number }
  | { type: 'tool_update'; itemId: string; summary: string; seq?: number }
  | { type: 'approval_request'; approvalId: string; summary: string; seq?: number }
  | { type: 'turn_complete'; turnId?: string; seq?: number }
  | { type: 'turn_error'; message: string; seq?: number };

export function mapKunEvent(event: KunRuntimeEvent): AdapterEvent[] {
  switch (event.kind) {
    case 'assistant_text_delta':
      return [{ type: 'assistant_delta', text: event.text ?? '', turnId: event.turnId, seq: event.seq }];
    case 'assistant_reasoning_delta':
      return [{ type: 'reasoning_delta', text: event.text ?? '', turnId: event.turnId, seq: event.seq }];
    case 'tool_call':
    case 'tool_result':
    case 'item_created':
    case 'item_updated':
      return event.itemId
        ? [{ type: 'tool_update', itemId: event.itemId, summary: event.summary ?? event.kind, seq: event.seq }]
        : [];
    case 'approval_requested':
      return event.approvalId
        ? [{ type: 'approval_request', approvalId: event.approvalId, summary: event.summary ?? 'Approval required', seq: event.seq }]
        : [];
    case 'turn_completed':
      return [{ type: 'turn_complete', turnId: event.turnId, seq: event.seq }];
    case 'turn_failed':
    case 'runtime_error':
      return [{ type: 'turn_error', message: event.message ?? 'Kun runtime error', seq: event.seq }];
    default:
      return [];
  }
}
```

- [ ] **Step 5: 运行 adapter 测试**

Run:

```bash
cd kun-acp-adapter
bun install
bun test
```

Expected:

```text
2 个 mapper 测试通过。
```

- [ ] **Step 6: 创建 CLI 入口**

Create: `kun-acp-adapter/src/index.ts`

```ts
#!/usr/bin/env bun

const args = new Set(process.argv.slice(2));

if (args.has('--version')) {
  console.log('kun-acp-adapter 0.1.0');
  process.exit(0);
}

if (!args.has('--stdio')) {
  console.error('kun-acp-adapter expects --stdio');
  process.exit(2);
}

console.error('kun-acp-adapter stdio server bootstrap is ready');
```

- [ ] **Step 7: 验证 CLI 启动**

Run:

```bash
cd kun-acp-adapter
bun src/index.ts --version
bun src/index.ts --stdio
```

Expected:

```text
第一条命令输出版本号。
第二条命令输出 bootstrap ready 到 stderr 后退出。
```

- [ ] **Step 8: 提交 adapter 骨架**

Run:

```bash
git add kun-acp-adapter
git commit -m "feat: scaffold kun acp adapter"
```

Expected:

```text
adapter 骨架提交成功。
```

### Task 4: Kun Agent 注册与 UI 入口

**Files:**

- Modify: `nomifun-tauri-main/ui/src/renderer/pages/settings/AgentSettings/supportedAgents.ts`
- Modify: `nomifun-tauri-main/ui/src/renderer/pages/settings/AgentSettings/supportedAgents.test.ts`
- Modify: `nomifun-tauri-main/ui/src/renderer/services/i18n/locales/zh-CN/settings.json`
- Modify: `nomifun-tauri-main/ui/src/renderer/services/i18n/locales/en-US/settings.json`
- Optional Modify: `nomifun-tauri-main/crates/backend/nomifun-db/migrations/001_baseline.sql`

- [ ] **Step 1: 阅读 supportedAgents 现有结构**

Run:

```bash
sed -n '1,240p' nomifun-tauri-main/ui/src/renderer/pages/settings/AgentSettings/supportedAgents.ts
sed -n '1,220p' nomifun-tauri-main/ui/src/renderer/pages/settings/AgentSettings/supportedAgents.test.ts
```

Expected:

```text
确认本地 Agent 卡片字段、安装提示字段、测试断言方式。
```

- [ ] **Step 2: 写 Kun Agent 元数据测试**

在 `supportedAgents.test.ts` 增加断言：

```ts
it('includes Kun Agent as an ACP local coding agent', () => {
  const kun = SUPPORTED_AGENTS.find((agent) => agent.id === 'kun');
  expect(kun).toBeTruthy();
  expect(kun?.name).toBe('Kun Agent');
  expect(kun?.command).toBe('kun-acp-adapter');
  expect(kun?.args).toEqual(['--stdio']);
});
```

- [ ] **Step 3: 增加 Kun Agent 元数据**

在 `supportedAgents.ts` 的本地 Agent 列表中增加：

```ts
{
  id: 'kun',
  name: 'Kun Agent',
  command: 'kun-acp-adapter',
  args: ['--stdio'],
  descriptionKey: 'settings.agentManagement.kunDescription',
  installHintKey: 'settings.agentManagement.kunInstallHint'
}
```

如果现有字段名不同，按现有类型命名映射，语义保持一致：`id/name/command/args/description/installHint` 必须存在等价字段。

- [ ] **Step 4: 增加中英文文案**

Modify: `nomifun-tauri-main/ui/src/renderer/services/i18n/locales/zh-CN/settings.json`

```json
{
  "agentManagement": {
    "kunDescription": "Kun 风格 Coding Agent，通过 kun-acp-adapter 作为本地 ACP Agent 接入。",
    "kunInstallHint": "请先安装或构建 kun-acp-adapter，并确保命令位于 PATH 中。"
  }
}
```

Modify: `nomifun-tauri-main/ui/src/renderer/services/i18n/locales/en-US/settings.json`

```json
{
  "agentManagement": {
    "kunDescription": "Kun-style coding agent exposed as a local ACP agent through kun-acp-adapter.",
    "kunInstallHint": "Install or build kun-acp-adapter first and make sure the command is available in PATH."
  }
}
```

合并 JSON 时保留原有 `agentManagement` 其他 key。

- [ ] **Step 5: 运行前端测试和类型检查**

Run:

```bash
cd nomifun-tauri-main
bun run --filter=./ui typecheck
bun test ui/src/renderer/pages/settings/AgentSettings/supportedAgents.test.ts
```

Expected:

```text
类型检查通过，supportedAgents 测试通过。
```

- [ ] **Step 6: 提交 Kun Agent UI 入口**

Run:

```bash
git add nomifun-tauri-main/ui/src/renderer/pages/settings/AgentSettings/supportedAgents.ts \
  nomifun-tauri-main/ui/src/renderer/pages/settings/AgentSettings/supportedAgents.test.ts \
  nomifun-tauri-main/ui/src/renderer/services/i18n/locales/zh-CN/settings.json \
  nomifun-tauri-main/ui/src/renderer/services/i18n/locales/en-US/settings.json
git commit -m "feat: add kun agent entry"
```

Expected:

```text
Kun Agent 入口提交成功。
```

### Task 5: Kun ACP Adapter 真连接

**Files:**

- Modify: `kun-acp-adapter/src/kunClient.ts`
- Modify: `kun-acp-adapter/src/sessionStore.ts`
- Modify: `kun-acp-adapter/src/acpServer.ts`
- Modify: `kun-acp-adapter/src/index.ts`
- Create: `kun-acp-adapter/tests/fakeKunServer.ts`
- Create: `kun-acp-adapter/tests/kunClient.test.ts`

- [ ] **Step 1: 创建 Kun client 类型**

Create: `kun-acp-adapter/src/kunClient.ts`

```ts
export type KunClientOptions = {
  baseUrl: string;
  headers?: Record<string, string>;
};

export type KunThread = {
  id: string;
  title?: string;
  workspace?: string;
};

export class KunClient {
  constructor(private readonly options: KunClientOptions) {}

  async health(): Promise<boolean> {
    const response = await fetch(`${this.options.baseUrl}/health`, {
      headers: this.options.headers
    });
    return response.ok;
  }

  async createThread(input: { workspace: string; title?: string }): Promise<KunThread> {
    const response = await fetch(`${this.options.baseUrl}/v1/threads`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(this.options.headers ?? {}) },
      body: JSON.stringify(input)
    });
    if (!response.ok) {
      throw new Error(`Kun createThread failed: ${response.status}`);
    }
    return (await response.json()) as KunThread;
  }
}
```

- [ ] **Step 2: 创建 session store**

Create: `kun-acp-adapter/src/sessionStore.ts`

```ts
export type SessionRecord = {
  acpSessionId: string;
  kunThreadId: string;
  workspace: string;
  latestTurnId?: string;
  latestSeq: number;
};

export class SessionStore {
  private readonly records = new Map<string, SessionRecord>();

  get(acpSessionId: string): SessionRecord | undefined {
    return this.records.get(acpSessionId);
  }

  set(record: SessionRecord): void {
    this.records.set(record.acpSessionId, record);
  }

  updateSeq(acpSessionId: string, seq: number): void {
    const record = this.records.get(acpSessionId);
    if (!record) return;
    record.latestSeq = Math.max(record.latestSeq, seq);
  }
}
```

- [ ] **Step 3: 创建 fake Kun server 测试**

Create: `kun-acp-adapter/tests/kunClient.test.ts`

```ts
import { afterEach, describe, expect, it } from 'bun:test';
import { KunClient } from '../src/kunClient';

let server: ReturnType<typeof Bun.serve> | undefined;

afterEach(() => {
  server?.stop(true);
  server = undefined;
});

describe('KunClient', () => {
  it('checks health', async () => {
    server = Bun.serve({
      port: 0,
      fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === '/health') return new Response('ok');
        return new Response('not found', { status: 404 });
      }
    });

    const client = new KunClient({ baseUrl: `http://127.0.0.1:${server.port}` });
    await expect(client.health()).resolves.toBe(true);
  });
});
```

- [ ] **Step 4: 运行测试**

Run:

```bash
cd kun-acp-adapter
bun test
```

Expected:

```text
eventMapper 和 KunClient 测试通过。
```

- [ ] **Step 5: 提交 Kun client**

Run:

```bash
git add kun-acp-adapter
git commit -m "feat: connect kun adapter to runtime api"
```

Expected:

```text
Kun client 提交成功。
```

### Task 6: CodingTask 与 SpecArtifact 阶段计划

**Files:**

- Create: `docs/superpowers/plans/2026-07-02-codingtask-specartifact.md`
- Read: `PRD.md`
- Read: `航顺AI系统_分阶段任务划分.md`
- Read: `nomifun-tauri-main/crates/backend/nomifun-db/migrations/001_baseline.sql`
- Read: `nomifun-tauri-main/crates/backend/nomifun-app/src/router/routes.rs`
- Read: `nomifun-tauri-main/ui/src/renderer/components/layout/Router.tsx`

- [ ] **Step 1: 写阶段计划**

Create: `docs/superpowers/plans/2026-07-02-codingtask-specartifact.md`

必须包含：

- 数据模型。
- migration 文件。
- API 类型。
- 后端 service。
- 前端 Coding 页面。
- Spec / Plan / Tasks 展示。
- 与 Agent 会话绑定。
- 验证命令。

- [ ] **Step 2: 阶段计划自检**

Run:

```bash
rg -n "CodingTask|SpecArtifact|Spec|Plan|Tasks|acceptance|trace" docs/superpowers/plans/2026-07-02-codingtask-specartifact.md
```

Expected:

```text
每个核心概念至少出现一次，并有明确文件或任务承接。
```

- [ ] **Step 3: 提交阶段计划**

Run:

```bash
git add docs/superpowers/plans/2026-07-02-codingtask-specartifact.md
git commit -m "docs: plan coding task and spec artifacts"
```

Expected:

```text
CodingTask 阶段计划提交成功。
```

### Task 7: 8 位 MCU 工具链验证计划

**Files:**

- Create: `docs/implementation/toolchain-verification.md`
- Read: `hk64s8x-compiler-cli-source-pack/README.md`
- Read: `hk64s8x-compiler-cli-source-pack/cli/asmc/SKILL.md`
- Read: `hk64s8x-compiler-cli-source-pack/cli/flash/SKILL.md`
- Read: `hk64s8x-compiler-cli-source-pack/cli/workflow/SKILL.md`

- [ ] **Step 1: 记录工具链入口**

Create: `docs/implementation/toolchain-verification.md`

````markdown
# 8 位 MCU 工具链验证记录

## 工具链入口

- 编译：hk64s8x-compiler-cli-source-pack/cli/asmc/scripts/asmc_compile.py
- 烧录：hk64s8x-compiler-cli-source-pack/cli/flash/scripts/flash_run.py
- 工作流：hk64s8x-compiler-cli-source-pack/cli/workflow/scripts/workflow_run.py

## 规则输入

- Standards _rules/instruction_set.json
- Standards _rules/register_set.json
- Standards _rules/REG825.INC
````

- [ ] **Step 2: 验证 Python 依赖**

Run:

```bash
python3 --version
python3 -m pip --version
```

Expected:

```text
Python 和 pip 可用。
```

- [ ] **Step 3: 运行示例编译**

Run:

```bash
python3 hk64s8x-compiler-cli-source-pack/cli/asmc/scripts/asmc_compile.py compile \
  --project hk64s8x-compiler-cli-source-pack/examples/minimal_asm \
  --json
```

Expected:

```text
命令返回 JSON。若参数名与实际 CLI 不一致，记录 CLI 帮助输出并修正工具链验证记录。
```

- [ ] **Step 4: 提交工具链验证记录**

Run:

```bash
git add docs/implementation/toolchain-verification.md
git commit -m "docs: record hk64s8x toolchain verification"
```

Expected:

```text
工具链验证记录提交成功。
```

## 7. 验证门

每个里程碑完成前必须跑对应验证。

### M1 验证门

Run:

```bash
cd nomifun-tauri-main
cargo check --workspace
bun run typecheck
```

Pass:

```text
两条命令退出码均为 0。
```

### M2 验证门

Run:

```bash
cd nomifun-tauri-main
bun test ui/src/renderer/pages/settings/AgentSettings/supportedAgents.test.ts
bun run typecheck
```

Pass:

```text
Kun Agent 元数据测试和前端类型检查通过。
```

### M3 验证门

Run:

```bash
cd kun-acp-adapter
bun test
bun run typecheck
```

Pass:

```text
adapter 单元测试和类型检查通过。
```

### M4 验证门

Run:

```bash
cd nomifun-tauri-main
cargo test -p nomifun-app
bun run typecheck
```

Pass:

```text
CodingTask / SpecArtifact 后端测试和前端类型检查通过。
```

### M5 验证门

Run:

```bash
python3 hk64s8x-compiler-cli-source-pack/cli/asmc/scripts/asmc_compile.py --help
```

Pass:

```text
CLI 帮助可输出；示例工程编译命令有记录。
```

## 8. 提交策略

建议提交粒度：

1. `docs: record nomifun bring-up baseline`
2. `docs: design kun acp adapter`
3. `feat: scaffold kun acp adapter`
4. `feat: add kun agent entry`
5. `feat: connect kun adapter to runtime api`
6. `docs: plan coding task and spec artifacts`
7. `docs: record hk64s8x toolchain verification`

每个提交只覆盖一个边界。不要把文档、adapter、UI、工具链混在一个提交里。

## 9. 风险控制

| 风险 | 控制方式 |
| --- | --- |
| nomiFun 本地启动失败 | 先记录环境和失败日志，不进入 UI 改造 |
| Kun ACP 协议实现过大 | 先做 health、session/new、prompt、stream 四件事 |
| Kun Runtime 不稳定 | fake Kun server 先保障 adapter mapper 正确 |
| UI 入口与 catalog 不一致 | 先做 supportedAgents 测试，再改 UI |
| 工具链参数不确定 | 先跑 `--help` 和示例工程，不把命令写死进 Agent prompt |
| 工作树源码包未跟踪 | 提交前只 stage 本任务相关文件 |

## 10. 当前推荐下一步

立即执行 `Task 1: nomiFun 启动与基线验证`。

完成后再执行：

1. `Task 2: Kun ACP Adapter 技术设计`
2. `Task 3: Kun ACP Adapter MVP 骨架`
3. `Task 4: Kun Agent 注册与 UI 入口`

只要 Kun Agent 能以 ACP Agent 身份被 nomiFun 识别并启动，整个新架构就算完成了最关键的技术打样。

## 11. 自检结果

- PRD 覆盖：本计划覆盖 nomiFun 底座、Kun Agent、Spec、工具链、办公知识库和试点交付。
- 范围控制：本计划不直接实施全部阶段，而是先锁定 M1-M3 为第一批工程目标。
- 文件引用：所有首批任务引用的文件均来自当前工作区真实路径。
- 验证命令：首批任务均包含可运行命令和期望结果。
- 架构边界：Kun 仍作为可选 ACP Agent，不进入 nomiFun core。
