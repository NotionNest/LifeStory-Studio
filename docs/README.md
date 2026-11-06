# 文档索引

这里按问题查找项目资料。当前产品行为以 [PRODUCT.md](PRODUCT.md) 和对应功能规格为准；进度和实际验收分别以 [STATUS.md](STATUS.md)、[VERIFICATION.md](VERIFICATION.md) 为准。研究和历史设计记录可能包含当时的提案与过时状态，不能覆盖后续用户决定或当前代码。

## 日常查看

| 想了解什么 | 文档 |
|---|---|
| 产品目标、REQ 需求、确认和待决策事项 | [产品与决策](PRODUCT.md) |
| 目前做到哪里、下一步和阻塞 | [项目跟进](STATUS.md) |
| 当前版本的验收方式、结果和未验证范围 | [验证与验收](VERIFICATION.md) |
| 如何与 Codex 协作、版本和发布如何处理 | [人类使用手册](人类使用手册.md) |
| 项目设计方向、交互及文案约束 | [设计基线](DESIGN.md) |
| 如何启动、常用命令及开发规则入口 | [开发与协作](DEVELOPMENT.md) |

## 按功能查阅

| 任务 | 文档 |
|---|---|
| 日记编辑、自动保存、历史、图片、搜索和回收站 | [日记与资料库](features/DIARY.md) |
| 独立聊天、预览采用、队列和长聊天 | [聊天与日记整理](features/CHAT.md) |
| Codex/API 配置、模型目录、密钥和连接测试 | [模型与提供商设置](features/MODEL_SETTINGS.md) |
| 记录、附件、迁移、恢复及引用的底层契约 | [资料库实施契约](features/LIBRARY_IMPLEMENTATION.md)；其中历史阶段描述以当前规格及源码为准 |
| 文案审查 | [基础校对需求](features/COPY_REVIEW.md)；审查范围、主要流程和验收已确认，尚未实施 |
| 写作练习、个人风格、Vlog 和生活回顾 | 先看 [产品需求](PRODUCT.md)及[当前进度](STATUS.md)；细化规格尚待开展 |

## 开发时查阅

| 任务 | 文档 |
|---|---|
| 理解技术组合、隐私及系统边界 | [架构总览](ARCHITECTURE.md) |
| 查找前端模块、会话和职责 | [应用结构](architecture/APP_STRUCTURE.md) |
| 修改本地数据、IPC、AI 任务或聊天分页 | [数据与 AI 契约](architecture/DATA_AND_AI.md)；未来设计不代表已实现 |
| 修改页面地址、导航、草稿或退出保护 | [前端导航与会话](architecture/FRONTEND_NAVIGATION.md) |
| 确定测试范围和用户要求的组件库测试边界 | [测试策略](process/TESTING_POLICY.md) |
| 管理版本、分支、PR、CI 与发行 | [Git 流程](process/GIT_WORKFLOW.md) |
| 检查前端依赖边界、格式及 lint | [前端质量](process/FRONTEND_QUALITY.md)；[Hook 依赖](process/HOOK_DEPENDENCIES.md) |
| 了解需求到验收的协作方法 | [项目工作流](process/WORKFLOW.md) |
| 编写新规格或记录重大决策 | [功能规格模板](templates/FEATURE.md)、[决策模板](templates/DECISION.md) |

仓库级协作约束以 [AGENTS.md](../AGENTS.md) 为准。根据任务选择相关文档，不需要每次读取全部材料；涉及现有实现时还要核对源码和验证证据。

## 历史调研与测量

| 主题 | 文档 |
|---|---|
| Codex 和其他本机 AI 工具的接入、能力及隔离 | [本机 AI 接入研究](research/LOCAL_AI_INTEGRATION_RESEARCH.md) |
| API 提供商及协议覆盖调研 | [模型服务研究](research/LIB08_PROVIDER_RESEARCH.md) |
| 长聊天策略和启动加载测量 | [长聊天测量](research/CHAT_LONG_HISTORY_MEASUREMENT.md)、[启动测量](research/STARTUP_LOADING_MEASUREMENT.md)；原始测量材料已按用户要求删除 |
| 保存模型审阅及合成测量 | [保存模型审阅](research/SAVING_MODEL_REVIEW.md) |
| CI 分层和安全问题的历史审查 | [CI 审查](research/CI_ACTIONS_REVIEW.md)；现行规则以 [Git 流程](process/GIT_WORKFLOW.md) 为准 |
| Codex 界面参考分析 | [Codex 参考](research/CODEX_UX_REFERENCE.md)；现行约束以 [设计基线](DESIGN.md) 为准 |
