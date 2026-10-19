# LifeStory Studio

独立的 Tauri 桌面产品：持续记录生活、提升写作，并从单篇或多篇日记中创作 Vlog。

前端技术：React + TypeScript + Vite + Tailwind CSS + shadcn/ui；长文编辑使用 Tiptap。

当前阶段：文字记录与单一自动保存已实现，保存边界修复 PR #12 与 CI 分层优化 PR #13 已合入 develop。历史管理（LIB-04）已实现并通过 macOS 验证，下一项为图片管理（LIB-05）；Windows 实机验收待完成。具体证据与限制见项目跟进。

## 启动开发

```sh
npm ci
npm run desktop:dev
```

开发命令、目录职责与验证边界见 [开发环境说明](docs/development/ENVIRONMENT.md)。当前窗口可新建文字记录、编辑标题/日期/标签，内容统一自动保存到本机，无常驻保存按钮；正常重开直接读取最新内容，旧版遗留草稿仍可预览。最新保存行为与验证见 [保存模型调整](docs/development/SAVING_MODEL_REVISION.md)，原 LIB-03 记录保留为阶段证据。

## 阅读入口

第一次使用这套协作体系，先看 [人类使用手册](docs/人类使用手册.md)：说明你如何审阅、决策、反馈和继续工作。

日常关注三个入口，与人类使用手册一致：

1. [正式产品文档](docs/product/PRD.md)：产品范围、需求编号及验收条件。
2. [待决策事项](docs/product/DECISIONS.md)：已确认的方向与需要进一步确定的内容。
3. [项目跟进](docs/tracking/STATUS.md)：已完成成果、当前任务、验证限制与下一步。

## 按需查阅的细化资料

[资料库与日常记录规格](docs/features/LIBRARY_AND_RECORDING.md)记录已确认行为；[资料库页面流程与任务拆解](docs/features/LIBRARY_REVIEW.md)细化页面与完整流程、确认边界及 LIB-01—09 任务依赖。它们是 PRD 下属资料，当前进度统一查看项目跟进。

[产品开发工作流](docs/process/WORKFLOW.md)供执行时参考；[原始对话整理](docs/产品需求与对话整理.md)保留需求来源。

## 架构方案入口

- [架构与数据流](docs/architecture/ARCHITECTURE.md)
- [技术选型与取舍](docs/architecture/TECH_STACK.md)
- [数据、IPC 与 AI 契约](docs/architecture/DATA_AND_AI.md)
- [开发环境与实施顺序](docs/architecture/DEVELOPMENT_PLAN.md)

项目协作规则见 [AGENTS.md](AGENTS.md)。功能规格与决策记录模板见 [templates](docs/templates/)。

远程仓库：[NotionNest/LifeStory-Studio](https://github.com/NotionNest/LifeStory-Studio)（公开）。日常使用 develop 集成、release/<版本> 预发布、main 正式基线；main、develop、release/* 已启用 PR、CI Gate、禁止强推与删除保护。分支、提交、PR 和 CI 约定见 [Git 流程](docs/process/GIT_WORKFLOW.md)。

测试投入与执行频率以 [测试边界](docs/process/TESTING_POLICY.md) 为准，按风险验证，不机械测试每次编辑或普通标点/装饰样式。

这套流程参考规范驱动开发与长期 AI 协作实践，已落实为本项目文档。没有安装或声称启用了第三方流程工具。
