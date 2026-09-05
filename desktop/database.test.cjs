const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {Store,scheduleDate}=require('./database.cjs');
const {seedSamples}=require('./seed.cjs');
const root=path.join(__dirname,'..');
function fixture(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'taxguard-db-test-'));return {dir,file:path.join(dir,'taxguard.db')}}
const client={id:1,name:'Test client',tin:'123-456-789-000',type:'Corporation',tax:'VAT',status:'Active',start:'2025-01-01',remarks:'Test',forms:['2550-Q']};
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
