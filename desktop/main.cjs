const {app,BrowserWindow,ipcMain,dialog,Menu,shell}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {Store}=require('./database.cjs');
const {seedSamples}=require('./seed.cjs');
const {parseXlsxBuffer}=require('./migration.cjs');
const dataTransfer=require('./data-transfer.cjs');
const excelTransfer=require('./excel-transfer.cjs');
const root=path.join(__dirname,'..');
const smoke=process.argv.includes('--smoke-test');
const entry=pathToFileURL(path.join(root,'index.html')).href;
if(smoke)app.setPath('userData',fs.mkdtempSync(path.join(require('node:os').tmpdir(),'taxguard-smoke-')));
let db,win;
if(!app.requestSingleInstanceLock())app.quit();
else app.whenReady().then(async()=>{
  const filename=smoke
    ? path.join(app.getPath('userData'),'taxguard.db')
    : (process.env.TAXGUARD_DB_PATH || (app.isPackaged ? path.join(app.getPath('userData'),'taxguard.db') : path.join(root,'database/taxguard.db')));
  if(app.isPackaged && !fs.existsSync(filename)){
    fs.mkdirSync(path.dirname(filename), {recursive:true});
    const templateDb = path.join(root, 'database/taxguard.db');
    if(fs.existsSync(templateDb)){
      try { fs.copyFileSync(templateDb, filename); } catch(e){}
    }
  }
  db=new Store(filename,root);
  if(!smoke)seedSamples(db,root);
  if(!smoke){
    try{
      const backupDir=path.join(app.getPath('userData'),'backups');
      fs.mkdirSync(backupDir,{recursive:true});
      const daily=path.join(backupDir,'TaxGuard-'+new Date().toISOString().slice(0,10)+'.db');
      if(!fs.existsSync(daily))db.backupTo(daily);
    }catch(error){console.error('Automatic backup failed:',error);}
  }
  const valid=e=>e.sender===win?.webContents && e.senderFrame===win.webContents.mainFrame;
  ipcMain.on('records:sync',(e,action,data,revision)=>{
    try{
      if(!valid(e))throw Error('Untrusted database request.');
      let value;
      if(action==='load')value=db.load();
      else if(action==='login')value=db.login(data?.username,data?.password);
      else if(action==='users:list')value=db.getUsers();
      else if(action==='users:save')value=db.saveUser(data);
      else if(action==='users:delete')value=db.deleteUser(data?.id);
      else if(action==='company:get')value=db.getCompanyName();
      else if(action==='company:save')value=db.saveCompanyName(data?.name);
      else if(action==='company:profile:get')value=db.getCompanyProfile();
      else if(action==='company:profile:save')value=db.saveCompanyProfile(data);
      else if(action==='documents:list')value=db.listClientDocuments(data?.clientId);
      else if(action==='documents:save')value=db.saveClientDocument(data);
      else if(action==='documents:get')value=db.getClientDocument(data?.id);
      else if(action==='documents:delete')value=db.deleteClientDocument(data?.id);
      else if(action==='data:export')value=dataTransfer.exportData(db,data?.sections);
      else if(action==='data:preview-import')value=dataTransfer.previewDataImport(db,data?.payload,data?.sections);
      else if(action==='data:import')value=dataTransfer.importData(db,data?.payload,data?.sections,revision);
      else if(action==='clients:import-csv')value=db.importClientsCsv(data?.text);
      else if(action==='clients:fields:get')value=db.getClientFields();
      else if(action==='clients:fields:save')value=db.saveClientFields(data?.fields);
      else if(action==='clients:fields:rename')value=db.renameClientField(data?.oldName,data?.newName,revision);
      else if(action==='calendar:list')value=db.getCalendarRules();
      else if(action==='calendar:save')value=db.saveCalendarRule(data);
      else if(action==='calendar:delete')value=db.deleteCalendarRule(data?.id);
      else if(action==='save'||action==='forms'){
        if(!Number.isSafeInteger(revision))throw Error('Reload TaxGuard before saving.');
        value=action==='save'?db.saveState(data,revision):db.saveForms(data,revision);
      }
      else throw Error('Unsupported database operation.');
      e.returnValue={ok:true,value};
    }catch(err){e.returnValue={ok:false,error:err.message}}
  });
  ipcMain.handle('records:import',async(e)=>{
    if(!valid(e))throw Error('Untrusted import request.');
    const result=await dialog.showOpenDialog(win,{title:'Import TaxGuard browser records',properties:['openFile'],filters:[{name:'TaxGuard export',extensions:['json']}]});
    if(result.canceled)return null;
    const filename=result.filePaths[0];
    if(fs.statSync(filename).size>10*1024*1024)throw Error('Import file exceeds 10 MB.');
    return db.importWorkspace(JSON.parse(fs.readFileSync(filename,'utf8')));
  });
  ipcMain.handle('data:export-xlsx',async(e,sections,options)=>{
    if(!valid(e))throw Error('Untrusted Excel export request.');
    return excelTransfer.exportWorkbook(db,sections,options);
  });
  ipcMain.handle('data:save-xlsx',async(e,sections,options)=>{
    if(!valid(e))throw Error('Untrusted Excel export request.');
    const result=await dialog.showSaveDialog(win,{title:'Save TaxGuard Excel export',defaultPath:`TaxGuard-data-${new Date().toISOString().slice(0,10)}.xlsx`,filters:[{name:'Excel workbook',extensions:['xlsx']}]});
    if(result.canceled||!result.filePath)return {saved:false};
    const base64=await excelTransfer.exportWorkbook(db,sections,options);
    fs.writeFileSync(result.filePath,Buffer.from(base64,'base64'));
    return {saved:true,path:result.filePath};
  });
  ipcMain.handle('data:read-xlsx',async(e,base64)=>{
    if(!valid(e))throw Error('Untrusted Excel import request.');
    return excelTransfer.readWorkbook(base64);
  });
  ipcMain.handle('clients:import-xlsx',async(e,base64)=>{
    if(!valid(e))throw Error('Untrusted Excel import request.');
    if(typeof base64!=='string'||base64.length>7*1024*1024||!/^[A-Za-z0-9+/]+={0,2}$/.test(base64))throw Error('Invalid Excel file.');
    return db.importClientsRows(await parseXlsxBuffer(Buffer.from(base64,'base64')));
  });
  ipcMain.handle('backup:save',async(e)=>{
    if(!valid(e))throw Error('Untrusted backup request.');
    const result=await dialog.showSaveDialog(win,{title:'Save complete TaxGuard backup',defaultPath:'TaxGuard-backup-'+new Date().toISOString().slice(0,10)+'.db',filters:[{name:'TaxGuard SQLite backup',extensions:['db']} ]});
    if(result.canceled||!result.filePath)return {saved:false};
    db.backupTo(result.filePath);Store.validateBackup(result.filePath);
    return {saved:true,filePath:result.filePath};
  });
  ipcMain.handle('backup:restore',async(e)=>{
    if(!valid(e))throw Error('Untrusted restore request.');
    const chosen=await dialog.showOpenDialog(win,{title:'Choose TaxGuard backup to restore',properties:['openFile'],filters:[{name:'TaxGuard SQLite backup',extensions:['db']} ]});
    if(chosen.canceled)return {restored:false};
    const backup=chosen.filePaths[0];
    if(path.resolve(backup)===path.resolve(filename))throw Error('Choose a separate backup file, not the active database.');
    Store.validateBackup(backup);
    const confirmation=await dialog.showMessageBox(win,{type:'warning',buttons:['Cancel','Restore backup'],defaultId:0,cancelId:0,title:'Restore TaxGuard backup?',message:'Current records will be replaced by the selected backup.',detail:'Close any localhost TaxGuard browser tabs and other app windows first. A recovery copy of the current database will be saved automatically.'});
    if(confirmation.response!==1)return {restored:false};
    const recovery=path.join(app.getPath('userData'),'TaxGuard-before-restore-'+Date.now()+'.db');
    db.backupTo(recovery);db.close();
    try{
      fs.copyFileSync(backup,filename);
      db=new Store(filename,root);
      if(db.db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Restored database failed integrity check.');
    }catch(error){
      try{db?.close()}catch{}
      fs.copyFileSync(recovery,filename);db=new Store(filename,root);
      throw error;
    }
    win.reload();return {restored:true,recovery};
  });
  ipcMain.handle('report:savePdf',async(e,defaultName)=>{
    if(!valid(e))throw Error('Untrusted PDF save request.');
    const currentWin=BrowserWindow.fromWebContents(e.sender)||win;
    const pdfData=await e.sender.printToPDF({
      printBackground:true,
      preferCSSPageSize:true
    });
    const result=await dialog.showSaveDialog(currentWin,{
      title:'Save TaxGuard Report as PDF',
      defaultPath:defaultName||'TaxGuard-Report.pdf',
      filters:[{name:'PDF Document',extensions:['pdf']}]
    });
    if(result.canceled||!result.filePath)return{saved:false};
    fs.writeFileSync(result.filePath,pdfData);
    return{saved:true,filePath:result.filePath};
  });
  Menu.setApplicationMenu(null);
  const appIconPath=path.join(__dirname,'icon.ico');
  win=new BrowserWindow({width:1400,height:900,icon:appIconPath,autoHideMenuBar:true,show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
  win.once('ready-to-show',()=>{
    if(!smoke){win.maximize();win.show();}
  });
  win.webContents.on('before-input-event',(event,input)=>{
    if(input.type==='keyDown' && input.control && input.shift && input.key.toLowerCase()==='j'){
      event.preventDefault();
      if(win.webContents.isDevToolsOpened()) win.webContents.closeDevTools();
      else win.webContents.openDevTools({mode:'detach'});
    }
  });
  win.removeMenu();
  win.webContents.setWindowOpenHandler(({url})=>{
    try{if(new URL(url).protocol==='https:')shell.openExternal(url);}catch{}
    return {action:'deny'};
  });
  win.webContents.on('will-navigate',(e,url)=>{if(url!==entry && !url.startsWith('blob:') && !url.startsWith('data:'))e.preventDefault()});
  win.webContents.session.on('will-download',(event,item)=>{
    const defaultPath=path.join(app.getPath('downloads'),item.getFilename());
    item.setSavePath(defaultPath);
    item.once('done',(event,state)=>{
      if(state==='completed'){
        try{win.webContents.executeJavaScript(`notify('Report saved to Downloads: ${item.getFilename().replace(/'/g,"\\'")}')`);}catch(e){}
      }
    });
  });
  win.webContents.session.setPermissionRequestHandler((_w,_p,callback)=>callback(false));

  win.webContents.session.webRequest.onHeadersReceived((details,callback)=>callback({responseHeaders:{...details.responseHeaders,'Content-Security-Policy':["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'none'"]}}));
  win.on('close',()=>{
    try{win.webContents.executeJavaScript('sessionStorage.removeItem("taxguard_auth");localStorage.removeItem("taxguard_auth");');}catch(e){}
  });
  await win.loadFile(path.join(root,'index.html'));
  if(smoke&&process.argv.includes('--allocation-test')){
    await require('./allocation-smoke.cjs')(win,root);
    app.quit();return;
  }
  if(smoke){
    await win.webContents.executeJavaScript(`(async()=>{
      if(getComputedStyle(document.querySelector('aside')).display!=='none')throw Error('Sidebar visible before login');
      attemptLogin('admin','taxguard2026');
      await new Promise(r=>setTimeout(r,550));
      if(!document.body.classList.contains('logged-in'))throw Error('Desktop login failed');
      if(getComputedStyle(document.querySelector('#login-landing')).display!=='none')throw Error('Landing still visible after login');
      go('settings');
      const companyInput=document.querySelector('#company-name-input');
      companyInput.value='Smoke Test Firm';companyInput.dispatchEvent(new Event('input',{bubbles:true}));
      const descriptionInput=document.querySelector('#company-description-input');descriptionInput.value='Smoke test description';descriptionInput.dispatchEvent(new Event('input',{bubbles:true}));
      const logoInput=document.querySelector('#company-logo-input'),transfer=new DataTransfer();
      window.dispatchEvent(new Event('focus'));
      if(document.querySelector('#company-logo-input')!==logoInput)throw Error('Focus refresh replaced the file input');
      const logoBytes=Uint8Array.from(atob('${fs.readFileSync(path.join(__dirname,'icon.png')).toString('base64')}'),c=>c.charCodeAt(0));
      transfer.items.add(new File([logoBytes],'logo.png',{type:'image/png'}));
      logoInput.files=transfer.files;logoInput.dispatchEvent(new Event('change',{bubbles:true}));
      for(let attempt=0;attempt<40&&!document.querySelector('#company-logo-preview img');attempt++)await new Promise(r=>setTimeout(r,50));
      if(companyInput.value!=='Smoke Test Firm'||!document.querySelector('#company-logo-preview img'))throw Error('Company profile draft was reset');
      await document.querySelector('#company-logo-preview img').decode();
      document.querySelector('#company-profile-form').requestSubmit();await new Promise(r=>setTimeout(r,100));
      if(window.taxguardDB.getCompanyProfile().name!=='Smoke Test Firm'||window.taxguardDB.getCompanyProfile().description!=='Smoke test description')throw Error('Company profile did not persist');
      go('clients');editClient();
      const f=document.querySelector('#client-form');
      f.elements.name.value='SQLite integration test';f.elements.tin.value='987-654-321-000';
      f.elements.start.value='2025-01-01';f.querySelector('input[name="forms"][value="2550-Q"]').checked=true;
      f.requestSubmit();await new Promise(r=>setTimeout(r,240));
      const c=state.clients.find(c=>c.name==='SQLite integration test');if(!c)throw Error('Client form did not save');
      go('tracker');fileModal(c.id+':2026:2550-Q:Q1');
      const filing=document.querySelector('#filing-form');filing.elements.date.value='2026-04-20';filing.elements.reference.value='SQLITE-TEST';filing.requestSubmit();
      document.querySelector('#confirm-save-filing').click();
      await new Promise(r=>setTimeout(r,240));
      go('deadlines');deadlineModal('2550-Q');document.querySelector('#edit-schedule').click();
      document.querySelector('#schedule-form input[name="date"]').value='2026-04-28';document.querySelector('#schedule-form').requestSubmit();
      await new Promise(r=>setTimeout(r,240));
      const loaded=window.taxguardDB.load();
      if(loaded.filings[c.id+':2026:2550-Q:Q1']?.reference!=='SQLITE-TEST')throw Error('Filing form did not persist');
      if(loaded.forms.find(f=>f.id==='2550-Q').overrides?.[2026]?.Q1!=='2026-04-28')throw Error('Deadline edit did not persist');
      year=2026;go('clients');editClient(c.id);
      const edit=document.querySelector('#client-form');
      if(!edit.querySelector('[value="2550-Q"]').disabled)throw Error('Filed form can be removed');
      edit.elements.tax.value='VAT';edit.elements.calendar.value='calendar';edit.elements.income.value='itemized';
      edit.elements.compensation.value='no';edit.elements.expanded.value='yes';
      document.querySelector('#suggest-client-forms').click();
      if(edit.querySelector('[value="1701-Q"]').checked)throw Error('Suggestions applied before review');
      document.querySelector('#apply-client-forms').click();
      if(!edit.querySelector('[value="1701-Q"]').checked)throw Error('Suggestions not applied');
      edit.requestSubmit();await new Promise(r=>setTimeout(r,240));
      if(obligations().filter(o=>o.f.id==='0619-E').length!==8)throw Error('Expanded withholding allocation failed');
      if(!getClientsReportData().rows[0][7].includes('1701-Q'))throw Error('Report uses old forms');
      year=2025;
      if(obligations().length!==0)throw Error('New assignment leaked into another year');
      year=2026;
      editClient(c.id);document.querySelector('#client-form').elements.name.value='Cancelled edit';
      document.querySelector('#cancel').click();await new Promise(r=>setTimeout(r,240));
      if(state.clients[0].name==='Cancelled edit')throw Error('Cancelled edit was saved');
    })()`);
    await win.loadFile(path.join(root,'index.html'));
    await win.webContents.executeJavaScript(`year=2026;if(obligations().filter(o=>o.f.id==='0619-E').length!==8)throw Error('Year allocation lost after reload');`);
    await win.webContents.executeJavaScript(`(async()=>{go('settings');const image=document.querySelector('#company-logo-preview img');if(!image)throw Error('Saved logo missing after reload');await image.decode();if(!image.naturalWidth)throw Error('Saved logo did not decode');})()`);
    const result=await win.webContents.executeJavaScript(`({connected:!!window.taxguardDB,clients:state.clients.length,forms:forms.length,footer:document.querySelector('footer span').textContent,settings:(go('settings'),document.querySelector('#company-name-input')?.value==='Smoke Test Firm'&&!!document.querySelector('#company-logo-preview img'))})`);
    if(!result.connected||result.clients!==1||!result.forms||!result.settings)throw Error(JSON.stringify(result));
    console.log('DESKTOP PASS',JSON.stringify(result));app.quit();
  }
}).catch(e=>{console.error(e);if(!smoke)dialog.showErrorBox('TaxGuard could not open',e.message);app.exit(1)});
app.on('window-all-closed',()=>app.quit());
app.on('will-quit',()=>db?.close());
