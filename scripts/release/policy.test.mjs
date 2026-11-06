import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkApproval, checkConfig, checkIdentity, compareSnapshots } from './policy.mjs';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

for(const version of [12,13]) test(`restore rehearsal retains existing Siri tokens on schema ${version}`, () => {
  const directory=mkdtempSync(join(tmpdir(),'bicho-restore-test-'));
  try {
    const schema=[
      {name:'tal_schema',type:'table',sql:'CREATE TABLE tal_schema (id INTEGER PRIMARY KEY,version INTEGER,updated_at TEXT)'},
      {name:'tal_settings',type:'table',sql:'CREATE TABLE tal_settings (key TEXT PRIMARY KEY,value TEXT,updated_at TEXT)'},
      {name:'tal_remote_tokens',type:'table',sql:'CREATE TABLE tal_remote_tokens (id TEXT PRIMARY KEY,token_hash TEXT'+(version===13?',capability TEXT':'')+')'},
    ];
    const columns={tal_schema:['id','version','updated_at'],tal_settings:['key','value','updated_at'],tal_remote_tokens:['id','token_hash',...(version===13?['capability']:[])]};
    const rows=[
      {table_name:'tal_schema',row_data:JSON.stringify(['1',String(version),"'2030-01-01'"])},
      {table_name:'tal_remote_tokens',row_data:JSON.stringify(["'fixture-token'","'fictional-hash'",...(version===13?["'capture'"]:[])])},
    ];
    const snapshot=join(directory,'before.json');const migrations=join(directory,'migrations.json');
    writeFileSync(snapshot,JSON.stringify({schema,columns,rows,kv:[],bookmark:'fixture-bookmark'}));
    writeFileSync(migrations,JSON.stringify({targetVersion:13,statements:version===12?["ALTER TABLE tal_remote_tokens ADD COLUMN capability TEXT NOT NULL DEFAULT 'standard'"]:[]}));
    execFileSync('python3',[fileURLToPath(new URL('./verify-snapshot.py',import.meta.url)),snapshot,migrations],{stdio:'pipe'});
    assert.equal(JSON.parse(readFileSync(join(directory,'before.proof.json'))).v3_migration_preserves_existing_records,true);
  } finally {rmSync(directory,{recursive:true,force:true});}
});
