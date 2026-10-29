# 技术选型提案

2026-10-27 前端页面架构修订：DEC-17 已确认，页面导航采用 React Router Data Mode + Hash 路由，视图与会话分离；当前实施与验收见 [前端页面与导航架构](FRONTEND_NAVIGATION.md) 和 TASK-09。本文早期提案中的“未实施”表述仅代表当时阶段，当前事实以 STATUS.md 为准。

编写日期：2026-10-14。确认日期：2026-10-15。状态：DEC-12 已由用户确认；具体依赖版本仍需兼容性核实与锁定。选择理由是针对本产品的工程判断，不代表市场排名。

## 推荐组合

| 位置 | 建议 | 用途与理由 |
|---|---|---|
| 桌面载体 | Tauri 2 | 用户指定；支持 macOS 与 Windows 的桌面交付 |
| 业务与系统层 | Rust + Tauri 命令 | 保存、版本引用、资料范围、AI 任务和系统访问集中校验 |
| 界面 | React + TypeScript | 创作工作台组件与状态组织；前后端接口类型显式定义 |
| 样式与控件 | Tailwind CSS 4 + shadcn/ui（Radix） | 用户于 2026-10-15 指定加入；Tailwind 管理布局与主题，shadcn 源码控件按需加入 |
| 前端构建 | Vite | 输出桌面 WebView 使用的静态资源；不引入服务端渲染 |
| 长文编辑 | Tiptap 开源核心与所需扩展 | 结构化段落、格式、撤销和编辑集成；审稿与原文定位由应用实现 |
| 数据 | SQLite + rusqlite（bundled/backup） | 事务、稳定版本、多对多引用与可验证备份；统一打包数据库实现 |
| 模型 HTTP 调用 | reqwest + Rust 异步任务 | 自配端点、认证、流式接收、超时、取消及错误处理 |
| 本机 AI 工具 | Codex App Server，Rust 管理 stdio 子进程 | 使用官方协议；不靠 UI 自动化，也不读取工具私有凭据 |
| API Key | 应用私有目录的明文 JSON 文件 | 按应用数据目录隔离，不进入数据库、备份或导出；前端不提供读取密钥接口 |
| 前端测试 | Vitest | 与 Vite 配套，验证关键状态和交互规则 |
| 核心测试 | Rust 单元与集成测试 | 事务、迁移、引用、附件一致性、取消与结果校验 |
| 桌面端到端 | WebdriverIO Tauri service，测试专用 embedded provider | 当前官方文档提供双平台路径；测试插件只进入专用测试构建 |
| 包管理与版本 | npm + Cargo，提交双侧锁文件 | 单应用无需额外工作区；搭建时核实兼容版本并锁定 |

Tokio、Serde 等 Rust 运行时/序列化依赖随 Tauri 与实际实现选择兼容版本，不在本阶段抄用示例版本号。样式与组件已确定 Tailwind CSS + shadcn/ui；路由库按实际需要决定。

2026-10-15 集成：Tailwind/@tailwindcss/vite 4.3.3、shadcn CLI 4.21.5、Radix UI 1.8.1；CLI 配置为 radix-nova，CSS 入口现位于 src/styles/globals.css（DEC-19），主题在 src/styles/theme.css，组件源码位于 src/components/ui。当前仅加入 Button/Badge，按需扩展；默认控件样式不等于正式产品视觉方向已确认。

Tailwind 通过官方 Vite 插件构建，使用 v4 CSS 入口与语义主题变量。[官方 Vite 集成](https://tailwindcss.com/docs/installation/using-vite)。shadcn 通过 components.json 和 TypeScript/Vite 的 @ 路径别名定位组件。[官方 Vite 说明](https://ui.shadcn.com/docs/installation/vite)

最低系统范围仍需结合 WebView 验证。Tailwind v4 的现代浏览器基线包括 Safari 16.4、Chrome 111、Firefox 128；不能仅用 Node/Rust 编译通过承诺旧版系统渲染正确。[官方兼容性说明](https://tailwindcss.com/docs/compatibility)

## 候选比较与取舍

| 选择 | 考虑过的选项 | 推荐理由与代价 |
|---|---|---|
| 前端 | React、Vue、Svelte | 都可满足；推荐 React 因编辑器与工作台集成路径明确。其状态重复和长文重渲染需控制；不是因其他选项不具备能力 |
| 构建 | Vite、带服务端能力的全栈框架 | 本产品本地桌面资料管理无需 Web 服务器；Vite 的静态构建与目标一致 |
| 存储 | SQLite、独立 Markdown 文件、需服务进程的数据库 | SQLite 更适合版本与多对多引用。Markdown 作为可读导出，完整恢复包保留数据库结构；格式转换需要测试 |
| Rust 数据接口 | rusqlite、SQLx、前端直连 SQL 插件 | 推荐 rusqlite，数据库工作放专用线程，SQL 在 Rust 边界内。SQLx 也可行，但当前单库串行写入不要求额外异步连接池 |
| 编辑器 | Tiptap、纯文本编辑器、直接 ProseMirror | Tiptap 对结构化段落与富文本较合适；开源核心不等于所有扩展免费，锁依赖前审查许可证。纯文本方案不足以支撑当前拟定编辑体验 |
| AI 编排 | 应用服务内的任务模块、通用 Agent 框架 | 当前行为是选定资料上的整理与创作，Rust 模块足以承载；工具适配器按协议实现，不引入任意自主工具执行 |

## 重要行为约束

React 状态仅存界面选择、编辑中的草稿和当前任务进度。数据库是已保存资料的依据，不在多个全局状态库重复维护完整资料库。复杂局部流程用 reducer/context，必要时再按具体问题引入依赖。[React 状态指导](https://react.dev/learn/choosing-the-state-structure)

Vite 的 TypeScript 转译不代替类型检查；开发检查与发行构建必须单独包含 TypeScript 检查。[Vite 文档](https://vite.dev/guide/features.html#typescript)

Tiptap 文档 JSON 是编辑状态的保存格式，另生成可检索纯文本和可读导出。保存 JSON 不等于语义稳定定位，应用仍需版本、段落 ID 和证据校验。[Tiptap 持久化](https://tiptap.dev/docs/editor/core-concepts/persistence)

rusqlite 的 bundled 功能用于统一 SQLite 构建，backup 功能用于数据库快照。实际锁定版本需验证 FTS5、事务与备份启用情况。[rusqlite 官方项目](https://github.com/rusqlite/rusqlite)

2026-10-27 DEC-18 覆盖此前原生凭据选型：用户明确不使用钥匙串，确认 API Key 明文保存在应用私有目录 `private-credentials/<profileId>.json`；重启可用，不进入数据库、备份或导出。旧系统凭据不自动读取、迁移或删除，已有配置须重新填写密钥。Unix 目录/文件权限为 0700/0600；明文文件不提供加密保护。

## 双平台交付

建议 macOS 输出签名、公证的应用和 DMG，Windows 输出签名的安装包。最低系统版本与 CPU 支持矩阵需单独确认，不用当前开发机结果替代发行矩阵。

开发环境需分别满足 Tauri 官方前置要求；Windows 需核实 WebView2 安装策略，macOS/Windows 的签名凭据独立管理。[系统前置条件](https://v2.tauri.app/start/prerequisites/)、[macOS 签名](https://v2.tauri.app/distribute/sign/macos/)、[Windows 签名](https://v2.tauri.app/distribute/sign/windows/)

当前 WebdriverIO Tauri service 的 embedded 路径支持 macOS 与 Windows；直接使用传统 tauri-driver 与该路径不同。测试构建须通过编译特性与发行检查排除 embedded 测试服务器，真实安装和系统凭据弹窗仍需平台验证。[WebdriverIO 官方文档](https://webdriver.io/docs/desktop-testing/tauri)

## 研究记录与验证边界

测试工具提供可用能力，不意味着每次编辑都使用。执行范围遵循 [测试策略](../process/TESTING_POLICY.md)：前端关键交互集成优先，Rust 复杂规则及真实数据链路，桌面端到端只保留关键流程；普通标点和装饰样式不新增测试。

本次使用 ctx7 CLI，先 library 再 docs，核实 Tauri、React、Vite、Tiptap、SQLite、rusqlite、keyring、reqwest、Codex、OpenAI API、Vitest、WebdriverIO。SQLite 的 Context7 结果未覆盖 trigram 细节，另读 SQLite 官方 FTS5 页面；rusqlite 首次 fetch failed，在沙箱外重试成功。

本机只核实 Codex CLI 0.146.0 的帮助、功能列表和生成协议 schema。没有发起模型任务、读取私有凭据、调用付费服务或进行 Windows 实机验证。依赖尚未安装；文档支持选型，不构成运行兼容性证明。
