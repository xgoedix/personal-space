import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, openSync, closeSync, cpSync, existsSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TARGET, checkApproval, checkConfig, checkIdentity, compareSnapshots } from './policy.mjs';
import { bridge } from './bridge.mjs';
import { smoke } from './smoke.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');process.chdir(root);
const args=process.argv.slice(2);
assert(args.every((arg,index)=>['--publish','--notify-test','--approved-sha'].includes(arg)||args[index-1]==='--approved-sha'),'Unknown release argument');
const sha=args[args.indexOf('--approved-sha')+1];
checkApproval(sha,execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}),execFileSync('git',['status','--porcelain'],{encoding:'utf8'}));
for(const key of ['CLOUDFLARE_API_BASE_URL','TALORYS_TEST_VERIFY_ORIGIN','TALORYS_WRANGLER_BIN','TALORYS_MOCK_AI','BICHO_ENROLLMENT']) assert(!process.env[key],`Remove ${key}`);
const configPath=join(root,'deploy/bicho/wrangler.jsonc');
const config=JSON.parse(readFileSync(configPath));checkConfig(config);
const base=join(root,'.personal-space/releases');mkdirSync(base,{recursive:true,mode:0o700});
const lockPath=join(base,'.publishing');const lock=openSync(lockPath,'wx',0o600);
const directory=join(base,new Date().toISOString().replaceAll(':','-')+'-'+sha.slice(0,8));mkdirSync(directory,{mode:0o700});
const wrangler=join(root,'node_modules/wrangler/bin/wrangler.js');
let operator;
const state={sha,target:TARGET,startedAt:new Date().toISOString(),published:false};
const save=(name,data)=>writeFileSync(join(directory,name),JSON.stringify(data,null,2)+'\n',{mode:0o600});
const run=(name,command,arguments_,cwd=root,cloudflare=false)=>new Promise((resolve,reject)=>{
  console.log(name);
  const fd=openSync(join(directory,name.replaceAll(/[^a-zA-Z0-9.-]/g,'-')+'.log'),'w',0o600);
  const environment={...process.env,BICHO_RELEASE_SHA:sha,VITE_PERSONAL_PREVIEW:'false',WRANGLER_SEND_METRICS:'false'};
  if(cloudflare) environment.CLOUDFLARE_ACCOUNT_ID=TARGET.account;
  else for(const key of ['CLOUDFLARE_ACCOUNT_ID','CLOUDFLARE_API_TOKEN','CLOUDFLARE_API_KEY','CLOUDFLARE_EMAIL']) delete environment[key];
  const child=spawn(command,arguments_,{cwd,stdio:['ignore',fd,fd],env:environment});
  child.on('error',error=>{closeSync(fd);reject(error);});
  child.on('exit',code=>{closeSync(fd);code===0?resolve():reject(new Error(`${name} failed; inspect the private release log`));});
});
const cli=(name,args,cwd=root)=>run(name,process.execPath,[wrangler,...args],cwd,true);
async function json(url) {const response=await fetch(url,{headers:{'user-agent':'Mozilla/5.0'},cache:'no-store',signal:AbortSignal.timeout(30_000)});assert(response.ok,`HTTP ${response.status}: ${new URL(url).pathname}`);return response.json();}
function cliJson(name) {return JSON.parse(readFileSync(join(directory,name+'.log'),'utf8'));}
try {
  save('release.json',state);
  await run('Lint','npm',['run','lint']);
  await run('Typecheck','npm',['run','typecheck']);
  await run('Release-policy-tests',process.execPath,['--test','scripts/release/policy.test.mjs']);
  await run('Unit-tests','npm',['test']);
  await run('Build','npm',['run','build']);
  await run('Package-tests','npm',['run','test:pack']);
  await run('Browser-tests','npm',['run','test:e2e']);
  const oldManifest=await json(TARGET.origin+'/manifest.webmanifest');
  const manifest=JSON.parse(readFileSync('apps/web/dist/manifest.webmanifest'));
  checkIdentity(oldManifest,manifest);save('previous-manifest.json',oldManifest);
  assert.equal(JSON.parse(readFileSync('apps/web/dist/release.json')).version,sha);
  await cli('Previous-worker-deployments',['deployments','list','--config',configPath,'--json']);
  const deployments=cliJson('Previous-worker-deployments');
  const current=deployments.sort((a,b)=>b.created_on.localeCompare(a.created_on))[0];
  assert.equal(current.versions.length,1);state.previousWorkerVersion=current.versions[0].version_id;
  await cli('Previous-worker-version',['versions','view',state.previousWorkerVersion,'--config',configPath,'--json']);
  const previousVersion=cliJson('Previous-worker-version');
  assert.equal(previousVersion.resources.bindings.find(binding=>binding.type==='durable_object_namespace')?.namespace_id,TARGET.namespace);
  await cli('Previous-pages-deployments',['pages','deployment','list','--project-name',TARGET.pages,'--json']);
  const htmlResponse=await fetch(TARGET.origin,{headers:{'user-agent':'Mozilla/5.0'},cache:'no-store'});assert(htmlResponse.ok);
  const previousHtml=await htmlResponse.text();writeFileSync(join(directory,'previous-index.html'),previousHtml,{mode:0o600});
  for(const deployment of cliJson('Previous-pages-deployments').filter(item=>item.Environment==='Production')) {
    const response=await fetch(deployment.Deployment,{headers:{'user-agent':'Mozilla/5.0'}});
    if(response.ok && await response.text()===previousHtml) {state.previousPagesDeployment=deployment.Id;break;}
  }
  assert(state.previousPagesDeployment,'No verified recoverable Pages production deployment');
  const download=join(directory,'previous-worker');mkdirSync(download,{mode:0o700});
  await cli('Download-previous-worker',['init','--from-dash',TARGET.worker,'--no-delegate-c3','--yes','--cwd',download]);
  operator=await bridge(directory,wrangler);
  const before=await operator.call('checkpoint');
  assert(before.bookmark && before.kv && before.fingerprints.SESSION_SECRET && before.fingerprints.VAPID_PRIVATE_KEY,'Incomplete recovery checkpoint');
  save('before.json',before);state.backupSha256=createHash('sha256').update(readFileSync(join(directory,'before.json'))).digest('hex');
  await run('Compile-migrations',process.execPath,['node_modules/esbuild/bin/esbuild','apps/agent/src/db/migrations.ts','--format=esm','--outfile='+join(directory,'migrations.mjs')]);
  const {MIGRATIONS,LATEST_SCHEMA_VERSION}=await import(pathToFileURL(join(directory,'migrations.mjs')));
  const schemaRow=JSON.parse(before.rows.find(row=>row.table_name==='tal_schema').row_data);
  const oldVersion=Number(schemaRow[before.columns.tal_schema.indexOf('version')]);
  const pending=MIGRATIONS.filter(migration=>migration.version>oldVersion);
  assert(pending.every(migration=>!migration.after),'A new migration hook needs a restore rehearsal before release');
  save('migrations.json',{targetVersion:LATEST_SCHEMA_VERSION,statements:pending.flatMap(migration=>migration.statements)});
  await run('Restore-and-migration-rehearsal','python3',['scripts/release/verify-snapshot.py',join(directory,'before.json'),join(directory,'migrations.json')]);
  const proof=JSON.parse(readFileSync(join(directory,'before.proof.json')));assert.equal(proof.snapshot_sha256,state.backupSha256);assert.equal(proof.restore_integrity,'ok');assert(proof.pitr_bookmark_present);
  state.backupVerified=true;save('release.json',state);
  if(!args.includes('--publish')) {console.log('Preflight complete. No V3 deployment; approval with --publish is required.');}
  else {
    // The guard is checked again immediately before the first deployment.
    checkApproval(sha,execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}),execFileSync('git',['status','--porcelain'],{encoding:'utf8'}));
    compareSnapshots(before,await operator.call('checkpoint'));
    await cli('Deploy-approved-worker',['deploy','--config',configPath,'--keep-vars','--message',`Approved BichO release ${sha}`]);
    state.workerPublished=true;save('release.json',state);
    const after=await operator.call('checkpoint');save('after-worker.json',after);compareSnapshots(before,after);
    await cli('Current-worker-deployments',['deployments','list','--config',configPath,'--json']);
    state.workerVersion=cliJson('Current-worker-deployments').sort((a,b)=>b.created_on.localeCompare(a.created_on))[0].versions[0].version_id;
    await cli('Current-worker-version',['versions','view',state.workerVersion,'--config',configPath,'--json']);
    const bindings=cliJson('Current-worker-version').resources.bindings;
    assert.equal(bindings.find(binding=>binding.type==='durable_object_namespace')?.namespace_id,TARGET.namespace);
    assert.deepEqual(bindings.filter(binding=>binding.type==='secret_text').map(binding=>binding.name).sort(),previousVersion.resources.bindings.filter(binding=>binding.type==='secret_text').map(binding=>binding.name).sort());
    const web=join(directory,'web');mkdirSync(web,{mode:0o700});
    cpSync('apps/web/dist',join(web,'dist'),{recursive:true});cpSync('apps/web/functions',join(web,'functions'),{recursive:true});
    // Retain immutable chunks from the last reproducible release for tabs left open during deployment.
    const last=join(base,'last-success.json');
    if(existsSync(last)) {const prior=JSON.parse(readFileSync(last));const assets=join(prior.directory,'web/dist/assets');if(existsSync(assets))cpSync(assets,join(web,'dist/assets'),{recursive:true,force:false});}
    else {
      const initial=join(root,'.personal-space/staging/web/dist');
      if(existsSync(join(initial,'index.html')) && readFileSync(join(initial,'index.html'),'utf8')===previousHtml && existsSync(join(initial,'assets'))) cpSync(join(initial,'assets'),join(web,'dist/assets'),{recursive:true,force:false});
    }
    save('web/wrangler.jsonc',{name:TARGET.pages,pages_build_output_dir:'./dist',compatibility_date:config.compatibility_date,services:[{binding:'AGENT',service:TARGET.worker}]});
    await cli('Deploy-approved-web',['pages','deploy','dist','--project-name',TARGET.pages,'--branch','main','--commit-hash',sha,'--commit-dirty=false'],web);
    state.webPublished=true;save('release.json',state);
    let release;
    for(let attempt=0;attempt<18;attempt++) {release=await json(TARGET.origin+'/release.json');if(release.version===sha)break;await new Promise(resolve=>setTimeout(resolve,5000));}
    assert.equal(release.version,sha,'Permanent URL does not serve the approved release');
    checkIdentity(oldManifest,await json(TARGET.origin+'/manifest.webmanifest'));
    for(const path of ['/','/sw.js','/release.json']) {
      const response=await fetch(TARGET.origin+path,{headers:{'user-agent':'Mozilla/5.0'},cache:'no-store'});assert(response.ok);
      assert.match(response.headers.get('cache-control')??'',path==='/release.json'?/no-store/:/no-cache|must-revalidate/);
      if(path==='/') assert((await response.text()).includes(sha),'HTML lacks approved release identity');
    }
    const health=await json(TARGET.origin+'/api/health');assert(health.ok&&health.push&&health.ai_binding&&health.configured.password&&health.configured.session_secret);
    const checks=await smoke(operator,args.includes('--notify-test'));save('smoke.json',checks);
    const final=await operator.call('checkpoint');save('after.json',final);compareSnapshots(before,final);
    state.published=true;state.finishedAt=new Date().toISOString();save('release.json',state);
    writeFileSync(last,JSON.stringify({directory,sha,url:TARGET.origin})+'\n',{mode:0o600});
    console.log(`Verified approved BichO release at ${TARGET.origin}`);
  }
} catch(error) {
  state.error=error.message;save('release.json',state);
  console.error(`Release stopped: ${error.message}. No automatic data rollback. Private report: ${directory}`);
  process.exitCode=1;
} finally {operator?.close();closeSync(lock);rmSync(lockPath);}
