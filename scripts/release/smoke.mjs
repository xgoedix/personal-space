import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { TARGET } from './policy.mjs';

/** Only fictitious, uniquely identified records. Session is short-lived and revoked in finally. */
export async function smoke(operator, notify=false) {
  const marker=`PRUEBA publicación ${randomUUID().slice(0,8)}`;
  let token=(await operator.call('session')).token;
  const created=[]; const report=[]; let result; let failure;
  const call=async(path,method='GET',data)=>fetch(TARGET.origin+'/api'+path,{method,headers:{cookie:`__Host-talorys_session=${token}`,origin:TARGET.origin,'x-talorys-request':'1','content-type':'application/json','user-agent':'Mozilla/5.0'},...(data===undefined?{}:{body:JSON.stringify(data)}),signal:AbortSignal.timeout(150_000)});
  const json=async(path,method='GET',data)=>{const r=await call(path,method,data);assert(r.ok,`${method} ${path}: HTTP ${r.status}`);return r.json();};
  try {
    const system=await json('/system'); assert.equal(system.installation_id,'psstta2bu4wy');assert.equal(system.ai_provider,'workers-ai');assert.equal(system.environment,'production');
    const settings=(await json('/settings')).settings;assert.equal(settings.demoMode,false);
    report.push('Private session and real Workers AI configuration');
    const response=await call('/chat','POST',{message:`Crea una lista llamada ${marker} con huevos y leche. Además guarda una nota titulada ${marker} que diga comprar un regalo ficticio.`});
    assert.equal(response.status,200);
    const events=(await response.text()).split('\n\n').flatMap(frame=>{const line=frame.split('\n').find(x=>x.startsWith('data:'));return line?[JSON.parse(line.slice(5))]:[];});
    const conversation=events.find(e=>typeof e.conversation_id==='string');
    if(conversation) created.push(['/conversations/'+conversation.conversation_id,undefined]);
    const done=events.find(e=>e.type==='done'); assert.equal(done?.message?.status,'complete','AI did not complete the request');
    for(const tool of ['create_list','create_note']) assert(events.some(e=>e.type==='tool'&&e.tool.name===tool&&e.tool.status==='success'),`No successful backend receipt for ${tool}`);
    const list=(await json('/lists')).lists.find(x=>x.name===marker);assert(list&&list.items.length===2);created.push(['/lists/'+list.id,{confirm:true}]);
    const note=(await json('/notes')).notes.find(x=>x.title===marker);assert(note);created.push(['/notes/'+note.id,undefined]);
    await json('/list-items/'+list.items[0].id,'PATCH',{completed:true});
    // A different authenticated session reads persisted state, not in-memory UI state.
    await json('/auth/logout','POST');token=(await operator.call('session')).token;
    assert.equal((await json('/lists/'+list.id)).list.items[0].completed,true);
    assert((await json('/notes')).notes.some(x=>x.id===note.id));
    const duplicate=(await json('/lists','POST',{name:marker,items:['huevos','leche']})).list;assert.equal(duplicate.id,list.id);assert.equal(duplicate.items.length,2);
    report.push('Real AI tools, note/list persistence across sessions, checked item and deduplication');
    const birthday=(await json('/birthdays','POST',{name:marker,day:18,month:5})).birthday;created.push(['/birthdays/'+birthday.id,{confirm:true}]);
    assert.equal(birthday.birth_year,null);assert(birthday.next_run);
    const configuredTime=(await json('/birthday-settings')).time;
    assert.equal(new Intl.DateTimeFormat('es-ES',{timeZone:'Europe/Madrid',hour:'2-digit',minute:'2-digit'}).format(new Date(birthday.next_run)),configuredTime);
    const again=(await json('/birthdays','POST',{name:marker,day:18,month:5})).birthday;assert.equal(again.automation_id,birthday.automation_id);
    report.push('Birthday, Madrid time, single linked annual reminder');
    const remote=await json('/remote/status');
    const existingTokens=(await json('/remote/tokens')).tokens;
    if(remote.enabled || existingTokens.length===0) {
      let remoteId; let captureToken='';
      try {
        if(!remote.enabled) await json('/remote/status','PATCH',{enabled:true});
        const connection=(await json('/remote/tokens','POST',{name:marker,scope:'write',capability:'capture'})).token;
        remoteId=connection.id;captureToken=connection.token;
        const remoteCall=async(path,method='GET',body)=>fetch(TARGET.origin+'/api'+path,{method,headers:{authorization:`Bearer ${captureToken}`,'content-type':'application/json','user-agent':'Mozilla/5.0'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30_000)});
        const request={request_id:randomUUID(),text:`Guarda una nota titulada Siri ${marker} que diga comprar un regalo ficticio.`};
        let response=await remoteCall('/capture','POST',request);assert(response.ok);
        let capture=await response.json();
        const deadline=Date.now()+150_000;
        while(capture.status==='running' && Date.now()<deadline) {
          await new Promise(resolve=>setTimeout(resolve,2000));
          response=await remoteCall('/capture/'+request.request_id);assert(response.ok);capture=await response.json();
        }
        assert.equal(capture.status,'complete','Siri capture did not complete');
        assert(capture.actions.some(action=>action.tool==='create_note'));
        const saved=(await json('/notes')).notes.find(note=>note.title===`Siri ${marker}`);assert(saved);created.push(['/notes/'+saved.id,undefined]);
        const replay=await (await remoteCall('/capture','POST',request)).json();assert.deepEqual(replay,capture);
        assert.equal((await json('/notes')).notes.filter(note=>note.title===`Siri ${marker}`).length,1);
        await json('/remote/tokens/'+remoteId,'DELETE');remoteId=undefined;
        assert.equal((await remoteCall('/capture/'+request.request_id)).status,401);
        report.push('Siri capture API: real AI note, persistence, duplicate prevention and token revocation');
      } finally {
        if(remoteId) await json('/remote/tokens/'+remoteId,'DELETE');
        captureToken='';
        if(!remote.enabled) await json('/remote/status','PATCH',{enabled:false});
      }
    }
    report.push(remote.enabled?'Siri remote access remains enabled':'Siri remote access remains disabled, as before release; owner setup required');
    const anonymous=await fetch(TARGET.origin+'/api/capture',{method:'POST',headers:{'content-type':'application/json','user-agent':'Mozilla/5.0','x-talorys-request':'1',origin:TARGET.origin},body:JSON.stringify({request_id:randomUUID(),text:'Prueba anónima'})});assert.equal(anonymous.status,401);
    if(notify) {
      const push=await json('/push/test','POST');assert.equal(push.result.failed,0);assert.equal(push.result.gone,0);assert(push.result.sent>0,'Push provider did not accept any test delivery');
      report.push(`Push provider accepted ${push.result.sent} test notification(s); physical iPhone receipt pending`);
    }
    result={checks:report,marker,checkedAt:new Date().toISOString()};
  } catch(error) { failure=error; } finally {
    const failures=[];
    for(const [path,body] of created.reverse()) {try {await json(path,'DELETE',body);}catch {failures.push(path.split('/')[1]);}}
    try {await call('/auth/logout','POST');}finally {token='';}
    if(failures.length) failure ??= new Error(`Test cleanup needs review: ${failures.join(', ')}`);
  }
  if(failure) throw failure;
  return result;
}
