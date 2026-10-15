import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

// Handshake only: no thread, turn, account reads, private credentials or model calls.
const executable = process.env.LIFESTORY_CODEX_PATH || 'codex'
const child = spawn(executable, ['app-server', '--stdio'], {
  shell: false,
  stdio: ['pipe', 'pipe', 'ignore'],
})
const lines = createInterface({ input: child.stdout })
let settled = false
let resultCode = 1

function finish(error) {
  if (settled) return
  settled = true
  clearTimeout(timeout)
  resultCode = error ? 1 : 0
  if (error) console.error(`Codex 握手失败：${error.message}`)
  else console.log('PASS: Codex App Server initialize handshake. No model task started.')
  lines.close()
  child.stdin.end()
  child.kill()
  const forceStop = setTimeout(() => child.kill('SIGKILL'), 2000)
  forceStop.unref()
}

const timeout = setTimeout(() => finish(new Error('初始化超过 15 秒')), 15_000)
child.once('error', finish)
child.stdin.on('error', finish)
child.once('close', () => {
  if (!settled) finish(new Error('进程在握手完成前退出'))
  process.exitCode = resultCode
})
lines.on('line', line => {
  try {
    const message = JSON.parse(line)
    if (message.id !== 1) return
    assert.equal(message.error, undefined, '服务器拒绝初始化')
    assert.ok(message.result && typeof message.result === 'object', '初始化结果不符合协议')
    child.stdin.write(`${JSON.stringify({ method: 'initialized' })}\n`)
    finish()
  } catch (error) {
    finish(error)
  }
})
child.stdin.write(`${JSON.stringify({
  id: 1,
  method: 'initialize',
  params: {
    clientInfo: { name: 'lifestory_environment_check', version: '0.1.0' },
    capabilities: { experimentalApi: false },
  },
})}\n`)
