// Fixed operation gateway used by PHP; no SQL or filesystem paths come from the browser.
const path=require('node:path');
const {Store}=require('./database.cjs');
const {seedSamples}=require('./seed.cjs');
const {parseXlsxBuffer}=require('./migration.cjs');
const root=path.join(__dirname,'..');
let input='';
process.stdin.setEncoding('utf8');
process.stdin.on('data',chunk=>{input+=chunk;if(input.length>10*1024*1024)process.exit(1)});
process.stdin.on('end',async()=>{
  let store;
  try{
    const {action,data,revision}=JSON.parse(input);
    store=new Store(process.env.TAXGUARD_DB_PATH||path.join(root,'database/taxguard.db'),root);
    seedSamples(store,root);
    let value;
    if(action==='load')value=store.load();
    else if(action==='login')value=store.login(data?.username,data?.password);
    else if(action==='users:list')value=store.getUsers();
    else if(action==='users:save')value=store.saveUser(data);
    else if(action==='users:delete')value=store.deleteUser(data?.id);
    else if(action==='company:profile:get')value=store.getCompanyProfile();
    else if(action==='company:profile:save')value=store.saveCompanyProfile(data);
    else if(action==='documents:list')value=store.listClientDocuments(data?.clientId);
    else if(action==='documents:save')value=store.saveClientDocument(data);
    else if(action==='documents:get')value=store.getClientDocument(data?.id);
    else if(action==='documents:delete')value=store.deleteClientDocument(data?.id);
    else if(action==='clients:import-csv')value=store.importClientsCsv(data?.text);
    else if(action==='clients:import-xlsx'){
      if(typeof data?.base64!=='string'||data.base64.length>7*1024*1024||!/^[A-Za-z0-9+/]+={0,2}$/.test(data.base64))throw Error('Invalid Excel file.');
      value=store.importClientsRows(await parseXlsxBuffer(Buffer.from(data.base64,'base64')));
    }
    else if(action==='clients:fields:get')value=store.getClientFields();
    else if(action==='clients:fields:save')value=store.saveClientFields(data?.fields);
    else if(action==='calendar:list')value=store.getCalendarRules();
    else if(action==='calendar:save')value=store.saveCalendarRule(data);
    else if(action==='calendar:delete')value=store.deleteCalendarRule(data?.id);
    else if(action==='save'||action==='forms'){
      if(!Number.isSafeInteger(revision))throw Error('Reload TaxGuard before saving.');
      value=action==='save'?store.saveState(data,revision):store.saveForms(data,revision);
    }else throw Error('Unsupported database operation.');
    process.stdout.write(JSON.stringify({ok:true,value}));
  }catch(error){process.stdout.write(JSON.stringify({ok:false,error:error.message}));}
  finally{store?.close();}
});
