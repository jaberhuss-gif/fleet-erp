import { useEffect, useState } from 'react';
import api from '../api/client';

const POS=['FL','FR','RL','RR','S1','S2'];
const L={FL:'Front Left',FR:'Front Right',RL:'Rear Left',RR:'Rear Right',S1:'Spare 1',S2:'Spare 2'};

export default function TireControl(){
  const [cards,setCards]=useState([]),[pending,setPending]=useState([]),[selected,setSelected]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const load=async()=>{try{setLoading(true);const [a,b]=await Promise.all([api.get('/tire-control/cards'),api.get('/tire-surveys/initial-pending')]);setCards(a.data.cards||[]);setPending(b.data.surveys||[]);}catch(e){setError(e.response?.data?.error||e.message)}finally{setLoading(false)}};
  useEffect(()=>{load()},[]);
  const open=async(id)=>{try{const r=await api.get('/tire-control/vehicle/'+id);setSelected(r.data.state)}catch(e){setError(e.response?.data?.error||e.message)}};
  const statusStyle=s=>s==='red'?{background:'#fee2e2',color:'#991b1b'}:s==='yellow'?{background:'#fef3c7',color:'#92400e'}:{background:'#dcfce7',color:'#166534'};
  return <div className="panel">
    <h2>🛞 Tire Control Center</h2><p style={{color:'#64748b'}}>Red exceptions first, yellow follow-up, green controlled.</p>
    {error&&<div className="alert alert-error">{error}</div>}
    {pending.length>0&&<div className="alert alert-warning"><strong>{pending.length} Initial Tire Survey(s) waiting for registration.</strong></div>}
    {loading?<div className="loading">Loading...</div>:<table><thead><tr><th>Vehicle</th><th>Location</th><th>Tires</th><th>Status</th><th>Last Event</th><th></th></tr></thead><tbody>{cards.map(v=><tr key={v.id}><td><strong>{v.plate}</strong></td><td>{v.location||'-'}</td><td>{v.assigned}/6</td><td><span style={{...statusStyle(v.tireStatus),padding:'4px 9px',borderRadius:12,fontWeight:700}}>{v.tireStatus.toUpperCase()}</span></td><td>{v.lastEvent?new Date(v.lastEvent).toLocaleDateString():'-'}</td><td><button className="btn btn-primary" onClick={()=>open(v.id)}>Open Card</button></td></tr>)}</tbody></table>}
    {selected&&<div style={{marginTop:20}}><h3>Vehicle {selected.vehicle.plate_number} {selected.vehicle.plate_code||''} — Tire Card</h3><div className="cards-grid">{selected.positions.map(t=><div className="card" key={t.position}><h3>{t.position}</h3><div><strong>{t.tire_code||'MISSING'}</strong></div><div>{t.serial_number||'No manufacturer serial'}</div><div>{t.brand||'-'} {t.size||''}</div><div>Status: <b>{t.status||'Missing'}</b></div></div>)}</div><h3>Recent Events</h3><table><thead><tr><th>Date</th><th>Position</th><th>Event</th><th>Outcome</th><th>KM</th></tr></thead><tbody>{selected.events.map(e=><tr key={e.id}><td>{new Date(e.created_at).toLocaleString()}</td><td>{e.position}</td><td>{e.event_type}</td><td>{e.outcome}</td><td>{Number(e.km||0).toLocaleString()}</td></tr>)}</tbody></table></div>}
  </div>;
}
