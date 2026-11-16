const APP = { NAME: 'Fleet ERP', VERSION: '0.1.0', SESSION_TTL: 21600 };
const TABLES = {
  Handovers: ['handover_id','vehicle_id','vehicle_plate','old_driver','new_driver','old_driver_phone','new_driver_phone','handover_date','handover_km','status','checklist_json','condition_notes','snapshot_json','created_by','created_at','old_driver_signed_at','new_driver_signed_at'],
  Vehicles: ['vehicle_id','plate','make','model','year','site','assigned_driver','driver_phone','current_km','last_oil_km','oil_interval_km','vehicle_pin_hash','status','created_at','updated_at'],
  KM_Records: ['record_id','vehicle_id','reading_km','reading_date','driver_name','notes','created_by','created_at'],
  Oil_Changes: ['record_id','vehicle_id','reading_km','change_date','oil_type','notes','created_by','created_at'],
  Tickets: ['ticket_id','vehicle_id','category','title','description','priority','status','reported_by','reported_at','assigned_to','closed_at','notes'],
  Maintenance: ['record_id','vehicle_id','maintenance_type','scheduled_date','completed_date','status','technician','cost','notes','created_at','updated_at'],
  Tire_Requests: ['request_id','vehicle_id','request_type','description','status','requested_by','requested_at','notes'],
  Tire_Inventory: ['tire_id','manufacturer_serial','brand','model','size','warehouse','received_date','purchase_cost','status','notes','created_by','created_at','installation_id'],
  Tire_Installations: ['installation_id','vehicle_id','position','tire_id','manufacturer_serial','request_id','install_date','install_km','removal_date','removal_km','distance_km','status','installed_by','removed_by','notes','created_at','updated_at'],
  Tire_Stock_Movements: ['movement_id','tire_id','movement_type','request_id','installation_id','vehicle_id','quantity','movement_date','odometer_km','performed_by','notes'],
  Tire_Surveys: ['survey_id','vehicle_id','driver_name','survey_date','notes','status','created_at'],
  Tire_Survey_Tires: ['tire_record_id','survey_id','vehicle_id','position','manufacturer_serial','brand','model','size','manufacturing_year','tread_mm','pressure_psi','condition_notes','photo_file_id','photo_url','created_at'],
  Inspections: ['record_id','vehicle_id','inspection_type','due_date','completed_date','status','cost','notes','created_at'],
  Users: ['user_id','username','password_hash','full_name','role','is_active','created_at'],
  Audit_Log: ['log_id','actor','action','entity','entity_id','details','created_at'],
  Settings: ['key','value','updated_at']
};

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  if (String(params.action || '') === 'maintenance-confirm') return renderMaintenancePrompt_(params);
  if (String(params.action || '') === 'inspection-confirm') return renderInspectionPrompt_(params);
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
  const normalizedUsername = username.toLowerCase();
  const password = String(payload.password || '');
  if (!username || !password) throw new Error('Enter your Owner or Driver username and password.');

  // Match usernames and roles case-insensitively. Existing Users rows may contain
  // lowercase "owner"/"driver" even though the portal roles are Owner/Driver.
  const rows = rows_('Users');
  const u = rows.find(r =>
    String(r.username || '').trim().toLowerCase() === normalizedUsername &&
    String(r.is_active).trim().toLowerCase() !== 'false'
  );
  const roleKey = u ? String(u.role || '').trim().toLowerCase() : '';
  if (!u || !['owner','driver'].includes(roleKey) ||
      (roleKey === 'driver' && normalizedUsername !== 'driver') ||
      !verify_(u.password_hash, password)) {
    throw new Error('Invalid username or password.');
  }

  const role = roleKey === 'owner' ? 'Owner' : 'Driver';
  const identity = {
    id: u.user_id,
    username: String(u.username || '').trim(),
    fullName: u.full_name || (role === 'Owner' ? 'Fleet Owner' : 'Shared Driver Portal'),
    role,
    vehicleId: null,
    vehiclePlate: null
  };
  const token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put('sess:' + token, JSON.stringify(identity), APP.SESSION_TTL);
  audit_(identity.fullName, 'LOGIN', 'Session', token.slice(0, 8), 'Signed in');
  return {token, user: identity};
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
  const activeVehicles = allVehicles.filter(v => String(v.status || 'Active').trim().toLowerCase() !== 'inactive');
  // The shared Driver Portal must show every active vehicle, including rows where
  // assigned_driver is blank. Vehicle ID remains the authorization boundary.
  const vehicleChoices = user.role === 'Driver' && !user.vehicleId
    ? activeVehicles.map(v => ({vehicle_id:String(v.vehicle_id),plate:String(v.plate||''),assigned_driver:String(v.assigned_driver||''),make:String(v.make||''),model:String(v.model||'')}))
    : [];
  const driverNames = user.role === 'Driver' && !user.vehicleId
    ? [...new Set(vehicleChoices.map(v => v.assigned_driver.trim()).filter(Boolean))].sort()
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
    // For drivers, filter KM history by their authorized vehicle(s) BEFORE
    // applying the limit, so activity from other vehicles cannot hide their
    // latest odometer readings.
    if (user.role === 'Driver' && name === 'KM_Records') {
      return recentRowsForVehicles_('KM_Records', recordLimit, allowedIds);
    }
    return recentRows_(name, recordLimit).filter(row => allowedIds === null || allowedIds.includes(String(row.vehicle_id)));
  };
  return {
    user, vehicles:visibleVehicles, vehicleChoices,
    tickets:readRecords('Tickets'), km:readRecords('KM_Records'),
    maintenance:readRecords('Maintenance'), tireRequests:readRecords('Tire_Requests'),
    inspections:readRecords('Inspections'), oilChanges:readRecords('Oil_Changes'),
    tireSurveys:readRecords('Tire_Surveys'), tireSurveyTires:readRecords('Tire_Survey_Tires'),
    tireInventory:user.role==='Owner'?recentRows_('Tire_Inventory',1000):[],
    tireInstallations:readRecords('Tire_Installations'),
    tireStockMovements:user.role==='Owner'?recentRows_('Tire_Stock_Movements',1000):[],
    handovers:user.role==='Owner'?(SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Handovers')?recentRows_('Handovers',500):[]):[],
    driverNames, selectedDriverName:user.selectedDriverName||'', requiresDriverSelection:user.role==='Driver'&&!user.selectedDriverName, serverTime:new Date().toISOString()
  };
}
function selectPortalVehicle(token, vehicleId) {
  const user = requireSession_(token);
  if (user.role !== 'Driver') throw new Error('This action is only available to the shared Driver Portal.');
  const id = String(vehicleId || '').trim();
  if (!id) throw new Error('Select your vehicle number.');
  const vehicle = rows_('Vehicles').find(v =>
    String(v.vehicle_id) === id &&
    String(v.status || 'Active').trim().toLowerCase() !== 'inactive'
  );
  if (!vehicle) throw new Error('Vehicle not found or inactive. Contact Fleet Admin.');
  const assignedDriver = String(vehicle.assigned_driver || '').trim();
  // Some Vehicle Master rows may not yet have an assigned_driver value.
  // Keep the selected vehicle usable while preserving vehicleId-based access control.
  const driverName = assignedDriver || String(user.fullName || 'Shared Driver Portal').trim();
  user.vehicleId = id;
  user.selectedDriverName = driverName;
  user.vehiclePlate = String(vehicle.plate || '');
  CacheService.getScriptCache().put('sess:' + token, JSON.stringify(user), APP.SESSION_TTL);
  audit_(assignedDriver, 'SELECT_VEHICLE', 'Driver Portal', id, 'Selected vehicle ' + user.vehiclePlate);
  return {ok:true, vehicleId:id, vehiclePlate:user.vehiclePlate, driverName};
}

// Complete vehicle selection and return the driver's initial data in one browser/server round trip.
function selectPortalVehicleAndGetAppData(token, vehicleId) {
  selectPortalVehicle(token, vehicleId);
  return getAppData(token);
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
  const category=String(payload.category||'').trim(), title=String(payload.title||'').trim();
  const description=String(payload.description||'').trim(), priority=String(payload.priority||'Medium').trim();
  if(!['Maintenance','Mechanical','Electrical','Tires','Accident'].includes(category)||!title||!description) throw new Error('Complete the issue category, title and description.');
  if(title.length>120||description.length>3000) throw new Error('Title or description is too long.');
  if(!['Low','Medium','High','Critical'].includes(priority)) throw new Error('Invalid issue priority.');
  ensureTicketConfirmationColumns_();
  const now = new Date(), id = Utilities.getUuid();
  sheet_('Tickets').appendRow([id,v.vehicle_id,category,title,description,priority,'Open',driverActor_(user),now,'', '', '']);
  audit_(driverActor_(user),'CREATE','Ticket',id,'Vehicle '+v.plate+'; '+category+'; '+priority);
  return {ok:true,id};
}
function prepareTicketConfirmation(token,id) {
  const user=requireOwner_(token), ticket=rows_('Tickets').find(x=>String(x.ticket_id)===String(id));
  if(!ticket) throw new Error('Ticket not found.');
  if(String(ticket.status)==='Closed') throw new Error('This ticket is already closed.');
  const vehicle=rows_('Vehicles').find(v=>String(v.vehicle_id)===String(ticket.vehicle_id));
  if(!vehicle) throw new Error('Vehicle not found.');
  const phone=String(vehicle.driver_phone||'').replace(/\D/g,'');
  if(!phone) throw new Error('No driver phone number is saved for this vehicle.');
  ensureTicketConfirmationColumns_();
  const rawToken=Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,'');
  const expires=new Date(Date.now()+14*24*60*60*1000);
  updateById_('Tickets','ticket_id',id,{status:'Pending Driver Confirmation',confirmation_token_hash:hash_(rawToken),confirmation_expires_at:expires,confirmation_answer:'',confirmation_at:'',closure_method:''});
  audit_(user.fullName,'SEND_CONFIRMATION','Ticket',id,'WhatsApp confirmation link prepared; token expires in 14 days.');
  const base=ScriptApp.getService().getUrl();
  if(!base) throw new Error('Deploy the Apps Script as a Web App before generating driver confirmation links.');
  return {ok:true,phone:phone,driverName:String(vehicle.assigned_driver||ticket.reported_by||'Driver'),vehiclePlate:String(vehicle.plate||vehicle.vehicle_id),title:String(ticket.title||ticket.category),
    yesUrl:base+'?action=maintenance-confirm&token='+encodeURIComponent(rawToken)+'&answer=yes',
    noUrl:base+'?action=maintenance-confirm&token='+encodeURIComponent(rawToken)+'&answer=no'};
}
function ensureTicketConfirmationColumns_() {
  const sh=sheet_('Tickets'), width=sh.getLastColumn();
  const headers=width?sh.getRange(1,1,1,width).getValues()[0].map(String):[];
  ['confirmation_token_hash','confirmation_expires_at','confirmation_answer','confirmation_at','closure_method'].forEach(name=>{
    if(headers.indexOf(name)<0){sh.getRange(1,sh.getLastColumn()+1).setValue(name);headers.push(name);}
  });
}
function renderMaintenancePrompt_(params) {
  const token=String(params.token||''), answer=String(params.answer||'').toLowerCase();
  if(!/^[a-f0-9]{64}$/i.test(token)||!['yes','no'].includes(answer))
    return HtmlService.createHtmlOutput(confirmationPage_('Invalid link','This confirmation link is invalid. Please contact Fleet Management.'));
  const label=answer==='yes'?'YES — confirm the issue is fixed':'NO — the issue is not fixed';
  const html='<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font-family:Arial,sans-serif;background:#f1f5f9;margin:0;padding:24px;color:#0f172a}.card{max-width:520px;margin:8vh auto;background:white;padding:30px;border-radius:14px;box-shadow:0 8px 30px #0001;text-align:center}button{border:0;border-radius:9px;background:#2563eb;color:white;padding:15px 22px;font-size:17px;font-weight:bold;cursor:pointer}p{line-height:1.7}</style></head><body><div class="card"><h2>Vehicle Maintenance Confirmation</h2><p>Please confirm your response below. This will update the Fleet ticket.</p><button id="confirm" onclick="confirmAnswer()">'+label+'</button><p id="result"></p></div><script>function confirmAnswer(){var b=document.getElementById("confirm"),r=document.getElementById("result");b.disabled=true;r.textContent="Submitting…";google.script.run.withSuccessHandler(function(html){document.open();document.write(html);document.close();}).withFailureHandler(function(e){b.disabled=false;r.textContent=e&&e.message?e.message:"Unable to record your response.";}).confirmMaintenanceFromLink("TOKEN_PLACEHOLDER","ANSWER_PLACEHOLDER");}</script></body></html>';
  return HtmlService.createHtmlOutput(html.replace('TOKEN_PLACEHOLDER',token).replace('ANSWER_PLACEHOLDER',answer));
}
function confirmMaintenanceFromLink(token,answer) {
  return renderMaintenanceConfirmation_({token:String(token||''),answer:String(answer||'')}).getContent();
}
function renderMaintenanceConfirmation_(params) {
  const raw=String(params.token||''), answer=String(params.answer||'').toLowerCase();
  if(!raw||!['yes','no'].includes(answer)) return HtmlService.createHtmlOutput(confirmationPage_('Invalid link','This confirmation link is invalid. Please contact Fleet Management.'));
  const lock=LockService.getScriptLock(); lock.waitLock(10000);
  try {
    ensureTicketConfirmationColumns_();
    const sh=sheet_('Tickets'), values=sh.getDataRange().getValues(), headers=values[0].map(String), ix={};
    headers.forEach((h,i)=>ix[h]=i);
    const digest=hash_(raw); let row=-1;
    for(let i=1;i<values.length;i++) if(String(values[i][ix.confirmation_token_hash]||'')===digest){row=i+1;break;}
    if(row<0) return HtmlService.createHtmlOutput(confirmationPage_('Link not found','This link is invalid, already used, or has been replaced. Please contact Fleet Management.'));
    const record=values[row-1], expiry=new Date(record[ix.confirmation_expires_at]);
    if(isNaN(expiry.getTime())||expiry.getTime()<Date.now()) return HtmlService.createHtmlOutput(confirmationPage_('Link expired','This confirmation link has expired. Please contact Fleet Management for a new link.'));
    if(String(record[ix.status])==='Closed') return HtmlService.createHtmlOutput(confirmationPage_('Already closed','This ticket has already been closed. Thank you.'));
    const now=new Date();
    sh.getRange(row,ix.confirmation_answer+1).setValue(answer.toUpperCase());
    sh.getRange(row,ix.confirmation_at+1).setValue(now);
    sh.getRange(row,ix.confirmation_token_hash+1).setValue('');
    if(answer==='yes'){
      sh.getRange(row,ix.status+1).setValue('Closed');
      sh.getRange(row,ix.closed_at+1).setValue(now);
      sh.getRange(row,ix.closure_method+1).setValue('WhatsApp Confirmation');
    } else {
      if(String(record[ix.status])==='Pending Driver Confirmation') sh.getRange(row,ix.status+1).setValue('In Progress');
      sh.getRange(row,ix.closure_method+1).setValue('');
    }
    audit_('Driver','WHATSAPP_CONFIRMATION','Ticket',String(record[ix.ticket_id]||''),'Driver answered '+answer.toUpperCase());
    return HtmlService.createHtmlOutput(confirmationPage_(answer==='yes'?'Thank you — ticket closed':'Thank you — ticket remains open',answer==='yes'?'Your confirmation was recorded. The maintenance ticket is now closed.':'Your response was recorded. The ticket remains open and Fleet Management will follow up.'));
  } finally { lock.releaseLock(); }
}
function confirmationPage_(title,message) {
  const safe=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  return '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font-family:Arial,sans-serif;background:#f1f5f9;margin:0;padding:24px;color:#0f172a}.card{max-width:520px;margin:8vh auto;background:white;padding:30px;border-radius:14px;box-shadow:0 8px 30px #0001;text-align:center}h2{color:#1e3a8a}p{line-height:1.7}</style></head><body><div class="card"><h2>'+safe(title)+'</h2><p>'+safe(message)+'</p><p>Fleet Management</p></div></body></html>';
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
  const next=String(status||'');
  if(!['Open','In Progress','Approved','Rejected'].includes(next)) throw new Error('Choose Open, In Progress, Approved, or Rejected. Completed is recorded only after a tire is installed.');
  const request=rows_('Tire_Requests').find(r=>String(r.request_id)===String(id));
  if(!request) throw new Error('Tire request not found.');
  if(String(request.status)==='Completed') throw new Error('This request is already completed and cannot be changed.');
  updateById_('Tire_Requests','request_id',id,{status:next,notes:String(notes||'')});
  audit_(user.fullName,'UPDATE','Tire_Request',id,'Status '+next);
  return {ok:true};
}

function addTireStock(token,payload) {
  const user=requireOwner_(token);
  payload=payload||{};
  const serialMode=String(payload.serialMode||'manufacturer');
  const serials=Array.isArray(payload.manufacturerSerials)?payload.manufacturerSerials.map(x=>String(x||'').trim()).filter(Boolean):[];
  const quantity=Number(payload.quantity);
  const brand=String(payload.brand||'').trim();
  const model=String(payload.model||'').trim();
  const size=String(payload.size||'').trim();
  const warehouse=String(payload.warehouse||'Main Warehouse').trim();
  if(!Number.isInteger(quantity)||quantity<1||quantity>100) throw new Error('Quantity must be between 1 and 100.');
  if(!['manufacturer','internal'].includes(serialMode)) throw new Error('Invalid serial number mode.');
  if(serialMode==='manufacturer'&&serials.length!==quantity) throw new Error('Enter exactly '+quantity+' unique manufacturer serial numbers.');
  if(serialMode==='internal'&&serials.length) throw new Error('Do not enter manufacturer serials when using internal tracking numbers.');
  if(serialMode==='manufacturer'&&new Set(serials.map(x=>x.toLowerCase())).size!==serials.length) throw new Error('Duplicate serial numbers are not allowed.');
  if(!brand||!model||!size||!warehouse) throw new Error('Enter the tire brand, model, size, and warehouse.');
  const lock=LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const existing=new Set(rows_('Tire_Inventory').map(t=>String(t.manufacturer_serial||'').trim().toLowerCase()));
    const duplicate=serials.find(s=>existing.has(s.toLowerCase()));
    if(duplicate) throw new Error('Manufacturer serial number already exists in inventory: '+duplicate);
    const trackingNumbers=serialMode==='internal'
      ? Array.from({length:quantity},(_,i)=>'LEGACY-'+Utilities.getUuid().replace(/-/g,'').slice(0,12).toUpperCase())
      : serials;
    const now=new Date();
    const receivedDate=payload.receivedDate?new Date(payload.receivedDate):now;
    if(isNaN(receivedDate.getTime())) throw new Error('Invalid received date.');
    const totalCost=payload.purchaseCost===''||payload.purchaseCost==null?0:Number(payload.purchaseCost);
    if(!Number.isFinite(totalCost)||totalCost<0) throw new Error('Enter a valid purchase cost.');
    const costPerTire=quantity?totalCost/quantity:0;
    const inventorySheet=sheet_('Tire_Inventory'), movementSheet=sheet_('Tire_Stock_Movements');
    const tireIds=[];
    trackingNumbers.forEach(serial=>{
      const id=Utilities.getUuid(); tireIds.push(id);
      const recordNotes=(serialMode==='internal'?'Legacy stock; manufacturer serial not recorded. ':'')+String(payload.notes||'');
      inventorySheet.appendRow([id,serial,brand,model,size,warehouse,receivedDate,costPerTire,'In Stock',recordNotes,user.fullName,now,'']);
      movementSheet.appendRow([Utilities.getUuid(),id,'Received','', '', '',1,now,'',user.fullName,'Received into '+warehouse+(serialMode==='internal'?' with system tracking number':'')+(payload.notes?' | '+String(payload.notes):'')]);
      audit_(user.fullName,'RECEIVE','Tire_Inventory',id,serial+' received into '+warehouse+(serialMode==='internal'?' (internal tracking number)':''));
    });
    return {ok:true,quantity:tireIds.length,tireIds};
  } finally { lock.releaseLock(); }
}

function tireSiteKey_(value) {
  const site=String(value||'').trim();
  if(!site) return '';
  if(/^main warehouse$/i.test(site)||/^riyadh(?:\s*[-–—].*)?$/i.test(site)) return 'riyadh';
  return site.toLowerCase().replace(/\s+/g,' ');
}

function transferTireStock(token,payload) {
  const user=requireOwner_(token);
  payload=payload||{};
  const source=String(payload.sourceSite||'').trim();
  const destination=String(payload.destinationSite||'').trim();
  const serials=Array.isArray(payload.serials)?payload.serials.map(x=>String(x||'').trim()).filter(Boolean):[];
  if(!source||!destination) throw new Error('Select the source site and enter the destination site.');
  if(tireSiteKey_(source)===tireSiteKey_(destination)) throw new Error('Source and destination sites must be different.');
  if(!serials.length) throw new Error('Enter at least one tire serial number to transfer.');
  if(new Set(serials.map(x=>x.toLowerCase())).size!==serials.length) throw new Error('Duplicate serial numbers are not allowed.');
  const lock=LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const all=rows_('Tire_Inventory');
    const selected=serials.map(serial=>{
      const tire=all.find(t=>String(t.manufacturer_serial||'').trim().toLowerCase()===serial.toLowerCase());
      if(!tire) throw new Error('Tire serial not found: '+serial);
      if(String(tire.status)!=='In Stock') throw new Error('Tire '+serial+' is not available in stock.');
      if(tireSiteKey_(tire.warehouse)!==tireSiteKey_(source)) throw new Error('Tire '+serial+' is not in '+source+'. Current site: '+String(tire.warehouse||'Not assigned'));
      return tire;
    });
    const now=new Date(), movementSheet=sheet_('Tire_Stock_Movements');
    selected.forEach(tire=>{
      updateById_('Tire_Inventory','tire_id',tire.tire_id,{warehouse:destination});
      movementSheet.appendRow([Utilities.getUuid(),tire.tire_id,'Transfer','', '', '',1,now,'',user.fullName,'Transferred from '+source+' to '+destination+(payload.notes?' | '+String(payload.notes):'')]);
      audit_(user.fullName,'TRANSFER','Tire_Inventory',tire.tire_id,tire.manufacturer_serial+' from '+source+' to '+destination);
    });
    return {ok:true,quantity:selected.length,source,destination};
  } finally { lock.releaseLock(); }
}
function installTireForRequest(token,payload) {
  const user=requireOwner_(token);
  payload=payload||{};
  const requestId=String(payload.requestId||'').trim();
  const tireId=String(payload.tireId||'').trim();
  const position=String(payload.position||'').trim();
  const allowedPositions=['Front Left','Front Right','Rear Left','Rear Right','Spare','Sixth'];
  if(!requestId||!tireId||!allowedPositions.includes(position)) throw new Error('Select the approved request, an in-stock tire, and a valid installation position.');
  const lock=LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const request=rows_('Tire_Requests').find(r=>String(r.request_id)===requestId);
    if(!request) throw new Error('Tire request not found.');
    if(String(request.status)!=='Approved') throw new Error('Only an approved tire request can be installed.');
    const vehicle=rows_('Vehicles').find(v=>String(v.vehicle_id)===String(request.vehicle_id));
    if(!vehicle) throw new Error('The vehicle linked to this request was not found.');
    const installKm=Number(vehicle.current_km);
    if(!Number.isFinite(installKm)||installKm<=0) throw new Error('No valid current odometer reading is recorded. Submit Daily KM before installing the tire.');
    const tire=rows_('Tire_Inventory').find(t=>String(t.tire_id)===tireId);
    if(!tire) throw new Error('Tire not found in inventory.');
    if(String(tire.status)!=='In Stock') throw new Error('This tire is no longer available in stock.');
    const vehicleSite=String(vehicle.site||'').trim();
    if(!vehicleSite) throw new Error('This vehicle has no site assigned in Vehicle Master. Assign its site before installing a tire.');
    if(tireSiteKey_(tire.warehouse)!==tireSiteKey_(vehicleSite)) throw new Error('This tire is currently at '+String(tire.warehouse||'an unknown site')+', while the vehicle belongs to '+vehicleSite+'. Transfer the tire to the vehicle site first.');
    const duplicate=rows_('Tire_Installations').some(x=>String(x.tire_id)===tireId&&String(x.status)==='Installed');
    if(duplicate) throw new Error('This tire already has an active installation record.');
    const now=new Date(), installationId=Utilities.getUuid();
    const active=rows_('Tire_Installations').find(x=>String(x.vehicle_id)===String(vehicle.vehicle_id)&&String(x.position)===position&&String(x.status)==='Installed');
    if(active) {
      const oldInstallKm=Number(active.install_km||0);
      if(installKm<oldInstallKm) throw new Error('Current vehicle KM is lower than the previous installation KM. Check Daily KM records.');
      const distance=installKm-oldInstallKm;
      updateById_('Tire_Installations','installation_id',active.installation_id,{removal_date:now,removal_km:installKm,distance_km:distance,status:'Removed',removed_by:user.fullName,updated_at:now});
      updateById_('Tire_Inventory','tire_id',active.tire_id,{status:'Removed',installation_id:''});
    }
    sheet_('Tire_Installations').appendRow([installationId,vehicle.vehicle_id,position,tireId,tire.manufacturer_serial,requestId,now,installKm,'','', '', 'Installed',user.fullName,'',String(payload.notes||''),now,now]);
    updateById_('Tire_Inventory','tire_id',tireId,{status:'Installed',installation_id:installationId,warehouse:vehicleSite});
    sheet_('Tire_Stock_Movements').appendRow([Utilities.getUuid(),tireId,'Issued',requestId,installationId,vehicle.vehicle_id,1,now,installKm,user.fullName,'Installed at '+position]);
    updateById_('Tire_Requests','request_id',requestId,{status:'Completed',notes:String(request.notes||'')+(request.notes?' | ':'')+'Installed '+tire.manufacturer_serial+' at '+position+' / '+installKm+' km'});
    audit_(user.fullName,'INSTALL','Tire',tireId,'Vehicle '+vehicle.plate+'; '+position+'; '+installKm+' km; request '+requestId);
    return {ok:true,installationId,installKm,vehiclePlate:vehicle.plate,serial:tire.manufacturer_serial};
  } finally { lock.releaseLock(); }
}
function ensureInspectionColumns_() {
  const sh=sheet_('Inspections'), headers=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String);
  ['close_date','confirmation_token_hash','confirmation_expires_at','confirmation_at','confirmed_by','reminder_sent_at','next_due_date'].forEach(name=>{
    if(headers.indexOf(name)<0) sh.getRange(1,sh.getLastColumn()+1).setValue(name);
  });
}
function ensureVehicleCloseDateColumn_() {
  const sh=sheet_('Vehicles'), headers=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String);
  if(headers.indexOf('close_date')<0) sh.getRange(1,sh.getLastColumn()+1).setValue('close_date');
}
function saveInspection(token,payload) {
  const user=requireOwner_(token), v=permittedVehicle_(user,payload.vehicleId);
  ensureInspectionColumns_();
  const type=String(payload.inspectionType||'').trim();
  if(!['Annual','6-Month'].includes(type)) throw new Error('Select Annual or 6-Month inspection.');
  const due=String(payload.dueDate||'').trim();
  if(!due) throw new Error('Inspection due date is required.');
  const closeDate=String(payload.closeDate||'').trim();
  if(type==='6-Month' && closeDate) {
    ensureVehicleCloseDateColumn_();
    updateById_('Vehicles','vehicle_id',v.vehicle_id,{close_date:closeDate,updated_at:new Date()});
  }
  const id=Utilities.getUuid(), now=new Date();
  const sh=sheet_('Inspections');
  sh.appendRow([id,v.vehicle_id,type,due,'','Pending',Number(payload.cost||0),String(payload.notes||''),now,closeDate,'','','','','','']);
  audit_(user.fullName,'CREATE','Inspection',id,type+' inspection for '+v.plate);
  return {ok:true,id};
}
function updateInspection(token,id,status,notes,cost) {
  const user=requireOwner_(token);
  if(String(status)==='Completed') throw new Error('Inspections can only be completed after the driver confirms YES through WhatsApp.');
  if(!['Pending','Overdue','Pending Driver Confirmation'].includes(String(status))) throw new Error('Invalid inspection status.');
  updateById_('Inspections','record_id',id,{status:String(status),notes:String(notes||''),cost:Number(cost||0)});
  audit_(user.fullName,'UPDATE','Inspection',id,'Status '+status);
  return {ok:true};
}
function prepareInspectionConfirmation(token,id) {
  const user=requireOwner_(token), record=rows_('Inspections').find(x=>String(x.record_id)===String(id));
  if(!record) throw new Error('Inspection record not found.');
  if(String(record.status)==='Completed') throw new Error('This inspection is already confirmed as completed.');
  const vehicle=rows_('Vehicles').find(v=>String(v.vehicle_id)===String(record.vehicle_id));
  if(!vehicle) throw new Error('Vehicle not found.');
  const phone=String(vehicle.driver_phone||'').replace(/\\D/g,'');
  if(!phone) throw new Error('No driver phone number is saved for this vehicle.');
  ensureInspectionColumns_();
  const raw=Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,'');
  const expires=new Date(Date.now()+14*24*60*60*1000);
  updateById_('Inspections','record_id',id,{status:'Pending Driver Confirmation',confirmation_token_hash:hash_(raw),confirmation_expires_at:expires});
  audit_(user.fullName,'SEND_CONFIRMATION','Inspection',id,'WhatsApp YES/NO confirmation link prepared.');
  const base=ScriptApp.getService().getUrl();
  if(!base) throw new Error('Deploy the Apps Script as a Web App before generating confirmation links.');
  return {phone,driverName:String(vehicle.assigned_driver||'Driver'),vehiclePlate:String(vehicle.plate||vehicle.vehicle_id),type:String(record.inspection_type),dueDate:String(record.due_date||''),yesUrl:base+'?action=inspection-confirm&token='+encodeURIComponent(raw)+'&answer=yes',noUrl:base+'?action=inspection-confirm&token='+encodeURIComponent(raw)+'&answer=no'};
}
function renderInspectionPrompt_(params) {
  const token=String(params.token||''), answer=String(params.answer||'').toLowerCase();
  if(!/^[a-f0-9]{64}$/i.test(token)||!['yes','no'].includes(answer)) return HtmlService.createHtmlOutput(confirmationPage_('Invalid link','This inspection confirmation link is invalid. Please contact Fleet Management.'));
  const label=answer==='yes'?'YES — confirm the inspection is completed':'NO — the inspection is not completed';
  const html='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:Arial;background:#f1f5f9;padding:24px;color:#0f172a}.card{max-width:520px;margin:8vh auto;background:white;padding:30px;border-radius:14px;text-align:center;box-shadow:0 8px 30px #0001}button{border:0;border-radius:9px;background:#2563eb;color:white;padding:15px 22px;font-size:17px;font-weight:bold;cursor:pointer}</style></head><body><div class="card"><h2>Vehicle Inspection Confirmation</h2><p>Please confirm the inspection status for your vehicle.</p><button onclick="send()" id="confirm">'+label+'</button><p id="result"></p></div><script>function send(){var b=document.getElementById("confirm"),r=document.getElementById("result");b.disabled=true;r.textContent="Submitting…";google.script.run.withSuccessHandler(function(html){document.open();document.write(html);document.close();}).withFailureHandler(function(e){b.disabled=false;r.textContent=e&&e.message?e.message:"Unable to record confirmation.";}).confirmInspectionFromLink("TOKEN","ANSWER");}</script></body></html>';
  return HtmlService.createHtmlOutput(html.replace('TOKEN',token).replace('ANSWER',answer));
}
function confirmInspectionFromLink(token,answer) {
  const raw=String(token||''), choice=String(answer||'').toLowerCase();
  if(!raw||!['yes','no'].includes(choice)) return confirmationPage_('Invalid response','This confirmation response is invalid.');
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    ensureInspectionColumns_();
    const sh=sheet_('Inspections'), values=sh.getDataRange().getValues(), headers=values[0].map(String), ix={};headers.forEach((h,i)=>ix[h]=i);
    const digest=hash_(raw);let row=-1;
    for(let i=1;i<values.length;i++) if(String(values[i][ix.confirmation_token_hash]||'')===digest){row=i+1;break;}
    if(row<0) return confirmationPage_('Link not found','This link is invalid, already used, or replaced. Contact Fleet Management.');
    const record=values[row-1], expiry=new Date(record[ix.confirmation_expires_at]);
    if(isNaN(expiry.getTime())||expiry.getTime()<Date.now()) return confirmationPage_('Link expired','This confirmation link has expired. Contact Fleet Management for a new link.');
    if(String(record[ix.status])==='Completed') return confirmationPage_('Already confirmed','This inspection has already been confirmed. Thank you.');
    const now=new Date(), id=String(record[ix.record_id]), vehicleId=String(record[ix.vehicle_id]), type=String(record[ix.inspection_type]);
    sh.getRange(row,ix.confirmation_token_hash+1).setValue('');
    sh.getRange(row,ix.confirmation_expires_at+1).setValue('');
    sh.getRange(row,ix.confirmation_at+1).setValue(now);
    sh.getRange(row,ix.confirmed_by+1).setValue(choice==='yes'?'Driver YES':'Driver NO');
    sh.getRange(row,ix.status+1).setValue(choice==='yes'?'Completed':'Pending');
    if(choice==='yes') sh.getRange(row,ix.completed_date+1).setValue(now);
    audit_('Driver','WHATSAPP_CONFIRM','Inspection',id,choice.toUpperCase()+'; vehicle '+vehicleId);
    if(choice==='yes') {
      const base=new Date(now);base.setHours(12,0,0,0);
      const months=type==='Annual'?12:6, next=new Date(base);next.setMonth(next.getMonth()+months);
      const existing=rows_('Inspections').some(x=>String(x.vehicle_id)===vehicleId&&String(x.inspection_type)===type&&String(x.status)!=='Completed'&&String(x.due_date)===Utilities.formatDate(next,'Asia/Riyadh','yyyy-MM-dd'));
      if(!existing) sh.appendRow([Utilities.getUuid(),vehicleId,type,Utilities.formatDate(next,'Asia/Riyadh','yyyy-MM-dd'),'','Pending',0,'Automatically scheduled after driver WhatsApp confirmation',now,'','','','','','']);
      if(type==='Annual') {
        rows_('Inspections').filter(x=>String(x.vehicle_id)===vehicleId&&String(x.inspection_type)==='6-Month'&&String(x.status)!=='Completed').forEach(x=>updateById_('Inspections','record_id',x.record_id,{status:'Completed',completed_date:now,confirmation_at:now,confirmed_by:'Closed by Annual inspection confirmation'}));
        const sixDue=new Date(base);sixDue.setMonth(sixDue.getMonth()+6);
        const sixKey=Utilities.formatDate(sixDue,'Asia/Riyadh','yyyy-MM-dd');
        const hasSix=rows_('Inspections').some(x=>String(x.vehicle_id)===vehicleId&&String(x.inspection_type)==='6-Month'&&String(x.status)!=='Completed'&&String(x.due_date)===sixKey);
        if(!hasSix) sh.appendRow([Utilities.getUuid(),vehicleId,'6-Month',sixKey,'','Pending',0,'Automatically scheduled six months after annual inspection confirmation',now,'','','','','','','']);
      }
    }
    return confirmationPage_(choice==='yes'?'Inspection confirmed':'Inspection not confirmed',choice==='yes'?'Thank you. Fleet Management has recorded the completion date.':'Thank you. The inspection remains open and Fleet Management will follow up.');
  } finally {lock.releaseLock();}
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
  ensureHandoverSheet_();
  const previous=rows_('Vehicles').find(v=>String(v.vehicle_id)===String(id));
  if(!previous) throw new Error('Vehicle not found.');
  const oldDriver=String(previous.assigned_driver||'').trim(), newDriver=String(payload.driver||'').trim();
  const driverChanged=oldDriver.toLowerCase()!==newDriver.toLowerCase();
  const patch={plate:String(payload.plate||'').trim().toUpperCase(),make:String(payload.make||''),model:String(payload.model||''),year:String(payload.year||''),site:String(payload.site||''),assigned_driver:newDriver,driver_phone:String(payload.phone||''),oil_interval_km:Number(payload.oilIntervalKm||5000),status:String(payload.status||'Active'),updated_at:new Date()};
  if(payload.currentKm!==undefined) patch.current_km=Number(payload.currentKm||0);
  if(payload.lastOilKm!==undefined) patch.last_oil_km=Number(payload.lastOilKm||0);
  if(payload.vehiclePin) {
    if(String(payload.vehiclePin).length<4) throw new Error('Vehicle access code must be at least 4 characters.');
    const salt=Utilities.getUuid(); patch.vehicle_pin_hash=salt+':'+hash_(salt+String(payload.vehiclePin));
  }
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    if(driverChanged && oldDriver && newDriver) {
      const existing=rows_('Handovers').find(h=>String(h.vehicle_id)===String(id)&&String(h.old_driver)===oldDriver&&String(h.new_driver)===newDriver&&String(h.status)!=='Completed');
      if(!existing) {
        const now=new Date(),hid=Utilities.getUuid();
        sheet_('Handovers').appendRow([hid,String(id),patch.plate,oldDriver,newDriver,String(previous.driver_phone||''),patch.driver_phone,now,Number(previous.current_km||0),'Pending Signatures','{}','Driver assignment changed; vehicle handover required.','{}',user.fullName,now,'','']);
      }
    }
    updateById_('Vehicles','vehicle_id',id,patch);
  } finally {lock.releaseLock();}
  audit_(user.fullName,'UPDATE','Vehicle',id,'Updated '+patch.plate+(driverChanged?'; driver changed from '+(oldDriver||'Unassigned')+' to '+(newDriver||'Unassigned'):''));
  return {ok:true,handoverRequired:driverChanged&&!!oldDriver&&!!newDriver,oldDriver,newDriver};
}
function createHandover(token,payload) {
  const user=requireOwner_(token);
  ensureHandoverSheet_();
  const v=rows_('Vehicles').find(x=>String(x.vehicle_id)===String(payload.vehicleId));
  if(!v)throw new Error('Vehicle not found.');
  const oldDriver=String(payload.oldDriver||'').trim(),newDriver=String(payload.newDriver||'').trim();
  if(!oldDriver||!newDriver||oldDriver.toLowerCase()===newDriver.toLowerCase())throw new Error('Old and new driver names must be different.');
  const now=new Date(),checklist=payload.checklist||{},snapshot=payload.snapshot||{};
  const pending=rows_('Handovers').find(h=>String(h.vehicle_id)===String(v.vehicle_id)&&String(h.old_driver).toLowerCase()===oldDriver.toLowerCase()&&String(h.new_driver).toLowerCase()===newDriver.toLowerCase()&&String(h.status)!=='Completed');
  const id=pending?String(pending.handover_id):Utilities.getUuid();
  const values={vehicle_plate:v.plate,old_driver_phone:String(payload.oldPhone||pending?.old_driver_phone||''),new_driver_phone:String(payload.newPhone||''),handover_date:payload.date||now,handover_km:Number(payload.km||v.current_km||0),status:'Pending Signatures',checklist_json:JSON.stringify(checklist),condition_notes:String(payload.notes||''),snapshot_json:JSON.stringify(snapshot),created_by:user.fullName};
  if(pending)updateById_('Handovers','handover_id',id,values);
  else sheet_('Handovers').appendRow([id,v.vehicle_id,v.plate,oldDriver,newDriver,values.old_driver_phone,values.new_driver_phone,values.handover_date,values.handover_km,values.status,values.checklist_json,values.condition_notes,values.snapshot_json,user.fullName,now,'','']);
  audit_(user.fullName,pending?'UPDATE':'CREATE','Handover',id,v.plate+'; '+oldDriver+' -> '+newDriver);
  return {ok:true,id};
}
function completeHandover(token,id,side) {
  const user=requireOwner_(token);
  if(!['old','new'].includes(side))throw new Error('Invalid signature side.');
  const patch=side==='old'?{old_driver_signed_at:new Date()}:{new_driver_signed_at:new Date()};
  updateById_('Handovers','handover_id',id,patch);
  const h=rows_('Handovers').find(x=>String(x.handover_id)===String(id));
  if(h&&h.old_driver_signed_at&&h.new_driver_signed_at)updateById_('Handovers','handover_id',id,{status:'Completed'});
  audit_(user.fullName,'SIGN','Handover',id,side+' driver signature recorded');
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
function ensureHandoverSheet_() {
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  let sh=ss.getSheetByName('Handovers');
  if(!sh) sh=ss.insertSheet('Handovers');
  if(sh.getLastRow()===0) {
    sh.getRange(1,1,1,TABLES.Handovers.length).setValues([TABLES.Handovers]);
    sh.setFrozenRows(1);
    sh.getRange(1,1,1,TABLES.Handovers.length).setFontWeight('bold').setBackground('#1e3a8a').setFontColor('#ffffff');
  }
  return sh;
}
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
function recentRowsForVehicles_(name, limit, vehicleIds) {
  const sh = sheet_(name), last = sh.getLastRow();
  if (last < 2 || !vehicleIds || !vehicleIds.length) return [];
  const width = sh.getLastColumn();
  const values = sh.getRange(1, 1, last, width).getValues();
  const headers = values.shift();
  const vehicleIndex = headers.indexOf('vehicle_id');
  if (vehicleIndex < 0) throw new Error('Missing vehicle_id column in ' + name + '.');
  const allowed = new Set(vehicleIds.map(String));
  const matching = values.filter(row =>
    row.some(v => v !== '' && v !== null) && allowed.has(String(row[vehicleIndex]))
  );
  const count = Math.max(1, Number(limit) || 150);
  return matching.slice(-count).map(row =>
    Object.fromEntries(headers.map((h, i) => [h, row[i] instanceof Date ? row[i].toISOString() : row[i]]))
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


// Executive Fleet Reports — always aggregates the live source sheets at request/export time.
function reportReadSheet_(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) return {available:false, rows:[], count:null};
  const values = sh.getDataRange().getValues();
  if (!values.length) return {available:true, rows:[], count:0};
  const headers = values[0].map(h=>String(h||'').trim());
  const rows = values.slice(1).filter(r=>r.some(v=>v!==''&&v!==null)).map(r=>
    Object.fromEntries(headers.map((h,i)=>[h,r[i] instanceof Date?r[i].toISOString():r[i]]))
  );
  return {available:true, rows, count:rows.length};
}
function reportNumber_(v) {
  const n=Number(String(v===null||v===undefined?'':v).replace(/[, ]/g,''));
  return Number.isFinite(n)?n:0;
}
function reportDate_(v) {
  if(!v)return null;
  const d=v instanceof Date?v:new Date(v);
  return Number.isNaN(d.getTime())?null:d;
}
function reportIsClosed_(status) {
  return ['closed','completed','resolved','rejected','cancelled'].includes(String(status||'').trim().toLowerCase());
}
function buildFleetExecutiveData_() {
  const names=['Vehicles','Tickets','Maintenance','Tire_Requests','Tire_Inventory','Tire_Installations','Tire_Stock_Movements','Handovers','Inspections','KM_Records','Oil_Changes','Tire_Surveys'];
  const src={}; names.forEach(n=>src[n]=reportReadSheet_(n));
  const rows=n=>src[n].rows, available=n=>src[n].available;
  const vehicles=rows('Vehicles'), active=vehicles.filter(v=>String(v.status||'Active').trim().toLowerCase()!=='inactive');
  const tickets=rows('Tickets'), maintenance=rows('Maintenance'), tireReq=rows('Tire_Requests'), inventory=rows('Tire_Inventory'), installs=rows('Tire_Installations'), handovers=rows('Handovers'), inspections=rows('Inspections'), km=rows('KM_Records'), oil=rows('Oil_Changes'), surveys=rows('Tire_Surveys'), movements=rows('Tire_Stock_Movements');
  const today=new Date(), todayKey=Utilities.formatDate(today,'Asia/Riyadh','yyyy-MM-dd');
  const openTickets=tickets.filter(x=>!reportIsClosed_(x.status));
  const openMaintenance=maintenance.filter(x=>!reportIsClosed_(x.status));
  const completedMaintenance=maintenance.filter(x=>String(x.status||'').toLowerCase()==='completed');
  const openTires=tireReq.filter(x=>!reportIsClosed_(x.status));
  const completedTires=tireReq.filter(x=>['completed','closed'].includes(String(x.status||'').trim().toLowerCase()));
  const inStock=inventory.filter(x=>String(x.status||'').trim().toLowerCase()==='in stock');
  const installed=inventory.filter(x=>String(x.status||'').trim().toLowerCase()==='installed');
  const overdueInspections=inspections.filter(x=>String(x.status||'').toLowerCase()!=='completed'&&x.due_date&&String(x.due_date).slice(0,10)<todayKey);
  const completedInspections=inspections.filter(x=>String(x.status||'').toLowerCase()==='completed');
  const pendingInspections=inspections.filter(x=>String(x.status||'').toLowerCase()!=='completed');
  const completedHandovers=handovers.filter(x=>String(x.status||'').toLowerCase()==='completed');
  const pendingHandovers=handovers.filter(x=>!reportIsClosed_(x.status));
  const totalMaintenanceCost=maintenance.reduce((a,x)=>a+reportNumber_(x.cost),0);
  const totalStockValue=inStock.reduce((a,x)=>a+reportNumber_(x.purchase_cost),0), stockCostCount=inStock.filter(x=>x.purchase_cost!==''&&x.purchase_cost!==null).length;
  const warehouseMap={};inStock.forEach(x=>{const k=String(x.warehouse||'Unassigned').trim()||'Unassigned';warehouseMap[k]=(warehouseMap[k]||0)+1;});
  const warehouseRows=Object.keys(warehouseMap).map(k=>({name:k,count:warehouseMap[k]})).sort((a,b)=>b.count-a.count).slice(0,5);
  const bySite={}; active.forEach(v=>{const k=String(v.site||'Not assigned').trim()||'Not assigned';bySite[k]=(bySite[k]||0)+1;});
  const siteRows=Object.keys(bySite).map(k=>({name:k,count:bySite[k]})).sort((a,b)=>b.count-a.count).slice(0,6);
  const byType={};maintenance.forEach(x=>{const k=String(x.maintenance_type||'Unclassified').trim()||'Unclassified';byType[k]=(byType[k]||0)+reportNumber_(x.cost);});
  const typeRows=Object.keys(byType).map(k=>({name:k,cost:byType[k]})).sort((a,b)=>b.cost-a.cost).slice(0,5);
  const monthMap={};
  maintenance.forEach(x=>{
    const d=reportDate_(x.completed_date||x.scheduled_date||x.created_at);
    if(!d)return;
    const key=Utilities.formatDate(d,'Asia/Riyadh','yyyy-MM');
    monthMap[key]=(monthMap[key]||0)+reportNumber_(x.cost);
  });
  const months=Object.keys(monthMap).sort().slice(-6).map(k=>({month:k,cost:monthMap[k]}));
  const oilOverdue=active.filter(v=>{
    const current=reportNumber_(v.current_km),last=reportNumber_(v.last_oil_km),interval=reportNumber_(v.oil_interval_km)||5000;
    return current-last>=interval;
  }).length;
  const oilWarning=active.filter(v=>{
    const current=reportNumber_(v.current_km),last=reportNumber_(v.last_oil_km),interval=reportNumber_(v.oil_interval_km)||5000,remain=interval-(current-last);
    return remain>0&&remain<=500;
  }).length;
  const missingSheets=names.filter(n=>!available(n));
  const missingVehicleDrivers=active.filter(v=>!String(v.assigned_driver||'').trim()).length;
  const missingVehicleSites=active.filter(v=>!String(v.site||'').trim()).length;
  return {
    generatedAt:Utilities.formatDate(today,'Asia/Riyadh','dd MMM yyyy, HH:mm'),
    generatedAtIso:today.toISOString(),
    dataQuality:{missingSheets,missingVehicleDrivers,missingVehicleSites,complete:missingSheets.length===0},
    fleet:{total:vehicles.length,active:active.length,inactive:vehicles.length-active.length,assigned:active.length-missingVehicleDrivers,unassigned:missingVehicleDrivers,bySite:siteRows},
    maintenance:{total:maintenance.length,completed:completedMaintenance.length,open:openMaintenance.length,cost:totalMaintenanceCost,withCost:maintenance.filter(x=>x.cost!==''&&x.cost!==null).length,byType:typeRows,monthly:months},
    tickets:{total:tickets.length,open:openTickets.length,closed:tickets.length-openTickets.length,highPriority:openTickets.filter(x=>['high','urgent','critical'].includes(String(x.priority||'').toLowerCase())).length},
    tires:{requests:tireReq.length,open:openTires.length,completed:completedTires.length,inventory:inventory.length,inStock:inStock.length,installed:installed.length,stockValue:totalStockValue,stockCostCount,warehouseBySite:warehouseRows,installations:installs.length,movements:movements.length,surveys:surveys.length},
    handovers:{total:handovers.length,completed:completedHandovers.length,pending:pendingHandovers.length},
    inspections:{total:inspections.length,completed:completedInspections.length,pending:pendingInspections.length,overdue:overdueInspections.length},
    utilization:{kmEntries:km.length,oilChanges:oil.length,oilOverdue,oilWarning},
    sources:Object.fromEntries(names.map(n=>[n,{available:available(n),records:available(n)?src[n].count:null}]))
  };
}
function getFleetExecutiveReport(token) {
  requireOwner_(token);
  return buildFleetExecutiveData_();
}
function execAddText_(slide,text,x,y,w,h,size,color,bold,align) {
  const box=slide.insertTextBox(String(text===undefined||text===null?'':text),x,y,w,h);
  box.getText().getTextStyle().setFontFamily('Arial').setFontSize(size||12).setForegroundColor(color||'#172033').setBold(!!bold);
  box.getText().getParagraphStyle().setParagraphAlignment(align||SlidesApp.ParagraphAlignment.START);
  box.setContentAlignment(SlidesApp.ContentAlignment.MIDDLE);
  return box;
}
function execAddRect_(slide,x,y,w,h,fill,radius) {
  const shape=slide.insertShape(radius?SlidesApp.ShapeType.ROUND_RECTANGLE:SlidesApp.ShapeType.RECTANGLE,x,y,w,h);
  shape.getFill().setSolidFill(fill);
  // SlidesApp.Shape does not expose getLine(); keep the shape fill and default outline.
  return shape;
}
function execMetric_(d,source,value) { return d.sources[source]&&d.sources[source].available?value:'Data Incomplete'; }
function execMultiMetric_(d,sources,value) { return sources.every(name=>d.sources[name]&&d.sources[name].available)?value:'Data Incomplete'; }
function execAddCard_(slide,x,y,w,label,value,note,accent) {
  execAddRect_(slide,x,y,w,78,'#FFFFFF',true);
  execAddRect_(slide,x,y,5,78,accent||'#0F766E',false);
  execAddText_(slide,label.toUpperCase(),x+16,y+10,w-28,14,8,'#64748B',true);
  execAddText_(slide,value,x+16,y+27,w-28,29,23,'#0F172A',true);
  execAddText_(slide,note||'',x+16,y+57,w-28,13,8,'#64748B',false);
}
function execAddHeader_(slide,kicker,title,subtitle,page,generatedAt) {
  slide.getBackground().setSolidFill('#F3F6FA');
  execAddRect_(slide,0,0,720,9,'#0B2438',false);
  execAddText_(slide,"MA'ADEN   |   IVANHOE ELECTRIC",38,24,420,18,9,'#0B5260',true);
  execAddText_(slide,kicker.toUpperCase(),38,50,640,13,8,'#64748B',true);
  execAddText_(slide,title,38,67,644,32,22,'#102A43',true);
  execAddText_(slide,subtitle,38,101,644,20,9,'#526477',false);
  execAddRect_(slide,38,378,644,1,'#D8E1EA',false);
  execAddText_(slide,'FLEET MANAGEMENT  •  LIVE DATA  •  '+generatedAt+'  •  '+page+' / 4',38,382,644,12,7,'#718096',false);
}
function execAddBarRows_(slide,items,x,y,w,maxRows,formatter) {
  const list=(items||[]).slice(0,maxRows), max=Math.max(1,...list.map(x=>Number(x.value)||0));
  list.forEach((it,i)=>{
    const yy=y+i*31;
    execAddText_(slide,it.label,x,yy,w*0.38,16,8,'#334155',true);
    execAddRect_(slide,x+w*0.4,yy+2,w*0.42,9,'#E2E8F0',true);
    execAddRect_(slide,x+w*0.4,yy+2,Math.max(2,w*0.42*(Number(it.value)||0)/max),9,'#0F766E',true);
    execAddText_(slide,formatter?formatter(it.value):String(it.value),x+w*0.84,yy-1,w*0.16,16,8,'#0F172A',true,SlidesApp.ParagraphAlignment.END);
  });
}
function exportFleetExecutivePowerPoint(token) {
  const user=requireOwner_(token), d=buildFleetExecutiveData_();
  const pres=SlidesApp.create('Fleet Executive Dashboard — '+Utilities.formatDate(new Date(),'Asia/Riyadh','yyyy-MM-dd'));
  const slides=pres.getSlides();
  // Reuse the presentation's first blank slide, then append exactly three more.
  let s=slides.length?slides[0]:pres.appendSlide(SlidesApp.PredefinedLayout.BLANK);
  s.getPageElements().forEach(element=>element.remove());
  execAddHeader_(s,'EXECUTIVE BRIEFING','Fleet Performance at a Glance','A consolidated view of fleet readiness, service workload and operational exposure.',1,d.generatedAt);
  execAddCard_(s,38,139,150,'Active Fleet',execMetric_(d,'Vehicles',d.fleet.active),'of '+execMetric_(d,'Vehicles',d.fleet.total)+' registered vehicles','#0F766E');
  execAddCard_(s,202,139,150,'Open Requests',execMultiMetric_(d,['Tickets','Tire_Requests'],d.tickets.open+d.tires.open),'Maintenance + tire requests','#D97706');
  execAddCard_(s,366,139,150,'Maintenance Spend',d.maintenance.withCost?('SAR '+Math.round(d.maintenance.cost).toLocaleString('en-US')):'Data Incomplete',d.maintenance.withCost+' records with cost data','#2563EB');
  execAddCard_(s,530,139,152,'Compliance Risks',execMultiMetric_(d,['Inspections','Vehicles'],d.inspections.overdue+d.utilization.oilOverdue),'Overdue inspections + oil alerts','#DC2626');
  execAddText_(s,'FLEET DISTRIBUTION BY SITE',38,239,300,18,10,'#102A43',true);
  execAddBarRows_(s,d.fleet.bySite.map(x=>({label:x.name,value:x.count})),38,263,400,4,v=>String(v));
  execAddRect_(s,470,235,212,118,'#E8EEF4',true);
  execAddText_(s,'MANAGEMENT SIGNAL',486,249,180,16,9,'#0B5260',true);
  execAddText_(s,execMetric_(d,'Vehicles',d.fleet.unassigned)+' vehicles without an assigned driver',486,272,180,34,13,'#102A43',true);
  execAddText_(s,d.dataQuality.missingSheets.length?'Data coverage incomplete: '+d.dataQuality.missingSheets.join(', '):'All expected source sheets are available.',486,315,180,32,8,'#526477',false);
  // Slide 2 — maintenance and ticket backlog.
  s=pres.appendSlide(SlidesApp.PredefinedLayout.BLANK);
  execAddHeader_(s,'SERVICE DELIVERY','Maintenance & Workload','Recorded maintenance activity, costs and open work requiring management attention.',2,d.generatedAt);
  execAddCard_(s,38,139,150,'Maintenance Records',execMetric_(d,'Maintenance',d.maintenance.total),d.maintenance.completed+' completed / '+d.maintenance.open+' open','#0F766E');
  execAddCard_(s,202,139,150,'Maintenance Cost',d.maintenance.withCost?'SAR '+Math.round(d.maintenance.cost).toLocaleString('en-US'):'Data Incomplete',d.maintenance.withCost+' cost entries','#2563EB');
  execAddCard_(s,366,139,150,'Open Tickets',execMetric_(d,'Tickets',d.tickets.open),d.tickets.highPriority+' high / urgent priority','#D97706');
  execAddCard_(s,530,139,152,'Closed Tickets',execMetric_(d,'Tickets',d.tickets.closed),'of '+d.tickets.total+' recorded tickets','#64748B');
  execAddText_(s,'MAINTENANCE COST BY TYPE (SAR)',38,239,320,18,10,'#102A43',true);
  execAddBarRows_(s,d.maintenance.byType.map(x=>({label:x.name,value:x.cost})),38,264,420,4,v=>'SAR '+Math.round(v).toLocaleString('en-US'));
  execAddRect_(s,490,235,192,118,'#E8EEF4',true);
  execAddText_(s,'SIX-MONTH COST TREND',505,249,160,16,9,'#0B5260',true);
  execAddText_(s,d.maintenance.monthly.length?d.maintenance.monthly.map(x=>x.month+': SAR '+Math.round(x.cost).toLocaleString('en-US')).join('\n'):'Data Incomplete — no dated maintenance cost records.',505,272,160,72,8,'#334155',false);
  // Slide 3 — tires and warehouse.
  s=pres.appendSlide(SlidesApp.PredefinedLayout.BLANK);
  execAddHeader_(s,'ASSET CONTROL','Tires & Warehouse Position','Tire requests, stock availability, installed assets and recorded stock value.',3,d.generatedAt);
  execAddCard_(s,38,139,150,'Tire Requests',execMetric_(d,'Tire_Requests',d.tires.requests),d.tires.open+' open / '+d.tires.completed+' completed','#D97706');
  execAddCard_(s,202,139,150,'In-Stock Tires',execMetric_(d,'Tire_Inventory',d.tires.inStock),'of '+d.tires.inventory+' inventory records','#0F766E');
  execAddCard_(s,366,139,150,'Installed Tires',execMetric_(d,'Tire_Inventory',d.tires.installed),execMetric_(d,'Tire_Installations',d.tires.installations)+' installation records','#2563EB');
  execAddCard_(s,530,139,152,'Stock Value',d.tires.inventory?('SAR '+Math.round(d.tires.stockValue).toLocaleString('en-US')):'Data Incomplete','Recorded purchase cost of in-stock tires','#64748B');
  execAddRect_(s,38,239,310,114,'#FFFFFF',true);
  execAddText_(s,'IN-STOCK BY WAREHOUSE',54,252,270,16,10,'#102A43',true);
  execAddText_(s,d.sources.Tire_Inventory.available?(d.tires.warehouseBySite.length?d.tires.warehouseBySite.map(x=>x.name+': '+x.count+' tires').join('\n'):'No in-stock tires recorded.'):'Data Incomplete',54,276,270,54,9,'#334155',false);
  execAddText_(s,'Movements: '+(d.sources.Tire_Stock_Movements.available?d.tires.movements:'Data Incomplete')+'  •  Surveys: '+(d.sources.Tire_Surveys.available?d.tires.surveys:'Data Incomplete'),54,333,270,12,7,'#64748B',false);
  execAddRect_(s,370,239,312,114,'#E8EEF4',true);
  execAddText_(s,'MANAGEMENT FOLLOW-UP',386,252,280,16,10,'#0B5260',true);
  execAddText_(s,execMetric_(d,'Tire_Requests',d.tires.open)+' tire requests remain open. '+(d.sources.Tire_Inventory.available?(d.tires.inStock===0?'No tires are recorded as in stock.':d.tires.inStock+' tires are recorded in stock.'):'Inventory: Data Incomplete'),386,278,275,48,12,'#102A43',true);
  execAddText_(s,'Stock valuation is based only on recorded purchase_cost values; missing costs are not estimated.',386,328,275,18,7,'#526477',false);
  // Slide 4 — handovers, compliance and management actions.
  s=pres.appendSlide(SlidesApp.PredefinedLayout.BLANK);
  execAddHeader_(s,'GOVERNANCE & READINESS','Compliance, Handovers & Priorities','Evidence of driver transitions, scheduled inspections and daily vehicle controls.',4,d.generatedAt);
  execAddCard_(s,38,139,150,'Handovers',execMetric_(d,'Handovers',d.handovers.total),d.handovers.completed+' completed / '+d.handovers.pending+' pending','#0F766E');
  execAddCard_(s,202,139,150,'Inspections',execMetric_(d,'Inspections',d.inspections.total),d.inspections.completed+' completed / '+d.inspections.pending+' pending','#2563EB');
  execAddCard_(s,366,139,150,'Overdue Checks',execMetric_(d,'Inspections',d.inspections.overdue),'Inspection due dates passed','#DC2626');
  execAddCard_(s,530,139,152,'KM / Oil Records',execMetric_(d,'KM_Records',d.utilization.kmEntries)+' / '+execMetric_(d,'Oil_Changes',d.utilization.oilChanges),'KM entries / oil changes','#64748B');
  execAddRect_(s,38,239,310,114,'#FFFFFF',true);
  execAddText_(s,'VEHICLE READINESS ALERTS',54,252,270,16,10,'#102A43',true);
  execAddText_(s,'Oil overdue: '+d.utilization.oilOverdue+' vehicles\\nOil warning: '+d.utilization.oilWarning+' vehicles\\nUnassigned drivers: '+d.fleet.unassigned,54,278,270,62,11,'#334155',false);
  execAddRect_(s,370,239,312,114,'#E8EEF4',true);
  execAddText_(s,'DATA COVERAGE & ACTIONS',386,252,280,16,10,'#0B5260',true);
  const coverage=d.dataQuality.missingSheets.length?'Missing sheets: '+d.dataQuality.missingSheets.join(', '):'All report source sheets are present.';
  execAddText_(s,coverage+'\nConfirm pending handovers, clear overdue inspections and review high-priority tickets.',386,278,275,63,9,'#334155',false);
  pres.saveAndClose();
  const exportUrl='https://www.googleapis.com/drive/v3/files/'+pres.getId()+'/export?mimeType='+encodeURIComponent('application/vnd.openxmlformats-officedocument.presentationml.presentation');
  const response=UrlFetchApp.fetch(exportUrl,{headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},muteHttpExceptions:true});
  if(response.getResponseCode()!==200) {
    DriveApp.getFileById(pres.getId()).setTrashed(true);
    throw new Error('PowerPoint export failed (HTTP '+response.getResponseCode()+'). Re-authorize Drive access and try again.');
  }
  const filename='Fleet_Executive_Dashboard_'+Utilities.formatDate(new Date(),'Asia/Riyadh','yyyyMMdd_HHmm')+'.pptx';
  const pptx=response.getBlob().setName(filename).setContentType('application/vnd.openxmlformats-officedocument.presentationml.presentation');
  const file=DriveApp.createFile(pptx);
  file.setDescription('Four-slide executive fleet dashboard generated from live Fleet ERP records on '+d.generatedAt+'.');
  DriveApp.getFileById(pres.getId()).setTrashed(true);
  audit_(user.fullName,'EXPORT','Fleet Executive Report',file.getId(),'Four-slide live-data PowerPoint exported.');
  return {ok:true,url:file.getUrl(),name:filename,generatedAt:d.generatedAt,slides:4};
}
