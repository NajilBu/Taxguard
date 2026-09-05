const fs=require('node:fs');
const path=require('node:path');
const {scheduleDate}=require('./database.cjs');

// One-time, additive demo seed. Match TINs, remap occupied IDs, preserve saved values.
function seedSamples(store,root){
  store.transaction(()=>{
    if(store.db.prepare("SELECT value FROM workspace_meta WHERE key='sample-seed-v1'").get())return;
    const saved=store.load(), samples=JSON.parse(fs.readFileSync(path.join(root,'database/sample-clients.json'),'utf8'));
    const defaults=JSON.parse(fs.readFileSync(path.join(root,'database/default-forms.json'),'utf8'));
    let next=Math.max(0,...saved.clients.map(c=>c.id))+1;
    const ids=new Map();
    for(const c of samples){
      const existing=saved.clients.find(row=>row.tin===c.tin);
      if(existing){ids.set(c.id,existing.id);continue;}
      const id=next++;ids.set(c.id,id);saved.clients.push({...c,id,remarks:'Sample client'});
    }
    for(const year of [2024,2025,2026]){
      let index=0;
      for(const c of samples)for(const f of defaults.filter(f=>c.forms.includes(f.id)))for(const p of f.periods){
        const due=scheduleDate(f,p,year),i=index++;
        if((year<2026||due<'2026-09-01')&&i%5!==0){
          const key=`${ids.get(c.id)}:${year}:${f.id}:${p}`;
          if(!saved.filings[key])saved.filings[key]={date:due,reference:`TG-${year}-${String(i+1).padStart(4,'0')}`,remarks:'Sample submission'};
        }
      }
    }
    store.saveState(saved);
    store.db.prepare("INSERT INTO workspace_meta VALUES('sample-seed-v1','1')").run();
  });
}
module.exports={seedSamples};
