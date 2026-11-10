# LifeStory Studio

独立的 Tauri 桌面产品：持续记录生活、提升写作，并从单篇或多篇日记中创作 Vlog。

前端技术：React + TypeScript + Vite + Tailwind CSS + shadcn/ui；长文编辑使用 Tiptap。

当前阶段：资料库与 AI/对话的本轮交付已收尾，约定主链路已获用户确认；部分平台和专项仍待验证。文案审查已完成本轮桌面验收；写作练习和个人风格暂缓。最新进度及验证限制见 [项目跟进](docs/STATUS.md)。

## 启动开发

```sh
npm ci
npm run desktop:dev
```

开发命令、目录职责与验证边界见 [开发环境说明](docs/DEVELOPMENT.md)。当前窗口可新建文字记录、编辑标题/日期/标签，内容统一自动保存到本机，无常驻保存按钮；正常重开直接读取最新内容，旧版遗留草稿仍可预览。当前验证范围见 [当前版本验证与验收](docs/VERIFICATION.md)。

## 阅读入口

第一次使用这套协作体系，先看 [人类使用手册](docs/人类使用手册.md)：说明你如何审阅、决策、反馈和继续工作。

日常入口：

1. [产品与决策](docs/PRODUCT.md)：产品范围、需求及确认边界。
2. [项目跟进](docs/STATUS.md)：当前进度、验证限制与下一步。
3. [架构与技术边界](docs/ARCHITECTURE.md)：技术组合、数据和 AI 边界。
4. [开发与协作](docs/DEVELOPMENT.md)：启动、测试、Git 和开发约定。
5. [当前版本验证与验收](docs/VERIFICATION.md)：当前版本功能、修复、验证结果及未验收范围。

## 按需查阅的细化资料

[日记与资料库](docs/features/DIARY.md)、[聊天与日记整理](docs/features/CHAT.md)和[模型设置](docs/features/MODEL_SETTINGS.md)记录已确认行为；当前进度统一查看项目跟进。

[完整文档索引](docs/README.md)按问题列出产品、功能、架构、开发与研究资料。

其他资料按用途组织：[设计基线](docs/DESIGN.md)记录现行交互与视觉约束，`docs/features/` 为功能规格，`docs/research/` 为调研与测量。聊天的模型、答复和队列行为见[聊天交互](docs/features/CHAT.md)。

## 架构方案入口

- [架构与数据流](docs/ARCHITECTURE.md)
- [应用入口与目录职责](docs/architecture/APP_STRUCTURE.md)
- [数据、IPC 与 AI 契约](docs/architecture/DATA_AND_AI.md)
- [开发环境与协作](docs/DEVELOPMENT.md)

项目协作规则见 [AGENTS.md](AGENTS.md)。功能规格与决策记录模板见 [templates](docs/templates)。

远程仓库：[NotionNest/LifeStory-Studio](https://github.com/NotionNest/LifeStory-Studio)（公开）。日常使用 develop 集成、release/<版本> 预发布、main 正式基线；main、develop、release/* 已启用 PR、CI Gate、禁止强推与删除保护。分支、提交、PR 和 CI 约定见 [Git 流程](docs/process/GIT_WORKFLOW.md)。

前端依赖边界、统一格式及 CI 约定见 [持续质量检查](docs/process/FRONTEND_QUALITY.md)。

测试投入与执行频率以 [测试边界](docs/process/TESTING_POLICY.md) 为准，按风险验证，不机械测试每次编辑或普通标点/装饰样式。

这套流程参考规范驱动开发与长期 AI 协作实践，已落实为本项目文档。没有安装或声称启用了第三方流程工具。

API 密钥存储（DEC-18，2026-10-27）：不使用系统钥匙串；按用户确认明文保存在应用私有配置文件，重启可用，不加入应用备份或导出。旧 API 配置需重新填写密钥，旧钥匙串条目不自动迁移或删除。
