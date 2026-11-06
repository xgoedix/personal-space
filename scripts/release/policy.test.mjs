import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkApproval, checkConfig, checkIdentity, compareSnapshots } from './policy.mjs';
import { readFileSync } from 'node:fs';
const config = JSON.parse(readFileSync(new URL('../../deploy/bicho/wrangler.jsonc', import.meta.url)));
test('release requires exact approved commit and clean checkout', () => {
  const sha='a'.repeat(40); checkApproval(sha,sha,'');
  assert.throws(()=>checkApproval(sha,'b'.repeat(40),''));
  assert.throws(()=>checkApproval(sha,sha,' M file'));
  assert.throws(()=>checkApproval('',sha,''));
});
test('deployment policy rejects original Talorys, another namespace, public workers and setup flags', () => {
  checkConfig(config);
  for(const change of [{name:'talorys-etfd7yab-agent'},{workers_dev:true},{migrations:[]},{vars:{...config.vars,BICHO_ENROLLMENT:'1'}}]) assert.throws(()=>checkConfig({...config,...change}));
});
test('installed PWA identity cannot be changed', () => {
  const old={name:'Personal Space',short_name:'Personal Space',start_url:'/',scope:'/',display:'standalone',icons:[]};
  const next={...old,name:'BichO',short_name:'BichO'}; checkIdentity(old,next);
  assert.throws(()=>checkIdentity(old,{...next,scope:'/v3/'}));
});
test('missing sessions and changed push credentials block publication', () => {
  const before={fingerprints:{secret:'same'},columns:{tal_sessions:['id','last_seen_at']},rows:[{table_name:'tal_sessions',row_data:JSON.stringify(["'existing'","'old'"])}]};
  compareSnapshots(before,{...before,rows:[{table_name:'tal_sessions',row_data:JSON.stringify(["'existing'","'new'"])}]});
  assert.throws(()=>compareSnapshots(before,{...before,rows:[]}));
  assert.throws(()=>compareSnapshots(before,{...before,fingerprints:{secret:'changed'}}));
});
