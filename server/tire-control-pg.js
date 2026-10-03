import { query, transaction } from "./postgres.js";

const POSITIONS = ["FL","FR","RL","RR","S1","S2"];

function clean(v){ return v == null ? "" : String(v).trim(); }
function num(v,d=0){ const n=Number(v); return Number.isFinite(n)?n:d; }

export async function ensureTireControlSchema(){
  await query(`
    CREATE SEQUENCE IF NOT EXISTS tire_code_seq START 1;
    CREATE TABLE IF NOT EXISTS tires (
      id BIGSERIAL PRIMARY KEY,
      tire_code TEXT NOT NULL UNIQUE,
      serial_number TEXT UNIQUE,
      brand TEXT,
      size TEXT,
      tire_type TEXT,
      dot_code TEXT,
      purchase_date DATE,
      supplier TEXT,
      cost NUMERIC(12,2),
      status TEXT NOT NULL DEFAULT 'Unregistered',
      condition TEXT,
      notes TEXT,
      created_by BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS vehicle_tires (
      id BIGSERIAL PRIMARY KEY,
      vehicle_id BIGINT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      position TEXT NOT NULL CHECK(position IN ('FL','FR','RL','RR','S1','S2')),
      tire_id BIGINT NOT NULL REFERENCES tires(id),
      installed_date DATE,
      installed_km BIGINT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      removed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(vehicle_id, position) DEFERRABLE INITIALLY IMMEDIATE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS vehicle_tires_one_active
      ON vehicle_tires(vehicle_id, position) WHERE active = TRUE;
    CREATE TABLE IF NOT EXISTS tire_surveys (
      id BIGSERIAL PRIMARY KEY,
      vehicle_id BIGINT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      survey_type TEXT NOT NULL CHECK(survey_type IN ('initial','event','audit')),
      status TEXT NOT NULL DEFAULT 'submitted',
      event_type TEXT,
      position TEXT,
      outcome TEXT,
      km BIGINT,
      location TEXT,
      notes TEXT,
      photos JSONB NOT NULL DEFAULT '[]'::jsonb,
      reported_by BIGINT,
      approved_by BIGINT,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      approved_at TIMESTAMPTZ
    );
    CREATE UNIQUE INDEX IF NOT EXISTS tire_initial_once
      ON tire_surveys(vehicle_id) WHERE survey_type='initial';
    CREATE TABLE IF NOT EXISTS tire_events (
      id BIGSERIAL PRIMARY KEY,
      vehicle_id BIGINT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      tire_id BIGINT REFERENCES tires(id),
      old_tire_id BIGINT REFERENCES tires(id),
      new_tire_id BIGINT REFERENCES tires(id),
      event_type TEXT NOT NULL,
      position TEXT,
      outcome TEXT,
      km BIGINT,
      notes TEXT,
      survey_id BIGINT REFERENCES tire_surveys(id) ON DELETE SET NULL,
      reported_by BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS tire_events_vehicle_idx ON tire_events(vehicle_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS tire_events_tire_idx ON tire_events(tire_id, created_at DESC);
  `);
}

async function getVehicle(id){
  return (await query(`SELECT id, plate_number, plate_code, make, model, location, current_km, driver, driver_id
                       FROM vehicles WHERE id=$1 LIMIT 1`,[id])).rows[0] || null;
}

async function getInitial(vehicleId){
  return (await query(`SELECT * FROM tire_surveys WHERE vehicle_id=$1 AND survey_type='initial' LIMIT 1`,[vehicleId])).rows[0] || null;
}

async function findOrCreateTire(data, userId){
  const serial=clean(data.serial_number);
  if(serial){
    const existing=(await query(`SELECT * FROM tires WHERE lower(serial_number)=lower($1) LIMIT 1`,[serial])).rows[0];
    if(existing){
      await query(`UPDATE tires SET brand=COALESCE(NULLIF($1,''),brand), size=COALESCE(NULLIF($2,''),size),
        tire_type=COALESCE(NULLIF($3,''),tire_type), dot_code=COALESCE(NULLIF($4,''),dot_code),
        condition=COALESCE(NULLIF($5,''),condition), status=CASE WHEN status='Unregistered' THEN 'Installed' ELSE status END,
        updated_at=CURRENT_TIMESTAMP WHERE id=$6`,
        [clean(data.brand),clean(data.size),clean(data.tire_type),clean(data.dot_code),clean(data.condition),existing.id]);
      return existing.id;
    }
  }
  const r=await query(`INSERT INTO tires
    (tire_code,serial_number,brand,size,tire_type,dot_code,purchase_date,supplier,cost,status,condition,notes,created_by)
    VALUES ('T-'||LPAD(nextval('tire_code_seq')::text,6,'0'),NULLIF($1,''),$2,$3,$4,$5,NULLIF($6,'')::date,$7,NULLIF($8,'')::numeric,$9,$10,$11,$12)
    RETURNING id`,
    [serial,clean(data.brand),clean(data.size),clean(data.tire_type),clean(data.dot_code),clean(data.purchase_date),
     clean(data.supplier),data.cost===""?null:num(data.cost,0),data.status||'Installed',clean(data.condition),clean(data.notes),userId||null]);
  return r.rows[0].id;
}

async function assignTire(client, vehicleId, position, tireId, km){
  await client.query(`UPDATE vehicle_tires SET active=FALSE, removed_at=CURRENT_TIMESTAMP
                      WHERE vehicle_id=$1 AND position=$2 AND active=TRUE`,[vehicleId,position]);
  await client.query(`INSERT INTO vehicle_tires(vehicle_id,position,tire_id,installed_date,installed_km,active)
                      VALUES($1,$2,$3,CURRENT_DATE,$4,TRUE)`,[vehicleId,position,tireId,km||null]);
  await client.query(`UPDATE tires SET status='Installed', updated_at=CURRENT_TIMESTAMP WHERE id=$1`,[tireId]);
}

export async function findVehicleByPlate(plate){
  const p=clean(plate);
  const parts=p.split(/\s+/).filter(Boolean);
  const number=parts[0]||p;
  const code=parts.slice(1).join(" ").toUpperCase();
  const r=await query(`SELECT id,plate_number,plate_code,make,model,location,current_km,driver,driver_id
                       FROM vehicles
                       WHERE lower(trim(plate_number))=lower(trim($1))
                         AND ($2='' OR lower(trim(plate_code))=lower(trim($2)))
                       ORDER BY current_km DESC NULLS LAST,id DESC LIMIT 1`,[number,code]);
  return r.rows[0]||null;
}

export async function getSurveyState(vehicleId){
  const vehicle=await getVehicle(vehicleId);
  if(!vehicle) return null;
  const initial=await getInitial(vehicleId);
  const tires=(await query(`SELECT vt.position,t.id,t.tire_code,t.serial_number,t.brand,t.size,t.tire_type,
      t.dot_code,t.status,t.condition,vt.installed_date,vt.installed_km
      FROM vehicle_tires vt JOIN tires t ON t.id=vt.tire_id
      WHERE vt.vehicle_id=$1 AND vt.active=TRUE
      ORDER BY array_position(ARRAY['FL','FR','RL','RR','S1','S2'],vt.position)`,[vehicleId])).rows;
  const events=(await query(`SELECT te.*,t.tire_code,t.serial_number
      FROM tire_events te LEFT JOIN tires t ON t.id=COALESCE(te.new_tire_id,te.tire_id)
      WHERE te.vehicle_id=$1 ORDER BY te.created_at DESC LIMIT 20`,[vehicleId])).rows;
  return {
    vehicle,
    initial:{done:!!initial,status:initial?.status||null,id:initial?.id||null,submitted_at:initial?.submitted_at||null,photos:initial?.photos||[]},
    positions:POSITIONS.map(position=>tires.find(x=>x.position===position)||{position,tire_code:null,serial_number:null,status:'Missing'}),
    events
  };
}

export async function submitInitialSurvey({vehicleId,km,location,photos,reportedBy,notes}){
  const vehicle=await getVehicle(vehicleId);
  if(!vehicle) throw new Error("Vehicle not found");
  const existing=await getInitial(vehicleId);
  if(existing) throw new Error("Initial Tire Survey is already locked for this vehicle.");
  const photoList=Array.isArray(photos)?photos.slice(0,6):[];
  if(photoList.length!==6) throw new Error("All 6 tire photos are required for the initial survey.");
  const r=await query(`INSERT INTO tire_surveys(vehicle_id,survey_type,status,km,location,notes,photos,reported_by)
                         VALUES($1,'initial','submitted',$2,$3,$4,$5::jsonb,$6) RETURNING *`,
    [vehicleId,km||null,clean(location),clean(notes),JSON.stringify(photoList),reportedBy||null]);
  return r.rows[0];
}

export async function listPendingInitial(){
  return (await query(`SELECT s.id,s.vehicle_id,s.km,s.location,s.photos,s.submitted_at,
      v.plate_number,v.plate_code,v.make,v.model,v.location AS vehicle_location
      FROM tire_surveys s JOIN vehicles v ON v.id=s.vehicle_id
      WHERE s.survey_type='initial' AND s.status='submitted'
      ORDER BY s.submitted_at ASC`)).rows;
}

export async function completeInitialSurvey(surveyId, tires, userId){
  if(!Array.isArray(tires)||tires.length!==6) throw new Error("Exactly 6 tire records are required.");
  const survey=(await query(`SELECT * FROM tire_surveys WHERE id=$1 AND survey_type='initial' LIMIT 1`,[surveyId])).rows[0];
  if(!survey) throw new Error("Initial survey not found.");
  if(survey.status==='approved') throw new Error("Initial survey is already approved.");
  const seen=new Set();
  for(const t of tires){
    if(!POSITIONS.includes(t.position)) throw new Error("Invalid tire position: "+t.position);
    if(seen.has(t.position)) throw new Error("Duplicate tire position: "+t.position);
    seen.add(t.position);
  }
  const result=await transaction(async(client)=>{
    const tireIds=[];
    for(const t of tires){
      const serial=clean(t.serial_number);
      let existing=null;
      if(serial) existing=(await client.query(`SELECT id FROM tires WHERE lower(serial_number)=lower($1) LIMIT 1`,[serial])).rows[0];
      let tireId=existing?.id;
      if(!tireId){
        const x=await client.query(`INSERT INTO tires(tire_code,serial_number,brand,size,tire_type,dot_code,purchase_date,supplier,cost,status,condition,notes,created_by)
          VALUES('T-'||LPAD(nextval('tire_code_seq')::text,6,'0'),NULLIF($1,''),$2,$3,$4,$5,NULLIF($6,'')::date,$7,NULLIF($8,'')::numeric,'Installed',$9,$10,$11)
          RETURNING id`,
          [serial,clean(t.brand),clean(t.size),clean(t.tire_type),clean(t.dot_code),clean(t.purchase_date),clean(t.supplier),
           t.cost===""?null:num(t.cost,0),clean(t.condition),clean(t.notes),userId||null]);
        tireId=x.rows[0].id;
      } else {
        await client.query(`UPDATE tires SET brand=COALESCE(NULLIF($1,''),brand),size=COALESCE(NULLIF($2,''),size),
          tire_type=COALESCE(NULLIF($3,''),tire_type),dot_code=COALESCE(NULLIF($4,''),dot_code),
          condition=COALESCE(NULLIF($5,''),condition),status='Installed',updated_at=CURRENT_TIMESTAMP WHERE id=$6`,
          [clean(t.brand),clean(t.size),clean(t.tire_type),clean(t.dot_code),clean(t.condition),tireId]);
      }
      tireIds.push({position:t.position,tireId});
    }
    for(const x of tireIds) await assignTire(client,survey.vehicle_id,x.position,x.tireId,survey.km);
    await client.query(`UPDATE tire_surveys SET status='approved',approved_by=$1,approved_at=CURRENT_TIMESTAMP WHERE id=$2`,[userId||null,surveyId]);
    return {surveyId,vehicleId:survey.vehicle_id,tireIds};
  });
  return result;
}

export async function submitTireEvent({vehicleId,eventType,position,outcome,km,location,notes,photos,reportedBy,newTire}){
  const vehicle=await getVehicle(vehicleId);
  if(!vehicle) throw new Error("Vehicle not found");
  const state=await getSurveyState(vehicleId);
  if(!state.initial.done || state.initial.status!=='approved') throw new Error("Initial Tire Survey is not completed for this vehicle.");
  if(!POSITIONS.includes(position)) throw new Error("Tire position is required.");
  const current=state.positions.find(x=>x.position===position);
  if(!current?.id) throw new Error("No registered tire exists at this position.");
  const survey=await query(`INSERT INTO tire_surveys(vehicle_id,survey_type,status,event_type,position,outcome,km,location,notes,photos,reported_by)
    VALUES($1,'event','submitted',$2,$3,$4,$5,$6,$7,$8::jsonb,$9) RETURNING id`,
    [vehicleId,clean(eventType),position,clean(outcome),km||null,clean(location),clean(notes),JSON.stringify(Array.isArray(photos)?photos.slice(0,3):[]),reportedBy||null]);
  const surveyId=survey.rows[0].id;
  const result=await transaction(async(client)=>{
    let newTireId=null;
    if(outcome==='replaced_with_spare'){
      const sparePos=newTire?.sparePosition;
      const spare=state.positions.find(x=>x.position===sparePos);
      if(!spare?.id) throw new Error("Selected spare tire is not registered.");
      newTireId=spare.id;
      await assignTire(client,vehicleId,position,newTireId,km);
      await assignTire(client,vehicleId,sparePos,current.id,km);
    } else if(outcome==='replaced_with_new' || outcome==='replaced_with_another'){
      const serial=clean(newTire?.serial_number);
      if(!serial) throw new Error("New tire manufacturer serial number is required.");
      const found=(await client.query(`SELECT id FROM tires WHERE lower(serial_number)=lower($1) LIMIT 1`,[serial])).rows[0];
      if(found) newTireId=found.id;
      else {
        const x=await client.query(`INSERT INTO tires(tire_code,serial_number,brand,size,tire_type,dot_code,status,condition,notes,created_by)
          VALUES('T-'||LPAD(nextval('tire_code_seq')::text,6,'0'),$1,$2,$3,$4,$5,'Unregistered','Unknown',$6,$7) RETURNING id`,
          [serial,clean(newTire?.brand),clean(newTire?.size),clean(newTire?.tire_type),clean(newTire?.dot_code),
           'Created from driver tire survey; requires admin registration.',reportedBy||null]);
        newTireId=x.rows[0].id;
      }
      await assignTire(client,vehicleId,position,newTireId,km);
    }
    await client.query(`INSERT INTO tire_events(vehicle_id,tire_id,old_tire_id,new_tire_id,event_type,position,outcome,km,notes,survey_id,reported_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [vehicleId,newTireId||current.id,current.id,newTireId||current.id,clean(eventType),position,clean(outcome),km||null,clean(notes),surveyId,reportedBy||null]);
    if(outcome==='repaired_same_position' || outcome==='repaired'){
      await client.query(`UPDATE tires SET status='Installed',updated_at=CURRENT_TIMESTAMP WHERE id=$1`,[current.id]);
    }
    return {surveyId,vehicleId,position,outcome,newTireId,oldTireId:current.id};
  });
  return result;
}

export async function listControlCards(){
  const vehicles=(await query(`SELECT id,plate_number,plate_code,make,model,location,current_km,driver FROM vehicles ORDER BY plate_number,plate_code`)).rows;
  const rows=[];
  for(const v of vehicles){
    const state=await getSurveyState(v.id);
    const assigned=state.positions.filter(x=>x.id).length;
    const unregistered=state.positions.filter(x=>x.status==='Unregistered').length;
    const mismatch=state.positions.filter(x=>!x.id).length;
    let tireStatus='green';
    if(!state.initial.done || state.initial.status!=='approved' || assigned<6) tireStatus='yellow';
    if(unregistered>0 || mismatch>0) tireStatus='red';
    rows.push({...v,plate:[v.plate_number,v.plate_code].filter(Boolean).join(' '),tireStatus,assigned,unregistered,lastEvent:state.events[0]?.created_at||null});
  }
  const rank={red:0,yellow:1,green:2};
  rows.sort((a,b)=>rank[a.tireStatus]-rank[b.tireStatus] || a.plate.localeCompare(b.plate));
  return rows;
}

export async function getControlCard(vehicleId){
  const state=await getSurveyState(vehicleId);
  if(!state) return null;
  const assigned=state.positions.filter(x=>x.id).length;
  const unregistered=state.positions.filter(x=>x.status==='Unregistered').length;
  const tireStatus=unregistered>0||assigned<6?'red':(!state.initial.done||state.initial.status!=='approved'?'yellow':'green');
  return {...state,tireStatus,assigned};
}

export const TIRE_POSITIONS=POSITIONS;
