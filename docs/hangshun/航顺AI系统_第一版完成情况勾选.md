# 航顺 AI 系统第一版完成情况勾选

> 对照来源：`航顺AI系统_分阶段任务划分.md` 与第一轮执行计划：HK64S8x 8 位工具链接入。
> 当前版本：`v0.0.1`
> 当前发布仓库：`Alvinzero/Hangshun-Nexus`
> 第一版发布重点：Windows 11 x64 桌面安装包 + HK64S8x 8 位工具链最小闭环。

## 状态说明

- `[x]` 已完成：第一版已经实现并验证。
- `[~]` 部分完成：已有底座或入口，但还不是完整业务闭环。
- `[ ]` 未完成：本轮未实施，后续阶段继续推进。

## 第一版总览

- [x] 项目已推送到 GitHub 新仓库：`git@github.com:Alvinzero/Hangshun-Nexus.git`
- [x] 已创建并公开发布 `v0.0.1`
- [x] 已生成 Windows x64 安装包：`AionUi-0.0.1-win-x64.exe`
- [x] 已生成自动更新元数据：`latest.yml`
- [x] 第一版只发布 Windows，macOS / Linux / web-cli 暂不纳入发布校验
- [x] GitHub Release 已从 Draft 发布为正式 Release，并标记为 Latest

## 阶段 0：源码评估与底座确认

- [x] 确认 AionUi 作为桌面应用主底座
- [x] 确认本轮只改 AionUi，不先改 Kun
- [x] 确认 `hk64s8x-compiler-cli-source-pack` 作为 8 位工具链 CLI 来源
- [x] 确认 `Standards _rules` 作为公司规范源，不直接覆盖 `company_core`
- [x] 确认第一轮优先接入 8 位工具链
- [~] Kun Agent Loop 与 AionUi 的正式运行时边界尚未接入
- [~] Spec-Kit 只保留为后续 Coding 流程入口，本轮未形成完整 Spec/Plan/Tasks 闭环

## 阶段 1：基础数据、权限、审计底座

- [x] 新增最小治理数据表
  - [x] `departments`
  - [x] `roles`
  - [x] `user_roles`
  - [x] `approvals`
  - [x] `secrets`
  - [x] `audit_logs`
- [x] 新增工具链数据表
  - [x] `toolchain_profiles`
  - [x] `build_runs`
  - [x] `flash_runs`
- [x] 新增默认工具链 Profile：`hk64s8x-asmc`
- [x] 编译记录可保存 CLI 原始 JSON、diagnostics、artifacts、metrics、status
- [x] 烧录记录可保存 port、bin、verify、approvalConfirmed、log_file、hardware_result_json
- [x] 编译、扫描、设备信息、烧录动作可写入审计日志
- [x] Secret / metadata 脱敏能力已建立
- [~] 角色权限判断函数已建立，但完整用户/部门权限 UI 未完成
- [~] 审批表已建立，但完整审批流 UI 与 RBAC 总线未完成

## 阶段 2：桌面双工作台

- [x] 新增 Coding 工作台页面
- [x] 新增 Coding 模式下的 HK64S8x 工具链入口
- [x] 左侧导航可进入 `HK64S8x` 工具链页面
- [x] Coding 页面已展示 Spec、Plan、Tasks、Diff、编译日志、烧录状态等结构化占位区
- [~] 办公 / Coding 双模式已有底座和入口，但完整办公侧导航与业务闭环未完成
- [~] Coding 项目、构建记录、烧录记录列表页还未完整实现

## 阶段 3：办公智能体 MVP

- [~] 已新增办公 MVP 相关数据库底座
  - [x] `assistant_templates`
  - [x] `assistant_template_versions`
  - [x] `knowledge_bindings`
  - [x] `office_tasks`
- [ ] 办公智能体模板管理页面未完成
- [ ] 部门管理员发布模板流程未完成
- [ ] 普通员工使用模板完成知识问答或文档任务的闭环未完成
- [ ] Dify / MaxKB 知识库问答闭环未完成

## 阶段 4：Coding 8 位 MCU 主链路

- [x] 新增 HK64S8x Toolchain service
- [x] 支持扫描工具链路径与规则路径
- [x] 支持编译调用
  - [x] 固定脚本：`cli/asmc/scripts/asmc_compile.py`
  - [x] 固定动作：`compile`
  - [x] 固定输出：`--json`
  - [x] 支持 `workspace`
  - [x] 支持 `source`
  - [x] 支持 `project`
  - [x] 支持 `.hkproj` 参数入口
- [x] 支持设备信息调用
  - [x] 固定脚本：`cli/flash/scripts/flash_run.py`
  - [x] 固定动作：`device-info`
  - [x] 固定输出：`--json`
  - [x] 支持 `port`
  - [x] 支持 `baudrate`
- [x] 支持烧录调用
  - [x] 固定脚本：`cli/flash/scripts/flash_run.py`
  - [x] 固定动作：`online-program`
  - [x] 固定输出：`--json`
  - [x] 默认 `verify: true`
- [x] 命令执行使用 `execFile`
- [x] 命令执行关闭 shell：`shell: false`
- [x] 不开放任意 shell 命令
- [x] `compile_failed` 会被视为失败
- [x] UI 优先展示 `details.diagnostics`
- [x] 编译成功后才显示烧录区
- [x] 烧录前必须人工勾选“确认烧录”
- [x] 未确认时不会触发真实烧录调用
- [x] 缺少 port 时不会触发真实烧录
- [x] 没有最近成功 BuildRun 时不会触发真实烧录
- [~] 已形成“Profile -> 编译 -> BuildRun -> 日志/诊断 -> 烧录确认入口”的最小闭环
- [~] 还未接入 Agent 自动读编译错误并修复代码的循环

## 阶段 5：32 位 C / Keil 辅链路

- [ ] 32 位 C / Keil Profile 未接入
- [ ] Keil CLI 编译未接入
- [ ] 32 位项目模板和 SDK 规则未接入
- [ ] 32 位构建日志解析未实现

## 阶段 6：烧录、高风险操作、审批与审计

- [x] 烧录前人工确认门禁已实现
- [x] 烧录必须依赖最近成功编译记录
- [x] 烧录必须提供 port
- [x] 烧录默认 verify
- [x] 烧录动作写入 `flash_runs`
- [x] 烧录动作写入审计日志
- [~] 审批表已建立，但正式审批流、审批人、审批状态流转 UI 尚未完成
- [~] 完整 RBAC 与审计总线尚未完成

## 阶段 7：自动更新与发布

- [x] 默认 GitHub 更新仓库改为 `Alvinzero/Hangshun-Nexus`
- [x] Electron Builder publish 配置指向 `Hangshun-Nexus`
- [x] 接入 `electron-updater`
- [x] GitHub Release 资产包含 Windows exe
- [x] GitHub Release 资产包含 `latest.yml`
- [x] `latest.yml` 包含 version、files、sha512、size、path、releaseDate
- [x] 发布脚本支持 `RELEASE_ASSET_SCOPE=windows-desktop`
- [x] Windows-only 发布时不再强制要求 macOS / Linux / web-cli 产物
- [x] 如果 Windows artifact 没有 `latest.yml`，发布脚本可根据 exe 自动生成
- [x] `v0.0.1` 已公开发布
- [ ] macOS 发布未纳入第一版
- [ ] Linux 发布未纳入第一版
- [ ] web-cli 发布未纳入第一版

## 第一版测试与验证

- [x] Toolchain Profile 路径解析测试
- [x] child process 参数白名单与 `shell: false` 测试
- [x] CLI JSON 成功 / 失败解析测试
- [x] `compile_failed` diagnostics 落入 BuildRun 测试
- [x] `missing_port` / 未确认烧录不会真实烧录测试
- [x] 工具链 UI 测试
  - [x] 编译前不显示烧录按钮
  - [x] 编译失败展示错误行和 message
  - [x] 编译成功展示产物路径
  - [x] 未确认烧录不会调用 flash
- [x] Release Packaging 测试
  - [x] Windows x64-only release matrix
  - [x] Windows desktop-only release asset set
  - [x] 自动生成 `latest.yml`
  - [x] Release 非 Draft 发布
- [x] 本地验证
  - [x] `bun run format:check`
  - [x] `bunx tsc --noEmit`
  - [x] `bun run lint`
  - [x] `bunx vitest run --reporter=dot`
  - [x] `git diff --check`
- [x] 线上验证
  - [x] GitHub Actions Windows build 成功
  - [x] GitHub Release 公开可见
  - [x] `latest.yml` 可公开访问
  - [x] Windows exe 可公开访问

## 第一版未覆盖范围

- [ ] Kun Agent Loop 尚未正式接入 Toolchain provider
- [ ] AI 自动生成 / 修改汇编代码闭环未完成
- [ ] 编译日志自动反馈修复循环未完成
- [ ] 完整 Spec-Kit 流程未完成
- [ ] 完整办公智能体 MVP 未完成
- [ ] 完整部门 / 用户 / 权限管理 UI 未完成
- [ ] 完整审批流 UI 未完成
- [ ] 32 位 C / Keil 工具链未完成
- [ ] macOS / Linux 发布未完成

## 第一版结论

第一版已经完成：

```text
HK64S8x Profile
-> 工具链扫描
-> 8 位汇编编译
-> BuildRun 记录
-> diagnostics / artifacts / metrics 展示
-> 烧录前人工确认
-> FlashRun / AuditLog 记录
-> Windows 11 x64 安装包发布
-> GitHub Release latest.yml 自动更新元数据
```

第一版可以作为航顺 AI 系统后续 Coding 主链路的基础版本继续迭代。
