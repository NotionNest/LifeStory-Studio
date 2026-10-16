# Git 流程现状核对

2026-10-16。用户要求先完整了解流程，本轮仅核对实际状态，未同步/切换分支、提交、推送、修改 PR、合并或变更仓库设置。既有流程定义见 [GIT_WORKFLOW.md](GIT_WORKFLOW.md)，以下建议尚未作为新规则执行。

## 原定流程

main + 单任务短期分支，不设长期 develop。检查并保留已有工作，基于最新 main 开分支，实现并做相关验证，commit 保存本地版本，push 上传远程工作分支，创建 PR 供审阅，获得合并授权后 squash merge 到 main，再清理已完成分支并同步本地 main。安装包发布另行授权；PR 合并不等于发布。小修改继续更新同一 PR，不应按每次聊天新增 PR。

远程私有；当前仅允许 squash merge，关闭自动合并。main 未保护，没有强制 required checks/review。仓库流程约定不能当成服务器已强制执行。

## 实际 PR

- PR #1：https://github.com/NotionNest/LifeStory-Studio/pull/1 。已 merged，不是关闭放弃。原 feat/library-records → main，包含 LIB-01 与 LIB-02；2026-10-16 11:34（上海）合并为 70ff89a。原始工作分支包含 bc2b8ef 等前序 LIB-01 提交。
- PR #2：https://github.com/NotionNest/LifeStory-Studio/pull/2 。Open，非 Draft，docs/library-recording-spec → main。head bc2b8ef，其前序成果已经包含于 #1，不应盲目再次合并。标题是 docs，但含数据契约与图片验证代码；正文仍为模板占位内容，需要清理 PR 状态和说明。
- PR #3：https://github.com/NotionNest/LifeStory-Studio/pull/3 。Open，非 Draft，feat/library-autosave → main，head 375f14b。创建时以 feat/library-records 为 base，现已变为 main。GitHub 返回 mergeable=false/mergeable_state=dirty，存在合并冲突。本轮未分析逐文件冲突原因。正文仍介绍旧的双写恢复草稿方案，与最新本地实现不同。

## 本地与远程

本地 main 与缓存 origin/main 仍为 a549674；远程真实 main 为 70ff89a，尚未同步。当前工作分支 feat/library-autosave 的已提交 HEAD 是 375f14b；保存模型、进入编辑历史规则、schema 4/5、hook 和测试等最新修改为未提交本地文件，均未包含于当前 PR #3，也未备份到远程。

原任务形成 docs/library-recording-spec → feat/library-records → feat/library-autosave 的依赖链，不是三个完全独立的任务分支。squash 会以新提交纳入成果，后续分支不会自动被整理成基于最新 main 的干净增量。此时继续沿旧分支链开发，容易造成提交列表重复、PR 范围不清及冲突；不能直接删除/重置以求图形整齐。

## CI

当前工作流：涉及配置路径的目标 main PR、main push 自动检查；另支持手动触发。macOS/Windows 两个平台执行依赖锁定安装、类型/格式、前端关键交互、存储集成、Clippy、桌面编译。不发布安装包，不等于 Windows GUI/签名/安装验收。

此前 LIB-03 提交 607c133 的手动检查 38836028471 已成功：https://github.com/NotionNest/LifeStory-Studio/actions/runs/38836028471 。这不能证明最新本地变更或当前合并结果通过远程验证。

文档说明可能不准确之处：自动 PR 检查仅匹配 base=main，依赖分支 PR 需要额外安排验证。paths 忽略只适用于对应事件的变更集合；PR 内有代码时，纯文档后续提交也可能触发整个 PR 检查。[skip ci] 曾用于避免重复构建，但 #1 squash 提交说明包含该标记；查询合并 SHA 未发现 event=push 的运行，存在代码合并误跳过 CI 风险，不能仅凭这一查询认定唯一原因。

本机 gh 请求返回 401，改用已经连接的 GitHub 只读工具完成核对，未发起登录或修改凭据。

## 建议（待核对后执行）

保留 main + 一个当前任务分支的轻量模式，依赖任务尽量串行完成并合并后再开下一分支；不要按 LIB 编号或聊天轮次机械创建 PR。不增加 develop、release 分支或复杂审批。commit、push、创建 PR、合并与发布的授权分别明确。

后续先保护所有未提交修改，再核对 main 中成果与重复 PR，决定 #2 的关闭处理和 #3 的增量整理方式；同步更新 PR 描述，验证确切提交后由用户决定合并。避免把 skip 标记混入代码 squash 提交；如设置 required checks，先解决路径跳过检查导致无法满足检查的问题。
