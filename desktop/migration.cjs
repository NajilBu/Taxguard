function parseCsv(text){
  if(typeof text!=='string'||text.length>10*1024*1024)throw Error('CSV file exceeds 10 MB.');
  const rows=[];let row=[],value='',quoted=false;
  const source=text.replace(/^\uFEFF/,'');
  for(let i=0;i<source.length;i++){
    const char=source[i];
    if(quoted){
      if(char==='"'&&source[i+1]==='"'){value+='"';i++;}
      else if(char==='"')quoted=false;
      else value+=char;
    }else if(char==='"')quoted=true;
    else if(char===','){row.push(value);value='';}
    else if(char==='\n'){row.push(value.replace(/\r$/,''));if(row.some(cell=>cell.trim()))rows.push(row);row=[];value='';}
    else value+=char;
  }
  if(quoted)throw Error('CSV has an unfinished quoted field.');
  row.push(value.replace(/\r$/,''));if(row.some(cell=>cell.trim()))rows.push(row);
  if(!rows.length)throw Error('CSV file is empty.');
  const headers=rows.shift().map(header=>header.trim().toLowerCase().replace(/[\s-]+/g,'_'));
  if(new Set(headers).size!==headers.length)throw Error('CSV headers must be unique.');
  for(const field of ['name','tin'])if(!headers.includes(field))throw Error(`CSV needs a ${field} column.`);
  return rows.map((cells,index)=>{
    if(cells.length!==headers.length)throw Error(`CSV row ${index+2} has the wrong number of columns.`);
    return Object.fromEntries(headers.map((header,i)=>[header,cells[i].trim()]));
  });
}
async function parseXlsxBuffer(buffer){
  if(!Buffer.isBuffer(buffer)||buffer.length>5*1024*1024)throw Error('Excel file exceeds 5 MB.');
  const ExcelJS=require('exceljs'),workbook=new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet=workbook.worksheets[0];
  if(!sheet)throw Error('Excel workbook has no worksheet.');
  const width=sheet.getRow(1).cellCount;
  if(width<2||width>50||sheet.rowCount>50001)throw Error('Excel worksheet is not a client list.');
  const value=cell=>{
    const raw=cell.value&&typeof cell.value==='object'&&'result'in cell.value?cell.value.result:cell.value;
    return raw instanceof Date?raw.toISOString().slice(0,10):String(raw??'').trim();
  };
  const headers=Array.from({length:width},(_,index)=>value(sheet.getRow(1).getCell(index+1)).toLowerCase().replace(/[\s-]+/g,'_'));
  if(new Set(headers).size!==headers.length||!headers.includes('name')||!headers.includes('tin'))throw Error('Excel headers must be unique and include name and tin.');
  const rows=[];
  for(let number=2;number<=sheet.rowCount;number++){
    const row=sheet.getRow(number),cells=headers.map((header,index)=>value(row.getCell(index+1)));
    if(cells.every(cell=>!cell))continue;
    rows.push(Object.fromEntries(headers.map((header,index)=>[header,cells[index]])));
  }
  return rows;
}
module.exports={parseCsv,parseXlsxBuffer};
