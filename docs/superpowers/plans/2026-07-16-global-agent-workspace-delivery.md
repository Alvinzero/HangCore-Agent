# Global Agent Workspace Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让当前及未来所有会话 Agent 自动使用中文交付代码/资料到真实工作区，并让右侧临时空间可靠显示本轮生成文件。

**Architecture:** 在 `AgentInstance::send_message` 公共边界幂等注入平台交付合同，使 ACP、Nomi、OpenClaw、Nanobot、Remote、自定义 Agent 和未来新增枚举分支自动继承。前端把工作区刷新判断与节流控制提取成纯模块，统一消费 `message.stream`，工具事件实时刷新，任意 Agent 的 `finish`/`error` 做最终刷新。Kun 专属预设补一条中文可见输出合同，避免其英文原生规则压过平台规则。

**Tech Stack:** Rust、Tokio、React 19、TypeScript、Bun Test、Tauri/NomiFun 统一消息流

---

### Task 1: 在所有 Agent 的公共发送边界注入交付合同

**Files:**
- Create: `crates/backend/nomifun-ai-agent/src/capability/delivery_contract.rs`
- Modify: `crates/backend/nomifun-ai-agent/src/capability/mod.rs`
- Modify: `crates/backend/nomifun-ai-agent/src/agent_task.rs`
- Test: `crates/backend/nomifun-ai-agent/src/agent_task.rs`

- [ ] **Step 1: 写入公共路径失败测试**

在 `agent_task.rs` 末尾加入测试模块。测试通过 `AgentInstance::Mock` 捕获真正发送给底层 Agent 的 `SendMessageData`，不依赖任何 Agent 名称：

```rust
#[cfg(test)]
mod global_delivery_contract_tests {
    use super::*;
    use std::sync::Mutex;

    struct CapturingMockAgent {
        workspace: String,
        last_message: Mutex<Option<SendMessageData>>,
        tx: broadcast::Sender<AgentStreamEvent>,
    }

    impl CapturingMockAgent {
        fn new(workspace: &str) -> Self {
            let (tx, _) = broadcast::channel(8);
            Self {
                workspace: workspace.to_owned(),
                last_message: Mutex::new(None),
                tx,
            }
        }

        fn captured(&self) -> SendMessageData {
            self.last_message.lock().unwrap().clone().unwrap()
        }
    }

    #[async_trait::async_trait]
    impl IAgentTask for CapturingMockAgent {
        fn agent_type(&self) -> AgentType {
            AgentType::Nomi
        }

        fn conversation_id(&self) -> &str {
            "contract-test"
        }

        fn workspace(&self) -> &str {
            &self.workspace
        }

        fn status(&self) -> Option<ConversationStatus> {
            Some(ConversationStatus::Finished)
        }

        fn last_activity_at(&self) -> TimestampMs {
            0
        }

        fn subscribe(&self) -> broadcast::Receiver<AgentStreamEvent> {
            self.tx.subscribe()
        }

        async fn send_message(&self, data: SendMessageData) -> Result<(), AgentSendError> {
            *self.last_message.lock().unwrap() = Some(data);
            Ok(())
        }

        async fn cancel(&self) -> Result<(), AppError> {
            Ok(())
        }

        fn kill(&self, _reason: Option<AgentKillReason>) -> Result<(), AppError> {
            Ok(())
        }
    }

    impl IMockAgent for CapturingMockAgent {}

    fn message(content: &str) -> SendMessageData {
        SendMessageData {
            content: content.to_owned(),
            msg_id: "msg-contract".to_owned(),
            files: vec!["input.txt".to_owned()],
            inject_skills: vec![],
            origin: None,
        }
    }

    #[tokio::test]
    async fn agent_instance_send_message_applies_global_delivery_contract() {
        let mock = Arc::new(CapturingMockAgent::new("/tmp/hk workspace"));
        let instance = AgentInstance::Mock(mock.clone());

        instance.send_message(message("生成 LED 汇编代码")).await.unwrap();

        let sent = mock.captured();
        assert!(sent.content.contains("[HK AI Platform 全局交付合同]"));
        assert!(sent.content.contains("/tmp/hk workspace"));
        assert!(sent.content.contains("真实文件"));
        assert!(sent.content.contains("简体中文"));
        assert!(sent.content.contains("汇编指令"));
        assert!(sent.content.ends_with("生成 LED 汇编代码"));
        assert_eq!(sent.msg_id, "msg-contract");
        assert_eq!(sent.files, vec!["input.txt"]);
    }

    #[tokio::test]
    async fn agent_instance_send_message_does_not_duplicate_global_delivery_contract() {
        let mock = Arc::new(CapturingMockAgent::new("/tmp/hk"));
        let instance = AgentInstance::Mock(mock.clone());
        let content = "[HK AI Platform 全局交付合同]\n已注入\n[/HK AI Platform 全局交付合同]\n\n继续";

        instance.send_message(message(content)).await.unwrap();

        assert_eq!(
            mock.captured().content.matches("[HK AI Platform 全局交付合同]").count(),
            1
        );
    }
}
```

- [ ] **Step 2: 运行测试并确认失败原因正确**

Run: `cargo test -p nomifun-ai-agent global_delivery_contract_tests -- --nocapture`

Expected: FAIL；捕获到的消息仍是原始文本，不包含 `[HK AI Platform 全局交付合同]`。

- [ ] **Step 3: 创建幂等合同模块**

创建 `capability/delivery_contract.rs`：

```rust
pub(crate) const GLOBAL_AGENT_DELIVERY_MARKER: &str = "[HK AI Platform 全局交付合同]";

const GLOBAL_AGENT_DELIVERY_END: &str = "[/HK AI Platform 全局交付合同]";

pub(crate) fn inject_global_agent_delivery_contract(content: &str, workspace: &str) -> String {
    if content.contains(GLOBAL_AGENT_DELIVERY_MARKER) {
        return content.to_owned();
    }

    format!(
        "{GLOBAL_AGENT_DELIVERY_MARKER}\n\
你正在 HK AI Platform 的统一会话工作台中运行。\n\
- 当前工作区路径：{workspace}\n\
- 用户要求生成或修改代码、配置、文档、报告或资料时，必须把最终交付物写成当前工作区内的真实文件，不能只返回聊天代码块。\n\
- 优先使用用户指定的路径和文件名；用户未指定时，使用清晰、稳定且与任务相关的名称，并在最终回答中列出真实路径。\n\
- 所有用户可见的自然语言，包括公开展示的思考、进度、工具摘要、最终说明和代码注释，必须使用简体中文。\n\
- 编程语言关键字、汇编指令、寄存器名、API 名、库名、命令、路径和必要标识符必须保持原样，不得为了中文化破坏可执行性或可编译性。\n\
- 文件写入失败时必须如实报告错误和目标路径，不得声称文件已经创建。\n\
{GLOBAL_AGENT_DELIVERY_END}\n\n{content}"
    )
}
```

在 `capability/mod.rs` 注册模块：

```rust
pub(crate) mod delivery_contract;
```

- [ ] **Step 4: 在唯一公共转发方法中应用合同**

在 `agent_task.rs` 导入函数：

```rust
use crate::capability::delivery_contract::inject_global_agent_delivery_contract;
```

替换 `AgentInstance::send_message`：

```rust
/// Send a user or system message through the platform-wide delivery contract.
pub async fn send_message(&self, mut data: SendMessageData) -> Result<(), AgentSendError> {
    data.content = inject_global_agent_delivery_contract(&data.content, self.workspace());
    self.as_task().send_message(data).await
}
```

- [ ] **Step 5: 运行测试并确认通过**

Run: `cargo test -p nomifun-ai-agent global_delivery_contract_tests -- --nocapture`

Expected: PASS；两个测试均通过，且不需要判断 `nomi`、`kun`、`codex` 等名称。

- [ ] **Step 6: 提交公共合同改动**

```bash
git add crates/backend/nomifun-ai-agent/src/capability/delivery_contract.rs crates/backend/nomifun-ai-agent/src/capability/mod.rs crates/backend/nomifun-ai-agent/src/agent_task.rs
git commit -m "feat(agent): 为所有 Agent 注入工作区交付合同"
```

### Task 2: 强化 Kun 用户可见中文输出

**Files:**
- Modify: `crates/backend/nomifun-ai-agent/src/factory/acp_assembler.rs`
- Test: `crates/backend/nomifun-ai-agent/src/factory/acp_assembler.rs`
- Test: `crates/backend/nomifun-ai-agent/tests/prompt_pipeline_integration.rs`

- [ ] **Step 1: 先增加 Kun 中文合同失败断言**

在 `acp_assembler.rs` 的测试模块新增：

```rust
#[test]
fn compose_preset_context_kun_backend_adds_chinese_visibility_contract() {
    let result = compose_preset_context(None, Some("kun")).unwrap();
    assert!(result.contains("[Kun 中文可见输出合同]"), "{result}");
    assert!(result.contains("简体中文"), "{result}");
    assert!(result.contains("代码注释"), "{result}");
    assert!(result.contains("汇编指令"), "{result}");
    assert!(result.contains("不得翻译"), "{result}");
}
```

在 `prompt_pipeline_integration.rs` 的 `brand_new_kun_first_prompt_injects_native_interaction_contract` 中追加：

```rust
assert!(out.contains("[Kun 中文可见输出合同]"), "{out}");
assert!(out.contains("所有用户可见的自然语言"), "{out}");
```

- [ ] **Step 2: 运行测试并确认缺少中文合同**

Run: `cargo test -p nomifun-ai-agent kun_backend_adds_chinese_visibility_contract -- --nocapture`

Expected: FAIL；当前 Kun preset 不包含 `[Kun 中文可见输出合同]`。

- [ ] **Step 3: 把中文合同放在 Kun 专属 preset 最前面**

在 `KUN_OUTPUT_FORMAT_CONTRACT` 之前新增：

```rust
const KUN_CHINESE_VISIBILITY_CONTRACT: &str = r#"[Kun 中文可见输出合同]
- 所有用户可见的自然语言必须使用简体中文，包括公开展示的思考、进度说明、工具摘要、参数解释和最终回答。
- 生成代码时，代码注释和配套说明必须使用简体中文。
- 编程语言关键字、汇编指令、寄存器名、API 名、库名、命令、路径和必要标识符必须保持原样，不得翻译或改写。
- 不得为了显示中文而破坏代码的可编译性、可执行性或 MCU 指令语义。"#;
```

替换 `kun_preset_contract`：

```rust
fn kun_preset_contract() -> String {
    format!(
        "{KUN_CHINESE_VISIBILITY_CONTRACT}\n\n{KUN_OUTPUT_FORMAT_CONTRACT}\n\n{KUN_NATIVE_INTERACTION_CONTRACT}"
    )
}
```

- [ ] **Step 4: 运行 Kun 单元与提示管线测试**

Run: `cargo test -p nomifun-ai-agent kun_backend -- --nocapture`

Expected: PASS；Kun preset 同时保留 Markdown、`user_input` 和中文可见输出合同。

Run: `cargo test -p nomifun-ai-agent --test prompt_pipeline_integration brand_new_kun_first_prompt_injects_native_interaction_contract -- --nocapture`

Expected: PASS；第一条实际 ACP prompt 包含三类 Kun 合同且用户内容仍在末尾。

- [ ] **Step 5: 提交 Kun 中文合同**

```bash
git add crates/backend/nomifun-ai-agent/src/factory/acp_assembler.rs crates/backend/nomifun-ai-agent/tests/prompt_pipeline_integration.rs
git commit -m "fix(kun): 强制用户可见输出使用中文"
```

### Task 3: 统一所有 Agent 的工作区实时与最终刷新

**Files:**
- Create: `ui/src/renderer/pages/conversation/Workspace/workspaceRefresh.ts`
- Create: `ui/src/renderer/pages/conversation/Workspace/workspaceRefresh.test.ts`
- Modify: `ui/src/renderer/pages/conversation/Workspace/index.tsx`

- [ ] **Step 1: 写入刷新决策和控制器测试**

创建 `workspaceRefresh.test.ts`：

```typescript
import { describe, expect, test } from 'bun:test';
import { createWorkspaceRefreshController, getWorkspaceRefreshDecision } from './workspaceRefresh';

describe('getWorkspaceRefreshDecision', () => {
  test('ignores events owned by another conversation', () => {
    expect(getWorkspaceRefreshDecision({ type: 'finish', conversation_id: 9 }, 8)).toBe('none');
  });

  test('refreshes ACP edit and execute events during the turn', () => {
    expect(
      getWorkspaceRefreshDecision(
        { type: 'acp_tool_call', data: { update: { kind: 'edit', status: 'in_progress', title: 'Write' } } },
        8
      )
    ).toBe('throttled');
  });

  test('ignores ACP read and team tools', () => {
    expect(
      getWorkspaceRefreshDecision(
        { type: 'acp_tool_call', data: { update: { kind: 'read', status: 'completed', title: 'Read' } } },
        8
      )
    ).toBe('none');
    expect(
      getWorkspaceRefreshDecision(
        { type: 'acp_tool_call', data: { update: { kind: 'execute', title: 'mcp__nomifun-team-run' } } },
        8
      )
    ).toBe('none');
  });

  test('refreshes completed file tools and tool groups', () => {
    expect(
      getWorkspaceRefreshDecision({ type: 'tool_call', data: { status: 'completed', name: 'Write' } }, 8)
    ).toBe('throttled');
    expect(
      getWorkspaceRefreshDecision(
        {
          type: 'tool_group',
          data: [
            { status: 'completed', name: 'Read' },
            { status: 'completed', name: 'Edit' },
          ],
        },
        8
      )
    ).toBe('throttled');
  });

  test('uses finish and error as agent-agnostic final refresh signals', () => {
    expect(getWorkspaceRefreshDecision({ type: 'finish' }, 8)).toBe('final');
    expect(getWorkspaceRefreshDecision({ type: 'error' }, 8)).toBe('final');
  });
});

describe('createWorkspaceRefreshController', () => {
  test('coalesces repeated requests and runs one trailing refresh', () => {
    let calls = 0;
    let scheduled: (() => void) | undefined;
    const controller = createWorkspaceRefreshController(
      () => calls++,
      2000,
      {
        schedule: (callback) => {
          scheduled = callback;
          return 1 as unknown as ReturnType<typeof setTimeout>;
        },
        cancel: () => undefined,
      }
    );

    controller.request();
    controller.request();
    expect(calls).toBe(1);
    scheduled?.();
    expect(calls).toBe(2);
  });

  test('finalize cancels pending work and refreshes immediately', () => {
    let calls = 0;
    let cancelled = 0;
    const controller = createWorkspaceRefreshController(
      () => calls++,
      2000,
      {
        schedule: () => 1 as unknown as ReturnType<typeof setTimeout>,
        cancel: () => cancelled++,
      }
    );

    controller.request();
    controller.request();
    controller.finalize();

    expect(calls).toBe(2);
    expect(cancelled).toBe(1);
  });
});
```

- [ ] **Step 2: 运行测试并确认模块尚不存在**

Run: `bun test ui/src/renderer/pages/conversation/Workspace/workspaceRefresh.test.ts`

Expected: FAIL；`./workspaceRefresh` 尚不存在。

- [ ] **Step 3: 创建可编译的最小桩并得到行为失败**

创建 `workspaceRefresh.ts` 的最小桩：

```typescript
export type WorkspaceRefreshDecision = 'none' | 'throttled' | 'final';

export function getWorkspaceRefreshDecision(): WorkspaceRefreshDecision {
  return 'none';
}

export function createWorkspaceRefreshController(refresh: () => void) {
  return {
    request: refresh,
    finalize: refresh,
    dispose: () => undefined,
  };
}
```

Run: `bun test ui/src/renderer/pages/conversation/Workspace/workspaceRefresh.test.ts`

Expected: FAIL；`finish`、工具事件和节流断言得到 `none` 或错误调用次数。

- [ ] **Step 4: 实现刷新决策与可测试控制器**

用以下完整实现替换最小桩：

```typescript
export type WorkspaceRefreshDecision = 'none' | 'throttled' | 'final';

export interface WorkspaceStreamMessage {
  type: string;
  data?: unknown;
  conversation_id?: number;
}

interface WorkspaceRefreshTimers {
  schedule: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  cancel: (handle: ReturnType<typeof setTimeout>) => void;
}

const isNonFileSystemTool = (name?: string) => Boolean(name && (/^mcp__nomifun-team-/.test(name) || /^team_/.test(name)));
const isReadOnlyTool = (name?: string) =>
  Boolean(name && /^(read|glob|grep|search|toolsearch|webfetch|websearch|knowledge_search)$/i.test(name));

export function getWorkspaceRefreshDecision(
  message: WorkspaceStreamMessage,
  conversationId: number
): WorkspaceRefreshDecision {
  if (message.conversation_id !== undefined && message.conversation_id !== conversationId) return 'none';
  if (message.type === 'finish' || message.type === 'error') return 'final';

  if (message.type === 'acp_tool_call') {
    const update = (message.data as { update?: { kind?: string; status?: string; title?: string } } | undefined)?.update;
    if (!update || isNonFileSystemTool(update.title) || update.kind === 'read') return 'none';
    if (update.kind === 'edit' || update.kind === 'execute' || update.status === 'completed') return 'throttled';
    return 'none';
  }

  if (message.type === 'tool_call') {
    const tool = message.data as { status?: string; name?: string } | undefined;
    if (tool?.status !== 'completed' || isNonFileSystemTool(tool.name) || isReadOnlyTool(tool.name)) return 'none';
    return 'throttled';
  }

  if (message.type === 'tool_group' && Array.isArray(message.data)) {
    const shouldRefresh = message.data.some((entry: { status?: string; name?: string }) =>
      entry.status === 'completed' && !isNonFileSystemTool(entry.name) && !isReadOnlyTool(entry.name)
    );
    return shouldRefresh ? 'throttled' : 'none';
  }

  return 'none';
}

export function createWorkspaceRefreshController(
  refresh: () => void,
  delayMs = 2000,
  timers: WorkspaceRefreshTimers = {
    schedule: (callback, delay) => setTimeout(callback, delay),
    cancel: (handle) => clearTimeout(handle),
  }
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending = false;
  let disposed = false;

  const clearTimer = () => {
    if (timer !== null) timers.cancel(timer);
    timer = null;
  };

  return {
    request() {
      if (disposed) return;
      if (timer !== null) {
        pending = true;
        return;
      }
      refresh();
      timer = timers.schedule(() => {
        timer = null;
        if (disposed || !pending) return;
        pending = false;
        refresh();
      }, delayMs);
    },
    finalize() {
      if (disposed) return;
      clearTimer();
      pending = false;
      refresh();
    },
    dispose() {
      disposed = true;
      pending = false;
      clearTimer();
    },
  };
}
```

- [ ] **Step 5: 运行纯模块测试并确认通过**

Run: `bun test ui/src/renderer/pages/conversation/Workspace/workspaceRefresh.test.ts`

Expected: PASS；刷新决策和控制器测试全部通过。

- [ ] **Step 6: 把 ChatWorkspace 接到公共刷新模块**

在 `Workspace/index.tsx`：

1. 把 React import 改为：

```typescript
import React, { useCallback, useMemo } from 'react';
```

2. 删除本地 `isNonFileSystemTool`、`throttleTimerRef` 和 `pendingRef`。

3. 增加导入：

```typescript
import { createWorkspaceRefreshController, getWorkspaceRefreshDecision } from './workspaceRefresh';
```

4. 用以下内容替换 `subscribeRefresh`：

```typescript
const subscribeRefresh = useCallback(
  (cb: () => void) => {
    const controller = createWorkspaceRefreshController(cb);

    const handleResponse = (data: { type: string; data?: unknown; conversation_id?: number }) => {
      const decision = getWorkspaceRefreshDecision(data, conversation_id);
      if (decision === 'throttled') controller.request();
      if (decision === 'final') controller.finalize();
    };

    const unsubscribeStream = ipcBridge.acpConversation.responseStream.on(handleResponse);
    const unsubscribeManual = addEventListener(`${eventPrefix}.workspace.refresh`, () => controller.finalize());

    return () => {
      unsubscribeStream();
      unsubscribeManual();
      controller.dispose();
    };
  },
  [conversation_id, eventPrefix]
);
```

- [ ] **Step 7: 运行测试和类型检查**

Run: `bun test ui/src/renderer/pages/conversation/Workspace/workspaceRefresh.test.ts`

Expected: PASS。

Run: `bun run typecheck`

Expected: PASS；`Workspace/index.tsx` 无类型错误和未使用 import。

- [ ] **Step 8: 提交工作区刷新改动**

```bash
git add ui/src/renderer/pages/conversation/Workspace/workspaceRefresh.ts ui/src/renderer/pages/conversation/Workspace/workspaceRefresh.test.ts ui/src/renderer/pages/conversation/Workspace/index.tsx
git commit -m "fix(workspace): 统一刷新所有 Agent 生成文件"
```

### Task 4: 完整回归与本地验收

**Files:**
- Verify: `crates/backend/nomifun-ai-agent/src/capability/delivery_contract.rs`
- Verify: `crates/backend/nomifun-ai-agent/src/factory/acp_assembler.rs`
- Verify: `ui/src/renderer/pages/conversation/Workspace/workspaceRefresh.ts`

- [ ] **Step 1: 格式化 Rust 改动**

Run: `cargo fmt -p nomifun-ai-agent`

Expected: command exits 0。

- [ ] **Step 2: 运行后端完整目标包测试**

Run: `cargo test -p nomifun-ai-agent`

Expected: PASS；全局合同、Kun preset、ACP prompt pipeline 和现有 Agent manager 测试无回归。

- [ ] **Step 3: 运行前端测试与静态检查**

Run: `bun test ui/src/renderer/pages/conversation/Workspace/workspaceRefresh.test.ts`

Expected: PASS。

Run: `bun run typecheck`

Expected: PASS。

Run: `bun run check`

Expected: PASS。

- [ ] **Step 4: 检查补丁卫生**

Run: `git diff --check`

Expected: exits 0，无尾随空格或冲突标记。

Run: `git status --short`

Expected: 本功能相关文件干净；安装包优化、更新弹窗和未跟踪需求资料仍保持原有未提交状态，没有被本功能提交吸收。

- [ ] **Step 5: 启动 Web 版进行真实会话验收**

Run: `bun run dev:web`

Expected: Web UI 在 `http://127.0.0.1:5173/` 可访问，API 在 `http://127.0.0.1:8787/` 可用。

按以下顺序验收：

1. 使用 8位MCU Profile 请求生成 ASM 文件；公开思考、说明和注释使用中文，汇编指令和寄存器原样保留。
2. 确认 ASM 真实文件在本轮进行中或 `finish` 后立即出现在右侧临时空间。
3. 使用 Nomi 和一个自定义 ACP Agent 分别生成 Markdown/代码文件，确认无需 Agent 名称适配也能显示。
4. 普通知识问答不生成无意义文件。
5. 文件写入失败场景只显示真实错误，不在右栏制造虚假节点。

- [ ] **Step 6: 记录最终验证结果**

在最终回复中列出三个功能提交、测试命令结果、Web 地址和仍保留的无关未提交文件；不宣称未实际运行的 Agent/模型组合已经通过。
