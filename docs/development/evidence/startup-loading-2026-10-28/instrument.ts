import { recordsApi } from '@/services/records'
import { desktop } from '@/services/desktop'
const endpoint = 'http://127.0.0.1:1438/metric'
const frames = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  )
async function report(value: object) {
  await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...value,
      timeOrigin: performance.timeOrigin,
      now: performance.now(),
      epoch: Date.now(),
    }),
  })
}
async function wait(check: () => boolean) {
  const start = performance.now()
  while (!check()) {
    if (performance.now() - start > 30000)
      throw new Error('Page did not become ready: ' + location.hash)
    await new Promise((r) => setTimeout(r, 5))
  }
  await frames()
}
const exists = (selector: string) => Boolean(document.querySelector(selector))
async function visit(name: string, path: string, ready: () => boolean, phase: string) {
  const start = performance.now()
  location.hash = path
  await wait(ready)
  const elapsed = performance.now() - start
  await report({ event: 'page', name, phase, elapsed, path })
  return elapsed
}
async function run() {
  void report({ event: 'module-ready', hash: location.hash })
  setTimeout(
    () =>
      void report({
        event: 'diagnostic',
        visibility: document.visibilityState,
        focus: document.hasFocus(),
        home: exists('[aria-label="日记首页"]'),
        busy: [...document.querySelectorAll('[aria-busy="true"]')].map((n) =>
          n.getAttribute('aria-label'),
        ),
      }),
    500,
  )
  await wait(
    () => exists('[aria-label="日记首页"]') && !document.querySelector('[aria-busy="true"]'),
  )
  await report({
    event: 'startup',
    moduleStart,
    ready: performance.now(),
    resources: performance
      .getEntriesByType('resource')
      .map((entry: any) => ({
        name: entry.name.split('/').pop(),
        duration: entry.duration,
        bytes: entry.transferSize,
      })),
  })
  const runtime = await desktop.readRuntimeInfo()
  if (!runtime.storage.dataDirectory.includes('dev.lifestory.studio.startup-'))
    throw new Error('Expected isolated benchmark data directory')
  await report({ event: 'isolation', directoryVerified: true })
  const record = await recordsApi.create(crypto.randomUUID(), '2026-10-28', 'Asia/Shanghai')
  const pages = [
    ['diary', '/diaries/' + record.id, () => exists('[aria-label="记录标题"]')],
    [
      'history',
      '/diaries/' + record.id + '/history',
      () =>
        exists('[aria-label="日记历史与恢复"]') && !document.body.textContent?.includes('正在读取'),
    ],
    ['chat', '/chats/new', () => exists('[aria-label="聊天输入"]')],
    ['appearance', '/settings/appearance', () => exists('[aria-label="主题模式"]')],
    ['api', '/settings/models/api', () => exists('[aria-label="AI 服务设置"]')],
    [
      'trash',
      '/settings/trash/diary',
      () => exists('[aria-label="日记回收站"]') && !document.body.textContent?.includes('正在读取'),
    ],
  ] as const
  for (const [name, path, ready] of pages) await visit(name, path, ready, 'first')
  const cliStart = performance.now()
  await visit('cli', '/settings/models/cli', () => exists('[aria-label="本机 CLI 设置"]'), 'first')
  await wait(() => !document.body.textContent?.includes('正在扫描 CLI'))
  await report({ event: 'cli-scan-ready', elapsed: performance.now() - cliStart })
  for (const [name, path, ready] of pages) await visit(name, path, ready, 'repeat')
  await report({
    event: 'done',
    alerts: [...document.querySelectorAll('[role="alert"]')].map((n) => n.textContent),
    resourceCount: performance.getEntriesByType('resource').length,
  })
  await desktop.exit()
}
const moduleStart = performance.now()
window.addEventListener('error', (e) => void report({ event: 'error', message: e.message }))
window.addEventListener(
  'unhandledrejection',
  (e) => void report({ event: 'error', message: String(e.reason) }),
)
void run().catch(async (cause) => {
  try {
    await report({ event: 'error', message: String(cause) })
  } finally {
    await desktop.exit()
  }
})
