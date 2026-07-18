# Windows Install Identity Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 Windows 从 `HangCore Agent 0.1.10` 升级后保留双安装、再次启动旧版的问题。

**Architecture:** 保留 `HK AI Platform` 品牌，在 Tauri 官方 NSIS 模板的 installer hooks 扩展点迁移旧安装；单独的 Bun 契约检查防止安装身份再次漂移。迁移不接触应用数据目录。

**Tech Stack:** Tauri 2、NSIS、Bun 测试、GitHub Actions Windows Release

---

### Task 1: 安装身份契约测试

**Files:**
- Create: `scripts/check-windows-install-identity.mjs`
- Create: `scripts/check-windows-install-identity.test.ts`

- [x] 写失败测试，要求 `tauri.conf.json` 引用 installer hook，且 hook 同时包含 `HangCore Agent` 和 `HK AI Platform` 的迁移合同。
- [x] 运行 `bun test scripts/check-windows-install-identity.test.ts`，确认因 hook 缺失失败。

### Task 2: NSIS 旧安装迁移

**Files:**
- Create: `apps/desktop/nsis/install-identity-migration.nsh`
- Modify: `apps/desktop/tauri.conf.json`

- [x] 在 `bundle.windows.nsis.installerHooks` 引用迁移脚本。
- [x] `PREINSTALL` 记录旧入口状态并静默卸载不同目录下的旧安装。
- [x] `POSTINSTALL` 清理旧卸载键/快捷方式并恢复新版入口。
- [x] 运行安装身份测试，确认通过。

### Task 3: 持续校验与回归

**Files:**
- Modify: `package.json`
- Modify: `scripts/scripts.json`
- Modify: `.github/workflows/windows-release.yml`

- [x] 将 `check:windows-install` 接入 `check`。
- [x] 在 Windows Release 的打包前运行安装身份检查，避免 NSIS 构建到末尾才发现迁移配置缺失。
- [x] 运行 `bun test scripts/check-windows-install-identity.test.ts`。
- [x] 运行 `bun run check:windows-install`。
- [x] 按当前 Tauri CLI 能力校验配置 schema；`tauri inspect` 2.11.2 不提供 `config` 子命令，已确认 CLI schema 支持 `installerHooks` 且配置 JSON 可解析。
- [x] 运行 `bun run check` 与 `git diff --check`。
