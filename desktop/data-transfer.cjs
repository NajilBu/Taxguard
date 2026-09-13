const CATEGORIES=['clients','filings','forms','documents','companyProfile'];

function normalize(payload){
  if(payload?.format==='taxguard-export-v1'){
    const clients=payload.state?.clients;
    if(!Array.isArray(clients)||!payload.state?.filings||!Array.isArray(payload.forms))throw Error('Invalid legacy TaxGuard export.');
    return {format:'taxguard-data-v1',sections:{clients,filings:payload.state.filings,forms:payload.forms},references:{clients:clients.map(c=>({id:c.id,tin:c.tin}))}};
  }
  if(payload?.format!=='taxguard-data-v1'||!payload.sections||typeof payload.sections!=='object')throw Error('Choose a TaxGuard data export JSON file.');
  return payload;
}
function choose(payload,selected){
  const data=normalize(payload);
  if(!Array.isArray(selected)||!selected.length||selected.some(key=>!CATEGORIES.includes(key)||!Object.hasOwn(data.sections,key)))throw Error('Select data available in this file.');
  return {data,selected:[...new Set(selected)]};
}
function exportData(store,selected,options={}){
  if(!Array.isArray(selected)||!selected.length||selected.some(key=>!CATEGORIES.includes(key)))throw Error('Select data to export.');
  const snapshot=store.load(),sections={};
  const clientIds=Array.isArray(options.clientIds)&&options.clientIds.length?new Set(options.clientIds.map(Number)):null;
  const from=Number.isInteger(Number(options.yearFrom))?Number(options.yearFrom):null;
  const to=Number.isInteger(Number(options.yearTo))?Number(options.yearTo):null;
  const clients=snapshot.clients.filter(c=>!clientIds||clientIds.has(Number(c.id)));
  const allowed=new Set(clients.map(c=>Number(c.id)));
  const inRange=key=>{const m=/^\d+:(\d{4}):/.exec(key);const year=m?Number(m[1]):null;return year===null||((from===null||year>=from)&&(to===null||year<=to));};
  const filings=Object.fromEntries(Object.entries(snapshot.filings).filter(([key])=>{const id=Number(key.split(':')[0]);return allowed.has(id)&&inRange(key);}));
  if(selected.includes('clients'))sections.clients=clients;
  if(selected.includes('filings'))sections.filings=filings;
  if(selected.includes('forms'))sections.forms=snapshot.forms;
  if(selected.includes('documents'))sections.documents=store.db.prepare('SELECT client_id,filing_key,filename,mime_type,content_base64 FROM client_documents ORDER BY id').all();
  if(selected.includes('companyProfile'))sections.companyProfile=store.getCompanyProfile();
  const result={format:'taxguard-data-v1',exportedAt:new Date().toISOString(),sections,
    references:{clients:clients.map(c=>({id:c.id,tin:c.tin}))},
    metadata:selected.includes('clients')?{clientFields:store.getClientFields()}:undefined};
  if(Buffer.byteLength(JSON.stringify(result),'utf8')>8*1024*1024)throw Error('Selected data exceeds 8 MB. Use a full SQLite backup for larger exports.');
  return result;
}
function planImport(store,payload,selection){
  const {data,selected}=choose(payload,selection),snapshot=store.load(),sections=data.sections;
  const needsClients=selected.some(key=>['clients','filings','documents'].includes(key));
  const neededIds=new Set();
  if(selected.includes('filings'))for(const key of Object.keys(sections.filings||{}))neededIds.add(Number(key.split(':')[0]));
  if(selected.includes('documents'))for(const doc of sections.documents||[])neededIds.add(Number(doc.client_id));
  const sourceClients=needsClients?(sections.clients||data.references?.clients||[]).filter(c=>selected.includes('clients')||neededIds.has(c.id)):[];
  if(!Array.isArray(sourceClients))throw Error('Client references are missing.');
  const localByTin=new Map(snapshot.clients.map(c=>[c.tin,c]));
  const idMap=new Map(),newClients=[];
  let nextId=Math.max(0,...snapshot.clients.map(c=>c.id))+1,skippedClients=0;
  for(const source of sourceClients){
    if(!Number.isSafeInteger(source?.id)||source.id<=0||typeof source.tin!=='string'||idMap.has(source.id))throw Error('Invalid or duplicate client reference.');
    let target=localByTin.get(source.tin);
    if(!target){
      if(!selected.includes('clients'))throw Error('Import the matching clients first, or select Clients in this import.');
      target={...source,id:nextId++};newClients.push(target);localByTin.set(source.tin,target);
    }else if(selected.includes('clients'))skippedClients++;
    idMap.set(source.id,target.id);
  }
  if(selected.includes('clients')&&(!Array.isArray(sections.clients)||sections.clients.length!==sourceClients.length))throw Error('Invalid client records.');
  const incomingForms=selected.includes('forms')?sections.forms:[];
  if(!Array.isArray(incomingForms))throw Error('Invalid form schedules.');
  const knownForms=new Map(snapshot.forms.map(f=>[f.id,f]));
  let newForms=0,updatedForms=0;
  for(const form of incomingForms){
    if(!form||typeof form.id!=='string')throw Error('Invalid form schedule.');
    if(knownForms.has(form.id))updatedForms++;else newForms++;
    knownForms.set(form.id,form);
  }
  const sourceFilings=selected.includes('filings')?sections.filings:{};
  if(!sourceFilings||typeof sourceFilings!=='object'||Array.isArray(sourceFilings))throw Error('Invalid filing records.');
  const newFilings={},filingKeys=new Set(Object.keys(snapshot.filings));
  let skippedFilings=0;
  for(const [key,filing] of Object.entries(sourceFilings)){
    const match=/^(\d+):(\d{4}):([^:]+):([^:]+)$/.exec(key);
    if(!match||!idMap.has(Number(match[1]))||!knownForms.has(match[3])||!filing||typeof filing!=='object')throw Error('Filing refers to an unknown client or form.');
    const mapped=`${idMap.get(Number(match[1]))}:${match[2]}:${match[3]}:${match[4]}`;
    if(filingKeys.has(mapped)){skippedFilings++;continue;}
    filingKeys.add(mapped);newFilings[mapped]=filing;
  }
  const sourceDocuments=selected.includes('documents')?sections.documents:[];
  if(!Array.isArray(sourceDocuments))throw Error('Invalid document records.');
  const documents=[],knownDocuments=new Set(store.db.prepare('SELECT client_id,filing_key,filename,content_base64 FROM client_documents').all().map(d=>JSON.stringify([d.client_id,d.filing_key||'',d.filename,d.content_base64])));
  let skippedDocuments=0;
  for(const doc of sourceDocuments){
    const clientId=idMap.get(Number(doc?.client_id));
    if(!clientId)throw Error('Document refers to an unknown client.');
    let filingKey=String(doc.filing_key||'');
    if(filingKey){
      const match=/^(\d+):(\d{4}):([^:]+):([^:]+)$/.exec(filingKey);
      if(!match||Number(match[1])!==Number(doc.client_id))throw Error('Invalid document filing link.');
      filingKey=`${clientId}:${match[2]}:${match[3]}:${match[4]}`;
    }
    const mapped={clientId,filingKey,filename:doc.filename,mime:doc.mime_type,base64:doc.content_base64};
    const signature=JSON.stringify([clientId,filingKey,mapped.filename,mapped.base64]);
    if(knownDocuments.has(signature)){skippedDocuments++;continue;}
    knownDocuments.add(signature);documents.push(mapped);
  }
  if(selected.includes('companyProfile')&&(!sections.companyProfile||typeof sections.companyProfile!=='object'))throw Error('Invalid company profile.');
  return {data,selected,snapshot,mergedForms:[...knownForms.values()],newClients,newFilings,documents,
    summary:{clients:{new:newClients.length,skipped:skippedClients},filings:{new:Object.keys(newFilings).length,skipped:skippedFilings},forms:{new:newForms,updated:updatedForms},documents:{new:documents.length,skipped:skippedDocuments},companyProfile:{apply:selected.includes('companyProfile')?1:0}}};
}
function previewDataImport(store,payload,selected){return planImport(store,payload,selected).summary;}
function importData(store,payload,selected,expectedRevision){
  const plan=planImport(store,payload,selected);
  store.db.exec('SAVEPOINT selective_import');
  try{
    store.checkRevision(expectedRevision);
    let bumped=false;
    if(selected.includes('forms')){store.saveForms(plan.mergedForms,store.revision());bumped=true;}
    if(selected.includes('clients')||selected.includes('filings')){
      store.saveState({clients:[...plan.snapshot.clients,...plan.newClients],filings:{...plan.snapshot.filings,...plan.newFilings}},store.revision());bumped=true;
      if(selected.includes('clients')&&Array.isArray(plan.data.metadata?.clientFields)){
        const fields=[...new Set([...store.getClientFields(),...plan.data.metadata.clientFields])];
        store.saveClientFields(fields);
      }
    }
    if(selected.includes('documents'))for(const doc of plan.documents)store.saveClientDocument(doc);
    if(selected.includes('companyProfile'))store.saveCompanyProfile(plan.data.sections.companyProfile);
    if(!bumped)store.bumpRevision();
    store.db.exec('RELEASE selective_import');
  }catch(error){store.db.exec('ROLLBACK TO selective_import; RELEASE selective_import');throw error;}
  return {...plan.summary,revision:store.revision()};
}
module.exports={CATEGORIES,exportData,previewDataImport,importData};
