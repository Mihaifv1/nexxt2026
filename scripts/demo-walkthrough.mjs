import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await mkdir('outputs',{recursive:true});
const base='http://127.0.0.1:5173';
async function call(path,body){const response=body===undefined?await page.request.get(base+'/api/b2c/'+path):await page.request.post(base+'/api/b2c/'+path,{data:body,headers:{'Idempotency-Key':crypto.randomUUID()}});const value=await response.json();assert.ok(response.ok(),path+': '+response.status()+' '+JSON.stringify(value));return value;}
const get=id=>call('cases/'+id);
async function action(c,action,extra={}){await call('cases/'+c.id+'/actions',{action,expected_version:c.version,...extra});return get(c.id);}
try{
 await page.goto(base+'/signin-with-chatgpt?return_to=/b2c/dashboard');
 await page.getByRole('heading',{name:'Un client. Toate operațiunile. Un singur fir.'}).waitFor();
 await page.getByRole('combobox',{name:'Rol demo',exact:true}).selectOption('B2C_SUPERVISOR');
 await page.getByText('Rolul demo a fost actualizat.',{exact:true}).waitFor();
 await page.screenshot({path:'outputs/next-dashboard-desktop.png',fullPage:true});
 const name='Alex NEXT Demo '+Date.now().toString().slice(-5);
 let created=await call('cases',{workflow_id:'B2C-01',customer_name:name,input:{full_name:name,age:32,address:'Strada Exemplu 10 DEMO',email:'alex.demo@example.test',tax_residence:'RO'}});
 let onboarding=await action(await get(created.case_id),'RUN');assert.equal(onboarding.state,'NEEDS_CLARIFICATION');
 onboarding=await action(onboarding,'REQUEST_INFO');
 await call('session',{role:'DEMO_CUSTOMER',customer_id:onboarding.customer_id});
 let task=onboarding.tasks.at(-1);const identity=await call('customer/tasks/'+task.id+'/sample?kind=IDENTITY');
 await call('customer/tasks/'+task.id+'/respond',{expected_version:onboarding.version,answers:{},documents:[{kind:'IDENTITY',...identity}]});
 onboarding=await get(onboarding.id);assert.equal(onboarding.state,'READY_FOR_REVIEW');onboarding=await action(onboarding,'APPROVE');assert.equal(onboarding.state,'APPROVED_DEMO');
 created=await call('cases',{workflow_id:'B2C-02',customer_id:onboarding.customer_id,input:{address:'Strada Exemplu 10 DEMO',email:'alex.demo@example.test',tax_residence:'RO'}});
 let contract=await action(await get(created.case_id),'RUN');assert.equal(contract.state,'INTERNAL_REVIEW');
 const doc=contract.documents.filter(d=>d.direction==='OUTPUT').at(-1);
 const pdf=await page.request.get(base+`/api/b2c/cases/${contract.id}/documents/${doc.id}/pdf`);assert.ok(pdf.ok());assert.ok((await pdf.body()).subarray(0,5).toString().startsWith('%PDF-'));await writeFile('outputs/next-contract-demo.pdf',await pdf.body());
 await page.goto(base+'/b2c/cases/'+contract.id);await page.getByRole('heading',{name:'Human Approval',exact:true}).waitFor();await page.screenshot({path:'outputs/next-contract-workspace.png',fullPage:true});
 await page.getByRole('button',{name:'Previzualizează documentul',exact:true}).click();await page.getByRole('dialog',{name:'Previzualizare document demonstrativ'}).waitFor();await page.screenshot({path:'outputs/next-contract-preview.png',fullPage:true});await page.getByRole('button',{name:'Închide documentul'}).click();
 await page.getByRole('button',{name:'Aprobă și trimite la semnare mock',exact:true}).click();await page.getByRole('heading',{name:'Documentul așteaptă semnarea mock.'}).waitFor();
 await page.getByRole('button',{name:'Deschide Smart Mobile',exact:true}).click();await page.getByRole('button',{name:'Accept și semnez mock',exact:true}).waitFor();
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'outputs/next-signature-mobile.png',fullPage:true});
 await page.getByRole('checkbox',{name:/Am revizuit versiunea/}).check();await page.getByRole('button',{name:'Accept și semnez mock',exact:true}).click();
 await page.getByText('Semnarea mock a fost înregistrată.',{exact:true}).waitFor();contract=await get(contract.id);assert.equal(contract.state,'ACTIVATED_DEMO');
 const client=await call('clients/'+onboarding.customer_id);assert.equal(client.operations.products.filter(p=>p.status==='ACTIVE_DEMO').length,1);
 await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/b2c/clients/'+onboarding.customer_id);await page.getByRole('heading',{name:'Produse demonstrative',exact:true}).waitFor();await page.screenshot({path:'outputs/next-customer-360.png',fullPage:true});
 created=await call('cases',{workflow_id:'B2C-03',customer_id:onboarding.customer_id,input:{amount_minor:5000000,term_months:60,income_minor:650000,obligations_minor:70000,details:'Credit ilustrativ DEMO'},scenario:'CONFLICT'});
 let credit=await get(created.case_id);for(const kind of ['SALARY','BANK_STATEMENT']){const sample=await call(`cases/${credit.id}/sample?kind=${kind}`);credit=await action(credit,'ADD_DOCUMENT',{document:{kind,...sample}});}
 credit=await action(credit,'RUN');assert.equal(credit.state,'NEEDS_CLARIFICATION');assert.ok(credit.runs.at(-1).contradictions.some(s=>s.includes('Venitul declarat')));
 credit=await action(credit,'REQUEST_INFO');task=credit.tasks.at(-1);await call('customer/tasks/'+task.id+'/respond',{expected_version:credit.version,answers:{income_minor:550000},documents:[]});credit=await get(credit.id);assert.equal(credit.state,'INTERNAL_REVIEW');assert.ok(credit.runs.at(-1).illustration.installment_minor>0);
 credit=await action(credit,'APPROVE');task=credit.tasks.at(-1);await call('customer/tasks/'+task.id+'/respond',{expected_version:credit.version,accept:false,document_id:task.document_id,document_version:task.document_version,document_hash:task.document_hash});assert.equal((await get(credit.id)).state,'CUSTOMER_DECLINED');
 created=await call('cases',{workflow_id:'B2C-08',customer_id:onboarding.customer_id,input:{details:'Doresc clarificarea comisionului sintetic.',received_date:new Date().toISOString().slice(0,10)}});let complaint=await action(await get(created.case_id),'RUN');assert.equal(complaint.state,'READY_FOR_REVIEW');complaint=await action(complaint,'APPROVE',{message:'Răspuns demonstrativ revizuit: am consemnat dovezile sintetice pentru verificare. Nu se execută operațiuni financiare.'});assert.equal(complaint.state,'COMPLETED_DEMO');
 const mobile=await call('customer/tasks');assert.ok(mobile.find(c=>c.id===complaint.id).tasks.some(t=>t.status==='DELIVERED'));
 await page.goto(base+'/b2c/workflows');await page.getByRole('heading',{name:'29 de fluxuri. Aceeași infrastructură.'}).waitFor();assert.equal(await page.locator('.ops-workflow-card').count(),29);
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'outputs/next-workflows-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);
 const result={onboarding:onboarding.reference,contract:contract.reference,credit:credit.reference,complaint:complaint.reference,customer_id:onboarding.customer_id,pdf:true,mobile_overflow:false,page_errors:errors};await writeFile('outputs/next-walkthrough.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
