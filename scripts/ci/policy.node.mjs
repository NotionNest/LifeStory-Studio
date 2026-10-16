import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { route, classify } from './policy.mjs'
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
})
