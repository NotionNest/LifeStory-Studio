# CI / GitHub Actions 审查

日期：2026-10-16。范围：3 个 workflow、5 个流程脚本及 package 命令、规则集 25221010、Actions 权限和近期运行记录。按单人维护、macOS/Windows 桌面产品评估。仅审查，不修改 CI、应用代码或远程规则，不提交或推送本记录。

结论：REQUEST_CHANGES。1 项 P1、5 项 P2，另有一处可精简的重复核对。日常开发的基本结构合理；发布候选门禁尚未闭合，不能把现有绿灯视为完整发布验收。

## 1. P1：候选失败或缺失仍可能通过 main 门禁

位置：scripts/ci/policy.mjs:40；.github/workflows/check.yml:85。

release→main 时，脚本只在找到成功候选后关闭桌面重检；找不到时没有拒绝，而是执行普通 debug / no-bundle 编译。若 DMG/NSIS 打包失败、候选未运行或尚未完成，但普通编译成功，CI Gate 仍可成功。规则集只要求 CI Gate，不单独要求候选工作流。

证据：使用临时合成 Git 仓库与模拟 API（成功候选列表为空）执行真实 policy.mjs；得到 common=true、desktop=true、images=false，进程退出 0。再用这些选择和普通任务成功结果执行真实 gate.mjs，退出 0。该复现验证决策缺口，没有在线创建或合并测试 PR。

修复方向：release→main 必须获得与当前候选及待合并内容相符的成功候选证据；证据缺失、失败或不匹配应阻止合并，不能用不打包的编译替代。候选运行重新完成后须有明确的重新校验方式。候选安装/升级人工验收仍另行执行。

## 2. P2：检查范围输出缺失时门禁默认放行

位置：scripts/ci/gate.mjs:4。

脚本仅把字符串 true 视为必需。policy 成功但 outputs={} 时，三个任务会被判断为非必需；均 skipped 的结果仍通过。输出字段被误删、改名或出现错误值时，没有按缺失处理。

证据：以 policy.result=success、outputs={}、三个任务 skipped 调用真实 gate.mjs，退出 0。现有 4 项测试全部通过，说明缺少此边界保护。该情况是异常输出的可靠性缺口，不宣称目前存在外部无需权限即可利用的攻击路径。

修复方向：要求三个字段齐全，且只能为 true/false；缺失或非法值直接失败。添加一个覆盖该风险的小回归即可，不在多层重复测试。

## 3. P2：修改 PR 目标分支不会触发重新校验

位置：.github/workflows/check.yml:5。

只监听 opened/synchronize/reopened/ready_for_review，未监听 edited。将已有 PR 从 develop 改到 main，路由规则及新的比较范围没有对应触发。可能留下旧检查或等待结果；不能将曾经针对 develop 的结论视为 main 路由已验证。

修复方向：覆盖目标分支修改，针对新的 base 重新校验。不要为编辑标题或说明无条件重跑昂贵任务，也不要通过把 CI Gate 标为 skipped 来覆盖原有失败。仅静态核查，未操作真实 PR 做线上绕过试验。

依据：[工作流事件](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)、[必需检查与提交关联](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks)。

## 4. P2：未知路径被当作无需检查

位置：scripts/ci/policy.mjs:10。

当前列举受检代码路径，其余路径全部跳过，而非仅跳过已知纯说明文档。例如新增 public/runtime.js 或独立 vitest.config.ts，classify 返回 common/desktop/images 全 false。这些目录或配置当前尚未使用，是新增它们时会遇到的维护缺口，不宣称现有应用已被这类文件破坏。

修复方向：明确哪些文件允许免除应用检查；新增或无法识别的代码/配置要明确归类或阻止无声跳过。继续保留普通文案、标点和说明文档免跑应用测试的边界。

## 5. P2：缓存成本过高，跨 PR 复用受限

位置：.github/workflows/check.yml:74。

缓存整个 src-tauri/target。实际 [集成运行](https://github.com/NotionNest/LifeStory-Studio/actions/runs/38858479876) Windows 桌面任务 9 分 42 秒，桌面编译 57 秒，Rust 缓存保存 4 分 17 秒。缓存 API 显示同类型 Windows 缓存在 refs/pull/3/merge、refs/pull/4/merge、refs/pull/6/merge 下各约 1.2 GB。

GitHub 的 PR merge-ref 缓存不能被其他 PR 或目标分支直接恢复；不能把相同 key 理解成全仓库通用缓存。本次 Windows 恢复的是 main 上旧锁文件 key 的缓存，之后又保存当前 PR 的新缓存。

修复方向：先减少无收益的缓存范围，排除无需复用的应用产物/增量等内容，按实际恢复和保存成本决定保留项。不要为了建立缓存再无条件新增一次全量构建。若引入 Rust 缓存 Action，需评估其复杂度、固定提交并验证真实收益。

依据：[GitHub 缓存访问边界](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching)。

## 6. P2：应用 Rust 检查没有强制锁文件一致

位置：package.json:14；scripts/ci/candidate.mjs:38。

npm 使用 npm ci，图片工具使用 --locked，但应用的 cargo test/clippy 及候选构建未显式要求锁文件不可改。更新 Cargo.toml 忘记同步 Cargo.lock 时，Cargo 可在运行机重新解析和更新，检查通过的依赖未必就是提交的依赖。

修复方向：应用检查和构建一致要求锁文件不可变；候选允许的应用版本变更在其预期变更后同样约束依赖锁定，不允许无关依赖漂移。此项是配置及官方语义核查，未在当前应用上制造锁文件漂移。

依据：[Cargo resolver](https://doc.rust-lang.org/cargo/reference/resolver.html)、[Cargo 锁文件说明](https://doc.rust-lang.org/cargo/faq.html)。已通过 ctx7 CLI 获取官方文档。

## 规范与安全方面已做对的部分

- 稳定 CI Gate 使用 always() 汇总，纯文档 PR 仍有结果；实际纯文档运行已观察为成功且应用任务跳过。
- 类型和前端交互集中运行一次，Rust/桌面保留双平台，未为标点和样式增加套件。
- 工作流及仓库默认 token 权限为 read，不允许 Actions 自动批准 PR；这些工作流未引用写入/发布凭据。
- 使用 pull_request，未发现 pull_request_target 检出执行外部 PR 的高权限模式；使用 GitHub 托管 runner。
- Actions 固定完整提交，checkout 不持久保存 Git 凭据。规则集要求 CI Gate 来自 GitHub Actions（15368）。
- 分支规则 active，禁止强推和删除，无绕过名单；单人项目批准人数 0 是已确认选择，不算漏洞。

没有发现可由外部 PR 直接获取写令牌或发布密钥的已证实漏洞，不等于完整安全认证。仓库允许所有 Actions 且未在服务端强制 SHA，当前 YAML 自身已固定 SHA；属于可选治理增强，不列为当前漏洞。公开后脚本仍以 private repository 解释拒绝 fork，是过时提示，不是新的权限保障。

## 精简建议

integration.yml 和 integration.mjs 约 30 行，只在合并后再次核对 PR 来源。此前强制保护不可用时有一定审计价值；现在服务器已强制 PR 且无绕过名单，其约束明显重复。可删除这一工作流及脚本，少一次合并后任务；会失去额外审计告警，但不会移除服务器 PR 保护或合并前 CI Gate。它不再应被描述成主要安全门禁。

保留 Checks、Release candidate、稳定 Gate 与必要的范围判断。不要增加新框架、新长期测试分支或更多重复测试；优先闭合发布校验并缩小缓存。

## 本轮验证与边界

- 现有 CI 策略 4 项测试通过；未重复应用或双平台全套。
- 两个合成反例直接执行真实门禁脚本；未知路径直接调用真实分类函数。
- GitHub 规则、Actions 权限、缓存和实际 job 步骤时间经接口读取。
- ctx7 官方文档及 GitHub 官方页面用于验证事件、状态检查、缓存、Cargo 锁文件语义。
- 未运行真实预发布包、安装/签名、实际 fork 攻击、PR 改目标试验或全依赖漏洞扫描；未修改远程设置、提交、推送或创建 PR。


## 用户确认后的修正（2026-10-16）

用户已要求解决全部问题。实现位于 fix/ci-gates：

1. release→main 强制最新匹配候选（push 或手动），合并树不符或候选未成功时拒绝；没有普通编译替代路径。
2. Gate 对 common/desktop/images 输出逐项检查，缺失和非法值拒绝。
3. 监听 edited；改目标重新验证，纯标题/说明编辑隔离并发，且不产生名为 CI Gate 的 skipped 检查。
4. 只允许已知说明文档免跑应用检查；资源、独立测试配置及未知代码/配置明确受检，保留带空白文件名。
5. 缓存改用固定提交的 Swatinem/rust-cache v2.9.2，仅缓存依赖；禁用 CI 开发/测试调试符号及增量缓存。实际耗时收益以新在线运行对比为准，不能仅凭配置宣称加速。
6. 应用 Rust 测试/Clippy、普通桌面构建和候选构建统一使用 --locked。
7. 删除重复的 Integration provenance 工作流及脚本，服务器分支保护保持。

本地 6 项策略/真实 CLI 回归通过，覆盖两个原反例、候选状态/来源/合并树、改目标路由、未知路径；actionlint 1.7.12 校验工作流及表达式通过，类型/格式与 Node 语法、diff 空白检查通过。未为标点或装饰样式新增测试。在线验证结果见交付 PR 的 Checks；真实候选安装/签名与完整依赖漏洞扫描不属于本次已验证成果。


## 在线验收证据

交付 [PR #11](https://github.com/NotionNest/LifeStory-Studio/pull/11)，最终目标 develop。

- [错误路由](https://github.com/NotionNest/LifeStory-Studio/actions/runs/38870746958)：fix→main 被拒绝，必需 CI Gate 失败，昂贵任务未启动。
- [失败后仅编辑说明](https://github.com/NotionNest/LifeStory-Studio/actions/runs/38870882230)：新运行跳过，原有失败 Gate 保留，未被同名 skipped 覆盖。
- [改目标触发验证](https://github.com/NotionNest/LifeStory-Studio/actions/runs/38870936285)：edited 事件自动触发，策略、前端、双平台 Rust/Clippy/桌面及图片工具、CI Gate 全部通过。
- [验证期间再次编辑说明](https://github.com/NotionNest/LifeStory-Studio/actions/runs/38871056493)：新运行跳过，没有取消完整验证或启动新矩阵。
- Windows Rust 缓存约 454 MB，保存清理 34 秒；旧运行约 1.19 GB、4 分 17 秒。macOS 新缓存约 389 MB，保存清理 25 秒。首轮冷构建不是严格性能基准，不承诺每次总耗时同比。

GitHub 仍在同一提交的检查汇总中保留故意验证错误路由时的失败，导致 mergeStateStatus=BLOCKED，虽然最新必需 Gate 已通过。此处不删除、伪造或绕过检查：提交这份真实验收文档，再让新提交通过正常门禁。日后改目标时若旧失败仍关联同一提交，也需通过正常新提交与检查解除；不能仅编辑说明来清除失败。

本次仍未运行真实候选安装、签名、公证或正式发布；候选拒绝/接受规则由合成 API 与真实脚本回归保护。最终新提交状态以该 PR 实际 Checks 为准。
