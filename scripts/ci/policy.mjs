import { readFileSync, appendFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
const skip = /\[(?:skip ci|ci skip|no ci|skip actions|actions skip)\]/i
export function route(base, head) {
  if (base === 'main') return /^(release\/\d+\.\d+\.\d+|hotfix\/.+)$/.test(head)
  if (base === 'develop') return head === 'main' || /^(feat|fix|docs|chore)\/.+/.test(head)
  return /^release\/\d+\.\d+\.\d+$/.test(base) && (head === 'main' || /^(fix|chore)\/.+/.test(head))
}
export function classify(files, { full = false, candidate = false, releaseFix = false } = {}) {
  const shared = files.some(p => /^(\.github\/|scripts\/ci\/|\.node-version$|rust-toolchain\.toml$|\.cargo\/)/.test(p))
  const app = shared || files.some(p => /^(src\/|src-tauri\/|package(?:-lock)?\.json$|tsconfig.*\.json$|vite\.config\.ts$|components\.json$|index\.html$|docs\/features\/contracts\/)/.test(p))
  const images = shared || files.some(p => p.startsWith('tools/image-validation/'))
  return { common: full || app, desktop: candidate || (!releaseFix && (full || app)), images: candidate || (!releaseFix && (full || images)) }
}
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
async function api(path) {
  const response = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/${path}`, {
    headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' },
  })
  if (!response.ok) throw new Error(`GitHub evidence request failed: HTTP ${response.status}`)
  return response.json()
}
async function main() {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
  const candidate = process.env.CANDIDATE === 'true'
  let files, releaseFix = false
  if (event.pull_request) {
    const pr = event.pull_request
    if (!route(pr.base.ref, pr.head.ref)) throw new Error(`Disallowed PR route: ${pr.head.ref} -> ${pr.base.ref}`)
    if (pr.head.repo.full_name !== process.env.GITHUB_REPOSITORY) throw new Error('Release credentials and trusted checks are limited to this private repository')
    if (skip.test(git('log', '-1', '--format=%B', pr.head.sha))) throw new Error('Remove CI-skip markers from the PR head commit')
    files = git('diff', '--name-only', '-z', `${pr.base.sha}...${pr.head.sha}`).split('\0').filter(Boolean)
    releaseFix = pr.base.ref.startsWith('release/')
  } else {
    files = git('ls-files', '-z').split('\0').filter(Boolean)
  }
  const checks = classify(files, { full: !event.pull_request, candidate, releaseFix })
  // Reuse a candidate only if its successful run tested the exact source and identical merge tree.
  if (event.pull_request?.base.ref === 'main' && event.pull_request.head.ref.startsWith('release/')) {
    const pr = event.pull_request
    if (git('rev-parse', 'HEAD^{tree}') === git('rev-parse', `${pr.head.sha}^{tree}`)) {
      const runs = await api(`actions/workflows/release-candidate.yml/runs?head_sha=${pr.head.sha}&event=push&status=success&per_page=100`)
      const verified = runs.workflow_runs.find(r => r.head_sha === pr.head.sha && r.head_branch === pr.head.ref && r.conclusion === 'success')
      if (verified) {
        checks.desktop = false; checks.images = false
        console.log(`Candidate evidence: ${verified.html_url}; merged tree is identical`)
      }
    }
  }
  if (candidate && !/^refs\/heads\/release\/\d+\.\d+\.\d+$/.test(process.env.GITHUB_REF ?? '')) throw new Error('Candidate builds require a versioned release branch')
  for (const [key, value] of Object.entries(checks)) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`)
  console.log(JSON.stringify({ files: files.length, checks }))
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
