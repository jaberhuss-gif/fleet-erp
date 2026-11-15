const APP = { NAME: 'Fleet ERP', VERSION: '0.1.0', SESSION_TTL: 21600 };
const TABLES = {
  Vehicles: ['vehicle_id','plate','make','model','year','site','assigned_driver','driver_phone','current_km','last_oil_km','oil_interval_km','vehicle_pin_hash','status','created_at','updated_at'],
  KM_Records: ['record_id','vehicle_id','reading_km','reading_date','driver_name','notes','created_by','created_at'],
  Oil_Changes: ['record_id','vehicle_id','reading_km','change_date','oil_type','notes','created_by','created_at'],
  Tickets: ['ticket_id','vehicle_id','category','title','description','priority','status','reported_by','reported_at','assigned_to','closed_at','notes'],
  Maintenance: ['record_id','vehicle_id','maintenance_type','scheduled_date','completed_date','status','technician','cost','notes','created_at','updated_at'],
  Tire_Requests: ['request_id','vehicle_id','request_type','description','status','requested_by','requested_at','notes'],
  Tire_Surveys: ['survey_id','vehicle_id','driver_name','survey_date','notes','status','created_at'],
  Tire_Survey_Tires: ['tire_record_id','survey_id','vehicle_id','position','manufacturer_serial','brand','model','size','manufacturing_year','tread_mm','pressure_psi','condition_notes','photo_file_id','photo_url','created_at'],
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

// Creates ONE shared Driver Portal login. Run once from Apps Script editor.
// Drivers choose their own name after signing in; no individual user accounts are created.
// Run this from the Apps Script editor once. It asks for the single shared Driver Portal username/password.
function setupSharedDriverPortal() {
  const ui = SpreadsheetApp.getUi();
  const userPrompt = ui.prompt('Shared Driver Portal', 'Enter one shared Driver Portal username:', ui.ButtonSet.OK_CANCEL);
  if (userPrompt.getSelectedButton() !== ui.Button.OK) return 'Cancelled.';
  const passPrompt = ui.prompt('Shared Driver Portal', 'Enter the existing shared driver password (exactly 9 digits):', ui.ButtonSet.OK_CANCEL);
  if (passPrompt.getSelectedButton() !== ui.Button.OK) return 'Cancelled.';
  const result = initializeDriverPortalAccount(userPrompt.getResponseText(),passPrompt.getResponseText());
  ui.alert(result);
  return result;
}

function initializeDriverPortalAccount(username, password) {
  if (String(username||'').trim() !== 'Driver') throw new Error('The shared Driver Portal username must be exactly Driver.');
  if (!/^\d{9}$/.test(String(password))) throw new Error('The shared Driver Portal password must be exactly 9 digits.');
  const sh = sheet_('Users');
  const rows = rows_('Users');
  if (rows.some(r => String(r.role) === 'Driver')) throw new Error('A Driver Portal account already exists.');
  const normalized = 'Driver';
  if (rows.some(r => String(r.username).toLowerCase() === normalized)) throw new Error('This username already exists.');
  const salt = Utilities.getUuid();
  sh.appendRow([Utilities.getUuid(),normalized,salt+':'+hash_(salt+String(password)),'Shared Driver Portal','Driver',true,new Date()]);
  audit_('System','CREATE','User',normalized,'Single shared Driver Portal account created');
  return 'Shared Driver Portal account created.';
}

function login(payload) {
  payload = payload || {};
  const username = String(payload.username || '').trim();
  const password = String(payload.password || '');
  if (!username || !password) throw new Error('Enter your Owner or Driver username and password.');
  const rows = rows_('Users');
  const u = rows.find(r => String(r.username) === username && String(r.is_active).toLowerCase() !== 'false');
  if (!u || !['Owner','Driver'].includes(String(u.role)) || (u.role === 'Driver' && u.username !== 'Driver') || !verify_(u.password_hash,password)) {
    throw new Error('Invalid username or password.');
  }
  const identity = {id:u.user_id,username:u.username,fullName:u.full_name,role:u.role,vehicleId:null,vehiclePlate:null};
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
  // Vehicle Master is small and must be current; activity sheets can grow indefinitely.
  const allVehicles = rows_('Vehicles').map(v => enrichVehicle_(v));
  const activeVehicles = allVehicles.filter(v => String(v.status || 'Active').toLowerCase() !== 'inactive');
  const vehicleChoices = user.role === 'Driver' && !user.vehicleId
    ? activeVehicles.map(v => ({vehicle_id:String(v.vehicle_id),plate:String(v.plate||''),assigned_driver:String(v.assigned_driver||''),make:String(v.make||''),model:String(v.model||'')})).filter(v=>v.assigned_driver)
    : [];
  const allowedIds = user.role !== 'Driver' ? null : user.vehicleId
    ? [String(user.vehicleId)]
    : user.selectedDriverName
      ? activeVehicles.filter(v => String(v.assigned_driver || '').trim().toLowerCase() === String(user.selectedDriverName).trim().toLowerCase()).map(v => String(v.vehicle_id))
      : [];
  const visibleVehicles = allowedIds === null ? allVehicles : allVehicles.filter(v => allowedIds.includes(String(v.vehicle_id)));
  // Never send another driver's records to the shared Driver Portal. Before a driver
  // selects a name, return no operational records. Keep payloads bounded for Apps Script.
  const recordLimit = user.role === 'Driver' ? 150 : 500;
  const readRecords = name => {
    if (user.role === 'Driver' && !allowedIds.length) return [];
    return recentRows_(name, recordLimit).filter(row => allowedIds === null || allowedIds.includes(String(row.vehicle_id)));
  };
  return {
    user, vehicles:visibleVehicles, vehicleChoices,
    tickets:readRecords('Tickets'), km:readRecords('KM_Records'),
    maintenance:readRecords('Maintenance'), tireRequests:readRecords('Tire_Requests'),
    inspections:readRecords('Inspections'), oilChanges:readRecords('Oil_Changes'),
    tireSurveys:readRecords('Tire_Surveys'), tireSurveyTires:readRecords('Tire_Survey_Tires'),
    driverNames, selectedDriverName:user.selectedDriverName||'', requiresDriverSelection:user.role==='Driver'&&!user.selectedDriverName, serverTime:new Date().toISOString()
  };
}
function selectDriver(token, driverName) {
  const user = requireSession_(token);
  if (user.role !== 'Driver' || user.vehicleId) throw new Error('This action is only available to the shared Driver Portal.');
  const name = String(driverName||'').trim();
  if (user.selectedDriverName) {
    if (String(user.selectedDriverName).toLowerCase() !== name.toLowerCase()) throw new Error('Driver identity is locked for this session. Log out and sign in again to select a driver.');
    return {ok:true,driverName:user.selectedDriverName,vehicleCount:rows_('Vehicles').filter(v=>String(v.assigned_driver||'').trim().toLowerCase()===String(user.selectedDriverName).toLowerCase() && String(v.status||'Active').toLowerCase()!=='inactive').length};
  }
  if (!name) throw new Error('Select your driver name.');
  const matches = rows_('Vehicles').filter(v => String(v.assigned_driver||'').trim().toLowerCase() === name.toLowerCase() && String(v.status||'Active').toLowerCase() !== 'inactive');
  if (!matches.length) throw new Error('No active vehicles are assigned to this driver. Ask Fleet Admin to check the vehicle assignment.');
  user.selectedDriverName = String(matches[0].assigned_driver).trim();
  CacheService.getScriptCache().put('sess:'+token,JSON.stringify(user),APP.SESSION_TTL);
  audit_(user.selectedDriverName,'SELECT_DRIVER','Driver Portal','',matches.length+' assigned vehicle(s)');
  return {ok:true,driverName:user.selectedDriverName,vehicleCount:matches.length};
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
    sheet_('KM_Records').appendRow([Utilities.getUuid(),v.vehicle_id,reading,now,driverActor_(user),String(payload.notes||''),user.username,now]);
    updateById_('Vehicles','vehicle_id',v.vehicle_id,{current_km:reading,updated_at:now});
    audit_(driverActor_(user),'CREATE','KM_Records',v.vehicle_id,'KM '+reading);
    return {ok:true,currentKm:reading};
  } finally { lock.releaseLock(); }
}
function createTicket(token,payload) {
  const user = requireSession_(token), v = permittedVehicle_(user,payload.vehicleId);
  const category=String(payload.category||'').trim(), title=String(payload.title||'Maintenance request').trim();
  const description=String(payload.description||'').trim(), priority=String(payload.priority||'High').trim();
  if(!category||!description) throw new Error('Select an issue type and describe the problem.');
  if(!['Low','Medium','High','Critical'].includes(priority)) throw new Error('Invalid issue priority.');
  const now = new Date(), id = Utilities.getUuid();
  sheet_('Tickets').appendRow([id,v.vehicle_id,category,title,description,priority,'Open',driverActor_(user),now,'', '', '']);
  audit_(driverActor_(user),'CREATE','Ticket',id,'Vehicle '+v.plate);
  return {ok:true,id};
}
function recordOilChange(token,payload) {
  const user = requireSession_(token), v = permittedVehicle_(user,payload.vehicleId);
  const km = Number(payload.readingKm || v.current_km || 0);
  if (km < Number(v.last_oil_km||0) || km > Number(v.current_km||0)) throw new Error('Check the oil-change KM against the current vehicle reading.');
  const now = new Date(), id = Utilities.getUuid();
  sheet_('Oil_Changes').appendRow([id,v.vehicle_id,km,now,String(payload.oilType||''),String(payload.notes||''),driverActor_(user),now]);
  updateById_('Vehicles','vehicle_id',v.vehicle_id,{last_oil_km:km,updated_at:now});
  audit_(driverActor_(user),'CREATE','Oil_Changes',id,'Oil change at '+km+' km');
  return {ok:true};
}
function updateTicketStatus(token,id,status,notes) {
  const user = requireOwner_(token);
  updateById_('Tickets','ticket_id',id,{status:String(status),notes:String(notes||''),closed_at:String(status)==='Closed'?new Date():''});
  audit_(user.fullName,'UPDATE','Ticket',id,'Status '+status);
  return {ok:true};
}

function createTireRequest(token,payload) {
  const user=requireSession_(token), v=permittedVehicle_(user,payload.vehicleId);
  const description=String(payload.description||'').trim();
  if(!description) throw new Error('Describe the tire condition or service required.');
  const id=Utilities.getUuid(), now=new Date();
  sheet_('Tire_Requests').appendRow([id,v.vehicle_id,String(payload.requestType||'Tire Service'),description,'Open',driverActor_(user),now,'']);
  audit_(driverActor_(user),'CREATE','Tire_Request',id,'Vehicle '+v.plate);
  return {ok:true,id};
}
function submitTireSurvey(token, payload) {
  const user = requireSession_(token);
  if (user.role !== 'Driver' || !user.selectedDriverName) throw new Error('Sign in through the shared Driver Portal and select your driver name first.');
  const v = permittedVehicle_(user, payload.vehicleId);
  const positions = ['Front Left','Front Right','Rear Left','Rear Right','Spare','Sixth'];
  if (!Array.isArray(payload.tires) || payload.tires.length !== 6) throw new Error('Complete all six tire sections.');
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  const createdFiles = [];
  try {
    const existing = rows_('Tire_Surveys').filter(x => String(x.vehicle_id) === String(v.vehicle_id) && ['Locked','Submitted'].includes(String(x.status)));
    if (existing.length) throw new Error('This vehicle already has a submitted 6-tire survey. Contact Fleet Admin if it must be reopened.');
    const byPosition = {};
    payload.tires.forEach(t => { byPosition[String(t.position)] = t; });
    positions.forEach(p => {
      const t = byPosition[p];
      if (!t || !String(t.manufacturerSerial||'').trim() || !String(t.brand||'').trim() || !String(t.model||'').trim() || !String(t.size||'').trim() || !String(t.treadMm||'').trim() || !Number.isFinite(Number(t.treadMm)) || Number(t.treadMm) < 0 || !String(t.pressurePsi||'').trim() || !Number.isFinite(Number(t.pressurePsi)) || Number(t.pressurePsi) < 0 || !String(t.photoData||'').startsWith('data:image/')) throw new Error('Complete all required fields and attach a photo for: ' + p);
    });
    const folder = tireSurveyFolder_();
    const surveyId = Utilities.getUuid(), now = new Date(), tireRows = [];
    positions.forEach(position => {
      const t = byPosition[position];
      const match = String(t.photoData).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (!match) throw new Error('Invalid photo file for ' + position);
      const bytes = Utilities.base64Decode(match[2]);
      if (bytes.length > 1500000) throw new Error('Photo is too large for ' + position + '. Please retake it.');
      const ext = match[1].split('/')[1].replace('jpeg','jpg');
      const file = folder.createFile(Utilities.newBlob(bytes,match[1],v.plate+'_'+position.replace(/\s/g,'_')+'_'+surveyId+'.'+ext));
      createdFiles.push(file);
      tireRows.push([Utilities.getUuid(),surveyId,v.vehicle_id,position,String(t.manufacturerSerial),String(t.brand),String(t.model),String(t.size),Number(t.manufacturingYear||0),Number(t.treadMm),Number(t.pressurePsi),String(t.conditionNotes||''),file.getId(),file.getUrl(),now]);
    });
    sheet_('Tire_Surveys').appendRow([surveyId,v.vehicle_id,user.selectedDriverName,now,String(payload.notes||''),'Locked',now]);
    const tireSheet = sheet_('Tire_Survey_Tires');
    tireSheet.getRange(tireSheet.getLastRow()+1,1,tireRows.length,tireRows[0].length).setValues(tireRows);
    audit_(user.selectedDriverName,'CREATE','Tire_Survey',surveyId,'Six-tire survey submitted and vehicle locked: '+v.plate);
    return {ok:true,surveyId,vehiclePlate:v.plate,status:'Locked'};
  } catch (e) {
    createdFiles.forEach(file => { try { file.setTrashed(true); } catch (ignored) {} });
    throw e;
  } finally { lock.releaseLock(); }
}
function reopenTireSurvey(token, vehicleId, notes) {
  const user = requireOwner_(token);
  const surveys = rows_('Tire_Surveys').filter(x => String(x.vehicle_id) === String(vehicleId) && ['Locked','Submitted'].includes(String(x.status)));
  if (!surveys.length) throw new Error('No locked tire survey was found for this vehicle.');
  const latest = surveys[surveys.length-1];
  updateById_('Tire_Surveys','survey_id',latest.survey_id,{status:'Reopened',notes:String(notes||'Reopened by Fleet Admin')});
  audit_(user.fullName,'REOPEN','Tire_Survey',latest.survey_id,'Vehicle '+vehicleId+'; '+String(notes||''));
  return {ok:true};
}

function tireSurveyFolder_() {
  const props = PropertiesService.getScriptProperties();
  const saved = props.getProperty('FLEET_TIRE_SURVEY_FOLDER_ID');
  if (saved) {
    try { return DriveApp.getFolderById(saved); } catch (e) { props.deleteProperty('FLEET_TIRE_SURVEY_FOLDER_ID'); }
  }
  const folder = DriveApp.createFolder('Fleet ERP Tire Survey Photos');
  props.setProperty('FLEET_TIRE_SURVEY_FOLDER_ID',folder.getId());
  return folder;
}

function updateTireRequest(token,id,status,notes) {
  const user=requireOwner_(token);
  if(!['Open','In Progress','Completed','Rejected'].includes(String(status))) throw new Error('Invalid tire request status.');
  updateById_('Tire_Requests','request_id',id,{status:String(status),notes:String(notes||'')});
  audit_(user.fullName,'UPDATE','Tire_Request',id,'Status '+status);
  return {ok:true};
}
function saveInspection(token,payload) {
  const user=requireOwner_(token), v=permittedVehicle_(user,payload.vehicleId);
  const type=String(payload.inspectionType||'').trim();
  if(!['Annual','6-Month'].includes(type)) throw new Error('Select Annual or 6-Month inspection.');
  const due=String(payload.dueDate||'').trim();
  const status=String(payload.status||'Pending');
  if(!due) throw new Error('Inspection due date is required.');
  const id=Utilities.getUuid(), now=new Date();
  sheet_('Inspections').appendRow([id,v.vehicle_id,type,due,status==='Completed'?now:'',status,Number(payload.cost||0),String(payload.notes||''),now]);
  audit_(user.fullName,'CREATE','Inspection',id,type+' inspection for '+v.plate);
  return {ok:true,id};
}
function updateInspection(token,id,status,notes,cost) {
  const user=requireOwner_(token);
  if(!['Pending','Completed','Overdue'].includes(String(status))) throw new Error('Invalid inspection status.');
  updateById_('Inspections','record_id',id,{status:String(status),completed_date:status==='Completed'?new Date():'',notes:String(notes||''),cost:Number(cost||0)});
  audit_(user.fullName,'UPDATE','Inspection',id,'Status '+status);
  return {ok:true};
}
function addVehicle(token,payload) {
  const user=requireOwner_(token);
  const plate=String(payload.plate||'').trim().toUpperCase();
  const pin=String(payload.vehiclePin||'');
  if(!plate) throw new Error('Vehicle plate is required.');
  if(pin && pin.length<4) throw new Error('Vehicle access code must be at least 4 characters when provided.');
  if(rows_('Vehicles').some(v=>String(v.plate).trim().toUpperCase()===plate)) throw new Error('This vehicle plate already exists.');
  const pinSalt=Utilities.getUuid();
  const pinHash=pin ? (pinSalt+':'+hash_(pinSalt+pin)) : '';
  const id=Utilities.getUuid(), now=new Date();
  sheet_('Vehicles').appendRow([id,plate,String(payload.make||''),String(payload.model||''),String(payload.year||''),String(payload.site||''),String(payload.driver||''),String(payload.phone||''),Number(payload.currentKm||0),Number(payload.lastOilKm||0),Number(payload.oilIntervalKm||5000),pinHash,'Active',now,now]);
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
function requireOwner_(token) { const u=requireSession_(token); if(u.role!=='Owner') throw new Error('You do not have permission for this action.'); return u; }
function permittedVehicle_(user,id) {
  const v=rows_('Vehicles').find(x=>String(x.vehicle_id)===String(id));
  if(!v) throw new Error('Vehicle not found.');
  if(user.role==='Driver') {
    if(user.vehicleId && String(user.vehicleId)!==String(v.vehicle_id)) throw new Error('Access denied for this vehicle.');
    if(!user.vehicleId && (!user.selectedDriverName || String(v.assigned_driver||'').trim().toLowerCase()!==String(user.selectedDriverName).trim().toLowerCase())) throw new Error('This vehicle is not assigned to the selected driver.');
  }
  return v;
}
function driverActor_(user) { return user.role==='Driver' && user.selectedDriverName ? user.selectedDriverName : user.fullName; }
function enrichVehicle_(v) {
  const current=Number(v.current_km||0), last=Number(v.last_oil_km||0), interval=Number(v.oil_interval_km||5000);
  const since=Math.max(0,current-last), remaining=interval-since;
  const oilStatus=remaining<=0?'Urgent Overdue':remaining<=500?'Warning':'Safe';
  return Object.assign({},v,{vehicleStatus:v.status||'Active',sinceOil:since,remaining,oilStatus});
}
function sheet_(name) { const s=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name); if(!s) throw new Error('Missing sheet '+name+'. Run setupFleetERP first.'); return s; }
function rows_(name) {
  const sh=sheet_(name), values=sh.getDataRange().getValues();
  if(values.length<2) return [];
  const headers=values.shift();
  return values.filter(r=>r.some(c=>c!=='' && c!==null)).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i] instanceof Date?r[i].toISOString():r[i]])));
}
function recentRows_(name, limit) {
  const sh = sheet_(name);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const width = sh.getLastColumn();
  const count = Math.min(Number(limit) || 200, last - 1);
  const start = Math.max(2, last - count + 1);
  const values = sh.getRange(start, 1, last - start + 1, width).getValues();
  const headers = sh.getRange(1, 1, 1, width).getValues()[0];
  return values.filter(r => r.some(v => v !== '' && v !== null)).map(r =>
    Object.fromEntries(headers.map((h, i) => [h, r[i] instanceof Date ? r[i].toISOString() : r[i]]))
  );
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
