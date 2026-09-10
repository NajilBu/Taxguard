const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const {Store}=require('./database.cjs');
const allocation=require('../database/form-allocation.js');
const root=path.join(__dirname,'..');
const catalog=require('../database/default-forms.json');
const base={id:1,name:'Allocation test',tin:'111-222-333-000',type:'Sole proprietorship',tax:'NVAT',status:'Active',start:'2025-01-01',forms:['2551-Q']};
const profile={type:base.type,tax:'NVAT',calendar:'calendar',income:'eight',percentage:'yes',compensation:'no',expanded:'no'};
test('Suggestions distinguish 8% elections, VAT, unknown NVAT, mixed income and regular corporations',()=>{
  const codes=p=>allocation.suggest(p,2026,catalog).suggestions.map(s=>s.code);
  assert.deepEqual(codes(profile),['1701-Q','1701A']);
  assert.deepEqual(codes({...profile,income:'mixedEight'}),['1701-Q','1701']);
  assert.deepEqual(codes({...profile,tax:'VAT'}),[]);
  assert.deepEqual(codes({...profile,income:'unknown',percentage:'unknown'}),[]);
  assert.deepEqual(codes({...profile,income:'regular',type:'Corporation',tax:'VAT'}),['1702-Q','1702-RT','2550-Q']);
  assert.deepEqual(codes({...profile,calendar:'fiscal'}),[]);
  assert.deepEqual(allocation.suggest(profile,2017,catalog).suggestions,[]);
  assert(!codes({...profile,income:'itemized'}).includes('0605'));
});
test('Year profiles survive reopen, preserve legacy years and reject removal of recorded filings atomically',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'taxguard-allocation-'));
  const filename=path.join(dir,'test.db');
  let store=new Store(filename,root);
  try{
    store.saveState({clients:[base],filings:{'1:2025:2551-Q:Q1':{date:'2025-04-25'}}});
    let state=store.load();
    state.clients[0].yearProfiles={2026:{...profile,forms:['1701-Q','1701A']}};
    store.saveState(state,state.revision);
    store.close();store=new Store(filename,root);
    state=store.load();
    assert.deepEqual(allocation.forYear(state.clients[0],2025).forms,['2551-Q']);
    assert.deepEqual(allocation.forYear(state.clients[0],2026).forms,['1701-Q','1701A']);
    assert.deepEqual(allocation.forYear(state.clients[0],2027).forms,['2551-Q']);
    const revision=state.revision;
    state.clients[0].name='Should roll back';
    state.clients[0].yearProfiles[2025]={...profile,forms:[]};
    assert.throws(()=>store.saveState(state,revision),/recorded filings/);
    assert.equal(store.load().clients[0].name,base.name);
    assert.equal(store.revision(),revision);
    state=store.load();
    state.clients[0].yearProfiles[2026].forms=['FAKE'];
    assert.throws(()=>store.saveState(state),/Unknown required form/);
    assert.equal(Object.keys(store.load().filings).length,1);
  }finally{
    store.close();
    if(path.dirname(path.resolve(dir))!==path.resolve(os.tmpdir())||!path.basename(dir).startsWith('taxguard-allocation-'))throw Error('Unexpected test directory');
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
test('Obligations use the selected year and expanded withholding excludes quarter-end months',()=>{
  const source=fs.readFileSync(path.join(root,'app.js'),'utf8');
  const code=source.slice(source.indexOf('function due('),source.indexOf("if(!database&&!localStorage"));
  const ctx=vm.createContext({TaxGuardAllocation:allocation,forms:catalog,year:2026,
    state:{clients:[{...base,yearProfiles:{2026:{...profile,forms:['0619-E'],periods:{'0619-E':allocation.expandedMonths}}}}],filings:{}}});
  vm.runInContext(code,ctx);
  const obs=ctx.obligations();
  assert.equal(obs.length,8);
  assert.equal(obs[2].p,'Apr');
  assert.equal(obs[2].due,'2026-05-10');
  assert.equal(obs[7].p,'Nov');
  ctx.year=2025;
  assert.equal(ctx.obligations().length,4);
  assert(ctx.obligations().every(o=>o.f.id==='2551-Q'));
});
