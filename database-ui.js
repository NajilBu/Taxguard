// Runs after the existing UI so all persistence consumers share the same records.
if (!database) {
  try {
    const savedForms=JSON.parse(localStorage.getItem('taxguard-custom-forms')||'null');
    if(Array.isArray(savedForms)) forms.splice(0,forms.length,...savedForms);
  } catch { notify('Saved deadline data could not be loaded.'); }
}
const themeSettings=settings;
settings=function(){return themeSettings()+`<div class="panel" style="margin-top:24px"><div class="panel-head"><div><h2>Data storage</h2><p>${database?'Client records and filings are saved in SQLite, shared by localhost and the desktop app.':'This browser stores records locally. The localhost version connects to SQLite.'}</p></div></div><div class="panel-body"><button class="btn" id="export-records">Export records</button> ${database?.importRecords&&state.clients.length===0?'<button class="btn primary" id="import-records">Import browser records</button>':''}</div></div>`;};
document.querySelector('footer span').textContent=database?'Saved to SQLite on this computer':'Changes saved in this browser';
document.addEventListener('click',async e=>{
  if(e.target.closest('#export-records')){
    const payload={format:'taxguard-export-v1',state,forms};
    const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='TaxGuard-records.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  if(e.target.closest('#import-records')){
    try{const result=await database.importRecords();if(result){restoreDatabase();render();notify('Browser records imported into SQLite.');}}catch(error){notify('Import failed: '+error.message);}
  }
});
// The earlier page bindings predate the add-deadline control.
document.addEventListener('click',e=>{
  if(e.target.closest('#add-deadline')){e.stopImmediatePropagation();deadlineEditModal();}
},true);
// Save failures stop submission handlers before their success messages.
window.addEventListener('error',e=>{if(e.error){notify(e.error.message);}});
window.addEventListener('focus',()=>{
  if(database&&!document.querySelector('#modal').open){try{restoreDatabase();render();}catch(error){notify('Could not refresh records: '+error.message);}}
});
render();
