import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { desktopAvailable, readRuntimeInfo, type RuntimeInfo } from '../shared/runtime'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import './app.css'

const EditorProbe = lazy(() => import('../features/environment/EditorProbe').then(
  ({ EditorProbe }) => ({ default: EditorProbe }),
))

type EnvironmentState =
  | { status: 'loading' }
  | { status: 'ready'; info: RuntimeInfo }
  | { status: 'error'; message: string }

export default function App() {
  const [environment, setEnvironment] = useState<EnvironmentState>({ status: 'loading' })
  const request = useRef(0)

  const refresh = useCallback(async () => {
    if (!desktopAvailable) return
    const current = ++request.current
    setEnvironment({ status: 'loading' })
    try {
      const info = await readRuntimeInfo()
      if (current === request.current) setEnvironment({ status: 'ready', info })
    } catch (error) {
      if (current === request.current) {
        setEnvironment({ status: 'error', message: String(error) })
      }
    }
  }, [])

  useEffect(() => {
    void refresh()
    return () => { request.current += 1 }
  }, [refresh])

  return (
    <main className="mx-auto max-w-[980px] px-6 py-8 md:px-10">
      <header className="flex items-center justify-between gap-4">
        <span className="text-[22px] font-semibold tracking-tight">LifeStory Studio</span>
        <Badge variant="outline">开发环境</Badge>
      </header>
      <section className="flex flex-col gap-3 pt-9 pb-7">
        <p className="text-sm text-muted-foreground">桌面工程 · 环境检查</p>
        <h1 className="text-[clamp(26px,3vw,34px)] font-medium tracking-tight">让创作从可靠的基础开始。</h1>
        <p className="text-sm leading-7 text-muted-foreground">当前验证桌面运行、Rust 通信、本地资料库与长文编辑。日记及创作功能将在后续开发。</p>
      </section>

      <section className="py-6" aria-labelledby="runtime-heading">
        <header className="flex items-center justify-between gap-4">
          <h2 id="runtime-heading" className="text-base font-semibold">运行环境</h2>
          <Button
            variant="secondary"
            type="button"
            onClick={() => void refresh()}
            disabled={!desktopAvailable || environment.status === 'loading'}
          >重新检查</Button>
        </header>
        {!desktopAvailable ? (
          <p role="status">当前是浏览器预览。请运行 npm run desktop:dev，在桌面窗口检查 Rust 与资料库。</p>
        ) : environment.status === 'loading' ? (
          <p role="status">正在读取本地运行信息…</p>
        ) : environment.status === 'error' ? (
          <p role="alert">{environment.message}</p>
        ) : (
          <>
            <p role="status" className="mt-4 text-sm text-primary">React → Rust → SQLite 通信已完成</p>
            <dl className="mt-5 grid grid-cols-1 gap-x-8 gap-y-4 text-sm md:grid-cols-2 [&_dt]:mb-1 [&_dt]:text-xs [&_dt]:text-muted-foreground [&_dd]:wrap-anywhere">
              <div><dt>应用版本</dt><dd>{environment.info.appVersion}</dd></div>
              <div><dt>运行平台</dt><dd>{environment.info.platform} / {environment.info.architecture}</dd></div>
              <div><dt>SQLite</dt><dd>{environment.info.storage.sqliteVersion}</dd></div>
              <div><dt>资料格式</dt><dd>Schema {environment.info.storage.schemaVersion}</dd></div>
              <div><dt>中文检索引擎</dt><dd>{environment.info.storage.fts5Available ? 'FTS5 trigram 可用' : '不可用'}</dd></div>
              <div className="col-span-full"><dt>本地资料目录</dt><dd>{environment.info.storage.dataDirectory}</dd></div>
            </dl>
          </>
        )}
      </section>
      <Suspense fallback={<p role="status">正在加载编辑器…</p>}>
        <EditorProbe />
      </Suspense>
      <footer className="pt-4 text-sm text-muted-foreground">本地保存 · 无云同步 · 当前未连接 AI 服务</footer>
    </main>
  )
}
