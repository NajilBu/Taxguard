const {app,BrowserWindow}=require('electron');
app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
  await win.loadURL('http://localhost/Taxguard/');
  const result=await win.webContents.executeJavaScript(`({connected:!!window.taxguardDB,clients:state.clients.length,filings:Object.keys(state.filings).length,footer:document.querySelector('footer span').textContent,settings:(go('settings'),document.querySelector('#content').textContent.includes('Data storage'))})`);
  if(!result.connected||result.clients<6||result.filings<100||!result.settings||!result.footer.includes('SQLite'))throw Error(JSON.stringify(result));
  console.log('BROWSER PASS',JSON.stringify(result));app.quit();
}).catch(error=>{console.error(error);app.exit(1)});
