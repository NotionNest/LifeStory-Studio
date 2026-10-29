> 2026-10-28 更新（F-07 / TASK-11）：本文开发入口与目录说明按当前工程整理。底部 2026-10-15 环境验证保留为历史证据；当前成果与验证限制以 [STATUS](../tracking/STATUS.md) 为准。

# 开发环境与代码入口

当前是独立 Tauri 桌面工程，应用通过统一路由展示日记、聊天与设置；未接入的 EditorProbe 已删除，不保留独立环境检查页面。关联 TASK-06 历史环境搭建与 TASK-11 前端整理。

本地 Git 仓库关联公开远程 NotionNest/LifeStory-Studio；分支和 CI 授权遵循 [Git 流程](../process/GIT_WORKFLOW.md)。开发依赖以锁文件重现，版本升级需显式更新并验证。

## 启动

使用项目记录的 Node 24.3.0 和 Rust 1.97.1。`.node-version` 记录 Node 版本，`rust-toolchain.toml` 固定 Rust、rustfmt 和 clippy；npm/Cargo 锁文件固定依赖解析结果。

```sh
npm ci
npm run desktop:dev
```

首次 Rust 构建需要下载与编译依赖，后续构建使用缓存。Cargo 默认只用两个构建工作线程，不后台启动全套测试。

macOS 需要 Xcode/Command Line Tools；Windows 需要 Rust MSVC 工具链、Visual Studio C++ 构建工具和 WebView2。具体前置条件见 [Tauri 官方说明](https://v2.tauri.app/start/prerequisites/)。当前验证环境是 macOS，Windows 的实际构建/安装结果必须另外记录。

## 当前工程入口

- `src/app/App.tsx` 和 AppProviders 装配统一路由与窗口级会话，业务页面和桌面生命周期按职责组织。
- 日记使用真实编辑会话、自动保存、恢复草稿、历史与图片流程；聊天和模型设置各自保留窗口级会话。具体行为与验收范围见产品/功能文档和 STATUS。
- 生产原生 SDK 调用集中在 services；RuntimeInfo、原生可用性和退出适配归 desktop，日记新建/保存事件归 records。业务 Hook/会话负责订阅生命周期。
- Rust 管理 SQLite、编号迁移及受限 IPC；模型请求在 Rust 侧执行。协议和权限以当前 services、commands、capabilities/permissions 为准。
- `scripts/check-codex.mjs` 仅执行 App Server 初始化握手，不创建线程/任务或调用模型。

初始环境检查不替代现有业务验收；未验证平台、真实模型与发行范围继续单独跟踪。

## 常用命令

| 命令 | 用途 |
|---|---|
| `npm run check:architecture` | 检查生产模块依赖边界与值依赖循环 |
| `npm run test:architecture` | 使用合成工程验证架构门禁 |
| `npm run format:check` | 核对自维护前端的统一格式 |
| `npm run format` | 按固定 Prettier 配置格式化自维护源码 |
| `npm run desktop:dev` | 同时启动 Vite 与 Tauri 桌面窗口 |
| `npm run dev` | 仅浏览器前端预览；明确提示无法检查 Rust，不伪造后端 |
| `npm run build` | 前端类型检查与生产资源构建 |
| `npm run check` | 架构、格式、类型及 Rust 格式检查，不执行应用测试 |
| `npm run test:rust` | Rust 规则、存储和协议集成；按改动选择相关验证 |
| `npm run check:rust` | Rust Clippy，相关 Rust 改动后按需执行 |
| `npm run test:ui` | Vitest 业务交互回归；可传文件限定范围，组件库完全不测试 |
| `npm run codex:check` | 仅初始化握手；可用 `LIFESTORY_CODEX_PATH` 指定已安装可执行文件 |
| `npm run desktop:build` | 本平台构建与打包；正式签名、公证与安装验收另行配置 |

纯样式、文案修改不运行上述所有命令。按 [测试边界](../process/TESTING_POLICY.md) 选择相关检查。

## 目录职责

### Tailwind 与 shadcn

Tailwind 4 使用 @tailwindcss/vite 插件，不建立 v3 的 tailwind.config 文件。全局 CSS 入口是 src/styles/globals.css，主题变量位于 src/styles/theme.css；components.json 固定 Radix/nova、CSS 入口和 @ 别名。已接入的控件源码在 src/components/ui；src/lib/utils.ts 暴露 cn 工具，生成源码保留上游格式。

需要新组件时用官方 CLI 按需加入，例如 `npx shadcn@latest add @shadcn/input`，先检查组件目录及文档，不安装全套。控件视觉由语义变量和内置 variant 决定，Tiptap 内部样式集中在 CSS components layer。

shadcn CLI 和 CSS 构建包是开发依赖；生成的 React 控件与所需 Radix/CVA/cn 包参与应用构建。当前不加载外部字体或 CDN。正式视觉方案与额外控件随功能设计确定。

```text
src/app/                         应用入口、Provider 装配、应用测试
src/router/                      路由、路径、历史与跳转拦截
src/layouts/                     窗口与设置布局、标题栏、主导航、页面操作
src/contexts/                    按职责分开的共享状态与离开保护
src/hooks/                       外观、桌面生命周期、面板宽度
src/services/                   桌面适配与按协议领域拆分的 IPC/类型，详见 APP_STRUCTURE.md
src/styles/                      基础样式入口与语义主题
src/components/SearchHighlight.tsx 共用检索高亮
src/test/DiaryRouteHarness.tsx     日记真实路由/会话的测试装配与受控操作
src/services/desktop.ts           原生可用性、RuntimeInfo 契约、主题与退出事件
src/services/records.ts           记录协议及具名新建/保存事件
src-tauri/src/commands.rs         受限 IPC 命令
src-tauri/src/storage.rs          SQLite 线程、初始化与检查
src-tauri/migrations/             初始资料格式迁移
src-tauri/tests/                  真实临时数据库的保护用例
src-tauri/capabilities/           主窗口权限
src-tauri/permissions/            运行环境检查权限
scripts/check-codex.mjs           无模型调用的协议检查
```

只创建已有实现的模块，不预填无行为的 AI/主题/备份接口。正式业务新增时按确认架构组织。

## 数据与安全

资料根目录由 Tauri 平台 API 获取，受限 runtime_info 返回运行与存储信息。不要把真实日记当测试资料，不提交数据库、图片或密钥。删除项目源码不会删除应用资料目录。

本地主窗口使用明确列出的受限命令，不提供任意 SQL、Shell 或通用文件操作入口；实际权限以 capabilities/permissions 为准。生产 CSP 限制远程脚本，模型网络请求在 Rust 侧执行。

默认图标仍是官方脚手架图标，产品图标在视觉设计阶段处理。未确定最低系统版本与 CPU 支持矩阵，当前本机验证不等于承诺所有 macOS/Windows 版本支持。

## 初始环境验证记录（历史，2026-10-15）

| 检查 | 2026-10-15 结果 |
|---|---|
| 前端构建与类型 | 通过；React 19.3.1、TypeScript 6.0.3、Vite 8.3.4、Tiptap 3.32.0 |
| Rust 格式与 Clippy | 通过；Rust 1.97.1、Tauri 2.12.4、rusqlite 0.40.2 |
| 存储集成 | 3 个用例通过：真实数据库重开、拒绝高版本、迁移失败保留原数据；用例执行 0.01 秒，首次依赖编译另计 |
| Codex 初始化 | CLI 0.146.0 握手通过；没有模型请求，未验证工具隔离与完整生成链路 |
| macOS 开发启动 | `desktop:dev -- --no-watch` 启动成功，检查后已停止开发服务器 |
| macOS 调试包 | `desktop:build -- --debug --bundles app` 成功，31.46 MiB；不是正式签名、公证发行验证 |
| 实际窗口 | 显示 macos/aarch64、SQLite 3.53.2、Schema 1、FTS5 trigram 可用；重新检查、中文文字粘贴、换行、撤销通过 |
| Windows 与 IME | 未进行 Windows 实机检查；中文粘贴检查不等于已覆盖真实输入法组合输入 |
| Tailwind / shadcn 接入 | Tailwind 4.3.3、shadcn CLI 4.21.5、Radix 1.8.1；类型与调试包构建通过。更新后 macOS 页面渲染、编辑器加载及 Button 刷新 IPC 已实际检查 |

初始调试包输出路径为 `src-tauri/target/debug/bundle/macos/LifeStory Studio.app`，该目录是可重新生成的构建产物，不提交到 Git；历史包需重新构建后才能代表当前源码。

2026-10-28 F-06：本地与 CI 的前端架构/格式约定见 [持续质量检查](../process/FRONTEND_QUALITY.md)，组件库测试边界保持不变。
