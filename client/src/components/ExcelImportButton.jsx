import { useEffect, useRef, useState } from 'react';
import api from '../api/client';

const clean = v => v == null ? '' : String(v).trim();
const key = v => clean(v).toLowerCase().replace(/[\s_\-/#().]+/g, '');
const num = v => { const n = Number(clean(v).replace(/,/g,'').replace(/[^0-9.\-]/g,'')); return Number.isFinite(n) ? n : 0; };
const fields = [
  { key:'srNo', label:'Sr.', aliases:['sr','srno','serial','serialno','ت'] },
  { key:'item', label:'Item', aliases:['item','البند','description','details'] },
  { key:'unit', label:'Unit', aliases:['unit','الوحده','الوحدة'] },
  { key:'quantity', label:'Quantities', aliases:['quantities','quantity','qty','الكميات','كمية'] }
];

export default function ExcelImportButton({ kind, onImported, label='Import Excel' }) {
  const inputRef=useRef(null); const isProject=kind==='projects';
  const [records,setRecords]=useState([]),[headers,setHeaders]=useState([]),[mapping,setMapping]=useState({}),[targets,setTargets]=useState([]),[targetId,setTargetId]=useState(''),[fileName,setFileName]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[result,setResult]=useState(null);
  useEffect(()=>{(async()=>{try{const r=await api.get(isProject?'/projects':'/work-orders');setTargets(isProject?(r.data.projects||[]):(r.data.orders||[]));}catch(e){setError(e.response?.data?.error||e.message);}})();},[isProject]);
  const autoMap=hs=>Object.fromEntries(fields.map(f=>{const h=hs.find(x=>f.aliases.map(key).includes(key(x)));return [f.key,h||''];}));
  const readFile=async file=>{setError('');setResult(null);setFileName(file.name);try{const XLSX=await import('xlsx');const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});const sheet=wb.Sheets[wb.SheetNames[0]];const raw=XLSX.utils.sheet_to_json(sheet,{defval:''});if(!raw.length)throw new Error('The Excel file has no data rows.');const hs=Object.keys(raw[0]);setHeaders(hs);setMapping(autoMap(hs));setRecords(raw.map((row,i)=>({excelRow:i+2,row})));}catch(e){setRecords([]);setHeaders([]);setError(e.message||'Unable to read Excel file.');}};
  const mappedRows=records.map(r=>({excelRow:r.excelRow,data:Object.fromEntries(fields.map(f=>[f.key,f.key==='quantity'?num(r.row[mapping[f.key]]):clean(r.row[mapping[f.key]])]))}));
  const invalid=mappedRows.filter(r=>!r.data.item);
  const importRows=async()=>{if(!targetId)return setError('Select an existing record first.');if(invalid.length)return setError('Item is required for every Excel row.');setBusy(true);setError('');let imported=0,failed=[];try{for(const r of mappedRows){try{await api.post((isProject?'/projects/':'/work-orders/')+targetId+'/items',r.data);imported++;}catch(e){failed.push({row:r.excelRow,msg:e.response?.data?.error||e.message});}}setResult({imported,failed});if(imported)onImported?.();}finally{setBusy(false);}};
  const reset=()=>{setRecords([]);setHeaders([]);setMapping({});setTargetId('');setFileName('');setError('');setResult(null);if(inputRef.current)inputRef.current.value='';};
  return <><input ref={inputRef} type='file' accept='.xlsx,.xls' style={{display:'none'}} onChange={e=>e.target.files?.[0]&&readFile(e.target.files[0])}/><button type='button' className='btn btn-primary' onClick={()=>inputRef.current?.click()} disabled={busy}>{busy?'Importing...':label}</button>
  {(records.length>0||error||result)&&<div style={{marginTop:12,padding:12,background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:8}}>
    {fileName&&<div style={{fontWeight:600,marginBottom:8}}>File: {fileName}</div>}{error&&<div className='alert alert-error' style={{marginBottom:8}}>{error}</div>}
    <div className='form-group'><label>{isProject?'Select Existing Project *':'Select Existing Work Order *'}</label><select value={targetId} onChange={e=>setTargetId(e.target.value)}><option value=''>-- Select --</option>{targets.map(x=><option key={x.id} value={x.id}>{isProject?(x.project_no||'')+' - '+(x.name||''):(x.wo_no||'')+' - '+(x.description||'')}</option>)}</select></div>
    {headers.length>0&&<div><strong>Excel → System mapping</strong><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:8,marginTop:8}}>{fields.map(f=><div className='form-group' key={f.key}><label>{f.label}</label><select value={mapping[f.key]||''} onChange={e=>setMapping({...mapping,[f.key]:e.target.value})}><option value=''>-- Ignore --</option>{headers.map(h=><option key={h} value={h}>{h}</option>)}</select></div>)}</div><div style={{fontSize:12,color:'#64748b'}}>Price and Cost are intentionally not imported. Closing cost remains under the Close action.</div></div>}
    {records.length>0&&<><div style={{margin:'8px 0'}}>Preview: <strong>{mappedRows.length}</strong> row(s)</div><div style={{maxHeight:260,overflow:'auto'}}><table><thead><tr><th>Sr.</th><th>Item</th><th>Unit</th><th>Quantity</th><th>Status</th></tr></thead><tbody>{mappedRows.slice(0,100).map(r=><tr key={r.excelRow}><td>{r.data.srNo||'-'}</td><td>{r.data.item||'-'}</td><td>{r.data.unit||'-'}</td><td>{r.data.quantity}</td><td style={{color:r.data.item?'#16a34a':'#dc2626'}}>{r.data.item?'Ready':'Missing Item'}</td></tr>)}</tbody></table></div><div className='btn-row' style={{marginTop:10}}><button className='btn btn-success' onClick={importRows} disabled={busy||!targetId}>{busy?'Importing...':'Import '+mappedRows.length+' Row(s)'}</button><button className='btn btn-warning' onClick={reset} disabled={busy}>Cancel</button></div></>}
    {result&&<div className='alert alert-success' style={{marginTop:8}}>Imported: {result.imported}{result.failed.length?' · Failed: '+result.failed.length:''}</div>}
  </div>}</>;
}