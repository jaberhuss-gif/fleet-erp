import { useEffect, useRef, useState } from 'react';
import api from '../api/client';

const clean = v => v == null ? '' : String(v).trim();
const key = v => clean(v).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const matchesAlias = (value, aliases) => {
  const k = key(value);
  if (!k) return false;
  return aliases.some(a => {
    const ak = key(a);
    return k === ak || k.includes(ak) || ak.includes(k);
  });
};
const num = v => {
  const n = Number(clean(v).replace(/,/g, '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const PROJECT_FIELDS = [
  { key:'srNo', label:'Sr.', aliases:['sr','srno','serial','serialno','sno','sno.','no','number','#','ت','ت.','ت/'] },
  { key:'item', label:'Item', aliases:['item','itemdescription','item description','construction item','البند','description','details','detail','الوصف','workdescription'] },
  { key:'unit', label:'Unit', aliases:['unit','units','الوحده','الوحدة','uom'] },
  { key:'quantity', label:'Quantities', aliases:['quantities','quantity','qty','qnty','amount','الكميات','كمية','الكمية'] },
  { key:'price', label:'Price', aliases:['price','unitprice','سعر','السعر'] },
  { key:'cost', label:'Cost', aliases:['cost','totalcost','التكلفة','التكلفه'] },
  { key:'section', label:'Section', aliases:['section','category','type','القسم','التصنيف'] }
];

const VEHICLE_FIELDS = [
  { key:'plate', label:'Plate', aliases:['plate','platenumber','plate_number','registration','registrationnumber','vehicle','vehicleid','vehicle number','رقم اللوحة','رقماللوحة','لوحة'] },
  { key:'make', label:'Make', aliases:['make','manufacturer','الصانع','الشركة'] },
  { key:'model', label:'Model', aliases:['model','موديل','الطراز'] },
  { key:'year', label:'Year', aliases:['year','modelyear','السنة','سنة'] },
  { key:'driver', label:'Driver', aliases:['driver','drivername','السائق','اسم السائق'] },
  { key:'phone', label:'Phone', aliases:['phone','mobile','driverphone','الهاتف','الجوال','رقم الهاتف'] },
  { key:'currentKm', label:'Current KM', aliases:['currentkm','current_km','km','odometer','currentodometer','الكيلومترات الحالية','العداد'] },
  { key:'lastOilKm', label:'Last Oil KM', aliases:['lastoilkm','last_oil_km','lastoil','oilkm','lastoilchangekm','كيلو الزيت السابق'] },
  { key:'oilChangeInterval', label:'Oil Interval', aliases:['oilchangeinterval','interval','oilinterval','فترة الزيت','فاصل الزيت'] }
];

export default function ExcelImportButton({ kind, onImported, label='Import Excel' }) {
  const inputRef = useRef(null);
  const isProject = kind === 'projects';
  const isVehicle = kind === 'vehicles';
  const fields = isVehicle ? VEHICLE_FIELDS : PROJECT_FIELDS;

  const [records,setRecords] = useState([]);
  const [headers,setHeaders] = useState([]);
  const [mapping,setMapping] = useState({});
  const [targets,setTargets] = useState([]);
  const [targetId,setTargetId] = useState('');
  const [projectName,setProjectName] = useState('');
  const [sites,setSites] = useState([]);
  const [siteId,setSiteId] = useState('');
  const [fileName,setFileName] = useState('');
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [result,setResult] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const requests = [api.get('/sites')];
        if (isProject) requests.push(api.get('/projects'));
        else if (!isVehicle) requests.push(api.get('/work-orders'));

        const responses = await Promise.all(requests);
        setSites(responses[0].data.sites || []);

        if (isProject) setTargets(responses[1].data.projects || []);
        else if (!isVehicle) setTargets(responses[1].data.orders || []);
      } catch (e) {
        setError(e.response?.data?.error || e.message);
      }
    })();
  }, [isProject, isVehicle]);

  const selectedSite = sites.find(s => String(s.id) === String(siteId));
  const selectedSiteName = selectedSite?.name || '';

  const visibleTargets = isProject ? targets.filter(x => !selectedSiteName || clean(x.site) === clean(selectedSiteName)) : targets;

  const autoMap = hs => Object.fromEntries(fields.map(f => {
    const h = hs.find(x => matchesAlias(x, f.aliases));
    return [f.key, h || ''];
  }));

  const isQuotationStyle = rows => {
    const scan = rows.slice(0, 100);
    return scan.some(row => row.some(v => matchesAlias(v, ['sr','srno','serial','serialno','sno','ت'])))
      && scan.some(row => row.some(v => key(v).includes('constructionitem') || key(v).includes('construction')));
  };

  const findHeaderRow = rows => {
    const scanLimit = Math.min(rows.length, 100);

    // Quotation-style files such as "core yard" do not have a normal
    // four-column header. They contain a label row "Sr. / ت", followed by
    // section rows (Construction Item / Electrical Item / Mechanical Item)
    // and then numbered data. Always use the Sr. label row as the anchor.
    if (!isVehicle && isQuotationStyle(rows)) {
      const srIndex = rows.slice(0, scanLimit).findIndex(row =>
        row.some(v => matchesAlias(v, ['sr','srno','serial','serialno','sno','ت']))
      );
      if (srIndex >= 0) return srIndex;
    }

    let bestIndex = -1;
    let bestScore = 0;

    rows.slice(0, scanLimit).forEach((row, index) => {
      const values = row.map(clean).filter(Boolean);
      const score = fields.reduce(
        (total, f) => total + (values.some(v => matchesAlias(v, f.aliases)) ? 1 : 0),
        0
      );
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });

    if (bestScore < (isVehicle ? 1 : 2)) {
      const quotationRow = rows.slice(0, scanLimit).findIndex(row =>
        row.some(v => key(v).includes('quotation') || key(v).includes('quote'))
      );

      if (quotationRow >= 0) {
        for (let i = quotationRow + 1; i < Math.min(rows.length, quotationRow + 20); i++) {
          const values = rows[i].map(clean).filter(Boolean);
          const score = fields.reduce(
            (total, f) => total + (values.some(v => matchesAlias(v, f.aliases)) ? 1 : 0),
            0
          );
          if (score > bestScore) {
            bestScore = score;
            bestIndex = i;
          }
        }
      }
    }

    return bestScore >= (isVehicle ? 1 : 2) ? bestIndex : -1;
  };

  const buildProjectRows = (matrix, headerIndex) => {
    const quotationStyle = isQuotationStyle(matrix);

    // In this quotation, "Sr. / ت" is a label row rather than a complete
    // six-column header. The actual table is positional:
    // column 0 = Sr., column 1 = Item, column 2 = Unit, column 3 = Quantity.
    if (quotationStyle) {
      const rows = [];
      let section = '';

      for (let i = headerIndex + 1; i < matrix.length; i++) {
        const row = matrix[i] || [];
        const values = row.map(clean);
        const nonEmpty = values.filter(Boolean);
        if (!nonEmpty.length) continue;

        const first = clean(values[0]);
        const second = clean(values[1]);
        const third = clean(values[2]);
        const fourth = clean(values[3]);

        // Ignore quotation metadata / repeated labels.
        if (key(first).includes('constructionitem') || key(first).includes('electricalitem') || key(first).includes('mechanicalitem') || key(first).includes('installationitem')) {
          section = first;
          continue;
        }

        // Keep only actual numbered line items. This prevents Date, VAT, CR,
        // section headings, and trailing blank rows from becoming project items.
        const sr = num(first);
        if (!sr || !/^\d+(?:\.\d+)?$/.test(first.replace(/,/g,''))) continue;

        rows.push({
          excelRow: i + 1,
          row: {
            __SR__: first,
            __ITEM__: second,
            __UNIT__: third,
            __QTY__: fourth,
            __SECTION__: section
          }
        });
      }

      return {
        headers: ['__SR__','__ITEM__','__UNIT__','__QTY__','__SECTION__'],
        mapping: { srNo:'__SR__', item:'__ITEM__', unit:'__UNIT__', quantity:'__QTY__', section:'__SECTION__' },
        rows
      };
    }

    const rawHeaders = matrix[headerIndex].map(clean);
    const uniqueHeaders = rawHeaders.map((h,i) => h || '__EMPTY' + (i ? '_' + i : ''));
    const rows = matrix.slice(headerIndex + 1)
      .filter(row => row.some(v => clean(v) !== ''))
      .map((row,i) => {
        const obj = {};
        uniqueHeaders.forEach((h,j) => { obj[h] = row[j] ?? ''; });
        return { excelRow: headerIndex + i + 2, row: obj };
      });

    return { headers:uniqueHeaders, mapping:autoMap(uniqueHeaders), rows };
  };

  const readFile = async file => {
    setError('');
    setResult(null);
    setFileName(file.name);

    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type:'array', cellDates:true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const matrix = XLSX.utils.sheet_to_json(sheet, { header:1, defval:'', raw:false });

      if (!matrix.length) throw new Error('The Excel file has no data.');

      const headerIndex = findHeaderRow(matrix);
      if (headerIndex < 0) {
        throw new Error(
          isVehicle
            ? 'Could not find the vehicle header row. The file must contain a Plate/Vehicle column.'
            : 'Could not find the item header row. The file must contain Sr., Item, Unit and Quantities columns.'
        );
      }

      const built = isVehicle ? null : buildProjectRows(matrix, headerIndex);
      const rawHeaders = isVehicle ? matrix[headerIndex].map(clean) : built.headers;
      const uniqueHeaders = isVehicle
        ? rawHeaders.map((h,i) => h || '__EMPTY' + (i ? '_' + i : ''))
        : built.headers;

      const rows = isVehicle
        ? matrix.slice(headerIndex + 1)
            .filter(row => row.some(v => clean(v) !== ''))
            .map((row,i) => {
              const obj = {};
              uniqueHeaders.forEach((h,j) => { obj[h] = row[j] ?? ''; });
              return { excelRow: headerIndex + i + 2, row: obj };
            })
        : built.rows;

      if (!rows.length) throw new Error('The Excel file has no data rows after the header.');

      setHeaders(uniqueHeaders);
      setMapping(isVehicle ? autoMap(uniqueHeaders) : built.mapping);
      setRecords(rows);
      setTargetId('');
    } catch (e) {
      setRecords([]);
      setHeaders([]);
      setError(e.message || 'Unable to read Excel file.');
    }
  };

  const mappedRows = records.map(r => ({
    excelRow:r.excelRow,
    data:Object.fromEntries(fields.map(f => [
      f.key,
      ['quantity','year','currentKm','lastOilKm','oilChangeInterval'].includes(f.key)
        ? num(r.row[mapping[f.key]])
        : clean(r.row[mapping[f.key]])
    ]))
  }));

  const invalid = mappedRows.filter(r => !r.data.item && !isVehicle);
  const invalidVehicles = mappedRows.filter(r => !r.data.plate && isVehicle);

  const importRows = async () => {
    setError('');

    if (!siteId) return setError('Select a Site from the master Sites list first.');
    if (isProject && !clean(projectName)) return setError('Enter the Project Name first.');
    if (!isProject && !isVehicle && !targetId) return setError('Select an existing Work Order first.');
    if (invalid.length) return setError('Item is required for every project/work-order Excel row.');
    if (invalidVehicles.length) return setError('Plate is required for every vehicle Excel row.');

    setBusy(true);
    let imported = 0;
    let failed = [];

    try {
      if (isVehicle) {
        const vehicles = mappedRows.map(r => ({
          plate:r.data.plate,
          make:r.data.make || 'Toyota',
          model:r.data.model || 'Hilux',
          year:r.data.year || 2022,
          location:selectedSiteName,
          driver:r.data.driver,
          phone:r.data.phone,
          currentKm:r.data.currentKm,
          lastOilKm:r.data.lastOilKm,
          oilChangeInterval:r.data.oilChangeInterval || 5000
        }));

        try {
          const res = await api.post('/vehicles/import', { vehicles });
          imported = Number(res.data.imported ?? res.data.added ?? 0);
          if (res.data.errors?.length) {
            failed = res.data.errors.map((msg,i) => ({ row:i + 1, msg }));
          }
        } catch (e) {
          throw new Error(e.response?.data?.error || e.message);
        }
      } else {
        let effectiveTargetId = targetId;
        if (isProject) {
          const existing = targets.find(x => clean(x.name).toLowerCase() === clean(projectName).toLowerCase() && clean(x.site) === clean(selectedSiteName));
          if (existing) effectiveTargetId = existing.id;
          else {
            const created = await api.post('/projects', { name: clean(projectName), site: selectedSiteName, projectType:'Development', status:'Not Started', budget:0, spent:0 });
            effectiveTargetId = created.data.project.id;
          }
        }
        const endpoint = (isProject ? '/projects/' : '/work-orders/') + effectiveTargetId + '/items';
        for (const r of mappedRows) {
          try {
            await api.post(endpoint, r.data);
            imported++;
          } catch (e) {
            failed.push({ row:r.excelRow, msg:e.response?.data?.error || e.message });
          }
        }
      }

      setResult({ imported, failed });
      if (imported) onImported?.();
    } catch (e) {
      setError(e.message || 'Import failed.');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setRecords([]);
    setHeaders([]);
    setMapping({});
    setTargets([]);
    setTargetId('');
    setSiteId('');
    setFileName('');
    setError('');
    setResult(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return <>
    <input
      ref={inputRef}
      type='file'
      accept='.xlsx,.xls'
      style={{display:'none'}}
      onChange={e => e.target.files?.[0] && readFile(e.target.files[0])}
    />

    <button type='button' className='btn btn-primary' onClick={() => inputRef.current?.click()} disabled={busy}>
      {busy ? 'Importing...' : label}
    </button>

    {(records.length > 0 || error || result) && <div style={{marginTop:12,padding:12,background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:8}}>
      {fileName && <div style={{fontWeight:600,marginBottom:8}}>File: {fileName}</div>}
      {error && <div className='alert alert-error' style={{marginBottom:8}}>{error}</div>}

      <div className='form-group'>
        <label>Site *</label>
        <select value={siteId} onChange={e => { setSiteId(e.target.value); setTargetId(''); }}>
          <option value=''>-- Select Site from Master List --</option>
          {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {!isVehicle && <div className='form-group'>
        {isProject ? <><label>Project Name *</label><input value={projectName} onChange={e => setProjectName(e.target.value)} disabled={!siteId} placeholder='e.g. Core Yard' /></> : <>
          <label>Select Existing Work Order *</label>
          <select value={targetId} onChange={e => setTargetId(e.target.value)} disabled={!siteId}>
            <option value=''>-- Select --</option>
            {visibleTargets.map(x => <option key={x.id} value={x.id}>{(x.wo_no || '') + ' - ' + (x.description || '')}</option>)}
          </select>
        </>}
      </div>}

      {headers.length > 0 && <div>
        <strong>Excel → System mapping</strong>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:8,marginTop:8}}>
          {fields.map(f => <div className='form-group' key={f.key}>
            <label>{f.label}</label>
            <select value={mapping[f.key] || ''} onChange={e => setMapping({...mapping,[f.key]:e.target.value})}>
              <option value=''>-- Ignore --</option>
              {headers.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>)}
        </div>
        {!isVehicle && <div style={{fontSize:12,color:'#64748b'}}>
          Price, Cost and Section are read from Excel when present. Status is controlled per item after import; closing adds the actual amount and notes.
        </div>}
        {isVehicle && <div style={{fontSize:12,color:'#64748b'}}>
          Vehicle Location is taken only from the selected Master Site. It is never read from free-text Excel location data.
        </div>}
      </div>}

      {records.length > 0 && <><div style={{margin:'8px 0'}}>
        Preview: <strong>{mappedRows.length}</strong> row(s)
      </div>
      <div style={{maxHeight:260,overflow:'auto'}}>
        <table>
          <thead><tr>
            {isVehicle
              ? <><th>Plate</th><th>Make</th><th>Model</th><th>Driver</th><th>Current KM</th><th>Site</th><th>Status</th></>
              : <><th>Sr.</th><th>Item</th><th>Unit</th><th>Quantity</th><th>Price</th><th>Cost</th><th>Section</th><th>Status</th></>}
          </tr></thead>
          <tbody>
            {mappedRows.slice(0,100).map(r => <tr key={r.excelRow}>
              {isVehicle
                ? <><td>{r.data.plate || '-'}</td><td>{r.data.make || '-'}</td><td>{r.data.model || '-'}</td><td>{r.data.driver || '-'}</td><td>{r.data.currentKm}</td><td>{selectedSiteName || '-'}</td><td style={{color:r.data.plate ? '#16a34a':'#dc2626'}}>{r.data.plate ? 'Valid':'Missing Plate'}</td></>
                : <><td>{r.data.srNo || '-'}</td><td>{r.data.item || '-'}</td><td>{r.data.unit || '-'}</td><td>{r.data.quantity}</td><td>{r.data.price || 0}</td><td>{r.data.cost || 0}</td><td>{r.data.section || '-'}</td><td style={{color:r.data.item ? '#16a34a':'#dc2626'}}>{r.data.item ? 'Ready':'Missing Item'}</td></>}
            </tr>)}
          </tbody>
        </table>
      </div>
      <div className='btn-row' style={{marginTop:10}}>
        <button className='btn btn-success' onClick={importRows} disabled={busy || !siteId || (!isVehicle && !targetId)}>
          {busy ? 'Importing...' : 'Import ' + mappedRows.length + ' Row(s)'}
        </button>
        <button className='btn btn-warning' onClick={reset} disabled={busy}>Cancel</button>
      </div></>}

      {result && <div className='alert alert-success' style={{marginTop:8}}>
        Imported: {result.imported}{result.failed.length ? ' · Failed: ' + result.failed.length : ''}
      </div>}
    </div>}
  </>;
}
