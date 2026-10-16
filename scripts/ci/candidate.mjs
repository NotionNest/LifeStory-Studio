import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, rmSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
const read = path => JSON.parse(readFileSync(path,'utf8'))
export function planCandidate(pkg, config, cargoVersion, ref, run) {
  if (!/^\d+\.\d+\.\d+$/.test(pkg.version) || pkg.version !== config.version || pkg.version !== cargoVersion) throw new Error('Package/Tauri/Cargo versions must match before cutting a candidate')
  if (ref !== `release/${pkg.version}`) throw new Error('Release branch and package version do not match')
  if (!/^[0-9]+$/.test(run??'')) throw new Error('Missing candidate run number')
  return {version:`${pkg.version}-rc.${run}`,identifier:`${config.identifier}.preview`}
}
function main() {
const pkg = read('package.json'), config = read('src-tauri/tauri.conf.json')
const cargoPath='src-tauri/Cargo.toml', cargo=readFileSync(cargoPath,'utf8')
const cargoVersion=cargo.match(/^version = "([^"]+)"/m)?.[1]
const {version,identifier}=planCandidate(pkg,config,cargoVersion,process.env.GITHUB_REF_NAME,process.env.GITHUB_RUN_NUMBER)
// Candidate overrides are generated in the runner, never committed or shared with stable data.
pkg.version=version;writeFileSync('package.json',JSON.stringify(pkg,null,2)+'\n')
const lock=read('package-lock.json');lock.version=version;lock.packages[''].version=version
writeFileSync('package-lock.json',JSON.stringify(lock,null,2)+'\n')
writeFileSync(cargoPath,cargo.replace(/^version = "[^"]+"/m,`version = "${version}"`))
const cargoLockPath='src-tauri/Cargo.lock'
const cargoLock=readFileSync(cargoLockPath,'utf8')
// Lock entries have a newline immediately after the version, so match the application stanza exactly.
const stanza=`name = "${cargo.match(/^name = "([^"]+)"/m)[1]}"\nversion = "${cargoVersion}"`
if (!cargoLock.includes(stanza)) throw new Error('Application lock entry was not found')
writeFileSync(cargoLockPath,cargoLock.replace(stanza,stanza.replace(cargoVersion,version)))
mkdirSync('.ci',{recursive:true})
const override='.ci/tauri-preview.json'
writeFileSync(override,JSON.stringify({version,productName:`${config.productName} Preview`,identifier,build:{beforeBuildCommand:'npx vite build'}},null,2))
const cliPackagePath=resolve('node_modules/@tauri-apps/cli/package.json')
const cli=read(cliPackagePath)
const cliPath=resolve('node_modules/@tauri-apps/cli',cli.bin.tauri)
const bundle=process.platform==='darwin'?'dmg':process.platform==='win32'?'nsis':null
if(!bundle) throw new Error('Candidate installers require macOS or Windows')
rmSync('src-tauri/target/release/bundle',{recursive:true,force:true})
execFileSync(process.execPath,[cliPath,'build','--config',resolve(override),'--bundles',bundle],{stdio:'inherit'})
const root='src-tauri/target/release/bundle'
const files=[]
function collect(dir){for(const name of readdirSync(dir)){const path=join(dir,name);if(statSync(path).isDirectory())collect(path);else if(/\.(dmg|exe)$/.test(name))files.push({path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex'),bytes:statSync(path).size})}}
collect(root)
if(!files.length)throw new Error('No candidate installer was produced')
const manifest={channel:'preview',version,identifier,unsigned:true,sourceCommit:process.env.GITHUB_SHA,sourceTree:execFileSync('git',['rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim(),runId:process.env.GITHUB_RUN_ID,platform:process.platform,files}
writeFileSync('.ci/candidate-manifest.json',JSON.stringify(manifest,null,2)+'\n')
console.log(`Created preview ${version}; separate app data; unsigned test artifact, not a production release`)

}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
