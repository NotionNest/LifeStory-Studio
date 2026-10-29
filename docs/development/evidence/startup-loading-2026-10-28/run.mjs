import fs from 'node:fs/promises'
import http from 'node:http'
import { spawn, execFileSync } from 'node:child_process'
const variant = process.argv[2] ?? 'baseline',
  dir = process.env.STARTUP_BENCH_DIR
if (!dir || !['baseline', 'route-lazy', 'editor-lazy'].includes(variant))
  throw new Error('Set STARTUP_BENCH_DIR and a valid variant')
const app =
  process.cwd() + '/src-tauri/target/debug/bundle/macos/LifeStory Startup ' + variant + '.app'
const executable = execFileSync(
  '/usr/libexec/PlistBuddy',
  ['-c', 'Print:CFBundleExecutable', app + '/Contents/Info.plist'],
  { encoding: 'utf8' },
).trim()
const results = []
let recordEvent = () => {}
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'content-type')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  console.log('request', req.method, req.url)
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }
  let body = ''
  for await (const chunk of req) body += chunk
  res.writeHead(200)
  res.end('ok')
  try {
    recordEvent(JSON.parse(body))
  } catch (error) {
    console.error(error)
  }
})
await new Promise((resolve) => server.listen(1438, '127.0.0.1', resolve))
try {
  for (let round = 0; round < 5; round++) {
    const events = [],
      launched = Date.now()
    const log = await fs.open(dir + '/' + variant + '-' + round + '-process.log', 'w')
    const child = spawn(app + '/Contents/MacOS/' + executable, [], {
      stdio: ['ignore', log.fd, log.fd],
    })
    const completed = new Promise((resolve, reject) => {
      recordEvent = (event) => {
        events.push(event)
        console.log(JSON.stringify({ variant, round, ...event }))
        if (event.event === 'done') resolve()
        if (event.event === 'error') reject(new Error(event.message))
      }
      child.on('error', reject)
      child.on('exit', (code) => {
        if (!events.some((e) => e.event === 'done'))
          reject(new Error('Exited before benchmark completion: ' + code))
      })
    })
    let timeout
    try {
      await Promise.race([
        completed,
        new Promise(
          (_, reject) =>
            (timeout = setTimeout(() => reject(new Error('Desktop benchmark timeout')), 30000)),
        ),
      ])
      await new Promise((resolve) => child.once('exit', resolve))
    } finally {
      clearTimeout(timeout)
      if (child.exitCode === null) child.kill()
      await log.close()
    }
    results.push({
      variant,
      round,
      launched,
      events,
      startupMs:
        events.find((e) => e.event === 'startup').timeOrigin +
        events.find((e) => e.event === 'startup').ready -
        launched,
    })
    await fs.writeFile(dir + '/' + variant + '-metrics.json', JSON.stringify(results, null, 2))
  }
} finally {
  await new Promise((resolve) => server.close(resolve))
}
