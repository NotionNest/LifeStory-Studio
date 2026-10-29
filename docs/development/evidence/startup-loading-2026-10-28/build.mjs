import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
const project = process.cwd(),
  require = createRequire(project + '/package.json')
const { build } = await import(require.resolve('vite'))
const variant = process.argv[2] ?? 'baseline'
if (!['baseline', 'route-lazy', 'editor-lazy'].includes(variant)) throw new Error('Unknown variant')
if (!process.env.STARTUP_BENCH_DIR || !process.env.STARTUP_BENCH_BATCH)
  throw new Error('Set STARTUP_BENCH_DIR and a fresh STARTUP_BENCH_BATCH')
if (!/^[a-z0-9-]+$/.test(process.env.STARTUP_BENCH_BATCH))
  throw new Error('Use a lowercase batch identifier')
await fs.mkdir(process.env.STARTUP_BENCH_DIR, { recursive: true })
const dir = await fs.realpath(process.env.STARTUP_BENCH_DIR)
await fs.copyFile(new URL('./instrument.ts', import.meta.url), dir + '/instrument.ts')
const modules = []
await build({
  configFile: project + '/vite.config.ts',
  plugins: [
    {
      name: 'isolated-startup-probe',
      enforce: 'pre',
      resolveId(id) {
        if (id === 'virtual:startup-diary-pages') return '\0startup-diary-pages'
      },
      load(id) {
        if (id === '\0startup-diary-pages')
          return "export {DiaryDetailLayout} from '@/features/library/DiaryDetailLayout';export {DiaryEditorPage} from '@/features/library/DiaryEditorPage';export {DiaryHistoryPage} from '@/features/library/DiaryHistoryPage';"
      },
      transform(source, id) {
        if (id === project + '/src/main.tsx')
          return 'import ' + JSON.stringify(dir + '/instrument.ts') + ';\n' + source
        if (variant !== 'baseline' && id === project + '/src/router/router.tsx') {
          const all = {
            DiaryDetailLayout: 'library/DiaryDetailLayout',
            DiaryEditorPage: 'library/DiaryEditorPage',
            DiaryHistoryPage: 'library/DiaryHistoryPage',
            ChatWorkspace: 'chat/ChatWorkspace',
            ChatMessagesPage: 'chat/ChatMessagesPage',
            ChatDiaryPreviewPage: 'chat/ChatDiaryPreviewPage',
            SettingsLayout: '../layouts/SettingsLayout',
            ModelsLayout: '../layouts/ModelsLayout',
            AppearancePage: 'settings/SettingsPages',
            TrashPage: 'settings/SettingsPages',
            AiSettingsView: 'settings/AiSettings',
            LocalCliSettingsView: 'settings/LocalCliSettings',
          }
          const map =
            variant === 'editor-lazy'
              ? Object.fromEntries(
                  Object.entries(all).filter(([key]) =>
                    ['DiaryDetailLayout', 'DiaryEditorPage', 'DiaryHistoryPage'].includes(key),
                  ),
                )
              : all
          for (const [name, target] of Object.entries(map)) {
            source = source.replace(
              new RegExp('^import \\{[^\\n]*\\b' + name + '\\b[^\\n]*\\} from [^\\n]*\\n', 'm'),
              (line) => {
                const names = line
                  .match(/\{([^}]+)\}/)[1]
                  .split(',')
                  .map((s) => s.trim())
                  .filter((n) => !Object.hasOwn(map, n))
                return names.length ? line.replace(/\{[^}]+\}/, '{ ' + names.join(', ') + ' }') : ''
              },
            )
            const module =
              variant === 'editor-lazy'
                ? 'virtual:startup-diary-pages'
                : target.startsWith('../')
                  ? '@/' + target.slice(3)
                  : '@/features/' + target
            source = source.replace(
              new RegExp('Component: ' + name + '\\b', 'g'),
              `lazy: async () => ({ Component: (await import('${module}')).${name} })`,
            )
          }
          return source
        }
      },
      generateBundle(_, bundle) {
        for (const [name, chunk] of Object.entries(bundle))
          if (chunk.type === 'chunk')
            modules.push({
              name,
              isEntry: chunk.isEntry,
              bytes: Buffer.byteLength(chunk.code),
              imports: chunk.imports,
              dynamicImports: chunk.dynamicImports,
              modules: Object.keys(chunk.modules).map((n) => n.replace(project + '/', '')),
            })
      },
    },
  ],
  build: { outDir: dir + '/' + variant + '-dist', manifest: true, emptyOutDir: true },
})
await fs.writeFile(dir + '/' + variant + '-chunks.json', JSON.stringify(modules, null, 2))
const config = JSON.parse(await fs.readFile(project + '/src-tauri/tauri.conf.json', 'utf8'))
const windows = config.app.windows.map((w) => ({
  ...w,
  alwaysOnTop: true,
  focus: true,
  visible: true,
}))
const override = {
  productName: 'LifeStory Startup ' + variant,
  identifier: 'dev.lifestory.studio.startup-' + process.env.STARTUP_BENCH_BATCH + '-' + variant,
  build: { beforeBuildCommand: null, frontendDist: dir + '/' + variant + '-dist' },
  app: { windows, security: { csp: config.app.security.csp + ' http://127.0.0.1:1438' } },
  bundle: { active: true, targets: ['app'] },
}
await fs.writeFile(dir + '/' + variant + '.json', JSON.stringify(override, null, 2))
