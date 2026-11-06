# 本机 AI 能力接入调研

2026-10-26，TASK-08 模型设置后续技术调研。状态：调研后用户已授权并完成首批 Codex 能力合同改造；其他工具仍为调研建议，不变更 DEC-07/08 的已确认资料边界。

## 结论

不应将每个 CLI 小版本都要求人工加入白名单作为长期集成机制。应围绕官方程序接口、协议主版本/必要字段、能力探测和代表性兼容回归建立支持边界；版本号用来确定最低要求及记录已知不兼容版本。实验性安全控制仍须单独验证，握手成功或字段存在不等于其行为已被验证。

“本机已安装”是接入入口在本机，并不意味着模型在本机推理、离线或不计费。CLI 可能继续请求各厂商服务；应用仅发送用户选定资料，凭据由对应工具管理，不能因为可读取登录文件就改用其内部令牌。

## 官方接入入口

| 工具 | 已查证的程序接口 | 本项目建议 |
| --- | --- | --- |
| Codex | App Server，子进程 stdio/JSON-RPC，initialize、model/list、thread/start、turn/start 与流式通知；官方说明其 JSON-RPC 面向向后兼容 | 保留现有 App Server 方向，重审实验性隔离字段与精确版本白名单 |
| Claude Code | CLI 非交互 -p、结构化输出，Agent SDK（Python/TypeScript） | 单独适配官方入口，认证、工具权限和配置加载独立核实；不等于已支持 |
| Gemini CLI | ACP：JSON-RPC over stdio，初始化与能力协商 | 如实施接入可复用 ACP 公共通信，具体权限仍按 Gemini 核实 |
| Kimi Code CLI | kimi acp；官方说明由 IDE 启动子进程并复用自身认证状态 | 可与 Gemini 共享 ACP 公共部分，不推断所有 Kimi 版本支持当前命令 |
| Cursor Agent | agent -p，JSON/stream-json 输出 | 独立结构化流适配，不抓取交互终端文字 |
| 本机推理服务（对照） | 如 Ollama 提供本机 HTTP API | 不等同于 CLI 集成；本轮不新增此产品范围 |

ACP 解决客户端与 Agent 的通信标准化，有主协议版本和能力协商；不是所有工具都原生支持同一协议。Codex App Server 不等于 ACP 或 MCP。MCP 面向向 Agent 提供工具与资料，不能当作所有本机 AI 的统一生成接口。

Claude SDK 文档明确对第三方产品提供 claude.ai 登录/额度设有限制并要求 API Key；消费者订阅帮助说明又区分 SDK 个人使用场景。技术上能调用 CLI 不足以承诺任意第三方软件都可以复用订阅。本项目接入前须核实产品发布场景，不提取令牌或伪装客户端。

## 当前实现核对

- src-tauri/src/ai_providers.rs：codex_generation_supported 精确匹配 codex-cli 0.146.0 / 0.163.0；测试与生成均调用。当前安装返回 0.164.0，因白名单被主动拒绝，不代表实际协议不兼容或模型连接失败。
- 已采用 App Server/stdio，非终端 UI 自动化；读取配置和模型目录，生成时建立临时工作目录与临时会话，流式接收输出并支持取消。
- 为满足“只使用明确选定资料”，当前实现启用 experimentalApi，并传入 environments: []、dynamicTools: []、runtimeWorkspaceRoots: []、selectedCapabilityRoots: []、allowProviderModelFallback: false，以及多个工具/扩展开关。
- 本机 0.164.0 离线导出 stable 与 --experimental 两份 schema 后确认：上述五个 ThreadStartParams 字段均仅在实验 schema 出现。这验证了接口分层，未验证其运行隔离语义。
- 临时目录只约束工作位置；read-only 主要限制写入，不能被当作“完全不能读取其他文件”。拒绝审批也不等于删除全部工具。不能仅删除白名单或把版本比较改为 >= 即宣称完成兼容。

## 建议实施方向（未实施）

1. 保持现有 Rust 任务/存储/取消流程，复用现有 AiRunner 入口；每个官方工具使用薄适配器，避免另造完整 Agent 框架。
2. 分开表示安装发现、协议可用、认证状态、模型可用及本应用权限要求是否满足。失败明确指出原因，不把所有错误归为“版本不支持”。
3. 优先稳定协议字段，能力和响应决定功能是否可用；缺失关键能力时明确停止当前接入，不自动降级、换工具、换模型或升级用户安装。
4. 先确定 Codex 文本写作所需的可验证隔离合同。稳定 App Server 是否足以满足无任意资料读取，或必须结合平台隔离/少量实验字段，需专项证明。schema 存在、配置接受或返回 readOnly 都不能单独证明完全无工具访问。
5. 通信与安全边界确定后再移除精确白名单，保留最低要求/已知不兼容记录；用最低支持版、当前稳定版和协议合成边界做代表性回归，不把每个补丁版本变成人工开通步骤。
6. 设置只做必要的元数据检测；显式连接测试才发送合成消息。连接读取保持局部忙碌，不锁全局导航。外壳列表“已安装”与“可用于当前任务”分别表达。

验收需覆盖协议变动、新增未知通知/字段、必要字段缺失、认证失效、目录不可用、停止/超时、子进程退出及资料/工具边界。隐私隔离与取消保留自动化保护，不仅凭一次模型回答判断兼容。

## 证据与限制

使用文档检索技能与 Context7 CLI（先 library Codex，再 docs /openai/codex）核实官方实验字段说明；联网查阅以下一手资料。离线执行本机 codex --version 与 schema 生成到 /tmp，未发送模型消息、未读取日记或密钥、未改业务实现。版本命令出现沙箱禁止创建 PATH aliases 警告，但成功退出且导出完成；不将该输出当成真实模型连通证据。当前真实生成兼容、运行时工具隔离及跨平台实现仍未验证。

## 来源

- [OpenAI App Server 架构与向后兼容](https://openai.com/index/unlocking-the-codex-harness/)
- [Codex App Server：协议、schema、实验 API 与认证](https://developers.openai.com/codex/app-server/)
- [Codex 官方 ThreadStartParams 源码](https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/src/protocol/v2/thread.rs)
- [Claude Code 非交互接口](https://code.claude.com/docs/en/headless)
- [Claude Agent SDK 与第三方认证说明](https://code.claude.com/docs/en/agent-sdk/overview)
- [Claude 订阅与 SDK 使用说明](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)
- [Gemini ACP](https://geminicli.com/docs/cli/acp-mode/)
- [Kimi ACP 集成与认证复用](https://www.kimi.com/code/docs/en/kimi-code-cli/guides/ides)
- [Cursor Headless](https://cursor.com/docs/cli/headless)
- [ACP 初始化/版本与能力协商](https://agentclientprotocol.com/protocol/initialization)
- [Ollama 本机与云 API 区分](https://github.com/ollama/ollama/blob/main/docs/api/introduction.mdx)

## 2026-10-26 实施授权与验收合同

用户批准按调研改造。首批只修改现有 Codex 接入，不自动新增其他 CLI 生成能力。去除精确版本白名单及扫描阶段“支持生成”的推断；生成前由当前二进制导出实验协议 schema，检查所用 v2 请求/响应及隔离字段形状，失败/超时/取消不发送正文。继续采用官方临时结构化线程的无环境/无扩展模式，核对线程返回权限、模型及空工作区根，流式阶段拒绝工具项目和交互请求。未知扩展通知可忽略，关键字段/类型缺失需报错。保留实验能力依赖的明确边界，不改为笼统版本 >= 判断，不放宽权限。

自动化覆盖未来版本同合同可用、旧版缺能力拒绝、模式损坏、错误模型/权限/工作区根、工具调用、取消、流式结果一致性。真实 0.164.0 仅用本地合成提供商验证，不调用付费模型、不使用私人资料。运行时合同与代表性验证不代表任意未来版本已被预先审计。

## 已实施结果

精确版本白名单已删除；安装扫描与 inspect 不再返回由版本号推测的 generationSupported/compatible。生成前由选定二进制导出 v2 实验 schema，验证 ThreadStartParams/Response、TurnStartParams 必需字段和关键隔离值类型；导出输出有时间/文件大小上限、支持取消，临时文件回收。目录查询/连接握手仍独立，不自动发模型请求。

线程与每轮均显式传空 environments，保留工具/扩展/MCP 禁用、临时会话、read-only 和不替换模型；响应要求 networkAccess 明确为 false，模型/工作目录/审批策略匹配，runtimeWorkspaceRoots 必须为空。未知普通通知不影响正文；工具项目、审批和其他交互仍拒绝。模型目录读取使用局部 busy，设置导航不再受其影响。

保留少量必要实验字段，未宣称稳定接口单独足以满足无资料遍历要求；仍需对未来协议语义变化维护代表性验证。当前协议字段缺失/格式异常会显示具体能力错误，不降级权限、不升级或换装 CLI。

可重复验证：`python3 scripts/ci/verify-local-cli.py`。脚本隔离 CODEX_HOME、只继承编译所需系统环境、不继承模型凭据，使用回环 HTTP 合成提供商，运行显式忽略的 installed_cli_with_synthetic_provider 测试。实际安装 codex-cli 0.164.0 已两次完成应用生成链路，每次合成请求 1 次，tools 数量 0，正文完成；未使用真实服务。源码参考：[官方临时无工具线程](https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/tui/src/temporary_structured_request.rs)。

## 错误与恢复事件修正（2026-10-26）

官方 ErrorNotification 的 willRetry=true 表示 CLI 仍在恢复当前回合，不应被客户端当成最终失败。现先匹配 thread/turn，仅将最终错误终止；turn/start 确认前收到的通知保留到回合循环处理，失败 turn/completed 读取结构化错误。最终错误显示固定的认证/额度/频控/上下文/服务不可用分类或合法 HTTP 数字，不透传可能包含私密内容的 message/additionalDetails。未知类别明确无法识别，不猜测原因。没有新增应用层重试或切换模型。

脚本现在故意截断第一条合成流，允许 CLI 恢复一次，断言两次本地请求均无工具并最终成功；真实安装 0.164.0 已通过。协议测试覆盖恢复通知在确认前后到达、无关线程错误忽略、最终 HTTP 错误、失败完成事件的认证类别及错误正文不外泄。原生回归最终 8 项通过，1 项显式本机测试单独通过，Clippy lib/diff 通过。用户真实账号回合错误不读取日志/正文、不代发请求，修复后由用户重新测试确认；不把合成复现当作该真实服务必然已恢复。

来源：[官方 ErrorNotification](https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/src/protocol/v2/notification.rs)，已用 Context7 library→docs 核实。
