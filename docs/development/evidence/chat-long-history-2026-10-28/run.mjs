import fs from 'node:fs/promises'
import os from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { createRequire } from 'node:module'
const project = await fs.realpath(process.cwd())
const require = createRequire(project + '/package.json')
const { build, preview } = await import(require.resolve('vite'))
const react = (await import(require.resolve('@vitejs/plugin-react'))).default
const tailwind = (await import(require.resolve('@tailwindcss/vite'))).default
if (!process.env.PLAYWRIGHT_MODULE || !process.env.CHROME_EXECUTABLE)
  throw new Error(
    'Set PLAYWRIGHT_MODULE and CHROME_EXECUTABLE to installed local tools; this benchmark does not install dependencies',
  )
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const dir = await fs.realpath(path.dirname(fileURLToPath(import.meta.url)))
const output = await fs.mkdtemp(path.join(os.tmpdir(), 'lifestory-chat-measurement-'))
const config = {
  configFile: false,
  root: dir,
  plugins: [
    {
      name: 'synthetic-chat-context',
      enforce: 'pre',
      resolveId(source, importer) {
        if (importer?.endsWith('/ChatMessageList.tsx') && source === './ChatSessionProvider')
          return dir + '/shim.tsx'
      },
    },
    react(),
    tailwind(),
  ],
  resolve: {
    alias: {
      '@': project + '/src',
      react: project + '/node_modules/react',
      'react-dom': project + '/node_modules/react-dom',
    },
  },
  build: { outDir: output + '/dist', emptyOutDir: true },
  logLevel: 'warn',
}
await build(config)
const server = await preview({
  ...config,
  preview: { host: '127.0.0.1', port: 1437, strictPort: true },
})
let browser
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_EXECUTABLE,
    args: ['--enable-precise-memory-info'],
  })
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('http://127.0.0.1:1437')
  await page.waitForFunction(() => typeof window.bench === 'function')
  const results = []
  for (const policy of ['full', 'task-only', 'task-only-memo', 'page100-task-memo'])
    for (const count of process.argv.includes('--smoke') ? [100] : [100, 1000, 5000]) {
      const rows = []
      for (let i = 0; i < (process.argv.includes('--smoke') ? 1 : 3); i++)
        rows.push(
          await page.evaluate(({ count, policy }) => window.bench(count, 1024, policy), {
            count,
            policy,
          }),
        )
      if (errors.length) throw new Error(errors.join('\n'))
      results.push(...rows)
      console.log(JSON.stringify({ count, policy, rows }))
      await fs.writeFile(output + '/browser.json', JSON.stringify(results, null, 2))
    }

  console.log('Raw results:', output + '/browser.json')
} finally {
  await browser?.close()
  await new Promise((resolve) => server.httpServer.close(resolve))
}
