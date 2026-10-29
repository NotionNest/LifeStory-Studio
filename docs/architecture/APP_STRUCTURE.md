# 应用入口与职责归属

2026-10-27，DEC-19 / TASK-11，关联 REQ-12。用户确认保留 `src/app/`，仅承担应用入口与依赖装配；本次不迁移整个业务目录，也不采用此前未认可的全项目目录提案。

## app 保留内容

```text
src/app/
  App.tsx
  AppProviders.tsx
  App.test.tsx
```

- App.tsx：接入 RouterProvider、样式入口、Provider 与根布局的组合；导出组装后的路由工厂供集成验证，生产路由在需要时只创建一次。
- AppProviders.tsx：明确各 Provider 的顺序与窗口级生命周期，不直接请求模型配置、保存日记、订阅桌面事件或实现布局。
- App.test.tsx：验证装配后的应用行为，如聊天/配置草稿、设置分类与导航，不承担 shadcn 组件内部测试。

## 实现归属

| 目录/文件 | 职责 |
|---|---|
| router/router.tsx | 独立路径、嵌套路由、loader、错误边界、路由创建；根组件由 app 注入，router 不导入 app |
| router/paths.ts | 路径生成、参数解析、辅助聊天地址 |
| router/useHistoryControls.ts | 已提交历史条目的按钮边界、前进后退与快捷键 |
| router/useRouteBlocker.ts | 拦截 Router 跳转，调用离开准备，继续或取消；不实现日记保存 |
| router/RouteError.tsx | 路由错误展示 |
| layouts/StudioLayout.tsx | 组合标题栏、主导航、错误提示、路由出口和辅助聊天布局 |
| layouts/StudioTitlebar.tsx | 标题栏、历史按钮、侧栏按钮、页面操作插槽 |
| layouts/StudioRail.tsx | 主导航和上次聊天地址记忆 |
| layouts/PageActions.tsx | 页面操作插槽的菜单与按钮 |
| layouts/DiaryChatDock.tsx | 辅助聊天与宽度调整布局 |
| layouts/SettingsLayout.tsx | 设置外壳、分类与返回目标记忆 |
| layouts/ModelsLayout.tsx | 模型分类布局与子路由出口 |
| components/SettingsLink.tsx | 设置布局与回收站共用的路由链接样式 |
| components/dialogs/DeleteRecordDialog.tsx | 记录/聊天共用的移入回收站确认、影响刷新与结果核对 |
| components/attachments/AttachmentImage.tsx | 共用附件上下文、图片读取、原图查看/翻页/复制 |
| features/settings/AiSettings.tsx | API 配置表单及窗口级 ApiSettingsSession |
| features/settings/TrashPanel.tsx | 回收站列表、恢复与彻底删除交互 |
| features/settings/SettingsPages.tsx | 外观与回收站业务页面入口 |
| lib/recordLabels.ts | 记录类型的共享展示名称 |
| contexts/AppearanceContext.tsx | 外观共享状态；具体主题逻辑复用 useAppearance |
| contexts/ModelProfilesContext.tsx | 模型配置、默认项、加载状态、读取错误、刷新与迟到响应保护 |
| contexts/WorkspaceContext.tsx | 侧栏、标题栏操作 DOM 插槽及受控修改方法 |
| contexts/LeaveProtectionContext.tsx | 独立保护登记、业务忙/草稿状态、退出检查及未保存内容确认的协调 |
| hooks/useAppearance.ts | 外观偏好、系统主题监听及应用主题；桌面操作通过 services 调用 |
| hooks/useChatDockWidth.ts | 辅助面板宽度、拖拽/键盘、偏好持久化 |
| hooks/useDesktopLifecycle.ts | 运行环境与退出事件生命周期；暴露平台状态及错误 |
| services/desktop.ts | RuntimeInfo 契约、原生可用性、运行信息读取、主题、退出事件与原生退出调用 |
| services/records.ts | 记录、编辑会话、自动保存、恢复草稿与导出协议及类型；具名新建/保存事件适配 |
| services/attachments.ts | 日记图片导入封包、图片读取/复制与附件协议类型 |
| services/history.ts | 历史分页、版本读取、标记与恢复协议及类型 |
| services/trash.ts | 删除影响核对、回收站、恢复与彻底删除协议及类型 |
| services/search.ts | 日记查询/月历/内容预览及聊天搜索协议及类型 |
| services/tags.ts | 标签创建与使用情况协议及类型 |
| services/modelProfiles.ts | 模型配置、偏好、目录及连接测试/取消协议及类型 |
| services/cli.ts | 本机 CLI 扫描、探测、模型目录与连接测试协议及类型 |
| services/chats.ts | 独立聊天列表、会话、发送与聊天图片协议及类型 |
| services/aiTasks.ts | AI 任务读取、启动、取消、保存重试与来源比较协议及类型 |
| services/diaryPreviews.ts | 日记预览生成、读取、采用与撤销采用协议及类型 |
| features/settings/providerPresets.ts | 设置表单的服务预设，不承担 IPC |
| lib/localDate.ts | 本地日期格式化纯工具 |
| components/dialogs/LeaveConfirmDialogs.tsx | 未保存确认与草稿退出确认的展示 |
| features/library/DiaryActions.tsx | 当前日记“先保存再执行操作”的业务登记，由聊天采用流程消费 |
| features/settings/SettingsSessionProvider.tsx | 配置表单会话及忙/草稿保护的连接，保持窗口级草稿 |
| features/search/SearchLocationContext.tsx | 搜索词定位上下文，仅窗口内存中保留 |
| features/search/WorkspaceCommand.tsx | 搜索结果与快捷命令的业务执行 |
| lib/errors.ts | 不依赖业务模块的错误消息转换 |

2026-10-28 F-02（用户授权，REQ-12 / TASK-11）：共享 IPC 与协议类型从 features/library/api.ts、aiApi.ts 按上表职责迁入 services，消费者直接导入所属服务，无旧入口或聚合转发层。services 不依赖 features、contexts 或 app；同域协议类型随接口保存，跨服务仅使用必要类型导入。记录与附件的响应类型存在双向 type-only 引用，不产生运行时循环。ImportReport 是编辑器展示状态，随 RecordEditor 定义，不放入协议层。localDate 回归 lib，服务预设归 settings。命令、参数、幂等/版本检查、二进制封包与密钥方案保持原契约。

其他业务文件保持原目录；聊天职责拆分见 F-03，设置与共享组件归属见 F-04，桌面边界见 F-05。

## 聊天会话与视图（F-03，2026-10-28）

用户授权处理 F-03，关联 REQ-11/12/13、TASK-09 / TASK-11。AppProviders 直接装配 ChatSessionProvider；窗口内只调用一次 useChatSession/useChatState。完整聊天、侧栏聊天与预览页面只消费同一会话，页面卸载不创建第二份队列、草稿或预览缓存。

| 模块 | 职责 |
|---|---|
| features/chat/ChatSessionProvider.tsx | 单一窗口级会话装配；Context 只传稳定订阅入口，按 navigation/shell/messages/composer/queue/materials/preview 提供独立快照订阅 |
| features/chat/useChatState.ts | 主会话私有的导航/输入/列表状态与输入草稿；仅 useChatSession 消费，不导出共享状态类型 |
| features/chat/useChatSession.ts | 路由切换、聊天读取、草稿存取、同步操作保护及业务动作组合；对视图投影必要状态与动作 |
| features/chat/useChatTask.ts | 任务轮询与当前聊天的权威读取；保留迟到结果隔离 |
| features/chat/useChatQueue.ts | 独占队列与发送请求标识，负责发送/暂停/同请求重试/编辑；以发送已受理事件交回主会话 |
| features/chat/useChatPreview.ts | 独占预览编辑状态、核对标识、缓存、生成/采用请求与 epoch；通过生命周期动作和视图数据协作 |
| features/chat/chatTypes.ts | 消息定位/待发送项/预览模式等值类型；协议继续归 services，已移除宽泛 ChatRuntime |
| features/chat/ChatWorkspace.tsx | 聊天外壳、列表、标题栏操作、重命名/目标选择/删除交互装配；ChatSurface 组合侧栏聊天页面 |
| features/chat/ChatMessagesPage.tsx | 组合消息与输入区域 |
| features/chat/ChatMessageList.tsx | 消息、任务反馈、搜索定位与滚动 |
| features/chat/ChatComposer.tsx | 输入、模型选择、附件和来源展示 |
| features/chat/ChatQueue.tsx、ChatMaterialPicker.tsx | 待发送消息与日记选择器展示 |
| features/chat/ChatDiaryPreviewPage.tsx | 日记预览编辑与采用操作展示 |

会话模块不导入聊天视图。视图不直接操作请求 ref、队列 setter 或草稿/预览 Map，也不直接发送业务 IPC；DOM 焦点/文件选择 ref 与视图自己的搜索定位标记仍可留在展示层。页面通过发送、编辑队列、关闭预览、采用、撤销等动作调用会话。上下文不暴露私有的预览缓存核对方法。

返回聊天必须先读取权威状态，再允许队列投递。就绪标识使用 readyChatId 状态驱动调度；只写 ref 不足以保证已在隐藏期间完成的任务能在返回后唤醒队列。隐藏、预览、失败/停止、结果待保存及编辑队列期间继续阻止自动投递。日记采用仍经 DiaryActions 先保存再操作，异步入口继续同步启用离开保护；不改变 Rust 协议、数据库或窗口内草稿的持久化边界。

本轮没有新增按路由懒加载或承诺启动性能收益；实际行为验证与限制见 STATUS.md。

## 设置、删除与附件组件归属（F-04，2026-10-28）

用户授权处理 F-04，关联 REQ-11/12/14、TASK-09 / TASK-11。API 设置表单、ApiSettingsSession 与既有测试从 library 迁入 settings；SettingsSessionProvider 继续在窗口级装配 API/CLI 会话，页面卸载不清空配置草稿。SettingsLayout/ModelsLayout 迁至独立 layouts，外观与回收站业务页面仍归 settings。分类选中、胶囊样式、返回地址与子分类记忆保持原行为。

TrashPanel 及列表/恢复/彻底删除测试归 settings；DeleteRecordDialog 独立到 components/dialogs，原有影响变更与结果未知的两项回归一并迁入。日记和聊天直接消费该确认流程，不通过面板文件导入。kindLabels 从 LibraryBrowser 提取到 lib/recordLabels，避免共享确认组件反向依赖日记列表。

AttachmentImage、ImageViewer、AttachmentContext/AttachmentSurface 整体归 components/attachments；聊天、日记编辑、历史及只读预览共用展示与图片读取/复制。Tiptap 的 attachmentExtensions 图片节点、删除节点及编辑器文档操作仍留 library，不能让共享展示依赖编辑器。保留图片所属记录/历史版本、迟到结果隔离、Blob URL 释放和原图翻页行为。

本轮仅迁移归属与消费路径，不保留旧文件或转发入口，不改变 IPC、删除/引用校验、API Key 方案、窗口会话或任何 JSX/样式行为；实际验证见 STATUS.md。

## 桌面适配边界（F-05，2026-10-28）

用户授权处理 F-05，关联 REQ-01/12、TASK-09 / TASK-11。生产代码仅 services 可导入 @tauri-apps SDK。RuntimeInfo、desktopAvailable 和 runtime_info 读取直接归 services/desktop，不再经过 shared/runtime 或额外转发入口；所有消费者与测试装配同步迁移。纯浏览器场景仍按 desktopAvailable 决定是否读取原生信息或登记原生事件。

事件按业务语义归属：desktop.onExitRequested 对应 exit-requested；records 中 recordEvents.onNewRequested/onSaveRequested 分别对应 new-record-requested/save-requested。只暴露具名订阅方法，不开放任意事件名或任意命令调用接口。F-02 的领域 IPC 继续归对应 services，Rust 命令/事件、参数、权限和返回类型保持原契约。

useDesktopLifecycle、DiaryCreation 与 useDiaryLeaveProtection 继续拥有订阅生命周期；注册 Promise 迟到也由已建立的清理链释放一次。注册失败正常显示已有错误，卸载后不再写入错误；清理链处理拒绝，避免重复释放和未处理拒绝。卸载后的回调不触发新建、保存或退出；保存请求在历史页继续忽略，新建仍使用最新 action 与原幂等/同步保护流程。

自动验证覆盖原生新建/退出既有链路、保存事件的编辑/历史区别，以及卸载后订阅迟到成功/失败和陈旧事件隔离。测试可在原生 SDK 边界替代事件，不代表真实 WebView/操作系统已验收；实际结果见 STATUS.md。

## 持续架构与可读性检查（F-06，2026-10-28）

用户授权将此前一次性的依赖核对固化为本地命令与 CI common 门禁。scripts/check-architecture.mjs 使用当前 TypeScript 解析配置，检查本地模块解析、值依赖循环、反向 app/共享基础层依赖以及 services 外的原生 SDK 使用；支持重导出、字面量动态导入与纯类型关系。合成工程回归与真实 CLI 退出码验证同属 common 检查。

自维护前端按固定 Prettier 版本建立统一格式基线；配置、范围、例外及合法协作边界见 [前端架构与格式检查](../process/FRONTEND_QUALITY.md)。已有保存、草稿、队列与订阅生命周期不因格式化改变。静态规则与格式检查已接入工作流配置，远程运行与实机结果仍分别记录于 STATUS.md；F-07 遗留清理见下节。

## 遗留入口与测试命名（F-07，2026-10-28）

用户授权处理 F-07，关联 REQ-01/02/12/14、TASK-09 / TASK-11。EditorProbe 在入口、路由、测试、脚本和配置中没有消费者，已删除环境诊断组件及空目录；底层 Tiptap 业务编辑和 runtime_info 桌面适配继续保留。环境文档区分当前入口与初始环境验证记录。

SearchHighlight 迁入 components，聊天、全局搜索及日记列表共用；日记列表同逻辑的局部高亮已移除。runtime 已在 F-05 归 services，src/shared 不再保留旧文件或转发入口。

LibraryWorkspace.test.tsx 更名为 DiaryWorkflow.test.tsx，附件测试也直接使用 DiaryRouteHarness，不再将测试装配伪装成已删除的生产组件。保留测试装配是为了让日记保存/恢复/历史、图片与 DiaryActions 协作在真实 Router、Provider 与离开保护下验证。测试控制只提供实际地址跳转、跳转到首页后执行动作及真实 withSavedDiary；移除 active 属性和页面名回调映射，位置观察直接报告已提交地址。既有断言与场景保留，并将返回聊天、设置及侧栏聊天断言落实到实际地址；完整应用路由装配仍由 Router.integration.test.tsx 验证。

本轮不新增生产功能或组件库测试，实际检查结果见 STATUS.md。

## 离开保护边界

业务通过 registerGuard 登记检查/准备/恢复行为，取得专属释放函数；内部登记表不公开。忙与草稿通过 useLeaveStatus 取得独立句柄，句柄只修改自己的登记，卸载时释放。迟到回调不允许重新激活已卸载的句柄；StrictMode 的清理/重建会恢复仍挂载句柄的状态。

日记的 useDiaryEditing 负责编辑事务、进入历史前的一致性校验和结束编辑会话；useDiaryLeaveProtection 协调保存失败后的重试/另存/继续编辑/主动放弃，实际保存仍由 RecordEditor 的保存控制器执行。协调器提供确认交互，但不知道具体日记如何保存。聊天在采用前使用 DiaryActions 的受控操作，不经离开保护对象读取日记内部引用。

Router 阻塞与原生退出调用同一套准备行为。异步准备读取登记快照，避免过程中组件更新导致重复遍历新登记。历史恢复结果未确认、业务写入忙、创建操作串行化以及 beforeunload 提醒继续保留。

## 状态生命周期

Provider 仍位于匹配页面上方的根路由内，保持 Router 上下文和窗口生命周期。日记编辑会话继续在详情布局中，编辑/历史子页面之间不重建编辑器。聊天/预览/配置输入和排队内容仍按原窗口生命周期保留，不增加磁盘持久化或自动发送。

未知子路由错误边界继续位于持久 Provider 下方，避免错误页面清空草稿。路由 factory 接收应用根组件，测试与生产使用同一张路由表。

## 错误恢复与样式

模型配置读取错误由 ModelProfilesContext 持有，显示“重新读取配置”；导航/保存错误和桌面事件错误单独呈现，不再给所有错误附加配置读取按钮。

样式入口为 styles/globals.css，主题变量在 styles/theme.css；布局规则在 layouts/layout.css，设置规则在 features/settings/settings.css，编辑器与历史正文在 features/library/editor.css，日记浏览滚动规则在 features/library/browser.css。全局入口统一导入，components.json 指向新入口；保持语义主题和原声明，不改组件库。

## 验证边界

复用原业务与路由集成测试，补充独立状态释放、迟到模型响应和配置读取恢复保护。测试路径跟随实现，测试辅助改为分离 Context 的明确装配，不保留 StudioContext/Navigation 的兼容实现。components/ui 继续完全不测试。

测试、构建、静态导入与实机状态以 STATUS.md 为准。本次没有更改 Rust、IPC 命令名称、数据库格式或明文密钥方案；独立 QA 包供用户验收，不自动操作用户应用。

## Effect 触发与闭包约定（2026-10-28）

按 [Hooks 依赖审查](../process/HOOK_DEPENDENCIES.md) 区分数据同步与事件动作。Effect 的同步键必须完整声明；稳定 ref/setter 也显式保留依赖，避免跨模块传递后丢失闭包约束。Effect Event 只用于 Effect 触发的事件及其订阅/异步回调，读取最新已提交值，不用于隐藏需要重新同步的数据。日记初次打开数据属于按 recordId 键控的 DiarySession 实例；loader 重验证不能直接覆盖活跃编辑会话。依赖检查已作为 lint error 纳入现有 CI 门禁。

## 聊天分区订阅（2026-10-28）

ChatSessionProvider 仍只调用一次 useChatSession；草稿、队列、预览缓存、轮询和业务动作继续由原会话持有。Context 只传窗口内固定的订阅入口，useChatView 使用 React 自带 useSyncExternalStore 按分区订阅，不再先订阅整个 session 再取字段。没有增加状态库、持久化或第二个业务会话。

| 分区 | 消费者与同步范围 |
|---|---|
| navigation | ChatSurface、日记侧栏入口；预览开关与日记聊天地址动作 |
| shell | ChatWorkspace；标题、列表、页面操作、重命名/删除/目标日记与工作状态 |
| messages | ChatMessageList；消息、任务流内容、搜索位置与结果保存状态 |
| composer | ChatComposer；输入、模型选择、来源/对比与发送动作；不消费整个 workspace |
| queue | ChatQueue；待发送项、编辑/暂停状态、忙状态和 taskStatus；不消费输入文本或任务流全文 |
| materials | ChatMaterialPicker；资料选择器开关、搜索、结果、选中项与工作状态 |
| preview | ChatDiaryPreviewPage；已核对预览、标题/日期/正文编辑、采用/撤销及待发送数量 |

分区快照按字段 Object.is 比较，未变化时复用同一快照；pending 按队列与聊天 ID memo，避免输入时生成新空数组。纯渲染的来源标题改为 sourceTitles 数据，标题/待发送数量/任务状态直接投影给需要的视图，不依赖稳定动作中的隐藏渲染数据。来源记录/查询标题更新仍通知实际显示它们的视图。

动作入口在窗口内保持稳定，调用时转交最新已提交会话动作，保留参数与返回值；可选动作从无到有/从有到无仍会通知。所有分区在布局提交阶段更新后才通知订阅者，避免跨分区读取半更新快照；挂起或放弃的渲染不会替换已提交动作。订阅自身交由 useSyncExternalStore 释放。该订阅层只是会话的只读投影，不直接调用 IPC 或驱动模型任务。

消息页、消息列表、输入、队列、资料选择器与预览增加 memo 边界，避免父视图变化再次渲染独立订阅的子视图。相关数据变化仍正常更新，例如轮询生成内容、任务完成、来源变更或预览编辑。此实现不对后端重复返回的所有对象做深比较，不宣称消除全部重渲染或获得特定帧率。

验证包含分区通知/稳定动作/最新输入、多分区一致性、StrictMode、未提交渲染，以及真实聊天中连续输入不渲染已有消息、轮询继续显示内容且保留草稿。队列、保存、路由/页面卸载、侧栏聊天与预览行为继续使用既有集成回归。具体结果见 STATUS.md。

依据：[React useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore)。稳定 subscribe、缓存不可变快照以及按需通知遵循该接口约束；不是将 Effect Event 当作普通点击动作使用。

## 日记与聊天内部职责收紧（2026-10-28）

用户授权处理后续 P2 多职责问题，沿用 REQ-11/12/13/14 / TASK-11，不改变顶层目录、页面身份或会话生命周期。

| 日记模块 | 所有权与边界 |
|---|---|
| diaryLoader.ts | 路由参数、读取初始记录/恢复草稿/只读聊天预览、取消信号；不导入 React 页面 |
| DiaryDetailLayout.tsx | 读取 loader 数据、桌面/历史类型约束，以 recordId 为 key 装配会话 |
| useDiaryEditing.ts | 唯一日记编辑事务协调：begin/恢复/串行操作、图片写入与结果核对、聊天采用前保存/采用后重读、删除前核对；编辑器/忙状态/dirty/版本相关引用留在此处 |
| useDiaryLeaveProtection.ts | 以行为契约注册离开检查、未保存选择、DiaryActions 和原生保存；不接收编辑状态 setter 或内部 ref，不直接发起编辑/附件写入 |
| DiarySessionProvider.tsx | 将编辑器 binding 和错误/恢复/核对/删除反馈装配成 UI；不实现 IPC 或保护登记 |
| DiarySessionContext.ts | 仅公开 editor/history 两个页面视图契约；不公开 dirty、busy、failure、editor 引用、setter 或保护登记 |
| DiaryEditorPage.tsx、DiaryHistoryPage.tsx | 各自页面操作、展示及路由跳转；滚动 DOM ref/历史控制句柄按视图用途传入，编辑事务通过命名动作调用 |

RecordEditorSession 仍按 editing.sessionId 键控，跨编辑/历史子路由保留同一实例；初次打开 Promise 与数据快照、失败保留编辑、未知写入核对、图片版本及撤销行为不变。保护策略通过 prepare/discard/resume/export/withSavedDiary 等业务能力协作，原生保存订阅读取最新已提交策略，在历史页继续忽略保存，卸载与迟到注册继续正确释放。

聊天的队列和预览状态已从 useChatState 收回所属 Hook：queue/发送 requestId 只由 useChatQueue 修改，previewCache/epoch/核对/采用标识和可编辑内容只由 useChatPreview 修改。主会话通过 resetRequest/forget、stash/reset/reconcileWorkspace 等动作协调切换、删除和草稿提醒，不能写其私有 Map/ref/setter。

useChatQueue 输入从 36 个共享状态字段/动作收紧为 15 个显式输入/业务能力；跨页面就绪策略在主会话计算 canDispatch，队列保留队首、暂停、编辑、失败及 save_failed 的判断。后端发送受理后通过 onSent(task, queued) 告知主会话，主会话负责地址提升、输入草稿迁移、权威 workspace 和模型选择；队列不依赖路由解析、草稿 Map 或 workspace setter。

useChatPreview 输入从 36 项收紧为 18 项，生成/采用/撤销协议留在模块内；以 showChat/reportError/onDiaryChanged 等能力请求主会话更新导航与反馈。返回值明确区分 view/actions/lifecycle，不公开可变缓存、私有 setter、请求标识或 epoch。跨域待发送检查只在生成动作发生时求值，不在 Hook 初始化期间访问队列。

移除 ChatState 导出类型、基于其 Pick 的大状态袋和 chatRuntime.ts；轮询声明自己的小型契约，不依赖主会话状态布局。唯一窗口级 ChatSessionProvider、分区订阅快照、任务保护、隐藏返回/排队与预览草稿行为继续保留。验证见 STATUS.md。

## 加载边界实测结论（2026-10-28）

已在真实macOS桌面比较静态、细粒度路由lazy、编辑器/历史单组：首屏JS静态依赖可从约1.22 MB降至0.77 MB，但五轮启动中位数未改善，编辑首开增加约几十毫秒。当前生产维持同步装配，不把所有独立页面逐一异步化，也不通过调高警告阈值标记优化完成。

常驻边界为外壳/默认首页/小loader/Root错误边界和窗口业务会话；编辑器/历史可作为一个重型UI加载组。辅助聊天视图和API/CLI设置视图仍受静态模块耦合牵引，需先与常驻会话解耦，再验证独立加载收益；不能卸载会话来减包。细粒度原型虽入口文件变小，却需要31个首屏JS文件，集中组则为1个首屏/2个总文件；后续优先按业务组评估。

测量脚本和原型不属于产品入口；正常构建已恢复。具体方法、原始样本、首开/预取与兼容验证要求见 [桌面启动与加载边界实测](../development/STARTUP_LOADING_MEASUREMENT.md)。


### 2026-10-29 长聊天复审后的视图职责

ChatMessageList 负责装配和虚拟行渲染；ChatMessageRow 展示持久消息及任务中的内容；useHistoryPaging 负责串行分页/回最新与加载/失败重试；useChatScroll 负责动态测量、锚点、搜索与焦点，通过统一 scrollToFn 标记实际程序化偏移，原生 scroll 事件排除该偏移后才触发读页。没有滚轮/键盘/触摸/指针推断或 document 级结束监听。行间距交给虚拟列表 gap，不混入内容测量边界。

会话维护 atLatest 及其直接状态 setter，已提交的 workspace/atLatest 快照供增量合并读取；消息分区直接暴露 loadWindow/setAtLatest，不透出内部可变 pinned ref。useChatTask 的手动等待只保留最新有效请求 ID，代次切换重置，旧请求完成不清除新请求；其余串行轮询和迟到校验不变。原生仅保留 ai_chat_window 有界查询，page 必填，构建清单、默认窗口权限及自动生成的命令权限使用同一命令名。
