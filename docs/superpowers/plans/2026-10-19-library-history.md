# LIB-04 历史管理实施计划

目标：交付 REQ-01/02/12 下历史列表、完整快照预览、重要标记、恢复为新版本及 90 天清理。依据 LIBRARY_AND_RECORDING 与 LIBRARY_REVIEW 已确认行为。

架构：沿用单线程 SQLite worker；新增 history.rs 处理事务、恢复幂等与保留规则。恢复先追平自动保存，再核验内容版本和编辑会话，事务内保留当前内容、创建恢复快照及新会话。前端复用离开保护与现有 Button，历史弹窗不引入新依赖。按项目测试边界验证，不机械 TDD，不自动提交或推送。

- [x] 存储：新增 migration 006 恢复来源与回执；history.rs 提供分页列表、预览、重要标记、恢复及清理；复用 recovery.rs 检查点并保留旧内容。
- [x] 期限：普通历史创建满 90 天可清理，当前版、重要版、revision_pins、record_relations、恢复草稿基版保护；删除关联保存/恢复回执。迁移备份期限不套用普通历史规则，待用户确认前保留，不实现备份删除。待处理恢复草稿不自动丢弃。启动与运行期间执行清理；失败可见并保留数据。
- [x] 接口：commands.rs、lib.rs、build.rs、runtime.toml、api.ts 同步有限 IPC，禁止前端传入任意清理时间或 SQL。
- [x] 交互：HistoryPanel.tsx 及 LibraryWorkspace 接入历史入口、分页、预览、重要标记与恢复确认；失败保留当前编辑，恢复后轮换会话并重建编辑器；沿用 prepareLeave/resume。
- [x] 自动验证：Rust 真实 SQLite 覆盖恢复前后及重开、重试、跨记录/会话/版本冲突、清理边界及保护、事务回滚；UI 关键交互覆盖预览/恢复/失败保护。运行类型、生产构建、相关 UI、Rust tests/fmt/clippy。
- [x] 桌面验证：合成数据实际窗口历史预览、重要标记、恢复、继续编辑和重开；记录 Windows 和真实输入法未验收。更新规格、任务与 STATUS 的摘要和证据，完整 LIB 表仍只在细化文档维护。

文件：src-tauri/src/history.rs、storage.rs、recovery.rs、commands.rs、lib.rs；src-tauri/migrations/006_history_management.sql、build.rs、permissions/runtime.toml；src/features/library/api.ts、LibraryWorkspace.tsx、HistoryPanel.tsx；src-tauri/tests/history.rs 和关键 UI 测试。

文档依据：ctx7 查询 rusqlite transaction_with_behavior/Immediate，显式 commit，失败默认 rollback。旧快照缺失元数据时只提供正文预览并明确不能完整恢复，不伪造历史字段。恢复是用户明确操作，允许生成恢复快照及保留恢复前快照，不引入写作过程的定时历史。

## 审阅修正

计划审阅要求明确迁移备份不等同于普通历史，保留期限需用户决定；已向用户解释迁移用途，本次不删除迁移备份。恢复请求字段为 recordId/revisionId/expectedContentVersion/sessionId/requestId；先重放匹配回执，再核验普通请求的旧会话与内容版本。响应不确定时重试沿用请求身份，即使后续暂忙也不解除只读；可主动重新读取已保存内容并建立当前会话。代码审阅发现并修复该暂忙链路，UI 已覆盖。
