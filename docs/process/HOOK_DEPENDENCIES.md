# Hooks 依赖审查记录

2026-10-28，REQ-11/12/13/14 / TASK-11，用户授权。针对启用 exhaustive-deps 前的 23 个文件、43 条提示逐项审查；此计数是提示数量，不代表 43 个已复现缺陷。本轮仅处理触发条件、闭包依赖及生命周期，不改变顶层目录、存储协议、模型任务或组件库测试边界。

## 同步键和处理依据

| 文件 | 提示数 | 触发条件与决定 |
|---|---:|---|
| components/attachments/AttachmentImage | 1 | 按记录、历史版本、图片 ID、原图模式、MIME 和重试次数读取；提取实际使用的原始值，父级 scope 对象重建/改名不重新取图片，版本/MIME 变化则刷新并释放旧 URL |
| components/date-filter/DateFilterContent | 1 | 外部 value 或实际默认字段/条件/方向/单位变化才同步；默认值按原始值 memo，避免能力数组对象重建清空未完成的区间草稿 |
| contexts/ModelProfilesContext | 1 | refresh 稳定，挂载加载/卸载增加请求计数；清理明确写入当前计数器，不截取旧数值 |
| features/chat/ChatModelControls | 1 | 按 active/连接快照加载目录；卸载/连接变化继续使当前代次失效，不因选中模型变化重新读取 |
| features/chat/useChatPreview | 3 | 缓存按实际预览内容与核对结果同步；完成事件按任务 ID/状态处理，打开预览按 active/聊天 ID/预览 ID 核对；补齐稳定 ref/setter，稳定 updatePreview；导航回调在完成事件中读最新值，不能因输入变化重取预览 |
| features/chat/useChatQueue | 1 | active/readyChatId/预览/忙状态/任务状态/队首变化才决定是否投递；补 busyRef，投递动作使用 Effect Event，不能因输入文字或 submit 身份变化重发 |
| features/chat/useChatSession | 8 | 关闭目标选择按聊天/活跃状态；焦点按地址/消息定位；窗口 alive 按挂载；列表刷新依赖稳定 ref/setter；权威读取按聊天/活跃状态；默认模型按配置/选择变化；切换草稿按提交地址/日记上下文/消息/位置 key；资料焦点按开关。loadChat 仅由路由 Effect 调用，缓存核对是读取完成事件，读取最新动作且不扩大数据加载触发范围 |
| features/chat/useChatTask | 2 | 保持 P1 修复的会话代次和轮询清理；清理写当前请求计数器，不冻结旧值，不接受迟到结果 |
| features/library/DiaryCreation | 1 | 原生新建事件按挂载订阅，订阅失败报告使用最新已提交错误处理器；不随 working/error 变化重新注册 |
| features/library/DiaryDetailLayout | 4 | DiarySession 已按 recordId 作为 key；初次打开数据使用页面实例快照，不因 loader 重验证覆盖活跃编辑器；同步忙状态句柄列入依赖。原生保存事件仍按页面/编辑会话订阅，错误报告读最新处理器。编辑页滚动按编辑会话恢复，清理使用当次实际 viewport 节点与稳定 scroll ref |
| features/library/DiaryHomePage | 1 | 挂载读取恢复项；读取失败事件使用最新处理器，不因错误展示重新读取 |
| features/library/HistoryPage | 2 | load 按 record.id 稳定；挂载/记录变更读取历史。canLeave 由 mutation ref 与 uncertain 决定，移除无关 busy 依赖 |
| features/library/LibraryBrowser | 4 | 当天列表按日期/筛选稳定 load；清理使请求失效；列表现场按位置存储 ref/视图/加载和结果恢复；remember 按 view/positions 稳定，视图退出时保留正确视图现场 |
| features/library/TagManager | 2 | 挂载和目录开关/记录变化的清理继续增加活跃请求序号，防止迟到目录写回 |
| features/library/useLibraryQuery | 2 | 清理使当前查询失效；清除不适用图片筛选时显式依赖整个 filters，保留其他筛选值，不捕获旧对象 |
| features/library/useRecordPersistence | 1 | 编辑器就绪是恢复内容自动保存的触发事件；在该事件读取最新恢复选项与调度动作，避免每次编辑重新安排恢复保存；既有串行保存、输入法等待、重试身份与退避不变 |
| features/search/GlobalCommand | 1 | 搜索键变化/卸载清理使用当前请求序号，保留防抖与迟到结果隔离 |
| features/settings/AiSettings | 1 | active/ready/配置就绪触发首次进入；首次进入动作读取当时最新配置/默认项并按 visitedApi 保持一次性；草稿变化不重复 load |
| features/settings/LocalCliSettings | 1 | 首次 active 触发 scan，Effect Event 读取最新状态；已有 initialScan/scanPending 保持防重，手动扫描仍由点击动作调用 |
| router/useHistoryControls | 1 | 键盘监听依赖可用历史、disabled、navigate；监听内直接使用这些值，避免捕获额外 back/forward 函数 |
| router/useRouteBlocker | 2 | 阻塞事件按 blocker 变化触发，位置完成按 location.key；Effect Event 使用最新保护动作，不因 working/error 对象更新重复 prepare/清空错误 |
| test/ChatRouteHarness | 1 | 注册依赖稳定 register；回调通过 Effect Event 读取最新 getProps，不因夹具重渲染重建 Router/登记 |
| test/DiaryRouteHarness | 1 | 已提交 location 变化才报告位置/执行导航后动作；位置报告回调读取最新 getProps |

请求计数器不是 DOM ref：清理需要推进共享的当前计数，不能按通用提示把数字捕获到局部常量。改为显式赋值表达计数器写入，保留原本失效语义；只有实际 DOM 滚动节点使用当次节点快照。

## 验证

既有完整业务套件 24 文件 163 项通过（10.85s），覆盖保存失败/重试/输入法/恢复、路由离开/原生事件、聊天排队/预览/隐藏返回、CLI 首次扫描及目录清理。新增 3 项业务回归：无关父级重渲染保留未完成日期范围、默认日期字段变化同步、图片按实际标识/MIME 读取且释放 URL；相关 2 文件 7 项通过（3.09s）。新增测试首轮有单字段时下拉框不渲染的错误假设，以及 Blob mock 参数签名遗漏，已修正测试装配/类型并复验；未降低行为断言。

Lint（含 exhaustive-deps）、格式、类型/生产构建、架构检查通过，未新增依赖忽略或关闭规则。规则负例与默认值同步回归的反向验证见 STATUS.md。未运行组件库测试、Rust、实机、真实模型或远程 CI。

依据：[React 移除 Effect 依赖](https://react.dev/learn/removing-effect-dependencies)、[Effect Event](https://react.dev/reference/react/useEffectEvent)。两者强调区分需要重新同步的数据与仅在事件发生时读取的最新值，不将 Effect Event 当作跳过依赖的手段。
