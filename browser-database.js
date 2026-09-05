(() => {
  if(window.taxguardDB || !['localhost','127.0.0.1','[::1]'].includes(location.hostname))return;
  function call(action,data,revision){
    const request=new XMLHttpRequest();
    // The existing form handlers save synchronously in both browser and Electron.
    request.open('POST',new URL('api.php',location.href),false);
    request.setRequestHeader('Content-Type','application/json');
    request.send(JSON.stringify({action,data,revision}));
    let result;
    try{result=JSON.parse(request.responseText)}catch{throw Error('SQLite is unavailable. Start Apache and open http://localhost/Taxguard/.');}
    if(request.status!==200||!result.ok)throw Error(result.error||'Database unavailable.');
    return result.value;
  }
  window.taxguardDB={load:()=>call('load'),save:(data,revision)=>call('save',data,revision),saveForms:(data,revision)=>call('forms',data,revision)};
  try{window.taxguardDB.load();}catch(error){
    document.querySelector('#content').textContent=error.message;
    document.querySelector('footer span').textContent='SQLite connection failed';
    // No silent switch to separate browser records when the database is down.
  }
})();
