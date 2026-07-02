# 航顺 AI 系统第一版完成情况勾选

> 对照来源：`航顺AI系统_实施计划书.md`、`航顺AI系统_分阶段任务划分.md`、Windows 首版发布计划。
> 记录日期：2026-07-02
> 第一版版本：`HangCore Agent v0.1.0`
> 发布仓库：`git@github.com:Alvinzero/HangCore-Agent.git`
> Release：<https://github.com/Alvinzero/HangCore-Agent/releases/tag/v0.1.0>
> 成功 workflow：<https://github.com/Alvinzero/HangCore-Agent/actions/runs/28593570708>

## 状态说明

- `[x]` 已完成：第一版已经实现、提交、推送或发布。
- `[ ]` 未完成：不属于第一版交付，或还需要后续阶段继续实施。
- `部分完成`：底座或资产已经具备，但还没有形成完整业务闭环。

## 第一版定位

第一版不是完整的 Kun + Spec + MCU Coding 闭环，而是完成以下首发基线：

```text
nomiFun 底座收敛
-> HangCore Agent 产品化命名
-> Windows x64 桌面安装包
-> Tauri updater 签名资产
-> GitHub Actions Windows 发布流水线
-> GitHub Release v0.1.0
```

## 1. 架构与文档收敛

- [x] 架构方向从旧 `AionUi + Kun + Spec` 调整为 `nomiFun + Kun Agent + Spec Kit`。
- [x] 明确 `nomiFun` 是新的桌面应用主底座。
- [x] 明确 `Kun` 不复制运行时代码进 nomiFun core。
- [x] 明确 `Kun` 后续作为可选 Local Agent / ACP Adapter 接入。
- [x] 明确 `Spec Kit` 后续内嵌到 Coding 任务流程，不作为独立主入口。
- [x] 中文 PRD、阶段任务和实施计划已收敛到 `docs/hangshun/`。
- [x] Task 1 bring-up 记录已迁入 `docs/hangshun/implementation/nomifun-bringup.md`。
- [ ] `kun-acp-adapter-design.md` 尚未创建。
- [ ] Kun Agent 注册框架尚未进入实现。
- [ ] Spec / Plan / Tasks 结构化产物尚未进入实现。

## 2. 仓库根目录与无关文件清理

- [x] 以 `nomifun-tauri-main` 内容作为当前仓库根目录。
- [x] 当前 Git 远程已指向 `git@github.com:Alvinzero/HangCore-Agent.git`。
- [x] 旧 `AionUi/` 源码包未提交进新仓库。
- [x] 旧 `Kun/` 源码包未提交进新仓库。
- [x] 旧 `spec-kit/` 源码包未提交进新仓库。
- [x] 旧 `hk64s8x-compiler-cli-source-pack/` 未提交进首版仓库。
- [x] 旧 `Standards _rules/` 未提交进首版仓库。
- [x] `node_modules/`、`target/` 等构建目录未提交进仓库。
- [x] updater 私钥文件未提交进仓库。
- [ ] 内部 Rust crate / package 命名仍保留 `nomifun-*`，本轮按低风险原则未大改。

## 3. HangCore Agent 品牌与桌面配置

- [x] `apps/desktop/tauri.conf.json` 产品名改为 `HangCore Agent`。
- [x] Tauri identifier 改为 `com.hangshun.hangcoreagent`。
- [x] deep link scheme 改为 `hangcore`。
- [x] 开发配置使用 `HangCore Agent Dev`、`com.hangshun.hangcoreagent.dev`、`hangcore-dev`。
- [x] updater endpoint 指向 `https://github.com/Alvinzero/HangCore-Agent/releases/latest/download/latest.json`。
- [x] bundle target 收敛为 Windows NSIS。
- [x] 桌面 shell 可见标题、托盘和错误弹窗文案已切换到 `HangCore Agent`。
- [x] 关于 / 更新相关链接已切换到 `Alvinzero/HangCore-Agent`。
- [ ] 应用图标和完整视觉品牌未作为第一版重点处理。

## 4. 版本、签名与自动更新资产

- [x] 首版版本号统一为 `0.1.0`。
- [x] `Cargo.toml` / `Cargo.lock` / `package.json` / `ui/package.json` 版本已同步。
- [x] 已生成新的 Tauri updater keypair。
- [x] updater 公钥已写入 `apps/desktop/tauri.conf.json`。
- [x] updater 私钥已加入 GitHub Actions Secret：`TAURI_SIGNING_PRIVATE_KEY`。
- [x] `apps/desktop/tauri.updater.conf.json` 启用 `createUpdaterArtifacts`。
- [x] `scripts/make-latest-json.mjs` 默认仓库改为 `Alvinzero/HangCore-Agent`。
- [x] `scripts/release-win.ps1` 默认仓库改为 `Alvinzero/HangCore-Agent`。
- [x] 修复 GitHub Release 资产名空格转点号后，`latest.json` URL 不匹配的问题。
- [x] CI 增加 `latest.json` Windows URL 与实际 GitHub asset name 的校验。
- [ ] Windows Authenticode 代码签名未启用；第一版只完成 Tauri updater minisign 签名。
- [ ] 自动更新端到端升级未验证；需要后续发布 `v0.1.1` 才能完整测试。

## 5. GitHub Actions Windows 发布流水线

- [x] 新增 `.github/workflows/windows-release.yml`。
- [x] 支持 `workflow_dispatch` 手动输入版本号和 release notes。
- [x] 使用 `windows-latest` runner 构建 Windows x64。
- [x] 执行 `bun install --frozen-lockfile`。
- [x] 执行 `bun run typecheck`。
- [x] 在 Rust check 前执行 `bun run build:ui`，保证 Tauri `ui/dist` 存在。
- [x] 执行 `cargo check --workspace`。
- [x] 校验 `TAURI_SIGNING_PRIVATE_KEY` Secret。
- [x] 执行 `bun run build:win x64 --config apps/desktop/tauri.updater.conf.json`。
- [x] 生成 `latest.json`。
- [x] 上传 workflow artifact。
- [x] 创建 / 覆盖 GitHub Release `v0.1.0`。
- [x] Release 资产包含 Windows `.exe`。
- [x] Release 资产包含 `.exe.sig`。
- [x] Release 资产包含 `latest.json`。

## 6. 第一版发布结果

- [x] 已提交并推送 `74f78e4 chore: prepare hangcore windows release`。
- [x] 已提交并推送 `4a78a19 ci: build ui before rust workspace check`。
- [x] 已提交并推送 `c88b584 ci: align updater manifest with github assets`。
- [x] GitHub Actions `Windows Release #3` 成功完成。
- [x] Release `v0.1.0` 已创建并公开。
- [x] Windows 安装包已发布：`HangCore.Agent_0.1.0_x64-setup.exe`。
- [x] updater 签名已发布：`HangCore.Agent_0.1.0_x64-setup.exe.sig`。
- [x] updater 清单已发布：`latest.json`。
- [x] Release API 确认三个资产均存在。
- [x] `latest.json` 资产大小为 748 bytes。
- [x] Windows 安装包资产大小约 42.8 MB。
- [ ] 未在真实 Windows 机器上完成安装后启动验收。
- [ ] 未在 Windows 客户端执行“检查更新 -> 下载 -> 安装更新”的端到端验收。

## 7. 本地验证与 CI 验证

- [x] 本地执行 `bun run typecheck` 通过。
- [x] 本地执行 `bun run build:ui` 通过。
- [x] 本地执行 `bun run check` 通过。
- [x] 本地解析 workflow YAML 通过。
- [x] 本地用假 Windows updater 产物验证 `make-latest-json.mjs` URL 生成规则通过。
- [x] GitHub Actions 中 `Typecheck UI` 通过。
- [x] GitHub Actions 中 `Build UI dist for Tauri checks` 通过。
- [x] GitHub Actions 中 `Check Rust workspace` 通过。
- [x] GitHub Actions 中 `Validate updater signing secret` 通过。
- [x] GitHub Actions 中 `Build Windows updater installer` 通过。
- [x] GitHub Actions 中 `Generate latest.json` 通过。
- [x] GitHub Actions 中 `Publish GitHub Release` 通过。
- [ ] 本机 macOS 缺少 `rustc` / `cargo` 的历史 bring-up 阻塞仍记录在 `nomifun-bringup.md`，本地 Rust 验证需后续补齐。

## 8. 对照实施计划的里程碑完成情况

### M0 架构冻结

- [x] 文档方向已改为 nomiFun 主底座。
- [x] Kun 已确定为后续可选 Agent / ACP Adapter。
- [x] Windows 首版发布范围已冻结。

### M1 nomiFun 跑通

- [x] nomiFun 代码已作为 HangCore Agent 首版桌面底座进入构建。
- [x] GitHub Actions Rust workspace check 通过。
- [x] GitHub Actions Windows Tauri 构建通过。
- [ ] 本机 `dev:web` 页面检查未完成，原因是本机当时缺少 Rust 工具链。

### M2 Kun Agent 注册框架

- [ ] Kun Agent 卡片未实现。
- [ ] Kun Agent catalog row 未实现。
- [ ] `kun-acp-adapter` 检测逻辑未实现。
- [ ] 会话选择 Kun Agent 未实现。

### M3 kun-acp-adapter MVP

- [ ] `kun-acp-adapter` 包未创建。
- [ ] Kun HTTP / SSE 到 ACP event 映射未实现。
- [ ] Kun approval / user input / cancel 映射未实现。
- [ ] Kun 作为 nomiFun ACP Agent 完成一次流式对话尚未实现。

### M4 CodingTask + SpecArtifact

- [ ] CodingTask 数据模型未实现。
- [ ] Spec / Plan / Tasks 结构化保存未实现。
- [ ] 会话内 Spec 侧栏或结构化区未实现。
- [ ] Traceability / checklist 未实现。

### M5 8 位工具链 Adapter

- [ ] HK64S8x 工具链 Adapter 未接入本版。
- [ ] 编译命令封装未接入本版。
- [ ] 编译结果结构化保存未接入本版。

### M6 8 位 Coding 闭环

- [ ] 自然语言生成汇编未实现。
- [ ] 编译失败后自动修复循环未实现。
- [ ] 烧录前审批闭环未实现。

### M7 办公与知识库 MVP

- [x] nomiFun 原有知识库和本地 Agents 能力作为底座保留。
- [ ] 航顺办公智能体模板流未实现。
- [ ] Dify / MaxKB 连接器未实现。
- [ ] 部门知识库治理流未实现。

### M8 试点交付

- [x] Windows x64 安装包已发布。
- [x] GitHub Release 已发布。
- [x] 自动更新清单和签名资产已发布。
- [ ] Windows 真机安装启动验收未完成。
- [ ] `v0.1.1` 更新验收未完成。
- [ ] 演示脚本和用户试点反馈表未完成。

## 9. 第一版未覆盖范围

- [ ] Kun Agent 还不能在本地 Agents 中作为可选项安装和启动。
- [ ] Kun 的 Coding Agent Loop / SSE / approval 还没有接到 nomiFun。
- [ ] Spec Kit 还没有形成产品内闭环。
- [ ] 航顺 8 位 MCU 工具链还没有接入 HangCore Agent。
- [ ] 32 位 C / Keil 链路未接入。
- [ ] 办公智能体 MVP 未定制完成。
- [ ] 完整 RBAC、审批和审计 UI 未完成。
- [ ] macOS / Linux 发布不在第一版范围内。

## 10. 第一版结论

第一版已经完成“可发布的 Windows 桌面基线”：

```text
HangCore Agent v0.1.0
-> nomiFun 作为桌面底座
-> Windows x64 NSIS 安装包
-> Tauri updater .sig 签名
-> latest.json 自动更新清单
-> GitHub Actions Windows 发布流水线
-> GitHub Release 正式资产
```

下一阶段应进入：

```text
Kun Agent 注册框架设计
-> kun-acp-adapter MVP
-> ACP 流式对话验证
-> CodingTask + SpecArtifact
-> 航顺 MCU 工具链 Adapter
```
