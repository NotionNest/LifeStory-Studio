const needs = JSON.parse(process.env.JOB_RESULTS)
if (needs.policy?.result !== 'success') throw new Error('Policy/change detection did not succeed')
for (const name of ['common', 'desktop', 'images']) {
  const selected = needs.policy.outputs?.[name]
  if (!['true', 'false'].includes(selected)) throw new Error(`Missing or invalid check selection: ${name}`)
  const required = selected === 'true'
  const result = needs[name]?.result
  if (required ? result !== 'success' : !['success', 'skipped'].includes(result)) throw new Error(`${name}: ${result}, required=${required}`)
}
console.log('CI Gate passed: all required checks succeeded; irrelevant work was explicitly skipped')
