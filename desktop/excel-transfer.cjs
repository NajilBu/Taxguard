const ExcelJS=require('exceljs');
const transfer=require('./data-transfer.cjs');
const LIMIT=5*1024*1024;
const CHUNK=16000;
const dateText=value=>value instanceof Date?value.toISOString().slice(0,10):String(value||'');
function recordsFor(key,value){
  if(key==='filings')return Object.entries(value).map(([id,data])=>({id,data}));
  if(Array.isArray(value))return value;
  return [value];
}
async function exportWorkbook(store,sections,options){
  const payload=transfer.exportData(store,sections,options);
  const workbook=new ExcelJS.Workbook();
  const info=workbook.addWorksheet('TaxGuard');
  info.addRow(['TaxGuard client filing export','taxguard-excel-v2']);
  info.addRow(['Exported at',payload.exportedAt]);
  info.addRow(['Year range',`${options?.yearFrom||''} - ${options?.yearTo||''}`]);
  if(payload.sections.clients){
    const sheet=workbook.addWorksheet('Clients');
    sheet.addRow(['Client name','TIN','Business type','Tax type','Start of filing','Required forms','Status','Remarks']);
    payload.sections.clients.forEach(c=>sheet.addRow([c.name,c.tin,c.type,c.tax,dateText(c.start),c.forms.join(', '),c.status,c.remarks||'']));
    sheet.columns.forEach(column=>{column.width=22});
  }
  if(payload.sections.filings){
    const clients=new Map(payload.sections.clients.map(c=>[Number(c.id),c]));
    const sheet=workbook.addWorksheet('Filings');
    sheet.addRow(['Client TIN','BIR form','Year','Period','Status','Filing date','Reference']);
    Object.entries(payload.sections.filings).forEach(([key,filing])=>{const match=/^(\d+):(\d{4}):([^:]+):([^:]+)$/.exec(key);const client=clients.get(Number(match?.[1]));if(match&&client)sheet.addRow([client.tin,match[3],Number(match[2]),match[4],filing.status||'',filing.date||filing.filed_at||'',filing.reference||'']);});
    sheet.columns.forEach(column=>{column.width=20});
  }
  for(const [key,value] of Object.entries(payload.sections).filter(([key])=>!['clients','filings'].includes(key))){
    const sheet=workbook.addWorksheet(key);
    sheet.addRow(['Record','Part','Data']);
    recordsFor(key,value).forEach((record,index)=>{
      const json=JSON.stringify(record);
      for(let start=0,part=1;start<json.length;start+=CHUNK,part++)sheet.addRow([index+1,part,json.slice(start,start+CHUNK)]);
    });
    sheet.getColumn(1).width=12;sheet.getColumn(2).width=10;sheet.getColumn(3).width=100;
  }
  const buffer=Buffer.from(await workbook.xlsx.writeBuffer());
  if(buffer.length>LIMIT)throw Error('Excel export exceeds 5 MB. Select fewer categories or use a full SQLite backup.');
  return buffer.toString('base64');
}
async function readWorkbook(base64){
  if(typeof base64!=='string'||base64.length>7*1024*1024||!/^[A-Za-z0-9+/]+={0,2}$/.test(base64))throw Error('Invalid Excel file.');
  const buffer=Buffer.from(base64,'base64');
  if(buffer.length>LIMIT)throw Error('Excel file exceeds 5 MB.');
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(buffer);
  const version=workbook.getWorksheet('TaxGuard')?.getCell('B1').value;
  if(!['taxguard-excel-v1','taxguard-excel-v2'].includes(version))throw Error('Choose a TaxGuard data export workbook.');
  if(version==='taxguard-excel-v2'){
    const clientsSheet=workbook.getWorksheet('Clients'),filingsSheet=workbook.getWorksheet('Filings');
    const clients=[],byTin=new Map();
    const cellText=cell=>{const value=cell.value;return value instanceof Date?value.toISOString().slice(0,10):String(value||'');};
    clientsSheet?.eachRow((row,n)=>{if(n===1)return;const c={id:clients.length+1,name:cellText(row.getCell(1)),tin:cellText(row.getCell(2)),type:cellText(row.getCell(3)),tax:cellText(row.getCell(4)),start:cellText(row.getCell(5)),forms:cellText(row.getCell(6)).split(',').map(form=>form.trim()).filter(Boolean),status:cellText(row.getCell(7))||'Active',remarks:cellText(row.getCell(8))};if(!/^\d{4}-\d{2}-\d{2}$/.test(c.start)||!c.tin)throw Error(`Invalid client row ${n}.`);clients.push(c);byTin.set(c.tin,c.id);});
    const filings={};filingsSheet?.eachRow((row,n)=>{if(n===1)return;const tin=String(row.getCell(1).value||''),form=String(row.getCell(2).value||''),year=Number(row.getCell(3).value),period=String(row.getCell(4).value||'');const id=byTin.get(tin);if(id&&form&&Number.isInteger(year)&&period)filings[`${id}:${year}:${form}:${period}`]={status:String(row.getCell(5).value||''),date:String(row.getCell(6).value||''),reference:String(row.getCell(7).value||'')};});
    return {format:'taxguard-data-v1',sections:{clients,filings},references:{clients:clients.map(c=>({id:c.id,tin:c.tin}))}};
  }
  const sections={},references={};let metadata={};
  for(const sheet of workbook.worksheets){
    const key=sheet.name;
    if(key==='TaxGuard')continue;
    if(![...transfer.CATEGORIES,'__references','__metadata'].includes(key))throw Error('Unexpected worksheet in data export.');
    if(sheet.rowCount>50000)throw Error('Excel worksheet is too large.');
    const groups=new Map();
    sheet.eachRow((row,number)=>{
      if(number===1)return;
      const id=Number(row.getCell(1).value),part=Number(row.getCell(2).value),data=row.getCell(3).value;
      if(!Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(part)||part<1||typeof data!=='string'||data.length>CHUNK)throw Error(`Invalid ${key} worksheet row ${number}.`);
      if(!groups.has(id))groups.set(id,new Map());
      if(groups.get(id).has(part))throw Error(`Duplicate ${key} worksheet part.`);
      groups.get(id).set(part,data);
    });
    const records=[...groups.entries()].sort((a,b)=>a[0]-b[0]).map(([id,parts],index)=>{
      if(id!==index+1||[...parts.keys()].sort((a,b)=>a-b).some((part,i)=>part!==i+1))throw Error(`Missing ${key} worksheet row.`);
      return JSON.parse([...parts.entries()].sort((a,b)=>a[0]-b[0]).map(([,value])=>value).join(''));
    });
    if(key==='filings')sections.filings=Object.fromEntries(records.map(r=>[r.id,r.data]));
    else if(key==='__references')Object.assign(references,records[0]||{});
    else if(key==='__metadata')metadata=records[0]||{};
    else if(['clients','forms','documents'].includes(key))sections[key]=records;
    else sections[key]=records[0];
  }
  if(!Object.keys(sections).length)throw Error('Excel workbook contains no data categories.');
  return {format:'taxguard-data-v1',sections,references,metadata};
}
module.exports={exportWorkbook,readWorkbook};
