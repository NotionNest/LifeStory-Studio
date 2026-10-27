# 聊天答复信息

2026-10-26，TASK-08 / REQ-11/13。用户要求去掉答复上方 AI 字样，并参考 Codex 展示思考过程、用时、复制与发送时间。

## 行为与验收

- 用户/助手角色名称仅保留给辅助技术，不在消息上方重复展示；消息依靠位置与气泡区分。
- 仅助手消息展示时间与复制，己方消息不显示这些附属操作（用户后续视觉反馈修订）。助手已保存消息展示本地时区发送时间，悬停显示完整日期时间；从 SQLite 原始时间读取，不补造历史信息。
- 消息复制仅复制该条正文，成功有图标反馈，失败可重试；不附带摘要、时间或其他消息。
- 生成中显示实时任务用时；完成后保留该任务从准备创建至完成落库的总用时，不标成模型内部思考时长。历史消息只有能关联任务时显示用时。
- Codex 通过 turn/start summary=auto 请求公开推理摘要；摘要流在正文前独立展示，生成时展开，完成后默认折叠。模型没有返回摘要时不生成虚假内容；旧回复不回填摘要。
- 只接收当前 thread/turn 下已确认 reasoning 项目的 summaryTextDelta 与完成 summary，完成数据为准；不采集 textDelta 或 content 中的原始推理。分段/项目/总长度限制保留。
- 摘要单独保存到 ai_tasks，重开可查看；不会进入聊天历史提示词、正式答复正文或日记生成输入。来源删除沿用失效规则并清空摘要；取消/完成后的迟到摘要不写入。
- 摘要当前接入 Codex，API 服务沿用既有正文流；不据此宣称所有提供商已实现推理流。

## 实现与验证

复用消息展示与任务轮询，新增 MessageDetails/ReasoningSummary。任务 IPC 提供 startedAt/updatedAt/reasoningSummary；消息提供 createdAt/reasoningSummary/durationMs。数据库 schema 16 仅为任务新增默认空摘要列，沿用迁移前备份/事务保护；现有时间列继续复用，原消息及配置不改写。

前端相关三文件 27 项；Rust ai 20 项、storage_bootstrap 6 项及 Codex 合成协议 10 项通过（真实二进制模型项未运行）；Clippy lib、类型/生产构建、diff 通过。迁移覆盖 11/12/14/15 版，检查保留资料与升级备份；测试另验证重开、来源删除、迟到拒绝及摘要不进入提示词。沙箱内回环端口被拒及并行 Python 检测超时后，在沙箱外串行运行合成协议测试通过，未放宽超时/权限边界。单轮设计检测无发现或忽略。既有生产包大小警告保留。

原生变动需重启开发进程；未操作应用、未代做视觉/真实模型/Windows 验证、未跑全套，未打包发布。

官方依据（使用 OpenAI Docs 与 Context7 核对）：
- [Codex App Server](https://learn.chatgpt.com/docs/app-server)：reasoning.summary 与 summaryTextDelta 是可读摘要，item/completed 为最终状态。
- [Reasoning summaries](https://developers.openai.com/api/docs/guides/reasoning)：公开摘要与原始推理 token 不同，能力依模型而异。

2026-10-26 视觉反馈修订：助手附属信息采用 11px 字号、低显著性语义灰色，复制使用现有 icon-xs（12px 图标/24px 点击区域），悬停/键盘聚焦加深。复制错误仍保留清晰错误色；不隐藏功能或修改保存数据。
