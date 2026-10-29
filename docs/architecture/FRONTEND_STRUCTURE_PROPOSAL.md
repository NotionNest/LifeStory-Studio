# 前端模块结构调研与调整提案

> DEC-19 已确认当前局部重构：保留 src/app，仅 App.tsx / AppProviders.tsx / App.test.tsx，移出具体实现。已确认范围见 [APP_STRUCTURE.md](APP_STRUCTURE.md)；下文全项目候选目录没有获准整体实施。

> 最新审阅约束：用户不接受 app/features 作为顶层划分，也不接受后续提出的 bootstrap、modules、pages/page、navigation。下文目录树为历史候选，不能作为获准实施的目标。2026-10-27 再次联网核实：React 没有统一强制目录规范；React Router Framework Mode 与 Next.js 的目录属于框架约定，不适用于直接宣称当前 Vite/Tauri Data Mode 项目必须遵循。

2026-10-27；关联 REQ-12、TASK-09 / DEC-17。状态：已完成源码审查与资料调研，待用户审阅；本提案不是已确认决策，不授权直接搬迁代码。当前已确认的路由与会话行为继续有效。

## 1. 当前结构的依据与不足

当前源码是 React + Vite + Tauri 技术组合下，按业务功能逐步扩展形成的 app / features / components 结构。未发现项目文档声明完整采用 Bulletproof React、FSD 或其他模块规范，不能把目录相似当作遵循了该规范。shadcn 的 components.json 只定义组件生成目录和别名，不定义产品业务架构。

此前路由重构处理了页面身份、前进后退、页面卸载和会话保留，但没有同步建立完整的模块依赖限制，因此不能称为模块架构治理完成。

源码证据：

- features/library/AiSettings.tsx 属于模型配置，不是日记资料库。
- features/library/aiApi.ts 同时包含服务配置、模型目录、聊天、任务、预览；chat、settings、search 都依赖它。
- features/library/api.ts 混合记录、附件、搜索、历史、回收站，以及日期/错误等通用工具。
- features/chat/ChatWorkspace.tsx 同时包含 useChatSession、Provider、聊天布局、消息页、日记预览和辅助聊天出口；244 行约 44 KB，不能以行数判断它很小，大量逻辑压在单行。
- ChatWorkspace 导入 app/StudioContext、app/navigation，StudioShell 又导入 ChatWorkspace；存在双向模块依赖，需治理，不能只改路径。
- DiaryDetailLayout 导入聊天内部的 useDiaryChatAddress；删除确认框由 TrashPanel 导出并被聊天直接使用，组件归属与功能边界混杂。
- SettingsPages.tsx 混合页面、布局、导航、回收站业务；页面组合层没有稳定位置。
- components、shared、lib 的职责没有完整约定；未建立自动化依赖边界检查。
- LIBRARY_WORKSPACE 等旧命名测试仍在使用路由适配器，需要跟随实际用户行为重新归属，不删除有效断言。

## 2. 调研依据与取舍

1. [React 官方 Thinking in React](https://react.dev/learn/thinking-in-react)：指导组件层级与状态归属，不是本项目目录的完整规范。
2. [React 官方自定义 Hook 指南](https://react.dev/learn/reusing-logic-with-custom-hooks)：Hook 共享逻辑，不自动共享状态；拆文件后仍须保留唯一会话所有者，不能在多个页面重复创建 Hook 来“共享”草稿。已通过 Context7 CLI library → docs 获取。
3. [Bulletproof React 项目结构](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)及其 [React/Vite 示例](https://github.com/alan2207/bulletproof-react/tree/master/apps/react-vite/src)：按功能聚合；app 组合功能；功能内部保留 API、组件、Hook；共享 API 可独立放置；限制跨功能导入；不要求为每个功能创建全部子目录。它是可审查的参考实现，不是 React 官方标准，也不意味着所有线上项目都应照搬。
4. [FSD 分层规范](https://feature-sliced.design/docs/reference/layers)与[公共接口规范](https://feature-sliced.design/docs/reference/public-api)：明确依赖方向和模块暴露面；同层切片隔离，不让模块任意穿透内部。本文借鉴其规则，但不声明采用完整 FSD，也不照搬其全部目录层。

建议：采用基于功能的模块组织，以 Bulletproof React 为主要参照；按本项目跨日记、聊天、设置的实际需求独立出共享 IPC API。应用组合层管理路由和跨域流程。保留既有 React Router、Context、Tauri 和 shadcn，不为目录调整引入新状态库、服务端框架或运行时容器。

## 3. 建议目标结构

下列为现有职责的目标归属；不创建没有实现内容的空目录。

```text
src/
  app/
    App.tsx
    router.tsx
    routes/                     # 路由入口、loader、页面业务编排
      diaries/                  # 首页、详情布局、编辑/历史入口
      chats/                    # 聊天布局、消息、预览入口
      settings/                 # 设置布局、CLI/API/外观/回收站入口
    layouts/                    # StudioShell、标题栏、主导航
    providers/                  # 全局与功能会话组合、资源初始化
    navigation/                 # Router 阻塞、历史、退出协调的实现
    styles/                     # 主题、基础样式、应用壳布局
  features/
    diary/
      components/               # 浏览、编辑、历史、标签、恢复 UI
      model/                    # 编辑/浏览会话、保存与图片同步
      editor/                   # Tiptap 扩展、图片节点、文档转换
    chat/
      components/               # 消息、输入、队列、来源选择、预览 UI
      model/                    # 聊天会话、顺序调度、任务核对、预览编辑
    settings/
      components/               # 外观、API 配置、CLI 配置
      model/                    # 设置草稿、服务资源和目录请求状态
    trash/
      components/               # 两类回收站内容
      model/                    # 回收站查询/恢复/删除交互
    search/
      components/               # Command、结果展示
      model/                    # 搜索与定位状态
  api/                          # 共享的类型化 IPC 客户端，按业务协议拆分
    records.ts
    attachments.ts
    history.ts
    chats.ts
    ai-tasks.ts
    model-profiles.ts
    trash.ts
    search.ts
  components/
    ui/                         # 保留 shadcn 配置及“完全不测试”约定
    date-filter/                # 通用日期条件组件
    attachments/                # 跨日记/聊天复用的附件呈现
    SearchHighlight.tsx
  shared/
    navigation/                 # 导航注册协议、消费 Hook、路径工具
                                # 不含 Router 实现或具体业务写入
  lib/
    desktop/                    # invoke/event、运行环境与桌面能力边界
    dates/                      # 日期纯函数
    errors/                     # 错误到用户消息的转换
    utils.ts                    # 保留 shadcn cn 入口
  assets/
  testing/                      # 合成夹具、桌面 mock、统一渲染辅助
  main.tsx
```

测试就近放在对应模块；应用级导航集成放 app/navigation。shared/navigation 仅在确实存在跨功能协议时建立，其他共享能力按明确用途放 components/lib/api，禁止继续新增泛化 shared/utils。

## 4. 必须落地的依赖规则

允许的主要导入方向（箭头表示左侧可以导入右侧）：

```text
app → features → api → lib
app / features → components / shared
components / shared → lib
```

- features 不导入 app，不相互导入其他 feature 的内部文件；跨域组合位于 app/routes 或 app/providers。
- app/navigation 实现导航协调器；features 依赖 shared/navigation 的登记协议，由应用层注入实现。保存规则仍由日记会话负责，不能转移为全局 UI 的业务规则。
- 聊天不导入日记编辑器或回收站面板。需要保存后采用日记、删除确认或打开日记时，通过应用组合层传入明确的操作；可共享的记录类型/IPC 来自 api。
- api 只处理类型化命令及结果，不调用 React Hook、操纵页面或导入 features/app。类型放在对应协议文件，出现实际复用后再拆 types 文件，不建立总 types 仓库。
- shared/lib/components 不导入 features/app。共享组件不能自行执行删除记录、采用预览、导航保护等业务流程。
- 不使用 export * 建立总出口。使用明确文件导入与允许路径规则限定公共入口，不为每个目录机械增加 index.ts。
- 以 ESLint 的限制导入规则和循环依赖检查固化规则，先列清合法依赖再开启失败门槛；当前仓库未安装 ESLint，本轮不安装。实施时需明确开发依赖、脚本和 CI 更新，不只写一句“遵守规范”。

## 5. 页面、会话与视图的拆分

拆分依据是职责和变化原因，不是文件行数。

- app/routes：读取路由身份、接 loader 数据、组合页面、连接跨模块操作、登记页面级离开保护。
- features/*/model：拥有真正业务会话和可复用状态逻辑。聊天会话仍窗口级保留；日记编辑会话仍在同一记录编辑/历史之间保留；配置草稿仍窗口内保留。
- features/*/components：展示和调用明确事件，不重新创建全局会话。
- 队列状态和异步任务属于聊天会话；只是把展示组件移走，不应改变后台任务核对、暂停、取消或请求幂等。
- 新建聊天访问和 loader 均不能顺便写入、发送或创建记录；页面路由仍是身份的唯一来源。
- 对 ChatWorkspace、RecordEditor、LocalCliSettings、AiSettings 分别整理会话所有者、请求控制、视图与 UI 组件；同一状态不能在不同文件出现多份。
- 统一可读格式，拆开压缩的多语句与长 JSX。格式整理与行为变更分开审查，不能借机重写协议、存储或用户流程。

## 6. 现有文件迁移示例

| 当前位置 | 目标归属与处理 |
|---|---|
| library/AiSettings.tsx | settings/components/ApiSettings + settings/model/ApiSettingsSession |
| library/aiApi.ts | api/model-profiles、chats、ai-tasks；预览与采用按协议归属 |
| library/api.ts | api/records、attachments、history、trash、search；日期/错误移 lib |
| library/DiaryDetailLayout.tsx | app/routes/diaries 组合；编辑会话拆 diary/model |
| chat/ChatWorkspace.tsx | app/routes/chats + chat/model + chat/components；辅助聊天在 app 组合 |
| settings/SettingsPages.tsx | app/routes/settings；外观及配置表单留 settings |
| library/TrashPanel.tsx | trash/components；跨域删除确认由 app 组合，不让其他功能导入面板内部 |
| app/StudioShell.tsx | app/layouts + app/providers；退出订阅留应用层 |
| shared/runtime.ts | lib/desktop/runtime.ts |
| shared/SearchHighlight.tsx | components/SearchHighlight.tsx |
| test/*RouteHarness.tsx | testing；审查旧测试归属与适配器，保留有效行为验证 |

## 7. 完整迁移与验收范围

1. 先冻结当前行为基线，列出导入图、跨域操作和公开接口；记录需求/任务。不得把提案直接记为用户确认。
2. 建立 api 和桌面/日期/错误边界，同步类型、调用方与 mock；不改 Rust 命令、数据库和密钥方案。
3. 按 diary、chat、settings、trash、search 完成内部职责拆分及应用层组合，清除 features → app 和 feature 内部互相导入。
4. 将页面入口、布局和 Provider 收回 app；保留业务会话的原生命周期与错误边界位置，不因文件移动重建编辑器或丢草稿。
5. 更新别名、components.json 中受影响的真实路径、样式入口、测试夹具、文档、脚本和 CI；移除旧入口，不留下两套实现。
6. 运行类型/构建、依赖边界与循环检查、受影响交互集成；该跨模块重构完成节点运行前端现有业务套件。components/ui 仍完全不测试；没有 Rust 协议改变则不机械重复 Rust 全套。
7. 交付可供用户实机验证的包，验证日记保存/历史恢复、前进后退、聊天/预览/配置草稿、队列取消与退出保护。输入未变的模型协议不要求真实付费调用。未验收范围明确记录。

完成条件：旧误归属路径清零、边界检查能拒绝非法依赖、模块内部实现不被其他功能穿透、状态生命周期保持、现有用户行为与错误保护无退化、文档和调用方一致。单纯目录搬迁不能算完成。

## 8. 本轮证据与限制

本轮读取当前源码目录、路由/应用壳/上下文、IPC 入口及关键功能导入，核对组件和会话导出；通过 Context7 在沙箱外获取 React 文档，并读取上述一手资料。没有修改运行代码、安装依赖或迁移目录，没有运行构建/测试或操作应用。源码审查不是完整行为审计，尚未对全部 TS 模块生成机器依赖图，也未运行参考项目。


## 补充联网核实：标准与实际项目

- [React 官方归档 FAQ](https://legacy.reactjs.org/docs/faq-structure.html)明确 React 不规定目录组织，介绍按功能/路由以及按文件类型组织。此页已归档，不将其冒充新版完整工程规范。当前 react.dev 的组件导入指南同样说明根组件文件取决于具体配置：[Importing and Exporting Components](https://react.dev/learn/importing-and-exporting-components)。
- [React Router Data Mode 路由](https://reactrouter.com/start/data/routing)通过对象配置路径和组件；[Framework Mode 路由](https://reactrouter.com/start/framework/routing)才具有 app/routes.ts 等框架约定。不能混用两种模式的目录要求。
- [Next.js 项目结构](https://nextjs.org/docs/pages/getting-started/project-structure)中的 app/pages 是 Next.js 的框架目录，不是所有 React 项目的标准。
- [Chatbox renderer 源码](https://github.com/chatboxai/chatbox/tree/main/src/renderer)实际包含 components、hooks、routes、stores、types、utils、platform 等，也同时包含 app/pages 等其他目录。仅借鉴与本项目匹配的部分，不能声称它完整符合用户排除项。[路由目录](https://github.com/chatboxai/chatbox/tree/main/src/renderer/routes)包含 session、settings 等实际业务入口。未运行或完整审计该项目，不因此迁移其路由技术与状态库。
- [Excalidraw 应用源码](https://github.com/excalidraw/excalidraw/tree/master/excalidraw-app)实际按 components、data、collab、share 等职责组织，入口包含 App.tsx；这是另一种生产项目实践，进一步说明不存在唯一顶层命名。

本轮为资料核实，继续不迁移代码。需要选择并固定适合本产品的工程约定，而不能把个人目录建议称为 React 官方标准。
