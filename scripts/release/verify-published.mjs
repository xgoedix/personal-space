import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { TARGET, compareSnapshots } from './policy.mjs';
import { bridge } from './bridge.mjs';
import { smoke } from './smoke.mjs';

// Resume only verification of an already deployed release. Never deploys or migrates code.
const root=process.cwd();
const directory=resolve(process.argv[2]??'');
assert(directory.startsWith(join(root,'.personal-space/releases/')),'A private release directory is required');
assert(process.argv.slice(3).every(arg=>arg==='--notify-test'),'Unknown verification argument');
const record=JSON.parse(readFileSync(join(directory,'release.json')));
assert.deepEqual(record.target,TARGET);assert(record.backupVerified&&record.workerPublished&&record.webPublished);
assert.match(record.sha,/^[a-f0-9]{40}$/);
const changes=execFileSync('git',['diff','--name-only',record.sha,'HEAD'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
assert(changes.every(path=>path.startsWith('scripts/release/')||path.startsWith('docs/')),'Application code differs from the deployed release');
assert.equal(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),'','Commit the reviewed verification fix first');
const work=join(directory,'verification-'+Date.now());mkdirSync(work,{mode:0o700});
const wrangler=join(root,'node_modules/wrangler/bin/wrangler.js');
const deployments=JSON.parse(execFileSync(process.execPath,[wrangler,'deployments','list','--config','deploy/bicho/wrangler.jsonc','--json'],{encoding:'utf8',env:{...process.env,CLOUDFLARE_ACCOUNT_ID:TARGET.account}}));
const current=deployments.sort((a,b)=>b.created_on.localeCompare(a.created_on))[0];
assert.equal(current.versions.length,1);assert.equal(current.versions[0].version_id,record.workerVersion,'Worker changed since this release');
const response=await fetch(TARGET.origin+'/release.json',{cache:'no-store',headers:{'user-agent':'Mozilla/5.0'}});assert(response.ok);assert.equal((await response.json()).version,record.sha);
const operator=await bridge(work,wrangler);
const write=(name,data)=>writeFileSync(join(directory,name),JSON.stringify(data,null,2)+'\n',{mode:0o600});
try {
  const before=JSON.parse(readFileSync(join(directory,'before.json')));
  compareSnapshots(before,await operator.call('checkpoint'));
  const report=await smoke(operator,process.argv.includes('--notify-test'));write('smoke.json',report);
  const after=await operator.call('checkpoint');write('after.json',after);compareSnapshots(before,after);
  if(record.error) record.previousVerificationError=record.error;
  delete record.error;
  Object.assign(record,{published:true,finishedAt:new Date().toISOString(),verificationCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()});
  write('release.json',record);
  writeFileSync(join(root,'.personal-space/releases/last-success.json'),JSON.stringify({directory,sha:record.sha,url:TARGET.origin})+'\n',{mode:0o600});
  console.log(JSON.stringify({url:TARGET.origin,release:record.sha,checks:report.checks,backupSha256:record.backupSha256},null,2));
} finally {operator.close();}
