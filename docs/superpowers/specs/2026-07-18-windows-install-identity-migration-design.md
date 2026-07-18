# Windows 安装身份迁移设计

## 问题

`v0.1.10` 的 Tauri `productName` 是 `HangCore Agent`，`v0.1.11` 起改为 `HK AI Platform`。Tauri NSIS 使用 `productName` 生成默认安装目录、卸载注册表键、开始菜单和桌面快捷方式。因此品牌改名在 Windows 上形成两套安装，用户可能更新到新版后又从旧快捷方式启动 `0.1.10`。

线上 `v0.1.12` Release、`latest.json`、签名和 EXE URL 均正确，问题发生在客户端安装身份迁移层。

## 方案

保持用户可见品牌 `HK AI Platform`，通过 Tauri 官方支持的 NSIS installer hooks 迁移旧安装，不复制或修改官方完整 NSIS 模板。

- `NSIS_HOOK_PREINSTALL` 检测当前用户下的旧 `HangCore Agent` 卸载记录。
- 记录旧桌面快捷方式、开始菜单快捷方式和开机启动状态。
- 当旧目录与新目录不同时，以 `/UPDATE /P` 静默运行旧卸载器，只删除旧程序，不删除应用数据。
- `NSIS_HOOK_POSTINSTALL` 删除残余旧快捷方式和旧安装注册表键，并按原状态为 `HK AI Platform` 创建桌面、开始菜单和开机启动入口。
- 新版继续使用当前 `HK AI Platform` 安装身份；以后改变 `productName` 必须同步更新迁移合同和测试。

## 数据边界

迁移只处理安装目录、快捷方式、卸载注册表键和 `HKCU\\...\\Run` 入口。不得删除 `%APPDATA%`、`%LOCALAPPDATA%` 中由 bundle identifier 或 NomiFun 数据目录管理的模型配置、API Key、会话、知识库和工作区资料。

## 验证

- Bun 契约测试校验 Tauri 配置引用迁移钩子，钩子包含旧/新产品名、旧卸载和入口迁移逻辑。
- 使用当前 Tauri CLI schema 验证 `installerHooks` 受支持，并解析 `tauri.conf.json`；Tauri CLI 2.11.2 不提供 `inspect config` 子命令。
- `bun run check`、`git diff --check` 通过。
- Windows 发布工作流构建时包含 `installerHooks`，最终安装包需在 `0.1.10 -> 新版` 场景实机验证只保留 `HK AI Platform`。
