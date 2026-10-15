# 开发环境与代码入口

日期：2026-10-15。对应 TASK-06。当前界面是实际桌面工程的环境检查页，不是日记功能交付。

已建立本地 Git 仓库，并绑定用户授权创建的私有远程 NotionNest/LifeStory-Studio。首次推送与 CI 结果见项目进度。开发依赖以锁文件重现，版本升级需显式更新并验证。

## 启动

使用项目记录的 Node 24.3.0 和 Rust 1.97.1。`.node-version` 记录 Node 版本，`rust-toolchain.toml` 固定 Rust、rustfmt 和 clippy；npm/Cargo 锁文件固定依赖解析结果。

```sh
npm ci
npm run desktop:dev
```

首次 Rust 构建需要下载与编译依赖，后续构建使用缓存。Cargo 默认只用两个构建工作线程，不后台启动全套测试。

macOS 需要 Xcode/Command Line Tools；Windows 需要 Rust MSVC 工具链、Visual Studio C++ 构建工具和 WebView2。具体前置条件见 [Tauri 官方说明](https://v2.tauri.app/start/prerequisites/)。当前验证环境是 macOS，Windows 的实际构建/安装结果必须另外记录。

## 当前工程能力

- React/TypeScript 界面通过受限 `runtime_info` 命令读取 Rust 运行信息。
- Rust 独立线程管理 SQLite，在平台应用数据目录创建 `lifestory.db` 并执行初始事务迁移。
- 验证内置 SQLite 的 FTS5 trigram，显示引擎版本、schema 和资料目录。
- Tiptap 编辑器可检查中文输入、换行与撤销。此处是明确标注的编辑器检查内容，不保存、不写入日记库。
- Codex 检查脚本只执行 App Server 初始化握手，不创建线程/任务、不读取私有凭据、不调用模型。

未完成：日记 schema 和编辑保存、图片附件、AI 产品适配器、备份/恢复与正式发行。这些按功能规格继续开发，不能以环境检查页替代。

## 常用命令

| 命令 | 用途 |
|---|---|
| `npm run desktop:dev` | 同时启动 Vite 与 Tauri 桌面窗口 |
| `npm run dev` | 仅浏览器前端预览；明确提示无法检查 Rust，不伪造后端 |
| `npm run build` | 前端类型检查与生产资源构建 |
| `npm run check` | 类型与 Rust 格式检查，不运行完整测试 |
| `npm run test:rust` | 本地资料库初始化/重开/高版本拒绝的针对性集成测试 |
| `npm run check:rust` | Rust Clippy，相关 Rust 改动后按需执行 |
| `npm run test:ui` | Vitest；当前未添加低风险环境展示的前端用例，不把无用例视为测试通过 |
| `npm run codex:check` | 仅初始化握手；可用 `LIFESTORY_CODEX_PATH` 指定已安装可执行文件 |
| `npm run desktop:build` | 本平台构建与打包；正式签名、公证与安装验收另行配置 |

纯样式、文案修改不运行上述所有命令。按 [测试边界](../process/TESTING_POLICY.md) 选择相关检查。

## 目录职责

### Tailwind 与 shadcn

Tailwind 4 使用 @tailwindcss/vite 插件，不建立 v3 的 tailwind.config 文件。全局 CSS 与主题入口是 src/app/app.css；components.json 固定 Radix/nova、CSS 入口和 @ 别名。组件源码在 src/components/ui，当前有 Button、Badge；src/lib/utils.ts 暴露 cn 工具。

需要新组件时用官方 CLI 按需加入，例如 `npx shadcn@latest add @shadcn/input`，先检查组件目录及文档，不安装全套。控件视觉由语义变量和内置 variant 决定，Tiptap 内部样式集中在 CSS components layer。

shadcn CLI 和 CSS 构建包是开发依赖；生成的 React 控件与所需 Radix/CVA/cn 包参与应用构建。当前不加载外部字体或 CDN。正式视觉方案与额外控件随功能设计确定。

```text
src/app/                         应用入口及环境检查界面
src/features/environment/        编辑器联通检查
src/shared/runtime.ts            已实现 Rust 命令的 TypeScript 契约
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

资料根目录由 Tauri 平台 API 获取，开发窗口显示实际位置。不要把真实日记当测试资料，不提交数据库、图片或密钥。删除项目源码不会删除应用资料目录。

当前只允许本地主窗口调用环境命令，没有任意 SQL、Shell、文件读写或打开外链的前端权限。生产 CSP 不允许远程脚本/外部服务访问；未来模型网络请求在 Rust 侧实现。

默认图标仍是官方脚手架图标，产品图标在视觉设计阶段处理。未确定最低系统版本与 CPU 支持矩阵，当前本机验证不等于承诺所有 macOS/Windows 版本支持。

## 本轮验证记录

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

本机调试包位于 `src-tauri/target/debug/bundle/macos/LifeStory Studio.app`，使用打包的静态资源，可独立于 Vite 开发服务器打开。该目录是可重新生成的构建产物，不提交到 Git。
