const sha = process.env.GITHUB_SHA
const branch = process.env.GITHUB_REF_NAME
const response = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/commits/${sha}/pulls?per_page=100`, {
  headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' },
})
if (!response.ok) throw new Error(`Cannot verify merged PR: HTTP ${response.status}`)
const prs = await response.json()
if (!prs.some(pr => pr.merged_at && pr.base.ref === branch && pr.merge_commit_sha === sha)) throw new Error('Protected branch updates must come from a merged PR targeting that branch')
console.log(`Verified merged PR provenance for ${branch} at ${sha}`)
