# HangCore Agent 模块发布策略

> 记录日期：2026-07-02
> 适用仓库：`git@github.com:Alvinzero/HangCore-Agent.git`
> 当前规则：以后每完成一个模块，都必须推送 GitHub 并发布一个新版本。

## 1. 发布原则

- 每个独立模块完成后，必须形成一次 GitHub Release。
- Release 只发布 Windows x64 桌面安装包；macOS / Linux 暂不纳入本阶段。
- 每次发布必须包含 Windows `.exe`、对应 `.exe.sig` 和 `latest.json`。
- `latest.json` 必须指向 `Alvinzero/HangCore-Agent` 仓库的 Release 资产。
- Tauri updater 私钥只保存在 GitHub Secrets，不提交到仓库。
- 与当前模块无关的旧 AionUi、旧 Kun、spec-kit 源码包和构建残留不得进入仓库和安装包。

## 2. 模块完成定义

一个模块只有同时满足以下条件，才算完成：

- 代码或文档实现已落地。
- 相关测试、类型检查或配置检查通过；如本机环境缺失导致不能执行，必须记录原因，并依赖 GitHub Actions 补充验证。
- 变更已提交到 `main` 并推送到 `git@github.com:Alvinzero/HangCore-Agent.git`。
- GitHub Actions `Windows Release` 已成功完成。
- GitHub Release 已创建或更新，并确认 `.exe`、`.sig`、`latest.json` 三类资产存在。

## 3. 版本号规则

- MVP 之前，每完成一个模块默认提升 patch 版本，例如 `0.1.0 -> 0.1.1 -> 0.1.2`。
- 如果模块引入明显的新产品阶段或大范围能力，再提升 minor 版本，例如 `0.1.x -> 0.2.0`。
- 不在同一个版本里混合多个未关联模块；一个 Release 要能清楚对应一个模块成果。
- Release notes 必须写明模块名称、用户可见变化、验证结果和未完成边界。

## 4. 标准发布流程

1. 完成模块实现和文档更新。
2. 更新版本号：

   ```bash
   bun run bump <x.y.z>
   ```

3. 执行本地验证：

   ```bash
   bun test <相关测试>
   bun run typecheck
   bun run check
   git diff --check
   ```

4. 提交并推送：

   ```bash
   git add <本模块相关文件>
   git commit -m "<type>: <module summary>"
   git push origin main
   ```

5. 触发 GitHub Actions `Windows Release`：

   - `version`: 不带 `v` 的版本号，例如 `0.1.1`
   - `notes`: 本次模块的 Release notes

6. 发布成功后检查：

   - Release tag 是否存在。
   - Windows 安装包 `.exe` 是否存在。
   - updater 签名 `.exe.sig` 是否存在。
   - `latest.json` 是否存在且 URL 指向本版本资产。

## 5. 版本台账

| 版本 | 模块 | 发布定位 | 发布说明 |
| --- | --- | --- | --- |
| `v0.1.0` | Windows 首版基线 | 首版基线 | nomiFun 底座收敛、HangCore Agent 品牌、Windows NSIS 安装包、Tauri updater 资产、GitHub Actions 发布流水线。 |
| `v0.1.1` | Kun Agent 注册占位模块 | 本轮模块发布 | 在本地 Agents 支持列表和后端 seed 中预留 Kun Agent，使未来 `kun-acp-adapter` 可作为可选 ACP Agent 接入。 |
| `v0.1.2` | Kun Agent 安装入口修正 + `kun-acp-adapter` MVP | 本轮模块发布 | Kun Agent 手动下载入口改为项目内安装说明；新增 HangCore 自有 ACP stdio adapter，桥接 NomiFun Local Agents 到本机 Kun HTTP/SSE agent loop。 |
| `v0.1.3` | Skills 中文友好显示与搜索 | 已并入后续发布 | Guid 抽屉和 Skills Hub 中内置 Skills 名称、描述、标签中文化，运行时 Skill id 保持不变。 |
| `v0.1.4` | Kun Agent 模型服务商复用与 provider fallback | 用户手动发布 | Kun Agent 复用系统设置里的第三方模型服务商配置；Kun runtime / 命令不可用时可走注入 provider fallback。 |
| `v0.1.5` | 真实 Kun runtime 对话链路闭环 | 已发布 | `kun-acp-adapter` 使用 Kun 原 HTTP/SSE runtime 和 AgentLoop，补齐 ACP permission、Kun approval/user-input 回填、tool lifecycle 映射和 adapter 设计文档；Release 含 Windows `.exe`、`.sig`、`latest.json`。 |

## 6. 下一版本候选

- `v0.1.6`: CodingTask + SpecArtifact 最小结构化保存。
- `v0.1.7`: HK64S8x 工具链 Adapter / MCP 接入。
