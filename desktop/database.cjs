const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {parseCsv}=require('./migration.cjs');

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
    if(!this.db.prepare('PRAGMA table_info(users)').all().some(c=>c.name==='profile_photo'))
      this.db.exec("ALTER TABLE users ADD COLUMN profile_photo TEXT NOT NULL DEFAULT ''");
    if(!this.db.prepare('PRAGMA table_info(clients)').all().some(c=>c.name==='pulled_out_at'))
      this.db.exec('ALTER TABLE clients ADD COLUMN pulled_out_at TEXT');
    if(!this.db.prepare('PRAGMA table_info(clients)').all().some(c=>c.name==='service_history_json'))
      this.db.exec("ALTER TABLE clients ADD COLUMN service_history_json TEXT NOT NULL DEFAULT '[]'");
    if(!this.db.prepare('PRAGMA table_info(clients)').all().some(c=>c.name==='custom_fields_json'))
      this.db.exec("ALTER TABLE clients ADD COLUMN custom_fields_json TEXT NOT NULL DEFAULT '{}'");
    const cols=this.db.prepare('PRAGMA table_info(forms)').all();
    if(!cols.some(c=>c.name==='schedule_json')) this.db.exec("ALTER TABLE forms ADD COLUMN schedule_json TEXT NOT NULL DEFAULT '{}'");
    this.db.exec('CREATE UNIQUE INDEX IF NOT EXISTS unique_client_deadline ON filings(client_id,deadline_id); PRAGMA user_version=1;');
    this.db.exec("CREATE TABLE IF NOT EXISTS workspace_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT OR IGNORE INTO workspace_meta VALUES('revision','0');");
    this.db.exec('CREATE TABLE IF NOT EXISTS client_year_profiles(client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,tax_year INTEGER NOT NULL,profile_json TEXT NOT NULL,PRIMARY KEY(client_id,tax_year));');
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
    const clients=this.db.prepare('SELECT * FROM clients ORDER BY id').all().map(c=>{const history=JSON.parse(c.service_history_json||'[]');return {id:c.id,name:c.name,tin:c.tin,type:c.business_type,tax:c.tax_type,status:c.status,start:c.start_of_filing,pulledOutAt:c.pulled_out_at||undefined,serviceHistory:history.length?history:c.status==='Pulled out'&&c.pulled_out_at?[{end:c.pulled_out_at,restart:null}]:[],customFields:JSON.parse(c.custom_fields_json||'{}'),remarks:c.remarks,forms:this.db.prepare('SELECT f.code FROM client_forms cf JOIN forms f ON f.id=cf.form_id WHERE cf.client_id=?').all(c.id).map(f=>f.code)};});
    for(const c of clients){
      const profiles=this.db.prepare('SELECT tax_year,profile_json FROM client_year_profiles WHERE client_id=?').all(c.id);
      if(profiles.length)c.yearProfiles=Object.fromEntries(profiles.map(p=>[p.tax_year,JSON.parse(p.profile_json)]));
    }
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
        const currentYear=new Date().getFullYear();
        const years=new Set([currentYear-1,currentYear,currentYear+1,...this.db.prepare('SELECT DISTINCT tax_year FROM deadlines WHERE form_id=?').all(fid).map(d=>d.tax_year),...Object.keys(f.overrides||{}).map(Number)]);
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
        if(!['Active','Inactive','Closed','For closure','Pulled out'].includes(c.status))throw Error('Invalid client status.');
        if(c.status==='Pulled out'&&(!date(c.pulledOutAt)||c.pulledOutAt<c.start))throw Error('Pullout date must be on or after the start of filing.');
        const serviceHistory=c.serviceHistory|| (c.status==='Pulled out'?[{end:c.pulledOutAt,restart:null}]:[]);
        if(!Array.isArray(serviceHistory)||serviceHistory.length>100)throw Error('Invalid service history.');
        for(let i=0;i<serviceHistory.length;i++){
          const interval=serviceHistory[i];
          if(!interval||!date(interval.end)||interval.end<c.start||interval.restart!==null&&(!date(interval.restart)||interval.restart<interval.end))throw Error('Invalid pullout or restart date.');
          if(i&&(!serviceHistory[i-1].restart||interval.end<serviceHistory[i-1].restart))throw Error('Service periods must be chronological.');
          if(i<serviceHistory.length-1&&!interval.restart)throw Error('Only the current pullout may remain open.');
        }
        if(c.status==='Pulled out'&&(!serviceHistory.length||serviceHistory.at(-1).end!==c.pulledOutAt||serviceHistory.at(-1).restart!==null))throw Error('Current pullout does not match service history.');
        if(c.status!=='Pulled out'&&serviceHistory.at(-1)?.restart===null)throw Error('Reactivate the client before clearing the pullout date.');
        if(c.customFields!==undefined&&(!c.customFields||typeof c.customFields!=='object'||Array.isArray(c.customFields)||Object.keys(c.customFields).length>30||Object.entries(c.customFields).some(([key,value])=>key.length>80||typeof value!=='string'||value.length>1000)))throw Error('Invalid custom client fields.');
        required(c.type,'Business type');
        this.db.prepare('INSERT INTO clients(id,name,tin,business_type,tax_type,status,start_of_filing,remarks,pulled_out_at,service_history_json,custom_fields_json) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,tin=excluded.tin,business_type=excluded.business_type,tax_type=excluded.tax_type,status=excluded.status,start_of_filing=excluded.start_of_filing,remarks=excluded.remarks,pulled_out_at=excluded.pulled_out_at,service_history_json=excluded.service_history_json,custom_fields_json=excluded.custom_fields_json').run(c.id,c.name.trim(),c.tin,c.type,c.tax,c.status,c.start,c.remarks||'',c.status==='Pulled out'?c.pulledOutAt:null,JSON.stringify(serviceHistory),JSON.stringify(c.customFields||{}));
        if(!Array.isArray(c.forms))throw Error('Invalid required forms.');
        this.db.prepare('DELETE FROM client_forms WHERE client_id=?').run(c.id);
        for(const code of new Set(c.forms)){const f=this.db.prepare('SELECT id FROM forms WHERE code=?').get(code);if(!f)throw Error(`Unknown required form: ${code}`);this.db.prepare('INSERT INTO client_forms VALUES(?,?)').run(c.id,f.id);}
        if(c.yearProfiles!==undefined&&(!c.yearProfiles||typeof c.yearProfiles!=='object'||Array.isArray(c.yearProfiles)))throw Error('Invalid yearly profiles.');
        for(const [y,profile] of Object.entries(c.yearProfiles||{})){
          if(!/^\d{4}$/.test(y)||Number(y)<1000||Number(y)>9998||!profile||!Array.isArray(profile.forms))throw Error('Invalid yearly requirements.');
          if(!['VAT','NVAT'].includes(profile.tax))throw Error('Invalid yearly tax type.');
          required(profile.type,'Yearly business type');
          const clean={type:profile.type,tax:profile.tax,forms:[...new Set(profile.forms)],periods:{}};
          if(profile.inheritedFrom!==undefined){
            if(!Number.isInteger(profile.inheritedFrom)||profile.inheritedFrom>=Number(y)||profile.inheritedFrom<1000)throw Error('Invalid source year.');
            clean.inheritedFrom=profile.inheritedFrom;
          }
          if(profile.reviewReason){required(profile.reviewReason,'Review reason');clean.reviewReason=profile.reviewReason;}
          for(const code of clean.forms){
            const f=this.db.prepare('SELECT schedule_json FROM forms WHERE code=?').get(code);
            if(!f)throw Error(`Unknown required form: ${code}`);
            if(profile.periods?.[code]){
              const periods=profile.periods[code],schedule=JSON.parse(f.schedule_json);
              if(!Array.isArray(periods)||!periods.length||periods.some(p=>!schedule.periods.includes(p)))throw Error('Invalid yearly periods.');
              clean.periods[code]=[...new Set(periods)];
            }
          }
          for(const field of ['calendar','income','percentage','compensation','expanded']){
            if(profile[field]!==undefined){if(typeof profile[field]!=='string'||profile[field].length>100)throw Error('Invalid registration choice.');clean[field]=profile[field];}
          }
          const recorded=this.db.prepare('SELECT f.code,d.period FROM filings fi JOIN forms f ON f.id=fi.form_id JOIN deadlines d ON d.id=fi.deadline_id WHERE fi.client_id=? AND d.tax_year=?').all(c.id,Number(y));
          for(const [key] of Object.entries(state.filings)){const [cid,fy,code,period]=key.split(':');if(Number(cid)===c.id&&fy===y)recorded.push({code,period});}
          for(const record of recorded){
            if(!clean.forms.includes(record.code))throw Error(`Keep ${record.code} in ${y}: it has recorded filings.`);
            if(clean.periods[record.code]&&!clean.periods[record.code].includes(record.period))throw Error(`Keep filed period ${record.period} for ${record.code} in ${y}.`);
          }
          this.db.prepare('INSERT INTO client_year_profiles VALUES(?,?,?) ON CONFLICT(client_id,tax_year) DO UPDATE SET profile_json=excluded.profile_json').run(c.id,Number(y),JSON.stringify(clean));
        }
      }
      for(const [key,v] of Object.entries(state.filings)){
        const parts=key.split(':');if(parts.length!==4)throw Error('Invalid filing key.');
        const [cid,y,code,p]=parts;
        const filingYear=Number(y);
        if(!Number.isInteger(filingYear)||filingYear<1000||filingYear>9998)throw Error('Invalid tax year.');
        let d=this.db.prepare('SELECT d.id,d.form_id FROM deadlines d JOIN forms f ON f.id=d.form_id WHERE f.code=? AND d.tax_year=? AND d.period=?').get(code,filingYear,p);
        if(!d){
          const form=this.db.prepare('SELECT id,schedule_json FROM forms WHERE code=?').get(code);
          const schedule=form&&JSON.parse(form.schedule_json);
          if(!schedule?.periods.includes(p))throw Error(`Invalid filing record: ${key}`);
          const due=scheduleDate(schedule,p,filingYear);
          if(!date(due))throw Error('Invalid deadline date.');
          const inserted=this.db.prepare('INSERT INTO deadlines(form_id,tax_year,period,due_date) VALUES(?,?,?,?)').run(form.id,filingYear,p,due);
          d={id:inserted.lastInsertRowid,form_id:form.id};
        }
        if(!d||!ids.has(Number(cid))||!date(v.date))throw Error(`Invalid filing record: ${key}`);
        this.db.prepare("INSERT INTO filings(client_id,form_id,deadline_id,filing_date,reference_number,remarks,status) VALUES(?,?,?,?,?,?,'Complete') ON CONFLICT(client_id,deadline_id) DO UPDATE SET filing_date=excluded.filing_date,reference_number=excluded.reference_number,remarks=excluded.remarks,status='Complete'").run(Number(cid),d.form_id,d.id,v.date,v.reference||'',v.remarks||'');
      }
      this.bumpRevision();
    });
    return this.revision();
  }
  getUsers(){
    return this.db.prepare('SELECT id, username, company_name, role, is_active, profile_photo, created_at, updated_at FROM users ORDER BY id ASC').all();
  }
  getCompanyName(){
    return this.getCompanyProfile().name;
  }
  getCompanyProfile(){
    const name=this.db.prepare("SELECT value FROM workspace_meta WHERE key='company_name'").get()?.value
      ||this.db.prepare('SELECT company_name FROM users ORDER BY id LIMIT 1').get()?.company_name
      ||'EOO Tax & Accounting';
    const logo=this.db.prepare("SELECT value FROM workspace_meta WHERE key='company_logo'").get()?.value||'';
    return {name,logo};
  }
  getClientFields(){
    return JSON.parse(this.db.prepare("SELECT value FROM workspace_meta WHERE key='client_fields'").get()?.value||'[]');
  }
  saveClientFields(fields){
    if(!Array.isArray(fields)||fields.length>10||fields.some(field=>typeof field!=='string'||!field.trim()||field.trim().length>50))throw Error('Use up to 10 client fields with names under 50 characters.');
    const clean=fields.map(field=>field.trim());
    if(new Set(clean.map(field=>field.toLowerCase())).size!==clean.length)throw Error('Client field names must be unique.');
    this.db.prepare("INSERT INTO workspace_meta(key,value) VALUES('client_fields',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(clean));
    return clean;
  }
  saveCompanyName(value){
    return this.saveCompanyProfile({name:value,logo:this.getCompanyProfile().logo}).name;
  }
  saveCompanyProfile(profile){
    if(!profile||typeof profile!=='object')throw Error('Invalid company profile.');
    const company=required(profile.name,'Company name');
    if(company.length>120)throw Error('Company name must be 120 characters or fewer.');
    const logo=profile.logo||'';
    if(typeof logo!=='string'||logo.length>7*1024*1024)throw Error('Company logo must be smaller than 5 MB.');
    if(logo&&!/^data:image\/(png|jpeg|webp|gif|bmp|x-icon|vnd\.microsoft\.icon);base64,[a-zA-Z0-9+/=]+$/.test(logo))throw Error('Company logo must be a PNG, JPEG, WebP, GIF, BMP, or ICO image.');
    this.transaction(()=>{
      this.db.prepare("INSERT INTO workspace_meta(key,value) VALUES('company_name',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(company);
      this.db.prepare("INSERT INTO workspace_meta(key,value) VALUES('company_logo',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(logo);
      this.db.prepare('UPDATE users SET company_name=?, updated_at=CURRENT_TIMESTAMP').run(company);
      this.db.prepare('UPDATE company_login SET company_name=?, updated_at=CURRENT_TIMESTAMP WHERE id=1').run(company);
    });
    return {name:company,logo};
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
    const photo=user.profile_photo;
    if(photo!==undefined&&(typeof photo!=='string'||photo.length>3*1024*1024||
      (photo&&!/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/]+={0,2}$/.test(photo))))
      throw Error('Profile picture must be a PNG, JPEG, or WebP image smaller than 2 MB.');

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
      if(photo!==undefined)this.db.prepare('UPDATE users SET profile_photo=? WHERE id=?').run(photo,id);
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
      this.db.prepare("INSERT INTO users(username,company_name,role,password_hash,is_active,profile_photo) VALUES(?,?,?,?,?,?)")
        .run(u,company,role,hashPassword(user.password.trim()),active,photo||'');
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
    let user=this.db.prepare('SELECT id,company_name,username,role,password_hash,is_active,profile_photo FROM users WHERE LOWER(username)=LOWER(?)').get(u);
    if(!user){
      const old=this.db.prepare('SELECT id,company_name,username,password_hash,is_active FROM company_login WHERE LOWER(username)=LOWER(?)').get(u);
      if(old)user={...old,role:'Admin'};
    }
    if(!user||user.is_active!==1)throw Error('Invalid username or password.');
    if(user.password_hash!==hashPassword(password))throw Error('Invalid username or password.');
    return {authenticated:true,company:this.getCompanyName(),username:user.username,role:user.role||'Admin',profile_photo:user.profile_photo||''};
  }
  importWorkspace(data){
    if(this.db.prepare('SELECT COUNT(*) n FROM clients').get().n)throw Error('Import is available only before client records have been added.');
    if(data?.format!=='taxguard-export-v1')throw Error('Choose a TaxGuard browser export file.');
    // A failed import must not leave partially imported schedules or clients.
    this.db.exec('SAVEPOINT import_workspace');
    try{this.saveForms(data.forms);this.saveState(data.state);this.db.exec('RELEASE import_workspace');}catch(e){this.db.exec('ROLLBACK TO import_workspace; RELEASE import_workspace');throw e;}
    return this.load();
  }
  importClientsCsv(text){
    return this.importClientsRows(parseCsv(text));
  }
  importClientsRows(rows){
    if(!Array.isArray(rows)||rows.length>50000)throw Error('Invalid client import rows.');
    const snapshot=this.load();
    const knownTins=new Set(snapshot.clients.map(client=>client.tin));
    const formCodes=new Set(snapshot.forms.map(form=>form.id));
    let nextId=Math.max(0,...snapshot.clients.map(client=>client.id))+1,skipped=0;
    const additions=[];
    for(const [index,row] of rows.entries()){
      const tin=row.tin;
      if(knownTins.has(tin)){skipped++;continue;}
      knownTins.add(tin);
      const forms=(row.required_forms||row.forms||'').split(/[;|]/).map(value=>value.trim()).filter(Boolean);
      if(forms.some(code=>!formCodes.has(code)))throw Error(`CSV row ${index+2} contains an unknown form.`);
      additions.push({id:nextId++,name:row.name,tin,type:row.business_type||row.type||'',tax:row.tax_type||row.tax||'',status:row.status||'Active',start:row.start_of_filing||row.start||'',remarks:row.remarks||'',forms});
    }
    if(additions.length)this.saveState({clients:[...snapshot.clients,...additions],filings:snapshot.filings},snapshot.revision);
    return {imported:additions.length,skipped,revision:this.revision()};
  }
  getCalendarRules(){
    return this.db.prepare('SELECT id,rule_type,rule_date,label,form_code,tax_year,period,adjusted_due,source_url FROM calendar_rules ORDER BY rule_date,id').all();
  }
  saveCalendarRule(rule){
    if(!rule||!['holiday','extension'].includes(rule.rule_type))throw Error('Choose a calendar rule type.');
    const ruleDate=required(rule.rule_date,'Rule date');
    if(!date(ruleDate))throw Error('Invalid calendar date.');
    const label=String(rule.label||'').trim(),source=String(rule.source_url||'').trim();
    if(label.length>200||source.length>500||(source&&!/^https:\/\//i.test(source)))throw Error('Use a short label and an HTTPS source link.');
    const code=String(rule.form_code||'').trim(),period=String(rule.period||'').trim(),taxYear=Number(rule.tax_year||0),adjusted=String(rule.adjusted_due||'');
    if(rule.rule_type==='extension'){
      const form=this.db.prepare('SELECT schedule_json FROM forms WHERE code=?').get(code);
      if(!form||!JSON.parse(form.schedule_json).periods.includes(period)||!Number.isInteger(taxYear)||taxYear<1000||taxYear>9998||!date(adjusted)||adjusted<ruleDate)throw Error('Choose a valid form, period, year, and extended due date.');
      if(!source)throw Error('A circular or announcement source link is required for an extension.');
    }
    this.db.prepare('INSERT INTO calendar_rules(rule_type,rule_date,label,form_code,tax_year,period,adjusted_due,source_url) VALUES(?,?,?,?,?,?,?,?)').run(rule.rule_type,ruleDate,label,rule.rule_type==='extension'?code:'',rule.rule_type==='extension'?taxYear:0,rule.rule_type==='extension'?period:'',rule.rule_type==='extension'?adjusted:'',source);
    return this.getCalendarRules();
  }
  deleteCalendarRule(id){
    const num=Number(id);if(!Number.isSafeInteger(num)||num<=0)throw Error('Invalid calendar rule ID.');
    this.db.prepare('DELETE FROM calendar_rules WHERE id=?').run(num);
    return this.getCalendarRules();
  }
  backupTo(target){
    if(typeof target!=='string'||!target)throw Error('Choose a backup file.');
    const temporary=target+'.partial-'+process.pid;
    try{
      this.db.exec("VACUUM INTO '"+temporary.replace(/'/g,"''")+"'");
      fs.copyFileSync(temporary,target);
      return target;
    }finally{try{fs.unlinkSync(temporary)}catch{}}
  }
  static validateBackup(filename){
    const candidate=new DatabaseSync(filename,{readOnly:true});
    try{
      if(candidate.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Backup failed SQLite integrity check.');
      for(const name of ['clients','forms','filings','users','workspace_meta']){
        if(!candidate.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name))throw Error('Backup is missing '+name+'.');
      }
    }finally{candidate.close();}
    return true;
  }
  listClientDocuments(clientId){
    const id=Number(clientId);
    if(!Number.isSafeInteger(id)||id<=0)throw Error('Invalid client ID.');
    return this.db.prepare('SELECT id,client_id,filing_key,filename,mime_type,created_at FROM client_documents WHERE client_id=? ORDER BY created_at DESC,id DESC').all(id);
  }
  saveClientDocument(data){
    const clientId=Number(data?.clientId),filename=required(data?.filename,'Document filename');
    if(!Number.isSafeInteger(clientId)||clientId<=0||!this.db.prepare('SELECT id FROM clients WHERE id=?').get(clientId))throw Error('Client not found.');
    if(filename.length>200||/[\\/\x00-\x1f]/.test(filename))throw Error('Invalid document filename.');
    const mime=String(data?.mime||'');
    if(!['application/pdf','image/png','image/jpeg','image/webp'].includes(mime))throw Error('Choose a PDF, PNG, JPEG, or WebP file.');
    const content=String(data?.base64||'');
    if(!/^[A-Za-z0-9+/]+={0,2}$/.test(content)||content.length>7*1024*1024||Buffer.from(content,'base64').length>5*1024*1024)throw Error('Document must be 5 MB or less.');
    const filingKey=String(data?.filingKey||'');
    if(filingKey&&(!filingKey.startsWith(clientId+':')||!/^\d+:\d{4}:[A-Za-z0-9() ._-]+:[A-Za-z0-9 _-]+$/.test(filingKey)))throw Error('Invalid filing association.');
    this.db.prepare('INSERT INTO client_documents(client_id,filing_key,filename,mime_type,content_base64) VALUES(?,?,?,?,?)').run(clientId,filingKey,filename,mime,content);
    return this.listClientDocuments(clientId);
  }
  getClientDocument(id){
    const value=this.db.prepare('SELECT id,client_id,filing_key,filename,mime_type,content_base64,created_at FROM client_documents WHERE id=?').get(Number(id));
    if(!value)throw Error('Document not found.');
    return value;
  }
  deleteClientDocument(id){
    const value=this.getClientDocument(id);
    this.db.prepare('DELETE FROM client_documents WHERE id=?').run(value.id);
    return this.listClientDocuments(value.client_id);
  }
  close(){this.db.close()}
}
module.exports={Store,scheduleDate};
