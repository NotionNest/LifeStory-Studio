# Git 与远程协作流程

2026-10-16 用户确认。仓库 [NotionNest/LifeStory-Studio](https://github.com/NotionNest/LifeStory-Studio) 保持私有。

## 分支与流转

- `develop`：日常集成基线。任务从这里创建 `feat/*`、`fix/*`、`docs/*`、`chore/*`，通过 PR 回到 develop。
- `release/<版本>`：从 develop 切出的版本候选，只接收 fix/chore 修复和发布准备；不接收新功能。版本未确定时不创建分支。
- `main`：正式基线，接收 release 候选或从 main 出发的 `hotfix/*`。本次 hotfix/git-workflow 是流程迁移的一次性基础设施引导。
- 正式合入后 main 通过 PR 回合 develop；紧急修复也回合仍维护的 release。

任务 PR 通常 squash；release→main、main→develop、main→release 使用 merge commit，保留共同祖先。仓库允许 merge/squash，关闭 rebase merge 和自动合并。关闭自动删除来源分支，避免回流时误删 main；确认没有依赖后手动删除短期分支。不得强推共享分支、覆盖未提交工作或机械清理旧分支。

## 日常操作

1. 检查工作区并保护已有修改，再同步对应基线。
2. 按任务分支实现、按测试边界验证，更新规格与 STATUS。
3. 提交前检查文件与 staged diff；不提交密钥、私人资料、资料库、构建产物。
4. 使用 feat/fix/docs/chore 等明确提交说明，不使用 CI 跳过标记。
5. 按当前任务授权推送并创建 PR；检查 CI Gate 和实际修改后，按授权合并。合并不等于发布授权。

## Actions 分层

| 时机 | 行为 |
|---|---|
| 指向 develop/main/release 的 PR | 始终进行分支路由、变更范围和稳定 CI Gate 检查 |
| 普通说明文档变化 | 跳过桌面与前端测试；门禁仍给出结果 |
| 应用代码/契约变化 | Ubuntu 一次类型、格式、前端关键交互；macOS/Windows Rust 测试、Clippy、桌面编译 |
| 图片验证工具变化 | 仅双平台工具检查；共享 CI/工具链变化检查全部 |
| main/develop 合并后 | 轻量核对提交来自指向该分支的已合并 PR，不重复完整构建 |
| release 修复 PR | 通用检查；合入后的 release push 运行完整候选回归与打包 |
| release push / 手动候选 | 完整双平台检查，生成 DMG/NSIS 和 SHA256 来源清单，保留 14 天 |
| release→main | 仅当成功候选运行对应相同提交、相同来源分支且待合并树完全一致时复用桌面结果；否则重验 |

候选版本由一致的 package/Tauri/Cargo 基础版本生成 `<版本>-rc.<运行号>`，构建机内同步锁文件；使用 Preview 名称和 `.preview` 应用标识，隔离稳定版数据。仅内部未签名测试产物，不自动创建 GitHub Release 或正式标签。候选构建配置已实现，真实候选打包与安装尚待首次版本确定后验证。正式签名、公证、Windows 安装升级、备份恢复和发布授权仍是发布验收条件；当前没有自动正式发布通道。

同一 PR 的新提交取消过期检查；缓存依赖。必要任务失败、取消或意外跳过都会导致 CI Gate 失败。不以覆盖率、普通标点或装饰样式用例增加检查量。CI 通过不代表双平台实机交互或发布验收通过。

## 服务端保护的实际边界

GitHub 为当前私有仓库启用规则集返回 HTTP 403，要求升级 Pro 或公开。用户选择保持私有并记录限制，因此 **main/develop/release 的强制分支保护、必需检查与禁止强推未启用**。上述规则是协作约定，CI 能报告违规，但无法阻止有写权限的人直接推送、绕过失败检查或错误合并方式。合并者必须人工确认 CI Gate 成功和合并方式；不能称为服务端强制门禁。以后套餐支持时再启用规则集，不增加付费服务或改变可见性。

## 本次迁移

未提交保存功能已保护于 `backup/local-saving-before-git-migration`（5f165c8）并推送。重复 PR #2 已关闭；PR #3 包含最新保存/编辑入口历史方案，目标改为 develop，保留原分支和备份。新流程先通过基础设施 PR 进入 main，再回合 develop，随后同步到 #3。不得为迁移丢弃功能成果或强推历史。

你可以说：“从 develop 开分支完成任务，验证后创建 PR”，或“检查这个 PR，满足需求后合并”。AI 应报告分支、提交、PR 和真实检查状态。
