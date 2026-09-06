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
  {id:'1604-E',name:'Annual withholding info return · Expanded',periods:['Annual'],dates:['03-01'],frequency:'Annual'}
];
const database=window.taxguardDB;
const databaseSnapshot=database?database.load():null;
let databaseRevision=databaseSnapshot?.revision;
if(databaseSnapshot)forms.splice(0,forms.length,...databaseSnapshot.forms);
const initial=[{id:1,name:'Dela Cruz Trading',tin:'000-000-001-000',type:'Sole proprietorship',status:'Active',tax:'VAT',start:'2021-01-01',forms:['1701-Q','2550-Q','1701']},{id:2,name:'Marcedonio Photography',tin:'000-000-002-000',type:'Sole proprietorship',status:'Active',tax:'NVAT',start:'2022-01-01',forms:['1701-Q','2551-Q','1701']},{id:3,name:'Santos Retail Corporation',tin:'000-000-003-000',type:'Corporation',status:'Active',tax:'VAT',start:'2023-01-01',forms:['2550-Q','1601-C','1702']},{id:4,name:'Abundant Enterprises Co.',tin:'000-000-004-000',type:'Partnership',status:'Active',tax:'VAT',start:'2023-03-08',forms:['2550-Q','1702']},{id:5,name:'Acuña, Jennifer Delgado',tin:'000-000-005-000',type:'Sole proprietorship',status:'For closure',tax:'VAT',start:'2023-09-29',forms:['1701-Q','2550-Q','1601-C','1701']},{id:6,name:'Adamos, Robert Bryan Ramos',tin:'000-000-006-000',type:'Sole proprietorship',status:'Active',tax:'NVAT',start:'2020-03-09',forms:['1701-Q','2551-Q','1701']}];
let state;try{state=JSON.parse(localStorage.getItem('taxguard-workspace-v1'))}catch{}if(databaseSnapshot)state={clients:databaseSnapshot.clients,filings:databaseSnapshot.filings};if(!state)state={clients:initial,filings:{}};let page='dashboard',year=2026,query='',filter='unfiled',periodFilter='all';let trackerPage=1;const pageSize=10;const today='2026-09-05';
function due(f,p,y){if(f.overrides?.[y]?.[p])return f.overrides[y][p];let i=f.periods.indexOf(p);if(/^\d{4}-\d{2}-\d{2}$/.test(f.dates[i]||''))return f.dates[i];if(f.frequency==='Monthly'||f.id==='1601-C'||f.id==='0619-E')return `${i===11?y+1:y}-${String(i===11?1:i+2).padStart(2,'0')}-${i===11?'15':'10'}`;return `${p==='Annual'||p==='Q4'?y+1:y}-${f.dates[i]}`}
function key(c,f,p){return `${c.id}:${year}:${f.id}:${p}`}
function obligations(){return state.clients.flatMap(c=>forms.filter(f=>c.forms.includes(f.id)).flatMap(f=>f.periods.map(p=>{let i=f.periods.indexOf(p),end=p==='Annual'?`${year}-12-31`:p.startsWith('Q')?`${year}-${String((i+1)*3).padStart(2,'0')}-31`:`${year}-${String(i+1).padStart(2,'0')}-31`;return {c,f,p,end,due:due(f,p,year),key:key(c,f,p),filing:state.filings[key(c,f,p)]}}).filter(o=>o.end>=c.start)))}
if(!database&&!localStorage.getItem('taxguard-workspace-v1')){for(const y of [2024,2025,2026]){year=y;obligations().forEach((o,i)=>{if((y<2026||o.due<'2026-09-01')&&i%5!==0)state.filings[o.key]={date:o.due,reference:`TG-${y}-${String(i+1).padStart(4,'0')}`,remarks:'Sample submission'};})}year=2026;save()}
function closeModal(m,afterClose){if(m.classList.contains('closing'))return;m.classList.add('closing');setTimeout(()=>{m.close();m.classList.remove('closing');if(afterClose)afterClose()},180)}
function restoreDatabase(){const saved=database.load();databaseRevision=saved.revision;state={clients:saved.clients,filings:saved.filings};forms.splice(0,forms.length,...saved.forms);}
function save(){try{if(database)databaseRevision=database.save(state,databaseRevision);else localStorage.setItem('taxguard-workspace-v1',JSON.stringify(state));}catch(error){if(database)restoreDatabase();notify('Not saved: '+error.message);throw error;}}
function saveForms(){try{if(database)databaseRevision=database.saveForms(forms,databaseRevision);else localStorage.setItem('taxguard-custom-forms',JSON.stringify(forms));}catch(error){if(database)restoreDatabase();notify('Not saved: '+error.message);throw error;}}function notify(t){let e=document.querySelector('#toast');e.textContent=t;e.style.display='block';setTimeout(()=>e.style.display='none',3000)}
const badge=s=>`<span class="badge ${s.toLowerCase().replaceAll(' ','-')}">${esc(s)}</span>`;const clientCell=c=>`<div class="client-cell"><span class="client-icon">${esc(c.name.split(' ').slice(0,2).map(x=>x[0]).join(''))}</span><div><strong>${esc(c.name)}</strong><small>${esc(c.type)}</small></div></div>`;
function yearSelect(){return `<select aria-label="Tax year" id="year">${Array.from({length:10},(_,i)=>2027-i).map(y=>`<option ${y===year?'selected':''}>${y}</option>`).join('')}</select>`}
function heading(title,desc,action=''){const deadlineButton=title==='Deadline reference'?'<button class="btn primary" id="add-deadline">＋ Add deadline</button>':'';return `<div class="page-title"><div><div class="eyebrow">YOUR COMPLIANCE WORKSPACE</div><h1>${title}</h1><p>${desc}</p></div><div class="controls">${yearSelect()}${action}${deadlineButton}</div></div>`}
function status(c,obs){let a=obs.filter(o=>o.c.id===c.id);return !a.length?'N/A':a.every(o=>o.filing)?'Complete':'Incomplete'}
function render(){document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('selected',b.dataset.page===page));document.querySelector('#crumb').textContent={dashboard:'Overview',clients:'Client directory',tracker:'Compliance tracker',deadlines:'Deadline reference',settings:'Settings'}[page];document.querySelector('#content').innerHTML=({dashboard:dashboard,clients:clients,tracker:tracker,deadlines:deadlines,settings:settings}[page])();document.querySelector('#year')?.addEventListener('change',e=>{year=+e.target.value;trackerPage=1;render()});bind()}
function dashboard(){const obs=obligations(),done=obs.filter(o=>o.filing).length,over=obs.filter(o=>!o.filing&&o.due<today).length,active=state.clients.filter(c=>c.start<=`${year}-12-31`),complete=active.filter(c=>status(c,obs)==='Complete').length,pct=Math.round(done/Math.max(obs.length,1)*100);let recent=obs.filter(o=>o.filing).sort((a,b)=>b.filing.date.localeCompare(a.filing.date)).slice(0,5);return heading('A clear view of your compliance.',`Track obligations, keep deadlines in sight, and move every client forward.`,`<button class="btn primary" data-go="tracker">Open tracker ↗</button>`)+`<div class="stats">${[[active.length,'Clients in this year','♙','Across your client portfolio'],[done,'Filings completed','✓',`${pct}% of ${obs.length} obligations`],[obs.length-done,'Awaiting filing','◷','Applicable obligations remaining'],[over,'Overdue obligations','!','As of Sep 5, 2026']].map((s,i)=>`<div class="stat"><div class="stat-top">${s[1]}<span class="stat-icon">${s[2]}</span></div><strong>${s[0]}</strong><small class="${i===1?'green':''}">${s[3]}</small></div>`).join('')}</div><div class="grid"><div class="panel"><div class="panel-head"><div><h2>Filing progress by form</h2><p>Completed obligations for ${year}</p></div><span class="subtle">${year} TAX YEAR</span></div><div class="panel-body">${forms.slice(0,4).map(f=>{let a=obs.filter(o=>o.f.id===f.id),n=a.filter(o=>o.filing).length;return `<div class="progress-row"><div class="progress-label"><span>${f.id}<small>${f.name.split(' · ')[0]}</small></span><span>${n} <span class="subtle">/ ${a.length}</span></span></div><div class="track"><div class="fill" style="width:${100*n/Math.max(a.length,1)}%"></div></div></div>`}).join('')}</div></div><div class="panel"><div class="panel-head"><div><h2>Portfolio completion</h2><p>Every applicable period counts</p></div></div><div class="panel-body"><div class="donut-wrap"><div class="donut" style="background:conic-gradient(#4b84e5 ${pct}%,#edf1f6 0)"><div class="donut-inner"><strong>${pct}%</strong><small>FILINGS COMPLETE</small></div></div><div class="legend"><div><i style="background:#4b84e5"></i>Filed<b>${done}</b></div><div><i style="background:#e0e6ef"></i>Remaining<b>${obs.length-done}</b></div></div></div><div class="banner">${complete} of ${active.length} clients have completed every obligation for ${year}.</div></div></div></div>${clientTrendChart()}<div class="panel"><div class="panel-head"><div><h2>Recent filings</h2><p>The latest recorded submissions in your workspace</p></div><button class="link" data-go="tracker">View all filings →</button></div><div class="table-scroll"><table><thead><tr><th>Client</th><th>BIR form</th><th>Period</th><th>Filed on</th><th>Status</th></tr></thead><tbody>${recent.map(o=>`<tr class="recent-client-row" data-client="${o.c.id}"><td>${clientCell(o.c)}</td><td>${o.f.id}</td><td>${o.p} ${year}</td><td>${o.filing.date}</td><td>${badge('Complete')}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">No filings recorded for this year.</td></tr>'}</tbody></table></div></div>`}
function clients(){let rows=state.clients.filter(c=>(c.name+' '+c.tin).toLowerCase().includes(query.toLowerCase()));return heading('Client directory','One master record for every client and their filing requirements.','<button class="btn primary" id="add-client">＋ Add client</button>')+`<div class="panel"><div class="toolbar"><div class="search-wrap"><input id="search" placeholder="Search clients or TIN…" aria-label="Search clients" value="${esc(query)}"><button type="button" class="search-clear" id="clear-search">×</button></div><span class="subtle">${rows.length} CLIENTS</span></div><div class="table-scroll"><table><thead><tr><th>Client / business type</th><th>TIN</th><th>Tax type</th><th>Status</th><th>Start of filing</th><th>Required forms</th><th></th></tr></thead><tbody>${rows.map(c=>`<tr class="client-row" data-client="${c.id}"><td>${clientCell(c)}</td><td>${esc(c.tin)}</td><td>${esc(c.tax)}</td><td>${badge(c.status)}</td><td>${esc(c.start)}</td><td>${c.forms.map(esc).join(', ')}</td><td><button class="link client-edit-inline" data-edit="${c.id}">Edit</button></td></tr>`).join('')||'<tr><td colspan="7" class="empty">No matching clients.</td></tr>'}</tbody></table></div><div class="summary-line">Sample identities and placeholder TINs · Client requirements generate period-specific obligations.</div></div>`}
function tracker(){let obs=obligations().filter(o=>(o.c.name+' '+o.f.id).toLowerCase().includes(query.toLowerCase())&&(filter==='filed'?!!o.filing:filter==='overdue'?!o.filing&&o.due<today:!o.filing)&&(periodFilter==='all'||o.p===periodFilter)).sort((a,b)=>a.due.localeCompare(b.due)||a.c.name.localeCompare(b.c.name)||a.f.id.localeCompare(b.f.id));const totalPages=Math.max(1,Math.ceil(obs.length/pageSize));trackerPage=Math.min(trackerPage,totalPages);const start=(trackerPage-1)*pageSize;const visible=obs.slice(start,start+pageSize);return heading('Compliance tracker','Track each client, form, and filing period. Record a submission to update progress.')+`<div class="panel"><div class="toolbar"><div class="search-wrap"><input id="search" placeholder="Search client or form…" aria-label="Search obligations" value="${esc(query)}"><button type="button" class="search-clear" id="clear-search">×</button></div><select id="filter" aria-label="Filing status">${[['unfiled','For filing'],['filed','Filed'],['overdue','Overdue']].map(([v,t])=>`<option value="${v}" ${v===filter?'selected':''}>${t}</option>`).join('')}</select><select id="period-filter" aria-label="Covered period">${['all','Q1','Q2','Q3','Q4','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Annual'].map(p=>`<option value="${p}" ${p===periodFilter?'selected':''}>${p==='all'?'All periods':p}</option>`).join('')}</select></div><div class="table-scroll"><table><thead><tr><th>Client</th><th>Form / period</th><th>Due date</th><th>Filing status</th><th>Client annual status</th><th>Action</th></tr></thead><tbody>${visible.map(o=>`<tr class="tracker-row" data-file="${o.key}"><td>${clientCell(o.c)}</td><td><strong>${o.f.id}</strong><br><span class="period">${o.p} ${year}</span></td><td style="white-space:nowrap">${o.due}</td><td>${o.filing?badge('Complete')+'<br><span class="period">'+esc(o.filing.date)+'</span>':badge(o.due<today?'Overdue':'Incomplete')}</td><td>${badge(status(o.c,obligations()))}</td><td><button class="file-button" data-file="${o.key}">${o.filing?'View filing':'Record filing'}</button></td></tr>`).join('')||'<tr><td colspan="6" class="empty">No obligations match these filters.</td></tr>'}</tbody></table></div><div class="pagination"><span>Showing ${obs.length?start+1:0}–${Math.min(start+pageSize,obs.length)} of ${obs.length} records</span><div class="controls"><button class="btn" id="previous-page" ${trackerPage===1?'disabled':''}>Previous</button><span>Page ${trackerPage} of ${totalPages}</span><button class="btn" id="next-page" ${trackerPage===totalPages?'disabled':''}>Next</button></div></div><div class="summary-line">${obs.length} obligations · Non-applicable forms are excluded · Deadline dates are based on the workbook.</div></div>`}
function deadlines(){return heading('Deadline reference','A shared reference for forms, covered periods, and filing schedules.')+`<div class="deadline-note">Filing schedules from the supplied workbook. These are not verified current BIR deadlines. Holiday adjustments, filing-channel exceptions, and fiscal-year variations are not applied.</div><div class="panel"><div class="panel-head"><div><h2>Filing schedules</h2><p>Supported forms · Calendar-year assumption</p></div></div><div class="table-scroll"><table><thead><tr><th>BIR form</th><th>Description</th><th>Period covered</th><th>Frequency</th><th>Due dates · ${year}</th></tr></thead><tbody>${forms.map(f=>`<tr><td><strong>${f.id}</strong></td><td>${f.name}</td><td>${f.periods.join(', ')}</td><td>${f.frequency||(f.periods[0]==='Annual'?'Annual':f.id==='1601-C'?'Monthly':'Quarterly')}</td><td>${f.periods.map(p=>`${p}: ${due(f,p,year)}`).join('<br>')}</td></tr>`).join('')}</tbody></table></div></div>`}
function bind(){document.querySelector('#previous-page')?.addEventListener('click',()=>{trackerPage--;render()});document.querySelector('#next-page')?.addEventListener('click',()=>{trackerPage++;render()});document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));document.querySelector('#add-client')?.addEventListener('click',()=>editClient());document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>editClient(+b.dataset.edit));document.querySelectorAll('[data-file]').forEach(b=>b.onclick=e=>{if(e.target.closest('.file-button')){fileModal(b.dataset.file);return}fileModal(b.dataset.file)});const s=document.querySelector('#search');document.querySelector('#clear-search')?.addEventListener('click',()=>{query='';render()});if(s)s.oninput=e=>{const pos=e.target.selectionStart;query=e.target.value;trackerPage=1;render();const n=document.querySelector('#search');n.focus();n.setSelectionRange(pos,pos)};document.querySelector('#filter')?.addEventListener('change',e=>{filter=e.target.value;trackerPage=1;render()});document.querySelector('#period-filter')?.addEventListener('change',e=>{periodFilter=e.target.value;trackerPage=1;render()})}
function go(p){setAuthState(true);trackerPage=1;page=p;query='';filter='unfiled';periodFilter='all';render()}document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>go(b.dataset.page));
function editClient(id){let c=state.clients.find(c=>c.id===id)||{name:'',tin:'',type:'Sole proprietorship',status:'Active',tax:'NVAT',start:'2026-01-01',forms:[]},m=document.querySelector('#modal');m.innerHTML=`<h2>${id?'Edit client':'Add a client'}</h2><p>Set up the master record and required forms.</p><form id="client-form"><label>Client name</label><input name="name" required value="${esc(c.name)}"><div class="form-grid"><div><label>TIN</label><input name="tin" required placeholder="000-000-000-000" value="${esc(c.tin)}"></div><div><label>Start of filing</label><input name="start" type="date" required value="${esc(c.start)}"></div>${[['type','Business type',['Sole proprietorship','Partnership','Corporation']],['tax','Tax type',['VAT','NVAT']],['status','Client status',['Active','Inactive','For closure','Closed']]].map(([n,l,opts])=>`<div><label>${l}</label><select name="${n}">${opts.map(v=>`<option ${c[n]===v?'selected':''}>${v}</option>`).join('')}</select></div>`).join('')}</div><label>Required forms</label><div class="checks">${forms.map(f=>`<label><input type="checkbox" name="forms" value="${f.id}" ${c.forms.includes(f.id)?'checked':''}>${f.id}</label>`).join('')}</div><label>Remarks</label><input name="remarks" value="${esc(c.remarks||'')}"><p>Client status is informational; closure does not automatically cancel obligations.</p><div class="modal-actions"><button type="button" class="btn" id="cancel">Cancel</button><button class="btn primary">Save client</button></div></form>`;m.showModal();const tinField=document.querySelector('#client-form [name="tin"]');if(tinField){tinField.inputMode='numeric';tinField.maxLength=15;tinField.addEventListener('input',()=>{const digits=tinField.value.replace(/\D/g,'').slice(0,12);tinField.value=digits.replace(/(\d{3})(?=\d)/g,'$1-')})};document.querySelector('#cancel').onclick=()=>closeModal(m);document.querySelector('#client-form').onsubmit=e=>{e.preventDefault();let d=new FormData(e.target),value={...Object.fromEntries(d),forms:d.getAll('forms'),id:id||Date.now()};if(!value.name.trim()){return}if(id)state.clients[state.clients.findIndex(c=>c.id===id)]=value;else state.clients.push(value);save();closeModal(m);render();notify('Client saved. Obligations updated.')}}
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
function fileModal(k){let o=obligations().find(o=>o.key===k),m=document.querySelector('#modal');if(!o)return;const initialDate=o.filing?.date||today;m.innerHTML=`<h2>${o.filing?'Filing details':'Record filing'}</h2><p>${esc(o.c.name)}<br><strong>${o.f.id} · ${o.p} ${year}</strong> · Due ${o.due}</p><div id="filing-alert-container">${filingAlertHTML(o,initialDate,!!o.filing)}</div><form id="filing-form"><label>Filing date</label><input type="date" name="date" required max="${today}" value="${initialDate}"><label>Confirmation / reference number</label><input name="reference" required value="${esc(o.filing?.reference||'')}" placeholder="Enter submission reference"><label>Remarks</label><input name="remarks" value="${esc(o.filing?.remarks||'')}" placeholder="Optional notes"><div class="modal-actions"><button type="button" class="btn" id="cancel">Cancel</button><button class="btn primary">Save filing</button></div></form>`;m.showModal();const dateInput=m.querySelector('#filing-form input[name="date"]');const alertContainer=m.querySelector('#filing-alert-container');if(dateInput&&alertContainer){dateInput.addEventListener('input',()=>{alertContainer.innerHTML=filingAlertHTML(o,dateInput.value,!!o.filing)})};document.querySelector('#cancel').onclick=()=>closeModal(m);document.querySelector('#filing-form').onsubmit=e=>{e.preventDefault();state.filings[k]=Object.fromEntries(new FormData(e.target));save();closeModal(m);render();notify('Filing saved. Progress updated.')}}
render();

const basicDeadlineModal=deadlineModal;
deadlineModal=function(id){const f=forms.find(x=>x.id===id),m=document.querySelector('#modal');if(!f)return; m.innerHTML=`<h2>${esc(f.id)}</h2><p>${esc(f.name)}</p><form id="schedule-form"><div class="schedule-edit-list">${f.periods.map((p,i)=>`<div class="schedule-edit-row"><input name="period" value="${esc(p)}" aria-label="Period"><input type="date" name="date" value="${esc(f.dates[i]||due(f,p,year))}" aria-label="Due date"></div>`).join('')}</div><div class="modal-actions"><button type="button" class="btn" id="cancel">Cancel</button><button class="btn primary">Save schedule</button></div></form>`;m.showModal();m.querySelector('#cancel').onclick=()=>closeModal(m);m.querySelector('#schedule-form').onsubmit=e=>{e.preventDefault();const fd=new FormData(e.target),periods=fd.getAll('period'),dates=fd.getAll('date');f.periods=periods;f.dates=dates;saveForms();closeModal(m);render();notify('Schedule updated.')}};
deadlineModal=function(id){const f=forms.find(x=>x.id===id),m=document.querySelector('#modal');if(!f)return;const fullDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(v)?v:`${year}-${v}`;const rows=()=>f.periods.map((p,i)=>`<div class="schedule-edit-row"><span class="schedule-period">${esc(p)}</span><span class="schedule-date">${esc(due(f,p,year))}</span></div>`).join('');m.innerHTML=`<h2>${esc(f.id)}</h2><p>${esc(f.name)}</p><div class="schedule-edit-list">${rows()}</div><div class="modal-actions"><button type="button" class="btn" id="cancel">Close</button><button type="button" class="btn primary" id="edit-schedule">Edit schedule</button></div>`;m.showModal();m.querySelector('#cancel').onclick=()=>closeModal(m);m.querySelector('#edit-schedule').onclick=()=>{m.innerHTML=`<h2>Edit ${esc(f.id)} schedule</h2><form id="schedule-form"><div class="schedule-edit-list">${f.periods.map((p,i)=>`<div class="schedule-edit-row"><input name="period" value="${esc(p)}"><input type="date" name="date" value="${esc(due(f,p,year))}"></div>`).join('')}</div><div class="modal-actions"><button type="button" class="btn" id="cancel-edit">Cancel</button><button class="btn primary">Save schedule</button></div></form>`;m.querySelector('#cancel-edit').onclick=()=>deadlineModal(id);m.querySelector('#schedule-form').onsubmit=e=>{e.preventDefault();const d=new FormData(e.target);const periods=d.getAll('period').map(p=>p.trim()),dates=d.getAll('date');if(periods.some((p,i)=>p!==f.periods[i]))throw Error('Period names cannot change once schedules are used.');f.overrides=f.overrides||{};f.overrides[year]=Object.fromEntries(periods.map((p,i)=>[p,dates[i]]));saveForms();closeModal(m);render();notify('Schedule updated.')}}};

// Deadline management controls.
const originalDeadlineCards=deadlines;
deadlines=function(){return heading('Deadline reference','A shared reference for forms, covered periods, and filing schedules.','<button class="btn primary" id="add-deadline">＋ Add deadline</button>')+`<div class="deadline-note">Filing schedules from the supplied workbook. These are not verified current BIR deadlines.</div><div class="deadline-grid">${forms.map(f=>`<button class="deadline-card" data-deadline="${f.id}"><div class="card-code">${f.id}</div><h2>${esc(f.name)}</h2><div class="card-meta"><span>${f.frequency||(f.periods[0]==='Annual'?'Annual':f.id==='1601-C'?'Monthly':'Quarterly')}</span><span>${f.periods.length} periods</span></div><div class="card-periods">${f.periods.slice(0,5).join(' · ')}${f.periods.length>5?' · …':''}</div><span class="card-link">View schedule →</span><span class="card-edit" data-edit-deadline="${f.id}">Edit</span></button>`).join('')}</div>`};
const priorBind=bind;bind=function(){priorBind();document.querySelector('#add-deadline')?.addEventListener('click',()=>deadlineEditModal());document.querySelectorAll('[data-edit-deadline]').forEach(b=>b.onclick=e=>{e.stopPropagation();deadlineEditModal(b.dataset.editDeadline)})};
function deadlineEditModal(id){const f=forms.find(x=>x.id===id)||{id:'',name:'',periods:['Q1'],dates:['04-30']},m=document.querySelector('#modal');m.innerHTML=`<h2>${id?'Edit deadline':'Add deadline'}</h2><form id="deadline-form"><label>Form code</label><input name="id" required value="${esc(f.id)}" ${id?'readonly':''}><label>Description</label><input name="name" required value="${esc(f.name)}"><label>Covered periods (comma separated)</label><input name="periods" required value="${esc(f.periods.join(', '))}"><label>Due dates (comma separated)</label><input name="dates" required value="${esc(f.dates.join(', '))}"><div class="modal-actions"><button type="button" class="btn" id="cancel">Cancel</button><button class="btn primary">Save deadline</button></div></form>`;m.showModal();m.querySelector('#cancel').onclick=()=>closeModal(m);m.querySelector('#deadline-form').onsubmit=e=>{e.preventDefault();const d=new FormData(e.target),v={id:String(d.get('id')).trim(),name:String(d.get('name')).trim(),periods:String(d.get('periods')).split(',').map(x=>x.trim()),dates:String(d.get('dates')).split(',').map(x=>x.trim())},i=forms.findIndex(x=>x.id===id);if(i<0)forms.push(v);else forms[i]=v;saveForms();closeModal(m);render();notify('Deadline saved.')}}
render();

// Card-based deadline reference with detail modal.
const originalDeadlines=deadlines;
deadlines=function(){return heading('Deadline reference','A shared reference for forms, covered periods, and filing schedules.')+`<div class="deadline-note">Filing schedules from the supplied workbook. These are not verified current BIR deadlines. Holiday adjustments, filing-channel exceptions, and fiscal-year variations are not applied.</div><div class="deadline-grid">${forms.map(f=>`<button class="deadline-card" data-deadline="${f.id}"><div class="card-code">${f.id}</div><h2>${esc(f.name)}</h2><div class="card-meta"><span>${f.frequency||(f.periods[0]==='Annual'?'Annual':f.id==='1601-C'?'Monthly':'Quarterly')}</span><span>${f.periods.length} periods</span></div><div class="card-periods">${f.periods.slice(0,5).join(' · ')}${f.periods.length>5?' · …':''}</div><span class="card-link">View schedule →</span></button>`).join('')}</div>`};
const originalBind=bind;
bind=function(){originalBind();document.querySelectorAll('.client-row').forEach(r=>r.onclick=e=>{if(e.target.closest('.client-edit-inline'))return;clientModal(+r.dataset.client)});document.querySelectorAll('.recent-client-row').forEach(r=>r.onclick=()=>{query=state.clients.find(c=>c.id===+r.dataset.client)?.name||'';page='clients';render();clientModal(+r.dataset.client)});document.querySelectorAll('[data-deadline]').forEach(b=>b.onclick=()=>deadlineModal(b.dataset.deadline));const form=document.querySelector('#client-form');if(form&&form.querySelector){const checks=form.querySelector('.checks');if(checks){const labels=[...checks.querySelectorAll('label')];const button=document.createElement('button');button.type='button';button.className='form-picker-btn';button.textContent='Select required forms';const pills=document.createElement('div');pills.className='selected-pills';const popup=document.createElement('div');popup.className='form-picker-popup';popup.innerHTML='<div class="picker-head"><strong>Select required forms</strong><button type="button" class="picker-close">×</button></div><div class="picker-options"></div><button type="button" class="btn primary picker-done">Done</button>';const options=popup.querySelector('.picker-options');labels.forEach(label=>options.appendChild(label.cloneNode(true)));const update=()=>{pills.innerHTML='';labels.forEach((label,i)=>{if(label.querySelector('input').checked){const pill=document.createElement('span');pill.className='form-pill';pill.textContent=label.textContent.trim();const x=document.createElement('button');x.type='button';x.textContent='×';x.onclick=()=>{label.querySelector('input').checked=false;options.querySelectorAll('input')[i].checked=false;update()};pill.appendChild(x);pills.appendChild(pill)}})};button.onclick=()=>popup.classList.add('open');popup.querySelector('.picker-close').onclick=()=>popup.classList.remove('open');popup.querySelector('.picker-done').onclick=()=>{options.querySelectorAll('input').forEach((input,i)=>labels[i].querySelector('input').checked=input.checked);update();popup.classList.remove('open')};checks.style.display='none';checks.before(button,pills);document.body.appendChild(popup);update()}const tinInput=form.querySelector('[name="tin"]');if(tinInput){tinInput.inputMode='numeric';tinInput.maxLength=15;tinInput.oninput=()=>{const digits=tinInput.value.replace(/\D/g,'').slice(0,12);tinInput.value=digits.replace(/(\d{3})(?=\d)/g,'$1-')}}const previous=form.onsubmit;form.onsubmit=function(e){const d=new FormData(form),tin=String(d.get('tin')||'').trim(),start=String(d.get('start')||''),selected=d.getAll('forms');let error='';if(!/^\d{3}-\d{3}-\d{3}-\d{3}$/.test(tin))error='TIN must use the format 000-000-000-000.';else if(state.clients.some(c=>c.tin===tin&&c.name!==d.get('name')))error='This TIN is already registered.';else if(!selected.length)error='Select at least one required form.';else if(start>today)error='Start of filing cannot be after today.';if(error){e.preventDefault();notify(error);return false}return previous.call(this,e)}}};
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
function clientModal(id){
  const c=state.clients.find(x=>x.id===id),m=document.querySelector('#modal');
  if(!c)return;

  const allObs=obligations();
  const clientObs=allObs.filter(o=>o.c.id===c.id);
  const total=clientObs.length;
  const filed=clientObs.filter(o=>o.filing).length;
  const overdue=clientObs.filter(o=>!o.filing&&o.due<today).length;
  const pending=total-filed-overdue;
  const pct=total?Math.round((filed/total)*100):0;
  const annualStatus=status(c,allObs);

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
      <button class="btn primary" id="edit-client-detail">Edit client</button>
    </div>
  </div>`;
  m.showModal();
  m.querySelector('#close-client').onclick=()=>closeModal(m);
  m.querySelector('#edit-client-detail').onclick=()=>{closeModal(m,()=>editClient(id))}
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
function setAuthState(loggedIn,authInfo){
  if(loggedIn){
    document.body.classList.remove('logged-out');
    document.body.classList.add('logged-in');
    const comp=authInfo?.company||'EOO Tax & Accounting';
    const firmEl=document.querySelector('.firm .firm-info');
    if(firmEl)firmEl.innerHTML=`${esc(comp)}<small>Compliance team</small>`;
    const loginDisplay=document.querySelector('#login-company-display');
    if(loginDisplay)loginDisplay.textContent=comp;
    const headerAvatar=document.querySelector('.header-right .avatar');
    if(headerAvatar&&authInfo?.username)headerAvatar.title=`Signed in as ${esc(authInfo.username)}`;
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
      if(username.trim().toLowerCase()==='admin'&&password==='taxguard2026'){
        result={authenticated:true,company:'EOO Tax & Accounting',username:'admin'};
      }else{
        throw Error('Invalid username or password.');
      }
    }
    if(result&&result.authenticated){
      const dataStr=JSON.stringify(result);
      sessionStorage.setItem('taxguard_auth',dataStr);
      localStorage.removeItem('taxguard_auth');
      setAuthState(true,result);
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
