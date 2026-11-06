# 前端模块与职责

关联 DEC-19 / TASK-11。此页用于定位代码和理解边界；页面地址与导航保护见 [前端导航](FRONTEND_NAVIGATION.md)，数据和原生协议见 [数据与 AI](DATA_AND_AI.md)，当前验证范围见 [版本验收](../VERIFICATION.md)。

## 目录与依赖

| 位置 | 职责 |
|---|---|
| `src/app/` | 仅 `App.tsx`、`AppProviders.tsx` 和应用装配测试；组合路由、Provider 和根布局，不承载业务实现。 |
| `src/router/` | 路由表、路径构造、历史按钮、导航拦截及路由错误。 |
| `src/layouts/` | 工作区、标题栏、主导航、设置/模型布局、页面操作和辅助聊天容器。 |
| `src/contexts/`、`src/hooks/` | 窗口共享状态、离开保护、外观、桌面生命周期和聊天面板宽度。 |
| `src/services/` | 按领域划分的 Tauri 命令、事件与协议类型；生产代码只在此层导入原生 SDK。 |
| `src/features/library/`、`chat/`、`settings/`、`search/` | 日记、聊天、设置、搜索的业务会话、页面及交互。 |
| `src/components/`、`src/components/ui/` | 跨功能共享组件及 shadcn 源码组件。 |
| `src/lib/`、`src/styles/` | 无业务依赖的工具、基础样式与主题变量；业务样式留在所属功能。 |
| `src-tauri/src/`、`src-tauri/migrations/` | 原生命令、SQLite 存储与迁移、图片和 AI 适配。 |

服务层不依赖 features、contexts 或 app；业务与共享层不反向依赖 app。必要的跨服务纯类型引用不等同运行时循环。禁止保留旧路径的聚合转发以规避边界；具体规则与自动检查见 [前端质量检查](../process/FRONTEND_QUALITY.md)。用户未批准先前提出的全项目顶层目录迁移，不能把候选目录当作已确定目标。

## 会话与页面

- `AppProviders` 在窗口级装配 Provider。Router 管理页面身份，页面卸载不清空聊天、设置草稿及待发送队列。
- `DiaryDetailLayout` 装配按记录键控的 `DiarySessionProvider`；`useDiaryEditing` 管理编辑事务、版本、图片及聊天采用协调，`useDiaryLeaveProtection` 连接保存/离开/原生保存。编辑和历史页面共享会话，历史往返保留编辑器及撤销栈；恢复成功后使用新会话。
- `ChatSessionProvider` 持有唯一窗口级聊天会话，全页、侧边聊天与预览共享。`useChatSession` 负责会话与动作组合；`useChatQueue` 管理待发送状态与请求身份；`useChatPreview` 管理预览及采用；`useChatTask` 管理读取和轮询。页面只消费视图数据及命名动作，不直接修改内部 Map/ref/setter。
- 聊天通过稳定 Context 订阅入口分区提供 navigation、shell、messages、composer、queue、materials、preview 快照；变更只通知相关视图。返回聊天先核对权威任务状态，再决定是否投递队列；隐藏、预览、暂停、编辑、失败或结果未保存时不自动投递。
- `SettingsSessionProvider` 保留 API/CLI 配置草稿；`ModelProfilesContext` 管理模型配置及读取错误。页面切换不自动保存或丢弃草稿。

## 保护与原生交互

`LeaveProtectionContext` 通过独立句柄协调业务忙碌、草稿及退出检查；内部登记表不对外暴露。路由阻塞与原生退出共享准备流程。日记负责等待输入、保存及编辑会话结束；历史恢复结果未知、图片写入结果未知或采用后重读失败时保留保护，不能继续用旧状态覆盖。迟到的订阅、读取和写入结果不得重新激活已卸载句柄或覆盖新会话。

`services/desktop.ts` 提供原生环境、主题和退出适配；其他服务按 records、attachments、history、trash、search、tags、modelProfiles、cli、chats、aiTasks、diaryPreviews 划分。事件以具名方法暴露，不开放任意命令或事件名。日记和聊天通过共享删除确认与附件展示协作；Tiptap 编辑节点及文档操作留在日记功能内。

## 聊天读取与渲染

`ChatMessageList` 装配虚拟行，`ChatMessageRow` 展示消息，`useHistoryPaging` 管理前后读取、回最新和重试，`useChatScroll` 负责测量、锚点、搜索与焦点。程序化滚动通过统一 `scrollToFn` 标记并在对应事件中消费，行间距由虚拟列表 gap 管理；不以全局输入事件猜测用户滚动。显示窗口不截断模型上下文；协议及并发边界见 [数据与 AI](DATA_AND_AI.md)。

## 检查与边界

前端遵循 [架构与格式检查](../process/FRONTEND_QUALITY.md)及 [Hook 依赖约定](../process/HOOK_DEPENDENCIES.md)。`src/components/ui/` 不编写或运行组件测试。启动加载策略保留当前同步装配；当年的路由懒加载测量未证明启动中位数改善，原始样本已按用户要求删除，不把该结论当作未来环境的性能保证。
