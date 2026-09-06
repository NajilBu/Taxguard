const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function hashPassword(password) {
  return crypto.createHash('sha256').update(String(password)).digest('hex');
}

function date(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
}
function required(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > 4000) throw Error(`${label} is required.`);
  return value.trim();
}
function scheduleDate(f, period, year) {
  if(f.overrides?.[year]?.[period]) return f.overrides[year][period];
  const i=f.periods.indexOf(period), raw=f.dates[i];
  if (date(raw)) return raw;
  if(f.frequency==='Monthly'||f.id==='1601-C'||f.id==='0619-E') return `${i===11?year+1:year}-${String(i===11?1:i+2).padStart(2,'0')}-${i===11?'15':'10'}`;
  return `${period==='Annual'||period==='Q4'?year+1:year}-${raw}`;
}
class Store {
  constructor(filename, root) {
    fs.mkdirSync(path.dirname(filename), {recursive:true});
    this.db = new DatabaseSync(filename);
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
    this.db.exec(fs.readFileSync(path.join(root,'database/schema.sql'),'utf8'));
    const cols=this.db.prepare('PRAGMA table_info(forms)').all();
    if(!cols.some(c=>c.name==='schedule_json')) this.db.exec("ALTER TABLE forms ADD COLUMN schedule_json TEXT NOT NULL DEFAULT '{}'");
    this.db.exec('CREATE UNIQUE INDEX IF NOT EXISTS unique_client_deadline ON filings(client_id,deadline_id); PRAGMA user_version=1;');
    this.db.exec("CREATE TABLE IF NOT EXISTS workspace_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT OR IGNORE INTO workspace_meta VALUES('revision','0');");
    const defaults=JSON.parse(fs.readFileSync(path.join(root,'database/default-forms.json'),'utf8'));
    const insert=this.db.prepare('INSERT OR IGNORE INTO forms(code,name,frequency,schedule_json) VALUES(?,?,?,?)');
    const fill=this.db.prepare("UPDATE forms SET schedule_json=? WHERE code=? AND schedule_json='{}'");
    let changed=false;
    for(const f of defaults){changed=!!insert.run(f.id,f.name,f.frequency,JSON.stringify(f)).changes||changed;changed=!!fill.run(JSON.stringify(f),f.id).changes||changed;}
    if(changed||!this.db.prepare('SELECT id FROM deadlines LIMIT 1').get())this.saveForms(this.load().forms);
    const companyCount=this.db.prepare('SELECT COUNT(*) n FROM company_login').get()?.n;
    if(!companyCount){
      this.db.prepare('INSERT OR IGNORE INTO company_login(id,company_name,username,password_hash,is_active) VALUES(1,?,?,?,1)')
        .run('EOO Tax & Accounting','admin',hashPassword('taxguard2026'));
    }
    const userCount=this.db.prepare('SELECT COUNT(*) n FROM users').get()?.n;
    if(!userCount){
      this.db.prepare('INSERT OR IGNORE INTO users(username,company_name,role,password_hash,is_active) VALUES(?,?,?,?,1)')
        .run('admin','EOO Tax & Accounting','Admin',hashPassword('taxguard2026'));
    }
  }
  load() {
    const forms=this.db.prepare('SELECT * FROM forms ORDER BY id').all().map(f=>({...JSON.parse(f.schedule_json),id:f.code,name:f.name,frequency:f.frequency}));
    const clients=this.db.prepare('SELECT * FROM clients ORDER BY id').all().map(c=>({id:c.id,name:c.name,tin:c.tin,type:c.business_type,tax:c.tax_type,status:c.status,start:c.start_of_filing,remarks:c.remarks,forms:this.db.prepare('SELECT f.code FROM client_forms cf JOIN forms f ON f.id=cf.form_id WHERE cf.client_id=?').all(c.id).map(f=>f.code)}));
    const filings={};
    for(const r of this.db.prepare('SELECT fi.*, f.code, d.tax_year, d.period FROM filings fi JOIN forms f ON f.id=fi.form_id JOIN deadlines d ON d.id=fi.deadline_id').all()) filings[`${r.client_id}:${r.tax_year}:${r.code}:${r.period}`]={date:r.filing_date,reference:r.reference_number,remarks:r.remarks};
    return {clients,filings,forms,revision:this.revision()};
  }
  revision(){return Number(this.db.prepare("SELECT value FROM workspace_meta WHERE key='revision'").get().value)}
  checkRevision(expected){if(expected!==undefined&&expected!==this.revision())throw Error('Records changed in another window. The latest records have been loaded; reopen and try your edit again.');}
  bumpRevision(){this.db.prepare("UPDATE workspace_meta SET value=CAST(value AS INTEGER)+1 WHERE key='revision'").run();}
  transaction(fn){this.db.exec('SAVEPOINT write_records');try{fn();this.db.exec('RELEASE write_records')}catch(e){this.db.exec('ROLLBACK TO write_records; RELEASE write_records');throw e}}
  saveForms(forms,expected) {
    if(!Array.isArray(forms)||forms.length>300) throw Error('Invalid form list.');
    this.transaction(()=>{
      this.checkRevision(expected);
      const seen=new Set();
      for(const f of forms){
        required(f.id,'Form code');required(f.name,'Description');
        if(!/^[A-Za-z0-9() ._-]+$/.test(f.id)||seen.has(f.id)) throw Error('Form codes must be unique and contain no special markup.');
        seen.add(f.id);
        if(!Array.isArray(f.periods)||!f.periods.length||f.periods.length>24||!Array.isArray(f.dates))throw Error('Provide covered periods and dates.');
        if(new Set(f.periods).size!==f.periods.length)throw Error('Period names must be unique.');
        for(const p of f.periods){required(p,'Period');if(!/^[A-Za-z0-9 _-]+$/.test(p))throw Error('Invalid period label.');}
        const frequency=f.frequency||(f.periods[0]==='Annual'?'Annual':f.id==='1601-C'?'Monthly':'Quarterly');
        this.db.prepare('INSERT INTO forms(code,name,frequency,schedule_json) VALUES(?,?,?,?) ON CONFLICT(code) DO UPDATE SET name=excluded.name,frequency=excluded.frequency,schedule_json=excluded.schedule_json').run(f.id,f.name,frequency,JSON.stringify(f));
        const fid=this.db.prepare('SELECT id FROM forms WHERE code=?').get(f.id).id;
        const years=new Set([...Array.from({length:10},(_,i)=>2018+i),...Object.keys(f.overrides||{}).map(Number)]);
        for(const y of years)for(const p of f.periods){const due=scheduleDate(f,p,y);if(!date(due))throw Error(`Invalid due date for ${f.id}, ${p}: ${due}`);this.db.prepare('INSERT INTO deadlines(form_id,tax_year,period,due_date) VALUES(?,?,?,?) ON CONFLICT(form_id,tax_year,period) DO UPDATE SET due_date=excluded.due_date').run(fid,y,p,due);}
      }
      this.bumpRevision();
    });
    return this.revision();
  }
  saveState(state,expected) {
    if(!state||!Array.isArray(state.clients)||typeof state.filings!=='object'||!state.filings)throw Error('Invalid workspace data.');
    this.transaction(()=>{
      this.checkRevision(expected);
      const ids=new Set(), tins=new Set();
      for(const c of state.clients){
        if(!Number.isSafeInteger(c.id)||c.id<=0||ids.has(c.id))throw Error('Invalid or duplicate client ID.');ids.add(c.id);
        required(c.name,'Client name');
        if(!/^\d{3}-\d{3}-\d{3}-\d{3}$/.test(c.tin)||tins.has(c.tin))throw Error('TIN must be unique and use 000-000-000-000.');tins.add(c.tin);
        if(!date(c.start))throw Error('Invalid filing start date.');
        if(!['Active','Inactive','Closed','For closure'].includes(c.status))throw Error('Invalid client status.');
        required(c.type,'Business type');
        this.db.prepare('INSERT INTO clients(id,name,tin,business_type,tax_type,status,start_of_filing,remarks) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,tin=excluded.tin,business_type=excluded.business_type,tax_type=excluded.tax_type,status=excluded.status,start_of_filing=excluded.start_of_filing,remarks=excluded.remarks').run(c.id,c.name.trim(),c.tin,c.type,c.tax,c.status,c.start,c.remarks||'');
        if(!Array.isArray(c.forms))throw Error('Invalid required forms.');
        this.db.prepare('DELETE FROM client_forms WHERE client_id=?').run(c.id);
        for(const code of new Set(c.forms)){const f=this.db.prepare('SELECT id FROM forms WHERE code=?').get(code);if(!f)throw Error(`Unknown required form: ${code}`);this.db.prepare('INSERT INTO client_forms VALUES(?,?)').run(c.id,f.id);}
      }
      for(const [key,v] of Object.entries(state.filings)){
        const parts=key.split(':');if(parts.length!==4)throw Error('Invalid filing key.');
        const [cid,y,code,p]=parts;const d=this.db.prepare('SELECT d.id,d.form_id FROM deadlines d JOIN forms f ON f.id=d.form_id WHERE f.code=? AND d.tax_year=? AND d.period=?').get(code,Number(y),p);
        if(!d||!ids.has(Number(cid))||!date(v.date))throw Error(`Invalid filing record: ${key}`);
        this.db.prepare("INSERT INTO filings(client_id,form_id,deadline_id,filing_date,reference_number,remarks,status) VALUES(?,?,?,?,?,?,'Complete') ON CONFLICT(client_id,deadline_id) DO UPDATE SET filing_date=excluded.filing_date,reference_number=excluded.reference_number,remarks=excluded.remarks,status='Complete'").run(Number(cid),d.form_id,d.id,v.date,v.reference||'',v.remarks||'');
      }
      this.bumpRevision();
    });
    return this.revision();
  }
  getUsers(){
    return this.db.prepare('SELECT id, username, company_name, role, is_active, created_at, updated_at FROM users ORDER BY id ASC').all();
  }
  saveUser(user){
    if(!user||typeof user!=='object')throw Error('Invalid user payload.');
    required(user.username,'Username');
    const u=user.username.trim();
    if(!/^[a-zA-Z0-9._ -]+$/.test(u))throw Error('Username must contain only letters, numbers, spaces, dots, dashes, or underscores.');
    const company=(user.company_name||'EOO Tax & Accounting').trim();
    const validRoles=['Admin','Staff','Tax Associate','Auditor'];
    const role=validRoles.includes(user.role)?user.role:'Staff';
    const active=user.is_active!==undefined?(user.is_active?1:0):1;

    if(user.id){
      const id=Number(user.id);
      if(!Number.isSafeInteger(id)||id<=0)throw Error('Invalid user ID.');
      const existing=this.db.prepare('SELECT * FROM users WHERE id=?').get(id);
      if(!existing)throw Error('User account not found.');
      if(active===0){
        const otherActive=this.db.prepare('SELECT COUNT(*) n FROM users WHERE is_active=1 AND id!=?').get(id)?.n;
        if(!otherActive)throw Error('Cannot deactivate the only active user account.');
      }
      if(user.password&&user.password.trim()){
        if(user.password.trim().length<6)throw Error('Password must be at least 6 characters.');
        this.db.prepare("UPDATE users SET company_name=?, role=?, is_active=?, password_hash=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
          .run(company,role,active,hashPassword(user.password.trim()),id);
      }else{
        this.db.prepare("UPDATE users SET company_name=?, role=?, is_active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
          .run(company,role,active,id);
      }
      try{
        if(existing.username.toLowerCase()==='admin'||id===1){
          const sql="UPDATE company_login SET company_name=?, is_active=?"+(user.password?.trim()?", password_hash=?":"")+" WHERE id=1";
          const args=user.password?.trim()?[company,active,hashPassword(user.password.trim())]:[company,active];
          this.db.prepare(sql).run(...args);
        }
      }catch(e){}
    }else{
      const duplicate=this.db.prepare('SELECT id FROM users WHERE LOWER(username)=LOWER(?)').get(u);
      if(duplicate)throw Error('Username already exists.');
      required(user.password,'Password');
      if(user.password.trim().length<6)throw Error('Password must be at least 6 characters.');
      this.db.prepare("INSERT INTO users(username,company_name,role,password_hash,is_active) VALUES(?,?,?,?,?)")
        .run(u,company,role,hashPassword(user.password.trim()),active);
    }
    return this.getUsers();
  }
  deleteUser(id){
    const numId=Number(id);
    if(!Number.isSafeInteger(numId)||numId<=0)throw Error('Invalid user ID.');
    const target=this.db.prepare('SELECT id,username,is_active FROM users WHERE id=?').get(numId);
    if(!target)throw Error('User account not found.');
    const totalActive=this.db.prepare('SELECT COUNT(*) n FROM users WHERE is_active=1').get()?.n;
    if(target.is_active===1&&totalActive<=1)throw Error('Cannot delete the only active user account.');
    this.db.prepare('DELETE FROM users WHERE id=?').run(numId);
    return this.getUsers();
  }
  login(username,password){
    required(username,'Username');
    required(password,'Password');
    const u=username.trim();
    let user=this.db.prepare('SELECT id,company_name,username,role,password_hash,is_active FROM users WHERE LOWER(username)=LOWER(?)').get(u);
    if(!user){
      const old=this.db.prepare('SELECT id,company_name,username,password_hash,is_active FROM company_login WHERE LOWER(username)=LOWER(?)').get(u);
      if(old)user={...old,role:'Admin'};
    }
    if(!user||user.is_active!==1)throw Error('Invalid username or password.');
    if(user.password_hash!==hashPassword(password))throw Error('Invalid username or password.');
    return {authenticated:true,company:user.company_name,username:user.username,role:user.role||'Admin'};
  }
  importWorkspace(data){
    if(this.db.prepare('SELECT COUNT(*) n FROM clients').get().n)throw Error('Import is available only before client records have been added.');
    if(data?.format!=='taxguard-export-v1')throw Error('Choose a TaxGuard browser export file.');
    // A failed import must not leave partially imported schedules or clients.
    this.db.exec('SAVEPOINT import_workspace');
    try{this.saveForms(data.forms);this.saveState(data.state);this.db.exec('RELEASE import_workspace');}catch(e){this.db.exec('ROLLBACK TO import_workspace; RELEASE import_workspace');throw e;}
    return this.load();
  }
  close(){this.db.close()}
}
module.exports={Store,scheduleDate};
