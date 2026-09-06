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
test('Landing page contains no sqlite references and enforces session-only sign out on exit',()=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const loginSection=html.slice(html.indexOf('<section id="login-landing"'),html.indexOf('</section>'));
  assert.equal(/sqlite/i.test(loginSection),false,'Landing page must not contain SQLite references');
  const appJs=fs.readFileSync(path.join(root,'app.js'),'utf8');
  assert.equal(appJs.includes("localStorage.removeItem('taxguard_auth')"),true);
  assert.equal(appJs.includes("sessionStorage.getItem('taxguard_auth')"),true);
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
  assert.equal(dbUiJs.includes('export-summary-report'),true);
  assert.equal(dbUiJs.includes('export-filings-report'),true);
  assert.equal(dbUiJs.includes('export-clients-report'),true);
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
  assert.equal(dbUiJs.includes('PDF Report'),true);
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
  assert.equal(dbUiJs.includes("if(res?.saved){\n          notify('Report saved as PDF.');\n          closeModal(m);"),true);
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




