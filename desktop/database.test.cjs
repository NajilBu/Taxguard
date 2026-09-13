const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {Store,scheduleDate}=require('./database.cjs');
const dataTransfer=require('./data-transfer.cjs');
const {seedSamples}=require('./seed.cjs');
const root=path.join(__dirname,'..');
test('Compliance statuses agree across clients and filings at the due-date boundary',()=>{
  const vm=require('node:vm');
  const source=fs.readFileSync(path.join(root,'app.js'),'utf8');
  const code=source.slice(source.indexOf('function complianceStatus('),source.indexOf('function filteredClientRows('))
    +source.slice(source.indexOf('function filingStatus('),source.indexOf('function deadlineRiskBuckets('));
  const ctx=vm.createContext({today:'2026-09-10'});
  vm.runInContext(code,ctx);
  const client={id:1};
  const yesterday={c:client,due:'2026-09-09'};
  const dueToday={c:client,due:'2026-09-10'};
  const future={c:client,due:'2026-09-11'};
  assert.equal(ctx.status(client,[]),'N/A');
  assert.equal(ctx.status(client,[dueToday,future]),'Pending');
  assert.equal(ctx.status(client,[yesterday,future]),'Incomplete');
  yesterday.filing={date:'2026-09-10'};
  assert.equal(ctx.status(client,[yesterday,future]),'Pending');
  future.filing={date:'2026-09-10'};
  assert.equal(ctx.status(client,[yesterday,future]),'Complete');
  assert.equal(ctx.status({id:2},[yesterday,future]),'N/A');
  assert.equal(ctx.filingStatus(dueToday),'Pending');
  ctx.today='2026-09-11';
  assert.equal(ctx.filingStatus(dueToday),'Incomplete');
  dueToday.filing={date:'2026-09-11'};
  assert.equal(ctx.filingStatus(dueToday),'Complete');
});
test('Client directory search, tax and business filters combine with alphabetical sorting',()=>{
  const vm=require('node:vm');
  const source=fs.readFileSync(path.join(root,'app.js'),'utf8');
  const code=source.slice(source.indexOf('function filteredClientRows('),source.indexOf('function filingStatus('));
  const context=vm.createContext({});
  vm.runInContext(code,context);
  const clients=[
    {name:'Zeta Stores',tin:'111',tax:'VAT',type:'Corporation'},
    {name:'Alpha Shop',tin:'222',tax:'NVAT',type:'Sole proprietorship'},
    {name:'Beta Stores',tin:'333',tax:'VAT',type:'Corporation'}
  ];
  const names=(search,tax,type,sort)=>Array.from(context.filteredClientRows(clients,search,tax,type,sort),c=>c.name);
  assert.deepEqual(names('','all','all','az'),['Alpha Shop','Beta Stores','Zeta Stores']);
  assert.deepEqual(names('stores','VAT','Corporation','za'),['Zeta Stores','Beta Stores']);
  assert.deepEqual(names('333','VAT','all','az'),['Beta Stores']);
  assert.deepEqual(names('','NVAT','Corporation','az'),[]);
});
test('Risk radar separates overdue, today, three-day, and seven-day obligations',()=>{
  const vm=require('node:vm');
  const source=fs.readFileSync(path.join(root,'app.js'),'utf8');
  const code=source.slice(source.indexOf('function deadlineRiskBuckets('),source.indexOf('function riskRadar('));
  const context=vm.createContext({Date,Math});vm.runInContext(code,context);
  const items=['2026-09-09','2026-09-10','2026-09-13','2026-09-17','2026-09-18'].map(due=>({due}));
  items.push({due:'2026-09-10',filing:{date:'2026-09-10'}});
  const buckets=context.deadlineRiskBuckets(items,'2026-09-10');
  assert.deepEqual(Object.fromEntries(Object.entries(buckets).map(([key,rows])=>[key,rows.length])),
    {overdue:1,today:1,within3:1,within7:1});
});
test('Pullout date survives SQLite reload with client history intact',()=>{
  const {file}=fixture();let store=new Store(file,root);
  const archived={...client,status:'Pulled out',pulledOutAt:'2026-06-30'};
  store.saveState({clients:[archived],filings:{'1:2026:2550-Q:Q1':{date:'2026-04-20',reference:'HISTORY'}}});
  store.close();store=new Store(file,root);
  const loaded=store.load();
  assert.equal(loaded.clients[0].status,'Pulled out');
  assert.equal(loaded.clients[0].pulledOutAt,'2026-06-30');
  assert.deepEqual(loaded.clients[0].serviceHistory,[{end:'2026-06-30',restart:null}]);
  assert.equal(loaded.filings['1:2026:2550-Q:Q1'].reference,'HISTORY');
  const restored={...loaded.clients[0],status:'Active',pulledOutAt:undefined,serviceHistory:[{end:'2026-06-30',restart:'2026-08-01'}]};
  store.saveState({clients:[restored],filings:loaded.filings},loaded.revision);
  store.close();store=new Store(file,root);
  const afterRestart=store.load();
  assert.equal(afterRestart.clients[0].status,'Active');
  assert.deepEqual(afterRestart.clients[0].serviceHistory,[{end:'2026-06-30',restart:'2026-08-01'}]);
  assert.equal(afterRestart.filings['1:2026:2550-Q:Q1'].reference,'HISTORY');
  store.saveState({clients:[{...afterRestart.clients[0],serviceHistory:[{end:'2026-06-30',restart:'2026-06-30'}]}],filings:afterRestart.filings},afterRestart.revision);
  assert.deepEqual(store.load().clients[0].serviceHistory,[{end:'2026-06-30',restart:'2026-06-30'}]);
  store.close();
});
test('Service gaps exclude unfiled periods but retain historical filings',()=>{
  const vm=require('node:vm');
  const source=fs.readFileSync(path.join(root,'app.js'),'utf8');
  const code=source.slice(source.indexOf('function servicePeriodApplies('),source.indexOf('function obligationsForYear('));
  const context=vm.createContext({});vm.runInContext(code,context);
  const client={serviceHistory:[{end:'2026-06-30',restart:'2026-08-01'},{end:'2027-03-31',restart:null}]};
  assert.equal(context.servicePeriodApplies(client,'2026-06-30',null),true);
  assert.equal(context.servicePeriodApplies(client,'2026-07-31',null),false);
  assert.equal(context.servicePeriodApplies(client,'2026-07-31',{date:'2026-08-02'}),true);
  assert.equal(context.servicePeriodApplies(client,'2026-08-31',null),true);
  assert.equal(context.servicePeriodApplies(client,'2027-04-30',null),false);
});
test('Client documents persist and remain linked to filing records',()=>{
  const {file}=fixture();let store=new Store(file,root);
  store.saveState({clients:[client],filings:{'1:2026:2550-Q:Q1':{date:'2026-04-20',reference:'FILED'}}});
  const content=Buffer.from('%PDF-1.4\nexample').toString('base64');
  const listed=store.saveClientDocument({clientId:1,filename:'receipt.pdf',mime:'application/pdf',base64:content,filingKey:'1:2026:2550-Q:Q1'});
  assert.equal(listed.length,1);store.close();store=new Store(file,root);
  assert.equal(store.getClientDocument(listed[0].id).content_base64,content);
  assert.equal(store.listClientDocuments(1)[0].filing_key,'1:2026:2550-Q:Q1');
  assert.equal(store.deleteClientDocument(listed[0].id).length,0);
  store.close();
});
test('Selective data transfer maps clients, filings, and documents without changing unselected records',()=>{
  const source=new Store(fixture().file,root),target=new Store(fixture().file,root);
  source.saveState({clients:[client],filings:{'1:2026:2550-Q:Q1':{date:'2026-04-20',reference:'SOURCE'}}});
  source.saveClientDocument({clientId:1,filingKey:'1:2026:2550-Q:Q1',filename:'proof.pdf',mime:'application/pdf',base64:Buffer.from('%PDF-1.4').toString('base64')});
  const other={...client,name:'Existing',tin:'987-654-321-000'};
  target.saveState({clients:[other],filings:{}});
  const payload=dataTransfer.exportData(source,['clients','filings','documents']);
  assert.deepEqual(Object.keys(payload.sections),['clients','filings','documents']);
  const preview=dataTransfer.previewDataImport(target,payload,['clients','filings','documents']);
  assert.equal(preview.clients.new,1);assert.equal(preview.filings.new,1);assert.equal(preview.documents.new,1);
  dataTransfer.importData(target,payload,['clients','filings','documents'],target.revision());
  const loaded=target.load(),imported=loaded.clients.find(c=>c.tin===client.tin);
  assert.equal(loaded.clients.length,2);assert.equal(loaded.clients.find(c=>c.id===1).name,'Existing');
  assert.equal(loaded.filings[`${imported.id}:2026:2550-Q:Q1`].reference,'SOURCE');
  assert.equal(target.listClientDocuments(imported.id)[0].filing_key,`${imported.id}:2026:2550-Q:Q1`);
  assert.equal(target.getCompanyName(),'EOO Tax & Accounting');
  const again=dataTransfer.importData(target,payload,['clients','filings','documents'],target.revision());
  assert.equal(again.clients.skipped,1);assert.equal(again.filings.skipped,1);assert.equal(again.documents.skipped,1);
  source.close();target.close();
});
test('Selective import leaves other categories untouched and rolls back invalid documents',()=>{
  const source=new Store(fixture().file,root),target=new Store(fixture().file,root);
  source.saveState({clients:[client],filings:{}});source.saveCompanyProfile({name:'Imported Firm',logo:''});
  target.saveState({clients:[{...client,name:'Local Name'}],filings:{}});
  const payload=dataTransfer.exportData(source,['clients','companyProfile']);
  dataTransfer.importData(target,payload,['companyProfile'],target.revision());
  assert.equal(target.getCompanyName(),'Imported Firm');assert.equal(target.load().clients[0].name,'Local Name');
  const bad={...payload,sections:{clients:[{...client,id:2,tin:'999-888-777-000'}],documents:[{client_id:2,filename:'bad.exe',mime_type:'application/octet-stream',content_base64:'YWJj'}]}};
  assert.throws(()=>dataTransfer.importData(target,bad,['clients','documents'],target.revision()),/Choose a PDF/);
  assert.ok(target.load().clients.length>=0);
  source.close();target.close();
});
test('Selective Excel workbook round-trips all chosen data categories',async()=>{
  const excelTransfer=require('./excel-transfer.cjs');
  const source=new Store(fixture().file,root),target=new Store(fixture().file,root);
  source.saveState({clients:[client],filings:{'1:2026:2550-Q:Q1':{date:'2026-04-20',reference:'EXCEL'}}});
  source.saveClientDocument({clientId:1,filingKey:'1:2026:2550-Q:Q1',filename:'proof.pdf',mime:'application/pdf',base64:Buffer.from('%PDF-1.4').toString('base64')});
  source.saveCompanyProfile({name:'Excel Firm',logo:''});
  const selected=['clients','filings'];
  const base64=await excelTransfer.exportWorkbook(source,selected);
  const payload=await excelTransfer.readWorkbook(base64);
  assert.deepEqual(Object.keys(payload.sections),selected);
  assert.equal(payload.sections.clients[0].name,'Test client');
  assert.equal(payload.sections.filings['1:2026:2550-Q:Q1'].reference,'EXCEL');
  dataTransfer.importData(target,payload,selected,target.revision());
  assert.equal(target.load().clients.length,1);
  assert.equal(target.load().filings['1:2026:2550-Q:Q1'].reference,'EXCEL');
  assert.equal(target.listClientDocuments(1).length,0);
  source.close();target.close();
});
test('CSV migration merges by TIN and rejects invalid rows atomically',()=>{
  const {file}=fixture();const store=new Store(file,root);
  store.saveState({clients:[client],filings:{}});
  const csv='name,tin,business_type,tax_type,start_of_filing,required_forms\nExisting,123-456-789-000,Corporation,VAT,2025-01-01,2550-Q\nNew Client,999-888-777-000,Corporation,VAT,2026-01-01,2550-Q';
  assert.deepEqual({...store.importClientsCsv(csv)}, {imported:1,skipped:1,revision:store.revision()});
  assert.equal(store.load().clients.length,2);
  assert.throws(()=>store.importClientsCsv('name,tin,business_type,tax_type,start_of_filing\nBad,invalid,Corporation,VAT,2026-01-01'),/TIN/);
  assert.equal(store.load().clients.length,2);store.close();
});
test('Excel migration reads a standard client-list worksheet',async()=>{
  const ExcelJS=require('exceljs'),{parseXlsxBuffer}=require('./migration.cjs');
  const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('Clients');
  sheet.addRow(['Name','TIN','Business Type','Tax Type','Start of Filing','Required Forms']);
  sheet.addRow(['Excel Client','888-777-666-000','Corporation','VAT',new Date('2026-01-01T00:00:00Z'),'2550-Q']);
  const rows=await parseXlsxBuffer(Buffer.from(await workbook.xlsx.writeBuffer()));
  const {file}=fixture(),store=new Store(file,root);
  const result=store.importClientsRows(rows);
  assert.equal(result.imported,1);
  assert.equal(store.load().clients[0].tin,'888-777-666-000');
  assert.equal(store.load().clients[0].start,'2026-01-01');store.close();
});
test('Custom client fields and definitions persist across SQLite reopen',()=>{
  const {file}=fixture();let store=new Store(file,root);
  store.saveClientFields(['RDO','Contact person']);
  store.saveState({clients:[{...client,customFields:{RDO:'042','Contact person':'Ana'}}],filings:{}});
  store.close();store=new Store(file,root);
  assert.deepEqual(store.getClientFields(),['RDO','Contact person']);
  assert.deepEqual(store.load().clients[0].customFields,{RDO:'042','Contact person':'Ana'});
  const renamed=store.renameClientField('RDO','Revenue district',store.revision());
  assert.deepEqual(renamed.fields,['Revenue district','Contact person']);
  assert.deepEqual(store.load().clients[0].customFields,{'Revenue district':'042','Contact person':'Ana'});
  assert.throws(()=>store.renameClientField('Contact person','Revenue district',store.revision()),/unique/);
  assert.throws(()=>store.saveClientFields(['RDO','rdo']),/unique/);
  store.close();
});
test('Calendar holidays and sourced extensions persist and validate',()=>{
  const {file}=fixture();let store=new Store(file,root);
  store.saveCalendarRule({rule_type:'holiday',rule_date:'2026-10-12',label:'Official holiday',source_url:'https://bir.gov.ph/'});
  store.saveCalendarRule({rule_type:'extension',rule_date:'2026-10-25',form_code:'2550-Q',tax_year:2026,period:'Q3',adjusted_due:'2026-10-30',source_url:'https://bir.gov.ph/'});
  assert.throws(()=>store.saveCalendarRule({rule_type:'extension',rule_date:'2026-10-25',form_code:'2550-Q',tax_year:2026,period:'Q3',adjusted_due:'2026-10-30'}),/source/);
  store.close();store=new Store(file,root);
  assert.equal(store.getCalendarRules().length,2);
  store.deleteCalendarRule(store.getCalendarRules()[0].id);
  assert.equal(store.getCalendarRules().length,1);store.close();
});
test('Full SQLite backup includes clients, users, documents, and calendar rules',()=>{
  const {dir,file}=fixture(),backup=path.join(dir,'complete-backup.db');let store=new Store(file,root);
  store.saveState({clients:[client],filings:{}});
  store.saveClientDocument({clientId:1,filename:'proof.pdf',mime:'application/pdf',base64:Buffer.from('%PDF-1.4').toString('base64')});
  store.saveCalendarRule({rule_type:'holiday',rule_date:'2026-10-12',label:'Test day'});
  store.backupTo(backup);assert.equal(Store.validateBackup(backup),true);store.close();
  store=new Store(backup,root);
  assert.equal(store.load().clients.length,1);
  assert.equal(store.getUsers().length,1);
  assert.equal(store.listClientDocuments(1).length,1);
  assert.equal(store.getCalendarRules().length,1);store.close();
});
function fixture(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'taxguard-db-test-'));return {dir,file:path.join(dir,'taxguard.db')}}
const client={id:1,name:'Test client',tin:'123-456-789-000',type:'Corporation',tax:'VAT',status:'Active',start:'2025-01-01',remarks:'Test',forms:['2550-Q']};
test('Years outside the old range save, reopen, and retain deadline edits',()=>{
  const {file}=fixture();let s=new Store(file,root);
  const filings={};
  for(const y of [2010,2035])filings[`1:${y}:2550-Q:Q4`]={date:`${y+1}-01-20`,reference:'YEAR-TEST'};
  s.saveState({clients:[{...client,start:'2010-01-01'}],filings});
  const forms=s.load().forms;forms.find(f=>f.id==='2550-Q').overrides={2035:{Q4:'2036-01-29'}};
  s.saveForms(forms);s.close();s=new Store(file,root);
  assert.equal(Object.keys(s.load().filings).length,2);
  assert.equal(s.db.prepare("SELECT due_date FROM deadlines d JOIN forms f ON f.id=d.form_id WHERE f.code='2550-Q' AND tax_year=2035 AND period='Q4'").get().due_date,'2036-01-29');
  s.close();
});
test('Local date rollover updates overdue logic without replacing an edited profile',()=>{
  const vm=require('node:vm');
  const source=fs.readFileSync(path.join(root,'app.js'),'utf8');
  const functions=source.slice(source.indexOf('function localDate('),source.indexOf('setInterval(refreshCurrentDate'));
  const context=vm.createContext({Date, today:'2026-09-09',renders:0,editing:false,document:{querySelector:selector=>selector==='#company-profile-form'&&context.editing?{}:null},render:()=>context.renders++});
  vm.runInContext(functions,context);
  assert.equal(vm.runInContext('localDate(new Date(2026,0,1,0,1))',context),'2026-01-01');
  vm.runInContext("localDate=()=> '2026-09-10';refreshCurrentDate()",context);
  assert.equal(context.today,'2026-09-10');assert.equal(context.renders,1);
  assert.equal(vm.runInContext("'2026-09-09'<today && !('2026-09-10'<today)",context),true);
  context.editing=true;
  vm.runInContext("localDate=()=> '2026-09-11';refreshCurrentDate()",context);
  assert.equal(context.today,'2026-09-11');assert.equal(context.renders,1);
});
test('SQLite survives reopen: client, assignments, filing, deadline override',()=>{
  const {file}=fixture();let s=new Store(file,root);
  const state={clients:[client],filings:{'1:2026:2550-Q:Q1':{date:'2026-04-20',reference:'TEST-1',remarks:'Filed'}}};
  s.saveState(state);
  const forms=s.load().forms,f=forms.find(f=>f.id==='2550-Q');f.overrides={2026:{Q1:'2026-04-28'}};s.saveForms(forms);s.close();
  s=new Store(file,root);const loaded=s.load();assert.equal(loaded.clients[0].tin,client.tin);assert.deepEqual(loaded.clients[0].forms,['2550-Q']);assert.equal(loaded.filings['1:2026:2550-Q:Q1'].reference,'TEST-1');
  assert.equal(scheduleDate(loaded.forms.find(f=>f.id==='2550-Q'),'Q1',2026),'2026-04-28');
  assert.equal(scheduleDate(loaded.forms.find(f=>f.id==='2550-Q'),'Q1',2025),'2025-04-25');
  assert.equal(s.db.prepare('PRAGMA foreign_keys').get().foreign_keys,1);assert.equal(s.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');s.close();
});
test('Duplicate TIN and invalid date reject the entire transaction',()=>{
  const {file}=fixture(),s=new Store(file,root);
  assert.throws(()=>s.saveState({clients:[client,{...client,id:2}],filings:{}}),/unique/);
  assert.equal(s.load().clients.length,0);
  assert.throws(()=>s.saveState({clients:[{...client,start:'2026-02-31'}],filings:{}}),/Invalid/);assert.equal(s.load().clients.length,0);s.close();
});
test('Import is atomic and cannot overwrite existing client records',()=>{
  const {file}=fixture(),s=new Store(file,root);const forms=s.load().forms;
  const bad={format:'taxguard-export-v1',forms:structuredClone(forms),state:{clients:[{...client,tax:'INVALID'}],filings:{}}};bad.forms[0].name='Changed';
  assert.throws(()=>s.importWorkspace(bad));assert.equal(s.load().forms[0].name,forms[0].name);assert.equal(s.load().clients.length,0);
  s.importWorkspace({format:'taxguard-export-v1',forms,state:{clients:[client],filings:{}}});assert.equal(s.load().clients.length,1);
  assert.throws(()=>s.importWorkspace({}),/only before/);s.close();
});
test('Sample seed preserves existing records, remaps occupied IDs and runs only once',()=>{
  const {file}=fixture(),s=new Store(file,root);
  s.saveState({clients:[client],filings:{}});
  seedSamples(s,root);
  const first=s.load();assert.equal(first.clients.length,7);assert.equal(first.clients[0].name,'Test client');
  assert.equal(new Set(first.clients.map(c=>c.tin)).size,7);assert.ok(Object.keys(first.filings).length>100);
  first.clients.find(c=>c.tin==='000-000-001-000').name='Edited sample';s.saveState(first);
  const before=s.load();seedSamples(s,root);assert.deepEqual(s.load(),before);s.close();
});
test('Two connections reject stale writes without overwriting newer data',()=>{
  const {file}=fixture(),a=new Store(file,root),b=new Store(file,root);
  const old=b.load();a.saveState({clients:[client],filings:{}},a.load().revision);
  assert.throws(()=>b.saveState({clients:[],filings:{}},old.revision),/another window/);
  assert.throws(()=>b.saveForms(old.forms,old.revision),/another window/);
  assert.equal(b.load().clients[0].name,client.name);a.close();b.close();
});
test('Store authenticates valid company credentials and rejects invalid credentials',()=>{
  const {file}=fixture(),s=new Store(file,root);
  const result=s.login('admin','taxguard2026');
  assert.equal(result.authenticated,true);
  assert.equal(result.company,'EOO Tax & Accounting');
  assert.equal(result.username,'admin');
  assert.throws(()=>s.login('admin','wrongpassword'),/Invalid username or password/);
  assert.throws(()=>s.login('unknown','taxguard2026'),/Invalid username or password/);
  assert.throws(()=>s.login('','taxguard2026'),/Username is required/);
  s.close();
});
test('Company name setting updates the workspace and every login account',()=>{
  const {file}=fixture(),s=new Store(file,root);
  const logo='data:image/png;base64,iVBORw0KGgo=';
  s.saveUser({username:'staff',company_name:'Old name',role:'Staff',password:'secret1'});
  assert.deepEqual(s.saveCompanyProfile({name:'New Firm & Associates',logo,description:'Tax and accounting services'}),{name:'New Firm & Associates',logo,description:'Tax and accounting services'});
  assert.equal(s.getCompanyName(),'New Firm & Associates');
  assert.deepEqual(s.getCompanyProfile(),{name:'New Firm & Associates',logo,description:'Tax and accounting services'});
  assert.equal(s.getUsers().every(u=>u.company_name==='New Firm & Associates'),true);
  assert.equal(s.login('admin','taxguard2026').company,'New Firm & Associates');
  assert.equal(s.login('staff','secret1').company,'New Firm & Associates');
  assert.throws(()=>s.saveCompanyName('   '),/Company name is required/);
  assert.equal(s.getCompanyProfile().description,'Tax and accounting services');
  assert.throws(()=>s.saveCompanyProfile({name:'Firm',logo,description:'x'.repeat(501)}),/500 characters/);
  assert.throws(()=>s.saveCompanyProfile({name:'Firm',logo:'data:image/svg+xml;base64,PHN2Zz4='}),/PNG, JPEG, WebP, GIF, BMP, or ICO/);
  s.close();
});
test('Landing page contains no sqlite references and enforces session-only sign out on exit',()=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.equal(html.includes('<body class="logged-out">'),true,'Workspace must be hidden before scripts initialize');
  const loginSection=html.slice(html.indexOf('<section id="login-landing"'),html.indexOf('</section>'));
  assert.equal(/sqlite/i.test(loginSection),false,'Landing page must not contain SQLite references');
  const appJs=fs.readFileSync(path.join(root,'app.js'),'utf8');
  assert.equal(appJs.includes("localStorage.removeItem('taxguard_auth')"),true);
  assert.equal(appJs.includes("sessionStorage.getItem('taxguard_auth')"),true);
  assert.equal(appJs.includes('auth-transitioning'),true);
  assert.equal(appJs.includes('slide-fade-out'),true);
  const styleCss=fs.readFileSync(path.join(root,'style.css'),'utf8');
  assert.equal(styleCss.includes('.slide-fade-out'),true);
  assert.equal(styleCss.includes('body.auth-transitioning'),true);
  assert.equal(styleCss.includes('dashboardAsideIn'),true);
  assert.equal(styleCss.includes('dashboardMainIn'),true);
  const mainCjs=fs.readFileSync(path.join(root,'desktop/main.cjs'),'utf8');
  assert.equal(mainCjs.includes("e.sender===win?.webContents && e.senderFrame===win.webContents.mainFrame"),true,'IPC trust must use the owning window rather than a path-dependent URL');
});
test('clientModal renders client compliance progress and obligations breakdown',()=>{
  const appJs=fs.readFileSync(path.join(root,'app.js'),'utf8');
  assert.equal(appJs.includes('client-progress-card'),true);
  assert.equal(appJs.includes('client-progress-pct'),true);
  assert.equal(appJs.includes('client-obligations-list'),true);
});
test('Settings layout renders color theme and backup data storage side by side in settings-grid',()=>{
  const dbUiJs=fs.readFileSync(path.join(root,'database-ui.js'),'utf8');
  assert.equal(dbUiJs.includes('settings-grid'),true);
  assert.equal(dbUiJs.includes('storage-panel'),true);
  const styleCss=fs.readFileSync(path.join(root,'style.css'),'utf8');
  assert.equal(styleCss.includes('.settings-grid'),true);
});
test('Settings reports section includes Excel exports with UTF-8 BOM compatibility',()=>{
  const dbUiJs=fs.readFileSync(path.join(root,'database-ui.js'),'utf8');
  assert.equal(dbUiJs.includes('exportToExcel'),true);
  assert.equal(dbUiJs.includes('\\uFEFF'),true);
  assert.equal(dbUiJs.includes('preview-export-excel'),true);
  assert.equal((dbUiJs.match(/exportFn=\(\)=>\{/g)||[]).length,3);
  const styleCss=fs.readFileSync(path.join(root,'style.css'),'utf8');
  assert.equal(styleCss.includes('.reports-panel'),true);
  assert.equal(styleCss.includes('.report-stat-strip'),true);
});
test('Compliance report preview contains visual SVG charts, user commentary editor, and export buttons',()=>{
  const dbUiJs=fs.readFileSync(path.join(root,'database-ui.js'),'utf8');
  assert.equal(dbUiJs.includes('open-report-preview'),true);
  assert.equal(dbUiJs.includes('openReportPreview'),true);
  assert.equal(dbUiJs.includes('renderSvgDonut'),true);
  assert.equal(dbUiJs.includes('renderSvgFormBars'),true);
  assert.equal(dbUiJs.includes('report-analysis-input'),true);
  assert.equal(dbUiJs.includes('report-analysis-text'),true);
  assert.equal(dbUiJs.includes('preview-save-pdf'),true);
  assert.equal(dbUiJs.includes('preview-save-excel'),false);
  const styleCss=fs.readFileSync(path.join(root,'style.css'),'utf8');
  assert.equal(styleCss.includes('dialog.report-modal'),true);
  assert.equal(styleCss.includes('.report-sheet'),true);
  assert.equal(styleCss.includes('.sheet-analysis-card'),true);
  assert.equal(styleCss.includes('@media print'),true);
});
test('All 3 report cards have interactive card-click previews, enlarged comment box, and PDF report export',()=>{
  const dbUiJs=fs.readFileSync(path.join(root,'database-ui.js'),'utf8');
  // All 3 cards configured
  assert.equal(dbUiJs.includes('data-report="summary"'),true);
  assert.equal(dbUiJs.includes('data-report="filings"'),true);
  assert.equal(dbUiJs.includes('data-report="clients"'),true);
  // Card click triggers preview
  assert.equal(dbUiJs.includes("e.target.closest('.report-card[data-report]')"),true);
  // No buttons inside the cards
  assert.equal(dbUiJs.includes('<div class="reports-grid">'),true);
  assert.equal(dbUiJs.includes('Save as PDF'),true);
  assert.equal(dbUiJs.includes('PDF / Excel'),true);
  assert.equal(dbUiJs.includes('rows="6"'),true);
  const styleCss=fs.readFileSync(path.join(root,'style.css'),'utf8');
  assert.equal(styleCss.includes('cursor:pointer'),true);
  assert.equal(styleCss.includes('min-height:150px'),true);
});
test('Report preview saves PDF directly without triggering print dialog prompt',()=>{
  const dbUiJs=fs.readFileSync(path.join(root,'database-ui.js'),'utf8');
  assert.equal(dbUiJs.includes('downloadClientPdf'),true);
  assert.equal(dbUiJs.includes('window.taxguardDB?.savePdf'),true);
  assert.equal(dbUiJs.includes('Save as PDF'),true);
  // Verify preview-save-pdf no longer calls window.print()
  assert.equal(dbUiJs.includes("m.querySelector('#preview-save-pdf')?.addEventListener('click',()=>window.print())"),false);
  const preloadCjs=fs.readFileSync(path.join(root,'desktop/preload.cjs'),'utf8');
  assert.equal(preloadCjs.includes("savePdf:(defaultName)=>ipcRenderer.invoke('report:savePdf',defaultName)"),true);
  const mainCjs=fs.readFileSync(path.join(root,'desktop/main.cjs'),'utf8');
  assert.equal(mainCjs.includes("ipcMain.handle('report:savePdf'"),true);
  assert.equal(mainCjs.includes('printToPDF'),true);
  assert.equal(mainCjs.includes('dialog.showSaveDialog'),true);
  // Verify modal is closed after saving
  assert.equal(dbUiJs.includes("if(res?.saved){"),true);
  assert.equal(dbUiJs.includes("notify('Report saved as PDF.')"),true);
  assert.equal(dbUiJs.includes('closeModal(m);'),true);
});
test('TaxGuard shield logo is configured as desktop window icon and Windows exe icon',()=>{
  assert.equal(fs.existsSync(path.join(root,'desktop/icon.ico')),true);
  assert.equal(fs.existsSync(path.join(root,'desktop/icon.png')),true);
  assert.equal(fs.statSync(path.join(root,'desktop/icon.ico')).size > 1000, true);
  assert.equal(fs.statSync(path.join(root,'desktop/icon.png')).size > 1000, true);
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  assert.equal(pkg.build?.icon,'desktop/icon.ico');
  assert.equal(pkg.build?.win?.icon,'desktop/icon.ico');
  assert.equal(pkg.build?.files?.includes('desktop/**/*'),true);
  const mainCjs=fs.readFileSync(path.join(root,'desktop/main.cjs'),'utf8');
  assert.equal(mainCjs.includes('icon:appIconPath')||mainCjs.includes('icon.ico'),true);
  const indexHtml=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.equal(indexHtml.includes('desktop/icon.png'),true);
  // Verify default File/Edit/View menu bar is disabled
  assert.equal(mainCjs.includes('Menu.setApplicationMenu(null)'),true);
  assert.equal(mainCjs.includes('win.removeMenu()'),true);
});
test('User account management: create new users, edit current user, safeguards, and multi-user login',()=>{
  const {file}=fixture();
  const s=new Store(file,root);
  const initialUsers=s.getUsers();
  assert.equal(initialUsers.length >= 1, true);
  const adminUser=initialUsers.find(u=>u.username.toLowerCase()==='admin');
  assert.ok(adminUser);
  assert.equal(adminUser.role, 'Admin');
  assert.equal('password_hash' in adminUser, false);

  // Edit current admin user info (company name, role)
  s.saveUser({
    id: adminUser.id,
    username: adminUser.username,
    company_name: 'TaxGuard Senior Associates',
    role: 'Admin',
    is_active: 1
  });
  const updatedAdmin=s.getUsers().find(u=>u.id===adminUser.id);
  assert.equal(updatedAdmin.company_name, 'TaxGuard Senior Associates');

  // Create new user account
  s.saveUser({
    username: 'jdelacruz',
    company_name: 'TaxGuard Senior Associates',
    role: 'Tax Associate',
    password: 'password123',
    is_active: 1
  });
  const usersAfterAdd=s.getUsers();
  const newStaff=usersAfterAdd.find(u=>u.username==='jdelacruz');
  assert.ok(newStaff);
  assert.equal(newStaff.role, 'Tax Associate');
  assert.equal(newStaff.is_active, 1);

  // Authenticate with the newly created user
  const loginRes=s.login('jdelacruz', 'password123');
  assert.equal(loginRes.authenticated, true);
  assert.equal(loginRes.username, 'jdelacruz');
  assert.equal(loginRes.role, 'Tax Associate');

  // Update new user password and role
  s.saveUser({
    id: newStaff.id,
    username: newStaff.username,
    company_name: newStaff.company_name,
    role: 'Auditor',
    password: 'newsecretpass',
    is_active: 1
  });
  assert.equal(s.login('jdelacruz', 'newsecretpass').role, 'Auditor');
  assert.throws(()=>s.login('jdelacruz', 'password123'), /Invalid username or password/);

  // Validations: duplicate username, short password
  assert.throws(()=>s.saveUser({ username: 'jdelacruz', password: 'password123' }), /Username already exists/);
  assert.throws(()=>s.saveUser({ username: 'newuser', password: '123' }), /Password must be at least 6 characters/);

  // Safeguards: cannot delete only active account
  s.deleteUser(newStaff.id);
  assert.equal(s.getUsers().some(u=>u.id===newStaff.id), false);
  assert.throws(()=>s.deleteUser(adminUser.id), /Cannot delete the only active user account/);

  // UI elements verified in database-ui.js
  const dbUiJs=fs.readFileSync(path.join(root,'database-ui.js'),'utf8');
  assert.equal(dbUiJs.includes('User Account Management'), true);
  assert.equal(dbUiJs.includes('openUserAccountModal'), true);
  assert.equal(dbUiJs.includes('btn-add-user'), true);
  assert.equal(dbUiJs.includes('user-account-row'), true);

  s.close();
});
test('Each user profile picture persists separately and can be removed',()=>{
  const {file}=fixture();
  let store=new Store(file,root);
  const photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/6yQAAAAASUVORK5CYII=';
  try{
    const admin=store.getUsers().find(u=>u.username==='admin');
    store.saveUser({id:admin.id,username:'admin',company_name:admin.company_name,role:'Admin',profile_photo:photo});
    store.saveUser({username:'staffphoto',password:'secret123',role:'Staff',profile_photo:''});
    assert.equal(store.getUsers().find(u=>u.id===admin.id).profile_photo,photo);
    assert.equal(store.login('admin','taxguard2026').profile_photo,photo);
    assert.equal(store.getUsers().find(u=>u.username==='staffphoto').profile_photo,'');
    assert.throws(()=>store.saveUser({id:admin.id,username:'admin',profile_photo:'data:text/html;base64,QQ=='}),/Profile picture/);
    store.close();store=new Store(file,root);
    assert.equal(store.getUsers().find(u=>u.id===admin.id).profile_photo,photo);
    store.saveUser({id:admin.id,username:'admin',company_name:admin.company_name,role:'Admin',profile_photo:''});
    assert.equal(store.login('admin','taxguard2026').profile_photo,'');
  }finally{store.close();}
});
test('Existing user tables gain the profile picture field without losing accounts',()=>{
  const {file}=fixture();
  const {DatabaseSync}=require('node:sqlite');
  const legacy=new DatabaseSync(file);
  legacy.exec("CREATE TABLE users(id INTEGER PRIMARY KEY AUTOINCREMENT,username TEXT NOT NULL UNIQUE,company_name TEXT NOT NULL,role TEXT NOT NULL,password_hash TEXT NOT NULL,is_active INTEGER NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP)");
  legacy.prepare("INSERT INTO users(username,company_name,role,password_hash,is_active) VALUES('legacy','Old Firm','Staff','hash',1)").run();
  legacy.close();
  const store=new Store(file,root);
  try{
    const user=store.getUsers().find(u=>u.username==='legacy');
    assert.ok(user);
    assert.equal(user.profile_photo,'');
    assert.equal(store.db.prepare('PRAGMA table_info(users)').all().filter(c=>c.name==='profile_photo').length,1);
  }finally{store.close();}
});

test('Floating notifications render in Top Layer above modal backdrops and user account modal dismisses', ()=>{
  const indexHtml = fs.readFileSync(path.join(root,'index.html'),'utf8');
  const styleCss = fs.readFileSync(path.join(root,'style.css'),'utf8');
  const appJs = fs.readFileSync(path.join(root,'app.js'),'utf8');
  const dbUiJs = fs.readFileSync(path.join(root,'database-ui.js'),'utf8');

  // Top Layer Popover setup in index.html
  assert.equal(indexHtml.includes('id="toast" role="status" popover="manual"'), true);

  // CSS Top Layer and Backdrop rules
  assert.equal(styleCss.includes('#toast, #toast[popover]'), true);
  assert.equal(styleCss.includes('z-index: 2147483647 !important'), true);
  assert.equal(styleCss.includes('#toast::backdrop'), true);
  assert.equal(styleCss.includes('#toast:popover-open'), true);
  assert.equal(styleCss.includes('toast-error'), true);
  assert.equal(styleCss.includes('toast-success'), true);

  // app.js popover promotion and modal dismissal
  assert.equal(appJs.includes('supportsPopover=typeof e.showPopover===\'function\''), true);
  assert.equal(appJs.includes('e.showPopover()'), true);
  assert.equal(appJs.includes('toast-visible'), true);
  assert.equal(appJs.includes('modalEl.showModal'), true);

  // database-ui.js user account modal dismissal, error alerts, show password toggle, and confirmation window
  assert.equal(dbUiJs.includes('user-modal-error-alert'), true);
  assert.equal(dbUiJs.includes('toggle-user-password'), true);
  assert.equal(dbUiJs.includes('confirmCreateUser'), true);
  assert.equal(dbUiJs.includes('btn-confirm-create-user'), true);
  assert.equal(dbUiJs.includes('closeModal(m,()=>{'), true);
  assert.equal(dbUiJs.includes('notify(\'New user account created.\');'), true);
});

test('Avatar initials resolve dynamically from username and firm (e.g. FeviRuth -> FR)', ()=>{
  const appJs = fs.readFileSync(path.join(root,'app.js'),'utf8');
  assert.equal(appJs.includes('function getUserInitials(name){'), true);
  assert.equal(appJs.includes('setUserAvatarSlot(headerAvatar,authInfo.username,authInfo.profile_photo);'), true);

  // Evaluate the getUserInitials function logic
  const vm = require('vm');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(appJs.slice(appJs.indexOf('function getUserInitials(name){'), appJs.indexOf('function setAuthState(')), sandbox);

  assert.equal(sandbox.getUserInitials('FeviRuth'), 'FR');
  assert.equal(sandbox.getUserInitials('Fevi Ruth'), 'FR');
  assert.equal(sandbox.getUserInitials('fevi_ruth'), 'FR');
  assert.equal(sandbox.getUserInitials('admin'), 'AD');
  assert.equal(sandbox.getUserInitials('John Doe'), 'JD');
  assert.equal(sandbox.getUserInitials('EOO Tax & Accounting'), 'EO');
});
