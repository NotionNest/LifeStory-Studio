import { readFileSync, appendFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const skip = /\[(?:skip ci|ci skip|no ci|skip actions|actions skip)\]/i

export function route(base, head) {
  if (base === 'main') return /^(release\/\d+\.\d+\.\d+|hotfix\/.+)$/.test(head)
  if (base === 'develop') return head === 'main' || /^(feat|fix|docs|chore)\/.+/.test(head)
  return /^release\/\d+\.\d+\.\d+$/.test(base) && (head === 'main' || /^(fix|chore)\/.+/.test(head))
}

export function classify(files, { full = false, candidate = false } = {}) {
  const documentation = p => (p.startsWith('docs/') && p.endsWith('.md') && !p.startsWith('docs/features/contracts/')) ||
    ['README.md', 'AGENTS.md', 'LICENSE', '.impeccable.md', '.github/pull_request_template.md'].includes(p)
  const shared = p => /^(\.github\/|scripts\/ci\/|\.node-version$|rust-toolchain\.toml$|\.cargo\/)/.test(p)
  const frontend = p => /^(src\/|public\/|package(?:-lock)?\.json$|tsconfig.*\.json$|vite(?:st)?\.config\.[cm]?[jt]s$|components\.json$|index\.html$)/.test(p)
  const backend = p => /^(src-tauri\/|docs\/features\/contracts\/)/.test(p)
  const images = p => p.startsWith('tools/image-validation/')
  const code = files.filter(p => !documentation(p))
  const all = code.some(p => shared(p) || (!frontend(p) && !backend(p) && !images(p)))
  const complete = full || candidate
  return {
    common: complete || all || code.some(frontend),
    rust: !complete && (all || code.some(backend)),
    desktop: complete,
    images: complete || all || code.some(images),
  }
}

export function requireCandidate(pr, mergeTree, headTree, runs) {
  if (!mergeTree || mergeTree !== headTree) throw new Error('Merge main into the release branch through a PR, then build and validate a new candidate')
  const latest = runs.filter(r => r.head_sha === pr.head.sha && r.head_branch === pr.head.ref && ['push', 'workflow_dispatch'].includes(r.event))
    .sort((a, b) => b.id - a.id)[0]
  if (!latest || latest.status !== 'completed' || latest.conclusion !== 'success') {
    throw new Error('A successful candidate for this exact release commit is required. Complete Release candidate, then re-run the failed Checks jobs')
  }
  return latest
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' })
export async function api(path) {
  const response = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/${path}`, {
    headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw new Error(`GitHub evidence request failed: HTTP ${response.status}`)
  return response.json()
}

async function main() {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
  const candidate = process.env.CANDIDATE === 'true'
  let files
  if (event.pull_request) {
    const pr = event.pull_request
    if (!route(pr.base.ref, pr.head.ref)) throw new Error(`Disallowed PR route: ${pr.head.ref} -> ${pr.base.ref}`)
    if (pr.head.repo.full_name !== process.env.GITHUB_REPOSITORY) throw new Error('Trusted checks currently accept only branches in this repository')
    if (skip.test(git('log', '-1', '--format=%B', pr.head.sha))) throw new Error('Remove CI-skip markers from the PR head commit')
    files = git('diff', '--name-only', '-z', `${pr.base.sha}...${pr.head.sha}`).split('\0').filter(Boolean)
  } else {
    files = git('ls-files', '-z').split('\0').filter(Boolean)
  }
  const checks = classify(files, { full: !event.pull_request || event.pull_request.base.ref === 'main', candidate })
  if (event.pull_request?.base.ref === 'main' && event.pull_request.head.ref.startsWith('release/')) {
    const pr = event.pull_request
    const runs = await api(`actions/workflows/release-candidate.yml/runs?head_sha=${pr.head.sha}&per_page=100`)
    const verified = requireCandidate(pr, git('rev-parse', 'HEAD^{tree}').trim(), git('rev-parse', `${pr.head.sha}^{tree}`).trim(), runs.workflow_runs)
    checks.common = false
    checks.rust = false
    checks.desktop = false
    checks.images = false
    console.log(`Required candidate evidence: ${verified.html_url}; merged tree is identical`)
  }
  if (candidate && !/^refs\/heads\/release\/\d+\.\d+\.\d+$/.test(process.env.GITHUB_REF ?? '')) throw new Error('Candidate builds require a versioned release branch')
  for (const [key, value] of Object.entries(checks)) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`)
  console.log(JSON.stringify({ files: files.length, checks }))
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
