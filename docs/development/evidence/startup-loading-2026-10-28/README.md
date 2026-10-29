# macOS 桌面启动与页面首开测量存档

2026-10-28。真实 Tauri/WKWebView 窗口、生产前端、debug 原生程序；三组各5次新进程，仅独立 QA 标识下的合成空日记。不是浏览器模拟 IPC，也不是签名 release / Windows 成果。不会加入正常应用入口、日常业务测试或自动 CI。

## 证据

- `*-metrics.json`：启动墙钟、document 时钟、首次/再次切页、CLI 扫描与错误检查原始事件；日期/记录标识全部属于本次合成库。
- `summary.json`：汇总中位数及实际输出文件字节数。初始 JS 按入口的静态 imports 闭包计算，不只看 index 文件。chunks.json 的 bytes 是构建插件阶段快照，汇总使用最终落盘字节。
- `*-chunks.json`：模块与静态/动态导入图；Tauri 的 tauri: 资源未完整暴露给 ResourceTiming，不能把空资源计时解释为加载零成本。
- `*-config.json`：实际测量覆盖配置。frontendDist 为当时的临时目录，复现时由 build.mjs 重新生成；不会覆盖正式 tauri.conf.json。
- `environment.json`：版本、窗口、数据规模和源码哈希。

三种变体：baseline 保留静态加载；route-lazy 将多数非首页路由变为 lazy；editor-lazy 只把日记编辑/历史合为同一延迟组。loader、默认首页、Root/ErrorBoundary 和窗口 Provider 均保持常驻。所有源变换仅存在于测量构建插件中，不写 src。

## 复现（从项目根目录执行）

需本地 Rust/Tauri/macOS 构建环境、可见桌面、空闲的 127.0.0.1:1438。设置独立输出目录和从未使用的新批次标识，让三种变体从同样的空 QA 库开始；不要使用正式应用标识。

```sh
export STARTUP_BENCH_DIR=/private/tmp/lifestory-startup-recheck
export STARTUP_BENCH_BATCH=recheck-20261028
node docs/development/evidence/startup-loading-2026-10-28/build.mjs baseline
npm run tauri -- build --debug --bundles app --config "$STARTUP_BENCH_DIR/baseline.json" -- --locked
```

对 route-lazy / editor-lazy 重复两条构建命令，然后在**全部构建结束后**依次运行三个测量命令，避免并发编译干扰：

```sh
node docs/development/evidence/startup-loading-2026-10-28/run.mjs baseline
node docs/development/evidence/startup-loading-2026-10-28/run.mjs route-lazy
node docs/development/evidence/startup-loading-2026-10-28/run.mjs editor-lazy
```

程序会打开置顶 QA 窗口、以真实业务 IPC 创建一条合成空日记、自动切页，记录后退出；每变体运行5次。目录校验必须确认运行的是 `dev.lifestory.studio.startup-*` 独立应用数据目录。探针只向本机端口发送时序/合成路由，临时 CSP 只用于测量构建；不读取正式日记、不调用模型、不保存密钥。

置顶用于控制 WKWebView 遮挡导致的 animation-frame 暂停。计时包含两帧等待，短页面存在约25–30ms下限；不清空 OS/WebKit 缓存，也不把每个新进程叫作完全冷启动。首次启动样本单列原始数据，不据单个异常值推断收益。

测量后恢复普通构建，保证 target/debug 的常用可执行文件不含探针：

```sh
npm run tauri -- build --debug --no-bundle -- --locked
```

本轮已经执行恢复，并检查正常 dist 与 debug 可执行文件均不含测量端点。没有修改正式 CSP、权限、路由或 Provider。QA 数据保留在专属应用目录，未删除或清空正常应用数据。
