import { spawnSync, execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { route, classify, requireCandidate } from './policy.mjs'
import { planCandidate } from './candidate.mjs'
test('only approved integration routes are allowed', () => {
  assert.equal(route('main','feat/diary'),false)
  assert.equal(route('main','release/0.1.0'),true)
  assert.equal(route('main','hotfix/restore'),true)
  assert.equal(route('develop','main'),true)
  assert.equal(route('develop','feat/diary'),true)
  assert.equal(route('release/0.1.0','fix/installer'),true)
  assert.equal(route('release/0.1.0','feat/diary'),false)
})
test('docs skip expensive checks; code/tool/shared changes select the necessary matrix', () => {
  assert.deepEqual(classify(['docs/product/PRD.md']),{common:false,desktop:false,images:false})
  assert.deepEqual(classify(['src-tauri/src/storage.rs']),{common:true,desktop:true,images:false})
  assert.deepEqual(classify(['tools/image-validation/src/lib.rs']),{common:false,desktop:false,images:true})
  assert.deepEqual(classify(['.github/workflows/check.yml']),{common:true,desktop:true,images:true})
  assert.deepEqual(classify(['src-tauri/src/storage.rs'],{releaseFix:true}),{common:true,desktop:false,images:false})
  assert.deepEqual(classify([],{candidate:true,full:true}),{common:true,desktop:true,images:true})
  for (const file of ['public/runtime.js', 'vitest.config.ts']) assert.deepEqual(classify([file]),{common:true,desktop:true,images:false})
  for (const file of ['new-runtime/config.js', ' scripts/ci/hidden.mjs']) assert.deepEqual(classify([file]),{common:true,desktop:true,images:true})
  assert.deepEqual(classify(['.github/pull_request_template.md']),{common:false,desktop:false,images:false})
  assert.deepEqual(classify(['docs/features/contracts/schema.sql']),{common:true,desktop:true,images:false})
})

test('preview version and app identity are isolated and mismatched version branches are rejected',()=>{
  const pkg={version:'0.1.0'},cfg={version:'0.1.0',identifier:'dev.lifestory.studio'}
  assert.deepEqual(planCandidate(pkg,cfg,'0.1.0','release/0.1.0','7'),{version:'0.1.0-rc.7',identifier:'dev.lifestory.studio.preview'})
  assert.throws(()=>planCandidate(pkg,cfg,'0.1.0','main','7'))
  assert.throws(()=>planCandidate(pkg,cfg,'0.2.0','release/0.1.0','7'))
})

test('CI Gate rejects failed, cancelled and unexpectedly skipped required checks', () => {
  const run = (results) => spawnSync(process.execPath, ['scripts/ci/gate.mjs'], {
    env: { ...process.env, JOB_RESULTS: JSON.stringify(results) }, encoding: 'utf8',
  }).status
  const results = { policy: { result: 'success', outputs: { common: 'true', desktop: 'false', images: 'false' } }, common: { result: 'success' }, desktop: { result: 'skipped' }, images: { result: 'skipped' } }
  assert.equal(run(results), 0)
  for (const result of ['failure', 'cancelled', 'skipped']) assert.notEqual(run({ ...results, common: { result } }), 0)
  assert.notEqual(run({ ...results, policy: { ...results.policy, result: 'failure' } }), 0)
  for (const outputs of [undefined, {}, { common: 'false' }, { common: 'false', desktop: 'false', images: 'yes' }]) {
    assert.notEqual(run({ policy: { result: 'success', outputs }, common: { result: 'skipped' }, desktop: { result: 'skipped' }, images: { result: 'skipped' } }), 0)
  }
})


test('release evidence requires the latest matching successful candidate and identical merge tree', () => {
  const pr = { head: { sha: 'release-sha', ref: 'release/0.1.0' } }
  const good = { id: 1, head_sha: pr.head.sha, head_branch: pr.head.ref, event: 'push', status: 'completed', conclusion: 'success' }
  const verify = (runs, tree = 'same-tree') => requireCandidate(pr, tree, 'same-tree', runs)
  assert.equal(verify([good]), good)
  assert.equal(verify([{ ...good, event: 'workflow_dispatch' }]).event, 'workflow_dispatch')
  assert.throws(() => verify([]))
  assert.throws(() => verify([good], 'different-merge-tree'))
  for (const change of [
    { head_sha: 'older-sha' }, { head_branch: 'release/0.2.0' }, { event: 'pull_request' },
    { status: 'in_progress' }, { conclusion: 'failure' }, { conclusion: 'cancelled' },
  ]) assert.throws(() => verify([{ ...good, ...change }]))
  assert.throws(() => verify([good, { ...good, id: 2, conclusion: 'failure' }]))
})

test('real policy CLI rejects missing candidate evidence and accepts only a validated candidate', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lifestory-ci-policy-'))
  const git = (...args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const policyPath = fileURLToPath(new URL('./policy.mjs', import.meta.url))
  try {
    git('init')
    git('config', 'user.name', 'Synthetic CI Test')
    git('config', 'user.email', 'synthetic@example.invalid')
    writeFileSync(join(directory, 'README.md'), 'synthetic baseline\n')
    git('add', '.')
    git('commit', '-m', 'baseline')
    const base = git('rev-parse', 'HEAD')
    mkdirSync(join(directory, 'src'))
    writeFileSync(join(directory, 'src/example.ts'), 'export const synthetic = true\n')
    git('add', '.')
    git('commit', '-m', 'candidate')
    const head = git('rev-parse', 'HEAD')
    const eventPath = join(directory, 'event.json'), outputPath = join(directory, 'output'), mockPath = join(directory, 'mock.mjs')
    const event = { pull_request: { base: { ref: 'main', sha: base }, head: { ref: 'release/0.1.0', sha: head, repo: { full_name: 'synthetic/test' } } } }
    writeFileSync(eventPath, JSON.stringify(event))
    const run = runs => {
      writeFileSync(outputPath, '')
      writeFileSync(mockPath, `globalThis.fetch = async () => ({ok: true, json: async () => (${JSON.stringify({ workflow_runs: runs })})});`)
      return spawnSync(process.execPath, ['--import', mockPath, policyPath], {
        cwd: directory, encoding: 'utf8', env: { ...process.env, CANDIDATE: 'false', GITHUB_REPOSITORY: 'synthetic/test', GITHUB_TOKEN: 'synthetic-no-network', GITHUB_EVENT_PATH: eventPath, GITHUB_OUTPUT: outputPath },
      })
    }
    const rejected = run([])
    assert.notEqual(rejected.status, 0)
    assert.match(rejected.stderr, /successful candidate/)
    assert.equal(readFileSync(outputPath, 'utf8'), '')
    const good = { id: 1, head_sha: head, head_branch: 'release/0.1.0', event: 'push', status: 'completed', conclusion: 'success', html_url: 'https://example.invalid/candidate' }
    assert.equal(run([good]).status, 0)
    assert.equal(readFileSync(outputPath, 'utf8'), 'common=true\ndesktop=false\nimages=false\n')
    event.pull_request.head.ref = 'fix/example'
    writeFileSync(eventPath, JSON.stringify(event))
    assert.match(run([]).stderr, /Disallowed PR route/)
    event.pull_request.base.ref = 'develop'
    writeFileSync(eventPath, JSON.stringify(event))
    assert.equal(run([]).status, 0)
    assert.equal(readFileSync(outputPath, 'utf8'), 'common=true\ndesktop=true\nimages=false\n')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
