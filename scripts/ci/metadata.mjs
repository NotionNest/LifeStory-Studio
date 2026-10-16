import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { route, api } from './policy.mjs'

export function matchingValidation(pr, runs) {
  // Run PR metadata is mutable; bind the original target using the frozen run title.
  const title = `Validation ${pr.base.ref}@${pr.base.sha}`
  return runs.filter(r => r.event === 'pull_request' && r.display_title === title &&
    r.head_sha === pr.head.sha && r.head_branch === pr.head.ref && r.pull_requests.some(p => p.number === pr.number))
    .sort((a, b) => b.id - a.id)[0]
}

async function main() {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
  const pr = event.pull_request
  if (event.action !== 'edited' || event.changes?.base || !pr || !route(pr.base.ref, pr.head.ref) || pr.head.repo.full_name !== process.env.GITHUB_REPOSITORY) {
    throw new Error('Metadata verification requires an unchanged, allowed PR target in this repository')
  }
  const deadline = Date.now() + 65 * 60 * 1000
  while (Date.now() < deadline) {
    const runs = await api(`actions/workflows/check.yml/runs?head_sha=${pr.head.sha}&per_page=100`)
    const run = matchingValidation(pr, runs.workflow_runs)
    if (!run) throw new Error('No validation exists for this PR commit and target. Run validation before retrying this metadata check')
    if (run.status === 'completed') {
      if (run.conclusion !== 'success') throw new Error('Existing validation did not succeed; editing PR metadata cannot make it pass')
      console.log(`Unchanged PR validation succeeded: ${run.html_url}`)
      return
    }
    console.log(`Waiting for existing validation ${run.id}; no new build was started`)
    await new Promise(resolve => setTimeout(resolve, 10000))
  }
  throw new Error('Existing validation is still incomplete. Retry this check after validation finishes')
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
