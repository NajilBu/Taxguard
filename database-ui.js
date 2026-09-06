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




function getSummaryReportData(reportYear){
  const y=reportYear||year;
  const obs=obligations();
  const headers=['Client Name','TIN','Business Type','Tax Type','Client Status','Start of Filing',`Total Obligations (${y})`,'Completed Filings','Pending Filings','Overdue Filings','Compliance Rate','Annual Status'];
  const rows=state.clients.map(c=>{
    const cObs=obs.filter(o=>o.c.id===c.id);
    const cDone=cObs.filter(o=>o.filing).length;
    const cOver=cObs.filter(o=>!o.filing&&o.due<today).length;
    const cPending=cObs.length-cDone-cOver;
    const cPct=cObs.length?Math.round(cDone/cObs.length*100):0;
    return [c.name,c.tin,c.type,c.tax,c.status,c.start,cObs.length,cDone,cPending,cOver,`${cPct}%`,status(c,obs)];
  });
  return { title:`TaxGuard-Compliance-Summary-${y}.xls`, headers, rows, obs };
}

function getFilingsReportData(reportYear){
  const y=reportYear||year;
  const obs=obligations();
  const headers=['Client Name','TIN','BIR Form','Covered Period','Tax Year','Due Date','Filing Status','Filing Date','Confirmation / Reference','Remarks'];
  const rows=obs.map(o=>[
    o.c.name,
    o.c.tin,
    o.f.id,
    o.p,
    y,
    o.due,
    o.filing?'Completed':(o.due<today?'Overdue':'Pending'),
    o.filing?.date||'',
    o.filing?.reference||'',
    o.filing?.remarks||''
  ]);
  return { title:`TaxGuard-Filing-Log-${y}.xls`, headers, rows, obs };
}

function getClientsReportData(){
  const headers=['Client ID','Client Name','TIN','Business Type','Tax Type','Status','Start of Filing','Required BIR Forms','Remarks'];
  const rows=state.clients.map(c=>[
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
  return { title:'TaxGuard-Client-Master.xls', headers, rows };
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

function openReportPreview(reportType,reportYear){
  const type=typeof reportType==='string'?reportType:'summary';
  const y=reportYear||year;
  const m=document.querySelector('#modal');
  if(!m)return;
  const obs=obligations();
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
    reportBadge=pct>=100?'All Filed':(pct>=60?'Active Filing':'Filings Pending');

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

    defaultAnalysis=`Filing Audit Log & Submission Verification for Tax Year ${y}:\n\n`+
      `• Audit Trail Scope: Monitored ${obs.length} statutory obligations for ${y}, with ${done} submissions recorded in the centralized register.\n`+
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
        <td>${badge(o.filing?'complete':(o.due<today?'overdue':'pending'))}</td>
        <td>${esc(o.filing?.date||'—')}</td>
        <td><small>${esc(o.filing?.reference||'—')}</small></td>
      </tr>
    `).join('');

    const rep=getFilingsReportData(y);
    pdfExportHeaders=rep.headers;
    pdfExportRows=rep.rows;
    exportFn=()=>{
      exportToExcel(rep.title,rep.headers,rep.rows);
      notify(`Filing audit log for ${y} exported to Excel.`);
    };

  }else if(type==='clients'){
    reportTitle='TAXGUARD CLIENT MASTER ROSTER';
    reportSub='Registered Taxpayer Directory, Entity Types & Statutory Form Assignments';
    const totalClients=state.clients.length;
    const activeCount=state.clients.filter(c=>c.status==='Active').length;
    const vatCount=state.clients.filter(c=>c.tax==='VAT').length;
    const nvatCount=state.clients.filter(c=>c.tax==='NVAT').length;
    const soleCount=state.clients.filter(c=>c.type==='Sole proprietorship').length;
    const corpCount=state.clients.filter(c=>c.type==='Corporation').length;
    const partCount=state.clients.filter(c=>c.type==='Partnership').length;
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
    tableRowsHtml=state.clients.map(c=>`
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

    const rep=getClientsReportData();
    pdfExportHeaders=rep.headers;
    pdfExportRows=rep.rows;
    exportFn=()=>{
      exportToExcel(rep.title,rep.headers,rep.rows);
      notify('Client directory roster exported to Excel.');
    };

  }else{
    // Annual Compliance Summary (default)
    reportTitle='TAXGUARD ANNUAL COMPLIANCE SUMMARY';
    reportSub='Executive Statutory Compliance Audit, Filing Breakdown & Analysis';
    const done=obs.filter(o=>o.filing).length;
    const over=obs.filter(o=>!o.filing&&o.due<today).length;
    const pending=obs.length-done-over;
    const pct=obs.length?Math.round(done/obs.length*100):0;
    reportBadge=pct>=100?'Fully Compliant':(pct>=70?'Satisfactory':'Action Required');

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

    defaultAnalysis=`Annual Statutory Compliance Analysis for Tax Year ${y}:\n\n`+
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
    tableRowsHtml=state.clients.map(c=>{
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

    const rep=getSummaryReportData(y);
    pdfExportHeaders=rep.headers;
    pdfExportRows=rep.rows;
    exportFn=()=>{
      exportToExcel(rep.title,rep.headers,rep.rows);
      notify(`Compliance summary report for ${y} exported to Excel.`);
    };
  }

  m.innerHTML=`<div class="report-preview-wrap">
    <div class="preview-toolbar no-print">
      <div class="preview-toolbar-title">
        <strong>${reportTitle}</strong>
        <small>${reportSub}</small>
      </div>
      <div class="preview-toolbar-actions">
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
        <div>
          <h2>${reportTitle}</h2>
          <p>${reportSub}</p>
        </div>
        <div class="sheet-meta">
          <strong>TAX YEAR: ${y}</strong><br>
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
  m.querySelector('#preview-save-pdf')?.addEventListener('click',async()=>{
    const cleanName=reportTitle.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
    const pdfFilename=`${cleanName}-${y}.pdf`;
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
        downloadClientPdf(pdfFilename,reportTitle,reportSub,y,displayText?.textContent||defaultAnalysis,pdfExportHeaders,pdfExportRows);
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
  const m=document.querySelector('#modal');
  if(!m)return;

  const totalActive=users.filter(u=>u.is_active).length;
  const cannotDeactivate=isEditing&&user.is_active&&totalActive<=1;

  const usernameVal=initialData?.username!==undefined?initialData.username:(user?.username||'');
  const companyVal=initialData?.company_name!==undefined?initialData.company_name:(user?.company_name||'EOO Tax & Accounting');
  const roleVal=initialData?.role!==undefined?initialData.role:(user?.role||'Staff');
  const isActiveVal=initialData?.is_active!==undefined?initialData.is_active:((!user||user.is_active)?1:0);
  const passwordVal=initialData?.password!==undefined?initialData.password:'';

  m.innerHTML=`
    <h2>${isEditing?(isCurrent?'Edit Your Account Info':'Edit User Account'):'Add New User Account'}</h2>
    <p>${isEditing?'Update workstation identity, display name, role, or change password.':'Create new login credentials for staff or tax associates.'}</p>
    <form id="user-account-form" style="margin-top:16px">
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
        <button type="button" class="btn" id="cancel-user-modal">Cancel</button>
        <button type="submit" class="btn primary" id="save-user-btn">${isEditing?'Save changes':'Create account'}</button>
      </div>
    </form>
  `;

  m.classList.remove('closing');
  m.showModal();

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
        const updatedAuth={...currentAuth,company:company_name,role};
        sessionStorage.setItem('taxguard_auth',JSON.stringify(updatedAuth));
        const firmEl=document.querySelector('.firm .firm-info');
        if(firmEl) firmEl.innerHTML=`${esc(company_name)}<small>Compliance team</small>`;
        const loginDisplay=document.querySelector('#login-company-display');
        if(loginDisplay) loginDisplay.textContent=company_name;
        const headerAvatar=document.querySelector('.header-right .avatar');
        if(headerAvatar){
          headerAvatar.title=`Signed in as ${esc(updatedAuth.username)}`;
          headerAvatar.textContent=getUserInitials(updatedAuth.username);
        }
        const firmAvatar=document.querySelector('.firm .avatar');
        if(firmAvatar&&company_name){
          firmAvatar.textContent=getUserInitials(company_name);
        }
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

function confirmCreateUser(userData,onBack){
  const m=document.querySelector('#modal');
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
    if(onBack) onBack();
  });

  m.querySelector('#btn-confirm-create-user')?.addEventListener('click',()=>{
    const confirmAlert=m.querySelector('#confirm-create-error-alert');
    try{
      persistWorkstationUser(userData);
      closeModal(m,()=>{
        m.innerHTML='';
      });
      try{m.close();}catch(e){}
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
  const m=document.querySelector('#modal');
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
      closeModal(m,()=>{m.innerHTML='';});
      try{m.close();}catch(e){}
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
  const totalActiveUsers=users.filter(u=>u.is_active).length;

  const usersRowsHtml=users.map(u=>{
    const isCurrent=u.username.toLowerCase()===currentAuth.username.toLowerCase();
    const initials=getUserInitials(u.username);
    const roleColors={
      Admin:{bg:'#eef4fd',text:'#2766db',border:'#d0e2fb'},
      Staff:{bg:'#f0fdf4',text:'#16866b',border:'#bbf7d0'},
      'Tax Associate':{bg:'#faf5ff',text:'#7656c7',border:'#e9d5ff'},
      Auditor:{bg:'#fffbeb',text:'#b45309',border:'#fde68a'}
    }[u.role]||{bg:'#edf2f7',text:'#334e68',border:'#cbd5e1'};

    return `<tr>
      <td style="padding:12px 16px">
        <div style="display:flex;align-items:center;gap:10px">
          <span class="avatar" style="width:30px;height:30px;min-width:30px;font-size:11px;font-weight:700;background:#e2e8f0;color:#334e68">${initials}</span>
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
      <td style="padding:12px 16px;text-align:right">
        <button type="button" class="btn btn-edit-user" data-user-id="${u.id}" style="padding:5px 12px;font-size:11px;margin-right:6px">Edit</button>
        ${isCurrent
          ? '<button type="button" class="btn" disabled title="Cannot delete currently active account" style="padding:5px 10px;font-size:11px;opacity:0.35;cursor:not-allowed">Delete</button>'
          : (u.is_active&&totalActiveUsers<=1
            ? '<button type="button" class="btn" disabled title="Cannot delete the only active account" style="padding:5px 10px;font-size:11px;opacity:0.35;cursor:not-allowed">Delete</button>'
            : `<button type="button" class="btn btn-delete-user" data-user-id="${u.id}" data-username="${esc(u.username)}" style="padding:5px 10px;font-size:11px;color:#c36959">Delete</button>`
          )
        }
      </td>
    </tr>`;
  }).join('');

  return heading('Settings','Personalize the TaxGuard workspace.','')+`<div class="settings-grid"><div class="panel settings-panel"><div class="panel-head"><div><h2>Color theme</h2><p>Choose a preset workspace accent color.</p></div></div><div class="theme-options">${[['blue','Blue'],['navy','Navy'],['green','Green'],['purple','Purple'],['orange','Orange'],['red','Red']].map(([v,l])=>`<button class="theme-option ${current===v?'active':''}" data-theme="${v}"><span class="theme-swatch ${v}"></span><span>${l}</span>${current===v?'<b>✓</b>':''}</button>`).join('')}</div></div><div class="panel storage-panel"><div class="panel-head"><div><h2>Data storage</h2><p>${database?'Client records and filings are saved in SQLite, shared by localhost and the desktop app.':'This browser stores records locally. The localhost version connects to SQLite.'}</p></div></div><div class="panel-body"><div class="storage-features"><div class="storage-feature-item"><small>Engine</small><strong>${database?'SQLite station':'Browser storage'}</strong></div><div class="storage-feature-item"><small>Scope</small><strong>Clients &amp; filings</strong></div><div class="storage-feature-item"><small>Format</small><strong>JSON v1 archive</strong></div></div><div class="storage-actions"><button class="btn" id="export-records">Export records</button> ${database?.importRecords&&state.clients.length===0?'<button class="btn primary" id="import-records">Import browser records</button>':''}</div></div></div></div><div class="panel users-panel" style="margin-top:24px"><div class="panel-head"><div><h2>User Account Management</h2><p>Manage workstation credentials, update current user info, and create new user accounts.</p></div><div style="display:flex;align-items:center;gap:12px"><span class="subtle">${users.length} configured account${users.length===1?'':'s'}</span><button type="button" class="btn primary" id="btn-add-user" style="padding:7px 14px;font-size:11.5px">+ Add user account</button></div></div><div class="panel-body" style="padding:0"><div class="table-scroll"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="border-bottom:1px solid var(--line);background:#f8fafc"><th style="padding:10px 16px;text-align:left;font-size:9.5px;text-transform:uppercase;color:#64748b">User Account</th><th style="padding:10px 16px;text-align:left;font-size:9.5px;text-transform:uppercase;color:#64748b">Firm / Display Name</th><th style="padding:10px 16px;text-align:left;font-size:9.5px;text-transform:uppercase;color:#64748b">Role</th><th style="padding:10px 16px;text-align:left;font-size:9.5px;text-transform:uppercase;color:#64748b">Status</th><th style="padding:10px 16px;text-align:right;font-size:9.5px;text-transform:uppercase;color:#64748b">Actions</th></tr></thead><tbody>${usersRowsHtml}</tbody></table></div></div></div><div class="panel reports-panel" style="margin-top:24px"><div class="panel-head"><div><h2>Compliance &amp; Audit Reports</h2><p>Click any report card below to open its executive preview with visual charts, custom commentary, and PDF export.</p></div><span class="subtle">${year} TAX YEAR</span></div><div class="panel-body"><div class="report-stat-strip"><div class="report-stat-card"><small>Total obligations (${year})</small><strong>${obs.length}</strong></div><div class="report-stat-card"><small>Filings completed</small><strong style="color:var(--green)">${done}</strong></div><div class="report-stat-card"><small>Compliance rate</small><strong>${pct}%</strong></div><div class="report-stat-card"><small>Overdue items</small><strong style="color:${over>0?'#c36959':'var(--ink)'}">${over}</strong></div></div><div class="reports-grid"><div class="report-card" id="open-report-preview" data-report="summary" data-export-id="export-summary-report" role="button" tabindex="0"><div class="report-card-head"><span class="report-icon">📊</span><div><strong>Annual Compliance Summary</strong><small>Client compliance standing, completion percentage, and obligation counts for ${year}.</small></div></div><div class="report-card-footer"><span class="report-open-link">👁️ Open preview &amp; save PDF &rarr;</span><span class="badge" style="background:#eef4fd;color:#2766db;font-weight:600">PDF Report</span></div></div><div class="report-card" id="export-filings-report" data-report="filings" data-export-id="export-filings-report" role="button" tabindex="0"><div class="report-card-head"><span class="report-icon">📑</span><div><strong>Filing Audit Log</strong><small>Detailed submission trail with BIR confirmation numbers, filing dates, and periods.</small></div></div><div class="report-card-footer"><span class="report-open-link">👁️ Open preview &amp; save PDF &rarr;</span><span class="badge" style="background:#eef4fd;color:#2766db;font-weight:600">PDF Report</span></div></div><div class="report-card" id="export-clients-report" data-report="clients" data-export-id="export-clients-report" role="button" tabindex="0"><div class="report-card-head"><span class="report-icon">👥</span><div><strong>Client Master Roster</strong><small>Complete directory of registered taxpayers, TINs, tax types, and required BIR forms.</small></div></div><div class="report-card-footer"><span class="report-open-link">👁️ Open preview &amp; save PDF &rarr;</span><span class="badge" style="background:#eef4fd;color:#2766db;font-weight:600">PDF Report</span></div></div></div></div></div>`;
};
document.querySelector('footer span').textContent=database?'Saved to SQLite on this computer':'Changes saved in this browser';
document.addEventListener('click',async e=>{
  if(e.target.closest('#btn-add-user')){
    openUserAccountModal(null);
  }
  const editBtn=e.target.closest('.btn-edit-user');
  if(editBtn){
    openUserAccountModal(editBtn.dataset.userId);
  }
  const delBtn=e.target.closest('.btn-delete-user');
  if(delBtn){
    confirmDeleteUser(delBtn.dataset.userId, delBtn.dataset.username);
  }
  if(e.target.closest('#export-records')){
    const payload={format:'taxguard-export-v1',state,forms};
    const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='TaxGuard-records.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  if(e.target.closest('#import-records')){
    try{const result=await database.importRecords();if(result){restoreDatabase();render();notify('Browser records imported into SQLite.');}}catch(error){notify('Import failed: '+error.message);}
  }
  const reportCard=e.target.closest('.report-card[data-report]');
  if(reportCard){
    openReportPreview(reportCard.dataset.report,year);
  }
});
document.addEventListener('keydown',e=>{
  if(e.key==='Enter'||e.key===' '){
    const card=document.activeElement?.closest?.('.report-card[data-report]');
    if(card){
      e.preventDefault();
      openReportPreview(card.dataset.report,year);
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
  if(database&&!document.querySelector('#modal').open){try{restoreDatabase();render();}catch(error){notify('Could not refresh records: '+error.message);}}
});
render();
