import { spawnSync, execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { route, classify, requireCandidate } from './policy.mjs'
import { planCandidate } from './candidate.mjs'
import { matchingValidation } from './metadata.mjs'
test('only approved integration routes are allowed', () => {
  assert.equal(route('main','feat/diary'),false)
  assert.equal(route('main','release/0.1.0'),true)
  assert.equal(route('main','hotfix/restore'),true)
  assert.equal(route('develop','main'),true)
  assert.equal(route('develop','feat/diary'),true)
  assert.equal(route('develop','codex/library-search'),true)
  assert.equal(route('develop','codex/'),false)
  assert.equal(route('main','codex/library-search'),false)
  assert.equal(route('release/0.1.0','codex/library-search'),false)
  assert.equal(route('release/0.1.0','fix/installer'),true)
  assert.equal(route('release/0.1.0','feat/diary'),false)
})
test('daily PRs select lightweight checks by content; full validation is explicit', () => {
  const empty = {common:false,rust:false,desktop:false,images:false}
  assert.deepEqual(classify(['docs/product/PRD.md']),empty)
  for (const file of ['src/App.tsx','public/runtime.js','vitest.config.ts','package-lock.json'])
    assert.deepEqual(classify([file]),{...empty,common:true})
  for (const file of ['src-tauri/src/storage.rs','src-tauri/Cargo.lock','src-tauri/tauri.conf.json','docs/features/contracts/schema.sql'])
    assert.deepEqual(classify([file]),{...empty,rust:true})
  assert.deepEqual(classify(['tools/image-validation/src/lib.rs']),{...empty,images:true})
  for (const file of ['.github/workflows/check.yml','new-runtime/config.js',' scripts/ci/hidden.mjs'])
    assert.deepEqual(classify([file]),{common:true,rust:true,desktop:false,images:true})
  assert.deepEqual(classify(['src/App.tsx','src-tauri/src/storage.rs']),{...empty,common:true,rust:true})
  assert.deepEqual(classify(['.github/pull_request_template.md']),empty)
  for (const options of [{full:true},{candidate:true}])
    assert.deepEqual(classify([],options),{common:true,rust:false,desktop:true,images:true})
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
  const results = { policy: { result: 'success', outputs: { common: 'true', rust: 'false', desktop: 'false', images: 'false' } }, common: { result: 'success' }, rust: { result: 'skipped' }, desktop: { result: 'skipped' }, images: { result: 'skipped' } }
  assert.equal(run(results), 0)
  for (const result of ['failure', 'cancelled', 'skipped']) assert.notEqual(run({ ...results, common: { result } }), 0)
  for (const result of ['failure','cancelled','skipped']) {
    assert.notEqual(run({...results,policy:{result:'success',outputs:{common:'false',rust:'true',desktop:'false',images:'false'}},common:{result:'skipped'},rust:{result}}),0)
  }
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
    assert.equal(readFileSync(outputPath, 'utf8'), 'common=false\nrust=false\ndesktop=false\nimages=false\n')
    event.pull_request.head.ref = 'fix/example'
    writeFileSync(eventPath, JSON.stringify(event))
    assert.match(run([]).stderr, /Disallowed PR route/)
    event.pull_request.head.ref = 'hotfix/example'
    writeFileSync(eventPath, JSON.stringify(event))
    assert.equal(run([]).status, 0)
    assert.equal(readFileSync(outputPath, 'utf8'), 'common=true\nrust=false\ndesktop=true\nimages=true\n')
    event.pull_request.head.ref = 'fix/example'
    event.pull_request.base.ref = 'develop'
    writeFileSync(eventPath, JSON.stringify(event))
    assert.equal(run([]).status, 0)
    assert.equal(readFileSync(outputPath, 'utf8'), 'common=true\nrust=false\ndesktop=false\nimages=false\n')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})


test('metadata evidence binds the immutable run title to the exact target, commit and PR', () => {
  const pr = { number: 11, base: { ref: 'develop', sha: 'base-sha' }, head: { ref: 'fix/ci', sha: 'head-sha' } }
  const good = { id: 1, event: 'pull_request', display_title: 'Validation develop@base-sha', head_branch: 'fix/ci', head_sha: 'head-sha', pull_requests: [{ number: 11 }] }
  assert.equal(matchingValidation(pr, [good]), good)
  for (const change of [
    { display_title: 'Validation main@old-base' }, { head_sha: 'old-head' }, { head_branch: 'other-branch' },
    { pull_requests: [{ number: 12 }] }, { event: 'workflow_dispatch' }, { display_title: 'Metadata verification' },
  ]) assert.equal(matchingValidation(pr, [{ ...good, ...change }]), undefined)
  assert.equal(matchingValidation(pr, [good, { ...good, id: 2, conclusion: 'failure' }]).id, 2)
})

test('metadata CLI preserves failure, waits for ongoing validation and never builds', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lifestory-ci-metadata-'))
  const path = fileURLToPath(new URL('./metadata.mjs', import.meta.url))
  const pr = { number: 11, base: { ref: 'develop', sha: 'base-sha' }, head: { ref: 'fix/ci', sha: 'head-sha', repo: { full_name: 'synthetic/test' } } }
  const good = { id: 1, event: 'pull_request', display_title: 'Validation develop@base-sha', head_branch: 'fix/ci', head_sha: 'head-sha', pull_requests: [{ number: 11 }], status: 'completed', conclusion: 'success', html_url: 'https://example.invalid/validation' }
  try {
    const eventPath = join(directory, 'event.json'), mockPath = join(directory, 'mock.mjs')
    writeFileSync(eventPath, JSON.stringify({ action: 'edited', changes: { body: {} }, pull_request: pr }))
    const run = sequences => {
      writeFileSync(mockPath, `const responses = ${JSON.stringify(sequences)}; let index = 0; globalThis.setTimeout = callback => callback(); globalThis.fetch = async () => ({ok: true, json: async () => ({workflow_runs: responses[Math.min(index++, responses.length - 1)]})});`)
      return spawnSync(process.execPath, ['--import', mockPath, path], {
        cwd: directory, encoding: 'utf8', timeout: 10000,
        env: { ...process.env, GITHUB_EVENT_PATH: eventPath, GITHUB_REPOSITORY: 'synthetic/test', GITHUB_TOKEN: 'synthetic-no-network' },
      })
    }
    assert.equal(run([[good]]).status, 0)
    assert.match(run([[]]).stderr, /No validation exists/)
    assert.match(run([[{ ...good, conclusion: 'failure' }]]).stderr, /cannot make it pass/)
    assert.match(run([[{ ...good, conclusion: 'cancelled' }]]).stderr, /cannot make it pass/)
    const waited = run([[{ ...good, status: 'in_progress', conclusion: null }], [good]])
    assert.equal(waited.status, 0)
    assert.match(waited.stdout, /Waiting for existing validation/)
    assert.match(run([[good, { ...good, id: 2, conclusion: 'failure' }]]).stderr, /cannot make it pass/)
    writeFileSync(eventPath, JSON.stringify({ action: 'edited', changes: { base: {} }, pull_request: pr }))
    assert.match(run([[good]]).stderr, /unchanged, allowed PR target/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
