const APP = { NAME: 'Fleet ERP', VERSION: '0.1.0', SESSION_TTL: 21600 };
const TABLES = {
  Vehicles: ['vehicle_id','plate','make','model','year','site','assigned_driver','driver_phone','current_km','last_oil_km','oil_interval_km','vehicle_pin_hash','status','created_at','updated_at'],
  KM_Records: ['record_id','vehicle_id','reading_km','reading_date','driver_name','notes','created_by','created_at'],
  Oil_Changes: ['record_id','vehicle_id','reading_km','change_date','oil_type','notes','created_by','created_at'],
  Tickets: ['ticket_id','vehicle_id','category','title','description','priority','status','reported_by','reported_at','assigned_to','closed_at','notes'],
  Maintenance: ['record_id','vehicle_id','maintenance_type','scheduled_date','completed_date','status','technician','cost','notes','created_at','updated_at'],
  Tire_Requests: ['request_id','vehicle_id','request_type','description','status','requested_by','requested_at','notes'],
  Inspections: ['record_id','vehicle_id','inspection_type','due_date','completed_date','status','cost','notes','created_at'],
  Users: ['user_id','username','password_hash','full_name','role','is_active','created_at'],
  Audit_Log: ['log_id','actor','action','entity','entity_id','details','created_at'],
  Settings: ['key','value','updated_at']
};

function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle(APP.NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
function include(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }

function setupFleetERP() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(TABLES).forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0) sh.getRange(1,1,1,TABLES[name].length).setValues([TABLES[name]]);
    sh.setFrozenRows(1);
    sh.getRange(1,1,1,TABLES[name].length).setFontWeight('bold').setBackground('#1e3a8a').setFontColor('#ffffff');
  });
  const settings = ss.getSheetByName('Settings');
  if (settings.getLastRow() === 1) settings.appendRow(['oil_interval_km','5000',new Date()]);
  return { ok:true, sheets:Object.keys(TABLES), message:'Fleet ERP sheets initialized.' };
}

// Run once from the Apps Script editor to create the first Owner account.
// Never put the password in a public sheet or HTML file.
function initializeOwnerAccount(username, password, fullName) {
  if (!username || !password || String(password).length < 10) throw new Error('Use a username and a password of at least 10 characters.');
  const sh = sheet_('Users');
  if (sh.getLastRow() > 1) throw new Error('Users already exist. Use the owner account to manage access.');
  const salt = Utilities.getUuid();
  const hash = hash_(salt + String(password));
  sh.appendRow([Utilities.getUuid(),String(username).trim().toLowerCase(),salt+':'+hash,fullName||'Fleet Owner','Owner',true,new Date()]);
  audit_('System','CREATE','User',username,'Initial Owner account created');
  return 'Owner account created.';
}

function login(payload) {
  payload = payload || {};
  const username = String(payload.username || '').trim().toLowerCase();
  const password = String(payload.password || '');
  const vehiclePlate = String(payload.vehiclePlate || '').trim().toUpperCase();
  const driverName = String(payload.driverName || '').trim();
  const vehiclePin = String(payload.vehiclePin || '');
  let identity;
  if (username && password) {
    const rows = rows_('Users');
    const u = rows.find(r => String(r.username).toLowerCase() === username && String(r.is_active).toLowerCase() !== 'false');
    if (!u || !verify_(u.password_hash,password)) throw new Error('Invalid username or password.');
    identity = {id:u.user_id,username:u.username,fullName:u.full_name,role:u.role,vehicleId:null,vehiclePlate:null};
  } else if (vehiclePlate && vehiclePin && driverName) {
    const v = rows_('Vehicles').find(r => String(r.plate).trim().toUpperCase() === vehiclePlate && String(r.status||'Active').toLowerCase() !== 'inactive');
    if (!v || !verify_(v.vehicle_pin_hash,vehiclePin)) throw new Error('Vehicle number or access code is incorrect.');
    identity = {id:'vehicle:'+v.vehicle_id,username:'vehicle-'+vehiclePlate,fullName:driverName,role:'Driver',vehicleId:v.vehicle_id,vehiclePlate:v.plate};
  } else {
    throw new Error('Enter your Owner login or vehicle access details.');
  }
  const token = Utilities.getUuid()+Utilities.getUuid();
  CacheService.getScriptCache().put('sess:'+token,JSON.stringify(identity),APP.SESSION_TTL);
  audit_(identity.fullName,'LOGIN','Session',token.slice(0,8),'Signed in');
  return {token,user:identity};
}

function logout(token) {
  const user = session_(token);
  if (user) audit_(user.fullName,'LOGOUT','Session','', 'Signed out');
  CacheService.getScriptCache().remove('sess:'+token);
  return {ok:true};
}
function getAppData(token) {
  const user = requireSession_(token);
  const vehicles = rows_('Vehicles').map(v => enrichVehicle_(v));
  const visibleVehicles = user.role === 'Driver' ? vehicles.filter(v => String(v.vehicle_id) === String(user.vehicleId)) : vehicles;
  const tickets = rows_('Tickets').filter(t => user.role !== 'Driver' || String(t.vehicle_id) === String(user.vehicleId));
  const km = rows_('KM_Records').filter(r => user.role !== 'Driver' || String(r.vehicle_id) === String(user.vehicleId));
  const maintenance = rows_('Maintenance').filter(r => user.role !== 'Driver' || String(r.vehicle_id) === String(user.vehicleId));
  return {user,vehicles:visibleVehicles,tickets,km,maintenance,serverTime:new Date().toISOString()};
}
function submitKm(token, payload) {
  const user = requireSession_(token), v = permittedVehicle_(user,payload.vehicleId);
  const reading = Number(payload.readingKm);
  if (!Number.isFinite(reading) || reading < Number(v.current_km||0)) throw new Error('KM reading cannot be lower than the current recorded KM.');
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const latest = rows_('Vehicles').find(x => String(x.vehicle_id) === String(v.vehicle_id));
    if (reading < Number(latest.current_km||0)) throw new Error('A newer KM reading was saved. Refresh and try again.');
    const now = new Date();
    sheet_('KM_Records').appendRow([Utilities.getUuid(),v.vehicle_id,reading,now,user.fullName,String(payload.notes||''),user.username,now]);
    updateById_('Vehicles','vehicle_id',v.vehicle_id,{current_km:reading,updated_at:now});
    audit_(user.fullName,'CREATE','KM_Records',v.vehicle_id,'KM '+reading);
    return {ok:true,currentKm:reading};
  } finally { lock.releaseLock(); }
}
function createTicket(token,payload) {
  const user = requireSession_(token), v = permittedVehicle_(user,payload.vehicleId);
  const now = new Date(), id = Utilities.getUuid();
  sheet_('Tickets').appendRow([id,v.vehicle_id,String(payload.category||'Maintenance'),String(payload.title||'Maintenance request'),String(payload.description||''),String(payload.priority||'Normal'),'Open',user.fullName,now,'', '', '']);
  audit_(user.fullName,'CREATE','Ticket',id,'Vehicle '+v.plate);
  return {ok:true,id};
}
function recordOilChange(token,payload) {
  const user = requireSession_(token), v = permittedVehicle_(user,payload.vehicleId);
  const km = Number(payload.readingKm || v.current_km || 0);
  if (km < Number(v.last_oil_km||0) || km > Number(v.current_km||0)) throw new Error('Check the oil-change KM against the current vehicle reading.');
  const now = new Date(), id = Utilities.getUuid();
  sheet_('Oil_Changes').appendRow([id,v.vehicle_id,km,now,String(payload.oilType||''),String(payload.notes||''),user.fullName,now]);
  updateById_('Vehicles','vehicle_id',v.vehicle_id,{last_oil_km:km,updated_at:now});
  audit_(user.fullName,'CREATE','Oil_Changes',id,'Oil change at '+km+' km');
  return {ok:true};
}
function updateTicketStatus(token,id,status,notes) {
  const user = requireOwner_(token);
  updateById_('Tickets','ticket_id',id,{status:String(status),notes:String(notes||''),closed_at:String(status)==='Closed'?new Date():''});
  audit_(user.fullName,'UPDATE','Ticket',id,'Status '+status);
  return {ok:true};
}

function addVehicle(token,payload) {
  const user=requireOwner_(token);
  const plate=String(payload.plate||'').trim().toUpperCase();
  const pin=String(payload.vehiclePin||'');
  if(!plate) throw new Error('Vehicle plate is required.');
  if(pin.length<4) throw new Error('Vehicle access code must be at least 4 characters.');
  if(rows_('Vehicles').some(v=>String(v.plate).trim().toUpperCase()===plate)) throw new Error('This vehicle plate already exists.');
  const salt=Utilities.getUuid();
  const id=Utilities.getUuid(), now=new Date();
  sheet_('Vehicles').appendRow([id,plate,String(payload.make||''),String(payload.model||''),String(payload.year||''),String(payload.site||''),String(payload.driver||''),String(payload.phone||''),Number(payload.currentKm||0),Number(payload.lastOilKm||0),Number(payload.oilIntervalKm||5000),salt+':'+hash_(salt+pin),'Active',now,now]);
  audit_(user.fullName,'CREATE','Vehicle',id,'Added '+plate);
  return {ok:true,id};
}
function updateVehicle(token,id,payload) {
  const user=requireOwner_(token);
  const patch={plate:String(payload.plate||'').trim().toUpperCase(),make:String(payload.make||''),model:String(payload.model||''),year:String(payload.year||''),site:String(payload.site||''),assigned_driver:String(payload.driver||''),driver_phone:String(payload.phone||''),oil_interval_km:Number(payload.oilIntervalKm||5000),status:String(payload.status||'Active'),updated_at:new Date()};
  if(payload.currentKm!==undefined) patch.current_km=Number(payload.currentKm||0);
  if(payload.lastOilKm!==undefined) patch.last_oil_km=Number(payload.lastOilKm||0);
  if(payload.vehiclePin) {
    if(String(payload.vehiclePin).length<4) throw new Error('Vehicle access code must be at least 4 characters.');
    const salt=Utilities.getUuid(); patch.vehicle_pin_hash=salt+':'+hash_(salt+String(payload.vehiclePin));
  }
  updateById_('Vehicles','vehicle_id',id,patch);
  audit_(user.fullName,'UPDATE','Vehicle',id,'Updated '+patch.plate);
  return {ok:true};
}
function getAuditLog(token) {
  requireOwner_(token);
  return rows_('Audit_Log').slice(-200).reverse();
}

function session_(token) {
  if (!token) return null;
  const raw = CacheService.getScriptCache().get('sess:'+token);
  return raw ? JSON.parse(raw) : null;
}
function requireSession_(token) { const u=session_(token); if(!u) throw new Error('Session expired. Please sign in again.'); return u; }
function requireOwner_(token) { const u=requireSession_(token); if(!['Owner','Admin','FleetSupervisor'].includes(u.role)) throw new Error('You do not have permission for this action.'); return u; }
function permittedVehicle_(user,id) {
  const v=rows_('Vehicles').find(x=>String(x.vehicle_id)===String(id));
  if(!v) throw new Error('Vehicle not found.');
  if(user.role==='Driver' && String(user.vehicleId)!==String(v.vehicle_id)) throw new Error('Access denied for this vehicle.');
  return v;
}
function enrichVehicle_(v) {
  const current=Number(v.current_km||0), last=Number(v.last_oil_km||0), interval=Number(v.oil_interval_km||5000);
  const since=Math.max(0,current-last), remaining=interval-since;
  return Object.assign({},v,{sinceOil:since,remaining,status:remaining<=0?'Urgent Overdue':remaining<=500?'Warning':'Safe'});
}
function sheet_(name) { const s=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name); if(!s) throw new Error('Missing sheet '+name+'. Run setupFleetERP first.'); return s; }
function rows_(name) {
  const sh=sheet_(name), values=sh.getDataRange().getValues();
  if(values.length<2) return [];
  const headers=values.shift();
  return values.filter(r=>r.some(c=>c!=='' && c!==null)).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i] instanceof Date?r[i].toISOString():r[i]])));
}
function updateById_(name,key,id,patch) {
  const sh=sheet_(name), values=sh.getDataRange().getValues(), headers=values[0], idx=headers.indexOf(key);
  if(idx<0) throw new Error('Unknown key '+key);
  for(let r=1;r<values.length;r++) if(String(values[r][idx])===String(id)) {
    Object.keys(patch).forEach(k=>{const c=headers.indexOf(k);if(c>=0)sh.getRange(r+1,c+1).setValue(patch[k]);});
    return true;
  }
  throw new Error('Record not found.');
}
function audit_(actor,action,entity,id,details) {
  const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Audit_Log');
  if(sh) sh.appendRow([Utilities.getUuid(),actor,action,entity,String(id||''),details||'',new Date()]);
}
function hash_(value) { const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,value,Utilities.Charset.UTF_8); return bytes.map(b=>(b<0?b+256:b).toString(16).padStart(2,'0')).join(''); }
function verify_(stored,password) {
  const parts=String(stored||'').split(':'); return parts.length===2 && hash_(parts[0]+password)===parts[1];
}
