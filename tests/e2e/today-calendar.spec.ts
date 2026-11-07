import {test,expect,type Page} from '@playwright/test';
const password=process.env.TALORYS_DEV_PASSWORD||'talorys-dev-password';
async function login(page:Page){
 await page.goto('/');await page.getByLabel('Contraseña',{exact:true}).fill(password);
 await page.getByRole('button',{name:'Entrar en mi espacio'}).click();
 await expect(page.getByRole('heading',{name:'Hola, Diego.'})).toBeVisible();
}
async function data(page:Page,path:string,method='GET',body?:unknown){
 const response=await page.request.fetch('/api'+path,{method,data:body,headers:{'x-talorys-request':'1'}});
 expect(response.ok(),`${method} ${path}`).toBeTruthy();return response.json();
}
async function choose(page:Page,date:string){
 await page.getByLabel('Ir a fecha',{exact:true}).fill(date);
 await expect(page.getByLabel('Ir a fecha',{exact:true})).toHaveValue(date);
 await expect(page.getByRole('status').filter({hasText:'Cargando calendario'})).toHaveCount(0);
}

test('Hoy: día, semana, mes, navegación y edición persistente de los tres tipos @mobile',async({page},testInfo)=>{
 await login(page);
 await data(page,'/settings','PATCH',{timezone:'Europe/Madrid'});
 const marker='PRUEBA calendario '+crypto.randomUUID().slice(0,8);
 const {task}=await data(page,'/tasks','POST',{title:marker+' tarea',due_at:'2032-05-18T12:00:00Z'});
 const {automation:r}=await data(page,'/automations','POST',{name:marker+' aviso',kind:'reminder',message:marker,schedule:{type:'once',at:'2032-05-18T15:00'},enabled:true});
 const {birthday:b}=await data(page,'/birthdays','POST',{name:marker+' persona',month:5,day:18});
 try {
  await page.goto('/today');await choose(page,'2032-05-18');
  for(const [label,view] of [['Día','day'],['Semana','week'],['Mes','month']]){
   await page.getByRole('button',{name:label,exact:true}).click();
   await expect(page.getByTestId('calendar-'+view)).toBeVisible();
   await page.screenshot({path:testInfo.outputPath(view+'.png')});
   await expect(page.getByRole('button',{name:'Editar tarea: '+marker+' tarea',exact:true})).toBeVisible();
   await expect(page.getByRole('button',{name:'Editar recordatorio: '+marker+' aviso',exact:true})).toHaveCount(1);
   await expect(page.getByRole('button',{name:'Editar cumpleaños: Cumpleaños de '+b.name,exact:true})).toHaveCount(1);
  }
  // Month navigation, a selected day in the grid, then week and day navigation.
  await page.getByRole('button',{name:'Periodo siguiente'}).click();await expect(page.getByLabel('Ir a fecha',{exact:true})).toHaveValue('2032-06-18');
  await page.getByRole('button',{name:'Periodo anterior'}).click();
  await page.getByRole('button',{name:/miércoles, 19 de mayo de 2032/}).click();await expect(page.getByLabel('Ir a fecha',{exact:true})).toHaveValue('2032-05-19');
  await choose(page,'2032-05-18');await page.getByRole('button',{name:'Semana',exact:true}).click();
  await page.getByRole('button',{name:'Periodo siguiente'}).click();await expect(page.getByLabel('Ir a fecha',{exact:true})).toHaveValue('2032-05-25');
  await page.getByRole('button',{name:'Periodo anterior'}).click();await page.getByRole('button',{name:'Día',exact:true}).click();
  await page.getByRole('button',{name:'Periodo siguiente'}).click();await expect(page.getByLabel('Ir a fecha',{exact:true})).toHaveValue('2032-05-19');
  await page.getByRole('button',{name:'Periodo anterior'}).click();
  // Task: same ID, new date, done, still done after reload.
  await page.getByRole('button',{name:'Editar tarea: '+marker+' tarea',exact:true}).click();
  await page.getByLabel('Título',{exact:true}).fill(marker+' tarea editada');
  await page.getByLabel('Fecha y hora',{exact:true}).fill('2032-05-19T14:30');
  await page.getByRole('combobox',{name:'Estado',exact:true}).selectOption('done');
  await page.getByRole('button',{name:'Guardar tarea',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  const saved=(await data(page,'/tasks/'+task.id)).task;expect(saved.due_at).toBe('2032-05-19T12:30:00.000Z');expect(saved.status).toBe('done');
  // Reminder keeps its ID and notification schedule; date changes, then pause/resume.
  await page.getByRole('button',{name:'Editar recordatorio: '+marker+' aviso',exact:true}).click();
  await page.getByLabel('Fecha y hora',{exact:true}).fill('2032-05-19T16:00');
  await page.getByRole('button',{name:'Guardar recordatorio',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await data(page,'/automations/'+r.id)).automation.next_run).toBe('2032-05-19T14:00:00.000Z');
  // Birthday edit updates the linked annual notification, without adding another occurrence.
  await page.getByRole('button',{name:'Editar cumpleaños: Cumpleaños de '+b.name,exact:true}).click();
  await page.getByLabel('Día',{exact:true}).fill('19');await page.getByRole('button',{name:'Guardar y activar aviso anual'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  const birthday=(await data(page,'/birthdays')).birthdays.find((x:any)=>x.id===b.id);expect(birthday.automation_id).toBe(b.automation_id);
  expect((await data(page,'/automations/'+b.automation_id)).automation.schedule).toMatchObject({type:'yearly',day:19,month:5,timezone:'Europe/Madrid'});
  await page.reload();await choose(page,'2032-05-19');
  await expect(page.getByRole('button',{name:'Reabrir '+marker+' tarea editada',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Reabrir '+marker+' tarea editada',exact:true}).click();
  await expect(page.getByRole('button',{name:'Completar '+marker+' tarea editada',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Editar recordatorio: '+marker+' aviso',exact:true}).click();await page.getByLabel('Aviso activo').uncheck();await page.getByRole('button',{name:'Guardar recordatorio',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await data(page,'/automations/'+r.id)).automation.next_run).toBeNull();
  await page.getByRole('button',{name:'Editar recordatorio: '+marker+' aviso',exact:true}).click();await page.getByLabel('Aviso activo').check();await page.getByRole('button',{name:'Guardar recordatorio',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await data(page,'/automations/'+r.id)).automation.next_run).toBe('2032-05-19T14:00:00.000Z');
  await choose(page,'2033-05-19');await expect(page.getByRole('button',{name:'Editar cumpleaños: Cumpleaños de '+b.name,exact:true})).toHaveCount(1);
  await page.getByRole('button',{name:'Ir a hoy',exact:true}).click();
  expect(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth)).toBe(true);
 }finally{
  await data(page,'/tasks/'+task.id,'DELETE');await data(page,'/automations/'+r.id,'DELETE');await data(page,'/birthdays/'+b.id,'DELETE',{confirm:true});
 }
});

test('Hoy: una edición fallida conserva el formulario y los datos anteriores @mobile',async({page})=>{
 await login(page);
 const title='PRUEBA fallo calendario '+crypto.randomUUID().slice(0,8);
 const {task}=await data(page,'/tasks','POST',{title,due_at:'2032-05-18T12:00:00Z'});
 try{
  await page.goto('/today');await choose(page,'2032-05-18');
  await page.getByRole('button',{name:'Editar tarea: '+title,exact:true}).click();await page.getByLabel('Título',{exact:true}).fill(title+' editada');
  await page.route('**/api/tasks/'+task.id,async route=>{
   if(route.request().method()!=='PATCH')return route.continue();
   await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:{code:'INTERNAL_ERROR',message:'Fallo de guardado de prueba'}})});
  });
  await page.getByRole('button',{name:'Guardar tarea',exact:true}).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Fallo de guardado');
  await expect(page.getByRole('dialog')).toBeVisible();expect((await data(page,'/tasks/'+task.id)).task.title).toBe(title);
 }finally{await data(page,'/tasks/'+task.id,'DELETE');}
});
