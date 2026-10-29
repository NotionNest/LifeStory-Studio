# 前端架构、ESLint 与格式检查

2026-10-28，F-06，关联 REQ-12 / TASK-11。用户授权落实持续架构与可读性检查；以下是本轮工程实施约定，不增加产品功能或测试组件库。

## 开发命令

| 命令 | 行为 |
|---|---|
| `npm run lint` | ESLint 只读检查，错误或警告均返回非零 |
| `npm run lint:fix` | 应用 ESLint 支持的安全自动修复，随后仍须检查结果 |
| `npm run check:architecture` | 只读检查生产模块依赖，违规返回非零并显示文件、行号与规则名 |
| `npm run test:architecture` | 使用临时合成工程验证检查器及真实 CLI 的成功/失败边界 |
| `npm run format` | 按统一配置格式化自维护前端、相关工具与配置文件 |
| `npm run format:check` | 只读核对相同范围的格式，偏离基线返回非零 |
| `npm run check` | 架构、ESLint、格式、类型及既有 Rust 格式检查，不执行应用测试 |

修改后按影响范围运行相关检查。普通文案/样式不为格式规则新增行为测试，成功检查不机械重复。Prettier 负责排版，ESLint 负责代码问题；二者均锁定版本。架构检查继续复用 TypeScript。

## 依赖规则

检查器读取 tsconfig.json 的模块解析配置，遍历 `src` 下生产 TS/TSX/JS 模块。声明文件、`.test`/`.spec` 文件及 `test`/`__tests__` 目录不作为生产模块；生产代码反向引用测试文件仍会报错。语法错误、无生产模块或配置不可读取均失败。

| 规则 | 边界 |
|---|---|
| `unresolved-local` | 本地相对路径及配置中的别名必须可解析；支持目录 index，静态资源必须是实际文件 |
| `outside-src` | 生产代码不能用本地路径依赖源码目录外的开发文件 |
| `app-entry` | 仅 app 自身与 `src/main.tsx` 可依赖 app；其余代码通过被装配的接口协作 |
| `foundation` | components/lib/services/shared 不直接依赖 app/features/layouts/contexts/router，类型与样式引用同样受约束 |
| `native-sdk` | `@tauri-apps/` SDK 只允许 services 导入，Hook/会话持有生命周期 |
| `production-test` | 生产模块不能依赖测试或测试装配代码 |
| `runtime-cycle` | 值依赖图不可成环，错误显示依赖链；纯类型引用不进入此图 |
| `dynamic-import` | import/require 路径必须是字符串字面量，不能通过计算路径绕开检查 |

解析覆盖 import、export/re-export、字面量动态 import、require、import-equals 与类型级 import。混合类型/值导入作为值依赖，`import type`、全类型命名导入/导出和类型级 import 保留结构边界检查，但不制造运行时循环。records/attachments 的必要类型关系继续合法。

保留真实协作：路由组装业务页面、功能页面消费 layouts、聊天调用 DiaryActions，以及功能间已有共享视图；不按目录名称禁止所有跨功能引用。该规则检查直接依赖与模块循环，不解析 CSS 内部的 @import，也不替代类型检查、行为验证或原生权限检查。

## 格式基线

`.prettierrc.json` 使用两空格缩进、单引号、无行尾分号、100 列目标宽度与 LF；其余使用固定版本的默认规则。`printWidth` 是排版目标，不是删除功能或拆分函数的行数门槛。格式化不排序 Tailwind 类名，也不改业务实现。

命令覆盖 src、架构检查器、CI 路由策略脚本、根 TS/JSON 配置、eslint.config.mjs 及 common 检查工作流。`.prettierignore` 保留 shadcn 生成源码与 npm 锁文件格式；2026-10-29 用户要求将已定制的 `src/components/ui/sonner.tsx` 单独纳入项目格式，其他 UI 组件继续保留上游格式；组件库继续完全不编写或运行组件测试。文档、Rust、生成物和本地资料不在本轮格式化命令范围内。后续新增的自维护前端文件自动纳入相同基线。

## CI 接入

`.github/workflows/check.yml` 的 common 作业安装锁定依赖后，依次运行架构检查、检查器回归、ESLint、格式检查、类型/生产构建和既有前端行为测试。任一命令失败都会使 common 失败，既有 CI Gate 继续拒绝失败/取消/意外跳过的必要任务。

修改 `.prettierrc.json`、`.prettierignore` 、eslint.config.mjs 或架构检查器/回归脚本会选择 common 检查；CI 路由策略和工作流本身继续按既有共享配置规则选择相关轻量任务。版本候选沿用同一工作流。文档变化和其他平台的验证边界仍按 [Git 流程](GIT_WORKFLOW.md) 与 [测试策略](TESTING_POLICY.md)。接入配置不等同远程 CI 已实际执行，证据见 STATUS.md。

## ESLint 规则选择（2026-10-28）

使用 eslint.config.mjs Flat Config，启用 ESLint recommended、typescript-eslint recommended 、react-hooks/rules-of-hooks 和 react-hooks/exhaustive-deps，全部作为 error；lint 使用 --max-warnings 0。检查 src 下生产与业务测试 TS/TSX、根 TS 配置、自维护 scripts 下 MJS 及 ESLint 配置本身。浏览器源码使用 browser globals，Node 工具使用 node globals；TS 未使用参数仅允许明确的下划线前缀，未使用变量仍报错。src/components/ui 参与静态 lint，不编写或执行其组件测试，其他生成组件仍保留上游格式，Sonner 采用上述单独约定。

eslint-config-prettier 放在最后，关闭与 Prettier 冲突的格式规则；不在 ESLint 内再次运行 Prettier，不添加重复缩进、分号或类名排序规则。保留已有两空格、单引号、无分号、100 列目标与 LF。

2026-10-28 已完成 23 个文件、43 条依赖提示的逐项审查，并将 exhaustive-deps 作为 error 纳入现有 lint/check/CI common 门禁。按真实同步键补齐依赖、稳定共享回调、明确按日记页面实例初始化的数据；桌面事件/队列投递/首次扫描等非响应式动作使用 Effect Event 读取最新已提交值，不将整个可变上下文对象加入依赖。没有 eslint-disable、全局降级或危险自动补依赖。逐项触发条件与处理见 [Hooks 依赖审查记录](HOOK_DEPENDENCIES.md)。

Effect Event 仅供 Effect 或其异步/外部事件回调调用，不作为普通点击处理器，不用于隐藏应该重新同步的依赖。React 与类型声明的最低范围调整为 19.2，锁文件已安装的 React 19.3.1 与 @types/react 19.3.0 未升级。React Compiler 专属规则、Fast Refresh 仅导出组件限制和 type-checked 严格规则不属于本次基线；TypeScript strict、架构检查及行为测试继续独立执行。

依据：[typescript-eslint 推荐配置](https://typescript-eslint.io/getting-started/)、[格式化职责](https://typescript-eslint.io/users/what-about-formatting/)、[Hooks 调用规则](https://react.dev/reference/eslint-plugin-react-hooks/lints/rules-of-hooks)。版本兼容按安装时 npm peerDependencies 核实：typescript-eslint 支持本项目 TypeScript 6.0 与 ESLint 10。
