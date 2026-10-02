(() => {
  if(window.taxguardDB || !['localhost','127.0.0.1','[::1]'].includes(location.hostname))return;
  let sessionToken=sessionStorage.getItem('taxguard_session_token')||'';
  function call(action,data,revision){
    const request=new XMLHttpRequest();
    // The existing form handlers save synchronously in both browser and Electron.
    request.open('POST',new URL('api.php',location.href),false);
    request.setRequestHeader('Content-Type','application/json');
    request.send(JSON.stringify({action,data,revision,sessionToken}));
    let result;
    try{result=JSON.parse(request.responseText)}catch{throw Error('SQLite is unavailable. Start Apache and open http://localhost/Taxguard/.');}
    if(request.status!==200||!result.ok){const message=result.error||'Database unavailable.';if(/Session expired|Authentication required/.test(message))window.dispatchEvent(new Event('taxguard-session-expired'));throw Error(message);}
    return result.value;
  }
  window.taxguardDB={
    load:()=>call('load'),
    authStatus:()=>call('auth:status'),
    setupAdministrator:(data)=>call('auth:setup',data),
    login:(username,password)=>{const result=call('login',{username,password});sessionToken=result.sessionToken;sessionStorage.setItem('taxguard_session_token',sessionToken);return result;},
    setSessionToken:(token)=>{sessionToken=String(token||'');if(sessionToken)sessionStorage.setItem('taxguard_session_token',sessionToken);else sessionStorage.removeItem('taxguard_session_token');},
    logout:()=>{try{return call('logout')}finally{sessionToken='';sessionStorage.removeItem('taxguard_session_token');}},
    save:(data,revision)=>call('save',data,revision),
    saveForms:(data,revision)=>call('forms',data,revision),
    getUsers:()=>call('users:list'),
    saveUser:(userData)=>call('users:save',userData),
    deleteUser:(id)=>call('users:delete',{id}),
    getCompanyProfile:()=>call('company:profile:get'),
    saveCompanyProfile:(profile)=>call('company:profile:save',profile),
    exportData:(sections)=>call('data:export',{sections}),
    exportDataXlsx:(sections,options)=>call('data:export-xlsx',{sections,options}),
    readDataXlsx:(base64)=>call('data:read-xlsx',{base64}),
    previewDataImport:(payload,sections)=>call('data:preview-import',{payload,sections}),
    importData:(payload,sections,revision)=>call('data:import',{payload,sections},revision),
    listClientDocuments:(clientId)=>call('documents:list',{clientId}),
    saveClientDocument:(documentData)=>call('documents:save',documentData),
    getClientDocument:(id)=>call('documents:get',{id}),
    deleteClientDocument:(id)=>call('documents:delete',{id}),
    importClientsCsv:(text)=>call('clients:import-csv',{text}),
    importClientsXlsx:(base64)=>call('clients:import-xlsx',{base64}),
    getClientFields:()=>call('clients:fields:get'),
    saveClientFields:(fields)=>call('clients:fields:save',{fields}),
    renameClientField:(oldName,newName,revision)=>call('clients:fields:rename',{oldName,newName},revision),
    getCalendarRules:()=>call('calendar:list'),
    saveCalendarRule:(rule)=>call('calendar:save',rule),
    deleteCalendarRule:(id)=>call('calendar:delete',{id})
    ,getAuditLogs:(filters)=>call('audit:list',filters)
  };
  try{window.taxguardDB.authStatus();}catch(error){
    document.querySelector('#content').textContent=error.message;
    document.querySelector('footer span').textContent='SQLite connection failed';
    // No silent switch to separate browser records when the database is down.
  }
})();
