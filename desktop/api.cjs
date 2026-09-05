// Fixed operation gateway used by PHP; no SQL or filesystem paths come from the browser.
const path=require('node:path');
const {Store}=require('./database.cjs');
const {seedSamples}=require('./seed.cjs');
const root=path.join(__dirname,'..');
let input='';
process.stdin.setEncoding('utf8');
process.stdin.on('data',chunk=>{input+=chunk;if(input.length>10*1024*1024)process.exit(1)});
process.stdin.on('end',()=>{
  let store;
  try{
    const {action,data,revision}=JSON.parse(input);
    store=new Store(process.env.TAXGUARD_DB_PATH||path.join(root,'database/taxguard.db'),root);
    seedSamples(store,root);
    let value;
    if(action==='load')value=store.load();
    else if(action==='login')value=store.login(data?.username,data?.password);
    else if(action==='save'||action==='forms'){
      if(!Number.isSafeInteger(revision))throw Error('Reload TaxGuard before saving.');
      value=action==='save'?store.saveState(data,revision):store.saveForms(data,revision);
    }else throw Error('Unsupported database operation.');
    process.stdout.write(JSON.stringify({ok:true,value}));
  }catch(error){process.stdout.write(JSON.stringify({ok:false,error:error.message}));}
  finally{store?.close();}
});
