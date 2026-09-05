const fs = require('fs'), vm = require('vm');
const element = {innerHTML:'',textContent:'',classList:{toggle(){}},addEventListener(){}};
const context = {localStorage:{getItem(){return null},setItem(){}},document:{querySelector(){return {...element}},querySelectorAll(){return []}},setTimeout(){},console};
vm.createContext(context);
vm.runInContext(fs.readFileSync('app.js','utf8') + `
for (const p of [dashboard,clients,tracker,deadlines]) if(!p().includes('panel')&&!p().includes('deadline-grid')) throw Error('Render failed');
let obs=obligations();
if(new Set(obs.map(o=>o.key)).size!==obs.length) throw Error('Duplicate obligation');
let c=state.clients[0];
obs.filter(o=>o.c.id===c.id).forEach(o=>state.filings[o.key]={date:today});
if(status(c,obligations())!=='Complete') throw Error('Completion failed');
console.log('PASS: four page renders, unique obligations, and completion updates.');
`, context);
