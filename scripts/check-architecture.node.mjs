import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { checkArchitecture } from './check-architecture.mjs'

function fixture(files, check) {
  const root = mkdtempSync(join(tmpdir(), 'lifestory-architecture-'))
  try {
    const all = {
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          paths: { '@/*': ['./src/*'] },
        },
        include: ['src'],
      }),
      ...files,
    }
    for (const [file, content] of Object.entries(all)) {
      mkdirSync(dirname(join(root, file)), { recursive: true })
      writeFileSync(join(root, file), content)
    }
    return check(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}
const rules = (root) => checkArchitecture(root).errors.map((error) => error.rule)

test('accepts the entry point, legitimate feature collaboration, assets and type-only cycles', () => {
  fixture(
    {
      'src/main.tsx': "import './app/App'",
      'src/app/App.tsx': "import '../features/chat/session'; import '../styles/global.css'",
      'src/features/chat/session.ts': "import '../library/actions'",
      'src/features/library/actions.ts': 'export const save = true',
      'src/features/settings/view.ts': "import '../../layouts/SettingsLayout'",
      'src/layouts/SettingsLayout.ts': 'export const layout = true',
      'src/components/Image.ts': "import '@/services/records'",
      'src/services/records.ts':
        "import type { Attachment } from './attachments'; export interface Record {image: Attachment}",
      'src/services/attachments.ts':
        "export { type Record } from './records'; export interface Attachment {id: string}",
      'src/styles/global.css': 'body { margin: 0 }',
      'src/example.test.ts': "import './missing-test-fixture'",
      'src/test/provider.ts': "import '../app/App'",
    },
    (root) => assert.deepEqual(rules(root), []),
  )
})

test('checks app boundaries through aliases, relative paths, exports and literal module loading', () => {
  for (const code of [
    "import App from '@/app/App'",
    "export * from '../app/App'",
    "export { type App } from '@/app/App'",
    "const load = () => import('../app/App')",
    "const app = require('@/app/App')",
    "import App = require('../app/App')",
    "type App = typeof import('@/app/App')",
  ])
    fixture(
      { 'src/app/App.ts': 'export default class App {}', 'src/features/bad.ts': code },
      (root) => assert.ok(rules(root).includes('app-entry'), code),
    )
})

test('prevents shared foundations from depending on pages, including type and style imports', () => {
  for (const layer of ['lib', 'services', 'components', 'shared']) {
    for (const code of [
      "import type { Page } from '../features/page'",
      "import '../features/page.css'",
    ]) {
      fixture(
        {
          'src/features/page.ts': 'export interface Page {}',
          'src/features/page.css': 'body {}',
          [`src/${layer}/bad.ts`]: code,
        },
        (root) => assert.ok(rules(root).includes('foundation')),
      )
    }
  }
})

test('detects runtime cycles through mixed imports, re-exports, side effects and dynamic imports', () => {
  for (const code of [
    "import {type B, value} from './b'; export const result = value",
    "export * from './b'",
    "import {} from './b'",
    "const load = () => import('./b')",
  ])
    fixture(
      {
        'src/features/a.ts': code,
        'src/features/b.ts':
          "export * from './a'; export interface B {}; export const value = true",
      },
      (root) => assert.ok(rules(root).includes('runtime-cycle')),
    )
})

test('resolves directory indexes and rejects missing local modules and empty directories', () => {
  fixture(
    {
      'src/features/a.ts': "import '@/lib'; import './missing'; import './empty'",
      'src/lib/index.ts': 'export const value = true',
      'src/features/empty/asset.css': 'body {}',
    },
    (root) => {
      const errors = checkArchitecture(root).errors
      assert.equal(errors.filter((error) => error.rule === 'unresolved-local').length, 2)
      assert.ok(errors.every((error) => error.file === 'src/features/a.ts' && error.line === 1))
    },
  )
})

test('limits native SDK imports to services, including type imports and dynamic imports', () => {
  fixture(
    {
      'src/services/desktop.ts': "import {invoke} from '@tauri-apps/api/core'",
      'src/features/bad.ts':
        "import type {Event} from '@tauri-apps/api/event'; import('@tauri-apps/api/core')",
    },
    (root) => assert.equal(rules(root).filter((rule) => rule === 'native-sdk').length, 2),
  )
})

test('rejects production dependencies on test support or files outside src', () => {
  fixture(
    {
      'src/features/a.ts': "import '../test/provider'; import '../../tool'; import './b.test'",
      'src/test/provider.ts': 'export const test = true',
      'src/features/b.test.ts': 'export const test = true',
      'tool.ts': 'export const tool = true',
    },
    (root) => {
      assert.equal(rules(root).filter((rule) => rule === 'production-test').length, 2)
      assert.ok(rules(root).includes('outside-src'))
    },
  )
})

test('fails closed on computed module paths and syntax errors', () => {
  fixture(
    {
      'src/features/bad.ts': "const path = './a'; import(path); require(path)",
      'src/features/syntax.ts': 'export const =',
    },
    (root) => {
      assert.equal(rules(root).filter((rule) => rule === 'dynamic-import').length, 2)
      assert.ok(rules(root).includes('parse-error'))
    },
  )
})

test('the real CLI fails on a violation and succeeds after it is fixed', () => {
  fixture({ 'src/features/bad.ts': "import './missing'" }, (root) => {
    const script = fileURLToPath(new URL('./check-architecture.mjs', import.meta.url))
    const run = () => spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' })
    const failure = run()
    assert.equal(failure.status, 1)
    assert.match(failure.stderr, /unresolved-local/)
    writeFileSync(join(root, 'src/features/bad.ts'), 'export const value = true')
    assert.equal(run().status, 0)
    writeFileSync(join(root, 'tsconfig.json'), '{')
    assert.equal(run().status, 1)
  })
})

test('type-only return edges do not turn a legitimate value dependency into a runtime cycle', () => {
  for (const code of [
    "import type { A } from './a'",
    "import { type A } from './a'",
    "export type { A } from './a'",
    "type Module = typeof import('./a')",
  ])
    fixture(
      { 'src/features/a.ts': "import './b'; export interface A {}", 'src/features/b.ts': code },
      (root) => assert.deepEqual(rules(root), []),
    )
})
