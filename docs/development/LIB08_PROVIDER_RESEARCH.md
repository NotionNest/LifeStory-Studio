# LIB-08 模型服务与接入协议调研

> 2026-10-26 最新规则：用户批准以必要协议/隔离合同替代精确版本白名单，已完成 Codex 首批改造。下文版本限制为历史记录，以 [本机接入调研与实施结果](LOCAL_AI_INTEGRATION_RESEARCH.md) 为当前入口。0.164.0 已通过真实二进制＋本地合成提供商验证，尚未验证真实账户模型回合。


2026-10-21。TASK-07 / REQ-03、REQ-11、REQ-13；DEC-07/13。用户要求由项目调研并覆盖主流服务及模型，不要求用户先指定一家。已实现协议适配、服务预设与本地任务流程；尚未完成真实服务账户联调。

## 覆盖方法

服务、协议与模型分开建模：同一服务可承载多个模型族，同一模型也可经多个平台调用。预置服务入口帮助配置，不把模型 ID 编译成白名单；使用服务模型列表（有权限且接口适用时）及显式输入模型 ID。模型目录须记录来源和获取日期，不把历史示例宣称为最新、免费或当前账户可用。

产品支持必须区分：官方文档有该能力、协议适配实现并通过合成服务测试、用户选定账户/端点/模型实际联调通过。当前达到文档调研及合成协议验证层，尚无收费模型调用证据。

## 通用 API 覆盖目标

以下为依据用户“至少主流”要求形成的实施覆盖目标，不是市场份额排名。实际 HTTP 字段、错误及终止语义逐入口验证。

| 服务 | 模型覆盖方式 | 适配方向及差异 | 官方依据 |
|---|---|---|---|
| OpenAI | GPT 等文字模型族，实际 ID 随目录/配置更新 | Responses 为原生入口；另支持 Chat Completions。显式 store:false，不使用云端会话自动累积资料 | [Responses 与迁移](https://developers.openai.com/api/docs/guides/migrate-to-responses) |
| Anthropic | Claude 系列 | 原生 Messages；独立认证、system 块与流式完成事件，不套用 Chat 数据结构 | [Messages](https://platform.claude.com/docs/en/api/messages/create) |
| Google AI Studio | Gemini 系列 | 原生 generateContent/streamGenerateContent；兼容入口单独标识，处理安全阻断与 finishReason | [兼容接口](https://ai.google.dev/gemini-api/docs/openai)、[API 概览](https://ai.google.dev/gemini-api/docs/api-overview) |
| xAI | Grok 系列 | 官方 Responses/Chat 端点分别映射；禁用搜索/工具扩展 | [官方 API](https://docs.x.ai/developers/rest-api-reference/inference/responses) |
| Mistral | Mistral 等文字模型 | Chat 协议映射，流式与模型列表逐项校验 | [官方 Chat API](https://docs.mistral.ai/api) |
| DeepSeek | DeepSeek 官方模型，ID 从服务获得/手填 | Chat 兼容，思考字段与普通正文分离，不能把推理全文当日记保存；Responses 另按能力登记 | [快速开始](https://api-docs.deepseek.com/quick_start)、[Responses](https://api-docs.deepseek.com/guides/responses_api/) |
| 阿里云百炼 | Qwen 及平台提供的文字模型 | OpenAI 兼容；地域、业务空间域名及密钥匹配，不把一个旧域名写成全球唯一入口 | [兼容指南](https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope) |
| 火山方舟 | 豆包及已开通模型/推理接入点 | Chat/Responses 等分别登记，模型名或接入点 ID 依据服务要求；不自动启用联网工具 | [官方兼容指南](https://console.volcengine.com/ark/region:cn-beijing/docs/compatible-with-openai-sdk) |
| Moonshot/Kimi | Kimi 系列 | Chat 兼容，模型间参数不同，保留必要的思考上下文须限定在当前对话且不展示为正文 | [官方兼容指南](https://platform.kimi.ai/docs/guide/migrating-from-openai-to-kimi) |
| 智谱/Z.ai | GLM 系列 | Chat 兼容；国内/国际及普通 API/Coding 订阅不可混用配置 | [智谱兼容说明](https://docs.bigmodel.cn/cn/guide/develop/openai/introduction) |
| MiniMax | MiniMax 文字模型 | Chat 兼容，思考字段和支持参数逐模型配置 | [官方 OpenAI SDK 指南](https://platform.minimax.io/docs/api-reference/text-openai-api) |
| 百度千帆 | ERNIE 及平台已开通模型 | v2 兼容协议，与旧 token 鉴权接口区别；本轮官方页面直接抓取超时，须补核端点与能力再落预设 | [官方 v2 SDK 文档](https://cloud.baidu.com/doc/qianfan-docs/s/Fm9l6ocai) |
| 腾讯云 | 混元/Tencent Hy 及平台模型 | 旧混元迁向 TokenHub，不能只接旧入口就称完整支持；按当前官方平台端点核实 | [迁移提醒及旧兼容接口](https://cloud.tencent.com/document/product/1729/111007)、[当前混元指南](https://intl.cloud.tencent.com/zh/document/product/1300/80695) |
| 硅基流动 | 平台提供的文字模型 | Chat 兼容，模型参数与是否支持结构化输出需分别核实 | [官方快速开始](https://docs.siliconflow.cn/docs/userguide/quickstart) |
| OpenRouter | 用户指定的单一模型与下游服务 | Chat 兼容；provider 路由必须显式选择，不使用模型自动路由、模型数组或故障兜底。allow_fallbacks:false 仍需配合受限 provider.only 核验实际目的地 | [官方路由说明](https://openrouter.ai/docs/guides/routing/provider-selection) |
| 自定义端点 | 用户有权调用的同协议文字模型 | 显式选择 Responses/Chat/Messages/Gemini 协议，端点和密钥绑定，不在单次生成中覆盖目的地 | 对应协议依据同上；不声称任意端点全面兼容 |

用户于 2026-10-21 明确：本轮覆盖通用 API；Azure OpenAI、AWS Bedrock、Vertex AI 企业云接入单独立项。它们具有独立企业身份、部署与区域配置；不能把通用 Base URL 接入宣称为其完整支持。其他本机 AI 工具仍按原决策待逐项确认，不以支持远程 Kimi/GLM 等 API 等同支持它们的本机 CLI。

## 能力与交互契约

1. 用户添加服务，明确地址、模型和凭据；系统凭据存储只提供写入/删除/已配置状态，前端不读回密钥。修改目的地不能自动复用旧目标密钥。远程 TLS 校验保持启用，不接受 URL 内凭据；禁止跨目标重定向携带密钥。
2. 测试连接只发送明确展示的合成文字；不开应用时自动测试，不用日记测试。每次任务展示服务/模型、文字来源及实际发送范围；图片本地保留，不默认发送。
3. 连接测试按配置记录文字流式结果与时间，不以单次测试推断所有模型能力或结构化输出支持。模型列表失败允许显式填写 ID，这属于正常配置方式，不代表自动换服务；不自动重发收费请求、修复 JSON 或切换模型。
4. 取消先写本地任务栅栏，再中止网络/子进程；收到晚到内容不能保存为正式消息/稿件。中断、截断、安全拒绝与正常结束区分；取消客户端接收不等于服务端停止计费。
5. 生成独立整理稿采用统一校验：不覆盖原文，标明来源版本，引用 ID/文字须真实；不同原生结构化能力不是统一强制参数。模型返回正文、思考信息与协议元数据分离，不记录密钥/原始错误体/推理全文。
6. 上下文超限明确告知，不静默丢弃选材。来源删除/回收时取消相关任务、解除任务来源摘录，再清理原文；稿件保留失效身份，完成提交前重新核验来源有效性。

## 本机 Codex 核实

适配器严格校验 Codex 0.163.0；本机全局 0.146.0 不符合隔离要求，会显示不兼容，不自动升级。已通过隔离 npm 缓存核对 0.163.0 schema 与对应版本官方源码，未修改全局 CLI、读取其私有凭据或开启真实模型回合。

实现临时工作目录、ephemeral 会话、只读且禁止网络的沙箱、禁用工具/浏览器/执行能力、清空运行时资料根与动态工具、逐个关闭继承的 MCP、清空 notify、关闭遥测配置，并拒绝所有服务器交互申请。仅接受 final_answer，取消时终止并回收子进程。合成 stdio 测试验证请求契约和中断，不等同真实 CLI 模型任务的隔离验证。

Codex 的输出预算是本地字节安全上限（配置 token 数乘 16，最多 4 MiB），不宣称可严格控制服务端 token 或费用。远程协议按其原生输出字段发送预算；Chat 可显式选择 max_tokens / max_completion_tokens。

依据：[官方 App Server](https://learn.chatgpt.com/docs/app-server)、[0.163.0 无工具临时请求实现](https://github.com/openai/codex/blob/rust-v0.163.0/codex-rs/tui/src/temporary_structured_request.rs)。协议不满足时显示具体原因，不自动提高权限或切换服务。

## 文档检索与验证状态

已使用 ctx7 library→docs 获取 Codex、OpenAI API、Anthropic 官方 SDK、Gemini API、keyring 资料，并直接读取上表官方服务文档。不同版本或新旧接口的示例不能混用，Gemini 的 Interactions 与 generateContent 尤须分开。文档支持不等于运行通过。

未使用真实 API Key、发起付费模型请求或发送真实资料。macOS 系统凭据仅用自建合成条目验证写入/读取/删除；Windows 未验证。模型目录按用户操作读取当前页，也可显式输入实际模型 ID，不宣称目录穷尽全部模型或当前账户有权使用。完整证据与限制见 [验证记录](LIB08_VERIFICATION.md)。
