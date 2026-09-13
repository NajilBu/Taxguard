const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const forms=[
  {id:'1701-Q',name:'Quarterly income tax · Individuals',periods:['Q1','Q2','Q3'],dates:['05-15','08-15','11-15'],frequency:'Quarterly'},
  {id:'1702-Q',name:'Quarterly income tax · Corporations',periods:['Q1','Q2','Q3'],dates:['05-30','08-29','11-29'],frequency:'Quarterly'},
  {id:'2550-Q',name:'Quarterly value-added tax',periods:['Q1','Q2','Q3','Q4'],dates:['04-25','07-25','10-25','01-25'],frequency:'Quarterly'},
  {id:'2551-Q',name:'Quarterly percentage tax',periods:['Q1','Q2','Q3','Q4'],dates:['04-25','07-25','10-25','01-25'],frequency:'Quarterly'},
  {id:'1601-C',name:'Monthly withholding · Compensation',periods:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],dates:[],frequency:'Monthly'},
  {id:'0619-E',name:'Monthly creditable withholding · Expanded',periods:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],dates:[],frequency:'Monthly'},
  {id:'1601-EQ',name:'Quarterly creditable withholding · Expanded',periods:['Q1','Q2','Q3','Q4'],dates:['04-30','07-31','10-31','01-31'],frequency:'Quarterly'},
  {id:'1601-FQ',name:'Quarterly final withholding tax return',periods:['Q1','Q2','Q3','Q4'],dates:['04-30','07-31','10-31','01-31'],frequency:'Quarterly'},
  {id:'0605',name:'Payment form / Annual registration',periods:['Annual'],dates:['01-31'],frequency:'Annual'},
  {id:'1701',name:'Annual income tax · Individuals',periods:['Annual'],dates:['04-15'],frequency:'Annual'},
  {id:'1702',name:'Annual income tax · Corporations',periods:['Annual'],dates:['04-15'],frequency:'Annual'},
  {id:'1604-C',name:'Annual withholding info return · Compensation',periods:['Annual'],dates:['01-31'],frequency:'Annual'},
  {id:'1604-E',name:'Annual withholding info return · Expanded',periods:['Annual'],dates:['03-01'],frequency:'Annual'},
  {id:'1701A',name:'Annual income tax · Pure business / OSD or 8%',periods:['Annual'],dates:['04-15'],frequency:'Annual'},
  {id:'1702-RT',name:'Annual income tax · Regular-rate corporations',periods:['Annual'],dates:['04-15'],frequency:'Annual'}
];
const database=window.taxguardDB;
const databaseSnapshot=database?database.load():null;
let customClientFields=[];
try{customClientFields=database?.getClientFields?.()||JSON.parse(localStorage.getItem('taxguard-client-fields')||'[]');}catch{}
let calendarRules=[];
try{calendarRules=database?.getCalendarRules?.()||JSON.parse(localStorage.getItem('taxguard-calendar-rules')||'[]');}catch{}
let databaseRevision=databaseSnapshot?.revision;
if(databaseSnapshot)forms.splice(0,forms.length,...databaseSnapshot.forms);
const initial=[{id:1,name:'Dela Cruz Trading',tin:'000-000-001-000',type:'Sole proprietorship',status:'Active',tax:'VAT',start:'2021-01-01',forms:['1701-Q','2550-Q','1701']},{id:2,name:'Marcedonio Photography',tin:'000-000-002-000',type:'Sole proprietorship',status:'Active',tax:'NVAT',start:'2022-01-01',forms:['1701-Q','2551-Q','1701']},{id:3,name:'Santos Retail Corporation',tin:'000-000-003-000',type:'Corporation',status:'Active',tax:'VAT',start:'2023-01-01',forms:['2550-Q','1601-C','1702']},{id:4,name:'Abundant Enterprises Co.',tin:'000-000-004-000',type:'Partnership',status:'Active',tax:'VAT',start:'2023-03-08',forms:['2550-Q','1702']},{id:5,name:'Acuña, Jennifer Delgado',tin:'000-000-005-000',type:'Sole proprietorship',status:'For closure',tax:'VAT',start:'2023-09-29',forms:['1701-Q','2550-Q','1601-C','1701']},{id:6,name:'Adamos, Robert Bryan Ramos',tin:'000-000-006-000',type:'Sole proprietorship',status:'Active',tax:'NVAT',start:'2020-03-09',forms:['1701-Q','2551-Q','1701']}];
let state;try{state=JSON.parse(localStorage.getItem('taxguard-workspace-v1'))}catch{}if(databaseSnapshot)state={clients:databaseSnapshot.clients,filings:databaseSnapshot.filings};if(!state)state={clients:initial,filings:{}};let page='dashboard',year=new Date().getFullYear(),query='',filter='unfiled',periodFilter='all';let clientTaxFilter='all',clientBusinessFilter='all',clientSort='az';let trackerPage=1;const pageSize=10;let today=localDate();
function baseDue(f,p,y){if(f.overrides?.[y]?.[p])return f.overrides[y][p];let i=f.periods.indexOf(p);if(/^\d{4}-\d{2}-\d{2}$/.test(f.dates[i]||''))return f.dates[i];if(f.frequency==='Monthly'||f.id==='1601-C'||f.id==='0619-E')return `${i===11?y+1:y}-${String(i===11?1:i+2).padStart(2,'0')}-${i===11?'15':'10'}`;return `${p==='Annual'||p==='Q4'?y+1:y}-${f.dates[i]}`}
function due(f,p,y){
  const scheduled=baseDue(f,p,y);
  if(f.overrides?.[y]?.[p])return scheduled;
  const extension=calendarRules.filter(rule=>rule.rule_type==='extension'&&rule.form_code===f.id&&rule.tax_year===y&&rule.period===p).at(-1);
  let value=extension?.adjusted_due||scheduled;
  const holidays=new Set(calendarRules.filter(rule=>rule.rule_type==='holiday').map(rule=>rule.rule_date));
  for(let i=0;i<14;i++){
    const date=new Date(value+'T00:00:00Z'),day=date.getUTCDay();
    if(day!==0&&day!==6&&!holidays.has(value))return value;
    date.setUTCDate(date.getUTCDate()+1);value=date.toISOString().slice(0,10);
  }
  return value;
}
function key(c,f,p){return `${c.id}:${year}:${f.id}:${p}`}
function filingPeriodLabel(f,p,y){
  if(p==='Annual')return `Tax year ${y}`;
  if(/^Q[1-4]$/.test(p))return `${p} ${y}`;
  if(f.frequency==='Monthly'||['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].includes(p)){
    const month=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(p);
    if(month>=0)return `${new Date(Date.UTC(y,month,1)).toLocaleDateString('en-US',{month:'long',year:'numeric',timeZone:'UTC'})}`;
  }
  return `${p} ${y}`;
}
function clientForYear(c,y=year){
  const result=TaxGuardAllocation.forYear(c,y);
  if(!result.inheritedFrom)return result;
  const formsSet=new Set(result.forms),periods=JSON.parse(JSON.stringify(result.periods||{}));
  for(const key of Object.keys(state.filings)){
    const [id,fy,code,period]=key.split(':');
    if(Number(id)!==c.id||Number(fy)!==y)continue;
    formsSet.add(code);
    if(periods[code]&&!periods[code].includes(period))periods[code].push(period);
  }
  return {...result,forms:[...formsSet],periods};
}
function ensureAutomaticYear(){
  if(!document.body.classList.contains('logged-in'))return;
  const previous=state;
  let changed=false;
  const clients=state.clients.map(c=>{
    if(c.status==='Pulled out')return c;
    if(c.yearProfiles?.[year])return c;
    const inherited=clientForYear(c);
    if(!inherited.inheritedFrom)return c;
    const profile={};
    for(const field of ['type','tax','forms','periods','calendar','income','percentage','compensation','expanded','inheritedFrom','reviewReason'])if(inherited[field]!==undefined)profile[field]=inherited[field];
    changed=true;return {...c,yearProfiles:{...c.yearProfiles,[year]:profile}};
  });
  if(!changed)return;
  state={...state,clients};
  try{save();}catch{if(!database)state=previous;}
}
function obligationsForYear(y){return state.clients.map(c=>clientForYear(c,y)).flatMap(c=>forms.filter(f=>c.forms.includes(f.id)).flatMap(f=>f.periods.filter(p=>!c.periods?.[f.id]||c.periods[f.id].includes(p)).map(p=>{let i=f.periods.indexOf(p),end=p==='Annual'?`${y}-12-31`:p.startsWith('Q')?`${y}-${String((i+1)*3).padStart(2,'0')}-31`:`${y}-${String(i+1).padStart(2,'0')}-31`;const filingKey=`${c.id}:${y}:${f.id}:${p}`;return {c,f,p,end,due:due(f,p,y),key:filingKey,filing:state.filings[filingKey]}}).filter(o=>o.end>=c.start&&(!c.pulledOutAt||o.end<=c.pulledOutAt||o.filing))))}
function obligations(){return obligationsForYear(year)}
function clientFiveYearSummary(id,endingYear){
  return Array.from({length:5},(_,i)=>endingYear-4+i).map(taxYear=>{
    const items=obligationsForYear(taxYear).filter(o=>o.c.id===id);
    return {year:taxYear,total:items.length,filed:items.filter(o=>o.filing).length,status:complianceStatus(items)};
  });
}
if(!database&&!localStorage.getItem('taxguard-workspace-v1')){for(const y of [2024,2025,2026]){year=y;obligations().forEach((o,i)=>{if((y<2026||o.due<'2026-09-01')&&i%5!==0)state.filings[o.key]={date:o.due,reference:`TG-${y}-${String(i+1).padStart(4,'0')}`,remarks:'Sample submission'};})}year=new Date().getFullYear();save()}
function closeModal(m,afterClose){if(!m)return;clearTimeout(m.workspaceCloseTimer);if(m.classList.contains('closing')){try{m.close();}catch(e){}m.classList.remove('closing');if(afterClose)afterClose();return;}m.classList.add('closing');m.workspaceCloseTimer=setTimeout(()=>{try{m.close();}catch(e){}m.classList.remove('closing');if(afterClose)afterClose();},180)}
function restoreDatabase(){const saved=database.load();databaseRevision=saved.revision;state={clients:saved.clients,filings:saved.filings};forms.splice(0,forms.length,...saved.forms);}
function save(){try{if(database)databaseRevision=database.save(state,databaseRevision);else localStorage.setItem('taxguard-workspace-v1',JSON.stringify(state));}catch(error){if(database)restoreDatabase();notify('Not saved: '+error.message);throw error;}}
function saveForms(){try{if(database)databaseRevision=database.saveForms(forms,databaseRevision);else localStorage.setItem('taxguard-custom-forms',JSON.stringify(forms));}catch(error){if(database)restoreDatabase();notify('Not saved: '+error.message);throw error;}}
function notify(t){let e=document.querySelector('#toast');if(!e)return;const isError=/error|fail|cannot|invalid|already exists|not saved/i.test(t),isWarning=/warning|alert|require|must/i.test(t),icon=isError?'⚠️':isWarning?'⚡':'✓';e.innerHTML=`<span class="toast-icon">${icon}</span><span class="toast-text">${esc(t)}</span>`;e.className=isError?'toast-error':isWarning?'toast-warning':'toast-success';if(e._toastTimeout)clearTimeout(e._toastTimeout);if(e._hideTimeout)clearTimeout(e._hideTimeout);const supportsPopover=typeof e.showPopover==='function';if(supportsPopover){try{if(e.matches(':popover-open'))e.hidePopover();}catch(err){}try{e.showPopover();}catch(err){e.style.display='flex';}}else{e.style.display='flex';}requestAnimationFrame(()=>{e.classList.add('toast-visible');});e._toastTimeout=setTimeout(()=>{e.classList.remove('toast-visible');e._hideTimeout=setTimeout(()=>{if(supportsPopover){try{e.hidePopover();}catch(err){}}e.style.display='none';},220);},3200);}
const modalEl=document.querySelector('#modal');if(modalEl){const origShowModal=modalEl.showModal.bind(modalEl);modalEl.showModal=function(){origShowModal();const toast=document.querySelector('#toast');if(toast&&typeof toast.showPopover==='function'&&toast.classList.contains('toast-visible')){try{toast.hidePopover();toast.showPopover();}catch(e){}}};}
const badge=s=>`<span class="badge ${s.toLowerCase().replaceAll(' ','-')}">${esc(s)}</span>`;const clientCell=c=>`<div class="client-cell"><span class="client-icon">${esc(c.name.split(' ').slice(0,2).map(x=>x[0]).join(''))}</span><div><strong>${esc(c.name)}</strong><small>${esc(c.type)}</small></div></div>`;
function yearSelect(){return `<input type="number" aria-label="Tax year" title="Tax year" id="year" min="1000" max="9998" step="1" value="${year}" style="width:110px">`}
function heading(title,desc,action=''){const deadlineButton=title==='Deadline reference'?'<button class="btn primary" id="add-deadline">＋ Add deadline</button>':'';return `<div class="page-title"><div><div class="eyebrow">YOUR COMPLIANCE WORKSPACE</div><h1>${title}</h1><p>${desc}</p></div><div class="controls">${yearSelect()}${action}${deadlineButton}</div></div>`}

function updateDashboardClock() {
  const clock=document.querySelector('.dashboard-clock');
  if(!clock)return;
  const now=new Date(),date=clock.querySelector('.dashboard-clock-date'),time=clock.querySelector('time');
  // Update text nodes in place so the card animation observer is not retriggered.
  date.textContent=now.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'});
  time.textContent=now.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true});
  time.dateTime=now.toISOString();
}
setInterval(updateDashboardClock,1000);
window.addEventListener('focus',updateDashboardClock);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateDashboardClock();});
updateDashboardClock();
function complianceStatus(obs){
  if(!obs.length)return 'N/A';
  const unfiled=obs.filter(o=>!o.filing);
  if(!unfiled.length)return 'Complete';
  return unfiled.some(o=>o.due<today)?'Incomplete':'Pending';
}
function status(c,obs){return complianceStatus(obs.filter(o=>o.c.id===c.id));}
function filteredClientRows(clients,search,taxType,businessType,sortOrder){
  const term=search.trim().toLocaleLowerCase();
  return clients.filter(c=>(c.name+' '+c.tin).toLocaleLowerCase().includes(term)
    &&(taxType==='all'||c.tax===taxType)
    &&(businessType==='all'||c.type===businessType))
    .sort((a,b)=>(sortOrder==='za'?-1:1)*a.name.localeCompare(b.name,undefined,{sensitivity:'base'})||a.tin.localeCompare(b.tin));
}
function filingStatus(o){return complianceStatus([o]);}
function deadlineRiskBuckets(items,asOf=today){
  const start=Date.parse(asOf+'T00:00:00Z');
  const groups={overdue:[],today:[],within3:[],within7:[]};
  for(const item of items){
    if(item.filing)continue;
    const days=Math.round((Date.parse(item.due+'T00:00:00Z')-start)/86400000);
    if(days<0)groups.overdue.push(item);
    else if(days===0)groups.today.push(item);
    else if(days<=3)groups.within3.push(item);
    else if(days<=7)groups.within7.push(item);
  }
  return groups;
}
let selectedRiskGroup=null;
function riskRadar(items){
  const groups=deadlineRiskBuckets(items);
  const cards=[['Overdue','overdue'],['Due today','today'],['Due within 3 days','within3'],['Due within 7 days','within7']];
  const selected=selectedRiskGroup&&groups[selectedRiskGroup]?selectedRiskGroup:cards.find(([,key])=>groups[key].length)?.[1]||'overdue';
  const rows=groups[selected].slice().sort((a,b)=>a.due.localeCompare(b.due)||a.c.name.localeCompare(b.c.name));
  const selectedTitle=cards.find(([,key])=>key===selected)[0];
  return `<div class="panel risk-radar"><div class="panel-head"><div><h2>Deadline risk radar</h2><p>Unfiled obligations grouped by their due date.</p></div><button class="link" data-go="tracker">Open tracker →</button></div><div class="risk-radar-grid">${cards.map(([title,key])=>`<button type="button" class="risk-radar-card ${key} ${selected===key?'selected':''}" data-risk-group="${key}" aria-pressed="${selected===key}" aria-controls="risk-radar-results"><small>${title}</small><strong>${groups[key].length}</strong></button>`).join('')}</div><div id="risk-radar-results" class="risk-radar-results"><h3>${selectedTitle} <span class="subtle">${rows.length} unfiled ${rows.length===1?'obligation':'obligations'}</span></h3><div class="table-scroll"><table><thead><tr><th>Client</th><th>BIR form</th><th>Period</th><th>Due date</th></tr></thead><tbody>${rows.map(o=>`<tr><td>${clientCell(o.c)}</td><td>${esc(o.f.id)}</td><td>${esc(o.p)} ${year}</td><td>${esc(o.due)}</td></tr>`).join('')||'<tr><td colspan="4" class="empty">No unfiled obligations in this group.</td></tr>'}</tbody></table></div></div></div>`;
}
document.addEventListener('click',event=>{
  const card=event.target.closest('[data-risk-group]');
  if(!card)return;
  selectedRiskGroup=card.dataset.riskGroup;
  const panel=document.querySelector('.risk-radar');
  if(panel){
    const updated=document.createElement('div');
    updated.innerHTML=riskRadar(obligations());
    panel.querySelector('.risk-radar-grid').replaceWith(updated.querySelector('.risk-radar-grid'));
    panel.querySelector('.risk-radar-results').replaceWith(updated.querySelector('.risk-radar-results'));
  }
  document.querySelector(`.risk-radar-card[data-risk-group="${selectedRiskGroup}"]`)?.focus();
});
function pulloutPage(){
  const archived=state.clients.filter(c=>c.status==='Pulled out').sort((a,b)=>a.name.localeCompare(b.name));
  return heading('PULLOUT','Clients whose service ended. Historical filings remain available.','<button class="btn" data-go="clients">← Client directory</button>')+`<div class="panel"><div class="table-scroll"><table><thead><tr><th>Client</th><th>TIN</th><th>Service ended</th><th>Last assigned forms</th></tr></thead><tbody>${archived.map(c=>`<tr class="client-row" data-client="${c.id}"><td>${clientCell(c)}</td><td>${esc(c.tin)}</td><td>${esc(c.pulledOutAt||'—')}</td><td>${(c.forms||[]).map(esc).join(', ')}</td></tr>`).join('')||'<tr><td colspan="4" class="empty">No clients have been pulled out.</td></tr>'}</tbody></table></div></div>`;
}
function calendarRulesPanel(){
  return `<div class="panel" style="margin-top:24px"><div class="panel-head"><div><h2>Calendar adjustments</h2><p>Weekend due dates move to the next working day. Enter official holidays and BIR circular extensions below; manual form overrides remain exact.</p></div><div class="storage-actions"><button class="btn secondary" id="add-calendar-holiday">Add holiday</button><button class="btn secondary" id="add-calendar-extension">Add extension</button></div></div><div class="table-scroll"><table><thead><tr><th>Type</th><th>Date</th><th>Details</th><th>Source</th><th></th></tr></thead><tbody>${calendarRules.map(rule=>`<tr><td>${esc(rule.rule_type)}</td><td>${esc(rule.rule_date)}</td><td>${esc(rule.rule_type==='extension'?`${rule.form_code} · ${rule.period} ${rule.tax_year} → ${rule.adjusted_due}`:rule.label)}</td><td>${rule.source_url?`<a href="${esc(rule.source_url)}" target="_blank" rel="noopener">Source</a>`:'—'}</td><td><button class="link" data-delete-calendar-rule="${rule.id}">Remove</button></td></tr>`).join('')||'<tr><td colspan="5" class="empty">No holiday or extension entries added.</td></tr>'}</tbody></table></div><div class="summary-line">Verify with the <a href="https://www.bir.gov.ph/" target="_blank" rel="noopener">official BIR tax calendar</a>, <a href="https://www.bir.gov.ph/bir-forms" target="_blank" rel="noopener">BIR form directory</a>, and applicable circulars before filing.</div></div>`;
}
function openCalendarRuleDialog(type){
  const dialog=document.createElement('dialog');dialog.className='calendar-rule-dialog';
  const extension=type==='extension';
  dialog.innerHTML=`<h2>${extension?'Add BIR extension':'Add non-working day'}</h2><p>${extension?'Record a form-specific extension with its official source.':'Record an officially announced non-working day for deadline calculations.'}</p><form id="calendar-rule-form">
    ${extension?`<label>Form</label><select name="form_code">${forms.map(form=>`<option value="${esc(form.id)}">${esc(form.id)}</option>`).join('')}</select><label>Tax year</label><input name="tax_year" type="number" min="1000" max="9998" value="${year}" required><label>Period</label><select name="period"></select>`:''}
    <label>${extension?'Original due date':'Non-working date'}</label><input name="rule_date" type="date" required value="${today}"><label>${extension?'Extended due date':'Description'}</label>${extension?'<input name="adjusted_due" type="date" required>':'<input name="label" maxlength="200" required>'}<label>Official source URL ${extension?'(required)':'(recommended)'}</label><input name="source_url" type="url" placeholder="https://bir.gov.ph/..." ${extension?'required':''}><div class="modal-actions"><button type="button" class="btn" id="cancel-calendar-rule">Cancel</button><button class="btn primary">Save adjustment</button></div></form>`;
  document.body.append(dialog);
  const form=dialog.querySelector('form');
  const updatePeriods=()=>{
    if(!extension)return;
    const selected=forms.find(item=>item.id===form.elements.form_code.value);
    form.elements.period.innerHTML=selected.periods.map(period=>`<option value="${esc(period)}">${esc(period)}</option>`).join('');
    const updateDate=()=>{form.elements.rule_date.value=baseDue(selected,form.elements.period.value,Number(form.elements.tax_year.value));};
    form.elements.period.onchange=updateDate;form.elements.tax_year.onchange=updateDate;updateDate();
  };
  if(extension){form.elements.form_code.onchange=updatePeriods;updatePeriods();}
  const dismiss=()=>{dialog.close();dialog.remove();};
  dialog.querySelector('#cancel-calendar-rule').onclick=dismiss;
  form.onsubmit=event=>{
    event.preventDefault();const data=Object.fromEntries(new FormData(form));data.rule_type=type;
    try{
      if(database?.saveCalendarRule)calendarRules=database.saveCalendarRule(data);
      else{calendarRules=[...calendarRules,{...data,id:Date.now(),tax_year:Number(data.tax_year||0)}];localStorage.setItem('taxguard-calendar-rules',JSON.stringify(calendarRules));}
      dismiss();render();notify('Calendar adjustment saved.');
    }catch(error){notify('Calendar not saved: '+error.message);}
  };
  dialog.showModal();
}
document.addEventListener('click',event=>{
  if(event.target.closest('#add-calendar-holiday'))openCalendarRuleDialog('holiday');
  if(event.target.closest('#add-calendar-extension'))openCalendarRuleDialog('extension');
  const remove=event.target.closest('[data-delete-calendar-rule]');
  if(remove){
    try{calendarRules=database?.deleteCalendarRule?database.deleteCalendarRule(Number(remove.dataset.deleteCalendarRule)):calendarRules.filter(rule=>rule.id!==Number(remove.dataset.deleteCalendarRule));if(!database)localStorage.setItem('taxguard-calendar-rules',JSON.stringify(calendarRules));render();notify('Calendar adjustment removed.');}catch(error){notify('Calendar not changed: '+error.message);}
  }
});
function render(){ensureAutomaticYear();document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('selected',b.dataset.page===page));document.querySelector('#crumb').textContent={dashboard:'Overview',clients:'Client directory',pullout:'PULLOUT',tracker:'Compliance tracker',deadlines:'Deadline reference',settings:'Settings'}[page];document.querySelector('#content').innerHTML=({dashboard:dashboard,clients:clients,pullout:pulloutPage,tracker:tracker,deadlines:deadlines,settings:settings}[page])();document.querySelector('#year')?.addEventListener('change',e=>{const next=Number(e.target.value);if(!e.target.validity.valid||!Number.isInteger(next)){e.target.value=year;return;}year=next;trackerPage=1;render()});bind()}
function dashboard(){const obs=obligations(),done=obs.filter(o=>o.filing).length,over=obs.filter(o=>!o.filing&&o.due<today).length,active=state.clients.filter(c=>c.start<=`${year}-12-31`),complete=active.filter(c=>status(c,obs)==='Complete').length,pct=Math.round(done/Math.max(obs.length,1)*100);let recent=obs.filter(o=>o.filing).sort((a,b)=>b.filing.date.localeCompare(a.filing.date)).slice(0,5);return heading('A clear view of your compliance.',`Track obligations, keep deadlines in sight, and move every client forward.`,`<button class="btn primary" data-go="tracker">↗ Open tracker</button>`)+`<div class="stats">${[[active.length,'Clients in this year','♙','Across your client portfolio'],[done,'Filings completed','✓',`${pct}% of ${obs.length} obligations`],[obs.length-done,'Awaiting filing','◷','Applicable obligations remaining'],[over,'Overdue obligations','!',`As of ${new Date(today+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`]].map((s,i)=>`<div class="stat"><div class="stat-top">${s[1]}<span class="stat-icon">${s[2]}</span></div><strong>${s[0]}</strong><small class="${i===1?'green':''}">${s[3]}</small></div>`).join('')}</div><div class="grid"><div class="panel"><div class="panel-head"><div><h2>Filing progress by form</h2><p>Completed obligations for ${year}</p></div><span class="subtle">${year} TAX YEAR</span></div><div class="panel-body">${forms.slice(0,4).map(f=>{let a=obs.filter(o=>o.f.id===f.id),n=a.filter(o=>o.filing).length;return `<div class="progress-row"><div class="progress-label"><span>${f.id}<small>${f.name.split(' · ')[0]}</small></span><span>${n} <span class="subtle">/ ${a.length}</span></span></div><div class="track"><div class="fill" style="width:${100*n/Math.max(a.length,1)}%"></div></div></div>`}).join('')}</div></div><div class="panel"><div class="panel-head"><div><h2>Portfolio completion</h2><p>Every applicable period counts</p></div></div><div class="panel-body"><div class="donut-wrap"><div class="donut" style="background:conic-gradient(#4b84e5 ${pct}%,#edf1f6 0)"><div class="donut-inner"><strong>${pct}%</strong><small>FILINGS COMPLETE</small></div></div><div class="legend"><div><i style="background:#4b84e5"></i>Filed<b>${done}</b></div><div><i style="background:#e0e6ef"></i>Remaining<b>${obs.length-done}</b></div></div></div><div class="banner">${['Complete','Pending','Incomplete','N/A'].map(label=>`${badge(label)} ${active.filter(c=>status(c,obs)===label).length}`).join(' · ')}<br>${complete} of ${active.length} clients have completed every obligation for ${year}.</div></div></div></div>${clientTrendChart()}${riskRadar(obs)}<div class="panel"><div class="panel-head"><div><h2>Recent filings</h2><p>The latest recorded submissions in your workspace</p></div><button class="link" data-go="tracker">View all filings →</button></div><div class="table-scroll"><table><thead><tr><th>Client</th><th>BIR form</th><th>Period</th><th>Filed on</th><th>Status</th></tr></thead><tbody>${recent.map(o=>`<tr class="recent-client-row" data-client="${o.c.id}"><td>${clientCell(o.c)}</td><td>${o.f.id}</td><td>${o.p} ${year}</td><td>${o.filing.date}</td><td>${badge('Complete')}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">No filings recorded for this year.</td></tr>'}</tbody></table></div></div>`}
function clients(){let rows=filteredClientRows(state.clients.filter(c=>c.status!=='Pulled out').map(c=>clientForYear(c)),query,clientTaxFilter,clientBusinessFilter,clientSort);return heading('Client directory','One master record for every client and their filing requirements.','<div class="directory-actions"><button class="btn" data-go="pullout">View PULLOUT</button><button class="btn primary" id="add-client">＋ Add client</button></div>')+`<div class="panel"><div class="toolbar"><div class="search-wrap"><input id="search" placeholder="Search clients or TIN…" aria-label="Search clients" value="${esc(query)}"><button type="button" class="search-clear" id="clear-search">×</button></div><select id="client-tax-filter" aria-label="Filter by tax type"><option value="all">All tax types</option>${['VAT','NVAT'].map(v=>`<option value="${v}" ${clientTaxFilter===v?'selected':''}>${v}</option>`).join('')}</select><select id="client-business-filter" aria-label="Filter by business type"><option value="all">All business types</option>${['Sole proprietorship','Partnership','Corporation'].map(v=>`<option value="${v}" ${clientBusinessFilter===v?'selected':''}>${v}</option>`).join('')}</select><select id="client-sort" aria-label="Sort clients alphabetically"><option value="az" ${clientSort==='az'?'selected':''}>Name A–Z</option><option value="za" ${clientSort==='za'?'selected':''}>Name Z–A</option></select><span class="subtle">${rows.length} CLIENTS</span></div><div class="table-scroll"><table><thead><tr><th>Client / business type</th><th>TIN</th><th>Tax type</th><th>Status</th><th>Start of filing</th><th>Required forms (${year})</th>${customClientFields.map(field=>`<th>${esc(field)}</th>`).join('')}</tr></thead><tbody>${rows.map(c=>`<tr class="client-row" data-client="${c.id}"><td>${clientCell(c)}</td><td>${esc(c.tin)}</td><td>${esc(c.tax)}</td><td>${badge(c.status)}</td><td>${esc(c.start)}</td><td>${c.forms.map(esc).join(', ')}${c.inheritedFrom?`<small style="display:block">Carried from ${c.inheritedFrom}</small>`:''}${c.reviewReason?`<small style="display:block;color:#956000">Review required: ${esc(c.reviewReason)}</small>`:''}</td>${customClientFields.map(field=>`<td>${esc(c.customFields?.[field]||'—')}</td>`).join('')}</tr>`).join('')||'<tr><td colspan="${6+customClientFields.length}" class="empty">No matching clients.</td></tr>'}</tbody></table></div><div class="summary-line">Sample identities and placeholder TINs · Client requirements generate period-specific obligations.</div></div>`}
function tracker(){let obs=obligations().filter(o=>(o.c.name+' '+o.f.id).toLowerCase().includes(query.toLowerCase())&&(filter==='filed'?!!o.filing:filter==='overdue'?!o.filing&&o.due<today:!o.filing)&&(periodFilter==='all'||o.p===periodFilter)).sort((a,b)=>a.due.localeCompare(b.due)||a.c.name.localeCompare(b.c.name)||a.f.id.localeCompare(b.f.id));const totalPages=Math.max(1,Math.ceil(obs.length/pageSize));trackerPage=Math.min(trackerPage,totalPages);const start=(trackerPage-1)*pageSize;const visible=obs.slice(start,start+pageSize);return heading('Compliance tracker','Track each client, form, and filing period. Record a submission to update progress.')+`<div class="panel"><div class="toolbar"><div class="search-wrap"><input id="search" placeholder="Search client or form…" aria-label="Search obligations" value="${esc(query)}"><button type="button" class="search-clear" id="clear-search">×</button></div><select id="filter" aria-label="Filing status">${[['unfiled','For filing'],['filed','Filed'],['overdue','Overdue']].map(([v,t])=>`<option value="${v}" ${v===filter?'selected':''}>${t}</option>`).join('')}</select><select id="period-filter" aria-label="Covered period">${['all','Q1','Q2','Q3','Q4','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Annual'].map(p=>`<option value="${p}" ${p===periodFilter?'selected':''}>${p==='all'?'All periods':p}</option>`).join('')}</select></div><div class="table-scroll"><table><thead><tr><th>Client</th><th>Form / period</th><th>Due date</th><th>Filing status</th><th>Client annual status</th></tr></thead><tbody>${visible.map(o=>`<tr class="tracker-row" data-file="${o.key}" role="button" tabindex="0"><td>${clientCell(o.c)}</td><td><strong>${o.f.id}</strong><br><span class="period">${esc(filingPeriodLabel(o.f,o.p,year))}</span></td><td style="white-space:nowrap">${o.due}</td><td>${o.filing?badge('Complete')+'<br><span class="period">'+esc(o.filing.date)+'</span>':badge(filingStatus(o))+(o.due<today?'<br><span class="period">Overdue</span>':'')}</td><td>${badge(status(o.c,obligations()))}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">No obligations match these filters.</td></tr>'}</tbody></table></div><div class="pagination"><span>Showing ${obs.length?start+1:0}–${Math.min(start+pageSize,obs.length)} of ${obs.length} records</span><div class="controls"><button class="btn" id="previous-page" ${trackerPage===1?'disabled':''}>Previous</button><span>Page ${trackerPage} of ${totalPages}</span><button class="btn" id="next-page" ${trackerPage===totalPages?'disabled':''}>Next</button></div></div><div class="summary-line">${obs.length} obligations · Non-applicable forms are excluded · Deadline dates are based on the workbook.</div></div>`}
function deadlines(){return heading('Deadline reference','A shared reference for forms, covered periods, and filing schedules.')+`<div class="panel"><div class="panel-head"><div><h2>Filing schedules</h2><p>Supported forms · Calendar-year assumption</p></div></div><div class="table-scroll"><table><thead><tr><th>BIR form</th><th>Description</th><th>Period covered</th><th>Frequency</th><th>Due dates · ${year}</th></tr></thead><tbody>${forms.map(f=>`<tr><td><strong>${f.id}</strong></td><td>${f.name}</td><td>${f.periods.join(', ')}</td><td>${f.frequency||(f.periods[0]==='Annual'?'Annual':f.id==='1601-C'?'Monthly':'Quarterly')}</td><td>${f.periods.map(p=>`${p}: ${due(f,p,year)}`).join('<br>')}</td></tr>`).join('')}</tbody></table></div></div>${calendarRulesPanel()}`}
function bind(){document.querySelector('#previous-page')?.addEventListener('click',()=>{trackerPage--;render()});document.querySelector('#next-page')?.addEventListener('click',()=>{trackerPage++;render()});document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));document.querySelector('#add-client')?.addEventListener('click',()=>editClient());document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>editClient(+b.dataset.edit));document.querySelectorAll('[data-file]').forEach(b=>b.onclick=()=>fileModal(b.dataset.file));document.querySelectorAll('.tracker-row').forEach(r=>r.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();fileModal(r.dataset.file)}});const s=document.querySelector('#search');document.querySelector('#clear-search')?.addEventListener('click',()=>{query='';render()});if(s)s.oninput=e=>{const pos=e.target.selectionStart;query=e.target.value;trackerPage=1;render();const n=document.querySelector('#search');n.focus();n.setSelectionRange(pos,pos)};document.querySelector('#filter')?.addEventListener('change',e=>{filter=e.target.value;trackerPage=1;render()});document.querySelector('#period-filter')?.addEventListener('change',e=>{periodFilter=e.target.value;trackerPage=1;render()});document.querySelector('#client-tax-filter')?.addEventListener('change',e=>{clientTaxFilter=e.target.value;render()});document.querySelector('#client-business-filter')?.addEventListener('change',e=>{clientBusinessFilter=e.target.value;render()});document.querySelector('#client-sort')?.addEventListener('change',e=>{clientSort=e.target.value;render()})}
function go(p){setAuthState(true);trackerPage=1;page=p;query='';filter='unfiled';periodFilter='all';clientTaxFilter='all';clientBusinessFilter='all';clientSort='az';render()}document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>go(b.dataset.page));
function editClient(id){
  const original=state.clients.find(c=>c.id===id);
  const selectedYear=year;
  const c=clientForYear(original||{name:'',tin:'',type:'Sole proprietorship',status:'Active',tax:'NVAT',start:today,forms:[]},selectedYear);
  const m=workspaceDialog();
  const select=(name,label,options,value)=>`<div${name==='income'?' style="grid-column:1 / -1"':''}><label>${label}</label><select name="${name}">${options.map(([v,text])=>`<option value="${esc(v)}" ${value===v?'selected':''}>${esc(text)}</option>`).join('')}</select></div>`;
  const yesNo=[['unknown','Not confirmed'],['yes','Yes'],['no','No']];
  const fields=[['type','Business type',['Sole proprietorship','Partnership','Corporation']],['tax','Tax type',['VAT','NVAT']],['status','Client status',['Active','Inactive','For closure','Closed']]];
  const filed=Object.keys(state.filings).filter(k=>k.startsWith(`${id}:${selectedYear}:`)).map(k=>({code:k.split(':')[2],period:k.split(':')[3]}));
  const locked=new Set(filed.map(f=>f.code));
  let periods=JSON.parse(JSON.stringify(c.periods||{}));
  m.innerHTML=`<h2>${id?'Edit client':'Add a client'}</h2><p>Filing requirements for <strong>${selectedYear}</strong>. Other years keep their existing requirements.</p>
    <form id="client-form"><label>Client name</label><input name="name" required value="${esc(c.name)}">
    <div class="form-grid"><div><label>TIN</label><input name="tin" required placeholder="000-000-000-000" value="${esc(c.tin)}"></div>
    <div><label>Start of filing</label><input name="start" type="date" required value="${esc(c.start)}"></div>
    ${fields.map(([n,l,opts])=>select(n,l,opts.map(v=>[v,v]),c[n])).join('')}</div>
    <!-- Keep registration values and allocation handlers available for a later release. -->
    <div id="client-registration-fields" style="display:none" aria-hidden="true">
    <h3>Registration for ${selectedYear}</h3><p>Confirm these choices against the client's registration and elections for this year.</p>
    <div class="form-grid">
    ${select('calendar','Accounting year',[['unknown','Not confirmed'],['calendar','Calendar year'],['fiscal','Fiscal year — manual review']],c.calendar||'unknown')}
    ${select('income','Income tax treatment',[
      ['unknown','Not confirmed / special treatment'],
      ['itemized','Individual: pure business, graduated / itemized'],
      ['osd','Individual: pure business, graduated / OSD'],
      ['eight','Individual: pure business, valid 8% election confirmed'],
      ['mixed','Individual: mixed income, graduated'],
      ['mixedEight','Individual: mixed income, valid 8% election confirmed'],
      ['regular','Corporation / ordinary partnership: regular rate']
    ],c.income||'unknown')}
    ${select('percentage','Subject to Section 116 percentage tax?',yesNo,c.percentage||'unknown')}
    ${select('compensation','Compensation withholding registered?',yesNo,c.compensation||'unknown')}
    ${select('expanded','Expanded withholding registered?',yesNo,c.expanded||'unknown')}
    </div><button type="button" class="btn secondary" id="suggest-client-forms">Review suggested forms</button>
    <div id="allocation-review" aria-live="polite"></div>
    </div>
    <label>Required forms for ${selectedYear}</label>
    <button type="button" class="form-picker-btn" id="select-client-forms" aria-haspopup="dialog">Select required forms</button>
    <div class="selected-pills" id="client-form-pills" aria-live="polite"></div>
    <div hidden><div class="client-form-values">${forms.map(f=>`<label><input type="checkbox" name="forms" value="${esc(f.id)}" ${c.forms.includes(f.id)||locked.has(f.id)?'checked':''} ${locked.has(f.id)?'disabled':''}>${esc(f.id)}${locked.has(f.id)?' (filed)':''}</label>`).join('')}</div></div>
    <p>Recurring requirements carry forward automatically into unconfigured future years. Annual elections and exceptions need review.</p>
    <label>Remarks</label><input name="remarks" value="${esc(c.remarks||'')}">
    ${customClientFields.map(field=>`<label>${esc(field)}</label><input class="custom-client-field" data-field="${esc(field)}" maxlength="1000" value="${esc(c.customFields?.[field]||'')}">`).join('')}
    <p>Client status is informational; closure does not automatically cancel obligations.</p>
    <div class="modal-actions"><button type="button" class="btn" id="cancel">Cancel</button><button class="btn primary">Save client</button></div></form>`;
  m.showModal();
  const form=m.querySelector('#client-form');
  const pickerButton=form.querySelector('#select-client-forms');
  const selectedInputs=()=>[...form.querySelectorAll('[name="forms"]')];
  const updatePills=()=>{
    const pills=form.querySelector('#client-form-pills');
    pills.replaceChildren();
    for(const input of selectedInputs().filter(el=>el.checked)){
      const pill=document.createElement('span');
      pill.className='form-pill';
      pill.textContent=input.value;
      if(locked.has(input.value)){
        pill.append(' · Filed');
        pill.title='This form has recorded filings and must remain assigned.';
      }else{
        const remove=document.createElement('button');
        remove.type='button';remove.textContent='×';
        remove.setAttribute('aria-label','Remove '+input.value);
        remove.onclick=()=>{input.checked=false;updatePills();pickerButton.focus();};
        pill.append(remove);
      }
      pills.append(pill);
    }
    if(!pills.children.length)pills.textContent='No forms selected.';
  };
  updatePills();
  pickerButton.onclick=()=>{
    const picker=document.createElement('dialog');
    picker.className='client-forms-dialog';
    picker.setAttribute('aria-labelledby','client-forms-title');
    picker.innerHTML=`<div class="picker-head"><strong id="client-forms-title">Select required forms</strong><button type="button" class="picker-close" aria-label="Cancel form selection">×</button></div>
      <p>Choose forms for ${selectedYear}. Filed forms remain selected.</p>
      <div class="picker-options">${selectedInputs().map(input=>`<label><input type="checkbox" value="${esc(input.value)}" ${input.checked?'checked':''} ${locked.has(input.value)?'disabled':''}>${esc(input.value)}${locked.has(input.value)?' · Filed':''}</label>`).join('')}</div>
      <div class="modal-actions"><button type="button" class="btn picker-cancel">Cancel</button><button type="button" class="btn primary picker-done">Done</button></div>`;
    document.body.append(picker);
    const dismiss=()=>{picker.close();picker.remove();m.removeEventListener('close',parentClosed);if(m.open)pickerButton.focus();};
    const parentClosed=()=>dismiss();
    picker.addEventListener('cancel',e=>{e.preventDefault();dismiss();});
    m.addEventListener('close',parentClosed,{once:true});
    picker.addEventListener('close',()=>{
      m.removeEventListener('close',parentClosed);
      picker.remove();
      if(m.open)pickerButton.focus();
    },{once:true});
    picker.querySelector('.picker-close').onclick=dismiss;
    picker.querySelector('.picker-cancel').onclick=dismiss;
    picker.querySelector('.picker-done').onclick=()=>{
      const checked=new Set([...picker.querySelectorAll('input:checked')].map(el=>el.value));
      selectedInputs().forEach(input=>{input.checked=locked.has(input.value)||checked.has(input.value);});
      updatePills();dismiss();
    };
    picker.showModal();
  };
  const tin=form.elements.tin;
  tin.inputMode='numeric';tin.maxLength=15;
  tin.addEventListener('input',()=>{const digits=tin.value.replace(/\D/g,'').slice(0,12);tin.value=digits.replace(/(\d{3})(?=\d)/g,'$1-')});
  const readProfile=()=>{
    const d=new FormData(form);
    return Object.fromEntries(['type','tax','calendar','income','percentage','compensation','expanded'].map(n=>[n,String(d.get(n))]));
  };
  const review=m.querySelector('#allocation-review');
  form.querySelectorAll('select').forEach(el=>el.addEventListener('change',()=>{review.innerHTML='';}));
  m.querySelector('#suggest-client-forms').onclick=()=>{
    const profile=readProfile();
    const result=TaxGuardAllocation.suggest(profile,selectedYear,forms);
    review.innerHTML=`<div class="banner"><strong>Suggested additions for ${selectedYear}</strong><ul>${result.suggestions.map(s=>`<li><b>${esc(s.code)}</b> — ${esc(s.reason)}</li>`).join('')}</ul>${result.warnings.map(w=>`<p>${esc(w)}</p>`).join('')}${result.suggestions.length?'<button type="button" class="btn primary" id="apply-client-forms">Apply suggested additions</button>':''}</div>`;
    const apply=review.querySelector('#apply-client-forms');
    if(apply)apply.onclick=()=>{
      const codes=new Set(result.suggestions.map(s=>s.code));
      form.querySelectorAll('[name="forms"]').forEach(el=>{if(codes.has(el.value))el.checked=true;});
      updatePills();
      if(codes.has('0619-E')){
        periods['0619-E']=[...new Set([...TaxGuardAllocation.expandedMonths,...filed.filter(f=>f.code==='0619-E').map(f=>f.period)])];
      }
      review.innerHTML='<p>Suggestions applied to this draft. Review the checked forms, then save the client.</p>';
    };
  };
  m.querySelector('#cancel').onclick=()=>closeModal(m);
  form.onsubmit=e=>{
    e.preventDefault();
    const d=new FormData(form),profile=readProfile();
    const selected=[...new Set([...d.getAll('forms'),...locked])];
    const name=String(d.get('name')).trim(),tinValue=String(d.get('tin')).trim();
    if(!name)return;
    if(!/^\d{3}-\d{3}-\d{3}-\d{3}$/.test(tinValue)){notify('TIN must use 000-000-000-000.');return;}
    if(state.clients.some(c=>c.id!==id&&c.tin===tinValue)){notify('This TIN is already registered.');return;}
    profile.forms=selected;
    profile.periods=Object.fromEntries(Object.entries(periods).filter(([code])=>selected.includes(code)));
    const value={...(original||{type:profile.type,tax:profile.tax,forms:[]}),id:id||Date.now(),name,tin:tinValue,
      start:String(d.get('start')),status:String(d.get('status')),remarks:String(d.get('remarks')),
      customFields:{...c.customFields,...Object.fromEntries([...form.querySelectorAll('.custom-client-field')].map(input=>[input.dataset.field,input.value]))},
      yearProfiles:{...original?.yearProfiles,[selectedYear]:profile}};
    const previousClients=state.clients.slice();
    if(id)state.clients[state.clients.findIndex(c=>c.id===id)]=value;else state.clients.push(value);
    try{save();}catch{if(!database)state.clients=previousClients;return;}
    closeModal(m,()=>{
      const parent=document.querySelector('#modal');
      if(parent.open&&Number(parent.dataset.clientId)===id)clientModal(id,true);
    });render();notify(`Client saved. Requirements updated for ${selectedYear}.`);
  };
}
function confirmFiling(k,o,draft,parent,returnClientId){
  if(document.querySelector('#filing-confirmation'))return;
  const confirmation=document.createElement('dialog');
  confirmation.id='filing-confirmation';
  confirmation.setAttribute('aria-labelledby','filing-confirmation-title');
  confirmation.innerHTML=`<h2 id="filing-confirmation-title">Confirm filing</h2><p>Review the details before saving.</p>
    <dl class="filing-confirmation-details">${[
      ['Client',o.c.name],['Form',o.f.id],['Period',filingPeriodLabel(o.f,o.p,Number(k.split(':')[1]))],
      ['Filing date',draft.date],['Confirmation / reference',draft.reference],['Remarks',draft.remarks||'—']
    ].map(([label,value])=>`<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`).join('')}</dl>
    <div class="modal-actions"><button type="button" class="btn" id="back-to-filing">Back to edit</button><button type="button" class="btn primary" id="confirm-save-filing">Confirm &amp; Save</button></div>`;
  document.body.append(confirmation);
  const parentClosed=()=>confirmation.close();
  parent.addEventListener('close',parentClosed,{once:true});
  confirmation.addEventListener('close',()=>{
    parent.removeEventListener('close',parentClosed);confirmation.remove();
  },{once:true});
  confirmation.querySelector('#back-to-filing').onclick=()=>confirmation.close();
  confirmation.querySelector('#confirm-save-filing').onclick=e=>{
    e.target.disabled=true;
    const previous=state.filings[k];
    state.filings[k]=draft;
    try{save();}catch{
      if(!database){if(previous)state.filings[k]=previous;else delete state.filings[k];}
      e.target.disabled=false;return;
    }
    confirmation.close();
    closeModal(parent,()=>{
      if(returnClientId){
        const selector=document.querySelector('#modal');
        if(selector.querySelector('#choose-client-filing'))selector.close();
        clientModal(returnClientId,true);
      }
    });
    render();notify('Filing saved. Progress updated.');
  };
  confirmation.showModal();
}
function chooseClientFiling(id){
  const pending=obligations().filter(o=>o.c.id===id&&!o.filing&&Number(o.due.slice(0,4))<=year).sort((a,b)=>a.due.localeCompare(b.due));
  if(!pending.length){notify('No unfiled obligations for this year.');return;}
  const m=workspaceDialog();
  m.innerHTML=`<h2>Record filing</h2><p>${esc(pending[0].c.name)} · ${year}</p>
    <form id="choose-client-filing"><label for="client-filing-period">Form and period</label>
    <select id="client-filing-period" required>${pending.map(o=>`<option value="${esc(o.key)}">${esc(o.f.id)} · ${esc(filingPeriodLabel(o.f,o.p,year))} · Due ${esc(o.due)}</option>`).join('')}</select>
    <div class="modal-actions"><button type="button" class="btn" id="back-to-client">Back</button><button class="btn primary">Continue</button></div></form>`;
  m.querySelector('#back-to-client').onclick=()=>dismissWorkspaceDialog(m);
  m.querySelector('#choose-client-filing').onsubmit=e=>{
    e.preventDefault();fileModal(m.querySelector('#client-filing-period').value,id);
  };
  m.showModal();
}
function filingAlertHTML(o, fileDateStr, isComplete){
  if(!o || !o.due) return '';
  const dueStr = o.due;
  const dDue = new Date(dueStr + 'T00:00:00');
  const dFile = new Date((fileDateStr || today) + 'T00:00:00');
  const diffDays = Math.round((dDue - dFile) / 86400000);

  if (diffDays < 0) {
    const daysLate = Math.abs(diffDays);
    return `<div class="filing-modal-alert alert-overdue"><span class="alert-icon">🚨</span><div><strong>Overdue Warning</strong><p>${isComplete ? 'Filing was recorded' : 'This obligation is'} <b>${daysLate === 1 ? '1 day' : daysLate + ' days'}</b> past the statutory due date of <b>${esc(dueStr)}</b>. Late submissions are subject to BIR penalties, surcharges, and interest.</p></div></div>`;
  } else if (diffDays <= 30) {
    const timeLabel = diffDays === 0 ? 'today' : diffDays === 1 ? 'tomorrow' : `in ${diffDays} days`;
    return `<div class="filing-modal-alert alert-due-soon"><span class="alert-icon">⚠️</span><div><strong>Upcoming Deadline Reminder</strong><p>This filing is due <b>${timeLabel}</b> on <b>${esc(dueStr)}</b> (within 1 month). Ensure confirmation numbers and required return forms are verified.</p></div></div>`;
  } else if (isComplete) {
    return `<div class="filing-modal-alert alert-success"><span class="alert-icon">✓</span><div><strong>Filed On Time</strong><p>Filing recorded on ${esc(fileDateStr)}, ahead of the ${esc(dueStr)} deadline.</p></div></div>`;
  } else {
    const isPeriodActive = o.end && (fileDateStr || today) < o.end;
    const periodNote = isPeriodActive ? `The covered period (<b>${esc(o.p)} ${year}</b>) does not close until <b>${esc(o.end)}</b>. ` : '';
    return `<div class="filing-modal-alert alert-early"><span class="alert-icon">⏳</span><div><strong>Early Filing Reminder</strong><p>${periodNote}It is currently early to file this return—the statutory deadline is still <b>${diffDays} days away</b> on <b>${esc(dueStr)}</b>. Ensure all transactions, withholding, and period ledgers are complete before submitting in advance.</p></div></div>`;
  }
}
function fileModal(k,returnClientId){let o=obligations().find(o=>o.key===k),m=workspaceDialog();if(!o)return;const initialDate=o.filing?.date||today;const dueYear=Number(o.due.slice(0,4)),nextYear=dueYear>year;m.innerHTML=`<h2>${o.filing?'Filing details':'Record filing'}</h2><p>${esc(o.c.name)}<br><strong>${o.f.id} · ${esc(filingPeriodLabel(o.f,o.p,year))}</strong> · Due ${o.due}</p>${nextYear?'<div class="filing-modal-alert alert-due-soon"><span class="alert-icon">⚠️</span><div><strong>Next-year due date</strong><p>This obligation belongs to the selected '+year+' filing year, but its due date falls in '+dueYear+'. It is shown for reference only and should be filed from the '+dueYear+' tax year.</p></div></div>':''}<div id="filing-alert-container">${filingAlertHTML(o,initialDate,!!o.filing)}</div><form id="filing-form"><label>Filing date</label><input type="date" name="date" required max="${today}" value="${initialDate}"><label>Confirmation / reference number</label><input name="reference" required value="${esc(o.filing?.reference||'')}" placeholder="Enter submission reference"><label>Remarks</label><input name="remarks" value="${esc(o.filing?.remarks||'')}" placeholder="Optional notes"><div class="modal-actions"><button type="button" class="btn" id="cancel">Cancel</button><button class="btn primary" ${nextYear?'disabled':''}>Save filing</button></div></form>`;m.showModal();const dateInput=m.querySelector('#filing-form input[name="date"]');const alertContainer=m.querySelector('#filing-alert-container');if(dateInput&&alertContainer){dateInput.addEventListener('input',()=>{alertContainer.innerHTML=filingAlertHTML(o,dateInput.value,!!o.filing)})};m.querySelector('#cancel').onclick=()=>closeModal(m);m.querySelector('#filing-form').onsubmit=e=>{e.preventDefault();if(nextYear){notify('Switch to tax year '+dueYear+' before recording this filing.');return;}confirmFiling(k,o,Object.fromEntries(new FormData(e.target)),m,returnClientId)}}
render();

const basicDeadlineModal=deadlineModal;
deadlineModal=function(id){const f=forms.find(x=>x.id===id),m=document.querySelector('#modal');if(!f)return; m.innerHTML=`<h2>${esc(f.id)}</h2><p>${esc(f.name)}</p><form id="schedule-form"><div class="schedule-edit-list">${f.periods.map((p,i)=>`<div class="schedule-edit-row"><input name="period" value="${esc(p)}" aria-label="Period"><input type="date" name="date" value="${esc(f.dates[i]||due(f,p,year))}" aria-label="Due date"></div>`).join('')}</div><div class="modal-actions"><button type="button" class="btn" id="cancel">Cancel</button><button class="btn primary">Save schedule</button></div></form>`;m.showModal();m.querySelector('#cancel').onclick=()=>closeModal(m);m.querySelector('#schedule-form').onsubmit=e=>{e.preventDefault();const fd=new FormData(e.target),periods=fd.getAll('period'),dates=fd.getAll('date');f.periods=periods;f.dates=dates;saveForms();closeModal(m);render();notify('Schedule updated.')}};
deadlineModal=function(id,reuse=false){
  const f=forms.find(x=>x.id===id);if(!f)return;
  const m=workspaceDialog(reuse);
  m.innerHTML=`<h2>${esc(f.id)}</h2><p>${esc(f.name)}</p><div class="schedule-edit-list">${f.periods.map(p=>`<div class="schedule-edit-row"><span class="schedule-period">${esc(p)}</span><span class="schedule-date">${esc(due(f,p,year))}</span></div>`).join('')}</div><div class="modal-actions"><button type="button" class="btn" id="cancel">Close</button><button type="button" class="btn primary" id="edit-schedule">Edit schedule</button></div>`;
  m.showModal();
  m.querySelector('#cancel').onclick=()=>closeModal(m);
  m.querySelector('#edit-schedule').onclick=()=>{
    const editor=workspaceDialog();
    editor.innerHTML=`<h2>Edit ${esc(f.id)} schedule</h2><form id="schedule-form"><div class="schedule-edit-list">${f.periods.map(p=>`<div class="schedule-edit-row"><input name="period" value="${esc(p)}"><input type="date" name="date" value="${esc(due(f,p,year))}"></div>`).join('')}</div><div class="modal-actions"><button type="button" class="btn" id="cancel-edit">Cancel</button><button class="btn primary">Save schedule</button></div></form>`;
    editor.querySelector('#cancel-edit').onclick=()=>dismissWorkspaceDialog(editor);
    editor.querySelector('#schedule-form').onsubmit=e=>{
      e.preventDefault();
      const d=new FormData(e.target),periods=d.getAll('period').map(p=>p.trim()),dates=d.getAll('date');
      if(periods.some((p,i)=>p!==f.periods[i])){notify('Period names cannot change once schedules are used.');return;}
      f.overrides=f.overrides||{};f.overrides[year]=Object.fromEntries(periods.map((p,i)=>[p,dates[i]]));
      try{saveForms();}catch{return;}
      closeModal(editor,()=>deadlineModal(id,true));render();notify('Schedule updated.');
    };
    editor.showModal();
  };
};

// Deadline management controls.
const originalDeadlineCards=deadlines;
deadlines=function(){return heading('Deadline reference','A shared reference for forms, covered periods, and filing schedules.','<button class="btn primary" id="add-deadline">＋ Add deadline</button>')+`<div class="deadline-grid">${forms.map(f=>`<button class="deadline-card" data-deadline="${f.id}"><div class="card-code">${f.id}</div><h2>${esc(f.name)}</h2><div class="card-meta"><span>${f.frequency||(f.periods[0]==='Annual'?'Annual':f.id==='1601-C'?'Monthly':'Quarterly')}</span><span>${f.periods.length} periods</span></div><div class="card-periods">${f.periods.slice(0,5).join(' · ')}${f.periods.length>5?' · …':''}</div><span class="card-link">View schedule →</span><span class="card-edit" data-edit-deadline="${f.id}">Edit</span></button>`).join('')}</div>`};
const priorBind=bind;bind=function(){priorBind();document.querySelector('#add-deadline')?.addEventListener('click',()=>deadlineEditModal());document.querySelectorAll('[data-edit-deadline]').forEach(b=>b.onclick=e=>{e.stopPropagation();deadlineEditModal(b.dataset.editDeadline)})};
function deadlineEditModal(id){const f=forms.find(x=>x.id===id)||{id:'',name:'',periods:['Q1'],dates:['04-30']},m=document.querySelector('#modal');m.innerHTML=`<h2>${id?'Edit deadline':'Add deadline'}</h2><form id="deadline-form"><label>Form code</label><input name="id" required value="${esc(f.id)}" ${id?'readonly':''}><label>Description</label><input name="name" required value="${esc(f.name)}"><label>Covered periods (comma separated)</label><input name="periods" required value="${esc(f.periods.join(', '))}"><label>Due dates (comma separated)</label><input name="dates" required value="${esc(f.dates.join(', '))}"><div class="modal-actions"><button type="button" class="btn" id="cancel">Cancel</button><button class="btn primary">Save deadline</button></div></form>`;m.showModal();m.querySelector('#cancel').onclick=()=>closeModal(m);m.querySelector('#deadline-form').onsubmit=e=>{e.preventDefault();const d=new FormData(e.target),v={id:String(d.get('id')).trim(),name:String(d.get('name')).trim(),periods:String(d.get('periods')).split(',').map(x=>x.trim()),dates:String(d.get('dates')).split(',').map(x=>x.trim())},i=forms.findIndex(x=>x.id===id);if(i<0)forms.push(v);else forms[i]=v;saveForms();closeModal(m);render();notify('Deadline saved.')}}
render();

// Card-based deadline reference with detail modal.
const originalDeadlines=deadlines;
deadlines=function(){return heading('Deadline reference','A shared reference for forms, covered periods, and filing schedules.')+`<div class="deadline-grid">${forms.map(f=>`<button class="deadline-card" data-deadline="${f.id}"><div class="card-code">${f.id}</div><h2>${esc(f.name)}</h2><div class="card-meta"><span>${f.frequency||(f.periods[0]==='Annual'?'Annual':f.id==='1601-C'?'Monthly':'Quarterly')}</span><span>${f.periods.length} periods</span></div><div class="card-periods">${f.periods.slice(0,5).join(' · ')}${f.periods.length>5?' · …':''}</div><span class="card-link">View schedule →</span></button>`).join('')}</div>`};
const originalBind=bind;
bind=function(){originalBind();document.querySelectorAll('.client-row').forEach(r=>r.onclick=e=>{clientModal(+r.dataset.client)});document.querySelectorAll('.recent-client-row').forEach(r=>r.onclick=()=>{query=state.clients.find(c=>c.id===+r.dataset.client)?.name||'';page='clients';render();clientModal(+r.dataset.client)});document.querySelectorAll('[data-deadline]').forEach(b=>b.onclick=()=>deadlineModal(b.dataset.deadline));const form=document.querySelector('#client-form');if(form&&form.querySelector){const checks=form.querySelector('.checks');if(checks){const labels=[...checks.querySelectorAll('label')];const button=document.createElement('button');button.type='button';button.className='form-picker-btn';button.textContent='Select required forms';const pills=document.createElement('div');pills.className='selected-pills';const popup=document.createElement('div');popup.className='form-picker-popup';popup.innerHTML='<div class="picker-head"><strong>Select required forms</strong><button type="button" class="picker-close">×</button></div><div class="picker-options"></div><button type="button" class="btn primary picker-done">Done</button>';const options=popup.querySelector('.picker-options');labels.forEach(label=>options.appendChild(label.cloneNode(true)));const update=()=>{pills.innerHTML='';labels.forEach((label,i)=>{if(label.querySelector('input').checked){const pill=document.createElement('span');pill.className='form-pill';pill.textContent=label.textContent.trim();const x=document.createElement('button');x.type='button';x.textContent='×';x.onclick=()=>{label.querySelector('input').checked=false;options.querySelectorAll('input')[i].checked=false;update()};pill.appendChild(x);pills.appendChild(pill)}})};button.onclick=()=>popup.classList.add('open');popup.querySelector('.picker-close').onclick=()=>popup.classList.remove('open');popup.querySelector('.picker-done').onclick=()=>{options.querySelectorAll('input').forEach((input,i)=>labels[i].querySelector('input').checked=input.checked);update();popup.classList.remove('open')};checks.style.display='none';checks.before(button,pills);const mDialog=document.querySelector('#modal');(mDialog?.open?mDialog:document.body).appendChild(popup);update()}const tinInput=form.querySelector('[name="tin"]');if(tinInput){tinInput.inputMode='numeric';tinInput.maxLength=15;tinInput.oninput=()=>{const digits=tinInput.value.replace(/\D/g,'').slice(0,12);tinInput.value=digits.replace(/(\d{3})(?=\d)/g,'$1-')}}const previous=form.onsubmit;form.onsubmit=function(e){const d=new FormData(form),tin=String(d.get('tin')||'').trim(),start=String(d.get('start')||''),selected=d.getAll('forms');let error='';if(!/^\d{3}-\d{3}-\d{3}-\d{3}$/.test(tin))error='TIN must use the format 000-000-000-000.';else if(state.clients.some(c=>c.tin===tin&&c.name!==d.get('name')))error='This TIN is already registered.';else if(!selected.length)error='Select at least one required form.';else if(start>today)error='Start of filing cannot be after today.';if(error){e.preventDefault();notify(error);return false}return previous.call(this,e)}}};
function deadlineModal(id){let f=forms.find(x=>x.id===id),m=document.querySelector('#modal');m.innerHTML=`<h2>${f.id}</h2><p>${esc(f.name)}</p><div class="modal-schedule">${f.periods.map(p=>`<div><strong>${p}</strong><span>${due(f,p,year)}</span></div>`).join('')}</div><div class="modal-actions"><button class="btn primary" id="close-deadline">Close</button></div>`;m.showModal();document.querySelector('#close-deadline').onclick=()=>closeModal(m)}
render();

function clientTrendChart(){
  const starts=state.clients.map(c=>Number(c.start.slice(0,4))).filter(y=>Number.isFinite(y)&&y>0&&y<=year);
  const first=Math.min(year-4,...starts);
  const points=Array.from({length:year-first+1},(_,i)=>{const y=first+i;return {year:y,count:starts.filter(start=>start<=y).length}});
  const max=Math.max(4,...points.map(p=>p.count)),step=Math.max(1,Math.ceil(max/4)),top=step*4;
  const x=i=>52+i*876/(points.length-1),y=n=>204-n*164/top;
  const coords=points.map((p,i)=>`${x(i)},${y(p.count)}`).join(' ');
  const summary=points.map(p=>`${p.year}: ${p.count} clients`).join('; ');
  return `<div class="panel client-trend"><div class="panel-head"><div><h2>Clients over time</h2><p>Cumulative client count by Start of Filing year · Through ${year}</p></div><span class="subtle">${points.at(-1).count} CLIENTS</span></div><div class="panel-body"><svg viewBox="0 0 960 248" role="img" aria-labelledby="client-trend-title client-trend-desc"><title id="client-trend-title">Clients over time</title><desc id="client-trend-desc">${summary}. Includes all client statuses.</desc>${Array.from({length:5},(_,i)=>{let n=i*step;return `<line x1="52" y1="${y(n)}" x2="928" y2="${y(n)}" stroke="#e9eef4"/><text x="36" y="${y(n)+4}" text-anchor="end">${n}</text>`}).join('')}<polygon points="52,204 ${coords} 928,204" fill="#eef4fe"/><polyline points="${coords}" fill="none" stroke="#4b84e5" stroke-width="3" stroke-linejoin="round"/>${points.map((p,i)=>`<g><circle cx="${x(i)}" cy="${y(p.count)}" r="5" fill="#4b84e5" stroke="white" stroke-width="2"><title>${p.year}: ${p.count} clients</title></circle><text x="${x(i)}" y="${y(p.count)-13}" text-anchor="middle" class="trend-value">${p.count}</text>${i%Math.max(1,Math.ceil(points.length/10))===0||i===points.length-1?`<text x="${x(i)}" y="231" text-anchor="middle">${p.year}</text>`:''}</g>`).join('')}</svg><div class="subtle">Includes all client statuses. Counts reflect filing start dates, not account creation dates.</div></div></div>`;
}
function openPulloutDialog(id,parent){
  const client=state.clients.find(c=>c.id===id);
  if(!client||client.status==='Pulled out')return;
  const dialog=document.createElement('dialog');
  dialog.className='pullout-dialog';
  dialog.innerHTML=`<h2>Pull out ${esc(client.name)}?</h2><p>Set the last day of service. Earlier filings remain available, and obligations for periods ending after this date stop appearing.</p><form id="pullout-form"><label for="pullout-date">Last day of service</label><input id="pullout-date" name="date" type="date" min="${esc(client.start)}" max="${today}" value="${today}" required><div class="modal-actions"><button type="button" class="btn" id="cancel-pullout">Cancel</button><button class="btn primary">Confirm pullout</button></div></form>`;
  document.body.append(dialog);
  const dismiss=()=>{dialog.close();dialog.remove();};
  dialog.querySelector('#cancel-pullout').onclick=dismiss;
  dialog.querySelector('#pullout-form').onsubmit=e=>{
    e.preventDefault();
    const date=e.target.elements.date.value;
    if(date<client.start||date>today){notify('Choose a valid last day of service.');return;}
    const previous=state.clients.slice(),index=state.clients.findIndex(c=>c.id===id);
    state.clients[index]={...client,status:'Pulled out',pulledOutAt:date};
    try{save();}catch{if(!database)state.clients=previous;return;}
    dismiss();if(parent?.open)closeModal(parent);render();notify('Client moved to PULLOUT. Historical records are retained.');
  };
  dialog.showModal();
}
function clientModal(id,reuse=false){
  const original=state.clients.find(x=>x.id===id),c=original&&clientForYear(original),m=workspaceDialog(reuse);
  if(!c)return;
  m.dataset.clientId=id;

  const allObs=obligations();
  const clientObs=allObs.filter(o=>o.c.id===c.id);
  const total=clientObs.length;
  const filed=clientObs.filter(o=>o.filing).length;
  const overdue=clientObs.filter(o=>!o.filing&&o.due<today).length;
  const pending=total-filed-overdue;
  const pct=total?Math.round((filed/total)*100):0;
  const annualStatus=status(c,allObs);
  const reviewNotice=c.reviewReason?`<div class="banner"><strong>Year review required</strong><p>${esc(c.reviewReason)} Use Edit client to complete this year's requirements. Progress below covers only the currently assigned forms.</p></div>`:'';

  const clientForms=forms.filter(f=>c.forms.includes(f.id));
  const formBreakdown=clientForms.map(f=>{
    const fObs=clientObs.filter(o=>o.f.id===f.id);
    return {
      form:f,
      obs:fObs,
      filed:fObs.filter(o=>o.filing).length,
      total:fObs.length
    };
  });

  m.innerHTML=`<div class="client-modal-wrap">
    <div class="client-modal-header">
      <div>
        <h2>${esc(c.name)}</h2>
        <p class="client-modal-sub">${esc(c.type)} · ${esc(c.tax)}</p>
      </div>
      <div>${badge(c.status)}</div>
    </div>
    <div class="client-detail-grid">
      <div><small>TIN</small><strong>${esc(c.tin)}</strong></div>
      <div><small>Start of filing</small><strong>${esc(c.start)}</strong></div>
      <div><small>Required forms</small><strong>${c.forms.map(esc).join(', ')}</strong></div>
      <div><small>${year} Annual status</small><strong>${badge(annualStatus)}</strong></div>
    </div>
    <div class="client-progress-card">
      ${reviewNotice}
      <div class="client-progress-header">
        <div>
          <strong>${year} Compliance Progress</strong>
          <small class="subtle">${filed} of ${total} obligations filed</small>
        </div>
        <span class="client-progress-pct">${pct}%</span>
      </div>
      <div class="track" style="margin:8px 0 12px;height:7px;">
        <div class="fill" style="width:${pct}%;background:${pct===100?'#16866b':'#2766db'};"></div>
      </div>
      <div class="client-progress-stats">
        <span class="progress-pill filed">✓ ${filed} Filed</span>
        <span class="progress-pill pending">◷ ${pending} Pending</span>
        ${overdue>0?`<span class="progress-pill overdue">! ${overdue} Overdue</span>`:''}
      </div>
      ${total>0?`<div class="client-obligations-list">
        ${formBreakdown.map(fb=>`
          <div class="client-form-row">
            <div class="client-form-meta">
              <strong>${esc(fb.form.id)}</strong>
              <small>${esc(fb.form.name.split(' · ')[0])}</small>
              <span class="subtle form-ratio">${fb.filed}/${fb.total}</span>
            </div>
            <div class="period-badges-row">
              ${fb.obs.map(o=>{
                if(o.filing){
                  return `<span class="period-badge complete" title="Filed on ${esc(o.filing.date)}${o.filing.reference?' · Ref: '+esc(o.filing.reference):''}">✓ ${esc(o.p)}</span>`;
                }else if(o.due<today){
                  return `<span class="period-badge overdue" title="Overdue · Due ${esc(o.due)}">! ${esc(o.p)}</span>`;
                }else{
                  return `<span class="period-badge pending" title="Due ${esc(o.due)}">${esc(o.p)}</span>`;
                }
              }).join('')}
            </div>
          </div>
        `).join('')}
      </div>`:`<div class="empty" style="padding:15px 0;">No obligations scheduled for ${year}.</div>`}
    </div>
    <div class="modal-actions">
      <button class="btn" id="close-client">Close</button>
      <button class="btn" id="client-year-history">Year history</button>
      <button class="btn" id="client-documents">Documents</button>
      ${c.status==='Pulled out'?`<span class="subtle">Pulled out ${esc(c.pulledOutAt||'')}</span>`:`<button class="btn" id="pullout-client">Pull out</button>
      <button class="btn primary" id="record-client-filing" ${clientObs.some(o=>!o.filing)?'':'disabled'}>Record filing</button>
      <button class="btn primary" id="edit-client-detail">Edit client</button>`}
    </div>
  </div>`;
  m.showModal();
  m.querySelector('#close-client').onclick=()=>closeModal(m);
  m.querySelector('#client-documents').onclick=()=>openClientDocuments(id,m);
  m.querySelector('#pullout-client')?.addEventListener('click',()=>openPulloutDialog(id,m));
  m.querySelector('#client-year-history').onclick=()=>{
    if(document.querySelector('#year-history-dialog'))return;
    const history=document.createElement('dialog');
    history.id='year-history-dialog';
    history.setAttribute('aria-labelledby','year-history-title');
    const years=[...new Set([year,...Object.keys(original.yearProfiles||{}).map(Number),...Object.keys(state.filings).filter(k=>k.startsWith(id+':')).map(k=>Number(k.split(':')[1]))])].sort((a,b)=>b-a);
    const fiveYears=clientFiveYearSummary(id,year);
    history.innerHTML=`<h2 id="year-history-title">${esc(c.name)} — Year history</h2><p>Five-year compliance summary ending in ${year}. Select a year to view its details.</p>
      <div class="table-scroll"><table><thead><tr><th>Tax year</th><th>Filed</th><th>Obligations</th><th>Status</th></tr></thead><tbody>${fiveYears.map(row=>`<tr><td>${row.year}</td><td>${row.filed}</td><td>${row.total}</td><td>${badge(row.status)}</td></tr>`).join('')}</tbody></table></div><button type="button" class="btn secondary" id="export-five-year">Export five-year summary</button>
      <div class="selected-pills">${years.map(y=>`<button type="button" class="btn" data-history-year="${y}">${y}${original.yearProfiles?.[y]?' · Configured':''}</button>`).join('')}</div>
      <div class="modal-actions"><button type="button" class="btn" id="back-history">Back</button></div>`;
    const dismiss=()=>{
      history.close();history.remove();
      m.removeEventListener('close',dismiss);
      if(m.open)m.querySelector('#client-year-history')?.focus();
    };
    history.addEventListener('cancel',e=>{e.preventDefault();dismiss();});
    m.addEventListener('close',dismiss,{once:true});
    history.querySelector('#back-history').onclick=dismiss;
    history.querySelector('#export-five-year').onclick=()=>exportToExcel(`${c.name}-five-year-history`,['Tax year','Filed','Obligations','Status'],fiveYears.map(row=>[row.year,row.filed,row.total,row.status]));
    history.querySelectorAll('[data-history-year]').forEach(button=>button.onclick=()=>{
      const selected=Number(button.dataset.historyYear);
      dismiss();year=selected;render();clientModal(id,true);
      m.querySelector('#client-year-history')?.focus();
    });
    document.body.append(history);
    history.showModal();
  };
  m.querySelector('#record-client-filing')?.addEventListener('click',()=>chooseClientFiling(id));
  m.querySelector('#edit-client-detail')?.addEventListener('click',()=>editClient(id));
}
function settings(){const current=localStorage.getItem('taxguard-theme')||'blue';return heading('Settings','Personalize the TaxGuard workspace.','')+`<div class="panel settings-panel"><div class="panel-head"><div><h2>Color theme</h2><p>Choose the appearance used across the system.</p></div></div><div class="theme-options">${[['blue','Default blue'],['navy','Dark navy'],['green','Forest green'],['purple','Soft purple']].map(([v,l])=>`<button class="theme-option ${current===v?'active':''}" data-theme="${v}"><span class="theme-swatch ${v}"></span><span>${l}</span>${current===v?'<b>✓</b>':''}</button>`).join('')}</div></div>`}
document.addEventListener('click',e=>{const b=e.target.closest('.theme-option[data-theme]');if(!b)return;const chosen=b.dataset.theme,m=document.querySelector('#modal'),label=b.querySelector('span:last-of-type')?.textContent||chosen;m.innerHTML=`<h2>Apply color theme?</h2><p>Change the workspace appearance to <strong>${label}</strong>?</p><div class="modal-actions"><button class="btn" id="cancel-theme">Cancel</button><button class="btn primary" id="apply-theme">Apply theme</button></div>`;m.showModal();m.querySelector('#cancel-theme').onclick=()=>closeModal(m);m.querySelector('#apply-theme').onclick=()=>{localStorage.setItem('taxguard-theme',chosen);document.body.dataset.theme=chosen;document.documentElement.style.setProperty('--blue',{blue:'#2766db',navy:'#4776b8',green:'#16866b',purple:'#7656c7',orange:'#e67e22',red:'#d9534f'}[chosen]||'#2766db');closeModal(m);setTimeout(()=>{render();notify('Theme updated.')},180)}});document.body.dataset.theme=localStorage.getItem('taxguard-theme')||'blue';document.documentElement.style.setProperty('--blue',{blue:'#2766db',navy:'#4776b8',green:'#16866b',purple:'#7656c7',orange:'#e67e22',red:'#d9534f'}[localStorage.getItem('taxguard-theme')||'blue']||'#2766db');render();
document.addEventListener("click",e=>{const n=e.target.closest("nav button[data-page=\"settings\"]");if(n){e.preventDefault();go("settings")}});
settings=function(){const c=localStorage.getItem('taxguard-theme-color')||'#2766db';return heading('Settings','Personalize the TaxGuard workspace.','')+'<div class="panel settings-panel"><div class="panel-head"><div><h2>Color theme</h2><p>Choose a custom workspace accent color.</p></div></div><div class="color-picker-wrap"><button type="button" class="btn primary" id="choose-color">Choose color theme</button><strong>'+c.toUpperCase()+'</strong></div></div>'};
document.addEventListener('click',e=>{if(!e.target.closest('#choose-color'))return;const m=document.querySelector('#modal');m.innerHTML='<h2>Choose color</h2><p>Select a workspace accent color.</p><input class="color-wheel" id="theme-color" type="color" value="'+(localStorage.getItem('taxguard-theme-color')||'#2766db')+'"><div class="modal-actions"><button class="btn" id="cancel-color">Cancel</button><button class="btn primary" id="apply-color">Confirm theme</button></div>';m.showModal();m.querySelector('#cancel-color').onclick=()=>closeModal(m);m.querySelector('#apply-color').onclick=()=>{const color=m.querySelector('#theme-color').value;localStorage.setItem('taxguard-theme-color',color);document.documentElement.style.setProperty('--blue',color);closeModal(m);setTimeout(()=>{render();notify('Theme updated.')},180)}});
settings=function(){const current=localStorage.getItem('taxguard-theme-color')||'#2766db';return heading('Settings','Personalize the TaxGuard workspace.','')+`<div class="panel settings-panel"><div class="panel-head"><div><h2>Color theme</h2><p>Choose a custom workspace accent color.</p></div></div><div class="color-picker-wrap"><input class="color-wheel" id="theme-color" type="color" value="${current}"><div><strong id="color-value">${current.toUpperCase()}</strong><p>Click the color wheel to choose a color.</p></div></div></div>`}
settings=function(){const c=localStorage.getItem('taxguard-theme-color')||'#2766db';return heading('Settings','Personalize the TaxGuard workspace.','')+`<div class="panel settings-panel"><div class="panel-head"><div><h2>Color theme</h2><p>Choose a custom workspace accent color.</p></div></div><div class="color-picker-wrap"><button type="button" class="btn primary" id="choose-color">Choose color theme</button><strong>${c.toUpperCase()}</strong></div></div>`};render();
settings=function(){return heading('Settings','System preferences and configuration.','')+`<div class="panel settings-panel"><div class="panel-head"><div><h2>Settings</h2><p>Additional system settings will be available here.</p></div></div><div class="empty">No settings configured yet.</div></div>`};render();
settings=function(){const c=localStorage.getItem('taxguard-theme-color')||'#2766db';return heading('Settings','Personalize the TaxGuard workspace.','')+`<div class="panel settings-panel"><div class="panel-head"><div><h2>Color theme</h2><p>Choose a custom workspace accent color.</p></div></div><div class="color-picker-wrap"><button type="button" class="btn primary" id="choose-color">Choose color</button><strong>${c.toUpperCase()}</strong></div></div>`};render();
settings=function(){const current=document.body.dataset.theme||'blue';return heading('Settings','Personalize the TaxGuard workspace.','')+`<div class="settings-grid"><div class="panel settings-panel"><div class="panel-head"><div><h2>Color theme</h2><p>Choose a preset workspace accent color.</p></div></div><div class="theme-options">${[['blue','Blue'],['navy','Navy'],['green','Green'],['purple','Purple'],['orange','Orange'],['red','Red']].map(([v,l])=>`<button class="theme-option ${current===v?'active':''}" data-theme="${v}"><span class="theme-swatch ${v}"></span><span>${l}</span>${current===v?'<b>✓</b>':''}</button>`).join('')}</div></div></div>`};render();
document.addEventListener('input',e=>{if(e.target.id!=='legacy-theme-color')return;const color=e.target.value,m=document.querySelector('#modal');m.innerHTML=`<h2>Apply color theme?</h2><p>Use <strong>${color.toUpperCase()}</strong> as the workspace accent?</p><div class="modal-actions"><button class="btn" id="cancel-theme">Cancel</button><button class="btn primary" id="apply-theme">Apply theme</button></div>`;m.showModal();m.querySelector('#cancel-theme').onclick=()=>closeModal(m);m.querySelector('#apply-theme').onclick=()=>{localStorage.setItem('taxguard-theme-color',color);document.documentElement.style.setProperty('--blue',color);closeModal(m);notify('Theme updated.')}});
render();
document.addEventListener("click",e=>{const b=e.target.closest(".theme-option[data-theme]");if(!b)return;const m=document.querySelector("#modal"),colors={blue:"#2766db",navy:"#4776b8",green:"#16866b",purple:"#7656c7",orange:"#e67e22",red:"#d9534f"};setTimeout(()=>m.style.setProperty("--blue",colors[b.dataset.theme]||colors.blue),0)});

// Authentication and Login Landing Page
function getStoredAuth(){
  try{
    // Auth only lives in sessionStorage for active session. Every app exit signs out the user.
    localStorage.removeItem('taxguard_auth');
    const s=sessionStorage.getItem('taxguard_auth');
    return s?JSON.parse(s):null;
  }catch{return null;}
}
function getUserInitials(name){
  if(!name)return 'TG';
  const str=String(name).trim();
  const parts=str.split(/[\s._-]+/).filter(Boolean);
  if(parts.length>=2){
    if(parts[0].length>=2&&/^[A-Z]+$/.test(parts[0])){
      return parts[0].slice(0,2);
    }
    return (parts[0][0]+parts[1][0]).toUpperCase();
  }
  const uppers=str.match(/[A-Z]/g);
  if(uppers&&uppers.length>=2){
    return (uppers[0]+uppers[1]).toUpperCase();
  }
  return str.slice(0,2).toUpperCase();
}
function setUserAvatarSlot(element,username,photo){
  if(!element)return;
  element.title=`Signed in as ${username}`;
  element.replaceChildren();
  if(typeof photo==='string'&&/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/]+={0,2}$/.test(photo)){
    const img=document.createElement('img');img.src=photo;img.alt=`${username} profile picture`;
    element.append(img);element.classList.add('has-user-photo');
  }else{
    element.textContent=getUserInitials(username);element.classList.remove('has-user-photo');
  }
}
function setAuthState(loggedIn,authInfo,animate=false){
  if(loggedIn){
    const comp=authInfo?.company||'EOO Tax & Accounting';
    const firmEl=document.querySelector('.firm .firm-info');
    if(firmEl)firmEl.innerHTML=`${esc(comp)}<small>Compliance team</small>`;
    const loginDisplay=document.querySelector('#login-company-display');
    if(loginDisplay)loginDisplay.textContent=comp;
    const headerAvatar=document.querySelector('.header-right .avatar');
    if(headerAvatar&&authInfo?.username){
      setUserAvatarSlot(headerAvatar,authInfo.username,authInfo.profile_photo);
    }
    window.refreshCompanyProfile?.();

    if(animate){
      const landing=document.querySelector('#login-landing');
      document.body.classList.add('auth-transitioning');
      document.body.classList.add('logged-in');
      landing?.classList.add('slide-fade-out');
      setTimeout(()=>{
        document.body.classList.remove('logged-out');
        document.body.classList.remove('auth-transitioning');
        landing?.classList.remove('slide-fade-out');
      },480);
    }else{
      document.body.classList.remove('logged-out');
      document.body.classList.add('logged-in');
    }
  }else{
    document.body.classList.remove('logged-in');
    document.body.classList.add('logged-out');
  }
}
function attemptLogin(username,password){
  const alertEl=document.querySelector('#login-error-alert');
  const submitBtn=document.querySelector('#login-btn');
  const btnText=submitBtn?.querySelector('.btn-text');
  if(alertEl)alertEl.style.display='none';
  if(!username||!username.trim()){
    if(alertEl){alertEl.textContent='Please enter your username.';alertEl.style.display='block';}
    return;
  }
  if(!password){
    if(alertEl){alertEl.textContent='Please enter your password.';alertEl.style.display='block';}
    return;
  }
  if(submitBtn)submitBtn.disabled=true;
  if(btnText)btnText.textContent='Verifying credentials...';
  try{
    let result;
    if(database&&typeof database.login==='function'){
      result=database.login(username.trim(),password);
    }else{
      let usersList=[];
      try{usersList=JSON.parse(localStorage.getItem('taxguard_users')||'[]');}catch(e){}
      const match=usersList.find(u=>u.username.toLowerCase()===username.trim().toLowerCase());
      if(match){
        if(match.password===password&&match.is_active!==0){
          result={authenticated:true,company:match.company_name||'EOO Tax & Accounting',username:match.username,role:match.role||'Staff'};
        }else{
          throw Error('Invalid username or password.');
        }
      }else if(username.trim().toLowerCase()==='admin'&&password==='taxguard2026'){
        result={authenticated:true,company:'EOO Tax & Accounting',username:'admin',role:'Admin'};
      }else{
        throw Error('Invalid username or password.');
      }
    }
    if(result&&result.authenticated){
      const dataStr=JSON.stringify(result);
      sessionStorage.setItem('taxguard_auth',dataStr);
      localStorage.removeItem('taxguard_auth');
      setAuthState(true,result,true);
      notify(`Welcome back, ${result.username}!`);
      render();
    }else{
      throw Error('Authentication failed.');
    }
  }catch(err){
    if(alertEl){alertEl.textContent=err.message||'Authentication failed.';alertEl.style.display='block';}
  }finally{
    if(submitBtn)submitBtn.disabled=false;
    if(btnText)btnText.textContent='Sign In to TaxGuard';
  }
}
function handleLogout(){
  sessionStorage.removeItem('taxguard_auth');
  localStorage.removeItem('taxguard_auth');
  setAuthState(false);
  notify('Signed out successfully.');
}
document.querySelector('#login-form')?.addEventListener('submit',e=>{
  e.preventDefault();
  const u=document.querySelector('#login-username')?.value;
  const p=document.querySelector('#login-password')?.value;
  attemptLogin(u,p);
});
document.querySelector('#fill-demo-btn')?.addEventListener('click',()=>{
  const u=document.querySelector('#login-username');
  const p=document.querySelector('#login-password');
  if(u)u.value='admin';
  if(p)p.value='taxguard2026';
  const alertEl=document.querySelector('#login-error-alert');
  if(alertEl)alertEl.style.display='none';
});
document.querySelector('#toggle-pw-btn')?.addEventListener('click',()=>{
  const p=document.querySelector('#login-password');
  const btn=document.querySelector('#toggle-pw-btn');
  if(p&&btn){
    const isPw=p.type==='password';
    p.type=isPw?'text':'password';
    btn.textContent=isPw?'🙈':'👁';
  }
});
document.querySelector('#sidebar-logout-btn')?.addEventListener('click',handleLogout);
document.querySelector('#header-logout-btn')?.addEventListener('click',handleLogout);

const initialAuth=getStoredAuth();
if(initialAuth){
  setAuthState(true,initialAuth);
}else{
  setAuthState(false);
}
// Calendar date in the workstation's timezone, including the hours before UTC midnight.
function localDate(now=new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}
function refreshCurrentDate() {
  const current=localDate();
  if(current===today)return;
  today=current;
  // Preserve any form being edited; its next render will use the new date.
  if(!document.querySelector('#modal')?.open&&!document.querySelector('#company-profile-form'))render();
}
setInterval(refreshCurrentDate,60000);
window.addEventListener('focus',refreshCurrentDate);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshCurrentDate();});
