import { createHash, randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { TARGET } from './policy.mjs';

/** Temporary Cloudflare preview, inaccessible without a random in-memory bearer. No public deployment. */
export async function bridge(directory, wrangler) {
  const secret = randomBytes(32).toString('hex');
  const digest = createHash('sha256').update(secret).digest('hex');
  const source = `export default { async fetch(request, env) {
    const raw = (request.headers.get('authorization') || '').replace(/^Bearer /, '');
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)))].map(x=>x.toString(16).padStart(2,'0')).join('');
    if(request.method !== 'POST' || hash !== '${digest}') return new Response('Not found', {status:404});
    const owner = env.OWNER.get(env.OWNER.idFromName('personal-agent'));
    const action = new URL(request.url).pathname;
    if(action === '/checkpoint') return Response.json(await owner.bichoReleaseCheckpoint(), {headers:{'cache-control':'no-store'}});
    if(action === '/session') return Response.json({token:await owner.bichoReleaseVerificationSession()}, {headers:{'cache-control':'no-store'}});
    return new Response('Not found',{status:404});
  }};`;
  writeFileSync(join(directory,'bridge.js'),source,{mode:0o600});
  const config=join(directory,'bridge.json');
  writeFileSync(config,JSON.stringify({name:'bicho-release-operator',account_id:TARGET.account,main:'bridge.js',compatibility_date:'2026-10-01',workers_dev:false,observability:{enabled:false},durable_objects:{bindings:[{name:'OWNER',class_name:'TalorysAgent',script_name:TARGET.worker}]}}),{mode:0o600});
  const server=createServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port;
  await new Promise(resolve=>server.close(resolve));
  const child=spawn(process.execPath,[wrangler,'dev','--remote','--config',config,'--ip','127.0.0.1','--port',String(port)],{stdio:['ignore','pipe','pipe'],env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
  let log=''; child.stdout.on('data',chunk=>{log+=chunk;});child.stderr.on('data',chunk=>{log+=chunk;});
  const close=()=>{child.kill('SIGTERM');writeFileSync(join(directory,'bridge.log'),log,{mode:0o600});};
  const deadline=Date.now()+120_000;
  while(!log.includes('Ready on')) {
    if(child.exitCode!==null || Date.now()>deadline) {close();throw new Error('Private release bridge failed; see private bridge.log');}
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  return {
    close,
    async call(action) {
      if(!['checkpoint','session'].includes(action)) throw new Error('Unsupported operator action');
      const response=await fetch(`http://127.0.0.1:${port}/${action}`,{method:'POST',headers:{authorization:`Bearer ${secret}`,'user-agent':'Mozilla/5.0','content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(60_000)});
      if(!response.ok) throw new Error(`Private release ${action}: HTTP ${response.status}`);
      return response.json();
    },
  };
}
