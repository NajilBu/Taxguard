const {contextBridge,ipcRenderer}=require('electron');
function call(action,data,revision){const result=ipcRenderer.sendSync('records:sync',action,data,revision);if(!result?.ok)throw Error(result?.error||'Database unavailable');return result.value;}
contextBridge.exposeInMainWorld('taxguardDB',{
  load:()=>call('load'),
  login:(username,password)=>call('login',{username,password}),
  save:(state,revision)=>call('save',state,revision),
  saveForms:(forms,revision)=>call('forms',forms,revision),
  importRecords:()=>ipcRenderer.invoke('records:import')
});
