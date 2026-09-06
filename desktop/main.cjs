const {app,BrowserWindow,ipcMain,dialog,Menu}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {Store}=require('./database.cjs');
const {seedSamples}=require('./seed.cjs');
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
  const valid=e=>e.senderFrame?.url===entry && e.senderFrame===e.sender.mainFrame;
  ipcMain.on('records:sync',(e,action,data,revision)=>{
    try{
      if(!valid(e))throw Error('Untrusted database request.');
      let value;
      if(action==='load')value=db.load();
      else if(action==='login')value=db.login(data?.username,data?.password);
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
  win=new BrowserWindow({width:1400,height:900,icon:appIconPath,autoHideMenuBar:true,show:!smoke,webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
  win.removeMenu();
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
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
  if(smoke){
    await win.webContents.executeJavaScript(`(async()=>{
      go('clients');editClient();
      const f=document.querySelector('#client-form');
      f.elements.name.value='SQLite integration test';f.elements.tin.value='987-654-321-000';
      f.elements.start.value='2025-01-01';f.querySelector('input[name="forms"][value="2550-Q"]').checked=true;
      f.requestSubmit();await new Promise(r=>setTimeout(r,240));
      const c=state.clients.find(c=>c.name==='SQLite integration test');if(!c)throw Error('Client form did not save');
      go('tracker');fileModal(c.id+':2026:2550-Q:Q1');
      const filing=document.querySelector('#filing-form');filing.elements.date.value='2026-04-20';filing.elements.reference.value='SQLITE-TEST';filing.requestSubmit();
      await new Promise(r=>setTimeout(r,240));
      go('deadlines');deadlineModal('2550-Q');document.querySelector('#edit-schedule').click();
      document.querySelector('#schedule-form input[name="date"]').value='2026-04-28';document.querySelector('#schedule-form').requestSubmit();
      await new Promise(r=>setTimeout(r,240));
      const loaded=window.taxguardDB.load();
      if(loaded.filings[c.id+':2026:2550-Q:Q1']?.reference!=='SQLITE-TEST')throw Error('Filing form did not persist');
      if(loaded.forms.find(f=>f.id==='2550-Q').overrides?.[2026]?.Q1!=='2026-04-28')throw Error('Deadline edit did not persist');
    })()`);
    await win.loadFile(path.join(root,'index.html'));
    const result=await win.webContents.executeJavaScript(`({connected:!!window.taxguardDB,clients:state.clients.length,forms:forms.length,footer:document.querySelector('footer span').textContent,settings:(go('settings'),document.querySelector('#content').textContent.includes('Data storage'))})`);
    if(!result.connected||result.clients!==1||!result.forms||!result.settings)throw Error(JSON.stringify(result));
    console.log('DESKTOP PASS',JSON.stringify(result));app.quit();
  }
}).catch(e=>{console.error(e);if(!smoke)dialog.showErrorBox('TaxGuard could not open',e.message);app.exit(1)});
app.on('window-all-closed',()=>app.quit());
app.on('will-quit',()=>db?.close());
