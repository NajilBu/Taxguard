// Runs after the existing UI so all persistence consumers share the same records.
if (!database) {
  try {
    const savedForms=JSON.parse(localStorage.getItem('taxguard-custom-forms')||'null');
    if(Array.isArray(savedForms)) forms.splice(0,forms.length,...savedForms);
  } catch { notify('Saved deadline data could not be loaded.'); }
}

function exportToExcel(filename,headers,rows){
  const safeFilename=filename.endsWith('.xls')?filename:filename.replace(/\.[^.]+$/,'')+'.xls';
  const escapeXml=s=>String(s??'')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&apos;');

  const headerCells=headers.map(h=>
    `<Cell ss:StyleID="Header"><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`
  ).join('');

  const bodyRows=rows.map(r=>{
    const cells=r.map(val=>{
      const s=String(val??'').trim();
      const isNum=typeof val==='number'||(s!==''&&!isNaN(s)&&!s.includes('-')&&!s.includes('/')&&!s.includes('%'));
      const type=isNum?'Number':'String';
      return `<Cell><Data ss:Type="${type}">${escapeXml(val)}</Data></Cell>`;
    }).join('');
    return `<Row ss:Height="20">${cells}</Row>`;
  }).join('\r\n');

  const xml=`<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Borders/>
   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Color="#1B3047"/>
   <Interior/>
   <NumberFormat/>
   <Protection/>
  </Style>
  <Style ss:ID="Header">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#2766DB"/>
   </Borders>
   <Font ss:FontName="Segoe UI" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#112B46" ss:Pattern="Solid"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="TaxGuard Export">
  <Table>
   <Row ss:Height="26">
    ${headerCells}
   </Row>
   ${bodyRows}
  </Table>
 </Worksheet>
</Workbook>`;

  const blob=new Blob(['\uFEFF'+xml],{type:'application/vnd.ms-excel;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=safeFilename;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function downloadClientPdf(filename,title,subtitle,yearVal,analysis,headers,rows){
  const safeFilename=filename.endsWith('.pdf')?filename:filename.replace(/\.[^.]+$/,'')+'.pdf';
  const clean=s=>String(s??'').replace(/[\\()]/g,'\\$&').replace(/[^\x20-\x7E\r\n\t]/g,' ');
  const lines=[];

  lines.push('BT /F2 16 Tf 40 790 Td ('+clean(title)+') Tj ET');
  lines.push('BT /F1 10 Tf 40 772 Td ('+clean(subtitle)+' - Tax Year '+clean(yearVal)+') Tj ET');
  lines.push('0.14 0.38 0.86 rg 40 760 515 2 re f');
  lines.push('0 0 0 rg BT /F2 11 Tf 40 740 Td (EXECUTIVE SUMMARY & DESCRIPTIVE ANALYSIS) Tj ET');

  const analysisLines=String(analysis||'').split('\n');
  let currentY=722;
  lines.push('BT /F1 9 Tf 40 '+currentY+' Td 13 TL');
  for(let i=0;i<Math.min(analysisLines.length,12);i++){
    const l=analysisLines[i].trim();
    if(i>0) lines.push('T*');
    lines.push('('+clean(l).slice(0,105)+') Tj');
    currentY-=13;
  }
  lines.push('ET');

  currentY-=15;
  lines.push('0.07 0.17 0.27 rg 40 '+currentY+' 515 18 re f');
  lines.push('1 1 1 rg BT /F2 8 Tf 46 '+(currentY+5)+' Td');
  const headerSummary=(headers||[]).slice(0,7).join('   |   ');
  lines.push('('+clean(headerSummary).slice(0,110)+') Tj ET');

  currentY-=18;
  lines.push('0 0 0 rg');
  const safeRows=rows||[];
  for(let r=0;r<Math.min(safeRows.length,25);r++){
    const row=safeRows[r];
    const rowCells=Array.isArray(row)?row:Object.values(row);
    const rowText=rowCells.slice(0,7).map(c=>String(c??'').replace(/\n/g,' ')).join('  |  ');
    if(r%2===1){
      lines.push('0.96 0.97 0.98 rg 40 '+currentY+' 515 14 re f 0 0 0 rg');
    }
    lines.push('BT /F1 7.5 Tf 46 '+(currentY+4)+' Td ('+clean(rowText).slice(0,110)+') Tj ET');
    currentY-=14;
    if(currentY<50) break;
  }

  const streamContent=lines.join('\n');
  const streamLength=streamContent.length;

  const objects=[];
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');
  objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj');
  objects.push('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj');
  objects.push('4 0 obj\n<< /Length '+streamLength+' >>\nstream\n'+streamContent+'\nendstream\nendobj');
  objects.push('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj');
  objects.push('6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj');

  let body='%PDF-1.4\n';
  const xrefOffsets=[0];
  for(const obj of objects){
    xrefOffsets.push(body.length);
    body+=obj+'\n';
  }
  const xrefStart=body.length;
  body+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n';
  for(let i=1;i<=objects.length;i++){
    body+=String(xrefOffsets[i]).padStart(10,'0')+' 00000 n \n';
  }
  body+='trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+xrefStart+'\n%%EOF';

  const blob=new Blob([body],{type:'application/pdf'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.style.display='none';
  a.href=url;
  a.download=safeFilename;
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },1000);
}




function normalizedReportScope(input){
  const from=Number(typeof input==='object'?input.from:input||year);
  const to=Number(typeof input==='object'?input.to:input||year);
  const clientIds=typeof input==='object'&&Array.isArray(input.clientIds)?input.clientIds.map(Number):state.clients.map(c=>c.id);
  return {from,to,clientIds};
}
function scopedReportClients(scope){
  const ids=new Set(scope.clientIds);
  return state.clients.filter(c=>ids.has(c.id)&&String(c.start||'')<=`${scope.to}-12-31`).map(c=>clientForYear(c,scope.to));
}
function scopedReportObligations(scope){
  const ids=new Set(scope.clientIds),records=[];
  for(let y=scope.from;y<=scope.to;y++)records.push(...obligationsForYear(y).filter(o=>ids.has(o.c.id)));
  return sortReportByDueDate(records);
}
function reportYearLabel(scope){return scope.from===scope.to?String(scope.to):`${scope.from}–${scope.to}`;}
function getSummaryReportData(reportYear){
  const scope=normalizedReportScope(reportYear),label=reportYearLabel(scope);
  const obs=scopedReportObligations(scope);
  const headers=['Client Name','TIN','Business Type','Tax Type','Client Status','Start of Filing',`Total Obligations (${label})`,'Completed Filings','Pending Filings','Overdue Filings','Compliance Rate','Annual Status'];
  const rows=scopedReportClients(scope).map(c=>{
    const cObs=obs.filter(o=>o.c.id===c.id);
    const cDone=cObs.filter(o=>o.filing).length;
    const cOver=cObs.filter(o=>!o.filing&&o.due<today).length;
    const cPending=cObs.length-cDone-cOver;
    const cPct=cObs.length?Math.round(cDone/cObs.length*100):0;
    return [c.name,c.tin,c.type,c.tax,c.status,c.start,cObs.length,cDone,cPending,cOver,`${cPct}%`,status(c,obs)];
  });
  return { title:`TaxGuard-Compliance-Summary-${scope.from}-${scope.to}.xls`, headers, rows, obs };
}

function sortReportByDueDate(records){
  return [...records].sort((a,b)=>a.due.localeCompare(b.due)||a.c.name.localeCompare(b.c.name)||a.f.id.localeCompare(b.f.id)||a.p.localeCompare(b.p));
}

function getFilingsReportData(reportYear){
  const scope=normalizedReportScope(reportYear);
  const obs=scopedReportObligations(scope);
  const headers=['Client Name','TIN','BIR Form','Covered Period','Tax Year','Due Date','Filing Status','Filing Date','Confirmation / Reference','Remarks'];
  const rows=obs.map(o=>[
    o.c.name,
    o.c.tin,
    o.f.id,
    o.p,
    Number(o.key.split(':')[1]),
    o.due,
    filingStatus(o),
    o.filing?.date||'',
    o.filing?.reference||'',
    o.filing?.remarks||''
  ]);
  return { title:`TaxGuard-Filing-Log-${scope.from}-${scope.to}.xls`, headers, rows, obs };
}

function getClientsReportData(reportScope){
  const scope=normalizedReportScope(reportScope);
  const headers=['Client ID','Client Name','TIN','Business Type','Tax Type','Status','Start of Filing','Required BIR Forms','Remarks'];
  const rows=scopedReportClients(scope).map(c=>[
    c.id,
    c.name,
    c.tin,
    c.type,
    c.tax,
    c.status,
    c.start,
    c.forms.join('; '),
    c.remarks||''
  ]);
  return { title:`TaxGuard-Client-Master-${scope.from}-${scope.to}.xls`, headers, rows };
}

function renderSvgDonut(slices,pendingOrSub,overOrText,totalCount,pctVal){
  let items=[];
  let centerMain='';
  let centerLabel='';
  if(Array.isArray(slices)){
    items=slices;
    centerMain=pendingOrSub||'';
    centerLabel=overOrText||'';
  }else{
    const done=slices||0, pending=pendingOrSub||0, over=overOrText||0, total=totalCount||0, pct=pctVal||0;
    items=[
      { label:'Completed', value:done, color:'#16866b' },
      { label:'Pending', value:pending, color:'#2766db' },
      { label:'Overdue', value:over, color:'#c36959' }
    ];
    centerMain=`${pct}%`;
    centerLabel='COMPLIANT';
  }
  const total=items.reduce((sum,it)=>sum+Number(it.value||0),0);
  const C=282.743;
  let offset=0;
  const circlesSvg=items.map(it=>{
    const v=Number(it.value||0);
    const len=total>0?((v/total)*C):0;
    const circ=`<circle cx="65" cy="65" r="45" fill="none" stroke="${it.color}" stroke-width="15" stroke-dasharray="${len} ${C}" stroke-dashoffset="${-offset}" transform="rotate(-90 65 65)"/>`;
    offset+=len;
    return circ;
  }).join('');

  return `<svg width="130" height="130" viewBox="0 0 130 130" class="report-svg-donut">
    <circle cx="65" cy="65" r="45" fill="none" stroke="#edf1f6" stroke-width="15"/>
    ${circlesSvg}
    <text x="65" y="${centerLabel?'61':'68'}" text-anchor="middle" font-family="'DM Sans',sans-serif" font-weight="800" font-size="20" fill="#1b3047">${centerMain}</text>
    ${centerLabel?`<text x="65" y="75" text-anchor="middle" font-family="'DM Sans',sans-serif" font-size="9" font-weight="700" fill="#7b8999" letter-spacing="0.5">${centerLabel}</text>`:''}
  </svg>`;
}

function renderSvgFormBars(obsOrItems){
  let items=[];
  if(Array.isArray(obsOrItems)&&obsOrItems[0]?.label!==undefined){
    items=obsOrItems;
  }else{
    const obs=Array.isArray(obsOrItems)?obsOrItems:obligations();
    items=forms.map(f=>{
      const fObs=obs.filter(o=>o.f.id===f.id);
      const fDone=fObs.filter(o=>o.filing).length;
      return { label:f.id, done:fDone, total:fObs.length, color:'#2766db' };
    }).filter(f=>f.total>0);
  }
  if(!items.length) return '<div class="empty" style="padding:20px 0;">No active records for this schedule.</div>';
  const barMax=150;
  const h=Math.max(90,items.length*26+10);
  const rowsSvg=items.map((it,i)=>{
    const y=6+i*26;
    const barW=it.total>0?Math.round((it.done/it.total)*barMax):0;
    return `<g>
      <text x="0" y="${y+10}" font-family="'DM Sans',sans-serif" font-size="10.5" font-weight="700" fill="#244362">${esc(it.label)}</text>
      <rect x="65" y="${y}" width="${barMax}" height="13" rx="3" fill="#edf1f6"/>
      <rect x="65" y="${y}" width="${barW}" height="13" rx="3" fill="${it.color||'#2766db'}"/>
      <text x="222" y="${y+10}" font-family="'DM Sans',sans-serif" font-size="9.5" font-weight="600" fill="#677b90">${it.done}/${it.total}</text>
    </g>`;
  }).join('');
  return `<svg width="100%" height="${h}" viewBox="0 0 260 ${h}">${rowsSvg}</svg>`;
}

function openReportSetup(reportType){
  const titles={summary:'Annual Compliance Summary',filings:'Filing Audit Log',clients:'Client Master Roster'};
  const dialog=workspaceDialog(),ordered=[...state.clients].sort((a,b)=>a.name.localeCompare(b.name));
  dialog.classList.add('report-setup-modal');
  dialog.innerHTML=`<h2>Set up ${esc(titles[reportType]||titles.summary)}</h2><p>Choose the tax years and clients to include. The preview, Excel export, and PDF will use this selection.</p><form id="report-setup-form"><div class="data-transfer-year-range"><label>From year<input id="report-year-from" type="number" min="2000" max="2100" value="${year}" required></label><label>To year<input id="report-year-to" type="number" min="2000" max="2100" value="${year}" required></label></div><div class="data-client-toolbar"><input id="report-client-search" type="search" placeholder="Search client or TIN" aria-label="Search clients"><button type="button" class="btn" id="report-select-all">Select all</button><button type="button" class="btn" id="report-clear-all">Clear all</button></div><p id="report-client-count" class="subtle"></p><div class="data-transfer-client-table"><table><thead><tr><th></th><th>Client</th><th>TIN</th></tr></thead><tbody>${ordered.map(c=>`<tr data-report-client-search="${esc(`${c.name} ${c.tin||''}`.toLowerCase())}"><td><input type="checkbox" name="report-client" value="${c.id}" checked></td><td>${esc(c.name)}</td><td>${esc(c.tin)}</td></tr>`).join('')}</tbody></table></div><p id="report-setup-error" role="alert"></p><div class="modal-actions"><button type="button" class="btn" id="cancel-report-setup">Cancel</button><button type="submit" class="btn primary">Open report preview</button></div></form>`;
  const rows=[...dialog.querySelectorAll('[data-report-client-search]')],count=dialog.querySelector('#report-client-count');
  const updateCount=()=>{count.textContent=`${dialog.querySelectorAll('[name="report-client"]:checked').length} of ${ordered.length} clients selected`;};
  dialog.querySelector('#report-client-search').oninput=e=>{const query=e.target.value.trim().toLowerCase();rows.forEach(row=>row.hidden=!!query&&!row.dataset.reportClientSearch.includes(query));};
  dialog.querySelector('#report-select-all').onclick=()=>{rows.filter(row=>!row.hidden).forEach(row=>row.querySelector('input').checked=true);updateCount();};
  dialog.querySelector('#report-clear-all').onclick=()=>{rows.filter(row=>!row.hidden).forEach(row=>row.querySelector('input').checked=false);updateCount();};
  dialog.querySelector('.data-transfer-client-table').onchange=updateCount;
  dialog.querySelector('#cancel-report-setup').onclick=()=>closeModal(dialog);
  dialog.querySelector('#report-setup-form').onsubmit=e=>{
    e.preventDefault();
    const from=Number(dialog.querySelector('#report-year-from').value),to=Number(dialog.querySelector('#report-year-to').value);
    const clientIds=[...dialog.querySelectorAll('[name="report-client"]:checked')].map(input=>Number(input.value));
    const error=dialog.querySelector('#report-setup-error');
    if(!Number.isInteger(from)||!Number.isInteger(to)||from<2000||to>2100||from>to||to-from>20){error.textContent='Choose a valid range of up to 21 tax years.';return;}
    if(!clientIds.length){error.textContent='Select at least one client.';return;}
    closeModal(dialog,()=>openReportPreview(reportType,{from,to,clientIds}));
  };
  updateCount();dialog.showModal();
}
function openReportPreview(reportType,reportYear){
  const type=typeof reportType==='string'?reportType:'summary';
  const scope=normalizedReportScope(reportYear),y=scope.to,yearLabel=reportYearLabel(scope);
  const m=workspaceDialog();
  if(!m)return;
  const obs=scopedReportObligations(scope),clients=scopedReportClients(scope);
  const todayFormatted=new Date().toLocaleDateString('en-PH',{year:'numeric',month:'short',day:'numeric'});

  m.classList.add('report-modal');
  m.addEventListener('close',()=>m.classList.remove('report-modal'),{once:true});

  let reportTitle='';
  let reportSub='';
  let reportBadge='';
  let metricsHtml='';
  let chartsHtml='';
  let defaultAnalysis='';
  let tableHeaderHtml='';
  let tableRowsHtml='';
  let exportFn=null;
  let pdfExportHeaders=[];
  let pdfExportRows=[];

  if(type==='filings'){
    reportTitle='TAXGUARD FILING AUDIT LOG';
    reportSub='Chronological Submission Trail & Official BIR Confirmation Register';
    const done=obs.filter(o=>o.filing).length;
    const over=obs.filter(o=>!o.filing&&o.due<today).length;
    const pending=obs.length-done-over;
    const onTime=obs.filter(o=>o.filing&&o.filing.date<=o.due).length;
    const late=done-onTime;
    const pct=obs.length?Math.round(done/obs.length*100):0;
    reportBadge=complianceStatus(obs);

    metricsHtml=`
      <div class="sheet-metric-box"><small>Total Obligations</small><strong>${obs.length}</strong></div>
      <div class="sheet-metric-box"><small>Recorded Filings</small><strong style="color:var(--green)">${done}</strong></div>
      <div class="sheet-metric-box"><small>On-Time Submissions</small><strong style="color:#2766db">${onTime}</strong></div>
      <div class="sheet-metric-box"><small>Overdue / Exceptions</small><strong style="color:${over>0?'#c36959':'var(--ink)'}">${over}</strong></div>
    `;

    const donutSlices=[
      { label:'On-time', value:onTime, color:'#16866b' },
      { label:'Late', value:late, color:'#e67e22' },
      { label:'Pending', value:pending, color:'#2766db' },
      { label:'Overdue', value:over, color:'#c36959' }
    ];
    chartsHtml=`
      <div class="report-charts-grid">
        <div class="report-chart-card">
          <h3>Filing Timeliness Breakdown</h3>
          <div class="chart-content">
            ${renderSvgDonut(donutSlices,`${pct}%`,'FILED')}
            <div class="chart-legend">
              <div class="chart-legend-item"><span class="chart-legend-dot" style="background:#16866b"></span><span>On-time: <b>${onTime}</b></span></div>
              <div class="chart-legend-item"><span class="chart-legend-dot" style="background:#e67e22"></span><span>Late filed: <b>${late}</b></span></div>
              <div class="chart-legend-item"><span class="chart-legend-dot" style="background:#2766db"></span><span>Pending: <b>${pending}</b></span></div>
              <div class="chart-legend-item"><span class="chart-legend-dot" style="background:#c36959"></span><span>Overdue: <b>${over}</b></span></div>
            </div>
          </div>
        </div>
        <div class="report-chart-card">
          <h3>Submissions by BIR Return Form</h3>
          <div class="chart-content" style="display:block">
            ${renderSvgFormBars(obs)}
          </div>
        </div>
      </div>
    `;

    defaultAnalysis=`Filing Audit Log & Submission Verification for Tax Year ${yearLabel}:\n\n`+
      `• Audit Trail Scope: Monitored ${obs.length} statutory obligations for ${yearLabel}, with ${done} submissions recorded in the centralized register.\n`+
      `• Filing Timeliness: ${onTime} returns submitted on-time prior to statutory due dates (${done?Math.round(onTime/done*100):0}% on-time rate).\n`+
      (over>0?`• Audit Exceptions: ${over} obligations are currently overdue and require immediate follow-up to clear statutory liabilities.\n`:`• Audit Exceptions: Zero overdue obligations detected across all registered accounts.\n`)+
      `• Reference Verification: All electronic confirmation numbers and return filing dates are indexed for audit defensibility and BIR compliance inspections.`;

    tableHeaderHtml=`
      <tr>
        <th>Taxpayer Name</th>
        <th>TIN</th>
        <th>BIR Form</th>
        <th>Period</th>
        <th>Due Date</th>
        <th>Filing Status</th>
        <th>Filing Date</th>
        <th>Confirmation / Reference</th>
      </tr>
    `;
    tableRowsHtml=obs.map(o=>`
      <tr>
        <td><strong>${esc(o.c.name)}</strong></td>
        <td><small class="subtle">${esc(o.c.tin)}</small></td>
        <td><strong>${esc(o.f.id)}</strong></td>
        <td>${esc(o.p)}</td>
        <td>${esc(o.due)}</td>
        <td>${badge(filingStatus(o))}${!o.filing&&o.due<today?'<br><small>Overdue</small>':''}</td>
        <td>${esc(o.filing?.date||'—')}</td>
        <td><small>${esc(o.filing?.reference||'—')}</small></td>
      </tr>
    `).join('');

    const rep=getFilingsReportData(scope);
    pdfExportHeaders=rep.headers;
    pdfExportRows=rep.rows;
    exportFn=()=>{
      exportToExcel(rep.title,rep.headers,rep.rows);
      notify(`Filing audit log for ${yearLabel} exported to Excel.`);
    };

  }else if(type==='clients'){
    reportTitle='TAXGUARD CLIENT MASTER ROSTER';
    reportSub='Registered Taxpayer Directory, Entity Types & Statutory Form Assignments';
    const totalClients=clients.length;
    const activeCount=clients.filter(c=>c.status==='Active').length;
    const vatCount=clients.filter(c=>c.tax==='VAT').length;
    const nvatCount=clients.filter(c=>c.tax==='NVAT').length;
    const soleCount=clients.filter(c=>c.type==='Sole proprietorship').length;
    const corpCount=clients.filter(c=>c.type==='Corporation').length;
    const partCount=clients.filter(c=>c.type==='Partnership').length;
    reportBadge=`${activeCount} Active Entities`;

    metricsHtml=`
      <div class="sheet-metric-box"><small>Total Taxpayers</small><strong>${totalClients}</strong></div>
      <div class="sheet-metric-box"><small>Active Accounts</small><strong style="color:var(--green)">${activeCount}</strong></div>
      <div class="sheet-metric-box"><small>VAT Registered</small><strong style="color:#2766db">${vatCount}</strong></div>
      <div class="sheet-metric-box"><small>Non-VAT (NVAT)</small><strong style="color:#7656c7">${nvatCount}</strong></div>
    `;

    const entitySlices=[
      { label:'Sole Prop', value:soleCount, color:'#2766db' },
      { label:'Corporation', value:corpCount, color:'#112b46' },
      { label:'Partnership', value:partCount, color:'#7656c7' }
    ];
    const taxBars=[
      { label:'Non-VAT', done:nvatCount, total:totalClients, color:'#7656c7' },
      { label:'VAT', done:vatCount, total:totalClients, color:'#2766db' },
      { label:'Active', done:activeCount, total:totalClients, color:'#16866b' }
    ];
    chartsHtml=`
      <div class="report-charts-grid">
        <div class="report-chart-card">
          <h3>Business Structure Distribution</h3>
          <div class="chart-content">
            ${renderSvgDonut(entitySlices,`${totalClients}`,'ENTITIES')}
            <div class="chart-legend">
              <div class="chart-legend-item"><span class="chart-legend-dot" style="background:#2766db"></span><span>Sole Prop: <b>${soleCount}</b></span></div>
              <div class="chart-legend-item"><span class="chart-legend-dot" style="background:#112b46"></span><span>Corporation: <b>${corpCount}</b></span></div>
              <div class="chart-legend-item"><span class="chart-legend-dot" style="background:#7656c7"></span><span>Partnership: <b>${partCount}</b></span></div>
            </div>
          </div>
        </div>
        <div class="report-chart-card">
          <h3>Tax Classification &amp; Account Standing</h3>
          <div class="chart-content" style="display:block">
            ${renderSvgFormBars(taxBars)}
          </div>
        </div>
      </div>
    `;

    defaultAnalysis=`Client Master Roster & Form Schedule Assignment Analysis:\n\n`+
      `• Taxpayer Directory: ${totalClients} registered taxpayer accounts actively monitored across sole proprietorships, corporations, and partnerships.\n`+
      `• Tax Structure: ${nvatCount} Non-VAT entities and ${vatCount} VAT-registered businesses maintained under automated filing calendars.\n`+
      `• Schedule Assignments: Required BIR forms (2550-Q, 1701-Q, 0605) are configured according to statutory registration certificates.\n`+
      `• Governance: Client profiles, TIN formatting, and commencement dates have been verified for continuous compliance tracking.`;

    tableHeaderHtml=`
      <tr>
        <th>Taxpayer Name</th>
        <th>TIN</th>
        <th>Business Type</th>
        <th>Tax Type</th>
        <th>Status</th>
        <th>Start of Filing</th>
        <th>Required BIR Forms</th>
      </tr>
    `;
    tableRowsHtml=clients.map(c=>`
      <tr>
        <td><strong>${esc(c.name)}</strong></td>
        <td><small class="subtle">${esc(c.tin)}</small></td>
        <td>${esc(c.type)}</td>
        <td>${esc(c.tax)}</td>
        <td>${badge(c.status)}</td>
        <td>${esc(c.start)}</td>
        <td><small>${esc(c.forms.join(', '))}</small></td>
      </tr>
    `).join('');

    const rep=getClientsReportData(scope);
    pdfExportHeaders=rep.headers;
    pdfExportRows=rep.rows;
    exportFn=()=>{
      exportToExcel(rep.title,rep.headers,rep.rows);
      notify('Client directory roster exported to Excel.');
    };

  }else{
    // Annual Compliance Summary (default)
    reportTitle=scope.from===scope.to?'TAXGUARD ANNUAL COMPLIANCE SUMMARY':'TAXGUARD MULTI-YEAR COMPLIANCE SUMMARY';
    reportSub='Executive Statutory Compliance Audit, Filing Breakdown & Analysis';
    const done=obs.filter(o=>o.filing).length;
    const over=obs.filter(o=>!o.filing&&o.due<today).length;
    const pending=obs.length-done-over;
    const pct=obs.length?Math.round(done/obs.length*100):0;
    reportBadge=complianceStatus(obs);

    metricsHtml=`
      <div class="sheet-metric-box"><small>Total Obligations</small><strong>${obs.length}</strong></div>
      <div class="sheet-metric-box"><small>Filings Completed</small><strong style="color:var(--green)">${done}</strong></div>
      <div class="sheet-metric-box"><small>Pending Due</small><strong style="color:#2766db">${pending}</strong></div>
      <div class="sheet-metric-box"><small>Overdue Filings</small><strong style="color:${over>0?'#c36959':'var(--ink)'}">${over}</strong></div>
    `;

    chartsHtml=`
      <div class="report-charts-grid">
        <div class="report-chart-card">
          <h3>Filing Completion Status</h3>
          <div class="chart-content">
            ${renderSvgDonut(done,pending,over,obs.length,pct)}
            <div class="chart-legend">
              <div class="chart-legend-item"><span class="chart-legend-dot" style="background:#16866b"></span><span>Completed: <b>${done}</b></span></div>
              <div class="chart-legend-item"><span class="chart-legend-dot" style="background:#2766db"></span><span>Pending: <b>${pending}</b></span></div>
              <div class="chart-legend-item"><span class="chart-legend-dot" style="background:#c36959"></span><span>Overdue: <b>${over}</b></span></div>
            </div>
          </div>
        </div>
        <div class="report-chart-card">
          <h3>Filings by BIR Form Schedule</h3>
          <div class="chart-content" style="display:block">
            ${renderSvgFormBars(obs)}
          </div>
        </div>
      </div>
    `;

    defaultAnalysis=`Annual Statutory Compliance Analysis for Tax Year ${yearLabel}:\n\n`+
      `• Overall Standing: Current compliance rate is ${pct}%, with ${done} of ${obs.length} statutory obligations officially completed across all registered taxpayers.\n`+
      `• Pending Pipeline: ${pending} obligations remain in active status for upcoming quarter and monthly BIR filing deadlines.\n`+
      (over>0?`• Risk Alert: ${over} obligations are currently overdue and require urgent submission to prevent BIR surcharges and compromise penalties.\n`:`• Risk Status: Zero overdue obligations detected across all monitored taxpayer accounts.\n`)+
      `• Operational Guidance: Reconcile all withholding certificates and eFPS acknowledgments prior to the subsequent period cut-off.`;

    tableHeaderHtml=`
      <tr>
        <th>Taxpayer Name / TIN</th>
        <th>Entity</th>
        <th>Total Obs</th>
        <th>Completed</th>
        <th>Pending</th>
        <th>Overdue</th>
        <th>Rate</th>
        <th>Status</th>
      </tr>
    `;
    tableRowsHtml=clients.map(c=>{
      const cObs=obs.filter(o=>o.c.id===c.id);
      const cDone=cObs.filter(o=>o.filing).length;
      const cOver=cObs.filter(o=>!o.filing&&o.due<today).length;
      const cPend=cObs.length-cDone-cOver;
      const cPct=cObs.length?Math.round(cDone/cObs.length*100):0;
      const st=status(c,obs);
      return `<tr>
        <td><strong>${esc(c.name)}</strong><br><small class="subtle">${esc(c.tin)}</small></td>
        <td>${esc(c.type)}</td>
        <td>${cObs.length}</td>
        <td style="color:var(--green);font-weight:600">${cDone}</td>
        <td style="color:#63778c">${cPend}</td>
        <td style="color:${cOver>0?'#c36959':'inherit'};font-weight:${cOver>0?'700':'normal'}">${cOver}</td>
        <td><strong>${cPct}%</strong></td>
        <td>${badge(st)}</td>
      </tr>`;
    }).join('');

    const rep=getSummaryReportData(scope);
    pdfExportHeaders=rep.headers;
    pdfExportRows=rep.rows;
    exportFn=()=>{
      exportToExcel(rep.title,rep.headers,rep.rows);
      notify(`Compliance summary report for ${yearLabel} exported to Excel.`);
    };
  }

  const companyProfile=getWorkspaceCompanyProfile();
  const reportCompanyLogo=companyProfile.logo?`<img class="report-company-logo" src="${companyProfile.logo}" alt="${esc(companyProfile.name)} logo">`:'';
  m.innerHTML=`<div class="report-preview-wrap">
    <div class="preview-toolbar no-print">
      <div class="preview-toolbar-title">
        <strong>${reportTitle}</strong>
        <small>${reportSub}</small>
      </div>
      <div class="preview-toolbar-actions">
        <button type="button" class="btn secondary" id="preview-export-excel">Export to Excel</button>
        <button type="button" class="btn primary" id="preview-save-pdf"><span>💾 Save as PDF</span></button>
        <button type="button" class="btn" id="preview-close">✕ Close</button>
      </div>
    </div>

    <div class="analysis-editor-wrap no-print">
      <div class="analysis-editor-header">
        <label for="report-analysis-input">Custom Descriptive Analysis &amp; Commentary</label>
        <small>Edit commentary below to update the report document in real-time</small>
      </div>
      <textarea id="report-analysis-input" class="report-analysis-textarea" rows="6">${esc(defaultAnalysis)}</textarea>
    </div>

    <div class="report-sheet">
      <div class="sheet-header">
        <div class="sheet-company-heading">
          ${reportCompanyLogo}
          <div>
          <small class="report-company-name">${esc(companyProfile.name)}</small>
          <h2>${reportTitle}</h2>
          <p>${reportSub}</p>
          </div>
        </div>
        <div class="sheet-meta">
          <strong>TAX ${scope.from===scope.to?'YEAR':'YEARS'}: ${yearLabel}</strong><br>
          <span>Clients included: ${clients.length}</span><br>
          <span>Generated: ${todayFormatted}</span><br>
          <span>Standing: ${reportBadge}</span>
        </div>
      </div>

      <div class="sheet-metrics">
        ${metricsHtml}
      </div>

      ${chartsHtml}

      <div class="sheet-analysis-card">
        <h3>Executive Summary &amp; Descriptive Analysis</h3>
        <p id="report-analysis-text">${esc(defaultAnalysis)}</p>
      </div>

      <div>
        <h3 style="font:700 12.5px Manrope,sans-serif;text-transform:uppercase;letter-spacing:.6px;color:#244362;margin:0 0 10px">Detailed Records</h3>
        <div class="sheet-table-wrap">
          <table class="sheet-table">
            <thead>
              ${tableHeaderHtml}
            </thead>
            <tbody>
              ${tableRowsHtml||'<tr><td colspan="8" style="text-align:center;padding:15px;color:#8998a9">No records available.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>`;

  m.showModal();

  const textarea=m.querySelector('#report-analysis-input');
  const displayText=m.querySelector('#report-analysis-text');
  if(textarea&&displayText){
    textarea.addEventListener('input',()=>{
      displayText.textContent=textarea.value;
    });
  }

  m.querySelector('#preview-close')?.addEventListener('click',()=>closeModal(m));
  m.querySelector('#preview-export-excel')?.addEventListener('click',exportFn);
  m.querySelector('#preview-save-pdf')?.addEventListener('click',async()=>{
    const cleanName=reportTitle.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
    const pdfFilename=`${cleanName}-${scope.from}-${scope.to}.pdf`;
    if(window.taxguardDB?.savePdf){
      try{
        notify('Preparing PDF save dialog...');
        const res=await window.taxguardDB.savePdf(pdfFilename);
        if(res?.saved){
          notify('Report saved as PDF.');
          closeModal(m);
        }else if(res?.error){
          notify('Error: '+res.error);
        }
      }catch(err){
        notify('Could not save PDF: '+err.message);
      }
    }else{
      try{
        downloadClientPdf(pdfFilename,reportTitle,reportSub,yearLabel,displayText?.textContent||defaultAnalysis,pdfExportHeaders,pdfExportRows);
        notify('Report PDF downloaded to Downloads.');
        closeModal(m);
      }catch(err){
        notify('Download error: '+err.message);
      }
    }
  });
}


function getCurrentUserAuth(){
  try{
    const s=sessionStorage.getItem('taxguard_auth');
    return s?JSON.parse(s):{username:'admin',company:'EOO Tax & Accounting',role:'Admin'};
  }catch{
    return {username:'admin',company:'EOO Tax & Accounting',role:'Admin'};
  }
}

function openClientDocuments(clientId,parent){
  if(!window.taxguardDB?.listClientDocuments){notify('Document storage requires SQLite.');return;}
  const client=state.clients.find(c=>c.id===clientId);
  if(!client)return;
  const dialog=document.createElement('dialog');dialog.className='client-documents-dialog';
  const filingKeys=Object.keys(state.filings).filter(key=>key.startsWith(clientId+':')).sort().reverse();
  const renderDocuments=()=>{
    const documents=window.taxguardDB.listClientDocuments(clientId);
    dialog.innerHTML=`<h2>${esc(client.name)} — Documents</h2><p>Store filing receipts and supporting PDF or image files with this client. Maximum 5 MB per file.</p>
      <form id="document-upload-form"><label for="document-filing-key">Related filing</label><select id="document-filing-key"><option value="">General client document</option>${filingKeys.map(key=>`<option value="${esc(key)}">${esc(key.split(':').slice(1).join(' · '))}</option>`).join('')}</select><label for="client-document-file">Choose document</label><input id="client-document-file" type="file" accept="application/pdf,image/png,image/jpeg,image/webp,.pdf,.png,.jpg,.jpeg,.webp" required><div class="modal-actions"><button class="btn primary">Add document</button></div></form>
      <div class="table-scroll"><table><thead><tr><th>File</th><th>Filing</th><th>Added</th><th></th></tr></thead><tbody>${documents.map(doc=>`<tr><td>${esc(doc.filename)}</td><td>${esc(doc.filing_key?doc.filing_key.split(':').slice(1).join(' · '):'General')}</td><td>${esc(doc.created_at)}</td><td><button type="button" class="link" data-document-download="${doc.id}">Download</button> <button type="button" class="link" data-document-delete="${doc.id}">Delete</button></td></tr>`).join('')||'<tr><td colspan="4" class="empty">No documents stored.</td></tr>'}</tbody></table></div><div class="modal-actions"><button type="button" class="btn" id="close-documents">Back</button></div>`;
    dialog.querySelector('#close-documents').onclick=()=>dialog.close();
    dialog.querySelector('#document-upload-form').onsubmit=async event=>{
      event.preventDefault();const file=dialog.querySelector('#client-document-file').files[0];
      if(!file)return;
      if(file.size>5*1024*1024){notify('Document must be 5 MB or less.');return;}
      if(!['application/pdf','image/png','image/jpeg','image/webp'].includes(file.type)){notify('Choose a PDF, PNG, JPEG, or WebP file.');return;}
      try{
        const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('Could not read document.'));reader.readAsDataURL(file);});
        window.taxguardDB.saveClientDocument({clientId,filename:file.name,mime:file.type,base64,filingKey:dialog.querySelector('#document-filing-key').value});
        renderDocuments();notify('Document saved.');
      }catch(error){notify('Document not saved: '+error.message);}
    };
    dialog.querySelectorAll('[data-document-download]').forEach(button=>button.onclick=()=>{
      try{
        const doc=window.taxguardDB.getClientDocument(Number(button.dataset.documentDownload));
        const bytes=Uint8Array.from(atob(doc.content_base64),c=>c.charCodeAt(0));
        const url=URL.createObjectURL(new Blob([bytes],{type:doc.mime_type}));
        const link=document.createElement('a');link.href=url;link.download=doc.filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
      }catch(error){notify('Download failed: '+error.message);}
    });
    dialog.querySelectorAll('[data-document-delete]').forEach(button=>button.onclick=()=>{
      const confirm=document.createElement('dialog');confirm.innerHTML='<h2>Delete document?</h2><p>This removes the stored copy.</p><div class="modal-actions"><button type="button" class="btn" id="keep-document">Keep</button><button type="button" class="btn primary" id="confirm-document-delete">Delete</button></div>';
      document.body.append(confirm);const close=()=>{confirm.close();confirm.remove();};
      confirm.querySelector('#keep-document').onclick=close;
      confirm.querySelector('#confirm-document-delete').onclick=()=>{try{window.taxguardDB.deleteClientDocument(Number(button.dataset.documentDelete));close();renderDocuments();notify('Document deleted.');}catch(error){notify('Delete failed: '+error.message);}};
      confirm.showModal();
    });
  };
  renderDocuments();document.body.append(dialog);
  const parentClosed=()=>{if(dialog.open)dialog.close();};
  parent?.addEventListener('close',parentClosed,{once:true});
  dialog.addEventListener('close',()=>{parent?.removeEventListener('close',parentClosed);dialog.remove();},{once:true});
  dialog.showModal();
}
function persistCustomClientFields(fields){
  if(database?.saveClientFields)customClientFields=database.saveClientFields(fields);
  else{
    const clean=fields.map(field=>field.trim());
    if(clean.length>10||clean.some(field=>!field||field.length>50)||new Set(clean.map(field=>field.toLowerCase())).size!==clean.length)throw Error('Use up to 10 uniquely named client fields.');
    customClientFields=clean;localStorage.setItem('taxguard-client-fields',JSON.stringify(clean));
  }
  render();
}
function confirmClientFieldChange(title,message,action,label='Confirm change'){
  const dialog=workspaceDialog();
  dialog.innerHTML=`<h2>${esc(title)}</h2><p>${esc(message)}</p><p id="client-field-change-error" role="alert"></p><div class="modal-actions"><button type="button" class="btn" id="cancel-client-field-change">Cancel</button><button type="button" class="btn primary" id="confirm-client-field-change">${esc(label)}</button></div>`;
  dialog.querySelector('#cancel-client-field-change').onclick=()=>closeModal(dialog);
  dialog.querySelector('#confirm-client-field-change').onclick=()=>{
    try{action();closeModal(dialog);}catch(error){dialog.querySelector('#client-field-change-error').textContent=error.message;}
  };
  dialog.showModal();
}
function editClientField(oldName){
  const dialog=workspaceDialog();
  dialog.innerHTML=`<h2>Rename client field</h2><p>Values already entered for clients will move to the new field name.</p><form id="rename-client-field-form"><label for="rename-client-field-input">Field name</label><input id="rename-client-field-input" required maxlength="50" value="${esc(oldName)}"><p id="rename-client-field-error" role="alert"></p><div class="modal-actions"><button type="button" class="btn" id="cancel-rename-client-field">Cancel</button><button class="btn primary">Review rename</button></div></form>`;
  dialog.querySelector('#cancel-rename-client-field').onclick=()=>closeModal(dialog);
  dialog.querySelector('#rename-client-field-form').onsubmit=e=>{
    e.preventDefault();const next=dialog.querySelector('#rename-client-field-input').value.trim();
    if(next===oldName){closeModal(dialog);return;}
    if(!next||customClientFields.some(field=>field!==oldName&&field.toLowerCase()===next.toLowerCase())){dialog.querySelector('#rename-client-field-error').textContent='Choose a unique field name.';return;}
    confirmClientFieldChange('Confirm field rename',`Rename “${oldName}” to “${next}”? Existing client values will be kept.`,()=>{
      if(database?.renameClientField){database.renameClientField(oldName,next,databaseRevision);restoreDatabase();customClientFields=database.getClientFields();}
      else{
        for(const client of state.clients){if(Object.hasOwn(client.customFields||{},oldName)){client.customFields[next]=client.customFields[oldName];delete client.customFields[oldName];}}
        save();
        persistCustomClientFields(customClientFields.map(field=>field===oldName?next:field));
      }
      closeModal(dialog);render();notify('Client field renamed.');
    },'Rename field');
  };
  dialog.showModal();
}
function backupSettingsPanel(){
  if(!database?.saveBackup)return '';
  return `<div class="panel backup-panel" style="margin-top:24px"><div class="panel-head"><div><h2>Backup &amp; restore</h2><p>The desktop app saves a daily SQLite backup on launch. You can also save a complete copy of clients, filings, users, documents, company profile, and calendar adjustments.</p></div></div><div class="panel-body storage-actions"><button type="button" class="btn primary" id="save-full-backup">Save backup</button><button type="button" class="btn secondary" id="restore-full-backup">Restore backup</button></div></div>`;
}
function userPhotoMarkup(username,photo){
  return typeof photo==='string'&&/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/]+={0,2}$/.test(photo)
    ?`<img src="${photo}" alt="${esc(username)} profile picture">`
    :esc(getUserInitials(username));
}
function readUserProfilePhoto(file){
  return new Promise((resolve,reject)=>{
    if(!['image/png','image/jpeg','image/webp'].includes(file.type))return reject(Error('Choose a PNG, JPEG, or WebP image.'));
    if(file.size>2*1024*1024)return reject(Error('Profile picture must be smaller than 2 MB.'));
    const reader=new FileReader();
    reader.onerror=()=>reject(Error('Could not read that image.'));
    reader.onload=()=>{
      const data=String(reader.result||'');
      const image=new Image();
      image.onload=()=>resolve(data);
      image.onerror=()=>reject(Error('The selected file is not a valid image.'));
      image.src=data;
    };
    reader.readAsDataURL(file);
  });
}

function getWorkspaceCompanyName(){
  if(window.taxguardDB?.getCompanyName){
    try{return window.taxguardDB.getCompanyName();}catch(e){}
  }
  return localStorage.getItem('taxguard_company_name')||getCurrentUserAuth().company||'EOO Tax & Accounting';
}

let lastCompanyProfile=null;
function getWorkspaceCompanyProfile(){
  if(window.taxguardDB?.getCompanyProfile){
    try{
      const profile=window.taxguardDB.getCompanyProfile();
      lastCompanyProfile=profile;
      return profile;
    }catch(e){}
  }
  return lastCompanyProfile||{name:getWorkspaceCompanyName(),logo:localStorage.getItem('taxguard_company_logo')||'',description:localStorage.getItem('taxguard_company_description')||''};
}
let companyProfileDraft=null;

function setCompanyLogoSlot(element,logo,company){
  if(!element)return;
  element.classList.add('company-logo-slot');
  if(logo){
    element.innerHTML=`<img src="${logo}" alt="${esc(company)} logo">`;
    element.classList.add('has-company-logo');
  }else{
    element.textContent=getUserInitials(company);
    element.classList.remove('has-company-logo');
  }
}

function applyWorkspaceCompanyProfile(profile){
  lastCompanyProfile=profile;
  const company=profile.name;
  const currentAuth=getCurrentUserAuth();
  const updatedAuth={...currentAuth,company};
  sessionStorage.setItem('taxguard_auth',JSON.stringify(updatedAuth));
  const firmEl=document.querySelector('.firm .firm-info');
  if(firmEl)firmEl.innerHTML=`${esc(company)}<small>${esc(profile.description||'Compliance team')}</small>`;
  const loginDisplay=document.querySelector('#login-company-display');
  if(loginDisplay)loginDisplay.textContent=company;
  setCompanyLogoSlot(document.querySelector('.firm .avatar'),profile.logo,company);
  setCompanyLogoSlot(document.querySelector('.firm-chip .avatar'),profile.logo,company);
}

function persistWorkspaceCompanyProfile(profile){
  const saved=window.taxguardDB?.saveCompanyProfile
    ?window.taxguardDB.saveCompanyProfile(profile)
    :profile;
  if(!window.taxguardDB){
    localStorage.setItem('taxguard_company_name',saved.name);
    localStorage.setItem('taxguard_company_logo',saved.logo||'');
    localStorage.setItem('taxguard_company_description',saved.description||'');
    const users=fetchWorkstationUsers().map(user=>({...user,company_name:saved.name}));
    localStorage.setItem('taxguard_users',JSON.stringify(users));
  }
  applyWorkspaceCompanyProfile(saved);
  return saved;
}

function persistWorkspaceCompanyName(company){
  return persistWorkspaceCompanyProfile({...getWorkspaceCompanyProfile(),name:company}).name;
}

applyWorkspaceCompanyProfile(getWorkspaceCompanyProfile());
window.refreshCompanyProfile=()=>applyWorkspaceCompanyProfile(getWorkspaceCompanyProfile());

function fetchWorkstationUsers(){
  if(window.taxguardDB?.getUsers){
    try{const res=window.taxguardDB.getUsers();if(Array.isArray(res))return res;}catch(e){}
  }
  try{
    const stored=localStorage.getItem('taxguard_users');
    if(stored)return JSON.parse(stored);
  }catch(e){}
  return [{id:1,username:'admin',company_name:'EOO Tax & Accounting',role:'Admin',is_active:1,created_at:'2026-01-01'}];
}

function persistWorkstationUser(userData){
  if(window.taxguardDB?.saveUser){
    return window.taxguardDB.saveUser(userData);
  }
  let users=fetchWorkstationUsers();
  if(userData.id){
    const idx=users.findIndex(u=>u.id===Number(userData.id));
    if(idx>=0){
      users[idx]={
        ...users[idx],
        company_name:userData.company_name||users[idx].company_name,
        profile_photo:userData.profile_photo!==undefined?userData.profile_photo:(users[idx].profile_photo||''),
        role:userData.role||users[idx].role,
        is_active:userData.is_active!==undefined?(userData.is_active?1:0):users[idx].is_active,
        updated_at:new Date().toISOString()
      };
      if(userData.password) users[idx].password=userData.password;
    }
  }else{
    if(users.some(u=>u.username.toLowerCase()===userData.username.toLowerCase()))throw Error('Username already exists.');
    users.push({
      id:Date.now(),
      username:userData.username,
      company_name:userData.company_name||'EOO Tax & Accounting',
      profile_photo:userData.profile_photo||'',
      role:userData.role||'Staff',
      password:userData.password,
      is_active:userData.is_active!==undefined?(userData.is_active?1:0):1,
      created_at:new Date().toISOString()
    });
  }
  localStorage.setItem('taxguard_users',JSON.stringify(users));
  return users;
}

function deleteWorkstationUser(id){
  if(window.taxguardDB?.deleteUser){
    return window.taxguardDB.deleteUser(id);
  }
  let users=fetchWorkstationUsers();
  users=users.filter(u=>u.id!==Number(id));
  localStorage.setItem('taxguard_users',JSON.stringify(users));
  return users;
}

function openUserAccountModal(userId,initialData=null){
  const users=fetchWorkstationUsers();
  const currentAuth=getCurrentUserAuth();
  const user=userId?users.find(u=>u.id===Number(userId)):null;
  const isEditing=!!user;
  const isCurrent=isEditing&&user.username.toLowerCase()===currentAuth.username.toLowerCase();
  const m=workspaceDialog();
  if(!m)return;

  const totalActive=users.filter(u=>u.is_active).length;
  const cannotDeactivate=isEditing&&user.is_active&&totalActive<=1;
  const canDelete=isEditing&&!isCurrent&&!(user.is_active&&totalActive<=1);

  const usernameVal=initialData?.username!==undefined?initialData.username:(user?.username||'');
  const companyVal=initialData?.company_name!==undefined?initialData.company_name:(user?.company_name||'EOO Tax & Accounting');
  const roleVal=initialData?.role!==undefined?initialData.role:(user?.role||'Staff');
  const isActiveVal=initialData?.is_active!==undefined?initialData.is_active:((!user||user.is_active)?1:0);
  const passwordVal=initialData?.password!==undefined?initialData.password:'';
  let photoDraft=initialData?.profile_photo!==undefined?initialData.profile_photo:(user?.profile_photo||'');

  m.innerHTML=`
    <h2>${isEditing?(isCurrent?'Edit Your Account Info':'Edit User Account'):'Add New User Account'}</h2>
    <p>${isEditing?'Update workstation identity, display name, role, or change password.':'Create new login credentials for staff or tax associates.'}</p>
    <form id="user-account-form" style="margin-top:16px">
      <label>Profile picture</label>
      <div class="user-photo-editor"><span class="avatar ${photoDraft?'has-user-photo':''}" id="user-photo-preview">${userPhotoMarkup(usernameVal||'New user',photoDraft)}</span>
        <div class="user-photo-actions"><button type="button" class="btn" id="choose-user-photo">Change picture</button><button type="button" class="btn" id="remove-user-photo" ${photoDraft?'':'disabled'}>Remove</button><small>PNG, JPEG, or WebP. Maximum 2 MB.</small></div></div>
      <input type="file" id="user-photo-input" accept="image/png,image/jpeg,image/webp" hidden>
      <small id="user-photo-error" role="status" style="color:#b45309"></small>
      <label for="user-input-username">Username</label>
      <input id="user-input-username" name="username" required ${isEditing?'readonly':''} value="${esc(usernameVal)}" placeholder="e.g. jdelacruz" pattern="^[a-zA-Z0-9._ -]+$" title="Letters, numbers, spaces, dots, dashes, or underscores only" style="${isEditing?'background:#f1f5f9;cursor:not-allowed':''}">
      ${isEditing?'':'<small style="display:block;color:#64748b;font-size:11px;margin-top:3px">Login username (letters, numbers, spaces, dots, dashes, underscores)</small>'}

      <label for="user-input-company">Display / Firm Name</label>
      <input id="user-input-company" name="company_name" required value="${esc(companyVal)}" placeholder="Firm or team display name">

      <div class="form-grid">
        <div>
          <label for="user-input-role">Workstation Role</label>
          <select id="user-input-role" name="role">
            <option value="Admin" ${roleVal==='Admin'?'selected':''}>Admin</option>
            <option value="Staff" ${roleVal==='Staff'?'selected':''}>Staff</option>
            <option value="Tax Associate" ${roleVal==='Tax Associate'?'selected':''}>Tax Associate</option>
            <option value="Auditor" ${roleVal==='Auditor'?'selected':''}>Auditor</option>
          </select>
        </div>
        <div>
          <label for="user-input-status">Account Standing</label>
          <div style="padding:10px 0">
            <label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:${cannotDeactivate?'not-allowed':'pointer'};margin:0">
              <input type="checkbox" name="is_active" ${isActiveVal?'checked':''} ${cannotDeactivate?'disabled':''} style="width:auto">
              <span>Active Account</span>
            </label>
            ${cannotDeactivate?'<small style="color:#c36959;display:block;font-size:10px;margin-top:4px">Cannot deactivate only active user</small>':''}
          </div>
        </div>
      </div>

      <label for="user-input-password">${isEditing?'Change Password (leave blank to keep current)':'Account Password'}</label>
      <div class="input-with-icon" style="position:relative;display:flex;align-items:center">
        <span class="input-icon" style="position:absolute;left:13px;font-size:13px;color:#8899aa;pointer-events:none;user-select:none">🔒</span>
        <input id="user-input-password" type="password" name="password" ${isEditing?'':'required'} minlength="6" value="${esc(passwordVal)}" placeholder="${isEditing?'Enter new password to change':'At least 6 characters'}" style="padding-left:36px;padding-right:42px;width:100%">
        <button type="button" id="toggle-user-password" class="pw-toggle-btn" title="Show password" aria-label="Show password" style="position:absolute;right:8px;background:none;border:0;cursor:pointer;font-size:15px;color:#64748b;padding:4px 6px;line-height:1">👁</button>
      </div>

      <div id="user-modal-error-alert" style="display:none;background:#fff0ee;border:1px solid #fed7d7;color:#c36959;padding:9px 13px;border-radius:6px;font-size:12px;margin-top:14px"></div>

      <div class="modal-actions">
        ${canDelete?'<button type="button" class="btn danger-btn" id="delete-user-from-modal">Delete account</button>':''}
        <button type="button" class="btn" id="cancel-user-modal">Cancel</button>
        <button type="submit" class="btn primary" id="save-user-btn">${isEditing?'Save changes':'Create account'}</button>
      </div>
    </form>
  `;

  m.classList.remove('closing');
  m.showModal();
  const photoInput=m.querySelector('#user-photo-input');
  const photoPreview=m.querySelector('#user-photo-preview');
  const updatePhotoPreview=()=>{
    photoPreview.innerHTML=userPhotoMarkup(m.querySelector('#user-input-username').value||'New user',photoDraft);
    photoPreview.classList.toggle('has-user-photo',!!photoDraft);
    m.querySelector('#remove-user-photo').disabled=!photoDraft;
  };
  m.querySelector('#choose-user-photo').onclick=()=>photoInput.click();
  m.querySelector('#remove-user-photo').onclick=()=>{photoDraft='';photoInput.value='';updatePhotoPreview();};
  photoInput.onchange=async()=>{
    if(!photoInput.files?.[0])return;
    try{photoDraft=await readUserProfilePhoto(photoInput.files[0]);m.querySelector('#user-photo-error').textContent='';updatePhotoPreview();}
    catch(error){m.querySelector('#user-photo-error').textContent=error.message;photoInput.value='';}
  };
  m.querySelector('#user-input-username').addEventListener('input',updatePhotoPreview);

  const pwInput = m.querySelector('#user-input-password');
  const pwToggle = m.querySelector('#toggle-user-password');
  if(pwInput && pwToggle){
    pwToggle.addEventListener('click', () => {
      const isPw = pwInput.type === 'password';
      pwInput.type = isPw ? 'text' : 'password';
      pwToggle.textContent = isPw ? '🙈' : '👁';
      pwToggle.title = isPw ? 'Hide password' : 'Show password';
      pwToggle.setAttribute('aria-label', isPw ? 'Hide password' : 'Show password');
    });
  }

  m.querySelector('#cancel-user-modal')?.addEventListener('click',()=>{
    closeModal(m,()=>{m.innerHTML='';});
    try{m.close();}catch(e){}
    m.classList.remove('closing');
    m.innerHTML='';
  });
  m.querySelector('#delete-user-from-modal')?.addEventListener('click',()=>{
    confirmDeleteUser(user.id,user.username);
  });
  m.querySelector('#user-account-form')?.addEventListener('submit',e=>{
    e.preventDefault();
    const errorAlert=m.querySelector('#user-modal-error-alert');
    if(errorAlert) errorAlert.style.display='none';
    const fd=new FormData(e.target);
    const username=String(fd.get('username')||'').trim();
    const company_name=String(fd.get('company_name')||'').trim();
    const role=String(fd.get('role')||'Staff');
    const is_active=cannotDeactivate?1:(fd.get('is_active')!==null?1:0);
    const password=String(fd.get('password')||'');

    const accountData={
      id:user?.id,
      username,
      company_name,
      role,
      is_active,
      profile_photo:photoDraft,
      password:password.trim()||undefined
    };

    if(!isEditing){
      if(!username){
        if(errorAlert){errorAlert.textContent='Username is required.';errorAlert.style.display='block';}
        notify('Error: Username is required.');
        return;
      }
      if(!/^[a-zA-Z0-9._ -]+$/.test(username)){
        if(errorAlert){errorAlert.textContent='Username must contain only letters, numbers, spaces, dots, dashes, or underscores.';errorAlert.style.display='block';}
        notify('Error: Username must contain only letters, numbers, spaces, dots, dashes, or underscores.');
        return;
      }
      if(users.some(u=>u.username.toLowerCase()===username.toLowerCase())){
        if(errorAlert){errorAlert.textContent='Username already exists.';errorAlert.style.display='block';}
        notify('Error: Username already exists.');
        return;
      }
      if(!password||password.trim().length<6){
        if(errorAlert){errorAlert.textContent='Password must be at least 6 characters.';errorAlert.style.display='block';}
        notify('Error: Password must be at least 6 characters.');
        return;
      }

      confirmCreateUser(accountData,()=>{
        openUserAccountModal(null,accountData);
      });
      return;
    }

    try{
      persistWorkstationUser(accountData);

      if(isCurrent||(!isEditing&&user?.username===currentAuth.username)){
        const updatedAuth={...currentAuth,company:company_name,role,profile_photo:photoDraft};
        sessionStorage.setItem('taxguard_auth',JSON.stringify(updatedAuth));
        const firmEl=document.querySelector('.firm .firm-info');
        if(firmEl) firmEl.innerHTML=`${esc(company_name)}<small>Compliance team</small>`;
        const loginDisplay=document.querySelector('#login-company-display');
        if(loginDisplay) loginDisplay.textContent=company_name;
        const headerAvatar=document.querySelector('.header-right .avatar');
        if(headerAvatar){
          setUserAvatarSlot(headerAvatar,updatedAuth.username,photoDraft);
        }
        window.refreshCompanyProfile?.();
      }

      closeModal(m,()=>{
        m.innerHTML='';
      });
      try{m.close();}catch(err){}
      m.classList.remove('closing');
      m.innerHTML='';
      render();
      notify('User account updated successfully.');
    }catch(err){
      if(errorAlert){
        errorAlert.textContent=err.message||'Could not save user account.';
        errorAlert.style.display='block';
      }
      notify('Error: '+err.message);
    }
  });
}
document.querySelector('.header-user-avatar')?.addEventListener('click',()=>{
  const username=getCurrentUserAuth().username;
  const user=fetchWorkstationUsers().find(u=>u.username.toLowerCase()===String(username||'').toLowerCase());
  if(user)openUserAccountModal(user.id);
});

function confirmCreateUser(userData,onBack){
  const m=workspaceDialog();
  if(!m)return;
  m.innerHTML=`
    <h2>Confirm New User Account</h2>
    <p>Please review and confirm the account details before adding this user to the workstation.</p>
    
    <div style="background:#f8fafc;border:1px solid var(--line);border-radius:9px;padding:16px 20px;margin:18px 0;display:grid;gap:11px">
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #edf2f7;padding-bottom:9px">
        <span style="font-size:11px;color:#64748b;text-transform:uppercase;font-weight:600;letter-spacing:0.5px">Login Username</span>
        <strong style="font-size:13px;color:#1e293b">${esc(userData.username)}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #edf2f7;padding-bottom:9px">
        <span style="font-size:11px;color:#64748b;text-transform:uppercase;font-weight:600;letter-spacing:0.5px">Display / Firm Name</span>
        <strong style="font-size:13px;color:#1e293b">${esc(userData.company_name)}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #edf2f7;padding-bottom:9px">
        <span style="font-size:11px;color:#64748b;text-transform:uppercase;font-weight:600;letter-spacing:0.5px">Workstation Role</span>
        <span class="badge" style="background:#e8f4fd;color:#2766db;font-weight:700">${esc(userData.role)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:11px;color:#64748b;text-transform:uppercase;font-weight:600;letter-spacing:0.5px">Account Status</span>
        <span class="badge ${userData.is_active?'active':'inactive'}">${userData.is_active?'Active':'Inactive'}</span>
      </div>
    </div>

    <div id="confirm-create-error-alert" style="display:none;background:#fff0ee;border:1px solid #fed7d7;color:#c36959;padding:9px 13px;border-radius:6px;font-size:12px;margin-bottom:16px"></div>

    <p style="font-size:12px;color:#64748b;margin:0 0 16px;line-height:1.5">Are you sure you want to create this account? This user will be authorized to access the TaxGuard workstation.</p>

    <div class="modal-actions">
      <button type="button" class="btn" id="btn-back-create-user">← Back to edit</button>
      <button type="button" class="btn primary" id="btn-confirm-create-user">Confirm &amp; create account</button>
    </div>
  `;

  m.classList.remove('closing');
  m.showModal();

  m.querySelector('#btn-back-create-user')?.addEventListener('click',()=>{
    dismissWorkspaceDialog(m);
  });

  m.querySelector('#btn-confirm-create-user')?.addEventListener('click',()=>{
    const confirmAlert=m.querySelector('#confirm-create-error-alert');
    try{
      persistWorkstationUser(userData);
      const editor=m.workspaceParent;
      closeModal(m,()=>{
        m.innerHTML='';
      });
      try{m.close();}catch(e){}
      if(editor?.open)editor.close();
      m.classList.remove('closing');
      m.innerHTML='';
      render();
      notify('New user account created.');
    }catch(err){
      if(confirmAlert){
        confirmAlert.textContent=err.message||'Could not create user account.';
        confirmAlert.style.display='block';
      }
      notify('Error: '+err.message);
    }
  });
}

function confirmDeleteUser(userId,username){
  const m=workspaceDialog();
  if(!m)return;
  m.innerHTML=`
    <h2>Delete User Account?</h2>
    <p>Are you sure you want to delete account <strong>${esc(username)}</strong>? This user will no longer be able to log in to TaxGuard.</p>
    <div class="modal-actions">
      <button type="button" class="btn" id="cancel-delete-user">Cancel</button>
      <button type="button" class="btn" id="confirm-delete-user-btn" style="background:#c36959;border-color:#c36959;color:white">Delete user</button>
    </div>
  `;
  m.classList.remove('closing');
  m.showModal();
  m.querySelector('#cancel-delete-user')?.addEventListener('click',()=>{
    closeModal(m,()=>{m.innerHTML='';});
    try{m.close();}catch(e){}
    m.classList.remove('closing');
    m.innerHTML='';
  });
  m.querySelector('#confirm-delete-user-btn')?.addEventListener('click',()=>{
    try{
      deleteWorkstationUser(userId);
      const editor=m.workspaceParent;
      closeModal(m,()=>{m.innerHTML='';});
      try{m.close();}catch(e){}
      if(editor?.open)editor.close();
      m.classList.remove('closing');
      m.innerHTML='';
      render();
      notify(`User ${username} deleted.`);
    }catch(err){
      notify('Could not delete user: '+err.message);
    }
  });
}

settings=function(){
  const current=document.body.dataset.theme||'blue';
  const obs=obligations();
  const done=obs.filter(o=>o.filing).length;
  const over=obs.filter(o=>!o.filing&&o.due<today).length;
  const pct=obs.length?Math.round(done/obs.length*100):0;

  const users=fetchWorkstationUsers();
  const currentAuth=getCurrentUserAuth();
  const companyProfile=companyProfileDraft||getWorkspaceCompanyProfile();
  const companyName=companyProfile.name;
  const companyLogoPreview=companyProfile.logo
    ?`<img src="${companyProfile.logo}" alt="${esc(companyName)} logo">`
    :`<span>${esc(getUserInitials(companyName))}</span>`;
  const usersRowsHtml=users.map(u=>{
    const isCurrent=u.username.toLowerCase()===currentAuth.username.toLowerCase();
    const initials=getUserInitials(u.username);
    const roleColors={
      Admin:{bg:'#eef4fd',text:'#2766db',border:'#d0e2fb'},
      Staff:{bg:'#f0fdf4',text:'#16866b',border:'#bbf7d0'},
      'Tax Associate':{bg:'#faf5ff',text:'#7656c7',border:'#e9d5ff'},
      Auditor:{bg:'#fffbeb',text:'#b45309',border:'#fde68a'}
    }[u.role]||{bg:'#edf2f7',text:'#334e68',border:'#cbd5e1'};

    return `<tr class="user-account-row" data-user-id="${u.id}" role="button" tabindex="0" aria-label="Edit user ${esc(u.username)}">
      <td style="padding:12px 16px">
        <div style="display:flex;align-items:center;gap:10px">
          <span class="avatar ${u.profile_photo?'has-user-photo':''}" style="width:30px;height:30px;min-width:30px;font-size:11px;font-weight:700;background:#e2e8f0;color:#334e68">${userPhotoMarkup(u.username,u.profile_photo)}</span>
          <div>
            <strong style="font-size:13px">${esc(u.username)}</strong>
            ${isCurrent?'<span class="badge" style="background:#e8f4fd;color:#2766db;font-weight:700;margin-left:6px;font-size:9.5px;vertical-align:middle">Current Account</span>':''}
          </div>
        </div>
      </td>
      <td style="padding:12px 16px;color:#334e68">${esc(u.company_name||'EOO Tax & Accounting')}</td>
      <td style="padding:12px 16px">
        <span class="badge" style="background:${roleColors.bg};color:${roleColors.text};border:1px solid ${roleColors.border};font-weight:700">${esc(u.role||'Staff')}</span>
      </td>
      <td style="padding:12px 16px">
        ${u.is_active?'<span class="badge active">Active</span>':'<span class="badge inactive">Inactive</span>'}
      </td>
    </tr>`;
  }).join('');

  return heading('Settings','Personalize the TaxGuard workspace.','')+`
    <div class="profile-settings-grid"><div class="panel company-settings-panel">
      <div class="panel-head"><div><h2>Company Profile</h2><p>Set the firm name and logo shown throughout this workspace and in reports.</p></div></div>
      <div class="panel-body">
        <form id="company-profile-form" class="company-profile-form">
          <div class="company-logo-editor">
            <button type="button" class="company-logo-preview ${companyProfile.logo?'has-logo':''}" id="company-logo-preview" aria-label="Preview or change company logo" title="Preview or change company logo">${companyLogoPreview}</button>
            <div><span>Company Logo</span><small>Click the logo to preview or change it.</small><input id="company-logo-input" name="company_logo" type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/x-icon,image/vnd.microsoft.icon,.jpg,.jpeg,.jfif,.ico"><small id="company-logo-error" class="company-logo-error" aria-live="polite"></small></div>
          </div>
          <div class="company-name-editor"><label for="company-name-input" style="margin-top:0">Company / Firm Name</label><input id="company-name-input" name="company_name" required maxlength="120" value="${esc(companyName)}"></div>
          <div class="company-description-editor"><label for="company-description-input">Company Description</label><textarea id="company-description-input" name="company_description" maxlength="500" rows="2" placeholder="Briefly describe your company">${esc(companyProfile.description||'')}</textarea></div>
          <button type="submit" class="btn primary company-profile-save">Save company profile</button>
        </form>
      </div>
    </div>
    <div class="panel custom-fields-panel"><div class="panel-head"><div><h2>Client list fields</h2><p>Manage extra details shown for each client.</p></div></div><div class="panel-body"><div class="selected-pills">${customClientFields.map(field=>`<span class="form-pill">${esc(field)} <button type="button" data-edit-client-field="${esc(field)}" aria-label="Rename ${esc(field)}" title="Rename field">✎</button><button type="button" data-remove-client-field="${esc(field)}" aria-label="Remove ${esc(field)}" title="Remove field">×</button></span>`).join('')||'<span class="subtle">No custom fields.</span>'}</div><form id="add-client-field-form" class="storage-actions"><input id="new-client-field" maxlength="50" required placeholder="Field name, e.g. RDO"><button class="btn secondary">Add field</button></form></div></div></div>
    <div class="settings-grid">
      <div class="panel settings-panel">
        <div class="panel-head"><div><h2>Color theme</h2><p>Choose a preset workspace accent color.</p></div></div>
        <div class="theme-options">${[['blue','Blue'],['navy','Navy'],['green','Green'],['purple','Purple'],['orange','Orange'],['red','Red']].map(([v,l])=>`<button class="theme-option ${current===v?'active':''}" data-theme="${v}"><span class="theme-swatch ${v}"></span><span>${l}</span>${current===v?'<b>✓</b>':''}</button>`).join('')}</div>
      </div>
      <div class="panel storage-panel"><div class="panel-head"><div><h2>Data export &amp; import</h2><p>Choose specific records to move between TaxGuard workstations. Full backup and restore are available below.</p></div></div><div class="panel-body data-transfer-actions"><button type="button" class="btn secondary" id="open-data-export">Export selected data</button><button type="button" class="btn secondary" id="open-data-import">Import selected data</button><small>Excel workbooks can include clients, filings, schedules, documents, and the company profile. User accounts and passwords are excluded.</small></div></div>
    </div>
    <div class="panel users-panel" style="margin-top:24px"><div class="panel-head"><div><h2>User Account Management</h2><p>Manage workstation accounts.</p></div><button type="button" class="btn primary" id="btn-add-user">+ Add user account</button></div><div class="panel-body" style="padding:0"><div class="table-scroll"><table><thead><tr><th>User account</th><th>Firm / display name</th><th>Role</th><th>Status</th></tr></thead><tbody>${usersRowsHtml}</tbody></table></div></div></div>
    <div class="panel reports-panel" style="margin-top:24px"><div class="panel-head"><div><h2>Compliance &amp; Audit Reports</h2><p>Click any report card below to open its executive preview with visual charts, custom commentary, and PDF or Excel export.</p></div><span class="subtle">${year} TAX YEAR</span></div><div class="panel-body"><div class="report-stat-strip"><div class="report-stat-card"><small>Total obligations (${year})</small><strong>${obs.length}</strong></div><div class="report-stat-card"><small>Filings completed</small><strong style="color:var(--green)">${done}</strong></div><div class="report-stat-card"><small>Compliance rate</small><strong>${pct}%</strong></div><div class="report-stat-card"><small>Overdue items</small><strong style="color:${over>0?'#c36959':'var(--ink)'}">${over}</strong></div></div><div class="reports-grid"><div class="report-card" id="open-report-preview" data-report="summary" role="button" tabindex="0"><div class="report-card-head"><span class="report-icon">📊</span><div><strong>Annual Compliance Summary</strong><small>Client compliance standing, completion percentage, and obligation counts for ${year}.</small></div></div><div class="report-card-footer"><span class="report-open-link">👁️ Open preview &amp; export &rarr;</span><span class="badge" style="background:#eef4fd;color:#2766db;font-weight:600">PDF / Excel</span></div></div><div class="report-card" id="export-filings-report" data-report="filings" role="button" tabindex="0"><div class="report-card-head"><span class="report-icon">📑</span><div><strong>Filing Audit Log</strong><small>Detailed submission trail with BIR confirmation numbers, filing dates, and periods.</small></div></div><div class="report-card-footer"><span class="report-open-link">👁️ Open preview &amp; export &rarr;</span><span class="badge" style="background:#eef4fd;color:#2766db;font-weight:600">PDF / Excel</span></div></div><div class="report-card" id="export-clients-report" data-report="clients" role="button" tabindex="0"><div class="report-card-head"><span class="report-icon">👥</span><div><strong>Client Master Roster</strong><small>Complete directory of registered taxpayers, TINs, tax types, and required BIR forms.</small></div></div><div class="report-card-footer"><span class="report-open-link">👁️ Open preview &amp; export &rarr;</span><span class="badge" style="background:#eef4fd;color:#2766db;font-weight:600">PDF / Excel</span></div></div></div></div></div>${backupSettingsPanel()}`;
};
const dataSectionLabels={clients:'Clients & tax profiles',filings:'Filing records',forms:'Form schedules',documents:'Client documents',companyProfile:'Company profile'};
function dataSectionChoices(available,defaults=available){
  return `<div class="data-section-choices">${available.map(key=>`<label><input type="checkbox" name="data-section" value="${key}" ${defaults.includes(key)?'checked':''}><span>${dataSectionLabels[key]}</span></label>`).join('')}</div>`;
}
function selectedDataSections(dialog){return [...dialog.querySelectorAll('input[name="data-section"]:checked')].map(input=>input.value);}
function openDataExportDialog(){
  if(!database?.exportDataXlsx){notify('Selective export requires SQLite.');return;}
  const dialog=workspaceDialog();
  const clients=(state.clients||[]).slice().sort((a,b)=>String(a.name).localeCompare(String(b.name)));
  const currentYear=new Date().getFullYear();
  dialog.classList.add('data-export-modal');
  dialog.innerHTML=`<h2>Export client data</h2><p>Select clients and a year range. Each selected client includes their profile and filing records for the selected years.</p><div class="data-client-toolbar"><input id="export-client-search" type="search" placeholder="Search by client name or TIN"><button type="button" class="btn" id="select-all-export-clients">Select all</button><button type="button" class="btn" id="clear-export-clients">Clear all</button></div><form id="data-export-form"><div class="data-transfer-client-table"><table><thead><tr><th></th><th>Client</th><th>TIN</th></tr></thead><tbody>${clients.map(c=>`<tr data-client-search="${esc(`${c.name} ${c.tin||''}`.toLowerCase())}"><td><input type="checkbox" name="export-client" value="${c.id}"></td><td>${esc(c.name)}</td><td>${esc(c.tin||'')}</td></tr>`).join('')}</tbody></table></div><div class="data-transfer-year-range"><label>From year<input type="number" id="export-year-from" min="2000" max="2100" value="${currentYear}"></label><label>To year<input type="number" id="export-year-to" min="2000" max="2100" value="${currentYear}"></label></div><div class="modal-actions"><button type="button" class="btn" id="cancel-data-export">Cancel</button><button class="btn primary">Export Excel workbook</button></div></form>`;
  const rows=[...dialog.querySelectorAll('[data-client-search]')];
  dialog.querySelector('#export-client-search').oninput=e=>{const query=e.target.value.trim().toLowerCase();rows.forEach(row=>row.hidden=!!query&&!row.dataset.clientSearch.includes(query));};
  dialog.querySelector('#select-all-export-clients').onclick=()=>rows.filter(row=>!row.hidden).forEach(row=>row.querySelector('input').checked=true);
  dialog.querySelector('#clear-export-clients').onclick=()=>rows.filter(row=>!row.hidden).forEach(row=>row.querySelector('input').checked=false);
  dialog.querySelector('#cancel-data-export').onclick=()=>closeModal(dialog);
  dialog.querySelector('#data-export-form').onsubmit=async e=>{
    e.preventDefault();
    try{
      const clientIds=[...dialog.querySelectorAll('input[name="export-client"]:checked')].map(input=>Number(input.value));
      const yearFrom=Number(dialog.querySelector('#export-year-from').value),yearTo=Number(dialog.querySelector('#export-year-to').value);
      if(!clientIds.length){notify('Select at least one client.');return;}
      if(!Number.isInteger(yearFrom)||!Number.isInteger(yearTo)||yearFrom>yearTo){notify('Enter a valid year range.');return;}
      const options={clientIds,yearFrom,yearTo};
      if(database.saveDataXlsx){
        const result=await database.saveDataXlsx(['clients','filings'],options);
        if(result?.saved){closeModal(dialog);notify('Selected data exported.');}else notify('Export cancelled.');
        return;
      }
      const base64=await database.exportDataXlsx(['clients','filings'],options);
      const bytes=Uint8Array.from(atob(base64),character=>character.charCodeAt(0));
      const url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
      const link=document.createElement('a');link.href=url;link.download=`TaxGuard-data-${new Date().toISOString().slice(0,10)}.xlsx`;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
      closeModal(dialog);notify('Selected data exported.');
    }catch(error){notify('Export failed: '+error.message);}
  };
  dialog.showModal();
}
function dataImportSummary(summary,sections){
  return `<div class="data-import-preview"><strong>Import preview</strong><ul>${sections.map(key=>{
    const info=summary[key];
    const detail=key==='forms'?`${info.new} new, ${info.updated} updated`:key==='companyProfile'?'Company name and logo will be replaced':`${info.new} new, ${info.skipped} already present`;
    return `<li>${dataSectionLabels[key]}: ${detail}</li>`;
  }).join('')}</ul><small>Existing clients with the same TIN and filings with the same key are kept. Only selected categories are imported.</small></div>`;
}
function openDataImportDialog(){
  if(!database?.importData){notify('Selective import requires SQLite.');return;}
  const dialog=workspaceDialog();
  dialog.innerHTML=`<h2>Import data</h2><p>Choose a TaxGuard Excel export, then select the categories to import. Existing records are preserved unless you select form schedules or company profile.</p><input id="data-import-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"><div id="data-import-sections"></div><div id="data-import-status" role="status"></div><div class="modal-actions"><button type="button" class="btn" id="cancel-data-import">Cancel</button><button type="button" class="btn primary" id="confirm-data-import" disabled>Import selected data</button></div>`;
  dialog.querySelector('#cancel-data-import').onclick=()=>closeModal(dialog);
  const status=dialog.querySelector('#data-import-status'),choices=dialog.querySelector('#data-import-sections'),confirm=dialog.querySelector('#confirm-data-import');
  let selectedFile=null,payload=null;
  const scopedPayload=()=>{
    if(!payload)return payload;
    const ids=new Set([...dialog.querySelectorAll('input[name="import-client"]:checked')].map(input=>Number(input.value)));
    const from=Number(dialog.querySelector('#import-year-from')?.value),to=Number(dialog.querySelector('#import-year-to')?.value);
    const clients=(payload.sections.clients||[]).filter(c=>!ids.size||ids.has(Number(c.id)));
    const allowed=new Set(clients.map(c=>Number(c.id)));
    const filings=Object.fromEntries(Object.entries(payload.sections.filings||{}).filter(([key])=>{const parts=key.split(':');const year=Number(parts[1]);return allowed.has(Number(parts[0]))&&(!Number.isInteger(from)||year>=from)&&(!Number.isInteger(to)||year<=to);}));
    return {...payload,sections:{...payload.sections,clients,filings}};
  };
  const preview=()=>{
    confirm.disabled=true;
    const sections=selectedDataSections(dialog);
    if(!sections.length){status.textContent='Select at least one data category.';return;}
      try{const summary=database.previewDataImport(scopedPayload(),sections);status.innerHTML=dataImportSummary(summary,sections);confirm.disabled=false;}
    catch(error){status.textContent='Import cannot proceed: '+error.message;}
  };
  choices.addEventListener('change',preview);
  dialog.querySelector('#data-import-file').onchange=async e=>{
    confirm.disabled=true;choices.innerHTML='';status.textContent='';selectedFile=e.target.files?.[0];payload=null;
    if(!selectedFile)return;
    if(selectedFile.size>5*1024*1024){status.textContent='Excel file exceeds 5 MB. Use a full SQLite backup for larger transfers.';return;}
    const extension=selectedFile.name.split('.').pop()?.toLowerCase();
    try{
      if(extension!=='xlsx')throw Error('Choose a TaxGuard .xlsx export.');
      const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('Could not read Excel file.'));reader.readAsDataURL(selectedFile);});
      payload=await database.readDataXlsx(base64);
      const available=Object.keys(payload.sections||{}).filter(key=>key in dataSectionLabels);
      if(!available.length)throw Error('This workbook contains no supported data categories.');
      const importedClients=payload.sections.clients||[];
      choices.innerHTML=`<label>Data to import</label>${dataSectionChoices(['clients','filings'],['clients','filings'])}<div class="data-transfer-client-list">${importedClients.map(c=>`<label><input type="checkbox" name="import-client" value="${c.id}" checked><span>${esc(c.name)} <small>${esc(c.tin||'')}</small></span></label>`).join('')}</div><div class="data-transfer-year-range"><label>From year<input type="number" id="import-year-from" min="2000" max="2100" value="2000"></label><label>To year<input type="number" id="import-year-to" min="2000" max="2100" value="2100"></label></div>`;
      if(!selectedDataSections(dialog).length)choices.querySelector('input[name="data-section"]').checked=true;
      preview();
    }catch(error){status.textContent='Could not read file: '+error.message;}
  };
  confirm.onclick=async()=>{
    const sections=selectedDataSections(dialog);
    if(!selectedFile||!sections.length)return;
    confirm.disabled=true;
    try{
      database.importData(scopedPayload(),sections,databaseRevision);
      restoreDatabase();customClientFields=database.getClientFields();window.refreshCompanyProfile?.();
      closeModal(dialog);render();notify('Selected data imported.');
    }catch(error){status.textContent='Import failed: '+error.message;confirm.disabled=false;}
  };
  dialog.showModal();
}
document.querySelector('footer span').textContent=database?'Saved to SQLite on this computer':'Changes saved in this browser';
document.addEventListener('click',async e=>{
  if(e.target.closest('#company-logo-preview')){
    const profile=companyProfileDraft||getWorkspaceCompanyProfile();
    const m=workspaceDialog();
    m.classList.remove('report-modal','closing');
    m.innerHTML=`<h2>Company logo</h2><p>PNG, JPEG, WebP, GIF, BMP, or ICO. Maximum 5 MB.</p><div id="company-logo-modal-preview" class="company-logo-modal-preview">${profile.logo?`<img src="${profile.logo}" alt="Company logo">`:esc(getUserInitials(profile.name))}</div><p id="company-logo-modal-status" role="status">Changes are saved with Save company profile.</p><div class="modal-actions"><button type="button" class="btn" id="remove-company-logo">Remove logo</button><button type="button" class="btn primary" id="change-company-logo">Change logo</button><button type="button" class="btn" id="close-company-logo">Close</button></div>`;
    m.querySelector('#change-company-logo').onclick=()=>document.querySelector('#company-logo-input').click();
    m.querySelector('#close-company-logo').onclick=()=>closeModal(m);
    m.showModal();
    return;
  }
  if(e.target.closest('#remove-company-logo')){
    const company=String(document.querySelector('#company-name-input')?.value||getWorkspaceCompanyName()).trim();
    companyProfileDraft={...(companyProfileDraft||getWorkspaceCompanyProfile()),name:company,logo:''};
    const preview=document.querySelector('#company-logo-preview');
    if(preview){preview.textContent=getUserInitials(company);preview.classList.remove('has-logo');}
    const largePreview=document.querySelector('#company-logo-modal-preview');
    if(largePreview)largePreview.textContent=getUserInitials(company);
    document.querySelector('#company-logo-input').value='';
    e.target.closest('#remove-company-logo').remove();
    return;
  }
  if(e.target.closest('#btn-add-user')){
    openUserAccountModal(null);
  }
  const userRow=e.target.closest('.user-account-row');
  if(userRow){
    openUserAccountModal(userRow.dataset.userId);
  }
  if(e.target.closest('#open-data-export'))openDataExportDialog();
  if(e.target.closest('#open-data-import'))openDataImportDialog();
  const removeField=e.target.closest('[data-remove-client-field]');
  if(removeField){
    const field=removeField.dataset.removeClientField;
    confirmClientFieldChange('Remove client field',`Remove “${field}” from client forms and the directory? Saved values will remain available if you add this field again.`,()=>{persistCustomClientFields(customClientFields.filter(name=>name!==field));notify('Client field removed; saved values are retained.');},'Remove field');
  }
  const editField=e.target.closest('[data-edit-client-field]');
  if(editField)editClientField(editField.dataset.editClientField);
  if(e.target.closest('#save-full-backup')){
    try{const result=await database.saveBackup();if(result?.saved)notify('Complete backup saved.');}catch(error){notify('Backup failed: '+error.message);}
  }
  if(e.target.closest('#restore-full-backup')){
    try{await database.restoreBackup();}catch(error){notify('Restore failed: '+error.message);}
  }
  const reportCard=e.target.closest('.report-card[data-report]');
  if(reportCard){
    openReportSetup(reportCard.dataset.report);
  }
});
document.addEventListener('change',async e=>{
  if(e.target.id!=='company-logo-input'||!e.target.files?.[0])return;
  const file=e.target.files[0];
  const company=String(document.querySelector('#company-name-input')?.value||getWorkspaceCompanyName()).trim();
  const extension=file.name.split('.').pop()?.toLowerCase();
  const inferredMime={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',jfif:'image/jpeg',webp:'image/webp',gif:'image/gif',bmp:'image/bmp',ico:'image/x-icon'}[extension];
  const logoMime=file.type||inferredMime;
  const allowed=['image/png','image/jpeg','image/webp','image/gif','image/bmp','image/x-icon','image/vnd.microsoft.icon'];
  const error=document.querySelector('#company-logo-error');
  if(file.size>5*1024*1024||!allowed.includes(logoMime)){
    const message=file.size>5*1024*1024?'The selected logo is larger than 5 MB.':'That image format is not supported. Choose PNG, JPEG, WebP, GIF, BMP, or ICO.';
    if(error)error.textContent=message;
    const status=document.querySelector('#company-logo-modal-status');if(status)status.textContent=message;
    notify(message);companyProfileDraft={...(companyProfileDraft||getWorkspaceCompanyProfile()),name:company};return;
  }
  if(error)error.textContent='';
  const reader=new FileReader();
  reader.onload=async()=>{
    const dataUrl=String(reader.result).replace(/^data:[^;]*;/,`data:${logoMime};`);
    const image=new Image();
    image.src=dataUrl;
    try{await image.decode();}catch{
      const message='This image could not be opened. Choose another picture.';
      if(error)error.textContent=message;
      const status=document.querySelector('#company-logo-modal-status');if(status)status.textContent=message;
      return;
    }
    companyProfileDraft={...(companyProfileDraft||getWorkspaceCompanyProfile()),name:document.querySelector('#company-name-input')?.value??company,logo:dataUrl};
    const preview=document.querySelector('#company-logo-preview');
    if(preview){image.alt='Company logo preview';preview.replaceChildren(image);preview.classList.add('has-logo');}
    const modal=document.querySelector('#modal');
    if(modal?.open&&modal.querySelector('#company-logo-modal-preview'))closeModal(modal);
  };
  reader.onerror=()=>notify('Could not read the selected logo.');
  reader.readAsDataURL(file);
});
document.addEventListener('input',e=>{
  if(e.target.id==='company-name-input')companyProfileDraft={...(companyProfileDraft||getWorkspaceCompanyProfile()),name:e.target.value};
  if(e.target.id==='company-description-input')companyProfileDraft={...(companyProfileDraft||getWorkspaceCompanyProfile()),description:e.target.value};
});
document.addEventListener('submit',async e=>{
  if(e.target.id==='add-client-field-form'){
    e.preventDefault();
    const field=e.target.querySelector('#new-client-field').value.trim();
    if(!field||customClientFields.some(name=>name.toLowerCase()===field.toLowerCase())){notify('Choose a unique field name.');return;}
    confirmClientFieldChange('Add client field',`Add “${field}” to client records and the directory?`,()=>{persistCustomClientFields([...customClientFields,field]);notify('Client field added.');},'Add field');
    return;
  }
  if(e.target.id!=='company-profile-form')return;
  e.preventDefault();
  const company=String(new FormData(e.target).get('company_name')||'').trim();
  const description=String(new FormData(e.target).get('company_description')||'').trim();
  try{
    const logo=(companyProfileDraft||getWorkspaceCompanyProfile()).logo;
    persistWorkspaceCompanyProfile({name:company,logo,description});
    companyProfileDraft=null;
    render();
    notify('Company profile updated.');
  }catch(error){
    notify('Could not update company profile: '+error.message);
  }
});
document.addEventListener('keydown',e=>{
  if(e.key==='Enter'||e.key===' '){
    const userRow=document.activeElement?.closest?.('.user-account-row');
    if(userRow){
      e.preventDefault();
      openUserAccountModal(userRow.dataset.userId);
      return;
    }
    const card=document.activeElement?.closest?.('.report-card[data-report]');
    if(card){
      e.preventDefault();
      openReportSetup(card.dataset.report);
    }
  }
});
window.openReportPreview=openReportPreview;
window.TaxGuardReports={openReportPreview,exportToExcel,downloadClientPdf,getSummaryReportData,getFilingsReportData,getClientsReportData,renderSvgDonut,renderSvgFormBars};
// The earlier page bindings predate the add-deadline control.
document.addEventListener('click',e=>{
  if(e.target.closest('#add-deadline')){e.stopImmediatePropagation();deadlineEditModal();}
},true);
// Save failures stop submission handlers before their success messages.
window.addEventListener('error',e=>{if(e.error){notify(e.error.message);}});
window.addEventListener('focus',()=>{
  // Native file pickers return focus before delivering the selected file.
  // Replacing this form here detaches its input and loses that event.
  if(document.querySelector('#company-profile-form'))return;
  window.refreshCompanyProfile?.();
  if(database&&!document.querySelector('#modal').open){try{restoreDatabase();render();}catch(error){notify('Could not refresh records: '+error.message);}}
});
render();
// Scroll reveal is self-contained so it can be removed without changing page layouts.
(() => {
  const content = document.querySelector('#content');
  if (!content || !Element.prototype.animate) return;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const active = new Map();
  const entrances = new Map();
  let frame = 0, printing = false;
  function update() {
    frame = 0;
    const height = window.innerHeight;
    const band = Math.min(180, height * .22);
    // Top-anchored scaling keeps this measurement stable as the card expands.
    const positions = [...active].map(([card, animation]) => [card, animation, card.getBoundingClientRect().top]);
    for (const [card, animation, top] of positions) {
      const progress = card.contains(document.activeElement) ? 1 : Math.max(0, Math.min(1, (height - top) / band));
      animation.currentTime = progress * 1000;
    }
  }
  function scheduleUpdate() { if (!frame) frame = requestAnimationFrame(update); }
  function observeCards() {
    for (const [card, animation] of active) {
      if (!content.contains(card) || reducedMotion.matches || printing) {
        entrances.get(card)?.cancel();
        entrances.delete(card);
        animation.cancel(); active.delete(card);
      }
    }
    if (reducedMotion.matches || printing) return;
    content.querySelectorAll('.stat, .panel, .deadline-card').forEach(card => {
      // Avoid animating a card twice when it is inside another card.
      if (card.parentElement.closest('.stat, .panel, .deadline-card')) return;
      if (active.has(card)) return;
      const animation = card.animate([
        { opacity: 0, scale: '0.86', transformOrigin: 'center top' },
        { opacity: 1, scale: '1', transformOrigin: 'center top' }
      ], { duration: 1000, fill: 'both', easing: 'ease-out' });
      animation.pause();
      active.set(card, animation);
      const top = card.getBoundingClientRect().top;
      const band = Math.min(180, window.innerHeight * .22);
      // Cards already on screen also get an entrance; cards below use scroll progress.
      if (top >= 0 && top <= window.innerHeight - band && !card.contains(document.activeElement)) {
        const entrance = card.animate([
          { opacity: 0, scale: '0.86', transformOrigin: 'center top' },
          { opacity: 1, scale: '1', transformOrigin: 'center top' }
        ], { duration: 650, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
        entrances.set(card, entrance);
        entrance.finished.catch(() => {}).finally(() => {
          if (entrances.get(card) === entrance) entrances.delete(card);
        });
      }
    });
    scheduleUpdate();
  }
  new MutationObserver(observeCards).observe(content, { childList: true, subtree: true });
  window.addEventListener('scroll', () => {
    // Hand control to scrolling immediately, rather than finishing an entrance first.
    entrances.forEach(animation => animation.cancel());
    entrances.clear();
    scheduleUpdate();
  }, { passive: true });
  window.addEventListener('resize', scheduleUpdate);
  content.addEventListener('focusin', scheduleUpdate);
  content.addEventListener('focusout', scheduleUpdate);
  reducedMotion.addEventListener('change', observeCards);
  window.addEventListener('beforeprint', () => { printing = true; observeCards(); });
  window.addEventListener('afterprint', () => { printing = false; observeCards(); });
  observeCards();
})();
