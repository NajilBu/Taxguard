const {app,BrowserWindow}=require('electron');
app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
  await win.webContents.session.clearCache();
  await win.loadURL('http://localhost/Taxguard/');
  const result=await win.webContents.executeJavaScript(`(()=>{let protectedError='';try{window.taxguardDB.load()}catch(error){protectedError=error.message}return {connected:!!window.taxguardDB,needsSetup:window.taxguardDB.authStatus().needsSetup,loggedOut:document.body.classList.contains('logged-out'),clients:state.clients.length,filings:Object.keys(state.filings).length,protectedError,footer:document.querySelector('footer span').textContent}})()`);
  if(!result.connected||!result.loggedOut||result.clients!==0||result.filings!==0||!result.protectedError.includes('Authentication required')||!result.footer.includes('SQLite'))throw Error(JSON.stringify(result));
  console.log('BROWSER PASS',JSON.stringify(result));app.quit();
}).catch(error=>{console.error(error);app.exit(1)});
