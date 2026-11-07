import { useState } from 'react';
import ReportIssue from './ReportIssue';
import TireServiceRequests from './TireServiceRequests';

export default function MaintenanceReport({ canWork = false }) {
  const [tab,setTab]=useState('issue');
  return <div className="hub-page">
    <div className="panel" style={{marginBottom:16}}>
      <h1 style={{margin:0}}>🛠️ Maintenance Report</h1>
      <p style={{margin:'6px 0 0',color:'#64748b'}}>Vehicle maintenance issues and tire service requests.</p>
    </div>
    <div className="sub-nav" style={{marginBottom:18}}>
      <button className={tab==='issue'?'sub-btn active':'sub-btn'} onClick={()=>setTab('issue')}>1- Maintenance Issue Report</button>
      <button className={tab==='tire'?'sub-btn active':'sub-btn'} onClick={()=>setTab('tire')}>2- Tire Service Request</button>
    </div>
    {tab==='issue' && <ReportIssue canWork={canWork}/>}
    {tab==='tire' && <TireServiceRequests driverMode={false}/>}
  </div>;
}