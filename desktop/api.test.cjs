const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const net=require('node:net');
const {Store}=require('./database.cjs');
const root=path.join(__dirname,'..');

test('PHP browser saves and desktop saves share SQLite; invalid and stale writes are rejected',async()=>{
  const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'taxguard-api-')),'test.db');
  const listener=net.createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));
  const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
  const server=spawn('C:\\xampp\\php\\php.exe',['-S',`127.0.0.1:${port}`,'-t',root],{
    windowsHide:true,env:{...process.env,TAXGUARD_DB_PATH:file,TAXGUARD_NODE_PATH:process.execPath},stdio:['ignore','ignore','pipe']
  });
  server.stderr.resume();
  let store;
  try{
    const url=`http://127.0.0.1:${port}/api.php`;
    async function request(action,data,revision,origin){
      const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:JSON.stringify({action,data,revision})});
      return response.json();
    }
    let loaded;
    for(let i=0;i<40;i++){
      try{loaded=await request('load');break}catch(error){if(i===39)throw error;await new Promise(r=>setTimeout(r,50));}
    }
    assert.equal(loaded.ok,true);assert.equal(loaded.value.clients.length,6);
    const state=loaded.value;state.clients[0].remarks='Saved through PHP';
    const saved=await request('save',state,state.revision);assert.equal(saved.ok,true);
    store=new Store(file,root);assert.equal(store.load().clients[0].remarks,'Saved through PHP');
    const forms=store.load().forms;forms[0].overrides={2026:{Q1:'2026-05-20'}};
    const updated=await request('forms',forms,saved.value);assert.equal(updated.ok,true);
    assert.equal(store.load().forms[0].overrides[2026].Q1,'2026-05-20');
    const desktop=store.load();desktop.clients[0].remarks='Saved through desktop';store.saveState(desktop,desktop.revision);
    const current=await request('load');assert.equal(current.value.clients[0].remarks,'Saved through desktop');
    assert.equal((await request('save',state,state.revision)).ok,false);
    const invalid=structuredClone(current.value);invalid.clients[0].tin='invalid';
    assert.equal((await request('save',invalid,current.value.revision)).ok,false);
    assert.deepEqual((await request('load')).value,current.value);
    assert.equal((await request('load',undefined,undefined,'https://unrelated.example')).ok,false);
  }finally{store?.close();server.kill();}
});
