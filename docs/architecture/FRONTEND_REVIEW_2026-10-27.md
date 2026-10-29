# 前端目录与架构复审

2026-10-27；关联 REQ-12、TASK-11 / DEC-19。用户要求审查与改进建议，本轮不实施重构。结论：外层职责已基本清楚，主要剩余问题是保护登记的提交边界、业务模块与共享接口归属、聊天内部职责以及持续架构检查。下面的目标归属是建议，不记为用户确认。

## 范围与证据

- 检查当前 src 目录、应用与路由入口、Provider 组合、布局、Context、聊天/设置/日记关键源码、IPC 包装、测试辅助、构建配置及 CI。
- 对 86 个生产 TS/TSX 模块扫描静态本地 import/export：没有未解析路径、静态循环或业务反向导入 app。该检查不覆盖运行时动态依赖，也不是完整逐行安全审计。
- 运行 1 个临时合成复现，得到预期失败：被挂起且最终放弃的渲染仍留下 busy 标记，beforeunload 被阻止。未修改运行实现；临时用例已移出 src，留在 /tmp/lifestory-review-render-protection.repro.tsx，输出 /tmp/lifestory-architecture-review-repro.txt。不是当前保留业务套件的新失败，不据此宣称已经实机复现。
- 未重复执行此前已通过的全套/构建；未操作应用、使用真实资料/模型或检查 Rust 内部安全。

## 已合理的部分

- app 仅保留 App、AppProviders、App.test，入口与装配职责明确。
- layouts 已独立，根布局、标题栏、主导航与辅助聊天分开；没有理由为改名再次迁移这些目录。
- Router 是页面身份来源，子路由错误边界与 Provider 生命周期有明确约定。
- 日记编辑/历史共享会话，聊天和配置草稿窗口级保留，有产品依据；Provider 数量与嵌套本身不作为缺陷。
- 语义主题、布局和业务样式分开，components/ui 保持用户要求的完全不测试边界。

## 发现与建议

### F-01 / P1：保护登记在渲染阶段产生共享副作用

2026-10-28 更新：用户已授权处理 F-01；当前工作区修复及针对性回归已验证，详见 [STATUS](../tracking/STATUS.md)。以下保留原审查发现与复现依据，其他建议未因此获得实施授权。

位置：contexts/LeaveProtectionContext.tsx:52、:62、:152；features/chat/ChatWorkspace.tsx:138；features/settings/SettingsPages.tsx:36。

createStatus 默认 active=true；setBusy/setDraft 立即修改 Provider 内部集合，而部分消费者直接在渲染中调用它们。释放依赖 useLayoutEffect 的清理。但一次渲染如果挂起且从未提交，该 effect 根本没有建立，已写入的标记没有清理机会。

合成复现：组件调用 useLeaveStatus().setBusy(true) 后抛出等待中的 Promise，父级随后移除该挂起组件；页面没有运行中的操作，beforeunload 仍 defaultPrevented=true。可靠性上优先修复；当前产品没有显式 Suspense 页面，因此不能把此合成路径当作已确认的用户实机故障。

建议：区分尚未提交的期望状态与已经激活的登记；只在提交阶段激活，业务异步写入开始前仍须同步设置已激活句柄，卸载后禁止迟到回调重新激活。保留现有独立 owner 清理与 StrictMode 验证，不可简单把所有忙设置延后到 useEffect，否则可能引入写操作开始与保护生效之间的窗口。

### F-02 / P2：共享 IPC 与协议类型仍被放在 library 内

2026-10-28 更新：用户已授权处理 F-02；共享协议和调用方已迁至 services，职责见 [应用结构](APP_STRUCTURE.md)，实际验证见 [STATUS](../tracking/STATUS.md)。以下保留原审查发现。

位置：features/library/aiApi.ts:1、features/library/api.ts:1、contexts/ModelProfilesContext.tsx:2、features/chat/ChatWorkspace.tsx:26。

aiApi 同时容纳模型配置/偏好、CLI 能力、聊天、任务、日记预览；api 同时容纳记录、附件二进制封包、历史、恢复、回收站、搜索、标签和日期工具。配置 Context、聊天和搜索都依赖 library 路径，日记目录事实上承担了共享服务层。

建议：利用已有 services，按真实协议拆分 records/chats/modelProfiles/aiTasks/attachments/history/trash/search；可复用协议类型与接口同域放置，不再把共享协议挂在日记模块。localDate 等纯工具回归 lib。此调整不改变 Rust IPC 名称、幂等参数、版本校验或密钥方案，也不要求增加一个与 services 重复的 api 顶层目录。

### F-03 / P2：ChatWorkspace 是多职责会话与页面集合

2026-10-28 更新：用户已授权处理 F-03；单一窗口级会话、队列/任务/预览逻辑与视图已拆分，视图改为受控状态/动作接口。职责见 [应用结构](APP_STRUCTURE.md)，实际验证见 [STATUS](../tracking/STATUS.md)。以下保留原审查发现，F-04～F-07 不因此获得实施授权。

位置：features/chat/ChatWorkspace.tsx:35、:195、:197、:225、:248。

249 行约 44 KB；同时拥有聊天会话、草稿缓存、消息队列、任务轮询、模型/来源选择、图片、采用日记、侧栏、消息页和预览页。Context 直接暴露 useChatSession 的完整返回值，页面解构大量 setter/ref，实际页面身份分开了，但模块实现还没有分开。

建议：先保持一个窗口级 ChatSessionProvider，再按现有职责拆会话状态、发送队列、任务核对和预览采用，以及消息/输入/队列/预览视图。通过明确的动作和状态子接口消费，不在拆出的每个 Hook 内各建一份共享状态。聊天对 DiaryActions 的“先保存再执行”依赖是实际业务协作，不应靠复制保存逻辑消除。

router 和 AppProviders 目前都静态导入这个模块；因此即使只把路由改成 lazy，根级 Provider 也会继续带入同文件视图。应先拆会话与视图，再按启动数据决定是否按路由加载，不能直接承诺启动速度提升。

### F-04 / P2：业务文件归属与独立 layouts 约定尚不一致

2026-10-28 更新：用户已授权处理 F-04；设置表单/回收站、设置布局、共享删除确认及附件展示已按职责迁移，旧入口已移除。职责见 [应用结构](APP_STRUCTURE.md)，实际验证见 [STATUS](../tracking/STATUS.md)。以下保留原审查发现，F-05～F-07 尚未实施。

位置：features/library/AiSettings.tsx:1；features/settings/SettingsSessionProvider.tsx:6；features/settings/SettingsPages.tsx:16、:29、:33；features/library/TrashPanel.tsx:7。

API 设置放在 library，而 CLI 设置放 settings；SettingsPages 同时包含 SettingsLayout、ModelsLayout、外观入口和回收站入口。聊天与日记又从 TrashPanel 文件中导入 DeleteRecordDialog，使面板内部文件成为跨业务入口。

建议：API 设置及会话回到 settings；SettingsLayout/ModelsLayout 回到独立 layouts，设置表单继续留业务目录；把当前已跨业务使用的删除确认独立成明确组件/流程，避免从面板文件取得。共享附件显示同理与编辑器图片节点区分。无需为此新增用户已否定的 pages/modules 目录。

### F-05 / P2：桌面适配入口只统一了一部分

2026-10-28 更新：用户已授权处理 F-05；运行环境契约及原生具名事件适配已归 services，Hook/会话继续负责订阅与清理。迟到成功/失败及卸载后的陈旧事件已有回归保护；职责见 [应用结构](APP_STRUCTURE.md)，实际验证见 [STATUS](../tracking/STATUS.md)。以下保留原审查发现，F-06/F-07 尚未实施。

位置：services/desktop.ts:4；shared/runtime.ts:1；features/library/DiaryCreation.tsx:3；features/library/DiaryDetailLayout.tsx:3。

新桌面服务仍转调 shared/runtime；业务文件还直接订阅 Tauri 事件，业务 api 直接 invoke。这不是功能错误，但入口、事件订阅、运行环境判断仍分散，不容易明确纯浏览器可运行部分和原生能力边界。

建议：将运行环境契约归入 services；逐步把类型化业务 IPC 与所需事件订阅归到对应 service，Hook/会话负责订阅生命周期。保留受限命令，不创建可任意执行命令的通用前端接口。不要以去重为名隐藏所有业务事件语义。

### F-06 / P2：架构规则与可读性没有持续检查

2026-10-28 更新：用户已授权处理 F-06；架构规则、合成回归和格式基线已接入本地脚本及 CI common 配置，见 [持续质量检查](../process/FRONTEND_QUALITY.md)。实际验证见 [STATUS](../tracking/STATUS.md)。以下保留原审查发现，F-07 尚未实施。

位置：package.json scripts；.github/workflows/check.yml 的 common 任务。

当前 CI 做类型/构建及业务测试，仓库没有持续检查反向依赖、循环或格式的规则。之前的依赖核对脚本仅在 /tmp，本轮“无循环”是检查快照，不是之后每次改动都受保护。

同时 ChatWorkspace、AiSettings、SettingsPages 中有大量单行多语句和很长 JSX，难以审查异步边界和状态变化。以行数限制文件大小无法发现此问题。

建议：选定一套格式约定，固化最小有价值的依赖规则，例如非入口生产代码禁止导入 app、禁止循环、共享基础层不能反向依赖具体页面。先明确合法的布局组合与跨业务协作，再选择工具；不机械禁止所有跨目录导入，不默认安装完整工具组合。该项需同步开发脚本与 CI，而不是只写到文档。

### F-07 / P3：存在可清理的遗留和重复分类

2026-10-28 更新：用户已授权处理 F-07；未引用的 EditorProbe 已删除，SearchHighlight 归 components，旧日记测试更名并清除旧组件别名/页面状态模拟。真实 Router 与会话测试装配经用途审查后保留并收紧。职责见 [应用结构](APP_STRUCTURE.md)，实际验证见 [STATUS](../tracking/STATUS.md)。以下保留原审查发现。

位置：features/environment/EditorProbe.tsx:4；shared/SearchHighlight.tsx；test/DiaryRouteHarness.tsx；features/library/LibraryWorkspace.test.tsx。

EditorProbe 在当前源码、路由、入口和配置中未发现消费者，是环境联通阶段的遗留组件。shared 目前只有运行环境与搜索高亮，二者已有 services/components 的明确归属；不需要维护两个含义模糊的共享入口。LibraryWorkspace 实现已经删除，但同名测试仍经适配器验证新的路由流程，行为断言有价值，名称失真。

建议：确认诊断入口不再保留后删除 EditorProbe 并更新环境文档；SearchHighlight 归通用 components，runtime 归 services；按实际日记流程重命名旧测试并审查适配器必要性。不能为了清理名称而删除保存/历史/恢复的有效验证。

## 建议顺序

1. 先修 F-01 保护登记的可靠性问题，转为正式回归用例，保持现有关键行为。
2. 处理 F-02/F-04：共享服务协议与业务文件归属，这是目录继续整理的基础。
3. 处理 F-03：聊天会话/队列/预览/视图拆分，保持单一状态所有者。
4. 结合 F-05/F-07 收拢桌面与通用入口、清理遗留；实施中尽早落实 F-06 的可读格式与边界检查。

不建议重新修改已确认的 app/layouts/router 顶层名称，不建议仅为目录重构新增状态库、替换路由器、扩展产品能力或测试组件库。各项需要用户指定实施范围；本轮只提交审查结果。
