import { useRef, useState } from 'react';
import api from '../api/client';

const clean = (v) => (v === undefined || v === null ? '' : String(v).trim());

const key = (v) => clean(v)
  .toLowerCase()
  .replace(/[\s_\-/#().]+/g, '');

const aliases = {
  projectNo: ['projectno','projectnumber','project#','id','projectid'],
  name: ['name','projectname'],
  description: ['description','details','scope'],
  site: ['site','location','projectsite'],
  projectType: ['projecttype','type'],
  status: ['status'],
  budget: ['budget','budgetsar','totalbudget'],
  spent: ['spent','actual','actualspent','cost','totalcost'],
  startDate: ['startdate','start','date'],
  endDate: ['enddate','end'],
  manager: ['manager','projectmanager'],
  contractor: ['contractor','contractorname'],
  notes: ['notes','remarks','comments'],
  woNo: ['wono','wonumber','wo#','workorderno','workordernumber'],
  area: ['area'],
  category: ['category','maintenancecategory','type'],
  priority: ['priority'],
  assignedTo: ['assignedto','employee','employeename','assigned'],
  isContractor: ['iscontractor','contractorwork','external'],
  contractorName: ['contractorname','contractor'],
  performedBy: ['performedby','performed','executor','executedby'],
  reportedDate: ['reporteddate','date','openeddate','workorderdate'],
  completedDate: ['completeddate','completiondate','closeddate'],
  finalCost: ['finalcost','totalcost','cost'],
  contractorCost: ['contractorcost'],
  laborCost: ['laborcost','internalcost'],
  partsCost: ['partscost','partscostsar'],
  closingNotes: ['closingnotes','completionnotes','resolution'],
  partsUsed: ['partsused','parts','materials']
};

function findValue(row, field) {
  const wanted = new Set((aliases[field] || []).map(key));
  const found = Object.entries(row).find(([header]) => wanted.has(key(header)));
  return found ? found[1] : '';
}

function dateValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const d = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = clean(value);
  if (!s) return '';
  const m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? s : parsed.toISOString().slice(0, 10);
}

function numberValue(value) {
  const s = clean(value).replace(/,/g, '');
  if (!s) return 0;
  const n = Number(s.replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function boolValue(value) {
  const s = clean(value).toLowerCase();
  return ['1','true','yes','y','contractor','external'].includes(s);
}

function mapProject(row) {
  return {
    projectNo: clean(findValue(row, 'projectNo')),
    name: clean(findValue(row, 'name')),
    description: clean(findValue(row, 'description')),
    site: clean(findValue(row, 'site')),
    projectType: clean(findValue(row, 'projectType')) || 'Development',
    status: clean(findValue(row, 'status')) || 'Active',
    budget: numberValue(findValue(row, 'budget')),
    spent: numberValue(findValue(row, 'spent')),
    startDate: dateValue(findValue(row, 'startDate')),
    endDate: dateValue(findValue(row, 'endDate')),
    manager: clean(findValue(row, 'manager')),
    contractor: clean(findValue(row, 'contractor')),
    notes: clean(findValue(row, 'notes'))
  };
}

function mapWorkOrder(row) {
  const contractorName = clean(findValue(row, 'contractorName'));
  const isContractor = boolValue(findValue(row, 'isContractor')) || !!contractorName;
  return {
    woNo: clean(findValue(row, 'woNo')),
    site: clean(findValue(row, 'site')),
    area: clean(findValue(row, 'area')),
    category: clean(findValue(row, 'category')) || 'General',
    priority: clean(findValue(row, 'priority')) || 'Medium',
    description: clean(findValue(row, 'description')),
    assignedTo: clean(findValue(row, 'assignedTo')),
    isContractor,
    contractorName,
    performedBy: clean(findValue(row, 'performedBy')) || (isContractor ? contractorName : clean(findValue(row, 'assignedTo'))),
    reportedDate: dateValue(findValue(row, 'reportedDate')),
    completedDate: dateValue(findValue(row, 'completedDate')),
    finalCost: numberValue(findValue(row, 'finalCost')),
    contractorCost: numberValue(findValue(row, 'contractorCost')),
    laborCost: numberValue(findValue(row, 'laborCost')),
    partsCost: numberValue(findValue(row, 'partsCost')),
    closingNotes: clean(findValue(row, 'closingNotes')),
    partsUsed: clean(findValue(row, 'partsUsed'))
  };
}

export default function ExcelImportButton({
  endpoint,
  kind,
  onImported,
  label = 'Import Excel'
}) {
  const inputRef = useRef(null);
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const isProject = kind === 'projects';

  const reset = () => {
    setRows([]);
    setFileName('');
    setError('');
    setResult(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const readFile = async (file) => {
    setError('');
    setResult(null);
    setFileName(file.name);
    try {
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      if (!raw.length) throw new Error('The Excel file has no data rows.');
      const mapped = raw.map((row, index) => ({
        excelRow: index + 2,
        data: isProject ? mapProject(row) : mapWorkOrder(row)
      }));
      setRows(mapped);
    } catch (e) {
      setRows([]);
      setError(e.message || 'Unable to read Excel file.');
    }
  };

  const validate = () => rows.map(r => {
    const missing = [];
    if (isProject) {
      if (!r.data.name) missing.push('Project Name');
      if (!r.data.site) missing.push('Site');
    } else {
      if (!r.data.site) missing.push('Site');
      if (!r.data.description) missing.push('Description');
      if (!r.data.performedBy && !r.data.contractorName) missing.push('Performed By / Contractor');
    }
    return { ...r, missing };
  });

  const importRows = async () => {
    setError('');
    const checked = validate();
    const invalid = checked.filter(r => r.missing.length);
    if (invalid.length) {
      setRows(checked);
      setError(`${invalid.length} row(s) have missing required data. Fix the highlighted rows and upload again.`);
      return;
    }

    setBusy(true);
    let imported = 0;
    const failed = [];
    try {
      for (const row of checked) {
        try {
          await api.post(endpoint, row.data);
          imported++;
        } catch (e) {
          failed.push({
            excelRow: row.excelRow,
            message: e.response?.data?.error || e.message || 'Import failed'
          });
        }
      }
      setResult({ imported, failed });
      if (imported) onImported?.();
      if (failed.length) {
        setError(`${failed.length} row(s) could not be imported. Existing records were not modified.`);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: 'none' }}
        onChange={e => e.target.files?.[0] && readFile(e.target.files[0])}
      />
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        title={`Import ${isProject ? 'Projects' : 'Home Maintenance'} from Excel`}
      >
        {busy ? 'Importing...' : label}
      </button>

      {(rows.length > 0 || error || result) && (
        <div style={{
          marginTop: '12px',
          padding: '12px',
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '8px'
        }}>
          {fileName && <div style={{ marginBottom: '8px', fontWeight: 600 }}>File: {fileName}</div>}
          {error && <div className="alert alert-error" style={{ marginBottom: '8px' }}>{error}</div>}
          {result && (
            <div className="alert alert-success" style={{ marginBottom: '8px' }}>
              Imported: {result.imported}{result.failed.length ? ` · Failed: ${result.failed.length}` : ''}
            </div>
          )}
          {rows.length > 0 && (
            <>
              <div style={{ marginBottom: '8px' }}>
                Preview: <strong>{rows.length}</strong> row(s)
                {rows.some(r => r.missing?.length) && (
                  <span style={{ color: '#dc2626', marginLeft: '8px' }}>
                    · Missing required fields detected
                  </span>
                )}
              </div>
              <div style={{ maxHeight: '260px', overflow: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Excel Row</th>
                      <th>{isProject ? 'Project' : 'WO'}</th>
                      <th>Site</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 100).map(r => {
                      const id = isProject ? r.data.projectNo || r.data.name : r.data.woNo || r.data.description;
                      const missing = r.missing?.length ? `Missing: ${r.missing.join(', ')}` : 'Ready';
                      return (
                        <tr key={r.excelRow}>
                          <td>{r.excelRow}</td>
                          <td>{id || '-'}</td>
                          <td>{r.data.site || '-'}</td>
                          <td style={{ color: r.missing?.length ? '#dc2626' : '#16a34a' }}>{missing}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="btn-row" style={{ marginTop: '10px' }}>
                <button type="button" className="btn btn-success" onClick={importRows} disabled={busy}>
                  {busy ? 'Importing...' : `Import ${rows.length} Row(s)`}
                </button>
                <button type="button" className="btn btn-warning" onClick={reset} disabled={busy}>Cancel</button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
