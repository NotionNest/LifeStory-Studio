# 合成长聊天测量存档

此目录是 2026-10-28 的一次性性能实验及原始证据，不是产品入口或通用组件库测试；不会被 Vite 应用或日常业务测试自动加载。合成中文文本不包含真实记录、图片、密钥或模型调用。

- browser.json：四种策略、三档规模，每档三次挂载，每次三次更新；含原始计时，不以平均值隐藏异常值。
- native.txt：真实 DatabaseWorker 完整 workspace 与索引 LIMIT 查询，debug test，每档五次。分页查询只测消息内容，不冒充完整新 IPC 的端到端性能。
- environment.json：版本、规模、容器和源文件哈希。heapBytes 是累计运行期间的浏览器堆采样，受 GC/前序案例影响，不用于内存优化结论。
- MessageListPrototype.tsx：从当时消息视图提取 memo 行的实验副本，只用于比较，不会更新产品实现。它不验证分页、搜索或动态高度虚拟化的交互正确性。

浏览器复现：在项目根目录，显式提供本机已有的 Playwright 模块和 Chromium/Chrome 可执行文件，再运行：

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
CHROME_EXECUTABLE=/absolute/path/to/chrome \
node docs/development/evidence/chat-long-history-2026-10-28/run.mjs
```

可追加 --smoke 仅运行每种策略一轮100条，检查测量装配，不作为完整性能结果。脚本绑定 127.0.0.1:1437，生产构建和原始结果写入独立临时目录；不自动安装、降级或切换浏览器。需允许本地端口/无头浏览器进程。修改后的产品源码会被基线案例使用，存档 memo 原型仍是当时快照，比较前应审阅对应差异；不要将实验副本作为正式维护入口。基准期间 DOM 必须达到预期规模，控制台出错会使测量失败。

数据库复现（仅临时合成 SQLite）：

```sh
cargo test --locked --manifest-path src-tauri/Cargo.toml --test chat_performance -- --ignored --nocapture
```

该测量显式 ignored，普通 cargo test 不会自动执行长历史规模。完整结论及工程决策见 ../../CHAT_LONG_HISTORY_MEASUREMENT.md。


2026-10-29 生产实现后更新：旧全量 workspace 入口已删除，当前 chat_performance 显式测试只测真实 ai_chat_window 的 100 条尾页及元数据，并核对窗口数量和顺序，输出 WINDOW_BENCH。上面的原生运行命令仍可用，但当前结果不能与 native.txt 的旧全量/原始 SQL 数据视作同一实现；复现 10 月 28 日指标须使用当时源码。原始 native.txt、browser.json 与环境哈希保留，本轮没有重新运行规模性能测量。
