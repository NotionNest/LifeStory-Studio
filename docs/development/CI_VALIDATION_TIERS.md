# CI 检查分层优化

日期：2026-10-19。用户授权：减少每次 PR 不必要的检查/编译，并自主选择合理方案。此实现不更改应用、不合并前序 PR、不调整服务器保护、不创建发布候选或产品 Release。

## 选择理由

当前前端修改会运行 macOS/Windows 两套 Rust 测试、Clippy 和 Tauri 编译。PR #12 的 macOS 4分15秒、Windows 7分18秒主要包含依赖安装、Rust 编译和缓存，并非交互用例耗时。应用修改一律选完整桌面任务的规则过粗。

develop 仍保留轻量反馈：保存交互和真实存储逻辑不适合积累到预发布才发现失败；Windows/桌面集成验证放在候选或手动完整检查。开发期可能较晚发现 Windows 专属问题，这是显式取舍。前端构建代替只做类型检查，仍不等于 Tauri 安装级验证。

## 实现

- policy.classify 拆分 common、rust、desktop、images，精确选择前端、后端、图片与共享/未知路径。普通 PR 不选 desktop。
- common 在 Ubuntu 运行 npm ci、npm run build（类型+Vite 生产构建）、交互测试；无需 Rust 格式或编译。
- rust 仅 macOS 运行 cargo fmt/test/clippy，锁定依赖、复用依赖缓存，无 npm 安装或 Tauri build。
- images 普通 PR 仅 Ubuntu；完整模式才 macOS/Windows。文件签名、解码、动画和资源限制保护保留。
- release push/candidate、手动完整检查、hotfix→main 选择完整矩阵，不再同时选择单平台 rust。
- release→main 校验最新成功候选与当前提交/分支/合并树后，关闭重复 common/rust/desktop/images，仅策略与 Gate。候选缺失/失败/未完成/不匹配仍拒绝。
- CI Gate 始终产生结果，新增 rust 输出同样严格要求 true/false，必需任务失败/取消/意外 skipped 均不能通过。
- 保留元数据修改复用验证、目标变化重验、过期运行取消、现有并发控制及服务器 required CI Gate，不添加路径过滤使整个必需工作流悬空。

## 官方依据

按项目规则使用 ctx7 CLI 的 GitHub Actions library/docs 核实：[跳过整个工作流可能使必需检查保持 pending](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs)、[条件跳过任务的结果](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-jobs-with-conditions)、[needs 与 always 汇总](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-jobs)。本方案调整任务选择，不使用跳过整个 workflow 或去掉门禁的方式。

## 验证

8 项策略/真实 CLI 回归通过，覆盖纯文档/前端/后端/图片/共享与未知路径、完整与候选模式、hotfix main、候选证据与免重复、Gate 缺失输出/失败/取消/跳过、元数据证据保护。actionlint 1.7.12、Node 语法与 diff 空白检查通过。未为本次调度变更重复运行应用交互、桌面构建或创建真实发布候选；新任务在线执行以交付 PR 为准，时长尚不预先承诺。
